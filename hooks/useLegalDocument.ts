import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabaseClient';
import { LegalDocumentKey, LegalDocumentRow } from '../components/legal/legalDocuments';

type UseLegalDocumentResult = {
  loading: boolean;
  error: string | null;
  document: LegalDocumentRow | null;
  refresh: () => Promise<void>;
};

function isMissingLegalTablesError(code?: string): boolean {
  return code === '42P01' || code === 'PGRST116';
}

export default function useLegalDocument(docKey: LegalDocumentKey, enabled = true): UseLegalDocumentResult {
  const [loading, setLoading] = useState(enabled);
  const [error, setError] = useState<string | null>(null);
  const [document, setDocument] = useState<LegalDocumentRow | null>(null);

  async function refresh() {
    if (!enabled) {
      setLoading(false);
      setError(null);
      setDocument(null);
      return;
    }

    setLoading(true);
    setError(null);

    const { data, error: readError } = await supabase
      .from('legal_documents')
      .select('id,doc_key,version,title,subtitle,markdown_body,status,is_active,created_at,updated_at')
      .eq('doc_key', docKey)
      .eq('status', 'published')
      .eq('is_active', true)
      .order('published_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (readError) {
      if (isMissingLegalTablesError(readError.code)) {
        setDocument(null);
        setError(null);
      } else {
        setDocument(null);
        setError(readError.message || 'Unable to load legal document.');
      }
      setLoading(false);
      return;
    }

    setDocument((data || null) as LegalDocumentRow | null);
    setLoading(false);
  }

  useEffect(() => {
    void refresh();
  }, [docKey, enabled]);

  return {
    loading,
    error,
    document,
    refresh,
  };
}
