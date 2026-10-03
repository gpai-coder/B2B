import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TABLE "cart_bulk_adds" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"user_id" integer NOT NULL,
  	"company_id" integer NOT NULL,
  	"idempotency_key" varchar NOT NULL,
  	"added_skus" jsonb NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "cart_bulk_adds_id" integer;
  ALTER TABLE "cart_bulk_adds" ADD CONSTRAINT "cart_bulk_adds_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "cart_bulk_adds" ADD CONSTRAINT "cart_bulk_adds_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE set null ON UPDATE no action;
  CREATE INDEX "cart_bulk_adds_user_idx" ON "cart_bulk_adds" USING btree ("user_id");
  CREATE INDEX "cart_bulk_adds_company_idx" ON "cart_bulk_adds" USING btree ("company_id");
  CREATE INDEX "cart_bulk_adds_idempotency_key_idx" ON "cart_bulk_adds" USING btree ("idempotency_key");
  CREATE INDEX "cart_bulk_adds_updated_at_idx" ON "cart_bulk_adds" USING btree ("updated_at");
  CREATE INDEX "cart_bulk_adds_created_at_idx" ON "cart_bulk_adds" USING btree ("created_at");
  CREATE UNIQUE INDEX "user_company_idempotencyKey_idx" ON "cart_bulk_adds" USING btree ("user_id","company_id","idempotency_key");
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_cart_bulk_adds_fk" FOREIGN KEY ("cart_bulk_adds_id") REFERENCES "public"."cart_bulk_adds"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "payload_locked_documents_rels_cart_bulk_adds_id_idx" ON "payload_locked_documents_rels" USING btree ("cart_bulk_adds_id");`)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT IF EXISTS "payload_locked_documents_rels_cart_bulk_adds_fk";
  DROP INDEX IF EXISTS "payload_locked_documents_rels_cart_bulk_adds_id_idx";
  DROP TABLE IF EXISTS "cart_bulk_adds" CASCADE;
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN IF EXISTS "cart_bulk_adds_id";`)
}
