// Edital de EXEMPLO (marcado is_sample) para testar o produto. Inspirado na estrutura usual de
// concursos de TRT organizados pela FCC; pesos, quantidade de questões e relevância são ilustrativos,
// sem data de prova e sem situação confirmada (não há fonte oficial).
import type { NoticeImportInput } from "@aprovaai/shared";

const t = (name: string, relevance: number) => ({ name, relevance });

export const SAMPLE_TRT_FCC: NoticeImportInput = {
  exam: {
    title: "TRT (exemplo) — Analista Judiciário, Área Judiciária",
    organization: { name: "Tribunal Regional do Trabalho (exemplo)", acronym: "TRT", sphere: "federal" },
    board: { name: "FCC", slug: "fcc" },
    sphere: "federal",
    educationLevel: "superior",
    situation: "previsto",
    datesConfirmed: false,
  },
  position: { title: "Analista Judiciário — Área Judiciária", educationLevel: "superior" },
  notice: { title: "Edital de exemplo (não oficial)", version: 1, scoringType: "standard", wrongPenalty: 0 },
  subjects: [
    {
      name: "Língua Portuguesa",
      weight: 1,
      questionCount: 10,
      kind: "basica",
      topics: [
        t("Compreensão e interpretação de textos", 5),
        t("Ortografia e acentuação", 2),
        t("Classes de palavras", 3),
        t("Concordância verbal e nominal", 4),
        t("Regência e crase", 4),
        t("Pontuação", 3),
      ],
    },
    {
      name: "Raciocínio Lógico-Matemático",
      weight: 1,
      questionCount: 5,
      kind: "basica",
      topics: [
        t("Proposições e conectivos lógicos", 4),
        t("Equivalências e negações", 4),
        t("Problemas aritméticos", 3),
        t("Porcentagem e proporcionalidade", 3),
      ],
    },
    {
      name: "Direito Constitucional",
      weight: 2,
      questionCount: 8,
      kind: "especifica",
      topics: [
        t("Direitos e garantias fundamentais", 5),
        t("Organização do Estado", 3),
        t("Poder Judiciário", 5),
        t("Administração Pública na Constituição", 4),
        t("Controle de constitucionalidade", 3),
      ],
    },
    {
      name: "Direito Administrativo",
      weight: 2,
      questionCount: 8,
      kind: "especifica",
      topics: [
        t("Princípios da Administração Pública", 4),
        t("Atos administrativos", 5),
        t("Licitações e contratos (Lei 14.133/2021)", 5),
        t("Agentes públicos (Lei 8.112/1990)", 5),
        t("Responsabilidade civil do Estado", 3),
        t("Improbidade administrativa", 3),
      ],
    },
    {
      name: "Direito do Trabalho",
      weight: 2,
      questionCount: 10,
      kind: "especifica",
      topics: [
        t("Contrato individual de trabalho", 5),
        t("Jornada de trabalho", 5),
        t("Remuneração e salário", 4),
        t("Férias", 3),
        t("Rescisão e aviso prévio", 4),
        t("FGTS", 2),
      ],
    },
    {
      name: "Direito Processual do Trabalho",
      weight: 2,
      questionCount: 10,
      kind: "especifica",
      topics: [
        t("Competência da Justiça do Trabalho", 5),
        t("Procedimentos ordinário e sumaríssimo", 4),
        t("Provas no processo do trabalho", 3),
        t("Recursos trabalhistas", 5),
        t("Execução trabalhista", 4),
      ],
    },
    {
      name: "Direito Civil",
      weight: 2,
      questionCount: 4,
      kind: "especifica",
      topics: [
        t("Pessoas naturais e jurídicas", 3),
        t("Negócio jurídico", 4),
        t("Prescrição e decadência", 4),
        t("Obrigações", 3),
      ],
    },
    {
      name: "Direito Processual Civil",
      weight: 2,
      questionCount: 5,
      kind: "especifica",
      topics: [
        t("Normas fundamentais do processo civil", 3),
        t("Tutela provisória", 4),
        t("Recursos", 4),
        t("Cumprimento de sentença", 3),
      ],
    },
    {
      name: "Direitos das Pessoas com Deficiência",
      weight: 1,
      questionCount: 3,
      kind: "especifica",
      topics: [
        t("Estatuto da Pessoa com Deficiência (Lei 13.146/2015)", 4),
        t("Convenção sobre os Direitos das Pessoas com Deficiência", 3),
      ],
    },
  ],
};
