SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;
COMMENT ON SCHEMA "public" IS 'standard public schema';
CREATE EXTENSION IF NOT EXISTS "pg_graphql" WITH SCHEMA "graphql";
CREATE EXTENSION IF NOT EXISTS "pg_stat_statements" WITH SCHEMA "extensions";
CREATE EXTENSION IF NOT EXISTS "pgcrypto" WITH SCHEMA "extensions";
CREATE EXTENSION IF NOT EXISTS "supabase_vault" WITH SCHEMA "vault";
CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA "extensions";
CREATE OR REPLACE FUNCTION "public"."can_access_client"("p_client_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE
    AS $$
  select
    public.is_admin()
    or exists (
      select 1
      from public.client_users cu
      where cu.client_id = p_client_id
        and cu.user_id = auth.uid()
        and cu.status = 'active'
    )
    or exists (
      select 1
      from public.client_staff cs
      where cs.client_id = p_client_id
        and cs.user_id = auth.uid()
        and cs.status = 'active'
    );
$$;
ALTER FUNCTION "public"."can_access_client"("p_client_id" "uuid") OWNER TO "postgres";
CREATE OR REPLACE FUNCTION "public"."can_manage_client"("p_client_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE
    AS $$
  select
    public.is_admin()
    or exists (
      select 1
      from public.client_staff cs
      where cs.client_id = p_client_id
        and cs.user_id = auth.uid()
        and cs.status = 'active'
        and cs.staff_role in ('manager')
    );
$$;
ALTER FUNCTION "public"."can_manage_client"("p_client_id" "uuid") OWNER TO "postgres";
CREATE OR REPLACE FUNCTION "public"."handle_new_auth_user"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  insert into public.profiles (user_id, email, full_name, role)
  values (new.id, new.email, null, 'client')
  on conflict (user_id) do update
    set email = excluded.email;

  return new;
end;
$$;
ALTER FUNCTION "public"."handle_new_auth_user"() OWNER TO "postgres";
CREATE OR REPLACE FUNCTION "public"."is_admin"() RETURNS boolean
    LANGUAGE "sql" STABLE
    AS $$
  select exists (
    select 1
    from public.profiles p
    where p.user_id = auth.uid()
      and p.role = 'admin'
  );
$$;
ALTER FUNCTION "public"."is_admin"() OWNER TO "postgres";
CREATE OR REPLACE FUNCTION "public"."path_client_id"("p_name" "text") RETURNS "uuid"
    LANGUAGE "sql" STABLE
    AS $_$
  select
    case
      when split_part(p_name, '/', 2) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      then split_part(p_name, '/', 2)::uuid
      else null
    end;
$_$;
ALTER FUNCTION "public"."path_client_id"("p_name" "text") OWNER TO "postgres";
CREATE OR REPLACE FUNCTION "public"."prevent_role_update"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
declare
  jwt_role text;
  actor_is_admin boolean;
begin
  if new.role is distinct from old.role then
    -- Allow service role updates (Edge Functions / admin backend)
    jwt_role := (current_setting('request.jwt.claims', true)::jsonb ->> 'role');
    if jwt_role = 'service_role' then
      return new;
    end if;

    -- Allow admins to change OTHER users, but not self
    actor_is_admin := public.is_admin();
    if actor_is_admin and auth.uid() is not null and auth.uid() <> old.user_id then
      return new;
    end if;

    raise exception 'Role changes are not allowed';
  end if;

  return new;
end;
$$;
ALTER FUNCTION "public"."prevent_role_update"() OWNER TO "postgres";
CREATE OR REPLACE FUNCTION "public"."set_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
begin
  new.updated_at = now();
  return new;
end;
$$;
ALTER FUNCTION "public"."set_updated_at"() OWNER TO "postgres";
SET default_tablespace = '';
SET default_table_access_method = "heap";
CREATE TABLE IF NOT EXISTS "public"."audit_logs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "client_id" "uuid",
    "action" "text" NOT NULL,
    "target_type" "text",
    "target_id" "text",
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "actor_id" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);
ALTER TABLE "public"."audit_logs" OWNER TO "postgres";
CREATE TABLE IF NOT EXISTS "public"."billing_customers" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "client_id" "uuid" NOT NULL,
    "stripe_customer_id" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);
