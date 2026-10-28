// Regras do plano: monta a entrada do motor (packages/core), persiste ciclos sem apagar histórico
// e aplica as ações do usuário (concluir, pular, reagendar, registrar sessão).
import { createHash } from "node:crypto";
import {
  generateCycle,
  todayIn,
  weekdayOf,
  addDays,
  daysBetween,
  type CarryOverTask,
  type ErrorType,
  type PlanMessage,
  type PlannerInput,
  type PlannerTopic,
} from "@aprovaai/core";
import { studyCycles, studySessions, studyTasks, userExamGoals, userTopicStates } from "@aprovaai/db";
import {
  MAX_ACTIVE_GOALS,
  type Cycle,
  type Goal,
  type GoalInput,
  type GoalStatus,
  type GoalSummary,
  type StudySession,
  type Task,
} from "@aprovaai/shared";
import { and, eq, inArray } from "drizzle-orm";
import { AppError, conflict, notFound } from "../../lib/errors";
import type { CurrentUser } from "../../plugins/auth-context";
import { CatalogRepository } from "../catalog/repository";
import { PlanRepository, type CycleRow, type GoalWithExam } from "./repository";

type Transaction = Parameters<Parameters<PlanRepository["db"]["transaction"]>[0]>[0];

/** Desempenho por assunto do edital (vem das questões e revisões; Etapa D). */
export interface TopicPerformance {
  attempts: number;
  correct: number;
  errorCounts: Partial<Record<ErrorType, number>>;
  overdueReviews: number;
}
export type PerformanceProvider = (
  userId: string,
  topicIds: string[],
  today: string,
) => Promise<Map<string, TopicPerformance>>;
/** Incidência do assunto nas provas da banca (Raio-X; Etapa G). */
export type IncidenceProvider = (goal: GoalWithExam, topicIds: string[]) => Promise<Map<string, number>>;

const noPerformance: PerformanceProvider = async () => new Map();
const noIncidence: IncidenceProvider = async () => new Map();

export type PlanState = { cycle: Cycle | null; issues: PlanMessage<string>[] };

const COVERING_TYPES = new Set(["teoria", "questoes", "lei_seca", "analise_erros"]);

function badRequest(message: string): AppError {
  return new AppError(400, "VALIDATION_ERROR", message);
}

export class PlanService {
  readonly repo: PlanRepository;
  private readonly catalog: CatalogRepository;

  constructor(
    db: PlanRepository["db"],
    private readonly performance: PerformanceProvider = noPerformance,
    private readonly incidence: IncidenceProvider = noIncidence,
  ) {
    this.repo = new PlanRepository(db);
    this.catalog = new CatalogRepository(db);
  }

  private get db() {
    return this.repo.db;
  }

  today(user: CurrentUser): string {
    return todayIn(user.timezone);
  }

  // ---------- Objetivos (cada concurso que o usuário estuda) ----------

  async goal(user: CurrentUser, goalId: string): Promise<Goal | null> {
    const goal = await this.repo.goalWithExam(user.id, goalId);
    if (!goal) return null;
    const states = await this.repo.topicStates(user.id, goal.id);
    const subjects = new Map<string, Goal["subjects"][number]>();
    for (const s of states) {
      const current = subjects.get(s.noticeSubjectId);
      if (!current) {
        subjects.set(s.noticeSubjectId, {
          noticeSubjectId: s.noticeSubjectId,
          name: s.subjectName,
          active: s.isActive,
          selfAssessment: s.selfAssessment,
        });
      } else if (s.isActive) current.active = true;
    }
    return {
      id: goal.id,
      status: goal.status,
      examId: goal.examId,
      examTitle: goal.examTitle,
      noticeId: goal.noticeId,
      positionId: goal.positionId,
      targetExamDate: goal.targetExamDate,
      weeklyAvailability: goal.weeklyAvailability,
      blockMinutes: goal.blockMinutes,
      priorityWeights: goal.priorityWeights ?? null,
      reviewIntervals: goal.reviewIntervals,
      subjects: [...subjects.values()],
    };
  }

