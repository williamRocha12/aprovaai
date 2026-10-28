import { describe, expect, it } from "vitest";
import { computeBoardStats, incidenceForTopics, type BoardStatItem } from "./board-stats";
import { parseAnswerKey, parseExamText } from "./past-exam-parser";

// Fixture no formato típico de prova de múltipla escolha (texto autoral, só a estrutura imita uma prova).
const MULTIPLE = `
CONHECIMENTOS BÁSICOS
1. Conforme o art. 5º da Constituição, assinale a alternativa correta.
(A) Primeira alternativa
(B) Segunda alternativa
que continua na linha seguinte
(C) Terceira alternativa
(D) Quarta alternativa
(E) Quinta alternativa
2. Em 2024, o órgão publicou 3 editais. Quantos foram em 2023?
A) Um
B) Dois
C) Três
D) Quatro
E) Cinco
3 - Questão com número no formato hífen.
(A) Sim
(B) Não
`;

const CEBRASPE = `
Julgue os itens a seguir.
1 O servidor estável só perde o cargo por sentença judicial.
2 A crase é facultativa antes de pronome possessivo feminino.
3 Item anulado pela banca.
`;

describe("parseAnswerKey", () => {
  it("aceita formatos variados e marca anuladas", () => {
    const key = parseAnswerKey("1 - A  02 C\n3: X  4) E 5 ANULADA");
    expect([...key]).toEqual([
      [1, "A"],
      [2, "C"],
      [3, "ANULADA"],
      [4, "E"],
      [5, "ANULADA"],
    ]);
  });
});

describe("parseExamText", () => {
  it("separa questões de múltipla escolha, alternativas multilinha e aplica o gabarito", () => {
    const { questions, warnings } = parseExamText(MULTIPLE, "1 B 2 A 3 X");
    expect(questions.map((q) => q.number)).toEqual([1, 2, 3]);
    expect(questions[0]?.type).toBe("multipla_escolha");
    expect(questions[0]?.statement).toContain("art. 5º");
    expect(questions[0]?.options).toHaveLength(5);
    expect(questions[0]?.options[1]?.text).toBe("Segunda alternativa que continua na linha seguinte");
    expect(questions[0]?.correctAnswer).toBe("B");
    // "Em 2024 ... 3 editais" não pode virar início de questão.
    expect(questions[1]?.statement).toContain("3 editais");
    expect(questions[2]).toMatchObject({ annulled: true, correctAnswer: null });
    expect(warnings).toEqual([]);
  });

  it("reconhece itens de certo/errado (Cebraspe) e valida o gabarito C/E", () => {
    const { questions, warnings } = parseExamText(CEBRASPE, "1 E 2 C 3 X");
    expect(questions.map((q) => [q.number, q.type, q.correctAnswer, q.annulled])).toEqual([
      [1, "certo_errado", "E", false],
      [2, "certo_errado", "C", false],
      [3, "certo_errado", null, true],
    ]);
    expect(warnings).toEqual([]);
  });

  it("gabarito incompatível vira aviso, não resposta inventada", () => {
    const { questions, warnings } = parseExamText(CEBRASPE, "1 B 2 C");
    expect(questions[0]?.correctAnswer).toBeNull();
    expect(warnings.some((w) => w.includes("Questão 1"))).toBe(true);
    expect(warnings.some((w) => w.includes("Questão 3: sem resposta"))).toBe(true);
  });

  it("texto sem questões numeradas gera aviso", () => {
    expect(parseExamText("Instruções gerais da prova.").warnings[0]).toMatch(/Nenhuma questão/);
  });
});

describe("computeBoardStats", () => {
  const item = (examId: string, year: number, topicId: string | null, annulled = false): BoardStatItem => ({
    examId,
    year,
    topicId,
    annulled,
  });

  it("calcula incidência, nº de provas e ignora anuladas", () => {
    const stats = computeBoardStats([
      item("p1", 2023, "crase"),
      item("p1", 2023, "crase"),
      item("p1", 2023, "atos"),
      item("p2", 2024, "atos"),
      item("p2", 2024, "atos", true),
      item("p2", 2024, null),
    ]);
    expect(stats).toMatchObject({ exams: 2, yearFrom: 2023, yearTo: 2024, totalQuestions: 5 });
    const crase = stats.topics.find((t) => t.topicId === "crase");
    expect(crase).toMatchObject({ questionCount: 2, examCount: 1, share: 0.4, trend: null });
  });

  it("tendência só com 2+ provas em cada período", () => {
    const items = [
      ...["a", "b"].flatMap((id) => [
        item(id, 2019, "lei"),
        item(id, 2019, "outro"),
        item(id, 2019, "outro"),
        item(id, 2019, "outro"),
      ]),
      ...["c", "d"].flatMap((id) => [
        item(id, 2024, "lei"),
        item(id, 2024, "lei"),
        item(id, 2024, "lei"),
        item(id, 2024, "outro"),
      ]),
    ];
    const stats = computeBoardStats(items);
    expect(stats.topics.find((t) => t.topicId === "lei")?.trend).toBe("subindo");
    expect(stats.topics.find((t) => t.topicId === "outro")?.trend).toBe("caindo");
  });

  it("vazio não quebra", () => {
    expect(computeBoardStats([])).toEqual({
      exams: 0,
      yearFrom: null,
      yearTo: null,
      totalQuestions: 0,
      topics: [],
    });
  });
});

describe("incidenceForTopics", () => {
  const stats = computeBoardStats(
    ["p1", "p2", "p3"].flatMap((id) => [
      { examId: id, year: 2024, topicId: "muito", annulled: false },
      { examId: id, year: 2024, topicId: "muito", annulled: false },
      { examId: id, year: 2024, topicId: "pouco", annulled: false },
    ]),
  );

  it("normaliza pelo assunto mais cobrado; o que nunca caiu fica 0 (não some)", () => {
    const map = incidenceForTopics(stats, ["muito", "pouco", "nunca"]);
    expect(map.get("muito")).toBe(1);
    expect(map.get("pouco")).toBe(0.5);
    expect(map.get("nunca")).toBe(0);
  });

  it("amostra pequena: não informa nada (planejador usa 0,5)", () => {
    expect(incidenceForTopics(stats, ["muito"], 5).size).toBe(0);
  });
});
