import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_products_documents_doc_type" AS ENUM('spec-sheet', 'install-instructions', 'parts-diagram', 'cad-2d', 'revit');
  CREATE TYPE "public"."enum_products_catalog_category" AS ENUM('bathroom-faucet', 'kitchen-faucet', 'toilet');
  CREATE TABLE "products_breadcrumbs" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"label" varchar NOT NULL
  );
  
  CREATE TABLE "products_short_bullets" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"text" varchar NOT NULL
  );
  
  CREATE TABLE "products_spec_groups_rows" (
  	"_order" integer NOT NULL,
  	"_parent_id" varchar NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"label" varchar NOT NULL,
  	"value" varchar NOT NULL
  );
  
  CREATE TABLE "products_spec_groups" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"group_name" varchar NOT NULL
  );
  
  CREATE TABLE "products_documents" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"doc_type" "enum_products_documents_doc_type" NOT NULL,
  	"file_id" integer,
  	"external_url" varchar,
  	"display_name" varchar
  );
  
  DROP TABLE "product_variants_documents" CASCADE;
  ALTER TABLE "products" ADD COLUMN "model_number" varchar;
  ALTER TABLE "products" ADD COLUMN "catalog_category" "enum_products_catalog_category";
  ALTER TABLE "products" ADD COLUMN "youtube_video_id" varchar;
  ALTER TABLE "products" ADD COLUMN "facet_meta_handle_type" varchar;
  ALTER TABLE "products" ADD COLUMN "facet_meta_holes_required" varchar;
  ALTER TABLE "products" ADD COLUMN "facet_meta_ada" varchar;
  ALTER TABLE "products" ADD COLUMN "facet_meta_bowl_shape" varchar;
  ALTER TABLE "products" ADD COLUMN "facet_meta_flush_technology" varchar;
  ALTER TABLE "products" ADD COLUMN "facet_meta_gpf" varchar;
  ALTER TABLE "product_variants" ADD COLUMN "msrp" numeric;
  ALTER TABLE "product_variants" ADD COLUMN "upc" varchar;
  ALTER TABLE "product_variants" ADD COLUMN "in_stock" boolean DEFAULT true;
  ALTER TABLE "product_variants" ADD COLUMN "discontinued" boolean DEFAULT false;
  ALTER TABLE "products_breadcrumbs" ADD CONSTRAINT "products_breadcrumbs_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "products_short_bullets" ADD CONSTRAINT "products_short_bullets_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "products_spec_groups_rows" ADD CONSTRAINT "products_spec_groups_rows_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."products_spec_groups"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "products_spec_groups" ADD CONSTRAINT "products_spec_groups_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "products_documents" ADD CONSTRAINT "products_documents_file_id_media_id_fk" FOREIGN KEY ("file_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "products_documents" ADD CONSTRAINT "products_documents_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "products_breadcrumbs_order_idx" ON "products_breadcrumbs" USING btree ("_order");
  CREATE INDEX "products_breadcrumbs_parent_id_idx" ON "products_breadcrumbs" USING btree ("_parent_id");
  CREATE INDEX "products_short_bullets_order_idx" ON "products_short_bullets" USING btree ("_order");
  CREATE INDEX "products_short_bullets_parent_id_idx" ON "products_short_bullets" USING btree ("_parent_id");
  CREATE INDEX "products_spec_groups_rows_order_idx" ON "products_spec_groups_rows" USING btree ("_order");
  CREATE INDEX "products_spec_groups_rows_parent_id_idx" ON "products_spec_groups_rows" USING btree ("_parent_id");
  CREATE INDEX "products_spec_groups_order_idx" ON "products_spec_groups" USING btree ("_order");
  CREATE INDEX "products_spec_groups_parent_id_idx" ON "products_spec_groups" USING btree ("_parent_id");
  CREATE INDEX "products_documents_order_idx" ON "products_documents" USING btree ("_order");
  CREATE INDEX "products_documents_parent_id_idx" ON "products_documents" USING btree ("_parent_id");
  CREATE INDEX "products_documents_file_idx" ON "products_documents" USING btree ("file_id");
  DROP TYPE "public"."enum_product_variants_documents_doc_type";`)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_product_variants_documents_doc_type" AS ENUM('spec-sheet', 'install-instructions', 'parts-diagram');
  CREATE TABLE "product_variants_documents" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"doc_type" "enum_product_variants_documents_doc_type" NOT NULL,
  	"file_id" integer NOT NULL,
  	"display_name" varchar
  );
  
  DROP TABLE "products_breadcrumbs" CASCADE;
  DROP TABLE "products_short_bullets" CASCADE;
  DROP TABLE "products_spec_groups_rows" CASCADE;
  DROP TABLE "products_spec_groups" CASCADE;
  DROP TABLE "products_documents" CASCADE;
  ALTER TABLE "product_variants_documents" ADD CONSTRAINT "product_variants_documents_file_id_media_id_fk" FOREIGN KEY ("file_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "product_variants_documents" ADD CONSTRAINT "product_variants_documents_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."product_variants"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "product_variants_documents_order_idx" ON "product_variants_documents" USING btree ("_order");
  CREATE INDEX "product_variants_documents_parent_id_idx" ON "product_variants_documents" USING btree ("_parent_id");
  CREATE INDEX "product_variants_documents_file_idx" ON "product_variants_documents" USING btree ("file_id");
  ALTER TABLE "products" DROP COLUMN "model_number";
  ALTER TABLE "products" DROP COLUMN "catalog_category";
  ALTER TABLE "products" DROP COLUMN "youtube_video_id";
  ALTER TABLE "products" DROP COLUMN "facet_meta_handle_type";
  ALTER TABLE "products" DROP COLUMN "facet_meta_holes_required";
  ALTER TABLE "products" DROP COLUMN "facet_meta_ada";
  ALTER TABLE "products" DROP COLUMN "facet_meta_bowl_shape";
  ALTER TABLE "products" DROP COLUMN "facet_meta_flush_technology";
  ALTER TABLE "products" DROP COLUMN "facet_meta_gpf";
  ALTER TABLE "product_variants" DROP COLUMN "msrp";
  ALTER TABLE "product_variants" DROP COLUMN "upc";
  ALTER TABLE "product_variants" DROP COLUMN "in_stock";
  ALTER TABLE "product_variants" DROP COLUMN "discontinued";
  DROP TYPE "public"."enum_products_documents_doc_type";
  DROP TYPE "public"."enum_products_catalog_category";`)
}
