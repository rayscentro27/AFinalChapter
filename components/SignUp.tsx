
import React, { useState } from 'react';
import { Hexagon, ArrowRight, Shield, TrendingUp, AlertCircle, RefreshCw } from 'lucide-react';
import { ViewMode, Contact } from '../types';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabaseClient';
import { useTurnstileCaptcha } from '../hooks/useTurnstileCaptcha';
import { sanitizeString, isValidEmail } from '../utils/security';
import RequiredDisclaimers from './legal/RequiredDisclaimers';

interface SignUpProps {
  onNavigate: (view: ViewMode) => void;
  onRegister?: (contact: Partial<Contact>) => void | Promise<void>;
}

const SignUp: React.FC<SignUpProps> = ({ onNavigate, onRegister }) => {
  const isPortalTheme = window.location.pathname.toLowerCase().startsWith('/portal');
  const { refreshUser } = useAuth();
  const [formData, setFormData] = useState({
    name: '',
    company: '',
    email: '',
    password: '',
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const {
    captchaBlockedReason,
    captchaReady,
    captchaRequired,
    captchaToken,
    captchaTokenIsFresh,
    resetCaptcha,
    turnstileContainerRef,
  } = useTurnstileCaptcha({});

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setStatusMessage(null);
    
    if (!isValidEmail(formData.email)) {
        setError("Invalid email address.");
        setLoading(false);
        return;
    }

    if (captchaRequired && !captchaReady) {
      setError(captchaBlockedReason || 'Captcha verification is required, but the widget is unavailable.');
      setLoading(false);
      return;
    }

    if (captchaReady && !captchaToken) {
      setError('Complete captcha verification before creating an account.');
      setLoading(false);
      return;
    }

    if (captchaReady && !captchaTokenIsFresh) {
      setError('Captcha verification expired. Complete it again before creating an account.');
      resetCaptcha();
      setLoading(false);
      return;
    }

    try {
      // 1. Auth Infrastructure Provisioning
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email: formData.email,
        password: formData.password,
        options: {
          captchaToken: captchaReady ? captchaToken : undefined,
          data: {
            name: sanitizeString(formData.name),
            company: sanitizeString(formData.company),
            role: 'client'
          }
        }
      });

      if (authError) throw authError;
      if (!authData.user) throw new Error("Infrastructure registration failed.");

      if (!authData.session) {
        setStatusMessage('Account created. Confirm your email from the verification message, then sign in. Tenant setup will continue after your first authenticated session.');
        setFormData(prev => ({ ...prev, password: '' }));
        if (captchaRequired) resetCaptcha();
        setLoading(false);
        return;
      }

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

      await refreshUser().catch(() => {
        // Non-fatal. onAuthStateChange or a later bootstrap can still hydrate the user.
      });

      window.location.hash = isOperator ? 'dashboard' : 'portal';
      
    } catch (err: any) {
      console.error("Infrastructure Error:", err);
      const message = String(err?.message || 'Registration sequence interrupted.');
      const normalizedMessage = message.toLowerCase();
      if (normalizedMessage.includes('captcha verification process failed')) {
        setError('Captcha verification failed. Complete the challenge again, then resubmit registration.');
        resetCaptcha();
      } else if (normalizedMessage.includes('email rate limit exceeded')) {
        setError('Signup reached Supabase Auth email limits. The built-in provider is not suitable for production and can throttle confirmation emails. Configure custom SMTP in Supabase Auth or wait for the email quota window to reset, then retry.');
        if (captchaRequired) resetCaptcha();
      } else if (normalizedMessage.includes('email address not authorized')) {
        setError('Supabase Auth is still using the built-in email provider, which only sends to authorized team addresses. Configure custom SMTP in Supabase Auth before allowing public signup emails.');
        if (captchaRequired) resetCaptcha();
      } else {
        setError(message);
        if (captchaRequired) resetCaptcha();
      }
      setLoading(false);
    }
  };

  return (
    <div className={isPortalTheme ? 'min-h-screen bg-[linear-gradient(180deg,#f8fafc_0%,#eef4ff_55%,#f7faf8_100%)] flex flex-col md:flex-row font-sans' : 'min-h-screen bg-[#0B0C10] flex flex-col md:flex-row font-sans'}>
      <div className={isPortalTheme ? 'relative flex flex-col justify-between overflow-hidden bg-white p-12 text-slate-900 md:w-1/2 border-r border-slate-200' : 'md:w-1/2 bg-[#1F2833] text-white p-12 flex flex-col justify-between relative overflow-hidden'}>
        <div className="absolute top-0 right-0 p-12 opacity-5"><Hexagon size={400} /></div>
        <div className="relative z-10">
          <div className="flex items-center gap-3 mb-12">
            <div className="bg-[#66FCF1] p-2 rounded-xl shadow-lg shadow-[#66FCF1]/20">
              <Hexagon className="text-slate-950" size={24} />
            </div>
            <span className={isPortalTheme ? 'text-2xl font-black tracking-tight uppercase text-slate-900' : 'text-2xl font-black tracking-tight uppercase text-white'}>Nexus<span className="text-[#66FCF1]">OS</span></span>
          </div>
          <h1 className={isPortalTheme ? 'mb-8 text-6xl font-black uppercase leading-[0.85] tracking-tighter text-slate-900 md:text-8xl' : 'text-6xl md:text-8xl font-black leading-[0.85] mb-8 tracking-tighter uppercase'}>
            Manifest <br/>
            <span className="text-[#66FCF1] drop-shadow-[0_0_20px_rgba(102,252,241,0.2)]">Magnitude.</span>
          </h1>
          <p className={isPortalTheme ? 'mb-12 max-w-md text-lg font-medium italic leading-relaxed text-slate-500' : 'text-[#C5C6C7] text-lg mb-12 leading-relaxed max-w-md font-medium italic'}>
            "Provision your sovereign institutional funding node."
          </p>
        </div>
        <div className="text-[10px] font-black uppercase tracking-[0.4em] text-[#45A29E] mt-12 relative z-10">
          © 2024 Nexus Intelligence Operating System
        </div>
      </div>

      <div className={isPortalTheme ? 'relative flex flex-col items-center justify-center overflow-y-auto bg-[linear-gradient(180deg,#f8fafc_0%,#eef4ff_55%,#f7faf8_100%)] p-8 md:w-1/2 md:p-16' : 'md:w-1/2 p-8 md:p-16 overflow-y-auto bg-[#0B0C10] flex flex-col items-center justify-center border-l border-white/5 relative'}>
        <div className="animate-laser-scan opacity-10"></div>
        
        <div className={isPortalTheme ? 'relative z-10 w-full max-w-md rounded-[2.5rem] border border-slate-200 bg-white p-10 shadow-[0_24px_80px_rgba(15,23,42,0.08)]' : 'max-w-md w-full bg-[#1F2833]/50 backdrop-blur-xl p-10 rounded-[3rem] border border-[#45A29E]/20 shadow-2xl relative z-10'}>
          <h2 className={isPortalTheme ? 'mb-2 text-3xl font-black uppercase tracking-tighter text-slate-900' : 'text-3xl font-black text-white mb-2 uppercase tracking-tighter'}>Initialize Node</h2>
          <p className="text-[#45A29E] mb-10 font-medium uppercase text-[10px] tracking-widest">Begin the genesis registration sequence.</p>

          {error && (
            <div className={isPortalTheme ? 'mb-8 flex items-start gap-3 rounded-2xl border border-red-200 bg-red-50 p-4 text-xs font-bold text-red-600 animate-fade-in' : 'mb-8 bg-red-500/10 border border-red-500/20 text-red-400 p-4 rounded-2xl text-xs font-bold flex items-start gap-3 animate-fade-in'}>
              <AlertCircle size={18} className="shrink-0" /> {error}
            </div>
          )}

          {statusMessage && (
            <div className="mb-8 bg-emerald-500/10 border border-emerald-500/20 text-emerald-200 p-4 rounded-2xl text-xs font-bold flex items-start justify-between gap-3 animate-fade-in">
              <span>{statusMessage}</span>
              <button
                type="button"
                onClick={() => onNavigate(ViewMode.LOGIN)}
                className="shrink-0 text-[10px] uppercase tracking-[0.18em] text-emerald-300 hover:text-white transition-colors"
              >
                Go To Login
              </button>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-6">
            <div>
              <label className="block text-[10px] font-black text-[#45A29E] uppercase tracking-widest mb-2 ml-1">Legal Name</label>
              <input required type="text" className={isPortalTheme ? 'w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-4 text-sm font-bold text-slate-900 outline-none transition-all focus:ring-2 focus:ring-[#66FCF1]/40' : 'w-full px-4 py-4 bg-[#0B0C10] border border-[#45A29E]/30 rounded-xl focus:ring-2 focus:ring-[#66FCF1]/50 outline-none transition-all text-[#C5C6C7] text-sm font-bold'} placeholder="Operator Name" value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} />
            </div>
            <div>
              <label className="block text-[10px] font-black text-[#45A29E] uppercase tracking-widest mb-2 ml-1">Merchant Identity</label>
              <input required type="text" className={isPortalTheme ? 'w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-4 text-sm font-bold text-slate-900 outline-none transition-all focus:ring-2 focus:ring-[#66FCF1]/40' : 'w-full px-4 py-4 bg-[#0B0C10] border border-[#45A29E]/30 rounded-xl focus:ring-2 focus:ring-[#66FCF1]/50 outline-none transition-all text-[#C5C6C7] text-sm font-bold'} placeholder="Company Name" value={formData.company} onChange={e => setFormData({...formData, company: e.target.value})} />
            </div>
            <div>
              <label className="block text-[10px] font-black text-[#45A29E] uppercase tracking-widest mb-2 ml-1">Secure Email</label>
              <input required type="email" className={isPortalTheme ? 'w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-4 text-sm font-bold text-slate-900 outline-none transition-all focus:ring-2 focus:ring-[#66FCF1]/40' : 'w-full px-4 py-4 bg-[#0B0C10] border border-[#45A29E]/30 rounded-xl focus:ring-2 focus:ring-[#66FCF1]/50 outline-none transition-all text-[#C5C6C7] text-sm font-bold'} placeholder="admin@nexus.os" value={formData.email} onChange={e => setFormData({...formData, email: e.target.value})} />
            </div>
            <div>
              <label className="block text-[10px] font-black text-[#45A29E] uppercase tracking-widest mb-2 ml-1">Access Cipher</label>
              <input required type="password" minLength={8} className={isPortalTheme ? 'w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-4 text-sm font-bold text-slate-900 outline-none transition-all focus:ring-2 focus:ring-[#66FCF1]/40' : 'w-full px-4 py-4 bg-[#0B0C10] border border-[#45A29E]/30 rounded-xl focus:ring-2 focus:ring-[#66FCF1]/50 outline-none transition-all text-[#C5C6C7] text-sm font-bold'} placeholder="••••••••" value={formData.password} onChange={e => setFormData({...formData, password: e.target.value})} />
            </div>

            {captchaRequired && (
              <div className={isPortalTheme ? 'rounded-2xl border border-slate-200 bg-slate-50 p-4' : 'rounded-2xl border border-[#45A29E]/20 bg-[#0B0C10] p-4'}>
                {captchaReady ? (
                  <>
                    <div ref={turnstileContainerRef} className="min-h-[65px]" />
                    {!captchaToken && (
                      <p className={isPortalTheme ? 'mt-2 text-[10px] font-black uppercase tracking-[0.12em] text-slate-500' : 'mt-2 text-[10px] text-[#C5C6C7] font-black uppercase tracking-[0.12em]'}>
                        Complete captcha verification to continue.
                      </p>
                    )}
                  </>
                ) : (
                  <p className="text-[10px] text-red-300 font-black uppercase tracking-[0.12em] leading-relaxed">
                    {captchaBlockedReason}
                  </p>
                )}
              </div>
            )}

            <RequiredDisclaimers title="Educational Use Disclaimers" />

            <p className={isPortalTheme ? 'text-[10px] leading-relaxed text-slate-500' : 'text-[10px] text-slate-400 leading-relaxed'}>
              By creating an account, you acknowledge educational-only use and can review
              <a href="/terms" className="text-cyan-300 hover:text-cyan-200"> Terms</a>,
              <a href="/privacy" className="text-cyan-300 hover:text-cyan-200"> Privacy</a>, and
              <a href="/ai-disclosure" className="text-cyan-300 hover:text-cyan-200"> AI Disclosure</a>.
            </p>

            <button disabled={loading || (captchaRequired && !captchaReady)} type="submit" className={isPortalTheme ? 'mt-10 flex w-full items-center justify-center gap-3 rounded-2xl bg-[#45A29E] py-5 text-xs font-black uppercase tracking-[0.2em] text-white shadow-[0_18px_40px_rgba(69,162,158,0.18)] transition-all hover:bg-[#66FCF1] hover:text-slate-950 disabled:opacity-50' : 'w-full bg-[#45A29E] text-white font-black py-5 rounded-2xl hover:bg-[#66FCF1] hover:text-slate-950 transition-all shadow-xl flex items-center justify-center gap-3 mt-10 uppercase tracking-[0.2em] text-xs disabled:opacity-50 transform active:scale-95'}>
              {loading ? <RefreshCw className="animate-spin" size={20} /> : <>Execute Registration <ArrowRight size={20} /></>}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};

export default SignUp;
