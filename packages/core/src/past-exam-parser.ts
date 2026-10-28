// Separa questões, alternativas e gabarito do TEXTO de uma prova (extraído do PDF oficial).
// Heurístico e conservador: o que não for reconhecido vira aviso para revisão humana, nunca chute.

export interface ParsedQuestion {
  number: number;
  type: "multipla_escolha" | "certo_errado";
  statement: string;
  options: { label: string; text: string }[];
  correctAnswer: string | null;
  annulled: boolean;
}

export interface ParseResult {
  questions: ParsedQuestion[];
  warnings: string[];
}

// "1.", "01 -", "2)", "Questão 3" ou, no estilo Cebraspe, "4 O servidor..." (número + espaço + maiúscula).
const QUESTION_START =
  /^\s*(?:(?:QUEST[ÃA]O|[Qq]uest[ãa]o)\s*(?:N[º°o.]?\s*)?)?(\d{1,3})(?:\s*[.)\-–:]\s*|\s{2,}|\s(?=[A-ZÀ-Ý]))/;
const OPTION_START = /^\s*\(?([A-Ea-e])\s*[).\-–]\s+/;
const ANNULLED_MARKS = new Set(["X", "*", "ANULADA", "NULA", "ANULADO"]);

function clean(text: string): string {
  return text
    .replace(/\r/g, "")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/**
 * Gabarito: aceita "1 - A", "01 C", "2: E", "3) X" (anulada) etc.
 * Devolve número → letra (C/E no certo/errado) ou "ANULADA".
 */
export function parseAnswerKey(text: string): Map<number, string> {
  const key = new Map<number, string>();
  const pattern = /(\d{1,3})\s*[-–:.)]?\s*(ANULADA|ANULADO|NULA|[A-E]|X|\*)(?![A-Za-zÀ-ÿ])/gi;
  for (const match of clean(text).matchAll(pattern)) {
    const number = Number(match[1]);
    const raw = (match[2] ?? "").toUpperCase();
    if (!key.has(number)) key.set(number, ANNULLED_MARKS.has(raw) ? "ANULADA" : raw);
  }
  return key;
}

/** Quebra o texto da prova em questões numeradas em sequência (1, 2, 3...), ignorando números soltos. */
export function parseExamText(examText: string, answerKeyText = ""): ParseResult {
  const lines = clean(examText).split("\n");
  const blocks: { number: number; lines: string[] }[] = [];
  let expected: number | null = null;

  for (const line of lines) {
    const match = QUESTION_START.exec(line);
    const number = match ? Number(match[1]) : null;
    // Só aceita o próximo número esperado (evita confundir "art. 5." ou anos com início de questão).
    const isStart =
      number !== null && (expected === null ? number === 1 || blocks.length === 0 : number === expected);
    if (match && isStart && number !== null) {
      blocks.push({ number, lines: [line.slice(match[0].length)] });
      expected = number + 1;
    } else if (blocks.length > 0) {
      blocks.at(-1)?.lines.push(line);
    }
  }

  const key = parseAnswerKey(answerKeyText);
  const warnings: string[] = [];
  const questions: ParsedQuestion[] = blocks.map(({ number, lines: blockLines }) => {
    const options: { label: string; text: string }[] = [];
    const statementLines: string[] = [];
    for (const line of blockLines) {
      const option = OPTION_START.exec(line);
      if (option)
        options.push({ label: (option[1] ?? "").toUpperCase(), text: line.slice(option[0].length).trim() });
      else if (options.length > 0) {
        const last = options.at(-1);
        if (last && line.trim()) last.text = `${last.text} ${line.trim()}`.trim();
      } else statementLines.push(line);
    }
    // Alternativas válidas: em sequência A, B, C... Se não houver ao menos duas, é item de certo/errado.
    const sequential = options.every((o, i) => o.label === "ABCDE"[i]);
    const isMultiple = options.length >= 2 && sequential;
    const statement = (isMultiple ? statementLines : blockLines).join("\n").trim();

    const answer = key.get(number) ?? null;
    const annulled = answer === "ANULADA";
    let correctAnswer = annulled ? null : answer;
    if (correctAnswer && !isMultiple && !["C", "E"].includes(correctAnswer)) {
      warnings.push(`Questão ${number}: gabarito "${correctAnswer}" não combina com item de certo/errado.`);
      correctAnswer = null;
    }
    if (correctAnswer && isMultiple && !options.some((o) => o.label === correctAnswer)) {
      warnings.push(`Questão ${number}: gabarito "${correctAnswer}" não está entre as alternativas.`);
      correctAnswer = null;
    }
    if (!answer && answerKeyText.trim()) warnings.push(`Questão ${number}: sem resposta no gabarito.`);
    if (!statement) warnings.push(`Questão ${number}: enunciado vazio.`);

    return {
      number,
      type: isMultiple ? "multipla_escolha" : "certo_errado",
      statement,
      options: isMultiple ? options : [],
      correctAnswer,
      annulled,
    };
  });

  if (questions.length === 0) warnings.push("Nenhuma questão numerada foi encontrada no texto.");
  const extraKeys = [...key.keys()].filter((n) => !questions.some((q) => q.number === n));
  if (extraKeys.length > 0)
    warnings.push(`Gabarito tem números sem questão correspondente: ${extraKeys.slice(0, 10).join(", ")}.`);
  return { questions, warnings };
}
