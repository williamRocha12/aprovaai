CREATE TYPE "public"."goal_status" AS ENUM('ativo', 'pausado', 'encerrado');--> statement-breakpoint
DROP INDEX "user_exam_goals_one_active";--> statement-breakpoint
ALTER TABLE "user_exam_goals" ADD COLUMN "status" "goal_status" DEFAULT 'ativo' NOT NULL;--> statement-breakpoint
-- Objetivos antigos: o ativo continua ativo; os substituídos viram encerrados (histórico preservado).
UPDATE "user_exam_goals" SET "status" = CASE WHEN "is_active" THEN 'ativo'::goal_status ELSE 'encerrado'::goal_status END;--> statement-breakpoint
CREATE UNIQUE INDEX "user_exam_goals_open_notice" ON "user_exam_goals" USING btree ("user_id","notice_id") WHERE "user_exam_goals"."status" <> 'encerrado';--> statement-breakpoint
