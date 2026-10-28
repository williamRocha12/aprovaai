# Decisões de arquitetura (ADRs curtos)

Formato: contexto → decisão → consequência. Mais recentes no fim. ADR substituído fica registrado com o motivo.

## ADR-001 — Monorepo com pnpm workspaces + Turborepo

- **Contexto:** web, API, jobs e regras de negócio compartilham tipos e schemas.
- **Decisão:** pnpm workspaces (já instalado, rápido no Windows) + Turborepo para cache de tarefas.
  Pacotes internos (`@aprovaai/*`) são TypeScript puro, sem build próprio (_just-in-time packages_).
  O Next transpila `@aprovaai/api`, `@aprovaai/db` e `@aprovaai/shared` (`transpilePackages`).
- **Consequência:** sem passo de build entre pacotes. Há um único artefato de deploy, o build do Next.

## ADR-002 — Drizzle ORM em vez de Prisma

- **Contexto:** precisamos de `CHECK`, índices parciais/funcionais e, no futuro, RLS.
- **Decisão:** Drizzle. É SQL-first e tipado, sem engine binária, e as migrations são SQL legível. Tem adapter oficial do Better Auth.
- **Consequência:** migrations geradas com `pnpm db:generate` e revisadas no PR.

## ADR-003 — Better Auth em vez de Auth.js

- **Contexto:** e-mail/senha com verificação, reset, sessões revogáveis, rate limit e OAuth opcional.
- **Decisão:** Better Auth montado dentro do Fastify (`/api/auth/*`), com o hash trocado para Argon2id.
- **Consequência:** não escrevemos criptografia. Regras próprias (aceite de termos, bloqueio por e-mail,
  conta desativada e auditoria) entram via `hooks` e `databaseHooks`.

## ADR-004 — Sessão em cookie opaco no banco, mesmo domínio

- **Contexto:** precisamos revogar sessões na hora e evitar cookie de terceiro.
- **Decisão:** o cookie é `httpOnly`, `SameSite=Lax` e `Secure` em produção, com sessão de 7 dias renovada no máximo 1x/dia.
  O navegador só conhece um domínio. Originalmente isso vinha de um rewrite do Next para uma API separada;
  desde o ADR-009, a API roda no mesmo projeto.
- **Consequência:** a revogação é imediata (logout global, desativação) e não precisamos de refresh token.
  O token da sessão **não rotaciona** a cada uso. Um token novo é emitido a cada login e na troca ou reset de senha (ver security.md).

## ADR-005 — Papel como coluna `users.role`

- **Decisão:** um papel por usuário (`user | editor | admin`). O papel e o status são lidos do banco a cada requisição.
- **Consequência:** mudança de papel ou desativação vale na hora. Se um dia houver múltiplos papéis, migrar para tabela.

## ADR-006 — TypeScript 6.0.x

- **Contexto:** o TypeScript 7 (nativo) já saiu, mas o `typescript-eslint` só aceita `<6.1`.
- **Decisão:** fixar `typescript@6.0.3`. Reavaliar quando o typescript-eslint suportar o 7.

## ADR-007 — IP do cliente só de header confiável

- **Contexto:** `X-Forwarded-For` enviado pelo cliente pode ser forjado e burlaria o rate limit.
  Na versão com rewrite do Next, descobrimos que o Next **repassa** esse header do cliente sem tratar.
- **Decisão:** `trustProxy: false` no Fastify. O IP vem apenas do header em `CLIENT_IP_HEADER`.
  Na Vercel o padrão é `x-real-ip`, definido pela borda da Vercel. Fora da Vercel, a variável é obrigatória em produção.
- **Consequência:** em dev todos caem no mesmo balde de rate limit (aceitável). Com o ADR-009, a API não fica mais exposta
  fora da borda da Vercel, e o risco de acesso direto com header forjado deixou de existir.

## ADR-008 — RLS do Postgres adiado para a Etapa I

- **Decisão:** a camada 1 de isolamento (repositórios com `userId` obrigatório + suíte de isolamento) é obrigatória desde já.
  O RLS (`SET LOCAL app.user_id` por transação) entra no hardening, quando houver tabelas privadas de domínio.

## ADR-009 — Tudo num único projeto Vercel (2026-10-27)

- **Contexto:** decisão de hospedar tudo na Vercel. O plano anterior usava web na Vercel e API + worker no Railway/Render.
- **Decisão:** a API Fastify vira biblioteca (`@aprovaai/api`) e roda dentro da rota catch-all
  `apps/web/src/app/api/[...path]/route.ts` (runtime Node.js) via `app.inject`, sem abrir porta.
  A instância fica em cache por processo (`getApi`), aproveitando o Fluid compute.
  Os Server Components chamam a API no mesmo processo. O banco é o Neon pelo Marketplace (região `sa-east-1`, functions em `gru1`),
  com `prepare: false` no postgres-js por causa do pooler. As migrations rodam no build (`vercel-build`) com a conexão direta.
