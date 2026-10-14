CREATE TYPE "public"."photo_processing_status" AS ENUM('processing', 'ready', 'failed');--> statement-breakpoint
CREATE TABLE "photo_requirements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"target_id" uuid NOT NULL,
	"name" text NOT NULL,
	"is_required" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "photos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"target_id" uuid NOT NULL,
	"requirement_id" uuid,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"storage_path" text NOT NULL,
	"thumbnail_path" text NOT NULL,
	"mime_type" text NOT NULL,
	"size_bytes" integer NOT NULL,
	"width" integer,
	"height" integer,
	"checksum" text,
	"processing_status" "photo_processing_status" DEFAULT 'processing' NOT NULL,
	"uploaded_by" uuid,
	"uploaded_at" timestamp with time zone DEFAULT now() NOT NULL,
	"removed_by" uuid,
	"removed_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "photo_requirements" ADD CONSTRAINT "photo_requirements_target_id_evidence_targets_id_fk" FOREIGN KEY ("target_id") REFERENCES "public"."evidence_targets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "photos" ADD CONSTRAINT "photos_target_id_evidence_targets_id_fk" FOREIGN KEY ("target_id") REFERENCES "public"."evidence_targets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "photos" ADD CONSTRAINT "photos_requirement_id_photo_requirements_id_fk" FOREIGN KEY ("requirement_id") REFERENCES "public"."photo_requirements"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "photos" ADD CONSTRAINT "photos_uploaded_by_users_id_fk" FOREIGN KEY ("uploaded_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "photos" ADD CONSTRAINT "photos_removed_by_users_id_fk" FOREIGN KEY ("removed_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "photo_requirements_target_sort_idx" ON "photo_requirements" USING btree ("target_id","sort_order");--> statement-breakpoint
CREATE INDEX "photos_target_group_sort_idx" ON "photos" USING btree ("target_id","removed_at","requirement_id","sort_order");