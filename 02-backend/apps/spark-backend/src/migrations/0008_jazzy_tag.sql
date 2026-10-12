ALTER TABLE "vae_node" DROP CONSTRAINT "vae_node_parent_vae_node_id_fkey";
--> statement-breakpoint
ALTER TABLE "vae_node" ADD CONSTRAINT "vae_node_parent_project_fkey" FOREIGN KEY ("parent_vae_node_id","project_id","project_version") REFERENCES "public"."vae_node"("id","project_id","project_version") ON DELETE no action ON UPDATE no action;