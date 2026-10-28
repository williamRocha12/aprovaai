// Radar de editais: coleta diária → documentos (dedupe por hash) → filtro por palavras-chave → extração
// (IA, se ligada; senão regras) → fila do editor → concurso no catálogo. Nada vira "confirmado" sem um editor.
import { createHash } from "node:crypto";
import { evidenceOf, isExamOpeningCandidate, ruleBasedLead } from "@aprovaai/core";
import {
  aiInteractions,
  boards,
  examLeads,
  examPositions,
  exams,
  organizations,
  slugify,
  sourceDocuments,
  sourceRuns,
  type Database,
  type LeadPositionJson,
} from "@aprovaai/db";
import type { ConfirmLeadInput, ExamLead, RadarOverview } from "@aprovaai/shared";
import { and, count, desc, eq, isNull, sql } from "drizzle-orm";
import type { AiExamLead, AiProvider } from "../../lib/ai/provider";
import { estimateCostUsd } from "../../lib/ai/anthropic";
import { conflict, notFound } from "../../lib/errors";
import { isFlagEnabled } from "../../lib/feature-flags";
import { enqueueJob } from "../../lib/jobs";
import type { CurrentUser } from "../../plugins/auth-context";
import type { RawDocument, SourceConnector } from "./connectors/types";

type DocumentRow = typeof sourceDocuments.$inferSelect;
type LeadValues = Omit<typeof examLeads.$inferInsert, "sourceDocumentId">;

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Só aceita datas ISO reais (a IA pode devolver texto livre). */
function validDate(value: string | null | undefined): string | null {
  if (!value || !ISO_DATE.test(value)) return null;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value ? null : value;
}

function validUrl(value: string | null | undefined): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : null;
  } catch {
    return null;
  }
}

const squash = (text: string) => text.replace(/\s+/g, " ").trim().toLowerCase();

export function documentHash(doc: Pick<RawDocument, "source" | "externalId" | "excerpt">): string {
  return createHash("sha256")
    .update(`${doc.source}\n${doc.externalId}\n${squash(doc.excerpt)}`)
    .digest("hex");
}

/** Lead por regras (sem IA): confiança baixa, o editor completa na fila. */
function leadFromRules(doc: DocumentRow, sphere: RawDocument["sphere"]): LeadValues {
  const rules = ruleBasedLead({
    excerpt: doc.excerpt,
    territoryName: doc.territoryName,
    uf: doc.uf,
    sphere,
    url: doc.url,
  });
  return {
    organization: rules.organization,
    title: rules.title,
    sphere: rules.sphere,
    uf: rules.uf,
    city: rules.city,
    boardName: null,
    positions: rules.vacancies
      ? [{ title: "Cargos a conferir no edital", vacancies: rules.vacancies, salary: null }]
      : [],
    registrationStart: rules.registrationStart,
    registrationEnd: rules.registrationEnd,
    examDate: rules.examDate,
    noticeUrl: null,
    evidence: rules.evidence,
    confidence: "baixa",
    extractedBy: "regras",
  };
}

/**
 * Lead pela IA, com saneamento: datas/URLs inválidas viram null, e se a citação de evidência não estiver
 * literalmente no documento, a confiança cai para "baixa" (sinal de alucinação).
 */
