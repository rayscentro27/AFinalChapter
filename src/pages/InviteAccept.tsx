import React, { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabaseClient';

async function accessToken(): Promise<string> {
  const { data } = await supabase.auth.getSession();
  const token = data?.session?.access_token;
  if (!token) throw new Error('Sign in required');
  return token;
}

export default function InviteAccept() {
  const [token, setToken] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('Paste an invite token and accept it while signed in.');
  const [error, setError] = useState('');

  useEffect(() => {
    try {
      const hash = window.location.hash || '';
      const queryIndex = hash.indexOf('?');
      if (queryIndex >= 0) {
        const query = new URLSearchParams(hash.slice(queryIndex + 1));
        const value = String(query.get('token') || '').trim();
        if (value) setToken(value);
      }
    } catch {
      // ignore invalid URL parsing
    }
  }, []);

  async function accept() {
    setLoading(true);
    setError('');
    setMessage('');

    try {
      const access = await accessToken();
      const res = await fetch('/.netlify/functions/invites-accept', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${access}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ token }),
      });

      const payload = await res.json().catch(() => ({}));
      if (!res.ok || payload?.ok === false) {
        throw new Error(String(payload?.error || `Request failed (${res.status})`));
      }

      setMessage('Invite accepted. Refresh tenant data to confirm your new role.');
    } catch (e: any) {
      setError(String(e?.message || e));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-8 space-y-4 text-slate-100">
      <div>
        <h1 className="text-2xl font-semibold text-white">Accept Tenant Invite</h1>
        <p className="text-sm text-slate-400 mt-1">Sign in with your Google/Supabase account first, then accept invite.</p>
      </div>

      {error ? <div className="rounded-md border border-rose-500/50 bg-rose-950/30 text-rose-200 text-sm px-4 py-3">{error}</div> : null}
      {message ? <div className="rounded-md border border-blue-500/50 bg-blue-950/30 text-blue-200 text-sm px-4 py-3">{message}</div> : null}

      <div className="bg-slate-900 border border-slate-700 rounded-xl p-4 space-y-3">
        <label className="block text-xs uppercase tracking-wide text-slate-400">Invite Token</label>
        <input
          className="w-full bg-slate-800 border border-slate-600 rounded-md px-3 py-2 text-sm"
          value={token}
          onChange={(e) => setToken(e.target.value)}
          placeholder="paste invite token"
        />

        <button className="rounded bg-emerald-600 hover:bg-emerald-500 text-white text-sm px-3 py-2 disabled:opacity-50" disabled={loading || !token} onClick={() => void accept()}>
          {loading ? 'Accepting...' : 'Accept invite'}
        </button>
      </div>
    </div>
  );
}
