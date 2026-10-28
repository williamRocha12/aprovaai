// Conector do Querido Diário (Open Knowledge Brasil): API pública de diários oficiais municipais.
// Endpoint e campos conforme o código da API (okfn-brasil/querido-diario-api, api/api.py):
// GET /gazettes?querystring=&published_since=&published_until=&excerpt_size=&number_of_excerpts=&size=&offset=
// → { total_gazettes, gazettes: [{ territory_id, date, url, territory_name, state_code, excerpts[], edition, ... }] }
import {
  MAX_EXCERPT_CHARS,
  RADAR_USER_AGENT,
  REQUEST_TIMEOUT_MS,
  type FetchLike,
  type RawDocument,
  type SourceConnector,
} from "./types";

interface GazetteItem {
  territory_id: string;
  date: string;
  url: string;
  territory_name: string;
  state_code: string;
  excerpts?: string[];
  edition?: string | null;
  is_extra_edition?: boolean | null;
}

interface GazetteSearchResponse {
  total_gazettes: number;
  gazettes: GazetteItem[];
}

/** Busca textual (sintaxe do Elasticsearch simple_query_string usada pela API). */
export const QUERIDO_DIARIO_QUERY = '"concurso público" + (edital | inscrições | abertura)';
const PAGE_SIZE = 100;
/** Teto por dia para não sobrecarregar a API pública. */
const MAX_PAGES = 5;

export class QueridoDiarioConnector implements SourceConnector {
  readonly source = "querido_diario" as const;
  readonly label = "Querido Diário (diários municipais)";

  constructor(
    private readonly baseUrl: string,
    private readonly fetchFn: FetchLike = fetch,
  ) {}

  disabledReason(): string | null {
    return null;
  }

  async fetchDay(day: string): Promise<RawDocument[]> {
    const documents: RawDocument[] = [];
    for (let page = 0; page < MAX_PAGES; page++) {
      const params = new URLSearchParams({
        querystring: QUERIDO_DIARIO_QUERY,
        published_since: day,
        published_until: day,
        excerpt_size: "1500",
        number_of_excerpts: "3",
        size: String(PAGE_SIZE),
        offset: String(page * PAGE_SIZE),
      });
      const response = await this.fetchFn(
        `${this.baseUrl.replace(/\/$/, "")}/gazettes?${params.toString()}`,
        {
          headers: { accept: "application/json", "user-agent": RADAR_USER_AGENT },
          signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        },
      );
      if (!response.ok) throw new Error(`Querido Diário respondeu HTTP ${response.status}.`);
      const body = (await response.json()) as GazetteSearchResponse;
      for (const gazette of body.gazettes ?? []) {
        const excerpt = (gazette.excerpts ?? []).join("\n…\n").slice(0, MAX_EXCERPT_CHARS);
        if (!excerpt.trim()) continue;
        documents.push({
          source: this.source,
          externalId: `${gazette.territory_id}:${gazette.date}:${gazette.edition ?? ""}:${gazette.is_extra_edition ? "extra" : ""}`,
          url: gazette.url,
          title: `Diário Oficial de ${gazette.territory_name} (${gazette.state_code})`,
          publishedOn: gazette.date,
          territoryName: gazette.territory_name,
          uf: gazette.state_code?.toUpperCase() ?? null,
          sphere: "municipal",
          excerpt,
        });
      }
      if ((page + 1) * PAGE_SIZE >= (body.total_gazettes ?? 0)) break;
    }
    return documents;
  }
}
