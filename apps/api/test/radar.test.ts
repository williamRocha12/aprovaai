// Radar de editais: conectores com fixtures (sem rede), fila de processamento, confirmação pelo editor
// e o concurso confirmado aparecendo na lista por estado.
import { examLeads, featureFlags, sourceDocuments, sourceRuns } from "@aprovaai/db";
import type { ExamLead } from "@aprovaai/shared";
import { eq } from "drizzle-orm";
import { strToU8, zipSync } from "fflate";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { DouInlabsConnector, parseInlabsArticle } from "../src/modules/radar/connectors/dou-inlabs";
import { QueridoDiarioConnector } from "../src/modules/radar/connectors/querido-diario";
import type { RawDocument, SourceConnector } from "../src/modules/radar/connectors/types";
import { FakeAi } from "./fake-ai";
import { createTestContext, createVerifiedUser, resetDatabase, type TestContext } from "./helpers";

const OPENING =
  "EDITAL DE ABERTURA Nº 01/2026. O Prefeito Municipal de Palhoça torna pública a abertura das inscrições do " +
  "Concurso Público para provimento de 45 vagas. As inscrições serão realizadas de 03/11/2026 a 02/12/2026.";
const HOMOLOGATION = "Homologação do resultado final do Concurso Público, Edital nº 2/2025.";

function doc(externalId: string, excerpt: string, overrides: Partial<RawDocument> = {}): RawDocument {
  return {
    source: "querido_diario",
    externalId,
    url: `https://diario.exemplo.gov.br/${externalId}.pdf`,
    title: "Diário Oficial de Palhoça (SC)",
    publishedOn: "2026-10-27",
    territoryName: "Palhoça",
    uf: "SC",
    sphere: "municipal",
    excerpt,
    ...overrides,
  };
}

/** Conector de teste: devolve documentos fixos (ou falha), sem rede. */
class FixtureConnector implements SourceConnector {
  readonly label = "Fixture";
  documents: RawDocument[] = [];
  error: Error | null = null;
  disabled: string | null = null;
  constructor(readonly source: "querido_diario" | "dou_inlabs") {}
  disabledReason() {
    return this.disabled;
  }
  async fetchDay() {
    if (this.error) throw this.error;
    return this.documents;
  }
}

const municipal = new FixtureConnector("querido_diario");
const federal = new FixtureConnector("dou_inlabs");
const fake = new FakeAi();
let ctx: TestContext;

beforeAll(async () => {
  ctx = await createTestContext({}, { ai: fake, radarConnectors: [municipal, federal] });
});
afterAll(async () => {
  await ctx.close();
});
beforeEach(async () => {
  await resetDatabase(ctx.db);
  municipal.documents = [doc("palhoca-1", OPENING), doc("palhoca-2", HOMOLOGATION)];
  municipal.error = null;
  federal.documents = [];
  federal.disabled = "Configure INLABS_EMAIL e INLABS_PASSWORD.";
  fake.calls = 0;
});

async function collect() {
  const { client: admin } = await createVerifiedUser(ctx, "admin@exemplo.com", "admin");
  const res = await admin.post("/api/radar/collect", { day: "2026-10-27" });
  expect(res.statusCode).toBe(200);
  return admin;
}