ALTER TABLE "public"."billing_customers" OWNER TO "postgres";
CREATE TABLE IF NOT EXISTS "public"."billing_one_time_payments" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "client_id" "uuid" NOT NULL,
    "stripe_payment_intent_id" "text",
    "stripe_checkout_session_id" "text",
    "amount" bigint,
    "currency" "text",
    "status" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);
ALTER TABLE "public"."billing_one_time_payments" OWNER TO "postgres";
CREATE TABLE IF NOT EXISTS "public"."billing_subscriptions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "client_id" "uuid" NOT NULL,
    "stripe_subscription_id" "text" NOT NULL,
    "status" "text" NOT NULL,
    "current_period_start" timestamp with time zone,
    "current_period_end" timestamp with time zone,
    "cancel_at_period_end" boolean DEFAULT false NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);
ALTER TABLE "public"."billing_subscriptions" OWNER TO "postgres";
CREATE TABLE IF NOT EXISTS "public"."client_staff" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "client_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "staff_role" "text" DEFAULT 'agent'::"text" NOT NULL,
    "status" "text" DEFAULT 'active'::"text" NOT NULL,
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "client_staff_staff_role_check" CHECK (("staff_role" = ANY (ARRAY['agent'::"text", 'manager'::"text"]))),
    CONSTRAINT "client_staff_status_check" CHECK (("status" = ANY (ARRAY['active'::"text", 'disabled'::"text"])))
);
ALTER TABLE "public"."client_staff" OWNER TO "postgres";
CREATE TABLE IF NOT EXISTS "public"."client_users" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "client_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "status" "text" DEFAULT 'active'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "client_users_status_check" CHECK (("status" = ANY (ARRAY['active'::"text", 'disabled'::"text"])))
);
ALTER TABLE "public"."client_users" OWNER TO "postgres";
CREATE TABLE IF NOT EXISTS "public"."clients" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "status" "text" DEFAULT 'active'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "clients_status_check" CHECK (("status" = ANY (ARRAY['active'::"text", 'archived'::"text"])))
);
ALTER TABLE "public"."clients" OWNER TO "postgres";
CREATE TABLE IF NOT EXISTS "public"."document_extractions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "client_id" "uuid" NOT NULL,
    "object_path" "text" NOT NULL,
    "status" "text" DEFAULT 'queued'::"text" NOT NULL,
    "extracted_text" "text",
    "data" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "model" "text",
    "error" "text",
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "template_id" "uuid",
    CONSTRAINT "document_extractions_status_check" CHECK (("status" = ANY (ARRAY['queued'::"text", 'processing'::"text", 'succeeded'::"text", 'failed'::"text"])))
);
ALTER TABLE "public"."document_extractions" OWNER TO "postgres";
CREATE TABLE IF NOT EXISTS "public"."document_job_items" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "job_id" "uuid" NOT NULL,
    "client_id" "uuid" NOT NULL,
    "object_path" "text" NOT NULL,
    "status" "text" DEFAULT 'queued'::"text" NOT NULL,
    "error" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "document_job_items_status_check" CHECK (("status" = ANY (ARRAY['queued'::"text", 'processing'::"text", 'succeeded'::"text", 'failed'::"text"])))
);
ALTER TABLE "public"."document_job_items" OWNER TO "postgres";
CREATE TABLE IF NOT EXISTS "public"."document_jobs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "client_id" "uuid" NOT NULL,
    "template_id" "uuid",
    "status" "text" DEFAULT 'queued'::"text" NOT NULL,
    "total_count" integer DEFAULT 0 NOT NULL,
    "processed_count" integer DEFAULT 0 NOT NULL,
    "error" "text",
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "document_jobs_status_check" CHECK (("status" = ANY (ARRAY['queued'::"text", 'processing'::"text", 'succeeded'::"text", 'failed'::"text"])))
);
ALTER TABLE "public"."document_jobs" OWNER TO "postgres";
CREATE TABLE IF NOT EXISTS "public"."document_templates" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "client_id" "uuid",
    "name" "text" NOT NULL,
    "description" "text",
    "prompt" "text" NOT NULL,
    "schema" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);
