create extension if not exists "pg_cron" with schema "pg_catalog";
create schema if not exists "util";
create extension if not exists "pg_net" with schema "public";
create sequence "public"."inbox_notes_id_seq";
create sequence "public"."rate_limits_id_seq";
create sequence "public"."twilio_webhook_failures_id_seq";
drop policy "client_staff_select_admin_only" on "public"."client_staff";
alter table "public"."rate_limits" drop constraint "rate_limits_pkey";
drop index if exists "public"."rate_limits_pkey";
create table "public"."accounts" (
    "id" uuid not null default gen_random_uuid(),
    "client_id" uuid not null,
    "name" text not null,
    "status" text not null default 'active'::text,
    "industry" text,
    "website" text,
    "phone" text,
    "owner_user_id" uuid,
    "created_by" uuid,
    "created_at" timestamp with time zone not null default now(),
    "updated_at" timestamp with time zone not null default now()
      );
alter table "public"."accounts" enable row level security;
create table "public"."activities" (
    "id" uuid not null default gen_random_uuid(),
    "client_id" uuid not null,
    "actor_user_id" uuid,
    "source" text not null,
    "type" text not null,
    "summary" text not null,
    "metadata" jsonb not null default '{}'::jsonb,
    "created_at" timestamp with time zone not null default now()
      );
alter table "public"."activities" enable row level security;
create table "public"."call_events" (
    "id" uuid not null default gen_random_uuid(),
    "client_id" uuid not null,
    "call_id" uuid,
    "event_type" text not null,
    "payload" jsonb not null default '{}'::jsonb,
    "created_at" timestamp with time zone not null default now()
      );
alter table "public"."call_events" enable row level security;
create table "public"."call_logs" (
    "id" uuid not null default gen_random_uuid(),
    "client_id" uuid not null,
    "contact_id" uuid,
    "agent_user_id" uuid,
    "provider" text not null,
    "direction" text not null default 'outbound'::text,
    "dialed_number" text not null,
    "duration_seconds" integer,
    "outcome" text,
    "notes" text,
    "created_at" timestamp with time zone not null default now()
      );
alter table "public"."call_logs" enable row level security;
create table "public"."call_recordings" (
    "id" uuid not null default gen_random_uuid(),
    "client_id" uuid not null,
    "call_id" uuid,
    "provider_recording_sid" text,
    "recording_url" text,
    "created_at" timestamp with time zone not null default now()
      );
alter table "public"."call_recordings" enable row level security;
create table "public"."calls" (
    "id" uuid not null default gen_random_uuid(),
    "client_id" uuid not null,
    "contact_id" uuid,
    "from_e164" text,
    "to_e164" text,
    "direction" text,
    "status_group" text not null default 'open'::text,
    "assigned_to" uuid,
    "last_event_at" timestamp with time zone,
    "last_inbound_at" timestamp with time zone,
    "unread_count" integer not null default 0,
    "priority" text not null default 'normal'::text,
    "provider_call_sid" text,
    "created_at" timestamp with time zone not null default now(),
    "updated_at" timestamp with time zone not null default now()
      );
alter table "public"."calls" enable row level security;
create table "public"."client_phone_numbers" (
    "id" uuid not null default gen_random_uuid(),
    "client_id" uuid not null,
    "phone_e164" text not null,
    "channel" text not null default 'sms'::text,
    "created_at" timestamp with time zone not null default now(),
    "updated_at" timestamp with time zone not null default now()
      );
alter table "public"."client_phone_numbers" enable row level security;
create table "public"."client_settings" (
    "client_id" uuid not null,
    "allow_sms" boolean not null default true,
    "allow_calls" boolean not null default true,
    "allow_whatsapp" boolean not null default true,
    "created_at" timestamp with time zone not null default now(),
    "updated_at" timestamp with time zone not null default now(),
    "allow_documents" boolean not null default true,
    "allow_social" boolean not null default true,
    "allow_chat" boolean not null default true,
    "updated_by" uuid,
    "allow_meetings" boolean not null default true,
    "first_response_minutes_default" integer not null default 60,
    "followup_minutes_default" integer not null default 240
      );
alter table "public"."client_settings" enable row level security;
create table "public"."comms_templates" (
    "key" text not null,
    "channel" text not null,
    "subject" text,
    "body" text not null,
    "is_system" boolean not null default true,
    "created_at" timestamp with time zone not null default now(),
    "updated_at" timestamp with time zone not null default now()
      );
alter table "public"."comms_templates" enable row level security;
create table "public"."contact_consent" (
    "id" uuid not null default gen_random_uuid(),
    "client_id" uuid not null,
    "contact_id" uuid,
    "channel" text not null,
    "status" text not null,
    "updated_at" timestamp with time zone not null default now()
      );
alter table "public"."contact_consent" enable row level security;
create table "public"."contacts" (
    "id" uuid not null default gen_random_uuid(),
    "client_id" uuid not null,
    "account_id" uuid,
    "first_name" text,
    "last_name" text,
    "email" text,
    "phone" text,
    "title" text,
    "status" text not null default 'active'::text,
    "notes" text,
    "created_by" uuid,
    "created_at" timestamp with time zone not null default now(),
    "updated_at" timestamp with time zone not null default now(),
    "name" text,
    "phone_e164" text,
    "phone_raw" text
      );
alter table "public"."contacts" enable row level security;
create table "public"."cron_job_errors" (
    "id" uuid not null default gen_random_uuid(),
    "job_name" text not null,
    "function_name" text not null,
    "request_url" text not null,
    "payload" jsonb not null default '{}'::jsonb,
    "headers" jsonb not null default '{}'::jsonb,
    "payload_hash" text not null,
    "status" text not null default 'queued'::text,
    "attempt_count" integer not null default 0,
    "max_attempts" integer not null default 5,
    "next_retry_at" timestamp with time zone not null default now(),
    "last_error" text,
    "last_status" integer,
    "last_attempt_at" timestamp with time zone,
    "created_at" timestamp with time zone not null default now(),
    "updated_at" timestamp with time zone not null default now()
      );
alter table "public"."cron_job_errors" enable row level security;
create table "public"."cron_job_errors_archive" (
    "id" uuid not null,
    "job_name" text not null,
    "function_name" text not null,
    "request_url" text not null,
    "payload" jsonb not null,
    "headers" jsonb not null,
    "payload_hash" text not null,
    "status" text not null,
    "attempt_count" integer not null,
    "max_attempts" integer not null,
    "next_retry_at" timestamp with time zone,
    "last_error" text,
    "last_status" integer,
    "last_attempt_at" timestamp with time zone,
    "created_at" timestamp with time zone not null,
    "updated_at" timestamp with time zone not null,
    "archived_at" timestamp with time zone not null default now()
      );
alter table "public"."cron_job_errors_archive" enable row level security;
create table "public"."data_exports" (
    "id" uuid not null default gen_random_uuid(),
    "client_id" uuid,
    "requested_by" uuid,
    "export_type" text not null,
    "status" text not null default 'queued'::text,
    "file_path" text,
    "created_at" timestamp with time zone not null default now(),
    "completed_at" timestamp with time zone
      );
alter table "public"."data_exports" enable row level security;
create table "public"."deal_stages" (
    "id" uuid not null default gen_random_uuid(),
    "client_id" uuid not null,
    "name" text not null,
    "sort_order" integer not null default 0,
    "is_closed" boolean not null default false,
    "is_won" boolean not null default false,
    "created_at" timestamp with time zone not null default now(),
    "updated_at" timestamp with time zone not null default now()
      );
alter table "public"."deal_stages" enable row level security;
create table "public"."deals" (
    "id" uuid not null default gen_random_uuid(),
    "client_id" uuid not null,
    "account_id" uuid,
    "stage_id" uuid,
    "name" text not null,
    "amount" bigint not null default 0,
    "currency" text not null default 'usd'::text,
    "expected_close" date not null,
    "status" text not null default 'open'::text,
    "owner_user_id" uuid,
    "created_by" uuid,
    "created_at" timestamp with time zone not null default now(),
    "updated_at" timestamp with time zone not null default now()
      );
alter table "public"."deals" enable row level security;
create table "public"."do_not_contact" (
    "id" uuid not null default gen_random_uuid(),
    "client_id" uuid not null,
    "phone_e164" text not null,
    "reason" text,
    "created_at" timestamp with time zone not null default now()
      );
alter table "public"."do_not_contact" enable row level security;
create table "public"."inbox_notes" (
    "id" bigint not null default nextval('public.inbox_notes_id_seq'::regclass),
    "client_id" uuid not null,
    "target_type" text not null,
    "target_id" uuid not null,
    "body" text not null,
    "created_by" uuid,
    "created_at" timestamp with time zone not null default now()
      );
alter table "public"."inbox_notes" enable row level security;
create table "public"."matrix_client_rooms" (
    "id" uuid not null default gen_random_uuid(),
    "client_id" uuid not null,
    "room_id" text not null,
    "room_name" text,
    "created_by" uuid,
    "created_at" timestamp with time zone not null default now(),
    "updated_at" timestamp with time zone not null default now()
      );
alter table "public"."matrix_client_rooms" enable row level security;
create table "public"."matrix_users" (
    "user_id" uuid not null,
    "matrix_user_id" text not null,
    "matrix_device_id" text,
    "matrix_access_token_enc" text,
    "matrix_password_enc" text,
    "created_at" timestamp with time zone not null default now(),
    "updated_at" timestamp with time zone not null default now()
      );
alter table "public"."matrix_users" enable row level security;
create table "public"."meeting_attendees" (
    "id" uuid not null default gen_random_uuid(),
    "meeting_id" uuid not null,
    "client_id" uuid not null,
    "attendee_type" text not null,
    "user_id" uuid,
    "email" text,
    "name" text,
    "created_at" timestamp with time zone not null default now()
      );
alter table "public"."meeting_attendees" enable row level security;
create table "public"."meeting_providers" (
    "id" uuid not null default gen_random_uuid(),
    "client_id" uuid not null,
    "provider" text not null,
    "status" text not null default 'connected'::text,
    "access_token_enc" text,
    "refresh_token_enc" text,
    "token_expires_at" timestamp with time zone,
    "scopes" text[],
    "external_account_id" text,
    "connected_by" uuid,
    "connected_at" timestamp with time zone not null default now(),
    "last_webhook_at" timestamp with time zone,
    "created_at" timestamp with time zone not null default now(),
    "updated_at" timestamp with time zone not null default now()
      );
alter table "public"."meeting_providers" enable row level security;
create table "public"."meeting_webhook_events" (
    "id" text not null,
    "provider" text not null default 'zoom'::text,
    "client_id" uuid,
    "event_type" text not null,
    "payload" jsonb not null,
    "received_at" timestamp with time zone not null default now()
      );
alter table "public"."meeting_webhook_events" enable row level security;
create table "public"."meetings" (
    "id" uuid not null default gen_random_uuid(),
    "client_id" uuid not null,
    "provider" text not null,
    "title" text not null,
    "agenda" text,
    "start_time" timestamp with time zone not null,
    "end_time" timestamp with time zone not null,
    "timezone" text not null default 'America/Phoenix'::text,
    "created_by" uuid,
    "host_user_id" uuid,
    "join_url" text,
    "start_url" text,
    "start_url_enc" text,
    "external_meeting_id" text,
    "status" text not null default 'scheduled'::text,
    "created_at" timestamp with time zone not null default now(),
    "updated_at" timestamp with time zone not null default now()
      );
alter table "public"."meetings" enable row level security;
create table "public"."meta_webhook_failures" (
    "id" uuid not null default gen_random_uuid(),
    "event_id" text,
    "client_id" uuid,
    "error" text not null,
    "payload" jsonb,
    "created_at" timestamp with time zone not null default now()
      );
alter table "public"."meta_webhook_failures" enable row level security;
create table "public"."rate_limits_legacy" (
    "user_id" uuid not null,
    "cnt" integer not null default 0,
    "last_at" timestamp with time zone default now()
      );
create table "public"."retention_policies" (
    "table_name" text not null,
    "retention_days" integer not null,
    "enabled" boolean not null default true,
    "created_at" timestamp with time zone not null default now()
      );
alter table "public"."retention_policies" enable row level security;
create table "public"."security_events" (
    "id" uuid not null default gen_random_uuid(),
    "user_id" uuid,
    "client_id" uuid,
    "event_type" text not null,
    "metadata" jsonb not null default '{}'::jsonb,
    "created_at" timestamp with time zone not null default now()
      );
alter table "public"."security_events" enable row level security;
create table "public"."sms_messages" (
    "id" uuid not null default gen_random_uuid(),
    "client_id" uuid not null,
    "thread_id" uuid not null,
    "direction" text not null,
    "channel" text not null,
    "from_e164" text not null,
    "to_e164" text not null,
    "body" text,
    "status" text,
    "provider_message_id" text,
    "created_by" uuid,
    "created_at" timestamp with time zone not null default now()
      );
alter table "public"."sms_messages" enable row level security;
create table "public"."sms_threads" (
    "id" uuid not null default gen_random_uuid(),
    "client_id" uuid not null,
    "contact_id" uuid,
    "phone_e164" text not null,
    "channel" text not null default 'sms'::text,
    "status" text not null default 'open'::text,
    "assigned_to" uuid,
    "last_message_at" timestamp with time zone,
    "last_inbound_at" timestamp with time zone,
    "unread_count" integer not null default 0,
    "priority" text not null default 'normal'::text,
    "created_at" timestamp with time zone not null default now(),
    "updated_at" timestamp with time zone not null default now(),
    "assigned_at" timestamp with time zone
      );
alter table "public"."sms_threads" enable row level security;
create table "public"."social_accounts" (
    "id" uuid not null default gen_random_uuid(),
    "client_id" uuid not null,
    "provider" text not null,
    "meta_user_id" text,
    "page_id" text,
    "ig_business_id" text,
    "access_token_enc" text not null,
    "token_expires_at" timestamp with time zone,
    "scopes" text[],
    "status" text not null default 'connected'::text,
    "connected_at" timestamp with time zone not null default now(),
    "last_webhook_at" timestamp with time zone,
    "created_by" uuid,
    "updated_at" timestamp with time zone not null default now(),
    "whatsapp_phone_number_id" text,
    "whatsapp_business_account_id" text
      );
alter table "public"."social_accounts" enable row level security;
create table "public"."social_messages" (
    "id" uuid not null default gen_random_uuid(),
    "client_id" uuid not null,
    "thread_id" uuid not null,
    "contact_id" uuid,
    "direction" text not null,
    "channel" text not null,
    "provider" text not null default 'meta'::text,
    "external_message_id" text,
    "external_sender_id" text,
    "external_recipient_id" text,
    "body" text,
    "metadata" jsonb not null default '{}'::jsonb,
    "created_at" timestamp with time zone not null default now()
      );
alter table "public"."social_messages" enable row level security;
create table "public"."social_threads" (
    "id" uuid not null default gen_random_uuid(),
    "client_id" uuid not null,
    "contact_id" uuid,
    "external_thread_id" text not null,
    "external_user_id" text,
    "channel" text not null,
    "provider" text not null default 'meta'::text,
    "status" text not null default 'open'::text,
    "assigned_to" uuid,
    "last_message_at" timestamp with time zone,
    "last_inbound_at" timestamp with time zone,
    "unread_count" integer not null default 0,
    "priority" text not null default 'normal'::text,
    "created_at" timestamp with time zone not null default now(),
    "updated_at" timestamp with time zone not null default now(),
    "assigned_at" timestamp with time zone
      );
alter table "public"."social_threads" enable row level security;
create table "public"."social_webhook_events" (
    "id" text not null,
    "client_id" uuid not null,
    "provider" text not null default 'meta'::text,
    "event_type" text not null,
    "payload" jsonb not null,
    "received_at" timestamp with time zone not null default now()
      );
alter table "public"."social_webhook_events" enable row level security;
create table "public"."tasks" (
    "id" uuid not null default gen_random_uuid(),
    "client_id" uuid not null,
    "title" text not null,
    "description" text,
    "status" text not null default 'todo'::text,
    "priority" text not null default 'medium'::text,
    "due_date" date not null,
    "assignee_user_id" uuid,
    "created_by" uuid,
    "created_at" timestamp with time zone not null default now(),
    "updated_at" timestamp with time zone not null default now()
      );
alter table "public"."tasks" enable row level security;
create table "public"."twilio_webhook_failures" (
    "id" bigint not null default nextval('public.twilio_webhook_failures_id_seq'::regclass),
    "event_type" text,
    "error" text not null,
    "payload" jsonb,
    "created_at" timestamp with time zone not null default now()
      );
alter table "public"."twilio_webhook_failures" enable row level security;
create table "public"."user_settings" (
    "user_id" uuid not null,
    "call_provider" text not null default 'google_voice_lite'::text,
    "created_at" timestamp with time zone not null default now(),
    "updated_at" timestamp with time zone not null default now()
      );
alter table "public"."user_settings" enable row level security;
create table "public"."webhook_replay_requests" (
    "id" uuid not null default gen_random_uuid(),
    "provider" text not null,
    "client_id" uuid,
    "event_id" text,
    "status" text not null default 'queued'::text,
    "error" text,
    "requested_by" uuid,
    "requested_at" timestamp with time zone not null default now(),
    "processed_at" timestamp with time zone,
    "payload_override" jsonb
      );
