// Contrato dos conectores do radar. Cada conector busca, para um dia, trechos de diários oficiais que
// mencionam concurso público. `fetch` é injetado para os testes rodarem com fixtures, sem rede.

export type RadarSourceId = "querido_diario" | "dou_inlabs" | "dou_publico";

export interface RawDocument {
  source: RadarSourceId;
  externalId: string;
  url: string;
  title: string;
  /** aaaa-mm-dd */
  publishedOn: string;
  territoryName: string | null;
  uf: string | null;
  sphere: "federal" | "estadual" | "municipal";
  excerpt: string;
}

export interface SourceConnector {
  readonly source: RadarSourceId;
  readonly label: string;
  /** Motivo de estar desativado (ex.: falta credencial) ou null se pode rodar. */
  disabledReason(): string | null;
  fetchDay(day: string): Promise<RawDocument[]>;
}

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

/** Identifica o radar nas requisições (boa prática com APIs públicas). */
export const RADAR_USER_AGENT = "AprovaAI-Radar/1.0 (+https://aprovaai-nine.vercel.app)";
export const REQUEST_TIMEOUT_MS = 20_000;
/** Limite de trecho guardado por documento: só o necessário para a conferência, nunca o diário inteiro. */
export const MAX_EXCERPT_CHARS = 4_000;
