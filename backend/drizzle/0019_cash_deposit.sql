ALTER TYPE "public"."booking_payment_status" ADD VALUE 'deposit_paid' BEFORE 'paid';--> statement-breakpoint
ALTER TYPE "public"."payment_provider" ADD VALUE 'cash';--> statement-breakpoint
ALTER TABLE "bookings" ADD COLUMN "cash_due_minor" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "kind" text DEFAULT 'full' NOT NULL;--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "balance_minor" integer DEFAULT 0 NOT NULL;