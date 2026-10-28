CREATE TYPE "public"."exam_lead_status" AS ENUM('pendente', 'confirmado', 'descartado');--> statement-breakpoint
CREATE TYPE "public"."lead_confidence" AS ENUM('alta', 'media', 'baixa');--> statement-breakpoint
CREATE TYPE "public"."radar_source" AS ENUM('querido_diario', 'dou_inlabs');--> statement-breakpoint
CREATE TYPE "public"."source_document_status" AS ENUM('novo', 'descartado', 'processado', 'erro');--> statement-breakpoint
CREATE TYPE "public"."source_run_status" AS ENUM('ok', 'erro', 'desativado');--> statement-breakpoint
CREATE TABLE "exam_leads" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source_document_id" uuid NOT NULL,
	"status" "exam_lead_status" DEFAULT 'pendente' NOT NULL,
	"organization" text NOT NULL,
	"title" text NOT NULL,
	"sphere" "sphere" NOT NULL,
	"uf" text,
	"city" text,
	"board_name" text,
	"positions" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"registration_start" date,
	"registration_end" date,
	"exam_date" date,
	"notice_url" text,
	"evidence" text NOT NULL,
	"confidence" "lead_confidence" NOT NULL,
	"extracted_by" text NOT NULL,
	"exam_id" uuid,
	"reviewed_by" uuid,
	"reviewed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "source_documents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source" "radar_source" NOT NULL,
	"external_id" text NOT NULL,
	"url" text NOT NULL,
	"title" text NOT NULL,
	"published_on" date NOT NULL,
	"territory_name" text,
	"uf" text,
	"excerpt" text NOT NULL,
	"content_hash" text NOT NULL,
	"status" "source_document_status" DEFAULT 'novo' NOT NULL,
	"error_message" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "source_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source" "radar_source" NOT NULL,
	"day" date NOT NULL,
	"status" "source_run_status" NOT NULL,
	"documents_found" integer DEFAULT 0 NOT NULL,
	"documents_new" integer DEFAULT 0 NOT NULL,
	"error_message" text,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "exam_leads" ADD CONSTRAINT "exam_leads_source_document_id_source_documents_id_fk" FOREIGN KEY ("source_document_id") REFERENCES "public"."source_documents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exam_leads" ADD CONSTRAINT "exam_leads_exam_id_exams_id_fk" FOREIGN KEY ("exam_id") REFERENCES "public"."exams"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exam_leads" ADD CONSTRAINT "exam_leads_reviewed_by_users_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "exam_leads_status_idx" ON "exam_leads" USING btree ("status","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "exam_leads_document_unique" ON "exam_leads" USING btree ("source_document_id");--> statement-breakpoint
CREATE UNIQUE INDEX "source_documents_hash_unique" ON "source_documents" USING btree ("content_hash");--> statement-breakpoint
CREATE INDEX "source_documents_status_idx" ON "source_documents" USING btree ("status","published_on");--> statement-breakpoint
CREATE INDEX "source_runs_source_idx" ON "source_runs" USING btree ("source","started_at");