  /** Cartões de "Meus concursos": progresso de cada concurso calculado dos registros do usuário. */
  async listGoals(user: CurrentUser): Promise<GoalSummary[]> {
    const today = this.today(user);
    const goals = await this.repo.listGoals(user.id);
    return Promise.all(
      goals.map(async (goal) => {
        const [states, cycle] = await Promise.all([
          this.repo.topicStates(user.id, goal.id),
          goal.status === "ativo" ? this.repo.activeCycle(user.id, goal.id) : Promise.resolve(null),
        ]);
        const tasks = cycle ? (await this.repo.cycleTasks(user.id, cycle.id)).map((r) => r.task) : [];
        const active = states.filter((s) => s.isActive);
        const examDate = this.examDateOf(goal);
        return {
          id: goal.id,
          status: goal.status,
          examId: goal.examId,
          examTitle: goal.examTitle,
          organization: goal.organization,
          board: goal.board,
          uf: goal.uf,
          isSample: goal.isSample,
          examDate,
          daysToExam: examDate ? daysBetween(today, examDate) : null,
          weeklyMinutes: Object.values(goal.weeklyAvailability).reduce((a, b) => a + b, 0),
          week: {
            plannedMinutes: tasks.reduce((sum, t) => sum + t.durationMin, 0),
            completedMinutes: tasks
              .filter((t) => t.status === "concluida")
              .reduce((sum, t) => sum + t.durationMin, 0),
          },
          coverage: { covered: active.filter((s) => s.status === "coberto").length, total: active.length },
          pendingToday: tasks.filter(
            (t) => t.suggestedDate <= today && (t.status === "pendente" || t.status === "em_andamento"),
          ).length,
          createdAt: goal.createdAt.toISOString(),
        };
      }),
    );
  }

  private async validateGoalInput(user: CurrentUser, input: GoalInput) {
    const notice = await this.catalog.findVisibleNotice(user, input.examId, input.noticeId);
    if (!notice) throw notFound("Concurso ou edital não encontrado.");
    const structure = await this.repo.noticeStructure(input.noticeId);
    const validSubjects = new Set(structure.map((s) => s.noticeSubjectId));
    for (const s of input.subjects) {
      if (!validSubjects.has(s.noticeSubjectId)) throw badRequest("Disciplina não pertence a este edital.");
    }
    if (!input.subjects.some((s) => s.active)) throw badRequest("Ative ao menos uma disciplina.");
    return structure;
  }

  private goalValues(input: GoalInput) {
    return {
      examId: input.examId,
      noticeId: input.noticeId,
      positionId: input.positionId ?? null,
      targetExamDate: input.targetExamDate ?? null,
      weeklyAvailability: input.weeklyAvailability,
      blockMinutes: input.blockMinutes,
      priorityWeights: input.priorityWeights ?? null,
      ...(input.reviewIntervals ? { reviewIntervals: input.reviewIntervals } : {}),
    };
  }

  /** Adiciona um concurso aos estudos do usuário e gera o primeiro ciclo dele. */
  async createGoal(user: CurrentUser, input: GoalInput): Promise<PlanState & { goalId: string }> {
    const structure = await this.validateGoalInput(user, input);
    if (await this.repo.openGoalForNotice(user.id, input.noticeId)) {
      throw conflict("Você já estuda este concurso. Abra-o em Meus concursos para editar o plano.");
    }
    if ((await this.repo.countActiveGoals(user.id)) >= MAX_ACTIVE_GOALS) {
      throw conflict(
        `Você já tem ${MAX_ACTIVE_GOALS} concursos ativos. Pause ou encerre um deles para adicionar outro.`,
      );
    }

    let goalId = "";
    try {
      await this.db.transaction(async (tx) => {
        const [created] = await tx
          .insert(userExamGoals)
          .values({ userId: user.id, ...this.goalValues(input) })
          .returning({ id: userExamGoals.id });
        if (!created) throw new Error("Falha ao criar objetivo.");
        goalId = created.id;
        await tx
          .insert(userTopicStates)
          .values(structure.map((s) => ({ userId: user.id, goalId, noticeTopicId: s.noticeTopicId })))
          .onConflictDoNothing();
        await this.applySubjects(tx, user.id, goalId, structure, input);
      });
    } catch (err) {
      // Duas requisições simultâneas para o mesmo edital: o índice único barra a segunda.
      if (isUniqueViolation(err)) throw conflict("Você já estuda este concurso.");
      throw err;
    }
    return { goalId, ...(await this.regenerate(user, goalId, "replace")) };
  }

