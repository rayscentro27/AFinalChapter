
import { AuthAdapter, UserProfile } from '../types';

const STORAGE_KEY = 'nexus_mvp_auth';
const USERS_KEY = 'nexus_mvp_users';

let subscribers: ((user: UserProfile | null) => void)[] = [];

const notifySubscribers = (user: UserProfile | null) => {
  subscribers.forEach(cb => cb(user));
};

// Seeding logic for test users
const seedInitialUsers = () => {
  const users = JSON.parse(localStorage.getItem(USERS_KEY) || '[]');
  const testEmail = 'raynexus2171@gmail.com';
  
  if (!users.find((u: UserProfile) => u.email.toLowerCase() === testEmail.toLowerCase())) {
    const testUser: UserProfile = {
      id: 'u_genesis_ray',
      email: testEmail,
      name: 'Ray Nexus',
      role: 'admin',
      onboardingComplete: true,
      commissionSplit: 70
    };
    users.push(testUser);
    localStorage.setItem(USERS_KEY, JSON.stringify(users));
  }
};

export const mvpAuthAdapter: AuthAdapter = {
  signIn: async (email) => {
    seedInitialUsers();
    await new Promise(resolve => setTimeout(resolve, 800));
    const users = JSON.parse(localStorage.getItem(USERS_KEY) || '[]');
    const user = users.find((u: UserProfile) => u.email.toLowerCase() === email.toLowerCase());
    
    if (user) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(user));
      notifySubscribers(user); 
      return { user, error: null };
    }
    return { user: null, error: 'Account not found. Please register as a new entity.' };
  },

  signUp: async (data) => {
    seedInitialUsers();
    await new Promise(resolve => setTimeout(resolve, 1000));
    const users = JSON.parse(localStorage.getItem(USERS_KEY) || '[]');
    
    const emailExists = users.some((u: UserProfile) => u.email.toLowerCase() === data.email.toLowerCase());
    if (emailExists) {
      return { user: null, error: 'An account with this email already exists.' };
    }

    // PROTOCOL: The very first user to register is ALWAYS granted Master Admin
    const isFirstUserInSystem = users.length === 0;
    
    const newUser: UserProfile = {
      id: `u_${Date.now()}`,
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
      return stored ? JSON.parse(stored) : null;
    } catch (e) { return null; }
  },

  onAuthStateChange: (callback) => {
    seedInitialUsers();
    subscribers.push(callback);
    const initialUser = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
    callback(initialUser);
    return () => { subscribers = subscribers.filter(cb => cb !== callback); };
  }
};