- **Alternativas consideradas:** (a) dois projetos Vercel, web + API Fastify: manteria o rewrite e o problema do IP;
  (b) reescrever as rotas como Route Handlers do Next: perderia o Fastify, os schemas/OpenAPI e os testes com `inject`.
- **Consequência:** um deploy, um domínio, sem CORS real. Os testes de integração continuam iguais (`buildApp` + `inject`).
  Custos: cold start inicializa Fastify + Better Auth; o `@fastify/rate-limit` em memória vale por instância
  (o rate limit de auth fica no Postgres e é global); não há disco persistente (uploads no Vercel Blob).
  Docker Compose fica só para infra local (Postgres + Mailpit).

## ADR-010 — Jobs com tabela no Postgres + Vercel Cron (substitui pg-boss)

- **Contexto:** o pg-boss precisa de um processo de longa duração, que a Vercel não oferece.
- **Decisão (implementada na Etapa G):** tabela `jobs` (tipo, payload, status, tentativas, `run_after`, `dedupe_key` única).
  Uma rota `/api/cron/jobs` é disparada pelo Vercel Cron, autenticadas por `Authorization: Bearer $CRON_SECRET`,
  e processam lotes com `SELECT ... FOR UPDATE SKIP LOCKED` dentro de um orçamento de tempo menor que o `maxDuration`.
  Retry com backoff exponencial e idempotência por hash do documento.
  Ações disparadas pelo usuário ("rodar agora" no admin) só enfileiram, e o próprio request processa um lote curto.
- **Consequência:** sem infraestrutura extra. Processamentos longos (PDF grande) precisam ser divididos em etapas retomáveis.
  No plano Hobby, cada cron roda no máximo 1x/dia (ver deploy.md).

- **Como ficou:** o runner mora em `apps/api/src/lib/jobs.ts` (não há `apps/worker`): a mesma função atende o cron diário,
  o "rodar agora" do admin e o processamento imediato após a importação de uma prova.

## ADR-011 — Raio-X calculado na hora, sem tabela de estatísticas (2026-10-28)

- **Contexto:** o plano previa `board_topic_stats` pré-agregada por banca × assunto.
- **Decisão:** calcular o Raio-X a cada consulta a partir de `past_exam_questions` revisadas (função pura em
  `packages/core/src/board-stats.ts`). O volume esperado (dezenas de provas por banca) cabe numa consulta indexada.
- **Consequência:** nada a invalidar quando o editor revisa uma questão; o número exibido é sempre o atual. Se o volume crescer,
  materializar em tabela atualizada por job sem mudar a API. A incidência só alimenta o planejador com 3+ provas da banca,
  para não supervalorizar amostra pequena.

## ADR-012 — Vários concursos por usuário (2026-10-28)

- **Contexto:** o usuário quer estudar mais de um concurso e acompanhar cada um separadamente.
- **Decisão:** `user_exam_goals.status` (ativo/pausado/encerrado) no lugar de `is_active`; até 3 ativos; um objetivo aberto por
  edital. Ciclo, tarefas, horas e data da prova são por concurso. Questões, revisões espaçadas e caderno de erros continuam por
  usuário (acertar Português conta para todos). O concurso "em foco" nas telas é uma preferência em cookie; a API sempre
  recebe `goalId` e valida o dono (404 para concurso de outro usuário).
- **Consequência:** cada concurso tem sua própria disponibilidade semanal; a tela Meus concursos avisa a soma das horas. Não
  há rateio automático de tempo entre concursos (backlog, se fizer falta).

## ADR-013 — Radar de editais com confirmação humana (2026-10-28)

- **Contexto:** a lista de concursos abertos precisa de dados reais, mas não podemos copiar agregadores (termos de uso,
  ver docs/sources.md) nem mostrar dado não verificado como certo.
- **Decisão:** conectores só para fontes oficiais/abertas (Querido Diário, DOU/INLABS). Pipeline: coleta diária → documento
  (só trechos, dedupe por hash) → filtro por palavras-chave → extração (IA opcional, senão regras) → fila do editor. Só a
  confirmação do editor (com declaração de que conferiu a fonte) cria o concurso no catálogo, já com situação confirmada.
- **Consequência:** a cobertura cresce por fonte, não é instantânea como num agregador. Concursos confirmados entram sem
  conteúdo programático; o editor completa pelo importador (IA opcional a partir do PDF).