ALTER TABLE "public"."document_templates" OWNER TO "postgres";
CREATE TABLE IF NOT EXISTS "public"."healthcheck" (
    "id" bigint NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"()
);
ALTER TABLE "public"."healthcheck" OWNER TO "postgres";
ALTER TABLE "public"."healthcheck" ALTER COLUMN "id" ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME "public"."healthcheck_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);
CREATE TABLE IF NOT EXISTS "public"."profiles" (
    "user_id" "uuid" NOT NULL,
    "email" "text",
    "full_name" "text",
    "role" "text" DEFAULT 'client'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "profiles_role_check" CHECK (("role" = ANY (ARRAY['admin'::"text", 'user'::"text", 'sales'::"text", 'partner'::"text", 'client'::"text"])))
);
ALTER TABLE "public"."profiles" OWNER TO "postgres";
CREATE TABLE IF NOT EXISTS "public"."rate_limits" (
    "user_id" "uuid" NOT NULL,
    "cnt" integer DEFAULT 0 NOT NULL,
    "last_at" timestamp with time zone DEFAULT "now"()
);
ALTER TABLE "public"."rate_limits" OWNER TO "postgres";
CREATE TABLE IF NOT EXISTS "public"."stripe_events" (
    "id" "text" NOT NULL,
    "type" "text" NOT NULL,
    "received_at" timestamp with time zone DEFAULT "now"() NOT NULL
);
ALTER TABLE "public"."stripe_events" OWNER TO "postgres";
CREATE TABLE IF NOT EXISTS "public"."stripe_plans" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "stripe_product_id" "text",
    "stripe_price_id" "text",
    "amount" integer DEFAULT 0 NOT NULL,
    "currency" "text" DEFAULT 'usd'::"text" NOT NULL,
    "interval" "text" DEFAULT 'month'::"text" NOT NULL,
    "active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "stripe_plans_interval_check" CHECK (("interval" = ANY (ARRAY['month'::"text", 'year'::"text"])))
);
ALTER TABLE "public"."stripe_plans" OWNER TO "postgres";
CREATE TABLE IF NOT EXISTS "public"."stripe_webhook_failures" (
    "id" bigint NOT NULL,
    "event_id" "text",
    "type" "text",
    "error" "text" NOT NULL,
    "payload" "jsonb",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);
ALTER TABLE "public"."stripe_webhook_failures" OWNER TO "postgres";
CREATE SEQUENCE IF NOT EXISTS "public"."stripe_webhook_failures_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;
ALTER SEQUENCE "public"."stripe_webhook_failures_id_seq" OWNER TO "postgres";
ALTER SEQUENCE "public"."stripe_webhook_failures_id_seq" OWNED BY "public"."stripe_webhook_failures"."id";
ALTER TABLE ONLY "public"."stripe_webhook_failures" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."stripe_webhook_failures_id_seq"'::"regclass");
ALTER TABLE ONLY "public"."audit_logs"
    ADD CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id");
ALTER TABLE ONLY "public"."billing_customers"
    ADD CONSTRAINT "billing_customers_pkey" PRIMARY KEY ("id");
ALTER TABLE ONLY "public"."billing_customers"
    ADD CONSTRAINT "billing_customers_stripe_customer_id_key" UNIQUE ("stripe_customer_id");
ALTER TABLE ONLY "public"."billing_one_time_payments"
    ADD CONSTRAINT "billing_one_time_payments_pkey" PRIMARY KEY ("id");
ALTER TABLE ONLY "public"."billing_one_time_payments"
    ADD CONSTRAINT "billing_one_time_payments_stripe_checkout_session_id_key" UNIQUE ("stripe_checkout_session_id");
ALTER TABLE ONLY "public"."billing_one_time_payments"
    ADD CONSTRAINT "billing_one_time_payments_stripe_payment_intent_id_key" UNIQUE ("stripe_payment_intent_id");
ALTER TABLE ONLY "public"."billing_subscriptions"
    ADD CONSTRAINT "billing_subscriptions_pkey" PRIMARY KEY ("id");
