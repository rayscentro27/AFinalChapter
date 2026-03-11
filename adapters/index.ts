
import { BACKEND_CONFIG } from './config';
import { mvpAuthAdapter } from './mvpMock/auth';
import { mvpDataAdapter } from './mvpMock/data';
import { supabaseAuthAdapter } from './supabase/auth';
import { supabaseDataAdapter } from './supabase/data';
import { AuthAdapter, DataAdapter, AIAdapter, StorageAdapter } from './types';
import * as geminiService from '../services/geminiService';

// For MVP, we wrap our existing services as adapters
const wrapAIAdapter = (): AIAdapter => ({
  chat: async (q, c) => geminiService.chatWithCRM(q, Array.isArray(c) ? c : []),
  generateVideo: async (p, a) => geminiService.generateSocialVideo(p, a as any),
  generateText: async (p, s) => {
    // Basic wrapper
    return ""; 
  }
});

const mockStorage: StorageAdapter = {
  uploadFile: async () => ({ url: 'https://via.placeholder.com/150', error: null }),
  getPublicUrl: (p) => p
};

export const auth: AuthAdapter = BACKEND_CONFIG.mode === 'supabase' ? supabaseAuthAdapter : mvpAuthAdapter;
export const data: DataAdapter = BACKEND_CONFIG.mode === 'supabase' ? supabaseDataAdapter : mvpDataAdapter;
export const ai: AIAdapter = wrapAIAdapter();
export const storage: StorageAdapter = mockStorage;
