// Radar de editais: regras puras para decidir se um trecho de diário oficial parece abertura de concurso
// e para montar um rascunho por regras (usado quando a IA está desligada). Nada aqui é "confirmado":
// o resultado vai para a fila do editor, que confere na fonte oficial.

export interface RadarDocument {
  excerpt: string;
  territoryName: string | null;
  uf: string | null;
  /** Fonte federal (DOU) ou municipal (diários municipais). */
  sphere: "federal" | "estadual" | "municipal";
  url: string;
}

export interface RuleBasedLead {
  organization: string;
  title: string;
  sphere: "federal" | "estadual" | "municipal";
  uf: string | null;
  city: string | null;
  registrationStart: string | null;
  registrationEnd: string | null;
  examDate: string | null;
  vacancies: number | null;
  evidence: string;
}

const normalize = (text: string) =>
  text.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ");

const POSITIVE = /concurso publico/;
const OPENING =
  /(edital de abertura|abertura d[aoe]s? inscric|inscricoes (estarao )?abertas|torna publica a abertura|abre inscric|realizacao de concurso publico|edital n[ºo°.]? ?\d)/;
/** Publicações sobre concursos que já aconteceram (não interessam para a lista de abertos). */
const LATER_STAGE =
  /(homologa|resultado (final|definitivo|preliminar)|convoca(cao|dos)|nomea(cao|r)|classificacao final|gabarito|posse|prorroga(cao)? (do )?prazo de validade|torna sem efeito)/;
const NOT_CONCURSO = /(processo seletivo simplificado|chamamento publico|licitacao|pregao)/;

/** Decide, por palavras-chave, se o trecho merece ir para a extração (IA ou regras). */
export function isExamOpeningCandidate(excerpt: string): { candidate: boolean; reason: string } {
  const text = normalize(excerpt);
  if (!POSITIVE.test(text)) return { candidate: false, reason: "sem menção a concurso público" };
  if (!OPENING.test(text)) return { candidate: false, reason: "sem indício de edital de abertura" };
  if (LATER_STAGE.test(text) && !/edital de abertura|abertura d[aoe]s? inscric/.test(text)) {
    return { candidate: false, reason: "etapa posterior (resultado, homologação, nomeação...)" };
  }
  if (NOT_CONCURSO.test(text) && !/concurso publico de provas/.test(text)) {
    return { candidate: false, reason: "seleção que não é concurso público" };
  }
  return { candidate: true, reason: "menciona abertura de concurso público" };
}

/** dd/mm/aaaa → aaaa-mm-dd (null se a data for inválida). */
export function parseDateBr(value: string): string | null {
  const match = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(value.trim());
  if (!match) return null;
  const [, d, m, y] = match;
  const iso = `${y}-${m?.padStart(2, "0")}-${d?.padStart(2, "0")}`;
  const date = new Date(`${iso}T00:00:00Z`);
  return Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== iso ? null : iso;
}

const DATE = String.raw`(\d{1,2}\/\d{1,2}\/\d{4})`;

/** Período de inscrições ("de 01/11/2026 a 30/11/2026" ou "até 30/11/2026") perto da palavra inscrição. */
function registrationPeriod(text: string): { start: string | null; end: string | null } {
  const range = new RegExp(
    String.raw`inscri[çc][õo]es?[^.]{0,120}?${DATE}\s*(?:a|até|e)\s*${DATE}`,
    "i",
  ).exec(text);
  if (range) return { start: parseDateBr(range[1] ?? ""), end: parseDateBr(range[2] ?? "") };
  const until = new RegExp(String.raw`inscri[çc][õo]es?[^.]{0,120}?até\s*(?:o dia\s*)?${DATE}`, "i").exec(
    text,
  );
  return { start: null, end: until ? parseDateBr(until[1] ?? "") : null };
}

function examDateOf(text: string): string | null {
  const match = new RegExp(
    String.raw`(?:prova objetiva|provas? (?:ser[áa]o?|será) (?:aplicada|realizada)s?)[^.]{0,60}?${DATE}`,
    "i",
  ).exec(text);
  return match ? parseDateBr(match[1] ?? "") : null;
}

function vacanciesOf(text: string): number | null {
  const match = /(\d{1,5})\s*\(?[a-zà-ú ]*\)?\s*vagas/i.exec(text);
  const value = match ? Number(match[1]) : NaN;
  return Number.isFinite(value) && value > 0 ? value : null;
}

/** Trecho mais relevante (em volta da menção a concurso), limitado para caber na fila do editor. */
export function evidenceOf(excerpt: string, max = 600): string {
  const clean = excerpt.replace(/\s+/g, " ").trim();
  const at = normalize(clean).indexOf("concurso publico");
  const start = Math.max(0, at - 150);
  const piece = clean.slice(start, start + max);
  return `${start > 0 ? "…" : ""}${piece}${start + max < clean.length ? "…" : ""}`;
}

/** Rascunho por regras: confiança baixa, o editor completa e confere na fonte. */
export function ruleBasedLead(doc: RadarDocument): RuleBasedLead {
  const text = doc.excerpt.replace(/\s+/g, " ");
  const period = registrationPeriod(text);
  const organization =
    doc.sphere === "municipal" && doc.territoryName
      ? `Prefeitura Municipal de ${doc.territoryName}`
      : (doc.territoryName ?? "Órgão não identificado");
  return {
    organization,
    title: `Concurso público — ${organization}`,
    sphere: doc.sphere,
    uf: doc.uf,
    city: doc.sphere === "municipal" ? doc.territoryName : null,
    registrationStart: period.start,
    registrationEnd: period.end,
    examDate: examDateOf(text),
    vacancies: vacanciesOf(text),
    evidence: evidenceOf(doc.excerpt),
  };
}
