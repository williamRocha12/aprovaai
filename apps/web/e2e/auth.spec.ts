import { expect, test, type Page } from "@playwright/test";
import { waitForEmailLink } from "./mailpit";

const PASSWORD = "concurso2026";

function uniqueEmail(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 1e6)}@exemplo.com`;
}

async function signUpAndVerify(page: Page, email: string): Promise<void> {
  await page.goto("/cadastro");
  await page.getByLabel("Nome", { exact: true }).fill("Candidata E2E");
  await page.getByLabel("E-mail").fill(email);
  await page.getByLabel("Senha").fill(PASSWORD);
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: "Criar conta" }).click();

  await expect(page.getByRole("heading", { name: "Confirme seu e-mail" })).toBeVisible();

  const link = await waitForEmailLink(email, "Confirme seu e-mail");
  await page.goto(link);
  await expect(page.getByRole("heading", { name: "E-mail confirmado" })).toBeVisible();
}

async function signIn(page: Page, email: string, password: string): Promise<void> {
  await page.goto("/entrar");
  await page.getByLabel("E-mail").fill(email);
  await page.getByLabel("Senha").fill(password);
  await page.getByRole("button", { name: "Entrar" }).click();
}

test("cadastro → verificação de e-mail → conta → logout → login", async ({ page }) => {
  const email = uniqueEmail("cadastro");
  await signUpAndVerify(page, email);

  await page.getByRole("link", { name: "Continuar" }).click();
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
  await expect(page).toHaveURL(/\/conta$/);
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
  await expect(page).toHaveURL(/\/conta$/);
});
