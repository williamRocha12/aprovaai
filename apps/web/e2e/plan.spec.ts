// Fluxo crítico do produto: cadastro → onboarding → ciclo gerado → concluir bloco → ver na semana.
// Requer o concurso de exemplo no banco (pnpm db:sample).
import { expect, test } from "@playwright/test";
import { signUpAndVerify, uniqueEmail } from "./helpers";

test("onboarding gera o ciclo e o bloco concluído aparece no plano", async ({ page }) => {
  await signUpAndVerify(page, uniqueEmail("plano"));
  await page.getByRole("link", { name: "Continuar" }).click();
  await expect(page.getByRole("heading", { name: "Vamos montar seu plano" })).toBeVisible();

  // 1. Concurso
  await page.getByRole("radio", { name: /TRT \(exemplo\)/ }).click();
  await expect(page.getByRole("button", { name: "Continuar" })).toBeEnabled();
  await page.getByRole("button", { name: "Continuar" }).click();

  // 2. Horas (padrão: 2h de seg a sex e 4h no sábado)
  await expect(page.getByRole("heading", { name: "Quanto tempo você tem para estudar?" })).toBeVisible();
  await page.getByRole("button", { name: "Continuar" }).click();

  // 3. Disciplinas
  await expect(page.getByRole("heading", { name: "Disciplinas e autoavaliação" })).toBeVisible();
  await page.getByRole("button", { name: "Continuar" }).click();

  // 4. Prova
  await expect(page.getByRole("heading", { name: "Data da prova" })).toBeVisible();
  await page.getByRole("button", { name: "Gerar meu ciclo" }).click();

  await expect(page).toHaveURL(/\/agora$/);
  await expect(page.getByRole("heading", { name: "O que estudar agora" })).toBeVisible();
  await expect(page.getByText("Por quê?")).toBeVisible();
  const firstTopic = await page.getByRole("heading", { level: 2 }).first().textContent();

  await page.getByRole("button", { name: "Concluir bloco" }).click();
  await expect(page.getByRole("heading", { level: 2 }).first()).not.toHaveText(firstTopic ?? "");

  await page.getByRole("link", { name: "Ver semana" }).click();
  await expect(page.getByRole("heading", { name: "Plano da semana" })).toBeVisible();
  await expect(page.getByText("Concluída").first()).toBeVisible();
});
