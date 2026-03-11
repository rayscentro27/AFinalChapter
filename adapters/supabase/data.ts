
import { supabase } from '../../lib/supabaseClient';
import { DataAdapter } from '../types';
import { Contact, AgencyBranding, Tenant } from '../../types';

export const supabaseDataAdapter: DataAdapter = {
  getContacts: async () => {
    const { data, error } = await supabase
      .from('tenants')
      .select('*')
      .order('created_at', { ascending: false });
      
    if (error) {
        console.error("Supabase error fetching tenants:", error);
        return [];
    }

    // Map tenants to the Contact interface used by the CRM views
    return (data || []).map((t: Tenant) => ({
        id: t.id,
        company: t.name,
        name: 'Principal Node',
        email: 'node@nexus.os',
        phone: '',
        status: t.status === 'active' ? 'Active' : 'Lead',
        value: 0, // Magnitude is stored in audit logs
        source: 'Tenant Registry',
        notes: `Tenant ID: ${t.id}`,
        checklist: {},
        clientTasks: []
    })) as Contact[];
  },

  updateContact: async (contact) => {
    const { error } = await supabase
      .from('tenants')
      .update({ name: contact.company, status: contact.status.toLowerCase() })
      .eq('id', contact.id);
      
    if (error) console.error("Supabase error updating tenant:", error);
    return contact;
  },

  addContact: async (contact) => {
    const { data, error } = await supabase.from('tenants').insert({
        name: contact.company || contact.name,
        slug: (contact.company || contact.name || 'new-entity').toLowerCase().replace(/\s+/g, '-'),
        status: 'active'
    }).select().single();
    
    if (error) throw error;
    
    return {
        id: data.id,
        company: data.name,
        name: 'New Principal',
        email: contact.email || '',
        phone: '',
        status: 'Lead',
        value: 0,
        source: 'Manual Entry',
        notes: '',
        checklist: {},
        clientTasks: []
    } as Contact;
  },

  getBranding: async () => {
    const { data, error } = await supabase
      .from('audit_logs')
      .select('meta')
      .eq('action', 'initialize_portal')
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (error || !data || !data.meta?.branding) {
        return { name: 'Nexus OS', primaryColor: '#66FCF1' };
    }
    
    return data.meta.branding as AgencyBranding;
  },

  updateBranding: async (branding) => {
    // Branding persists in the most recent initialization log
    const { data: log } = await supabase
        .from('audit_logs')
        .select('id, meta')
        .eq('action', 'initialize_portal')
        .order('created_at', { ascending: false })
        .limit(1)
        .single();
    
    if (log) {
        const updatedMeta = { ...log.meta, branding };
        await supabase
            .from('audit_logs')
            .update({ meta: updatedMeta })
            .eq('id', log.id);
    }
    
    return branding;
  }
};
