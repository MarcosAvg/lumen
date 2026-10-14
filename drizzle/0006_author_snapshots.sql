ALTER TABLE "audit_events" ADD COLUMN "actor_name" text;--> statement-breakpoint
ALTER TABLE "evidence_submissions" ADD COLUMN "submitted_by_name" text;--> statement-breakpoint
ALTER TABLE "photos" ADD COLUMN "uploaded_by_name" text;--> statement-breakpoint
ALTER TABLE "photos" ADD COLUMN "removed_by_name" text;--> statement-breakpoint
ALTER TABLE "reviews" ADD COLUMN "reviewer_name" text;--> statement-breakpoint
ALTER TABLE "submission_photos" ADD COLUMN "photo_uploaded_by_name" text;--> statement-breakpoint
-- Rellena la firma histórica desde el nombre actual del usuario.
UPDATE "evidence_submissions" es SET "submitted_by_name" = u."display_name"
	FROM "users" u WHERE es."submitted_by" = u."id" AND es."submitted_by_name" IS NULL;--> statement-breakpoint
UPDATE "reviews" r SET "reviewer_name" = u."display_name"
	FROM "users" u WHERE r."reviewer_id" = u."id" AND r."reviewer_name" IS NULL;--> statement-breakpoint
UPDATE "submission_photos" sp SET "photo_uploaded_by_name" = u."display_name"
	FROM "users" u WHERE sp."photo_uploaded_by_snapshot" = u."id" AND sp."photo_uploaded_by_name" IS NULL;--> statement-breakpoint
UPDATE "photos" p SET "uploaded_by_name" = u."display_name"
	FROM "users" u WHERE p."uploaded_by" = u."id" AND p."uploaded_by_name" IS NULL;--> statement-breakpoint
UPDATE "photos" p SET "removed_by_name" = u."display_name"
	FROM "users" u WHERE p."removed_by" = u."id" AND p."removed_by_name" IS NULL;--> statement-breakpoint
UPDATE "audit_events" a SET "actor_name" = u."display_name"
	FROM "users" u WHERE a."actor_user_id" = u."id" AND a."actor_name" IS NULL;