# Backlog

Itens conhecidos fora da etapa atual. Ao fechar um item, mova para o CLAUDE.md ("Status atual") ou apague.

## Etapa C (próxima)

- [ ] `packages/core`: prioridade, fases, geração determinística do ciclo, redistribuição, conflitos (com testes de borda)
- [ ] Schema do catálogo: boards, organizations, exams, exam_positions, exam_notices, scoring_rules, subjects, topics, notice_subjects, notice_topics, source_references
- [ ] Seed de exemplo TRT/FCC marcado `is_sample` + comando para remover
- [ ] CRUD do editor + importação JSON/CSV de edital
- [ ] Onboarding, "O que estudar agora" (cronômetro), calendário semanal com arrastar, sessões de estudo
- [ ] Após o login, redirecionar para o onboarding/dashboard (hoje vai para /conta)

## Segurança / hardening (Etapa I)

- [ ] CSP com nonce no Next (remover `'unsafe-inline'`)
- [ ] RLS no Postgres para tabelas privadas
- [ ] Avaliar hash do token de sessão no banco
- [ ] Sentry opcional por variável de ambiente
- [ ] Backup do banco (Neon: point-in-time restore + export periódico) e checklist de produção
- [ ] Rate limit geral com armazenamento compartilhado (hoje em memória por instância)

## Infra / DX

- [ ] Job de limpeza: sessões expiradas, `login_attempts`, `rate_limits`, contas não verificadas há 30 dias (cron, Etapa G)
- [ ] OpenAPI das rotas do Better Auth (plugin `open-api`) no `/api/docs`
- [ ] Reenvio de verificação: o rate limit é por IP. Avaliar limite também por e-mail
- [ ] eslint-plugin-react ainda declara peer `eslint <=9`. Funciona com ESLint 10, mas acompanhar

## Produto

- [ ] Configurações: disponibilidade semanal padrão no perfil (campo já existe na API)
- [ ] LGPD: exportar dados e excluir conta (Etapa E)
