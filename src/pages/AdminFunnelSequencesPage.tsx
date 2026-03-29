import React, { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../lib/supabaseClient';
import {
  FunnelSequenceRow,
  FunnelStepRow,
  listFunnelSequences,
  listFunnelSteps,
} from '../services/funnelService';

type Tenant = {
  id: string;
  name: string | null;
};

const ACTION_TYPES: FunnelStepRow['action_type'][] = ['SEND_EMAIL', 'TAG_LEAD', 'START_WORKFLOW', 'CREATE_TASK', 'SHOW_OFFER', 'NOOP'];

function pretty(value: string): string {
  return value.replaceAll('_', ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

export default function AdminFunnelSequencesPage() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [tenantId, setTenantId] = useState('');

  const [sequences, setSequences] = useState<FunnelSequenceRow[]>([]);
  const [selectedSequenceId, setSelectedSequenceId] = useState('');
  const [steps, setSteps] = useState<FunnelStepRow[]>([]);

  const [sequenceForm, setSequenceForm] = useState({ key: '', name: '', description: '', is_active: true });
  const [stepForm, setStepForm] = useState({ id: '', step_order: 1, wait_minutes: 0, action_type: 'SEND_EMAIL' as FunnelStepRow['action_type'], action_payload: '{\n  "message_type": "marketing"\n}' });

  const selectedSequence = useMemo(() => sequences.find((row) => row.id === selectedSequenceId) || null, [sequences, selectedSequenceId]);

  async function loadTenants() {
    const tenantRes = await supabase
      .from('tenants')
      .select('id,name')
      .order('name', { ascending: true });

    if (tenantRes.error) {
      throw new Error(tenantRes.error.message || 'Unable to load tenants.');
    }

    const rows = (tenantRes.data || []) as Tenant[];
    setTenants(rows);
    setTenantId((prev) => prev || rows[0]?.id || '');
  }

  async function loadSequences(nextTenantId: string) {
    if (!nextTenantId) {
      setSequences([]);
      setSteps([]);
      setSelectedSequenceId('');
      return;
    }

    const rows = await listFunnelSequences(nextTenantId);
    setSequences(rows);

    const selected = rows.find((row) => row.id === selectedSequenceId) || rows[0] || null;
    const nextSelectedId = selected?.id || '';
    setSelectedSequenceId(nextSelectedId);

    if (nextSelectedId) {
      const nextSteps = await listFunnelSteps(nextSelectedId);
      setSteps(nextSteps);
    } else {
      setSteps([]);
    }
  }

  useEffect(() => {
    let active = true;

    async function boot() {
      if (!isAdmin) {
        setLoading(false);
        return;
      }

      setLoading(true);
      setError('');

      try {
        await loadTenants();
      } catch (e: any) {
        if (!active) return;
        setError(String(e?.message || e));
      } finally {
        if (active) setLoading(false);
      }
    }

    void boot();

    return () => {
      active = false;
    };
  }, [isAdmin]);

  useEffect(() => {
    if (!tenantId) return;
    void loadSequences(tenantId);
  }, [tenantId]);

  useEffect(() => {
    if (!selectedSequenceId) return;
    void listFunnelSteps(selectedSequenceId).then(setSteps).catch(() => setSteps([]));
  }, [selectedSequenceId]);

  if (!isAdmin) {
    return <div className="mx-auto max-w-3xl px-4 py-8 text-slate-100"><div className="rounded-xl border border-amber-500/40 bg-amber-950/30 p-4 text-sm">Super admin access required.</div></div>;
  }

  if (loading) {
    return <div className="min-h-[50vh] flex items-center justify-center text-slate-300">Loading funnel sequences...</div>;
  }

  async function saveSequence() {
    if (!tenantId) return;

    const key = sequenceForm.key.trim();
    const name = sequenceForm.name.trim();

    if (!key || !name) {
      setError('Sequence key and name are required.');
      return;
    }

    setSaving(true);
    setError('');
    setSuccess('');

    try {
      const payload = {
        tenant_id: tenantId,
        key,
        name,
        description: sequenceForm.description || null,
        is_active: sequenceForm.is_active,
      };

      const { error: upsertError } = await supabase
        .from('funnel_sequences')
        .upsert(payload, { onConflict: 'key' });

      if (upsertError) {
        throw new Error(upsertError.message || 'Unable to save sequence.');
      }

      setSuccess('Sequence saved.');
      await loadSequences(tenantId);
      setSequenceForm({ key: '', name: '', description: '', is_active: true });
    } catch (e: any) {
      setError(String(e?.message || e));
    } finally {
      setSaving(false);
    }
  }

  async function saveStep() {
    if (!selectedSequenceId) {
      setError('Choose a sequence first.');
      return;
    }

    let actionPayload: Record<string, unknown> = {};
    try {
      actionPayload = JSON.parse(stepForm.action_payload || '{}');
    } catch {
      setError('Action payload must be valid JSON.');
      return;
    }

    setSaving(true);
    setError('');
    setSuccess('');

    try {
      if (stepForm.id) {
        const { error: updateError } = await supabase
          .from('funnel_steps')
          .update({
            step_order: stepForm.step_order,
            wait_minutes: stepForm.wait_minutes,
            action_type: stepForm.action_type,
            action_payload: actionPayload,
          })
          .eq('id', stepForm.id);

        if (updateError) {
          throw new Error(updateError.message || 'Unable to update step.');
        }
      } else {
        const { error: insertError } = await supabase
          .from('funnel_steps')
          .insert({
            sequence_id: selectedSequenceId,
            step_order: stepForm.step_order,
            wait_minutes: stepForm.wait_minutes,
            action_type: stepForm.action_type,
            action_payload: actionPayload,
          });

        if (insertError) {
          throw new Error(insertError.message || 'Unable to create step.');
        }
      }

      setSuccess('Step saved.');
      setStepForm({
        id: '',
        step_order: (steps[steps.length - 1]?.step_order || 0) + 1,
        wait_minutes: 0,
        action_type: 'SEND_EMAIL',
        action_payload: '{\n  "message_type": "marketing"\n}',
      });
      const nextSteps = await listFunnelSteps(selectedSequenceId);
      setSteps(nextSteps);
    } catch (e: any) {
      setError(String(e?.message || e));
    } finally {
      setSaving(false);
    }
  }

  function editStep(row: FunnelStepRow) {
    setStepForm({
      id: row.id,
      step_order: row.step_order,
      wait_minutes: row.wait_minutes,
      action_type: row.action_type,
      action_payload: JSON.stringify(row.action_payload || {}, null, 2),
    });
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 text-slate-100 space-y-5">
      <div>
        <h1 className="text-2xl font-semibold text-white">Funnel Sequences</h1>
        <p className="text-sm text-slate-400 mt-1">Manage educational sequence templates, steps, waits, and actions.</p>
      </div>

      {error ? <div className="rounded-md border border-rose-500/50 bg-rose-950/30 px-4 py-3 text-sm text-rose-200">{error}</div> : null}
      {success ? <div className="rounded-md border border-emerald-500/50 bg-emerald-950/30 px-4 py-3 text-sm text-emerald-200">{success}</div> : null}

      <div className="rounded-xl border border-slate-700 bg-slate-900 p-4 grid grid-cols-1 md:grid-cols-3 gap-3">
        <div>
          <label className="block text-xs uppercase tracking-wider text-slate-400 mb-1">Tenant</label>
          <select className="w-full rounded-md border border-slate-600 bg-slate-800 px-3 py-2 text-sm" value={tenantId} onChange={(e) => setTenantId(e.target.value)}>
            {tenants.map((tenant) => <option key={tenant.id} value={tenant.id}>{tenant.name || tenant.id}</option>)}
          </select>
        </div>

        <div>
          <label className="block text-xs uppercase tracking-wider text-slate-400 mb-1">Sequence</label>
          <select className="w-full rounded-md border border-slate-600 bg-slate-800 px-3 py-2 text-sm" value={selectedSequenceId} onChange={(e) => setSelectedSequenceId(e.target.value)}>
            {sequences.map((sequence) => <option key={sequence.id} value={sequence.id}>{sequence.key}</option>)}
          </select>
        </div>

        <div className="flex items-end">
          <button className="w-full rounded-md border border-cyan-500/50 px-3 py-2 text-xs font-black uppercase tracking-wider text-cyan-200" onClick={() => void loadSequences(tenantId)} disabled={saving}>Refresh</button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="rounded-xl border border-slate-700 bg-slate-900 p-4 space-y-3">
          <h2 className="text-lg font-semibold text-white">Create / Update Sequence</h2>
          <input className="w-full rounded-md border border-slate-600 bg-slate-800 px-3 py-2 text-sm" placeholder="key (example: nurture_v2)" value={sequenceForm.key} onChange={(e) => setSequenceForm((prev) => ({ ...prev, key: e.target.value }))} />
          <input className="w-full rounded-md border border-slate-600 bg-slate-800 px-3 py-2 text-sm" placeholder="Display name" value={sequenceForm.name} onChange={(e) => setSequenceForm((prev) => ({ ...prev, name: e.target.value }))} />
          <textarea className="h-24 w-full rounded-md border border-slate-600 bg-slate-800 px-3 py-2 text-sm" placeholder="Description" value={sequenceForm.description} onChange={(e) => setSequenceForm((prev) => ({ ...prev, description: e.target.value }))} />
          <label className="flex items-center gap-2 text-xs text-slate-300"><input type="checkbox" checked={sequenceForm.is_active} onChange={(e) => setSequenceForm((prev) => ({ ...prev, is_active: e.target.checked }))} /> Active</label>
          <button className="rounded-md bg-cyan-500 px-3 py-2 text-xs font-black uppercase tracking-wider text-slate-950" onClick={() => void saveSequence()} disabled={saving}>Save Sequence</button>
        </div>

        <div className="rounded-xl border border-slate-700 bg-slate-900 p-4 space-y-3">
          <h2 className="text-lg font-semibold text-white">{stepForm.id ? 'Edit Step' : 'Add Step'} {selectedSequence ? `(${selectedSequence.key})` : ''}</h2>
          <div className="grid grid-cols-3 gap-2">
            <input type="number" className="rounded-md border border-slate-600 bg-slate-800 px-3 py-2 text-sm" value={stepForm.step_order} onChange={(e) => setStepForm((prev) => ({ ...prev, step_order: Number(e.target.value || 1) }))} />
            <input type="number" className="rounded-md border border-slate-600 bg-slate-800 px-3 py-2 text-sm" value={stepForm.wait_minutes} onChange={(e) => setStepForm((prev) => ({ ...prev, wait_minutes: Number(e.target.value || 0) }))} />
            <select className="rounded-md border border-slate-600 bg-slate-800 px-3 py-2 text-sm" value={stepForm.action_type} onChange={(e) => setStepForm((prev) => ({ ...prev, action_type: e.target.value as FunnelStepRow['action_type'] }))}>
              {ACTION_TYPES.map((actionType) => <option key={actionType} value={actionType}>{actionType}</option>)}
            </select>
          </div>
          <textarea className="h-44 w-full rounded-md border border-slate-600 bg-slate-800 px-3 py-2 text-xs font-mono" value={stepForm.action_payload} onChange={(e) => setStepForm((prev) => ({ ...prev, action_payload: e.target.value }))} />
          <div className="flex gap-2">
            <button className="rounded-md bg-cyan-500 px-3 py-2 text-xs font-black uppercase tracking-wider text-slate-950" onClick={() => void saveStep()} disabled={saving}>Save Step</button>
            {stepForm.id ? <button className="rounded-md border border-slate-600 px-3 py-2 text-xs font-black uppercase tracking-wider text-slate-200" onClick={() => setStepForm({ id: '', step_order: 1, wait_minutes: 0, action_type: 'SEND_EMAIL', action_payload: '{\n  "message_type": "marketing"\n}' })}>Reset</button> : null}
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-slate-700 bg-slate-900 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[900px]">
            <thead className="bg-slate-800/70 text-slate-300 uppercase text-xs tracking-wide">
              <tr>
                <th className="px-4 py-3 text-left">Order</th>
                <th className="px-4 py-3 text-left">Wait (mins)</th>
                <th className="px-4 py-3 text-left">Action</th>
                <th className="px-4 py-3 text-left">Payload</th>
                <th className="px-4 py-3 text-left">Edit</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {steps.map((step) => (
                <tr key={step.id}>
                  <td className="px-4 py-3 text-slate-200">{step.step_order}</td>
                  <td className="px-4 py-3 text-slate-300">{step.wait_minutes}</td>
                  <td className="px-4 py-3 text-cyan-300 uppercase">{pretty(step.action_type)}</td>
                  <td className="px-4 py-3 text-xs text-slate-400"><pre className="whitespace-pre-wrap">{JSON.stringify(step.action_payload || {}, null, 2)}</pre></td>
                  <td className="px-4 py-3"><button className="rounded-md border border-slate-600 px-2 py-1 text-xs" onClick={() => editStep(step)}>Edit</button></td>
                </tr>
              ))}
              {steps.length === 0 ? <tr><td className="px-4 py-4 text-slate-400" colSpan={5}>No steps for this sequence.</td></tr> : null}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
