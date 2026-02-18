import React, { useMemo } from 'react';
import { CheckCircle2, Circle, CalendarDays, UserCircle2 } from 'lucide-react';
import { ClientTask, Contact } from '../types';
import TaskStatusPill from './TaskStatusPill';
import AskAssignedEmployeeButton from './AskAssignedEmployeeButton';

function byDueDate(a: ClientTask, b: ClientTask) {
  return String(a.date).localeCompare(String(b.date));
}

export default function TaskList(props: {
  contact: Contact;
  onUpdateContact: (c: Contact) => void;
  showAskButton?: boolean;
}) {
  const tasks = props.contact.clientTasks || [];
  const showAskButton = props.showAskButton !== false;

  const { pending, completed } = useMemo(() => {
    const pending = tasks.filter((t) => t.status !== 'completed').slice().sort(byDueDate);
    const completed = tasks.filter((t) => t.status === 'completed').slice().sort(byDueDate);
    return { pending, completed };
  }, [tasks]);

  const toggle = (taskId: string, next: 'pending' | 'completed') => {
    props.onUpdateContact({
      ...props.contact,
      clientTasks: tasks.map((t) => (t.id === taskId ? { ...t, status: next } : t)),
    });
  };

  const setSignal = (taskId: string, signal: 'red' | 'yellow' | 'green') => {
    props.onUpdateContact({
      ...props.contact,
      clientTasks: tasks.map((t) => (t.id === taskId ? { ...t, signal } : t)),
    });
  };

  const Item = ({ t }: { t: ClientTask }) => {
    return (
      <div className="p-4 rounded-2xl border border-white/10 bg-black/20 hover:bg-white/5 transition-all flex gap-4">
        <button
          type="button"
          onClick={() => toggle(t.id, t.status === 'completed' ? 'pending' : 'completed')}
          className="mt-0.5"
          title={t.status === 'completed' ? 'Mark pending' : 'Mark completed'}
        >
          {t.status === 'completed' ? (
            <CheckCircle2 size={18} className="text-emerald-400" />
          ) : (
            <Circle size={18} className="text-slate-500" />
          )}
        </button>

        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <TaskStatusPill signal={t.signal} />
                <span className="text-[11px] font-black uppercase tracking-tight text-white truncate">{t.title}</span>
              </div>
              {t.description ? (
                <div className="mt-2 text-xs text-slate-400 leading-relaxed">{t.description}</div>
              ) : null}
              {Array.isArray(t.requiredAttachments) && t.requiredAttachments.length > 0 ? (
                <div className="mt-2 text-[10px] text-slate-500 font-bold uppercase tracking-widest">
                  Required: {t.requiredAttachments.join(' • ')}
                </div>
              ) : null}
            </div>

            <div className="flex items-center gap-2 shrink-0">
              {showAskButton ? (
                <AskAssignedEmployeeButton
                  employee={t.assignedEmployee}
                  taskTitle={t.title}
                  context={{ tenant_id: props.contact.id, task: t, contact: { id: props.contact.id, company: props.contact.company } }}
                />
              ) : null}
            </div>
          </div>

          <div className="mt-3 flex items-center gap-4 text-[10px] font-bold text-slate-500">
            <span className="inline-flex items-center gap-1">
              <CalendarDays size={14} /> {t.date}
            </span>
            {t.assignedEmployee ? (
              <span className="inline-flex items-center gap-1">
                <UserCircle2 size={14} /> {t.assignedEmployee}
              </span>
            ) : null}


          <div className="mt-4 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setSignal(t.id, 'red')}
              className="px-3 py-2 rounded-xl bg-red-500/15 border border-red-500/20 text-red-200 text-[10px] font-black uppercase tracking-widest hover:bg-red-500/20"
            >
              Red
            </button>
            <button
              type="button"
              onClick={() => setSignal(t.id, 'yellow')}
              className="px-3 py-2 rounded-xl bg-amber-500/15 border border-amber-500/20 text-amber-200 text-[10px] font-black uppercase tracking-widest hover:bg-amber-500/20"
            >
              Yellow
            </button>
            <button
              type="button"
              onClick={() => setSignal(t.id, 'green')}
              className="px-3 py-2 rounded-xl bg-emerald-500/15 border border-emerald-500/20 text-emerald-200 text-[10px] font-black uppercase tracking-widest hover:bg-emerald-500/20"
            >
              Green
            </button>
          </div>
          </div>
        </div>
      </div>
    );
  };

  if (tasks.length === 0) {
    return (
      <div className="p-8 rounded-[2.5rem] border border-white/10 bg-black/20">
        <div className="text-[11px] font-black uppercase tracking-widest text-slate-400">No tasks yet</div>
        <div className="mt-2 text-sm text-slate-500">Tasks will appear as the system generates next steps.</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="bg-[#0B0C10] border border-white/10 rounded-[2.5rem] p-8">
        <div className="flex items-end justify-between gap-6">
          <div>
            <div className="text-[10px] font-black uppercase tracking-[0.25em] text-[#66FCF1]">Task System</div>
            <div className="mt-2 text-2xl font-black uppercase tracking-tight text-white">Next Actions</div>
          </div>
          <div className="text-xs text-slate-400 font-bold">{pending.length} pending, {completed.length} completed</div>
        </div>

        <div className="mt-6 grid grid-cols-1 gap-3">
          {pending.slice(0, 8).map((t) => (
            <Item key={t.id} t={t} />
          ))}
        </div>

        {completed.length > 0 ? (
          <details className="mt-6">
            <summary className="cursor-pointer text-xs font-black uppercase tracking-widest text-slate-400">
              Completed ({completed.length})
            </summary>
            <div className="mt-4 grid grid-cols-1 gap-3">
              {completed.slice(0, 8).map((t) => (
                <Item key={t.id} t={t} />
              ))}
            </div>
          </details>
        ) : null}
      </div>
    </div>
  );
}