  /** Atualiza as configurações do plano de um concurso (mesmo edital) e recalcula o ciclo. */
  async updateGoal(user: CurrentUser, goalId: string, input: GoalInput): Promise<PlanState> {
    const goal = await this.repo.goalById(user.id, goalId);
    if (!goal || goal.status === "encerrado") throw notFound("Concurso não encontrado nos seus estudos.");
    if (goal.noticeId !== input.noticeId || goal.examId !== input.examId) {
      throw badRequest("Para estudar outro edital, adicione um novo concurso.");
    }
    const structure = await this.validateGoalInput(user, input);
    await this.db.transaction(async (tx) => {
      await tx
        .update(userExamGoals)
        .set(this.goalValues(input))
        .where(and(eq(userExamGoals.id, goalId), eq(userExamGoals.userId, user.id)));
      await this.applySubjects(tx, user.id, goalId, structure, input);
    });
    if (goal.status !== "ativo") return { cycle: null, issues: [] };
    return this.regenerate(user, goalId, "replace");
  }

  /** Pausar ou encerrar fecha o ciclo (pendências viram histórico); reativar gera um ciclo novo. */
  async setGoalStatus(user: CurrentUser, goalId: string, status: GoalStatus): Promise<GoalSummary> {
    const goal = await this.repo.goalById(user.id, goalId);
    if (!goal) throw notFound("Concurso não encontrado nos seus estudos.");
    if (goal.status === "encerrado" && status !== "encerrado") {
      if (await this.repo.openGoalForNotice(user.id, goal.noticeId)) {
        throw conflict("Você já estuda este concurso em outro plano aberto.");
      }
    }
    if (status === "ativo" && goal.status !== "ativo") {
      if ((await this.repo.countActiveGoals(user.id, goalId)) >= MAX_ACTIVE_GOALS) {
        throw conflict(`Você já tem ${MAX_ACTIVE_GOALS} concursos ativos. Pause um deles antes.`);
      }
    }
    if (status !== goal.status) {
      await this.db.transaction(async (tx) => {
        await tx
          .update(userExamGoals)
          .set({ status })
          .where(and(eq(userExamGoals.id, goalId), eq(userExamGoals.userId, user.id)));
        if (status !== "ativo") await this.closeActiveCycle(tx, user.id, goalId);
      });
      if (status === "ativo") await this.regenerate(user, goalId, "replace");
    }
    const summary = (await this.listGoals(user)).find((g) => g.id === goalId);
    if (!summary) throw notFound();
    return summary;
  }

  /** Ativação e autoavaliação por disciplina (aplicada a todos os assuntos dela). */
  private async applySubjects(
    tx: Transaction,
    userId: string,
    goalId: string,
    structure: { noticeSubjectId: string; noticeTopicId: string }[],
    input: GoalInput,
  ): Promise<void> {
    for (const subject of input.subjects) {
      const topicIds = structure
        .filter((s) => s.noticeSubjectId === subject.noticeSubjectId)
        .map((s) => s.noticeTopicId);
      if (topicIds.length === 0) continue;
      await tx
        .update(userTopicStates)
        .set({ isActive: subject.active, selfAssessment: subject.selfAssessment })
        .where(
          and(
            eq(userTopicStates.userId, userId),
            eq(userTopicStates.goalId, goalId),
            inArray(userTopicStates.noticeTopicId, topicIds),
          ),
        );
    }
  }

  // ---------- Ciclo ----------

  /** Ciclo atual do concurso. Se venceu, gera o próximo levando as pendências (o que não cabe vira conflito). */
  async current(user: CurrentUser, goalId?: string): Promise<PlanState> {
    const goal = await this.repo.activeGoal(user.id, goalId);
    if (!goal) {
      if (goalId) throw notFound("Concurso não encontrado nos seus estudos.");
      return { cycle: null, issues: [] };
    }
    if (goal.status !== "ativo") {
      return {
        cycle: null,
        issues: [
          { code: "GOAL_PAUSED", message: "Este concurso está pausado. Reative-o para gerar o ciclo." },
        ],
      };
    }
    const active = await this.repo.activeCycle(user.id, goal.id);
    if (active && active.endDate >= this.today(user))
      return { cycle: await this.toDto(user, goal, active), issues: [] };
    return this.regenerate(user, goal.id, active ? "rollover" : "replace");
  }