alter table "public"."webhook_replay_requests" enable row level security;
alter table "public"."rate_limits" drop column "cnt";
alter table "public"."rate_limits" drop column "last_at";
alter table "public"."rate_limits" drop column "user_id";
alter table "public"."rate_limits" add column "action" text not null;
alter table "public"."rate_limits" add column "created_at" timestamp with time zone not null default now();
alter table "public"."rate_limits" add column "id" bigint not null default nextval('public.rate_limits_id_seq'::regclass);
alter table "public"."rate_limits" add column "max_requests" integer not null;
alter table "public"."rate_limits" add column "scope" text not null;
alter table "public"."rate_limits" add column "scope_id" text not null;
alter table "public"."rate_limits" add column "window_name" text not null;
alter table "public"."rate_limits" enable row level security;
alter sequence "public"."inbox_notes_id_seq" owned by "public"."inbox_notes"."id";
alter sequence "public"."rate_limits_id_seq" owned by "public"."rate_limits"."id";
alter sequence "public"."twilio_webhook_failures_id_seq" owned by "public"."twilio_webhook_failures"."id";
CREATE UNIQUE INDEX accounts_pkey ON public.accounts USING btree (id);
CREATE INDEX activities_client_created_idx ON public.activities USING btree (client_id, created_at DESC);
CREATE UNIQUE INDEX activities_pkey ON public.activities USING btree (id);
CREATE UNIQUE INDEX billing_customers_client_id_key ON public.billing_customers USING btree (client_id);
CREATE UNIQUE INDEX call_events_pkey ON public.call_events USING btree (id);
CREATE UNIQUE INDEX call_logs_pkey ON public.call_logs USING btree (id);
CREATE UNIQUE INDEX call_recordings_pkey ON public.call_recordings USING btree (id);
CREATE UNIQUE INDEX call_recordings_provider_recording_sid_key ON public.call_recordings USING btree (provider_recording_sid);
CREATE INDEX calls_client_status_inbound_idx ON public.calls USING btree (client_id, status_group, last_inbound_at DESC);
CREATE UNIQUE INDEX calls_pkey ON public.calls USING btree (id);
CREATE UNIQUE INDEX calls_provider_call_sid_key ON public.calls USING btree (provider_call_sid);
CREATE UNIQUE INDEX client_phone_numbers_client_id_phone_e164_channel_key ON public.client_phone_numbers USING btree (client_id, phone_e164, channel);
CREATE UNIQUE INDEX client_phone_numbers_pkey ON public.client_phone_numbers USING btree (id);
CREATE UNIQUE INDEX client_settings_pkey ON public.client_settings USING btree (client_id);
CREATE UNIQUE INDEX comms_templates_pkey ON public.comms_templates USING btree (key);
CREATE UNIQUE INDEX contact_consent_client_id_contact_id_channel_key ON public.contact_consent USING btree (client_id, contact_id, channel);
CREATE UNIQUE INDEX contact_consent_pkey ON public.contact_consent USING btree (id);
CREATE UNIQUE INDEX contacts_pkey ON public.contacts USING btree (id);
CREATE UNIQUE INDEX cron_job_errors_archive_pkey ON public.cron_job_errors_archive USING btree (id);
CREATE UNIQUE INDEX cron_job_errors_pkey ON public.cron_job_errors USING btree (id);
CREATE INDEX cron_job_errors_status_next_idx ON public.cron_job_errors USING btree (status, next_retry_at);
CREATE UNIQUE INDEX cron_job_errors_unique ON public.cron_job_errors USING btree (job_name, function_name, payload_hash);
CREATE INDEX data_exports_client_created_idx ON public.data_exports USING btree (client_id, created_at DESC);
CREATE UNIQUE INDEX data_exports_pkey ON public.data_exports USING btree (id);
CREATE INDEX data_exports_status_created_idx ON public.data_exports USING btree (status, created_at DESC);
CREATE UNIQUE INDEX deal_stages_client_id_name_key ON public.deal_stages USING btree (client_id, name);
CREATE UNIQUE INDEX deal_stages_pkey ON public.deal_stages USING btree (id);
CREATE UNIQUE INDEX deals_pkey ON public.deals USING btree (id);
CREATE UNIQUE INDEX do_not_contact_client_id_phone_e164_key ON public.do_not_contact USING btree (client_id, phone_e164);
CREATE UNIQUE INDEX do_not_contact_pkey ON public.do_not_contact USING btree (id);
CREATE INDEX document_extractions_client_created_idx ON public.document_extractions USING btree (client_id, created_at DESC);
CREATE INDEX idx_accounts_client ON public.accounts USING btree (client_id);
CREATE INDEX idx_accounts_owner ON public.accounts USING btree (owner_user_id);
CREATE INDEX idx_activities_client_time ON public.activities USING btree (client_id, created_at DESC);
CREATE INDEX idx_activities_source_time ON public.activities USING btree (source, created_at DESC);
CREATE INDEX idx_activities_type_time ON public.activities USING btree (type, created_at DESC);
CREATE INDEX idx_audit_logs_created_at ON public.audit_logs USING btree (created_at DESC);
CREATE INDEX idx_call_events_call ON public.call_events USING btree (call_id, created_at);
CREATE INDEX idx_call_logs_agent_time ON public.call_logs USING btree (agent_user_id, created_at DESC);
CREATE INDEX idx_call_logs_client_time ON public.call_logs USING btree (client_id, created_at DESC);
CREATE INDEX idx_call_logs_contact ON public.call_logs USING btree (contact_id);
CREATE INDEX idx_calls_client_status ON public.calls USING btree (client_id, status_group, last_inbound_at DESC);
CREATE INDEX idx_client_phone_numbers_client ON public.client_phone_numbers USING btree (client_id);
CREATE INDEX idx_comms_templates_channel ON public.comms_templates USING btree (channel);
CREATE INDEX idx_contacts_account ON public.contacts USING btree (account_id);
CREATE INDEX idx_contacts_client ON public.contacts USING btree (client_id);
CREATE INDEX idx_contacts_client_phone ON public.contacts USING btree (client_id, phone_e164);
CREATE INDEX idx_contacts_email ON public.contacts USING btree (email);
CREATE INDEX idx_deal_stages_client ON public.deal_stages USING btree (client_id);
CREATE INDEX idx_deals_account ON public.deals USING btree (account_id);
CREATE INDEX idx_deals_client ON public.deals USING btree (client_id);
CREATE INDEX idx_deals_owner ON public.deals USING btree (owner_user_id);
CREATE INDEX idx_deals_stage ON public.deals USING btree (stage_id);
CREATE INDEX idx_dnc_client_phone ON public.do_not_contact USING btree (client_id, phone_e164);
CREATE INDEX idx_matrix_client_rooms_client ON public.matrix_client_rooms USING btree (client_id);
CREATE INDEX idx_meeting_attendees_client ON public.meeting_attendees USING btree (client_id);
CREATE INDEX idx_meeting_attendees_meeting ON public.meeting_attendees USING btree (meeting_id);
CREATE INDEX idx_meeting_providers_client_status ON public.meeting_providers USING btree (client_id, status);
CREATE INDEX idx_meeting_webhook_events_client_time ON public.meeting_webhook_events USING btree (client_id, received_at DESC);
CREATE INDEX idx_meeting_webhook_events_type_time ON public.meeting_webhook_events USING btree (event_type, received_at DESC);
CREATE INDEX idx_meetings_client_start_time ON public.meetings USING btree (client_id, start_time DESC);
CREATE INDEX idx_meetings_provider_start_time ON public.meetings USING btree (provider, start_time DESC);
CREATE INDEX idx_meta_webhook_failures_time ON public.meta_webhook_failures USING btree (created_at DESC);
CREATE INDEX idx_sms_messages_client ON public.sms_messages USING btree (client_id, created_at DESC);
CREATE INDEX idx_sms_messages_thread ON public.sms_messages USING btree (thread_id, created_at);
CREATE INDEX idx_sms_threads_assigned ON public.sms_threads USING btree (assigned_to, last_inbound_at DESC);
CREATE INDEX idx_sms_threads_client_status ON public.sms_threads USING btree (client_id, status, last_inbound_at DESC);
CREATE INDEX idx_social_accounts_client_provider ON public.social_accounts USING btree (client_id, provider);
CREATE INDEX idx_social_accounts_client_status ON public.social_accounts USING btree (client_id, status);
CREATE INDEX idx_social_messages_client ON public.social_messages USING btree (client_id, created_at DESC);
CREATE INDEX idx_social_messages_thread ON public.social_messages USING btree (thread_id, created_at);
CREATE INDEX idx_social_threads_assigned ON public.social_threads USING btree (assigned_to, last_inbound_at DESC);
CREATE INDEX idx_social_threads_client_status ON public.social_threads USING btree (client_id, status, last_inbound_at DESC);
CREATE INDEX idx_social_webhook_events_client_time ON public.social_webhook_events USING btree (client_id, received_at DESC);
CREATE INDEX idx_social_webhook_events_type_time ON public.social_webhook_events USING btree (event_type, received_at DESC);
CREATE INDEX idx_stripe_plans_active ON public.stripe_plans USING btree (active);
CREATE INDEX idx_tasks_assignee ON public.tasks USING btree (assignee_user_id);
CREATE INDEX idx_tasks_client ON public.tasks USING btree (client_id);
CREATE INDEX idx_tasks_due ON public.tasks USING btree (due_date);
CREATE INDEX idx_twilio_webhook_failures_created ON public.twilio_webhook_failures USING btree (created_at DESC);
CREATE INDEX idx_webhook_replay_provider_time ON public.webhook_replay_requests USING btree (provider, requested_at DESC);
CREATE INDEX idx_webhook_replay_status_time ON public.webhook_replay_requests USING btree (status, requested_at DESC);
CREATE UNIQUE INDEX inbox_notes_pkey ON public.inbox_notes USING btree (id);
CREATE UNIQUE INDEX matrix_client_rooms_client_id_key ON public.matrix_client_rooms USING btree (client_id);
CREATE UNIQUE INDEX matrix_client_rooms_pkey ON public.matrix_client_rooms USING btree (id);
CREATE UNIQUE INDEX matrix_client_rooms_room_id_key ON public.matrix_client_rooms USING btree (room_id);
CREATE UNIQUE INDEX matrix_users_matrix_user_id_key ON public.matrix_users USING btree (matrix_user_id);
CREATE UNIQUE INDEX matrix_users_pkey ON public.matrix_users USING btree (user_id);
CREATE UNIQUE INDEX meeting_attendees_pkey ON public.meeting_attendees USING btree (id);
CREATE UNIQUE INDEX meeting_providers_pkey ON public.meeting_providers USING btree (id);
CREATE UNIQUE INDEX meeting_webhook_events_pkey ON public.meeting_webhook_events USING btree (id);
CREATE UNIQUE INDEX meetings_pkey ON public.meetings USING btree (id);
CREATE UNIQUE INDEX meta_webhook_failures_pkey ON public.meta_webhook_failures USING btree (id);
CREATE UNIQUE INDEX rate_limits_pkey1 ON public.rate_limits USING btree (id);
CREATE UNIQUE INDEX rate_limits_unique ON public.rate_limits USING btree (scope, scope_id, action, window_name);
CREATE UNIQUE INDEX retention_policies_pkey ON public.retention_policies USING btree (table_name);
CREATE INDEX security_events_created_idx ON public.security_events USING btree (created_at DESC);
CREATE UNIQUE INDEX security_events_pkey ON public.security_events USING btree (id);
CREATE INDEX security_events_type_created_idx ON public.security_events USING btree (event_type, created_at DESC);
CREATE INDEX sms_messages_client_created_idx ON public.sms_messages USING btree (client_id, created_at DESC);
CREATE UNIQUE INDEX sms_messages_pkey ON public.sms_messages USING btree (id);
CREATE UNIQUE INDEX sms_threads_client_id_phone_e164_channel_key ON public.sms_threads USING btree (client_id, phone_e164, channel);
CREATE UNIQUE INDEX sms_threads_pkey ON public.sms_threads USING btree (id);
CREATE UNIQUE INDEX social_accounts_pkey ON public.social_accounts USING btree (id);
CREATE UNIQUE INDEX social_messages_client_id_external_message_id_key ON public.social_messages USING btree (client_id, external_message_id);
CREATE UNIQUE INDEX social_messages_pkey ON public.social_messages USING btree (id);
CREATE UNIQUE INDEX social_threads_client_id_external_thread_id_channel_provide_key ON public.social_threads USING btree (client_id, external_thread_id, channel, provider);
CREATE UNIQUE INDEX social_threads_pkey ON public.social_threads USING btree (id);
CREATE UNIQUE INDEX social_webhook_events_pkey ON public.social_webhook_events USING btree (id);
CREATE UNIQUE INDEX tasks_pkey ON public.tasks USING btree (id);
CREATE UNIQUE INDEX twilio_webhook_failures_pkey ON public.twilio_webhook_failures USING btree (id);
CREATE UNIQUE INDEX uniq_contacts_client_phone ON public.contacts USING btree (client_id, phone_e164) WHERE (phone_e164 IS NOT NULL);
CREATE UNIQUE INDEX uniq_meeting_providers_client_provider ON public.meeting_providers USING btree (client_id, provider);
CREATE UNIQUE INDEX uniq_social_accounts_client_provider ON public.social_accounts USING btree (client_id, provider);
CREATE UNIQUE INDEX user_settings_pkey ON public.user_settings USING btree (user_id);
CREATE UNIQUE INDEX webhook_replay_requests_pkey ON public.webhook_replay_requests USING btree (id);
CREATE UNIQUE INDEX rate_limits_pkey ON public.rate_limits_legacy USING btree (user_id);
alter table "public"."accounts" add constraint "accounts_pkey" PRIMARY KEY using index "accounts_pkey";
alter table "public"."activities" add constraint "activities_pkey" PRIMARY KEY using index "activities_pkey";
alter table "public"."call_events" add constraint "call_events_pkey" PRIMARY KEY using index "call_events_pkey";
alter table "public"."call_logs" add constraint "call_logs_pkey" PRIMARY KEY using index "call_logs_pkey";
alter table "public"."call_recordings" add constraint "call_recordings_pkey" PRIMARY KEY using index "call_recordings_pkey";
alter table "public"."calls" add constraint "calls_pkey" PRIMARY KEY using index "calls_pkey";
alter table "public"."client_phone_numbers" add constraint "client_phone_numbers_pkey" PRIMARY KEY using index "client_phone_numbers_pkey";
alter table "public"."client_settings" add constraint "client_settings_pkey" PRIMARY KEY using index "client_settings_pkey";
alter table "public"."comms_templates" add constraint "comms_templates_pkey" PRIMARY KEY using index "comms_templates_pkey";
alter table "public"."contact_consent" add constraint "contact_consent_pkey" PRIMARY KEY using index "contact_consent_pkey";
alter table "public"."contacts" add constraint "contacts_pkey" PRIMARY KEY using index "contacts_pkey";
alter table "public"."cron_job_errors" add constraint "cron_job_errors_pkey" PRIMARY KEY using index "cron_job_errors_pkey";
alter table "public"."cron_job_errors_archive" add constraint "cron_job_errors_archive_pkey" PRIMARY KEY using index "cron_job_errors_archive_pkey";
alter table "public"."data_exports" add constraint "data_exports_pkey" PRIMARY KEY using index "data_exports_pkey";
alter table "public"."deal_stages" add constraint "deal_stages_pkey" PRIMARY KEY using index "deal_stages_pkey";
alter table "public"."deals" add constraint "deals_pkey" PRIMARY KEY using index "deals_pkey";
alter table "public"."do_not_contact" add constraint "do_not_contact_pkey" PRIMARY KEY using index "do_not_contact_pkey";
alter table "public"."inbox_notes" add constraint "inbox_notes_pkey" PRIMARY KEY using index "inbox_notes_pkey";
alter table "public"."matrix_client_rooms" add constraint "matrix_client_rooms_pkey" PRIMARY KEY using index "matrix_client_rooms_pkey";
alter table "public"."matrix_users" add constraint "matrix_users_pkey" PRIMARY KEY using index "matrix_users_pkey";
alter table "public"."meeting_attendees" add constraint "meeting_attendees_pkey" PRIMARY KEY using index "meeting_attendees_pkey";
alter table "public"."meeting_providers" add constraint "meeting_providers_pkey" PRIMARY KEY using index "meeting_providers_pkey";
alter table "public"."meeting_webhook_events" add constraint "meeting_webhook_events_pkey" PRIMARY KEY using index "meeting_webhook_events_pkey";
alter table "public"."meetings" add constraint "meetings_pkey" PRIMARY KEY using index "meetings_pkey";
alter table "public"."meta_webhook_failures" add constraint "meta_webhook_failures_pkey" PRIMARY KEY using index "meta_webhook_failures_pkey";
alter table "public"."rate_limits" add constraint "rate_limits_pkey1" PRIMARY KEY using index "rate_limits_pkey1";
alter table "public"."rate_limits_legacy" add constraint "rate_limits_pkey" PRIMARY KEY using index "rate_limits_pkey";
alter table "public"."retention_policies" add constraint "retention_policies_pkey" PRIMARY KEY using index "retention_policies_pkey";
alter table "public"."security_events" add constraint "security_events_pkey" PRIMARY KEY using index "security_events_pkey";
alter table "public"."sms_messages" add constraint "sms_messages_pkey" PRIMARY KEY using index "sms_messages_pkey";
alter table "public"."sms_threads" add constraint "sms_threads_pkey" PRIMARY KEY using index "sms_threads_pkey";
alter table "public"."social_accounts" add constraint "social_accounts_pkey" PRIMARY KEY using index "social_accounts_pkey";
alter table "public"."social_messages" add constraint "social_messages_pkey" PRIMARY KEY using index "social_messages_pkey";
alter table "public"."social_threads" add constraint "social_threads_pkey" PRIMARY KEY using index "social_threads_pkey";
alter table "public"."social_webhook_events" add constraint "social_webhook_events_pkey" PRIMARY KEY using index "social_webhook_events_pkey";
alter table "public"."tasks" add constraint "tasks_pkey" PRIMARY KEY using index "tasks_pkey";
alter table "public"."twilio_webhook_failures" add constraint "twilio_webhook_failures_pkey" PRIMARY KEY using index "twilio_webhook_failures_pkey";
alter table "public"."user_settings" add constraint "user_settings_pkey" PRIMARY KEY using index "user_settings_pkey";
alter table "public"."webhook_replay_requests" add constraint "webhook_replay_requests_pkey" PRIMARY KEY using index "webhook_replay_requests_pkey";
alter table "public"."accounts" add constraint "accounts_client_id_fkey" FOREIGN KEY (client_id) REFERENCES public.clients(id) ON DELETE CASCADE not valid;
alter table "public"."accounts" validate constraint "accounts_client_id_fkey";
alter table "public"."accounts" add constraint "accounts_created_by_fkey" FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL not valid;
alter table "public"."accounts" validate constraint "accounts_created_by_fkey";
alter table "public"."accounts" add constraint "accounts_owner_user_id_fkey" FOREIGN KEY (owner_user_id) REFERENCES auth.users(id) ON DELETE SET NULL not valid;
alter table "public"."accounts" validate constraint "accounts_owner_user_id_fkey";
alter table "public"."accounts" add constraint "accounts_status_check" CHECK ((status = ANY (ARRAY['active'::text, 'archived'::text]))) not valid;
alter table "public"."accounts" validate constraint "accounts_status_check";
alter table "public"."activities" add constraint "activities_actor_user_id_fkey" FOREIGN KEY (actor_user_id) REFERENCES auth.users(id) ON DELETE SET NULL not valid;
alter table "public"."activities" validate constraint "activities_actor_user_id_fkey";
alter table "public"."activities" add constraint "activities_client_id_fkey" FOREIGN KEY (client_id) REFERENCES public.clients(id) ON DELETE CASCADE not valid;
alter table "public"."activities" validate constraint "activities_client_id_fkey";
alter table "public"."activities" add constraint "activities_source_check" CHECK ((source = ANY (ARRAY['billing'::text, 'documents'::text, 'comms'::text, 'social'::text, 'system'::text]))) not valid;
alter table "public"."activities" validate constraint "activities_source_check";
alter table "public"."billing_customers" add constraint "billing_customers_client_id_key" UNIQUE using index "billing_customers_client_id_key";
alter table "public"."call_events" add constraint "call_events_call_id_fkey" FOREIGN KEY (call_id) REFERENCES public.calls(id) ON DELETE CASCADE not valid;
alter table "public"."call_events" validate constraint "call_events_call_id_fkey";
alter table "public"."call_events" add constraint "call_events_client_id_fkey" FOREIGN KEY (client_id) REFERENCES public.clients(id) ON DELETE CASCADE not valid;
alter table "public"."call_events" validate constraint "call_events_client_id_fkey";
alter table "public"."call_logs" add constraint "call_logs_agent_user_id_fkey" FOREIGN KEY (agent_user_id) REFERENCES auth.users(id) ON DELETE SET NULL not valid;
alter table "public"."call_logs" validate constraint "call_logs_agent_user_id_fkey";
alter table "public"."call_logs" add constraint "call_logs_client_id_fkey" FOREIGN KEY (client_id) REFERENCES public.clients(id) ON DELETE CASCADE not valid;
alter table "public"."call_logs" validate constraint "call_logs_client_id_fkey";
alter table "public"."call_logs" add constraint "call_logs_contact_id_fkey" FOREIGN KEY (contact_id) REFERENCES public.contacts(id) ON DELETE SET NULL not valid;
alter table "public"."call_logs" validate constraint "call_logs_contact_id_fkey";
alter table "public"."call_logs" add constraint "call_logs_direction_check" CHECK ((direction = ANY (ARRAY['outbound'::text, 'inbound'::text]))) not valid;
alter table "public"."call_logs" validate constraint "call_logs_direction_check";
alter table "public"."call_logs" add constraint "call_logs_provider_check" CHECK ((provider = ANY (ARRAY['google_voice_lite'::text, 'phone_link'::text, 'twilio'::text]))) not valid;
alter table "public"."call_logs" validate constraint "call_logs_provider_check";
alter table "public"."call_recordings" add constraint "call_recordings_call_id_fkey" FOREIGN KEY (call_id) REFERENCES public.calls(id) ON DELETE CASCADE not valid;
alter table "public"."call_recordings" validate constraint "call_recordings_call_id_fkey";
alter table "public"."call_recordings" add constraint "call_recordings_client_id_fkey" FOREIGN KEY (client_id) REFERENCES public.clients(id) ON DELETE CASCADE not valid;
alter table "public"."call_recordings" validate constraint "call_recordings_client_id_fkey";
alter table "public"."call_recordings" add constraint "call_recordings_provider_recording_sid_key" UNIQUE using index "call_recordings_provider_recording_sid_key";
alter table "public"."calls" add constraint "calls_assigned_to_fkey" FOREIGN KEY (assigned_to) REFERENCES auth.users(id) ON DELETE SET NULL not valid;
alter table "public"."calls" validate constraint "calls_assigned_to_fkey";
alter table "public"."calls" add constraint "calls_client_id_fkey" FOREIGN KEY (client_id) REFERENCES public.clients(id) ON DELETE CASCADE not valid;
alter table "public"."calls" validate constraint "calls_client_id_fkey";
alter table "public"."calls" add constraint "calls_contact_id_fkey" FOREIGN KEY (contact_id) REFERENCES public.contacts(id) ON DELETE SET NULL not valid;
alter table "public"."calls" validate constraint "calls_contact_id_fkey";
alter table "public"."calls" add constraint "calls_direction_check" CHECK ((direction = ANY (ARRAY['inbound'::text, 'outbound'::text]))) not valid;
alter table "public"."calls" validate constraint "calls_direction_check";
alter table "public"."calls" add constraint "calls_priority_check" CHECK ((priority = ANY (ARRAY['low'::text, 'normal'::text, 'high'::text]))) not valid;
alter table "public"."calls" validate constraint "calls_priority_check";
alter table "public"."calls" add constraint "calls_provider_call_sid_key" UNIQUE using index "calls_provider_call_sid_key";
alter table "public"."calls" add constraint "calls_status_group_check" CHECK ((status_group = ANY (ARRAY['open'::text, 'pending'::text, 'closed'::text]))) not valid;
alter table "public"."calls" validate constraint "calls_status_group_check";
alter table "public"."client_phone_numbers" add constraint "client_phone_numbers_channel_check" CHECK ((channel = ANY (ARRAY['sms'::text, 'whatsapp'::text, 'voice'::text]))) not valid;
alter table "public"."client_phone_numbers" validate constraint "client_phone_numbers_channel_check";
alter table "public"."client_phone_numbers" add constraint "client_phone_numbers_client_id_fkey" FOREIGN KEY (client_id) REFERENCES public.clients(id) ON DELETE CASCADE not valid;
alter table "public"."client_phone_numbers" validate constraint "client_phone_numbers_client_id_fkey";
alter table "public"."client_phone_numbers" add constraint "client_phone_numbers_client_id_phone_e164_channel_key" UNIQUE using index "client_phone_numbers_client_id_phone_e164_channel_key";
alter table "public"."client_settings" add constraint "client_settings_client_id_fkey" FOREIGN KEY (client_id) REFERENCES public.clients(id) ON DELETE CASCADE not valid;
alter table "public"."client_settings" validate constraint "client_settings_client_id_fkey";
alter table "public"."client_settings" add constraint "client_settings_updated_by_fkey" FOREIGN KEY (updated_by) REFERENCES auth.users(id) not valid;
alter table "public"."client_settings" validate constraint "client_settings_updated_by_fkey";
alter table "public"."comms_templates" add constraint "comms_templates_channel_check" CHECK ((channel = ANY (ARRAY['sms'::text, 'email'::text]))) not valid;
alter table "public"."comms_templates" validate constraint "comms_templates_channel_check";
alter table "public"."contact_consent" add constraint "contact_consent_channel_check" CHECK ((channel = ANY (ARRAY['sms'::text, 'whatsapp'::text, 'voice'::text, 'email'::text]))) not valid;
alter table "public"."contact_consent" validate constraint "contact_consent_channel_check";
alter table "public"."contact_consent" add constraint "contact_consent_client_id_contact_id_channel_key" UNIQUE using index "contact_consent_client_id_contact_id_channel_key";
alter table "public"."contact_consent" add constraint "contact_consent_client_id_fkey" FOREIGN KEY (client_id) REFERENCES public.clients(id) ON DELETE CASCADE not valid;
alter table "public"."contact_consent" validate constraint "contact_consent_client_id_fkey";
alter table "public"."contact_consent" add constraint "contact_consent_contact_id_fkey" FOREIGN KEY (contact_id) REFERENCES public.contacts(id) ON DELETE CASCADE not valid;
alter table "public"."contact_consent" validate constraint "contact_consent_contact_id_fkey";
alter table "public"."contact_consent" add constraint "contact_consent_status_check" CHECK ((status = ANY (ARRAY['opted_in'::text, 'opted_out'::text]))) not valid;
alter table "public"."contact_consent" validate constraint "contact_consent_status_check";
alter table "public"."contacts" add constraint "contacts_account_id_fkey" FOREIGN KEY (account_id) REFERENCES public.accounts(id) ON DELETE SET NULL not valid;
alter table "public"."contacts" validate constraint "contacts_account_id_fkey";
alter table "public"."contacts" add constraint "contacts_client_id_fkey" FOREIGN KEY (client_id) REFERENCES public.clients(id) ON DELETE CASCADE not valid;
alter table "public"."contacts" validate constraint "contacts_client_id_fkey";
alter table "public"."contacts" add constraint "contacts_created_by_fkey" FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL not valid;
alter table "public"."contacts" validate constraint "contacts_created_by_fkey";
alter table "public"."contacts" add constraint "contacts_status_check" CHECK ((status = ANY (ARRAY['active'::text, 'archived'::text]))) not valid;
alter table "public"."contacts" validate constraint "contacts_status_check";
alter table "public"."cron_job_errors" add constraint "cron_job_errors_status_check" CHECK ((status = ANY (ARRAY['queued'::text, 'retrying'::text, 'succeeded'::text, 'failed'::text]))) not valid;
alter table "public"."cron_job_errors" validate constraint "cron_job_errors_status_check";
alter table "public"."data_exports" add constraint "data_exports_client_id_fkey" FOREIGN KEY (client_id) REFERENCES public.clients(id) ON DELETE CASCADE not valid;
alter table "public"."data_exports" validate constraint "data_exports_client_id_fkey";
alter table "public"."data_exports" add constraint "data_exports_export_type_check" CHECK ((export_type = ANY (ARRAY['documents'::text, 'messages'::text, 'calls'::text, 'billing'::text, 'full'::text]))) not valid;
alter table "public"."data_exports" validate constraint "data_exports_export_type_check";
alter table "public"."data_exports" add constraint "data_exports_requested_by_fkey" FOREIGN KEY (requested_by) REFERENCES auth.users(id) ON DELETE SET NULL not valid;
alter table "public"."data_exports" validate constraint "data_exports_requested_by_fkey";
alter table "public"."data_exports" add constraint "data_exports_status_check" CHECK ((status = ANY (ARRAY['queued'::text, 'processing'::text, 'ready'::text, 'failed'::text]))) not valid;
alter table "public"."data_exports" validate constraint "data_exports_status_check";
alter table "public"."deal_stages" add constraint "deal_stages_client_id_fkey" FOREIGN KEY (client_id) REFERENCES public.clients(id) ON DELETE CASCADE not valid;
alter table "public"."deal_stages" validate constraint "deal_stages_client_id_fkey";
alter table "public"."deal_stages" add constraint "deal_stages_client_id_name_key" UNIQUE using index "deal_stages_client_id_name_key";
alter table "public"."deals" add constraint "deals_account_id_fkey" FOREIGN KEY (account_id) REFERENCES public.accounts(id) ON DELETE SET NULL not valid;
alter table "public"."deals" validate constraint "deals_account_id_fkey";
alter table "public"."deals" add constraint "deals_client_id_fkey" FOREIGN KEY (client_id) REFERENCES public.clients(id) ON DELETE CASCADE not valid;
alter table "public"."deals" validate constraint "deals_client_id_fkey";
alter table "public"."deals" add constraint "deals_created_by_fkey" FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL not valid;
alter table "public"."deals" validate constraint "deals_created_by_fkey";
alter table "public"."deals" add constraint "deals_owner_user_id_fkey" FOREIGN KEY (owner_user_id) REFERENCES auth.users(id) ON DELETE SET NULL not valid;
alter table "public"."deals" validate constraint "deals_owner_user_id_fkey";
alter table "public"."deals" add constraint "deals_stage_id_fkey" FOREIGN KEY (stage_id) REFERENCES public.deal_stages(id) ON DELETE SET NULL not valid;
alter table "public"."deals" validate constraint "deals_stage_id_fkey";
alter table "public"."deals" add constraint "deals_status_check" CHECK ((status = ANY (ARRAY['open'::text, 'won'::text, 'lost'::text]))) not valid;
alter table "public"."deals" validate constraint "deals_status_check";
alter table "public"."do_not_contact" add constraint "do_not_contact_client_id_fkey" FOREIGN KEY (client_id) REFERENCES public.clients(id) ON DELETE CASCADE not valid;
alter table "public"."do_not_contact" validate constraint "do_not_contact_client_id_fkey";
alter table "public"."do_not_contact" add constraint "do_not_contact_client_id_phone_e164_key" UNIQUE using index "do_not_contact_client_id_phone_e164_key";
alter table "public"."inbox_notes" add constraint "inbox_notes_client_id_fkey" FOREIGN KEY (client_id) REFERENCES public.clients(id) ON DELETE CASCADE not valid;
alter table "public"."inbox_notes" validate constraint "inbox_notes_client_id_fkey";
alter table "public"."inbox_notes" add constraint "inbox_notes_created_by_fkey" FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL not valid;
alter table "public"."inbox_notes" validate constraint "inbox_notes_created_by_fkey";
alter table "public"."inbox_notes" add constraint "inbox_notes_target_type_check" CHECK ((target_type = ANY (ARRAY['sms_thread'::text, 'call'::text]))) not valid;
alter table "public"."inbox_notes" validate constraint "inbox_notes_target_type_check";
alter table "public"."matrix_client_rooms" add constraint "matrix_client_rooms_client_id_fkey" FOREIGN KEY (client_id) REFERENCES public.clients(id) ON DELETE CASCADE not valid;
alter table "public"."matrix_client_rooms" validate constraint "matrix_client_rooms_client_id_fkey";
alter table "public"."matrix_client_rooms" add constraint "matrix_client_rooms_client_id_key" UNIQUE using index "matrix_client_rooms_client_id_key";
alter table "public"."matrix_client_rooms" add constraint "matrix_client_rooms_created_by_fkey" FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL not valid;
alter table "public"."matrix_client_rooms" validate constraint "matrix_client_rooms_created_by_fkey";
alter table "public"."matrix_client_rooms" add constraint "matrix_client_rooms_room_id_key" UNIQUE using index "matrix_client_rooms_room_id_key";
alter table "public"."matrix_users" add constraint "matrix_users_matrix_user_id_key" UNIQUE using index "matrix_users_matrix_user_id_key";
alter table "public"."matrix_users" add constraint "matrix_users_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE not valid;
alter table "public"."matrix_users" validate constraint "matrix_users_user_id_fkey";
alter table "public"."meeting_attendees" add constraint "meeting_attendees_attendee_type_check" CHECK ((attendee_type = ANY (ARRAY['internal'::text, 'client'::text]))) not valid;
alter table "public"."meeting_attendees" validate constraint "meeting_attendees_attendee_type_check";
alter table "public"."meeting_attendees" add constraint "meeting_attendees_client_id_fkey" FOREIGN KEY (client_id) REFERENCES public.clients(id) ON DELETE CASCADE not valid;
alter table "public"."meeting_attendees" validate constraint "meeting_attendees_client_id_fkey";
alter table "public"."meeting_attendees" add constraint "meeting_attendees_meeting_id_fkey" FOREIGN KEY (meeting_id) REFERENCES public.meetings(id) ON DELETE CASCADE not valid;
alter table "public"."meeting_attendees" validate constraint "meeting_attendees_meeting_id_fkey";
alter table "public"."meeting_attendees" add constraint "meeting_attendees_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE SET NULL not valid;
alter table "public"."meeting_attendees" validate constraint "meeting_attendees_user_id_fkey";
alter table "public"."meeting_providers" add constraint "meeting_providers_client_id_fkey" FOREIGN KEY (client_id) REFERENCES public.clients(id) ON DELETE CASCADE not valid;
alter table "public"."meeting_providers" validate constraint "meeting_providers_client_id_fkey";
alter table "public"."meeting_providers" add constraint "meeting_providers_connected_by_fkey" FOREIGN KEY (connected_by) REFERENCES auth.users(id) ON DELETE SET NULL not valid;
alter table "public"."meeting_providers" validate constraint "meeting_providers_connected_by_fkey";
alter table "public"."meeting_providers" add constraint "meeting_providers_provider_check" CHECK ((provider = ANY (ARRAY['zoom'::text, 'google'::text]))) not valid;
alter table "public"."meeting_providers" validate constraint "meeting_providers_provider_check";
alter table "public"."meeting_providers" add constraint "meeting_providers_status_check" CHECK ((status = ANY (ARRAY['connected'::text, 'revoked'::text, 'error'::text]))) not valid;
alter table "public"."meeting_providers" validate constraint "meeting_providers_status_check";
alter table "public"."meetings" add constraint "meetings_client_id_fkey" FOREIGN KEY (client_id) REFERENCES public.clients(id) ON DELETE CASCADE not valid;
alter table "public"."meetings" validate constraint "meetings_client_id_fkey";
alter table "public"."meetings" add constraint "meetings_created_by_fkey" FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL not valid;
alter table "public"."meetings" validate constraint "meetings_created_by_fkey";
alter table "public"."meetings" add constraint "meetings_host_user_id_fkey" FOREIGN KEY (host_user_id) REFERENCES auth.users(id) ON DELETE SET NULL not valid;
alter table "public"."meetings" validate constraint "meetings_host_user_id_fkey";
alter table "public"."meetings" add constraint "meetings_provider_check" CHECK ((provider = ANY (ARRAY['zoom'::text, 'google'::text]))) not valid;
alter table "public"."meetings" validate constraint "meetings_provider_check";
alter table "public"."meetings" add constraint "meetings_status_check" CHECK ((status = ANY (ARRAY['scheduled'::text, 'cancelled'::text, 'completed'::text]))) not valid;
alter table "public"."meetings" validate constraint "meetings_status_check";
alter table "public"."rate_limits" add constraint "rate_limits_scope_check" CHECK ((scope = ANY (ARRAY['user'::text, 'client'::text, 'ip'::text]))) not valid;
alter table "public"."rate_limits" validate constraint "rate_limits_scope_check";
alter table "public"."rate_limits" add constraint "rate_limits_window_name_check" CHECK ((window_name = ANY (ARRAY['minute'::text, 'hour'::text, 'day'::text]))) not valid;
alter table "public"."rate_limits" validate constraint "rate_limits_window_name_check";
alter table "public"."security_events" add constraint "security_events_client_id_fkey" FOREIGN KEY (client_id) REFERENCES public.clients(id) ON DELETE SET NULL not valid;
alter table "public"."security_events" validate constraint "security_events_client_id_fkey";
alter table "public"."security_events" add constraint "security_events_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE SET NULL not valid;
alter table "public"."security_events" validate constraint "security_events_user_id_fkey";
alter table "public"."sms_messages" add constraint "sms_messages_channel_check" CHECK ((channel = ANY (ARRAY['sms'::text, 'whatsapp'::text]))) not valid;
alter table "public"."sms_messages" validate constraint "sms_messages_channel_check";
alter table "public"."sms_messages" add constraint "sms_messages_client_id_fkey" FOREIGN KEY (client_id) REFERENCES public.clients(id) ON DELETE CASCADE not valid;
alter table "public"."sms_messages" validate constraint "sms_messages_client_id_fkey";
alter table "public"."sms_messages" add constraint "sms_messages_created_by_fkey" FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL not valid;
alter table "public"."sms_messages" validate constraint "sms_messages_created_by_fkey";
alter table "public"."sms_messages" add constraint "sms_messages_direction_check" CHECK ((direction = ANY (ARRAY['inbound'::text, 'outbound'::text]))) not valid;
alter table "public"."sms_messages" validate constraint "sms_messages_direction_check";
alter table "public"."sms_messages" add constraint "sms_messages_thread_id_fkey" FOREIGN KEY (thread_id) REFERENCES public.sms_threads(id) ON DELETE CASCADE not valid;
alter table "public"."sms_messages" validate constraint "sms_messages_thread_id_fkey";
alter table "public"."sms_threads" add constraint "sms_threads_assigned_to_fkey" FOREIGN KEY (assigned_to) REFERENCES auth.users(id) ON DELETE SET NULL not valid;
alter table "public"."sms_threads" validate constraint "sms_threads_assigned_to_fkey";
alter table "public"."sms_threads" add constraint "sms_threads_channel_check" CHECK ((channel = ANY (ARRAY['sms'::text, 'whatsapp'::text]))) not valid;
alter table "public"."sms_threads" validate constraint "sms_threads_channel_check";
alter table "public"."sms_threads" add constraint "sms_threads_client_id_fkey" FOREIGN KEY (client_id) REFERENCES public.clients(id) ON DELETE CASCADE not valid;
alter table "public"."sms_threads" validate constraint "sms_threads_client_id_fkey";
alter table "public"."sms_threads" add constraint "sms_threads_client_id_phone_e164_channel_key" UNIQUE using index "sms_threads_client_id_phone_e164_channel_key";
alter table "public"."sms_threads" add constraint "sms_threads_contact_id_fkey" FOREIGN KEY (contact_id) REFERENCES public.contacts(id) ON DELETE SET NULL not valid;
alter table "public"."sms_threads" validate constraint "sms_threads_contact_id_fkey";
alter table "public"."sms_threads" add constraint "sms_threads_priority_check" CHECK ((priority = ANY (ARRAY['low'::text, 'normal'::text, 'high'::text]))) not valid;
alter table "public"."sms_threads" validate constraint "sms_threads_priority_check";
alter table "public"."sms_threads" add constraint "sms_threads_status_check" CHECK ((status = ANY (ARRAY['open'::text, 'pending'::text, 'waiting_on_client'::text, 'closed'::text]))) not valid;
alter table "public"."sms_threads" validate constraint "sms_threads_status_check";
alter table "public"."social_accounts" add constraint "social_accounts_client_id_fkey" FOREIGN KEY (client_id) REFERENCES public.clients(id) ON DELETE CASCADE not valid;
alter table "public"."social_accounts" validate constraint "social_accounts_client_id_fkey";
alter table "public"."social_accounts" add constraint "social_accounts_created_by_fkey" FOREIGN KEY (created_by) REFERENCES auth.users(id) not valid;
alter table "public"."social_accounts" validate constraint "social_accounts_created_by_fkey";
alter table "public"."social_accounts" add constraint "social_accounts_provider_check" CHECK ((provider = 'meta'::text)) not valid;
alter table "public"."social_accounts" validate constraint "social_accounts_provider_check";
alter table "public"."social_accounts" add constraint "social_accounts_status_check" CHECK ((status = ANY (ARRAY['connected'::text, 'revoked'::text, 'error'::text]))) not valid;
alter table "public"."social_accounts" validate constraint "social_accounts_status_check";
alter table "public"."social_messages" add constraint "social_messages_channel_check" CHECK ((channel = ANY (ARRAY['messenger'::text, 'instagram'::text, 'whatsapp'::text]))) not valid;
alter table "public"."social_messages" validate constraint "social_messages_channel_check";
alter table "public"."social_messages" add constraint "social_messages_client_id_external_message_id_key" UNIQUE using index "social_messages_client_id_external_message_id_key";
alter table "public"."social_messages" add constraint "social_messages_client_id_fkey" FOREIGN KEY (client_id) REFERENCES public.clients(id) ON DELETE CASCADE not valid;
alter table "public"."social_messages" validate constraint "social_messages_client_id_fkey";
alter table "public"."social_messages" add constraint "social_messages_contact_id_fkey" FOREIGN KEY (contact_id) REFERENCES public.contacts(id) ON DELETE SET NULL not valid;
alter table "public"."social_messages" validate constraint "social_messages_contact_id_fkey";
alter table "public"."social_messages" add constraint "social_messages_direction_check" CHECK ((direction = ANY (ARRAY['inbound'::text, 'outbound'::text]))) not valid;
alter table "public"."social_messages" validate constraint "social_messages_direction_check";
alter table "public"."social_messages" add constraint "social_messages_provider_check" CHECK ((provider = 'meta'::text)) not valid;
alter table "public"."social_messages" validate constraint "social_messages_provider_check";
alter table "public"."social_messages" add constraint "social_messages_thread_id_fkey" FOREIGN KEY (thread_id) REFERENCES public.social_threads(id) ON DELETE CASCADE not valid;
alter table "public"."social_messages" validate constraint "social_messages_thread_id_fkey";
alter table "public"."social_threads" add constraint "social_threads_assigned_to_fkey" FOREIGN KEY (assigned_to) REFERENCES auth.users(id) ON DELETE SET NULL not valid;
alter table "public"."social_threads" validate constraint "social_threads_assigned_to_fkey";
alter table "public"."social_threads" add constraint "social_threads_channel_check" CHECK ((channel = ANY (ARRAY['messenger'::text, 'instagram'::text, 'whatsapp'::text]))) not valid;
alter table "public"."social_threads" validate constraint "social_threads_channel_check";
alter table "public"."social_threads" add constraint "social_threads_client_id_external_thread_id_channel_provide_key" UNIQUE using index "social_threads_client_id_external_thread_id_channel_provide_key";
alter table "public"."social_threads" add constraint "social_threads_client_id_fkey" FOREIGN KEY (client_id) REFERENCES public.clients(id) ON DELETE CASCADE not valid;
alter table "public"."social_threads" validate constraint "social_threads_client_id_fkey";
alter table "public"."social_threads" add constraint "social_threads_contact_id_fkey" FOREIGN KEY (contact_id) REFERENCES public.contacts(id) ON DELETE SET NULL not valid;
alter table "public"."social_threads" validate constraint "social_threads_contact_id_fkey";
alter table "public"."social_threads" add constraint "social_threads_priority_check" CHECK ((priority = ANY (ARRAY['low'::text, 'normal'::text, 'high'::text]))) not valid;
alter table "public"."social_threads" validate constraint "social_threads_priority_check";
alter table "public"."social_threads" add constraint "social_threads_provider_check" CHECK ((provider = 'meta'::text)) not valid;
alter table "public"."social_threads" validate constraint "social_threads_provider_check";
alter table "public"."social_threads" add constraint "social_threads_status_check" CHECK ((status = ANY (ARRAY['open'::text, 'pending'::text, 'waiting_on_client'::text, 'closed'::text]))) not valid;
alter table "public"."social_threads" validate constraint "social_threads_status_check";
alter table "public"."social_webhook_events" add constraint "social_webhook_events_client_id_fkey" FOREIGN KEY (client_id) REFERENCES public.clients(id) ON DELETE CASCADE not valid;
alter table "public"."social_webhook_events" validate constraint "social_webhook_events_client_id_fkey";
alter table "public"."tasks" add constraint "tasks_assignee_user_id_fkey" FOREIGN KEY (assignee_user_id) REFERENCES auth.users(id) ON DELETE SET NULL not valid;
alter table "public"."tasks" validate constraint "tasks_assignee_user_id_fkey";
alter table "public"."tasks" add constraint "tasks_client_id_fkey" FOREIGN KEY (client_id) REFERENCES public.clients(id) ON DELETE CASCADE not valid;
alter table "public"."tasks" validate constraint "tasks_client_id_fkey";
alter table "public"."tasks" add constraint "tasks_created_by_fkey" FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL not valid;
alter table "public"."tasks" validate constraint "tasks_created_by_fkey";
alter table "public"."tasks" add constraint "tasks_priority_check" CHECK ((priority = ANY (ARRAY['low'::text, 'medium'::text, 'high'::text]))) not valid;
alter table "public"."tasks" validate constraint "tasks_priority_check";
alter table "public"."tasks" add constraint "tasks_status_check" CHECK ((status = ANY (ARRAY['todo'::text, 'in_progress'::text, 'done'::text, 'blocked'::text]))) not valid;
alter table "public"."tasks" validate constraint "tasks_status_check";
alter table "public"."user_settings" add constraint "user_settings_call_provider_check" CHECK ((call_provider = ANY (ARRAY['google_voice_lite'::text, 'phone_link'::text, 'twilio'::text]))) not valid;
alter table "public"."user_settings" validate constraint "user_settings_call_provider_check";
alter table "public"."user_settings" add constraint "user_settings_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE not valid;
alter table "public"."user_settings" validate constraint "user_settings_user_id_fkey";
alter table "public"."webhook_replay_requests" add constraint "webhook_replay_requests_requested_by_fkey" FOREIGN KEY (requested_by) REFERENCES auth.users(id) not valid;
alter table "public"."webhook_replay_requests" validate constraint "webhook_replay_requests_requested_by_fkey";
alter table "public"."webhook_replay_requests" add constraint "webhook_replay_requests_status_check" CHECK ((status = ANY (ARRAY['queued'::text, 'processing'::text, 'succeeded'::text, 'failed'::text]))) not valid;
alter table "public"."webhook_replay_requests" validate constraint "webhook_replay_requests_status_check";
set check_function_bodies = off;
create or replace view "public"."inbox_messages" as  SELECT m.id,
    m.client_id,
    m.thread_id,
    m.direction,
    m.channel,
    m.from_e164,
    m.to_e164,
    m.body,
    t.status,
    m.status AS message_status,
    m.provider_message_id,
    m.created_by,
    m.created_at,
    t.unread_count,
    t.assigned_to,
    t.last_message_at,
    'twilio'::text AS provider,
    t.contact_id,
    m.provider_message_id AS external_message_id,
    m.from_e164 AS external_sender_id,
    m.to_e164 AS external_recipient_id,
    '{}'::jsonb AS metadata
   FROM (public.sms_messages m
     JOIN public.sms_threads t ON ((t.id = m.thread_id)))
