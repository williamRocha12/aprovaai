# CLAUDE.md — AprovaAI

Contexto para o Claude Code (e para quem chegar no projeto). Leia antes de mexer no código.

## Contexto

Plataforma web multiusuário de preparação para concursos públicos. Responde, para cada candidato,
**"o que eu devo estudar agora, e por quê?"** com um ciclo de estudos que se ajusta a acertos e erros.
Não promete aprovação nem calcula "probabilidade de aprovação".

- Plano completo, modelo de dados e escopo do MVP: [docs/architecture.md](docs/architecture.md)
- Decisões (ADRs): [docs/decisions.md](docs/decisions.md) · Segurança: [docs/security.md](docs/security.md) · Backlog: [docs/backlog.md](docs/backlog.md)
- Concurso de referência dos dados de exemplo: **TRT — Analista Judiciário, Área Judiciária (FCC)**.

## Stack

| Camada     | Tecnologia                                                                                                   |
| ---------- | ------------------------------------------------------------------------------------------------------------ |
| Monorepo   | pnpm 9 workspaces + Turborepo                                                                                |
| Web        | Next.js 16 (App Router), React 19, Tailwind 4, componentes no estilo shadcn, TanStack Query, RHF + Zod       |
| API        | Fastify 5 + Zod 4 (`fastify-type-provider-zod`), OpenAPI em `/api/docs` (dev)                                |
| Auth       | Better Auth 1.7 montado no Fastify, senha Argon2id (`@node-rs/argon2`), sessão em cookie                     |
| Banco      | PostgreSQL 17 + Drizzle ORM (migrations SQL em `packages/db/migrations`)                                     |
| E-mail     | Interface `EmailProvider`: SMTP/Mailpit (dev), Resend (prod), memória (testes)                               |
| Testes     | Vitest (unitário + integração com Postgres real), Playwright (E2E)                                           |
| TypeScript | 6.0.x (o typescript-eslint ainda não suporta 7.x)                                                            |
| Hospedagem | **Vercel** (um projeto: páginas + API em `/api/*`, região gru1) + Neon Postgres + Resend. Ver docs/deploy.md |

## Estrutura

```
apps/api        API Fastify como biblioteca: src/modules/<domínio>/{routes,repository}.ts, src/plugins, src/auth,
                src/runtime.ts (instância por processo), src/fetch-adapter.ts (Request → Fastify), test/
apps/web        Next.js: src/app/(auth) público, src/app/(app) logado, src/app/api/[...path] (roda a API), e2e/
packages/db     Drizzle: src/schema/*.ts, migrations/, seed, CLIs de migrate/seed (inclui o do build Vercel)
packages/shared Schemas Zod e tipos usados por web E api (fonte única de validação)
packages/core   (Etapa C) regras de negócio puras: planejador, repetição espaçada, pontuação
apps/worker     (Etapa G) jobs chamados por rotas /api/cron/* (Vercel Cron + tabela jobs)
```

## Comandos (PowerShell)

```powershell
Copy-Item .env.example .env          # depois troque BETTER_AUTH_SECRET
docker compose up -d                 # Postgres (5432) + Mailpit (SMTP 1025, UI http://localhost:8025)
pnpm install
pnpm db:migrate                      # aplica migrations no banco de dev
pnpm --filter @aprovaai/db db:migrate:test   # (opcional) os testes já migram sozinhos
pnpm db:seed                         # feature flags padrão
pnpm db:sample                       # concurso de exemplo TRT/FCC (remove: pnpm db:sample:remove)
pnpm dev                             # http://localhost:3000 (API em /api, Swagger em /api/docs)
pnpm lint ; pnpm typecheck ; pnpm test ; pnpm build
pnpm test:e2e                        # precisa de build + Docker no ar
pnpm db:generate                     # gera migration após mudar packages/db/src/schema
pnpm user:set-role voce@exemplo.com admin   # promove usuário (primeiro admin)
pnpm feature:set google_login on            # liga/desliga feature flag (painel de flags: Etapa E)
```

## Convenções

