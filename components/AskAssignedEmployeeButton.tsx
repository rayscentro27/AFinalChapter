import React, { useState } from 'react';
import { Bot, Loader2 } from 'lucide-react';
import { runEmployee } from '../lib/runEmployee';

export default function AskAssignedEmployeeButton(props: {
  employee?: string;
  taskTitle: string;
  context?: unknown;
}) {
  const employee = props.employee || 'Nexus Analyst';
  const [loading, setLoading] = useState(false);

  const onAsk = async () => {
    if (loading) return;
    setLoading(true);
    try {
      const res = await runEmployee(
        employee,
        `Help me complete this task: ${props.taskTitle}. Provide safe, educational next steps and constraints.`,
        props.context,
        'live'
      );
      alert(res.final_answer || 'No response');
    } catch (e: any) {
      alert(e?.message || 'Failed to ask employee');
    } finally {
      setLoading(false);
    }
  };

  return (
    <button
      type="button"
      onClick={onAsk}
      disabled={loading}
      className="inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-white/5 border border-white/10 text-slate-200 hover:bg-white/10 transition-all text-[10px] font-black uppercase tracking-widest"
      title={`Ask ${employee}`}
    >
      {loading ? <Loader2 size={14} className="animate-spin" /> : <Bot size={14} />}
      Ask {employee}
    </button>
  );
}
