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
  if (
    role === 'admin' ||
    role === 'supervisor' ||
    role === 'sales' ||
    role === 'salesperson' ||
    role === 'partner' ||
    role === 'client'
  ) {
    return role;
  }
  return 'client';
};

const resolveRoleFromMemberships = async (userId: string, fallbackRole: any): Promise<UserProfile['role']> => {
  // IMPORTANT: Supabase `user_metadata` is user-editable. We treat DB memberships as authoritative.
  try {
    const { data, error } = await supabase
      .from('tenant_memberships')
      .select('role')
      .eq('user_id', userId);

    if (error || !data || data.length === 0) return coerceRole(fallbackRole);

    let best: UserProfile['role'] = coerceRole(fallbackRole);
    for (const row of data as any[]) {
      const r = coerceRole(row?.role);
      if (ROLE_PRIORITY[r] > ROLE_PRIORITY[best]) best = r;
    }

    return best;
  } catch {
    return coerceRole(fallbackRole);
  }
};

const toUserProfile = async (user: any): Promise<UserProfile> => {
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
  signIn: async (email, password) => {
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password: password || '',
    });

    if (error) return { user: null, error };

    const user = data.user;
    return { user: await toUserProfile(user), error: null };
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
          // This is informational only. Real access is decided by `tenant_memberships`.
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
    return await toUserProfile(user);
  },

  onAuthStateChange: (callback) => {
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!session?.user) {
        callback(null);
        return;
      }

      const user = session.user;
      (async () => {
        try {
          callback(await toUserProfile(user));
        } catch {
          callback({
            id: user.id,
            email: user.email!,
            name: user.user_metadata?.name || '',
            role: coerceRole(user.user_metadata?.role),
            onboardingComplete: user.user_metadata?.onboardingComplete,
            commissionSplit: user.user_metadata?.commissionSplit,
          });
        }
      })();
    });

    return () => subscription.unsubscribe();
  },
};