  /**
   * Recalcula o ciclo. "replace": nova distribuição a partir do estado atual (ex.: mudou a configuração).
   * "rollover": ciclo venceu; pendências entram primeiro no novo ciclo. Em ambos, tarefas concluídas
   * e puladas ficam intactas; só as pendentes do ciclo anterior viram "cancelada" (histórico preservado).
   */
  async regenerate(user: CurrentUser, goalId: string, mode: "replace" | "rollover"): Promise<PlanState> {
    const goal = await this.repo.activeGoal(user.id, goalId);
    if (!goal) throw notFound("Concurso não encontrado nos seus estudos.");
    if (goal.status !== "ativo") throw conflict("Este concurso está pausado. Reative-o para gerar o ciclo.");
    const today = this.today(user);
    const states = (await this.repo.topicStates(user.id, goal.id)).filter((s) => s.isActive);
    const previous = await this.repo.activeCycle(user.id, goal.id);

    let carryOver: CarryOverTask[] = [];
    if (mode === "rollover" && previous) {
      const pending = (await this.repo.cycleTasks(user.id, previous.id))
        .map((r) => r.task)
        .filter(
          (t) =>
            (t.status === "pendente" || t.status === "em_andamento") &&
            t.noticeTopicId &&
            t.type !== "simulado",
        );
      carryOver = pending.map((t) => ({ topicId: t.noticeTopicId as string, type: t.type }));
    }

    const input = await this.buildInput(user, goal, states, today, carryOver);
    const result = generateCycle(input);
    if (!result.ok)
      return { cycle: previous ? await this.toDto(user, goal, previous) : null, issues: result.issues };

    const inputHash = createHash("sha256").update(JSON.stringify(input)).digest("hex");
    const number = await this.repo.nextCycleNumber(user.id, goal.id);

    try {
      const created = await this.db.transaction(async (tx) => {
        const closedId = await this.closeActiveCycle(tx, user.id, goal.id);
        const [cycle] = await tx
          .insert(studyCycles)
          .values({
            userId: user.id,
            goalId: goal.id,
            number,
            phase: result.phase,
            startDate: result.startDate,
            endDate: result.endDate,
            status: "ativo",
            inputHash,
            conflicts: result.conflicts,
            warnings: result.warnings,
          })
          .returning();
        if (!cycle) throw new Error("Falha ao criar ciclo.");
        if (closedId) {
          await tx
            .update(studyTasks)
            .set({ supersededByCycleId: cycle.id })
            .where(and(eq(studyTasks.cycleId, closedId), eq(studyTasks.status, "cancelada")));
        }
        if (result.tasks.length > 0) {
          await tx.insert(studyTasks).values(
            result.tasks.map((t) => ({
              userId: user.id,
              goalId: goal.id,
              cycleId: cycle.id,
              noticeTopicId: t.topicId,
              type: t.type,
              suggestedDate: t.date,
              orderIndex: t.order,
              durationMin: t.durationMin,
              priority: t.priority,
              justification: t.justification,
            })),
          );
        }
        return cycle;
      });
      return { cycle: await this.toDto(user, goal, created), issues: [] };
    } catch (err) {
      // Outro request gerou o ciclo ao mesmo tempo (índice: um ciclo ativo por objetivo): usa o dele.
      if (!isUniqueViolation(err)) throw err;
      const active = await this.repo.activeCycle(user.id, goal.id);
      return { cycle: active ? await this.toDto(user, goal, active) : null, issues: [] };
    }
  }

  /** Encerra o ciclo ativo: pendentes viram "cancelada"; concluídas/puladas ficam como estão. */
  private async closeActiveCycle(tx: Transaction, userId: string, goalId: string): Promise<string | null> {
    const [active] = await tx
      .update(studyCycles)
      .set({ status: "encerrado" })
      .where(
        and(eq(studyCycles.userId, userId), eq(studyCycles.goalId, goalId), eq(studyCycles.status, "ativo")),
      )
      .returning({ id: studyCycles.id });
    if (!active) return null;
    await tx
      .update(studyTasks)
      .set({ status: "cancelada" })
      .where(
        and(eq(studyTasks.cycleId, active.id), inArray(studyTasks.status, ["pendente", "em_andamento"])),
      );
    return active.id;
  }

  private examDateOf(goal: GoalWithExam): string | null {
    return goal.targetExamDate ?? (goal.datesConfirmed ? goal.catalogExamDate : null);
  }

