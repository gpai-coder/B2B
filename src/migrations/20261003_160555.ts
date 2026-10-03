import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   DROP INDEX "orders_idempotency_key_idx";
  ALTER TABLE "companies" ADD COLUMN "default_ship_to_name" varchar;
  ALTER TABLE "companies" ADD COLUMN "default_ship_to_line1" varchar;
  ALTER TABLE "companies" ADD COLUMN "default_ship_to_line2" varchar;
  ALTER TABLE "companies" ADD COLUMN "default_ship_to_city" varchar;
  ALTER TABLE "companies" ADD COLUMN "default_ship_to_state" varchar;
  ALTER TABLE "companies" ADD COLUMN "default_ship_to_postal_code" varchar;
  ALTER TABLE "companies" ADD COLUMN "default_ship_to_country" varchar DEFAULT 'US';
  ALTER TABLE "quotes" ADD COLUMN "converted_order_id" integer;
  ALTER TABLE "orders" ADD COLUMN "order_notes" varchar;
  ALTER TABLE "quotes" ADD CONSTRAINT "quotes_converted_order_id_orders_id_fk" FOREIGN KEY ("converted_order_id") REFERENCES "public"."orders"("id") ON DELETE set null ON UPDATE no action;
  CREATE INDEX "quotes_converted_order_idx" ON "quotes" USING btree ("converted_order_id");
  CREATE UNIQUE INDEX "company_poNumber_idx" ON "orders" USING btree ("company_id","po_number");
  CREATE UNIQUE INDEX "company_idempotencyKey_idx" ON "orders" USING btree ("company_id","idempotency_key");
  CREATE INDEX "orders_idempotency_key_idx" ON "orders" USING btree ("idempotency_key");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "quotes" DROP CONSTRAINT "quotes_converted_order_id_orders_id_fk";
  
  DROP INDEX "quotes_converted_order_idx";
  DROP INDEX "company_poNumber_idx";
  DROP INDEX "company_idempotencyKey_idx";
  DROP INDEX "orders_idempotency_key_idx";
  CREATE UNIQUE INDEX "orders_idempotency_key_idx" ON "orders" USING btree ("idempotency_key");
  ALTER TABLE "companies" DROP COLUMN "default_ship_to_name";
  ALTER TABLE "companies" DROP COLUMN "default_ship_to_line1";
  ALTER TABLE "companies" DROP COLUMN "default_ship_to_line2";
  ALTER TABLE "companies" DROP COLUMN "default_ship_to_city";
  ALTER TABLE "companies" DROP COLUMN "default_ship_to_state";
  ALTER TABLE "companies" DROP COLUMN "default_ship_to_postal_code";
  ALTER TABLE "companies" DROP COLUMN "default_ship_to_country";
  ALTER TABLE "quotes" DROP COLUMN "converted_order_id";
  ALTER TABLE "orders" DROP COLUMN "order_notes";`)
}
