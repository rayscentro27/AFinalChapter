
import React, { useState } from 'react';
import { Hexagon, ArrowRight, Shield, TrendingUp, AlertCircle, RefreshCw } from 'lucide-react';
import { ViewMode, Contact } from '../types';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabaseClient';
import { sanitizeString, isValidEmail } from '../utils/security';
import RequiredDisclaimers from './legal/RequiredDisclaimers';

interface SignUpProps {
  onNavigate: (view: ViewMode) => void;
  onRegister?: (contact: Partial<Contact>) => void | Promise<void>;
}

const SignUp: React.FC<SignUpProps> = ({ onNavigate, onRegister }) => {
  const { signIn } = useAuth();
  const [formData, setFormData] = useState({
    name: '',
    company: '',
    email: '',
    password: '',
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    
    if (!isValidEmail(formData.email)) {
        setError("Invalid email address.");
        setLoading(false);
        return;
    }

    try {
      // 1. Auth Infrastructure Provisioning
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email: formData.email,
        password: formData.password,
        options: {
          data: {
            name: sanitizeString(formData.name),
            company: sanitizeString(formData.company),
            role: 'client'
          }
        }
      });

      if (authError) throw authError;
      if (!authData.user) throw new Error("Infrastructure registration failed.");

      // 2. Provision Tenant Node
      const { data: tenant, error: tenantError } = await supabase
        .from('tenants')
        .insert({
          name: sanitizeString(formData.company),
          slug: formData.company.toLowerCase().replace(/\s+/g, '-') + '-' + Math.random().toString(36).substring(7),
          status: 'active'
        })
        .select()
        .single();

      if (tenantError) throw tenantError;

      // 3. Map User to Tenant
      // SECURITY: the DB should decide the authoritative role (first user becomes admin).
      const { data: membership, error: memberError } = await supabase
        .from('tenant_memberships')
        .insert({
          tenant_id: tenant.id,
          user_id: authData.user.id,
        })
        .select('role')
        .single();

      if (memberError) throw memberError;

      const memberRole = String(membership?.role || 'client');
      const isOperator = ['admin', 'supervisor', 'sales', 'salesperson'].includes(memberRole);

      // Refresh AuthContext with the authoritative role now that membership exists.
      try {
        await signIn(formData.email, formData.password);
      } catch (e) {
        // Non-fatal: session may already be active depending on Supabase settings.
      }

      // Send onboarding welcome email through Supabase email orchestrator (non-fatal).
      try {
        await supabase.functions.invoke('email-orchestrator', {
          body: {
            message_type: 'onboarding',
            to: formData.email,
            subject: 'Welcome to Nexus',
            html: '<p><strong>Welcome to Nexus.</strong></p><p>Your workspace is ready. This platform is educational only and does not guarantee outcomes.</p>',
            text: 'Welcome to Nexus. Your workspace is ready. Educational only; no guarantees of outcomes.',
            template_key: 'welcome',
            user_id: authData.user.id,
            data: {
              company: formData.company,
              name: formData.name,
            },
          },
        });
      } catch (welcomeError) {
        console.warn('Welcome email enqueue failed', welcomeError);
      }

      // 4. Update Parent State if required
      if (onRegister) {
          await onRegister({
              name: formData.name,
              company: formData.company,
              email: formData.email,
              status: 'Lead',
              source: 'Self-Provisioning'
          });
      }

      window.location.hash = isOperator ? 'dashboard' : 'portal';
      
    } catch (err: any) {
      console.error("Infrastructure Error:", err);
      setError(err.message || 'Registration sequence interrupted.');
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#0B0C10] flex flex-col md:flex-row font-sans">
      <div className="md:w-1/2 bg-[#1F2833] text-white p-12 flex flex-col justify-between relative overflow-hidden">
        <div className="absolute top-0 right-0 p-12 opacity-5"><Hexagon size={400} /></div>
        <div className="relative z-10">
          <div className="flex items-center gap-3 mb-12">
            <div className="bg-[#66FCF1] p-2 rounded-xl shadow-lg shadow-[#66FCF1]/20">
              <Hexagon className="text-slate-950" size={24} />
            </div>
            <span className="text-2xl font-black tracking-tight uppercase text-white">Nexus<span className="text-[#66FCF1]">OS</span></span>
          </div>
          <h1 className="text-6xl md:text-8xl font-black leading-[0.85] mb-8 tracking-tighter uppercase">
            Manifest <br/>
            <span className="text-[#66FCF1] drop-shadow-[0_0_20px_rgba(102,252,241,0.2)]">Magnitude.</span>
          </h1>
          <p className="text-[#C5C6C7] text-lg mb-12 leading-relaxed max-w-md font-medium italic">
            "Provision your sovereign institutional funding node."
          </p>
        </div>
        <div className="text-[10px] font-black uppercase tracking-[0.4em] text-[#45A29E] mt-12 relative z-10">
          © 2024 Nexus Intelligence Operating System
        </div>
      </div>

      <div className="md:w-1/2 p-8 md:p-16 overflow-y-auto bg-[#0B0C10] flex flex-col items-center justify-center border-l border-white/5 relative">
        <div className="animate-laser-scan opacity-10"></div>
        
        <div className="max-w-md w-full bg-[#1F2833]/50 backdrop-blur-xl p-10 rounded-[3rem] border border-[#45A29E]/20 shadow-2xl relative z-10">
          <h2 className="text-3xl font-black text-white mb-2 uppercase tracking-tighter">Initialize Node</h2>
          <p className="text-[#45A29E] mb-10 font-medium uppercase text-[10px] tracking-widest">Begin the genesis registration sequence.</p>

          {error && (
            <div className="mb-8 bg-red-500/10 border border-red-500/20 text-red-400 p-4 rounded-2xl text-xs font-bold flex items-start gap-3 animate-fade-in">
              <AlertCircle size={18} className="shrink-0" /> {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-6">
            <div>
              <label className="block text-[10px] font-black text-[#45A29E] uppercase tracking-widest mb-2 ml-1">Legal Name</label>
              <input required type="text" className="w-full px-4 py-4 bg-[#0B0C10] border border-[#45A29E]/30 rounded-xl focus:ring-2 focus:ring-[#66FCF1]/50 outline-none transition-all text-[#C5C6C7] text-sm font-bold" placeholder="Operator Name" value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} />
            </div>
            <div>
              <label className="block text-[10px] font-black text-[#45A29E] uppercase tracking-widest mb-2 ml-1">Merchant Identity</label>
              <input required type="text" className="w-full px-4 py-4 bg-[#0B0C10] border border-[#45A29E]/30 rounded-xl focus:ring-2 focus:ring-[#66FCF1]/50 outline-none transition-all text-[#C5C6C7] text-sm font-bold" placeholder="Company Name" value={formData.company} onChange={e => setFormData({...formData, company: e.target.value})} />
            </div>
            <div>
              <label className="block text-[10px] font-black text-[#45A29E] uppercase tracking-widest mb-2 ml-1">Secure Email</label>
              <input required type="email" className="w-full px-4 py-4 bg-[#0B0C10] border border-[#45A29E]/30 rounded-xl focus:ring-2 focus:ring-[#66FCF1]/50 outline-none transition-all text-[#C5C6C7] text-sm font-bold" placeholder="admin@nexus.os" value={formData.email} onChange={e => setFormData({...formData, email: e.target.value})} />
            </div>
            <div>
              <label className="block text-[10px] font-black text-[#45A29E] uppercase tracking-widest mb-2 ml-1">Access Cipher</label>
              <input required type="password" minLength={8} className="w-full px-4 py-4 bg-[#0B0C10] border border-[#45A29E]/30 rounded-xl focus:ring-2 focus:ring-[#66FCF1]/50 outline-none transition-all text-[#C5C6C7] text-sm font-bold" placeholder="••••••••" value={formData.password} onChange={e => setFormData({...formData, password: e.target.value})} />
            </div>
            <RequiredDisclaimers title="Educational Use Disclaimers" />

            <p className="text-[10px] text-slate-400 leading-relaxed">
              By creating an account, you acknowledge educational-only use and can review
              <a href="/terms" className="text-cyan-300 hover:text-cyan-200"> Terms</a>,
              <a href="/privacy" className="text-cyan-300 hover:text-cyan-200"> Privacy</a>, and
              <a href="/ai-disclosure" className="text-cyan-300 hover:text-cyan-200"> AI Disclosure</a>.
            </p>

            <button disabled={loading} type="submit" className="w-full bg-[#45A29E] text-white font-black py-5 rounded-2xl hover:bg-[#66FCF1] hover:text-slate-950 transition-all shadow-xl flex items-center justify-center gap-3 mt-10 uppercase tracking-[0.2em] text-xs disabled:opacity-50 transform active:scale-95">
              {loading ? <RefreshCw className="animate-spin" size={20} /> : <>Execute Registration <ArrowRight size={20} /></>}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};

export default SignUp;
