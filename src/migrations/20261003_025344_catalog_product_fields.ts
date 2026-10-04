import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_product_variants_documents_doc_type" AS ENUM('spec-sheet', 'install-instructions', 'parts-diagram');
  CREATE TABLE "products_feature_bullets" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"text" varchar NOT NULL
  );
  
  CREATE TABLE "products_specs_table" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"label" varchar NOT NULL,
  	"value" varchar NOT NULL
  );
  
  CREATE TABLE "product_variants_documents" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"doc_type" "enum_product_variants_documents_doc_type" NOT NULL,
  	"file_id" integer NOT NULL,
  	"display_name" varchar
  );
  
  ALTER TABLE "product_variants" ALTER COLUMN "finish" SET NOT NULL;
  ALTER TABLE "products_feature_bullets" ADD CONSTRAINT "products_feature_bullets_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "products_specs_table" ADD CONSTRAINT "products_specs_table_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "product_variants_documents" ADD CONSTRAINT "product_variants_documents_file_id_media_id_fk" FOREIGN KEY ("file_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "product_variants_documents" ADD CONSTRAINT "product_variants_documents_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."product_variants"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "products_feature_bullets_order_idx" ON "products_feature_bullets" USING btree ("_order");
  CREATE INDEX "products_feature_bullets_parent_id_idx" ON "products_feature_bullets" USING btree ("_parent_id");
  CREATE INDEX "products_specs_table_order_idx" ON "products_specs_table" USING btree ("_order");
  CREATE INDEX "products_specs_table_parent_id_idx" ON "products_specs_table" USING btree ("_parent_id");
  CREATE INDEX "product_variants_documents_order_idx" ON "product_variants_documents" USING btree ("_order");
  CREATE INDEX "product_variants_documents_parent_id_idx" ON "product_variants_documents" USING btree ("_parent_id");
  CREATE INDEX "product_variants_documents_file_idx" ON "product_variants_documents" USING btree ("file_id");`)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "products_feature_bullets" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "products_specs_table" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "product_variants_documents" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "products_feature_bullets" CASCADE;
  DROP TABLE "products_specs_table" CASCADE;
  DROP TABLE "product_variants_documents" CASCADE;
  ALTER TABLE "product_variants" ALTER COLUMN "finish" DROP NOT NULL;
  DROP TYPE "public"."enum_product_variants_documents_doc_type";`)
}
