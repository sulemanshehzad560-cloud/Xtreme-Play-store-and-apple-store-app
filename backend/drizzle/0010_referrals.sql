CREATE TABLE "referrals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"referrer_id" uuid NOT NULL,
	"referee_id" uuid NOT NULL,
	"booking_id" uuid NOT NULL,
	"reward_promotion_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "promotions" ADD COLUMN "owner_id" uuid;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "referral_code" text;--> statement-breakpoint
ALTER TABLE "referrals" ADD CONSTRAINT "referrals_referrer_id_users_id_fk" FOREIGN KEY ("referrer_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "referrals" ADD CONSTRAINT "referrals_referee_id_users_id_fk" FOREIGN KEY ("referee_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "referrals" ADD CONSTRAINT "referrals_booking_id_bookings_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "referrals" ADD CONSTRAINT "referrals_reward_promotion_id_promotions_id_fk" FOREIGN KEY ("reward_promotion_id") REFERENCES "public"."promotions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "referrals_referee_unique" ON "referrals" USING btree ("referee_id");--> statement-breakpoint
CREATE INDEX "referrals_referrer_idx" ON "referrals" USING btree ("referrer_id");--> statement-breakpoint
ALTER TABLE "promotions" ADD CONSTRAINT "promotions_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "users_referral_code_unique" ON "users" USING btree ("referral_code") WHERE "users"."referral_code" is not null;