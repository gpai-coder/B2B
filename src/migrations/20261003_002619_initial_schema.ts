import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_users_role" AS ENUM('admin', 'sales', 'vendor-buyer');
  CREATE TYPE "public"."enum_price_lists_kind" AS ENUM('standard', 'company');
  CREATE TYPE "public"."enum_quotes_status" AS ENUM('draft', 'sent', 'accepted', 'expired', 'cancelled');
  CREATE TYPE "public"."enum_orders_status" AS ENUM('draft', 'submitted', 'confirmed', 'shipped', 'cancelled');
  CREATE TABLE "companies" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"name" varchar NOT NULL,
  	"sap_customer_number" varchar,
  	"account_approved" boolean DEFAULT false,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "users_sessions" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"created_at" timestamp(3) with time zone,
  	"expires_at" timestamp(3) with time zone NOT NULL
  );
  
  CREATE TABLE "users" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"name" varchar,
  	"role" "enum_users_role" DEFAULT 'vendor-buyer' NOT NULL,
  	"company_id" integer,
  	"approved" boolean DEFAULT false,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"email" varchar NOT NULL,
  	"reset_password_token" varchar,
  	"reset_password_expiration" timestamp(3) with time zone,
  	"salt" varchar,
  	"hash" varchar,
  	"reset_password_requested_at" timestamp(3) with time zone,
  	"login_attempts" numeric DEFAULT 0,
  	"lock_until" timestamp(3) with time zone
  );
  
  CREATE TABLE "media" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"alt" varchar NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"url" varchar,
  	"thumbnail_u_r_l" varchar,
  	"filename" varchar,
  	"mime_type" varchar,
  	"filesize" numeric,
  	"width" numeric,
  	"height" numeric,
  	"focal_x" numeric,
  	"focal_y" numeric
  );
  
  CREATE TABLE "products" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"name" varchar NOT NULL,
  	"slug" varchar NOT NULL,
  	"product_collection" varchar NOT NULL,
  	"description" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "product_variants_images" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"image_id" integer NOT NULL
  );
  
  CREATE TABLE "product_variants" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"sku" varchar NOT NULL,
  	"name" varchar NOT NULL,
  	"product_id" integer NOT NULL,
  	"finish" varchar,
  	"specs_flow_rate_gpm" numeric,
  	"specs_spout_height_in" numeric,
  	"specs_material" varchar,
  	"specs_certifications" varchar,
  	"spec_pdf_id" integer,
  	"install_pdf_id" integer,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "price_lists_lines_quantity_breaks" (
  	"_order" integer NOT NULL,
  	"_parent_id" varchar NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"min_quantity" numeric NOT NULL,
  	"unit_price" numeric NOT NULL
  );
  
  CREATE TABLE "price_lists_lines" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"variant_id" integer NOT NULL,
  	"unit_price" numeric NOT NULL,
  	"currency" varchar DEFAULT 'USD'
  );
  
  CREATE TABLE "price_lists" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"name" varchar NOT NULL,
  	"kind" "enum_price_lists_kind" DEFAULT 'standard' NOT NULL,
  	"company_id" integer,
  	"valid_from" timestamp(3) with time zone,
  	"valid_to" timestamp(3) with time zone,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "quotes_lines" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"sku" varchar NOT NULL,
  	"variant_id" integer,
  	"quantity" numeric NOT NULL,
  	"unit_price" numeric NOT NULL
  );
  
  CREATE TABLE "quotes" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"quote_number" varchar NOT NULL,
  	"company_id" integer NOT NULL,
  	"status" "enum_quotes_status" DEFAULT 'draft' NOT NULL,
  	"expires_at" timestamp(3) with time zone NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "orders_lines" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"sku" varchar NOT NULL,
  	"variant_id" integer,
  	"quantity" numeric NOT NULL,
  	"unit_price" numeric NOT NULL
  );
  
  CREATE TABLE "orders" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order_number" varchar,
  	"company_id" integer NOT NULL,
  	"status" "enum_orders_status" DEFAULT 'draft' NOT NULL,
  	"po_number" varchar,
  	"quote_id" integer,
  	"idempotency_key" varchar,
  	"ship_to_name" varchar NOT NULL,
  	"ship_to_line1" varchar NOT NULL,
  	"ship_to_line2" varchar,
  	"ship_to_city" varchar NOT NULL,
  	"ship_to_state" varchar NOT NULL,
  	"ship_to_postal_code" varchar NOT NULL,
  	"ship_to_country" varchar DEFAULT 'US' NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "payload_kv" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"key" varchar NOT NULL,
  	"data" jsonb NOT NULL
  );
  
  CREATE TABLE "payload_locked_documents" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"global_slug" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "payload_locked_documents_rels" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer,
  	"parent_id" integer NOT NULL,
  	"path" varchar NOT NULL,
  	"companies_id" integer,
  	"users_id" integer,
  	"media_id" integer,
  	"products_id" integer,
  	"product_variants_id" integer,
  	"price_lists_id" integer,
  	"quotes_id" integer,
  	"orders_id" integer
  );
  
  CREATE TABLE "payload_preferences" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"key" varchar,
  	"value" jsonb,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "payload_preferences_rels" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer,
  	"parent_id" integer NOT NULL,
  	"path" varchar NOT NULL,
  	"users_id" integer
  );
  
  CREATE TABLE "payload_migrations" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"name" varchar,
  	"batch" numeric,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  ALTER TABLE "users_sessions" ADD CONSTRAINT "users_sessions_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "users" ADD CONSTRAINT "users_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "product_variants_images" ADD CONSTRAINT "product_variants_images_image_id_media_id_fk" FOREIGN KEY ("image_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "product_variants_images" ADD CONSTRAINT "product_variants_images_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."product_variants"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "product_variants" ADD CONSTRAINT "product_variants_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "product_variants" ADD CONSTRAINT "product_variants_spec_pdf_id_media_id_fk" FOREIGN KEY ("spec_pdf_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "product_variants" ADD CONSTRAINT "product_variants_install_pdf_id_media_id_fk" FOREIGN KEY ("install_pdf_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "price_lists_lines_quantity_breaks" ADD CONSTRAINT "price_lists_lines_quantity_breaks_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."price_lists_lines"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "price_lists_lines" ADD CONSTRAINT "price_lists_lines_variant_id_product_variants_id_fk" FOREIGN KEY ("variant_id") REFERENCES "public"."product_variants"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "price_lists_lines" ADD CONSTRAINT "price_lists_lines_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."price_lists"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "price_lists" ADD CONSTRAINT "price_lists_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "quotes_lines" ADD CONSTRAINT "quotes_lines_variant_id_product_variants_id_fk" FOREIGN KEY ("variant_id") REFERENCES "public"."product_variants"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "quotes_lines" ADD CONSTRAINT "quotes_lines_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."quotes"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "quotes" ADD CONSTRAINT "quotes_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "orders_lines" ADD CONSTRAINT "orders_lines_variant_id_product_variants_id_fk" FOREIGN KEY ("variant_id") REFERENCES "public"."product_variants"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "orders_lines" ADD CONSTRAINT "orders_lines_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "orders" ADD CONSTRAINT "orders_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "orders" ADD CONSTRAINT "orders_quote_id_quotes_id_fk" FOREIGN KEY ("quote_id") REFERENCES "public"."quotes"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."payload_locked_documents"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_companies_fk" FOREIGN KEY ("companies_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_users_fk" FOREIGN KEY ("users_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_media_fk" FOREIGN KEY ("media_id") REFERENCES "public"."media"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_products_fk" FOREIGN KEY ("products_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_product_variants_fk" FOREIGN KEY ("product_variants_id") REFERENCES "public"."product_variants"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_price_lists_fk" FOREIGN KEY ("price_lists_id") REFERENCES "public"."price_lists"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_quotes_fk" FOREIGN KEY ("quotes_id") REFERENCES "public"."quotes"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_orders_fk" FOREIGN KEY ("orders_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_preferences_rels" ADD CONSTRAINT "payload_preferences_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."payload_preferences"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_preferences_rels" ADD CONSTRAINT "payload_preferences_rels_users_fk" FOREIGN KEY ("users_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "companies_updated_at_idx" ON "companies" USING btree ("updated_at");
  CREATE INDEX "companies_created_at_idx" ON "companies" USING btree ("created_at");
  CREATE INDEX "users_sessions_order_idx" ON "users_sessions" USING btree ("_order");
  CREATE INDEX "users_sessions_parent_id_idx" ON "users_sessions" USING btree ("_parent_id");
  CREATE INDEX "users_company_idx" ON "users" USING btree ("company_id");
  CREATE INDEX "users_updated_at_idx" ON "users" USING btree ("updated_at");
  CREATE INDEX "users_created_at_idx" ON "users" USING btree ("created_at");
  CREATE UNIQUE INDEX "users_email_idx" ON "users" USING btree ("email");
  CREATE INDEX "media_updated_at_idx" ON "media" USING btree ("updated_at");
  CREATE INDEX "media_created_at_idx" ON "media" USING btree ("created_at");
  CREATE UNIQUE INDEX "media_filename_idx" ON "media" USING btree ("filename");
  CREATE UNIQUE INDEX "products_slug_idx" ON "products" USING btree ("slug");
  CREATE INDEX "products_updated_at_idx" ON "products" USING btree ("updated_at");
  CREATE INDEX "products_created_at_idx" ON "products" USING btree ("created_at");
  CREATE INDEX "product_variants_images_order_idx" ON "product_variants_images" USING btree ("_order");
  CREATE INDEX "product_variants_images_parent_id_idx" ON "product_variants_images" USING btree ("_parent_id");
  CREATE INDEX "product_variants_images_image_idx" ON "product_variants_images" USING btree ("image_id");
  CREATE UNIQUE INDEX "product_variants_sku_idx" ON "product_variants" USING btree ("sku");
  CREATE INDEX "product_variants_product_idx" ON "product_variants" USING btree ("product_id");
  CREATE INDEX "product_variants_spec_pdf_idx" ON "product_variants" USING btree ("spec_pdf_id");
  CREATE INDEX "product_variants_install_pdf_idx" ON "product_variants" USING btree ("install_pdf_id");
  CREATE INDEX "product_variants_updated_at_idx" ON "product_variants" USING btree ("updated_at");
  CREATE INDEX "product_variants_created_at_idx" ON "product_variants" USING btree ("created_at");
  CREATE INDEX "price_lists_lines_quantity_breaks_order_idx" ON "price_lists_lines_quantity_breaks" USING btree ("_order");
  CREATE INDEX "price_lists_lines_quantity_breaks_parent_id_idx" ON "price_lists_lines_quantity_breaks" USING btree ("_parent_id");
  CREATE INDEX "price_lists_lines_order_idx" ON "price_lists_lines" USING btree ("_order");
  CREATE INDEX "price_lists_lines_parent_id_idx" ON "price_lists_lines" USING btree ("_parent_id");
  CREATE INDEX "price_lists_lines_variant_idx" ON "price_lists_lines" USING btree ("variant_id");
  CREATE INDEX "price_lists_company_idx" ON "price_lists" USING btree ("company_id");
  CREATE INDEX "price_lists_updated_at_idx" ON "price_lists" USING btree ("updated_at");
  CREATE INDEX "price_lists_created_at_idx" ON "price_lists" USING btree ("created_at");
  CREATE INDEX "quotes_lines_order_idx" ON "quotes_lines" USING btree ("_order");
  CREATE INDEX "quotes_lines_parent_id_idx" ON "quotes_lines" USING btree ("_parent_id");
  CREATE INDEX "quotes_lines_variant_idx" ON "quotes_lines" USING btree ("variant_id");
  CREATE UNIQUE INDEX "quotes_quote_number_idx" ON "quotes" USING btree ("quote_number");
  CREATE INDEX "quotes_company_idx" ON "quotes" USING btree ("company_id");
  CREATE INDEX "quotes_updated_at_idx" ON "quotes" USING btree ("updated_at");
  CREATE INDEX "quotes_created_at_idx" ON "quotes" USING btree ("created_at");
  CREATE INDEX "orders_lines_order_idx" ON "orders_lines" USING btree ("_order");
  CREATE INDEX "orders_lines_parent_id_idx" ON "orders_lines" USING btree ("_parent_id");
  CREATE INDEX "orders_lines_variant_idx" ON "orders_lines" USING btree ("variant_id");
  CREATE UNIQUE INDEX "orders_order_number_idx" ON "orders" USING btree ("order_number");
  CREATE INDEX "orders_company_idx" ON "orders" USING btree ("company_id");
  CREATE INDEX "orders_quote_idx" ON "orders" USING btree ("quote_id");
  CREATE UNIQUE INDEX "orders_idempotency_key_idx" ON "orders" USING btree ("idempotency_key");
  CREATE INDEX "orders_updated_at_idx" ON "orders" USING btree ("updated_at");
  CREATE INDEX "orders_created_at_idx" ON "orders" USING btree ("created_at");
  CREATE UNIQUE INDEX "payload_kv_key_idx" ON "payload_kv" USING btree ("key");
  CREATE INDEX "payload_locked_documents_global_slug_idx" ON "payload_locked_documents" USING btree ("global_slug");
  CREATE INDEX "payload_locked_documents_updated_at_idx" ON "payload_locked_documents" USING btree ("updated_at");
  CREATE INDEX "payload_locked_documents_created_at_idx" ON "payload_locked_documents" USING btree ("created_at");
  CREATE INDEX "payload_locked_documents_rels_order_idx" ON "payload_locked_documents_rels" USING btree ("order");
  CREATE INDEX "payload_locked_documents_rels_parent_idx" ON "payload_locked_documents_rels" USING btree ("parent_id");
  CREATE INDEX "payload_locked_documents_rels_path_idx" ON "payload_locked_documents_rels" USING btree ("path");
  CREATE INDEX "payload_locked_documents_rels_companies_id_idx" ON "payload_locked_documents_rels" USING btree ("companies_id");
  CREATE INDEX "payload_locked_documents_rels_users_id_idx" ON "payload_locked_documents_rels" USING btree ("users_id");
  CREATE INDEX "payload_locked_documents_rels_media_id_idx" ON "payload_locked_documents_rels" USING btree ("media_id");
  CREATE INDEX "payload_locked_documents_rels_products_id_idx" ON "payload_locked_documents_rels" USING btree ("products_id");
  CREATE INDEX "payload_locked_documents_rels_product_variants_id_idx" ON "payload_locked_documents_rels" USING btree ("product_variants_id");
  CREATE INDEX "payload_locked_documents_rels_price_lists_id_idx" ON "payload_locked_documents_rels" USING btree ("price_lists_id");
  CREATE INDEX "payload_locked_documents_rels_quotes_id_idx" ON "payload_locked_documents_rels" USING btree ("quotes_id");
  CREATE INDEX "payload_locked_documents_rels_orders_id_idx" ON "payload_locked_documents_rels" USING btree ("orders_id");
  CREATE INDEX "payload_preferences_key_idx" ON "payload_preferences" USING btree ("key");
  CREATE INDEX "payload_preferences_updated_at_idx" ON "payload_preferences" USING btree ("updated_at");
  CREATE INDEX "payload_preferences_created_at_idx" ON "payload_preferences" USING btree ("created_at");
  CREATE INDEX "payload_preferences_rels_order_idx" ON "payload_preferences_rels" USING btree ("order");
  CREATE INDEX "payload_preferences_rels_parent_idx" ON "payload_preferences_rels" USING btree ("parent_id");
  CREATE INDEX "payload_preferences_rels_path_idx" ON "payload_preferences_rels" USING btree ("path");
  CREATE INDEX "payload_preferences_rels_users_id_idx" ON "payload_preferences_rels" USING btree ("users_id");
  CREATE INDEX "payload_migrations_updated_at_idx" ON "payload_migrations" USING btree ("updated_at");
  CREATE INDEX "payload_migrations_created_at_idx" ON "payload_migrations" USING btree ("created_at");`)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   DROP TABLE "companies" CASCADE;
  DROP TABLE "users_sessions" CASCADE;
  DROP TABLE "users" CASCADE;
  DROP TABLE "media" CASCADE;
  DROP TABLE "products" CASCADE;
  DROP TABLE "product_variants_images" CASCADE;
  DROP TABLE "product_variants" CASCADE;
  DROP TABLE "price_lists_lines_quantity_breaks" CASCADE;
  DROP TABLE "price_lists_lines" CASCADE;
  DROP TABLE "price_lists" CASCADE;
  DROP TABLE "quotes_lines" CASCADE;
  DROP TABLE "quotes" CASCADE;
  DROP TABLE "orders_lines" CASCADE;
  DROP TABLE "orders" CASCADE;
  DROP TABLE "payload_kv" CASCADE;
  DROP TABLE "payload_locked_documents" CASCADE;
  DROP TABLE "payload_locked_documents_rels" CASCADE;
  DROP TABLE "payload_preferences" CASCADE;
  DROP TABLE "payload_preferences_rels" CASCADE;
  DROP TABLE "payload_migrations" CASCADE;
  DROP TYPE "public"."enum_users_role";
  DROP TYPE "public"."enum_price_lists_kind";
  DROP TYPE "public"."enum_quotes_status";
  DROP TYPE "public"."enum_orders_status";`)
}
