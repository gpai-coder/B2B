import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    CREATE OR REPLACE FUNCTION public.catalog_products_search_vector_trigger()
    RETURNS trigger
    LANGUAGE plpgsql
    AS $$
    DECLARE
      target_id integer;
      old_product_id integer;
    BEGIN
      IF TG_TABLE_NAME = 'product_variants' THEN
        IF TG_OP = 'DELETE' THEN
          target_id := OLD.product_id;
        ELSIF TG_OP = 'INSERT' THEN
          target_id := NEW.product_id;
        ELSE
          target_id := NEW.product_id;
          old_product_id := OLD.product_id;
          IF old_product_id IS DISTINCT FROM NEW.product_id AND old_product_id IS NOT NULL THEN
            UPDATE products
            SET search_vector = public.catalog_refresh_product_search_vector(old_product_id)
            WHERE id = old_product_id;
          END IF;
        END IF;
      ELSE
        IF TG_OP = 'DELETE' THEN
          target_id := OLD.id;
        ELSE
          target_id := NEW.id;
        END IF;
      END IF;

      IF target_id IS NULL THEN
        RETURN COALESCE(NEW, OLD);
      END IF;

      UPDATE products
      SET search_vector = public.catalog_refresh_product_search_vector(target_id)
      WHERE id = target_id;

      RETURN COALESCE(NEW, OLD);
    END;
    $$;
  `)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`SELECT 1`)
}
