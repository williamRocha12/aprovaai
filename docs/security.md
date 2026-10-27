# Segurança

O que está implementado, onde fica no código e o que ainda falta. Atualize ao mudar qualquer item.

## Autenticação

| Controle              | Implementação                                                                                                                  |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| Hash de senha         | Argon2id, 19 MiB / 2 iterações (OWASP). `apps/api/src/auth/password.ts`                                                        |
| Política de senha     | 10–128 caracteres, letras e números (`packages/shared/src/auth.ts`). O limite máximo evita DoS no hash                         |
| Verificação de e-mail | Obrigatória para logar. Link assinado, 24 h                                                                                    |
| Reset de senha        | Token de uso único, 30 min. Revoga todas as sessões. Resposta idêntica para e-mail inexistente                                 |
| Enumeração de contas  | Cadastro, login e reset respondem igual para e-mails existentes e inexistentes (testado)                                       |
| Bloqueio de login     | 5 falhas em 15 min → 15 min bloqueado, por HMAC do e-mail. Vale para e-mails inexistentes. `auth/lockout.ts`                   |
| Rate limit            | Better Auth por rota (login 10/min, cadastro 5/min, reset 3/min) + 300/min geral por IP (em memória, por instância serverless) |
| Sessão                | Cookie `aprovaai.session_token` httpOnly, SameSite=Lax, Secure em produção. 7 dias, renovação diária                           |
| Logout global         | `POST /api/auth/revoke-sessions`                                                                                               |
| Conta desativada      | Não cria sessão nova. Sessões existentes são apagadas e o papel/status é relido a cada requisição                              |

## Autorização

- RBAC no backend: `requireAuth` / `requireRole` (`apps/api/src/plugins/auth-context.ts`).
- Dado privado: repositórios recebem `userId` obrigatório. Recurso de outro usuário → 404.
- Testes: `apps/api/test/rbac.test.ts` e `apps/api/test/isolation.test.ts` (todo recurso privado novo entra lá).
- Admin não altera o próprio papel nem se desativa. O último admin ativo não pode ser desativado.

## Proteções HTTP

- **CSRF:** SameSite=Lax + checagem de `Origin` em todo método não-GET (Better Auth nas rotas dele, hook próprio nas demais) + só JSON.
- **CORS:** só `APP_URL` + `TRUSTED_ORIGINS`.
- **Headers:** API com helmet (CSP `default-src 'none'`, HSTS em produção). Web com CSP, `X-Frame-Options: DENY`,
  nosniff, Referrer-Policy e Permissions-Policy (`apps/web/next.config.ts`).
- **Validação:** toda entrada passa por Zod. Queries via Drizzle (parametrizadas). Busca com `ILIKE` escapa curingas.
- **Body limit:** 1 MiB.

## Logs e auditoria

- pino com `redact` de cookie, authorization, set-cookie, senhas e tokens. A URL é logada **sem query string** (links de verificação/reset).
- `audit_logs`: cadastro, login, falha, bloqueio, logout, logout global, verificação, pedido de reset, reset, troca de senha,
  mudança de papel e de status. `metadata` sem PII. `actor_user_id` vira NULL na exclusão de conta.

## Retenção (proposta, revisar com jurídico)

| Dado                            | Retenção                                                          |
| ------------------------------- | ----------------------------------------------------------------- |
| Sessões expiradas               | Removidas pelo Better Auth ao expirar. Job de limpeza na Etapa G  |
| `login_attempts`, `rate_limits` | Efêmeros. Limpeza periódica (Etapa G)                             |
| `audit_logs`                    | 2 anos, anonimizados na exclusão de conta                         |
| `consents`                      | Enquanto a conta existir + 5 anos (prova de aceite), anonimizados |
| Contas não verificadas          | Remover após 30 dias (job, Etapa G)                               |

## Limitações conhecidas / próximos passos

- **IP do cliente:** só vem de `CLIENT_IP_HEADER` (na Vercel, `x-real-ip`, definido pela borda e não forjável pelo cliente).
  Fora da Vercel, configure o header da sua borda confiável.
- **Rate limit geral** (`@fastify/rate-limit`) fica em memória e vale por instância de function. O limite de auth
  (Better Auth, tabela `rate_limits`) e o bloqueio por e-mail (`login_attempts`) ficam no Postgres e valem globalmente.
  Avaliar armazenamento compartilhado (Postgres ou Upstash via Marketplace) se houver abuso nas rotas de domínio.
- **Token de sessão em claro no banco** (padrão do Better Auth). Mitigação: banco não exposto, backup criptografado. Avaliar armazenamento com hash.
- O token da sessão não rotaciona a cada uso, só a cada login, reset ou troca de senha.
- `list-sessions` devolve tokens ao JS da própria conta (padrão do Better Auth). Um XSS já teria acesso à sessão de qualquer forma.
  A CSP com nonce (Etapa I) reduz esse risco.
- CSP do web ainda usa `'unsafe-inline'` em scripts (exigência do Next sem nonce).
- RLS no Postgres: Etapa I (ADR-008).
- Exportação e exclusão de conta (LGPD): Etapa E.
