import { randomUUID } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';

const PORTAL_PROVIDER = 'nexus_chat';

type PortalConversationRow = {
  id: string;
  tenant_id: string;
  channel_account_id: string;
  contact_id: string | null;
  status?: string | null;
  priority?: number | null;
  thread_status?: string | null;
  workflow_thread_type?: string | null;
  owner_user_id?: string | null;
  ai_mode?: string | null;
  channel_type?: string | null;
};

type PortalMessageRow = {
  id: string;
  tenant_id: string;
  conversation_id: string;
  direction: 'in' | 'out';
  provider: string;
  provider_message_id: string;
  provider_message_id_real?: string | null;
  from_id?: string | null;
  to_id?: string | null;
  body?: string | null;
  content?: Record<string, unknown>;
  status?: string | null;
  received_at?: string | null;
  sent_at?: string | null;
  created_at?: string | null;
};

function cleanText(value: unknown): string {
  return String(value || '').trim();
}

function isMissingColumn(error: any, column: string): boolean {
  const message = String(error?.message || '').toLowerCase();
  return message.includes('column') && message.includes(column.toLowerCase()) && message.includes('does not exist');
}

function isDuplicate(error: any): boolean {
  const message = String(error?.message || '').toLowerCase();
  return message.includes('duplicate') || message.includes('unique');
}

async function selectPortalChannelAccount(admin: SupabaseClient, tenantId: string) {
  const externalAccountId = `portal:${tenantId}`;
  const baseSelect = 'id,tenant_id,provider,external_account_id,label,metadata,is_active,created_at,updated_at';
  const res = await admin
    .from('channel_accounts')
    .select(baseSelect)
    .eq('tenant_id', tenantId)
    .eq('provider', PORTAL_PROVIDER)
    .eq('external_account_id', externalAccountId)
    .maybeSingle();

  if (res.error) throw new Error(`channel_accounts lookup failed: ${res.error.message}`);
  if (res.data) return res.data as { id: string };

  const insertPayload: Record<string, unknown> = {
    tenant_id: tenantId,
    provider: PORTAL_PROVIDER,
    external_account_id: externalAccountId,
    label: 'Portal Chat',
    metadata: {
      source: 'portal_chat',
      channel_type: 'nexus_chat',
      tenant_id: tenantId,
    },
    is_active: true,
  };

  const insertRes = await admin
    .from('channel_accounts')
    .insert(insertPayload)
    .select('id')
    .single();

  if (insertRes.error) throw new Error(`channel_accounts insert failed: ${insertRes.error.message}`);
  return insertRes.data as { id: string };
}

export async function ensurePortalConversation(
  admin: SupabaseClient,
  input: {
    tenantId: string;
    contactId: string;
    channelAccountId?: string | null;
  }
): Promise<PortalConversationRow> {
  const tenantId = cleanText(input.tenantId);
  const contactId = cleanText(input.contactId);
  if (!tenantId || !contactId) {
    throw new Error('tenantId and contactId are required for portal conversations');
  }

  const channelAccount = input.channelAccountId
    ? { id: cleanText(input.channelAccountId) }
    : await selectPortalChannelAccount(admin, tenantId);

  const lookup = await admin
    .from('conversations')
    .select('id,tenant_id,channel_account_id,contact_id,status,priority,thread_status,workflow_thread_type,owner_user_id,ai_mode,channel_type')
    .eq('tenant_id', tenantId)
    .eq('channel_account_id', channelAccount.id)
    .eq('contact_id', contactId)
    .order('last_message_at', { ascending: false, nullsFirst: false })
    .limit(1)
    .maybeSingle();

  if (lookup.error) throw new Error(`portal conversation lookup failed: ${lookup.error.message}`);
  if (lookup.data) return lookup.data as PortalConversationRow;

  const baseRow: Record<string, unknown> = {
    tenant_id: tenantId,
    channel_account_id: channelAccount.id,
    contact_id: contactId,
    status: 'open',
    priority: 3,
    thread_status: 'new',
    workflow_thread_type: 'client',
    owner_user_id: null,
    ai_mode: 'off',
    channel_type: 'nexus_chat',
    subject: 'Portal Chat',
  };

  const create = async (payload: Record<string, unknown>) =>
    admin
      .from('conversations')
      .insert(payload)
      .select('id,tenant_id,channel_account_id,contact_id,status,priority,thread_status,workflow_thread_type,owner_user_id,ai_mode,channel_type')
      .single();

  let insertRes = await create(baseRow);

  const workflowColumns = ['thread_status', 'workflow_thread_type', 'owner_user_id', 'ai_mode', 'channel_type'];
  if (insertRes.error && workflowColumns.some((column) => isMissingColumn(insertRes.error, column))) {
    const fallback = { ...baseRow };
    for (const column of workflowColumns) delete fallback[column];
    insertRes = await create(fallback);
  }

  if (insertRes.error) throw new Error(`portal conversation insert failed: ${insertRes.error.message}`);
  return insertRes.data as PortalConversationRow;
}

