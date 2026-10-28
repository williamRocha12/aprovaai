import { describe, expect, it } from "vitest";
import { nextReviewState, reviewBucket, validateIntervals } from "./spaced-repetition";

const TODAY = "2026-10-26";

describe("nextReviewState", () => {
  it("questão errada entra na fila em 1 dia", () => {
    expect(nextReviewState(null, false, TODAY)).toEqual({ stage: 0, dueDate: "2026-10-27", status: "ativa" });
  });

  it("acerto sem histórico de erro não entra na fila", () => {
    expect(nextReviewState(null, true, TODAY)).toBeNull();
  });

  it("acertou na revisão → avança para 7 e depois 30 dias", () => {
    const s1 = nextReviewState({ stage: 0, dueDate: TODAY, status: "ativa" }, true, TODAY);
    expect(s1).toEqual({ stage: 1, dueDate: "2026-11-02", status: "ativa" });
    const s2 = nextReviewState(s1, true, "2026-11-02");
    expect(s2).toEqual({ stage: 2, dueDate: "2026-12-02", status: "ativa" });
  });

  it("acertou no último estágio (30 dias) → dominada", () => {
    const s = nextReviewState({ stage: 2, dueDate: TODAY, status: "ativa" }, true, TODAY);
    expect(s?.status).toBe("dominada");
  });

  it("errou em qualquer estágio → volta ao início", () => {
    expect(nextReviewState({ stage: 2, dueDate: TODAY, status: "ativa" }, false, TODAY)?.stage).toBe(0);
  });

  it("intervalos configuráveis; inválidos caem no padrão", () => {
    expect(nextReviewState(null, false, TODAY, [3, 10])?.dueDate).toBe("2026-10-29");
    expect(validateIntervals([])).toEqual([1, 7, 30]);
    expect(validateIntervals([0, -1, 7, 7, 2])).toEqual([2, 7]);
  });
});

describe("reviewBucket", () => {
  it("separa hoje, atrasada, futura e concluída", () => {
    expect(reviewBucket({ stage: 0, dueDate: TODAY, status: "ativa" }, TODAY)).toBe("hoje");
    expect(reviewBucket({ stage: 0, dueDate: "2026-10-20", status: "ativa" }, TODAY)).toBe("atrasada");
    expect(reviewBucket({ stage: 0, dueDate: "2026-10-30", status: "ativa" }, TODAY)).toBe("futura");
    expect(reviewBucket({ stage: 2, dueDate: "2026-10-20", status: "dominada" }, TODAY)).toBe("concluida");
  });
});
