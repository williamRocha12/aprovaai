# Notas legais (rascunho técnico — não substitui revisão jurídica)

## Conteúdo de provas

- Provas de concursos são publicadas pelos órgãos e bancas para conhecimento público, mas isso não autoriza qualquer uso.
  Por isso o AprovaAI: (1) sempre aponta para a fonte oficial; (2) credita a banca; (3) por padrão expõe só estatísticas
  derivadas (Raio-X) e não o texto integral; (4) liga o texto integral apenas por feature flag (`past_exam_full_text`),
  decisão que deve passar por análise jurídica antes de ser ativada em produção.
- Pedidos de remoção de conteúdo por titulares de direitos são atendidos por um editor/admin, que pode despublicar a prova.

## LGPD

- Base legal: execução de contrato (uso da plataforma) e consentimento para os termos, com versão registrada em `consents`.
- Direitos do titular implementados: acesso/portabilidade (`GET /api/me/export`) e eliminação (`DELETE /api/me`, imediata).
- Minimização: a IA recebe só dados de estudo (números do plano, texto de edital/questão), nunca nome, e-mail ou IP.
  `ai_interactions` guarda tokens e custo, não o conteúdo.
- Retenção: contas não verificadas há 30 dias, sessões expiradas, tentativas de login e registros de rate limit são apagados
  pela manutenção diária (job `maintenance_cleanup`). Logs de auditoria ficam com `user_id` nulo após a exclusão da conta.

## Pendências

- Termos de uso e política de privacidade definitivos (hoje são placeholders em `/termos` e `/privacidade`).
- Definir encarregado (DPO) e canal de contato.
