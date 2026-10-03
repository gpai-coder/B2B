-- Preview-only hand-written migration (PR #17 first head). Test fixture only — not in src/migrations.
ALTER TABLE "product_variants"
  ADD COLUMN IF NOT EXISTS "moq" numeric DEFAULT 1 NOT NULL,
  ADD COLUMN IF NOT EXISTS "order_multiple" numeric DEFAULT 1 NOT NULL;

CREATE TABLE "carts_lines" (
  "_order" integer NOT NULL,
  "_parent_id" integer NOT NULL,
  "id" varchar PRIMARY KEY NOT NULL,
  "sku" varchar NOT NULL,
  "variant_id" integer,
  "quantity" numeric NOT NULL
);

CREATE TABLE "carts" (
  "id" serial PRIMARY KEY NOT NULL,
  "user_id" integer NOT NULL,
  "company_id" integer NOT NULL,
  "updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  "created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
);

ALTER TABLE "carts_lines" ADD CONSTRAINT "carts_lines_variant_id_product_variants_id_fk"
  FOREIGN KEY ("variant_id") REFERENCES "public"."product_variants"("id") ON DELETE set null ON UPDATE no action;
ALTER TABLE "carts_lines" ADD CONSTRAINT "carts_lines_parent_id_fk"
  FOREIGN KEY ("_parent_id") REFERENCES "public"."carts"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "carts" ADD CONSTRAINT "carts_user_id_users_id_fk"
  FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
ALTER TABLE "carts" ADD CONSTRAINT "carts_company_id_companies_id_fk"
  FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE set null ON UPDATE no action;

CREATE INDEX "carts_lines_order_idx" ON "carts_lines" USING btree ("_order");
CREATE INDEX "carts_lines_parent_id_idx" ON "carts_lines" USING btree ("_parent_id");
CREATE INDEX "carts_lines_variant_idx" ON "carts_lines" USING btree ("variant_id");
CREATE INDEX "carts_user_idx" ON "carts" USING btree ("user_id");
CREATE INDEX "carts_company_idx" ON "carts" USING btree ("company_id");
CREATE UNIQUE INDEX "carts_user_company_idx" ON "carts" USING btree ("user_id", "company_id");
CREATE INDEX "carts_updated_at_idx" ON "carts" USING btree ("updated_at");
CREATE INDEX "carts_created_at_idx" ON "carts" USING btree ("created_at");

ALTER TABLE "payload_locked_documents_rels" ADD COLUMN IF NOT EXISTS "carts_id" integer;
ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_carts_fk"
  FOREIGN KEY ("carts_id") REFERENCES "public"."carts"("id") ON DELETE cascade ON UPDATE no action;