UNION ALL
 SELECT sm.id,
    sm.client_id,
    sm.thread_id,
    sm.direction,
    sm.channel,
    sm.external_sender_id AS from_e164,
    sm.external_recipient_id AS to_e164,
    sm.body,
    st.status,
    NULL::text AS message_status,
    NULL::text AS provider_message_id,
    NULL::uuid AS created_by,
    sm.created_at,
    st.unread_count,
    st.assigned_to,
    st.last_message_at,
    sm.provider,
    COALESCE(sm.contact_id, st.contact_id) AS contact_id,
    sm.external_message_id,
    sm.external_sender_id,
    sm.external_recipient_id,
    sm.metadata
   FROM (public.social_messages sm
     JOIN public.social_threads st ON ((st.id = sm.thread_id)));
create or replace view "public"."inbox_threads" as  SELECT st.id,
    st.client_id,
    COALESCE(st.contact_id, c_phone.id) AS contact_id,
    st.phone_e164,
    NULL::text AS external_thread_id,
    NULL::text AS external_user_id,
    st.channel,
    st.status,
    st.assigned_to,
    st.assigned_at,
    st.last_message_at,
    st.last_inbound_at,
    st.unread_count,
    st.priority,
    st.created_at,
    st.updated_at,
    COALESCE(c_direct.name, c_phone.name) AS contact_name,
    COALESCE(c_direct.first_name, c_phone.first_name) AS contact_first_name,
    COALESCE(c_direct.last_name, c_phone.last_name) AS contact_last_name,
    'twilio'::text AS provider,
    last_msg.direction,
    last_msg.body,
    first_inbound.first_inbound_at,
    first_response.first_response_at
   FROM (((((public.sms_threads st
     LEFT JOIN public.contacts c_direct ON ((c_direct.id = st.contact_id)))
     LEFT JOIN LATERAL ( SELECT c.id,
            c.name,
            c.first_name,
            c.last_name
           FROM public.contacts c
          WHERE ((c.client_id = st.client_id) AND (c.phone_e164 = st.phone_e164))
          ORDER BY c.updated_at DESC, c.created_at DESC
         LIMIT 1) c_phone ON (true))
     LEFT JOIN LATERAL ( SELECT m.direction,
            m.body
           FROM public.sms_messages m
          WHERE (m.thread_id = st.id)
          ORDER BY m.created_at DESC
         LIMIT 1) last_msg ON (true))
     LEFT JOIN LATERAL ( SELECT min(m.created_at) AS first_inbound_at
           FROM public.sms_messages m
          WHERE ((m.thread_id = st.id) AND (m.direction = 'inbound'::text))) first_inbound ON (true))
     LEFT JOIN LATERAL ( SELECT min(m.created_at) AS first_response_at
           FROM public.sms_messages m
          WHERE ((m.thread_id = st.id) AND (m.direction = 'outbound'::text) AND ((first_inbound.first_inbound_at IS NULL) OR (m.created_at >= first_inbound.first_inbound_at)))) first_response ON (true))
