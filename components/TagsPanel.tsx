import React, { useMemo, useState } from 'react';
import { supabase } from '../lib/supabaseClient';

const QUICK_TAGS = ['new_lead', 'billing', 'support', 'credit_repair', 'funding', 'documents', 'urgent'];

type TagsPanelProps = {
  tenantId?: string;
  conversationId?: string;
  tags?: string[];
  onUpdated?: (nextTags: string[]) => void;
  enableRoutingButton?: boolean;
  autoRunRoutingOnUpdate?: boolean;
};

function normalizeTag(input: string): string {
  return String(input || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '_')
    .replace(/[^a-z0-9_:-]/g, '');
}

function TagChip({
  children,
  onRemove,
  title,
}: {
  children: React.ReactNode;
  onRemove?: () => void;
  title?: string;
}) {
  return (
    <span
      title={title}
      className="inline-flex items-center gap-2 rounded-full border border-black/15 bg-white px-2.5 py-1 text-xs font-semibold text-slate-700"
    >
      <span>{children}</span>
      {onRemove ? (
        <button
          onClick={onRemove}
          className="border-none bg-transparent text-sm leading-none opacity-70 hover:opacity-100"
          aria-label="Remove tag"
          title="Remove tag"
        >
          x
        </button>
      ) : null}
    </span>
  );
}

export default function TagsPanel({
  tenantId,
  conversationId,
  tags,
  onUpdated,
  enableRoutingButton = true,
  autoRunRoutingOnUpdate = true,
}: TagsPanelProps) {
  const [busy, setBusy] = useState(false);
  const [newTag, setNewTag] = useState('');
  const [error, setError] = useState('');

  const tagList = useMemo(() => (Array.isArray(tags) ? tags : []), [tags]);

  async function runRoutingRequest(manageBusy: boolean) {
    if (!tenantId || !conversationId) return;

    if (manageBusy) {
      setBusy(true);
      setError('');
    }

    try {
      const response = await fetch('/.netlify/functions/routing-run', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          tenant_id: tenantId,
          conversation_id: conversationId,
          force: true,
        }),
      });

      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(String((payload as any)?.error || 'Routing failed'));
    } finally {
      if (manageBusy) setBusy(false);
    }
  }

  async function updateTags(nextTags: string[]) {
    if (!tenantId || !conversationId) return;

    setBusy(true);
    setError('');

    try {
      const { data, error: updateError } = await supabase
        .from('conversations')
        .update({ tags: nextTags })
        .eq('tenant_id', tenantId)
        .eq('id', conversationId)
        .select('tags')
        .single();

      if (updateError) throw updateError;

      const savedTags = (data?.tags || []) as string[];
      onUpdated?.(savedTags);

      if (autoRunRoutingOnUpdate) {
        try {
          await runRoutingRequest(false);
        } catch (routingError: any) {
          setError(`Tags saved, but routing failed: ${String(routingError?.message || routingError)}`);
        }
      }
    } catch (e: any) {
      setError(String(e?.message || e));
    } finally {
      setBusy(false);
    }
  }

  async function addTag(raw: string) {
    const normalized = normalizeTag(raw);
    if (!normalized) return;

    const next = Array.from(new Set([...(tagList || []), normalized]));
    await updateTags(next);
    setNewTag('');
  }

  async function removeTag(tag: string) {
    const next = (tagList || []).filter((value) => value !== tag);
    await updateTags(next);
  }

  async function runRouting() {
    if (!tenantId || !conversationId) return;

    setError('');
    try {
      await runRoutingRequest(true);
    } catch (e: any) {
      setError(String(e?.message || e));
    }
  }

  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50/80 p-3">
      <div className="mb-2 flex items-center justify-between gap-3">
        <h4 className="text-xs font-black uppercase tracking-widest text-slate-700">Tags</h4>
        {enableRoutingButton ? (
          <button
            onClick={() => void runRouting()}
            disabled={busy || !tenantId || !conversationId}
            className="rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-[10px] font-black uppercase tracking-widest text-slate-700 disabled:opacity-50"
          >
            {busy ? 'Working...' : 'Run routing'}
          </button>
        ) : null}
      </div>

      {error ? <div className="mb-2 text-xs font-semibold text-red-700">{error}</div> : null}

      <div className="mb-2 flex flex-wrap gap-2">
        {tagList.length === 0 ? (
          <span className="text-xs text-slate-500">No tags yet.</span>
        ) : (
          tagList.map((tag) => (
            <TagChip key={tag} title={tag} onRemove={busy ? undefined : () => void removeTag(tag)}>
              {tag}
            </TagChip>
          ))
        )}
      </div>

      <div className="mb-2 flex flex-wrap gap-2">
        {QUICK_TAGS.map((quickTag) => {
          const exists = tagList.includes(quickTag);
          return (
            <button
              key={quickTag}
              onClick={() => void addTag(quickTag)}
              disabled={busy || exists}
              className="rounded-lg border border-slate-300 bg-white px-2 py-1 text-[10px] font-bold uppercase tracking-widest text-slate-700 disabled:opacity-40"
              title={exists ? 'Already added' : 'Add tag'}
            >
              + {quickTag}
            </button>
          );
        })}
      </div>

      <div className="flex items-center gap-2">
        <input
          value={newTag}
          onChange={(event) => setNewTag(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              void addTag(newTag);
            }
          }}
          disabled={busy}
          placeholder="Add a tag..."
          className="flex-1 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 outline-none focus:border-indigo-500"
        />
        <button
          onClick={() => void addTag(newTag)}
          disabled={busy}
          className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-[10px] font-black uppercase tracking-widest text-slate-700 disabled:opacity-50"
        >
          Add
        </button>
      </div>

      <p className="mt-2 text-[11px] text-slate-500">
        Tag updates can drive routing rules with <code>tag_or_keyword</code>.
      </p>
    </div>
  );
}
