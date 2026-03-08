CREATE TABLE "discovery_categories" (
	"id" uuid PRIMARY KEY NOT NULL,
	"parent_category_id" text,
	"name" text NOT NULL,
	"icon_id" text,
	"allowed_type_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"ancestor_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"attributes" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"child_count" integer DEFAULT 0 NOT NULL,
	"item_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "discovery_item_types" (
	"id" uuid PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"available_widget_types" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"required_widget_types" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "discovery_items" (
	"id" uuid PRIMARY KEY NOT NULL,
	"type_id" text NOT NULL,
	"title" text,
	"description" text,
	"image_id" text,
	"age_group" text,
	"city_id" text,
	"lat" double precision,
	"lng" double precision,
	"address" text,
	"payment_strategy" text,
	"price" numeric,
	"category_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"attribute_values" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"organization_id" text,
	"owner_name" text,
	"owner_avatar_id" text,
	"item_rating" numeric,
	"item_review_count" integer DEFAULT 0 NOT NULL,
	"owner_rating" numeric,
	"owner_review_count" integer DEFAULT 0 NOT NULL,
	"event_dates" jsonb,
	"schedule_entries" jsonb,
	"published_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "discovery_owners" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"avatar_id" text,
	"rating" numeric,
	"review_count" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "discovery_processed_events" (
	"event_id" text PRIMARY KEY NOT NULL,
	"processed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "discovery_user_likes" (
	"user_id" text NOT NULL,
	"item_id" text NOT NULL,
	"liked_at" timestamp with time zone NOT NULL,
	CONSTRAINT "discovery_user_likes_user_id_item_id_pk" PRIMARY KEY("user_id","item_id")
);
--> statement-breakpoint
CREATE TABLE "login_processes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"type" text NOT NULL,
	"phone_number" text NOT NULL,
	"ip" text,
	"code_hash" text,
	"expires_at" timestamp with time zone,
	"requested_at" timestamp with time zone DEFAULT now() NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"last_try_at" timestamp with time zone,
	"registration_session_id" text,
	"user_id" uuid,
	"blocked_until" timestamp with time zone,
	"error" text
);
--> statement-breakpoint
CREATE TABLE "roles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"permissions" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"is_static" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "roles_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"phone_number" text NOT NULL,
	"full_name" text,
	"role" text DEFAULT 'USER' NOT NULL,
	"avatar_file_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_phone_number_unique" UNIQUE("phone_number")
);
--> statement-breakpoint
CREATE TABLE "files" (
	"id" uuid PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"bucket" text NOT NULL,
	"mime_type" text NOT NULL,
	"is_temporary" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "outbox" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"topic" text NOT NULL,
	"key" text,
	"payload" "bytea",
	"headers" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "discovery_items_city_age_idx" ON "discovery_items" USING btree ("city_id","age_group");--> statement-breakpoint
CREATE INDEX "discovery_items_org_idx" ON "discovery_items" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "discovery_items_price_idx" ON "discovery_items" USING btree ("price");--> statement-breakpoint
CREATE INDEX "discovery_items_rating_idx" ON "discovery_items" USING btree ("item_rating");--> statement-breakpoint
CREATE INDEX "discovery_items_published_at_idx" ON "discovery_items" USING btree ("published_at");--> statement-breakpoint
CREATE INDEX "login_processes_phone_ip_requested_idx" ON "login_processes" USING btree ("phone_number","ip","requested_at");--> statement-breakpoint
CREATE INDEX "login_processes_reg_session_idx" ON "login_processes" USING btree ("registration_session_id");--> statement-breakpoint
CREATE INDEX "sessions_user_created_idx" ON "sessions" USING btree ("user_id","created_at");