export function leadFromAi(data: AiExamLead, doc: DocumentRow, sphere: RawDocument["sphere"]): LeadValues {
  const rules = leadFromRules(doc, sphere);
  const quoteFound =
    data.evidenceQuote.trim().length > 20 && squash(doc.excerpt).includes(squash(data.evidenceQuote));
  const uf = data.uf && /^[a-z]{2}$/i.test(data.uf) ? data.uf.toUpperCase() : doc.uf;
  const positions: LeadPositionJson[] = data.positions
    .filter((p) => p.title.trim())
    .slice(0, 20)
    .map((p) => ({
      title: p.title.trim().slice(0, 200),
      vacancies: p.vacancies && Number.isInteger(p.vacancies) && p.vacancies > 0 ? p.vacancies : null,
      salary: p.salary && p.salary > 0 && p.salary < 1_000_000 ? Math.round(p.salary * 100) / 100 : null,
    }));
  const organization = data.organization?.trim() || rules.organization;
  return {
    organization: organization.slice(0, 200),
    title: (data.title?.trim() || `Concurso público — ${organization}`).slice(0, 200),
    sphere: data.sphere ?? rules.sphere,
    uf,
    city: data.city?.trim() || rules.city,
    boardName: data.boardName?.trim() || null,
    positions,
    registrationStart: validDate(data.registrationStart),
    registrationEnd: validDate(data.registrationEnd),
    examDate: validDate(data.examDate),
    noticeUrl: validUrl(data.noticeUrl),
    evidence: quoteFound ? data.evidenceQuote.trim().slice(0, 600) : evidenceOf(doc.excerpt),
    confidence: quoteFound ? data.confidence : "baixa",
    extractedBy: "ia",
  };
}

export class RadarService {
  constructor(
    private readonly db: Database,
    private readonly connectors: SourceConnector[],
    private readonly ai: AiProvider | null,
  ) {}

  /** Roda os conectores para um dia, guarda documentos novos e enfileira o processamento de cada um. */
  async collect(day: string): Promise<{ source: string; status: string; found: number; created: number }[]> {
    if (!(await isFlagEnabled(this.db, "radar"))) return [];
    const summary = [];
    for (const connector of this.connectors) {
      const reason = connector.disabledReason();
      if (reason) {
        await this.db.insert(sourceRuns).values({
          source: connector.source,
          day,
          status: "desativado",
          errorMessage: reason,
          finishedAt: new Date(),
        });
        summary.push({ source: connector.source, status: "desativado", found: 0, created: 0 });
        continue;
      }
      const [run] = await this.db
        .insert(sourceRuns)
        .values({ source: connector.source, day, status: "ok" })
        .returning({ id: sourceRuns.id });
      if (!run) throw new Error("Falha ao registrar a coleta.");
      try {
        const documents = await connector.fetchDay(day);
        let created = 0;
        for (const doc of documents) {
          const [inserted] = await this.db
            .insert(sourceDocuments)
            .values({
              source: doc.source,
              externalId: doc.externalId,
              url: doc.url,
              title: doc.title.slice(0, 300),
              publishedOn: doc.publishedOn,
              territoryName: doc.territoryName,
              uf: doc.uf,
              excerpt: doc.excerpt,
              contentHash: documentHash(doc),
            })
            .onConflictDoNothing()
            .returning({ id: sourceDocuments.id });
          if (!inserted) continue;
          created++;
          await enqueueJob(
            this.db,
            "radar_process_document",
            { documentId: inserted.id },
            { dedupeKey: `radar_doc:${inserted.id}` },
          );
        }
        await this.db
          .update(sourceRuns)
          .set({ documentsFound: documents.length, documentsNew: created, finishedAt: new Date() })
          .where(eq(sourceRuns.id, run.id));
        summary.push({ source: connector.source, status: "ok", found: documents.length, created });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        await this.db
          .update(sourceRuns)
          .set({ status: "erro", errorMessage: message.slice(0, 500), finishedAt: new Date() })
          .where(eq(sourceRuns.id, run.id));
        summary.push({ source: connector.source, status: "erro", found: 0, created: 0 });
      }
    }
    return summary;
  }

