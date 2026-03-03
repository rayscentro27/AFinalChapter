import React, { useEffect, useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../lib/supabaseClient';

type SmsTemplate = {
  id: string;
  key: 'TASK_REMINDER' | 'BILLING_ALERT' | 'LOGIN_CODE' | 'SUPPORT_FOLLOWUP';
  body: string;
  is_marketing: boolean;
  updated_at: string;
};

export default function AdminSmsTemplateEditor() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [templates, setTemplates] = useState<SmsTemplate[]>([]);

  const isSuperAdmin = user?.role === 'admin';

  async function loadTemplates() {
    setLoading(true);
    setError('');

    const { data, error: loadError } = await supabase
      .from('sms_templates')
      .select('id,key,body,is_marketing,updated_at')
      .order('key', { ascending: true });

    if (loadError) {
      setError(loadError.message || 'Unable to load SMS templates.');
      setTemplates([]);
      setLoading(false);
      return;
    }

    setTemplates((data || []) as SmsTemplate[]);
    setLoading(false);
  }

  useEffect(() => {
    if (!isSuperAdmin) {
      setLoading(false);
      return;
    }
    void loadTemplates();
  }, [isSuperAdmin]);

  async function saveTemplate(template: SmsTemplate) {
    setSavingId(template.id);
    setError('');
    setSuccess('');

    const { error: saveError } = await supabase
      .from('sms_templates')
      .update({
        body: template.body,
        is_marketing: template.is_marketing,
      })
      .eq('id', template.id);

    if (saveError) {
      setError(saveError.message || 'Unable to save template.');
      setSavingId(null);
      return;
    }

    setSuccess(`Saved ${template.key}.`);
    setSavingId(null);
    await loadTemplates();
  }

  if (!isSuperAdmin) {
    return (
      <div className="max-w-3xl mx-auto py-8 px-4 text-slate-100">
        <div className="rounded-xl border border-amber-500/40 bg-amber-950/30 p-4 text-sm">Super admin access required.</div>
      </div>
    );
  }

  if (loading) {
    return <div className="min-h-[50vh] flex items-center justify-center text-slate-300">Loading SMS templates...</div>;
  }

  return (
    <div className="max-w-5xl mx-auto px-4 py-6 text-slate-100 space-y-5">
      <div>
        <h1 className="text-2xl font-semibold text-white">Admin SMS Template Editor</h1>
        <p className="text-sm text-slate-400 mt-1">Compliance templates only. Messaging provider integration is intentionally disabled in this phase.</p>
      </div>

      {error ? <div className="rounded-md border border-rose-500/50 bg-rose-950/30 text-rose-200 text-sm px-4 py-3">{error}</div> : null}
      {success ? <div className="rounded-md border border-emerald-500/50 bg-emerald-950/30 text-emerald-200 text-sm px-4 py-3">{success}</div> : null}

      <div className="space-y-4">
        {templates.map((template) => (
          <div key={template.id} className="rounded-2xl border border-slate-700 bg-slate-900 p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="font-bold text-cyan-300 text-sm tracking-wide">{template.key}</h2>
              <label className="text-xs text-slate-300 flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={template.is_marketing}
                  onChange={(e) => {
                    const checked = e.target.checked;
                    setTemplates((prev) => prev.map((item) => item.id === template.id ? { ...item, is_marketing: checked } : item));
                  }}
                />
                Marketing
              </label>
            </div>

            <textarea
              value={template.body}
              onChange={(e) => {
                const body = e.target.value;
                setTemplates((prev) => prev.map((item) => item.id === template.id ? { ...item, body } : item));
              }}
              className="w-full min-h-28 rounded-xl border border-slate-600 bg-slate-800 p-3 text-sm text-slate-100 outline-none focus:border-cyan-400"
            />

            <div className="flex items-center justify-between">
              <span className="text-[11px] text-slate-500">Updated: {new Date(template.updated_at).toLocaleString()}</span>
              <button
                onClick={() => void saveTemplate(template)}
                disabled={savingId !== null}
                className="rounded-lg bg-cyan-500 px-3 py-1 text-xs font-black uppercase tracking-wider text-slate-950 disabled:opacity-50"
              >
                {savingId === template.id ? 'Saving...' : 'Save Template'}
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
