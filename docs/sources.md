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

## Radar de editais (Etapa H, planejado)

Fontes previstas, sempre respeitando `robots.txt`, termos de uso e limites de requisição:

- **Querido Diário** (API pública da Open Knowledge Brasil) — diários oficiais municipais.
- **INLABS / Imprensa Nacional** — Diário Oficial da União (exige cadastro gratuito; credenciais por variável de ambiente).
- Páginas públicas de concursos das bancas, só quando os termos permitirem.

Toda detecção do radar entra como "não confirmada" até um editor conferir na fonte oficial.
