import React, { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../lib/supabaseClient';
import { workflowStart } from '../../src/services/workflowEngineApi';

type WorkflowInstanceRow = {
  id: string;
  template_key: string;
  status: 'active' | 'completed' | 'paused';
  current_step: number;
  created_at: string;
  updated_at: string;
};

type WorkflowTemplateRow = {
  key: string;
  description: string | null;
  steps: unknown;
};

type WorkflowTaskRow = {
  workflow_instance_id: string | null;
  task_id: string;
  title: string;
  status: 'pending' | 'completed';
  due_date: string;
  workflow_step_number: number | null;
};

const STARTER_TEMPLATES = [
  { key: 'FUNDING_ONBOARDING', label: 'Funding Onboarding' },
  { key: 'GRANTS_FLOW', label: 'Grants Flow' },
  { key: 'SBA_FLOW', label: 'SBA Flow' },
];

function countSteps(steps: unknown): number {
  return Array.isArray(steps) ? steps.length : 0;
}

export default function WorkflowDashboardPanel() {
  const { user } = useAuth();

  const [loading, setLoading] = useState(true);
  const [busyStartKey, setBusyStartKey] = useState<string | null>(null);
  const [error, setError] = useState('');

  const [instances, setInstances] = useState<WorkflowInstanceRow[]>([]);
  const [templatesByKey, setTemplatesByKey] = useState<Record<string, WorkflowTemplateRow>>({});
  const [nextTaskByInstance, setNextTaskByInstance] = useState<Record<string, WorkflowTaskRow>>({});

  async function loadWorkflows() {
    if (!user?.id) {
      setInstances([]);
      setTemplatesByKey({});
      setNextTaskByInstance({});
      setLoading(false);
      return;
    }

    setLoading(true);
    setError('');

    try {
      const instanceRes = await supabase
        .from('workflow_instances')
        .select('id,template_key,status,current_step,created_at,updated_at')
        .eq('user_id', user.id)
        .in('status', ['active', 'paused'])
        .order('updated_at', { ascending: false });

      if (instanceRes.error) {
        throw new Error(instanceRes.error.message || 'Unable to load workflows.');
      }

      const workflowRows = (instanceRes.data || []) as WorkflowInstanceRow[];
      setInstances(workflowRows);

      const templateKeys = Array.from(new Set(workflowRows.map((row) => row.template_key)));
      if (templateKeys.length > 0) {
        const templateRes = await supabase
          .from('workflow_templates')
          .select('key,description,steps')
          .in('key', templateKeys);

        if (templateRes.error) {
          throw new Error(templateRes.error.message || 'Unable to load workflow templates.');
        }

        const map: Record<string, WorkflowTemplateRow> = {};
        for (const row of (templateRes.data || []) as WorkflowTemplateRow[]) {
          map[row.key] = row;
        }
        setTemplatesByKey(map);
      } else {
        setTemplatesByKey({});
      }

      if (workflowRows.length > 0) {
        const ids = workflowRows.map((row) => row.id);
        const taskRes = await supabase
          .from('client_tasks')
          .select('workflow_instance_id,task_id,title,status,due_date,workflow_step_number')
          .in('workflow_instance_id', ids)
          .eq('status', 'pending')
          .order('due_date', { ascending: true });

        if (taskRes.error) {
          throw new Error(taskRes.error.message || 'Unable to load workflow tasks.');
        }

        const nextByInstance: Record<string, WorkflowTaskRow> = {};
        for (const task of (taskRes.data || []) as WorkflowTaskRow[]) {
          const instanceId = String(task.workflow_instance_id || '');
          if (!instanceId) continue;
          if (!nextByInstance[instanceId]) {
            nextByInstance[instanceId] = task;
          }
        }

        setNextTaskByInstance(nextByInstance);
      } else {
        setNextTaskByInstance({});
      }
    } catch (e: any) {
      setError(String(e?.message || e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadWorkflows();
  }, [user?.id]);

  const activeCount = instances.length;
  const dashboardItems = useMemo(() => {
    return instances.map((instance) => {
      const template = templatesByKey[instance.template_key];
      const totalSteps = Math.max(1, countSteps(template?.steps));
      const current = Math.min(Math.max(instance.current_step || 1, 1), totalSteps);
      const progressPct = Math.round((current / totalSteps) * 100);
      const nextTask = nextTaskByInstance[instance.id] || null;

      return {
        ...instance,
        description: template?.description || 'Workflow in progress.',
        totalSteps,
        progressPct,
        nextTask,
      };
    });
  }, [instances, templatesByKey, nextTaskByInstance]);

  async function startTemplate(templateKey: string) {
    setBusyStartKey(templateKey);
    setError('');
    try {
      await workflowStart(templateKey);
      await loadWorkflows();
    } catch (e: any) {
      setError(String(e?.message || e));
    } finally {
      setBusyStartKey(null);
    }
  }

  function openWorkflowDetail(instanceId: string) {
    localStorage.setItem('nexus_workflow_instance_id', instanceId);
    const next = new URL(window.location.href);
    next.pathname = '/workflow-detail';
    next.search = `?instance_id=${encodeURIComponent(instanceId)}`;
    window.history.pushState({}, '', `${next.pathname}${next.search}`);
    window.location.hash = 'workflow_detail';
  }

  if (loading) {
    return (
      <div className="rounded-3xl border border-white/10 bg-slate-900/60 p-5 text-sm text-slate-300">
        Loading workflows...
      </div>
    );
  }

  return (
    <section className="rounded-3xl border border-cyan-400/20 bg-slate-900/60 p-5 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-black uppercase tracking-wide text-white">Active Workflows</h2>
          <p className="text-xs text-slate-400 mt-1">
            Client journey automation with tier + consent gates. {activeCount} active.
          </p>
        </div>
      </div>

      {error ? <div className="rounded-xl border border-rose-500/40 bg-rose-950/30 px-3 py-2 text-xs text-rose-200">{error}</div> : null}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
        {STARTER_TEMPLATES.map((template) => (
          <button
            key={template.key}
            className="rounded-xl border border-slate-700 bg-slate-800/80 px-3 py-2 text-left hover:border-cyan-400/60 transition"
            onClick={() => void startTemplate(template.key)}
            disabled={busyStartKey !== null}
          >
            <p className="text-xs font-black tracking-wider uppercase text-cyan-300">{template.label}</p>
            <p className="text-[11px] text-slate-400 mt-1">Start workflow</p>
            <p className="text-[10px] text-slate-500 mt-1">{busyStartKey === template.key ? 'Starting...' : 'Create instance'}</p>
          </button>
        ))}
      </div>

      {dashboardItems.length === 0 ? (
        <div className="rounded-xl border border-slate-700 bg-slate-800/40 px-4 py-4 text-xs text-slate-400">
          No active workflows yet.
        </div>
      ) : (
        <div className="space-y-3">
          {dashboardItems.map((item) => (
            <div key={item.id} className="rounded-xl border border-slate-700 bg-slate-800/50 p-4 space-y-2">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-xs font-black uppercase tracking-wider text-cyan-300">{item.template_key}</p>
                  <p className="text-[11px] text-slate-400">{item.description}</p>
                </div>
                <button
                  onClick={() => openWorkflowDetail(item.id)}
                  className="rounded-lg bg-cyan-500 px-3 py-1 text-[10px] font-black uppercase tracking-wider text-slate-950"
                >
                  Open
                </button>
              </div>

              <div>
                <div className="flex justify-between text-[10px] text-slate-400 mb-1">
                  <span>Step {item.current_step} of {item.totalSteps}</span>
                  <span>{item.progressPct}%</span>
                </div>
                <div className="h-2 w-full rounded-full bg-slate-700 overflow-hidden">
                  <div className="h-full bg-cyan-400" style={{ width: `${item.progressPct}%` }} />
                </div>
              </div>

              <p className="text-[11px] text-slate-300">
                Next task: <span className="text-white font-semibold">{item.nextTask?.title || 'No pending task found'}</span>
              </p>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
