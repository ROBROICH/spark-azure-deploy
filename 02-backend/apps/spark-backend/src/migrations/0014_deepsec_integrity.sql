ALTER TYPE "public"."zipdiffkind" ADD VALUE 'excluded';
--> statement-breakpoint
CREATE TABLE "formal_completeness_result_receipt" (
	"project_id" uuid NOT NULL,
	"project_version" integer NOT NULL,
	"kind" varchar NOT NULL,
	"file_id" uuid NOT NULL,
	"digest" varchar(64) NOT NULL,
	"outcome" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "formal_completeness_result_receipt_pkey" PRIMARY KEY("project_id","project_version","kind","file_id","digest")
);
--> statement-breakpoint
CREATE TABLE "plausibility_result_delivery" (
	"project_id" uuid NOT NULL,
	"project_version" integer NOT NULL,
	"file_id" uuid NOT NULL,
	"audit_id" uuid NOT NULL,
	"content_digest" varchar(64) NOT NULL,
	"contradictions_found" integer NOT NULL,
	"total_occurrences" integer NOT NULL,
	"previous_records_deleted" integer NOT NULL,
	"applied_at" timestamp with time zone DEFAULT clock_timestamp() NOT NULL,
	CONSTRAINT "plausibility_result_delivery_pkey" PRIMARY KEY("project_id","project_version","file_id")
);
--> statement-breakpoint
ALTER TABLE "document_type" DROP CONSTRAINT "document_type_category_id_fkey";
--> statement-breakpoint
ALTER TABLE "argument" DROP CONSTRAINT "argument_beteiligungs_eingang_id_fkey";
--> statement-breakpoint
ALTER TABLE "beteiligungs_eingang_markdown" DROP CONSTRAINT "beteiligungs_eingang_markdown_beteiligungs_eingang_id_proj_fkey";
--> statement-breakpoint
ALTER TABLE "plausibility_note_occurrence" DROP CONSTRAINT "plausibility_note_occurrence_plausibility_note_id_fkey";
--> statement-breakpoint
ALTER TABLE "subtopic" DROP CONSTRAINT "fk_subtopic_topic_id_topic";
--> statement-breakpoint
ALTER TABLE "topic_norm" DROP CONSTRAINT "topic_norm_topic_id_fkey";
--> statement-breakpoint
ALTER TABLE "topic" DROP CONSTRAINT "topic_parent_topic_id_fkey";
--> statement-breakpoint
ALTER TABLE "plausibility_note_occurrence" ALTER COLUMN "project_id" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "fundstelle" ADD COLUMN "source_node_id" text;
--> statement-breakpoint
ALTER TABLE "fundstelle_history" ADD COLUMN "source_node_id" text;
--> statement-breakpoint
ALTER TABLE "satz" ADD COLUMN "last_suz_result_id" uuid;
--> statement-breakpoint
ALTER TABLE "satz_history" ADD COLUMN "last_suz_result_id" uuid;
--> statement-breakpoint
ALTER TABLE "table_of_content_notes_history" ADD COLUMN "generated_key" varchar(64);
--> statement-breakpoint
ALTER TABLE "table_of_content_notes" ADD COLUMN "generated_key" varchar(64);
--> statement-breakpoint
ALTER TABLE "fpp_file" ADD COLUMN "project_version" integer;
--> statement-breakpoint
ALTER TABLE "argument_history" ADD COLUMN "extraction_payload" jsonb;
--> statement-breakpoint
ALTER TABLE "argument" ADD COLUMN "extraction_payload" jsonb;
--> statement-breakpoint
ALTER TABLE "zip_file_history" ADD COLUMN "workflow_id" varchar;
--> statement-breakpoint
ALTER TABLE "zip_file_history" ADD COLUMN "run_id" varchar;
--> statement-breakpoint
ALTER TABLE "zip_file" ADD COLUMN "workflow_id" varchar;
--> statement-breakpoint
ALTER TABLE "zip_file" ADD COLUMN "run_id" varchar;
--> statement-breakpoint
ALTER TABLE "category" ADD CONSTRAINT "uq_category_project_identity" UNIQUE("id","project_id","project_version");
--> statement-breakpoint
ALTER TABLE "beteiligungs_eingang" ADD CONSTRAINT "uq_beteiligungs_eingang_project_identity" UNIQUE("id","project_id","project_version");
--> statement-breakpoint
ALTER TABLE "plausibility_note" ADD CONSTRAINT "plausibility_note_project_identity_key" UNIQUE("project_id","id","project_version");
--> statement-breakpoint
ALTER TABLE "topic" ADD CONSTRAINT "uq_topic_project_id_version" UNIQUE("project_id","id","project_version");
--> statement-breakpoint
ALTER TABLE "document_type" ADD CONSTRAINT "document_type_category_project_fkey" FOREIGN KEY ("category_id","project_id","project_version") REFERENCES "public"."category"("id","project_id","project_version") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "argument" ADD CONSTRAINT "argument_parent_project_fkey" FOREIGN KEY ("beteiligungs_eingang_id","project_id","project_version") REFERENCES "public"."beteiligungs_eingang"("id","project_id","project_version") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "beteiligungs_eingang_markdown" ADD CONSTRAINT "beteiligungs_eingang_markdown_parent_project_fkey" FOREIGN KEY ("beteiligungs_eingang_id","project_id","project_version") REFERENCES "public"."beteiligungs_eingang"("id","project_id","project_version") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "plausibility_note_occurrence" ADD CONSTRAINT "plausibility_note_occurrence_project_note_fkey" FOREIGN KEY ("project_id","plausibility_note_id","project_version") REFERENCES "public"."plausibility_note"("project_id","id","project_version") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "subtopic" ADD CONSTRAINT "subtopic_topic_project_version_fkey" FOREIGN KEY ("project_id","topic_id","project_version") REFERENCES "public"."topic"("project_id","id","project_version") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "topic_norm" ADD CONSTRAINT "topic_norm_topic_project_version_fkey" FOREIGN KEY ("project_id","topic_id","project_version") REFERENCES "public"."topic"("project_id","id","project_version") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "topic" ADD CONSTRAINT "topic_parent_project_version_fkey" FOREIGN KEY ("project_id","parent_topic_id","project_version") REFERENCES "public"."topic"("project_id","id","project_version") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE UNIQUE INDEX "uq_toc_note_generated_key" ON "table_of_content_notes" USING btree ("project_id","project_version","generated_key") WHERE "table_of_content_notes"."generated_key" IS NOT NULL;
--> statement-breakpoint
CREATE UNIQUE INDEX "uq_topic_norm_same_type_active" ON "topic_norm" USING btree ("topic_id","project_version","jurabk","type",(ARRAY["paragraph_nr", "satz", "absatz", "nummer"])) WHERE "topic_norm"."is_deleted" IS FALSE;
--> statement-breakpoint
CREATE UNIQUE INDEX "uq_topic_project_root_name_active" ON "topic" USING btree ("project_id","project_version","name") WHERE "topic"."is_deleted" IS FALSE AND "topic"."parent_topic_id" IS NULL;
--> statement-breakpoint
ALTER TABLE "plausibility_note" ADD CONSTRAINT "plausibility_note_confidence_score_check" CHECK ("plausibility_note"."confidence_score" BETWEEN 0 AND 100);
--> statement-breakpoint
ALTER TABLE "plausibility_note" ADD CONSTRAINT "plausibility_note_score_a_check" CHECK ("plausibility_note"."score_a" BETWEEN 0 AND 100);
--> statement-breakpoint
ALTER TABLE "plausibility_note" ADD CONSTRAINT "plausibility_note_score_b_check" CHECK ("plausibility_note"."score_b" BETWEEN 0 AND 100);
--> statement-breakpoint
ALTER TABLE "plausibility_note" ADD CONSTRAINT "plausibility_note_merged_count_check" CHECK ("plausibility_note"."merged_count" >= 1);
--> statement-breakpoint
ALTER TABLE "deadline" ADD CONSTRAINT "ck_deadline_date_range" CHECK ("deadline"."start_at" <= "deadline"."end_at");
