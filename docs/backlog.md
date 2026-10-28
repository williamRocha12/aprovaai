# Backlog

Itens conhecidos fora da etapa atual. Ao fechar um item, mova para o CLAUDE.md ("Status atual") ou apague.

## Segurança / hardening (Etapa I)

- [ ] CSP com nonce no Next (remover `'unsafe-inline'`)
- [ ] RLS no Postgres para tabelas privadas
- [ ] Avaliar hash do token de sessão no banco
- [ ] Sentry opcional por variável de ambiente
- [ ] Backup do banco (Neon: point-in-time restore + export periódico) e checklist de produção
- [ ] Rate limit geral com armazenamento compartilhado (hoje em memória por instância)

## Infra / DX

- [ ] OpenAPI das rotas do Better Auth (plugin `open-api`) no `/api/docs`
- [ ] Reenvio de verificação: o rate limit é por IP. Avaliar limite também por e-mail
- [ ] eslint-plugin-react ainda declara peer `eslint <=9`. Funciona com ESLint 10, mas acompanhar

## Produto

- [ ] Configurações: disponibilidade semanal padrão no perfil (campo já existe na API)
- [ ] Promover concurso privado do usuário ao catálogo (fluxo: usuário envia para revisão → editor promove, migrando a taxonomia privada)
- [ ] Importação de edital por CSV (hoje: JSON)
- [ ] Exclusão de conta com período de carência (soft delete + job); hoje é imediata
- [ ] OCR de provas escaneadas (hoje só PDFs com texto; o editor pode colar o texto manualmente)
