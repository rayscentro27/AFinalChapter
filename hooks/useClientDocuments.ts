import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabaseClient';
import { DocumentRow } from '../src/services/documentCenterService';

export default function useClientDocuments(userId?: string | null) {
  const [documents, setDocuments] = useState<DocumentRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const refresh = useCallback(async () => {
    if (!userId) {
      setDocuments([]);
      setLoading(false);
      setError('');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const result = await supabase
        .from('documents')
        .select('id,tenant_id,user_id,category,title,status,source_type,source_id,storage_path,content_hash,created_at,updated_at')
        .eq('user_id', userId)
        .order('updated_at', { ascending: false })
        .limit(500);

      if (result.error) {
        throw new Error(result.error.message || 'Unable to load documents.');
      }

      setDocuments((result.data || []) as DocumentRow[]);
    } catch (err: any) {
      setError(String(err?.message || err));
      setDocuments([]);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return {
    documents,
    loading,
    error,
    refresh,
  };
}