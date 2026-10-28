// Implementação do AiProvider com a API da Anthropic (structured outputs via Zod).
import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import type { z } from "zod";
import {
  CLASSIFY_BATCH_SYSTEM,
  CLASSIFY_SYSTEM,
  EXPLAIN_SYSTEM,
  NOTICE_SYSTEM,
  classifyBatchUserPrompt,
  classifyUserPrompt,
  explainUserPrompt,
  noticeUserPrompt,
  PLAN_SUMMARY_SYSTEM,
  planSummaryUserPrompt,
} from "./prompts";
import {
  aiBatchClassificationSchema,
  aiClassificationSchema,
  aiExplanationSchema,
  aiNoticeSchema,
  aiPlanSummarySchema,
  type AiProvider,
  type AiResult,
  type AiUsage,
  type PlanSummaryInput,
} from "./provider";

type Effort = "low" | "medium" | "high";

export class AnthropicAiProvider implements AiProvider {
  readonly name = "anthropic";
  private readonly client: Anthropic;

  constructor(
    apiKey: string,
    private readonly model: string,
  ) {
    // Uma nova tentativa automática em 429/5xx; timeout menor que o limite da função na Vercel.
    this.client = new Anthropic({ apiKey, maxRetries: 1, timeout: 240_000 });
  }

  private async run<S extends z.ZodType>(
    schema: S,
    params: { system: string; user: string; maxTokens: number; effort: Effort },
  ): Promise<AiResult<z.infer<S>>> {
    try {
      const response = await this.client.beta.messages.parse({
        model: this.model,
        max_tokens: params.maxTokens,
        system: params.system,
        messages: [{ role: "user", content: params.user }],
        output_config: { effort: params.effort, format: betaZodOutputFormat(schema) },
        // Recusa por política: o servidor tenta o modelo de reserva recomendado (por categoria).
        betas: ["server-side-fallback-2026-07-01"],
        fallbacks: "default",
      });
      const usage: AiUsage = {
        model: response.model,
        inputTokens: response.usage.input_tokens,
        outputTokens: response.usage.output_tokens,
      };
      if (response.stop_reason === "refusal") {
        return { ok: false, reason: "refused", message: "O modelo recusou a solicitação.", usage };
      }
      if (response.stop_reason === "max_tokens" || !response.parsed_output) {
        return { ok: false, reason: "invalid_output", message: "A resposta da IA veio incompleta.", usage };
      }
      return { ok: true, data: response.parsed_output as z.infer<S>, usage };
    } catch (error) {
      // Erros do provedor (rede, limite, indisponibilidade) viram resultado tipado: quem chama decide a mensagem.
      const message =
        error instanceof Anthropic.RateLimitError
          ? "Limite do provedor de IA atingido. Tente em alguns minutos."
          : error instanceof Anthropic.APIConnectionError
            ? "Não foi possível falar com o provedor de IA."
            : error instanceof Anthropic.APIError
              ? `Provedor de IA respondeu ${error.status}.`
              : "Falha inesperada na IA.";
      return { ok: false, reason: "provider_error", message, usage: null };
    }
  }

  extractNotice(documentText: string) {
    return this.run(aiNoticeSchema, {
      system: NOTICE_SYSTEM,
      user: noticeUserPrompt(documentText),
      maxTokens: 16_000,
      effort: "medium",
    });
  }

  classifyQuestion(
    question: Parameters<AiProvider["classifyQuestion"]>[0],
    taxonomy: Parameters<AiProvider["classifyQuestion"]>[1],
  ) {
    return this.run(aiClassificationSchema, {
      system: CLASSIFY_SYSTEM,
      user: classifyUserPrompt(question, taxonomy),
      maxTokens: 4_000,
      effort: "low",
    });
  }

  explainQuestion(question: Parameters<AiProvider["explainQuestion"]>[0]) {
    return this.run(aiExplanationSchema, {
      system: EXPLAIN_SYSTEM,
      user: explainUserPrompt(question),
      maxTokens: 8_000,
      effort: "medium",
    });
  }

  classifyBatch(
    items: Parameters<AiProvider["classifyBatch"]>[0],
    taxonomy: Parameters<AiProvider["classifyBatch"]>[1],
  ) {
    return this.run(aiBatchClassificationSchema, {
      system: CLASSIFY_BATCH_SYSTEM,
      user: classifyBatchUserPrompt(items, taxonomy),
      maxTokens: 16_000,
      effort: "low",
    });
  }

  planSummary(input: PlanSummaryInput) {
    return this.run(aiPlanSummarySchema, {
      system: PLAN_SUMMARY_SYSTEM,
      user: planSummaryUserPrompt(input),
      maxTokens: 8_000,
      effort: "medium",
    });
  }
}

/** Preço por milhão de tokens (entrada, saída) em USD, para registrar o custo. */
const PRICES: Record<string, [number, number]> = {
  "claude-opus-5-5": [4, 20],
  "claude-opus-5": [5, 25],
  "claude-opus-4-8": [5, 25],
  "claude-sonnet-5-5": [2, 10],
  "claude-haiku-5-5": [0.1, 0.5],
};

export function estimateCostUsd(usage: AiUsage): number | null {
  const price = PRICES[usage.model];
  if (!price) return null;
  return (usage.inputTokens * price[0] + usage.outputTokens * price[1]) / 1_000_000;
}
