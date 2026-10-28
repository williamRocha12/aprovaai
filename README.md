# AprovaAI

[![CI](https://github.com/williamRocha12/aprovaai/actions/workflows/ci.yml/badge.svg)](https://github.com/williamRocha12/aprovaai/actions/workflows/ci.yml)

Plataforma de preparação para concursos públicos que responde, todos os dias: **"o que eu devo estudar agora, e por quê?"**

## Contexto

Quem estuda para concurso no Brasil lida com editais extensos, bancas com estilos diferentes (Cebraspe, FGV, FCC, Vunesp...)
e pouco tempo. Planilhas e cronogramas rígidos quebram na primeira semana atrasada.

## Problema

- O candidato não sabe priorizar: estuda o que gosta, não o que pesa no edital nem o que mais erra.
- Cronogramas fixos acumulam "dívida" quando se perde um dia.
- Erros em questões não voltam para revisão no momento certo.

## Solução

Um **ciclo de estudos dinâmico** por concurso-alvo:

- O edital verticalizado é a fonte da verdade (disciplinas, assuntos, pesos).
- A prioridade de cada assunto combina importância no edital, dificuldade observada, necessidade de revisão,
  incidência na banca e cobertura pendente. Toda tarefa vem com **justificativa** legível.
- Erros classificados (falta de teoria, pegadinha, atenção...) mudam o tipo do próximo bloco e entram em
  **revisão espaçada** (1/7/30 dias).
- **Raio-X da banca:** provas oficiais anteriores (importadas por editores, com link da fonte) mostram o que a banca mais
  cobra; com 3+ provas, essa incidência entra na prioridade do plano.
- **Vários concursos ao mesmo tempo:** cada um com plano, ciclo e painel próprios em "Meus concursos".
- **Radar de editais:** coleta diária em diários oficiais (Querido Diário, DOU) e fila de conferência do editor antes de
  publicar; a lista de concursos abertos filtra por estado e mostra vagas, salário e prazo de inscrição.
- IA opcional (Claude): proposta de edital a partir do PDF, sugestão de assunto, explicação de questão e resumo estratégico.
  Sem chave configurada, os recursos não aparecem (nunca são simulados).
- Sem promessa de aprovação: o foco é organização, constância e atacar o que mais derruba a nota.

Detalhes completos em [docs/architecture.md](docs/architecture.md).

## Arquitetura

```mermaid
flowchart LR
  U[Navegador] -->|HTTPS| WEB["Páginas Next.js 16"]
  U -->|"/api/*"| API["Vercel Function /api/*<br/>Fastify + Better Auth"]
  WEB -->|in-process| API
  API --> CORE["packages/core<br/>regras puras"]
  API --> DB["packages/db<br/>Drizzle"]
  DB --> PG[(Neon Postgres)]
  API --> MAIL["E-mail<br/>Mailpit / Resend"]
  CRON["Vercel Cron<br/>fila de jobs"] --> API
  API --> AI["Claude API<br/>(opcional)"]
```

- **Tudo num único projeto Vercel:** a API Fastify é uma biblioteca executada pela rota `app/api/[...path]` do Next.
  Um domínio só, cookie de sessão first-party (`httpOnly`, `SameSite=Lax`) e um único deploy.
- Autorização sempre no backend (RBAC `user | editor | admin`) e isolamento por dono testado.
- Decisões registradas em [docs/decisions.md](docs/decisions.md) e segurança em [docs/security.md](docs/security.md).

## Stack

| Camada | Tecnologia                                                                                          |
| ------ | --------------------------------------------------------------------------------------------------- |
| Web    | Next.js 16 (App Router), React 19, TypeScript, Tailwind 4, TanStack Query, React Hook Form + Zod    |
| API    | Node.js 24, Fastify 5, Zod 4, OpenAPI/Swagger                                                       |
| Auth   | Better Auth (Argon2id, verificação de e-mail, reset, sessões revogáveis, rate limit)                |
| Dados  | PostgreSQL 17, Drizzle ORM                                                                          |
| Testes | Vitest (unitário + integração com Postgres), Playwright (E2E)                                       |
| Infra  | Vercel (functions gru1), Neon, Resend, pnpm + Turborepo, Docker Compose (dev), GitHub Actions, pino |

## Como rodar (Windows / PowerShell)

Pré-requisitos: Node 24, pnpm 9 (`corepack enable`), Docker Desktop.

```powershell
git clone <url-do-repo> aprovaai ; cd aprovaai
Copy-Item .env.example .env
# Gere um segredo e cole em BETTER_AUTH_SECRET no .env:
node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"

docker compose up -d        # Postgres + Mailpit
pnpm install
pnpm db:migrate
pnpm db:seed
pnpm dev                    # http://localhost:3000 (Swagger da API em /api/docs)
```

- E-mails de desenvolvimento (verificação, reset) aparecem no Mailpit: http://localhost:8025
- Primeiro admin: cadastre-se pelo site e rode `pnpm user:set-role voce@exemplo.com admin`

Verificação:

```powershell
pnpm lint ; pnpm typecheck ; pnpm test ; pnpm build
pnpm --filter @aprovaai/web exec playwright install chromium   # uma vez
pnpm test:e2e
```

## Deploy

Tudo na **Vercel**: um projeto com Root Directory `apps/web`, banco **Neon** pelo Marketplace (São Paulo) e e-mail pelo **Resend**.
O build (`pnpm vercel-build`) aplica as migrations antes do `next build`. Passo a passo, variáveis e limites da plataforma
em [docs/deploy.md](docs/deploy.md).

## Resultados

Estado atual: **Etapas B a G concluídas e Etapa H em andamento** (radar de editais com fila de confirmação; alertas pendentes), além de vários concursos por usuário.

- Cadastro com verificação de e-mail, login com Google, RBAC, auditoria e exportação/exclusão de dados (LGPD).
- Motor do ciclo determinístico com justificativa por tarefa, revisão espaçada, caderno de erros, painel e simulados.
- Provas anteriores com leitura automática (questões + gabarito), revisão humana e Raio-X da banca; fila de jobs com Vercel Cron.
- Testes: 57 no core, 116 de integração na API (inclui isolamento entre usuários e conectores do radar com fixtures), 10 no shared e 4 E2E com Playwright.

**Limitações conhecidas:** alertas do radar (seguir concurso, notificações) e o hardening final (RLS, CSP com nonce, rate limit compartilhado,
Etapa I) ainda não existem. O texto de termos e privacidade é placeholder para revisão jurídica.
Em produção: **https://aprovaai-nine.vercel.app**. O envio de e-mail (Resend) ainda não está configurado, então o cadastro
por e-mail em produção não recebe o link de verificação (o login com Google funciona). A IA depende de `ANTHROPIC_API_KEY`.
Lista completa em [docs/backlog.md](docs/backlog.md).
