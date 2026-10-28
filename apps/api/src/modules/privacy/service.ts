// LGPD: exportação dos dados do titular e exclusão da conta.
import {
  accounts,
  auditLogs,
  consents,
  examNotices,
  exams,
  mockExamAttempts,
  mockExamQuestions,
  mockExams,
  questionAttempts,
  questionListItems,
  questionLists,
  questionNotes,
  questionOptions,
  questionReports,
  questions,
  reviewItems,
  sessions,
  studyCycles,
  studySessions,
  studyTasks,
  userExamGoals,
  userProfiles,
  userTopicStates,
  users,
  type Database,
} from "@aprovaai/db";
import { and, eq, inArray } from "drizzle-orm";
import { verifyPassword } from "../../auth/password";
import { AUDIT_ACTIONS, recordAudit } from "../../lib/audit";
import { AppError } from "../../lib/errors";
import type { CurrentUser } from "../../plugins/auth-context";

export const EXPORT_FORMAT_VERSION = 1;

export class PrivacyService {
  constructor(private readonly db: Database) {}

  /**
   * Todos os dados pessoais do usuário em JSON. Não inclui hash de senha nem tokens de sessão.
   * Conteúdo do catálogo compartilhado não entra (não é dado do titular).
   */
  async export(user: CurrentUser) {
    const db = this.db;
    const uid = user.id;
    const [account] = await db
      .select({
        id: users.id,
        name: users.name,
        email: users.email,
        emailVerified: users.emailVerified,
        role: users.role,
        timezone: users.timezone,
        createdAt: users.createdAt,
      })
      .from(users)
      .where(eq(users.id, uid));

    const ownQuestions = await db.select().from(questions).where(eq(questions.ownerUserId, uid));
    const ownLists = await db.select().from(questionLists).where(eq(questionLists.userId, uid));
    const ownMockExams = await db.select().from(mockExams).where(eq(mockExams.userId, uid));
    const ownExams = await db.select().from(exams).where(eq(exams.ownerUserId, uid));

    return {
      formatVersion: EXPORT_FORMAT_VERSION,
      exportedAt: new Date().toISOString(),
      account,
      loginMethods: await db
        .select({ provider: accounts.providerId, createdAt: accounts.createdAt })
        .from(accounts)
        .where(eq(accounts.userId, uid)),
      sessions: await db
        .select({
          createdAt: sessions.createdAt,
          expiresAt: sessions.expiresAt,
          ipAddress: sessions.ipAddress,
          userAgent: sessions.userAgent,
        })
        .from(sessions)
        .where(eq(sessions.userId, uid)),
      profile: (await db.select().from(userProfiles).where(eq(userProfiles.userId, uid)))[0] ?? null,
      consents: await db.select().from(consents).where(eq(consents.userId, uid)),
      studyPlan: {
        goals: await db.select().from(userExamGoals).where(eq(userExamGoals.userId, uid)),
        topicStates: await db.select().from(userTopicStates).where(eq(userTopicStates.userId, uid)),
        cycles: await db.select().from(studyCycles).where(eq(studyCycles.userId, uid)),
        tasks: await db.select().from(studyTasks).where(eq(studyTasks.userId, uid)),
        sessions: await db.select().from(studySessions).where(eq(studySessions.userId, uid)),
      },
      privateExams: {
        exams: ownExams,
        notices: ownExams.length
          ? await db
              .select()
              .from(examNotices)
              .where(
                inArray(
                  examNotices.examId,
                  ownExams.map((e) => e.id),
                ),
              )
          : [],
      },
      questions: {
        own: ownQuestions,
        ownOptions: ownQuestions.length
          ? await db
              .select()
              .from(questionOptions)
              .where(
                inArray(
                  questionOptions.questionId,
                  ownQuestions.map((q) => q.id),
                ),
              )
          : [],
        attempts: await db.select().from(questionAttempts).where(eq(questionAttempts.userId, uid)),
        notes: await db.select().from(questionNotes).where(eq(questionNotes.userId, uid)),
        lists: ownLists,
        listItems: ownLists.length
          ? await db
              .select()
              .from(questionListItems)
              .where(
                inArray(
                  questionListItems.listId,
                  ownLists.map((l) => l.id),
                ),
              )
          : [],
        reports: await db.select().from(questionReports).where(eq(questionReports.userId, uid)),
        reviews: await db.select().from(reviewItems).where(eq(reviewItems.userId, uid)),
      },
      mockExams: {
        exams: ownMockExams,
        questions: ownMockExams.length
          ? await db
              .select()
              .from(mockExamQuestions)
              .where(
                inArray(
                  mockExamQuestions.mockExamId,
                  ownMockExams.map((m) => m.id),
                ),
              )
          : [],
        attempts: await db.select().from(mockExamAttempts).where(eq(mockExamAttempts.userId, uid)),
      },
      auditTrail: await db
        .select({ action: auditLogs.action, createdAt: auditLogs.createdAt, ipAddress: auditLogs.ipAddress })
        .from(auditLogs)
        .where(eq(auditLogs.actorUserId, uid)),
    };
  }

  async recordExport(user: CurrentUser, ip: string): Promise<void> {
    await recordAudit(this.db, { action: AUDIT_ACTIONS.DATA_EXPORTED, actorUserId: user.id, ipAddress: ip });
  }

  /**
   * Exclui a conta. Dados privados são apagados em cascata; o que precisa ficar por motivo legítimo
   * (trilha de auditoria, aceite de termos, reportes já moderados) perde o vínculo com a pessoa (user_id → NULL).
   */
  async deleteAccount(
    user: CurrentUser,
    input: { confirmEmail: string; password?: string | undefined },
  ): Promise<void> {
    if (input.confirmEmail !== user.email.toLowerCase()) {
      throw new AppError(
        400,
        "VALIDATION_ERROR",
        "Digite o seu e-mail exatamente como cadastrado para confirmar.",
      );
    }
    const [credential] = await this.db
      .select({ password: accounts.password })
      .from(accounts)
      .where(and(eq(accounts.userId, user.id), eq(accounts.providerId, "credential")));
    if (credential?.password) {
      const ok = input.password
        ? await verifyPassword({ hash: credential.password, password: input.password })
        : false;
      if (!ok) throw new AppError(400, "INVALID_PASSWORD", "Senha incorreta.");
    }

    await this.db.transaction(async (tx) => {
      // Registro sem dado pessoal: só o id interno (que deixa de apontar para alguém).
      await recordAudit(tx as unknown as Database, {
        action: AUDIT_ACTIONS.ACCOUNT_DELETED,
        actorUserId: null,
        targetType: "user",
        targetId: user.id,
        ipAddress: null,
      });
      await tx.delete(users).where(eq(users.id, user.id));
    });
  }
}
