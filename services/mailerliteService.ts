import { Contact, AgencyBranding } from '../types';
import { isSupabaseConfigured, supabase } from '../lib/supabaseClient';

type MailerLiteSyncError = { email: string; error: string };

export type MailerLiteBulkSyncResult = {
  total: number;
  successful: number;
  failed?: number;
  error?: string;
  errors?: MailerLiteSyncError[];
};

export type MailerLiteTrainingTaskResult = {
  ok?: boolean;
  error?: string;
  tenant_id?: string | null;
  knowledge_doc_id?: string;
  playbook_id?: string | null;
  task_id?: string | null;
  patches_inserted?: number;
  patches_applied?: number;
  patches_skipped?: number;
  patches_failed?: number;
};

export type MailerLiteTrainingTaskInput = {
  trainingTitle: string;
  additionalInfo: string;
  tenantId?: string;
  employeeTargets?: string[];
  createTask?: boolean;
  autoApplyPatches?: boolean;
  task?: {
    title?: string;
    description?: string;
    dueDate?: string;
    assignedEmployee?: string;
    signal?: 'red' | 'yellow' | 'green';
    type?: 'upload' | 'action' | 'education' | 'review' | 'meeting' | 'legal';
  };
  syncSummary?: {
    total: number;
    successful: number;
    failed?: number;
    error?: string;
  };
};

const MAILERLITE_SYNC_FN = '/.netlify/functions/mailerlite_sync';
const MAILERLITE_TRAINING_TASK_FN = '/.netlify/functions/mailerlite_capture_training_task';

const toSyncPayload = (contact: Contact) => ({
  email: contact.email,
  name: contact.name,
  company: contact.company,
  status: contact.status,
  revenue: contact.revenue ?? null,
});

const getAuthHeaders = async (): Promise<Record<string, string>> => {
  if (!isSupabaseConfigured) return {};

  try {
    const { data } = await supabase.auth.getSession();
    const token = data?.session?.access_token;
    if (!token) return {};
    return { Authorization: `Bearer ${token}` };
  } catch {
    return {};
  }
};

export const syncSubscriberToMailerLite = async (
  contact: Contact,
  branding: AgencyBranding
): Promise<{ success: boolean; error?: string }> => {
  const res = await bulkSyncLeads([contact], branding);
  if (res.error || !res.successful) return { success: false, error: res.error || 'MailerLite sync failed.' };
  return { success: true };
};

export const bulkSyncLeads = async (
  contacts: Contact[],
  branding: AgencyBranding
): Promise<MailerLiteBulkSyncResult> => {
  const groupId = branding.mailerLite?.groupId?.trim();
  if (!groupId) {
    return {
      total: contacts.length,
      successful: 0,
      error: 'MailerLite Group ID missing in settings.',
    };
  }

  const validContacts = contacts.filter((c) => c.email && c.email.trim().length > 0);
  if (validContacts.length === 0) {
    return {
      total: 0,
      successful: 0,
      error: 'No contacts with valid email addresses to sync.',
    };
  }

  try {
    const response = await fetch(MAILERLITE_SYNC_FN, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        groupId,
        contacts: validContacts.map(toSyncPayload),
      }),
    });

    const data = await response.json().catch(() => ({} as any));

    if (!response.ok) {
      return {
        total: validContacts.length,
        successful: Number(data?.successful || 0),
        failed: Number(data?.failed || validContacts.length),
        error: String(data?.error || 'MailerLite sync failed.'),
        errors: Array.isArray(data?.errors) ? data.errors : undefined,
      };
    }

    return {
      total: Number(data?.total || validContacts.length),
      successful: Number(data?.successful || 0),
      failed: Number(data?.failed || 0),
      errors: Array.isArray(data?.errors) ? data.errors : undefined,
    };
  } catch (error: any) {
    console.error('MailerLite Sync Failed:', error);
    return {
      total: validContacts.length,
      successful: 0,
      failed: validContacts.length,
      error: error?.message || 'MailerLite sync failed.',
    };
  }
};

export const createTaskAndTrainingFromMailerLite = async (
  input: MailerLiteTrainingTaskInput
): Promise<MailerLiteTrainingTaskResult> => {
  try {
    const authHeaders = await getAuthHeaders();

    if (!authHeaders.Authorization) {
      return {
        error: 'Authenticated Supabase session required to create tasks and training updates.',
      };
    }

    const response = await fetch(MAILERLITE_TRAINING_TASK_FN, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...authHeaders,
      },
      body: JSON.stringify({
        tenant_id: input.tenantId,
        training_title: input.trainingTitle,
        additional_info: input.additionalInfo,
        employee_targets: input.employeeTargets || [],
        auto_apply_patches: input.autoApplyPatches ?? true,
        create_task: input.createTask ?? true,
        task: input.task
          ? {
              title: input.task.title,
              description: input.task.description,
              due_date: input.task.dueDate,
              assigned_employee: input.task.assignedEmployee,
              signal: input.task.signal,
              type: input.task.type,
            }
          : undefined,
        sync_summary: input.syncSummary,
      }),
    });

    const data = await response.json().catch(() => ({} as any));
    if (!response.ok) {
      return { error: String(data?.error || 'Failed to create MailerLite training task.') };
    }

    return data as MailerLiteTrainingTaskResult;
  } catch (error: any) {
    console.error('MailerLite Training Task Failed:', error);
    return { error: error?.message || 'Failed to create MailerLite training task.' };
  }
};
