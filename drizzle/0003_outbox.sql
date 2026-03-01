CREATE TABLE "outbox" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"topic" text NOT NULL,
	"key" text,
	"payload" bytea,
	"headers" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
