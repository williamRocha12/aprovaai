// Testes de isolamento: o usuário B nunca lê, edita ou apaga dados do usuário A.
// REGRA: todo recurso privado novo entra em `privateResources` abaixo (ver CLAUDE.md).
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  createTestContext,
  createVerifiedUser,
  resetDatabase,
  type TestClient,
  type TestContext,
} from "./helpers";

let ctx: TestContext;

beforeAll(async () => {
  ctx = await createTestContext();
});
afterAll(async () => {
  await ctx.close();
});
beforeEach(async () => {
  await resetDatabase(ctx.db);
});

interface PrivateResource {
  name: string;
  /** A cria/ajusta o próprio dado; devolve o que B vai tentar atacar. */
  setup: (a: TestClient) => Promise<Record<string, string>>;
  /** B tenta ler/alterar/apagar o dado de A. */
  attack: (b: TestClient, target: Record<string, string>) => Promise<void>;
  /** Confere, pela sessão de A, que nada mudou. */
  verify: (a: TestClient, target: Record<string, string>) => Promise<void>;
}

const privateResources: PrivateResource[] = [
  {
    name: "perfil",
    setup: async (a) => {
      await a.patch("/api/me/profile", { displayName: "Perfil da A", interestAreas: ["tribunais"] });
      return {};
    },
    attack: async (b) => {
      // Não há rota de perfil por id: B só alcança o próprio perfil.
      const res = await b.patch("/api/me/profile", { displayName: "Invasor" });
      expect(res.statusCode).toBe(200);
      expect(res.json().email).toBe("b@exemplo.com");
    },
    verify: async (a) => {
      const me = (await a.get("/api/me")).json();
      expect(me.profile.displayName).toBe("Perfil da A");
      expect(me.profile.interestAreas).toEqual(["tribunais"]);
    },
  },
  {
    name: "sessões",
    setup: async (a) => {
      const list = (await a.get("/api/auth/list-sessions")).json() as Array<{ token: string }>;
      const token = list[0]?.token;
      if (!token) throw new Error("A deveria ter uma sessão.");
      return { token };
    },
    attack: async (b, { token }) => {
      const list = (await b.get("/api/auth/list-sessions")).json() as Array<{ token: string }>;
      expect(list.map((s) => s.token)).not.toContain(token);
      await b.post("/api/auth/revoke-session", { token });
    },
    verify: async (a) => {
      expect((await a.get("/api/me")).statusCode).toBe(200);
    },
  },
];

describe("isolamento entre usuários", () => {
  it.each(privateResources.map((r) => [r.name, r] as const))(
    "%s: B não acessa dados de A",
    async (_name, resource) => {
      const { client: a } = await createVerifiedUser(ctx, "a@exemplo.com");
      const { client: b } = await createVerifiedUser(ctx, "b@exemplo.com");

      const target = await resource.setup(a);
      await resource.attack(b, target);
      await resource.verify(a, target);
    },
  );

  it("/api/me sempre devolve o dono da sessão", async () => {
    const { client: a, userId: aId } = await createVerifiedUser(ctx, "a@exemplo.com");
    const { client: b, userId: bId } = await createVerifiedUser(ctx, "b@exemplo.com");
    expect((await a.get("/api/me")).json().id).toBe(aId);
    expect((await b.get("/api/me")).json().id).toBe(bId);
  });
});