  private async buildInput(
    user: CurrentUser,
    goal: GoalWithExam,
    states: Awaited<ReturnType<PlanRepository["topicStates"]>>,
    today: string,
    carryOver: CarryOverTask[],
  ): Promise<PlannerInput> {
    const ids = states.map((s) => s.noticeTopicId);
    const [performance, incidence] = await Promise.all([
      this.performance(user.id, ids, today),
      this.incidence(goal, ids),
    ]);

    // Minutos de tarefas já concluídas hoje (não podem ser ocupados de novo).
    const completed = await this.repo.completedTasksBetween(
      user.id,
      goal.id,
      new Date(Date.now() - 2 * 86_400_000),
    );
    const usedMinutesByDate: Record<string, number> = {};
    for (const task of completed) {
      if (!task.completedAt) continue;
      const day = todayIn(user.timezone, task.completedAt);
      if (day >= today) usedMinutesByDate[day] = (usedMinutesByDate[day] ?? 0) + task.durationMin;
    }

    const topics: PlannerTopic[] = states.map((s) => {
      const perf = performance.get(s.noticeTopicId);
      return {
        id: s.noticeTopicId,
        subjectId: s.noticeSubjectId,
        subjectName: s.subjectName,
        topicName: s.topicName,
        subjectWeight: s.subjectWeight,
        relevance: s.relevance,
        selfAssessment: s.selfAssessment,
        attempts: perf?.attempts ?? 0,
        correct: perf?.correct ?? 0,
        errorCounts: perf?.errorCounts ?? {},
        overdueReviews: perf?.overdueReviews ?? 0,
        lastStudiedAt: s.lastStudiedAt ? todayIn(user.timezone, s.lastStudiedAt) : null,
        boardIncidence: incidence.get(s.noticeTopicId) ?? null,
        covered: s.status === "coberto",
      };
    });

    return {
      today,
      examDate: this.examDateOf(goal),
      weeklyAvailability: goal.weeklyAvailability,
      blockMinutes: goal.blockMinutes,
      weights: goal.priorityWeights,
      topics,
      usedMinutesByDate,
      carryOver,
    };
  }

  private async toDto(user: CurrentUser, goal: GoalWithExam, cycle: CycleRow): Promise<Cycle> {
    const rows = await this.repo.cycleTasks(user.id, cycle.id);
    const examDate = this.examDateOf(goal);
    return {
      id: cycle.id,
      number: cycle.number,
      phase: cycle.phase,
      startDate: cycle.startDate,
      endDate: cycle.endDate,
      daysToExam: examDate ? daysBetween(this.today(user), examDate) : null,
      conflicts: cycle.conflicts,
      warnings: cycle.warnings,
      weeklyAvailability: goal.weeklyAvailability,
      tasks: rows.map(({ task, topicName, subjectName }) => toTaskDto(task, topicName, subjectName)),
    };
  }

  // ---------- Tarefas ----------

  async updateTask(
    user: CurrentUser,
    taskId: string,
    patch: { status?: "pendente" | "em_andamento" | "concluida" | "pulada"; suggestedDate?: string },
  ): Promise<Task> {
    const task = await this.repo.taskById(user.id, taskId);
    if (!task) throw notFound("Tarefa não encontrada.");
    if (task.status === "cancelada") throw conflict("Esta tarefa foi substituída por um novo ciclo.");
    const goal = await this.repo.goalById(user.id, task.goalId);
    if (!goal) throw notFound("Tarefa não encontrada.");

    const changes: Partial<typeof studyTasks.$inferInsert> = {};
    if (patch.suggestedDate && patch.suggestedDate !== task.suggestedDate) {
      const [cycle] = await this.db
        .select()
        .from(studyCycles)
        .where(and(eq(studyCycles.id, task.cycleId), eq(studyCycles.userId, user.id)));
      const today = this.today(user);
      if (!cycle || patch.suggestedDate < today || patch.suggestedDate > cycle.endDate) {
        throw badRequest("Reagende para um dia entre hoje e o fim do ciclo atual.");
      }
      const dayKey = String(weekdayOf(patch.suggestedDate)) as keyof typeof goal.weeklyAvailability;
      const limit = goal.weeklyAvailability[dayKey] ?? 0;
      const used = await this.repo.minutesOnDate(user.id, task.cycleId, patch.suggestedDate, task.id);
      if (used + task.durationMin > limit) {
        throw conflict(`Esse dia já está cheio: ${used} de ${limit} minutos ocupados.`);
      }
      changes.suggestedDate = patch.suggestedDate;
    }
    if (patch.status && patch.status !== task.status) {
      changes.status = patch.status;
      changes.completedAt = patch.status === "concluida" ? new Date() : null;
    }
    if (Object.keys(changes).length === 0) {
      const [row] = await this.repo
        .cycleTasks(user.id, task.cycleId)
        .then((r) => r.filter((x) => x.task.id === task.id));
      return toTaskDto(task, row?.topicName ?? null, row?.subjectName ?? null);
    }
    await this.db
      .update(studyTasks)
      .set(changes)
      .where(and(eq(studyTasks.id, task.id), eq(studyTasks.userId, user.id)));
    if (changes.status === "concluida" && task.noticeTopicId) {
      await this.repo.markTopicStudied(
        user.id,
        task.noticeTopicId,
        task.goalId,
        COVERING_TYPES.has(task.type),
      );
    }
    const [row] = (await this.repo.cycleTasks(user.id, task.cycleId)).filter((x) => x.task.id === task.id);
    if (!row) throw notFound();
    return toTaskDto(row.task, row.topicName, row.subjectName);
  }

