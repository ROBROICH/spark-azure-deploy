ALTER TABLE "workflow_execution" ADD COLUMN "failure_code" varchar;--> statement-breakpoint
ALTER TABLE "workflow_execution" ADD COLUMN "failure_branches" jsonb;