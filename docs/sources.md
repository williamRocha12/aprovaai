# Fontes de dados

O AprovaAI só usa conteúdo de fontes oficiais ou produzido pela própria plataforma. Esta página registra de onde vem cada dado
e o que **não** fazemos.

## O que usamos

| Dado                                   | Fonte                                          | Como entra                                                                                                                                   |
| -------------------------------------- | ---------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| Editais (disciplinas, assuntos, pesos) | PDF oficial publicado pelo órgão ou pela banca | Editor ou usuário cola/importa o texto; IA opcional propõe a estrutura e um humano revisa antes de salvar                                    |
| Provas anteriores e gabaritos          | PDF oficial da banca ou do órgão               | Editor importa o texto e informa a URL da fonte (obrigatória); a leitura automática separa questões e gabarito; um editor revisa os assuntos |
| Questões de exemplo                    | Autorais (escritas para o projeto)             | Seed `pnpm db:sample`, marcadas como exemplo                                                                                                 |
| Questões do usuário                    | O próprio usuário                              | Cadastro manual; ficam privadas                                                                                                              |

Toda prova anterior guarda `source_url` (e `answer_key_url`, quando houver) e exibe o crédito à banca. O texto integral só
aparece para usuários com a flag `past_exam_full_text` ligada; por padrão o usuário vê as estatísticas e o link oficial.

## O que não fazemos

- Não coletamos dados de agregadores de questões (QConcursos, TEC Concursos e similares) nem de sites de cursinhos.
- Não contornamos login, paywall, captcha ou limites de acesso de nenhum site.
- Não mostramos data ou situação de concurso como confirmada sem fonte oficial (`situationConfirmed`/`datesConfirmed`).
- Não calculamos "probabilidade de aprovação".

## Radar de editais (implementado)

| Fonte                                      | Como acessamos                                                                                                                                                    | Situação                                                                                                                                                  |
| ------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Querido Diário** (Open Knowledge Brasil) | API pública `GET /gazettes` com busca textual do dia; guardamos só os trechos (excerpts)                                                                          | Ativo por padrão. Em 2026-10-28 a API recusava conexões TLS; o radar registra o erro e tenta de novo no dia seguinte.                                     |
| **DOU — leitura pública** (in.gov.br)      | Página pública do dia da Seção 3 (`/leiturajornal`, JSON embutido); só as matérias candidatas têm o texto aberto, com pausa e teto de 30/dia. robots.txt permite. | Ativo, sem login. Matérias cujo texto completo não é abertura (resultado, convocação, com nomes de candidatos) são descartadas antes de salvar.           |
| **DOU via INLABS** (Imprensa Nacional)     | Login gratuito; ZIP diário da Seção 3 em XML; só matérias com "concurso" e "edital"                                                                               | Desativado até configurar `INLABS_EMAIL`/`INLABS_PASSWORD`. O leitor do XML segue o formato público do INLABS e precisa ser validado com uma edição real. |
| DOE/SC e demais diários estaduais          | —                                                                                                                                                                 | Planejado (um conector por estado).                                                                                                                       |
| Páginas das bancas                         | —                                                                                                                                                                 | Só depois de revisar termos de uso e robots.txt de cada banca.                                                                                            |

Regras do radar: requisições identificadas (User-Agent do AprovaAI), limite de páginas por dia, nenhum login contornado,
nenhum dado pessoal coletado. Toda detecção entra como "não confirmada" e só aparece para os usuários depois que um editor
confere na publicação oficial (ADR-013).