  // ---------- Sessões ----------

  async createSession(
    user: CurrentUser,
    input: {
      taskId?: string | null | undefined;
      noticeTopicId?: string | null | undefined;
      startedAt: string;
      endedAt?: string | null | undefined;
      netMinutes: number;
      source: "manual" | "cronometro" | "pomodoro";
      notes?: string | undefined;
      completeTask: boolean;
    },
  ): Promise<StudySession> {
    let noticeTopicId = input.noticeTopicId ?? null;
    if (input.taskId) {
      const task = await this.repo.taskById(user.id, input.taskId);
      if (!task) throw notFound("Tarefa não encontrada.");
      noticeTopicId = noticeTopicId ?? task.noticeTopicId;
    }
    if (noticeTopicId && !(await this.repo.userOwnsNoticeTopic(user.id, noticeTopicId))) {
      throw notFound("Assunto não encontrado no seu plano.");
    }
    const [created] = await this.db
      .insert(studySessions)
      .values({
        userId: user.id,
        taskId: input.taskId ?? null,
        noticeTopicId,
        startedAt: new Date(input.startedAt),
        endedAt: input.endedAt ? new Date(input.endedAt) : null,
        netMinutes: input.netMinutes,
        source: input.source,
        notes: input.notes,
      })
      .returning();
    if (!created) throw new Error("Falha ao registrar sessão.");

    if (input.taskId && input.completeTask)
      await this.updateTask(user, input.taskId, { status: "concluida" });
    else if (noticeTopicId) {
      // Sessão avulsa: o assunto conta como estudado em todos os concursos que o cobram.
      await this.repo.markTopicStudied(user.id, noticeTopicId, null, false);
    }
    const [row] = (await this.repo.listSessions(user.id)).filter((s) => s.session.id === created.id);
    return toSessionDto(created, row?.topicName ?? null);
  }

  async listSessions(user: CurrentUser, from?: string, to?: string): Promise<StudySession[]> {
    const rows = await this.repo.listSessions(
      user.id,
      from ? new Date(`${from}T00:00:00Z`) : undefined,
      to ? new Date(`${addDays(to, 1)}T00:00:00Z`) : undefined,
    );
    return rows.map((r) => toSessionDto(r.session, r.topicName));
  }

  async deleteSession(user: CurrentUser, sessionId: string): Promise<void> {
    const session = await this.repo.sessionById(user.id, sessionId);
    if (!session) throw notFound("Sessão não encontrada.");
    await this.db
      .delete(studySessions)
      .where(and(eq(studySessions.id, session.id), eq(studySessions.userId, user.id)));
  }
}

function isUniqueViolation(err: unknown): boolean {
  const code =
    (err as { code?: string; cause?: { code?: string } })?.code ??
    (err as { cause?: { code?: string } })?.cause?.code;
  return code === "23505";
}

export function toTaskDto(
  task: typeof studyTasks.$inferSelect,
  topicName: string | null,
  subjectName: string | null,
): Task {
  return {
    id: task.id,
    type: task.type,
    status: task.status,
    suggestedDate: task.suggestedDate,
    orderIndex: task.orderIndex,
    durationMin: task.durationMin,
    priority: task.priority,
    justification: task.justification,
    noticeTopicId: task.noticeTopicId,
    topicName,
    subjectName,
    completedAt: task.completedAt?.toISOString() ?? null,
  };
}

function toSessionDto(session: typeof studySessions.$inferSelect, topicName: string | null): StudySession {
  return {
    id: session.id,
    taskId: session.taskId,
    noticeTopicId: session.noticeTopicId,
    topicName,
    startedAt: session.startedAt.toISOString(),
    endedAt: session.endedAt?.toISOString() ?? null,
    netMinutes: session.netMinutes,
    source: session.source,
    notes: session.notes,
  };
}
