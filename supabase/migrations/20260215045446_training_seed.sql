-- =========================
-- SEED DATA (so UI shows values)
-- =========================

-- Agents (match names you use in NeuralFloor)
insert into public.agents (name, division, role, status, system_prompt)
values
  ('Nexus Founder','Strategy & Analysis','Entity Architect','testing',''),
  ('Nexus Analyst','Strategy & Analysis','Neural Architect','testing',''),
  ('Sentinel Scout','Acquisition & Sales','Geo-Intent Lead Hunter','testing',''),
  ('Lex Ledger','Underwriting & Risk','Forensic Credit Specialist','testing',''),
  ('Nova Grant','Client Success','Grant Writing Architect','testing',''),
  ('Forensic Bot','Underwriting & Risk','Integrity Auditor','testing',''),
  ('Ghost Hunter','Acquisition & Sales','Re-engagement Agent','testing','')
on conflict (name) do nothing;
-- One scenario (idempotent without requiring a unique constraint)
insert into public.scenarios (title, division, user_message, expected_behavior, difficulty)
select
  'Idle Lead Re-Engagement',
  'Acquisition & Sales',
  'Lead has been idle 72 hours. Draft a pattern-interrupt email that re-engages without sounding spammy.',
  'Draft an email, ask 1 clarifying question if needed, do not guarantee funding.',
  2
where not exists (
  select 1
  from public.scenarios
  where title = 'Idle Lead Re-Engagement'
    and division = 'Acquisition & Sales'
);
-- Run (avoid duplicates on reruns)
insert into public.eval_runs (name, mode, notes)
select 'Seed Run #1','simulated','Initial seed batch'
where not exists (
  select 1
  from public.eval_runs
  where name = 'Seed Run #1'
    and mode = 'simulated'
);
-- Create a case + score using the latest run/scenario/agent
with
r as (select id from public.eval_runs order by created_at desc limit 1),
s as (select id from public.scenarios order by created_at desc limit 1),
a as (select id from public.agents where name='Ghost Hunter' limit 1),
c as (
  insert into public.eval_cases (run_id, scenario_id, agent_id, agent_output, tool_requests)
  select
    r.id,
    s.id,
    a.id,
    'Subject: Quick question\n\nHey — quick one: are you still looking to increase your business funding options this month?\n\nIf yes, reply with your monthly revenue range and how long you’ve been in business, and I’ll map the fastest path.\n\n— Nexus Team',
    '[{"name":"lookup_lead","args":{"company":"ExampleCo"},"reason":"Need last contact + stage"}]'::jsonb
  from r,s,a
  returning id
)
insert into public.eval_scores (case_id, ai_accuracy, ai_compliance, ai_clarity, ai_routing, ai_notes, approved)
select
  c.id, 4, 5, 4, 4,
  'Good: concise, asks for key qualifiers, no guarantees. Improve: add a softer opt-out line.',
  false
from c;
