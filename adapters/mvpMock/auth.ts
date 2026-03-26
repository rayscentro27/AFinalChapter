
import { AuthAdapter, UserProfile } from '../types';

const STORAGE_KEY = 'nexus_mvp_auth';
const USERS_KEY = 'nexus_mvp_users';
const DEV_ADMIN_EMAILS = new Set([
  'raynexus2171@gmail.com',
  'rayscentro@yahoo.com',
]);

let subscribers: ((user: UserProfile | null) => void)[] = [];

const isUuid = (value: string): boolean => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(value || ''));

const createUuid = (): string => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }

  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (char) => {
    const random = Math.floor(Math.random() * 16);
    const value = char === 'x' ? random : ((random & 0x3) | 0x8);
    return value.toString(16);
  });
};

const normalizeUser = (user: UserProfile): UserProfile => {
  if (isUuid(user.id)) return user;
  return {
    ...user,
    id: createUuid(),
  };
};

const notifySubscribers = (user: UserProfile | null) => {
  subscribers.forEach(cb => cb(user));
};

// Seeding logic for test users
const seedInitialUsers = () => {
  const users = (JSON.parse(localStorage.getItem(USERS_KEY) || '[]') as UserProfile[]).map(normalizeUser);
  const testEmail = 'raynexus2171@gmail.com';
  
  if (!users.find((u: UserProfile) => u.email.toLowerCase() === testEmail.toLowerCase())) {
    const testUser: UserProfile = {
      id: createUuid(),
      email: testEmail,
      name: 'Ray Nexus',
      role: 'admin',
      onboardingComplete: true,
      commissionSplit: 70
    };
    users.push(testUser);
    localStorage.setItem(USERS_KEY, JSON.stringify(users));
    return;
  }

  localStorage.setItem(USERS_KEY, JSON.stringify(users));
};

const titleCaseFromEmail = (email: string): string => {
  const localPart = String(email || '').split('@')[0] || 'Local User';
  return localPart
    .split(/[._-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
};

const persistUsers = (users: UserProfile[]) => {
  localStorage.setItem(USERS_KEY, JSON.stringify(users));
};

const createMockUser = (email: string, existingUsers: UserProfile[]): UserProfile => {
  const normalizedEmail = String(email || '').trim().toLowerCase();
  const isAdmin = DEV_ADMIN_EMAILS.has(normalizedEmail) || existingUsers.length === 0;

  return {
    id: createUuid(),
    email: normalizedEmail,
    name: titleCaseFromEmail(normalizedEmail),
    role: isAdmin ? 'admin' : 'client',
    onboardingComplete: true,
    commissionSplit: isAdmin ? 70 : 50,
  };
};

export const mvpAuthAdapter: AuthAdapter = {
  signIn: async (email, _password, _captchaToken) => {
    seedInitialUsers();
    await new Promise(resolve => setTimeout(resolve, 800));
    const normalizedEmail = String(email || '').trim().toLowerCase();
    const users = (JSON.parse(localStorage.getItem(USERS_KEY) || '[]') as UserProfile[]).map(normalizeUser);
    persistUsers(users);
    let user = users.find((u: UserProfile) => u.email.toLowerCase() === normalizedEmail);
    
    if (!user && normalizedEmail) {
      user = createMockUser(normalizedEmail, users);
      persistUsers([...users, user]);
    }

    if (!user) {
      return { user: null, error: 'Enter an email address to start a local mock session.' };
    }

    const normalizedUser = normalizeUser(user);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(normalizedUser));
    notifySubscribers(normalizedUser); 
    return { user: normalizedUser, error: null };
  },

  signUp: async (data) => {
    seedInitialUsers();
    await new Promise(resolve => setTimeout(resolve, 1000));
    const users = (JSON.parse(localStorage.getItem(USERS_KEY) || '[]') as UserProfile[]).map(normalizeUser);
    persistUsers(users);
    
    const emailExists = users.some((u: UserProfile) => u.email.toLowerCase() === data.email.toLowerCase());
    if (emailExists) {
      return { user: null, error: 'An account with this email already exists.' };
    }

    // PROTOCOL: The very first user to register is ALWAYS granted Master Admin
    const isFirstUserInSystem = users.length === 0;
    
    const newUser: UserProfile = {
      id: createUuid(),
      email: data.email.toLowerCase(),
      name: data.name,
      role: data.role || (isFirstUserInSystem ? 'admin' : 'client'),
      onboardingComplete: data.role === 'sales' ? false : true,
      commissionSplit: data.commissionSplit || 50
    };

    const updatedUsers = [...users, newUser];
    localStorage.setItem(USERS_KEY, JSON.stringify(updatedUsers));
    
    // Auto-login only if not an admin-invited staff member
    if (isFirstUserInSystem || !data.role) {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(newUser));
        notifySubscribers(newUser);
    }
    
    return { user: newUser, error: null };
  },

  signOut: async () => {
    localStorage.removeItem(STORAGE_KEY);
    notifySubscribers(null);
  },

  getCurrentUser: async () => {
    seedInitialUsers();
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (!stored) return null;
      const normalizedUser = normalizeUser(JSON.parse(stored));
      localStorage.setItem(STORAGE_KEY, JSON.stringify(normalizedUser));
      return normalizedUser;
    } catch (e) { return null; }
  },

  onAuthStateChange: (callback) => {
    seedInitialUsers();
    subscribers.push(callback);
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
    const initialUser = raw ? normalizeUser(raw) : null;
    if (initialUser) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(initialUser));
    }
    callback(initialUser);
    return () => { subscribers = subscribers.filter(cb => cb !== callback); };
  }
};