UNION ALL
 SELECT st.id,
    st.client_id,
    st.contact_id,
    COALESCE(st.external_user_id, st.external_thread_id) AS phone_e164,
    st.external_thread_id,
    st.external_user_id,
    st.channel,
    st.status,
    st.assigned_to,
    st.assigned_at,
    st.last_message_at,
    st.last_inbound_at,
    st.unread_count,
    st.priority,
    st.created_at,
    st.updated_at,
    c.name AS contact_name,
    c.first_name AS contact_first_name,
    c.last_name AS contact_last_name,
    st.provider,
    last_msg.direction,
    last_msg.body,
    first_inbound.first_inbound_at,
    first_response.first_response_at
   FROM ((((public.social_threads st
     LEFT JOIN public.contacts c ON ((c.id = st.contact_id)))
     LEFT JOIN LATERAL ( SELECT sm.direction,
            sm.body
           FROM public.social_messages sm
          WHERE (sm.thread_id = st.id)
          ORDER BY sm.created_at DESC
         LIMIT 1) last_msg ON (true))
     LEFT JOIN LATERAL ( SELECT min(sm.created_at) AS first_inbound_at
           FROM public.social_messages sm
          WHERE ((sm.thread_id = st.id) AND (sm.direction = 'inbound'::text))) first_inbound ON (true))
     LEFT JOIN LATERAL ( SELECT min(sm.created_at) AS first_response_at
           FROM public.social_messages sm
          WHERE ((sm.thread_id = st.id) AND (sm.direction = 'outbound'::text) AND ((first_inbound.first_inbound_at IS NULL) OR (sm.created_at >= first_inbound.first_inbound_at)))) first_response ON (true));
CREATE OR REPLACE FUNCTION public.is_internal()
 RETURNS boolean
 LANGUAGE sql
 STABLE
AS $function$
  select exists (
    select 1
    from public.profiles p
    where p.user_id = auth.uid()
      and p.role in ('admin','user','sales','partner')
  );
$function$;
CREATE OR REPLACE FUNCTION public.retention_delete(p_table text, p_older_than timestamp with time zone)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
declare
  v_count int;
begin
  execute format('delete from %I where created_at < $1', p_table)
    using p_older_than;
  get diagnostics v_count = row_count;
  return v_count;
end;
$function$;
CREATE OR REPLACE FUNCTION public.seed_client_rate_limits()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  insert into public.rate_limits (scope, scope_id, action, window_name, max_requests)
  values
    ('client', new.id::text, 'sms.send', 'day', 200),
    ('client', new.id::text, 'telephony.start', 'day', 50),
    ('client', new.id::text, 'doc.analyze', 'day', 25)
  on conflict (scope, scope_id, action, window_name) do nothing;

  return new;
end;
$function$;
CREATE OR REPLACE FUNCTION util.archive_cron_job_errors(p_older_than interval DEFAULT '30 days'::interval)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
declare
  v_count int;
