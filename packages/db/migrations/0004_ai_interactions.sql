CREATE TYPE "public"."ai_feature" AS ENUM('notice_extract', 'question_classify', 'question_explain');--> statement-breakpoint
CREATE TYPE "public"."ai_status" AS ENUM('ok', 'error', 'refused', 'invalid_output');--> statement-breakpoint
CREATE TABLE "ai_explanations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"question_id" uuid NOT NULL,
	"body" text NOT NULL,
	"model" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ai_interactions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid,
	"feature" "ai_feature" NOT NULL,
	"model" text NOT NULL,
	"input_tokens" integer DEFAULT 0 NOT NULL,
	"output_tokens" integer DEFAULT 0 NOT NULL,
	"cost_usd" numeric(10, 6),
	"status" "ai_status" NOT NULL,
	"error_code" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "ai_explanations" ADD CONSTRAINT "ai_explanations_question_id_questions_id_fk" FOREIGN KEY ("question_id") REFERENCES "public"."questions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_interactions" ADD CONSTRAINT "ai_interactions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "ai_explanations_question_unique" ON "ai_explanations" USING btree ("question_id");--> statement-breakpoint
CREATE INDEX "ai_interactions_user_idx" ON "ai_interactions" USING btree ("user_id","created_at");