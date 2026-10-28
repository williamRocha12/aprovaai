CREATE TABLE "mock_exam_attempts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"mock_exam_id" uuid NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	"finished" boolean DEFAULT false NOT NULL,
	"result" jsonb
);
--> statement-breakpoint
CREATE TABLE "mock_exam_questions" (
	"mock_exam_id" uuid NOT NULL,
	"question_id" uuid NOT NULL,
	"sort_order" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "mock_exams" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"goal_id" uuid,
	"title" text NOT NULL,
	"config" jsonb NOT NULL,
	"scoring_type" "scoring_type" DEFAULT 'standard' NOT NULL,
	"wrong_penalty" numeric(4, 2) DEFAULT 0 NOT NULL,
	"time_limit_min" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "mock_exams_time_limit_positive" CHECK ("mock_exams"."time_limit_min" IS NULL OR "mock_exams"."time_limit_min" > 0)
);
--> statement-breakpoint
ALTER TABLE "mock_exam_attempts" ADD CONSTRAINT "mock_exam_attempts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mock_exam_attempts" ADD CONSTRAINT "mock_exam_attempts_mock_exam_id_mock_exams_id_fk" FOREIGN KEY ("mock_exam_id") REFERENCES "public"."mock_exams"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mock_exam_questions" ADD CONSTRAINT "mock_exam_questions_mock_exam_id_mock_exams_id_fk" FOREIGN KEY ("mock_exam_id") REFERENCES "public"."mock_exams"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mock_exam_questions" ADD CONSTRAINT "mock_exam_questions_question_id_questions_id_fk" FOREIGN KEY ("question_id") REFERENCES "public"."questions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mock_exams" ADD CONSTRAINT "mock_exams_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mock_exams" ADD CONSTRAINT "mock_exams_goal_id_user_exam_goals_id_fk" FOREIGN KEY ("goal_id") REFERENCES "public"."user_exam_goals"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "mock_exam_attempts_user_idx" ON "mock_exam_attempts" USING btree ("user_id","started_at");--> statement-breakpoint
CREATE UNIQUE INDEX "mock_exam_questions_unique" ON "mock_exam_questions" USING btree ("mock_exam_id","question_id");--> statement-breakpoint
CREATE INDEX "mock_exams_user_idx" ON "mock_exams" USING btree ("user_id","created_at");