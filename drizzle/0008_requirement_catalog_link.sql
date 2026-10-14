ALTER TYPE "public"."catalog_purpose" ADD VALUE 'requirements';--> statement-breakpoint
ALTER TABLE "photo_requirements" ADD COLUMN "catalog_item_id" uuid;--> statement-breakpoint
ALTER TABLE "photo_requirements" ADD COLUMN "custom_name" text;--> statement-breakpoint
ALTER TABLE "photo_requirements" ADD CONSTRAINT "photo_requirements_catalog_item_id_catalog_items_id_fk" FOREIGN KEY ("catalog_item_id") REFERENCES "public"."catalog_items"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "photo_requirements_catalog_item_idx" ON "photo_requirements" USING btree ("catalog_item_id");--> statement-breakpoint
UPDATE "photo_requirements" SET "custom_name" = "name";--> statement-breakpoint
ALTER TABLE "photo_requirements" DROP COLUMN "name";--> statement-breakpoint
ALTER TABLE "photo_requirements" ADD CONSTRAINT "photo_requirements_name_source_check" CHECK (("photo_requirements"."catalog_item_id" is null) <> ("photo_requirements"."custom_name" is null));
