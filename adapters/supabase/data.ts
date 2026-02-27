
import { fetchTasksForTenants, rowToClientTask, upsertTasksForTenant } from "./tasks";
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
      console.error('Supabase error fetching tenants:', error);
      return [];
    }

    const tenants = (data || []) as Tenant[];
    const tenantIds = tenants.map((t) => t.id);

    const taskRows = await fetchTasksForTenants(tenantIds);
    const tasksByTenant = new Map<string, any[]>();
    for (const r of taskRows) {
      const tid = String((r as any).tenant_id);
      if (!tasksByTenant.has(tid)) tasksByTenant.set(tid, []);
      tasksByTenant.get(tid)!.push(r);
    }

    // Map tenants to the Contact interface used by the CRM views
    return tenants.map((t: Tenant) => ({
      id: t.id,
      company: t.name,
      name: 'Principal Node',
      email: 'node@nexus.os',
      phone: '',
      status: t.status === 'active' ? 'Active' : 'Lead',
      lastContact: new Date((t as any).created_at || Date.now()).toISOString(),
      value: 0,
      source: 'Tenant Registry',
      notes: `Tenant ID: ${t.id}` as any,
      checklist: {},
      clientTasks: (tasksByTenant.get(t.id) || []).map((r: any) => rowToClientTask(r)),
    })) as Contact[];
  },

  updateContact: async (contact) => {
    const { error } = await supabase
      .from('tenants')
      .update({ name: contact.company, status: contact.status.toLowerCase() })
      .eq('id', contact.id);

    if (error) console.error('Supabase error updating tenant:', error);

    // Persist tasks (no deletes; just upsert current set).
    try {
      await upsertTasksForTenant(contact.id, contact.clientTasks || []);
    } catch (e) {
      console.error('Supabase error persisting clientTasks:', e);
    }

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
        lastContact: new Date().toISOString(),
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
