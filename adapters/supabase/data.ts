import { fetchTasksForTenants, rowToClientTask, upsertTasksForTenant } from './tasks';
import { supabase } from '../../lib/supabaseClient';
import { DataAdapter } from '../types';
import { AgencyBranding, Contact, InboxRouting, Message, Tenant } from '../../types';

type TenantMembershipRow = {
  tenant_id: string;
  role?: string | null;
  created_at?: string | null;
};

type ContactRow = {
  id: string;
  tenant_id: string;
  display_name: string | null;
  name: string | null;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  phone: string | null;
  phone_e164: string | null;
  phone_raw: string | null;
  status: string | null;
  notes: string | null;
  ig_handle: string | null;
  fb_psid: string | null;
  wa_number: string | null;
  metadata: Record<string, unknown> | null;
  created_at?: string | null;
  updated_at?: string | null;
  primary_email?: string | null;
  primary_phone?: string | null;
};

type ConversationRow = {
  id: string;
  tenant_id: string;
  contact_id: string | null;
  channel_account_id: string | null;
  status: string | null;
  priority: number | null;
  last_message_at: string | null;
  created_at?: string | null;
  updated_at?: string | null;
};

type MessageRow = {
  id: string;
  tenant_id: string;
  conversation_id: string;
  direction: 'in' | 'out' | string;
  provider: string | null;
  provider_message_id_real: string | null;
  body: string | null;
  content: Record<string, unknown> | null;
  status: string | null;
  received_at: string | null;
  sent_at: string | null;
  created_at: string | null;
  from_id: string | null;
  to_id: string | null;
};

type ChannelAccountRow = {
  id: string;
  tenant_id: string;
  provider: string;
  external_account_id: string;
  label: string | null;
  display_name: string | null;
};

const BRANDING_CACHE_KEY = 'nexus_branding_cache';

function readCachedBranding(): AgencyBranding | null {
  try {
    const stored = window.localStorage.getItem(BRANDING_CACHE_KEY);
    if (!stored) return null;
    const parsed = JSON.parse(stored);
    if (!parsed || typeof parsed !== 'object') return null;
    return parsed as AgencyBranding;
  } catch {
    return null;
  }
}

function writeCachedBranding(branding: AgencyBranding) {
  try {
    window.localStorage.setItem(BRANDING_CACHE_KEY, JSON.stringify(branding));
  } catch {
    // Best effort only.
  }
}

function isMissingSchema(error: any): boolean {
  const message = String(error?.message || '').toLowerCase();
  return (
    (message.includes('relation') && message.includes('does not exist'))
    || (message.includes('column') && message.includes('does not exist'))
    || (message.includes('could not find the table') && message.includes('schema cache'))
  );
}

function cleanText(value: unknown): string {
  return String(value || '').trim();
}

function unique(values: string[]): string[] {
  return Array.from(new Set(values.map((value) => cleanText(value)).filter(Boolean)));
}

function toIso(value?: string | null): string {
  if (!value) return new Date().toISOString();
  const ts = new Date(value).getTime();
  return Number.isFinite(ts) ? new Date(ts).toISOString() : new Date().toISOString();
}

function formatTime(value?: string | null): string {
  if (!value) return new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function normalizeMessageAttachments(content: unknown): Message['attachments'] {
  if (!content || typeof content !== 'object' || Array.isArray(content)) return [];
  const raw = (content as any).attachments;
  if (!Array.isArray(raw)) return [];

  const attachments = [] as NonNullable<Message['attachments']>;
  for (const item of raw) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) continue;
    const attachmentId = cleanText((item as any).attachment_id || (item as any).id);
    const storagePath = cleanText((item as any).storage_path);
    const storageBucket = cleanText((item as any).storage_bucket);
    const contentType = cleanText((item as any).content_type || (item as any).mime_type);
    const sizeValue = Number((item as any).size_bytes || (item as any).file_size || 0);

    if (!attachmentId && !storagePath) continue;
    attachments.push({
      attachmentId: attachmentId || undefined,
      storagePath: storagePath || undefined,
      storageBucket: storageBucket || undefined,
      contentType: contentType || undefined,
      sizeBytes: Number.isFinite(sizeValue) && sizeValue > 0 ? sizeValue : undefined,
    });
  }

  return attachments;
}

