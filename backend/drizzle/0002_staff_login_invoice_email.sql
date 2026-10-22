ALTER TABLE "bookings" ADD COLUMN "invoice_sent_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "bookings" ADD COLUMN "invoice_sent_to" text;--> statement-breakpoint
ALTER TABLE "staff_profiles" ADD COLUMN "password_hash" text;--> statement-breakpoint
ALTER TABLE "staff_profiles" ADD COLUMN "password_set_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "staff_profiles" ADD COLUMN "failed_logins" smallint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "staff_profiles" ADD COLUMN "locked_until" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "staff_profiles" ADD COLUMN "notify_new_orders" boolean DEFAULT true NOT NULL;