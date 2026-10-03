import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

/** Idempotent: databases that ran ship_to_addresses migration before the partial index was added. */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    CREATE UNIQUE INDEX IF NOT EXISTS "ship_to_addresses_one_default_per_company"
      ON "ship_to_addresses" USING btree ("company_id")
      WHERE "is_default" = true;
  `)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
    DROP INDEX IF EXISTS "ship_to_addresses_one_default_per_company";
  `)
}