function mapMessageRow(row: MessageRow, contactName: string): Message {
  const isInbound = row.direction === 'in';
  const attachments = normalizeMessageAttachments(row.content);
  const body = cleanText(row.body);

  return {
    id: `db:${row.id}`,
    sender: isInbound ? 'client' : 'admin',
    senderName: isInbound ? contactName : 'Advisor',
    content: body || (attachments.length > 0 ? '[Attachment]' : '[No text body]'),
    timestamp: formatTime(row.received_at || row.sent_at || row.created_at),
    read: !isInbound,
    deliveryStatus: row.status || undefined,
    provider: row.provider || undefined,
    conversationId: row.conversation_id || undefined,
    providerMessageIdReal: row.provider_message_id_real || undefined,
    attachments,
  };
}

async function loadAccessibleTenantIds(): Promise<string[]> {
  const { data: authData, error: authErr } = await supabase.auth.getUser();
  if (authErr || !authData?.user?.id) return [];

  const userId = authData.user.id;

  const preferred = await supabase
    .from('tenant_memberships')
    .select('tenant_id, role, created_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: true });

  if (!preferred.error) {
    return unique((preferred.data || []).map((row: TenantMembershipRow) => String(row.tenant_id || '')));
  }

  if (!isMissingSchema(preferred.error)) {
    console.warn('Supabase error fetching tenant memberships:', preferred.error);
    return [];
  }

  const fallback = await supabase
    .from('tenant_members')
    .select('tenant_id, role, created_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: true });

  if (fallback.error) {
    console.warn('Supabase error fetching tenant members:', fallback.error);
    return [];
  }

  return unique((fallback.data || []).map((row: TenantMembershipRow) => String(row.tenant_id || '')));
}

async function loadInboxContactsForTenants(tenantIds: string[]): Promise<Contact[]> {
  const uniqueTenantIds = unique(tenantIds);
  if (!uniqueTenantIds.length) return [];

  const [taskRows, contactsRes, conversationsRes, messagesRes, channelRes] = await Promise.all([
    fetchTasksForTenants(uniqueTenantIds),
    supabase
      .from('contacts')
      .select('id,tenant_id,display_name,name,first_name,last_name,email,phone,phone_e164,phone_raw,status,notes,ig_handle,fb_psid,wa_number,metadata,created_at,updated_at,primary_email,primary_phone')
      .in('tenant_id', uniqueTenantIds)
      .order('updated_at', { ascending: false }),
    supabase
      .from('conversations')
      .select('id,tenant_id,contact_id,channel_account_id,status,priority,last_message_at,created_at,updated_at')
      .in('tenant_id', uniqueTenantIds)
      .order('last_message_at', { ascending: false, nullsFirst: false })
      .limit(500),
    supabase
      .from('messages')
      .select('id,tenant_id,conversation_id,direction,provider,provider_message_id_real,body,content,status,received_at,sent_at,created_at,from_id,to_id')
      .in('tenant_id', uniqueTenantIds)
      .order('received_at', { ascending: true })
      .limit(1500),
    supabase
      .from('channel_accounts')
      .select('id,tenant_id,provider,external_account_id,label,display_name')
      .in('tenant_id', uniqueTenantIds)
      .order('created_at', { ascending: true }),
  ]);

  if (contactsRes.error) {
    console.error('Supabase error fetching contacts:', contactsRes.error);
    return [];
  }

  if (conversationsRes.error) {
    console.error('Supabase error fetching conversations:', conversationsRes.error);
    return [];
  }

  if (messagesRes.error) {
    console.error('Supabase error fetching messages:', messagesRes.error);
    return [];
  }

  if (channelRes.error) {
    console.error('Supabase error fetching channel accounts:', channelRes.error);
    return [];
  }

  const contacts = (contactsRes.data || []) as ContactRow[];
  const conversations = (conversationsRes.data || []) as ConversationRow[];
  const messages = (messagesRes.data || []) as MessageRow[];
  const channels = (channelRes.data || []) as ChannelAccountRow[];

  const tasksByTenant = new Map<string, any[]>();
  for (const taskRow of taskRows) {
    const tenantId = cleanText((taskRow as any).tenant_id);
    if (!tenantId) continue;
    const list = tasksByTenant.get(tenantId) || [];
    list.push(taskRow);
    tasksByTenant.set(tenantId, list);
  }

  const conversationsByContact = new Map<string, ConversationRow[]>();
  const messagesByConversation = new Map<string, MessageRow[]>();
  const channelById = new Map<string, ChannelAccountRow>();

  for (const channel of channels) {
    channelById.set(channel.id, channel);
  }

  for (const conversation of conversations) {
    const contactId = cleanText(conversation.contact_id);
    if (!contactId) continue;
    const list = conversationsByContact.get(contactId) || [];
    list.push(conversation);
    conversationsByContact.set(contactId, list);
  }

  for (const message of messages) {
    const list = messagesByConversation.get(message.conversation_id) || [];
    list.push(message);
    messagesByConversation.set(message.conversation_id, list);
  }

  const contactCards = contacts.map((contact) => {
    const contactConversations = [...(conversationsByContact.get(contact.id) || [])].sort((left, right) => {
      const leftTime = new Date(left.last_message_at || left.updated_at || left.created_at || 0).getTime();
      const rightTime = new Date(right.last_message_at || right.updated_at || right.created_at || 0).getTime();
      return rightTime - leftTime;
    });

    const primaryConversation = contactConversations[0] || null;
    const primaryChannel = primaryConversation ? channelById.get(primaryConversation.channel_account_id || '') || null : null;
    const threadMessages = primaryConversation ? [...(messagesByConversation.get(primaryConversation.id) || [])] : [];
    const orderedMessages = threadMessages.sort((left, right) => {
      const leftTime = new Date(left.received_at || left.sent_at || left.created_at || 0).getTime();
      const rightTime = new Date(right.received_at || right.sent_at || right.created_at || 0).getTime();
      return leftTime - rightTime;
    });

    const displayName = cleanText(contact.display_name || contact.name || contact.email || 'Contact');
    const latestInbound = [...orderedMessages].reverse().find((row) => row.direction === 'in');
    const recipientId = cleanText(
      contact.fb_psid
      || contact.ig_handle
      || contact.wa_number
      || latestInbound?.from_id
      || latestInbound?.to_id
      || ''
    );
    const provider = cleanText(primaryChannel?.provider) || 'meta';

    const history = orderedMessages.map((row) => mapMessageRow(row, displayName));
    const lastActivity = primaryConversation?.last_message_at || contact.updated_at || contact.created_at || history[history.length - 1]?.createdAt;

    const inboxRouting: InboxRouting | undefined = primaryConversation
      ? {
          tenant_id: contact.tenant_id,
          conversation_id: primaryConversation.id,
          provider: provider as InboxRouting['provider'],
          to: recipientId || undefined,
          recipient_id: recipientId || undefined,
        }
      : undefined;

    return {
      id: contact.id,
      tenantId: contact.tenant_id,
      company: displayName,
      name: displayName,
      email: cleanText(contact.primary_email || contact.email),
      phone: cleanText(contact.primary_phone || contact.phone_e164 || contact.phone || contact.phone_raw),
      status: cleanText(contact.status) ? (String(contact.status).charAt(0).toUpperCase() + String(contact.status).slice(1)) as Contact['status'] : 'Lead',
      lastContact: toIso(lastActivity),
      value: 0,
      source: 'Contact Registry',
      metadata: contact.metadata || null,
      notes: cleanText(contact.notes),
      checklist: {},
      clientTasks: (tasksByTenant.get(contact.tenant_id) || []).map((row: any) => rowToClientTask(row)),
      messageHistory: history,
      inboxRouting,
    } as Contact;
  });

  contactCards.sort((left, right) => {
    const leftTime = new Date(left.lastContact || 0).getTime();
    const rightTime = new Date(right.lastContact || 0).getTime();
    return rightTime - leftTime;
  });

  return contactCards;
}

export const supabaseDataAdapter: DataAdapter = {
  getContacts: async () => {
    try {
      const tenantIds = await loadAccessibleTenantIds();
      if (!tenantIds.length) return [];

      const contacts = await loadInboxContactsForTenants(tenantIds);
      if (contacts.length > 0) return contacts;

      const { data, error } = await supabase
        .from('tenants')
        .select('id,name,created_at,status')
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Supabase fallback error fetching tenants:', error);
        return [];
      }

      const tenants = (data || []) as Tenant[];
      const tasksByTenant = new Map<string, any[]>();
      const taskRows = await fetchTasksForTenants(tenants.map((tenant) => tenant.id));
      for (const row of taskRows) {
        const tid = String((row as any).tenant_id);
        if (!tasksByTenant.has(tid)) tasksByTenant.set(tid, []);
        tasksByTenant.get(tid)!.push(row);
      }

      return tenants.map((t: Tenant) => ({
        id: t.id,
        tenantId: t.id,
        company: t.name,
        name: t.name,
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
    } catch (error) {
      console.error('Supabase contacts bootstrap failed:', error);
      return [];
    }
  },

  updateContact: async (contact) => {
    const tenantId = contact.tenantId || null;
    const patch: Record<string, unknown> = {
      display_name: contact.company || contact.name || null,
      name: contact.company || contact.name || null,
      email: contact.email || null,
      phone: contact.phone || null,
      status: String(contact.status || 'lead').toLowerCase(),
      notes: contact.notes || null,
      updated_at: new Date().toISOString(),
    };

    if (contact.email) {
      patch.primary_email = String(contact.email).toLowerCase();
    }

    if (contact.phone) {
      patch.primary_phone = contact.phone;
    }

    let query = supabase
      .from('contacts')
      .update(patch)
      .eq('id', contact.id);

    if (tenantId) {
      query = query.eq('tenant_id', tenantId);
    }

    const { error } = await query;

    if (error) console.error('Supabase error updating contact:', error);

    try {
      if (tenantId) {
        await upsertTasksForTenant(tenantId, contact.clientTasks || []);
      }
    } catch (e) {
      console.error('Supabase error persisting clientTasks:', e);
    }

    return contact;
  },

  addContact: async (contact) => {
    const tenantIds = await loadAccessibleTenantIds();
    const tenantId = contact.tenantId || tenantIds[0];

    if (!tenantId) {
      throw new Error('Unable to resolve tenant_id for contact creation.');
    }

    const displayName = contact.company || contact.name || contact.email || 'New Contact';

    const { data, error } = await supabase
      .from('contacts')
      .insert({
        tenant_id: tenantId,
        display_name: displayName,
        name: displayName,
        email: contact.email || null,
        phone: contact.phone || null,
        status: 'active',
        notes: contact.notes || null,
      })
      .select('id, tenant_id, display_name, name, email, phone, status, notes')
      .single();

    if (error) throw error;

    return {
      id: data.id,
      tenantId: data.tenant_id,
      company: data.display_name || data.name,
      name: data.display_name || data.name,
      email: data.email || '',
      phone: data.phone || '',
      status: 'Lead',
      lastContact: new Date().toISOString(),
      value: 0,
      source: 'Manual Entry',
      notes: data.notes || '',
      checklist: {},
      clientTasks: [],
      messageHistory: [],
    } as Contact;
  },

  getBranding: async () => {
    const cached = typeof window !== 'undefined' ? readCachedBranding() : null;
    if (cached) return cached;

    // Browser-side branding should never depend on audit_logs because that
    // table is intentionally restricted in production. Fall back to a safe
    // default and let admin screens persist branding through their own flow.
    return { name: 'Nexus OS', primaryColor: '#66FCF1' };
  },

  updateBranding: async (branding) => {
    if (typeof window !== 'undefined') {
      writeCachedBranding(branding);
    }

    return branding;
  }
};