ALTER TABLE ONLY "public"."billing_subscriptions"
    ADD CONSTRAINT "billing_subscriptions_stripe_subscription_id_key" UNIQUE ("stripe_subscription_id");
ALTER TABLE ONLY "public"."client_staff"
    ADD CONSTRAINT "client_staff_client_id_user_id_key" UNIQUE ("client_id", "user_id");
ALTER TABLE ONLY "public"."client_staff"
    ADD CONSTRAINT "client_staff_pkey" PRIMARY KEY ("id");
ALTER TABLE ONLY "public"."client_users"
    ADD CONSTRAINT "client_users_client_id_user_id_key" UNIQUE ("client_id", "user_id");
ALTER TABLE ONLY "public"."client_users"
    ADD CONSTRAINT "client_users_pkey" PRIMARY KEY ("id");
ALTER TABLE ONLY "public"."clients"
    ADD CONSTRAINT "clients_pkey" PRIMARY KEY ("id");
ALTER TABLE ONLY "public"."document_extractions"
    ADD CONSTRAINT "document_extractions_pkey" PRIMARY KEY ("id");
ALTER TABLE ONLY "public"."document_job_items"
    ADD CONSTRAINT "document_job_items_job_id_object_path_key" UNIQUE ("job_id", "object_path");
ALTER TABLE ONLY "public"."document_job_items"
    ADD CONSTRAINT "document_job_items_pkey" PRIMARY KEY ("id");
ALTER TABLE ONLY "public"."document_jobs"
    ADD CONSTRAINT "document_jobs_pkey" PRIMARY KEY ("id");
ALTER TABLE ONLY "public"."document_templates"
    ADD CONSTRAINT "document_templates_pkey" PRIMARY KEY ("id");
ALTER TABLE ONLY "public"."healthcheck"
    ADD CONSTRAINT "healthcheck_pkey" PRIMARY KEY ("id");
ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_pkey" PRIMARY KEY ("user_id");
ALTER TABLE ONLY "public"."rate_limits"
    ADD CONSTRAINT "rate_limits_pkey" PRIMARY KEY ("user_id");
ALTER TABLE ONLY "public"."stripe_events"
    ADD CONSTRAINT "stripe_events_pkey" PRIMARY KEY ("id");
ALTER TABLE ONLY "public"."stripe_plans"
    ADD CONSTRAINT "stripe_plans_name_key" UNIQUE ("name");
ALTER TABLE ONLY "public"."stripe_plans"
    ADD CONSTRAINT "stripe_plans_pkey" PRIMARY KEY ("id");
ALTER TABLE ONLY "public"."stripe_webhook_failures"
    ADD CONSTRAINT "stripe_webhook_failures_pkey" PRIMARY KEY ("id");