describe("coleta e processamento", () => {
  it("sem IA: só a abertura vira lead (regras, confiança baixa); a homologação é descartada", async () => {
    const admin = await collect();
    const leads = (await admin.get("/api/radar/leads")).json() as ExamLead[];
    expect(leads).toHaveLength(1);
    const [lead] = leads;
    expect(lead?.extractedBy).toBe("regras");
    expect(lead?.confidence).toBe("baixa");
    expect(lead?.organization).toBe("Prefeitura Municipal de Palhoça");
    expect(lead?.registrationEnd).toBe("2026-12-02");
    expect(lead?.positions[0]?.vacancies).toBe(45);
    expect(lead?.source.url).toContain("palhoca-1");

    const docs = await ctx.db.select().from(sourceDocuments);
    expect(docs.find((d) => d.externalId === "palhoca-2")?.status).toBe("descartado");
    expect(fake.calls).toBe(0);
  });

  it("a mesma publicação coletada de novo não duplica (dedupe por hash)", async () => {
    const admin = await collect();
    await admin.post("/api/radar/collect", { day: "2026-10-27" });
    expect(await ctx.db.select().from(sourceDocuments)).toHaveLength(2);
    expect(await ctx.db.select().from(examLeads)).toHaveLength(1);
  });

  it("com IA: usa a extração, descarta datas inválidas e mantém a evidência literal", async () => {
    await ctx.db.update(featureFlags).set({ enabled: true }).where(eq(featureFlags.key, "ai"));
    fake.nextLead = {
      ok: true,
      usage: { model: "claude-opus-5-5", inputTokens: 10, outputTokens: 10 },
      data: {
        isExamOpening: true,
        organization: "Prefeitura Municipal de Palhoça",
        title: "Concurso Prefeitura de Palhoça 2026",
        sphere: "municipal",
        uf: "sc",
        city: "Palhoça",
        boardName: null,
        positions: [{ title: "Agente Administrativo", vacancies: 10, salary: 3200.5 }],
        registrationStart: "2026-11-03",
        registrationEnd: "02/12/2026",
        examDate: null,
        noticeUrl: "javascript:alert(1)",
        evidenceQuote: "torna pública a abertura das inscrições do Concurso Público",
        confidence: "alta",
      },
    };
    const admin = await collect();
    const [lead] = (await admin.get("/api/radar/leads")).json() as ExamLead[];
    expect(lead?.extractedBy).toBe("ia");
    expect(lead?.uf).toBe("SC");
    expect(lead?.registrationStart).toBe("2026-11-03");
    expect(lead?.registrationEnd).toBeNull();
    expect(lead?.noticeUrl).toBeNull();
    expect(lead?.confidence).toBe("alta");
    expect(lead?.positions).toEqual([{ title: "Agente Administrativo", vacancies: 10, salary: 3200.5 }]);
  });

  it("evidência que não está no documento derruba a confiança (anti-alucinação)", async () => {
    await ctx.db.update(featureFlags).set({ enabled: true }).where(eq(featureFlags.key, "ai"));
    fake.nextLead = {
      ok: true,
      usage: { model: "claude-opus-5-5", inputTokens: 10, outputTokens: 10 },
      data: {
        isExamOpening: true,
        organization: "Prefeitura Municipal de Palhoça",
        title: null,
        sphere: null,
        uf: null,
        city: null,
        boardName: null,
        positions: [],
        registrationStart: null,
        registrationEnd: null,
        examDate: null,
        noticeUrl: null,
        evidenceQuote: "trecho inventado que não aparece no diário oficial",
        confidence: "alta",
      },
    };
    const admin = await collect();
    const [lead] = (await admin.get("/api/radar/leads")).json() as ExamLead[];
    expect(lead?.confidence).toBe("baixa");
    expect(lead?.evidence).toContain("Concurso Público");
  });

  it("registra fonte desativada e fonte com erro no status do radar", async () => {
    municipal.error = new Error("Querido Diário respondeu HTTP 503.");
    const admin = await collect();
    const overview = (await admin.get("/api/radar")).json();
    const qd = overview.sources.find((s: { source: string }) => s.source === "querido_diario");
    const dou = overview.sources.find((s: { source: string }) => s.source === "dou_inlabs");
    expect(qd.lastRun.status).toBe("erro");
    expect(qd.lastRun.errorMessage).toContain("503");
    expect(dou.lastRun.status).toBe("desativado");
    expect(dou.disabledReason).toContain("INLABS_EMAIL");
    expect((await ctx.db.select().from(sourceRuns)).length).toBe(2);
  });

  it("com a flag radar desligada, a coleta não faz nada", async () => {
    await ctx.db.update(featureFlags).set({ enabled: false }).where(eq(featureFlags.key, "radar"));
    await collect();
    expect(await ctx.db.select().from(sourceRuns)).toHaveLength(0);
  });
});