begin
  insert into public.cron_job_errors_archive (
    id,
    job_name,
    function_name,
    request_url,
    payload,
    headers,
    payload_hash,
    status,
    attempt_count,
    max_attempts,
    next_retry_at,
    last_error,
    last_status,
    last_attempt_at,
    created_at,
    updated_at
  )
  select
    id,
    job_name,
    function_name,
    request_url,
    payload,
    headers,
    payload_hash,
    status,
    attempt_count,
    max_attempts,
    next_retry_at,
    last_error,
    last_status,
    last_attempt_at,
    created_at,
    updated_at
  from public.cron_job_errors
  where updated_at < now() - p_older_than
    and status in ('succeeded','failed');

  get diagnostics v_count = row_count;

  delete from public.cron_job_errors
  where updated_at < now() - p_older_than
    and status in ('succeeded','failed');

  return v_count;
end;
$function$;
CREATE OR REPLACE FUNCTION util.get_secret(secret_name text)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
declare
  v text;
begin
  select decrypted_secret into v
  from vault.decrypted_secrets
  where name = secret_name
  limit 1;

  if v is null then
    raise exception 'secret % not found in vault.decrypted_secrets', secret_name;
  end if;

  return v;
end;
$function$;
CREATE OR REPLACE FUNCTION util.invoke_edge_function(p_job_name text, p_function_name text, p_request_url text, p_payload jsonb, p_headers jsonb DEFAULT '{}'::jsonb, p_max_attempts integer DEFAULT 5)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
begin
  begin
    perform net.http_post(
      url := p_request_url,
      body := p_payload,
      headers := p_headers
    );
  exception when others then
    perform util.log_cron_job_error(
      p_job_name,
      p_function_name,
      p_request_url,
      p_payload,
      p_headers,
      null,
      sqlerrm,
      p_max_attempts
    );
  end;
end;
$function$;
CREATE OR REPLACE FUNCTION util.invoke_edge_function(path text, payload jsonb, timeout_ms integer DEFAULT 60000)
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
declare
  project_url text := util.get_secret('project_url');
  anon_key text := util.get_secret('anon_key');
  endpoint text := project_url || '/functions/v1/' || ltrim(path, '/');
  hdrs jsonb := jsonb_build_object(
    'Content-Type', 'application/json',
    'Authorization', 'Bearer ' || anon_key
  );
  req_id bigint;
begin
  if project_url is null or length(trim(project_url)) = 0 then
    raise exception 'project_url secret is empty';
  end if;

  -- net.http_post returns a request id (requires pg_net)
  req_id := net.http_post(
    url := endpoint,
    headers := hdrs,
    body := payload,
    timeout_milliseconds := timeout_ms
  );

  return req_id;
end;
$function$;
CREATE OR REPLACE FUNCTION util.log_cron_job_error(p_job_name text, p_function_name text, p_request_url text, p_payload jsonb, p_headers jsonb DEFAULT '{}'::jsonb, p_status integer DEFAULT NULL::integer, p_error text DEFAULT NULL::text, p_max_attempts integer DEFAULT 5)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
declare
  v_hash text := encode(digest(coalesce(p_payload::text, ''), 'sha256'), 'hex');
  v_id uuid;
  v_next_attempt int;
begin
  insert into public.cron_job_errors (
    job_name,
    function_name,
    request_url,
    payload,
    headers,
    payload_hash,
    status,
    attempt_count,
    max_attempts,
    next_retry_at,
    last_error,
    last_status,
    last_attempt_at
  )
  values (
    p_job_name,
    p_function_name,
    p_request_url,
    p_payload,
    p_headers,
    v_hash,
    'queued',
    1,
    p_max_attempts,
    util.next_retry_at(1),
    p_error,
    p_status,
    now()
  )
  on conflict (job_name, function_name, payload_hash)
  do update set
    request_url = excluded.request_url,
    payload = excluded.payload,
    headers = excluded.headers,
    max_attempts = excluded.max_attempts,
    last_error = excluded.last_error,
    last_status = excluded.last_status,
    last_attempt_at = excluded.last_attempt_at,
    attempt_count = public.cron_job_errors.attempt_count + 1,
    next_retry_at = util.next_retry_at(public.cron_job_errors.attempt_count + 1),
    status = case
      when public.cron_job_errors.attempt_count + 1 >= public.cron_job_errors.max_attempts
        then 'failed'
      else 'queued'
    end,
    updated_at = now()
  returning id into v_id;

  select attempt_count into v_next_attempt
  from public.cron_job_errors
  where id = v_id;

  if v_next_attempt >= p_max_attempts then
    update public.cron_job_errors
      set status = 'failed',
          updated_at = now()
    where id = v_id;
  end if;

  return v_id;
end;
$function$;
CREATE OR REPLACE FUNCTION util.next_retry_at(p_attempt integer)
 RETURNS timestamp with time zone
 LANGUAGE plpgsql
AS $function$
declare
  v_attempt int := greatest(p_attempt, 1);
  v_seconds int := least(3600, cast(power(2, v_attempt) * 30 as int));
begin
  return now() + make_interval(secs => v_seconds);
end;
$function$;
CREATE OR REPLACE FUNCTION util.retry_edge_function_errors(p_limit integer DEFAULT 25)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
declare
  v_row record;
  v_processed int := 0;
begin
  for v_row in
    select *
    from public.cron_job_errors
    where status in ('queued','retrying')
      and attempt_count < max_attempts
      and next_retry_at <= now()
    order by next_retry_at asc
    limit p_limit
  loop
    begin
      perform net.http_post(
        url := v_row.request_url,
        body := v_row.payload,
        headers := v_row.headers
      );

      update public.cron_job_errors
        set status = 'succeeded',
            last_attempt_at = now(),
            updated_at = now()
      where id = v_row.id;
    exception when others then
      update public.cron_job_errors
        set attempt_count = attempt_count + 1,
            last_attempt_at = now(),
            last_error = sqlerrm,
            status = case
              when attempt_count + 1 >= max_attempts then 'failed'
              else 'retrying'
            end,
            next_retry_at = util.next_retry_at(attempt_count + 1),
            updated_at = now()
      where id = v_row.id;
    end;

    v_processed := v_processed + 1;
  end loop;

  return v_processed;
