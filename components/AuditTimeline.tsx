import React, { useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabaseClient';

type TimelineItem = {
  key: string;
  ts: string;
  title: string;
  meta: string;
};

function Row({ item }: { item: TimelineItem }) {
  return (
    <div className="border-t border-slate-100 px-4 py-3">
      <div className="text-xs font-black uppercase tracking-wider text-[#1F315F]">{item.title}</div>
      {item.meta ? <div className="mt-1 text-xs text-[#60739A]">{item.meta}</div> : null}
      <div className="mt-1 text-[11px] text-slate-500">{new Date(item.ts).toLocaleString()}</div>
    </div>
  );
}

export default function AuditTimeline({
  tenantId,
  conversationId,
}: {
  tenantId?: string;
  conversationId?: string;
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [routingRuns, setRoutingRuns] = useState<any[]>([]);
  const [systemMessages, setSystemMessages] = useState<any[]>([]);

  useEffect(() => {
    if (!tenantId || !conversationId) return;
    void load();
  }, [tenantId, conversationId]);

  async function load() {
    if (!tenantId || !conversationId) return;

    setLoading(true);
    setError('');
    try {
      const { data: rrData, error: rrError } = await supabase
        .from('routing_runs')
        .select('id, created_at, applied, notes, rule_id')
        .eq('tenant_id', tenantId)
        .eq('conversation_id', conversationId)
        .order('created_at', { ascending: false })
        .limit(100);

      if (rrError) throw rrError;
      setRoutingRuns(rrData || []);

      const { data: messageData, error: messageError } = await supabase
        .from('messages')
        .select('id, received_at, provider, body, content')
        .eq('tenant_id', tenantId)
        .eq('conversation_id', conversationId)
        .order('received_at', { ascending: false })
        .limit(250);

      if (messageError) throw messageError;

      const filtered = (messageData || []).filter((row: any) => {
        const type = String(row?.content?.type || '').toLowerCase();
        return String(row?.provider || '').toLowerCase() === 'system' || type.includes('system') || type.includes('sla');
      });

      setSystemMessages(filtered);
    } catch (e: any) {
      setError(String(e?.message || e));
    } finally {
      setLoading(false);
    }
  }

  const items = useMemo<TimelineItem[]>(() => {
    const merged: TimelineItem[] = [];

    for (const run of routingRuns) {
      merged.push({
        key: `routing:${run.id}`,
        ts: String(run.created_at || ''),
        title: run.applied ? 'Routing Applied' : 'Routing Checked',
        meta: String(run.notes || (run.rule_id ? `Rule: ${run.rule_id}` : '') || ''),
      });
    }

    for (const msg of systemMessages) {
      merged.push({
        key: `system:${msg.id}`,
        ts: String(msg.received_at || ''),
        title: 'System Note',
        meta: String(msg.body || ''),
      });
    }

    merged.sort((a, b) => new Date(b.ts).getTime() - new Date(a.ts).getTime());
    return merged;
  }, [routingRuns, systemMessages]);

  return (
    <div className="rounded-2xl border border-[#E2EAF7] bg-white text-slate-900 shadow-sm">
      <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
        <strong className="text-xs font-black uppercase tracking-widest text-[#60739A]">Audit Timeline</strong>
        <button
          onClick={() => void load()}
          className="rounded-lg border border-[#D6E5FF] bg-[#F4F8FF] px-2.5 py-1 text-[10px] font-black uppercase tracking-widest text-[#315FD0]"
        >
          Refresh
        </button>
      </div>

      {loading ? <div className="px-4 py-3 text-xs text-slate-500">Loading timeline...</div> : null}
      {!loading && error ? <div className="px-4 py-3 text-xs font-semibold text-red-700">{error}</div> : null}
      {!loading && !error && items.length === 0 ? (
        <div className="px-4 py-3 text-xs text-slate-500">No audit events yet.</div>
      ) : null}

      {!loading && !error && items.length > 0 ? (
        <div className="max-h-56 overflow-y-auto custom-scrollbar">
          {items.map((item) => (
            <Row key={item.key} item={item} />
          ))}
        </div>
      ) : null}
    </div>
  );
}
