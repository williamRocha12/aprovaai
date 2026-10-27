import { describe, expect, it } from "vitest";
import { emailSchema, passwordSchema, signUpSchema } from "./auth";
import { updateProfileSchema, weeklyAvailabilitySchema } from "./users";

describe("emailSchema", () => {
  it("normaliza para minúsculas e remove espaços", () => {
    expect(emailSchema.parse("  Fulano@Exemplo.COM ")).toBe("fulano@exemplo.com");
  });

  it("rejeita e-mail vazio ou inválido", () => {
    expect(emailSchema.safeParse("").success).toBe(false);
    expect(emailSchema.safeParse("sem-arroba").success).toBe(false);
  });
});

describe("passwordSchema", () => {
  it("aceita senha com letras e números no tamanho mínimo", () => {
    expect(passwordSchema.safeParse("concurso2026").success).toBe(true);
  });

  it("rejeita senha curta, só letras ou só números", () => {
    expect(passwordSchema.safeParse("abc123").success).toBe(false);
    expect(passwordSchema.safeParse("somenteletras").success).toBe(false);
    expect(passwordSchema.safeParse("12345678901").success).toBe(false);
  });

  it("rejeita senha acima do limite (evita DoS no hash)", () => {
    expect(passwordSchema.safeParse("a1".repeat(65)).success).toBe(false);
  });
});

describe("signUpSchema", () => {
  const valid = { name: "Ana", email: "ana@exemplo.com", password: "concurso2026", acceptTerms: true };

  it("exige aceite dos termos", () => {
    expect(signUpSchema.safeParse(valid).success).toBe(true);
    expect(signUpSchema.safeParse({ ...valid, acceptTerms: false }).success).toBe(false);
  });
});

describe("weeklyAvailabilitySchema", () => {
  const week = { "0": 0, "1": 120, "2": 120, "3": 120, "4": 120, "5": 120, "6": 240 };

  it("aceita zero minutos em um dia", () => {
    expect(weeklyAvailabilitySchema.safeParse(week).success).toBe(true);
  });

  it("rejeita minutos negativos, fracionados ou acima de 16h", () => {
    expect(weeklyAvailabilitySchema.safeParse({ ...week, "1": -10 }).success).toBe(false);
    expect(weeklyAvailabilitySchema.safeParse({ ...week, "1": 10.5 }).success).toBe(false);
    expect(weeklyAvailabilitySchema.safeParse({ ...week, "1": 17 * 60 }).success).toBe(false);
  });

  it("rejeita semana incompleta", () => {
    const { "6": _sabado, ...semSabado } = week;
    expect(weeklyAvailabilitySchema.safeParse(semSabado).success).toBe(false);
  });
});

describe("updateProfileSchema", () => {
  it("valida o fuso horário IANA", () => {
    expect(updateProfileSchema.safeParse({ timezone: "America/Sao_Paulo" }).success).toBe(true);
    expect(updateProfileSchema.safeParse({ timezone: "Marte/Olympus" }).success).toBe(false);
  });
});
