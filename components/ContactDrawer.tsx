import React, { useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabaseClient';

type ContactRow = {
  id: string;
  display_name?: string | null;
  primary_email?: string | null;
  primary_phone?: string | null;
  notes?: string | null;
  merged_into_contact_id?: string | null;
};

type IdentityRow = {
  id: number;
  provider: string;
  identity_type: string;
  identity_value: string;
  verified: boolean;
  confidence: number;
  is_primary: boolean;
  created_at?: string;
};

type ConversationRow = {
  id: string;
  status?: string | null;
  last_message_at?: string | null;
  updated_at?: string | null;
};

type TimelineItem = {
  id: string;
  conversation_id: string;
  provider: string;
  direction: string;
  received_at: string | null;
  body_text: string;
  status?: string | null;
};

type Props = {
  tenantId?: string | null;
  conversationId?: string | null;
  open: boolean;
  onClose: () => void;
};

const emptyForm = {
  provider: 'custom',
  identity_type: 'phone',
  identity_value: '',
  channel_account_id: '',
  verified: false,
  confidence: 60,
  is_primary: false,
};

function fmtDate(value?: string | null): string {
  if (!value) return 'n/a';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  return d.toLocaleString();
}

export default function ContactDrawer({ tenantId, conversationId, open, onClose }: Props) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const [contactId, setContactId] = useState('');
  const [contact, setContact] = useState<ContactRow | null>(null);
  const [identities, setIdentities] = useState<IdentityRow[]>([]);
  const [conversations, setConversations] = useState<ConversationRow[]>([]);

  const [form, setForm] = useState(emptyForm);
  const [linkBusy, setLinkBusy] = useState(false);

  const [timelineOpen, setTimelineOpen] = useState(false);
  const [timelineBusy, setTimelineBusy] = useState(false);
  const [timelineError, setTimelineError] = useState('');
  const [timelineItems, setTimelineItems] = useState<TimelineItem[]>([]);

  const canLoad = Boolean(open && tenantId && conversationId);

  const activeConversationCount = useMemo(
    () => conversations.filter((row) => String(row.status || '').toLowerCase() !== 'closed').length,
    [conversations]
  );

  useEffect(() => {
    if (!canLoad) return;
    void loadDrawerData();
  }, [canLoad, tenantId, conversationId]);

  useEffect(() => {
    if (!open || !timelineOpen || !tenantId || !contactId) return;
    void loadTimeline();
  }, [open, timelineOpen, tenantId, contactId]);

  async function loadDrawerData() {
    if (!tenantId || !conversationId) return;

    setLoading(true);
    setError('');
    setSuccess('');
    setTimelineError('');

    try {
      const convoRes = await supabase
        .from('conversations')
        .select('id,contact_id')
        .eq('tenant_id', tenantId)
        .eq('id', conversationId)
        .maybeSingle();

      if (convoRes.error) throw convoRes.error;

      const resolvedContactId = String(convoRes.data?.contact_id || '').trim();
      setContactId(resolvedContactId);

      if (!resolvedContactId) {
        setContact(null);
        setIdentities([]);
        setConversations([]);
        setTimelineItems([]);
        return;
      }

      await Promise.all([
        loadContact(resolvedContactId),
        loadIdentities(resolvedContactId),
        loadConversations(resolvedContactId),
      ]);
    } catch (e: any) {
      setError(String(e?.message || e));
    } finally {
      setLoading(false);
    }
  }

  async function loadContact(currentContactId: string) {
    if (!tenantId || !currentContactId) return;

    const contactRes = await supabase
      .from('contacts')
      .select('id,display_name,primary_email,primary_phone,notes,merged_into_contact_id')
      .eq('tenant_id', tenantId)
      .eq('id', currentContactId)
      .maybeSingle();

    if (contactRes.error) throw contactRes.error;
    setContact((contactRes.data || null) as ContactRow | null);
  }

  async function loadIdentities(currentContactId: string) {
    if (!tenantId || !currentContactId) return;

    const idRes = await supabase
      .from('contact_identities')
      .select('id,provider,identity_type,identity_value,verified,confidence,is_primary,created_at')
      .eq('tenant_id', tenantId)
      .eq('contact_id', currentContactId)
      .order('is_primary', { ascending: false })
      .order('verified', { ascending: false })
      .order('created_at', { ascending: false });

    if (idRes.error) throw idRes.error;
    setIdentities((idRes.data || []) as IdentityRow[]);
  }

  async function loadConversations(currentContactId: string) {
    if (!tenantId || !currentContactId) return;

    const convRes = await supabase
      .from('conversations')
      .select('id,status,last_message_at,updated_at')
      .eq('tenant_id', tenantId)
      .eq('contact_id', currentContactId)
      .order('last_message_at', { ascending: false, nullsFirst: false })
      .limit(200);

    if (convRes.error) throw convRes.error;
    setConversations((convRes.data || []) as ConversationRow[]);
  }

  async function linkIdentity() {
    if (!tenantId || !contactId) return;

    setLinkBusy(true);
    setError('');
    setSuccess('');

    try {
      const value = String(form.identity_value || '').trim();
      if (!value) throw new Error('Identity value is required.');

      const { data: sessionData, error: sessionErr } = await supabase.auth.getSession();
      if (sessionErr) throw sessionErr;

      const token = sessionData?.session?.access_token;
      if (!token) throw new Error('Missing auth session token');

      const res = await fetch('/.netlify/functions/admin-link-identity', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          tenant_id: tenantId,
          contact_id: contactId,
          provider: form.provider,
          identity_type: form.identity_type,
          identity_value: value,
          channel_account_id: String(form.channel_account_id || '').trim() || null,
          verified: Boolean(form.verified),
          confidence: Number(form.confidence || 60),
          is_primary: Boolean(form.is_primary),
          metadata: null,
        }),
      });

      const json = await res.json().catch(() => ({}));
      if (!res.ok || json?.ok === false) {
        throw new Error(String(json?.error || `Link identity failed (${res.status})`));
      }

      setSuccess('Identity linked successfully.');
      setForm(emptyForm);

      const nextContactId = String(json?.contact_id || contactId);
      setContactId(nextContactId);
      await Promise.all([
        loadContact(nextContactId),
        loadIdentities(nextContactId),
        loadConversations(nextContactId),
      ]);
    } catch (e: any) {
      setError(String(e?.message || e));
    } finally {
      setLinkBusy(false);
    }
  }

  async function loadTimeline() {
    if (!tenantId || !contactId) return;

    setTimelineBusy(true);
    setTimelineError('');

    try {
      const { data: sessionData, error: sessionErr } = await supabase.auth.getSession();
      if (sessionErr) throw sessionErr;

      const token = sessionData?.session?.access_token;
      if (!token) throw new Error('Missing auth session token');

      const params = new URLSearchParams({
        tenant_id: tenantId,
        contact_id: contactId,
        limit: '200',
      });

      const res = await fetch(`/.netlify/functions/contact-timeline?${params.toString()}`, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      const json = await res.json().catch(() => ({}));
      if (!res.ok || json?.ok === false) {
        throw new Error(String(json?.error || `Timeline failed (${res.status})`));
      }

      setTimelineItems((json?.items || []) as TimelineItem[]);
    } catch (e: any) {
      setTimelineError(String(e?.message || e));
    } finally {
      setTimelineBusy(false);
    }
  }

  return (
    <>
      {open ? <div className="fixed inset-0 z-40 bg-black/50" onClick={onClose} /> : null}
      <aside
        className={`fixed top-0 right-0 z-50 h-full w-full max-w-xl bg-slate-950 border-l border-white/10 shadow-2xl transform transition-transform duration-300 ${open ? 'translate-x-0' : 'translate-x-full'}`}
      >
        <div className="h-full flex flex-col">
          <div className="px-6 py-4 border-b border-white/10 flex items-center justify-between">
            <div>
              <h2 className="text-lg font-black uppercase tracking-widest text-slate-100">Contact</h2>
              <div className="text-xs text-slate-400 mt-1">Conversation-linked identity and timeline</div>
            </div>
            <button
              onClick={onClose}
              className="px-3 py-2 rounded-lg bg-white/10 hover:bg-white/20 text-xs font-black uppercase tracking-widest text-slate-200"
            >
              Close
            </button>
          </div>

          <div className="flex-1 overflow-auto p-6 space-y-5">
            {loading ? <div className="text-sm text-slate-400">Loading contact data...</div> : null}
            {error ? <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-200">{error}</div> : null}
            {success ? <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-emerald-200">{success}</div> : null}

            {!loading && !contactId ? (
              <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-200">
                This conversation has no linked contact yet.
              </div>
            ) : null}

            <section className="rounded-2xl border border-white/10 bg-black/20 p-4">
              <div className="text-xs font-black uppercase tracking-widest text-slate-400">Contact Profile</div>
              {contact ? (
                <div className="mt-3 space-y-2 text-sm text-slate-200">
                  <div><span className="text-slate-400">Name:</span> {contact.display_name || 'n/a'}</div>
                  <div><span className="text-slate-400">Email:</span> {contact.primary_email || 'n/a'}</div>
                  <div><span className="text-slate-400">Phone:</span> {contact.primary_phone || 'n/a'}</div>
                  <div className="font-mono text-xs text-slate-400 break-all">{contact.id}</div>
                  {contact.notes ? <div className="text-xs text-slate-400">{contact.notes}</div> : null}
                </div>
              ) : (
                <div className="mt-2 text-sm text-slate-500">No contact row loaded.</div>
              )}
            </section>

            <section className="rounded-2xl border border-white/10 bg-black/20 p-4">
              <div className="flex items-center justify-between gap-2">
                <div className="text-xs font-black uppercase tracking-widest text-slate-400">Conversations</div>
                <div className="text-xs text-slate-500">active {activeConversationCount} / total {conversations.length}</div>
              </div>
              {conversations.length === 0 ? (
                <div className="mt-2 text-sm text-slate-500">No conversations linked to this contact.</div>
              ) : (
                <div className="mt-3 space-y-2 max-h-40 overflow-auto pr-1">
                  {conversations.map((row) => (
                    <div key={row.id} className="rounded-lg border border-white/10 bg-black/30 p-2 text-xs">
                      <div className="font-mono text-slate-300 break-all">{row.id}</div>
                      <div className="text-slate-500 mt-1">status {row.status || 'n/a'} • last {fmtDate(row.last_message_at || row.updated_at)}</div>
                    </div>
                  ))}
                </div>
              )}
            </section>

            <section className="rounded-2xl border border-white/10 bg-black/20 p-4">
              <div className="text-xs font-black uppercase tracking-widest text-slate-400">Identities</div>
              {identities.length === 0 ? (
                <div className="mt-2 text-sm text-slate-500">No identities found.</div>
              ) : (
                <div className="mt-3 space-y-2 max-h-48 overflow-auto pr-1">
                  {identities.map((row) => (
                    <div key={row.id} className="rounded-lg border border-white/10 bg-black/30 p-2 text-xs">
                      <div className="font-mono text-slate-200">{row.provider}:{row.identity_type}</div>
                      <div className="font-mono text-slate-300 break-all">{row.identity_value}</div>
                      <div className="text-slate-500 mt-1">
                        verified {row.verified ? 'true' : 'false'} • confidence {row.confidence} • primary {row.is_primary ? 'true' : 'false'}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>

            <section className="rounded-2xl border border-white/10 bg-black/20 p-4 space-y-3">
              <div className="text-xs font-black uppercase tracking-widest text-slate-400">Link Identity</div>

              <div className="grid grid-cols-2 gap-2">
                <input
                  value={form.provider}
                  onChange={(e) => setForm((prev) => ({ ...prev, provider: e.target.value }))}
                  placeholder="provider"
                  className="rounded-lg bg-black/30 border border-white/10 px-2 py-2 text-sm"
                />
                <input
                  value={form.identity_type}
                  onChange={(e) => setForm((prev) => ({ ...prev, identity_type: e.target.value }))}
                  placeholder="identity type"
                  className="rounded-lg bg-black/30 border border-white/10 px-2 py-2 text-sm"
                />
              </div>

              <input
                value={form.identity_value}
                onChange={(e) => setForm((prev) => ({ ...prev, identity_value: e.target.value }))}
                placeholder="identity value (email/phone/etc)"
                className="w-full rounded-lg bg-black/30 border border-white/10 px-2 py-2 text-sm"
              />

              <input
                value={form.channel_account_id}
                onChange={(e) => setForm((prev) => ({ ...prev, channel_account_id: e.target.value }))}
                placeholder="channel account id (optional uuid)"
                className="w-full rounded-lg bg-black/30 border border-white/10 px-2 py-2 text-sm"
              />

              <div className="grid grid-cols-2 gap-2">
                <label className="inline-flex items-center gap-2 text-xs text-slate-300">
                  <input
                    type="checkbox"
                    checked={form.verified}
                    onChange={(e) => setForm((prev) => ({ ...prev, verified: e.target.checked }))}
                  />
                  Verified
                </label>
                <label className="inline-flex items-center gap-2 text-xs text-slate-300">
                  <input
                    type="checkbox"
                    checked={form.is_primary}
                    onChange={(e) => setForm((prev) => ({ ...prev, is_primary: e.target.checked }))}
                  />
                  Primary
                </label>
              </div>

              <div className="flex items-center gap-2">
                <span className="text-xs text-slate-400">Confidence</span>
                <input
                  type="number"
                  min={0}
                  max={100}
                  value={form.confidence}
                  onChange={(e) => setForm((prev) => ({ ...prev, confidence: Number(e.target.value || 0) }))}
                  className="w-20 rounded-lg bg-black/30 border border-white/10 px-2 py-1 text-sm"
                />
              </div>

              <button
                onClick={() => void linkIdentity()}
                disabled={linkBusy || !contactId || !tenantId}
                className="px-3 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-xs font-black uppercase tracking-widest"
              >
                {linkBusy ? 'Linking...' : 'Link Identity'}
              </button>
            </section>

            <section className="rounded-2xl border border-white/10 bg-black/20 p-4">
              <button
                onClick={() => setTimelineOpen((prev) => !prev)}
                className="w-full flex items-center justify-between text-left"
              >
                <span className="text-xs font-black uppercase tracking-widest text-slate-400">Timeline</span>
                <span className="text-xs text-slate-500">{timelineOpen ? 'Hide' : 'Show'}</span>
              </button>

              {timelineOpen ? (
                <div className="mt-3 space-y-2">
                  {timelineBusy ? <div className="text-sm text-slate-500">Loading timeline...</div> : null}
                  {timelineError ? <div className="text-sm text-red-300">{timelineError}</div> : null}
                  {!timelineBusy && timelineItems.length === 0 ? (
                    <div className="text-sm text-slate-500">No timeline items found.</div>
                  ) : (
                    <div className="max-h-56 overflow-auto divide-y divide-white/5">
                      {timelineItems.map((item) => (
                        <div key={item.id} className="py-2 text-xs">
                          <div className="flex items-center justify-between gap-2 text-slate-400">
                            <span>{item.provider} • {item.direction}</span>
                            <span>{fmtDate(item.received_at)}</span>
                          </div>
                          <div className="mt-1 text-slate-200 whitespace-pre-wrap break-words">
                            {String(item.body_text || '').slice(0, 260) || '[No body text]'}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ) : null}
            </section>
          </div>
        </div>
      </aside>
    </>
  );
}
