import React, { createContext, useContext, useEffect, useState } from 'react';
import { auth } from '../adapters';
import { UserProfile } from '../adapters/types';

interface AuthContextType {
  user: UserProfile | null;
  loading: boolean;
  signIn: (email: string, password?: string) => Promise<void>;
  signInWithGoogle: () => Promise<void>;
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
    const unsubscribe = auth.onAuthStateChange((newUser) => {
      setUser(newUser);
      setLoading(false);
    });
    return unsubscribe;
  }, []);

  const signIn = async (email: string, password?: string) => {
    const { user: newUser, error } = await auth.signIn(email, password);
    if (error) throw error;
    setUser(newUser);
  };

  const signInWithGoogle = async () => {
    if (!auth.signInWithGoogle) {
      throw new Error('google_sso_not_available');
    }

    const { user: newUser, error } = await auth.signInWithGoogle();
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
