import React, { useState } from 'react';
import { AlertCircle, DollarSign, RefreshCw, Sparkles } from 'lucide-react';
import { Contact } from '../types';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabaseClient';

interface OnboardingWizardProps {
  contact: Contact;
  onComplete: (updatedContact: Contact) => void;
}

async function getAccessToken(): Promise<string | null> {
  const { data } = await supabase.auth.getSession();
  return data?.session?.access_token || null;
}

const OnboardingWizard: React.FC<OnboardingWizardProps> = ({ contact, onComplete }) => {
  const { user } = useAuth();
  const [step, setStep] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [formData, setFormData] = useState({
    companyName: contact.company || '',
    revenue: '',
    goal: '300000',

    // Intake -> tenant_profiles (drives task generation)
    has_registered_business: false,
    credit_report_uploaded: false,
    credit_score_est: 680,
    has_major_derog: false,
    utilization_pct: 20,
    months_reserves: 2,
    docs_ready: false,
    wants_grants: false,
    wants_sba: false,
    wants_tier1: true,
  });

  const handleFinish = async () => {
    setIsLoading(true);
    setError(null);

    if (!user) {
      setError('Session failed. Please sign in again.');
      setIsLoading(false);
      return;
    }

    try {
      // Resolve tenant membership (client portal is tenant-scoped).
      const { data: membership, error: mErr } = await supabase
        .from('tenant_memberships')
        .select('tenant_id')
        .eq('user_id', user.id)
        .single();

      if (mErr) throw mErr;
      if (!membership?.tenant_id) throw new Error('No tenant membership found.');

      // Map magnitude + branding to audit logs
      const { error: aError } = await supabase.from('audit_logs').insert({
        tenant_id: membership.tenant_id,
        user_id: user.id,
        action: 'initialize_portal',
        entity_type: 'tenant',
        entity_id: membership.tenant_id,
        meta: {
          magnitude: Number(formData.goal),
          revenue: Number(formData.revenue),
          branding: {
            name: formData.companyName || 'Nexus OS',
            primaryColor: '#66FCF1',
          },
        },
      });
      if (aError) throw aError;

      // Save intake + generate baseline tasks via Netlify function (idempotent).
      const token = await getAccessToken();
      if (!token) throw new Error('Missing access token.');

      const intakeRes = await fetch('/.netlify/functions/client_intake_save_and_generate_tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          tenant_id: membership.tenant_id,
          has_registered_business: formData.has_registered_business,
          credit_report_uploaded: formData.credit_report_uploaded,
          credit_score_est: Number(formData.credit_score_est),
          has_major_derog: formData.has_major_derog,
          utilization_pct: Number(formData.utilization_pct),
          months_reserves: Number(formData.months_reserves),
          docs_ready: formData.docs_ready,
          wants_grants: formData.wants_grants,
          wants_sba: formData.wants_sba,
          wants_tier1: formData.wants_tier1,
        }),
      });

      if (!intakeRes.ok) {
        const j = await intakeRes.json().catch(() => ({}));
        throw new Error(j?.error || 'Failed to save intake / generate tasks.');
      }

      // Load tasks for UI hydration
      const { data: rows, error: tErr } = await supabase
        .from('client_tasks')
        .select('*')
        .eq('tenant_id', membership.tenant_id)
        .order('due_date', { ascending: true });

      if (tErr) throw tErr;

      const clientTasks = (rows || []).map((r: any) => ({
        id: String(r.task_id),
        title: String(r.title),
        description: r.description || undefined,
        status: r.status || 'pending',
        date: String(r.due_date),
        type: r.type || 'action',
        signal: r.signal || undefined,
        assignedEmployee: r.assigned_employee || undefined,
        groupKey: r.group_key || undefined,
        templateKey: r.template_key || undefined,
        link: r.link || undefined,
        meetingTime: r.meeting_time || undefined,
        linkedToGoal: r.linked_to_goal || undefined,
      }));

      onComplete({
        ...contact,
        company: formData.companyName,
        revenue: Number(formData.revenue),
        onboardingComplete: true,
        clientTasks,
      });

      // Client users are forced to the portal view anyway; keep hash clean.
      window.location.hash = 'portal';
    } catch (err: any) {
      console.error('Portal Initialization Failure:', err);
      setError(err?.message || 'Error occurred during initialization.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] bg-[#0B0C10] flex items-center justify-center p-6">
      <div className="bg-[#1F2833] max-w-2xl w-full rounded-[3.5rem] shadow-2xl overflow-hidden border border-[#45A29E]/30">
        <div className="bg-[#0B0C10] p-12 text-white relative overflow-hidden">
          <h2 className="text-4xl font-black uppercase tracking-tighter text-[#66FCF1] relative z-10">Nexus Protocol</h2>
          <div className="absolute top-0 right-0 p-10 opacity-10 rotate-12 text-[#66FCF1]"><Sparkles size={160} /></div>
        </div>

        <div className="p-12">
          {error && (
            <div className="mb-8 p-4 bg-red-500/10 border border-red-500/20 text-red-400 rounded-2xl text-xs font-bold flex items-center gap-3">
              <AlertCircle size={18} /> {error}
            </div>
          )}

          {step === 0 ? (
            <div className="space-y-8 animate-fade-in">
              <h3 className="text-2xl font-black text-white uppercase tracking-tight text-center">Entity Magnitude</h3>
              <div className="relative">
                <DollarSign className="absolute left-6 top-1/2 -translate-y-1/2 text-[#45A29E]" size={32} />
                <input
                  type="number"
                  value={formData.goal}
                  onChange={(e) => setFormData({ ...formData, goal: e.target.value })}
                  className="w-full p-8 pl-16 bg-[#0B0C10] border border-[#45A29E]/30 rounded-[2.5rem] text-5xl font-black tracking-tighter text-[#66FCF1] outline-none focus:ring-2 focus:ring-[#66FCF1]/20 transition-all text-center"
                />
              </div>
              <button
                onClick={() => setStep(1)}
                className="w-full bg-[#45A29E] text-white py-5 rounded-[2rem] font-black uppercase text-xs tracking-widest hover:bg-[#66FCF1] hover:text-[#0B0C10] transition-all"
              >
                Proceed to Intake
              </button>
            </div>
          ) : (
            <div className="space-y-6 animate-fade-in">
              <h3 className="text-2xl font-black text-white uppercase tracking-tight text-center">Vitals Protocol</h3>

              <div className="space-y-4">
                <input
                  type="text"
                  placeholder="Merchant Identity"
                  value={formData.companyName}
                  onChange={(e) => setFormData({ ...formData, companyName: e.target.value })}
                  className="w-full p-4 bg-[#0B0C10] border border-[#45A29E]/30 rounded-xl text-white font-bold outline-none"
                />
                <input
                  type="number"
                  placeholder="Estimated Revenue"
                  value={formData.revenue}
                  onChange={(e) => setFormData({ ...formData, revenue: e.target.value })}
                  className="w-full p-4 bg-[#0B0C10] border border-[#45A29E]/30 rounded-xl text-white font-bold outline-none"
                />
              </div>

              <div className="mt-2 bg-black/20 border border-white/10 rounded-2xl p-5 space-y-4">
                <div className="text-[10px] font-black uppercase tracking-[0.25em] text-slate-400">Readiness Snapshot</div>

                <label className="flex items-center gap-3 text-sm text-slate-200">
                  <input
                    type="checkbox"
                    checked={formData.has_registered_business}
                    onChange={(e) => setFormData({ ...formData, has_registered_business: e.target.checked })}
                  />
                  <span>I already have a registered business</span>
                </label>

                <label className="flex items-center gap-3 text-sm text-slate-200">
                  <input
                    type="checkbox"
                    checked={formData.credit_report_uploaded}
                    onChange={(e) => setFormData({ ...formData, credit_report_uploaded: e.target.checked })}
                  />
                  <span>I uploaded my credit report (AnnualCreditReport.com)</span>
                </label>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <label className="text-xs font-bold text-slate-300">
                    Credit score estimate
                    <input
                      className="w-full mt-1 p-2 rounded-xl bg-black/40 border border-white/10 text-slate-100"
                      type="number"
                      value={formData.credit_score_est}
                      onChange={(e) => setFormData({ ...formData, credit_score_est: Number(e.target.value) })}
                    />
                  </label>

                  <label className="text-xs font-bold text-slate-300">
                    Utilization %
                    <input
                      className="w-full mt-1 p-2 rounded-xl bg-black/40 border border-white/10 text-slate-100"
                      type="number"
                      value={formData.utilization_pct}
                      onChange={(e) => setFormData({ ...formData, utilization_pct: Number(e.target.value) })}
                    />
                  </label>

                  <label className="text-xs font-bold text-slate-300">
                    Months reserves
                    <input
                      className="w-full mt-1 p-2 rounded-xl bg-black/40 border border-white/10 text-slate-100"
                      type="number"
                      value={formData.months_reserves}
                      onChange={(e) => setFormData({ ...formData, months_reserves: Number(e.target.value) })}
                    />
                  </label>

                  <label className="flex items-center gap-3 mt-6 text-sm text-slate-200">
                    <input
                      type="checkbox"
                      checked={formData.has_major_derog}
                      onChange={(e) => setFormData({ ...formData, has_major_derog: e.target.checked })}
                    />
                    <span>Major derogatories (charge-off/collections)</span>
                  </label>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <label className="flex items-center gap-3 text-sm text-slate-200">
                    <input
                      type="checkbox"
                      checked={formData.wants_tier1}
                      onChange={(e) => setFormData({ ...formData, wants_tier1: e.target.checked })}
                    />
                    <span>Want Tier 1 (0% intro)</span>
                  </label>

                  <label className="flex items-center gap-3 text-sm text-slate-200">
                    <input
                      type="checkbox"
                      checked={formData.wants_sba}
                      onChange={(e) => setFormData({ ...formData, wants_sba: e.target.checked })}
                    />
                    <span>Want SBA path</span>
                  </label>

                  <label className="flex items-center gap-3 text-sm text-slate-200">
                    <input
                      type="checkbox"
                      checked={formData.wants_grants}
                      onChange={(e) => setFormData({ ...formData, wants_grants: e.target.checked })}
                    />
                    <span>Want grants</span>
                  </label>
                </div>
              </div>

              <button
                disabled={isLoading}
                onClick={handleFinish}
                className="w-full bg-[#66FCF1] text-[#0B0C10] py-5 rounded-[2rem] font-black uppercase text-xs tracking-widest hover:bg-white transition-all flex items-center justify-center gap-3 disabled:opacity-60"
              >
                {isLoading ? <RefreshCw className="animate-spin" size={18} /> : 'Initialize Node'}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default OnboardingWizard;
