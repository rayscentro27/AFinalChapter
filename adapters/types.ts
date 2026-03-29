import { User, Contact, Activity, Message, ClientDocument, AgencyBranding } from '../types';

export interface UserProfile {
  id: string;
  email: string;
  name: string;
  // Update: added supervisor and salesperson to roles to match global types.ts
  role: 'admin' | 'supervisor' | 'salesperson' | 'client' | 'partner' | 'sales';
  settings?: any;
  // Added optional properties to support staff onboarding and commissions
  onboardingComplete?: boolean;
  commissionSplit?: number;
  tenantId?: string;
}

export interface AuthAdapter {
  signIn: (email: string, password?: string, captchaToken?: string) => Promise<{ user: UserProfile | null, error: any }> ;
  signInWithGoogle?: (captchaToken?: string) => Promise<{ user: UserProfile | null, error: any }>;
  signUp: (data: {
    email: string;
    name: string;
    company: string;
    phone: string;
    password?: string;
    // Added optional properties to support staff deployment from Settings.tsx
    // Update: added supervisor and salesperson to roles to match global types.ts
    role?: 'admin' | 'supervisor' | 'salesperson' | 'client' | 'partner' | 'sales';
    onboardingComplete?: boolean;
    commissionSplit?: number;
  }) => Promise<{ user: UserProfile | null, error: any }>;
  signOut: () => Promise<void>;
  getCurrentUser: () => Promise<UserProfile | null>;
  onAuthStateChange: (callback: (user: UserProfile | null) => void) => () => void;
}

export interface DataAdapter {
  // Contacts/Leads
  getContacts: () => Promise<Contact[]>;
  updateContact: (contact: Contact) => Promise<Contact>;
  addContact: (contact: Partial<Contact>) => Promise<Contact>;

  // Settings
  getBranding: () => Promise<AgencyBranding>;
  updateBranding: (branding: AgencyBranding) => Promise<AgencyBranding>;
}

export interface StorageAdapter {
  uploadFile: (path: string, file: File) => Promise<{ url: string, error: any }>;
  getPublicUrl: (path: string) => string;
}

export interface AIAdapter {
  chat: (query: string, context: any) => Promise<{ text: string, actions?: any[] }>;
  generateVideo: (prompt: string, aspectRatio: string) => Promise<string | null>;
  generateText: (prompt: string, systemInstruction?: string) => Promise<string>;
}
