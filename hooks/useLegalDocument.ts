import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabaseClient';
import { LegalDocumentKey, LegalDocumentRow } from '../components/legal/legalDocuments';

type UseLegalDocumentResult = {
  loading: boolean;
  error: string | null;
  document: LegalDocumentRow | null;
  refresh: () => Promise<void>;
};

type PolicyDocumentRow = {
  id: string;
  key: string;
  title: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

type PolicyVersionRow = {
  id: string;
  document_id: string;
  version: string;
  content_md: string;
  content_hash: string;
  is_published: boolean;
  published_at: string | null;
  created_at: string;
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

    const docRes = await supabase
      .from('policy_documents')
      .select('id,key,title,is_active,created_at,updated_at')
      .eq('key', docKey)
      .eq('is_active', true)
      .maybeSingle();

    if (docRes.error) {
      if (isMissingLegalTablesError(docRes.error.code)) {
        setDocument(null);
        setError(null);
      } else {
        setDocument(null);
        setError(docRes.error.message || 'Unable to load policy document.');
      }
      setLoading(false);
      return;
    }

    const policyDoc = (docRes.data || null) as PolicyDocumentRow | null;
    if (!policyDoc) {
      setDocument(null);
      setLoading(false);
      return;
    }

    const versionRes = await supabase
      .from('policy_versions')
      .select('id,document_id,version,content_md,content_hash,is_published,published_at,created_at')
      .eq('document_id', policyDoc.id)
      .eq('is_published', true)
      .order('published_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (versionRes.error) {
      if (isMissingLegalTablesError(versionRes.error.code)) {
        setDocument(null);
        setError(null);
      } else {
        setDocument(null);
        setError(versionRes.error.message || 'Unable to load policy version.');
      }
      setLoading(false);
      return;
    }

    const version = (versionRes.data || null) as PolicyVersionRow | null;
    if (!version) {
      setDocument(null);
      setLoading(false);
      return;
    }

    const mapped: LegalDocumentRow = {
      id: version.id,
      policy_version_id: version.id,
      doc_key: docKey,
      version: version.version,
      title: policyDoc.title,
      subtitle: null,
      markdown_body: version.content_md,
      content_hash: version.content_hash || null,
      is_published: true,
      published_at: version.published_at,
      created_at: version.created_at,
      updated_at: policyDoc.updated_at,
    };

    setDocument(mapped);
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
