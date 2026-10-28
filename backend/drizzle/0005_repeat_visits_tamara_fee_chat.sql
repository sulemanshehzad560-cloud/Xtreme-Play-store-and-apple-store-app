CREATE TYPE "public"."booking_frequency" AS ENUM('one_time', 'weekly', 'biweekly');--> statement-breakpoint
CREATE TYPE "public"."support_sender" AS ENUM('customer', 'bot', 'staff');--> statement-breakpoint
ALTER TYPE "public"."property_type" ADD VALUE 'restaurant';--> statement-breakpoint
CREATE TABLE "support_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"customer_id" uuid NOT NULL,
	"sender" "support_sender" NOT NULL,
	"author_id" uuid,
	"body" text NOT NULL,
	"read_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "bookings" ADD COLUMN "frequency" "booking_frequency" DEFAULT 'one_time' NOT NULL;--> statement-breakpoint
ALTER TABLE "bookings" ADD COLUMN "repeat_of_id" uuid;--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "fee_minor" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "support_messages" ADD CONSTRAINT "support_messages_customer_id_users_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "support_messages" ADD CONSTRAINT "support_messages_author_id_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "support_messages_customer_created_idx" ON "support_messages" USING btree ("customer_id","created_at");