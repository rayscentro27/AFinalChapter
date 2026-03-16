import React, { createContext, useContext, useEffect, useState } from 'react';
import { auth } from '../adapters';
import { UserProfile } from '../adapters/types';

interface AuthContextType {
  user: UserProfile | null;
  loading: boolean;
  signIn: (email: string, password?: string, captchaToken?: string) => Promise<void>;
  signInWithGoogle: (captchaToken?: string) => Promise<void>;
  signUp: (data: any) => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  loading: true,
  signIn: async () => {},
  signInWithGoogle: async () => {},
  signUp: async () => {},
  signOut: async () => {},
});

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;

    // Safety fallback: if auth listeners fail silently, avoid perma-loading UI.
    const fallbackTimer = window.setTimeout(() => {
      if (active) setLoading(false);
    }, 6000);

    const bootstrap = async () => {
      try {
        const existingUser = await auth.getCurrentUser();
        if (active) {
          setUser(existingUser);
          setLoading(false);
        }
      } catch {
        if (active) {
          setUser(null);
          setLoading(false);
        }
      }
    };

    void bootstrap();

    const unsubscribe = auth.onAuthStateChange((newUser) => {
      if (!active) return;
      setUser(newUser);
      setLoading(false);
    });

    return () => {
      active = false;
      window.clearTimeout(fallbackTimer);
      unsubscribe();
    };
  }, []);

  const signIn = async (email: string, password?: string, captchaToken?: string) => {
    const { user: newUser, error } = await auth.signIn(email, password, captchaToken);
    if (error) throw error;
    setUser(newUser);
  };

  const signInWithGoogle = async (captchaToken?: string) => {
    if (!auth.signInWithGoogle) {
      throw new Error('google_sso_not_available');
    }

    const { user: newUser, error } = await auth.signInWithGoogle(captchaToken);
    if (error) throw error;
    if (newUser) setUser(newUser);
  };

  const signUp = async (data: any) => {
    const { user: newUser, error } = await auth.signUp(data);
    if (error) throw error;
    setUser(newUser);
  };

  const signOut = async () => {
    await auth.signOut();
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, loading, signIn, signInWithGoogle, signUp, signOut }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
