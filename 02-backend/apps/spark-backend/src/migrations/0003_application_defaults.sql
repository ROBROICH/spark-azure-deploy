ALTER TABLE "risks" ALTER COLUMN "status" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "subtopic" ALTER COLUMN "show_in_mvp" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "subtopic" ALTER COLUMN "show_in_ewm" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "subtopic" ALTER COLUMN "show_in_beschluss" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "topic_history" ALTER COLUMN "show_in_ewm" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "topic_history" ALTER COLUMN "show_in_beschluss" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "topic" ALTER COLUMN "show_in_mvp" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "topic" ALTER COLUMN "show_in_ewm" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "topic" ALTER COLUMN "show_in_beschluss" DROP DEFAULT;