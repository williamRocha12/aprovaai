// Dublê do provedor de IA para testes (determinístico, sem rede). Não é usado pelo produto.
import type {
  AiBatchClassification,
  AiExamLead,
  AiNotice,
  AiPlanSummary,
  AiProvider,
  AiResult,
  PlanSummaryInput,
  QuestionForAi,
  TaxonomyOption,
} from "../src/lib/ai/provider";

export const FAKE_USAGE = { model: "claude-opus-5-5", inputTokens: 1000, outputTokens: 200 };

export const FAKE_NOTICE: AiNotice = {
  examTitle: "Prefeitura de Teste — Agente Administrativo",
  organizationName: "Prefeitura de Teste",
  organizationAcronym: null,
  sphere: "municipal",
  uf: "sc",
  city: "Teste",
  boardName: "Banca Teste",
  positionTitle: "Agente Administrativo",
  educationLevel: "medio",
  noticeTitle: "Edital 1/2026",
  scoringType: "standard",
  examDate: "data inválida",
  subjects: [
    {
      name: "Língua Portuguesa",
      weight: 1,
      questionCount: 10,
      kind: "basica",
      topics: [
        {
          name: "Crase",
          relevance: 9,
          rawText: "Emprego do sinal indicativo de crase.",
          subtopics: ["Casos facultativos"],
        },
      ],
    },
  ],
  warnings: ["O edital não informa pesos."],
};

export const FAKE_LEAD: AiExamLead = {
  isExamOpening: true,
  organization: "Prefeitura Municipal de Palhoça",
  title: "Concurso público — Prefeitura de Palhoça 2026",
  sphere: "municipal",
  uf: "sc",
  city: "Palhoça",
  boardName: "Banca Teste",
  positions: [{ title: "Agente Administrativo", vacancies: 10, salary: 3200.5 }],
  registrationStart: "2026-11-03",
  registrationEnd: "data inválida",
  examDate: null,
  noticeUrl: null,
  evidenceQuote: "torna pública a abertura das inscrições do Concurso Público",
  confidence: "alta",
};

export class FakeAi implements AiProvider {
  readonly name = "fake";
  calls = 0;
  lastClassifyInput: { question: QuestionForAi; taxonomy: TaxonomyOption[] } | null = null;
  lastPlanSummaryInput: PlanSummaryInput | null = null;
  nextExplain: AiResult<{ explanation: string; hasEvidence: boolean }> = {
    ok: true,
    data: { explanation: "Explicação de teste.", hasEvidence: true },
    usage: FAKE_USAGE,
  };
  /** Classificação em lote: 1º assunto da lista; confiança "baixa" para números pares (vão para revisão). */
  async classifyBatch(
    items: (QuestionForAi & { number: number })[],
    taxonomy: TaxonomyOption[],
  ): Promise<AiResult<AiBatchClassification>> {
    this.calls++;
    return {
      ok: true,
      data: {
        items: items.map((q) => ({
          number: q.number,
          topicId: taxonomy[0]?.topicId ?? null,
          confidence: q.number % 2 === 0 ? ("baixa" as const) : ("alta" as const),
        })),
      },
      usage: FAKE_USAGE,
    };
  }
  async extractNotice(): Promise<AiResult<AiNotice>> {
    this.calls++;
    return { ok: true, data: FAKE_NOTICE, usage: FAKE_USAGE };
  }
  async classifyQuestion(question: QuestionForAi, taxonomy: TaxonomyOption[]) {
    this.calls++;
    this.lastClassifyInput = { question, taxonomy };
    return {
      ok: true as const,
      data: { topicId: taxonomy[0]?.topicId ?? null, confidence: "alta" as const, reason: "Teste" },
      usage: FAKE_USAGE,
    };
  }
  async explainQuestion() {
    this.calls++;
    return this.nextExplain;
  }
  async planSummary(input: PlanSummaryInput): Promise<AiResult<AiPlanSummary>> {
    this.calls++;
    this.lastPlanSummaryInput = input;
    return { ok: true, data: { summary: "Resumo de teste.", highlights: ["Item 1"] }, usage: FAKE_USAGE };
  }
  nextLead: AiResult<AiExamLead> = { ok: true, data: FAKE_LEAD, usage: FAKE_USAGE };
  async extractExamLead(): Promise<AiResult<AiExamLead>> {
    this.calls++;
    return this.nextLead;
  }
}
