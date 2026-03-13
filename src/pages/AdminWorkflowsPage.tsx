import React, { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../lib/supabaseClient';
import { workflowTrigger } from '../services/workflowEngineApi';

type WorkflowInstanceRow = {
  id: string;
  tenant_id: string;
  user_id: string;
  template_key: string;
  status: 'active' | 'completed' | 'paused';
  current_step: number;
  updated_at: string;
  created_at: string;
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
  workflow_step_number: number | null;
  due_date: string | null;
};

function countSteps(steps: unknown): number {
  return Array.isArray(steps) ? steps.length : 0;
}

export default function AdminWorkflowsPage() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const [isAdmin, setIsAdmin] = useState(false);
  const [checkingAccess, setCheckingAccess] = useState(true);

  const [instances, setInstances] = useState<WorkflowInstanceRow[]>([]);
  const [templates, setTemplates] = useState<Record<string, WorkflowTemplateRow>>({});
  const [nextTaskByInstance, setNextTaskByInstance] = useState<Record<string, WorkflowTaskRow>>({});

  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'paused' | 'completed'>('all');
  const [templateFilter, setTemplateFilter] = useState<'all' | string>('all');

  useEffect(() => {
    let active = true;

    async function checkAccess() {
      if (!user?.id) {
        if (!active) return;
        setIsAdmin(false);
        setCheckingAccess(false);
        return;
      }

      setCheckingAccess(true);

      const accessRes = await supabase.rpc('nexus_is_master_admin_compat');
      if (!active) return;

      if (accessRes.error) {
        setIsAdmin(user.role === 'admin');
      } else {
        setIsAdmin(Boolean(accessRes.data) || user.role === 'admin');
      }

      setCheckingAccess(false);
    }

    void checkAccess();
    return () => {
      active = false;
    };
  }, [user?.id, user?.role]);

  async function loadData() {
    if (!isAdmin) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setError('');

    try {
      const instanceRes = await supabase
        .from('workflow_instances')
        .select('id,tenant_id,user_id,template_key,status,current_step,updated_at,created_at')
        .order('updated_at', { ascending: false })
        .limit(400);

      if (instanceRes.error) {
        throw new Error(instanceRes.error.message || 'Unable to load workflow instances.');
      }

      const rows = (instanceRes.data || []) as WorkflowInstanceRow[];
      setInstances(rows);

      const templateKeys = Array.from(new Set(rows.map((row) => row.template_key)));
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
        setTemplates(map);
      } else {
        setTemplates({});
      }

      if (rows.length > 0) {
        const ids = rows.map((row) => row.id);
        const taskRes = await supabase
          .from('client_tasks')
          .select('workflow_instance_id,task_id,title,status,workflow_step_number,due_date')
          .in('workflow_instance_id', ids)
          .eq('status', 'pending')
          .order('due_date', { ascending: true });

        if (taskRes.error) {
          throw new Error(taskRes.error.message || 'Unable to load workflow tasks.');
        }

        const nextByInstance: Record<string, WorkflowTaskRow> = {};
        for (const task of (taskRes.data || []) as WorkflowTaskRow[]) {
          const instanceId = String(task.workflow_instance_id || '').trim();
          if (!instanceId) continue;
          if (!nextByInstance[instanceId]) nextByInstance[instanceId] = task;
        }
        setNextTaskByInstance(nextByInstance);
      } else {
        setNextTaskByInstance({});
      }
    } catch (e: any) {
      setError(String(e?.message || e));
      setInstances([]);
      setTemplates({});
      setNextTaskByInstance({});
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (checkingAccess || !isAdmin) {
      setLoading(false);
      return;
    }
    void loadData();
  }, [checkingAccess, isAdmin]);

  const templateOptions = useMemo(() => {
    return Array.from(new Set(instances.map((row) => row.template_key))).sort((a, b) => a.localeCompare(b));
  }, [instances]);

  const filteredRows = useMemo(() => {
    return instances.filter((row) => {
      if (statusFilter !== 'all' && row.status !== statusFilter) return false;
      if (templateFilter !== 'all' && row.template_key !== templateFilter) return false;
      return true;
    });
  }, [instances, statusFilter, templateFilter]);

  async function runAction(instanceId: string, action: 'workflow.force_advance' | 'workflow.pause' | 'workflow.resume') {
    setBusyId(instanceId);
    setError('');
    setSuccess('');

    try {
      await workflowTrigger(action, { instance_id: instanceId });
      if (action === 'workflow.force_advance') setSuccess('Instance force-advanced.');
      if (action === 'workflow.pause') setSuccess('Instance paused.');
      if (action === 'workflow.resume') setSuccess('Instance resumed.');
      await loadData();
    } catch (e: any) {
      setError(String(e?.message || e));
    } finally {
      setBusyId(null);
    }
  }

  function openDetail(instanceId: string) {
    localStorage.setItem('nexus_workflow_instance_id', instanceId);
    const next = new URL(window.location.href);
    next.pathname = '/workflow-detail';
    next.search = `?instance_id=${encodeURIComponent(instanceId)}`;
    window.history.pushState({}, '', `${next.pathname}${next.search}`);
    window.location.hash = 'workflow_detail';
  }

  if (checkingAccess) {
    return <div className="min-h-[50vh] flex items-center justify-center text-slate-300">Verifying admin access...</div>;
  }

  if (!isAdmin) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-8 text-slate-100">
        <div className="rounded-xl border border-amber-500/40 bg-amber-950/30 p-4 text-sm">Admin access required.</div>
      </div>
    );
  }

  if (loading) {
    return <div className="min-h-[50vh] flex items-center justify-center text-slate-300">Loading workflow manager...</div>;
  }

  return (
    <div className="max-w-7xl mx-auto px-4 py-6 text-slate-100 space-y-5">
      <div>
        <h1 className="text-2xl font-semibold text-white">Admin Workflows</h1>
        <p className="text-sm text-slate-400 mt-1">View workflow instances, force-advance, pause/resume, and inspect next tasks.</p>
      </div>

      <div className="rounded-xl border border-slate-700 bg-slate-900 p-4 grid grid-cols-1 md:grid-cols-3 gap-3">
        <div>
          <label className="block text-xs uppercase tracking-wider text-slate-400 mb-2">Status</label>
          <select
            className="w-full bg-slate-800 border border-slate-600 rounded-md px-3 py-2 text-sm"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as 'all' | 'active' | 'paused' | 'completed')}
          >
            <option value="all">All statuses</option>
            <option value="active">Active</option>
            <option value="paused">Paused</option>
            <option value="completed">Completed</option>
          </select>
        </div>

        <div>
          <label className="block text-xs uppercase tracking-wider text-slate-400 mb-2">Template</label>
          <select
            className="w-full bg-slate-800 border border-slate-600 rounded-md px-3 py-2 text-sm"
            value={templateFilter}
            onChange={(e) => setTemplateFilter(e.target.value)}
          >
            <option value="all">All templates</option>
            {templateOptions.map((key) => (
              <option key={key} value={key}>{key}</option>
            ))}
          </select>
        </div>

        <div className="flex items-end">
          <button
            onClick={() => void loadData()}
            className="w-full rounded-md border border-cyan-500/40 px-3 py-2 text-xs font-black uppercase tracking-wider text-cyan-200"
            disabled={busyId !== null}
          >
            Refresh
          </button>
        </div>
      </div>

      {error ? <div className="rounded-md border border-rose-500/50 bg-rose-950/30 text-rose-200 text-sm px-4 py-3">{error}</div> : null}
      {success ? <div className="rounded-md border border-emerald-500/50 bg-emerald-950/30 text-emerald-200 text-sm px-4 py-3">{success}</div> : null}

      <div className="text-xs text-slate-400">Showing {filteredRows.length} of {instances.length} workflow instances.</div>

      <div className="rounded-xl border border-slate-700 bg-slate-900 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1400px] text-sm">
            <thead className="bg-slate-800/70 text-slate-300 uppercase text-xs tracking-wide">
              <tr>
                <th className="px-4 py-3 text-left">Instance</th>
                <th className="px-4 py-3 text-left">Tenant</th>
                <th className="px-4 py-3 text-left">User</th>
                <th className="px-4 py-3 text-left">Template</th>
                <th className="px-4 py-3 text-left">Progress</th>
                <th className="px-4 py-3 text-left">Status</th>
                <th className="px-4 py-3 text-left">Next Task</th>
                <th className="px-4 py-3 text-left">Updated</th>
                <th className="px-4 py-3 text-left">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {filteredRows.map((row) => {
                const template = templates[row.template_key];
                const total = Math.max(1, countSteps(template?.steps));
                const step = Math.min(Math.max(row.current_step || 1, 1), total);
                const nextTask = nextTaskByInstance[row.id] || null;

                return (
                  <tr key={row.id}>
                    <td className="px-4 py-3 font-mono text-xs text-slate-200">{row.id}</td>
                    <td className="px-4 py-3 font-mono text-xs text-slate-300">{row.tenant_id}</td>
                    <td className="px-4 py-3 font-mono text-xs text-slate-300">{row.user_id}</td>
                    <td className="px-4 py-3">
                      <div className="text-xs font-black uppercase tracking-wider text-cyan-300">{row.template_key}</div>
                      <div className="text-[11px] text-slate-500 mt-1">{template?.description || 'Workflow template'}</div>
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-300">Step {step}/{total}</td>
                    <td className="px-4 py-3 text-xs uppercase tracking-wider text-cyan-300">{row.status}</td>
                    <td className="px-4 py-3">
                      {nextTask ? (
                        <div>
                          <div className="text-xs font-semibold text-slate-200">{nextTask.title}</div>
                          <div className="text-[11px] text-slate-500 mt-1">Due: {nextTask.due_date || '-'}</div>
                        </div>
                      ) : (
                        <div className="text-xs text-slate-500">No pending task</div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-400">{new Date(row.updated_at).toLocaleString()}</td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-2">
                        <button
                          onClick={() => openDetail(row.id)}
                          className="rounded-md border border-slate-600 px-2 py-1 text-[10px] font-black uppercase tracking-wider text-slate-200"
                        >
                          Open
                        </button>
                        <button
                          onClick={() => void runAction(row.id, 'workflow.force_advance')}
                          disabled={busyId !== null || row.status !== 'active'}
                          className="rounded-md bg-cyan-500 px-2 py-1 text-[10px] font-black uppercase tracking-wider text-slate-950 disabled:opacity-50"
                        >
                          {busyId === row.id ? 'Working...' : 'Force Advance'}
                        </button>
                        {row.status === 'active' ? (
                          <button
                            onClick={() => void runAction(row.id, 'workflow.pause')}
                            disabled={busyId !== null}
                            className="rounded-md border border-amber-500/40 px-2 py-1 text-[10px] font-black uppercase tracking-wider text-amber-200 disabled:opacity-50"
                          >
                            Pause
                          </button>
                        ) : row.status === 'paused' ? (
                          <button
                            onClick={() => void runAction(row.id, 'workflow.resume')}
                            disabled={busyId !== null}
                            className="rounded-md border border-emerald-500/40 px-2 py-1 text-[10px] font-black uppercase tracking-wider text-emerald-200 disabled:opacity-50"
                          >
                            Resume
                          </button>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
