import React, { useMemo, useState } from 'react';
import { Eye, EyeOff, KeyRound, ShieldCheck } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../lib/supabaseClient';

type PasswordRule = {
  label: string;
  valid: boolean;
};

const MIN_PASSWORD_LENGTH = 10;

function buildPasswordRules(password: string): PasswordRule[] {
  return [
    { label: `At least ${MIN_PASSWORD_LENGTH} characters`, valid: password.length >= MIN_PASSWORD_LENGTH },
    { label: 'At least one uppercase letter', valid: /[A-Z]/.test(password) },
    { label: 'At least one lowercase letter', valid: /[a-z]/.test(password) },
    { label: 'At least one number', valid: /\d/.test(password) },
    { label: 'At least one symbol', valid: /[^A-Za-z0-9]/.test(password) },
  ];
}

async function resolveTenantId(userId: string): Promise<string | null> {
  const preferred = await supabase
    .from('tenant_memberships')
    .select('tenant_id')
    .eq('user_id', userId)
    .limit(1)
    .maybeSingle();

  if (!preferred.error && preferred.data?.tenant_id) {
    return String((preferred.data as { tenant_id: string }).tenant_id);
  }

  const fallback = await supabase
    .from('tenant_members')
    .select('tenant_id')
    .eq('user_id', userId)
    .limit(1)
    .maybeSingle();

  if (!fallback.error && (fallback.data as any)?.tenant_id) {
    return String((fallback.data as any).tenant_id);
  }

  return null;
}

export default function SecuritySettingsPage() {
  const { user } = useAuth();
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const rules = useMemo(() => buildPasswordRules(newPassword), [newPassword]);
  const allRulesValid = rules.every((rule) => rule.valid);

  const canSubmit =
    Boolean(user?.id) &&
    allRulesValid &&
    newPassword.length > 0 &&
    confirmPassword.length > 0 &&
    newPassword === confirmPassword &&
    !saving;

  async function handleUpdatePassword() {
    if (!user?.id) {
      setError('Sign in required.');
      return;
    }

    if (!allRulesValid) {
      setError('Password does not meet security requirements.');
      return;
    }

    if (newPassword !== confirmPassword) {
      setError('Password confirmation does not match.');
      return;
    }

    setSaving(true);
    setError('');
    setSuccess('');

    try {
      const sessionRes = await supabase.auth.getSession();
      if (!sessionRes.data.session) {
        throw new Error('Your session expired. Sign in again and retry.');
      }

      const { error: updateError } = await supabase.auth.updateUser({ password: newPassword });
      if (updateError) {
        throw new Error(updateError.message || 'Unable to update password.');
      }

      try {
        const tenantId = await resolveTenantId(user.id);
        if (tenantId) {
          await supabase.from('audit_events').insert({
            tenant_id: tenantId,
            actor_user_id: user.id,
            event_type: 'auth.password_updated',
            metadata: {
              source: 'settings_security',
            },
          });
        }
      } catch {
        // Non-blocking: password update already succeeded.
      }

      setNewPassword('');
      setConfirmPassword('');
      setSuccess('Password updated successfully.');
    } catch (e: any) {
      setError(String(e?.message || e));
    } finally {
      setSaving(false);
    }
  }

  if (!user) {
    return (
      <div className="max-w-3xl mx-auto py-8 px-4 text-slate-100">
        <div className="rounded-xl border border-amber-500/40 bg-amber-950/30 p-4 text-sm">Sign in required.</div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-6 text-slate-100 space-y-6">
      <div>
        <h1 className="text-3xl font-black text-white">Security Settings</h1>
        <p className="text-sm text-slate-400 mt-2">
          Update your account password. Never share credentials and rotate passwords regularly.
        </p>
      </div>

      {error ? <div className="rounded-xl border border-rose-500/40 bg-rose-950/30 p-3 text-sm text-rose-200">{error}</div> : null}
      {success ? <div className="rounded-xl border border-emerald-500/40 bg-emerald-950/30 p-3 text-sm text-emerald-200">{success}</div> : null}

      <section className="rounded-2xl border border-slate-700 bg-slate-900 p-5 space-y-5">
        <div className="flex items-center gap-2 text-white">
          <ShieldCheck size={18} className="text-cyan-300" />
          <h2 className="text-lg font-bold">Change Password</h2>
        </div>

        <div className="space-y-2">
          <label className="block text-xs uppercase tracking-widest text-slate-400">New Password</label>
          <div className="relative">
            <input
              type={showNewPassword ? 'text' : 'password'}
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              autoComplete="new-password"
              className="w-full rounded-xl border border-slate-600 bg-slate-800 px-3 py-2 pr-10 text-sm text-slate-100 outline-none focus:border-cyan-400"
              placeholder="Enter a strong password"
            />
            <button
              type="button"
              className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-cyan-300"
              onClick={() => setShowNewPassword((v) => !v)}
              aria-label={showNewPassword ? 'Hide new password' : 'Show new password'}
            >
              {showNewPassword ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </div>
        </div>

        <div className="space-y-2">
          <label className="block text-xs uppercase tracking-widest text-slate-400">Confirm New Password</label>
          <div className="relative">
            <input
              type={showConfirmPassword ? 'text' : 'password'}
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              autoComplete="new-password"
              className="w-full rounded-xl border border-slate-600 bg-slate-800 px-3 py-2 pr-10 text-sm text-slate-100 outline-none focus:border-cyan-400"
              placeholder="Re-enter your password"
            />
            <button
              type="button"
              className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-cyan-300"
              onClick={() => setShowConfirmPassword((v) => !v)}
              aria-label={showConfirmPassword ? 'Hide confirm password' : 'Show confirm password'}
            >
              {showConfirmPassword ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </div>
        </div>

        <div className="rounded-xl border border-slate-700 bg-slate-800/70 p-4">
          <div className="flex items-center gap-2 text-xs uppercase tracking-widest text-slate-300 mb-3">
            <KeyRound size={14} /> Password Rules
          </div>
          <ul className="space-y-1 text-sm">
            {rules.map((rule) => (
              <li key={rule.label} className={rule.valid ? 'text-emerald-300' : 'text-slate-400'}>
                {rule.valid ? '✓' : '•'} {rule.label}
              </li>
            ))}
            {confirmPassword.length > 0 && (
              <li className={newPassword === confirmPassword ? 'text-emerald-300' : 'text-slate-400'}>
                {newPassword === confirmPassword ? '✓' : '•'} Passwords match
              </li>
            )}
          </ul>
        </div>

        <div className="flex justify-end">
          <button
            onClick={() => void handleUpdatePassword()}
            disabled={!canSubmit}
            className="rounded-xl bg-cyan-500 px-4 py-2 text-xs font-black uppercase tracking-wider text-slate-950 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {saving ? 'Updating...' : 'Update Password'}
          </button>
        </div>
      </section>
    </div>
  );
}
