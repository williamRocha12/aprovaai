import { expect, type Page } from "@playwright/test";
import { waitForEmailLink } from "./mailpit";

export const PASSWORD = "concurso2026";

export function uniqueEmail(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 1e6)}@exemplo.com`;
}

export async function signUpAndVerify(page: Page, email: string): Promise<void> {
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

export async function signIn(page: Page, email: string, password: string): Promise<void> {
  await page.goto("/entrar");
  await page.getByLabel("E-mail").fill(email);
  await page.getByLabel("Senha").fill(password);
  await page.getByRole("button", { name: "Entrar" }).click();
}
