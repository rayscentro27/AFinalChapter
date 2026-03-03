import React, { useEffect, useMemo, useState } from 'react';
import { unsubscribeLeadByToken } from '../services/funnelService';

export default function UnsubscribePage() {
  const [status, setStatus] = useState<'loading' | 'success' | 'error' | 'idle'>('idle');
  const [message, setMessage] = useState('');

  const token = useMemo(() => {
    if (typeof window === 'undefined') return '';
    const params = new URLSearchParams(window.location.search);
    return String(params.get('token') || '').trim();
  }, []);

  useEffect(() => {
    let active = true;

    async function run() {
      if (!token) {
        setStatus('error');
        setMessage('Missing unsubscribe token.');
        return;
      }

      setStatus('loading');
      setMessage('Processing unsubscribe request...');

      try {
        await unsubscribeLeadByToken(token);
        if (!active) return;
        setStatus('success');
        setMessage('You have been unsubscribed from educational marketing emails.');
      } catch (e: any) {
        if (!active) return;
        setStatus('error');
        setMessage(String(e?.message || e));
      }
    }

    void run();

    return () => {
      active = false;
    };
  }, [token]);

  return (
    <div className="min-h-screen bg-slate-950 px-4 py-14 text-slate-100">
      <div className="mx-auto max-w-xl rounded-2xl border border-slate-700 bg-slate-900 p-6 space-y-3">
        <h1 className="text-2xl font-black text-white">Email Unsubscribe</h1>
        <p className="text-sm text-slate-400">Educational communications preferences update.</p>

        {status === 'loading' ? <div className="text-sm text-slate-300">{message}</div> : null}
        {status === 'success' ? <div className="rounded-xl border border-emerald-500/50 bg-emerald-950/30 px-3 py-2 text-sm text-emerald-200">{message}</div> : null}
        {status === 'error' ? <div className="rounded-xl border border-rose-500/50 bg-rose-950/30 px-3 py-2 text-sm text-rose-200">{message}</div> : null}

        <a href="/" className="inline-block text-xs text-cyan-300">Return to Nexus home</a>
      </div>
    </div>
  );
}
