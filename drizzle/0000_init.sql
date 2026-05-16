CREATE TABLE "chat_messages" (
	"id" uuid PRIMARY KEY NOT NULL,
	"chat_id" uuid NOT NULL,
	"sender_participant_id" uuid,
	"actor_user_id" text,
	"kind" text NOT NULL,
	"text" text,
	"media_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"system_event" jsonb,
	"created_at" timestamp with time zone NOT NULL,
	"edited_at" timestamp with time zone,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "chat_organization_members" (
	"organization_id" text NOT NULL,
	"user_id" text NOT NULL,
	"joined_at" timestamp with time zone NOT NULL,
	CONSTRAINT "chat_organization_members_organization_id_user_id_pk" PRIMARY KEY("organization_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "chat_participant_user_reads" (
	"participant_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"last_read_message_id" uuid NOT NULL,
	"last_read_at" timestamp with time zone NOT NULL,
	CONSTRAINT "chat_participant_user_reads_participant_id_user_id_pk" PRIMARY KEY("participant_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "chat_participants" (
	"id" uuid PRIMARY KEY NOT NULL,
	"chat_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"subject_id" text,
	"assigned_user_id" text,
	"claimed_at" timestamp with time zone,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "chat_reports" (
	"id" uuid PRIMARY KEY NOT NULL,
	"chat_id" uuid NOT NULL,
	"message_id" uuid,
	"reporter_user_id" text NOT NULL,
	"reporter_participant_id" uuid NOT NULL,
	"category" text,
	"reason" text NOT NULL,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "chats" (
	"id" uuid PRIMARY KEY NOT NULL,
	"pair_key" text NOT NULL,
	"status" text NOT NULL,
	"blocked_by_participant_id" uuid,
	"blocked_at" timestamp with time zone,
	"context_item_id" text,
	"last_message_id" uuid,
	"last_message_at" timestamp with time zone,
	"last_message_preview" text,
	"last_message_sender_participant_id" uuid,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	CONSTRAINT "chats_pair_key_unique" UNIQUE("pair_key")
);
--> statement-breakpoint
CREATE TABLE "cms_categories" (
	"id" uuid PRIMARY KEY NOT NULL,
	"parent_category_id" uuid,
	"name" text NOT NULL,
	"icon_id" uuid NOT NULL,
	"order" integer DEFAULT 0 NOT NULL,
	"allowed_type_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"age_groups" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"attributes" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"published_at" timestamp with time zone,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cms_cities" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"lat" double precision NOT NULL,
	"lng" double precision NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cms_item_types" (
	"id" uuid PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"label" text NOT NULL,
	"widget_settings" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "discovery_item_attributes" (
	"item_id" uuid NOT NULL,
	"attribute_id" text NOT NULL,
	"value" text NOT NULL,
	CONSTRAINT "discovery_item_attributes_item_id_attribute_id_value_pk" PRIMARY KEY("item_id","attribute_id","value")
);
--> statement-breakpoint
CREATE TABLE "discovery_item_categories" (
	"item_id" uuid NOT NULL,
	"category_id" text NOT NULL,
	CONSTRAINT "discovery_item_categories_item_id_category_id_pk" PRIMARY KEY("item_id","category_id")
);
--> statement-breakpoint
CREATE TABLE "discovery_item_event_dates" (
	"item_id" uuid NOT NULL,
	"event_date" timestamp with time zone NOT NULL,
	"label" text,
	CONSTRAINT "discovery_item_event_dates_item_id_event_date_pk" PRIMARY KEY("item_id","event_date")
);
--> statement-breakpoint
CREATE TABLE "discovery_item_schedules" (
	"item_id" uuid NOT NULL,
	"day_of_week" integer NOT NULL,
	"start_time" text NOT NULL,
	"end_time" text NOT NULL,
	CONSTRAINT "discovery_item_schedules_item_id_day_of_week_start_time_end_time_pk" PRIMARY KEY("item_id","day_of_week","start_time","end_time")
);
--> statement-breakpoint
CREATE TABLE "discovery_items" (
	"id" uuid PRIMARY KEY NOT NULL,
	"type_id" text NOT NULL,
	"title" text,
	"description" text,
	"media" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"age_group" text,
	"city_id" text,
	"lat" double precision,
	"lng" double precision,
	"address" text,
	"payment_options" jsonb,
	"min_price" numeric,
	"organization_id" text,
	"owner_name" text,
	"owner_avatar_id" text,
	"item_rating" numeric,
	"item_review_count" integer DEFAULT 0 NOT NULL,
	"owner_rating" numeric,
	"owner_review_count" integer DEFAULT 0 NOT NULL,
	"widgets" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"published_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "discovery_owners" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"avatar_id" text,
	"media" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"contacts" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"team" jsonb,
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
CREATE TABLE "discovery_search_log" (
	"city_id" text NOT NULL,
	"query" text NOT NULL,
	"count" integer DEFAULT 1 NOT NULL,
	"last_used_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "discovery_search_log_city_id_query_pk" PRIMARY KEY("city_id","query")
);
--> statement-breakpoint
CREATE TABLE "discovery_user_likes" (
	"user_id" text NOT NULL,
	"item_id" uuid NOT NULL,
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
	"permissions" jsonb DEFAULT '[]'::jsonb NOT NULL,
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
	"expires_at" timestamp with time zone NOT NULL,
	"ip" text,
	"city" text,
	"country" text,
	"device_name" text
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"phone_number" text NOT NULL,
	"full_name" text,
	"role" text DEFAULT 'USER' NOT NULL,
	"avatar_file_id" text,
	"city_id" text DEFAULT '' NOT NULL,
	"lat" double precision,
	"lng" double precision,
	"blocked_at" timestamp with time zone,
	"block_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_phone_number_unique" UNIQUE("phone_number")
);
--> statement-breakpoint
CREATE TABLE "interactions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"item_id" uuid NOT NULL,
	"type" text NOT NULL,
	"metadata" jsonb,
	"timestamp" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "media" (
	"id" uuid PRIMARY KEY NOT NULL,
	"type" text NOT NULL,
	"name" text NOT NULL,
	"bucket" text NOT NULL,
	"mime_type" text NOT NULL,
	"is_temporary" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"width" integer,
	"height" integer,
	"verified_mime_type" text
);
--> statement-breakpoint
CREATE TABLE "video_details" (
	"media_id" uuid PRIMARY KEY NOT NULL,
	"processing_status" text DEFAULT 'pending' NOT NULL,
	"thumbnail_media_id" uuid,
	"hls_manifest_key" text,
	"mp4_preview_key" text,
	"duration" integer,
	"width" integer,
	"height" integer
);
--> statement-breakpoint
CREATE TABLE "items" (
	"id" uuid PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"type_id" text NOT NULL,
	"state" jsonb NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "organizations" (
	"id" uuid PRIMARY KEY NOT NULL,
	"state" jsonb NOT NULL,
	"claim_token" text,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reviews" (
	"id" uuid PRIMARY KEY NOT NULL,
	"author_id" text NOT NULL,
	"target_type" text NOT NULL,
	"target_id" text NOT NULL,
	"organization_id" text NOT NULL,
	"status" text NOT NULL,
	"rating" real NOT NULL,
	"state" jsonb NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "boards" (
	"id" uuid PRIMARY KEY NOT NULL,
	"scope" text NOT NULL,
	"state" jsonb NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tickets" (
	"id" uuid PRIMARY KEY NOT NULL,
	"board_id" text NOT NULL,
	"status" text NOT NULL,
	"assignee_id" text,
	"state" jsonb NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
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
ALTER TABLE "video_details" ADD CONSTRAINT "video_details_media_id_media_id_fk" FOREIGN KEY ("media_id") REFERENCES "public"."media"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "chat_messages_chat_id_created_idx" ON "chat_messages" USING btree ("chat_id","created_at");--> statement-breakpoint
CREATE INDEX "chat_messages_actor_user_idx" ON "chat_messages" USING btree ("actor_user_id");--> statement-breakpoint
CREATE INDEX "chat_org_members_user_idx" ON "chat_organization_members" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "cpur_user_idx" ON "chat_participant_user_reads" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "chat_participants_chat_id_idx" ON "chat_participants" USING btree ("chat_id");--> statement-breakpoint
CREATE INDEX "chat_participants_kind_subject_idx" ON "chat_participants" USING btree ("kind","subject_id");--> statement-breakpoint
CREATE INDEX "chat_participants_assigned_user_idx" ON "chat_participants" USING btree ("assigned_user_id");--> statement-breakpoint
CREATE INDEX "chat_reports_chat_id_idx" ON "chat_reports" USING btree ("chat_id");--> statement-breakpoint
CREATE INDEX "chat_reports_message_id_idx" ON "chat_reports" USING btree ("message_id");--> statement-breakpoint
CREATE INDEX "chat_reports_reporter_idx" ON "chat_reports" USING btree ("reporter_user_id");--> statement-breakpoint
CREATE INDEX "chats_status_idx" ON "chats" USING btree ("status");--> statement-breakpoint
CREATE INDEX "chats_last_message_at_idx" ON "chats" USING btree ("last_message_at");--> statement-breakpoint
CREATE INDEX "cms_categories_parent_idx" ON "cms_categories" USING btree ("parent_category_id");--> statement-breakpoint
CREATE INDEX "cms_categories_status_order_name_idx" ON "cms_categories" USING btree ("status","order","name");--> statement-breakpoint
CREATE INDEX "discovery_item_attributes_attr_value_idx" ON "discovery_item_attributes" USING btree ("attribute_id","value");--> statement-breakpoint
CREATE INDEX "discovery_item_categories_category_idx" ON "discovery_item_categories" USING btree ("category_id");--> statement-breakpoint
CREATE INDEX "discovery_item_event_dates_date_idx" ON "discovery_item_event_dates" USING btree ("event_date");--> statement-breakpoint
CREATE INDEX "discovery_item_schedules_day_idx" ON "discovery_item_schedules" USING btree ("day_of_week");--> statement-breakpoint
CREATE INDEX "discovery_item_schedules_time_idx" ON "discovery_item_schedules" USING btree ("start_time","end_time");--> statement-breakpoint
CREATE INDEX "discovery_items_city_age_idx" ON "discovery_items" USING btree ("city_id","age_group");--> statement-breakpoint
CREATE INDEX "discovery_items_org_idx" ON "discovery_items" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "discovery_items_price_idx" ON "discovery_items" USING btree ("min_price");--> statement-breakpoint
CREATE INDEX "discovery_items_rating_idx" ON "discovery_items" USING btree ("item_rating");--> statement-breakpoint
CREATE INDEX "discovery_items_published_at_idx" ON "discovery_items" USING btree ("published_at");--> statement-breakpoint
CREATE INDEX "discovery_search_log_city_count_idx" ON "discovery_search_log" USING btree ("city_id","count");--> statement-breakpoint
CREATE INDEX "discovery_search_log_last_used_idx" ON "discovery_search_log" USING btree ("last_used_at");--> statement-breakpoint
CREATE INDEX "login_processes_phone_ip_requested_idx" ON "login_processes" USING btree ("phone_number","ip","requested_at");--> statement-breakpoint
CREATE INDEX "login_processes_reg_session_idx" ON "login_processes" USING btree ("registration_session_id");--> statement-breakpoint
CREATE INDEX "sessions_user_created_idx" ON "sessions" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "interactions_user_idx" ON "interactions" USING btree ("user_id","timestamp");--> statement-breakpoint
CREATE INDEX "interactions_item_idx" ON "interactions" USING btree ("item_id","timestamp");--> statement-breakpoint
CREATE INDEX "interactions_type_idx" ON "interactions" USING btree ("type","timestamp");--> statement-breakpoint
CREATE INDEX "interactions_dedup_idx" ON "interactions" USING btree ("user_id","item_id","type","timestamp");--> statement-breakpoint
CREATE INDEX "items_organization_id_idx" ON "items" USING btree ("organization_id");--> statement-breakpoint
CREATE UNIQUE INDEX "organizations_claim_token_idx" ON "organizations" USING btree ("claim_token");--> statement-breakpoint
CREATE INDEX "reviews_author_target_idx" ON "reviews" USING btree ("author_id","target_type","target_id");--> statement-breakpoint
CREATE INDEX "reviews_target_status_idx" ON "reviews" USING btree ("target_type","target_id","status");--> statement-breakpoint
CREATE INDEX "reviews_organization_status_idx" ON "reviews" USING btree ("organization_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "reviews_author_target_active_idx" ON "reviews" USING btree ("author_id","target_type","target_id") WHERE status NOT IN ('deleted');--> statement-breakpoint
CREATE INDEX "boards_scope_idx" ON "boards" USING btree ("scope");--> statement-breakpoint
CREATE INDEX "tickets_board_id_idx" ON "tickets" USING btree ("board_id");--> statement-breakpoint
CREATE INDEX "tickets_status_idx" ON "tickets" USING btree ("status");--> statement-breakpoint
CREATE INDEX "tickets_assignee_id_idx" ON "tickets" USING btree ("assignee_id");