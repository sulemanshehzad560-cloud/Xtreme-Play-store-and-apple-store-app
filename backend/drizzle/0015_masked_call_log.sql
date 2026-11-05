CREATE TYPE "public"."call_kind" AS ENUM('app', 'callback');--> statement-breakpoint
CREATE TABLE "booking_calls" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"booking_id" uuid,
	"caller_id" uuid,
	"caller_role" text NOT NULL,
	"kind" "call_kind" NOT NULL,
	"to_office" boolean DEFAULT false NOT NULL,
	"twilio_sid" text,
	"duration_seconds" integer,
	"ended_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "booking_calls" ADD CONSTRAINT "booking_calls_booking_id_bookings_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "booking_calls" ADD CONSTRAINT "booking_calls_caller_id_users_id_fk" FOREIGN KEY ("caller_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "booking_calls_created_idx" ON "booking_calls" USING btree ("created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "booking_calls_sid_unique" ON "booking_calls" USING btree ("twilio_sid");