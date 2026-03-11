
import { DataAdapter } from '../types';
import { Contact, AgencyBranding } from '../../types';

const CONTACTS_KEY = 'nexus_mvp_contacts';
const BRANDING_KEY = 'nexus_mvp_branding';

const defaultBranding: AgencyBranding = { 
  name: 'Nexus Funding', 
  primaryColor: '#059669',
  heroHeadline: "The Operating System for Business Funding.",
  heroSubheadline: "Consolidate your CRM, Dialer, and Underwriting into one AI platform.",
  tierPrices: {
    Bronze: 97,
    Silver: 197,
    Gold: 497
  }
};

export const mvpDataAdapter: DataAdapter = {
  getContacts: async () => {
    try {
      const stored = localStorage.getItem(CONTACTS_KEY);
      if (!stored) return [];
      const parsed = JSON.parse(stored);
      return Array.isArray(parsed) ? parsed : [];
    } catch (e) {
      console.error("Critical: Failed to parse contacts from storage", e);
      return [];
    }
  },

  updateContact: async (contact) => {
    try {
      const contacts = await mvpDataAdapter.getContacts();
      const index = contacts.findIndex((c: Contact) => c.id === contact.id);
      if (index > -1) {
        contacts[index] = contact;
      } else {
        contacts.push(contact);
      }
      localStorage.setItem(CONTACTS_KEY, JSON.stringify(contacts));
      return contact;
    } catch (e) {
      console.error("Failed to update contact", e);
      return contact;
    }
  },

  addContact: async (contactData) => {
    try {
      const contacts = await mvpDataAdapter.getContacts();
      const newContact = {
        checklist: {},
        clientTasks: [],
        documents: [],
        activities: [],
        messageHistory: [],
        ...contactData,
        id: `c_${Date.now()}`,
        created_at: new Date().toISOString(),
        lastContact: 'Just now'
      } as Contact;
      contacts.push(newContact);
      localStorage.setItem(CONTACTS_KEY, JSON.stringify(contacts));
      return newContact;
    } catch (e) {
      throw new Error("Failed to add contact to database.");
    }
  },

  getBranding: async () => {
    try {
      const stored = localStorage.getItem(BRANDING_KEY);
      if (!stored) return defaultBranding;
      const parsed = JSON.parse(stored);
      return { ...defaultBranding, ...parsed };
    } catch (e) {
      return defaultBranding;
    }
  },

  updateBranding: async (branding) => {
    try {
      localStorage.setItem(BRANDING_KEY, JSON.stringify(branding));
      return branding;
    } catch (e) {
      return branding;
    }
  }
};
