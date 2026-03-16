import React, { useState, useEffect, useRef } from 'react';
import { Hexagon, Lock, Mail, ArrowRight, ShieldCheck, Sparkles, AlertCircle, RefreshCw } from 'lucide-react';
import { User as UserType } from '../types';
import { isSupabaseConfigured, supabase } from '../lib/supabaseClient';
import { useAuth } from '../contexts/AuthContext';
import PhoneNotification from './PhoneNotification';
import { data } from '../adapters';

interface LoginProps {
  onLogin: (user: UserType) => void;
  onBack?: () => void;
}

type TurnstileWidgetId = string | number;

interface TurnstileRenderOptions {
  sitekey: string;
  theme?: 'light' | 'dark' | 'auto';
  callback?: (token: string) => void;
  'expired-callback'?: () => void;
  'error-callback'?: () => void;
}

declare global {
  interface Window {
    turnstile?: {
      render: (container: HTMLElement, options: TurnstileRenderOptions) => TurnstileWidgetId;
      reset: (widgetId: TurnstileWidgetId) => void;
      remove: (widgetId: TurnstileWidgetId) => void;
    };
  }
}

const TURNSTILE_SITE_KEY = (import.meta.env.VITE_TURNSTILE_SITE_KEY as string | undefined)
  || (import.meta.env.VITE_AUTH_TURNSTILE_SITE_KEY as string | undefined)
  || '';

