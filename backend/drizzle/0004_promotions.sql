CREATE TYPE "public"."promotion_kind" AS ENUM('percent', 'fixed');--> statement-breakpoint
CREATE TABLE "promotions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"code" text,
	"kind" "promotion_kind" NOT NULL,
	"value" integer NOT NULL,
	"auto_apply" boolean DEFAULT false NOT NULL,
	"first_booking_only" boolean DEFAULT false NOT NULL,
	"min_order_aed" integer,
	"max_discount_aed" integer,
	"service_keys" text[],
	"starts_at" timestamp with time zone,
	"ends_at" timestamp with time zone,
	"usage_limit" integer,
	"used_count" integer DEFAULT 0 NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "bookings" ADD COLUMN "discount_aed" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "bookings" ADD COLUMN "promotion_id" uuid;--> statement-breakpoint
ALTER TABLE "bookings" ADD COLUMN "promo_code" text;--> statement-breakpoint
CREATE UNIQUE INDEX "promotions_code_unique" ON "promotions" USING btree ("code") WHERE "promotions"."code" is not null;--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_promotion_id_promotions_id_fk" FOREIGN KEY ("promotion_id") REFERENCES "public"."promotions"("id") ON DELETE set null ON UPDATE no action;