- Código, arquivos, branches e commits em **inglês**; comentários, UI e docs em **português**.
- Conventional Commits, um commit por funcionalidade: `feat(auth): ...`, `fix(api): ...`, `test(...)`, `docs: ...`.
- Rotas da API: `/api/<domínio>`; schemas Zod de entrada/saída ficam em `packages/shared` quando o web também usa.
- Erros da API sempre no formato `{ error: { code, message, details? } }` (ver `packages/shared/src/errors.ts`).
- **Dados privados:** todo método de repositório recebe `userId` obrigatório. Recurso de outro usuário → **404**.
- **Todo recurso privado novo entra em `apps/api/test/isolation.test.ts` (`privateResources`).**
- Autorização sempre no backend (`requireAuth`, `requireRole(...)` em `apps/api/src/plugins/auth-context.ts`).
- Ações sensíveis chamam `recordAudit` (`apps/api/src/lib/audit.ts`) sem senha, token ou PII em `metadata`.
- Nada de `console.log`: use `request.log`/`app.log` (pino). Logs nunca levam cookie, senha ou query string.
- Variável de ambiente nova → `apps/api/src/config.ts` (validação Zod) + `.env.example`.
- Regras de negócio puras com teste de borda (lista vazia, zero, null, datas no passado).
- **Hospedagem: tudo na Vercel** (ADR-009). A API Fastify é biblioteca e roda em `apps/web/src/app/api/[...path]/route.ts`.
  Nada de estado em memória/disco que precise persistir entre requisições; jobs = Vercel Cron + tabela `jobs` (ADR-010).
- Rota nova da API sempre sob `/api/...`. Server Components usam `getApi().inject` (sem fetch HTTP).

## Status atual

**Etapa B — Fundação: concluída (2026-10-27).**

Feito:

- Monorepo pnpm + Turborepo, TS strict, ESLint, Prettier, `.env.example`, Docker Compose para infra local (Postgres, Mailpit).
- Hospedagem 100% Vercel (ADR-009): API Fastify embutida em `/api/[...path]`, migrations + seed no `vercel-build`,
  config com padrões da Vercel (`x-real-ip`, URL de preview), Neon com `prepare: false`. Guia em docs/deploy.md.
  **Em produção:** https://aprovaai-nine.vercel.app (projeto Vercel `aprovaai`, banco Neon `aprovaai-db` em gru1).
  Pendente: e-mail (Resend) — sem ele o cadastro não envia o link de verificação.
- Schema + migration `0000_auth_foundation`: users, sessions, accounts, verifications, rate_limits, login_attempts, user_profiles, consents, audit_logs, feature_flags.
- Auth completa via Better Auth: cadastro com aceite de termos (consentimento versionado), verificação de e-mail obrigatória,
  login/logout, sair de todos os dispositivos, recuperação de senha (token único, 30 min, derruba sessões), troca de senha.
- Segurança: Argon2id, bloqueio após 5 falhas (sem enumeração), rate limit (Better Auth + @fastify/rate-limit), checagem de Origin (CSRF),
  helmet/CSP, CORS restrito, logs com redaction, auditoria, IP só de header confiável (`CLIENT_IP_HEADER`).
- RBAC (user/editor/admin) com painel admin de usuários (listar, buscar, mudar papel, desativar → derruba sessões).
- Web: landing, cadastro, login, verificação, recuperação, termos/privacidade (placeholder jurídico), conta (perfil, senha, sessões), admin/usuários.
- Testes: 42 Vitest na API (auth, RBAC, isolamento, lockout, config, adaptador Fetch) + 10 no shared + 2 E2E Playwright. CI no GitHub Actions.

**Etapa C — Núcleo: concluída (2026-10-28).**

- `packages/core`: prioridade (5 fatores, pesos configuráveis), fases por proximidade da prova, motor do ciclo determinístico
  (disponibilidade nunca excedida, bloco mínimo por disciplina, reserva de revisões vencidas, pendências reaproveitadas com
  conflito quando não cabem, tipo do bloco pelo tipo de erro, justificativa legível), repetição espaçada 1/7/30 e pontuação
  de simulados (padrão e Cebraspe). 34 testes.
- Schema `0001`: catálogo (boards, organizations, exams, exam_positions, exam_notices, subjects, topics, notice_subjects,
  notice_topics) e plano (user_exam_goals, user_topic_states, study_cycles, study_tasks, study_sessions).
  Regra de pontuação ficou em colunas de `exam_notices` (sem tabela `scoring_rules`: uma regra por edital basta).
- Importação de edital JSON (editor → catálogo com rascunho/validado; usuário → concurso privado), taxonomia reaproveitada por slug.
  Exemplo TRT/FCC (`pnpm db:sample`, remove com `pnpm db:sample:remove`), já semeado em produção.
