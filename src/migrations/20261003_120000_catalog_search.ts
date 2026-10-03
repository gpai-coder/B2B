import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    CREATE EXTENSION IF NOT EXISTS pg_trgm;

    ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "catalog_hidden" boolean DEFAULT false NOT NULL;
    ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "search_vector" tsvector;

    CREATE OR REPLACE FUNCTION public.catalog_refresh_product_search_vector(p_id integer)
    RETURNS tsvector
    LANGUAGE sql
    STABLE
    AS $$
      SELECT
        setweight(to_tsvector('english', coalesce(p.name, '')), 'A') ||
        setweight(to_tsvector('english', coalesce(p.description, '')), 'B') ||
        setweight(to_tsvector('simple', coalesce(p.model_number, '')), 'A') ||
        setweight(to_tsvector('english', coalesce(p.product_collection, '')), 'C') ||
        setweight(to_tsvector('english', coalesce(p.catalog_category::text, '')), 'C') ||
        setweight(to_tsvector('simple', coalesce(vagg.skus, '')), 'A') ||
        setweight(to_tsvector('english', coalesce(vagg.finishes, '')), 'C') ||
        setweight(to_tsvector('english', coalesce(vagg.vnames, '')), 'B')
      FROM products p
      LEFT JOIN LATERAL (
        SELECT
          string_agg(pv.sku, ' ' ORDER BY pv.sku) AS skus,
          string_agg(pv.finish, ' ' ORDER BY pv.finish) AS finishes,
          string_agg(pv.name, ' ' ORDER BY pv.sku) AS vnames
        FROM product_variants pv
        WHERE pv.product_id = p.id
      ) vagg ON true
      WHERE p.id = p_id;
    $$;

    CREATE OR REPLACE FUNCTION public.catalog_products_search_vector_trigger()
    RETURNS trigger
    LANGUAGE plpgsql
    AS $$
    DECLARE
      target_id integer;
    BEGIN
      IF TG_TABLE_NAME = 'product_variants' THEN
        IF TG_OP = 'DELETE' THEN
          target_id := OLD.product_id;
        ELSE
          target_id := NEW.product_id;
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

    DROP TRIGGER IF EXISTS catalog_products_search_vector_trg ON products;
    CREATE TRIGGER catalog_products_search_vector_trg
      AFTER INSERT OR UPDATE OF name, description, model_number, product_collection, catalog_category
      ON products
      FOR EACH ROW
      EXECUTE FUNCTION public.catalog_products_search_vector_trigger();

    DROP TRIGGER IF EXISTS catalog_variants_search_vector_trg ON product_variants;
    CREATE TRIGGER catalog_variants_search_vector_trg
      AFTER INSERT OR DELETE OR UPDATE OF sku, finish, name, product_id
      ON product_variants
      FOR EACH ROW
      EXECUTE FUNCTION public.catalog_products_search_vector_trigger();

    UPDATE products SET search_vector = public.catalog_refresh_product_search_vector(id);

    CREATE INDEX IF NOT EXISTS products_search_vector_gin ON products USING GIN (search_vector);
    CREATE INDEX IF NOT EXISTS products_model_number_trgm ON products USING GIN (model_number gin_trgm_ops);
    CREATE INDEX IF NOT EXISTS product_variants_sku_trgm ON product_variants USING GIN (sku gin_trgm_ops);
    CREATE INDEX IF NOT EXISTS product_variants_finish_trgm ON product_variants USING GIN (finish gin_trgm_ops);

    UPDATE products SET catalog_hidden = true
    WHERE slug = 'delancey-r-single-handle-pull-down-dual-spray-function-kitchen-faucet-1-5-gpm-5-7-l-min';
  `)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
    DROP TRIGGER IF EXISTS catalog_variants_search_vector_trg ON product_variants;
    DROP TRIGGER IF EXISTS catalog_products_search_vector_trg ON products;
    DROP FUNCTION IF EXISTS public.catalog_products_search_vector_trigger();
    DROP FUNCTION IF EXISTS public.catalog_refresh_product_search_vector(integer);

    DROP INDEX IF EXISTS product_variants_finish_trgm;
    DROP INDEX IF EXISTS product_variants_sku_trgm;
    DROP INDEX IF EXISTS products_model_number_trgm;
    DROP INDEX IF EXISTS products_search_vector_gin;

    ALTER TABLE "products" DROP COLUMN IF EXISTS "search_vector";
    ALTER TABLE "products" DROP COLUMN IF EXISTS "catalog_hidden";
  `)
}
