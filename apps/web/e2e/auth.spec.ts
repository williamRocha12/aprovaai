import { expect, test } from "@playwright/test";
import { PASSWORD, signIn, signUpAndVerify, uniqueEmail } from "./helpers";
import { waitForEmailLink } from "./mailpit";

test("cadastro → verificação de e-mail → conta → logout → login", async ({ page }) => {
  const email = uniqueEmail("cadastro");
  await signUpAndVerify(page, email);

  // Sem plano ainda: o app leva direto ao onboarding.
  await page.getByRole("link", { name: "Continuar" }).click();
  await expect(page).toHaveURL(/\/onboarding$/);
  await page.goto("/conta");
  await expect(page.getByRole("heading", { name: /Olá, Candidata E2E/ })).toBeVisible();
  await expect(page.getByText("Esta sessão")).toBeVisible();

  await page.getByRole("button", { name: "Sair", exact: true }).click();
  await expect(page).toHaveURL(/\/entrar$/);

  // Rota protegida sem sessão volta para o login.
  await page.goto("/conta");
  await expect(page).toHaveURL(/\/entrar$/);

  await signIn(page, email, "senhaErrada123");
  await expect(page.getByRole("alert").filter({ hasText: "E-mail ou senha inválidos" })).toBeVisible();

  await signIn(page, email, PASSWORD);
  await expect(page).toHaveURL(/\/onboarding$/);
});

test("recuperação de senha com link por e-mail", async ({ page }) => {
  const email = uniqueEmail("reset");
  await signUpAndVerify(page, email);
  await page.context().clearCookies();

  await page.goto("/esqueci-senha");
  await page.getByLabel("E-mail").fill(email);
  await page.getByRole("button", { name: "Enviar link" }).click();
  await expect(page.getByText(/Se existir uma conta com esse e-mail/)).toBeVisible();

  const link = await waitForEmailLink(email, "Redefinição de senha");
  await page.goto(link);
  await expect(page.getByRole("heading", { name: "Criar nova senha" })).toBeVisible();

  const newPassword = "novaSenha2026";
  await page.getByLabel("Nova senha", { exact: true }).fill(newPassword);
  await page.getByLabel("Confirme a nova senha").fill(newPassword);
  await page.getByRole("button", { name: "Salvar nova senha" }).click();
  await expect(page.getByText("Senha alterada")).toBeVisible();

  await signIn(page, email, newPassword);
  await expect(page).toHaveURL(/\/onboarding$/);
});