CREATE INDEX "idx_audit_logs_actor" ON "public"."audit_logs" USING "btree" ("actor_id", "created_at" DESC);
CREATE INDEX "idx_audit_logs_client_created" ON "public"."audit_logs" USING "btree" ("client_id", "created_at" DESC);
CREATE INDEX "idx_billing_customers_client" ON "public"."billing_customers" USING "btree" ("client_id");
CREATE INDEX "idx_billing_one_time_client" ON "public"."billing_one_time_payments" USING "btree" ("client_id");
CREATE INDEX "idx_billing_subscriptions_client" ON "public"."billing_subscriptions" USING "btree" ("client_id");
CREATE INDEX "idx_client_staff_client" ON "public"."client_staff" USING "btree" ("client_id", "status");
CREATE INDEX "idx_client_staff_user" ON "public"."client_staff" USING "btree" ("user_id", "status");
CREATE INDEX "idx_client_users_client" ON "public"."client_users" USING "btree" ("client_id");
CREATE INDEX "idx_client_users_user" ON "public"."client_users" USING "btree" ("user_id");
CREATE INDEX "idx_document_extractions_client_created" ON "public"."document_extractions" USING "btree" ("client_id", "created_at" DESC);
CREATE INDEX "idx_document_extractions_client_path" ON "public"."document_extractions" USING "btree" ("client_id", "object_path");
CREATE INDEX "idx_document_extractions_template" ON "public"."document_extractions" USING "btree" ("template_id");
CREATE INDEX "idx_document_job_items_job" ON "public"."document_job_items" USING "btree" ("job_id", "created_at" DESC);
CREATE INDEX "idx_document_jobs_client_created" ON "public"."document_jobs" USING "btree" ("client_id", "created_at" DESC);
CREATE UNIQUE INDEX "idx_document_templates_client_name" ON "public"."document_templates" USING "btree" ("client_id", "name");
CREATE UNIQUE INDEX "idx_document_templates_global_name" ON "public"."document_templates" USING "btree" ("name") WHERE ("client_id" IS NULL);
CREATE INDEX "idx_stripe_plans_price" ON "public"."stripe_plans" USING "btree" ("stripe_price_id");
CREATE INDEX "idx_stripe_webhook_failures_created" ON "public"."stripe_webhook_failures" USING "btree" ("created_at" DESC);
CREATE OR REPLACE TRIGGER "trg_billing_subscriptions_updated_at" BEFORE UPDATE ON "public"."billing_subscriptions" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();
CREATE OR REPLACE TRIGGER "trg_client_staff_updated_at" BEFORE UPDATE ON "public"."client_staff" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();
CREATE OR REPLACE TRIGGER "trg_clients_updated_at" BEFORE UPDATE ON "public"."clients" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();
CREATE OR REPLACE TRIGGER "trg_document_job_items_updated_at" BEFORE UPDATE ON "public"."document_job_items" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();
CREATE OR REPLACE TRIGGER "trg_document_jobs_updated_at" BEFORE UPDATE ON "public"."document_jobs" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();
CREATE OR REPLACE TRIGGER "trg_document_templates_updated_at" BEFORE UPDATE ON "public"."document_templates" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();
CREATE OR REPLACE TRIGGER "trg_prevent_role_update" BEFORE UPDATE OF "role" ON "public"."profiles" FOR EACH ROW EXECUTE FUNCTION "public"."prevent_role_update"();
CREATE OR REPLACE TRIGGER "trg_profiles_updated_at" BEFORE UPDATE ON "public"."profiles" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();
CREATE OR REPLACE TRIGGER "trg_stripe_plans_updated_at" BEFORE UPDATE ON "public"."stripe_plans" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();
ALTER TABLE ONLY "public"."audit_logs"
    ADD CONSTRAINT "audit_logs_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "auth"."users"("id") ON DELETE SET NULL;
ALTER TABLE ONLY "public"."audit_logs"
    ADD CONSTRAINT "audit_logs_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE CASCADE;
ALTER TABLE ONLY "public"."billing_customers"
    ADD CONSTRAINT "billing_customers_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE CASCADE;
ALTER TABLE ONLY "public"."billing_one_time_payments"
    ADD CONSTRAINT "billing_one_time_payments_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE CASCADE;
ALTER TABLE ONLY "public"."billing_subscriptions"
    ADD CONSTRAINT "billing_subscriptions_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE CASCADE;
ALTER TABLE ONLY "public"."client_staff"
    ADD CONSTRAINT "client_staff_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE CASCADE;
ALTER TABLE ONLY "public"."client_staff"
    ADD CONSTRAINT "client_staff_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;
ALTER TABLE ONLY "public"."client_staff"
    ADD CONSTRAINT "client_staff_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;
ALTER TABLE ONLY "public"."client_users"
    ADD CONSTRAINT "client_users_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE CASCADE;
ALTER TABLE ONLY "public"."client_users"
    ADD CONSTRAINT "client_users_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;
ALTER TABLE ONLY "public"."document_extractions"
    ADD CONSTRAINT "document_extractions_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE CASCADE;
ALTER TABLE ONLY "public"."document_extractions"
    ADD CONSTRAINT "document_extractions_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;
ALTER TABLE ONLY "public"."document_extractions"
    ADD CONSTRAINT "document_extractions_template_id_fkey" FOREIGN KEY ("template_id") REFERENCES "public"."document_templates"("id");
ALTER TABLE ONLY "public"."document_job_items"
    ADD CONSTRAINT "document_job_items_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE CASCADE;
ALTER TABLE ONLY "public"."document_job_items"
    ADD CONSTRAINT "document_job_items_job_id_fkey" FOREIGN KEY ("job_id") REFERENCES "public"."document_jobs"("id") ON DELETE CASCADE;
