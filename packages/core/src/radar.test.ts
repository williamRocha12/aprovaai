import { describe, expect, it } from "vitest";
import { evidenceOf, inferUf, isExamOpeningCandidate, parseDateBr, ruleBasedLead } from "./radar";

const OPENING =
  "EDITAL DE ABERTURA Nº 01/2026. O Prefeito Municipal de Palhoça torna pública a abertura das inscrições " +
  "do Concurso Público para provimento de 45 vagas. As inscrições serão realizadas de 03/11/2026 a 02/12/2026, " +
  "exclusivamente pela internet. A prova objetiva será aplicada em 18/01/2027.";

describe("isExamOpeningCandidate", () => {
  it("aceita edital de abertura de concurso público (com ou sem acento)", () => {
    expect(isExamOpeningCandidate(OPENING).candidate).toBe(true);
    expect(isExamOpeningCandidate("edital de abertura do concurso publico 1/2026").candidate).toBe(true);
  });

  it("descarta etapas posteriores, outras seleções e texto sem concurso", () => {
    expect(
      isExamOpeningCandidate("Homologação do resultado final do Concurso Público Edital nº 2/2025").candidate,
    ).toBe(false);
    expect(
      isExamOpeningCandidate("Convocação dos aprovados no concurso público, edital nº 3/2024").candidate,
    ).toBe(false);
    expect(
      isExamOpeningCandidate(
        "Processo seletivo simplificado: abertura das inscrições, edital nº 4/2026, concurso público",
      ).candidate,
    ).toBe(false);
    expect(isExamOpeningCandidate("Pregão eletrônico para aquisição de materiais").candidate).toBe(false);
    expect(
      isExamOpeningCandidate("EDITAL Nº 26. Prorrogação da validade de concurso público - Edital nº 1/2024.")
        .candidate,
    ).toBe(false);
    expect(
      isExamOpeningCandidate("Edital nº 37. Prorrogação de Validade de Concurso Público, edital nº 2/2024.")
        .candidate,
    ).toBe(false);
    expect(
      isExamOpeningCandidate(
        "EDITAL Nº 19, DE 26 DE OUTUBRO DE 2026. CONCURSO PÚBLICO. Torna público o resultado provisório na avaliação de saúde.",
      ).candidate,
    ).toBe(false);
    expect(isExamOpeningCandidate("").candidate).toBe(false);
  });
});

describe("parseDateBr", () => {
  it("converte datas válidas e rejeita inválidas", () => {
    expect(parseDateBr("03/11/2026")).toBe("2026-11-03");
    expect(parseDateBr("3/1/2027")).toBe("2027-01-03");
    expect(parseDateBr("31/02/2026")).toBeNull();
    expect(parseDateBr("2026-11-03")).toBeNull();
  });
});

describe("ruleBasedLead", () => {
  it("extrai período de inscrição, data da prova e vagas de um edital municipal", () => {
    const lead = ruleBasedLead({
      excerpt: OPENING,
      territoryName: "Palhoça",
      uf: "SC",
      sphere: "municipal",
      url: "x",
    });
    expect(lead.organization).toBe("Prefeitura Municipal de Palhoça");
    expect(lead.city).toBe("Palhoça");
    expect(lead.registrationStart).toBe("2026-11-03");
    expect(lead.registrationEnd).toBe("2026-12-02");
    expect(lead.examDate).toBe("2027-01-18");
    expect(lead.vacancies).toBe(45);
  });

  it("sem datas nem vagas no trecho, deixa nulo (nada inventado)", () => {
    const lead = ruleBasedLead({
      excerpt: "Torna pública a abertura do concurso público, edital nº 5/2026.",
      territoryName: null,
      uf: null,
      sphere: "federal",
      url: "x",
    });
    expect(lead.organization).toBe("Órgão não identificado");
    expect(lead.registrationEnd).toBeNull();
    expect(lead.examDate).toBeNull();
    expect(lead.vacancies).toBeNull();
  });

  it("aceita 'até' como fim das inscrições", () => {
    const lead = ruleBasedLead({
      excerpt: "Concurso público: inscrições abertas até 15/12/2026 no site da banca.",
      territoryName: "Itajaí",
      uf: "SC",
      sphere: "municipal",
      url: "x",
    });
    expect(lead.registrationStart).toBeNull();
    expect(lead.registrationEnd).toBe("2026-12-15");
  });
});

describe("evidenceOf", () => {
  it("recorta em volta da menção a concurso e limita o tamanho", () => {
    const long = `${"x".repeat(1000)} concurso público ${"y".repeat(1000)}`;
    const evidence = evidenceOf(long, 300);
    expect(evidence.startsWith("…")).toBe(true);
    expect(evidence).toContain("concurso público");
    expect(evidence.length).toBeLessThanOrEqual(302);
  });
});

describe("inferUf", () => {
  it("acha a UF pelo nome completo do estado no órgão", () => {
    expect(inferUf("Universidade Federal de Santa Catarina")).toBe("SC");
    expect(inferUf("Instituto Federal do Rio Grande do Norte")).toBe("RN");
    expect(inferUf("Universidade Federal do Rio Grande do Sul")).toBe("RS");
    expect(inferUf("Universidade Federal do Pará")).toBe("PA");
    expect(inferUf("Tribunal Regional do Trabalho da 12ª Região")).toBe("SC");
    expect(inferUf("Tribunal Regional do Trabalho da 4ª Região")).toBe("RS");
    expect(inferUf("Tribunal Regional do Trabalho da 8ª Região")).toBeNull();
    expect(inferUf("Tribunal Regional Federal da 3ª Região")).toBeNull();
  });

  it("não confunde cidade ou palavra comum com estado", () => {
    expect(inferUf("Universidade Federal de Santa Maria")).toBeNull();
    expect(inferUf("Comissão para concurso")).toBeNull();
    expect(inferUf(null)).toBeNull();
  });
});
