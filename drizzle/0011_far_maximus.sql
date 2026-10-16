ALTER TABLE "contracts" ADD COLUMN "pdf_margin_top" integer DEFAULT 50 NOT NULL;--> statement-breakpoint
ALTER TABLE "contracts" ADD COLUMN "pdf_margin_bottom" integer DEFAULT 50 NOT NULL;--> statement-breakpoint
ALTER TABLE "contracts" ADD COLUMN "pdf_margin_left" integer DEFAULT 15 NOT NULL;--> statement-breakpoint
ALTER TABLE "contracts" ADD COLUMN "pdf_margin_right" integer DEFAULT 15 NOT NULL;