const Login: React.FC<LoginProps> = ({ onBack }) => {
  const { signIn, signInWithGoogle } = useAuth();
  const [isSystemEmpty, setIsSystemEmpty] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [captchaToken, setCaptchaToken] = useState('');
  const [notify, setNotify] = useState({ show: false, message: '', title: '', type: 'info' as 'info' | 'success' | 'error' });

  const turnstileContainerRef = useRef<HTMLDivElement | null>(null);
  const turnstileWidgetIdRef = useRef<TurnstileWidgetId | null>(null);
  const captchaEnabled = isSupabaseConfigured && Boolean(TURNSTILE_SITE_KEY);

  useEffect(() => {
    const checkGenesis = async () => {
      // Avoid relying on `tenants` reads before auth (RLS will block). Use RPC first.
      if (isSupabaseConfigured) {
        try {
          const { data: initialized, error } = await supabase.rpc('nexus_is_system_initialized');
          if (!error && typeof initialized === 'boolean') {
            setIsSystemEmpty(!initialized);
            return;
          }
        } catch (e) {
          // Continue to safe fallback below
        }

        // If Supabase is configured but check fails transiently, default to normal login
        // so existing admins are not incorrectly blocked behind Genesis.
        setIsSystemEmpty(false);
        return;
      }

      const contacts = await data.getContacts();
      setIsSystemEmpty(!contacts || contacts.length === 0);
    };
    checkGenesis();
  }, []);

  useEffect(() => {
    if (!captchaEnabled) return undefined;

    let cancelled = false;
    const renderWidget = () => {
      if (cancelled || !window.turnstile || !turnstileContainerRef.current) return;
      if (turnstileWidgetIdRef.current !== null) return;

      turnstileWidgetIdRef.current = window.turnstile.render(turnstileContainerRef.current, {
        sitekey: TURNSTILE_SITE_KEY,
        theme: 'dark',
        callback: (token: string) => {
          setCaptchaToken(token);
          setError((prev) => (prev && prev.toLowerCase().includes('captcha') ? null : prev));
        },
        'expired-callback': () => {
          setCaptchaToken('');
        },
        'error-callback': () => {
          setCaptchaToken('');
          setError('captcha verification process failed');
        },
      });
    };

    if (window.turnstile) {
      renderWidget();
      return () => {
        cancelled = true;
        if (window.turnstile && turnstileWidgetIdRef.current !== null) {
          window.turnstile.remove(turnstileWidgetIdRef.current);
          turnstileWidgetIdRef.current = null;
        }
      };
    }

    let script = document.querySelector('script[data-nexus-turnstile="true"]') as HTMLScriptElement | null;
    if (!script) {
      script = document.createElement('script');
      script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
      script.async = true;
      script.defer = true;
      script.dataset.nexusTurnstile = 'true';
      document.head.appendChild(script);
    }

    const onLoad = () => renderWidget();
    script.addEventListener('load', onLoad);

    return () => {
      cancelled = true;
      script?.removeEventListener('load', onLoad);
      if (window.turnstile && turnstileWidgetIdRef.current !== null) {
        window.turnstile.remove(turnstileWidgetIdRef.current);
        turnstileWidgetIdRef.current = null;
      }
    };
  }, [captchaEnabled]);

  const resetCaptchaWidget = () => {
    setCaptchaToken('');
    if (window.turnstile && turnstileWidgetIdRef.current !== null) {
      window.turnstile.reset(turnstileWidgetIdRef.current);
    }
  };

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    if (isSupabaseConfigured && !TURNSTILE_SITE_KEY) {
      const msg = 'Captcha site key is missing. Set VITE_TURNSTILE_SITE_KEY in frontend env.';
      setError(msg);
      setNotify({ show: true, title: 'Auth Config Missing', message: msg, type: 'error' });
      setLoading(false);
      return;
    }

    if (captchaEnabled && !captchaToken) {
      const msg = 'Complete captcha verification before signing in.';
      setError(msg);
      setNotify({ show: true, title: 'Captcha Required', message: msg, type: 'error' });
      setLoading(false);
      return;
    }

    try {
      await signIn(email, password, captchaEnabled ? captchaToken : undefined);
      setNotify({ show: true, title: 'Session Resumed', message: 'Access granted. Synchronizing workspace...', type: 'success' });
    } catch (err: any) {
      const msg = err.message || 'Authentication failed';
      setError(msg);
      setNotify({ show: true, title: 'Auth Failed', message: msg, type: 'error' });
      if (captchaEnabled) resetCaptchaWidget();
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleSignIn = async () => {
    setLoading(true);
    setError(null);

    if (isSupabaseConfigured && !TURNSTILE_SITE_KEY) {
      const msg = 'Captcha site key is missing. Set VITE_TURNSTILE_SITE_KEY in frontend env.';
      setError(msg);
      setNotify({ show: true, title: 'Auth Config Missing', message: msg, type: 'error' });
      setLoading(false);
      return;
    }

    if (captchaEnabled && !captchaToken) {
      const msg = 'Complete captcha verification before continuing with Google.';
      setError(msg);
      setNotify({ show: true, title: 'Captcha Required', message: msg, type: 'error' });
      setLoading(false);
      return;
    }

    try {
      await signInWithGoogle(captchaEnabled ? captchaToken : undefined);
      setNotify({ show: true, title: 'Redirecting', message: 'Continue with Google in the popup/redirect flow.', type: 'info' });
    } catch (err: any) {
      const msg = err?.message || 'Google sign-in failed';
      setError(msg);
      setNotify({ show: true, title: 'Google SSO Failed', message: msg, type: 'error' });
      if (captchaEnabled) resetCaptchaWidget();
    } finally {
      setLoading(false);
    }
  };

  const handleInitializeAdmin = async () => {
    window.location.hash = 'signup';
  };

  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4 relative overflow-hidden">
      <div className="absolute top-0 left-0 w-full h-full overflow-hidden z-0 pointer-events-none">
        <div className="absolute top-[-10%] left-[-10%] w-[50%] h-[50%] bg-emerald-500 rounded-full blur-[120px] opacity-10"></div>
        <div className="absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] bg-indigo-500 rounded-full blur-[120px] opacity-10"></div>
      </div>

      <div className="bg-white/5 backdrop-blur-3xl w-full max-w-md rounded-[3rem] shadow-2xl overflow-hidden z-10 flex flex-col animate-fade-in border border-white/10 relative">
        {!isSupabaseConfigured && (
          <div className="bg-emerald-500 text-slate-950 text-[10px] font-black uppercase tracking-[0.2em] py-2 text-center flex items-center justify-center gap-2">
            <Sparkles size={12} /> Emerald Intelligence Core Active
          </div>
        )}

        <div className="p-10 pb-6 text-center">
          <div className="inline-flex items-center justify-center w-20 h-20 bg-emerald-500 rounded-3xl mb-6 shadow-2xl shadow-emerald-500/20 transform rotate-3 transition-transform hover:rotate-0 cursor-pointer">
            <Hexagon className="text-slate-950 fill-slate-950/10" size={40} />
          </div>
          <h1 className="text-4xl font-black text-white tracking-tighter uppercase leading-none">Nexus<span className="text-emerald-500">OS</span></h1>
          <p className="text-slate-500 mt-3 text-xs font-black uppercase tracking-[0.3em]">
            Secure Operating System
          </p>
        </div>

        <div className="px-10 pb-10">
          {error && (
            <div className="mb-8 p-4 bg-red-500/10 border border-red-500/20 rounded-2xl flex items-start gap-3 animate-fade-in">
              <AlertCircle className="text-red-400 shrink-0 mt-0.5" size={16} />
              <p className="text-xs text-red-200 font-bold leading-relaxed">{error}</p>
            </div>
          )}

          {isSystemEmpty ? (
            <div className="space-y-6 animate-fade-in">
               <div className="p-6 bg-blue-500/10 border border-blue-500/20 rounded-[2rem] text-center">
                  <ShieldCheck className="text-blue-400 mx-auto mb-4" size={40} />
                  <h3 className="text-lg font-black text-white uppercase tracking-tight mb-2">Genesis Protocol</h3>
                  <p className="text-xs text-slate-400 leading-relaxed mb-6 font-medium">
                    This instance is currently unmanaged. The first entity to register will be granted master administrative authority.
                  </p>
                  <button
                    onClick={handleInitializeAdmin}
                    className="w-full py-4 bg-blue-600 text-white font-black rounded-2xl uppercase tracking-widest text-[10px] hover:bg-blue-500 transition-all shadow-xl shadow-blue-600/20 active:scale-95"
                  >
                    Initialize Master Admin
                  </button>
               </div>
               <div className="text-center">
                 <button onClick={onBack} className="text-[10px] font-black text-slate-500 hover:text-white uppercase tracking-widest transition-colors">Return to Site</button>
               </div>
            </div>
          ) : (
            <form onSubmit={handleAuth} className="space-y-5">
              <div className="relative group">
                <Mail className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500 group-focus-within:text-emerald-500 transition-colors" size={18} />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="name@company.com"
                  required
                  className="w-full pl-12 pr-4 py-4 bg-white/5 border border-white/10 rounded-2xl focus:outline-none focus:ring-2 focus:ring-emerald-500/50 text-white text-sm font-medium"
                />
              </div>

              <div className="relative group">
                <Lock className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500 group-focus-within:text-emerald-500 transition-colors" size={18} />
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Access Cipher"
                  required
                  className="w-full pl-12 pr-4 py-4 bg-white/5 border border-white/10 rounded-2xl focus:outline-none focus:ring-2 focus:ring-emerald-500/50 text-white text-sm font-medium"
                />
              </div>

              {captchaEnabled && (
                <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                  <div ref={turnstileContainerRef} className="min-h-[65px]" />
                  {!captchaToken && (
                    <p className="mt-2 text-[10px] text-slate-400 font-black uppercase tracking-[0.12em]">
                      Complete captcha verification to continue.
                    </p>
                  )}
                </div>
              )}

              <button type="submit" disabled={loading} className="w-full bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black py-5 rounded-[2rem] transition-all flex items-center justify-center gap-3 shadow-2xl shadow-emerald-500/10 disabled:opacity-70 mt-8 uppercase tracking-[0.2em] text-xs transform active:scale-95">
                {loading ? <RefreshCw className="animate-spin" size={18}/> : <>Resume Session <ArrowRight size={18} /></>}
              </button>

              <button
                type="button"
                disabled={loading || !isSupabaseConfigured}
                onClick={() => void handleGoogleSignIn()}
                className="w-full bg-white/10 hover:bg-white/20 text-white font-black py-4 rounded-2xl transition-all disabled:opacity-50 uppercase tracking-[0.2em] text-xs"
              >
                Continue with Google
              </button>

              <div className="mt-10 text-center flex flex-col gap-4">
                <button type="button" onClick={() => window.location.hash = 'signup'} className="text-[10px] text-slate-400 hover:text-emerald-400 font-black uppercase tracking-[0.2em] transition-colors">
                  New Client Application
                </button>
                <button type="button" onClick={onBack} className="text-[9px] text-slate-600 hover:text-slate-400 font-black uppercase tracking-widest transition-colors">
                  Return to Landing Page
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
      <PhoneNotification show={notify.show} title={notify.title} message={notify.message} type={notify.type} onClose={() => setNotify({...notify, show: false})} />
    </div>
  );
};

export default Login;
