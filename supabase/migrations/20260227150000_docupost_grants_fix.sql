-- Ensure PostgREST can expose DocuPost tables and view for authenticated workflows.
-- RLS policies still enforce user-level access.

grant usage on schema public to anon, authenticated, service_role;
grant select, insert, update, delete on table public.dispute_mail_packets to anon, authenticated, service_role;
grant select, insert, update, delete on table public.dispute_mail_events to anon, authenticated, service_role;
grant select on table public.client_pending_mail_approvals to anon, authenticated, service_role;
