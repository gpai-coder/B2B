import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TYPE "public"."enum_quotes_status" ADD VALUE 'withdrawn' BEFORE 'cancelled';
  ALTER TABLE "quotes" ADD COLUMN "notes" varchar;`)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "quotes" ALTER COLUMN "status" SET DATA TYPE text;
  ALTER TABLE "quotes" ALTER COLUMN "status" SET DEFAULT 'draft'::text;
  DROP TYPE "public"."enum_quotes_status";
  CREATE TYPE "public"."enum_quotes_status" AS ENUM('draft', 'sent', 'accepted', 'expired', 'cancelled');
  ALTER TABLE "quotes" ALTER COLUMN "status" SET DEFAULT 'draft'::"public"."enum_quotes_status";
  ALTER TABLE "quotes" ALTER COLUMN "status" SET DATA TYPE "public"."enum_quotes_status" USING "status"::"public"."enum_quotes_status";
  ALTER TABLE "quotes" DROP COLUMN "notes";`)
}