  /** Classifica um documento e, se for abertura de concurso, cria o lead para a fila do editor. Idempotente. */
  async processDocument(documentId: string): Promise<void> {
    const [doc] = await this.db.select().from(sourceDocuments).where(eq(sourceDocuments.id, documentId));
    if (!doc || doc.status !== "novo") return;
    const sphere: RawDocument["sphere"] = doc.source === "dou_inlabs" ? "federal" : "municipal";

    const check = isExamOpeningCandidate(doc.excerpt);
    if (!check.candidate) {
      await this.setDocumentStatus(doc.id, "descartado", check.reason);
      return;
    }

    let lead: LeadValues | null = null;
    if (this.ai && (await isFlagEnabled(this.db, "ai"))) {
      const result = await this.ai.extractExamLead(doc.excerpt);
      await this.db.insert(aiInteractions).values({
        userId: null,
        feature: "radar_extract",
        model: result.usage?.model ?? "desconhecido",
        inputTokens: result.usage?.inputTokens ?? 0,
        outputTokens: result.usage?.outputTokens ?? 0,
        costUsd: result.usage ? estimateCostUsd(result.usage) : null,
        status: result.ok ? "ok" : result.reason === "provider_error" ? "error" : result.reason,
        errorCode: result.ok ? null : result.reason,
      });
      if (result.ok) {
        if (!result.data.isExamOpening) {
          await this.setDocumentStatus(doc.id, "descartado", "IA: não é abertura de concurso público");
          return;
        }
        lead = leadFromAi(result.data, doc, sphere);
      } else if (result.reason === "provider_error") {
        // Falha temporária do provedor: o job tenta de novo com backoff.
        throw new Error(result.message);
      }
    }
    lead ??= leadFromRules(doc, sphere);

    await this.db.transaction(async (tx) => {
      await tx
        .insert(examLeads)
        .values({ sourceDocumentId: doc.id, ...lead })
        .onConflictDoNothing();
      await tx.update(sourceDocuments).set({ status: "processado" }).where(eq(sourceDocuments.id, doc.id));
    });
  }

  private async setDocumentStatus(id: string, status: DocumentRow["status"], message: string | null) {
    await this.db
      .update(sourceDocuments)
      .set({ status, errorMessage: message })
      .where(eq(sourceDocuments.id, id));
  }

  // ---------- Fila do editor ----------

  async listLeads(status: ExamLead["status"], uf?: string): Promise<ExamLead[]> {
    const rows = await this.db
      .select({ lead: examLeads, doc: sourceDocuments })
      .from(examLeads)
      .innerJoin(sourceDocuments, eq(sourceDocuments.id, examLeads.sourceDocumentId))
      .where(and(eq(examLeads.status, status), uf ? eq(examLeads.uf, uf) : undefined))
      .orderBy(desc(sourceDocuments.publishedOn), desc(examLeads.createdAt))
      .limit(100);
    return rows.map(({ lead, doc }) => toLeadDto(lead, doc));
  }

  async overview(): Promise<RadarOverview> {
    const [pending] = await this.db
      .select({ value: count() })
      .from(examLeads)
      .where(eq(examLeads.status, "pendente"));
    const sources = await Promise.all(
      this.connectors.map(async (c) => {
        const [last] = await this.db
          .select()
          .from(sourceRuns)
          .where(eq(sourceRuns.source, c.source))
          .orderBy(desc(sourceRuns.startedAt))
          .limit(1);
        return {
          source: c.source,
          label: c.label,
          disabledReason: c.disabledReason(),
          lastRun: last
            ? {
                day: last.day,
                status: last.status,
                documentsFound: last.documentsFound,
                documentsNew: last.documentsNew,
                errorMessage: last.errorMessage,
                finishedAt: last.finishedAt?.toISOString() ?? null,
              }
            : null,
        };
      }),
    );
    return {
      enabled: await isFlagEnabled(this.db, "radar"),
      aiEnabled: Boolean(this.ai) && (await isFlagEnabled(this.db, "ai")),
      sources,
      pendingLeads: pending?.value ?? 0,
    };
  }

