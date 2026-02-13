
import { ApiUsageRecord, ApiThreshold } from '../types';

const USAGE_KEY = 'nexus_infra_usage';
const THRESHOLD_KEY = 'nexus_infra_thresholds';

// Estimate prices (Unit costs)
export const PRICING = {
    GEMINI_PRO_INPUT: 0.00000125, // per token
    GEMINI_PRO_OUTPUT: 0.000005,
    GEMINI_FLASH_INPUT: 0.000000075,
    GEMINI_FLASH_OUTPUT: 0.0000003,
    VEO_VIDEO: 2.50, // per 720p generation
    TWILIO_VOICE: 0.013, // per minute
    SENDGRID_EMAIL: 0.0006, // per email
};

export const logUsage = (record: Omit<ApiUsageRecord, 'id' | 'timestamp'>) => {
    const usage = JSON.parse(localStorage.getItem(USAGE_KEY) || '[]');
    const newRecord: ApiUsageRecord = {
        ...record,
        id: `usage_${Date.now()}`,
        timestamp: new Date().toISOString()
    };
    usage.push(newRecord);
    localStorage.setItem(USAGE_KEY, JSON.stringify(usage));
    checkThresholds(newRecord.service);
};

export const getUsage = (): ApiUsageRecord[] => {
    return JSON.parse(localStorage.getItem(USAGE_KEY) || '[]');
};

export const getThresholds = (): ApiThreshold[] => {
    const saved = localStorage.getItem(THRESHOLD_KEY);
    if (saved) return JSON.parse(saved);
    
    // Default thresholds
    const defaults: ApiThreshold[] = [
        { service: 'Gemini Pro', limit: 50.00, current: 0, isFrozen: false },
        { service: 'Gemini Flash', limit: 20.00, current: 0, isFrozen: false },
        { service: 'Veo Video', limit: 100.00, current: 0, isFrozen: false },
        { service: 'Twilio Voice', limit: 50.00, current: 0, isFrozen: false }
    ];
    return defaults;
};

export const saveThresholds = (thresholds: ApiThreshold[]) => {
    localStorage.setItem(THRESHOLD_KEY, JSON.stringify(thresholds));
};

export const checkThresholds = (serviceName: string) => {
    const usage = getUsage();
    const thresholds = getThresholds();
    const currentMonth = new Date().getMonth();
    const currentYear = new Date().getFullYear();

    const serviceUsage = usage.filter(r => {
        const d = new Date(r.timestamp);
        return r.service === serviceName && d.getMonth() === currentMonth && d.getFullYear() === currentYear;
    });

    const totalCost = serviceUsage.reduce((sum, r) => sum + r.cost, 0);
    
    const updatedThresholds = thresholds.map(t => {
        if (t.service === serviceName) {
            const isNearLimit = totalCost > t.limit * 0.8;
            if (isNearLimit && !t.isFrozen) {
                // In real app, we'd trigger a Push Notification here
                console.warn(`CRITICAL: ${serviceName} budget at 80% capacity!`);
            }
            return { ...t, current: totalCost };
        }
        return t;
    });

    saveThresholds(updatedThresholds);
};
