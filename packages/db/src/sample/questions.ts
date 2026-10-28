// Questões AUTORAIS de exemplo (escritas para o AprovaAI, não copiadas de provas ou plataformas).
// Servem para testar resolução, caderno de erros e revisão; marcadas is_sample e removíveis.

export interface SampleQuestion {
  subject: string;
  topic: string;
  type: "multipla_escolha" | "certo_errado";
  statement: string;
  options?: { label: string; text: string }[];
  correctAnswer: string;
  explanation: string;
  difficulty: number;
}

export const SAMPLE_QUESTIONS: SampleQuestion[] = [
  {
    subject: "Língua Portuguesa",
    topic: "Regência e crase",
    type: "certo_errado",
    statement: 'Na frase "Entregou o relatório à diretora", o acento grave está correto.',
    correctAnswer: "C",
    explanation: '"Entregar" pede a preposição "a" e "diretora" admite o artigo "a": a + a = à.',
    difficulty: 2,
  },
  {
    subject: "Língua Portuguesa",
    topic: "Regência e crase",
    type: "certo_errado",
    statement: 'Em "Começou à estudar cedo", o acento grave está correto.',
    correctAnswer: "E",
    explanation: 'Não há crase antes de verbo: o certo é "começou a estudar".',
    difficulty: 1,
  },
  {
    subject: "Língua Portuguesa",
    topic: "Concordância verbal e nominal",
    type: "multipla_escolha",
    statement: "Assinale a frase com concordância verbal correta.",
    options: [
      { label: "A", text: "Fazem dois anos que estudo para concursos." },
      { label: "B", text: "Houveram muitas inscrições no último edital." },
      { label: "C", text: "Faz dois anos que estudo para concursos." },
      { label: "D", text: "Existe muitas vagas previstas." },
    ],
    correctAnswer: "C",
    explanation: '"Fazer" indicando tempo decorrido é impessoal: fica no singular ("faz dois anos").',
    difficulty: 2,
  },
  {
    subject: "Raciocínio Lógico-Matemático",
    topic: "Equivalências e negações",
    type: "multipla_escolha",
    statement: 'A negação de "Todo servidor é concursado" é:',
    options: [
      { label: "A", text: "Nenhum servidor é concursado." },
      { label: "B", text: "Algum servidor não é concursado." },
      { label: "C", text: "Todo servidor não é concursado." },
      { label: "D", text: "Algum servidor é concursado." },
    ],
    correctAnswer: "B",
    explanation: '"Todo A é B" é negado por "algum A não é B".',
    difficulty: 2,
  },
  {
    subject: "Raciocínio Lógico-Matemático",
    topic: "Porcentagem e proporcionalidade",
    type: "multipla_escolha",
    statement: "Um salário de R$ 2.000,00 teve aumento de 10% e, depois, redução de 10%. O valor final é:",
    options: [
      { label: "A", text: "R$ 2.000,00" },
      { label: "B", text: "R$ 1.980,00" },
      { label: "C", text: "R$ 2.020,00" },
      { label: "D", text: "R$ 1.800,00" },
    ],
    correctAnswer: "B",
    explanation: "2.000 × 1,1 = 2.200; 2.200 × 0,9 = 1.980.",
    difficulty: 2,
  },
  {
    subject: "Direito Constitucional",
    topic: "Direitos e garantias fundamentais",
    type: "certo_errado",
    statement:
      "O habeas data é o remédio constitucional adequado para assegurar o conhecimento de informações pessoais constantes de bancos de dados de entidades governamentais.",
    correctAnswer: "C",
    explanation: "É exatamente a finalidade do habeas data (CF, art. 5º, LXXII).",
    difficulty: 2,
  },
  {
    subject: "Direito Constitucional",
    topic: "Administração Pública na Constituição",
    type: "certo_errado",
    statement:
      "A investidura em cargo efetivo depende de aprovação prévia em concurso público, salvo para cargos em comissão de livre nomeação e exoneração.",
    correctAnswer: "C",
    explanation: "Regra do concurso público com a ressalva dos cargos em comissão (CF, art. 37, II).",
    difficulty: 1,
  },
  {
    subject: "Direito Administrativo",
    topic: "Atos administrativos",
    type: "multipla_escolha",
    statement:
      "O atributo do ato administrativo que permite à Administração executá-lo diretamente, sem ordem judicial, é a:",
    options: [
      { label: "A", text: "presunção de legitimidade" },
      { label: "B", text: "autoexecutoriedade" },
      { label: "C", text: "tipicidade" },
      { label: "D", text: "imperatividade" },
    ],
    correctAnswer: "B",
    explanation: "Autoexecutoriedade é a execução direta pela própria Administração.",
    difficulty: 3,
  },
  {
    subject: "Direito Administrativo",
    topic: "Agentes públicos (Lei 8.112/1990)",
    type: "certo_errado",
    statement:
      "Segundo a Lei 8.112/1990, o servidor estável só perde o cargo por decisão judicial transitada em julgado.",
    correctAnswer: "E",
    explanation:
      "Também perde mediante processo administrativo disciplinar com ampla defesa (e avaliação de desempenho, na forma da CF).",
    difficulty: 3,
  },
  {
    subject: "Direito do Trabalho",
    topic: "Férias",
    type: "certo_errado",
    statement: "Após cada período de 12 meses de vigência do contrato, o empregado tem direito a férias.",
    correctAnswer: "C",
    explanation: "É o período aquisitivo de férias previsto na CLT.",
    difficulty: 1,
  },
  {
    subject: "Direito Processual do Trabalho",
    topic: "Recursos trabalhistas",
    type: "multipla_escolha",
    statement: "No processo do trabalho, o prazo geral para interposição do recurso ordinário é de:",
    options: [
      { label: "A", text: "5 dias" },
      { label: "B", text: "8 dias" },
      { label: "C", text: "10 dias" },
      { label: "D", text: "15 dias" },
    ],
    correctAnswer: "B",
    explanation: "Os recursos trabalhistas em geral têm prazo de 8 dias.",
    difficulty: 2,
  },
  {
    subject: "Direito Civil",
    topic: "Prescrição e decadência",
    type: "certo_errado",
    statement: "A prescrição atinge a pretensão, enquanto a decadência atinge o próprio direito potestativo.",
    correctAnswer: "C",
    explanation: "Distinção clássica: prescrição extingue a pretensão; decadência, o direito.",
    difficulty: 3,
  },
];
