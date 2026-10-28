CREATE TYPE "public"."job_status" AS ENUM('pendente', 'executando', 'concluido', 'falhou');--> statement-breakpoint
CREATE TYPE "public"."classification_confidence" AS ENUM('alta', 'media', 'baixa');--> statement-breakpoint
CREATE TYPE "public"."past_exam_status" AS ENUM('pendente', 'processando', 'em_revisao', 'processado', 'erro');--> statement-breakpoint
CREATE TABLE "jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"type" text NOT NULL,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"status" "job_status" DEFAULT 'pendente' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"max_attempts" integer DEFAULT 3 NOT NULL,
	"run_after" timestamp with time zone DEFAULT now() NOT NULL,
	"dedupe_key" text,
	"locked_at" timestamp with time zone,
	"last_error" text,
	"finished_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "past_exam_questions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"past_exam_id" uuid NOT NULL,
	"number" integer NOT NULL,
	"type" "question_type" NOT NULL,
	"statement" text NOT NULL,
	"options" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"correct_answer" text,
	"annulled" boolean DEFAULT false NOT NULL,
	"subject_id" uuid,
	"topic_id" uuid,
	"confidence" "classification_confidence",
	"needs_review" boolean DEFAULT true NOT NULL,
	"reviewed_by" uuid,
	"question_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "past_exams" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"board_id" uuid NOT NULL,
	"organization" text NOT NULL,
	"position_title" text NOT NULL,
	"year" integer NOT NULL,
	"area" text,
	"source_url" text NOT NULL,
	"answer_key_url" text,
	"reference_notice_id" uuid,
	"content_hash" text NOT NULL,
	"exam_text" text NOT NULL,
	"answer_key_text" text DEFAULT '' NOT NULL,
	"status" "past_exam_status" DEFAULT 'pendente' NOT NULL,
	"parse_warnings" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"error_message" text,
	"uploaded_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "past_exams_year_range" CHECK ("past_exams"."year" BETWEEN 1990 AND 2100)
);
--> statement-breakpoint
ALTER TABLE "past_exam_questions" ADD CONSTRAINT "past_exam_questions_past_exam_id_past_exams_id_fk" FOREIGN KEY ("past_exam_id") REFERENCES "public"."past_exams"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "past_exam_questions" ADD CONSTRAINT "past_exam_questions_subject_id_subjects_id_fk" FOREIGN KEY ("subject_id") REFERENCES "public"."subjects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "past_exam_questions" ADD CONSTRAINT "past_exam_questions_topic_id_topics_id_fk" FOREIGN KEY ("topic_id") REFERENCES "public"."topics"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "past_exam_questions" ADD CONSTRAINT "past_exam_questions_reviewed_by_users_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "past_exam_questions" ADD CONSTRAINT "past_exam_questions_question_id_questions_id_fk" FOREIGN KEY ("question_id") REFERENCES "public"."questions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "past_exams" ADD CONSTRAINT "past_exams_board_id_boards_id_fk" FOREIGN KEY ("board_id") REFERENCES "public"."boards"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "past_exams" ADD CONSTRAINT "past_exams_reference_notice_id_exam_notices_id_fk" FOREIGN KEY ("reference_notice_id") REFERENCES "public"."exam_notices"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "past_exams" ADD CONSTRAINT "past_exams_uploaded_by_users_id_fk" FOREIGN KEY ("uploaded_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "jobs_queue_idx" ON "jobs" USING btree ("status","run_after");--> statement-breakpoint
CREATE UNIQUE INDEX "jobs_dedupe_unique" ON "jobs" USING btree ("dedupe_key") WHERE "jobs"."dedupe_key" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "past_exam_questions_number_unique" ON "past_exam_questions" USING btree ("past_exam_id","number");--> statement-breakpoint
CREATE INDEX "past_exam_questions_topic_idx" ON "past_exam_questions" USING btree ("topic_id");--> statement-breakpoint
CREATE UNIQUE INDEX "past_exams_hash_unique" ON "past_exams" USING btree ("content_hash");--> statement-breakpoint
CREATE INDEX "past_exams_board_idx" ON "past_exams" USING btree ("board_id","year");