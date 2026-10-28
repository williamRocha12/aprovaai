// Conector do Diário Oficial da União pelo INLABS (Imprensa Nacional), acesso livre e gratuito com cadastro.
// Fluxo conforme o script oficial (Imprensa-Nacional/inlabs, inlabs-auto-download-xml.py):
//   POST https://inlabs.in.gov.br/logar.php (email, password) → cookie inlabs_session_cookie
//   GET  https://inlabs.in.gov.br/index.php?p=AAAA-MM-DD&dl=AAAA-MM-DD-DO3.zip  (header origem: 736372697074)
// O ZIP traz um XML por matéria. Editais de concurso de órgãos federais saem na Seção 3 (DO3).
import { strFromU8, unzipSync } from "fflate";
import {
  MAX_EXCERPT_CHARS,
  RADAR_USER_AGENT,
  REQUEST_TIMEOUT_MS,
  type FetchLike,
  type RawDocument,
  type SourceConnector,
} from "./types";

const BASE_URL = "https://inlabs.in.gov.br";
const SECTIONS = ["DO3"] as const;

/** Lê os atributos de uma tag XML (`name="valor"`). */
function attributes(tag: string): Record<string, string> {
  const result: Record<string, string> = {};
  for (const match of tag.matchAll(/([A-Za-z_][\w-]*)="([^"]*)"/g)) result[match[1] ?? ""] = match[2] ?? "";
  return result;
}

/** Conteúdo de um elemento, aceitando CDATA. */
function element(xml: string, name: string): string {
  const match = new RegExp(`<${name}>(?:<!\\[CDATA\\[)?([\\s\\S]*?)(?:\\]\\]>)?</${name}>`).exec(xml);
  return match?.[1] ?? "";
}

function stripHtml(html: string): string {
  return html
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();
}

/** dd/mm/aaaa → aaaa-mm-dd */
function isoFromBr(value: string, fallback: string): string {
  const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(value);
  return match ? `${match[3]}-${match[2]}-${match[1]}` : fallback;
}

/** Converte uma matéria do XML do INLABS em documento do radar (null se não for edital de concurso). */
export function parseInlabsArticle(xml: string, day: string): RawDocument | null {
  const tag = /<article\s[^>]*>/.exec(xml)?.[0];
  if (!tag) return null;
  const attrs = attributes(tag);
  const identifica = stripHtml(element(xml, "Identifica"));
  const text = stripHtml(element(xml, "Texto"));
  const haystack = `${attrs.artType ?? ""} ${identifica} ${text.slice(0, 2000)}`.toLowerCase();
  if (!haystack.includes("concurso") || !haystack.includes("edital")) return null;

  // artCategory vem como "Órgão superior/Entidade/Unidade": a entidade (2º nível) costuma ser quem faz o concurso.
  const category = (attrs.artCategory ?? "")
    .split("/")
    .map((s) => s.trim())
    .filter(Boolean);
  const organization = category[1] ?? category[0] ?? null;
  const pdfPage = attrs.pdfPage?.startsWith("http") ? attrs.pdfPage : null;
  const [y, m, d] = day.split("-");
  return {
    source: "dou_inlabs",
    externalId: attrs.idMateria || attrs.id || `${day}:${identifica.slice(0, 80)}`,
    url: pdfPage ?? `https://www.in.gov.br/leiturajornal?data=${d}-${m}-${y}&secao=do3`,
    title: identifica || attrs.name || "Matéria do DOU",
    publishedOn: isoFromBr(attrs.pubDate ?? "", day),
    territoryName: organization,
    uf: null,
    sphere: "federal",
    excerpt: `${identifica}\n${text}`.slice(0, MAX_EXCERPT_CHARS),
  };
}

export class DouInlabsConnector implements SourceConnector {
  readonly source = "dou_inlabs" as const;
  readonly label = "Diário Oficial da União (INLABS)";

  constructor(
    private readonly email: string | undefined,
    private readonly password: string | undefined,
    private readonly fetchFn: FetchLike = fetch,
  ) {}

  disabledReason(): string | null {
    return this.email && this.password
      ? null
      : "Configure INLABS_EMAIL e INLABS_PASSWORD (cadastro gratuito em inlabs.in.gov.br).";
  }

  private async login(): Promise<string> {
    const response = await this.fetchFn(`${BASE_URL}/logar.php`, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded", "user-agent": RADAR_USER_AGENT },
      body: new URLSearchParams({ email: this.email ?? "", password: this.password ?? "" }).toString(),
      redirect: "manual",
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    const cookies = response.headers.getSetCookie?.() ?? [response.headers.get("set-cookie") ?? ""];
    const session = cookies
      .map((c) => /inlabs_session_cookie=([^;]+)/.exec(c)?.[1])
      .find((value): value is string => Boolean(value));
    if (!session) throw new Error("Login no INLABS falhou (confira INLABS_EMAIL e INLABS_PASSWORD).");
    return session;
  }

  async fetchDay(day: string): Promise<RawDocument[]> {
    const session = await this.login();
    const documents: RawDocument[] = [];
    for (const section of SECTIONS) {
      const response = await this.fetchFn(`${BASE_URL}/index.php?p=${day}&dl=${day}-${section}.zip`, {
        headers: {
          cookie: `inlabs_session_cookie=${session}`,
          origem: "736372697074",
          "user-agent": RADAR_USER_AGENT,
        },
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS * 3),
      });
      if (response.status === 404) continue; // sem edição nesse dia (fim de semana/feriado)
      if (!response.ok) throw new Error(`INLABS respondeu HTTP ${response.status} para ${section}.`);
      const files = unzipSync(new Uint8Array(await response.arrayBuffer()));
      for (const [name, content] of Object.entries(files)) {
        if (!name.toLowerCase().endsWith(".xml")) continue;
        const doc = parseInlabsArticle(strFromU8(content), day);
        if (doc) documents.push(doc);
      }
    }
    return documents;
  }
}