- API: catálogo (lista/filtros/detalhe/edição pelo editor com auditoria), objetivo (`PUT /api/goal`), ciclo atual com rolagem
  automática ao vencer, recálculo sem apagar histórico (pendentes → `cancelada` + `superseded_by_cycle_id`), concluir/pular/
  reagendar com checagem de capacidade do dia, sessões. 57 testes (inclui isolamento de tarefas, sessões e concurso privado).
- Web: onboarding em 4 passos (também edita o plano), "O que estudar agora" com cronômetro, plano semanal com arrastar,
  sessões, catálogo, detalhe do edital verticalizado, importação. 3 E2E.

**Etapa D — Questões e desempenho: concluída (2026-10-28).**

- Schema `0002`: questions (catálogo + pessoais), question_options, question_attempts (append-only, idempotência por chave),
  question_notes, question_lists/items (favoritas), question_reports, review_items.
- 12 questões AUTORAIS de exemplo (`is_sample`) ligadas aos assuntos do TRT/FCC de exemplo.
- API: banco com filtros (disciplina, assunto, banca, ano, não respondidas, erradas, favoritas, lista), detalhe sem gabarito até
  responder, tentativa → revisão espaçada (core), classificação do erro, questão pessoal, cadastro rápido (sem copiar enunciado),
  anotação, favoritos, listas, reporte (só catálogo), revisões por bucket, caderno de erros, dashboard.
- Planejador agora usa desempenho real (`modules/questions/performance.ts`): acerto em 90 dias, perfil de erros e revisões
  vencidas por assunto. Métricas puras em `packages/core/src/metrics.ts` (constância, evolução semanal, piores assuntos).
- Web: Questões, resolução, registrar (rápido/completo), Revisões, Caderno de erros, Painel (Recharts, série única + tabela).
- Testes: core 40, API 68, E2E 3 (inclui responder → classificar erro → revisão → painel).

**Etapa E — Simulados, admin e LGPD: concluída (2026-10-28). MVP (critérios 1–10) completo.**

- Schema `0003`: mock_exams, mock_exam_questions, mock_exam_attempts (resultado em jsonb).
- Simulados (flag `mock_exams`): montagem proporcional ao nº de questões do edital, não respondidas primeiro, regra de pontuação
  do edital (Cebraspe), aplicação com tempo-limite e retomada, finalização idempotente (tentativas `simulado` → caderno e
  revisão), resultado por disciplina/assunto e recomendações.
- Admin: feature flags (auditadas), métricas agregadas anônimas. Moderação (editor/admin): reportes e correção/anulação de
  questões do catálogo, auditadas.
- LGPD: `GET /api/me/export` (JSON sem hash/tokens) e `DELETE /api/me` (e-mail + senha; exclusão física em cascata; auditoria,
  consentimentos e reportes ficam com `user_id` NULL). Exclusão é imediata (o plano previa soft delete + job; ver backlog).
- Testes: API 80, E2E 4.

**Etapa F — IA: concluída (2026-10-28).**

- Camada `apps/api/src/lib/ai/` (interface `AiProvider` + `AnthropicAiProvider`): `claude-opus-5-5`, structured outputs com Zod
  (`betaZodOutputFormat`), `fallbacks: "default"` (beta `server-side-fallback-2026-07-01`) e tratamento de `refusal`.
  Sem `ANTHROPIC_API_KEY` ou com a flag `ai` desligada, os recursos não existem (404) e a UI os esconde — nunca simulados.
- Recursos: proposta de edital a partir do texto do PDF (lido NO NAVEGADOR com `unpdf`; nada salvo sem confirmação humana),
  sugestão de assunto para questões próprias (o dono aplica), explicação após responder (cache em `ai_explanations`; sem
  evidência não é guardada). Prompts tratam conteúdo de documento como dado (ignora instruções embutidas); nenhum dado
  pessoal vai ao provedor.
- Controles: cota diária por usuário (`AI_DAILY_QUOTA`), rate limit 10/min por rota, `ai_interactions` (tokens, custo, status;
  sem conteúdo). Schema `0004`. `maxDuration = 300` na rota da API.
- Testes com provedor dublê injetado (8). API 88.

Próximos passos (Etapa G): fila de jobs no Postgres + Vercel Cron, provas anteriores (upload/importação, pipeline, revisão
humana), estatísticas banca × assunto, Raio-X da banca e incidência alimentando o planejador.

Pendências conhecidas: ver [docs/backlog.md](docs/backlog.md).
