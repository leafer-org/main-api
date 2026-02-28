CREATE TYPE "public"."media_visibility" AS ENUM('PUBLIC', 'PRIVATE');--> statement-breakpoint
CREATE TYPE "public"."role" AS ENUM('ADMIN', 'USER');--> statement-breakpoint
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
CREATE TABLE "media" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"media_id" text NOT NULL,
	"bucket" text NOT NULL,
	"object_key" text NOT NULL,
	"content_type" text,
	"visibility" "media_visibility" DEFAULT 'PUBLIC' NOT NULL,
	"metadata" json,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"user_avatar_id" uuid,
	CONSTRAINT "media_media_id_unique" UNIQUE("media_id"),
	CONSTRAINT "media_user_avatar_id_unique" UNIQUE("user_avatar_id")
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
	"role" "role" DEFAULT 'USER' NOT NULL,
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
ALTER TABLE "media" ADD CONSTRAINT "media_user_avatar_id_users_id_fk" FOREIGN KEY ("user_avatar_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "login_processes_phone_ip_requested_idx" ON "login_processes" USING btree ("phone_number","ip","requested_at");--> statement-breakpoint
CREATE INDEX "login_processes_reg_session_idx" ON "login_processes" USING btree ("registration_session_id");--> statement-breakpoint
CREATE INDEX "sessions_user_created_idx" ON "sessions" USING btree ("user_id","created_at");