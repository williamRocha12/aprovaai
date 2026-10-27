import { hash, verify } from "@node-rs/argon2";

// Argon2id com os parâmetros mínimos recomendados pela OWASP (19 MiB, 2 iterações, 1 thread).
// O @node-rs/argon2 usa Argon2id por padrão.
const ARGON2_OPTIONS = { memoryCost: 19_456, timeCost: 2, parallelism: 1 } as const;

export function hashPassword(password: string): Promise<string> {
  return hash(password, ARGON2_OPTIONS);
}

export async function verifyPassword({ hash: stored, password }: { hash: string; password: string }) {
  try {
    return await verify(stored, password);
  } catch {
    // Hash corrompido ou em outro formato: trata como senha inválida, sem vazar detalhes.
    return false;
  }
}
