CREATE TYPE "public"."catalog_system_role" AS ENUM('building');--> statement-breakpoint
CREATE TABLE "catalog_buildings" (
	"catalog_id" uuid NOT NULL,
	"building_catalog_item_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "catalog_buildings_catalog_id_building_catalog_item_id_pk" PRIMARY KEY("catalog_id","building_catalog_item_id")
);
--> statement-breakpoint
CREATE TABLE "catalog_types" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"system_role" "catalog_system_role",
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
INSERT INTO "catalog_types" ("name", "system_role", "sort_order") VALUES
	('Edificios', 'building', 0),
	('Áreas', NULL, 10),
	('Equipos', NULL, 20),
	('Tipos de trabajo', NULL, 30),
	('Periodos', NULL, 40),
	('Requisitos', NULL, 50),
	('Otros', NULL, 90);
--> statement-breakpoint
ALTER TABLE "catalog_item_relations" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP TABLE "catalog_item_relations" CASCADE;--> statement-breakpoint
ALTER TABLE "catalogs" ADD COLUMN "type_id" uuid;--> statement-breakpoint
ALTER TABLE "catalogs" ADD COLUMN "all_buildings" boolean DEFAULT true NOT NULL;--> statement-breakpoint
UPDATE "catalogs" SET "type_id" = (SELECT "id" FROM "catalog_types" WHERE "name" = 'Edificios') WHERE "purpose" = 'buildings';--> statement-breakpoint
UPDATE "catalogs" SET "type_id" = (SELECT "id" FROM "catalog_types" WHERE "name" = 'Requisitos') WHERE "purpose" = 'requirements';--> statement-breakpoint
UPDATE "catalogs" SET "type_id" = (SELECT "id" FROM "catalog_types" WHERE "name" = 'Otros') WHERE "type_id" IS NULL;--> statement-breakpoint
ALTER TABLE "catalogs" ALTER COLUMN "type_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "catalog_buildings" ADD CONSTRAINT "catalog_buildings_catalog_id_catalogs_id_fk" FOREIGN KEY ("catalog_id") REFERENCES "public"."catalogs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "catalog_buildings" ADD CONSTRAINT "catalog_buildings_building_catalog_item_id_catalog_items_id_fk" FOREIGN KEY ("building_catalog_item_id") REFERENCES "public"."catalog_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "catalog_buildings_building_idx" ON "catalog_buildings" USING btree ("building_catalog_item_id");--> statement-breakpoint
CREATE UNIQUE INDEX "catalog_types_name_lower_idx" ON "catalog_types" USING btree (lower("name"));--> statement-breakpoint
CREATE INDEX "catalog_types_sort_idx" ON "catalog_types" USING btree ("sort_order");--> statement-breakpoint
ALTER TABLE "catalogs" ADD CONSTRAINT "catalogs_type_id_catalog_types_id_fk" FOREIGN KEY ("type_id") REFERENCES "public"."catalog_types"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "catalogs_type_idx" ON "catalogs" USING btree ("type_id");--> statement-breakpoint
ALTER TABLE "catalogs" DROP COLUMN "purpose";--> statement-breakpoint
DROP TYPE "public"."catalog_purpose";
