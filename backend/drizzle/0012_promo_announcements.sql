ALTER TABLE "promotions" ADD COLUMN "notify_customers" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "promotions" ADD COLUMN "message" text;--> statement-breakpoint
ALTER TABLE "promotions" ADD COLUMN "message_ar" text;--> statement-breakpoint
ALTER TABLE "promotions" ADD COLUMN "announced_at" timestamp with time zone;--> statement-breakpoint
-- Offers that were already running when this shipped count as announced, so nobody is messaged about old promotions.
UPDATE "promotions" SET "announced_at" = now();
