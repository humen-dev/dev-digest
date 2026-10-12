ALTER TABLE "ci_installations" ADD COLUMN "workspace_id" uuid;--> statement-breakpoint
ALTER TABLE "ci_installations" ADD COLUMN "github_repo_id" bigint;--> statement-breakpoint
ALTER TABLE "ci_installations" ADD COLUMN "manifest_slug" text;--> statement-breakpoint
ALTER TABLE "ci_installations" ADD COLUMN "triggers" jsonb;--> statement-breakpoint
ALTER TABLE "ci_installations" ADD COLUMN "post_as" text;--> statement-breakpoint
ALTER TABLE "ci_installations" ADD COLUMN "workflow_version" text;--> statement-breakpoint
ALTER TABLE "ci_installations" ADD COLUMN "generator_version" integer;--> statement-breakpoint
ALTER TABLE "ci_installations" ADD COLUMN "agent_version" integer;--> statement-breakpoint
ALTER TABLE "ci_installations" ADD COLUMN "exported_ci_fail_on" text;--> statement-breakpoint
ALTER TABLE "ci_installations" ADD COLUMN "pr_url" text;--> statement-breakpoint
ALTER TABLE "ci_installations" ADD COLUMN "state" text;--> statement-breakpoint
ALTER TABLE "ci_installations" ADD COLUMN "updated_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "ci_installations" ADD COLUMN "last_refreshed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "ci_runs" ADD COLUMN "workspace_id" uuid;--> statement-breakpoint
ALTER TABLE "ci_runs" ADD COLUMN "agent_id" uuid;--> statement-breakpoint
ALTER TABLE "ci_runs" ADD COLUMN "repo" text;--> statement-breakpoint
ALTER TABLE "ci_runs" ADD COLUMN "provider_run_id" text;--> statement-breakpoint
ALTER TABLE "ci_runs" ADD COLUMN "pr_title" text;--> statement-breakpoint
ALTER TABLE "ci_runs" ADD COLUMN "pr_url" text;--> statement-breakpoint
ALTER TABLE "ci_runs" ADD COLUMN "commit_sha" text;--> statement-breakpoint
ALTER TABLE "ci_runs" ADD COLUMN "agent_name" text;--> statement-breakpoint
ALTER TABLE "ci_runs" ADD COLUMN "critical" integer;--> statement-breakpoint
ALTER TABLE "ci_runs" ADD COLUMN "warning" integer;--> statement-breakpoint
ALTER TABLE "ci_runs" ADD COLUMN "suggestion" integer;--> statement-breakpoint
ALTER TABLE "ci_runs" ADD COLUMN "verdict" text;--> statement-breakpoint
ALTER TABLE "ci_runs" ADD COLUMN "blockers" integer;--> statement-breakpoint
ALTER TABLE "ci_runs" ADD COLUMN "duration_ms" integer;--> statement-breakpoint
ALTER TABLE "ci_runs" ADD COLUMN "failure_reason" text;--> statement-breakpoint
ALTER TABLE "ci_runs" ADD COLUMN "agent_run_id" uuid;--> statement-breakpoint
ALTER TABLE "ci_runs" ADD COLUMN "ingested_at" timestamp with time zone;--> statement-breakpoint
-- SPEC-07: backfill workspace_id from the owning agent before enforcing NOT NULL.
UPDATE "ci_installations" SET "workspace_id" = "agents"."workspace_id" FROM "agents" WHERE "agents"."id" = "ci_installations"."agent_id" AND "ci_installations"."workspace_id" IS NULL;--> statement-breakpoint
ALTER TABLE "ci_installations" ALTER COLUMN "workspace_id" SET NOT NULL;--> statement-breakpoint
UPDATE "ci_runs" SET "workspace_id" = "ci_installations"."workspace_id", "agent_id" = "ci_installations"."agent_id", "repo" = "ci_installations"."repo" FROM "ci_installations" WHERE "ci_installations"."id" = "ci_runs"."ci_installation_id" AND "ci_runs"."workspace_id" IS NULL;--> statement-breakpoint
ALTER TABLE "ci_installations" ADD CONSTRAINT "ci_installations_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ci_runs" ADD CONSTRAINT "ci_runs_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ci_runs" ADD CONSTRAINT "ci_runs_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ci_runs" ADD CONSTRAINT "ci_runs_agent_run_id_agent_runs_id_fk" FOREIGN KEY ("agent_run_id") REFERENCES "public"."agent_runs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "ci_installations_repo_uq" ON "ci_installations" USING btree ("workspace_id","repo");--> statement-breakpoint
CREATE INDEX "ci_installations_ws_agent_idx" ON "ci_installations" USING btree ("workspace_id","agent_id");--> statement-breakpoint
CREATE UNIQUE INDEX "ci_runs_provider_run_uq" ON "ci_runs" USING btree ("workspace_id","provider_run_id");--> statement-breakpoint
CREATE INDEX "ci_runs_list_idx" ON "ci_runs" USING btree ("workspace_id","ran_at" desc);--> statement-breakpoint
CREATE INDEX "ci_runs_agent_idx" ON "ci_runs" USING btree ("agent_id");