ALTER TABLE ONLY "public"."document_jobs"
    ADD CONSTRAINT "document_jobs_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE CASCADE;
ALTER TABLE ONLY "public"."document_jobs"
    ADD CONSTRAINT "document_jobs_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;
ALTER TABLE ONLY "public"."document_jobs"
    ADD CONSTRAINT "document_jobs_template_id_fkey" FOREIGN KEY ("template_id") REFERENCES "public"."document_templates"("id");
ALTER TABLE ONLY "public"."document_templates"
    ADD CONSTRAINT "document_templates_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE CASCADE;
ALTER TABLE ONLY "public"."document_templates"
    ADD CONSTRAINT "document_templates_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;
ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;
ALTER TABLE "public"."audit_logs" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "audit_logs_insert_accessible" ON "public"."audit_logs" FOR INSERT TO "authenticated" WITH CHECK (((("client_id" IS NULL) AND "public"."is_admin"() AND ("actor_id" = "auth"."uid"())) OR (("client_id" IS NOT NULL) AND "public"."can_access_client"("client_id") AND ("actor_id" = "auth"."uid"()))));
CREATE POLICY "audit_logs_select_accessible" ON "public"."audit_logs" FOR SELECT TO "authenticated" USING ((("client_id" IS NULL) OR "public"."can_access_client"("client_id")));
ALTER TABLE "public"."billing_customers" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "billing_customers_select_accessible" ON "public"."billing_customers" FOR SELECT TO "authenticated" USING ("public"."can_access_client"("client_id"));
ALTER TABLE "public"."billing_one_time_payments" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "billing_one_time_select_accessible" ON "public"."billing_one_time_payments" FOR SELECT TO "authenticated" USING ("public"."can_access_client"("client_id"));
ALTER TABLE "public"."billing_subscriptions" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "billing_subscriptions_select_accessible" ON "public"."billing_subscriptions" FOR SELECT TO "authenticated" USING ("public"."can_access_client"("client_id"));
ALTER TABLE "public"."client_staff" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "client_staff_select_admin_only" ON "public"."client_staff" FOR SELECT TO "authenticated" USING ("public"."is_admin"());
CREATE POLICY "client_staff_write_admin_only" ON "public"."client_staff" TO "authenticated" USING ("public"."is_admin"()) WITH CHECK ("public"."is_admin"());
ALTER TABLE "public"."client_users" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "client_users_select_accessible" ON "public"."client_users" FOR SELECT TO "authenticated" USING ("public"."can_access_client"("client_id"));
CREATE POLICY "client_users_write_admin_only" ON "public"."client_users" TO "authenticated" USING ("public"."is_admin"()) WITH CHECK ("public"."is_admin"());
ALTER TABLE "public"."clients" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "clients_insert_admin_only" ON "public"."clients" FOR INSERT TO "authenticated" WITH CHECK ("public"."is_admin"());
CREATE POLICY "clients_select_accessible" ON "public"."clients" FOR SELECT TO "authenticated" USING ("public"."can_access_client"("id"));
CREATE POLICY "clients_update_admin_only" ON "public"."clients" FOR UPDATE TO "authenticated" USING ("public"."is_admin"()) WITH CHECK ("public"."is_admin"());
ALTER TABLE "public"."document_extractions" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "document_extractions_select_accessible" ON "public"."document_extractions" FOR SELECT TO "authenticated" USING ("public"."can_access_client"("client_id"));
ALTER TABLE "public"."document_job_items" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "document_job_items_insert_accessible" ON "public"."document_job_items" FOR INSERT TO "authenticated" WITH CHECK ("public"."can_access_client"("client_id"));
CREATE POLICY "document_job_items_select_accessible" ON "public"."document_job_items" FOR SELECT TO "authenticated" USING ("public"."can_access_client"("client_id"));
ALTER TABLE "public"."document_jobs" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "document_jobs_insert_accessible" ON "public"."document_jobs" FOR INSERT TO "authenticated" WITH CHECK ("public"."can_access_client"("client_id"));
CREATE POLICY "document_jobs_select_accessible" ON "public"."document_jobs" FOR SELECT TO "authenticated" USING ("public"."can_access_client"("client_id"));
ALTER TABLE "public"."document_templates" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "document_templates_delete_manage" ON "public"."document_templates" FOR DELETE TO "authenticated" USING (((("client_id" IS NULL) AND "public"."is_admin"()) OR (("client_id" IS NOT NULL) AND "public"."can_manage_client"("client_id"))));
CREATE POLICY "document_templates_insert_manage" ON "public"."document_templates" FOR INSERT TO "authenticated" WITH CHECK (((("client_id" IS NULL) AND "public"."is_admin"()) OR (("client_id" IS NOT NULL) AND "public"."can_manage_client"("client_id"))));
CREATE POLICY "document_templates_select_accessible" ON "public"."document_templates" FOR SELECT TO "authenticated" USING ((("client_id" IS NULL) OR "public"."can_access_client"("client_id")));
CREATE POLICY "document_templates_update_manage" ON "public"."document_templates" FOR UPDATE TO "authenticated" USING (((("client_id" IS NULL) AND "public"."is_admin"()) OR (("client_id" IS NOT NULL) AND "public"."can_manage_client"("client_id")))) WITH CHECK (((("client_id" IS NULL) AND "public"."is_admin"()) OR (("client_id" IS NOT NULL) AND "public"."can_manage_client"("client_id"))));
ALTER TABLE "public"."profiles" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "profiles_select_own_or_admin" ON "public"."profiles" FOR SELECT TO "authenticated" USING ((("user_id" = "auth"."uid"()) OR "public"."is_admin"()));
CREATE POLICY "profiles_update_own" ON "public"."profiles" FOR UPDATE TO "authenticated" USING (("user_id" = "auth"."uid"())) WITH CHECK (("user_id" = "auth"."uid"()));
ALTER TABLE "public"."stripe_events" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "stripe_events_admin_only" ON "public"."stripe_events" FOR SELECT TO "authenticated" USING ("public"."is_admin"());
CREATE POLICY "stripe_failures_admin_only" ON "public"."stripe_webhook_failures" FOR SELECT TO "authenticated" USING ("public"."is_admin"());
ALTER TABLE "public"."stripe_plans" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "stripe_plans_admin_write" ON "public"."stripe_plans" TO "authenticated" USING ("public"."is_admin"()) WITH CHECK ("public"."is_admin"());
CREATE POLICY "stripe_plans_select_all" ON "public"."stripe_plans" FOR SELECT TO "authenticated" USING (true);
ALTER TABLE "public"."stripe_webhook_failures" ENABLE ROW LEVEL SECURITY;
ALTER PUBLICATION "supabase_realtime" OWNER TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";
GRANT ALL ON FUNCTION "public"."can_access_client"("p_client_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."can_access_client"("p_client_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."can_access_client"("p_client_id" "uuid") TO "service_role";
GRANT ALL ON FUNCTION "public"."can_manage_client"("p_client_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."can_manage_client"("p_client_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."can_manage_client"("p_client_id" "uuid") TO "service_role";
GRANT ALL ON FUNCTION "public"."handle_new_auth_user"() TO "anon";
GRANT ALL ON FUNCTION "public"."handle_new_auth_user"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."handle_new_auth_user"() TO "service_role";
GRANT ALL ON FUNCTION "public"."is_admin"() TO "anon";
GRANT ALL ON FUNCTION "public"."is_admin"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_admin"() TO "service_role";
GRANT ALL ON FUNCTION "public"."path_client_id"("p_name" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."path_client_id"("p_name" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."path_client_id"("p_name" "text") TO "service_role";
GRANT ALL ON FUNCTION "public"."prevent_role_update"() TO "anon";
GRANT ALL ON FUNCTION "public"."prevent_role_update"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."prevent_role_update"() TO "service_role";
GRANT ALL ON FUNCTION "public"."set_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."set_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_updated_at"() TO "service_role";
GRANT ALL ON TABLE "public"."audit_logs" TO "anon";
GRANT ALL ON TABLE "public"."audit_logs" TO "authenticated";
GRANT ALL ON TABLE "public"."audit_logs" TO "service_role";
GRANT ALL ON TABLE "public"."billing_customers" TO "anon";
GRANT ALL ON TABLE "public"."billing_customers" TO "authenticated";
GRANT ALL ON TABLE "public"."billing_customers" TO "service_role";
GRANT ALL ON TABLE "public"."billing_one_time_payments" TO "anon";
GRANT ALL ON TABLE "public"."billing_one_time_payments" TO "authenticated";
GRANT ALL ON TABLE "public"."billing_one_time_payments" TO "service_role";
GRANT ALL ON TABLE "public"."billing_subscriptions" TO "anon";
GRANT ALL ON TABLE "public"."billing_subscriptions" TO "authenticated";
GRANT ALL ON TABLE "public"."billing_subscriptions" TO "service_role";
GRANT ALL ON TABLE "public"."client_staff" TO "anon";
GRANT ALL ON TABLE "public"."client_staff" TO "authenticated";
GRANT ALL ON TABLE "public"."client_staff" TO "service_role";
GRANT ALL ON TABLE "public"."client_users" TO "anon";
GRANT ALL ON TABLE "public"."client_users" TO "authenticated";
GRANT ALL ON TABLE "public"."client_users" TO "service_role";
GRANT ALL ON TABLE "public"."clients" TO "anon";
GRANT ALL ON TABLE "public"."clients" TO "authenticated";
GRANT ALL ON TABLE "public"."clients" TO "service_role";
GRANT ALL ON TABLE "public"."document_extractions" TO "anon";
GRANT ALL ON TABLE "public"."document_extractions" TO "authenticated";
GRANT ALL ON TABLE "public"."document_extractions" TO "service_role";
GRANT ALL ON TABLE "public"."document_job_items" TO "anon";
GRANT ALL ON TABLE "public"."document_job_items" TO "authenticated";
GRANT ALL ON TABLE "public"."document_job_items" TO "service_role";
GRANT ALL ON TABLE "public"."document_jobs" TO "anon";
GRANT ALL ON TABLE "public"."document_jobs" TO "authenticated";
GRANT ALL ON TABLE "public"."document_jobs" TO "service_role";
GRANT ALL ON TABLE "public"."document_templates" TO "anon";
GRANT ALL ON TABLE "public"."document_templates" TO "authenticated";
GRANT ALL ON TABLE "public"."document_templates" TO "service_role";
GRANT ALL ON TABLE "public"."healthcheck" TO "anon";
GRANT ALL ON TABLE "public"."healthcheck" TO "authenticated";
GRANT ALL ON TABLE "public"."healthcheck" TO "service_role";
GRANT ALL ON SEQUENCE "public"."healthcheck_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."healthcheck_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."healthcheck_id_seq" TO "service_role";
GRANT ALL ON TABLE "public"."profiles" TO "anon";
GRANT ALL ON TABLE "public"."profiles" TO "authenticated";
GRANT ALL ON TABLE "public"."profiles" TO "service_role";
GRANT ALL ON TABLE "public"."rate_limits" TO "anon";
GRANT ALL ON TABLE "public"."rate_limits" TO "authenticated";
GRANT ALL ON TABLE "public"."rate_limits" TO "service_role";
GRANT ALL ON TABLE "public"."stripe_events" TO "anon";
GRANT ALL ON TABLE "public"."stripe_events" TO "authenticated";
GRANT ALL ON TABLE "public"."stripe_events" TO "service_role";
GRANT ALL ON TABLE "public"."stripe_plans" TO "anon";
GRANT ALL ON TABLE "public"."stripe_plans" TO "authenticated";
GRANT ALL ON TABLE "public"."stripe_plans" TO "service_role";
GRANT ALL ON TABLE "public"."stripe_webhook_failures" TO "anon";
GRANT ALL ON TABLE "public"."stripe_webhook_failures" TO "authenticated";
GRANT ALL ON TABLE "public"."stripe_webhook_failures" TO "service_role";
GRANT ALL ON SEQUENCE "public"."stripe_webhook_failures_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."stripe_webhook_failures_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."stripe_webhook_failures_id_seq" TO "service_role";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";
drop extension if exists "pg_net";
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_auth_user();
