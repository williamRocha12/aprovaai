CREATE TYPE "public"."attempt_context" AS ENUM('avulsa', 'revisao', 'simulado', 'registro_externo');--> statement-breakpoint
CREATE TYPE "public"."error_type" AS ENUM('falta_de_teoria', 'pegadinha_da_banca', 'falta_de_atencao', 'interpretacao', 'chute', 'esquecimento');--> statement-breakpoint
CREATE TYPE "public"."explanation_origin" AS ENUM('oficial', 'autoral', 'gerado_por_ia');--> statement-breakpoint
CREATE TYPE "public"."question_type" AS ENUM('multipla_escolha', 'certo_errado');--> statement-breakpoint
CREATE TYPE "public"."report_status" AS ENUM('aberto', 'aceito', 'rejeitado');--> statement-breakpoint
CREATE TYPE "public"."review_status" AS ENUM('ativa', 'dominada');--> statement-breakpoint
CREATE TABLE "question_attempts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"question_id" uuid NOT NULL,
	"answer" text,
	"is_correct" boolean NOT NULL,
	"error_type" "error_type",
	"time_spent_sec" integer,
	"context" "attempt_context" DEFAULT 'avulsa' NOT NULL,
	"mock_exam_attempt_id" uuid,
	"idempotency_key" text NOT NULL,
	"answered_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "question_attempts_time_non_negative" CHECK ("question_attempts"."time_spent_sec" IS NULL OR "question_attempts"."time_spent_sec" >= 0)
);
--> statement-breakpoint
CREATE TABLE "question_list_items" (
	"list_id" uuid NOT NULL,
	"question_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "question_lists" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"name" text NOT NULL,
	"is_favorites" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "question_notes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"question_id" uuid NOT NULL,
	"body" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "question_options" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"question_id" uuid NOT NULL,
	"label" text NOT NULL,
	"text" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "question_reports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid,
	"question_id" uuid NOT NULL,
	"reason" text NOT NULL,
	"status" "report_status" DEFAULT 'aberto' NOT NULL,
	"resolution" text,
	"resolved_by" uuid,
	"resolved_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "questions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_user_id" uuid,
	"type" "question_type" NOT NULL,
	"statement" text,
	"board_id" uuid,
	"organization" text,
	"year" integer,
	"subject_id" uuid,
	"topic_id" uuid,
	"difficulty" integer,
	"correct_answer" text,
	"explanation" text,
	"explanation_origin" "explanation_origin",
	"source_url" text,
	"external_source" text,
	"usage_permission" text,
	"annulled" boolean DEFAULT false NOT NULL,
	"content_status" "content_status" DEFAULT 'rascunho' NOT NULL,
	"content_origin" "content_origin" DEFAULT 'autoral' NOT NULL,
	"is_sample" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "questions_difficulty_range" CHECK ("questions"."difficulty" IS NULL OR "questions"."difficulty" BETWEEN 1 AND 5)
);
--> statement-breakpoint
CREATE TABLE "review_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"question_id" uuid NOT NULL,
	"stage" integer DEFAULT 0 NOT NULL,
	"due_date" date NOT NULL,
	"status" "review_status" DEFAULT 'ativa' NOT NULL,
	"last_result" boolean,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "question_attempts" ADD CONSTRAINT "question_attempts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "question_attempts" ADD CONSTRAINT "question_attempts_question_id_questions_id_fk" FOREIGN KEY ("question_id") REFERENCES "public"."questions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "question_list_items" ADD CONSTRAINT "question_list_items_list_id_question_lists_id_fk" FOREIGN KEY ("list_id") REFERENCES "public"."question_lists"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "question_list_items" ADD CONSTRAINT "question_list_items_question_id_questions_id_fk" FOREIGN KEY ("question_id") REFERENCES "public"."questions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "question_lists" ADD CONSTRAINT "question_lists_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "question_notes" ADD CONSTRAINT "question_notes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "question_notes" ADD CONSTRAINT "question_notes_question_id_questions_id_fk" FOREIGN KEY ("question_id") REFERENCES "public"."questions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "question_options" ADD CONSTRAINT "question_options_question_id_questions_id_fk" FOREIGN KEY ("question_id") REFERENCES "public"."questions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "question_reports" ADD CONSTRAINT "question_reports_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "question_reports" ADD CONSTRAINT "question_reports_question_id_questions_id_fk" FOREIGN KEY ("question_id") REFERENCES "public"."questions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "question_reports" ADD CONSTRAINT "question_reports_resolved_by_users_id_fk" FOREIGN KEY ("resolved_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "questions" ADD CONSTRAINT "questions_owner_user_id_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "questions" ADD CONSTRAINT "questions_board_id_boards_id_fk" FOREIGN KEY ("board_id") REFERENCES "public"."boards"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "questions" ADD CONSTRAINT "questions_subject_id_subjects_id_fk" FOREIGN KEY ("subject_id") REFERENCES "public"."subjects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "questions" ADD CONSTRAINT "questions_topic_id_topics_id_fk" FOREIGN KEY ("topic_id") REFERENCES "public"."topics"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_items" ADD CONSTRAINT "review_items_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_items" ADD CONSTRAINT "review_items_question_id_questions_id_fk" FOREIGN KEY ("question_id") REFERENCES "public"."questions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "question_attempts_idempotency_unique" ON "question_attempts" USING btree ("user_id","idempotency_key");--> statement-breakpoint
CREATE INDEX "question_attempts_user_date_idx" ON "question_attempts" USING btree ("user_id","answered_at");--> statement-breakpoint
CREATE INDEX "question_attempts_user_question_idx" ON "question_attempts" USING btree ("user_id","question_id");--> statement-breakpoint
CREATE UNIQUE INDEX "question_list_items_unique" ON "question_list_items" USING btree ("list_id","question_id");--> statement-breakpoint
CREATE UNIQUE INDEX "question_lists_one_favorites" ON "question_lists" USING btree ("user_id") WHERE "question_lists"."is_favorites";--> statement-breakpoint
CREATE UNIQUE INDEX "question_notes_unique" ON "question_notes" USING btree ("user_id","question_id");--> statement-breakpoint
CREATE UNIQUE INDEX "question_options_label_unique" ON "question_options" USING btree ("question_id","label");--> statement-breakpoint
CREATE INDEX "question_reports_status_idx" ON "question_reports" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "questions_catalog_idx" ON "questions" USING btree ("topic_id","board_id","year") WHERE "questions"."owner_user_id" IS NULL;--> statement-breakpoint
CREATE INDEX "questions_owner_idx" ON "questions" USING btree ("owner_user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "review_items_unique" ON "review_items" USING btree ("user_id","question_id");--> statement-breakpoint
CREATE INDEX "review_items_due_idx" ON "review_items" USING btree ("user_id","status","due_date");