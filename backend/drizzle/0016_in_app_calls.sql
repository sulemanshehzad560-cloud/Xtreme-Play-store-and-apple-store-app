ALTER TYPE "public"."call_kind" ADD VALUE 'voip';--> statement-breakpoint
ALTER TABLE "booking_calls" ADD COLUMN "callee_id" uuid;--> statement-breakpoint
ALTER TABLE "booking_calls" ADD COLUMN "status" text;--> statement-breakpoint
ALTER TABLE "booking_calls" ADD COLUMN "answered_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "booking_calls" ADD CONSTRAINT "booking_calls_callee_id_users_id_fk" FOREIGN KEY ("callee_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;