end;
$function$;
CREATE OR REPLACE FUNCTION public.can_access_client(p_client_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  perform set_config('row_security', 'off', true);

  return
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
end;
$function$;
grant delete on table "public"."accounts" to "anon";
grant insert on table "public"."accounts" to "anon";
grant references on table "public"."accounts" to "anon";
grant select on table "public"."accounts" to "anon";
grant trigger on table "public"."accounts" to "anon";
grant truncate on table "public"."accounts" to "anon";
grant update on table "public"."accounts" to "anon";
grant delete on table "public"."accounts" to "authenticated";
grant insert on table "public"."accounts" to "authenticated";
grant references on table "public"."accounts" to "authenticated";
grant select on table "public"."accounts" to "authenticated";
grant trigger on table "public"."accounts" to "authenticated";
grant truncate on table "public"."accounts" to "authenticated";
grant update on table "public"."accounts" to "authenticated";
grant delete on table "public"."accounts" to "service_role";
grant insert on table "public"."accounts" to "service_role";
grant references on table "public"."accounts" to "service_role";
grant select on table "public"."accounts" to "service_role";
grant trigger on table "public"."accounts" to "service_role";
grant truncate on table "public"."accounts" to "service_role";
grant update on table "public"."accounts" to "service_role";
grant delete on table "public"."activities" to "anon";
grant insert on table "public"."activities" to "anon";
grant references on table "public"."activities" to "anon";
grant select on table "public"."activities" to "anon";
grant trigger on table "public"."activities" to "anon";
grant truncate on table "public"."activities" to "anon";
grant update on table "public"."activities" to "anon";
grant delete on table "public"."activities" to "authenticated";
grant insert on table "public"."activities" to "authenticated";
grant references on table "public"."activities" to "authenticated";
grant select on table "public"."activities" to "authenticated";
grant trigger on table "public"."activities" to "authenticated";
grant truncate on table "public"."activities" to "authenticated";
grant update on table "public"."activities" to "authenticated";
grant delete on table "public"."activities" to "service_role";
grant insert on table "public"."activities" to "service_role";
grant references on table "public"."activities" to "service_role";
grant select on table "public"."activities" to "service_role";
grant trigger on table "public"."activities" to "service_role";
grant truncate on table "public"."activities" to "service_role";
grant update on table "public"."activities" to "service_role";
grant delete on table "public"."call_events" to "anon";
grant insert on table "public"."call_events" to "anon";
grant references on table "public"."call_events" to "anon";
grant select on table "public"."call_events" to "anon";
grant trigger on table "public"."call_events" to "anon";
grant truncate on table "public"."call_events" to "anon";
grant update on table "public"."call_events" to "anon";
grant delete on table "public"."call_events" to "authenticated";
grant insert on table "public"."call_events" to "authenticated";
grant references on table "public"."call_events" to "authenticated";
grant select on table "public"."call_events" to "authenticated";
grant trigger on table "public"."call_events" to "authenticated";
grant truncate on table "public"."call_events" to "authenticated";
grant update on table "public"."call_events" to "authenticated";
grant delete on table "public"."call_events" to "service_role";
grant insert on table "public"."call_events" to "service_role";
grant references on table "public"."call_events" to "service_role";
grant select on table "public"."call_events" to "service_role";
grant trigger on table "public"."call_events" to "service_role";
grant truncate on table "public"."call_events" to "service_role";
grant update on table "public"."call_events" to "service_role";
grant delete on table "public"."call_logs" to "anon";
grant insert on table "public"."call_logs" to "anon";
grant references on table "public"."call_logs" to "anon";
grant select on table "public"."call_logs" to "anon";
grant trigger on table "public"."call_logs" to "anon";
grant truncate on table "public"."call_logs" to "anon";
grant update on table "public"."call_logs" to "anon";
grant delete on table "public"."call_logs" to "authenticated";
grant insert on table "public"."call_logs" to "authenticated";
grant references on table "public"."call_logs" to "authenticated";
grant select on table "public"."call_logs" to "authenticated";
grant trigger on table "public"."call_logs" to "authenticated";
grant truncate on table "public"."call_logs" to "authenticated";
grant update on table "public"."call_logs" to "authenticated";
grant delete on table "public"."call_logs" to "service_role";
grant insert on table "public"."call_logs" to "service_role";
grant references on table "public"."call_logs" to "service_role";
grant select on table "public"."call_logs" to "service_role";
grant trigger on table "public"."call_logs" to "service_role";
grant truncate on table "public"."call_logs" to "service_role";
grant update on table "public"."call_logs" to "service_role";
grant delete on table "public"."call_recordings" to "anon";
grant insert on table "public"."call_recordings" to "anon";
grant references on table "public"."call_recordings" to "anon";
grant select on table "public"."call_recordings" to "anon";
grant trigger on table "public"."call_recordings" to "anon";
grant truncate on table "public"."call_recordings" to "anon";
grant update on table "public"."call_recordings" to "anon";
grant delete on table "public"."call_recordings" to "authenticated";
grant insert on table "public"."call_recordings" to "authenticated";
grant references on table "public"."call_recordings" to "authenticated";
grant select on table "public"."call_recordings" to "authenticated";
grant trigger on table "public"."call_recordings" to "authenticated";
grant truncate on table "public"."call_recordings" to "authenticated";
grant update on table "public"."call_recordings" to "authenticated";
grant delete on table "public"."call_recordings" to "service_role";
grant insert on table "public"."call_recordings" to "service_role";
grant references on table "public"."call_recordings" to "service_role";
grant select on table "public"."call_recordings" to "service_role";
grant trigger on table "public"."call_recordings" to "service_role";
grant truncate on table "public"."call_recordings" to "service_role";
grant update on table "public"."call_recordings" to "service_role";
grant delete on table "public"."calls" to "anon";
grant insert on table "public"."calls" to "anon";
grant references on table "public"."calls" to "anon";
grant select on table "public"."calls" to "anon";
grant trigger on table "public"."calls" to "anon";
grant truncate on table "public"."calls" to "anon";
grant update on table "public"."calls" to "anon";
grant delete on table "public"."calls" to "authenticated";
grant insert on table "public"."calls" to "authenticated";
grant references on table "public"."calls" to "authenticated";
grant select on table "public"."calls" to "authenticated";
grant trigger on table "public"."calls" to "authenticated";
grant truncate on table "public"."calls" to "authenticated";
grant update on table "public"."calls" to "authenticated";
grant delete on table "public"."calls" to "service_role";
grant insert on table "public"."calls" to "service_role";
grant references on table "public"."calls" to "service_role";
grant select on table "public"."calls" to "service_role";
grant trigger on table "public"."calls" to "service_role";
grant truncate on table "public"."calls" to "service_role";
grant update on table "public"."calls" to "service_role";
grant delete on table "public"."client_phone_numbers" to "anon";
grant insert on table "public"."client_phone_numbers" to "anon";
grant references on table "public"."client_phone_numbers" to "anon";
grant select on table "public"."client_phone_numbers" to "anon";
grant trigger on table "public"."client_phone_numbers" to "anon";
grant truncate on table "public"."client_phone_numbers" to "anon";
grant update on table "public"."client_phone_numbers" to "anon";
grant delete on table "public"."client_phone_numbers" to "authenticated";
grant insert on table "public"."client_phone_numbers" to "authenticated";
grant references on table "public"."client_phone_numbers" to "authenticated";
grant select on table "public"."client_phone_numbers" to "authenticated";
grant trigger on table "public"."client_phone_numbers" to "authenticated";
grant truncate on table "public"."client_phone_numbers" to "authenticated";
grant update on table "public"."client_phone_numbers" to "authenticated";
grant delete on table "public"."client_phone_numbers" to "service_role";
grant insert on table "public"."client_phone_numbers" to "service_role";
grant references on table "public"."client_phone_numbers" to "service_role";
grant select on table "public"."client_phone_numbers" to "service_role";
grant trigger on table "public"."client_phone_numbers" to "service_role";
grant truncate on table "public"."client_phone_numbers" to "service_role";
grant update on table "public"."client_phone_numbers" to "service_role";
grant delete on table "public"."client_settings" to "anon";
grant insert on table "public"."client_settings" to "anon";
grant references on table "public"."client_settings" to "anon";
grant select on table "public"."client_settings" to "anon";
grant trigger on table "public"."client_settings" to "anon";
grant truncate on table "public"."client_settings" to "anon";
grant update on table "public"."client_settings" to "anon";
grant delete on table "public"."client_settings" to "authenticated";
grant insert on table "public"."client_settings" to "authenticated";
grant references on table "public"."client_settings" to "authenticated";
grant select on table "public"."client_settings" to "authenticated";
grant trigger on table "public"."client_settings" to "authenticated";
grant truncate on table "public"."client_settings" to "authenticated";
grant update on table "public"."client_settings" to "authenticated";
grant delete on table "public"."client_settings" to "service_role";
grant insert on table "public"."client_settings" to "service_role";
grant references on table "public"."client_settings" to "service_role";
grant select on table "public"."client_settings" to "service_role";
grant trigger on table "public"."client_settings" to "service_role";
grant truncate on table "public"."client_settings" to "service_role";
grant update on table "public"."client_settings" to "service_role";
grant delete on table "public"."comms_templates" to "anon";
grant insert on table "public"."comms_templates" to "anon";
grant references on table "public"."comms_templates" to "anon";
grant select on table "public"."comms_templates" to "anon";
grant trigger on table "public"."comms_templates" to "anon";
grant truncate on table "public"."comms_templates" to "anon";
grant update on table "public"."comms_templates" to "anon";
grant delete on table "public"."comms_templates" to "authenticated";
grant insert on table "public"."comms_templates" to "authenticated";
grant references on table "public"."comms_templates" to "authenticated";
grant select on table "public"."comms_templates" to "authenticated";
grant trigger on table "public"."comms_templates" to "authenticated";
grant truncate on table "public"."comms_templates" to "authenticated";
grant update on table "public"."comms_templates" to "authenticated";
grant delete on table "public"."comms_templates" to "service_role";
grant insert on table "public"."comms_templates" to "service_role";
grant references on table "public"."comms_templates" to "service_role";
grant select on table "public"."comms_templates" to "service_role";
grant trigger on table "public"."comms_templates" to "service_role";
grant truncate on table "public"."comms_templates" to "service_role";
grant update on table "public"."comms_templates" to "service_role";
grant delete on table "public"."contact_consent" to "anon";
grant insert on table "public"."contact_consent" to "anon";
grant references on table "public"."contact_consent" to "anon";
grant select on table "public"."contact_consent" to "anon";
grant trigger on table "public"."contact_consent" to "anon";
grant truncate on table "public"."contact_consent" to "anon";
grant update on table "public"."contact_consent" to "anon";
grant delete on table "public"."contact_consent" to "authenticated";
grant insert on table "public"."contact_consent" to "authenticated";
grant references on table "public"."contact_consent" to "authenticated";
grant select on table "public"."contact_consent" to "authenticated";
grant trigger on table "public"."contact_consent" to "authenticated";
grant truncate on table "public"."contact_consent" to "authenticated";
grant update on table "public"."contact_consent" to "authenticated";
grant delete on table "public"."contact_consent" to "service_role";
grant insert on table "public"."contact_consent" to "service_role";
grant references on table "public"."contact_consent" to "service_role";
grant select on table "public"."contact_consent" to "service_role";
grant trigger on table "public"."contact_consent" to "service_role";
grant truncate on table "public"."contact_consent" to "service_role";
grant update on table "public"."contact_consent" to "service_role";
grant delete on table "public"."contacts" to "anon";
grant insert on table "public"."contacts" to "anon";
grant references on table "public"."contacts" to "anon";
grant select on table "public"."contacts" to "anon";
grant trigger on table "public"."contacts" to "anon";
grant truncate on table "public"."contacts" to "anon";
grant update on table "public"."contacts" to "anon";
grant delete on table "public"."contacts" to "authenticated";
grant insert on table "public"."contacts" to "authenticated";
grant references on table "public"."contacts" to "authenticated";
grant select on table "public"."contacts" to "authenticated";
grant trigger on table "public"."contacts" to "authenticated";
grant truncate on table "public"."contacts" to "authenticated";
grant update on table "public"."contacts" to "authenticated";
grant delete on table "public"."contacts" to "service_role";
grant insert on table "public"."contacts" to "service_role";
grant references on table "public"."contacts" to "service_role";
grant select on table "public"."contacts" to "service_role";
grant trigger on table "public"."contacts" to "service_role";
grant truncate on table "public"."contacts" to "service_role";
grant update on table "public"."contacts" to "service_role";
grant delete on table "public"."cron_job_errors" to "anon";
grant insert on table "public"."cron_job_errors" to "anon";
grant references on table "public"."cron_job_errors" to "anon";
grant select on table "public"."cron_job_errors" to "anon";
grant trigger on table "public"."cron_job_errors" to "anon";
grant truncate on table "public"."cron_job_errors" to "anon";
grant update on table "public"."cron_job_errors" to "anon";
grant delete on table "public"."cron_job_errors" to "authenticated";
grant insert on table "public"."cron_job_errors" to "authenticated";
grant references on table "public"."cron_job_errors" to "authenticated";
grant select on table "public"."cron_job_errors" to "authenticated";
grant trigger on table "public"."cron_job_errors" to "authenticated";
grant truncate on table "public"."cron_job_errors" to "authenticated";
grant update on table "public"."cron_job_errors" to "authenticated";
grant delete on table "public"."cron_job_errors" to "service_role";
grant insert on table "public"."cron_job_errors" to "service_role";
grant references on table "public"."cron_job_errors" to "service_role";
grant select on table "public"."cron_job_errors" to "service_role";
grant trigger on table "public"."cron_job_errors" to "service_role";
grant truncate on table "public"."cron_job_errors" to "service_role";
grant update on table "public"."cron_job_errors" to "service_role";
grant delete on table "public"."cron_job_errors_archive" to "anon";
grant insert on table "public"."cron_job_errors_archive" to "anon";
grant references on table "public"."cron_job_errors_archive" to "anon";
grant select on table "public"."cron_job_errors_archive" to "anon";
grant trigger on table "public"."cron_job_errors_archive" to "anon";
grant truncate on table "public"."cron_job_errors_archive" to "anon";
grant update on table "public"."cron_job_errors_archive" to "anon";
grant delete on table "public"."cron_job_errors_archive" to "authenticated";
grant insert on table "public"."cron_job_errors_archive" to "authenticated";
grant references on table "public"."cron_job_errors_archive" to "authenticated";
grant select on table "public"."cron_job_errors_archive" to "authenticated";
grant trigger on table "public"."cron_job_errors_archive" to "authenticated";
grant truncate on table "public"."cron_job_errors_archive" to "authenticated";
grant update on table "public"."cron_job_errors_archive" to "authenticated";
grant delete on table "public"."cron_job_errors_archive" to "service_role";
grant insert on table "public"."cron_job_errors_archive" to "service_role";
grant references on table "public"."cron_job_errors_archive" to "service_role";
grant select on table "public"."cron_job_errors_archive" to "service_role";
grant trigger on table "public"."cron_job_errors_archive" to "service_role";
grant truncate on table "public"."cron_job_errors_archive" to "service_role";
grant update on table "public"."cron_job_errors_archive" to "service_role";
grant delete on table "public"."data_exports" to "anon";
grant insert on table "public"."data_exports" to "anon";
grant references on table "public"."data_exports" to "anon";
grant select on table "public"."data_exports" to "anon";
grant trigger on table "public"."data_exports" to "anon";
grant truncate on table "public"."data_exports" to "anon";
grant update on table "public"."data_exports" to "anon";
grant delete on table "public"."data_exports" to "authenticated";
grant insert on table "public"."data_exports" to "authenticated";
grant references on table "public"."data_exports" to "authenticated";
grant select on table "public"."data_exports" to "authenticated";
grant trigger on table "public"."data_exports" to "authenticated";
grant truncate on table "public"."data_exports" to "authenticated";
grant update on table "public"."data_exports" to "authenticated";
grant delete on table "public"."data_exports" to "service_role";
grant insert on table "public"."data_exports" to "service_role";
grant references on table "public"."data_exports" to "service_role";
grant select on table "public"."data_exports" to "service_role";
grant trigger on table "public"."data_exports" to "service_role";
grant truncate on table "public"."data_exports" to "service_role";
grant update on table "public"."data_exports" to "service_role";
grant delete on table "public"."deal_stages" to "anon";
grant insert on table "public"."deal_stages" to "anon";
grant references on table "public"."deal_stages" to "anon";
grant select on table "public"."deal_stages" to "anon";
grant trigger on table "public"."deal_stages" to "anon";
grant truncate on table "public"."deal_stages" to "anon";
grant update on table "public"."deal_stages" to "anon";
grant delete on table "public"."deal_stages" to "authenticated";
grant insert on table "public"."deal_stages" to "authenticated";
grant references on table "public"."deal_stages" to "authenticated";
grant select on table "public"."deal_stages" to "authenticated";
grant trigger on table "public"."deal_stages" to "authenticated";
grant truncate on table "public"."deal_stages" to "authenticated";
grant update on table "public"."deal_stages" to "authenticated";
grant delete on table "public"."deal_stages" to "service_role";
grant insert on table "public"."deal_stages" to "service_role";
grant references on table "public"."deal_stages" to "service_role";
grant select on table "public"."deal_stages" to "service_role";
grant trigger on table "public"."deal_stages" to "service_role";
grant truncate on table "public"."deal_stages" to "service_role";
grant update on table "public"."deal_stages" to "service_role";
grant delete on table "public"."deals" to "anon";
grant insert on table "public"."deals" to "anon";
grant references on table "public"."deals" to "anon";
grant select on table "public"."deals" to "anon";
grant trigger on table "public"."deals" to "anon";
grant truncate on table "public"."deals" to "anon";
grant update on table "public"."deals" to "anon";
grant delete on table "public"."deals" to "authenticated";
grant insert on table "public"."deals" to "authenticated";
grant references on table "public"."deals" to "authenticated";
grant select on table "public"."deals" to "authenticated";
grant trigger on table "public"."deals" to "authenticated";
grant truncate on table "public"."deals" to "authenticated";
grant update on table "public"."deals" to "authenticated";
grant delete on table "public"."deals" to "service_role";
grant insert on table "public"."deals" to "service_role";
grant references on table "public"."deals" to "service_role";
grant select on table "public"."deals" to "service_role";
grant trigger on table "public"."deals" to "service_role";
grant truncate on table "public"."deals" to "service_role";
grant update on table "public"."deals" to "service_role";
grant delete on table "public"."do_not_contact" to "anon";
grant insert on table "public"."do_not_contact" to "anon";
grant references on table "public"."do_not_contact" to "anon";
grant select on table "public"."do_not_contact" to "anon";
grant trigger on table "public"."do_not_contact" to "anon";
grant truncate on table "public"."do_not_contact" to "anon";
grant update on table "public"."do_not_contact" to "anon";
grant delete on table "public"."do_not_contact" to "authenticated";
grant insert on table "public"."do_not_contact" to "authenticated";
grant references on table "public"."do_not_contact" to "authenticated";
grant select on table "public"."do_not_contact" to "authenticated";
grant trigger on table "public"."do_not_contact" to "authenticated";
grant truncate on table "public"."do_not_contact" to "authenticated";
grant update on table "public"."do_not_contact" to "authenticated";
grant delete on table "public"."do_not_contact" to "service_role";
grant insert on table "public"."do_not_contact" to "service_role";
grant references on table "public"."do_not_contact" to "service_role";
grant select on table "public"."do_not_contact" to "service_role";
grant trigger on table "public"."do_not_contact" to "service_role";
grant truncate on table "public"."do_not_contact" to "service_role";
grant update on table "public"."do_not_contact" to "service_role";
grant delete on table "public"."inbox_notes" to "anon";
grant insert on table "public"."inbox_notes" to "anon";
grant references on table "public"."inbox_notes" to "anon";
grant select on table "public"."inbox_notes" to "anon";
grant trigger on table "public"."inbox_notes" to "anon";
grant truncate on table "public"."inbox_notes" to "anon";
grant update on table "public"."inbox_notes" to "anon";
grant delete on table "public"."inbox_notes" to "authenticated";
grant insert on table "public"."inbox_notes" to "authenticated";
grant references on table "public"."inbox_notes" to "authenticated";
grant select on table "public"."inbox_notes" to "authenticated";
grant trigger on table "public"."inbox_notes" to "authenticated";
grant truncate on table "public"."inbox_notes" to "authenticated";
grant update on table "public"."inbox_notes" to "authenticated";
grant delete on table "public"."inbox_notes" to "service_role";
grant insert on table "public"."inbox_notes" to "service_role";
grant references on table "public"."inbox_notes" to "service_role";
grant select on table "public"."inbox_notes" to "service_role";
grant trigger on table "public"."inbox_notes" to "service_role";
grant truncate on table "public"."inbox_notes" to "service_role";
grant update on table "public"."inbox_notes" to "service_role";
grant delete on table "public"."matrix_client_rooms" to "anon";
grant insert on table "public"."matrix_client_rooms" to "anon";
grant references on table "public"."matrix_client_rooms" to "anon";
grant select on table "public"."matrix_client_rooms" to "anon";
grant trigger on table "public"."matrix_client_rooms" to "anon";
grant truncate on table "public"."matrix_client_rooms" to "anon";
grant update on table "public"."matrix_client_rooms" to "anon";
grant delete on table "public"."matrix_client_rooms" to "authenticated";
grant insert on table "public"."matrix_client_rooms" to "authenticated";
grant references on table "public"."matrix_client_rooms" to "authenticated";
grant select on table "public"."matrix_client_rooms" to "authenticated";
grant trigger on table "public"."matrix_client_rooms" to "authenticated";
grant truncate on table "public"."matrix_client_rooms" to "authenticated";
grant update on table "public"."matrix_client_rooms" to "authenticated";
grant delete on table "public"."matrix_client_rooms" to "service_role";
grant insert on table "public"."matrix_client_rooms" to "service_role";
grant references on table "public"."matrix_client_rooms" to "service_role";
grant select on table "public"."matrix_client_rooms" to "service_role";
grant trigger on table "public"."matrix_client_rooms" to "service_role";
grant truncate on table "public"."matrix_client_rooms" to "service_role";
grant update on table "public"."matrix_client_rooms" to "service_role";
grant delete on table "public"."matrix_users" to "anon";
grant insert on table "public"."matrix_users" to "anon";
grant references on table "public"."matrix_users" to "anon";
grant select on table "public"."matrix_users" to "anon";
grant trigger on table "public"."matrix_users" to "anon";
grant truncate on table "public"."matrix_users" to "anon";
grant update on table "public"."matrix_users" to "anon";
grant delete on table "public"."matrix_users" to "authenticated";
grant insert on table "public"."matrix_users" to "authenticated";
grant references on table "public"."matrix_users" to "authenticated";
grant select on table "public"."matrix_users" to "authenticated";
grant trigger on table "public"."matrix_users" to "authenticated";
grant truncate on table "public"."matrix_users" to "authenticated";
grant update on table "public"."matrix_users" to "authenticated";
grant delete on table "public"."matrix_users" to "service_role";
grant insert on table "public"."matrix_users" to "service_role";
grant references on table "public"."matrix_users" to "service_role";
grant select on table "public"."matrix_users" to "service_role";
grant trigger on table "public"."matrix_users" to "service_role";
grant truncate on table "public"."matrix_users" to "service_role";
grant update on table "public"."matrix_users" to "service_role";
grant delete on table "public"."meeting_attendees" to "anon";
grant insert on table "public"."meeting_attendees" to "anon";
grant references on table "public"."meeting_attendees" to "anon";
grant select on table "public"."meeting_attendees" to "anon";
grant trigger on table "public"."meeting_attendees" to "anon";
grant truncate on table "public"."meeting_attendees" to "anon";
grant update on table "public"."meeting_attendees" to "anon";
grant delete on table "public"."meeting_attendees" to "authenticated";
grant insert on table "public"."meeting_attendees" to "authenticated";
grant references on table "public"."meeting_attendees" to "authenticated";
grant select on table "public"."meeting_attendees" to "authenticated";
grant trigger on table "public"."meeting_attendees" to "authenticated";
grant truncate on table "public"."meeting_attendees" to "authenticated";
grant update on table "public"."meeting_attendees" to "authenticated";
grant delete on table "public"."meeting_attendees" to "service_role";
grant insert on table "public"."meeting_attendees" to "service_role";
grant references on table "public"."meeting_attendees" to "service_role";
grant select on table "public"."meeting_attendees" to "service_role";
grant trigger on table "public"."meeting_attendees" to "service_role";
grant truncate on table "public"."meeting_attendees" to "service_role";
grant update on table "public"."meeting_attendees" to "service_role";
grant delete on table "public"."meeting_providers" to "anon";
grant insert on table "public"."meeting_providers" to "anon";
grant references on table "public"."meeting_providers" to "anon";
grant select on table "public"."meeting_providers" to "anon";
grant trigger on table "public"."meeting_providers" to "anon";
grant truncate on table "public"."meeting_providers" to "anon";
grant update on table "public"."meeting_providers" to "anon";
grant delete on table "public"."meeting_providers" to "authenticated";
grant insert on table "public"."meeting_providers" to "authenticated";
grant references on table "public"."meeting_providers" to "authenticated";
grant select on table "public"."meeting_providers" to "authenticated";
grant trigger on table "public"."meeting_providers" to "authenticated";
grant truncate on table "public"."meeting_providers" to "authenticated";
grant update on table "public"."meeting_providers" to "authenticated";
grant delete on table "public"."meeting_providers" to "service_role";
grant insert on table "public"."meeting_providers" to "service_role";
grant references on table "public"."meeting_providers" to "service_role";
grant select on table "public"."meeting_providers" to "service_role";
grant trigger on table "public"."meeting_providers" to "service_role";
grant truncate on table "public"."meeting_providers" to "service_role";
grant update on table "public"."meeting_providers" to "service_role";
grant delete on table "public"."meeting_webhook_events" to "anon";
grant insert on table "public"."meeting_webhook_events" to "anon";
grant references on table "public"."meeting_webhook_events" to "anon";
grant select on table "public"."meeting_webhook_events" to "anon";
grant trigger on table "public"."meeting_webhook_events" to "anon";
grant truncate on table "public"."meeting_webhook_events" to "anon";
grant update on table "public"."meeting_webhook_events" to "anon";
grant delete on table "public"."meeting_webhook_events" to "authenticated";
grant insert on table "public"."meeting_webhook_events" to "authenticated";
grant references on table "public"."meeting_webhook_events" to "authenticated";
grant select on table "public"."meeting_webhook_events" to "authenticated";
grant trigger on table "public"."meeting_webhook_events" to "authenticated";
grant truncate on table "public"."meeting_webhook_events" to "authenticated";
grant update on table "public"."meeting_webhook_events" to "authenticated";
grant delete on table "public"."meeting_webhook_events" to "service_role";
grant insert on table "public"."meeting_webhook_events" to "service_role";
grant references on table "public"."meeting_webhook_events" to "service_role";
grant select on table "public"."meeting_webhook_events" to "service_role";
grant trigger on table "public"."meeting_webhook_events" to "service_role";
grant truncate on table "public"."meeting_webhook_events" to "service_role";
grant update on table "public"."meeting_webhook_events" to "service_role";
grant delete on table "public"."meetings" to "anon";
grant insert on table "public"."meetings" to "anon";
grant references on table "public"."meetings" to "anon";
grant select on table "public"."meetings" to "anon";
grant trigger on table "public"."meetings" to "anon";
grant truncate on table "public"."meetings" to "anon";
grant update on table "public"."meetings" to "anon";
grant delete on table "public"."meetings" to "authenticated";
grant insert on table "public"."meetings" to "authenticated";
grant references on table "public"."meetings" to "authenticated";
grant select on table "public"."meetings" to "authenticated";
grant trigger on table "public"."meetings" to "authenticated";
grant truncate on table "public"."meetings" to "authenticated";
grant update on table "public"."meetings" to "authenticated";
grant delete on table "public"."meetings" to "service_role";
grant insert on table "public"."meetings" to "service_role";
grant references on table "public"."meetings" to "service_role";
grant select on table "public"."meetings" to "service_role";
grant trigger on table "public"."meetings" to "service_role";
grant truncate on table "public"."meetings" to "service_role";
grant update on table "public"."meetings" to "service_role";
grant delete on table "public"."meta_webhook_failures" to "anon";
grant insert on table "public"."meta_webhook_failures" to "anon";
grant references on table "public"."meta_webhook_failures" to "anon";
grant select on table "public"."meta_webhook_failures" to "anon";
grant trigger on table "public"."meta_webhook_failures" to "anon";
grant truncate on table "public"."meta_webhook_failures" to "anon";
grant update on table "public"."meta_webhook_failures" to "anon";
grant delete on table "public"."meta_webhook_failures" to "authenticated";
grant insert on table "public"."meta_webhook_failures" to "authenticated";
grant references on table "public"."meta_webhook_failures" to "authenticated";
grant select on table "public"."meta_webhook_failures" to "authenticated";
grant trigger on table "public"."meta_webhook_failures" to "authenticated";
grant truncate on table "public"."meta_webhook_failures" to "authenticated";
grant update on table "public"."meta_webhook_failures" to "authenticated";
grant delete on table "public"."meta_webhook_failures" to "service_role";
grant insert on table "public"."meta_webhook_failures" to "service_role";
grant references on table "public"."meta_webhook_failures" to "service_role";
grant select on table "public"."meta_webhook_failures" to "service_role";
grant trigger on table "public"."meta_webhook_failures" to "service_role";
grant truncate on table "public"."meta_webhook_failures" to "service_role";
grant update on table "public"."meta_webhook_failures" to "service_role";
grant delete on table "public"."rate_limits_legacy" to "anon";
grant insert on table "public"."rate_limits_legacy" to "anon";
grant references on table "public"."rate_limits_legacy" to "anon";
grant select on table "public"."rate_limits_legacy" to "anon";
grant trigger on table "public"."rate_limits_legacy" to "anon";
grant truncate on table "public"."rate_limits_legacy" to "anon";
grant update on table "public"."rate_limits_legacy" to "anon";
grant delete on table "public"."rate_limits_legacy" to "authenticated";
grant insert on table "public"."rate_limits_legacy" to "authenticated";
grant references on table "public"."rate_limits_legacy" to "authenticated";
grant select on table "public"."rate_limits_legacy" to "authenticated";
grant trigger on table "public"."rate_limits_legacy" to "authenticated";
grant truncate on table "public"."rate_limits_legacy" to "authenticated";
grant update on table "public"."rate_limits_legacy" to "authenticated";
grant delete on table "public"."rate_limits_legacy" to "service_role";
grant insert on table "public"."rate_limits_legacy" to "service_role";
grant references on table "public"."rate_limits_legacy" to "service_role";
grant select on table "public"."rate_limits_legacy" to "service_role";
grant trigger on table "public"."rate_limits_legacy" to "service_role";
grant truncate on table "public"."rate_limits_legacy" to "service_role";
grant update on table "public"."rate_limits_legacy" to "service_role";
grant delete on table "public"."retention_policies" to "anon";
grant insert on table "public"."retention_policies" to "anon";
grant references on table "public"."retention_policies" to "anon";
grant select on table "public"."retention_policies" to "anon";
grant trigger on table "public"."retention_policies" to "anon";
grant truncate on table "public"."retention_policies" to "anon";
grant update on table "public"."retention_policies" to "anon";
grant delete on table "public"."retention_policies" to "authenticated";
grant insert on table "public"."retention_policies" to "authenticated";
grant references on table "public"."retention_policies" to "authenticated";
grant select on table "public"."retention_policies" to "authenticated";
grant trigger on table "public"."retention_policies" to "authenticated";
grant truncate on table "public"."retention_policies" to "authenticated";
grant update on table "public"."retention_policies" to "authenticated";
grant delete on table "public"."retention_policies" to "service_role";
grant insert on table "public"."retention_policies" to "service_role";
grant references on table "public"."retention_policies" to "service_role";
grant select on table "public"."retention_policies" to "service_role";
grant trigger on table "public"."retention_policies" to "service_role";
grant truncate on table "public"."retention_policies" to "service_role";
grant update on table "public"."retention_policies" to "service_role";
grant delete on table "public"."security_events" to "anon";
grant insert on table "public"."security_events" to "anon";
grant references on table "public"."security_events" to "anon";
grant select on table "public"."security_events" to "anon";
grant trigger on table "public"."security_events" to "anon";
grant truncate on table "public"."security_events" to "anon";
grant update on table "public"."security_events" to "anon";
grant delete on table "public"."security_events" to "authenticated";
grant insert on table "public"."security_events" to "authenticated";
grant references on table "public"."security_events" to "authenticated";
grant select on table "public"."security_events" to "authenticated";
grant trigger on table "public"."security_events" to "authenticated";
grant truncate on table "public"."security_events" to "authenticated";
grant update on table "public"."security_events" to "authenticated";
grant delete on table "public"."security_events" to "service_role";
grant insert on table "public"."security_events" to "service_role";
grant references on table "public"."security_events" to "service_role";
grant select on table "public"."security_events" to "service_role";
grant trigger on table "public"."security_events" to "service_role";
grant truncate on table "public"."security_events" to "service_role";
grant update on table "public"."security_events" to "service_role";
grant delete on table "public"."sms_messages" to "anon";
grant insert on table "public"."sms_messages" to "anon";
grant references on table "public"."sms_messages" to "anon";
grant select on table "public"."sms_messages" to "anon";
grant trigger on table "public"."sms_messages" to "anon";
grant truncate on table "public"."sms_messages" to "anon";
grant update on table "public"."sms_messages" to "anon";
grant delete on table "public"."sms_messages" to "authenticated";
grant insert on table "public"."sms_messages" to "authenticated";
grant references on table "public"."sms_messages" to "authenticated";
grant select on table "public"."sms_messages" to "authenticated";
grant trigger on table "public"."sms_messages" to "authenticated";
grant truncate on table "public"."sms_messages" to "authenticated";
grant update on table "public"."sms_messages" to "authenticated";
grant delete on table "public"."sms_messages" to "service_role";
grant insert on table "public"."sms_messages" to "service_role";
grant references on table "public"."sms_messages" to "service_role";
grant select on table "public"."sms_messages" to "service_role";
grant trigger on table "public"."sms_messages" to "service_role";
grant truncate on table "public"."sms_messages" to "service_role";
grant update on table "public"."sms_messages" to "service_role";
grant delete on table "public"."sms_threads" to "anon";
grant insert on table "public"."sms_threads" to "anon";
grant references on table "public"."sms_threads" to "anon";
grant select on table "public"."sms_threads" to "anon";
grant trigger on table "public"."sms_threads" to "anon";
grant truncate on table "public"."sms_threads" to "anon";
grant update on table "public"."sms_threads" to "anon";
grant delete on table "public"."sms_threads" to "authenticated";
grant insert on table "public"."sms_threads" to "authenticated";
grant references on table "public"."sms_threads" to "authenticated";
grant select on table "public"."sms_threads" to "authenticated";
grant trigger on table "public"."sms_threads" to "authenticated";
grant truncate on table "public"."sms_threads" to "authenticated";
grant update on table "public"."sms_threads" to "authenticated";
grant delete on table "public"."sms_threads" to "service_role";
grant insert on table "public"."sms_threads" to "service_role";
grant references on table "public"."sms_threads" to "service_role";
grant select on table "public"."sms_threads" to "service_role";
grant trigger on table "public"."sms_threads" to "service_role";
grant truncate on table "public"."sms_threads" to "service_role";
grant update on table "public"."sms_threads" to "service_role";
grant delete on table "public"."social_accounts" to "anon";
grant insert on table "public"."social_accounts" to "anon";
grant references on table "public"."social_accounts" to "anon";
grant select on table "public"."social_accounts" to "anon";
grant trigger on table "public"."social_accounts" to "anon";
grant truncate on table "public"."social_accounts" to "anon";
grant update on table "public"."social_accounts" to "anon";
grant delete on table "public"."social_accounts" to "authenticated";
grant insert on table "public"."social_accounts" to "authenticated";
grant references on table "public"."social_accounts" to "authenticated";
grant select on table "public"."social_accounts" to "authenticated";
grant trigger on table "public"."social_accounts" to "authenticated";
grant truncate on table "public"."social_accounts" to "authenticated";
grant update on table "public"."social_accounts" to "authenticated";
grant delete on table "public"."social_accounts" to "service_role";
grant insert on table "public"."social_accounts" to "service_role";
grant references on table "public"."social_accounts" to "service_role";
grant select on table "public"."social_accounts" to "service_role";
grant trigger on table "public"."social_accounts" to "service_role";
grant truncate on table "public"."social_accounts" to "service_role";
grant update on table "public"."social_accounts" to "service_role";
grant delete on table "public"."social_messages" to "anon";
grant insert on table "public"."social_messages" to "anon";
grant references on table "public"."social_messages" to "anon";
grant select on table "public"."social_messages" to "anon";
grant trigger on table "public"."social_messages" to "anon";
grant truncate on table "public"."social_messages" to "anon";
grant update on table "public"."social_messages" to "anon";
grant delete on table "public"."social_messages" to "authenticated";
grant insert on table "public"."social_messages" to "authenticated";
grant references on table "public"."social_messages" to "authenticated";
grant select on table "public"."social_messages" to "authenticated";
grant trigger on table "public"."social_messages" to "authenticated";
grant truncate on table "public"."social_messages" to "authenticated";
grant update on table "public"."social_messages" to "authenticated";
grant delete on table "public"."social_messages" to "service_role";
grant insert on table "public"."social_messages" to "service_role";
grant references on table "public"."social_messages" to "service_role";
grant select on table "public"."social_messages" to "service_role";
grant trigger on table "public"."social_messages" to "service_role";
grant truncate on table "public"."social_messages" to "service_role";
grant update on table "public"."social_messages" to "service_role";
grant delete on table "public"."social_threads" to "anon";
grant insert on table "public"."social_threads" to "anon";
grant references on table "public"."social_threads" to "anon";
grant select on table "public"."social_threads" to "anon";
grant trigger on table "public"."social_threads" to "anon";
grant truncate on table "public"."social_threads" to "anon";
grant update on table "public"."social_threads" to "anon";
grant delete on table "public"."social_threads" to "authenticated";
grant insert on table "public"."social_threads" to "authenticated";
grant references on table "public"."social_threads" to "authenticated";
grant select on table "public"."social_threads" to "authenticated";
grant trigger on table "public"."social_threads" to "authenticated";
grant truncate on table "public"."social_threads" to "authenticated";
grant update on table "public"."social_threads" to "authenticated";
grant delete on table "public"."social_threads" to "service_role";
grant insert on table "public"."social_threads" to "service_role";
grant references on table "public"."social_threads" to "service_role";
grant select on table "public"."social_threads" to "service_role";
grant trigger on table "public"."social_threads" to "service_role";
grant truncate on table "public"."social_threads" to "service_role";
grant update on table "public"."social_threads" to "service_role";
grant delete on table "public"."social_webhook_events" to "anon";
grant insert on table "public"."social_webhook_events" to "anon";
grant references on table "public"."social_webhook_events" to "anon";
grant select on table "public"."social_webhook_events" to "anon";
grant trigger on table "public"."social_webhook_events" to "anon";
grant truncate on table "public"."social_webhook_events" to "anon";
grant update on table "public"."social_webhook_events" to "anon";
grant delete on table "public"."social_webhook_events" to "authenticated";
grant insert on table "public"."social_webhook_events" to "authenticated";
grant references on table "public"."social_webhook_events" to "authenticated";
grant select on table "public"."social_webhook_events" to "authenticated";
grant trigger on table "public"."social_webhook_events" to "authenticated";
grant truncate on table "public"."social_webhook_events" to "authenticated";
grant update on table "public"."social_webhook_events" to "authenticated";
grant delete on table "public"."social_webhook_events" to "service_role";
grant insert on table "public"."social_webhook_events" to "service_role";
grant references on table "public"."social_webhook_events" to "service_role";
grant select on table "public"."social_webhook_events" to "service_role";
grant trigger on table "public"."social_webhook_events" to "service_role";
grant truncate on table "public"."social_webhook_events" to "service_role";
grant update on table "public"."social_webhook_events" to "service_role";
grant delete on table "public"."tasks" to "anon";
grant insert on table "public"."tasks" to "anon";
grant references on table "public"."tasks" to "anon";
grant select on table "public"."tasks" to "anon";
grant trigger on table "public"."tasks" to "anon";
grant truncate on table "public"."tasks" to "anon";
grant update on table "public"."tasks" to "anon";
grant delete on table "public"."tasks" to "authenticated";
grant insert on table "public"."tasks" to "authenticated";
grant references on table "public"."tasks" to "authenticated";
grant select on table "public"."tasks" to "authenticated";
grant trigger on table "public"."tasks" to "authenticated";
grant truncate on table "public"."tasks" to "authenticated";
grant update on table "public"."tasks" to "authenticated";
grant delete on table "public"."tasks" to "service_role";
grant insert on table "public"."tasks" to "service_role";
grant references on table "public"."tasks" to "service_role";
grant select on table "public"."tasks" to "service_role";
grant trigger on table "public"."tasks" to "service_role";
grant truncate on table "public"."tasks" to "service_role";
grant update on table "public"."tasks" to "service_role";
grant delete on table "public"."twilio_webhook_failures" to "anon";
grant insert on table "public"."twilio_webhook_failures" to "anon";
grant references on table "public"."twilio_webhook_failures" to "anon";
grant select on table "public"."twilio_webhook_failures" to "anon";
grant trigger on table "public"."twilio_webhook_failures" to "anon";
grant truncate on table "public"."twilio_webhook_failures" to "anon";
grant update on table "public"."twilio_webhook_failures" to "anon";
grant delete on table "public"."twilio_webhook_failures" to "authenticated";
grant insert on table "public"."twilio_webhook_failures" to "authenticated";
grant references on table "public"."twilio_webhook_failures" to "authenticated";
grant select on table "public"."twilio_webhook_failures" to "authenticated";
grant trigger on table "public"."twilio_webhook_failures" to "authenticated";
grant truncate on table "public"."twilio_webhook_failures" to "authenticated";
grant update on table "public"."twilio_webhook_failures" to "authenticated";
grant delete on table "public"."twilio_webhook_failures" to "service_role";
grant insert on table "public"."twilio_webhook_failures" to "service_role";
grant references on table "public"."twilio_webhook_failures" to "service_role";
grant select on table "public"."twilio_webhook_failures" to "service_role";
grant trigger on table "public"."twilio_webhook_failures" to "service_role";
grant truncate on table "public"."twilio_webhook_failures" to "service_role";
grant update on table "public"."twilio_webhook_failures" to "service_role";
grant delete on table "public"."user_settings" to "anon";
grant insert on table "public"."user_settings" to "anon";
grant references on table "public"."user_settings" to "anon";
grant select on table "public"."user_settings" to "anon";
grant trigger on table "public"."user_settings" to "anon";
grant truncate on table "public"."user_settings" to "anon";
grant update on table "public"."user_settings" to "anon";
grant delete on table "public"."user_settings" to "authenticated";
grant insert on table "public"."user_settings" to "authenticated";
grant references on table "public"."user_settings" to "authenticated";
grant select on table "public"."user_settings" to "authenticated";
grant trigger on table "public"."user_settings" to "authenticated";
grant truncate on table "public"."user_settings" to "authenticated";
grant update on table "public"."user_settings" to "authenticated";
grant delete on table "public"."user_settings" to "service_role";
grant insert on table "public"."user_settings" to "service_role";
grant references on table "public"."user_settings" to "service_role";
grant select on table "public"."user_settings" to "service_role";
grant trigger on table "public"."user_settings" to "service_role";
grant truncate on table "public"."user_settings" to "service_role";
grant update on table "public"."user_settings" to "service_role";
grant delete on table "public"."webhook_replay_requests" to "anon";
grant insert on table "public"."webhook_replay_requests" to "anon";
grant references on table "public"."webhook_replay_requests" to "anon";
grant select on table "public"."webhook_replay_requests" to "anon";
grant trigger on table "public"."webhook_replay_requests" to "anon";
grant truncate on table "public"."webhook_replay_requests" to "anon";
grant update on table "public"."webhook_replay_requests" to "anon";
grant delete on table "public"."webhook_replay_requests" to "authenticated";
grant insert on table "public"."webhook_replay_requests" to "authenticated";
grant references on table "public"."webhook_replay_requests" to "authenticated";
grant select on table "public"."webhook_replay_requests" to "authenticated";
grant trigger on table "public"."webhook_replay_requests" to "authenticated";
grant truncate on table "public"."webhook_replay_requests" to "authenticated";
grant update on table "public"."webhook_replay_requests" to "authenticated";
grant delete on table "public"."webhook_replay_requests" to "service_role";
grant insert on table "public"."webhook_replay_requests" to "service_role";
grant references on table "public"."webhook_replay_requests" to "service_role";
grant select on table "public"."webhook_replay_requests" to "service_role";
grant trigger on table "public"."webhook_replay_requests" to "service_role";
grant truncate on table "public"."webhook_replay_requests" to "service_role";
grant update on table "public"."webhook_replay_requests" to "service_role";
create policy "accounts_select_accessible"
  on "public"."accounts"
  as permissive
  for select
  to authenticated
using (public.can_access_client(client_id));
create policy "accounts_write_accessible"
  on "public"."accounts"
  as permissive
  for all
  to authenticated
using (public.can_access_client(client_id))
with check (public.can_access_client(client_id));
create policy "activities_insert_internal"
  on "public"."activities"
  as permissive
  for insert
  to authenticated
with check (((auth.role() = 'service_role'::text) OR (public.is_internal() AND public.can_access_client(client_id))));
create policy "activities_select_accessible"
  on "public"."activities"
  as permissive
  for select
  to authenticated
using (((auth.role() = 'service_role'::text) OR public.can_access_client(client_id)));
create policy "audit_logs_select_admin_only"
  on "public"."audit_logs"
  as permissive
  for select
  to authenticated
using (public.is_admin());
create policy "call_events_select_accessible"
  on "public"."call_events"
  as permissive
  for select
  to authenticated
using (public.can_access_client(client_id));
create policy "call_events_write_internal"
  on "public"."call_events"
  as permissive
  for all
  to authenticated
using ((public.can_access_client(client_id) AND public.is_internal()))
with check ((public.can_access_client(client_id) AND public.is_internal()));
create policy "call_logs_select_internal"
  on "public"."call_logs"
  as permissive
  for select
  to authenticated
using (((auth.role() = 'service_role'::text) OR (public.is_internal() AND public.can_access_client(client_id))));
create policy "call_logs_write_internal"
  on "public"."call_logs"
  as permissive
  for all
  to authenticated
using (((auth.role() = 'service_role'::text) OR (public.is_internal() AND public.can_access_client(client_id))))
with check (((auth.role() = 'service_role'::text) OR (public.is_internal() AND public.can_access_client(client_id))));
create policy "call_recordings_select_internal"
  on "public"."call_recordings"
  as permissive
  for select
  to authenticated
using ((public.can_access_client(client_id) AND public.is_internal()));
create policy "call_recordings_write_internal"
  on "public"."call_recordings"
  as permissive
  for all
  to authenticated
using ((public.can_access_client(client_id) AND public.is_internal()))
with check ((public.can_access_client(client_id) AND public.is_internal()));
create policy "calls_select_accessible"
  on "public"."calls"
  as permissive
  for select
  to authenticated
using (public.can_access_client(client_id));
create policy "calls_write_internal"
  on "public"."calls"
  as permissive
  for all
  to authenticated
using ((public.can_access_client(client_id) AND public.is_internal()))
with check ((public.can_access_client(client_id) AND public.is_internal()));
create policy "client_phone_numbers_select_accessible"
  on "public"."client_phone_numbers"
  as permissive
  for select
  to authenticated
using (public.can_access_client(client_id));
create policy "client_phone_numbers_write_internal"
  on "public"."client_phone_numbers"
  as permissive
  for all
  to authenticated
using ((public.can_access_client(client_id) AND public.is_internal()))
with check ((public.can_access_client(client_id) AND public.is_internal()));
create policy "client_settings_select_accessible"
  on "public"."client_settings"
  as permissive
  for select
  to authenticated
using (public.can_access_client(client_id));
create policy "client_settings_write_manage_only"
  on "public"."client_settings"
  as permissive
  for all
  to authenticated
using (public.can_manage_client(client_id))
with check (public.can_manage_client(client_id));
create policy "client_staff_select_admin_or_self"
  on "public"."client_staff"
  as permissive
  for select
  to authenticated
using ((public.is_admin() OR (user_id = auth.uid())));
create policy "comms_templates_manage_admin"
  on "public"."comms_templates"
  as permissive
  for all
  to authenticated
using (public.is_admin())
with check (public.is_admin());
create policy "comms_templates_select_all"
  on "public"."comms_templates"
  as permissive
  for select
  to authenticated
using (true);
create policy "contact_consent_select_accessible"
  on "public"."contact_consent"
  as permissive
  for select
  to authenticated
using (public.can_access_client(client_id));
create policy "contact_consent_write_internal"
  on "public"."contact_consent"
  as permissive
  for all
  to authenticated
using ((public.can_access_client(client_id) AND public.is_internal()))
with check ((public.can_access_client(client_id) AND public.is_internal()));
create policy "contacts_select_accessible"
  on "public"."contacts"
  as permissive
  for select
  to authenticated
using (public.can_access_client(client_id));
create policy "contacts_write_accessible"
  on "public"."contacts"
  as permissive
  for all
  to authenticated
using (public.can_access_client(client_id))
with check (public.can_access_client(client_id));
create policy "cron_job_errors_admin_select"
  on "public"."cron_job_errors"
  as permissive
  for select
  to public
using (public.is_admin());
create policy "cron_job_errors_service_write"
  on "public"."cron_job_errors"
  as permissive
  for all
  to public
using ((auth.role() = 'service_role'::text))
with check ((auth.role() = 'service_role'::text));
create policy "cron_job_errors_archive_admin_select"
  on "public"."cron_job_errors_archive"
  as permissive
  for select
  to public
using (public.is_admin());
create policy "cron_job_errors_archive_service_write"
  on "public"."cron_job_errors_archive"
  as permissive
  for all
  to public
using ((auth.role() = 'service_role'::text))
with check ((auth.role() = 'service_role'::text));
create policy "data_exports_internal_insert"
  on "public"."data_exports"
  as permissive
  for insert
  to public
with check (public.can_manage_client(client_id));
create policy "data_exports_internal_select"
  on "public"."data_exports"
  as permissive
  for select
  to public
using (public.can_manage_client(client_id));
create policy "data_exports_service_update"
  on "public"."data_exports"
  as permissive
  for update
  to public
using ((auth.role() = 'service_role'::text));
create policy "deal_stages_select_accessible"
  on "public"."deal_stages"
  as permissive
  for select
  to authenticated
using (public.can_access_client(client_id));
create policy "deal_stages_write_accessible"
  on "public"."deal_stages"
  as permissive
  for all
  to authenticated
using (public.can_access_client(client_id))
with check (public.can_access_client(client_id));
create policy "deals_select_accessible"
  on "public"."deals"
  as permissive
  for select
  to authenticated
using (public.can_access_client(client_id));
create policy "deals_write_accessible"
  on "public"."deals"
  as permissive
  for all
  to authenticated
using (public.can_access_client(client_id))
with check (public.can_access_client(client_id));
create policy "dnc_select_accessible"
  on "public"."do_not_contact"
  as permissive
  for select
  to authenticated
using (public.can_access_client(client_id));
create policy "dnc_write_internal"
  on "public"."do_not_contact"
  as permissive
  for all
  to authenticated
using ((public.can_access_client(client_id) AND public.is_internal()))
with check ((public.can_access_client(client_id) AND public.is_internal()));
create policy "inbox_notes_select_accessible"
  on "public"."inbox_notes"
  as permissive
  for select
  to authenticated
using (public.can_access_client(client_id));
create policy "inbox_notes_write_internal"
  on "public"."inbox_notes"
  as permissive
  for all
  to authenticated
using ((public.can_access_client(client_id) AND public.is_internal()))
with check ((public.can_access_client(client_id) AND public.is_internal()));
create policy "matrix_client_rooms_select"
  on "public"."matrix_client_rooms"
  as permissive
  for select
  to authenticated
using (public.can_access_client(client_id));
create policy "matrix_client_rooms_write_internal"
  on "public"."matrix_client_rooms"
  as permissive
  for all
  to authenticated
using (((auth.role() = 'service_role'::text) OR (public.is_internal() AND public.can_manage_client(client_id))))
with check (((auth.role() = 'service_role'::text) OR (public.is_internal() AND public.can_manage_client(client_id))));
create policy "matrix_users_select_self"
  on "public"."matrix_users"
  as permissive
  for select
  to authenticated
using (((auth.uid() = user_id) OR public.is_admin()));
create policy "matrix_users_write_service"
  on "public"."matrix_users"
  as permissive
  for all
  to authenticated
using ((auth.role() = 'service_role'::text))
with check ((auth.role() = 'service_role'::text));
create policy "meeting_attendees_select_access"
  on "public"."meeting_attendees"
  as permissive
  for select
  to authenticated
using (((auth.role() = 'service_role'::text) OR public.can_access_client(client_id)));
create policy "meeting_attendees_write_manage"
  on "public"."meeting_attendees"
  as permissive
  for all
  to authenticated
using (((auth.role() = 'service_role'::text) OR (public.is_internal() AND public.can_manage_client(client_id))))
with check (((auth.role() = 'service_role'::text) OR (public.is_internal() AND public.can_manage_client(client_id))));
create policy "meeting_providers_select_internal"
  on "public"."meeting_providers"
  as permissive
  for select
  to authenticated
using (((auth.role() = 'service_role'::text) OR (public.is_internal() AND public.can_manage_client(client_id)) OR public.is_admin()));
create policy "meeting_providers_write_manage"
  on "public"."meeting_providers"
  as permissive
  for all
  to authenticated
using (((auth.role() = 'service_role'::text) OR (public.is_internal() AND public.can_manage_client(client_id))))
with check (((auth.role() = 'service_role'::text) OR (public.is_internal() AND public.can_manage_client(client_id))));
create policy "meeting_webhook_events_insert_service"
  on "public"."meeting_webhook_events"
  as permissive
  for insert
  to authenticated
with check ((auth.role() = 'service_role'::text));
create policy "meeting_webhook_events_select_internal"
  on "public"."meeting_webhook_events"
  as permissive
  for select
  to authenticated
using (((auth.role() = 'service_role'::text) OR public.is_internal() OR public.is_admin()));
create policy "meetings_select_access"
  on "public"."meetings"
  as permissive
  for select
  to authenticated
using (((auth.role() = 'service_role'::text) OR public.can_access_client(client_id)));
create policy "meetings_write_manage"
  on "public"."meetings"
  as permissive
  for all
  to authenticated
using (((auth.role() = 'service_role'::text) OR (public.is_internal() AND public.can_manage_client(client_id))))
with check (((auth.role() = 'service_role'::text) OR (public.is_internal() AND public.can_manage_client(client_id))));
create policy "meta_webhook_failures_insert_service"
  on "public"."meta_webhook_failures"
  as permissive
  for insert
  to authenticated
with check ((auth.role() = 'service_role'::text));
create policy "meta_webhook_failures_select_admin"
  on "public"."meta_webhook_failures"
  as permissive
  for select
  to authenticated
using (((auth.role() = 'service_role'::text) OR public.is_admin()));
create policy "rate_limits_admin_delete"
  on "public"."rate_limits"
  as permissive
  for delete
  to public
using (public.is_admin());
create policy "rate_limits_admin_insert"
  on "public"."rate_limits"
  as permissive
  for insert
  to public
with check (public.is_admin());
create policy "rate_limits_admin_select"
  on "public"."rate_limits"
  as permissive
  for select
  to public
using (public.is_admin());
create policy "rate_limits_admin_update"
  on "public"."rate_limits"
  as permissive
  for update
  to public
using (public.is_admin())
with check (public.is_admin());
create policy "retention_policies_admin_select"
  on "public"."retention_policies"
  as permissive
  for select
  to public
using (public.is_admin());
create policy "retention_policies_admin_write"
  on "public"."retention_policies"
  as permissive
  for all
  to public
using (public.is_admin())
with check (public.is_admin());
create policy "security_events_admin_select"
  on "public"."security_events"
  as permissive
  for select
  to public
using (public.is_admin());
create policy "security_events_service_insert"
  on "public"."security_events"
  as permissive
  for insert
  to public
with check ((auth.role() = 'service_role'::text));
create policy "sms_messages_select_accessible"
  on "public"."sms_messages"
  as permissive
  for select
  to authenticated
using (public.can_access_client(client_id));
create policy "sms_messages_write_internal"
  on "public"."sms_messages"
  as permissive
  for all
  to authenticated
using ((public.can_access_client(client_id) AND public.is_internal()))
with check ((public.can_access_client(client_id) AND public.is_internal()));
create policy "sms_threads_select_accessible"
  on "public"."sms_threads"
  as permissive
  for select
  to authenticated
using (public.can_access_client(client_id));
create policy "sms_threads_write_internal"
  on "public"."sms_threads"
  as permissive
  for all
  to authenticated
using ((public.can_access_client(client_id) AND public.is_internal()))
with check ((public.can_access_client(client_id) AND public.is_internal()));
create policy "social_accounts_select_manage"
  on "public"."social_accounts"
  as permissive
  for select
  to authenticated
using (((auth.role() = 'service_role'::text) OR public.can_manage_client(client_id)));
create policy "social_accounts_write_manage"
  on "public"."social_accounts"
  as permissive
  for all
  to authenticated
using (((auth.role() = 'service_role'::text) OR public.can_manage_client(client_id)))
with check (((auth.role() = 'service_role'::text) OR public.can_manage_client(client_id)));
create policy "social_messages_select_accessible"
  on "public"."social_messages"
  as permissive
  for select
  to authenticated
using (public.can_access_client(client_id));
create policy "social_messages_write_internal"
  on "public"."social_messages"
  as permissive
  for all
  to authenticated
using ((public.can_access_client(client_id) AND public.is_internal()))
with check ((public.can_access_client(client_id) AND public.is_internal()));
create policy "social_threads_select_accessible"
  on "public"."social_threads"
  as permissive
  for select
  to authenticated
using (public.can_access_client(client_id));
create policy "social_threads_write_internal"
  on "public"."social_threads"
  as permissive
  for all
  to authenticated
using ((public.can_access_client(client_id) AND public.is_internal()))
with check ((public.can_access_client(client_id) AND public.is_internal()));
create policy "social_webhook_events_insert_service"
  on "public"."social_webhook_events"
  as permissive
  for insert
  to authenticated
with check ((auth.role() = 'service_role'::text));
create policy "social_webhook_events_select_internal"
  on "public"."social_webhook_events"
  as permissive
  for select
  to authenticated
using (((auth.role() = 'service_role'::text) OR public.is_internal() OR public.is_admin()));
create policy "stripe_plans_select_authenticated"
  on "public"."stripe_plans"
  as permissive
  for select
  to authenticated
using (true);
create policy "stripe_plans_write_admin_only"
  on "public"."stripe_plans"
  as permissive
  for all
  to authenticated
using (public.is_admin())
with check (public.is_admin());
create policy "tasks_select_accessible"
  on "public"."tasks"
  as permissive
  for select
  to authenticated
using (public.can_access_client(client_id));
create policy "tasks_write_accessible"
  on "public"."tasks"
  as permissive
  for all
  to authenticated
using (public.can_access_client(client_id))
with check (public.can_access_client(client_id));
create policy "twilio_failures_select_internal"
  on "public"."twilio_webhook_failures"
  as permissive
  for select
  to authenticated
using (public.is_internal());
create policy "user_settings_select_self"
  on "public"."user_settings"
  as permissive
  for select
  to authenticated
using ((auth.uid() = user_id));
create policy "user_settings_write_self"
  on "public"."user_settings"
  as permissive
  for all
  to authenticated
using ((auth.uid() = user_id))
with check ((auth.uid() = user_id));
create policy "webhook_replay_select_admin"
  on "public"."webhook_replay_requests"
  as permissive
  for select
  to authenticated
using (((auth.role() = 'service_role'::text) OR public.is_admin()));
create policy "webhook_replay_write_admin"
  on "public"."webhook_replay_requests"
  as permissive
  for all
  to authenticated
using (((auth.role() = 'service_role'::text) OR public.is_admin()))
with check (((auth.role() = 'service_role'::text) OR public.is_admin()));
CREATE TRIGGER trg_accounts_updated_at BEFORE UPDATE ON public.accounts FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_calls_updated_at BEFORE UPDATE ON public.calls FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_client_phone_numbers_updated_at BEFORE UPDATE ON public.client_phone_numbers FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_client_settings_updated_at BEFORE UPDATE ON public.client_settings FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_seed_client_rate_limits AFTER INSERT ON public.clients FOR EACH ROW EXECUTE FUNCTION public.seed_client_rate_limits();
CREATE TRIGGER trg_comms_templates_updated_at BEFORE UPDATE ON public.comms_templates FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_contacts_updated_at BEFORE UPDATE ON public.contacts FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_cron_job_errors_updated_at BEFORE UPDATE ON public.cron_job_errors FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_deal_stages_updated_at BEFORE UPDATE ON public.deal_stages FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_deals_updated_at BEFORE UPDATE ON public.deals FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_matrix_client_rooms_updated_at BEFORE UPDATE ON public.matrix_client_rooms FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_matrix_users_updated_at BEFORE UPDATE ON public.matrix_users FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_meeting_providers_updated_at BEFORE UPDATE ON public.meeting_providers FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_meetings_updated_at BEFORE UPDATE ON public.meetings FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_sms_threads_updated_at BEFORE UPDATE ON public.sms_threads FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_social_accounts_updated_at BEFORE UPDATE ON public.social_accounts FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_social_threads_updated_at BEFORE UPDATE ON public.social_threads FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_tasks_updated_at BEFORE UPDATE ON public.tasks FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_user_settings_updated_at BEFORE UPDATE ON public.user_settings FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
create policy "documents_delete_manage_only flreew_0"
  on "storage"."objects"
  as permissive
  for delete
  to authenticated
using (((bucket_id = 'documents'::text) AND (name ~~ 'clients/%'::text) AND (public.path_client_id(name) IS NOT NULL) AND public.can_manage_client(public.path_client_id(name))));
create policy "documents_delete_manage_only flreew_1"
  on "storage"."objects"
  as permissive
  for select
  to authenticated
using (((bucket_id = 'documents'::text) AND (name ~~ 'clients/%'::text) AND (public.path_client_id(name) IS NOT NULL) AND public.can_manage_client(public.path_client_id(name))));
create policy "documents_insert_accessible flreew_0"
  on "storage"."objects"
  as permissive
  for insert
  to authenticated
with check (((bucket_id = 'documents'::text) AND (name ~~ 'clients/%'::text) AND (public.path_client_id(name) IS NOT NULL) AND public.can_access_client(public.path_client_id(name))));
create policy "documents_read_accessible flreew_0"
  on "storage"."objects"
  as permissive
  for select
  to authenticated
using (((bucket_id = 'documents'::text) AND (name ~~ 'clients/%'::text) AND public.can_access_client(public.path_client_id(name))));
create policy "documents_update_manage_only flreew_0"
  on "storage"."objects"
  as permissive
  for update
  to authenticated
using (((bucket_id = 'documents'::text) AND (name ~~ 'clients/%'::text) AND (public.path_client_id(name) IS NOT NULL) AND public.can_manage_client(public.path_client_id(name))))
with check (((bucket_id = 'documents'::text) AND (name ~~ 'clients/%'::text) AND (public.path_client_id(name) IS NOT NULL) AND public.can_manage_client(public.path_client_id(name))));
create policy "documents_update_manage_only flreew_1"
  on "storage"."objects"
  as permissive
  for select
  to authenticated
using (((bucket_id = 'documents'::text) AND (name ~~ 'clients/%'::text) AND (public.path_client_id(name) IS NOT NULL) AND public.can_manage_client(public.path_client_id(name))));
create policy "exports_delete_service"
  on "storage"."objects"
  as permissive
  for delete
  to authenticated
using (((bucket_id = 'exports'::text) AND (auth.role() = 'service_role'::text)));
create policy "exports_insert_service"
  on "storage"."objects"
  as permissive
  for insert
  to authenticated
with check (((bucket_id = 'exports'::text) AND (auth.role() = 'service_role'::text)));
create policy "exports_read_manage_only"
  on "storage"."objects"
  as permissive
  for select
  to authenticated
using (((bucket_id = 'exports'::text) AND (name ~~ 'clients/%'::text) AND (public.path_client_id(name) IS NOT NULL) AND public.can_manage_client(public.path_client_id(name))));
create policy "exports_update_service"
  on "storage"."objects"
  as permissive
  for update
  to authenticated
using (((bucket_id = 'exports'::text) AND (auth.role() = 'service_role'::text)))
with check (((bucket_id = 'exports'::text) AND (auth.role() = 'service_role'::text)));
