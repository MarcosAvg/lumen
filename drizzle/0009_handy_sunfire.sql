CREATE TABLE "contracts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "contracts_name_unique" ON "contracts" USING btree ("name");
--> statement-breakpoint
ALTER TABLE "contracts" ADD CONSTRAINT "contracts_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
-- Contrato por defecto para los servicios existentes (nivel nuevo, obligatorio).
INSERT INTO "contracts" ("name", "description")
VALUES ('General', 'Contrato creado al introducir el nivel de contrato; agrupa los servicios anteriores.');
--> statement-breakpoint
CREATE TABLE "contract_assignments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"contract_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"assignment_role" "assignment_role" NOT NULL,
	"assigned_by" uuid,
	"assigned_at" timestamp with time zone DEFAULT now() NOT NULL,
	"revoked_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "contract_assignments" ADD CONSTRAINT "contract_assignments_contract_id_contracts_id_fk" FOREIGN KEY ("contract_id") REFERENCES "public"."contracts"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "contract_assignments" ADD CONSTRAINT "contract_assignments_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "contract_assignments" ADD CONSTRAINT "contract_assignments_assigned_by_users_id_fk" FOREIGN KEY ("assigned_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
CREATE UNIQUE INDEX "contract_assignments_active_unique" ON "contract_assignments" USING btree ("contract_id","user_id","assignment_role") WHERE "contract_assignments"."revoked_at" is null;
--> statement-breakpoint
CREATE INDEX "contract_assignments_user_revoked_idx" ON "contract_assignments" USING btree ("user_id","revoked_at");
--> statement-breakpoint
ALTER TABLE "services" ADD COLUMN "contract_id" uuid;
--> statement-breakpoint
UPDATE "services" SET "contract_id" = (SELECT "id" FROM "contracts" WHERE "name" = 'General');
--> statement-breakpoint
ALTER TABLE "services" ALTER COLUMN "contract_id" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "services" ADD CONSTRAINT "services_contract_id_contracts_id_fk" FOREIGN KEY ("contract_id") REFERENCES "public"."contracts"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "services_contract_idx" ON "services" USING btree ("contract_id");
--> statement-breakpoint
-- Los participantes existentes de cada servicio pasan a ser participantes del contrato.
INSERT INTO "contract_assignments" ("contract_id", "user_id", "assignment_role", "assigned_by", "assigned_at")
SELECT DISTINCT ON (s."contract_id", sa."user_id", sa."assignment_role")
	s."contract_id",
	sa."user_id",
	sa."assignment_role",
	sa."assigned_by",
	sa."assigned_at"
FROM "service_assignments" sa
INNER JOIN "services" s ON s."id" = sa."service_id"
WHERE sa."revoked_at" IS NULL
ORDER BY s."contract_id", sa."user_id", sa."assignment_role", sa."assigned_at";
