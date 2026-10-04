import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

/** Align order_events FKs with NOT NULL columns (RESTRICT instead of SET NULL). */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    ALTER TABLE "order_events" DROP CONSTRAINT IF EXISTS "order_events_order_id_orders_id_fk";
    ALTER TABLE "order_events" DROP CONSTRAINT IF EXISTS "order_events_company_id_companies_id_fk";

    ALTER TABLE "order_events" ADD CONSTRAINT "order_events_order_id_orders_id_fk"
      FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE restrict ON UPDATE no action;

    ALTER TABLE "order_events" ADD CONSTRAINT "order_events_company_id_companies_id_fk"
      FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE restrict ON UPDATE no action;
  `)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
    ALTER TABLE "order_events" DROP CONSTRAINT IF EXISTS "order_events_order_id_orders_id_fk";
    ALTER TABLE "order_events" DROP CONSTRAINT IF EXISTS "order_events_company_id_companies_id_fk";

    ALTER TABLE "order_events" ADD CONSTRAINT "order_events_order_id_orders_id_fk"
      FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE set null ON UPDATE no action;

    ALTER TABLE "order_events" ADD CONSTRAINT "order_events_company_id_companies_id_fk"
      FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE set null ON UPDATE no action;
  `)
}
