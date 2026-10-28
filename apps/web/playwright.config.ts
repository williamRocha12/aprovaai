import { defineConfig, devices } from "@playwright/test";

// E2E contra a stack real: web (build de produção, com a API embutida em /api), Postgres e Mailpit.
// Antes: docker compose up -d ; pnpm db:migrate ; pnpm build
const isCI = Boolean(process.env.CI);

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  retries: isCI ? 1 : 0,
  reporter: isCI ? [["github"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: "http://localhost:3000",
    locale: "pt-BR",
    trace: "retain-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: "pnpm start",
    // Vários cadastros por minuto saindo do mesmo IP: o rate limit é coberto nos testes de integração.
    env: { RATE_LIMIT_ENABLED: "false" },
    url: "http://localhost:3000/api/health",
    reuseExistingServer: !isCI,
    timeout: 60_000,
  },
});