describe("fila do editor", () => {
  const confirmBody = {
    organization: "Prefeitura Municipal de Palhoça",
    title: "Concurso Prefeitura de Palhoça 2026",
    sphere: "municipal",
    uf: "SC",
    city: "Palhoça",
    boardName: "Banca Teste",
    positions: [
      { title: "Agente Administrativo", vacancies: 10, salary: 3200.5 },
      { title: "Professor", vacancies: 35, salary: 4800 },
    ],
    situation: "edital_publicado",
    registrationStart: "2026-11-03",
    registrationEnd: "2026-12-02",
    examDate: null,
    officialUrl: "https://palhoca.sc.gov.br/edital-01-2026.pdf",
    checkedOfficialSource: true,
  };

  it("usuário comum não acessa a fila nem a coleta", async () => {
    await collect();
    const { client: user } = await createVerifiedUser(ctx, "a@exemplo.com");
    expect((await user.get("/api/radar/leads")).statusCode).toBe(403);
    expect((await user.get("/api/radar")).statusCode).toBe(403);
    expect((await user.post("/api/radar/collect", { day: "2026-10-27" })).statusCode).toBe(403);
    const { client: editor } = await createVerifiedUser(ctx, "editor@exemplo.com", "editor");
    expect((await editor.post("/api/radar/collect", { day: "2026-10-27" })).statusCode).toBe(403);
  });

  it("editor confirma: vira concurso aberto em SC (sem conteúdo programático) e aparece na lista", async () => {
    const admin = await collect();
    const [lead] = (await admin.get("/api/radar/leads")).json() as ExamLead[];
    const { client: editor } = await createVerifiedUser(ctx, "editor@exemplo.com", "editor");

    const missingCheck = await editor.post(`/api/radar/leads/${lead?.id}/confirm`, {
      ...confirmBody,
      checkedOfficialSource: false,
    });
    expect(missingCheck.statusCode).toBe(400);

    const confirmed = await editor.post(`/api/radar/leads/${lead?.id}/confirm`, confirmBody);
    expect(confirmed.statusCode).toBe(200);
    const examId = confirmed.json().examId as string;
    expect((await editor.post(`/api/radar/leads/${lead?.id}/confirm`, confirmBody)).statusCode).toBe(409);

    const { client: user } = await createVerifiedUser(ctx, "a@exemplo.com");
    const list = (await user.get("/api/catalog/exams?open=true&uf=SC")).json();
    const card = list.items.find((e: { id: string }) => e.id === examId);
    expect(card).toMatchObject({
      situation: "edital_publicado",
      situationConfirmed: true,
      registrationEnd: "2026-12-02",
      vacancies: 45,
      salaryMax: 4800,
      positionCount: 2,
      hasNotice: false,
    });
    expect((await editor.get("/api/radar/leads")).json()).toHaveLength(0);
    expect((await editor.get("/api/radar/leads?status=confirmado")).json()[0].examId).toBe(examId);
  });

  it("editor completa o conteúdo programático do concurso confirmado; aí o usuário pode montar o plano", async () => {
    const admin = await collect();
    const [lead] = (await admin.get("/api/radar/leads")).json() as ExamLead[];
    const { client: editor } = await createVerifiedUser(ctx, "editor@exemplo.com", "editor");
    const examId = (await editor.post(`/api/radar/leads/${lead?.id}/confirm`, confirmBody)).json().examId;

    const data = {
      exam: {
        title: "ignorado",
        organization: { name: "ignorado", sphere: "municipal" },
        sphere: "municipal",
      },
      notice: { title: "Edital 01/2026" },
      subjects: [{ name: "Língua Portuguesa", topics: [{ name: "Crase" }, { name: "Concordância" }] }],
    };
    const { client: user } = await createVerifiedUser(ctx, "a@exemplo.com");
    expect((await user.post("/api/catalog/import", { data, target: "catalog", examId })).statusCode).toBe(
      403,
    );

    const added = await editor.post("/api/catalog/import", {
      data,
      target: "catalog",
      publish: true,
      examId,
    });
    expect(added.statusCode).toBe(201);
    expect(added.json().examId).toBe(examId);
    expect((await editor.post("/api/catalog/import", { data, target: "catalog", examId })).statusCode).toBe(
      409,
    );

    const detail = (await user.get(`/api/catalog/exams/${examId}`)).json();
    expect(detail.title).toBe("Concurso Prefeitura de Palhoça 2026");
    expect(detail.positions).toHaveLength(2);
    expect(detail.notice.subjects[0].name).toBe("Língua Portuguesa");
  });

  it("descartar tira o item da fila", async () => {
    const admin = await collect();
    const [lead] = (await admin.get("/api/radar/leads")).json() as ExamLead[];
    expect((await admin.post(`/api/radar/leads/${lead?.id}/discard`)).statusCode).toBe(204);
    expect((await admin.get("/api/radar/leads")).json()).toHaveLength(0);
    expect((await admin.post(`/api/radar/leads/${lead?.id}/discard`)).statusCode).toBe(404);
  });
});

