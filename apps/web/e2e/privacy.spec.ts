// LGPD: exportar os dados e excluir a conta pela tela.
import { expect, test } from "@playwright/test";
import { PASSWORD, signIn, signUpAndVerify, uniqueEmail } from "./helpers";

test("exporta os dados e exclui a conta; depois o login falha", async ({ page }) => {
  const email = uniqueEmail("lgpd");
  await signUpAndVerify(page, email);
  await page.goto("/conta");

  const download = page.waitForEvent("download");
  await page.getByRole("link", { name: "Exportar meus dados" }).click();
  expect((await download).suggestedFilename()).toMatch(/^aprovaai-meus-dados-.*\.json$/);

  await page.getByRole("button", { name: "Excluir minha conta" }).click();
  await page.getByLabel(/Digite seu e-mail/).fill(email);
  await page.getByLabel("Senha", { exact: true }).fill(PASSWORD);
  await page.getByRole("button", { name: "Excluir definitivamente" }).click();
  await expect(page).toHaveURL(/\/(\?conta=excluida)?$/);

  await signIn(page, email, PASSWORD);
  await expect(page.getByRole("alert").filter({ hasText: "E-mail ou senha inválidos" })).toBeVisible();
});
