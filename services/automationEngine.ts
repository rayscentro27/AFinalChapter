
import { Contact, Activity, Notification, FundingOffer, Invoice, ClientTask, SentimentLevel } from '../types';

export interface AutomationResult {
  updatedContact: Contact;
  triggeredActions: string[];
  alertType?: 'high_ticket' | 'risk_stack' | 'sentiment_triage' | 'reserve_warning' | 'none';
}

const CRITICAL_KEYWORDS = ['scam', 'fraud', 'angry', 'sue', 'lawyer', 'terrible', 'cancel', 'stop', 'quit', 'liar'];
const AGITATED_KEYWORDS = ['slow', 'waiting', 'how long', 'confused', 'difficult', 'boring', 'expensive'];

export const processAutomations = async (contact: Contact, allContacts: Contact[] = []): Promise<AutomationResult> => {
  const actions: string[] = [];
  let alertType: 'high_ticket' | 'risk_stack' | 'sentiment_triage' | 'reserve_warning' | 'none' = 'none';
  let updated = JSON.parse(JSON.stringify(contact)) as Contact; 
  const now = new Date();
  
  // 1. SUCCESS FEE INVOICING (10% Rule)
  const acceptedOffers = updated.offers?.filter(o => o.status === 'Accepted' && !o.signedDate);
  if (acceptedOffers && acceptedOffers.length > 0) {
      for (const off of acceptedOffers) {
          const fee = off.amount * 0.10;
          const invoiceExists = updated.invoices?.some(i => i.description.includes(off.lenderName));
          
          if (!invoiceExists) {
              const newInvoice: Invoice = {
                  id: `INV-${Date.now()}`,
                  contactId: updated.id,
                  contactName: updated.company,
                  amount: fee,
                  date: now.toISOString().split('T')[0],
                  dueDate: new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
                  status: 'Pending',
                  description: `10% Success Fee - ${off.lenderName} Approval`
              };
              updated.invoices = [newInvoice, ...(updated.invoices || [])];
              actions.push(`Auto-Invoicer: Generated 10% fee for ${off.lenderName}`);
          }
      }
  }

  // 2. SENTIMENT TRIAGE PROTOCOL
  if (updated.messageHistory?.length) {
      const lastClientMsg = [...updated.messageHistory].reverse().find(m => m.sender === 'client');
      if (lastClientMsg) {
          const content = lastClientMsg.content.toLowerCase();
          const hasCritical = CRITICAL_KEYWORDS.some(k => content.includes(k));
          const hasAgitated = AGITATED_KEYWORDS.some(k => content.includes(k));

          if (hasCritical) {
              updated.automationMetadata = { ...updated.automationMetadata, sentiment: 'Critical', triageReason: 'Aggressive or legal keywords detected.' };
              updated.status = 'Triage';
              alertType = 'sentiment_triage';
              actions.push(`Sentiment Guard: Flagged critical friction in ${updated.company}`);
          } else if (hasAgitated) {
              updated.automationMetadata = { ...updated.automationMetadata, sentiment: 'Agitated', triageReason: 'Expressions of frustration or delay detected.' };
              alertType = 'sentiment_triage';
          }
      }
  }

  // 3. HIGH TICKET ALERT
  if (updated.value >= 100000 && updated.status === 'Negotiation') {
      alertType = 'high_ticket';
  }

  // 4. SEASONING MONITOR
  if (updated.tier2Data && updated.connectedBanks?.length) {
      const currentBalance = updated.connectedBanks[0].balance;
      const minReserve = updated.tier2Data.reserveBalance;
      if (currentBalance < minReserve) {
          alertType = 'reserve_warning';
          updated.notifications = [
              ...(updated.notifications || []),
              { id: `res_${Date.now()}`, title: 'Seasoning Warning', message: 'Balance dropped below 6-month reserve.', date: 'Just now', read: false, type: 'alert' }
          ];
      }
  }

  return { updatedContact: updated, triggeredActions: actions, alertType };
};
