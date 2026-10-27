import { auditLogs } from "@aprovaai/db";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  TestClient,
  createTestContext,
  createVerifiedUser,
  resetDatabase,
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

describe("RBAC no painel admin", () => {
  it("anônimo recebe 401, user e editor recebem 403, admin recebe 200", async () => {
    const { client: user } = await createVerifiedUser(ctx, "user@exemplo.com");
    const { client: editor } = await createVerifiedUser(ctx, "editor@exemplo.com", "editor");
    const { client: admin } = await createVerifiedUser(ctx, "admin@exemplo.com", "admin");

    expect((await new TestClient(ctx.app).get("/api/admin/users")).statusCode).toBe(401);
    expect((await user.get("/api/admin/users")).statusCode).toBe(403);
    expect((await editor.get("/api/admin/users")).statusCode).toBe(403);

    const res = await admin.get("/api/admin/users?search=exemplo&pageSize=10");
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ total: 3, page: 1, pageSize: 10 });
  });

  it("user não consegue se promover", async () => {
    const { client, userId } = await createVerifiedUser(ctx, "user@exemplo.com");
    const res = await client.patch(`/api/admin/users/${userId}/role`, { role: "admin" });
    expect(res.statusCode).toBe(403);
    expect((await client.get("/api/me")).json().role).toBe("user");
  });

  it("admin altera papel com auditoria e o novo papel vale na hora", async () => {
    const { client: admin, userId: adminId } = await createVerifiedUser(ctx, "admin@exemplo.com", "admin");
    const { client: target, userId } = await createVerifiedUser(ctx, "user@exemplo.com");

    const res = await admin.patch(`/api/admin/users/${userId}/role`, { role: "editor" });
    expect(res.statusCode).toBe(200);
    expect(res.json().role).toBe("editor");
    expect((await target.get("/api/me")).json().role).toBe("editor");

    const [log] = await ctx.db
      .select()
      .from(auditLogs)
      .where(eq(auditLogs.action, "admin.user_role_changed"));
    expect(log).toMatchObject({
      actorUserId: adminId,
      targetId: userId,
      metadata: { from: "user", to: "editor" },
    });
  });

  it("admin não altera o próprio papel nem se desativa", async () => {
    const { client: admin, userId: adminId } = await createVerifiedUser(ctx, "admin@exemplo.com", "admin");
    expect((await admin.patch(`/api/admin/users/${adminId}/role`, { role: "user" })).statusCode).toBe(409);
    expect((await admin.patch(`/api/admin/users/${adminId}/status`, { status: "disabled" })).statusCode).toBe(
      409,
    );
  });

  it("desativar usuário derruba as sessões dele imediatamente", async () => {
    const { client: admin } = await createVerifiedUser(ctx, "admin@exemplo.com", "admin");
    const { client: target, userId } = await createVerifiedUser(ctx, "user@exemplo.com");
    expect((await target.get("/api/me")).statusCode).toBe(200);

    expect((await admin.patch(`/api/admin/users/${userId}/status`, { status: "disabled" })).statusCode).toBe(
      200,
    );
    expect((await target.get("/api/me")).statusCode).toBe(401);
  });

  it("id inexistente ou malformado não quebra a API", async () => {
    const { client: admin } = await createVerifiedUser(ctx, "admin@exemplo.com", "admin");
    const missing = await admin.patch("/api/admin/users/00000000-0000-4000-8000-000000000000/role", {
      role: "editor",
    });
    expect(missing.statusCode).toBe(404);
    const malformed = await admin.patch("/api/admin/users/nao-e-uuid/role", { role: "editor" });
    expect(malformed.statusCode).toBe(400);
    expect(malformed.json().error.code).toBe("VALIDATION_ERROR");
  });
});
