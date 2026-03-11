
import { Contact, Activity, Notification } from '../types';

export interface EscalationResult {
  updatedContact: Contact;
  actionTaken: string;
  severity: 'info' | 'alert' | 'critical';
}

/**
 * Periodically checks for deals that have stalled or changed risk profiles.
 */
export const runBackgroundProtocols = async (contacts: Contact[]): Promise<EscalationResult[]> => {
  const results: EscalationResult[] = [];
  const now = new Date();

  contacts.forEach(contact => {
    let updated = { ...contact };
    let action = '';
    let severity: 'info' | 'alert' | 'critical' = 'info';

    // 1. Deal Aging Protocol
    const createdDate = new Date(contact.id.startsWith('c_') ? parseInt(contact.id.split('_')[1]) : Date.now());
    const hoursOld = (now.getTime() - createdDate.getTime()) / (1000 * 3600);

    if (contact.status === 'Lead' && hoursOld > 48 && contact.aiPriority !== 'Hot') {
      updated.aiPriority = 'Hot';
      updated.aiReason = "STALE LEAD: No activity for >48 hours. Priority escalated.";
      action = `Escalated ${contact.company} due to inactivity.`;
      severity = 'alert';
    }

    // 2. Retention/Renewal Hook
    const deals = contact.fundedDeals || [];
    deals.forEach(deal => {
        const paidDown = ((deal.totalPayback - deal.currentBalance) / deal.totalPayback) * 100;
        if (paidDown >= 50 && !contact.checklist[`renewal_ready_${deal.id}`]) {
            updated.checklist[`renewal_ready_${deal.id}`] = true;
            action = `Renewal Hook: ${contact.company} paid down 50%. Auto-offer prepared.`;
            severity = 'info';
        }
    });

    if (action) {
      results.push({ updatedContact: updated, actionTaken: action, severity });
    }
  });

  return results;
};
