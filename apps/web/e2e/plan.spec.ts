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

  // Responder questão → errar → classificar o erro → entrar na revisão.
  await page.getByRole("link", { name: "Questões", exact: true }).click();
  await page.getByRole("link", { name: "Resolver agora" }).click();
  await page.getByRole("radio").first().check();
  await page.getByRole("button", { name: "Responder" }).click();
  const verdict = page.locator("[role=alert], [role=status]").filter({ hasText: /Você (acertou|errou)/ });
  await expect(verdict).toBeVisible();
  if ((await verdict.textContent())?.includes("acertou")) {
    // Acertou de primeira: responde de novo com outra alternativa para gerar o erro.
    const answer = (await verdict.textContent())?.match(/Gabarito: ([A-E])/)?.[1];
    await page.getByRole("button", { name: "Responder de novo" }).click();
    const radios = page.getByRole("radio");
    const count = await radios.count();
    for (let i = 0; i < count; i++) {
      if ((await radios.nth(i).getAttribute("value")) !== answer) {
        await radios.nth(i).check();
        break;
      }
    }
    await page.getByRole("button", { name: "Responder" }).click();
    await expect(page.getByRole("alert").filter({ hasText: "Você errou" })).toBeVisible();
  }
  await page.getByRole("button", { name: "Falta de teoria" }).click();
  await expect(page.getByRole("button", { name: "Falta de teoria" })).toHaveClass(/bg-primary/);

  await page.getByRole("link", { name: "Revisões", exact: true }).click();
  await page.getByRole("tab", { name: /Futuras \(1\)/ }).click();
  await expect(page.getByText("Falta de teoria")).toBeVisible();

  await page.getByRole("link", { name: "Painel", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Painel" })).toBeVisible();
  await expect(page.getByText("Plano sobre concurso de exemplo")).toBeVisible();

  // Simulado: montar, responder uma, finalizar e ver a nota.
  await page.getByRole("link", { name: "Simulados", exact: true }).click();
  await page.getByLabel("Número de questões").fill("5");
  await page.getByRole("button", { name: "Montar e começar" }).click();
  await expect(page.getByRole("button", { name: "Finalizar" })).toBeVisible();
  await page.getByRole("radio").first().click();
  await page.getByRole("button", { name: "Finalizar" }).click();
  await expect(page.getByText("Recomendações para o próximo ciclo")).toBeVisible();
  await expect(page.getByText("Nota", { exact: true })).toBeVisible();
});
