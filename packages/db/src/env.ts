import { existsSync } from "node:fs";
import { dirname, join } from "node:path";

/** Sobe a partir do diretório atual até achar a raiz do monorepo (pnpm-workspace.yaml). */
function findWorkspaceRoot(start: string): string | null {
  let dir = start;
  while (true) {
    if (existsSync(join(dir, "pnpm-workspace.yaml"))) return dir;
    const parent = dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

/**
 * Carrega o .env da raiz do monorepo, se existir. Não sobrescreve variáveis já definidas,
 * então em produção/CI valem as variáveis do ambiente.
 */
export function loadRootEnv(): void {
  const root = findWorkspaceRoot(process.cwd());
  const envFile = root ? join(root, ".env") : null;
  if (envFile && existsSync(envFile)) process.loadEnvFile(envFile);
}
