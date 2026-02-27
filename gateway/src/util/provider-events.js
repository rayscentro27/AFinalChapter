import { supabaseAdmin } from '../supabase.js';
import { redactSecrets } from './redact.js';

export async function storeProviderEvent(row) {
  const safeRow = {
    ...row,
    payload: redactSecrets(row?.payload || null),
    normalized: redactSecrets(row?.normalized || null),
  };

  const { error } = await supabaseAdmin
    .from('provider_events')
    .upsert(safeRow, {
      onConflict: 'provider,provider_event_id',
    });

  if (error) throw new Error(`provider_events insert failed: ${error.message}`);
}
