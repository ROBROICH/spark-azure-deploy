CREATE TYPE "public"."status_enum" AS ENUM('OPEN', 'CORRECTED', 'IGNORED');--> statement-breakpoint
CREATE TYPE "public"."commentprocessstep" AS ENUM('unsorted', 'formalCompletenessCheck', 'plausibilityCheck', 'materialCompletenessCheck', 'legalReview');--> statement-breakpoint
CREATE TYPE "public"."commentsourcetype" AS ENUM('tableOfContents', 'requiredDocuments', 'contradiction', 'materialLaw', 'materialNorm', 'materialSatz', 'materialFundstelle', 'manual');--> statement-breakpoint
CREATE TYPE "public"."feedbackrating" AS ENUM('POSITIVE', 'NEGATIVE');--> statement-breakpoint
CREATE TYPE "public"."argumentstatus" AS ENUM('open', 'subtopic_reviewed', 'done');--> statement-breakpoint
CREATE TYPE "public"."beteiligungtyp" AS ENUM('STELLUNGNAHME', 'NATURSCHUTZ', 'EINWENDUNG');--> statement-breakpoint
CREATE TYPE "public"."classificationstatus" AS ENUM('loading', 'done', 'failed');--> statement-breakpoint
CREATE TYPE "public"."extractionstatus" AS ENUM('SUCCESS', 'FAILED', 'PROMPT_INJECTION_ERROR', 'loading');--> statement-breakpoint
CREATE TYPE "public"."priority" AS ENUM('must', 'should');--> statement-breakpoint
CREATE TYPE "public"."processstep" AS ENUM('formalCompletenessCheck', 'plausibilityCheck', 'materialCompletenessCheck', 'legalReview');--> statement-breakpoint
CREATE TYPE "public"."sourcetype" AS ENUM('tableOfContents', 'requiredDocuments', 'contradiction', 'materialLaw', 'materialNorm', 'materialSatz', 'materialFundstelle', 'manual');--> statement-breakpoint
CREATE TYPE "public"."workflow_status" AS ENUM('pending', 'running', 'failed', 'completed', 'terminated', 'cancelled', 'timed_out');--> statement-breakpoint
CREATE TYPE "public"."filetypeenum" AS ENUM('DOCUMENT', 'TEMPLATE', 'LAW_DATA', 'CONTENT_EXTRACTION', 'TEMPORAL_CHECKPOINT', 'ZIP', 'EWMS_ZIP', 'EWMS_DOCUMENT', 'ERWIDERUNGS_IMPORT', 'ERWIDERUNGS_EXPORT', 'REDACTED_DOCUMENT');--> statement-breakpoint
CREATE TYPE "public"."updatetype" AS ENUM('AUTOMATED', 'MANUAL');--> statement-breakpoint
CREATE TYPE "public"."workflowstatusenum" AS ENUM('PENDING', 'RUNNING', 'COMPLETED', 'FAILED', 'CANCELED', 'TERMINATED', 'CONTINUED_AS_NEW', 'TIMED_OUT', 'REQUIRES_APPROVAL');--> statement-breakpoint
CREATE TYPE "public"."zipapprovalstatus" AS ENUM('REQUIRES_APPROVAL', 'APPROVING', 'APPROVED', 'FAILED_APPROVE', 'REJECTED');--> statement-breakpoint
CREATE TYPE "public"."zipdiffkind" AS ENUM('new', 'deleted', 'changed', 'renamed', 'unchanged');--> statement-breakpoint
CREATE TABLE "risks" (
	"id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"problem" text NOT NULL,
	"recommendation" text,
	"quote" text,
	"severity" integer NOT NULL,
	"implication" text NOT NULL,
	"status" "status_enum" DEFAULT 'OPEN' NOT NULL,
	"created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"updated_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"vae_node_id" uuid NOT NULL,
	"is_deleted" boolean DEFAULT false NOT NULL,
	"frontend_parent_ids" varchar[] DEFAULT '{}' NOT NULL,
	"update_type" "updatetype" DEFAULT 'AUTOMATED',
	"sys_period" "tstzrange" DEFAULT tstzrange(current_timestamp, null) NOT NULL,
	"project_version" integer DEFAULT 1 NOT NULL,
	"is_outdated" boolean DEFAULT false NOT NULL,
	CONSTRAINT "risks_pkey" PRIMARY KEY("id","project_version"),
	CONSTRAINT "ck_risks_severity_range" CHECK ("risks"."severity" >= 1 AND "risks"."severity" <= 10)
);
--> statement-breakpoint
CREATE TABLE "risks_history" (
	"id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"category" text,
	"problem" text NOT NULL,
	"recommendation" text,
	"quote" text,
	"severity" integer NOT NULL,
	"implication" text NOT NULL,
	"status" "status_enum" NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	"vae_node_id" uuid,
	"is_deleted" boolean NOT NULL,
	"frontend_parent_ids" varchar[] NOT NULL,
	"update_type" "updatetype",
	"sys_period" "tstzrange" NOT NULL,
	"project_version" integer,
	"is_outdated" boolean
);
--> statement-breakpoint
CREATE TABLE "vae_node_history" (
	"id" uuid NOT NULL,
	"title" varchar NOT NULL,
	"text" text NOT NULL,
	"checked_by_assignee" boolean NOT NULL,
	"checked_by_leader" boolean NOT NULL,
	"checked_at_assignee" timestamp with time zone,
	"checked_at_leader" timestamp with time zone,
	"parent_vae_node_id" uuid,
	"order" double precision NOT NULL,
	"is_hidden" boolean NOT NULL,
	"can_add_child" boolean NOT NULL,
	"project_id" uuid NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	"is_deleted" boolean NOT NULL,
	"frontend_parent_ids" varchar[] NOT NULL,
	"update_type" "updatetype",
	"assignee" uuid,
	"topic_id" uuid,
	"template_id" uuid,
	"sys_period" "tstzrange" NOT NULL,
	"subtopic_id" uuid,
	"project_version" integer,
	"is_outdated" boolean
);
--> statement-breakpoint
CREATE TABLE "vae_node" (
	"id" uuid NOT NULL,
	"title" varchar NOT NULL,
	"text" text NOT NULL,
	"checked_by_assignee" boolean DEFAULT false NOT NULL,
	"checked_by_leader" boolean DEFAULT false NOT NULL,
	"checked_at_assignee" timestamp with time zone,
	"checked_at_leader" timestamp with time zone,
	"parent_vae_node_id" uuid,
	"order" double precision DEFAULT 0 NOT NULL,
	"is_hidden" boolean DEFAULT false NOT NULL,
	"can_add_child" boolean DEFAULT false NOT NULL,
	"project_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"updated_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"is_deleted" boolean DEFAULT false NOT NULL,
	"frontend_parent_ids" varchar[] DEFAULT '{}' NOT NULL,
	"update_type" "updatetype" DEFAULT 'AUTOMATED',
	"assignee" uuid,
	"topic_id" uuid,
	"template_id" uuid,
	"sys_period" "tstzrange" DEFAULT tstzrange(current_timestamp, null) NOT NULL,
	"subtopic_id" uuid,
	"project_version" integer DEFAULT 1 NOT NULL,
	"is_outdated" boolean DEFAULT false NOT NULL,
	CONSTRAINT "vae_node_pkey" PRIMARY KEY("id","project_version")
);
--> statement-breakpoint
CREATE TABLE "comment_history" (
	"id" uuid NOT NULL,
	"title" varchar NOT NULL,
	"content" text NOT NULL,
	"project_id" uuid NOT NULL,
	"process_step" "commentprocessstep" NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	"source_type" "commentsourcetype",
	"source_item_id" varchar(255),
	"sys_period" "tstzrange" NOT NULL
);
--> statement-breakpoint
CREATE TABLE "comment" (
	"id" uuid PRIMARY KEY NOT NULL,
	"title" varchar NOT NULL,
	"content" text NOT NULL,
	"project_id" uuid NOT NULL,
	"process_step" "commentprocessstep" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"source_type" "commentsourcetype",
	"source_item_id" varchar(255),
	"sys_period" "tstzrange" DEFAULT tstzrange(current_timestamp, null) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "absatz" (
	"norm_id" uuid NOT NULL,
	"absatz_nr" varchar NOT NULL,
	"text" text NOT NULL,
	"id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"updated_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"is_deleted" boolean DEFAULT false NOT NULL,
	"update_type" "updatetype" DEFAULT 'AUTOMATED',
	"frontend_parent_ids" varchar[] DEFAULT '{}' NOT NULL,
	"sys_period" "tstzrange" DEFAULT tstzrange(CURRENT_TIMESTAMP, null) NOT NULL,
	"project_version" integer DEFAULT 1 NOT NULL,
	"is_outdated" boolean DEFAULT false NOT NULL,
	CONSTRAINT "absatz_pkey" PRIMARY KEY("id","project_version")
);
--> statement-breakpoint
CREATE TABLE "absatz_history" (
	"norm_id" uuid NOT NULL,
	"absatz_nr" varchar NOT NULL,
	"text" text NOT NULL,
	"id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	"is_deleted" boolean NOT NULL,
	"update_type" "updatetype",
	"frontend_parent_ids" varchar[] NOT NULL,
	"sys_period" "tstzrange" NOT NULL,
	"project_version" integer,
	"is_outdated" boolean
);
--> statement-breakpoint
CREATE TABLE "adressat" (
	"rechtsfolge_id" uuid NOT NULL,
	"entscheidung" varchar NOT NULL,
	"reasoning" text,
	"id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"updated_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"is_deleted" boolean DEFAULT false NOT NULL,
	"update_type" "updatetype" DEFAULT 'AUTOMATED',
	"frontend_parent_ids" varchar[] DEFAULT '{}' NOT NULL,
	"sys_period" "tstzrange" DEFAULT tstzrange(CURRENT_TIMESTAMP, null) NOT NULL,
	"project_version" integer DEFAULT 1 NOT NULL,
	"is_outdated" boolean DEFAULT false NOT NULL,
	CONSTRAINT "adressat_pkey" PRIMARY KEY("id","project_version")
);
--> statement-breakpoint
CREATE TABLE "adressat_history" (
	"rechtsfolge_id" uuid NOT NULL,
	"entscheidung" varchar NOT NULL,
	"reasoning" text,
	"id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	"is_deleted" boolean NOT NULL,
	"update_type" "updatetype",
	"frontend_parent_ids" varchar[] NOT NULL,
	"sys_period" "tstzrange" NOT NULL,
	"project_version" integer,
	"is_outdated" boolean
);
--> statement-breakpoint
CREATE TABLE "atomares_tbm" (
	"satz_id" uuid NOT NULL,
	"text" text NOT NULL,
	"prueffrage" text,
	"pruefgegenstand" text,
	"id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"updated_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"is_deleted" boolean DEFAULT false NOT NULL,
	"update_type" "updatetype" DEFAULT 'AUTOMATED',
	"frontend_parent_ids" varchar[] DEFAULT '{}' NOT NULL,
	"sys_period" "tstzrange" DEFAULT tstzrange(CURRENT_TIMESTAMP, null) NOT NULL,
	"project_version" integer DEFAULT 1 NOT NULL,
	"is_outdated" boolean DEFAULT false NOT NULL,
	CONSTRAINT "atomares_tbm_pkey" PRIMARY KEY("id","project_version")
);
--> statement-breakpoint
CREATE TABLE "atomares_tbm_history" (
	"satz_id" uuid NOT NULL,
	"text" text NOT NULL,
	"prueffrage" text,
	"pruefgegenstand" text,
	"id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	"is_deleted" boolean NOT NULL,
	"update_type" "updatetype",
	"frontend_parent_ids" varchar[] NOT NULL,
	"sys_period" "tstzrange" NOT NULL,
	"project_version" integer,
	"is_outdated" boolean
);
--> statement-breakpoint
CREATE TABLE "auslegungsvorschlag" (
	"unbestimmter_rechtsbegriff_id" uuid NOT NULL,
	"methode" varchar NOT NULL,
	"text" text NOT NULL,
	"id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"updated_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"is_deleted" boolean DEFAULT false NOT NULL,
	"update_type" "updatetype" DEFAULT 'AUTOMATED',
	"frontend_parent_ids" varchar[] DEFAULT '{}' NOT NULL,
	"sys_period" "tstzrange" DEFAULT tstzrange(CURRENT_TIMESTAMP, null) NOT NULL,
	"project_version" integer DEFAULT 1 NOT NULL,
	"is_outdated" boolean DEFAULT false NOT NULL,
	CONSTRAINT "auslegungsvorschlag_pkey" PRIMARY KEY("id","project_version")
);
--> statement-breakpoint
CREATE TABLE "auslegungsvorschlag_history" (
	"unbestimmter_rechtsbegriff_id" uuid NOT NULL,
	"methode" varchar NOT NULL,
	"text" text NOT NULL,
	"id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	"is_deleted" boolean NOT NULL,
	"update_type" "updatetype",
	"frontend_parent_ids" varchar[] NOT NULL,
	"sys_period" "tstzrange" NOT NULL,
	"project_version" integer,
	"is_outdated" boolean
);
--> statement-breakpoint
CREATE TABLE "bestimmter_rechtsbegriff" (
	"atomares_tbm_id" uuid NOT NULL,
	"begriff" varchar NOT NULL,
	"id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"updated_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"is_deleted" boolean DEFAULT false NOT NULL,
	"update_type" "updatetype" DEFAULT 'AUTOMATED',
	"frontend_parent_ids" varchar[] DEFAULT '{}' NOT NULL,
	"sys_period" "tstzrange" DEFAULT tstzrange(CURRENT_TIMESTAMP, null) NOT NULL,
	"project_version" integer DEFAULT 1 NOT NULL,
	"is_outdated" boolean DEFAULT false NOT NULL,
	CONSTRAINT "bestimmter_rechtsbegriff_pkey" PRIMARY KEY("id","project_version")
);
--> statement-breakpoint
CREATE TABLE "bestimmter_rechtsbegriff_history" (
	"atomares_tbm_id" uuid NOT NULL,
	"begriff" varchar NOT NULL,
	"id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	"is_deleted" boolean NOT NULL,
	"update_type" "updatetype",
	"frontend_parent_ids" varchar[] NOT NULL,
	"sys_period" "tstzrange" NOT NULL,
	"project_version" integer,
	"is_outdated" boolean
);
--> statement-breakpoint
CREATE TABLE "bewertung" (
	"satz_id" uuid NOT NULL,
	"result" varchar NOT NULL,
	"kurzform" text,
	"norm" text NOT NULL,
	"markdown_text_id" uuid NOT NULL,
	"id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"updated_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"is_deleted" boolean DEFAULT false NOT NULL,
	"update_type" "updatetype" DEFAULT 'AUTOMATED',
	"frontend_parent_ids" varchar[] DEFAULT '{}' NOT NULL,
	"sys_period" "tstzrange" DEFAULT tstzrange(CURRENT_TIMESTAMP, null) NOT NULL,
	"is_outdated" boolean DEFAULT false NOT NULL,
	"project_version" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "bewertung_pkey" PRIMARY KEY("id","project_version")
);
--> statement-breakpoint
CREATE TABLE "bewertung_history" (
	"satz_id" uuid NOT NULL,
	"result" varchar NOT NULL,
	"kurzform" text,
	"norm" text NOT NULL,
	"markdown_text_id" uuid NOT NULL,
	"id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	"is_deleted" boolean NOT NULL,
	"update_type" "updatetype",
	"frontend_parent_ids" varchar[] NOT NULL,
	"sys_period" "tstzrange" NOT NULL,
	"is_outdated" boolean,
	"project_version" integer
);
--> statement-breakpoint
CREATE TABLE "bewertung_kapitel" (
	"bewertung_id" uuid NOT NULL,
	"titel" text NOT NULL,
	"markdown" text NOT NULL,
	"kurzform" text,
	"order" integer NOT NULL,
	"id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"updated_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"is_deleted" boolean DEFAULT false NOT NULL,
	"update_type" "updatetype" DEFAULT 'AUTOMATED',
	"frontend_parent_ids" varchar[] DEFAULT '{}' NOT NULL,
	"sys_period" "tstzrange" DEFAULT tstzrange(CURRENT_TIMESTAMP, null) NOT NULL,
	"project_version" integer DEFAULT 1 NOT NULL,
	"is_outdated" boolean DEFAULT false NOT NULL,
	CONSTRAINT "bewertung_kapitel_pkey" PRIMARY KEY("id","project_version")
);
--> statement-breakpoint
CREATE TABLE "bewertung_kapitel_history" (
	"bewertung_id" uuid NOT NULL,
	"titel" text NOT NULL,
	"markdown" text NOT NULL,
	"kurzform" text,
	"order" integer NOT NULL,
	"id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	"is_deleted" boolean NOT NULL,
	"update_type" "updatetype",
	"frontend_parent_ids" varchar[] NOT NULL,
	"sys_period" "tstzrange" NOT NULL,
	"project_version" integer,
	"is_outdated" boolean
);
--> statement-breakpoint
CREATE TABLE "bewertung_quelle" (
	"bewertung_id" uuid NOT NULL,
	"dokument_id" uuid NOT NULL,
	"fundstelle_id" uuid,
	"title" text NOT NULL,
	"chunk_ids" varchar[] NOT NULL,
	"page_numbers" integer[] NOT NULL,
	"id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"updated_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"is_deleted" boolean DEFAULT false NOT NULL,
	"update_type" "updatetype" DEFAULT 'AUTOMATED',
	"frontend_parent_ids" varchar[] DEFAULT '{}' NOT NULL,
	"sys_period" "tstzrange" DEFAULT tstzrange(CURRENT_TIMESTAMP, null) NOT NULL,
	"cited_svm_id" varchar(10),
	"project_version" integer DEFAULT 1 NOT NULL,
	"is_outdated" boolean DEFAULT false NOT NULL,
	CONSTRAINT "bewertung_quelle_pkey" PRIMARY KEY("id","project_version")
);
--> statement-breakpoint
CREATE TABLE "bewertung_quelle_history" (
	"bewertung_id" uuid NOT NULL,
	"dokument_id" uuid NOT NULL,
	"fundstelle_id" uuid,
	"title" text NOT NULL,
	"chunk_ids" varchar[] NOT NULL,
	"page_numbers" integer[] NOT NULL,
	"id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	"is_deleted" boolean NOT NULL,
	"update_type" "updatetype",
	"frontend_parent_ids" varchar[] NOT NULL,
	"sys_period" "tstzrange" NOT NULL,
	"cited_svm_id" varchar(10),
	"project_version" integer,
	"is_outdated" boolean
);
--> statement-breakpoint
CREATE TABLE "chunk" (
	"dokument_id" uuid NOT NULL,
	"id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"updated_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"is_deleted" boolean DEFAULT false NOT NULL,
	"update_type" "updatetype" DEFAULT 'AUTOMATED',
	"header" text NOT NULL,
	"page_numbers" integer[] NOT NULL,
	"toc_path" varchar[] NOT NULL,
	"all_subchapters" varchar[] NOT NULL,
	"order" integer NOT NULL,
	"next_chunk_id" uuid,
	"previous_chunk_id" uuid,
	"frontend_parent_ids" varchar[] DEFAULT '{}' NOT NULL,
	"page_index_node_id" varchar,
	"page_index_position" integer,
	"page_index_summary" text,
	"page_content" text DEFAULT '' NOT NULL,
	"hypothetical_questions" varchar[] DEFAULT '{}' NOT NULL,
	"sys_period" "tstzrange" DEFAULT tstzrange(CURRENT_TIMESTAMP, null) NOT NULL,
	"project_version" integer DEFAULT 1 NOT NULL,
	"is_outdated" boolean DEFAULT false NOT NULL,
	CONSTRAINT "chunk_pkey" PRIMARY KEY("id","project_version")
);
--> statement-breakpoint
CREATE TABLE "chunk_history" (
	"dokument_id" uuid NOT NULL,
	"id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	"is_deleted" boolean NOT NULL,
	"update_type" "updatetype",
	"header" text NOT NULL,
	"page_numbers" integer[] NOT NULL,
	"toc_path" varchar[] NOT NULL,
	"all_subchapters" varchar[] NOT NULL,
	"order" integer NOT NULL,
	"next_chunk_id" uuid,
	"previous_chunk_id" uuid,
	"frontend_parent_ids" varchar[] NOT NULL,
	"page_index_node_id" varchar,
	"page_index_position" integer,
	"page_index_summary" text,
	"page_content" text NOT NULL,
	"hypothetical_questions" varchar[] NOT NULL,
	"sys_period" "tstzrange" NOT NULL,
	"project_version" integer,
	"is_outdated" boolean
);
--> statement-breakpoint
CREATE TABLE "dokument" (
	"filename" varchar NOT NULL,
	"mime_type" varchar NOT NULL,
	"page_count" integer NOT NULL,
	"id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"updated_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"is_deleted" boolean DEFAULT false NOT NULL,
	"update_type" "updatetype" DEFAULT 'AUTOMATED',
	"dms_file_id" uuid NOT NULL,
	"document_type" varchar,
	"summary" text NOT NULL,
	"markdown_text_id" uuid NOT NULL,
	"frontend_parent_ids" varchar[] DEFAULT '{}' NOT NULL,
	"document_id" varchar,
	"sys_period" "tstzrange" DEFAULT tstzrange(CURRENT_TIMESTAMP, null) NOT NULL,
	"is_outdated" boolean DEFAULT false NOT NULL,
	"project_version" integer DEFAULT 1 NOT NULL,
	"is_toc_document" boolean DEFAULT false NOT NULL,
	CONSTRAINT "dokument_pkey" PRIMARY KEY("id","project_version")
);
--> statement-breakpoint
CREATE TABLE "dokument_history" (
	"filename" varchar NOT NULL,
	"mime_type" varchar NOT NULL,
	"page_count" integer NOT NULL,
	"id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	"is_deleted" boolean NOT NULL,
	"update_type" "updatetype",
	"dms_file_id" uuid NOT NULL,
	"document_type" varchar,
	"summary" text NOT NULL,
	"markdown_text_id" uuid NOT NULL,
	"frontend_parent_ids" varchar[] NOT NULL,
	"document_id" varchar,
	"sys_period" "tstzrange" NOT NULL,
	"is_outdated" boolean,
	"project_version" integer,
	"is_toc_document" boolean
);
--> statement-breakpoint
CREATE TABLE "ermessensart" (
	"rechtsfolge_id" uuid NOT NULL,
	"art" varchar NOT NULL,
	"reasoning" text,
	"id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"updated_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"is_deleted" boolean DEFAULT false NOT NULL,
	"update_type" "updatetype" DEFAULT 'AUTOMATED',
	"frontend_parent_ids" varchar[] DEFAULT '{}' NOT NULL,
	"sys_period" "tstzrange" DEFAULT tstzrange(CURRENT_TIMESTAMP, null) NOT NULL,
	"project_version" integer DEFAULT 1 NOT NULL,
	"is_outdated" boolean DEFAULT false NOT NULL,
	CONSTRAINT "ermessensart_pkey" PRIMARY KEY("id","project_version")
);
--> statement-breakpoint
CREATE TABLE "ermessensart_history" (
	"rechtsfolge_id" uuid NOT NULL,
	"art" varchar NOT NULL,
	"reasoning" text,
	"id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	"is_deleted" boolean NOT NULL,
	"update_type" "updatetype",
	"frontend_parent_ids" varchar[] NOT NULL,
	"sys_period" "tstzrange" NOT NULL,
	"project_version" integer,
	"is_outdated" boolean
);
--> statement-breakpoint
CREATE TABLE "ermessensspielraum" (
	"rechtsfolge_id" uuid NOT NULL,
	"entscheidung" varchar NOT NULL,
	"reasoning" text,
	"id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"updated_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"is_deleted" boolean DEFAULT false NOT NULL,
	"update_type" "updatetype" DEFAULT 'AUTOMATED',
	"frontend_parent_ids" varchar[] DEFAULT '{}' NOT NULL,
	"sys_period" "tstzrange" DEFAULT tstzrange(CURRENT_TIMESTAMP, null) NOT NULL,
	"project_version" integer DEFAULT 1 NOT NULL,
	"is_outdated" boolean DEFAULT false NOT NULL,
	CONSTRAINT "ermessensspielraum_pkey" PRIMARY KEY("id","project_version")
);
--> statement-breakpoint
CREATE TABLE "ermessensspielraum_history" (
	"rechtsfolge_id" uuid NOT NULL,
	"entscheidung" varchar NOT NULL,
	"reasoning" text,
	"id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	"is_deleted" boolean NOT NULL,
	"update_type" "updatetype",
	"frontend_parent_ids" varchar[] NOT NULL,
	"sys_period" "tstzrange" NOT NULL,
	"project_version" integer,
	"is_outdated" boolean
);
--> statement-breakpoint
CREATE TABLE "examination_project_history" (
	"project_id" uuid,
	"id" uuid NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	"is_deleted" boolean NOT NULL,
	"update_type" "updatetype",
	"frontend_parent_ids" varchar[] NOT NULL,
	"sys_period" "tstzrange" NOT NULL,
	"project_version" integer,
	"is_outdated" boolean
);
--> statement-breakpoint
CREATE TABLE "expliziter_verweis" (
	"rechtsfolge_id" uuid,
	"atomares_tbm_id" uuid,
	"gesetz" varchar,
	"paragraph_nr" varchar,
	"absatz_nr" varchar,
	"satz_nr" varchar,
	"untergliederung" json,
	"verweis_typ" varchar,
	"kontext" json,
	"id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"updated_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"is_deleted" boolean DEFAULT false NOT NULL,
	"update_type" "updatetype" DEFAULT 'AUTOMATED',
	"frontend_parent_ids" varchar[] DEFAULT '{}' NOT NULL,
	"sys_period" "tstzrange" DEFAULT tstzrange(CURRENT_TIMESTAMP, null) NOT NULL,
	"project_version" integer DEFAULT 1 NOT NULL,
	"is_outdated" boolean DEFAULT false NOT NULL,
	CONSTRAINT "expliziter_verweis_pkey" PRIMARY KEY("id","project_version"),
	CONSTRAINT "chk_expliziter_verweis_one_parent" CHECK ((
CASE
    WHEN (rechtsfolge_id IS NOT NULL) THEN 1
    ELSE 0
END +
CASE
    WHEN (atomares_tbm_id IS NOT NULL) THEN 1
    ELSE 0
END) = 1)
);
--> statement-breakpoint
CREATE TABLE "expliziter_verweis_history" (
	"rechtsfolge_id" uuid,
	"atomares_tbm_id" uuid,
	"gesetz" varchar,
	"paragraph_nr" varchar,
	"absatz_nr" varchar,
	"satz_nr" varchar,
	"untergliederung" json,
	"verweis_typ" varchar,
	"kontext" json,
	"id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	"is_deleted" boolean NOT NULL,
	"update_type" "updatetype",
	"frontend_parent_ids" varchar[] NOT NULL,
	"sys_period" "tstzrange" NOT NULL,
	"project_version" integer,
	"is_outdated" boolean
);
--> statement-breakpoint
CREATE TABLE "fundstelle" (
	"id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"updated_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"is_deleted" boolean DEFAULT false NOT NULL,
	"update_type" "updatetype" DEFAULT 'AUTOMATED',
	"dokument_id" uuid NOT NULL,
	"frontend_parent_ids" varchar[] DEFAULT '{}' NOT NULL,
	"satz_id" uuid NOT NULL,
	"gesetz_id" uuid NOT NULL,
	"norm_id" uuid NOT NULL,
	"title" text NOT NULL,
	"text" text NOT NULL,
	"page_numbers" integer[] DEFAULT '{}' NOT NULL,
	"chunk_ids" uuid[] DEFAULT '{}' NOT NULL,
	"confidence" double precision,
	"consensus_ratio" double precision,
	"relevance" double precision,
	"sys_period" "tstzrange" DEFAULT tstzrange(CURRENT_TIMESTAMP, null) NOT NULL,
	"is_outdated" boolean DEFAULT false NOT NULL,
	"project_version" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "fundstelle_pkey" PRIMARY KEY("id","project_version"),
	CONSTRAINT "chk_fundstelle_scores_in_range" CHECK ((confidence IS NULL OR confidence BETWEEN 0 AND 1)
AND (consensus_ratio IS NULL OR consensus_ratio BETWEEN 0 AND 1)
AND (relevance IS NULL OR relevance BETWEEN 0 AND 1))
);
--> statement-breakpoint
CREATE TABLE "fundstelle_history" (
	"id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	"is_deleted" boolean NOT NULL,
	"update_type" "updatetype",
	"dokument_id" uuid NOT NULL,
	"frontend_parent_ids" varchar[] NOT NULL,
	"satz_id" uuid NOT NULL,
	"gesetz_id" uuid NOT NULL,
	"norm_id" uuid NOT NULL,
	"title" text NOT NULL,
	"text" text NOT NULL,
	"page_numbers" integer[] NOT NULL,
	"chunk_ids" uuid[] NOT NULL,
	"confidence" double precision,
	"consensus_ratio" double precision,
	"relevance" double precision,
	"sys_period" "tstzrange" NOT NULL,
	"is_outdated" boolean,
	"project_version" integer
);
--> statement-breakpoint
CREATE TABLE "gesetz" (
	"name" text NOT NULL,
	"jurabk" varchar NOT NULL,
	"id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"updated_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"is_deleted" boolean DEFAULT false NOT NULL,
	"update_type" "updatetype" DEFAULT 'AUTOMATED',
	"frontend_parent_ids" varchar[] DEFAULT '{}' NOT NULL,
	"sys_period" "tstzrange" DEFAULT tstzrange(CURRENT_TIMESTAMP, null) NOT NULL,
	"project_version" integer DEFAULT 1 NOT NULL,
	"is_outdated" boolean DEFAULT false NOT NULL,
	CONSTRAINT "gesetz_pkey" PRIMARY KEY("id","project_version")
);
--> statement-breakpoint
CREATE TABLE "gesetz_history" (
	"name" text NOT NULL,
	"jurabk" varchar NOT NULL,
	"id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	"is_deleted" boolean NOT NULL,
	"update_type" "updatetype",
	"frontend_parent_ids" varchar[] NOT NULL,
	"sys_period" "tstzrange" NOT NULL,
	"project_version" integer,
	"is_outdated" boolean
);
--> statement-breakpoint
CREATE TABLE "gs_pruefung" (
	"topic" varchar NOT NULL,
	"id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"updated_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"is_deleted" boolean DEFAULT false NOT NULL,
	"update_type" "updatetype" DEFAULT 'AUTOMATED',
	"frontend_parent_ids" varchar[] DEFAULT '{}' NOT NULL,
	"sys_period" "tstzrange" DEFAULT tstzrange(CURRENT_TIMESTAMP, null) NOT NULL,
	"project_version" integer DEFAULT 1 NOT NULL,
	"is_outdated" boolean DEFAULT false NOT NULL,
	CONSTRAINT "gs_pruefung_pkey" PRIMARY KEY("id","project_version")
);
--> statement-breakpoint
CREATE TABLE "gs_pruefung_history" (
	"topic" varchar NOT NULL,
	"id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	"is_deleted" boolean NOT NULL,
	"update_type" "updatetype",
	"frontend_parent_ids" varchar[] NOT NULL,
	"sys_period" "tstzrange" NOT NULL,
	"project_version" integer,
	"is_outdated" boolean
);
--> statement-breakpoint
CREATE TABLE "impliziter_verweis" (
	"rechtsfolge_id" uuid,
	"atomares_tbm_id" uuid,
	"target_ref" varchar,
	"rationale" text NOT NULL,
	"id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"updated_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"is_deleted" boolean DEFAULT false NOT NULL,
	"update_type" "updatetype" DEFAULT 'AUTOMATED',
	"frontend_parent_ids" varchar[] DEFAULT '{}' NOT NULL,
	"sys_period" "tstzrange" DEFAULT tstzrange(CURRENT_TIMESTAMP, null) NOT NULL,
	"project_version" integer DEFAULT 1 NOT NULL,
	"is_outdated" boolean DEFAULT false NOT NULL,
	CONSTRAINT "impliziter_verweis_pkey" PRIMARY KEY("id","project_version"),
	CONSTRAINT "chk_impliziter_verweis_one_parent" CHECK ((
CASE
    WHEN (rechtsfolge_id IS NOT NULL) THEN 1
    ELSE 0
END +
CASE
    WHEN (atomares_tbm_id IS NOT NULL) THEN 1
    ELSE 0
END) = 1)
);
--> statement-breakpoint
CREATE TABLE "impliziter_verweis_history" (
	"rechtsfolge_id" uuid,
	"atomares_tbm_id" uuid,
	"target_ref" varchar,
	"rationale" text NOT NULL,
	"id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	"is_deleted" boolean NOT NULL,
	"update_type" "updatetype",
	"frontend_parent_ids" varchar[] NOT NULL,
	"sys_period" "tstzrange" NOT NULL,
	"project_version" integer,
	"is_outdated" boolean
);
--> statement-breakpoint
CREATE TABLE "iv_pruefung" (
	"topic" varchar NOT NULL,
	"id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"updated_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"is_deleted" boolean DEFAULT false NOT NULL,
	"update_type" "updatetype" DEFAULT 'AUTOMATED',
	"frontend_parent_ids" varchar[] DEFAULT '{}' NOT NULL,
	"sys_period" "tstzrange" DEFAULT tstzrange(CURRENT_TIMESTAMP, null) NOT NULL,
	"project_version" integer DEFAULT 1 NOT NULL,
	"is_outdated" boolean DEFAULT false NOT NULL,
	CONSTRAINT "iv_pruefung_pkey" PRIMARY KEY("id","project_version")
);
--> statement-breakpoint
CREATE TABLE "iv_pruefung_history" (
	"topic" varchar NOT NULL,
	"id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	"is_deleted" boolean NOT NULL,
	"update_type" "updatetype",
	"frontend_parent_ids" varchar[] NOT NULL,
	"sys_period" "tstzrange" NOT NULL,
	"project_version" integer,
	"is_outdated" boolean
);
--> statement-breakpoint
CREATE TABLE "legaldefinition" (
	"bestimmter_rechtsbegriff_id" uuid NOT NULL,
	"begriff" varchar NOT NULL,
	"definition" text NOT NULL,
	"source_jurabk" varchar,
	"source_paragraph_nr" varchar,
	"id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"updated_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"is_deleted" boolean DEFAULT false NOT NULL,
	"update_type" "updatetype" DEFAULT 'AUTOMATED',
	"frontend_parent_ids" varchar[] DEFAULT '{}' NOT NULL,
	"sys_period" "tstzrange" DEFAULT tstzrange(CURRENT_TIMESTAMP, null) NOT NULL,
	"project_version" integer DEFAULT 1 NOT NULL,
	"is_outdated" boolean DEFAULT false NOT NULL,
	CONSTRAINT "legaldefinition_pkey" PRIMARY KEY("id","project_version")
);
--> statement-breakpoint
CREATE TABLE "legaldefinition_history" (
	"bestimmter_rechtsbegriff_id" uuid NOT NULL,
	"begriff" varchar NOT NULL,
	"definition" text NOT NULL,
	"source_jurabk" varchar,
	"source_paragraph_nr" varchar,
	"id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	"is_deleted" boolean NOT NULL,
	"update_type" "updatetype",
	"frontend_parent_ids" varchar[] NOT NULL,
	"sys_period" "tstzrange" NOT NULL,
	"project_version" integer,
	"is_outdated" boolean
);
--> statement-breakpoint
CREATE TABLE "markdown_text" (
	"text" text NOT NULL,
	"id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"is_deleted" boolean DEFAULT false NOT NULL,
	"frontend_parent_ids" varchar[] DEFAULT '{}' NOT NULL,
	"update_type" "updatetype" DEFAULT 'AUTOMATED',
	"created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"updated_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"sys_period" "tstzrange" DEFAULT tstzrange(CURRENT_TIMESTAMP, null) NOT NULL,
	"project_version" integer DEFAULT 1 NOT NULL,
	"is_outdated" boolean DEFAULT false NOT NULL,
	CONSTRAINT "markdown_text_pkey" PRIMARY KEY("id","project_version")
);
--> statement-breakpoint
CREATE TABLE "markdown_text_history" (
	"text" text NOT NULL,
	"id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"is_deleted" boolean NOT NULL,
	"frontend_parent_ids" varchar[] NOT NULL,
	"update_type" "updatetype",
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	"sys_period" "tstzrange" NOT NULL,
	"project_version" integer,
	"is_outdated" boolean
);
--> statement-breakpoint
CREATE TABLE "norm" (
	"gesetz_id" uuid NOT NULL,
	"paragraph_nr" varchar NOT NULL,
	"paragraph_titel" text,
	"text" text NOT NULL,
	"regelungsgegenstand" text,
	"id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"updated_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"is_deleted" boolean DEFAULT false NOT NULL,
	"update_type" "updatetype" DEFAULT 'AUTOMATED',
	"frontend_parent_ids" varchar[] DEFAULT '{}' NOT NULL,
	"sys_period" "tstzrange" DEFAULT tstzrange(CURRENT_TIMESTAMP, null) NOT NULL,
	"project_version" integer DEFAULT 1 NOT NULL,
	"is_outdated" boolean DEFAULT false NOT NULL,
	CONSTRAINT "norm_pkey" PRIMARY KEY("id","project_version")
);
--> statement-breakpoint
CREATE TABLE "norm_deconstruction" (
	"id" uuid PRIMARY KEY NOT NULL,
	"jurabk" varchar NOT NULL,
	"paragraph" varchar NOT NULL,
	"deconstruction" json NOT NULL,
	"created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"updated_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"sys_period" "tstzrange" DEFAULT tstzrange(CURRENT_TIMESTAMP, null) NOT NULL,
	CONSTRAINT "uq_norm_deconstruction_jurabk_paragraph" UNIQUE("jurabk","paragraph")
);
--> statement-breakpoint
CREATE TABLE "norm_deconstruction_history" (
	"id" uuid NOT NULL,
	"jurabk" varchar NOT NULL,
	"paragraph" varchar NOT NULL,
	"deconstruction" json NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	"sys_period" "tstzrange" NOT NULL
);
--> statement-breakpoint
CREATE TABLE "norm_history" (
	"gesetz_id" uuid NOT NULL,
	"paragraph_nr" varchar NOT NULL,
	"paragraph_titel" text,
	"text" text NOT NULL,
	"regelungsgegenstand" text,
	"id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	"is_deleted" boolean NOT NULL,
	"update_type" "updatetype",
	"frontend_parent_ids" varchar[] NOT NULL,
	"sys_period" "tstzrange" NOT NULL,
	"project_version" integer,
	"is_outdated" boolean
);
--> statement-breakpoint
CREATE TABLE "normvorschlag" (
	"norm_id" uuid NOT NULL,
	"reason" text NOT NULL,
	"confidence" double precision NOT NULL,
	"id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"updated_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"is_deleted" boolean DEFAULT false NOT NULL,
	"update_type" "updatetype" DEFAULT 'AUTOMATED',
	"frontend_parent_ids" varchar[] DEFAULT '{}' NOT NULL,
	"sys_period" "tstzrange" DEFAULT tstzrange(CURRENT_TIMESTAMP, null) NOT NULL,
	"project_version" integer DEFAULT 1 NOT NULL,
	"is_outdated" boolean DEFAULT false NOT NULL,
	CONSTRAINT "normvorschlag_pkey" PRIMARY KEY("id","project_version")
);
--> statement-breakpoint
CREATE TABLE "normvorschlag_history" (
	"norm_id" uuid NOT NULL,
	"reason" text NOT NULL,
	"confidence" double precision NOT NULL,
	"id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	"is_deleted" boolean NOT NULL,
	"update_type" "updatetype",
	"frontend_parent_ids" varchar[] NOT NULL,
	"sys_period" "tstzrange" NOT NULL,
	"project_version" integer,
	"is_outdated" boolean
);
--> statement-breakpoint
CREATE TABLE "examination_project" (
	"project_id" uuid,
	"id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"updated_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"is_deleted" boolean DEFAULT false NOT NULL,
	"update_type" "updatetype" DEFAULT 'AUTOMATED',
	"frontend_parent_ids" varchar[] DEFAULT '{}' NOT NULL,
	"sys_period" "tstzrange" DEFAULT tstzrange(CURRENT_TIMESTAMP, null) NOT NULL,
	"project_version" integer DEFAULT 1 NOT NULL,
	"is_outdated" boolean DEFAULT false NOT NULL,
	CONSTRAINT "examination_project_pkey" PRIMARY KEY("id","project_version")
);
--> statement-breakpoint
CREATE TABLE "rechtsfolge" (
	"satz_id" uuid NOT NULL,
	"text" text NOT NULL,
	"id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"updated_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"is_deleted" boolean DEFAULT false NOT NULL,
	"update_type" "updatetype" DEFAULT 'AUTOMATED',
	"frontend_parent_ids" varchar[] DEFAULT '{}' NOT NULL,
	"sys_period" "tstzrange" DEFAULT tstzrange(CURRENT_TIMESTAMP, null) NOT NULL,
	"project_version" integer DEFAULT 1 NOT NULL,
	"is_outdated" boolean DEFAULT false NOT NULL,
	CONSTRAINT "rechtsfolge_pkey" PRIMARY KEY("id","project_version")
);
--> statement-breakpoint
CREATE TABLE "rechtsfolge_history" (
	"satz_id" uuid NOT NULL,
	"text" text NOT NULL,
	"id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	"is_deleted" boolean NOT NULL,
	"update_type" "updatetype",
	"frontend_parent_ids" varchar[] NOT NULL,
	"sys_period" "tstzrange" NOT NULL,
	"project_version" integer,
	"is_outdated" boolean
);
--> statement-breakpoint
CREATE TABLE "required_doc" (
	"gs_pruefung_id" uuid NOT NULL,
	"doc_type" varchar NOT NULL,
	"id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"updated_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"is_deleted" boolean DEFAULT false NOT NULL,
	"update_type" "updatetype" DEFAULT 'AUTOMATED',
	"frontend_parent_ids" varchar[] DEFAULT '{}' NOT NULL,
	"sys_period" "tstzrange" DEFAULT tstzrange(CURRENT_TIMESTAMP, null) NOT NULL,
	"project_version" integer DEFAULT 1 NOT NULL,
	"is_outdated" boolean DEFAULT false NOT NULL,
	CONSTRAINT "required_doc_pkey" PRIMARY KEY("id","project_version")
);
--> statement-breakpoint
CREATE TABLE "required_doc_history" (
	"gs_pruefung_id" uuid NOT NULL,
	"doc_type" varchar NOT NULL,
	"id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	"is_deleted" boolean NOT NULL,
	"update_type" "updatetype",
	"frontend_parent_ids" varchar[] NOT NULL,
	"sys_period" "tstzrange" NOT NULL,
	"project_version" integer,
	"is_outdated" boolean
);
--> statement-breakpoint
CREATE TABLE "satz" (
	"absatz_id" uuid NOT NULL,
	"satz_nr" varchar NOT NULL,
	"text" text NOT NULL,
	"norm_typ_lvl_1" varchar,
	"norm_typ_lvl_2" varchar,
	"tatbestandsmerkmale" json,
	"formel" text,
	"wenn_dann" text,
	"id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"updated_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"is_deleted" boolean DEFAULT false NOT NULL,
	"update_type" "updatetype" DEFAULT 'AUTOMATED',
	"frontend_parent_ids" varchar[] DEFAULT '{}' NOT NULL,
	"markers" text[] DEFAULT '{}' NOT NULL,
	"position" integer,
	"sys_period" "tstzrange" DEFAULT tstzrange(CURRENT_TIMESTAMP, null) NOT NULL,
	"project_version" integer DEFAULT 1 NOT NULL,
	"is_outdated" boolean DEFAULT false NOT NULL,
	CONSTRAINT "satz_pkey" PRIMARY KEY("id","project_version")
);
--> statement-breakpoint
CREATE TABLE "satz_history" (
	"absatz_id" uuid NOT NULL,
	"satz_nr" varchar NOT NULL,
	"text" text NOT NULL,
	"norm_typ_lvl_1" varchar,
	"norm_typ_lvl_2" varchar,
	"tatbestandsmerkmale" json,
	"formel" text,
	"wenn_dann" text,
	"id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	"is_deleted" boolean NOT NULL,
	"update_type" "updatetype",
	"frontend_parent_ids" varchar[] NOT NULL,
	"markers" text[] NOT NULL,
	"position" integer,
	"sys_period" "tstzrange" NOT NULL,
	"project_version" integer,
	"is_outdated" boolean
);
--> statement-breakpoint
CREATE TABLE "soll_dokument" (
	"iv_pruefung_id" uuid NOT NULL,
	"doc_type" varchar NOT NULL,
	"id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"updated_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"is_deleted" boolean DEFAULT false NOT NULL,
	"update_type" "updatetype" DEFAULT 'AUTOMATED',
	"frontend_parent_ids" varchar[] DEFAULT '{}' NOT NULL,
	"sys_period" "tstzrange" DEFAULT tstzrange(CURRENT_TIMESTAMP, null) NOT NULL,
	"project_version" integer DEFAULT 1 NOT NULL,
	"is_outdated" boolean DEFAULT false NOT NULL,
	CONSTRAINT "soll_dokument_pkey" PRIMARY KEY("id","project_version")
);
--> statement-breakpoint
CREATE TABLE "soll_dokument_history" (
	"iv_pruefung_id" uuid NOT NULL,
	"doc_type" varchar NOT NULL,
	"id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	"is_deleted" boolean NOT NULL,
	"update_type" "updatetype",
	"frontend_parent_ids" varchar[] NOT NULL,
	"sys_period" "tstzrange" NOT NULL,
	"project_version" integer,
	"is_outdated" boolean
);
--> statement-breakpoint
CREATE TABLE "sollensanordnungen" (
	"rechtsfolge_id" uuid NOT NULL,
	"kategorie" varchar NOT NULL,
	"reasoning" text,
	"id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"updated_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"is_deleted" boolean DEFAULT false NOT NULL,
	"update_type" "updatetype" DEFAULT 'AUTOMATED',
	"frontend_parent_ids" varchar[] DEFAULT '{}' NOT NULL,
	"sys_period" "tstzrange" DEFAULT tstzrange(CURRENT_TIMESTAMP, null) NOT NULL,
	"project_version" integer DEFAULT 1 NOT NULL,
	"is_outdated" boolean DEFAULT false NOT NULL,
	CONSTRAINT "sollensanordnungen_pkey" PRIMARY KEY("id","project_version")
);
--> statement-breakpoint
CREATE TABLE "sollensanordnungen_history" (
	"rechtsfolge_id" uuid NOT NULL,
	"kategorie" varchar NOT NULL,
	"reasoning" text,
	"id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	"is_deleted" boolean NOT NULL,
	"update_type" "updatetype",
	"frontend_parent_ids" varchar[] NOT NULL,
	"sys_period" "tstzrange" NOT NULL,
	"project_version" integer,
	"is_outdated" boolean
);
--> statement-breakpoint
CREATE TABLE "standangabe" (
	"gesetz_id" uuid NOT NULL,
	"standtyp" varchar NOT NULL,
	"standkommentar" text NOT NULL,
	"doknr" varchar,
	"external_id" integer,
	"id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"updated_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"is_deleted" boolean DEFAULT false NOT NULL,
	"update_type" "updatetype" DEFAULT 'AUTOMATED',
	"frontend_parent_ids" varchar[] DEFAULT '{}' NOT NULL,
	"sys_period" "tstzrange" DEFAULT tstzrange(CURRENT_TIMESTAMP, null) NOT NULL,
	"project_version" integer DEFAULT 1 NOT NULL,
	"is_outdated" boolean DEFAULT false NOT NULL,
	CONSTRAINT "standangabe_pkey" PRIMARY KEY("id","project_version")
);
--> statement-breakpoint
CREATE TABLE "standangabe_history" (
	"gesetz_id" uuid NOT NULL,
	"standtyp" varchar NOT NULL,
	"standkommentar" text NOT NULL,
	"doknr" varchar,
	"external_id" integer,
	"id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	"is_deleted" boolean NOT NULL,
	"update_type" "updatetype",
	"frontend_parent_ids" varchar[] NOT NULL,
	"sys_period" "tstzrange" NOT NULL,
	"project_version" integer,
	"is_outdated" boolean
);
--> statement-breakpoint
CREATE TABLE "sub_chunk" (
	"chunk_id" uuid NOT NULL,
	"header" text NOT NULL,
	"chunk_type" varchar NOT NULL,
	"focus_topic" text NOT NULL,
	"hypothetical_questions" varchar[] NOT NULL,
	"order" integer NOT NULL,
	"next_sub_chunk_id" uuid,
	"previous_sub_chunk_id" uuid,
	"markdown_text_id" uuid NOT NULL,
	"id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"is_deleted" boolean DEFAULT false NOT NULL,
	"frontend_parent_ids" varchar[] DEFAULT '{}' NOT NULL,
	"update_type" "updatetype" DEFAULT 'AUTOMATED',
	"created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"updated_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"page_numbers" integer[] DEFAULT '{}' NOT NULL,
	"header_1" text,
	"header_2" text,
	"header_3" text,
	"wildlife_mentioned" boolean,
	"plant_species_mentioned" boolean,
	"wildlife_species" varchar[] DEFAULT '{}' NOT NULL,
	"plant_species" varchar[] DEFAULT '{}' NOT NULL,
	"map_scale" varchar,
	"sys_period" "tstzrange" DEFAULT tstzrange(CURRENT_TIMESTAMP, null) NOT NULL,
	"project_version" integer DEFAULT 1 NOT NULL,
	"is_outdated" boolean DEFAULT false NOT NULL,
	CONSTRAINT "sub_chunk_pkey" PRIMARY KEY("id","project_version")
);
--> statement-breakpoint
CREATE TABLE "sub_chunk_history" (
	"chunk_id" uuid NOT NULL,
	"header" text NOT NULL,
	"chunk_type" varchar NOT NULL,
	"focus_topic" text NOT NULL,
	"hypothetical_questions" varchar[] NOT NULL,
	"order" integer NOT NULL,
	"next_sub_chunk_id" uuid,
	"previous_sub_chunk_id" uuid,
	"markdown_text_id" uuid NOT NULL,
	"id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"is_deleted" boolean NOT NULL,
	"frontend_parent_ids" varchar[] NOT NULL,
	"update_type" "updatetype",
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	"page_numbers" integer[] NOT NULL,
	"header_1" text,
	"header_2" text,
	"header_3" text,
	"wildlife_mentioned" boolean,
	"plant_species_mentioned" boolean,
	"wildlife_species" varchar[] NOT NULL,
	"plant_species" varchar[] NOT NULL,
	"map_scale" varchar,
	"sys_period" "tstzrange" NOT NULL,
	"project_version" integer,
	"is_outdated" boolean
);
--> statement-breakpoint
CREATE TABLE "sub_chunk_image" (
	"sub_chunk_id" uuid NOT NULL,
	"asset_path" varchar NOT NULL,
	"caption" text NOT NULL,
	"summary" text NOT NULL,
	"description" text NOT NULL,
	"content" text NOT NULL,
	"footnote" text NOT NULL,
	"id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"is_deleted" boolean DEFAULT false NOT NULL,
	"frontend_parent_ids" varchar[] DEFAULT '{}' NOT NULL,
	"update_type" "updatetype" DEFAULT 'AUTOMATED',
	"created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"updated_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"sys_period" "tstzrange" DEFAULT tstzrange(CURRENT_TIMESTAMP, null) NOT NULL,
	"project_version" integer DEFAULT 1 NOT NULL,
	"is_outdated" boolean DEFAULT false NOT NULL,
	CONSTRAINT "sub_chunk_image_pkey" PRIMARY KEY("id","project_version")
);
--> statement-breakpoint
CREATE TABLE "sub_chunk_image_history" (
	"sub_chunk_id" uuid NOT NULL,
	"asset_path" varchar NOT NULL,
	"caption" text NOT NULL,
	"summary" text NOT NULL,
	"description" text NOT NULL,
	"content" text NOT NULL,
	"footnote" text NOT NULL,
	"id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"is_deleted" boolean NOT NULL,
	"frontend_parent_ids" varchar[] NOT NULL,
	"update_type" "updatetype",
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	"sys_period" "tstzrange" NOT NULL,
	"project_version" integer,
	"is_outdated" boolean
);
--> statement-breakpoint
CREATE TABLE "sub_chunk_relation" (
	"from_sub_chunk_id" uuid NOT NULL,
	"to_sub_chunk_id" uuid NOT NULL,
	"relation_type" varchar NOT NULL,
	"id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"is_deleted" boolean DEFAULT false NOT NULL,
	"frontend_parent_ids" varchar[] DEFAULT '{}' NOT NULL,
	"update_type" "updatetype" DEFAULT 'AUTOMATED',
	"created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"updated_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"sys_period" "tstzrange" DEFAULT tstzrange(CURRENT_TIMESTAMP, null) NOT NULL,
	"project_version" integer DEFAULT 1 NOT NULL,
	"is_outdated" boolean DEFAULT false NOT NULL,
	CONSTRAINT "sub_chunk_relation_pkey" PRIMARY KEY("id","project_version")
);
--> statement-breakpoint
CREATE TABLE "sub_chunk_relation_history" (
	"from_sub_chunk_id" uuid NOT NULL,
	"to_sub_chunk_id" uuid NOT NULL,
	"relation_type" varchar NOT NULL,
	"id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"is_deleted" boolean NOT NULL,
	"frontend_parent_ids" varchar[] NOT NULL,
	"update_type" "updatetype",
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	"sys_period" "tstzrange" NOT NULL,
	"project_version" integer,
	"is_outdated" boolean
);
--> statement-breakpoint
CREATE TABLE "sub_chunk_table" (
	"sub_chunk_id" uuid NOT NULL,
	"asset_path" varchar NOT NULL,
	"caption" text NOT NULL,
	"summary" text NOT NULL,
	"description" text NOT NULL,
	"content" text NOT NULL,
	"footnote" text NOT NULL,
	"id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"is_deleted" boolean DEFAULT false NOT NULL,
	"frontend_parent_ids" varchar[] DEFAULT '{}' NOT NULL,
	"update_type" "updatetype" DEFAULT 'AUTOMATED',
	"created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"updated_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"sys_period" "tstzrange" DEFAULT tstzrange(CURRENT_TIMESTAMP, null) NOT NULL,
	"project_version" integer DEFAULT 1 NOT NULL,
	"is_outdated" boolean DEFAULT false NOT NULL,
	CONSTRAINT "sub_chunk_table_pkey" PRIMARY KEY("id","project_version")
);
--> statement-breakpoint
CREATE TABLE "sub_chunk_table_history" (
	"sub_chunk_id" uuid NOT NULL,
	"asset_path" varchar NOT NULL,
	"caption" text NOT NULL,
	"summary" text NOT NULL,
	"description" text NOT NULL,
	"content" text NOT NULL,
	"footnote" text NOT NULL,
	"id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"is_deleted" boolean NOT NULL,
	"frontend_parent_ids" varchar[] NOT NULL,
	"update_type" "updatetype",
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	"sys_period" "tstzrange" NOT NULL,
	"project_version" integer,
	"is_outdated" boolean
);
--> statement-breakpoint
CREATE TABLE "sub_chunk_text" (
	"sub_chunk_id" uuid NOT NULL,
	"id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"is_deleted" boolean DEFAULT false NOT NULL,
	"frontend_parent_ids" varchar[] DEFAULT '{}' NOT NULL,
	"update_type" "updatetype" DEFAULT 'AUTOMATED',
	"created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"updated_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"sys_period" "tstzrange" DEFAULT tstzrange(CURRENT_TIMESTAMP, null) NOT NULL,
	"project_version" integer DEFAULT 1 NOT NULL,
	"is_outdated" boolean DEFAULT false NOT NULL,
	CONSTRAINT "sub_chunk_text_pkey" PRIMARY KEY("id","project_version")
);
--> statement-breakpoint
CREATE TABLE "sub_chunk_text_history" (
	"sub_chunk_id" uuid NOT NULL,
	"id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"is_deleted" boolean NOT NULL,
	"frontend_parent_ids" varchar[] NOT NULL,
	"update_type" "updatetype",
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	"sys_period" "tstzrange" NOT NULL,
	"project_version" integer,
	"is_outdated" boolean
);
--> statement-breakpoint
CREATE TABLE "technische_norm" (
	"atomares_tbm_id" uuid NOT NULL,
	"name" varchar NOT NULL,
	"confidence" double precision NOT NULL,
	"id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"updated_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"is_deleted" boolean DEFAULT false NOT NULL,
	"update_type" "updatetype" DEFAULT 'AUTOMATED',
	"frontend_parent_ids" varchar[] DEFAULT '{}' NOT NULL,
	"sys_period" "tstzrange" DEFAULT tstzrange(CURRENT_TIMESTAMP, null) NOT NULL,
	"project_version" integer DEFAULT 1 NOT NULL,
	"is_outdated" boolean DEFAULT false NOT NULL,
	CONSTRAINT "technische_norm_pkey" PRIMARY KEY("id","project_version")
);
--> statement-breakpoint
CREATE TABLE "technische_norm_entry" (
	"technische_norm_id" uuid NOT NULL,
	"entry_id" varchar NOT NULL,
	"kurzbeschreibung" text NOT NULL,
	"id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"updated_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"is_deleted" boolean DEFAULT false NOT NULL,
	"update_type" "updatetype" DEFAULT 'AUTOMATED',
	"frontend_parent_ids" varchar[] DEFAULT '{}' NOT NULL,
	"sys_period" "tstzrange" DEFAULT tstzrange(CURRENT_TIMESTAMP, null) NOT NULL,
	"project_version" integer DEFAULT 1 NOT NULL,
	"is_outdated" boolean DEFAULT false NOT NULL,
	CONSTRAINT "technische_norm_entry_pkey" PRIMARY KEY("id","project_version")
);
--> statement-breakpoint
CREATE TABLE "technische_norm_entry_history" (
	"technische_norm_id" uuid NOT NULL,
	"entry_id" varchar NOT NULL,
	"kurzbeschreibung" text NOT NULL,
	"id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	"is_deleted" boolean NOT NULL,
	"update_type" "updatetype",
	"frontend_parent_ids" varchar[] NOT NULL,
	"sys_period" "tstzrange" NOT NULL,
	"project_version" integer,
	"is_outdated" boolean
);
--> statement-breakpoint
CREATE TABLE "technische_norm_history" (
	"atomares_tbm_id" uuid NOT NULL,
	"name" varchar NOT NULL,
	"confidence" double precision NOT NULL,
	"id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	"is_deleted" boolean NOT NULL,
	"update_type" "updatetype",
	"frontend_parent_ids" varchar[] NOT NULL,
	"sys_period" "tstzrange" NOT NULL,
	"project_version" integer,
	"is_outdated" boolean
);
--> statement-breakpoint
CREATE TABLE "unbestimmter_rechtsbegriff" (
	"atomares_tbm_id" uuid NOT NULL,
	"begriff" varchar NOT NULL,
	"id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"updated_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"is_deleted" boolean DEFAULT false NOT NULL,
	"update_type" "updatetype" DEFAULT 'AUTOMATED',
	"frontend_parent_ids" varchar[] DEFAULT '{}' NOT NULL,
	"sys_period" "tstzrange" DEFAULT tstzrange(CURRENT_TIMESTAMP, null) NOT NULL,
	"project_version" integer DEFAULT 1 NOT NULL,
	"is_outdated" boolean DEFAULT false NOT NULL,
	"auslegung" text NOT NULL,
	CONSTRAINT "unbestimmter_rechtsbegriff_pkey" PRIMARY KEY("id","project_version")
);
--> statement-breakpoint
CREATE TABLE "unbestimmter_rechtsbegriff_history" (
	"atomares_tbm_id" uuid NOT NULL,
	"begriff" varchar NOT NULL,
	"id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	"is_deleted" boolean NOT NULL,
	"update_type" "updatetype",
	"frontend_parent_ids" varchar[] NOT NULL,
	"sys_period" "tstzrange" NOT NULL,
	"project_version" integer,
	"is_outdated" boolean,
	"auslegung" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "verwaltungsaktentwurf_teil" (
	"bewertung_id" uuid NOT NULL,
	"text" text NOT NULL,
	"id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"updated_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"is_deleted" boolean DEFAULT false NOT NULL,
	"update_type" "updatetype" DEFAULT 'AUTOMATED',
	"frontend_parent_ids" varchar[] DEFAULT '{}' NOT NULL,
	"sys_period" "tstzrange" DEFAULT tstzrange(CURRENT_TIMESTAMP, null) NOT NULL,
	"project_version" integer DEFAULT 1 NOT NULL,
	"is_outdated" boolean DEFAULT false NOT NULL,
	CONSTRAINT "verwaltungsaktentwurf_teil_pkey" PRIMARY KEY("id","project_version")
);
--> statement-breakpoint
CREATE TABLE "verwaltungsaktentwurf_teil_history" (
	"bewertung_id" uuid NOT NULL,
	"text" text NOT NULL,
	"id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	"is_deleted" boolean NOT NULL,
	"update_type" "updatetype",
	"frontend_parent_ids" varchar[] NOT NULL,
	"sys_period" "tstzrange" NOT NULL,
	"project_version" integer,
	"is_outdated" boolean
);
--> statement-breakpoint
CREATE TABLE "widerspruch" (
	"dokument_id" uuid NOT NULL,
	"text" text NOT NULL,
	"severity" varchar NOT NULL,
	"id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"updated_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"is_deleted" boolean DEFAULT false NOT NULL,
	"update_type" "updatetype" DEFAULT 'AUTOMATED',
	"frontend_parent_ids" varchar[] DEFAULT '{}' NOT NULL,
	"sys_period" "tstzrange" DEFAULT tstzrange(CURRENT_TIMESTAMP, null) NOT NULL,
	"project_version" integer DEFAULT 1 NOT NULL,
	"is_outdated" boolean DEFAULT false NOT NULL,
	CONSTRAINT "widerspruch_pkey" PRIMARY KEY("id","project_version")
);
--> statement-breakpoint
CREATE TABLE "widerspruch_history" (
	"dokument_id" uuid NOT NULL,
	"text" text NOT NULL,
	"severity" varchar NOT NULL,
	"id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	"is_deleted" boolean NOT NULL,
	"update_type" "updatetype",
	"frontend_parent_ids" varchar[] NOT NULL,
	"sys_period" "tstzrange" NOT NULL,
	"project_version" integer,
	"is_outdated" boolean
);
--> statement-breakpoint
CREATE TABLE "zugeordnetes_dokument" (
	"dokument_id" uuid NOT NULL,
	"required_doc_id" uuid,
	"soll_dokument_id" uuid,
	"source_document_id" uuid NOT NULL,
	"match_score" double precision NOT NULL,
	"id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"updated_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"is_deleted" boolean DEFAULT false NOT NULL,
	"update_type" "updatetype" DEFAULT 'AUTOMATED',
	"frontend_parent_ids" varchar[] DEFAULT '{}' NOT NULL,
	"sys_period" "tstzrange" DEFAULT tstzrange(CURRENT_TIMESTAMP, null) NOT NULL,
	"project_version" integer DEFAULT 1 NOT NULL,
	"is_outdated" boolean DEFAULT false NOT NULL,
	CONSTRAINT "zugeordnetes_dokument_pkey" PRIMARY KEY("id","project_version"),
	CONSTRAINT "chk_zugeordnetes_one_parent" CHECK ((
CASE
    WHEN (required_doc_id IS NOT NULL) THEN 1
    ELSE 0
END +
CASE
    WHEN (soll_dokument_id IS NOT NULL) THEN 1
    ELSE 0
END) = 1)
);
--> statement-breakpoint
CREATE TABLE "zugeordnetes_dokument_history" (
	"dokument_id" uuid NOT NULL,
	"required_doc_id" uuid,
	"soll_dokument_id" uuid,
	"source_document_id" uuid NOT NULL,
	"match_score" double precision NOT NULL,
	"id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	"is_deleted" boolean NOT NULL,
	"update_type" "updatetype",
	"frontend_parent_ids" varchar[] NOT NULL,
	"sys_period" "tstzrange" NOT NULL,
	"project_version" integer,
	"is_outdated" boolean
);
--> statement-breakpoint
CREATE TABLE "zusammenfassung" (
	"dokument_id" uuid NOT NULL,
	"required_doc_id" uuid,
	"soll_dokument_id" uuid,
	"text" text NOT NULL,
	"id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"updated_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"is_deleted" boolean DEFAULT false NOT NULL,
	"update_type" "updatetype" DEFAULT 'AUTOMATED',
	"frontend_parent_ids" varchar[] DEFAULT '{}' NOT NULL,
	"sys_period" "tstzrange" DEFAULT tstzrange(CURRENT_TIMESTAMP, null) NOT NULL,
	"project_version" integer DEFAULT 1 NOT NULL,
	"is_outdated" boolean DEFAULT false NOT NULL,
	CONSTRAINT "zusammenfassung_pkey" PRIMARY KEY("id","project_version")
);
--> statement-breakpoint
CREATE TABLE "zusammenfassung_history" (
	"dokument_id" uuid NOT NULL,
	"required_doc_id" uuid,
	"soll_dokument_id" uuid,
	"text" text NOT NULL,
	"id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	"is_deleted" boolean NOT NULL,
	"update_type" "updatetype",
	"frontend_parent_ids" varchar[] NOT NULL,
	"sys_period" "tstzrange" NOT NULL,
	"project_version" integer,
	"is_outdated" boolean
);
--> statement-breakpoint
CREATE TABLE "feedback" (
	"id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"is_deleted" boolean DEFAULT false NOT NULL,
	"frontend_parent_ids" varchar[] DEFAULT ARRAY[]::varchar[] NOT NULL,
	"update_type" "updatetype" DEFAULT 'AUTOMATED'::updatetype,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"sys_period" "tstzrange" DEFAULT tstzrange(now(), null) NOT NULL,
	"rating" "feedbackrating" NOT NULL,
	"reason" varchar(30),
	"text" varchar(5000),
	"user_id" uuid NOT NULL,
	"project_version" integer DEFAULT 1 NOT NULL,
	"is_outdated" boolean DEFAULT false NOT NULL,
	CONSTRAINT "feedback_pkey" PRIMARY KEY("id","project_version")
);
--> statement-breakpoint
CREATE TABLE "feedback_history" (
	"id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"is_deleted" boolean NOT NULL,
	"frontend_parent_ids" varchar[] NOT NULL,
	"update_type" "updatetype",
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	"sys_period" "tstzrange" NOT NULL,
	"rating" "feedbackrating" NOT NULL,
	"reason" varchar(30),
	"text" varchar(5000),
	"user_id" uuid NOT NULL,
	"project_version" integer,
	"is_outdated" boolean
);
--> statement-breakpoint
CREATE TABLE "category" (
	"id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"name" varchar NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"sys_period" "tstzrange" DEFAULT tstzrange(CURRENT_TIMESTAMP, null) NOT NULL,
	"is_deleted" boolean DEFAULT false NOT NULL,
	"frontend_parent_ids" varchar[] DEFAULT ARRAY[]::varchar[] NOT NULL,
	"update_type" "updatetype" DEFAULT 'AUTOMATED'::updatetype,
	"project_version" integer DEFAULT 1 NOT NULL,
	"is_outdated" boolean DEFAULT false NOT NULL,
	CONSTRAINT "category_pkey" PRIMARY KEY("id","project_version")
);
--> statement-breakpoint
CREATE TABLE "category_history" (
	"id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"name" varchar NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	"sys_period" "tstzrange" NOT NULL,
	"is_deleted" boolean,
	"frontend_parent_ids" varchar[],
	"update_type" "updatetype",
	"project_version" integer,
	"is_outdated" boolean
);
--> statement-breakpoint
CREATE TABLE "document_history" (
	"id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"file_id" uuid,
	"ai_suggested_required_document_type_id" uuid,
	"document_name" varchar NOT NULL,
	"reasoning" text,
	"confidence" double precision,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	"human_required_document_type_id" uuid,
	"content_extraction_id" uuid,
	"sys_period" "tstzrange" NOT NULL,
	"is_deleted" boolean,
	"frontend_parent_ids" varchar[],
	"update_type" "updatetype",
	"project_version" integer,
	"is_outdated" boolean
);
--> statement-breakpoint
CREATE TABLE "document_type_history" (
	"id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"name" varchar NOT NULL,
	"description" text NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	"confidence" double precision,
	"category_id" uuid,
	"is_deleted" boolean NOT NULL,
	"is_resolved" boolean NOT NULL,
	"origin" varchar NOT NULL,
	"sys_period" "tstzrange" NOT NULL,
	"frontend_parent_ids" varchar[],
	"update_type" "updatetype",
	"project_version" integer,
	"is_outdated" boolean
);
--> statement-breakpoint
CREATE TABLE "document_type" (
	"id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"name" varchar NOT NULL,
	"description" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"confidence" double precision,
	"category_id" uuid,
	"is_deleted" boolean DEFAULT false NOT NULL,
	"is_resolved" boolean DEFAULT false NOT NULL,
	"origin" varchar NOT NULL,
	"sys_period" "tstzrange" DEFAULT tstzrange(CURRENT_TIMESTAMP, null) NOT NULL,
	"frontend_parent_ids" varchar[] DEFAULT ARRAY[]::varchar[] NOT NULL,
	"update_type" "updatetype" DEFAULT 'AUTOMATED'::updatetype,
	"project_version" integer DEFAULT 1 NOT NULL,
	"is_outdated" boolean DEFAULT false NOT NULL,
	CONSTRAINT "document_type_pkey" PRIMARY KEY("id","project_version"),
	CONSTRAINT "chk_document_type_origin" CHECK ("document_type"."origin" IN ('system', 'custom'))
);
--> statement-breakpoint
CREATE TABLE "document" (
	"id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"file_id" uuid,
	"ai_suggested_required_document_type_id" uuid,
	"document_name" varchar NOT NULL,
	"reasoning" text,
	"confidence" double precision,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"human_required_document_type_id" uuid,
	"content_extraction_id" uuid,
	"sys_period" "tstzrange" DEFAULT tstzrange(CURRENT_TIMESTAMP, null) NOT NULL,
	"is_deleted" boolean DEFAULT false NOT NULL,
	"frontend_parent_ids" varchar[] DEFAULT ARRAY[]::varchar[] NOT NULL,
	"update_type" "updatetype" DEFAULT 'AUTOMATED'::updatetype,
	"project_version" integer DEFAULT 1 NOT NULL,
	"is_outdated" boolean DEFAULT false NOT NULL,
	CONSTRAINT "document_pkey" PRIMARY KEY("id","project_version")
);
--> statement-breakpoint
CREATE TABLE "project_template_version_history" (
	"id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	"project_type_id" uuid,
	"sys_period" "tstzrange" NOT NULL,
	"is_deleted" boolean,
	"frontend_parent_ids" varchar[],
	"update_type" "updatetype",
	"project_version" integer,
	"is_outdated" boolean
);
--> statement-breakpoint
CREATE TABLE "project_template_version" (
	"id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"project_type_id" uuid,
	"sys_period" "tstzrange" DEFAULT tstzrange(CURRENT_TIMESTAMP, null) NOT NULL,
	"is_deleted" boolean DEFAULT false NOT NULL,
	"frontend_parent_ids" varchar[] DEFAULT ARRAY[]::varchar[] NOT NULL,
	"update_type" "updatetype" DEFAULT 'AUTOMATED'::updatetype,
	"project_version" integer DEFAULT 1 NOT NULL,
	"is_outdated" boolean DEFAULT false NOT NULL,
	CONSTRAINT "project_template_version_pkey" PRIMARY KEY("id","project_version")
);
--> statement-breakpoint
CREATE TABLE "table_of_content_notes_history" (
	"id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"content" text NOT NULL,
	"is_resolved" boolean NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	"sys_period" "tstzrange" NOT NULL,
	"is_deleted" boolean,
	"frontend_parent_ids" varchar[],
	"update_type" "updatetype",
	"project_version" integer,
	"is_outdated" boolean
);
--> statement-breakpoint
CREATE TABLE "table_of_content_notes" (
	"id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"content" text NOT NULL,
	"is_resolved" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"sys_period" "tstzrange" DEFAULT tstzrange(CURRENT_TIMESTAMP, null) NOT NULL,
	"is_deleted" boolean DEFAULT false NOT NULL,
	"frontend_parent_ids" varchar[] DEFAULT ARRAY[]::varchar[] NOT NULL,
	"update_type" "updatetype" DEFAULT 'AUTOMATED'::updatetype,
	"project_version" integer DEFAULT 1 NOT NULL,
	"is_outdated" boolean DEFAULT false NOT NULL,
	CONSTRAINT "table_of_content_notes_pkey" PRIMARY KEY("id","project_version")
);
--> statement-breakpoint
CREATE TABLE "toc_job_status_history" (
	"id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"status" varchar NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	"sys_period" "tstzrange" NOT NULL,
	"is_deleted" boolean,
	"frontend_parent_ids" varchar[],
	"update_type" "updatetype",
	"project_version" integer,
	"is_outdated" boolean
);
--> statement-breakpoint
CREATE TABLE "toc_job_status" (
	"id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"status" varchar NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"sys_period" "tstzrange" DEFAULT tstzrange(CURRENT_TIMESTAMP, null) NOT NULL,
	"is_deleted" boolean DEFAULT false NOT NULL,
	"frontend_parent_ids" varchar[] DEFAULT ARRAY[]::varchar[] NOT NULL,
	"update_type" "updatetype" DEFAULT 'AUTOMATED'::updatetype,
	"project_version" integer DEFAULT 1 NOT NULL,
	"is_outdated" boolean DEFAULT false NOT NULL,
	CONSTRAINT "toc_job_status_pkey" PRIMARY KEY("id","project_version")
);
--> statement-breakpoint
CREATE TABLE "fpp_file" (
	"id" uuid NOT NULL,
	"request_id" uuid NOT NULL,
	"file_type" varchar NOT NULL,
	"file_url" varchar NOT NULL,
	"file_name" varchar,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"downloaded" boolean DEFAULT false NOT NULL,
	"dms_file_id" uuid,
	CONSTRAINT "fpp_file_pkey" PRIMARY KEY("id")
);
--> statement-breakpoint
CREATE TABLE "fpp_request" (
	"request_id" uuid NOT NULL,
	"internal_project_id" varchar NOT NULL,
	"name" varchar NOT NULL,
	"xml" text NOT NULL,
	"project_id" uuid,
	"status" varchar DEFAULT 'RECEIVED' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "fpp_request_pkey" PRIMARY KEY("request_id")
);
--> statement-breakpoint
CREATE TABLE "spicedb_migrations" (
	"version" varchar PRIMARY KEY NOT NULL,
	"applied_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "argument_history" (
	"id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"is_deleted" boolean NOT NULL,
	"frontend_parent_ids" varchar[] NOT NULL,
	"update_type" "updatetype",
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	"sys_period" "tstzrange" NOT NULL,
	"beteiligungs_eingang_id" uuid NOT NULL,
	"sub_topic_id" uuid,
	"text" text,
	"start_idx" integer,
	"end_idx" integer,
	"erwiderung" text,
	"einordnung" text,
	"context" text,
	"context_start_idx" integer,
	"context_end_idx" integer,
	"in_vae" boolean NOT NULL,
	"is_valid_argument" boolean NOT NULL,
	"argument_id" varchar,
	"topic_id" uuid,
	"status" "argumentstatus" DEFAULT 'open',
	"topic_confidence" double precision,
	"sub_topic_confidence" double precision,
	"project_version" integer,
	"is_outdated" boolean
);
--> statement-breakpoint
CREATE TABLE "argument" (
	"id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"is_deleted" boolean DEFAULT false NOT NULL,
	"frontend_parent_ids" varchar[] DEFAULT '{}' NOT NULL,
	"update_type" "updatetype" DEFAULT 'AUTOMATED',
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"sys_period" "tstzrange" DEFAULT tstzrange(current_timestamp, null) NOT NULL,
	"beteiligungs_eingang_id" uuid NOT NULL,
	"sub_topic_id" uuid,
	"text" text,
	"start_idx" integer,
	"end_idx" integer,
	"erwiderung" text,
	"einordnung" text,
	"context" text,
	"context_start_idx" integer,
	"context_end_idx" integer,
	"in_vae" boolean DEFAULT false NOT NULL,
	"is_valid_argument" boolean DEFAULT true NOT NULL,
	"argument_id" varchar,
	"topic_id" uuid,
	"status" "argumentstatus" DEFAULT 'open' NOT NULL,
	"topic_confidence" double precision,
	"sub_topic_confidence" double precision,
	"project_version" integer DEFAULT 1 NOT NULL,
	"is_outdated" boolean DEFAULT false NOT NULL,
	CONSTRAINT "argument_pkey" PRIMARY KEY("id","project_version")
);
--> statement-breakpoint
CREATE TABLE "beteiligungs_eingang" (
	"id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"is_deleted" boolean DEFAULT false NOT NULL,
	"frontend_parent_ids" varchar[] DEFAULT '{}' NOT NULL,
	"update_type" "updatetype" DEFAULT 'AUTOMATED',
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"sys_period" "tstzrange" DEFAULT tstzrange(current_timestamp, null) NOT NULL,
	"beteiligung_typ" "beteiligungtyp",
	"file_id" uuid NOT NULL,
	"extraction_status" "extractionstatus" NOT NULL,
	"classification_status" "classificationstatus" DEFAULT 'loading' NOT NULL,
	"filename" varchar,
	"project_version" integer DEFAULT 1 NOT NULL,
	"is_outdated" boolean DEFAULT false NOT NULL,
	"beteiligungs_eingang_markdown_id" uuid,
	CONSTRAINT "beteiligungs_eingang_pkey" PRIMARY KEY("id","project_version")
);
--> statement-breakpoint
CREATE TABLE "beteiligungs_eingang_history" (
	"id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"is_deleted" boolean NOT NULL,
	"frontend_parent_ids" varchar[] NOT NULL,
	"update_type" "updatetype",
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	"sys_period" "tstzrange" NOT NULL,
	"beteiligung_typ" "beteiligungtyp",
	"file_id" uuid NOT NULL,
	"extraction_status" "extractionstatus" NOT NULL,
	"classification_status" "classificationstatus" DEFAULT 'done',
	"filename" varchar,
	"project_version" integer,
	"is_outdated" boolean,
	"beteiligungs_eingang_markdown_id" uuid
);
--> statement-breakpoint
CREATE TABLE "beteiligungs_eingang_markdown" (
	"id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"is_deleted" boolean DEFAULT false NOT NULL,
	"is_outdated" boolean DEFAULT false NOT NULL,
	"frontend_parent_ids" varchar[] DEFAULT '{}' NOT NULL,
	"project_version" integer DEFAULT 1 NOT NULL,
	"update_type" "updatetype" DEFAULT 'AUTOMATED',
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"sys_period" "tstzrange" DEFAULT tstzrange(current_timestamp, null) NOT NULL,
	"beteiligungs_eingang_id" uuid NOT NULL,
	"text" text NOT NULL,
	CONSTRAINT "beteiligungs_eingang_markdown_pkey" PRIMARY KEY("id","project_version")
);
--> statement-breakpoint
CREATE TABLE "beteiligungs_eingang_markdown_history" (
	"id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"is_deleted" boolean NOT NULL,
	"is_outdated" boolean NOT NULL,
	"frontend_parent_ids" varchar[] NOT NULL,
	"project_version" integer NOT NULL,
	"update_type" "updatetype",
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	"sys_period" "tstzrange" NOT NULL,
	"beteiligungs_eingang_id" uuid NOT NULL,
	"text" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "plausibility_note_history" (
	"id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"project_version" integer,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	"sys_period" "tstzrange" NOT NULL,
	"is_deleted" boolean,
	"frontend_parent_ids" varchar[],
	"update_type" "updatetype",
	"is_outdated" boolean,
	"title" varchar,
	"description" text NOT NULL,
	"rating" integer,
	"confidence_score" double precision,
	"score_a" double precision,
	"score_b" double precision,
	"evidence" text[],
	"merged_count" integer,
	"status" varchar NOT NULL
);
--> statement-breakpoint
CREATE TABLE "plausibility_note_occurrence_history" (
	"id" uuid NOT NULL,
	"project_id" uuid,
	"project_version" integer,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	"sys_period" "tstzrange" NOT NULL,
	"is_deleted" boolean,
	"frontend_parent_ids" varchar[],
	"update_type" "updatetype",
	"is_outdated" boolean,
	"plausibility_note_id" uuid NOT NULL,
	"document_id" varchar NOT NULL,
	"document_name" varchar,
	"content_excerpt" text NOT NULL,
	"page_number" integer,
	"contradiction" text
);
--> statement-breakpoint
CREATE TABLE "plausibility_note_occurrence" (
	"id" uuid NOT NULL,
	"project_id" uuid,
	"project_version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"sys_period" "tstzrange" DEFAULT tstzrange(CURRENT_TIMESTAMP, null) NOT NULL,
	"is_deleted" boolean DEFAULT false NOT NULL,
	"frontend_parent_ids" varchar[] DEFAULT ARRAY[]::varchar[] NOT NULL,
	"update_type" "updatetype" DEFAULT 'AUTOMATED'::updatetype,
	"is_outdated" boolean DEFAULT false NOT NULL,
	"plausibility_note_id" uuid NOT NULL,
	"document_id" varchar NOT NULL,
	"document_name" varchar,
	"content_excerpt" text NOT NULL,
	"page_number" integer,
	"contradiction" text,
	CONSTRAINT "plausibility_note_occurrence_pkey" PRIMARY KEY("id","project_version")
);
--> statement-breakpoint
CREATE TABLE "plausibility_note" (
	"id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"project_version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"sys_period" "tstzrange" DEFAULT tstzrange(CURRENT_TIMESTAMP, null) NOT NULL,
	"is_deleted" boolean DEFAULT false NOT NULL,
	"frontend_parent_ids" varchar[] DEFAULT ARRAY[]::varchar[] NOT NULL,
	"update_type" "updatetype" DEFAULT 'AUTOMATED'::updatetype,
	"is_outdated" boolean DEFAULT false NOT NULL,
	"title" varchar,
	"description" text NOT NULL,
	"rating" integer,
	"confidence_score" double precision,
	"score_a" double precision,
	"score_b" double precision,
	"evidence" text[],
	"merged_count" integer,
	"status" varchar NOT NULL,
	CONSTRAINT "plausibility_note_pkey" PRIMARY KEY("id","project_version")
);
--> statement-breakpoint
CREATE TABLE "supplementary_request_history" (
	"id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"title" varchar(2000) NOT NULL,
	"reason" varchar(2000) NOT NULL,
	"included_in_letter" boolean NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	"priority" "priority" NOT NULL,
	"process_step" "processstep",
	"source_type" "sourcetype",
	"source_item_id" varchar(255),
	"topic_id" uuid,
	"document_id" uuid,
	"sys_period" "tstzrange" NOT NULL
);
--> statement-breakpoint
CREATE TABLE "supplementary_request" (
	"id" uuid PRIMARY KEY NOT NULL,
	"project_id" uuid NOT NULL,
	"title" varchar(2000) NOT NULL,
	"reason" varchar(2000) DEFAULT '' NOT NULL,
	"included_in_letter" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"priority" "priority" NOT NULL,
	"process_step" "processstep",
	"source_type" "sourcetype",
	"source_item_id" varchar(255),
	"topic_id" uuid,
	"document_id" uuid,
	"sys_period" "tstzrange" DEFAULT tstzrange(current_timestamp, null) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "workflow_execution" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workflow_id" varchar NOT NULL,
	"run_id" varchar NOT NULL,
	"workflow_type" varchar NOT NULL,
	"project_id" uuid,
	"project_version" integer,
	"status" "workflow_status" NOT NULL,
	"start_time" timestamp with time zone,
	"end_time" timestamp with time zone,
	"failure_message" varchar,
	"history_s3_key" varchar,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "uq_workflow_execution_wf_run" UNIQUE("workflow_id","run_id")
);
--> statement-breakpoint
CREATE TABLE "audit_log" (
	"id" uuid PRIMARY KEY NOT NULL,
	"timestamp" timestamp with time zone DEFAULT now() NOT NULL,
	"project_id" uuid NOT NULL,
	"entity_id" uuid,
	"entity_type" varchar NOT NULL,
	"change_type" varchar NOT NULL,
	"action_type" varchar,
	"actor_user_id" uuid,
	"triggered_by_user_id" uuid,
	"workflow_run_id" varchar,
	"workflow_type" varchar,
	"request_start_time" timestamp with time zone,
	"request_id" varchar
);
--> statement-breakpoint
CREATE TABLE "file_history" (
	"id" uuid NOT NULL,
	"mime_type" varchar NOT NULL,
	"bucket_path" varchar NOT NULL,
	"project_id" uuid,
	"vector_searchable" boolean,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	"type" "filetypeenum" NOT NULL,
	"filename" varchar NOT NULL,
	"workflow_id" varchar,
	"run_id" varchar,
	"source_zip_file_id" uuid,
	"is_deleted" boolean NOT NULL,
	"version" integer NOT NULL,
	"frontend_parent_ids" varchar[] NOT NULL,
	"update_type" "updatetype",
	"workflow_status" "workflowstatusenum",
	"sys_period" "tstzrange" NOT NULL,
	"added_in_version" integer,
	"is_outdated" boolean,
	"project_version" integer
);
--> statement-breakpoint
CREATE TABLE "file_topic_history" (
	"id" uuid NOT NULL,
	"file_id" uuid NOT NULL,
	"topic_id" uuid,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	"project_id" uuid,
	"is_deleted" boolean NOT NULL,
	"frontend_parent_ids" varchar[] NOT NULL,
	"update_type" "updatetype",
	"sys_period" "tstzrange" NOT NULL,
	"subtopic_id" uuid,
	"project_version" integer,
	"is_outdated" boolean
);
--> statement-breakpoint
CREATE TABLE "file_topic" (
	"id" uuid NOT NULL,
	"file_id" uuid NOT NULL,
	"topic_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"project_id" uuid,
	"is_deleted" boolean NOT NULL,
	"frontend_parent_ids" varchar[] DEFAULT '{}' NOT NULL,
	"update_type" "updatetype" DEFAULT 'AUTOMATED',
	"sys_period" "tstzrange" DEFAULT tstzrange(CURRENT_TIMESTAMP, NULL::timestamp with time zone) NOT NULL,
	"subtopic_id" uuid,
	"project_version" integer DEFAULT 1 NOT NULL,
	"is_outdated" boolean DEFAULT false NOT NULL,
	CONSTRAINT "file_topic_pkey" PRIMARY KEY("id","project_version"),
	CONSTRAINT "ck_file_topic_exactly_one_owner" CHECK ("file_topic"."topic_id" IS NOT NULL AND "file_topic"."subtopic_id" IS NULL OR "file_topic"."topic_id" IS NULL AND "file_topic"."subtopic_id" IS NOT NULL)
);
--> statement-breakpoint
CREATE TABLE "file" (
	"id" uuid NOT NULL,
	"mime_type" varchar NOT NULL,
	"bucket_path" varchar NOT NULL,
	"project_id" uuid,
	"vector_searchable" boolean,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"type" "filetypeenum" NOT NULL,
	"filename" varchar NOT NULL,
	"workflow_id" varchar,
	"run_id" varchar,
	"source_zip_file_id" uuid,
	"is_deleted" boolean NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"frontend_parent_ids" varchar[] DEFAULT '{}' NOT NULL,
	"update_type" "updatetype" DEFAULT 'AUTOMATED',
	"workflow_status" "workflowstatusenum",
	"sys_period" "tstzrange" DEFAULT tstzrange(CURRENT_TIMESTAMP, NULL::timestamp with time zone) NOT NULL,
	"added_in_version" integer,
	"is_outdated" boolean DEFAULT false NOT NULL,
	"project_version" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "file_pkey" PRIMARY KEY("id","project_version")
);
--> statement-breakpoint
CREATE TABLE "zip_file_diff_entry" (
	"id" uuid PRIMARY KEY NOT NULL,
	"zip_file_id" uuid NOT NULL,
	"project_version" integer DEFAULT 1 NOT NULL,
	"entry_key" varchar NOT NULL,
	"computed_kind" "zipdiffkind" NOT NULL,
	"decision_kind" "zipdiffkind" NOT NULL,
	"file_id" uuid,
	"filename" varchar NOT NULL,
	"old_name" varchar,
	"new_name" varchar,
	"bucket_path" varchar,
	"source_sha" varchar,
	"target_sha" varchar,
	"sha" varchar,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "uq_zip_file_diff_entry_key" UNIQUE("zip_file_id","project_version","entry_key")
);
--> statement-breakpoint
CREATE TABLE "zip_file_history" (
	"id" uuid NOT NULL,
	"filename" varchar NOT NULL,
	"bucket_path" varchar NOT NULL,
	"project_id" uuid,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	"workflow_status" "workflowstatusenum" NOT NULL,
	"is_deleted" boolean NOT NULL,
	"frontend_parent_ids" varchar[] NOT NULL,
	"update_type" "updatetype",
	"sys_period" "tstzrange" NOT NULL,
	"approval_status" "zipapprovalstatus",
	"approval_error" varchar,
	"source_project_version" integer,
	"project_version" integer,
	"is_outdated" boolean
);
--> statement-breakpoint
CREATE TABLE "zip_file" (
	"id" uuid NOT NULL,
	"filename" varchar NOT NULL,
	"bucket_path" varchar NOT NULL,
	"project_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"workflow_status" "workflowstatusenum" DEFAULT 'PENDING' NOT NULL,
	"is_deleted" boolean NOT NULL,
	"frontend_parent_ids" varchar[] DEFAULT '{}' NOT NULL,
	"update_type" "updatetype" DEFAULT 'AUTOMATED',
	"sys_period" "tstzrange" DEFAULT tstzrange(CURRENT_TIMESTAMP, NULL::timestamp with time zone) NOT NULL,
	"type" "filetypeenum" DEFAULT 'ZIP' NOT NULL,
	"approval_status" "zipapprovalstatus",
	"approval_error" varchar,
	"source_project_version" integer,
	"project_version" integer DEFAULT 1 NOT NULL,
	"is_outdated" boolean DEFAULT false NOT NULL,
	CONSTRAINT "zip_file_pkey" PRIMARY KEY("id","project_version")
);
--> statement-breakpoint
CREATE TABLE "applicant_history" (
	"id" uuid NOT NULL,
	"salutation" varchar,
	"company" varchar,
	"first_name" varchar,
	"last_name" varchar,
	"street" varchar,
	"house_number" varchar,
	"address_supplement" varchar,
	"plz" varchar,
	"location" varchar,
	"country" varchar,
	"email" varchar,
	"phone" varchar,
	"fax" varchar,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	"project_id" uuid NOT NULL,
	"is_deleted" boolean NOT NULL,
	"frontend_parent_ids" varchar[] NOT NULL,
	"update_type" "updatetype",
	"sys_period" "tstzrange" NOT NULL,
	"project_version" integer,
	"is_outdated" boolean
);
--> statement-breakpoint
CREATE TABLE "applicant" (
	"id" uuid NOT NULL,
	"salutation" varchar,
	"company" varchar,
	"first_name" varchar,
	"last_name" varchar,
	"street" varchar,
	"house_number" varchar,
	"address_supplement" varchar,
	"plz" varchar,
	"location" varchar,
	"country" varchar,
	"email" varchar,
	"phone" varchar,
	"fax" varchar,
	"created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"updated_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"project_id" uuid NOT NULL,
	"is_deleted" boolean DEFAULT false NOT NULL,
	"frontend_parent_ids" varchar[] DEFAULT '{}' NOT NULL,
	"update_type" "updatetype" DEFAULT 'AUTOMATED',
	"sys_period" "tstzrange" DEFAULT tstzrange(CURRENT_TIMESTAMP, NULL::timestamp with time zone) NOT NULL,
	"project_version" integer DEFAULT 1 NOT NULL,
	"is_outdated" boolean DEFAULT false NOT NULL,
	CONSTRAINT "applicant_pkey" PRIMARY KEY("id","project_version")
);
--> statement-breakpoint
CREATE TABLE "deadline_history" (
	"id" uuid NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	"project_id" uuid NOT NULL,
	"start_at" date,
	"end_at" date,
	"deadline_type" varchar,
	"legal_basis" varchar,
	"is_deleted" boolean NOT NULL,
	"frontend_parent_ids" varchar[] NOT NULL,
	"update_type" "updatetype",
	"sys_period" "tstzrange" NOT NULL,
	"project_version" integer,
	"is_outdated" boolean
);
--> statement-breakpoint
CREATE TABLE "deadline" (
	"id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"updated_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"project_id" uuid NOT NULL,
	"start_at" date,
	"end_at" date,
	"deadline_type" varchar,
	"legal_basis" varchar,
	"is_deleted" boolean DEFAULT false NOT NULL,
	"frontend_parent_ids" varchar[] DEFAULT '{}' NOT NULL,
	"update_type" "updatetype" DEFAULT 'AUTOMATED',
	"sys_period" "tstzrange" DEFAULT tstzrange(CURRENT_TIMESTAMP, NULL::timestamp with time zone) NOT NULL,
	"project_version" integer DEFAULT 1 NOT NULL,
	"is_outdated" boolean DEFAULT false NOT NULL,
	CONSTRAINT "deadline_pkey" PRIMARY KEY("id","project_version")
);
--> statement-breakpoint
CREATE TABLE "process_step_history" (
	"id" uuid NOT NULL,
	"process_step_index" integer,
	"project_type_id" uuid,
	"name" varchar,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	"sys_period" "tstzrange" NOT NULL
);
--> statement-breakpoint
CREATE TABLE "process_step" (
	"id" uuid PRIMARY KEY NOT NULL,
	"process_step_index" integer,
	"project_type_id" uuid,
	"name" varchar,
	"created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"updated_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"sys_period" "tstzrange" DEFAULT tstzrange(CURRENT_TIMESTAMP, NULL::timestamp with time zone) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "project_history" (
	"id" uuid NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	"name" varchar,
	"project_type_id" uuid,
	"created_by_id" uuid,
	"entry_date" date,
	"internal_project_number" varchar,
	"status_id" uuid,
	"current_process_step_id" uuid,
	"applicant_id" uuid,
	"project_id" uuid,
	"is_deleted" boolean NOT NULL,
	"frontend_parent_ids" varchar[] NOT NULL,
	"update_type" "updatetype",
	"sys_period" "tstzrange" NOT NULL,
	"project_version" integer,
	"is_outdated" boolean,
	"state" varchar(2),
	"imported" boolean,
	"original_created_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "project_status_history" (
	"id" uuid NOT NULL,
	"name" varchar,
	"internal_name" varchar NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	"sys_period" "tstzrange" NOT NULL
);
--> statement-breakpoint
CREATE TABLE "project_status" (
	"id" uuid PRIMARY KEY NOT NULL,
	"name" varchar,
	"internal_name" varchar NOT NULL,
	"created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"updated_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"sys_period" "tstzrange" DEFAULT tstzrange(CURRENT_TIMESTAMP, NULL::timestamp with time zone) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "project_type_history" (
	"id" uuid NOT NULL,
	"name" varchar(255) NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	"sys_period" "tstzrange" NOT NULL
);
--> statement-breakpoint
CREATE TABLE "project_type" (
	"id" uuid PRIMARY KEY NOT NULL,
	"name" varchar(255) NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"updated_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"sys_period" "tstzrange" DEFAULT tstzrange(CURRENT_TIMESTAMP, NULL::timestamp with time zone) NOT NULL,
	CONSTRAINT "uq_project_type_name" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "project_version_lock" (
	"id" uuid PRIMARY KEY NOT NULL,
	"project_id" uuid NOT NULL,
	"source_version" integer NOT NULL,
	"target_version" integer NOT NULL,
	"zip_file_id" uuid,
	"lock_token" varchar NOT NULL,
	"created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"updated_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"status" varchar(8) DEFAULT 'ACTIVE' NOT NULL,
	"error" varchar,
	CONSTRAINT "uq_project_version_lock_lock_token" UNIQUE("lock_token"),
	CONSTRAINT "projectversionlockstatus" CHECK ("project_version_lock"."status"::text = ANY (ARRAY['ACTIVE', 'RELEASED']::text[]))
);
--> statement-breakpoint
CREATE TABLE "project" (
	"id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"updated_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"name" varchar,
	"project_type_id" uuid,
	"created_by_id" uuid NOT NULL,
	"entry_date" date,
	"internal_project_number" varchar,
	"status_id" uuid,
	"current_process_step_id" uuid,
	"applicant_id" uuid,
	"project_id" uuid,
	"is_deleted" boolean DEFAULT false NOT NULL,
	"frontend_parent_ids" varchar[] DEFAULT '{}' NOT NULL,
	"update_type" "updatetype" DEFAULT 'AUTOMATED',
	"sys_period" "tstzrange" DEFAULT tstzrange(CURRENT_TIMESTAMP, NULL::timestamp with time zone) NOT NULL,
	"state" varchar(2),
	"project_version" integer DEFAULT 1 NOT NULL,
	"is_outdated" boolean DEFAULT false NOT NULL,
	"imported" boolean DEFAULT false NOT NULL,
	"original_created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
	CONSTRAINT "project_pkey" PRIMARY KEY("id","project_version"),
	CONSTRAINT "germanstate" CHECK ("project"."state"::text = ANY (ARRAY['BY', 'BW', 'BE', 'BB', 'HB', 'HH', 'HE', 'MV', 'NI', 'NW', 'RP', 'SL', 'SN', 'ST', 'SH', 'TH']::text[]))
);
--> statement-breakpoint
CREATE TABLE "subtopic_history" (
	"project_id" uuid NOT NULL,
	"topic_id" uuid NOT NULL,
	"id" uuid NOT NULL,
	"is_deleted" boolean NOT NULL,
	"frontend_parent_ids" varchar[] NOT NULL,
	"update_type" "updatetype",
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	"name" varchar NOT NULL,
	"show_in_mvp" boolean NOT NULL,
	"show_in_ewm" boolean NOT NULL,
	"show_in_beschluss" boolean NOT NULL,
	"description" varchar,
	"sys_period" "tstzrange" NOT NULL,
	"project_version" integer,
	"is_outdated" boolean
);
--> statement-breakpoint
CREATE TABLE "subtopic" (
	"project_id" uuid NOT NULL,
	"topic_id" uuid NOT NULL,
	"id" uuid NOT NULL,
	"is_deleted" boolean DEFAULT false NOT NULL,
	"frontend_parent_ids" varchar[] DEFAULT '{}' NOT NULL,
	"update_type" "updatetype" DEFAULT 'AUTOMATED',
	"created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"updated_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"name" varchar NOT NULL,
	"show_in_mvp" boolean DEFAULT true NOT NULL,
	"show_in_ewm" boolean DEFAULT false NOT NULL,
	"show_in_beschluss" boolean DEFAULT false NOT NULL,
	"description" varchar,
	"sys_period" "tstzrange" DEFAULT tstzrange(CURRENT_TIMESTAMP, NULL::timestamp with time zone) NOT NULL,
	"project_version" integer DEFAULT 1 NOT NULL,
	"is_outdated" boolean DEFAULT false NOT NULL,
	CONSTRAINT "subtopic_pkey" PRIMARY KEY("id","project_version")
);
--> statement-breakpoint
CREATE TABLE "topic_history" (
	"id" uuid NOT NULL,
	"name" varchar NOT NULL,
	"description" varchar,
	"is_deleted" boolean NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	"parent_topic_id" uuid,
	"project_id" uuid NOT NULL,
	"update_type" "updatetype",
	"frontend_parent_ids" varchar[] NOT NULL,
	"mvp_assignee" uuid,
	"rpb_assignee" uuid,
	"show_in_mvp" boolean NOT NULL,
	"sys_period" "tstzrange" NOT NULL,
	"show_in_ewm" boolean DEFAULT false NOT NULL,
	"show_in_beschluss" boolean DEFAULT false NOT NULL,
	"project_version" integer,
	"is_outdated" boolean,
	"mvp_assignees" uuid[] DEFAULT '{}' NOT NULL,
	"rpb_assignees" uuid[] DEFAULT '{}' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "topic_norm_history" (
	"topic_id" uuid,
	"project_id" uuid NOT NULL,
	"update_type" "updatetype",
	"id" uuid NOT NULL,
	"is_deleted" boolean NOT NULL,
	"frontend_parent_ids" varchar[] NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	"jurabk" varchar NOT NULL,
	"paragraph_nr" varchar,
	"satz" varchar,
	"absatz" varchar,
	"nummer" varchar,
	"type" varchar(9) NOT NULL,
	"sys_period" "tstzrange" NOT NULL,
	"project_version" integer,
	"mvp_status" varchar(32) DEFAULT 'unchecked' NOT NULL,
	"satz_statuses" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"is_outdated" boolean,
	CONSTRAINT "ck_topic_norm_history_mvp_status" CHECK ("topic_norm_history"."mvp_status"::text = ANY (ARRAY['unchecked', 'checked', 'needs_revision']::text[]))
);
--> statement-breakpoint
CREATE TABLE "topic_norm" (
	"topic_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"update_type" "updatetype" DEFAULT 'AUTOMATED',
	"id" uuid NOT NULL,
	"is_deleted" boolean DEFAULT false NOT NULL,
	"frontend_parent_ids" varchar[] DEFAULT '{}' NOT NULL,
	"created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"updated_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"jurabk" varchar NOT NULL,
	"paragraph_nr" varchar,
	"satz" varchar,
	"absatz" varchar,
	"nummer" varchar,
	"type" varchar(9) DEFAULT 'PRUEFUNG' NOT NULL,
	"sys_period" "tstzrange" DEFAULT tstzrange(CURRENT_TIMESTAMP, NULL::timestamp with time zone) NOT NULL,
	"project_version" integer DEFAULT 1 NOT NULL,
	"mvp_status" varchar(32) DEFAULT 'unchecked' NOT NULL,
	"satz_statuses" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"is_outdated" boolean DEFAULT false NOT NULL,
	CONSTRAINT "topic_norm_pkey" PRIMARY KEY("id","project_version"),
	CONSTRAINT "ck_topic_norm_mvp_status" CHECK ("topic_norm"."mvp_status"::text = ANY (ARRAY['unchecked', 'checked', 'needs_revision']::text[])),
	CONSTRAINT "topicnormtype" CHECK ("topic_norm"."type"::text = ANY (ARRAY['PRUEFUNG', 'VERFAHREN']::text[])),
	CONSTRAINT "updatetype" CHECK ("topic_norm"."update_type"::text = ANY (ARRAY['AUTOMATED', 'MANUAL']::text[]))
);
--> statement-breakpoint
CREATE TABLE "topic" (
	"id" uuid NOT NULL,
	"name" varchar NOT NULL,
	"description" varchar,
	"is_deleted" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"updated_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"parent_topic_id" uuid,
	"project_id" uuid NOT NULL,
	"update_type" "updatetype" DEFAULT 'AUTOMATED',
	"frontend_parent_ids" varchar[] DEFAULT '{}' NOT NULL,
	"mvp_assignee" uuid,
	"rpb_assignee" uuid,
	"show_in_mvp" boolean DEFAULT true NOT NULL,
	"sys_period" "tstzrange" DEFAULT tstzrange(CURRENT_TIMESTAMP, NULL::timestamp with time zone) NOT NULL,
	"mvp_assignees" uuid[] DEFAULT '{}' NOT NULL,
	"rpb_assignees" uuid[] DEFAULT '{}' NOT NULL,
	"show_in_ewm" boolean DEFAULT false NOT NULL,
	"show_in_beschluss" boolean DEFAULT false NOT NULL,
	"project_version" integer DEFAULT 1 NOT NULL,
	"is_outdated" boolean DEFAULT false NOT NULL,
	CONSTRAINT "topic_pkey" PRIMARY KEY("id","project_version"),
	CONSTRAINT "updatetype" CHECK ("topic"."update_type"::text = ANY (ARRAY['AUTOMATED', 'MANUAL']::text[]))
);
--> statement-breakpoint
CREATE TABLE "usecase_document" (
	"authority_id" text NOT NULL,
	"type" varchar(32) NOT NULL,
	"document" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "usecase_document_authority_id_type_pk" PRIMARY KEY("authority_id","type")
);
--> statement-breakpoint
ALTER TABLE "risks" ADD CONSTRAINT "risks_vae_node_id_fkey" FOREIGN KEY ("vae_node_id","project_version") REFERENCES "public"."vae_node"("id","project_version") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vae_node" ADD CONSTRAINT "vae_node_parent_vae_node_id_fkey" FOREIGN KEY ("parent_vae_node_id","project_version") REFERENCES "public"."vae_node"("id","project_version") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "absatz" ADD CONSTRAINT "absatz_norm_id_fkey" FOREIGN KEY ("norm_id","project_version") REFERENCES "public"."norm"("id","project_version") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "adressat" ADD CONSTRAINT "adressat_rechtsfolge_id_fkey" FOREIGN KEY ("rechtsfolge_id","project_version") REFERENCES "public"."rechtsfolge"("id","project_version") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "atomares_tbm" ADD CONSTRAINT "atomares_tbm_satz_id_fkey" FOREIGN KEY ("satz_id","project_version") REFERENCES "public"."satz"("id","project_version") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "auslegungsvorschlag" ADD CONSTRAINT "auslegungsvorschlag_unbestimmter_rechtsbegriff_id_fkey" FOREIGN KEY ("unbestimmter_rechtsbegriff_id","project_version") REFERENCES "public"."unbestimmter_rechtsbegriff"("id","project_version") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bestimmter_rechtsbegriff" ADD CONSTRAINT "bestimmter_rechtsbegriff_atomares_tbm_id_fkey" FOREIGN KEY ("atomares_tbm_id","project_version") REFERENCES "public"."atomares_tbm"("id","project_version") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bewertung" ADD CONSTRAINT "bewertung_markdown_text_id_fkey" FOREIGN KEY ("markdown_text_id","project_version") REFERENCES "public"."markdown_text"("id","project_version") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bewertung" ADD CONSTRAINT "bewertung_satz_id_fkey" FOREIGN KEY ("satz_id","project_version") REFERENCES "public"."satz"("id","project_version") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bewertung_kapitel" ADD CONSTRAINT "bewertung_kapitel_bewertung_id_fkey" FOREIGN KEY ("bewertung_id","project_version") REFERENCES "public"."bewertung"("id","project_version") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bewertung_quelle" ADD CONSTRAINT "bewertung_quelle_bewertung_id_fkey" FOREIGN KEY ("bewertung_id","project_version") REFERENCES "public"."bewertung"("id","project_version") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bewertung_quelle" ADD CONSTRAINT "bewertung_quelle_dokument_id_fkey" FOREIGN KEY ("dokument_id","project_version") REFERENCES "public"."dokument"("id","project_version") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bewertung_quelle" ADD CONSTRAINT "bewertung_quelle_fundstelle_id_fkey" FOREIGN KEY ("fundstelle_id","project_version") REFERENCES "public"."fundstelle"("id","project_version") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chunk" ADD CONSTRAINT "chunk_dokument_id_fkey" FOREIGN KEY ("dokument_id","project_version") REFERENCES "public"."dokument"("id","project_version") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dokument" ADD CONSTRAINT "dokument_markdown_text_id_fkey" FOREIGN KEY ("markdown_text_id","project_version") REFERENCES "public"."markdown_text"("id","project_version") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ermessensart" ADD CONSTRAINT "ermessensart_rechtsfolge_id_fkey" FOREIGN KEY ("rechtsfolge_id","project_version") REFERENCES "public"."rechtsfolge"("id","project_version") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ermessensspielraum" ADD CONSTRAINT "ermessensspielraum_rechtsfolge_id_fkey" FOREIGN KEY ("rechtsfolge_id","project_version") REFERENCES "public"."rechtsfolge"("id","project_version") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expliziter_verweis" ADD CONSTRAINT "expliziter_verweis_atomares_tbm_id_fkey" FOREIGN KEY ("atomares_tbm_id","project_version") REFERENCES "public"."atomares_tbm"("id","project_version") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expliziter_verweis" ADD CONSTRAINT "expliziter_verweis_rechtsfolge_id_fkey" FOREIGN KEY ("rechtsfolge_id","project_version") REFERENCES "public"."rechtsfolge"("id","project_version") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fundstelle" ADD CONSTRAINT "fundstelle_dokument_id_fkey" FOREIGN KEY ("dokument_id","project_version") REFERENCES "public"."dokument"("id","project_version") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fundstelle" ADD CONSTRAINT "fundstelle_gesetz_id_fkey" FOREIGN KEY ("gesetz_id","project_version") REFERENCES "public"."gesetz"("id","project_version") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fundstelle" ADD CONSTRAINT "fundstelle_norm_id_fkey" FOREIGN KEY ("norm_id","project_version") REFERENCES "public"."norm"("id","project_version") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fundstelle" ADD CONSTRAINT "fundstelle_satz_id_fkey" FOREIGN KEY ("satz_id","project_version") REFERENCES "public"."satz"("id","project_version") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "impliziter_verweis" ADD CONSTRAINT "impliziter_verweis_atomares_tbm_id_fkey" FOREIGN KEY ("atomares_tbm_id","project_version") REFERENCES "public"."atomares_tbm"("id","project_version") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "impliziter_verweis" ADD CONSTRAINT "impliziter_verweis_rechtsfolge_id_fkey" FOREIGN KEY ("rechtsfolge_id","project_version") REFERENCES "public"."rechtsfolge"("id","project_version") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "legaldefinition" ADD CONSTRAINT "legaldefinition_bestimmter_rechtsbegriff_id_fkey" FOREIGN KEY ("bestimmter_rechtsbegriff_id","project_version") REFERENCES "public"."bestimmter_rechtsbegriff"("id","project_version") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "norm" ADD CONSTRAINT "norm_gesetz_id_fkey" FOREIGN KEY ("gesetz_id","project_version") REFERENCES "public"."gesetz"("id","project_version") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "normvorschlag" ADD CONSTRAINT "normvorschlag_norm_id_fkey" FOREIGN KEY ("norm_id","project_version") REFERENCES "public"."norm"("id","project_version") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "examination_project" ADD CONSTRAINT "examination_project_project_id_fkey" FOREIGN KEY ("project_id","project_version") REFERENCES "public"."examination_project"("id","project_version") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rechtsfolge" ADD CONSTRAINT "rechtsfolge_satz_id_fkey" FOREIGN KEY ("satz_id","project_version") REFERENCES "public"."satz"("id","project_version") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "required_doc" ADD CONSTRAINT "required_doc_gs_pruefung_id_fkey" FOREIGN KEY ("gs_pruefung_id","project_version") REFERENCES "public"."gs_pruefung"("id","project_version") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "satz" ADD CONSTRAINT "satz_absatz_id_fkey" FOREIGN KEY ("absatz_id","project_version") REFERENCES "public"."absatz"("id","project_version") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "soll_dokument" ADD CONSTRAINT "soll_dokument_iv_pruefung_id_fkey" FOREIGN KEY ("iv_pruefung_id","project_version") REFERENCES "public"."iv_pruefung"("id","project_version") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sollensanordnungen" ADD CONSTRAINT "sollensanordnungen_rechtsfolge_id_fkey" FOREIGN KEY ("rechtsfolge_id","project_version") REFERENCES "public"."rechtsfolge"("id","project_version") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "standangabe" ADD CONSTRAINT "standangabe_gesetz_id_fkey" FOREIGN KEY ("gesetz_id","project_version") REFERENCES "public"."gesetz"("id","project_version") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sub_chunk" ADD CONSTRAINT "sub_chunk_chunk_id_fkey" FOREIGN KEY ("chunk_id","project_version") REFERENCES "public"."chunk"("id","project_version") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sub_chunk" ADD CONSTRAINT "sub_chunk_markdown_text_id_fkey" FOREIGN KEY ("markdown_text_id","project_version") REFERENCES "public"."markdown_text"("id","project_version") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sub_chunk_image" ADD CONSTRAINT "sub_chunk_image_sub_chunk_id_fkey" FOREIGN KEY ("sub_chunk_id","project_version") REFERENCES "public"."sub_chunk"("id","project_version") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sub_chunk_relation" ADD CONSTRAINT "sub_chunk_relation_from_sub_chunk_id_fkey" FOREIGN KEY ("from_sub_chunk_id","project_version") REFERENCES "public"."sub_chunk"("id","project_version") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sub_chunk_relation" ADD CONSTRAINT "sub_chunk_relation_to_sub_chunk_id_fkey" FOREIGN KEY ("to_sub_chunk_id","project_version") REFERENCES "public"."sub_chunk"("id","project_version") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sub_chunk_table" ADD CONSTRAINT "sub_chunk_table_sub_chunk_id_fkey" FOREIGN KEY ("sub_chunk_id","project_version") REFERENCES "public"."sub_chunk"("id","project_version") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sub_chunk_text" ADD CONSTRAINT "sub_chunk_text_sub_chunk_id_fkey" FOREIGN KEY ("sub_chunk_id","project_version") REFERENCES "public"."sub_chunk"("id","project_version") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "technische_norm" ADD CONSTRAINT "technische_norm_atomares_tbm_id_fkey" FOREIGN KEY ("atomares_tbm_id","project_version") REFERENCES "public"."atomares_tbm"("id","project_version") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "technische_norm_entry" ADD CONSTRAINT "technische_norm_entry_technische_norm_id_fkey" FOREIGN KEY ("technische_norm_id","project_version") REFERENCES "public"."technische_norm"("id","project_version") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "unbestimmter_rechtsbegriff" ADD CONSTRAINT "unbestimmter_rechtsbegriff_atomares_tbm_id_fkey" FOREIGN KEY ("atomares_tbm_id","project_version") REFERENCES "public"."atomares_tbm"("id","project_version") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "verwaltungsaktentwurf_teil" ADD CONSTRAINT "verwaltungsaktentwurf_teil_bewertung_id_fkey" FOREIGN KEY ("bewertung_id","project_version") REFERENCES "public"."bewertung"("id","project_version") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "widerspruch" ADD CONSTRAINT "widerspruch_dokument_id_fkey" FOREIGN KEY ("dokument_id","project_version") REFERENCES "public"."dokument"("id","project_version") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "zugeordnetes_dokument" ADD CONSTRAINT "zugeordnetes_dokument_dokument_id_fkey" FOREIGN KEY ("dokument_id","project_version") REFERENCES "public"."dokument"("id","project_version") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "zugeordnetes_dokument" ADD CONSTRAINT "zugeordnetes_dokument_required_doc_id_fkey" FOREIGN KEY ("required_doc_id","project_version") REFERENCES "public"."required_doc"("id","project_version") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "zugeordnetes_dokument" ADD CONSTRAINT "zugeordnetes_dokument_soll_dokument_id_fkey" FOREIGN KEY ("soll_dokument_id","project_version") REFERENCES "public"."soll_dokument"("id","project_version") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "zusammenfassung" ADD CONSTRAINT "zusammenfassung_dokument_id_fkey" FOREIGN KEY ("dokument_id","project_version") REFERENCES "public"."dokument"("id","project_version") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "zusammenfassung" ADD CONSTRAINT "zusammenfassung_required_doc_id_fkey" FOREIGN KEY ("required_doc_id","project_version") REFERENCES "public"."required_doc"("id","project_version") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "zusammenfassung" ADD CONSTRAINT "zusammenfassung_soll_dokument_id_fkey" FOREIGN KEY ("soll_dokument_id","project_version") REFERENCES "public"."soll_dokument"("id","project_version") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_type" ADD CONSTRAINT "document_type_category_id_fkey" FOREIGN KEY ("category_id","project_version") REFERENCES "public"."category"("id","project_version") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document" ADD CONSTRAINT "document_ai_suggested_required_document_type_id_fkey" FOREIGN KEY ("ai_suggested_required_document_type_id","project_version") REFERENCES "public"."document_type"("id","project_version") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document" ADD CONSTRAINT "document_human_required_document_type_id_fkey" FOREIGN KEY ("human_required_document_type_id","project_version") REFERENCES "public"."document_type"("id","project_version") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fpp_file" ADD CONSTRAINT "fpp_file_request_id_fkey" FOREIGN KEY ("request_id") REFERENCES "public"."fpp_request"("request_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "argument" ADD CONSTRAINT "argument_beteiligungs_eingang_id_fkey" FOREIGN KEY ("beteiligungs_eingang_id","project_version") REFERENCES "public"."beteiligungs_eingang"("id","project_version") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "beteiligungs_eingang_markdown" ADD CONSTRAINT "beteiligungs_eingang_markdown_beteiligungs_eingang_id_proj_fkey" FOREIGN KEY ("beteiligungs_eingang_id","project_version") REFERENCES "public"."beteiligungs_eingang"("id","project_version") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plausibility_note_occurrence" ADD CONSTRAINT "plausibility_note_occurrence_plausibility_note_id_fkey" FOREIGN KEY ("plausibility_note_id","project_version") REFERENCES "public"."plausibility_note"("id","project_version") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "file_topic" ADD CONSTRAINT "file_topic_file_id_fkey" FOREIGN KEY ("file_id","project_version") REFERENCES "public"."file"("id","project_version") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "file" ADD CONSTRAINT "file_source_zip_file_id_fkey" FOREIGN KEY ("source_zip_file_id","project_version") REFERENCES "public"."zip_file"("id","project_version") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "zip_file_diff_entry" ADD CONSTRAINT "zip_file_diff_entry_zip_file_id_project_version_fkey" FOREIGN KEY ("zip_file_id","project_version") REFERENCES "public"."zip_file"("id","project_version") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deadline" ADD CONSTRAINT "deadline_project_id_fkey" FOREIGN KEY ("project_id","project_version") REFERENCES "public"."project"("id","project_version") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "process_step" ADD CONSTRAINT "process_step_project_type_id_fkey" FOREIGN KEY ("project_type_id") REFERENCES "public"."project_type"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project" ADD CONSTRAINT "fk_project_applicant_id" FOREIGN KEY ("applicant_id","project_version") REFERENCES "public"."applicant"("id","project_version") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project" ADD CONSTRAINT "project_current_process_step_id_fkey" FOREIGN KEY ("current_process_step_id") REFERENCES "public"."process_step"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project" ADD CONSTRAINT "project_project_type_id_fkey" FOREIGN KEY ("project_type_id") REFERENCES "public"."project_type"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project" ADD CONSTRAINT "project_status_id_fkey" FOREIGN KEY ("status_id") REFERENCES "public"."project_status"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subtopic" ADD CONSTRAINT "fk_subtopic_project_id_project" FOREIGN KEY ("project_id","project_version") REFERENCES "public"."project"("id","project_version") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subtopic" ADD CONSTRAINT "fk_subtopic_topic_id_topic" FOREIGN KEY ("topic_id","project_version") REFERENCES "public"."topic"("id","project_version") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "topic_norm" ADD CONSTRAINT "topic_norm_project_id_fkey" FOREIGN KEY ("project_id","project_version") REFERENCES "public"."project"("id","project_version") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "topic_norm" ADD CONSTRAINT "topic_norm_topic_id_fkey" FOREIGN KEY ("topic_id","project_version") REFERENCES "public"."topic"("id","project_version") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "topic" ADD CONSTRAINT "topic_parent_topic_id_fkey" FOREIGN KEY ("parent_topic_id","project_version") REFERENCES "public"."topic"("id","project_version") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "topic" ADD CONSTRAINT "topic_project_id_fkey" FOREIGN KEY ("project_id","project_version") REFERENCES "public"."project"("id","project_version") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ix_risk_vae_node_id" ON "risks" USING btree ("vae_node_id");--> statement-breakpoint
CREATE INDEX "ix_risks_project_id" ON "risks" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "ix_risks_project_id_active" ON "risks" USING btree ("project_id","project_version") WHERE "risks"."is_deleted" IS false;--> statement-breakpoint
CREATE INDEX "risks_history_id_idx" ON "risks_history" USING btree ("id");--> statement-breakpoint
CREATE INDEX "risks_history_sys_period_idx" ON "risks_history" USING btree ("sys_period");--> statement-breakpoint
CREATE INDEX "vae_node_history_id_idx" ON "vae_node_history" USING btree ("id");--> statement-breakpoint
CREATE INDEX "vae_node_history_sys_period_idx" ON "vae_node_history" USING btree ("sys_period");--> statement-breakpoint
CREATE INDEX "ix_vae_node_parent_order" ON "vae_node" USING btree ("parent_vae_node_id","order");--> statement-breakpoint
CREATE INDEX "ix_vae_node_parent" ON "vae_node" USING btree ("parent_vae_node_id");--> statement-breakpoint
CREATE INDEX "ix_vae_node_project_id" ON "vae_node" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "ix_vae_node_project_id_active" ON "vae_node" USING btree ("project_id","project_version") WHERE "vae_node"."is_deleted" IS false;--> statement-breakpoint
CREATE INDEX "ix_vae_node_template" ON "vae_node" USING btree ("template_id");--> statement-breakpoint
CREATE INDEX "ix_vae_node_topic_id" ON "vae_node" USING btree ("topic_id");--> statement-breakpoint
CREATE INDEX "ix_vae_node_subtopic_id" ON "vae_node" USING btree ("subtopic_id");--> statement-breakpoint
CREATE INDEX "comment_history_id_idx" ON "comment_history" USING btree ("id");--> statement-breakpoint
CREATE INDEX "comment_history_sys_period_idx" ON "comment_history" USING btree ("sys_period");--> statement-breakpoint
CREATE INDEX "ix_comment_project_id" ON "comment" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "ix_comment_project_process_step" ON "comment" USING btree ("project_id","process_step");--> statement-breakpoint
CREATE INDEX "ix_absatz_norm_id" ON "absatz" USING btree ("norm_id");--> statement-breakpoint
CREATE INDEX "ix_absatz_project_id" ON "absatz" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "ix_absatz_project_id_active" ON "absatz" USING btree ("project_id","project_version") WHERE (is_deleted IS FALSE);--> statement-breakpoint
CREATE INDEX "absatz_history_id_idx" ON "absatz_history" USING btree ("id");--> statement-breakpoint
CREATE INDEX "absatz_history_sys_period_idx" ON "absatz_history" USING btree ("sys_period");--> statement-breakpoint
CREATE INDEX "ix_adressat_project_id" ON "adressat" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "ix_adressat_project_id_active" ON "adressat" USING btree ("project_id","project_version") WHERE (is_deleted IS FALSE);--> statement-breakpoint
CREATE INDEX "ix_adressat_rechtsfolge_id" ON "adressat" USING btree ("rechtsfolge_id");--> statement-breakpoint
CREATE INDEX "adressat_history_id_idx" ON "adressat_history" USING btree ("id");--> statement-breakpoint
CREATE INDEX "adressat_history_sys_period_idx" ON "adressat_history" USING btree ("sys_period");--> statement-breakpoint
CREATE INDEX "ix_atomares_tbm_project_id" ON "atomares_tbm" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "ix_atomares_tbm_project_id_active" ON "atomares_tbm" USING btree ("project_id","project_version") WHERE (is_deleted IS FALSE);--> statement-breakpoint
CREATE INDEX "ix_atomares_tbm_satz_id" ON "atomares_tbm" USING btree ("satz_id");--> statement-breakpoint
CREATE INDEX "atomares_tbm_history_id_idx" ON "atomares_tbm_history" USING btree ("id");--> statement-breakpoint
CREATE INDEX "atomares_tbm_history_sys_period_idx" ON "atomares_tbm_history" USING btree ("sys_period");--> statement-breakpoint
CREATE INDEX "ix_auslegungsvorschlag_project_id" ON "auslegungsvorschlag" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "ix_auslegungsvorschlag_project_id_active" ON "auslegungsvorschlag" USING btree ("project_id","project_version") WHERE (is_deleted IS FALSE);--> statement-breakpoint
CREATE INDEX "ix_auslegungsvorschlag_unbestimmter_rechtsbegriff_id" ON "auslegungsvorschlag" USING btree ("unbestimmter_rechtsbegriff_id");--> statement-breakpoint
CREATE INDEX "auslegungsvorschlag_history_id_idx" ON "auslegungsvorschlag_history" USING btree ("id");--> statement-breakpoint
CREATE INDEX "auslegungsvorschlag_history_sys_period_idx" ON "auslegungsvorschlag_history" USING btree ("sys_period");--> statement-breakpoint
CREATE INDEX "ix_bestimmter_rechtsbegriff_atomares_tbm_id" ON "bestimmter_rechtsbegriff" USING btree ("atomares_tbm_id");--> statement-breakpoint
CREATE INDEX "ix_bestimmter_rechtsbegriff_project_id" ON "bestimmter_rechtsbegriff" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "ix_bestimmter_rechtsbegriff_project_id_active" ON "bestimmter_rechtsbegriff" USING btree ("project_id","project_version") WHERE (is_deleted IS FALSE);--> statement-breakpoint
CREATE INDEX "bestimmter_rechtsbegriff_history_id_idx" ON "bestimmter_rechtsbegriff_history" USING btree ("id");--> statement-breakpoint
CREATE INDEX "bestimmter_rechtsbegriff_history_sys_period_idx" ON "bestimmter_rechtsbegriff_history" USING btree ("sys_period");--> statement-breakpoint
CREATE INDEX "ix_bewertung_markdown_text_id" ON "bewertung" USING btree ("markdown_text_id");--> statement-breakpoint
CREATE INDEX "ix_bewertung_project_id" ON "bewertung" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "ix_bewertung_project_id_active" ON "bewertung" USING btree ("project_id","project_version") WHERE (is_deleted IS FALSE);--> statement-breakpoint
CREATE INDEX "ix_bewertung_satz_id" ON "bewertung" USING btree ("satz_id");--> statement-breakpoint
CREATE INDEX "bewertung_history_id_idx" ON "bewertung_history" USING btree ("id");--> statement-breakpoint
CREATE INDEX "bewertung_history_sys_period_idx" ON "bewertung_history" USING btree ("sys_period");--> statement-breakpoint
CREATE INDEX "ix_bewertung_kapitel_bewertung_id" ON "bewertung_kapitel" USING btree ("bewertung_id");--> statement-breakpoint
CREATE INDEX "ix_bewertung_kapitel_project_id" ON "bewertung_kapitel" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "ix_bewertung_kapitel_project_id_active" ON "bewertung_kapitel" USING btree ("project_id","project_version") WHERE (is_deleted IS FALSE);--> statement-breakpoint
CREATE INDEX "bewertung_kapitel_history_id_idx" ON "bewertung_kapitel_history" USING btree ("id");--> statement-breakpoint
CREATE INDEX "bewertung_kapitel_history_sys_period_idx" ON "bewertung_kapitel_history" USING btree ("sys_period");--> statement-breakpoint
CREATE INDEX "ix_bewertung_quelle_bewertung_id" ON "bewertung_quelle" USING btree ("bewertung_id");--> statement-breakpoint
CREATE INDEX "ix_bewertung_quelle_dokument_id" ON "bewertung_quelle" USING btree ("dokument_id");--> statement-breakpoint
CREATE INDEX "ix_bewertung_quelle_fundstelle_id" ON "bewertung_quelle" USING btree ("fundstelle_id");--> statement-breakpoint
CREATE INDEX "ix_bewertung_quelle_project_id" ON "bewertung_quelle" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "ix_bewertung_quelle_project_id_active" ON "bewertung_quelle" USING btree ("project_id","project_version") WHERE (is_deleted IS FALSE);--> statement-breakpoint
CREATE INDEX "bewertung_quelle_history_id_idx" ON "bewertung_quelle_history" USING btree ("id");--> statement-breakpoint
CREATE INDEX "bewertung_quelle_history_sys_period_idx" ON "bewertung_quelle_history" USING btree ("sys_period");--> statement-breakpoint
CREATE INDEX "ix_chunk_dokument_id" ON "chunk" USING btree ("dokument_id");--> statement-breakpoint
CREATE INDEX "ix_chunk_project_id" ON "chunk" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "ix_chunk_project_id_active" ON "chunk" USING btree ("project_id","project_version") WHERE (is_deleted IS FALSE);--> statement-breakpoint
CREATE INDEX "chunk_history_id_idx" ON "chunk_history" USING btree ("id");--> statement-breakpoint
CREATE INDEX "chunk_history_sys_period_idx" ON "chunk_history" USING btree ("sys_period");--> statement-breakpoint
CREATE INDEX "ix_dokument_markdown_text_id" ON "dokument" USING btree ("markdown_text_id");--> statement-breakpoint
CREATE INDEX "ix_dokument_project_id" ON "dokument" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "ix_dokument_project_id_active" ON "dokument" USING btree ("project_id","project_version") WHERE (is_deleted IS FALSE);--> statement-breakpoint
CREATE INDEX "dokument_history_id_idx" ON "dokument_history" USING btree ("id");--> statement-breakpoint
CREATE INDEX "dokument_history_sys_period_idx" ON "dokument_history" USING btree ("sys_period");--> statement-breakpoint
CREATE INDEX "ix_ermessensart_project_id" ON "ermessensart" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "ix_ermessensart_project_id_active" ON "ermessensart" USING btree ("project_id","project_version") WHERE (is_deleted IS FALSE);--> statement-breakpoint
CREATE INDEX "ix_ermessensart_rechtsfolge_id" ON "ermessensart" USING btree ("rechtsfolge_id");--> statement-breakpoint
CREATE INDEX "ermessensart_history_id_idx" ON "ermessensart_history" USING btree ("id");--> statement-breakpoint
CREATE INDEX "ermessensart_history_sys_period_idx" ON "ermessensart_history" USING btree ("sys_period");--> statement-breakpoint
CREATE INDEX "ix_ermessensspielraum_project_id" ON "ermessensspielraum" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "ix_ermessensspielraum_project_id_active" ON "ermessensspielraum" USING btree ("project_id","project_version") WHERE (is_deleted IS FALSE);--> statement-breakpoint
CREATE INDEX "ix_ermessensspielraum_rechtsfolge_id" ON "ermessensspielraum" USING btree ("rechtsfolge_id");--> statement-breakpoint
CREATE INDEX "ermessensspielraum_history_id_idx" ON "ermessensspielraum_history" USING btree ("id");--> statement-breakpoint
CREATE INDEX "ermessensspielraum_history_sys_period_idx" ON "ermessensspielraum_history" USING btree ("sys_period");--> statement-breakpoint
CREATE INDEX "examination_project_history_id_idx" ON "examination_project_history" USING btree ("id");--> statement-breakpoint
CREATE INDEX "examination_project_history_sys_period_idx" ON "examination_project_history" USING btree ("sys_period");--> statement-breakpoint
CREATE INDEX "ix_expliziter_verweis_atomares_tbm_id" ON "expliziter_verweis" USING btree ("atomares_tbm_id");--> statement-breakpoint
CREATE INDEX "ix_expliziter_verweis_project_id" ON "expliziter_verweis" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "ix_expliziter_verweis_project_id_active" ON "expliziter_verweis" USING btree ("project_id","project_version") WHERE (is_deleted IS FALSE);--> statement-breakpoint
CREATE INDEX "ix_expliziter_verweis_rechtsfolge_id" ON "expliziter_verweis" USING btree ("rechtsfolge_id");--> statement-breakpoint
CREATE INDEX "expliziter_verweis_history_id_idx" ON "expliziter_verweis_history" USING btree ("id");--> statement-breakpoint
CREATE INDEX "expliziter_verweis_history_sys_period_idx" ON "expliziter_verweis_history" USING btree ("sys_period");--> statement-breakpoint
CREATE INDEX "ix_fundstelle_dokument_id" ON "fundstelle" USING btree ("dokument_id");--> statement-breakpoint
CREATE INDEX "ix_fundstelle_gesetz_id" ON "fundstelle" USING btree ("gesetz_id");--> statement-breakpoint
CREATE INDEX "ix_fundstelle_norm_id" ON "fundstelle" USING btree ("norm_id");--> statement-breakpoint
CREATE INDEX "ix_fundstelle_project_id" ON "fundstelle" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "ix_fundstelle_project_id_active" ON "fundstelle" USING btree ("project_id","project_version") WHERE (is_deleted IS FALSE);--> statement-breakpoint
CREATE INDEX "ix_fundstelle_satz_id" ON "fundstelle" USING btree ("satz_id");--> statement-breakpoint
CREATE INDEX "fundstelle_history_id_idx" ON "fundstelle_history" USING btree ("id");--> statement-breakpoint
CREATE INDEX "fundstelle_history_sys_period_idx" ON "fundstelle_history" USING btree ("sys_period");--> statement-breakpoint
CREATE INDEX "ix_gesetz_project_id" ON "gesetz" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "ix_gesetz_project_id_active" ON "gesetz" USING btree ("project_id","project_version") WHERE (is_deleted IS FALSE);--> statement-breakpoint
CREATE UNIQUE INDEX "uq_gesetz_project_id_jurabk" ON "gesetz" USING btree ("project_id","project_version","jurabk") WHERE (is_deleted IS FALSE);--> statement-breakpoint
CREATE INDEX "gesetz_history_id_idx" ON "gesetz_history" USING btree ("id");--> statement-breakpoint
CREATE INDEX "gesetz_history_sys_period_idx" ON "gesetz_history" USING btree ("sys_period");--> statement-breakpoint
CREATE INDEX "ix_gs_pruefung_project_id" ON "gs_pruefung" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "ix_gs_pruefung_project_id_active" ON "gs_pruefung" USING btree ("project_id","project_version") WHERE (is_deleted IS FALSE);--> statement-breakpoint
CREATE INDEX "gs_pruefung_history_id_idx" ON "gs_pruefung_history" USING btree ("id");--> statement-breakpoint
CREATE INDEX "gs_pruefung_history_sys_period_idx" ON "gs_pruefung_history" USING btree ("sys_period");--> statement-breakpoint
CREATE INDEX "ix_impliziter_verweis_atomares_tbm_id" ON "impliziter_verweis" USING btree ("atomares_tbm_id");--> statement-breakpoint
CREATE INDEX "ix_impliziter_verweis_project_id" ON "impliziter_verweis" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "ix_impliziter_verweis_project_id_active" ON "impliziter_verweis" USING btree ("project_id","project_version") WHERE (is_deleted IS FALSE);--> statement-breakpoint
CREATE INDEX "ix_impliziter_verweis_rechtsfolge_id" ON "impliziter_verweis" USING btree ("rechtsfolge_id");--> statement-breakpoint
CREATE INDEX "impliziter_verweis_history_id_idx" ON "impliziter_verweis_history" USING btree ("id");--> statement-breakpoint
CREATE INDEX "impliziter_verweis_history_sys_period_idx" ON "impliziter_verweis_history" USING btree ("sys_period");--> statement-breakpoint
CREATE INDEX "ix_iv_pruefung_project_id" ON "iv_pruefung" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "ix_iv_pruefung_project_id_active" ON "iv_pruefung" USING btree ("project_id","project_version") WHERE (is_deleted IS FALSE);--> statement-breakpoint
CREATE INDEX "iv_pruefung_history_id_idx" ON "iv_pruefung_history" USING btree ("id");--> statement-breakpoint
CREATE INDEX "iv_pruefung_history_sys_period_idx" ON "iv_pruefung_history" USING btree ("sys_period");--> statement-breakpoint
CREATE INDEX "ix_legaldefinition_bestimmter_rechtsbegriff_id" ON "legaldefinition" USING btree ("bestimmter_rechtsbegriff_id");--> statement-breakpoint
CREATE INDEX "ix_legaldefinition_project_id" ON "legaldefinition" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "ix_legaldefinition_project_id_active" ON "legaldefinition" USING btree ("project_id","project_version") WHERE (is_deleted IS FALSE);--> statement-breakpoint
CREATE INDEX "legaldefinition_history_id_idx" ON "legaldefinition_history" USING btree ("id");--> statement-breakpoint
CREATE INDEX "legaldefinition_history_sys_period_idx" ON "legaldefinition_history" USING btree ("sys_period");--> statement-breakpoint
CREATE INDEX "ix_markdown_text_project_id" ON "markdown_text" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "ix_markdown_text_project_id_active" ON "markdown_text" USING btree ("project_id","project_version") WHERE (is_deleted IS FALSE);--> statement-breakpoint
CREATE INDEX "markdown_text_history_id_idx" ON "markdown_text_history" USING btree ("id");--> statement-breakpoint
CREATE INDEX "markdown_text_history_sys_period_idx" ON "markdown_text_history" USING btree ("sys_period");--> statement-breakpoint
CREATE INDEX "ix_norm_gesetz_id" ON "norm" USING btree ("gesetz_id");--> statement-breakpoint
CREATE INDEX "ix_norm_project_id" ON "norm" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "ix_norm_project_id_active" ON "norm" USING btree ("project_id","project_version") WHERE (is_deleted IS FALSE);--> statement-breakpoint
CREATE UNIQUE INDEX "uq_norm_project_id_gesetz_id_paragraph_nr" ON "norm" USING btree ("project_id","project_version","gesetz_id","paragraph_nr") WHERE (is_deleted IS FALSE);--> statement-breakpoint
CREATE INDEX "norm_deconstruction_history_id_idx" ON "norm_deconstruction_history" USING btree ("id");--> statement-breakpoint
CREATE INDEX "norm_deconstruction_history_sys_period_idx" ON "norm_deconstruction_history" USING btree ("sys_period");--> statement-breakpoint
CREATE INDEX "norm_history_id_idx" ON "norm_history" USING btree ("id");--> statement-breakpoint
CREATE INDEX "norm_history_sys_period_idx" ON "norm_history" USING btree ("sys_period");--> statement-breakpoint
CREATE INDEX "ix_normvorschlag_norm_id" ON "normvorschlag" USING btree ("norm_id");--> statement-breakpoint
CREATE INDEX "ix_normvorschlag_project_id" ON "normvorschlag" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "ix_normvorschlag_project_id_active" ON "normvorschlag" USING btree ("project_id","project_version") WHERE (is_deleted IS FALSE);--> statement-breakpoint
CREATE INDEX "normvorschlag_history_id_idx" ON "normvorschlag_history" USING btree ("id");--> statement-breakpoint
CREATE INDEX "normvorschlag_history_sys_period_idx" ON "normvorschlag_history" USING btree ("sys_period");--> statement-breakpoint
CREATE INDEX "ix_examination_project_project_id" ON "examination_project" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "ix_examination_project_project_id_active" ON "examination_project" USING btree ("project_id","project_version") WHERE (is_deleted IS FALSE);--> statement-breakpoint
CREATE INDEX "ix_rechtsfolge_project_id" ON "rechtsfolge" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "ix_rechtsfolge_project_id_active" ON "rechtsfolge" USING btree ("project_id","project_version") WHERE (is_deleted IS FALSE);--> statement-breakpoint
CREATE INDEX "ix_rechtsfolge_satz_id" ON "rechtsfolge" USING btree ("satz_id");--> statement-breakpoint
CREATE INDEX "rechtsfolge_history_id_idx" ON "rechtsfolge_history" USING btree ("id");--> statement-breakpoint
CREATE INDEX "rechtsfolge_history_sys_period_idx" ON "rechtsfolge_history" USING btree ("sys_period");--> statement-breakpoint
CREATE INDEX "ix_required_doc_gs_pruefung_id" ON "required_doc" USING btree ("gs_pruefung_id");--> statement-breakpoint
CREATE INDEX "ix_required_doc_project_id" ON "required_doc" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "ix_required_doc_project_id_active" ON "required_doc" USING btree ("project_id","project_version") WHERE (is_deleted IS FALSE);--> statement-breakpoint
CREATE INDEX "required_doc_history_id_idx" ON "required_doc_history" USING btree ("id");--> statement-breakpoint
CREATE INDEX "required_doc_history_sys_period_idx" ON "required_doc_history" USING btree ("sys_period");--> statement-breakpoint
CREATE INDEX "ix_satz_absatz_id" ON "satz" USING btree ("absatz_id");--> statement-breakpoint
CREATE INDEX "ix_satz_project_id" ON "satz" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "ix_satz_project_id_active" ON "satz" USING btree ("project_id","project_version") WHERE (is_deleted IS FALSE);--> statement-breakpoint
CREATE INDEX "satz_history_id_idx" ON "satz_history" USING btree ("id");--> statement-breakpoint
CREATE INDEX "satz_history_sys_period_idx" ON "satz_history" USING btree ("sys_period");--> statement-breakpoint
CREATE INDEX "ix_soll_dokument_iv_pruefung_id" ON "soll_dokument" USING btree ("iv_pruefung_id");--> statement-breakpoint
CREATE INDEX "ix_soll_dokument_project_id" ON "soll_dokument" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "ix_soll_dokument_project_id_active" ON "soll_dokument" USING btree ("project_id","project_version") WHERE (is_deleted IS FALSE);--> statement-breakpoint
CREATE INDEX "soll_dokument_history_id_idx" ON "soll_dokument_history" USING btree ("id");--> statement-breakpoint
CREATE INDEX "soll_dokument_history_sys_period_idx" ON "soll_dokument_history" USING btree ("sys_period");--> statement-breakpoint
CREATE INDEX "ix_sollensanordnungen_project_id" ON "sollensanordnungen" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "ix_sollensanordnungen_project_id_active" ON "sollensanordnungen" USING btree ("project_id","project_version") WHERE (is_deleted IS FALSE);--> statement-breakpoint
CREATE INDEX "ix_sollensanordnungen_rechtsfolge_id" ON "sollensanordnungen" USING btree ("rechtsfolge_id");--> statement-breakpoint
CREATE INDEX "sollensanordnungen_history_id_idx" ON "sollensanordnungen_history" USING btree ("id");--> statement-breakpoint
CREATE INDEX "sollensanordnungen_history_sys_period_idx" ON "sollensanordnungen_history" USING btree ("sys_period");--> statement-breakpoint
CREATE INDEX "ix_standangabe_gesetz_id" ON "standangabe" USING btree ("gesetz_id");--> statement-breakpoint
CREATE INDEX "ix_standangabe_project_id" ON "standangabe" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "ix_standangabe_project_id_active" ON "standangabe" USING btree ("project_id","project_version") WHERE (is_deleted IS FALSE);--> statement-breakpoint
CREATE INDEX "standangabe_history_id_idx" ON "standangabe_history" USING btree ("id");--> statement-breakpoint
CREATE INDEX "standangabe_history_sys_period_idx" ON "standangabe_history" USING btree ("sys_period");--> statement-breakpoint
CREATE INDEX "ix_sub_chunk_chunk_id" ON "sub_chunk" USING btree ("chunk_id");--> statement-breakpoint
CREATE INDEX "ix_sub_chunk_markdown_text_id" ON "sub_chunk" USING btree ("markdown_text_id");--> statement-breakpoint
CREATE INDEX "ix_sub_chunk_project_id" ON "sub_chunk" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "ix_sub_chunk_project_id_active" ON "sub_chunk" USING btree ("project_id","project_version") WHERE (is_deleted IS FALSE);--> statement-breakpoint
CREATE INDEX "sub_chunk_history_id_idx" ON "sub_chunk_history" USING btree ("id");--> statement-breakpoint
CREATE INDEX "sub_chunk_history_sys_period_idx" ON "sub_chunk_history" USING btree ("sys_period");--> statement-breakpoint
CREATE INDEX "ix_sub_chunk_image_project_id" ON "sub_chunk_image" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "ix_sub_chunk_image_project_id_active" ON "sub_chunk_image" USING btree ("project_id","project_version") WHERE (is_deleted IS FALSE);--> statement-breakpoint
CREATE INDEX "ix_sub_chunk_image_sub_chunk_id" ON "sub_chunk_image" USING btree ("sub_chunk_id");--> statement-breakpoint
CREATE INDEX "sub_chunk_image_history_id_idx" ON "sub_chunk_image_history" USING btree ("id");--> statement-breakpoint
CREATE INDEX "sub_chunk_image_history_sys_period_idx" ON "sub_chunk_image_history" USING btree ("sys_period");--> statement-breakpoint
CREATE INDEX "ix_sub_chunk_relation_from_sub_chunk_id" ON "sub_chunk_relation" USING btree ("from_sub_chunk_id");--> statement-breakpoint
CREATE INDEX "ix_sub_chunk_relation_project_id" ON "sub_chunk_relation" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "ix_sub_chunk_relation_project_id_active" ON "sub_chunk_relation" USING btree ("project_id","project_version") WHERE (is_deleted IS FALSE);--> statement-breakpoint
CREATE INDEX "ix_sub_chunk_relation_to_sub_chunk_id" ON "sub_chunk_relation" USING btree ("to_sub_chunk_id");--> statement-breakpoint
CREATE INDEX "sub_chunk_relation_history_id_idx" ON "sub_chunk_relation_history" USING btree ("id");--> statement-breakpoint
CREATE INDEX "sub_chunk_relation_history_sys_period_idx" ON "sub_chunk_relation_history" USING btree ("sys_period");--> statement-breakpoint
CREATE INDEX "ix_sub_chunk_table_project_id" ON "sub_chunk_table" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "ix_sub_chunk_table_project_id_active" ON "sub_chunk_table" USING btree ("project_id","project_version") WHERE (is_deleted IS FALSE);--> statement-breakpoint
CREATE INDEX "ix_sub_chunk_table_sub_chunk_id" ON "sub_chunk_table" USING btree ("sub_chunk_id");--> statement-breakpoint
CREATE INDEX "sub_chunk_table_history_id_idx" ON "sub_chunk_table_history" USING btree ("id");--> statement-breakpoint
CREATE INDEX "sub_chunk_table_history_sys_period_idx" ON "sub_chunk_table_history" USING btree ("sys_period");--> statement-breakpoint
CREATE INDEX "ix_sub_chunk_text_project_id" ON "sub_chunk_text" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "ix_sub_chunk_text_project_id_active" ON "sub_chunk_text" USING btree ("project_id","project_version") WHERE (is_deleted IS FALSE);--> statement-breakpoint
CREATE INDEX "ix_sub_chunk_text_sub_chunk_id" ON "sub_chunk_text" USING btree ("sub_chunk_id");--> statement-breakpoint
CREATE INDEX "sub_chunk_text_history_id_idx" ON "sub_chunk_text_history" USING btree ("id");--> statement-breakpoint
CREATE INDEX "sub_chunk_text_history_sys_period_idx" ON "sub_chunk_text_history" USING btree ("sys_period");--> statement-breakpoint
CREATE INDEX "ix_technische_norm_atomares_tbm_id" ON "technische_norm" USING btree ("atomares_tbm_id");--> statement-breakpoint
CREATE INDEX "ix_technische_norm_project_id" ON "technische_norm" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "ix_technische_norm_project_id_active" ON "technische_norm" USING btree ("project_id","project_version") WHERE (is_deleted IS FALSE);--> statement-breakpoint
CREATE INDEX "ix_technische_norm_entry_project_id" ON "technische_norm_entry" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "ix_technische_norm_entry_project_id_active" ON "technische_norm_entry" USING btree ("project_id","project_version") WHERE (is_deleted IS FALSE);--> statement-breakpoint
CREATE INDEX "ix_technische_norm_entry_technische_norm_id" ON "technische_norm_entry" USING btree ("technische_norm_id");--> statement-breakpoint
CREATE INDEX "technische_norm_entry_history_id_idx" ON "technische_norm_entry_history" USING btree ("id");--> statement-breakpoint
CREATE INDEX "technische_norm_entry_history_sys_period_idx" ON "technische_norm_entry_history" USING btree ("sys_period");--> statement-breakpoint
CREATE INDEX "technische_norm_history_id_idx" ON "technische_norm_history" USING btree ("id");--> statement-breakpoint
CREATE INDEX "technische_norm_history_sys_period_idx" ON "technische_norm_history" USING btree ("sys_period");--> statement-breakpoint
CREATE INDEX "ix_unbestimmter_rechtsbegriff_atomares_tbm_id" ON "unbestimmter_rechtsbegriff" USING btree ("atomares_tbm_id");--> statement-breakpoint
CREATE INDEX "ix_unbestimmter_rechtsbegriff_project_id" ON "unbestimmter_rechtsbegriff" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "ix_unbestimmter_rechtsbegriff_project_id_active" ON "unbestimmter_rechtsbegriff" USING btree ("project_id","project_version") WHERE (is_deleted IS FALSE);--> statement-breakpoint
CREATE INDEX "unbestimmter_rechtsbegriff_history_id_idx" ON "unbestimmter_rechtsbegriff_history" USING btree ("id");--> statement-breakpoint
CREATE INDEX "unbestimmter_rechtsbegriff_history_sys_period_idx" ON "unbestimmter_rechtsbegriff_history" USING btree ("sys_period");--> statement-breakpoint
CREATE INDEX "ix_verwaltungsaktentwurf_teil_bewertung_id" ON "verwaltungsaktentwurf_teil" USING btree ("bewertung_id");--> statement-breakpoint
CREATE INDEX "ix_verwaltungsaktentwurf_teil_project_id" ON "verwaltungsaktentwurf_teil" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "ix_verwaltungsaktentwurf_teil_project_id_active" ON "verwaltungsaktentwurf_teil" USING btree ("project_id","project_version") WHERE (is_deleted IS FALSE);--> statement-breakpoint
CREATE INDEX "verwaltungsaktentwurf_teil_history_id_idx" ON "verwaltungsaktentwurf_teil_history" USING btree ("id");--> statement-breakpoint
CREATE INDEX "verwaltungsaktentwurf_teil_history_sys_period_idx" ON "verwaltungsaktentwurf_teil_history" USING btree ("sys_period");--> statement-breakpoint
CREATE INDEX "ix_widerspruch_dokument_id" ON "widerspruch" USING btree ("dokument_id");--> statement-breakpoint
CREATE INDEX "ix_widerspruch_project_id" ON "widerspruch" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "ix_widerspruch_project_id_active" ON "widerspruch" USING btree ("project_id","project_version") WHERE (is_deleted IS FALSE);--> statement-breakpoint
CREATE INDEX "widerspruch_history_id_idx" ON "widerspruch_history" USING btree ("id");--> statement-breakpoint
CREATE INDEX "widerspruch_history_sys_period_idx" ON "widerspruch_history" USING btree ("sys_period");--> statement-breakpoint
CREATE INDEX "ix_zugeordnetes_dokument_dokument_id" ON "zugeordnetes_dokument" USING btree ("dokument_id");--> statement-breakpoint
CREATE INDEX "ix_zugeordnetes_dokument_project_id" ON "zugeordnetes_dokument" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "ix_zugeordnetes_dokument_project_id_active" ON "zugeordnetes_dokument" USING btree ("project_id","project_version") WHERE (is_deleted IS FALSE);--> statement-breakpoint
CREATE INDEX "ix_zugeordnetes_dokument_required_doc_id" ON "zugeordnetes_dokument" USING btree ("required_doc_id");--> statement-breakpoint
CREATE INDEX "ix_zugeordnetes_dokument_soll_dokument_id" ON "zugeordnetes_dokument" USING btree ("soll_dokument_id");--> statement-breakpoint
CREATE INDEX "zugeordnetes_dokument_history_id_idx" ON "zugeordnetes_dokument_history" USING btree ("id");--> statement-breakpoint
CREATE INDEX "zugeordnetes_dokument_history_sys_period_idx" ON "zugeordnetes_dokument_history" USING btree ("sys_period");--> statement-breakpoint
CREATE INDEX "ix_zusammenfassung_dokument_id" ON "zusammenfassung" USING btree ("dokument_id");--> statement-breakpoint
CREATE INDEX "ix_zusammenfassung_project_id" ON "zusammenfassung" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "ix_zusammenfassung_project_id_active" ON "zusammenfassung" USING btree ("project_id","project_version") WHERE (is_deleted IS FALSE);--> statement-breakpoint
CREATE INDEX "ix_zusammenfassung_required_doc_id" ON "zusammenfassung" USING btree ("required_doc_id");--> statement-breakpoint
CREATE INDEX "ix_zusammenfassung_soll_dokument_id" ON "zusammenfassung" USING btree ("soll_dokument_id");--> statement-breakpoint
CREATE INDEX "zusammenfassung_history_id_idx" ON "zusammenfassung_history" USING btree ("id");--> statement-breakpoint
CREATE INDEX "zusammenfassung_history_sys_period_idx" ON "zusammenfassung_history" USING btree ("sys_period");--> statement-breakpoint
CREATE INDEX "ix_feedback_project_id" ON "feedback" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "ix_feedback_project_id_active" ON "feedback" USING btree ("project_id","project_version") WHERE "feedback"."is_deleted" IS false;--> statement-breakpoint
CREATE INDEX "feedback_history_id_idx" ON "feedback_history" USING btree ("id");--> statement-breakpoint
CREATE INDEX "feedback_history_sys_period_idx" ON "feedback_history" USING btree ("sys_period");--> statement-breakpoint
CREATE INDEX "ix_category_project_id" ON "category" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "ix_category_project_id_active" ON "category" USING btree ("project_id","project_version") WHERE "category"."is_deleted" IS false;--> statement-breakpoint
CREATE INDEX "category_history_id_idx" ON "category_history" USING btree ("id");--> statement-breakpoint
CREATE INDEX "category_history_sys_period_idx" ON "category_history" USING btree ("sys_period");--> statement-breakpoint
CREATE INDEX "document_history_id_idx" ON "document_history" USING btree ("id");--> statement-breakpoint
CREATE INDEX "document_history_sys_period_idx" ON "document_history" USING btree ("sys_period");--> statement-breakpoint
CREATE INDEX "document_type_history_id_idx" ON "document_type_history" USING btree ("id");--> statement-breakpoint
CREATE INDEX "document_type_history_sys_period_idx" ON "document_type_history" USING btree ("sys_period");--> statement-breakpoint
CREATE INDEX "ix_document_type_category_id" ON "document_type" USING btree ("category_id");--> statement-breakpoint
CREATE INDEX "ix_document_type_project_id" ON "document_type" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "ix_document_type_project_id_active" ON "document_type" USING btree ("project_id","project_version") WHERE "document_type"."is_deleted" IS false;--> statement-breakpoint
CREATE UNIQUE INDEX "uq_document_type_project_name" ON "document_type" USING btree ("project_id","project_version","name") WHERE "document_type"."is_deleted" IS false;--> statement-breakpoint
CREATE INDEX "ix_document_ai_suggested_required_document_type_id" ON "document" USING btree ("ai_suggested_required_document_type_id");--> statement-breakpoint
CREATE INDEX "ix_document_file_id" ON "document" USING btree ("file_id");--> statement-breakpoint
CREATE INDEX "ix_document_project_id" ON "document" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "ix_document_project_id_active" ON "document" USING btree ("project_id","project_version") WHERE "document"."is_deleted" IS false;--> statement-breakpoint
CREATE UNIQUE INDEX "uq_document_project_file_id" ON "document" USING btree ("project_id","project_version","file_id") WHERE "document"."file_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "project_template_version_history_id_idx" ON "project_template_version_history" USING btree ("id");--> statement-breakpoint
CREATE INDEX "project_template_version_history_sys_period_idx" ON "project_template_version_history" USING btree ("sys_period");--> statement-breakpoint
CREATE INDEX "ix_project_template_version_project_id" ON "project_template_version" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "ix_project_template_version_project_id_active" ON "project_template_version" USING btree ("project_id","project_version") WHERE "project_template_version"."is_deleted" IS false;--> statement-breakpoint
CREATE UNIQUE INDEX "uq_project_template_version_project_id" ON "project_template_version" USING btree ("project_id","project_version") WHERE "project_template_version"."is_deleted" IS false;--> statement-breakpoint
CREATE INDEX "table_of_content_notes_history_id_idx" ON "table_of_content_notes_history" USING btree ("id");--> statement-breakpoint
CREATE INDEX "table_of_content_notes_history_sys_period_idx" ON "table_of_content_notes_history" USING btree ("sys_period");--> statement-breakpoint
CREATE INDEX "ix_table_of_content_notes_project_id" ON "table_of_content_notes" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "ix_table_of_content_notes_project_id_active" ON "table_of_content_notes" USING btree ("project_id","project_version") WHERE "table_of_content_notes"."is_deleted" IS false;--> statement-breakpoint
CREATE INDEX "toc_job_status_history_id_idx" ON "toc_job_status_history" USING btree ("id");--> statement-breakpoint
CREATE INDEX "toc_job_status_history_sys_period_idx" ON "toc_job_status_history" USING btree ("sys_period");--> statement-breakpoint
CREATE INDEX "ix_toc_job_status_project_id" ON "toc_job_status" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "ix_toc_job_status_project_id_active" ON "toc_job_status" USING btree ("project_id","project_version") WHERE "toc_job_status"."is_deleted" IS false;--> statement-breakpoint
CREATE UNIQUE INDEX "uq_toc_job_status_project_id" ON "toc_job_status" USING btree ("project_id","project_version") WHERE "toc_job_status"."is_deleted" IS false;--> statement-breakpoint
CREATE INDEX "ix_fpp_file_request_id" ON "fpp_file" USING btree ("request_id");--> statement-breakpoint
CREATE INDEX "ix_fpp_request_internal_project_id" ON "fpp_request" USING btree ("internal_project_id");--> statement-breakpoint
CREATE INDEX "argument_history_id_idx" ON "argument_history" USING btree ("id");--> statement-breakpoint
CREATE INDEX "argument_history_sys_period_idx" ON "argument_history" USING btree ("sys_period");--> statement-breakpoint
CREATE INDEX "ix_argument_beteiligungs_eingang_id" ON "argument" USING btree ("beteiligungs_eingang_id");--> statement-breakpoint
CREATE INDEX "ix_argument_project_id" ON "argument" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "ix_argument_project_id_active" ON "argument" USING btree ("project_id","project_version") WHERE "argument"."is_deleted" IS false;--> statement-breakpoint
CREATE INDEX "ix_argument_sub_topic_id" ON "argument" USING btree ("sub_topic_id");--> statement-breakpoint
CREATE INDEX "ix_argument_topic_id" ON "argument" USING btree ("topic_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_argument_project_id_argument_id" ON "argument" USING btree ("project_id","project_version","argument_id") WHERE "argument"."is_deleted" IS false;--> statement-breakpoint
CREATE INDEX "ix_beteiligungs_eingang_project_id" ON "beteiligungs_eingang" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "ix_beteiligungs_eingang_beteiligungs_eingang_markdown_id" ON "beteiligungs_eingang" USING btree ("beteiligungs_eingang_markdown_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_beteiligungs_eingang_project_file" ON "beteiligungs_eingang" USING btree ("project_id","project_version","file_id") WHERE "beteiligungs_eingang"."is_deleted" IS false;--> statement-breakpoint
CREATE INDEX "beteiligungs_eingang_history_id_idx" ON "beteiligungs_eingang_history" USING btree ("id");--> statement-breakpoint
CREATE INDEX "beteiligungs_eingang_history_sys_period_idx" ON "beteiligungs_eingang_history" USING btree ("sys_period");--> statement-breakpoint
CREATE INDEX "ix_beteiligungs_eingang_markdown_beteiligungs_eingang_id" ON "beteiligungs_eingang_markdown" USING btree ("beteiligungs_eingang_id");--> statement-breakpoint
CREATE INDEX "ix_beteiligungs_eingang_markdown_project_id" ON "beteiligungs_eingang_markdown" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "ix_beteiligungs_eingang_markdown_project_id_active" ON "beteiligungs_eingang_markdown" USING btree ("project_id","project_version") WHERE "beteiligungs_eingang_markdown"."is_deleted" IS false;--> statement-breakpoint
CREATE UNIQUE INDEX "uq_beteiligungs_eingang_markdown_parent" ON "beteiligungs_eingang_markdown" USING btree ("project_id","project_version","beteiligungs_eingang_id") WHERE "beteiligungs_eingang_markdown"."is_deleted" IS false;--> statement-breakpoint
CREATE INDEX "beteiligungs_eingang_markdown_history_id_idx" ON "beteiligungs_eingang_markdown_history" USING btree ("id");--> statement-breakpoint
CREATE INDEX "beteiligungs_eingang_markdown_history_sys_period_idx" ON "beteiligungs_eingang_markdown_history" USING btree ("sys_period");--> statement-breakpoint
CREATE INDEX "plausibility_note_history_id_idx" ON "plausibility_note_history" USING btree ("id");--> statement-breakpoint
CREATE INDEX "plausibility_note_history_sys_period_idx" ON "plausibility_note_history" USING btree ("sys_period");--> statement-breakpoint
CREATE INDEX "plausibility_note_occurrence_history_id_idx" ON "plausibility_note_occurrence_history" USING btree ("id");--> statement-breakpoint
CREATE INDEX "plausibility_note_occurrence_history_sys_period_idx" ON "plausibility_note_occurrence_history" USING btree ("sys_period");--> statement-breakpoint
CREATE INDEX "ix_plausibility_note_occurrence_plausibility_note_id" ON "plausibility_note_occurrence" USING btree ("plausibility_note_id");--> statement-breakpoint
CREATE INDEX "ix_plausibility_note_occurrence_project_id_active" ON "plausibility_note_occurrence" USING btree ("project_id","project_version") WHERE "plausibility_note_occurrence"."is_deleted" IS false;--> statement-breakpoint
CREATE INDEX "ix_plausibility_note_project_id" ON "plausibility_note" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "ix_plausibility_note_project_id_active" ON "plausibility_note" USING btree ("project_id","project_version") WHERE "plausibility_note"."is_deleted" IS false;--> statement-breakpoint
CREATE INDEX "supplementary_request_history_id_idx" ON "supplementary_request_history" USING btree ("id");--> statement-breakpoint
CREATE INDEX "supplementary_request_history_sys_period_idx" ON "supplementary_request_history" USING btree ("sys_period");--> statement-breakpoint
CREATE INDEX "ix_supplementary_request_project_id" ON "supplementary_request" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "ix_supplementary_request_topic_id" ON "supplementary_request" USING btree ("topic_id");--> statement-breakpoint
CREATE INDEX "ix_supplementary_request_document_id" ON "supplementary_request" USING btree ("document_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_project_source_binding" ON "supplementary_request" USING btree ("project_id","source_type","source_item_id") WHERE "supplementary_request"."source_item_id" is not null;--> statement-breakpoint
CREATE INDEX "ix_workflow_execution_active" ON "workflow_execution" USING btree ("status") WHERE "workflow_execution"."status" IN ('pending'::workflow_status, 'running'::workflow_status);--> statement-breakpoint
CREATE INDEX "ix_workflow_execution_project_type" ON "workflow_execution" USING btree ("project_id","workflow_type");--> statement-breakpoint
CREATE INDEX "ix_workflow_execution_end_time" ON "workflow_execution" USING btree ("end_time");--> statement-breakpoint
CREATE INDEX "ix_audit_log_project_timestamp" ON "audit_log" USING btree ("project_id","timestamp" DESC NULLS FIRST);--> statement-breakpoint
CREATE INDEX "file_history_id_idx" ON "file_history" USING btree ("id");--> statement-breakpoint
CREATE INDEX "file_history_sys_period_idx" ON "file_history" USING btree ("sys_period");--> statement-breakpoint
CREATE INDEX "file_topic_history_id_idx" ON "file_topic_history" USING btree ("id");--> statement-breakpoint
CREATE INDEX "file_topic_history_sys_period_idx" ON "file_topic_history" USING btree ("sys_period");--> statement-breakpoint
CREATE INDEX "ix_file_topic_file_id" ON "file_topic" USING btree ("file_id");--> statement-breakpoint
CREATE INDEX "ix_file_topic_project_id" ON "file_topic" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "ix_file_topic_project_id_active" ON "file_topic" USING btree ("project_id","project_version") WHERE "file_topic"."is_deleted" IS FALSE;--> statement-breakpoint
CREATE INDEX "ix_file_topic_subtopic_id" ON "file_topic" USING btree ("subtopic_id");--> statement-breakpoint
CREATE INDEX "ix_file_topic_topic_id" ON "file_topic" USING btree ("topic_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_file_subtopic" ON "file_topic" USING btree ("file_id","project_version","subtopic_id") WHERE "file_topic"."is_deleted" IS FALSE AND "file_topic"."subtopic_id" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "uq_file_topic" ON "file_topic" USING btree ("file_id","project_version","topic_id") WHERE "file_topic"."is_deleted" IS FALSE AND "file_topic"."topic_id" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "ix_file_bucket_path" ON "file" USING btree ("bucket_path","project_version");--> statement-breakpoint
CREATE INDEX "ix_file_filename" ON "file" USING btree ("filename");--> statement-breakpoint
CREATE INDEX "ix_file_project_id" ON "file" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "ix_file_project_id_active" ON "file" USING btree ("project_id","project_version") WHERE "file"."is_deleted" IS FALSE;--> statement-breakpoint
CREATE INDEX "ix_file_source_zip_file_id" ON "file" USING btree ("source_zip_file_id");--> statement-breakpoint
CREATE INDEX "ix_file_type" ON "file" USING btree ("type");--> statement-breakpoint
CREATE INDEX "ix_files_type_project" ON "file" USING btree ("type","project_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_file_zip_entry_source" ON "file" USING btree ("project_id","project_version","type","filename","source_zip_file_id") WHERE "file"."is_deleted" IS FALSE;--> statement-breakpoint
CREATE INDEX "ix_zip_file_diff_entry_file_id" ON "zip_file_diff_entry" USING btree ("file_id");--> statement-breakpoint
CREATE INDEX "ix_zip_file_diff_entry_zip_file" ON "zip_file_diff_entry" USING btree ("zip_file_id","project_version");--> statement-breakpoint
CREATE INDEX "zip_file_history_id_idx" ON "zip_file_history" USING btree ("id");--> statement-breakpoint
CREATE INDEX "zip_file_history_sys_period_idx" ON "zip_file_history" USING btree ("sys_period");--> statement-breakpoint
CREATE INDEX "ix_zip_file_approval_status" ON "zip_file" USING btree ("approval_status");--> statement-breakpoint
CREATE UNIQUE INDEX "ix_zip_file_bucket_path" ON "zip_file" USING btree ("bucket_path","project_version");--> statement-breakpoint
CREATE INDEX "ix_zip_file_filename" ON "zip_file" USING btree ("filename");--> statement-breakpoint
CREATE INDEX "ix_zip_file_project_id" ON "zip_file" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "ix_zip_file_project_id_active" ON "zip_file" USING btree ("project_id","project_version") WHERE "zip_file"."is_deleted" IS FALSE;--> statement-breakpoint
CREATE INDEX "ix_zip_file_type" ON "zip_file" USING btree ("type");--> statement-breakpoint
CREATE INDEX "ix_zip_file_workflow_status" ON "zip_file" USING btree ("workflow_status");--> statement-breakpoint
CREATE INDEX "applicant_history_id_idx" ON "applicant_history" USING btree ("id");--> statement-breakpoint
CREATE INDEX "applicant_history_sys_period_idx" ON "applicant_history" USING btree ("sys_period");--> statement-breakpoint
CREATE INDEX "ix_applicant_project_id" ON "applicant" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "ix_applicant_project_id_active" ON "applicant" USING btree ("project_id","project_version") WHERE "applicant"."is_deleted" IS FALSE;--> statement-breakpoint
CREATE INDEX "deadline_history_id_idx" ON "deadline_history" USING btree ("id");--> statement-breakpoint
CREATE INDEX "deadline_history_sys_period_idx" ON "deadline_history" USING btree ("sys_period");--> statement-breakpoint
CREATE INDEX "ix_deadline_project_id_active" ON "deadline" USING btree ("project_id","project_version") WHERE "deadline"."is_deleted" IS FALSE;--> statement-breakpoint
CREATE INDEX "process_step_history_id_idx" ON "process_step_history" USING btree ("id");--> statement-breakpoint
CREATE INDEX "process_step_history_sys_period_idx" ON "process_step_history" USING btree ("sys_period");--> statement-breakpoint
CREATE INDEX "project_history_id_idx" ON "project_history" USING btree ("id");--> statement-breakpoint
CREATE INDEX "project_history_sys_period_idx" ON "project_history" USING btree ("sys_period");--> statement-breakpoint
CREATE INDEX "project_status_history_id_idx" ON "project_status_history" USING btree ("id");--> statement-breakpoint
CREATE INDEX "project_status_history_sys_period_idx" ON "project_status_history" USING btree ("sys_period");--> statement-breakpoint
CREATE INDEX "project_type_history_id_idx" ON "project_type_history" USING btree ("id");--> statement-breakpoint
CREATE INDEX "project_type_history_sys_period_idx" ON "project_type_history" USING btree ("sys_period");--> statement-breakpoint
CREATE INDEX "ix_project_version_lock_project_id" ON "project_version_lock" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "ix_project_version_lock_zip_file_id" ON "project_version_lock" USING btree ("zip_file_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_active_project_version_lock" ON "project_version_lock" USING btree ("project_id") WHERE "project_version_lock"."status"::text = 'ACTIVE'::text;--> statement-breakpoint
CREATE UNIQUE INDEX "project_internal_project_number_key" ON "project" USING btree ("internal_project_number","project_version") WHERE "project"."is_deleted" IS FALSE;--> statement-breakpoint
CREATE INDEX "subtopic_history_id_idx" ON "subtopic_history" USING btree ("id");--> statement-breakpoint
CREATE INDEX "subtopic_history_sys_period_idx" ON "subtopic_history" USING btree ("sys_period");--> statement-breakpoint
CREATE INDEX "ix_subtopic_project_id" ON "subtopic" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "ix_subtopic_project_id_active" ON "subtopic" USING btree ("project_id","project_version") WHERE "subtopic"."is_deleted" IS FALSE;--> statement-breakpoint
CREATE INDEX "ix_subtopic_topic_id" ON "subtopic" USING btree ("topic_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_subtopic_topic_name_active" ON "subtopic" USING btree ("topic_id","project_version","name") WHERE "subtopic"."is_deleted" IS FALSE;--> statement-breakpoint
CREATE INDEX "topic_history_id_idx" ON "topic_history" USING btree ("id");--> statement-breakpoint
CREATE INDEX "topic_history_sys_period_idx" ON "topic_history" USING btree ("sys_period");--> statement-breakpoint
CREATE INDEX "topic_norm_history_id_idx" ON "topic_norm_history" USING btree ("id");--> statement-breakpoint
CREATE INDEX "topic_norm_history_sys_period_idx" ON "topic_norm_history" USING btree ("sys_period");--> statement-breakpoint
CREATE INDEX "ix_topic_norm_project_id" ON "topic_norm" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "ix_topic_norm_project_id_active" ON "topic_norm" USING btree ("project_id","project_version") WHERE "topic_norm"."is_deleted" IS FALSE;--> statement-breakpoint
CREATE INDEX "ix_topic_norm_topic_id" ON "topic_norm" USING btree ("topic_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_topic_norm" ON "topic_norm" USING btree ("topic_id","project_version","jurabk","paragraph_nr","satz","absatz","nummer") WHERE "topic_norm"."is_deleted" IS FALSE;--> statement-breakpoint
CREATE INDEX "ix_topic_parent_topic_id" ON "topic" USING btree ("parent_topic_id");--> statement-breakpoint
CREATE INDEX "ix_topic_project_id" ON "topic" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "ix_topic_project_id_active" ON "topic" USING btree ("project_id","project_version") WHERE "topic"."is_deleted" IS FALSE;--> statement-breakpoint
CREATE UNIQUE INDEX "uq_topic_project_parent_name_active" ON "topic" USING btree ("project_id","project_version","parent_topic_id","name") WHERE "topic"."is_deleted" IS FALSE;