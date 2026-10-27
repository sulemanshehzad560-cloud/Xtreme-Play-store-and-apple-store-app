CREATE TYPE "public"."subscription_interval" AS ENUM('monthly', 'yearly');--> statement-breakpoint
CREATE TYPE "public"."subscription_status" AS ENUM('pending_payment', 'active', 'expired', 'cancelled');--> statement-breakpoint
ALTER TYPE "public"."booking_payment_status" ADD VALUE 'included';--> statement-breakpoint
CREATE TABLE "subscription_plans" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"service_key" text NOT NULL,
	"visits_per_month" smallint NOT NULL,
	"price_monthly_aed" integer,
	"price_yearly_aed" integer,
	"active" boolean DEFAULT true NOT NULL,
	"sort_order" smallint DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "subscriptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"reference" text NOT NULL,
	"customer_id" uuid NOT NULL,
	"plan_id" uuid NOT NULL,
	"plan_name" text NOT NULL,
	"service_key" text NOT NULL,
	"interval" "subscription_interval" NOT NULL,
	"price_aed" integer NOT NULL,
	"visits_per_month" smallint NOT NULL,
	"property_type" "property_type" NOT NULL,
	"property_size" text NOT NULL,
	"status" "subscription_status" DEFAULT 'pending_payment' NOT NULL,
	"current_period_start" timestamp with time zone,
	"current_period_end" timestamp with time zone,
	"address_id" uuid,
	"address" jsonb NOT NULL,
	"lat" double precision NOT NULL,
	"lng" double precision NOT NULL,
	"notes" text,
	"cancelled_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "bookings" ADD COLUMN "subscription_id" uuid;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_customer_id_users_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_plan_id_subscription_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."subscription_plans"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_address_id_addresses_id_fk" FOREIGN KEY ("address_id") REFERENCES "public"."addresses"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "subscriptions_reference_unique" ON "subscriptions" USING btree ("reference");--> statement-breakpoint
CREATE INDEX "subscriptions_customer_idx" ON "subscriptions" USING btree ("customer_id","created_at");--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_subscription_id_subscriptions_id_fk" FOREIGN KEY ("subscription_id") REFERENCES "public"."subscriptions"("id") ON DELETE no action ON UPDATE no action;