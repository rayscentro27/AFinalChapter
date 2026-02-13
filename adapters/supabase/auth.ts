
import { supabase } from '../../lib/supabaseClient';
import { AuthAdapter, UserProfile } from '../types';

export const supabaseAuthAdapter: AuthAdapter = {
  signIn: async (email, password) => {
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password: password || '',
    });
    
    if (error) return { user: null, error };
    
    const user = data.user;
    return {
      user: {
        id: user.id,
        email: user.email!,
        name: user.user_metadata.name || '',
        role: user.user_metadata.role || 'client',
        onboardingComplete: user.user_metadata.onboardingComplete,
        commissionSplit: user.user_metadata.commissionSplit,
      },
      error: null,
    };
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
          commissionSplit: signUpData.commissionSplit || 50
        }
      }
    });

    if (error) return { user: null, error };
    
    const user = data.user;
    if (!user) return { user: null, error: 'User creation failed' };
    
    return {
      user: {
        id: user.id,
        email: user.email!,
        name: user.user_metadata.name || '',
        role: user.user_metadata.role || 'client',
        onboardingComplete: user.user_metadata.onboardingComplete,
        commissionSplit: user.user_metadata.commissionSplit,
      },
      error: null
    };
  },

  signOut: async () => {
    await supabase.auth.signOut();
  },

  getCurrentUser: async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return null;
    return {
      id: user.id,
      email: user.email!,
      name: user.user_metadata.name || '',
      role: user.user_metadata.role || 'client',
      onboardingComplete: user.user_metadata.onboardingComplete,
      commissionSplit: user.user_metadata.commissionSplit,
    };
  },

  onAuthStateChange: (callback) => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user) {
        const user = session.user;
        callback({
          id: user.id,
          email: user.email!,
          name: user.user_metadata.name || '',
          role: user.user_metadata.role || 'client',
          onboardingComplete: user.user_metadata.onboardingComplete,
          commissionSplit: user.user_metadata.commissionSplit,
        });
      } else {
        callback(null);
      }
    });
    return () => subscription.unsubscribe();
  }
};
