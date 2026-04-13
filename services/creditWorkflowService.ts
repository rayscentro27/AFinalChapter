import { supabase } from '../lib/supabaseClient';

export type CreditWorkflowSnapshot = {
  packets: any[];
  finalizedLetters: any[];
  mailEvents: any[];
  mailPackets: any[];
};

export async function getCreditWorkflowSnapshot(input: {
  tenantId?: string;
  userId?: string;
}): Promise<CreditWorkflowSnapshot> {
  if (!input.userId) {
    return {
      packets: [],
      finalizedLetters: [],
      mailEvents: [],
      mailPackets: [],
    };
  }

  const packetQuery = supabase
    .from('dispute_packets')
    .select('id,tenant_id,user_id,status,bureau,letter_version,final_doc_storage_path,final_doc_hash,created_at,updated_at')
    .eq('user_id', input.userId)
    .order('created_at', { ascending: false })
    .limit(10);

  const finalizedQuery = supabase
    .from('finalized_letters')
    .select('id,tenant_id,user_id,bureau,ai_draft_id,dispute_packet_id,final_pdf_path,final_doc_hash,created_at,updated_at')
    .eq('user_id', input.userId)
    .order('created_at', { ascending: false })
    .limit(10);

  const mailQuery = input.tenantId
    ? supabase
        .from('dispute_mail_events')
        .select('id,tenant_id,packet_id,event_type,metadata,created_at')
        .eq('tenant_id', input.tenantId)
        .order('created_at', { ascending: false })
        .limit(20)
    : Promise.resolve({ data: [], error: null } as any);

  const mailPacketQuery = input.tenantId
    ? supabase
        .from('dispute_mail_packets')
        .select('id,tenant_id,status,packet_title,document_name,contact_email,updated_at,created_at')
        .eq('tenant_id', input.tenantId)
        .order('created_at', { ascending: false })
        .limit(20)
    : Promise.resolve({ data: [], error: null } as any);

  const [packetsRes, finalizedRes, mailRes, mailPacketsRes] = await Promise.all([
    packetQuery,
    finalizedQuery,
    mailQuery,
    mailPacketQuery,
  ]);

  for (const result of [packetsRes, finalizedRes, mailRes, mailPacketsRes]) {
    if ((result as any)?.error) {
      throw new Error(String((result as any).error.message || 'Unable to load credit workflow state.'));
    }
  }

  return {
    packets: packetsRes.data || [],
    finalizedLetters: finalizedRes.data || [],
    mailEvents: (mailRes as any).data || [],
    mailPackets: (mailPacketsRes as any).data || [],
  };
}
