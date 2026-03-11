import React, { useEffect, useState } from 'react';
import { supabase } from '../lib/supabaseClient';
import { useAuth } from '../contexts/AuthContext';

type Signal = 'red' | 'yellow' | 'green';
type ProgressState = 'not_started' | 'in_progress' | 'completed';

type TaskRow = {
  task_id: string;
  title: string;
  description: string;
  signal?: Signal | null;
  status?: string | null;
  status_rg?: Signal | null;
  progress?: ProgressState | null;
  assigned_employee?: string | null;
  assignee_agent?: string | null;
  meta?: Record<string, any> | null;
  metadata?: Record<string, any> | null;
};

export type TaskHelpPayload = {
  employee: string;
  approvalMode: boolean;
  context: Record<string, any>;
};

interface TaskBoardProps {
  tenantId: string;
  onSelectTaskHelp?: (payload: TaskHelpPayload) => void;
}

const pillClass = (signal: Signal) => {
  if (signal === 'green') return 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30';
  if (signal === 'yellow') return 'bg-amber-500/20 text-amber-300 border-amber-500/30';
  return 'bg-red-500/20 text-red-300 border-red-500/30';
};

const mergeMeta = (task: TaskRow): Record<string, any> => ({
  ...(task.meta || {}),
  ...(task.metadata || {}),
});

const deriveSignal = (task: TaskRow): Signal => {
  if (task.status_rg === 'red' || task.status_rg === 'yellow' || task.status_rg === 'green') {
    return task.status_rg;
  }
  if (task.signal === 'red' || task.signal === 'yellow' || task.signal === 'green') {
    return task.signal;
  }
  const legacyStatus = String(task.status || '').toLowerCase();
  if (legacyStatus === 'completed' || legacyStatus === 'green') return 'green';
  if (legacyStatus === 'yellow') return 'yellow';
  return 'red';
};

const deriveProgress = (task: TaskRow): ProgressState => {
  if (task.progress === 'not_started' || task.progress === 'in_progress' || task.progress === 'completed') {
    return task.progress;
  }

  const meta = mergeMeta(task);
  const p = String(meta.progress || '').toLowerCase();
  if (p === 'completed') return 'completed';
  if (p === 'in_progress') return 'in_progress';
  if (p === 'not_started') return 'not_started';

  const legacyStatus = String(task.status || '').toLowerCase();
  if (legacyStatus === 'completed') return 'completed';

  const signal = deriveSignal(task);
  if (signal === 'green') return 'completed';
  if (signal === 'yellow') return 'in_progress';
  return 'not_started';
};

const shouldFallbackToEnumStatus = (error: any) => {
  const msg = String(error?.message || '');
  return /invalid input value for enum|task_status|status/i.test(msg);
};

