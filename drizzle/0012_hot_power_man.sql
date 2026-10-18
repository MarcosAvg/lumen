CREATE TYPE "public"."contract_lifecycle" AS ENUM('active', 'inactive', 'archived');--> statement-breakpoint
CREATE TYPE "public"."service_lifecycle" AS ENUM('planned', 'active', 'inactive', 'archived');--> statement-breakpoint
ALTER TABLE "contracts" ADD COLUMN "lifecycle" "contract_lifecycle" DEFAULT 'active' NOT NULL;--> statement-breakpoint
ALTER TABLE "services" ADD COLUMN "lifecycle" "service_lifecycle" DEFAULT 'active' NOT NULL;--> statement-breakpoint
CREATE INDEX "contracts_lifecycle_idx" ON "contracts" USING btree ("lifecycle");--> statement-breakpoint
CREATE INDEX "services_lifecycle_idx" ON "services" USING btree ("lifecycle");