describe("conectores (fixtures, sem rede)", () => {
  it("Querido Diário: monta a busca do dia, pagina e converte os diários", async () => {
    const urls: string[] = [];
    const page = (offset: number) => ({
      total_gazettes: 101,
      gazettes: [
        {
          territory_id: `42${offset}`,
          date: "2026-10-27",
          url: `https://qd.exemplo/${offset}.pdf`,
          territory_name: "Palhoça",
          state_code: "SC",
          excerpts: [OPENING],
          edition: "1234",
          is_extra_edition: false,
        },
      ],
    });
    const connector = new QueridoDiarioConnector("https://api.exemplo/", async (url) => {
      urls.push(url);
      const offset = Number(new URL(url).searchParams.get("offset"));
      return new Response(JSON.stringify(page(offset)), { status: 200 });
    });
    const docs = await connector.fetchDay("2026-10-27");
    expect(urls).toHaveLength(2);
    const first = new URL(urls[0] ?? "");
    expect(first.pathname).toBe("/gazettes");
    expect(first.searchParams.get("published_since")).toBe("2026-10-27");
    expect(first.searchParams.get("published_until")).toBe("2026-10-27");
    expect(first.searchParams.get("querystring")).toContain("concurso público");
    expect(docs).toHaveLength(2);
    expect(docs[0]).toMatchObject({ uf: "SC", sphere: "municipal", territoryName: "Palhoça" });
  });

  it("Querido Diário fora do ar vira erro (que fica registrado na coleta)", async () => {
    const connector = new QueridoDiarioConnector(
      "https://api.exemplo",
      async () => new Response("", { status: 503 }),
    );
    await expect(connector.fetchDay("2026-10-27")).rejects.toThrow("503");
  });

  const ARTICLE = `<xml><article id="1" name="EDITAL Nº 1" idMateria="99887766" pubName="DO3" artType="Edital"
    pubDate="27/10/2026" artCategory="Ministério da Educação/Universidade Federal de Santa Catarina/Pró-Reitoria"
    pdfPage="http://pesquisa.in.gov.br/imprensa/jsp/visualiza/index.jsp?data=27/10/2026&amp;jornal=530&amp;pagina=80">
    <body><Identifica><![CDATA[EDITAL Nº 1, DE 26 DE OUTUBRO DE 2026]]></Identifica>
    <Texto><![CDATA[<p>Torna pública a abertura de inscrições do concurso público para Professor do Magistério Superior.</p>]]></Texto>
    </body></article></xml>`;

  it("INLABS: lê a matéria do XML e ignora o que não é edital de concurso", () => {
    const parsed = parseInlabsArticle(ARTICLE, "2026-10-27");
    expect(parsed).toMatchObject({
      source: "dou_inlabs",
      externalId: "99887766",
      publishedOn: "2026-10-27",
      territoryName: "Universidade Federal de Santa Catarina",
      sphere: "federal",
    });
    expect(parsed?.excerpt).toContain("abertura de inscrições do concurso público");
    expect(parsed?.excerpt).not.toContain("<p>");
    expect(parseInlabsArticle(ARTICLE.replaceAll("concurso", "pregão"), "2026-10-27")).toBeNull();
  });

  it("INLABS: faz login, baixa o ZIP da seção 3 e trata dia sem edição (404)", async () => {
    const zip = zipSync({ "materia-1.xml": strToU8(ARTICLE), "imagem.jpg": new Uint8Array([1, 2]) });
    const calls: { url: string; headers: Record<string, string> }[] = [];
    const fetchFn = async (url: string, init?: RequestInit) => {
      calls.push({ url, headers: (init?.headers ?? {}) as Record<string, string> });
      if (url.endsWith("/logar.php")) {
        return new Response("", {
          status: 302,
          headers: { "set-cookie": "inlabs_session_cookie=abc123; path=/" },
        });
      }
      if (url.includes("2026-10-25")) return new Response("", { status: 404 });
      return new Response(zip, { status: 200 });
    };
    const connector = new DouInlabsConnector("eu@exemplo.com", "senha", fetchFn);
    const docs = await connector.fetchDay("2026-10-27");
    expect(docs).toHaveLength(1);
    expect(calls[1]?.url).toBe("https://inlabs.in.gov.br/index.php?p=2026-10-27&dl=2026-10-27-DO3.zip");
    expect(calls[1]?.headers.cookie).toBe("inlabs_session_cookie=abc123");
    expect(calls[1]?.headers.origem).toBe("736372697074");
    expect(await connector.fetchDay("2026-10-25")).toEqual([]);
    expect(new DouInlabsConnector(undefined, undefined).disabledReason()).toContain("INLABS_EMAIL");
  });

  it("INLABS: login sem cookie de sessão é erro claro", async () => {
    const connector = new DouInlabsConnector(
      "eu@exemplo.com",
      "errada",
      async () => new Response("", { status: 200 }),
    );
    await expect(connector.fetchDay("2026-10-27")).rejects.toThrow("Login no INLABS falhou");
  });
});
