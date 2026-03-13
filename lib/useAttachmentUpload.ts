import { useCallback } from 'react';
import { supabase } from './supabaseClient';

export type UploadAttachmentInput = {
  file: File;
  tenantId: string;
  contactId?: string;
  conversationId?: string;
  messageId?: string;
};

export type UploadAttachmentResult = {
  ok: boolean;
  attachment_id: string;
  storage_path: string;
};

async function getBearerToken(): Promise<string> {
  const { data } = await supabase.auth.getSession();
  const token = data?.session?.access_token;
  if (!token) throw new Error('Sign in required');
  return token;
}

export function useAttachmentUpload() {
  const uploadAttachment = useCallback(async (input: UploadAttachmentInput): Promise<UploadAttachmentResult> => {
    const token = await getBearerToken();

    const form = new FormData();
    form.append('file', input.file);
    form.append('tenant_id', input.tenantId);
    if (input.contactId) form.append('contact_id', input.contactId);
    if (input.conversationId) form.append('conversation_id', input.conversationId);
    if (input.messageId) form.append('message_id', input.messageId);

    const response = await fetch(`/.netlify/functions/attachments-upload?tenant_id=${encodeURIComponent(input.tenantId)}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
      },
      body: form,
    });

    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(String(payload?.error || `attachment upload failed (${response.status})`));
    }

    return payload as UploadAttachmentResult;
  }, []);

  const getSignedUrl = useCallback(async (tenantId: string, attachmentId: string, ttl = 600): Promise<string> => {
    const token = await getBearerToken();

    const response = await fetch(
      `/.netlify/functions/attachments-signed-url?tenant_id=${encodeURIComponent(tenantId)}&attachment_id=${encodeURIComponent(attachmentId)}&ttl=${encodeURIComponent(String(ttl))}`,
      {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${token}`,
        },
      }
    );

    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(String(payload?.error || `signed URL failed (${response.status})`));
    }

    return String(payload?.signed_url || '');
  }, []);

  return { uploadAttachment, getSignedUrl };
}
