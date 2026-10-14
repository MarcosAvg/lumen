-- Deduplica relaciones sin tipo: el índice único (par + tipo) no evita repetir un
-- par cuando `relation_type` es NULL, porque en Postgres los NULL son distintos.
DELETE FROM "catalog_item_relations"
WHERE "id" IN (
	SELECT "id" FROM (
		SELECT
			"id",
			row_number() OVER (
				PARTITION BY "from_item_id", "to_item_id"
				ORDER BY "created_at", "id"
			) AS "rn"
		FROM "catalog_item_relations"
		WHERE "relation_type" IS NULL
	) "ranked"
	WHERE "ranked"."rn" > 1
);--> statement-breakpoint
CREATE UNIQUE INDEX "catalog_item_relations_unique_null_type" ON "catalog_item_relations" USING btree ("from_item_id","to_item_id") WHERE "catalog_item_relations"."relation_type" is null;