  /** Editor conferiu na fonte oficial: cria o concurso no catálogo (sem conteúdo programático ainda). */
  async confirmLead(user: CurrentUser, leadId: string, input: ConfirmLeadInput): Promise<{ examId: string }> {
    const [lead] = await this.db.select().from(examLeads).where(eq(examLeads.id, leadId));
    if (!lead) throw notFound("Concurso detectado não encontrado.");
    if (lead.status !== "pendente") throw conflict("Este item já foi revisado.");
    const [doc] = await this.db
      .select({ url: sourceDocuments.url })
      .from(sourceDocuments)
      .where(eq(sourceDocuments.id, lead.sourceDocumentId));

    return this.db.transaction(async (tx) => {
      let boardId: string | null = null;
      if (input.boardName) {
        const slug = slugify(input.boardName).slice(0, 50) || "banca";
        const [board] = await tx
          .insert(boards)
          .values({ name: input.boardName, slug })
          .onConflictDoUpdate({ target: boards.slug, set: { name: sql`${boards.name}` } })
          .returning({ id: boards.id });
        boardId = board?.id ?? null;
      }
      const [existingOrg] = await tx
        .select({ id: organizations.id })
        .from(organizations)
        .where(
          and(
            eq(organizations.name, input.organization),
            input.uf ? eq(organizations.uf, input.uf) : isNull(organizations.uf),
          ),
        );
      const organizationId =
        existingOrg?.id ??
        (
          await tx
            .insert(organizations)
            .values({ name: input.organization, sphere: input.sphere, uf: input.uf, city: input.city })
            .returning({ id: organizations.id })
        )[0]?.id;
      if (!organizationId) throw new Error("Falha ao criar órgão.");

      const [exam] = await tx
        .insert(exams)
        .values({
          organizationId,
          boardId,
          title: input.title,
          sphere: input.sphere,
          uf: input.uf,
          city: input.city,
          situation: input.situation,
          situationConfirmed: true,
          registrationStart: input.registrationStart,
          registrationEnd: input.registrationEnd,
          examDate: input.examDate,
          datesConfirmed: Boolean(input.registrationEnd || input.examDate),
          officialUrl: input.officialUrl,
          sourceUrl: doc?.url ?? input.officialUrl,
          lastVerifiedAt: new Date(),
          contentStatus: "validado",
          contentOrigin: "oficial",
        })
        .returning({ id: exams.id });
      if (!exam) throw new Error("Falha ao criar concurso.");
      if (input.positions.length > 0) {
        await tx.insert(examPositions).values(
          input.positions.map((p) => ({
            examId: exam.id,
            title: p.title,
            vacancies: p.vacancies,
            salary: p.salary === null ? null : String(p.salary),
            salaryConfirmed: p.salary !== null,
          })),
        );
      }
      await tx
        .update(examLeads)
        .set({ status: "confirmado", examId: exam.id, reviewedBy: user.id, reviewedAt: new Date() })
        .where(eq(examLeads.id, leadId));
      return { examId: exam.id };
    });
  }

  async discardLead(user: CurrentUser, leadId: string): Promise<void> {
    const [updated] = await this.db
      .update(examLeads)
      .set({ status: "descartado", reviewedBy: user.id, reviewedAt: new Date() })
      .where(and(eq(examLeads.id, leadId), eq(examLeads.status, "pendente")))
      .returning({ id: examLeads.id });
    if (!updated) throw notFound("Concurso detectado não encontrado ou já revisado.");
  }
}

function toLeadDto(lead: typeof examLeads.$inferSelect, doc: DocumentRow): ExamLead {
  return {
    id: lead.id,
    status: lead.status,
    organization: lead.organization,
    title: lead.title,
    sphere: lead.sphere,
    uf: lead.uf,
    city: lead.city,
    boardName: lead.boardName,
    positions: lead.positions,
    registrationStart: lead.registrationStart,
    registrationEnd: lead.registrationEnd,
    examDate: lead.examDate,
    noticeUrl: lead.noticeUrl,
    evidence: lead.evidence,
    confidence: lead.confidence,
    extractedBy: lead.extractedBy,
    examId: lead.examId,
    source: { source: doc.source, url: doc.url, title: doc.title, publishedOn: doc.publishedOn },
    createdAt: lead.createdAt.toISOString(),
  };
}
