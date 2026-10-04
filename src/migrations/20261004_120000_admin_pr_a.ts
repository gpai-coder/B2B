import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_users_approval_status" AS ENUM('pending', 'approved', 'rejected');
  CREATE TYPE "public"."enum_order_events_kind" AS ENUM('status_change');
  ALTER TYPE "public"."enum_orders_status" ADD VALUE 'delivered' BEFORE 'cancelled';
  CREATE TABLE "order_events" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order_id" integer NOT NULL,
  	"company_id" integer NOT NULL,
  	"kind" "enum_order_events_kind" DEFAULT 'status_change' NOT NULL,
  	"from_status" varchar NOT NULL,
  	"to_status" varchar NOT NULL,
  	"actor_id" integer,
  	"note" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  ALTER TABLE "users" ADD COLUMN "approval_status" "enum_users_approval_status" DEFAULT 'pending';
  ALTER TABLE "users" ADD COLUMN "approval_reviewed_at" timestamp(3) with time zone;
  ALTER TABLE "users" ADD COLUMN "approval_reviewed_by_id" integer;
  ALTER TABLE "orders" ADD COLUMN "carrier" varchar;
  ALTER TABLE "orders" ADD COLUMN "tracking_number" varchar;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "order_events_id" integer;
  ALTER TABLE "order_events" ADD CONSTRAINT "order_events_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "order_events" ADD CONSTRAINT "order_events_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "order_events" ADD CONSTRAINT "order_events_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  CREATE INDEX "order_events_order_idx" ON "order_events" USING btree ("order_id");
  CREATE INDEX "order_events_company_idx" ON "order_events" USING btree ("company_id");
  CREATE INDEX "order_events_actor_idx" ON "order_events" USING btree ("actor_id");
  CREATE INDEX "order_events_updated_at_idx" ON "order_events" USING btree ("updated_at");
  CREATE INDEX "order_events_created_at_idx" ON "order_events" USING btree ("created_at");
  ALTER TABLE "users" ADD CONSTRAINT "users_approval_reviewed_by_id_users_id_fk" FOREIGN KEY ("approval_reviewed_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_order_events_fk" FOREIGN KEY ("order_events_id") REFERENCES "public"."order_events"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "users_approval_reviewed_by_idx" ON "users" USING btree ("approval_reviewed_by_id");
  CREATE INDEX "payload_locked_documents_rels_order_events_id_idx" ON "payload_locked_documents_rels" USING btree ("order_events_id");

  UPDATE "users"
  SET "approval_status" = CASE
    WHEN "role" != 'vendor-buyer' THEN 'approved'::"enum_users_approval_status"
    WHEN "approved" = true THEN 'approved'::"enum_users_approval_status"
    ELSE 'pending'::"enum_users_approval_status"
  END;`)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "order_events" DISABLE ROW LEVEL SECURITY;
  DROP TABLE IF EXISTS "order_events" CASCADE;
  ALTER TABLE "users" DROP CONSTRAINT IF EXISTS "users_approval_reviewed_by_id_users_id_fk";
  
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT IF EXISTS "payload_locked_documents_rels_order_events_fk";
  
  ALTER TABLE "orders" ALTER COLUMN "status" SET DATA TYPE text;
  ALTER TABLE "orders" ALTER COLUMN "status" SET DEFAULT 'draft'::text;
  DROP TYPE IF EXISTS "public"."enum_orders_status";
  CREATE TYPE "public"."enum_orders_status" AS ENUM('draft', 'submitted', 'confirmed', 'shipped', 'cancelled');
  ALTER TABLE "orders" ALTER COLUMN "status" SET DEFAULT 'draft'::"public"."enum_orders_status";
  ALTER TABLE "orders" ALTER COLUMN "status" SET DATA TYPE "public"."enum_orders_status" USING "status"::"public"."enum_orders_status";
  DROP INDEX IF EXISTS "users_approval_reviewed_by_idx";
  DROP INDEX IF EXISTS "payload_locked_documents_rels_order_events_id_idx";
  ALTER TABLE "users" DROP COLUMN IF EXISTS "approval_status";
  ALTER TABLE "users" DROP COLUMN IF EXISTS "approval_reviewed_at";
  ALTER TABLE "users" DROP COLUMN IF EXISTS "approval_reviewed_by_id";
  ALTER TABLE "orders" DROP COLUMN IF EXISTS "carrier";
  ALTER TABLE "orders" DROP COLUMN IF EXISTS "tracking_number";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN IF EXISTS "order_events_id";
  DROP TYPE IF EXISTS "public"."enum_users_approval_status";
  DROP TYPE IF EXISTS "public"."enum_order_events_kind";`)
}
