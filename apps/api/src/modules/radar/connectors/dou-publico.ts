// Conector do Diário Oficial da União pela leitura pública do site da Imprensa Nacional (sem login).
// A página https://www.in.gov.br/leiturajornal?data=DD-MM-AAAA&secao=do3 traz, num <script id="params">,
// um JSON com todas as matérias do dia (título, tipo, órgão, trecho de ~400 caracteres e urlTitle).
// Só as candidatas a edital de concurso têm o texto completo baixado em https://www.in.gov.br/web/dou/-/<urlTitle>.
// robots.txt do site (2026-10-28) só bloqueia /215; acessos identificados, com pausa e teto por dia.
import { isExamOpeningCandidate } from "@aprovaai/core";
import {
  MAX_EXCERPT_CHARS,
  RADAR_USER_AGENT,
  REQUEST_TIMEOUT_MS,
  type FetchLike,
  type RawDocument,
  type SourceConnector,
} from "./types";

const BASE_URL = "https://www.in.gov.br";
/** Seção 3 (editais, avisos) e a edição extra dela. */
const SECTIONS = ["do3", "do3e"] as const;
/** Teto de matérias abertas por dia: o filtro deixa poucas candidatas; isso protege o site de picos. */
const MAX_ARTICLES_PER_DAY = 30;
/** Tipos de matéria que nunca são abertura de concurso. */
const SKIP_TYPES = /(resultado|convoca|homologa|retifica|prorroga|extrato|contrato|licita|pregão|portaria)/i;

export interface DouListItem {
  title: string;
  content: string;
  artType: string;
  urlTitle: string;
  pubDate: string;
  hierarchyStr: string;
}

/** Extrai a lista de matérias do JSON embutido na página de leitura do dia. */
export function parseDouDayPage(html: string): DouListItem[] {
  const match = /<script id="params" type="application\/json">([\s\S]*?)<\/script>/.exec(html);
  if (!match?.[1]) return [];
  const data = JSON.parse(match[1]) as { jsonArray?: DouListItem[] };
  return data.jsonArray ?? [];
}

/** Matéria do dia que merece ter o texto completo baixado. */
export function isDouCandidate(item: DouListItem): boolean {
  if (SKIP_TYPES.test(item.artType)) return false;
  const text = `${item.title} ${item.content}`;
  return /concurso/i.test(text) && isExamOpeningCandidate(text).candidate;
}

function decodeEntities(text: string): string {
  return text
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCharCode(Number(code)));
}

/** Texto da matéria (div.texto-dou) sem HTML. */
export function parseDouArticle(html: string): string {
  const start = html.indexOf('class="texto-dou"');
  if (start < 0) return "";
  const body = html.slice(html.indexOf(">", start) + 1);
  const end = body.search(/<\/div>\s*<\/div>|<div class="(?:informacao|detalhes)/);
  const chunk = end > 0 ? body.slice(0, end) : body.slice(0, 40_000);
  return decodeEntities(chunk.replace(/<(br|\/p|\/li)[^>]*>/gi, "\n").replace(/<[^>]+>/g, " "))
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s+/g, "\n")
    .trim();
}

/** dd/mm/aaaa → aaaa-mm-dd */
function isoFromBr(value: string, fallback: string): string {
  const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(value);
  return match ? `${match[3]}-${match[2]}-${match[1]}` : fallback;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export class DouPublicoConnector implements SourceConnector {
  readonly source = "dou_publico" as const;
  readonly label = "Diário Oficial da União (leitura pública)";

  constructor(
    private readonly fetchFn: FetchLike = fetch,
    /** Pausa entre requisições (0 nos testes). */
    private readonly delayMs = 400,
  ) {}

  disabledReason(): string | null {
    return null;
  }

  private async get(url: string): Promise<string> {
    const response = await this.fetchFn(url, {
      headers: { "user-agent": RADAR_USER_AGENT, accept: "text/html" },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    if (!response.ok) throw new Error(`DOU respondeu HTTP ${response.status} em ${new URL(url).pathname}.`);
    return response.text();
  }

  async fetchDay(day: string): Promise<RawDocument[]> {
    const [y, m, d] = day.split("-");
    const candidates: DouListItem[] = [];
    for (const section of SECTIONS) {
      const html = await this.get(`${BASE_URL}/leiturajornal?data=${d}-${m}-${y}&secao=${section}`);
      candidates.push(...parseDouDayPage(html).filter(isDouCandidate));
      await sleep(this.delayMs);
    }

    const documents: RawDocument[] = [];
    for (const item of candidates.slice(0, MAX_ARTICLES_PER_DAY)) {
      const url = `${BASE_URL}/web/dou/-/${item.urlTitle}`;
      // Se a página da matéria falhar, fica o trecho da lista (o editor confere no link oficial).
      const fullText = await this.get(url)
        .then(parseDouArticle)
        .catch(() => "");
      await sleep(this.delayMs);
      // O texto completo decide: resultado/convocação (que trazem nomes de candidatos) nunca é guardado.
      if (fullText && !isExamOpeningCandidate(fullText.slice(0, 3000)).candidate) continue;
      const levels = item.hierarchyStr
        .split("/")
        .map((s) => s.trim())
        .filter(Boolean);
      documents.push({
        source: this.source,
        externalId: item.urlTitle,
        url,
        title: item.title,
        publishedOn: isoFromBr(item.pubDate, day),
        // 2º nível costuma ser a entidade que faz o concurso (ex.: a universidade, não o ministério).
        territoryName: levels[1] ?? levels[0] ?? null,
        uf: null,
        sphere: "federal",
        excerpt: (fullText || `${item.title}\n${item.content}`).slice(0, MAX_EXCERPT_CHARS),
      });
    }
    return documents;
  }
}
