ALTER TABLE "eval_cases" ALTER COLUMN "input_diff" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "eval_cases" ALTER COLUMN "input_files" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "eval_cases" ALTER COLUMN "input_meta" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "eval_cases" ALTER COLUMN "expected_output" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "eval_runs" ALTER COLUMN "case_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "eval_cases" ADD COLUMN "source_finding_id" uuid;--> statement-breakpoint
ALTER TABLE "eval_cases" ADD COLUMN "severity" text;--> statement-breakpoint
ALTER TABLE "eval_cases" ADD COLUMN "category" text;--> statement-breakpoint
ALTER TABLE "eval_cases" ADD COLUMN "created_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "eval_cases" ADD COLUMN "updated_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "eval_runs" ADD COLUMN "workspace_id" uuid NOT NULL;--> statement-breakpoint
ALTER TABLE "eval_runs" ADD COLUMN "owner_kind" text NOT NULL;--> statement-breakpoint
ALTER TABLE "eval_runs" ADD COLUMN "owner_id" uuid NOT NULL;--> statement-breakpoint
ALTER TABLE "eval_runs" ADD COLUMN "status" text DEFAULT 'running' NOT NULL;--> statement-breakpoint
ALTER TABLE "eval_runs" ADD COLUMN "error_reason" text;--> statement-breakpoint
ALTER TABLE "eval_runs" ADD COLUMN "agent_version" integer NOT NULL;--> statement-breakpoint
ALTER TABLE "eval_runs" ADD COLUMN "skills_fingerprint" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "eval_runs" ADD COLUMN "case_ids" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "eval_runs" ADD COLUMN "cases_passed" integer;--> statement-breakpoint
ALTER TABLE "eval_runs" ADD COLUMN "cases_total" integer;--> statement-breakpoint
ALTER TABLE "eval_runs" ADD COLUMN "cases_errored" integer;--> statement-breakpoint
ALTER TABLE "eval_runs" ADD COLUMN "uncovered_findings" integer;--> statement-breakpoint
ALTER TABLE "eval_runs" ADD COLUMN "per_case" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "eval_runs" ADD COLUMN "finished_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "eval_runs" ADD COLUMN "heartbeat_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "eval_cases" ADD CONSTRAINT "eval_cases_owner_id_agents_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."agents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "eval_runs" ADD CONSTRAINT "eval_runs_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "eval_runs" ADD CONSTRAINT "eval_runs_owner_id_agents_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."agents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "eval_cases_ws_owner_idx" ON "eval_cases" USING btree ("workspace_id","owner_id");--> statement-breakpoint
CREATE INDEX "eval_runs_ws_owner_ran_idx" ON "eval_runs" USING btree ("workspace_id","owner_id","ran_at" DESC NULLS LAST);--> statement-breakpoint
CREATE UNIQUE INDEX "eval_runs_one_running_uq" ON "eval_runs" USING btree ("owner_id") WHERE "eval_runs"."status" = 'running';--> statement-breakpoint
ALTER TABLE "eval_cases" ADD CONSTRAINT "eval_cases_ws_source_finding_uq" UNIQUE("workspace_id","source_finding_id");--> statement-breakpoint
ALTER TABLE "eval_runs" ADD CONSTRAINT "eval_runs_status_ck" CHECK ("eval_runs"."status" IN ('running','completed','errored'));