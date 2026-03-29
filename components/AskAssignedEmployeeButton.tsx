import React, { useState } from 'react';
import { Bot, Loader2, X } from 'lucide-react';
import { callAgent } from '../lib/agentClient';

export default function AskAssignedEmployeeButton(props: {
  employee?: string;
  taskTitle: string;
  context?: unknown;
}) {
  const employee = props.employee || 'Nexus Analyst';
  const [open, setOpen] = useState(false);
  const [msg, setMsg] = useState('');
  const [reply, setReply] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (busy) return;
    setBusy(true);
    setReply(null);
    try {
      const out: any = await callAgent({
        employee,
        approval_mode: true,
        mode: 'live',
        user_message: msg || `Help me complete this task: ${props.taskTitle}`,
        task_context: {
          task_title: props.taskTitle,
        },
        context: props.context,
      });

      const text =
        typeof out?.final_answer === 'string'
          ? out.final_answer
          : typeof out?.message === 'string'
            ? out.message
            : JSON.stringify(out, null, 2);

      setReply(text);
    } catch (e: any) {
      setReply(`Error: ${e?.message || 'Agent call failed'}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-white/5 border border-white/10 text-slate-200 hover:bg-white/10 transition-all text-[10px] font-black uppercase tracking-widest"
        title={`Ask ${employee}`}
      >
        <Bot size={14} /> Ask {employee}
      </button>

      {open ? (
        <div className="absolute right-0 mt-3 w-[420px] max-w-[90vw] p-4 rounded-2xl bg-[#0B0C10] border border-white/10 shadow-[0_30px_100px_rgba(0,0,0,0.8)] z-[200]">
          <div className="flex items-center justify-between">
            <div className="text-[10px] font-black uppercase tracking-[0.25em] text-[#66FCF1]">Ask Assigned Employee</div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="p-2 rounded-xl bg-white/5 hover:bg-white/10 text-slate-400"
              title="Close"
            >
              <X size={14} />
            </button>
          </div>

          <div className="mt-3">
            <textarea
              className="w-full p-3 rounded-xl bg-black/40 border border-white/10 text-sm text-slate-100 placeholder:text-slate-600"
              rows={3}
              value={msg}
              onChange={(e) => setMsg(e.target.value)}
              placeholder="Ask for steps, templates, or how to complete this task..."
            />
          </div>

          <div className="mt-3 flex items-center gap-3">
            <button
              type="button"
              onClick={submit}
              disabled={busy}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-[#66FCF1] text-[#0B0C10] font-black text-[10px] uppercase tracking-widest disabled:opacity-60"
            >
              {busy ? <Loader2 size={14} className="animate-spin" /> : null}
              {busy ? 'Thinking...' : 'Send'}
            </button>
            <div className="text-[10px] text-slate-500 font-bold truncate">Task: {props.taskTitle}</div>
          </div>

          {reply ? (
            <pre className="mt-3 whitespace-pre-wrap text-xs text-slate-200 bg-black/40 p-3 rounded-xl border border-white/10 max-h-[280px] overflow-auto">
              {reply}
            </pre>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
