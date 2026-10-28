CREATE TYPE "public"."content_origin" AS ENUM('oficial', 'autoral', 'usuario', 'gerado_por_ia');--> statement-breakpoint
CREATE TYPE "public"."content_status" AS ENUM('rascunho', 'em_revisao', 'validado');--> statement-breakpoint
CREATE TYPE "public"."exam_situation" AS ENUM('previsto', 'autorizado', 'banca_definida', 'edital_publicado', 'encerrado');--> statement-breakpoint
CREATE TYPE "public"."scoring_type" AS ENUM('standard', 'wrong_cancels_right');--> statement-breakpoint
CREATE TYPE "public"."sphere" AS ENUM('federal', 'estadual', 'municipal');--> statement-breakpoint
CREATE TYPE "public"."subject_kind" AS ENUM('basica', 'especifica');--> statement-breakpoint
CREATE TYPE "public"."cycle_phase" AS ENUM('base', 'inicial', 'intermediaria', 'reta_final');--> statement-breakpoint
CREATE TYPE "public"."cycle_status" AS ENUM('ativo', 'encerrado');--> statement-breakpoint
CREATE TYPE "public"."session_source" AS ENUM('manual', 'cronometro', 'pomodoro');--> statement-breakpoint
CREATE TYPE "public"."task_status" AS ENUM('pendente', 'em_andamento', 'concluida', 'pulada', 'cancelada');--> statement-breakpoint
CREATE TYPE "public"."task_type" AS ENUM('teoria', 'questoes', 'revisao', 'lei_seca', 'simulado', 'analise_erros');--> statement-breakpoint
CREATE TYPE "public"."topic_study_status" AS ENUM('nao_iniciado', 'em_andamento', 'coberto');--> statement-breakpoint
CREATE TABLE "boards" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "boards_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "exam_notices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"exam_id" uuid NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"title" text NOT NULL,
	"published_at" date,
	"official_url" text,
	"is_current" boolean DEFAULT true NOT NULL,
	"scoring_type" "scoring_type" DEFAULT 'standard' NOT NULL,
	"wrong_penalty" numeric(4, 2) DEFAULT 0 NOT NULL,
	"owner_user_id" uuid,
	"content_status" "content_status" DEFAULT 'rascunho' NOT NULL,
	"content_origin" "content_origin" DEFAULT 'autoral' NOT NULL,
	"source_url" text,
	"is_sample" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "exam_positions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"exam_id" uuid NOT NULL,
	"title" text NOT NULL,
	"education_level" "education_level",
	"salary" numeric(12, 2),
	"salary_confirmed" boolean DEFAULT false NOT NULL,
	"vacancies" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "exams" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"board_id" uuid,
	"title" text NOT NULL,
	"sphere" "sphere" NOT NULL,
	"uf" text,
	"city" text,
	"education_level" "education_level",
	"situation" "exam_situation" DEFAULT 'previsto' NOT NULL,
	"situation_confirmed" boolean DEFAULT false NOT NULL,
	"notice_date" date,
	"registration_start" date,
	"registration_end" date,
	"exam_date" date,
	"dates_confirmed" boolean DEFAULT false NOT NULL,
	"official_url" text,
	"last_verified_at" timestamp with time zone,
	"owner_user_id" uuid,
	"content_status" "content_status" DEFAULT 'rascunho' NOT NULL,
	"content_origin" "content_origin" DEFAULT 'autoral' NOT NULL,
	"source_url" text,
	"is_sample" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notice_subjects" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"notice_id" uuid NOT NULL,
	"position_id" uuid,
	"subject_id" uuid NOT NULL,
	"weight" numeric(6, 2) DEFAULT 1 NOT NULL,
	"question_count" integer,
	"kind" "subject_kind" DEFAULT 'basica' NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "notice_subjects_weight_non_negative" CHECK ("notice_subjects"."weight" >= 0),
	CONSTRAINT "notice_subjects_question_count_non_negative" CHECK ("notice_subjects"."question_count" IS NULL OR "notice_subjects"."question_count" >= 0)
);
--> statement-breakpoint
CREATE TABLE "notice_topics" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"notice_subject_id" uuid NOT NULL,
	"topic_id" uuid NOT NULL,
	"relevance" integer DEFAULT 3 NOT NULL,
	"raw_text" text,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "notice_topics_relevance_range" CHECK ("notice_topics"."relevance" BETWEEN 1 AND 5)
);
--> statement-breakpoint
CREATE TABLE "organizations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"acronym" text,
	"sphere" "sphere" NOT NULL,
	"uf" text,
	"city" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "subjects" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"owner_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "topics" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"subject_id" uuid NOT NULL,
	"parent_topic_id" uuid,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"owner_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "study_cycles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"goal_id" uuid NOT NULL,
	"number" integer NOT NULL,
	"phase" "cycle_phase" NOT NULL,
	"start_date" date NOT NULL,
	"end_date" date NOT NULL,
	"status" "cycle_status" DEFAULT 'ativo' NOT NULL,
	"input_hash" text NOT NULL,
	"conflicts" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"warnings" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "study_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"task_id" uuid,
	"notice_topic_id" uuid,
	"started_at" timestamp with time zone NOT NULL,
	"ended_at" timestamp with time zone,
	"net_minutes" integer NOT NULL,
	"source" "session_source" DEFAULT 'manual' NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "study_sessions_net_minutes_positive" CHECK ("study_sessions"."net_minutes" > 0)
);
--> statement-breakpoint
CREATE TABLE "study_tasks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"goal_id" uuid NOT NULL,
	"cycle_id" uuid NOT NULL,
	"notice_topic_id" uuid,
	"type" "task_type" NOT NULL,
	"suggested_date" date NOT NULL,
	"order_index" integer NOT NULL,
	"duration_min" integer NOT NULL,
	"priority" numeric(6, 4) DEFAULT 0 NOT NULL,
	"justification" text NOT NULL,
	"status" "task_status" DEFAULT 'pendente' NOT NULL,
	"completed_at" timestamp with time zone,
	"superseded_by_cycle_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "study_tasks_duration_positive" CHECK ("study_tasks"."duration_min" > 0)
);
--> statement-breakpoint
CREATE TABLE "user_exam_goals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"exam_id" uuid NOT NULL,
	"position_id" uuid,
	"notice_id" uuid NOT NULL,
	"target_exam_date" date,
	"weekly_availability" jsonb NOT NULL,
	"block_minutes" integer DEFAULT 50 NOT NULL,
	"priority_weights" jsonb,
	"review_intervals" integer[] DEFAULT '{1,7,30}'::integer[] NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_exam_goals_block_range" CHECK ("user_exam_goals"."block_minutes" BETWEEN 15 AND 240)
);
--> statement-breakpoint
CREATE TABLE "user_topic_states" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"goal_id" uuid NOT NULL,
	"notice_topic_id" uuid NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"self_assessment" integer,
	"status" "topic_study_status" DEFAULT 'nao_iniciado' NOT NULL,
	"last_studied_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_topic_states_self_assessment_range" CHECK ("user_topic_states"."self_assessment" IS NULL OR "user_topic_states"."self_assessment" BETWEEN 0 AND 100)
);
--> statement-breakpoint
ALTER TABLE "exam_notices" ADD CONSTRAINT "exam_notices_exam_id_exams_id_fk" FOREIGN KEY ("exam_id") REFERENCES "public"."exams"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exam_notices" ADD CONSTRAINT "exam_notices_owner_user_id_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exam_positions" ADD CONSTRAINT "exam_positions_exam_id_exams_id_fk" FOREIGN KEY ("exam_id") REFERENCES "public"."exams"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exams" ADD CONSTRAINT "exams_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exams" ADD CONSTRAINT "exams_board_id_boards_id_fk" FOREIGN KEY ("board_id") REFERENCES "public"."boards"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exams" ADD CONSTRAINT "exams_owner_user_id_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notice_subjects" ADD CONSTRAINT "notice_subjects_notice_id_exam_notices_id_fk" FOREIGN KEY ("notice_id") REFERENCES "public"."exam_notices"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notice_subjects" ADD CONSTRAINT "notice_subjects_position_id_exam_positions_id_fk" FOREIGN KEY ("position_id") REFERENCES "public"."exam_positions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notice_subjects" ADD CONSTRAINT "notice_subjects_subject_id_subjects_id_fk" FOREIGN KEY ("subject_id") REFERENCES "public"."subjects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notice_topics" ADD CONSTRAINT "notice_topics_notice_subject_id_notice_subjects_id_fk" FOREIGN KEY ("notice_subject_id") REFERENCES "public"."notice_subjects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notice_topics" ADD CONSTRAINT "notice_topics_topic_id_topics_id_fk" FOREIGN KEY ("topic_id") REFERENCES "public"."topics"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subjects" ADD CONSTRAINT "subjects_owner_user_id_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "topics" ADD CONSTRAINT "topics_subject_id_subjects_id_fk" FOREIGN KEY ("subject_id") REFERENCES "public"."subjects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "topics" ADD CONSTRAINT "topics_parent_topic_id_topics_id_fk" FOREIGN KEY ("parent_topic_id") REFERENCES "public"."topics"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "topics" ADD CONSTRAINT "topics_owner_user_id_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "study_cycles" ADD CONSTRAINT "study_cycles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "study_cycles" ADD CONSTRAINT "study_cycles_goal_id_user_exam_goals_id_fk" FOREIGN KEY ("goal_id") REFERENCES "public"."user_exam_goals"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "study_sessions" ADD CONSTRAINT "study_sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "study_sessions" ADD CONSTRAINT "study_sessions_task_id_study_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."study_tasks"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "study_sessions" ADD CONSTRAINT "study_sessions_notice_topic_id_notice_topics_id_fk" FOREIGN KEY ("notice_topic_id") REFERENCES "public"."notice_topics"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "study_tasks" ADD CONSTRAINT "study_tasks_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "study_tasks" ADD CONSTRAINT "study_tasks_goal_id_user_exam_goals_id_fk" FOREIGN KEY ("goal_id") REFERENCES "public"."user_exam_goals"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "study_tasks" ADD CONSTRAINT "study_tasks_cycle_id_study_cycles_id_fk" FOREIGN KEY ("cycle_id") REFERENCES "public"."study_cycles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "study_tasks" ADD CONSTRAINT "study_tasks_notice_topic_id_notice_topics_id_fk" FOREIGN KEY ("notice_topic_id") REFERENCES "public"."notice_topics"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "study_tasks" ADD CONSTRAINT "study_tasks_superseded_by_cycle_id_study_cycles_id_fk" FOREIGN KEY ("superseded_by_cycle_id") REFERENCES "public"."study_cycles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_exam_goals" ADD CONSTRAINT "user_exam_goals_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_exam_goals" ADD CONSTRAINT "user_exam_goals_exam_id_exams_id_fk" FOREIGN KEY ("exam_id") REFERENCES "public"."exams"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_exam_goals" ADD CONSTRAINT "user_exam_goals_position_id_exam_positions_id_fk" FOREIGN KEY ("position_id") REFERENCES "public"."exam_positions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_exam_goals" ADD CONSTRAINT "user_exam_goals_notice_id_exam_notices_id_fk" FOREIGN KEY ("notice_id") REFERENCES "public"."exam_notices"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_topic_states" ADD CONSTRAINT "user_topic_states_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_topic_states" ADD CONSTRAINT "user_topic_states_goal_id_user_exam_goals_id_fk" FOREIGN KEY ("goal_id") REFERENCES "public"."user_exam_goals"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_topic_states" ADD CONSTRAINT "user_topic_states_notice_topic_id_notice_topics_id_fk" FOREIGN KEY ("notice_topic_id") REFERENCES "public"."notice_topics"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "exam_notices_version_unique" ON "exam_notices" USING btree ("exam_id","version");--> statement-breakpoint
CREATE INDEX "exams_catalog_idx" ON "exams" USING btree ("situation","uf","board_id") WHERE "exams"."owner_user_id" IS NULL;--> statement-breakpoint
CREATE INDEX "exams_owner_idx" ON "exams" USING btree ("owner_user_id");--> statement-breakpoint
CREATE INDEX "notice_subjects_notice_idx" ON "notice_subjects" USING btree ("notice_id");--> statement-breakpoint
CREATE INDEX "notice_topics_subject_idx" ON "notice_topics" USING btree ("notice_subject_id");--> statement-breakpoint
CREATE UNIQUE INDEX "subjects_slug_catalog_unique" ON "subjects" USING btree ("slug") WHERE "subjects"."owner_user_id" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "subjects_slug_owner_unique" ON "subjects" USING btree ("slug","owner_user_id") WHERE "subjects"."owner_user_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "topics_subject_idx" ON "topics" USING btree ("subject_id");--> statement-breakpoint
CREATE UNIQUE INDEX "topics_slug_catalog_unique" ON "topics" USING btree ("subject_id","parent_topic_id","slug") WHERE "topics"."owner_user_id" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "topics_slug_owner_unique" ON "topics" USING btree ("subject_id","parent_topic_id","slug","owner_user_id") WHERE "topics"."owner_user_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "study_cycles_goal_idx" ON "study_cycles" USING btree ("goal_id","number");--> statement-breakpoint
CREATE UNIQUE INDEX "study_cycles_one_active" ON "study_cycles" USING btree ("goal_id") WHERE "study_cycles"."status" = 'ativo';--> statement-breakpoint
CREATE INDEX "study_sessions_user_date_idx" ON "study_sessions" USING btree ("user_id","started_at");--> statement-breakpoint
CREATE INDEX "study_tasks_queue_idx" ON "study_tasks" USING btree ("user_id","cycle_id","status","order_index");--> statement-breakpoint
CREATE INDEX "study_tasks_date_idx" ON "study_tasks" USING btree ("user_id","suggested_date");--> statement-breakpoint
CREATE UNIQUE INDEX "user_exam_goals_one_active" ON "user_exam_goals" USING btree ("user_id") WHERE "user_exam_goals"."is_active";--> statement-breakpoint
CREATE UNIQUE INDEX "user_topic_states_unique" ON "user_topic_states" USING btree ("goal_id","notice_topic_id");--> statement-breakpoint
CREATE INDEX "user_topic_states_user_idx" ON "user_topic_states" USING btree ("user_id");