import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TABLE "ship_to_addresses" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"company_id" integer NOT NULL,
  	"label" varchar NOT NULL,
  	"name" varchar NOT NULL,
  	"line1" varchar NOT NULL,
  	"line2" varchar,
  	"city" varchar NOT NULL,
  	"state" varchar NOT NULL,
  	"postal_code" varchar NOT NULL,
  	"country" varchar DEFAULT 'US' NOT NULL,
  	"is_default" boolean DEFAULT false,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "ship_to_addresses_id" integer;
  ALTER TABLE "ship_to_addresses" ADD CONSTRAINT "ship_to_addresses_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE set null ON UPDATE no action;
  CREATE INDEX "ship_to_addresses_company_idx" ON "ship_to_addresses" USING btree ("company_id");
  CREATE INDEX "ship_to_addresses_updated_at_idx" ON "ship_to_addresses" USING btree ("updated_at");
  CREATE INDEX "ship_to_addresses_created_at_idx" ON "ship_to_addresses" USING btree ("created_at");
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_ship_to_addresses_fk" FOREIGN KEY ("ship_to_addresses_id") REFERENCES "public"."ship_to_addresses"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "payload_locked_documents_rels_ship_to_addresses_id_idx" ON "payload_locked_documents_rels" USING btree ("ship_to_addresses_id");

  CREATE UNIQUE INDEX "ship_to_addresses_one_default_per_company"
    ON "ship_to_addresses" USING btree ("company_id")
    WHERE "ship_to_addresses"."is_default" = true;

  INSERT INTO "ship_to_addresses" (
    "company_id",
    "label",
    "name",
    "line1",
    "line2",
    "city",
    "state",
    "postal_code",
    "country",
    "is_default",
    "created_at",
    "updated_at"
  )
  SELECT
    c."id",
    'Primary',
    c."default_ship_to_name",
    c."default_ship_to_line1",
    c."default_ship_to_line2",
    c."default_ship_to_city",
    c."default_ship_to_state",
    c."default_ship_to_postal_code",
    COALESCE(c."default_ship_to_country", 'US'),
    true,
    now(),
    now()
  FROM "companies" c
  WHERE c."default_ship_to_line1" IS NOT NULL
    AND NOT EXISTS (
      SELECT 1 FROM "ship_to_addresses" s WHERE s."company_id" = c."id"
    );`)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT IF EXISTS "payload_locked_documents_rels_ship_to_addresses_fk";
  DROP INDEX IF EXISTS "payload_locked_documents_rels_ship_to_addresses_id_idx";
  DROP INDEX IF EXISTS "ship_to_addresses_one_default_per_company";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN IF EXISTS "ship_to_addresses_id";
  ALTER TABLE "ship_to_addresses" DISABLE ROW LEVEL SECURITY;
  DROP TABLE IF EXISTS "ship_to_addresses" CASCADE;`)
}
