CREATE TYPE "public"."catalog_purpose" AS ENUM('general', 'buildings');--> statement-breakpoint
CREATE TYPE "public"."target_status" AS ENUM('pending', 'in_progress', 'in_review', 'rejected', 'approved');--> statement-breakpoint
CREATE TYPE "public"."work_mode" AS ENUM('direct', 'divided');--> statement-breakpoint
CREATE TABLE "catalog_item_relations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"from_item_id" uuid NOT NULL,
	"to_item_id" uuid NOT NULL,
	"relation_type" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "catalog_item_relations_not_self" CHECK ("catalog_item_relations"."from_item_id" <> "catalog_item_relations"."to_item_id")
);
--> statement-breakpoint
CREATE TABLE "catalog_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"catalog_id" uuid NOT NULL,
	"name" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "catalogs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"purpose" "catalog_purpose",
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "elements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"work_id" uuid NOT NULL,
	"catalog_item_id" uuid,
	"custom_name" text,
	"description" text,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "elements_name_source_check" CHECK (("elements"."catalog_item_id" is null) <> ("elements"."custom_name" is null))
);
--> statement-breakpoint
CREATE TABLE "evidence_targets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"work_id" uuid,
	"element_id" uuid,
	"current_status" "target_status" DEFAULT 'pending' NOT NULL,
	"version" integer DEFAULT 0 NOT NULL,
	"latest_submission_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "evidence_targets_scope_check" CHECK (("evidence_targets"."work_id" is null) <> ("evidence_targets"."element_id" is null))
);
--> statement-breakpoint
CREATE TABLE "works" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"service_id" uuid NOT NULL,
	"mode" "work_mode" NOT NULL,
	"catalog_item_id" uuid,
	"custom_name" text,
	"description" text,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "works_name_source_check" CHECK (("works"."catalog_item_id" is null) <> ("works"."custom_name" is null))
);
--> statement-breakpoint
ALTER TABLE "services" ADD COLUMN "building_catalog_item_id" uuid;--> statement-breakpoint
ALTER TABLE "services" ADD COLUMN "building_name_snapshot" text;--> statement-breakpoint
ALTER TABLE "catalog_item_relations" ADD CONSTRAINT "catalog_item_relations_from_item_id_catalog_items_id_fk" FOREIGN KEY ("from_item_id") REFERENCES "public"."catalog_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "catalog_item_relations" ADD CONSTRAINT "catalog_item_relations_to_item_id_catalog_items_id_fk" FOREIGN KEY ("to_item_id") REFERENCES "public"."catalog_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "catalog_items" ADD CONSTRAINT "catalog_items_catalog_id_catalogs_id_fk" FOREIGN KEY ("catalog_id") REFERENCES "public"."catalogs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "elements" ADD CONSTRAINT "elements_work_id_works_id_fk" FOREIGN KEY ("work_id") REFERENCES "public"."works"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "elements" ADD CONSTRAINT "elements_catalog_item_id_catalog_items_id_fk" FOREIGN KEY ("catalog_item_id") REFERENCES "public"."catalog_items"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evidence_targets" ADD CONSTRAINT "evidence_targets_work_id_works_id_fk" FOREIGN KEY ("work_id") REFERENCES "public"."works"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evidence_targets" ADD CONSTRAINT "evidence_targets_element_id_elements_id_fk" FOREIGN KEY ("element_id") REFERENCES "public"."elements"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "works" ADD CONSTRAINT "works_service_id_services_id_fk" FOREIGN KEY ("service_id") REFERENCES "public"."services"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "works" ADD CONSTRAINT "works_catalog_item_id_catalog_items_id_fk" FOREIGN KEY ("catalog_item_id") REFERENCES "public"."catalog_items"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "catalog_item_relations_unique" ON "catalog_item_relations" USING btree ("from_item_id","to_item_id","relation_type");--> statement-breakpoint
CREATE UNIQUE INDEX "catalog_items_catalog_name_lower_idx" ON "catalog_items" USING btree ("catalog_id",lower("name"));--> statement-breakpoint
CREATE INDEX "elements_work_sort_idx" ON "elements" USING btree ("work_id","sort_order");--> statement-breakpoint
CREATE INDEX "elements_catalog_item_idx" ON "elements" USING btree ("catalog_item_id");--> statement-breakpoint
CREATE UNIQUE INDEX "evidence_targets_work_unique" ON "evidence_targets" USING btree ("work_id");--> statement-breakpoint
CREATE UNIQUE INDEX "evidence_targets_element_unique" ON "evidence_targets" USING btree ("element_id");--> statement-breakpoint
CREATE INDEX "works_service_sort_idx" ON "works" USING btree ("service_id","sort_order");--> statement-breakpoint
CREATE INDEX "works_catalog_item_idx" ON "works" USING btree ("catalog_item_id");--> statement-breakpoint
ALTER TABLE "services" ADD CONSTRAINT "services_building_catalog_item_id_catalog_items_id_fk" FOREIGN KEY ("building_catalog_item_id") REFERENCES "public"."catalog_items"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "services_building_item_idx" ON "services" USING btree ("building_catalog_item_id");