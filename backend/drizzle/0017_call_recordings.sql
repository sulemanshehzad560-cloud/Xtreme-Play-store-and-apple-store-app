ALTER TABLE "booking_calls" ADD COLUMN "room" text;--> statement-breakpoint
ALTER TABLE "booking_calls" ADD COLUMN "egress_id" text;--> statement-breakpoint
ALTER TABLE "booking_calls" ADD COLUMN "recording_key" text;--> statement-breakpoint
ALTER TABLE "booking_calls" ADD COLUMN "recording_status" text;--> statement-breakpoint
ALTER TABLE "booking_calls" ADD COLUMN "recording_bytes" integer;