export async function insertPortalMessage(
  admin: SupabaseClient,
  input: {
    tenantId: string;
    conversationId: string;
    direction: 'in' | 'out';
    bodyText: string;
    providerMessageId?: string | null;
    providerMessageIdReal?: string | null;
    fromId?: string | null;
    toId?: string | null;
    attachments?: unknown[];
    content?: Record<string, unknown>;
    status?: string | null;
  }
): Promise<PortalMessageRow> {
  const providerMessageId = cleanText(input.providerMessageId) || `portal:${randomUUID()}`;
  const now = new Date().toISOString();
  const content = {
    ...(input.content || {}),
    ...(Array.isArray(input.attachments) && input.attachments.length > 0 ? { attachments: input.attachments } : {}),
  };

  const payload: Record<string, unknown> = {
    tenant_id: cleanText(input.tenantId),
    conversation_id: cleanText(input.conversationId),
    direction: input.direction,
    provider: PORTAL_PROVIDER,
    provider_message_id: providerMessageId,
    provider_message_id_real: cleanText(input.providerMessageIdReal) || providerMessageId,
    from_id: cleanText(input.fromId) || null,
    to_id: cleanText(input.toId) || null,
    body: cleanText(input.bodyText) || null,
    content,
    status: input.status || (input.direction === 'out' ? 'sent' : 'received'),
    received_at: now,
    sent_at: input.direction === 'out' ? now : null,
  };

  const insert = async (row: Record<string, unknown>) =>
    admin
      .from('messages')
      .insert(row)
      .select('id,tenant_id,conversation_id,direction,provider,provider_message_id,provider_message_id_real,from_id,to_id,body,content,status,received_at,sent_at,created_at')
      .single();

  let res = await insert(payload);
  if (res.error && isMissingColumn(res.error, 'provider_message_id_real')) {
    const fallback = { ...payload };
    delete fallback.provider_message_id_real;
    res = await insert(fallback);
  }

  if (res.error && isDuplicate(res.error)) {
    const existing = await admin
      .from('messages')
      .select('id,tenant_id,conversation_id,direction,provider,provider_message_id,provider_message_id_real,from_id,to_id,body,content,status,received_at,sent_at,created_at')
      .eq('tenant_id', cleanText(input.tenantId))
      .eq('provider', PORTAL_PROVIDER)
      .eq('provider_message_id', providerMessageId)
      .maybeSingle();

    if (!existing.error && existing.data) {
      return existing.data as PortalMessageRow;
    }
  }

  if (res.error) throw new Error(`portal message insert failed: ${res.error.message}`);
  return res.data as PortalMessageRow;
}

export async function ensurePortalThreadAndInsertMessage(
  admin: SupabaseClient,
  input: {
    tenantId: string;
    contactId: string;
    direction: 'in' | 'out';
    bodyText: string;
    conversationId?: string | null;
    providerMessageId?: string | null;
    providerMessageIdReal?: string | null;
    fromId?: string | null;
    toId?: string | null;
    attachments?: unknown[];
    content?: Record<string, unknown>;
    status?: string | null;
  }
): Promise<{ conversation: PortalConversationRow; message: PortalMessageRow }> {
  const conversation = input.conversationId
    ? await (async () => {
        const modernSelect = 'id,tenant_id,channel_account_id,contact_id,status,priority,thread_status,workflow_thread_type,owner_user_id,ai_mode,channel_type';
        const legacySelect = 'id,tenant_id,channel_account_id,contact_id,status,priority';
        let res = await admin
          .from('conversations')
          .select(modernSelect)
          .eq('tenant_id', cleanText(input.tenantId))
          .eq('id', cleanText(input.conversationId))
          .maybeSingle();

        if (res.error && String(res.error.message || '').toLowerCase().includes('column')) {
          res = await admin
            .from('conversations')
            .select(legacySelect)
            .eq('tenant_id', cleanText(input.tenantId))
            .eq('id', cleanText(input.conversationId))
            .maybeSingle();
        }

        if (res.error) throw new Error(`portal conversation lookup failed: ${res.error.message}`);
        if (!res.data) throw new Error('Portal conversation not found');
        if (cleanText(res.data.contact_id) && cleanText(res.data.contact_id) !== cleanText(input.contactId)) {
          throw new Error('Portal conversation/contact mismatch');
        }
        if (!cleanText(res.data.contact_id)) {
          throw new Error('Portal conversation is missing contact linkage');
        }
        return res.data as PortalConversationRow;
      })()
    : await ensurePortalConversation(admin, { tenantId: input.tenantId, contactId: input.contactId });

  const message = await insertPortalMessage(admin, {
    tenantId: input.tenantId,
    conversationId: conversation.id,
    direction: input.direction,
    bodyText: input.bodyText,
    providerMessageId: input.providerMessageId,
    providerMessageIdReal: input.providerMessageIdReal,
    fromId: input.fromId,
    toId: input.toId,
    attachments: input.attachments,
    content: input.content,
    status: input.status,
  });

  return { conversation, message };
}
