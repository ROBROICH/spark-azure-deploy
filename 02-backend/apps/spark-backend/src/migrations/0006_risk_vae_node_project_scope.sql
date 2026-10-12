ALTER TABLE "risks" DROP CONSTRAINT "risks_vae_node_id_fkey";
--> statement-breakpoint
ALTER TABLE "risks" ADD CONSTRAINT "risks_vae_node_project_fkey" FOREIGN KEY ("vae_node_id","project_id","project_version") REFERENCES "public"."vae_node"("id","project_id","project_version") ON DELETE no action ON UPDATE no action;