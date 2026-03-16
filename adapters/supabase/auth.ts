import { supabase } from '../../lib/supabaseClient';
import { AuthAdapter, UserProfile } from '../types';

const ROLE_PRIORITY: Record<UserProfile['role'], number> = {
  admin: 50,
  supervisor: 40,
  sales: 30,
  salesperson: 30,
  partner: 20,
  client: 10,
};

const coerceRole = (role: any): UserProfile['role'] => {
  if (role === 'super_admin') return 'admin';
  if (
    role === 'admin'
    || role === 'supervisor'
    || role === 'sales'
    || role === 'salesperson'
    || role === 'partner'
    || role === 'client'
  ) {
    return role;
  }
  return 'client';
};

function lower(value: any): string {
  return String(value || '').trim().toLowerCase();
}

function isMissingSchema(error: any): boolean {
  const msg = String(error?.message || '').toLowerCase();
  return (
    (msg.includes('relation') && msg.includes('does not exist'))
    || (msg.includes('column') && msg.includes('does not exist'))
    || msg.includes('schema cache')
  );
}

function isEmailVerified(user: any): boolean {
  if (!user) return false;
  if (user.email_confirmed_at) return true;
  if (user.user_metadata?.email_verified === true) return true;
  if (user.app_metadata?.email_verified === true) return true;
  return false;
}

function emailDomain(email: string): string {
  const parts = String(email || '').toLowerCase().split('@');
  if (parts.length !== 2) return '';
  return parts[1].trim();
}

async function withTimeout<T>(promise: Promise<T>, ms: number, fallback: T): Promise<T> {
  let timer: number | null = null;
  try {
    const timeoutPromise = new Promise<T>((resolve) => {
      timer = window.setTimeout(() => resolve(fallback), ms);
    });
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    if (timer !== null) {
      window.clearTimeout(timer);
    }
  }
}

async function resolveMembershipRows(userId: string): Promise<any[]> {
  const preferred = await withTimeout(
    supabase
      .from('tenant_memberships')
      .select('tenant_id,role,role_id')
      .eq('user_id', userId),
    4500,
    { data: null, error: new Error('tenant_memberships_timeout') } as any
  );

  if (!preferred.error) return preferred.data || [];
  if (!isMissingSchema(preferred.error)) return [];

  const fallback = await withTimeout(
    supabase
      .from('tenant_members')
      .select('tenant_id,role,role_id')
      .eq('user_id', userId),
    4500,
    { data: null, error: new Error('tenant_members_timeout') } as any
  );

  if (fallback.error) return [];
  return fallback.data || [];
}

async function enforceSsoConstraints(user: any): Promise<void> {
  if (!user?.id || !user?.email) return;

  const memberships = await resolveMembershipRows(user.id);
  if (!memberships.length) return;

  const tenantId = String(memberships[0]?.tenant_id || '').trim();
  if (!tenantId) return;

  const settingsRes = await withTimeout(
    supabase
      .from('tenant_auth_settings')
      .select('sso_enabled,allowed_email_domains,require_email_verified')
      .eq('tenant_id', tenantId)
      .maybeSingle(),
    4500,
    { data: null, error: new Error('tenant_auth_settings_timeout') } as any
  );

  if (settingsRes.error) {
    if (isMissingSchema(settingsRes.error)) return;
    return;
  }

  const settings = settingsRes.data;
  if (!settings?.sso_enabled) return;

  const domains = Array.isArray(settings.allowed_email_domains)
    ? settings.allowed_email_domains.map((item: any) => lower(item)).filter(Boolean)
    : [];

  const domain = emailDomain(String(user.email || ''));
  if (domains.length > 0 && !domains.includes(domain)) {
    await supabase.auth.signOut();
    throw new Error('email_domain_not_allowed');
  }

  if (settings.require_email_verified !== false && !isEmailVerified(user)) {
    await supabase.auth.signOut();
    throw new Error('email_not_verified');
  }
}

const resolveRoleFromMemberships = async (userId: string, fallbackRole: any): Promise<UserProfile['role']> => {
  try {
    const rows = await resolveMembershipRows(userId);
    if (!rows.length) return coerceRole(fallbackRole);

    let best: UserProfile['role'] = coerceRole(fallbackRole);
    for (const row of rows) {
      const r = coerceRole(row?.role);
      if (ROLE_PRIORITY[r] > ROLE_PRIORITY[best]) best = r;
    }

    return best;
  } catch {
    return coerceRole(fallbackRole);
  }
};

const toUserProfile = async (user: any): Promise<UserProfile> => {
  await enforceSsoConstraints(user);

  const resolvedRole = await resolveRoleFromMemberships(user.id, user.user_metadata?.role);
  return {
    id: user.id,
    email: user.email!,
    name: user.user_metadata?.name || '',
    role: resolvedRole,
    onboardingComplete: user.user_metadata?.onboardingComplete,
    commissionSplit: user.user_metadata?.commissionSplit,
  };
};

export const supabaseAuthAdapter: AuthAdapter = {
  signIn: async (email, password, captchaToken) => {
    const payload: any = {
      email,
      password: password || '',
    };

    if (captchaToken) {
      payload.options = { captchaToken };
    }

    const result = await withTimeout(
      supabase.auth.signInWithPassword(payload),
      12000,
      {
        data: { user: null, session: null },
        error: { message: 'Login timed out. Please retry.' },
      } as any
    );

    const { data, error } = result as any;

    if (error) return { user: null, error };

    try {
      const user = data.user;
      return { user: await toUserProfile(user), error: null };
    } catch (enforcementError: any) {
      return { user: null, error: enforcementError };
    }
  },

  signInWithGoogle: async (captchaToken) => {
    const redirectTo = `${window.location.origin}${window.location.pathname}${window.location.hash || ''}`;

    const oauthOptions: any = { redirectTo };
    if (captchaToken) oauthOptions.captchaToken = captchaToken;

    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: oauthOptions,
    });

    if (error) return { user: null, error };

    // OAuth redirects externally. User is resolved by onAuthStateChange when callback completes.
    if (data?.url) {
      return { user: null, error: null };
    }

    return { user: null, error: null };
  },

  signUp: async (signUpData) => {
    const { data, error } = await supabase.auth.signUp({
      email: signUpData.email,
      password: signUpData.password || 'Temporary123!',
      options: {
        data: {
          name: signUpData.name,
          company: signUpData.company,
          phone: signUpData.phone,
          role: signUpData.role || 'client',
          onboardingComplete: signUpData.onboardingComplete ?? true,
          commissionSplit: signUpData.commissionSplit || 50,
        },
      },
    });

    if (error) return { user: null, error };

    const user = data.user;
    if (!user) return { user: null, error: 'User creation failed' };

    return { user: await toUserProfile(user), error: null };
  },

  signOut: async () => {
    await supabase.auth.signOut();
  },

  getCurrentUser: async () => {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) return null;

    try {
      return await toUserProfile(user);
    } catch {
      return null;
    }
  },

  onAuthStateChange: (callback) => {
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (_event, session) => {
      if (!session?.user) {
        callback(null);
        return;
      }

      const user = session.user;
      try {
        callback(await toUserProfile(user));
      } catch {
        callback(null);
      }
    });

    return () => subscription.unsubscribe();
  },
};
