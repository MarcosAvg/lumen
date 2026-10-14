CREATE TYPE "public"."review_decision" AS ENUM('approved', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."submission_group_kind" AS ENUM('requirement', 'additional');--> statement-breakpoint
CREATE TABLE "evidence_submissions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"target_id" uuid NOT NULL,
	"sequence_no" integer NOT NULL,
	"submitted_by" uuid,
	"submitted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"evidence_version" integer NOT NULL,
	"target_name_snapshot" text,
	"work_name_snapshot" text,
	"service_name_snapshot" text
);
--> statement-breakpoint
CREATE TABLE "reviews" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"submission_id" uuid NOT NULL,
	"reviewer_id" uuid,
	"decision" "review_decision" NOT NULL,
	"reason" text,
	"reviewed_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "reviews_reason_check" CHECK ("reviews"."decision" <> 'rejected' or ("reviews"."reason" is not null and length(trim("reviews"."reason")) > 0))
);
--> statement-breakpoint
CREATE TABLE "submission_photos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"submission_id" uuid NOT NULL,
	"photo_id" uuid NOT NULL,
	"group_kind" "submission_group_kind" NOT NULL,
	"requirement_name_snapshot" text,
	"group_sort_order" integer NOT NULL,
	"photo_sort_order" integer NOT NULL,
	"photo_uploaded_by_snapshot" uuid,
	"photo_uploaded_at_snapshot" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "evidence_submissions" ADD CONSTRAINT "evidence_submissions_target_id_evidence_targets_id_fk" FOREIGN KEY ("target_id") REFERENCES "public"."evidence_targets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evidence_submissions" ADD CONSTRAINT "evidence_submissions_submitted_by_users_id_fk" FOREIGN KEY ("submitted_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_submission_id_evidence_submissions_id_fk" FOREIGN KEY ("submission_id") REFERENCES "public"."evidence_submissions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_reviewer_id_users_id_fk" FOREIGN KEY ("reviewer_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "submission_photos" ADD CONSTRAINT "submission_photos_submission_id_evidence_submissions_id_fk" FOREIGN KEY ("submission_id") REFERENCES "public"."evidence_submissions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "submission_photos" ADD CONSTRAINT "submission_photos_photo_id_photos_id_fk" FOREIGN KEY ("photo_id") REFERENCES "public"."photos"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "submission_photos" ADD CONSTRAINT "submission_photos_photo_uploaded_by_snapshot_users_id_fk" FOREIGN KEY ("photo_uploaded_by_snapshot") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "evidence_submissions_target_sequence_unique" ON "evidence_submissions" USING btree ("target_id","sequence_no");--> statement-breakpoint
CREATE UNIQUE INDEX "reviews_submission_unique" ON "reviews" USING btree ("submission_id");--> statement-breakpoint
CREATE UNIQUE INDEX "submission_photos_submission_photo_unique" ON "submission_photos" USING btree ("submission_id","photo_id");--> statement-breakpoint
CREATE INDEX "submission_photos_order_idx" ON "submission_photos" USING btree ("submission_id","group_sort_order","photo_sort_order");--> statement-breakpoint
ALTER TABLE "evidence_targets" ADD CONSTRAINT "evidence_targets_latest_submission_id_evidence_submissions_id_fk" FOREIGN KEY ("latest_submission_id") REFERENCES "public"."evidence_submissions"("id") ON DELETE set null ON UPDATE no action;