const TaskBoard: React.FC<TaskBoardProps> = ({ tenantId, onSelectTaskHelp }) => {
  const { user } = useAuth();
  const [tasks, setTasks] = useState<TaskRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingTaskId, setSavingTaskId] = useState<string | null>(null);
  const [blockersByTask, setBlockersByTask] = useState<Record<string, string[]>>({});

  const load = async () => {
    if (!tenantId || !user?.id) {
      setLoading(false);
      return;
    }

    setLoading(true);

    const { data, error } = await supabase
      .from('client_tasks')
      .select('task_id,title,description,signal,status,status_rg,progress,assigned_employee,assignee_agent,meta,metadata')
      .eq('tenant_id', tenantId)
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });

    if (!error) {
      setTasks((data as TaskRow[]) || []);
    }

    setLoading(false);
  };

  const setProgress = async (task: TaskRow, progress: ProgressState) => {
    if (!tenantId || !user?.id) return;

    const signal: Signal = progress === 'completed' ? 'green' : progress === 'in_progress' ? 'yellow' : 'red';
    const legacyStatus = progress === 'completed' ? 'completed' : 'pending';
    const merged = mergeMeta(task);

    setSavingTaskId(task.task_id);

    const basePatch = {
      progress,
      signal,
      status_rg: signal,
      assignee_agent: task.assignee_agent || task.assigned_employee || 'Nexus Analyst',
      meta: {
        ...merged,
        progress,
        updated_from: 'task_board',
      },
      metadata: {
        ...merged,
        progress,
        updated_from: 'task_board',
      },
    };

    let res = await supabase
      .from('client_tasks')
      .update({ ...basePatch, status: legacyStatus })
      .eq('tenant_id', tenantId)
      .eq('user_id', user.id)
      .eq('task_id', task.task_id);

    if (res.error && shouldFallbackToEnumStatus(res.error)) {
      res = await supabase
        .from('client_tasks')
        .update({ ...basePatch, status: signal })
        .eq('tenant_id', tenantId)
        .eq('user_id', user.id)
        .eq('task_id', task.task_id);
    }

    if (res.error) {
      setBlockersByTask((prev) => ({
        ...prev,
        [task.task_id]: [res.error?.message || 'Failed to update task progress.'],
      }));
    }

    setSavingTaskId(null);
    await load();
  };

  const completeWithGateCheck = async (task: TaskRow) => {
    if (!tenantId || !user?.id) return;

    setSavingTaskId(task.task_id);

    try {
      const res = await fetch('/.netlify/functions/evaluate_task_gates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tenant_id: tenantId,
          user_id: user.id,
          task_id: task.task_id,
        }),
      });

      const payload = await res.json().catch(() => ({}));

      if (!res.ok) {
        throw new Error(payload?.error || `Gate check failed (${res.status})`);
      }

      if (!payload.allow_completion) {
        const blockers = Array.isArray(payload.blockers) ? payload.blockers : ['Completion blocked by safeguards.'];
        setBlockersByTask((prev) => ({ ...prev, [task.task_id]: blockers }));
        return;
      }

      setBlockersByTask((prev) => ({ ...prev, [task.task_id]: [] }));
      await setProgress(task, 'completed');
    } catch (e: any) {
      setBlockersByTask((prev) => ({
        ...prev,
        [task.task_id]: [e?.message || 'Gate evaluation failed.'],
      }));
    } finally {
      setSavingTaskId(null);
    }
  };

  const openTaskHelp = (task: TaskRow) => {
    const merged = mergeMeta(task);
    const employee = task.assignee_agent || task.assigned_employee || 'Nexus Analyst';

    const context = {
      module_id: merged.module_id || null,
      task_id: merged.training_task_id || task.task_id,
      compliance_level: merged.compliance_level || null,
      risk_profile: merged.risk_profile || null,
      safeguards: merged.safeguards || [],
      gates: merged.gates || {},
      helper_agents: merged.helper_agents || [],
      assignment_reasons: merged.assignment_reasons || [],
      title: task.title,
      description: task.description,
    };

    const approvalMode = Boolean(merged.approval_mode_enforced || merged?.gates?.human_review_required);

    onSelectTaskHelp?.({
      employee,
      approvalMode,
      context,
    });
  };

  useEffect(() => {
    load();
  }, [tenantId, user?.id]);

  if (!tenantId) {
    return <div className="text-white/70">Missing tenant context.</div>;
  }

  if (loading) {
    return <div className="text-white/70">Loading tasks...</div>;
  }

  return (
    <div className="space-y-4 animate-fade-in">
      {tasks.length === 0 ? (
        <div className="bg-[#1F2833]/40 border border-white/10 rounded-3xl p-6 text-slate-300 text-sm">
          No tasks yet. Complete onboarding inputs to auto-assign tasks.
        </div>
      ) : null}

      {tasks.map((task) => {
        const signal = deriveSignal(task);
        const progress = deriveProgress(task);
        const assignee = task.assignee_agent || task.assigned_employee || 'Nexus Analyst';
        const blockers = blockersByTask[task.task_id] || [];
        const saving = savingTaskId === task.task_id;

        return (
          <div key={task.task_id} className="bg-[#1F2833]/50 border border-white/10 rounded-3xl p-6 text-white shadow-sm">
            <div className="flex items-center justify-between gap-4">
              <div>
                <div className="text-xl font-black tracking-tight">{task.title}</div>
                <div className="text-sm text-slate-300 mt-1">{task.description}</div>
                <div className="text-xs text-slate-400 mt-2">Assigned to: {assignee}</div>
              </div>
              <div className={`px-3 py-1 rounded-full border text-xs font-black uppercase ${pillClass(signal)}`}>
                {signal.toUpperCase()}
              </div>
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              <button
                onClick={() => setProgress(task, 'not_started')}
                disabled={saving}
                className="px-3 py-2 rounded-xl bg-white/5 border border-white/10 text-xs font-black uppercase tracking-wide disabled:opacity-50"
              >
                Not Started
              </button>
              <button
                onClick={() => setProgress(task, 'in_progress')}
                disabled={saving}
                className="px-3 py-2 rounded-xl bg-white/5 border border-white/10 text-xs font-black uppercase tracking-wide disabled:opacity-50"
              >
                Working
              </button>
              <button
                onClick={() => completeWithGateCheck(task)}
                disabled={saving}
                className="px-3 py-2 rounded-xl bg-emerald-400 text-black text-xs font-black uppercase tracking-wide disabled:opacity-50"
              >
                Completed
              </button>
              <button
                onClick={() => openTaskHelp(task)}
                className="px-3 py-2 rounded-xl bg-indigo-500/20 border border-indigo-400/30 text-indigo-200 text-xs font-black uppercase tracking-wide"
              >
                Get Help
              </button>
              <div className="px-3 py-2 rounded-xl border border-white/10 text-[11px] text-slate-400 uppercase tracking-wide">
                Progress: {progress.replace('_', ' ')}
              </div>
            </div>

            {blockers.length > 0 ? (
              <div className="mt-4 bg-red-500/10 border border-red-400/30 rounded-2xl p-3 text-xs text-red-200 space-y-1">
                {blockers.map((b, idx) => (
                  <div key={`${task.task_id}-blocker-${idx}`}>{b}</div>
                ))}
              </div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
};

export default TaskBoard;
