
import React, { useState } from 'react';
import { ArrowRight, DollarSign, RefreshCw, AlertCircle, Sparkles } from 'lucide-react';
import { Contact } from '../types';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabaseClient';

interface OnboardingQuestionnaireProps {
  contact: Contact;
  onComplete: (updatedContact: Contact) => void;
}

const OnboardingQuestionnaire: React.FC<OnboardingQuestionnaireProps> = ({ contact, onComplete }) => {
  const { user } = useAuth();
  const [step, setStep] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  const [formData, setFormData] = useState({
    companyName: contact.company || '',
    revenue: '',
    goal: '300000'
  });

  const handleFinish = async () => {
    setIsLoading(true);
    setError(null);

    if (!user) {
        setError("Session failed. Please sign in again.");
        setIsLoading(false);
        return;
    }

    try {
      // 1. Resolve Tenant Membership
      const { data: membership } = await supabase
        .from('tenant_memberships')
        .select('tenant_id')
        .eq('user_id', user.id)
        .single();

      if (!membership) throw new Error("No tenant membership found.");

      // 2. Map Magnitude & Branding to Audit Logs
      const { error: aError } = await supabase
        .from('audit_logs')
        .insert({
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
              primaryColor: '#66FCF1'
            }
          }
        });

      if (aError) throw aError;

      // Generate baseline tasks for this tenant (idempotent).
      try {
        await supabase.rpc('generate_tasks_for_tenant', { p_tenant_id: membership.tenant_id });
      } catch {
        // ignore
      }

      let clientTasks: any[] = [];
      try {
        const { data: rows } = await supabase
          .from('client_tasks')
          .select('*')
          .eq('tenant_id', membership.tenant_id)
          .order('due_date', { ascending: true });

        clientTasks = (rows || []).map((r: any) => ({
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
      } catch {
        // ignore
      }

      onComplete({
        ...contact,
        company: formData.companyName,
        revenue: Number(formData.revenue),
        onboardingComplete: true,
        clientTasks
      });

      window.location.hash = 'dashboard';
      
    } catch (err: any) {
      console.error('Portal Initialization Failure:', err);
      setError(err.message || 'Error occurred during initialization.');
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
                        <input type="number" value={formData.goal} onChange={e => setFormData({...formData, goal: e.target.value})} className="w-full p-8 pl-16 bg-[#0B0C10] border border-[#45A29E]/30 rounded-[2.5rem] text-5xl font-black tracking-tighter text-[#66FCF1] outline-none focus:ring-2 focus:ring-[#66FCF1]/20 transition-all text-center" />
                    </div>
                    <button onClick={() => setStep(1)} className="w-full bg-[#45A29E] text-white py-5 rounded-[2rem] font-black uppercase text-xs tracking-widest hover:bg-[#66FCF1] hover:text-[#0B0C10] transition-all">Proceed to Vitals</button>
                </div>
            ) : (
                <div className="space-y-6 animate-fade-in">
                    <h3 className="text-2xl font-black text-white uppercase tracking-tight text-center">Vitals Protocol</h3>
                    <div className="space-y-4">
                        <input type="text" placeholder="Merchant Identity" value={formData.companyName} onChange={e => setFormData({...formData, companyName: e.target.value})} className="w-full p-4 bg-[#0B0C10] border border-[#45A29E]/30 rounded-xl text-white font-bold outline-none" />
                        <input type="number" placeholder="Estimated Revenue" value={formData.revenue} onChange={e => setFormData({...formData, revenue: e.target.value})} className="w-full p-4 bg-[#0B0C10] border border-[#45A29E]/30 rounded-xl text-white font-bold outline-none" />
                    </div>
                    <button 
                        disabled={isLoading}
                        onClick={handleFinish} 
                        className="w-full bg-[#66FCF1] text-[#0B0C10] py-5 rounded-[2rem] font-black uppercase text-xs tracking-widest hover:bg-white transition-all flex items-center justify-center gap-3"
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

export default OnboardingQuestionnaire;
