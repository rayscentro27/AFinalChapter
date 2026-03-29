import React from 'react';
import useLegalDocument from '../../hooks/useLegalDocument';
import { LegalDocumentKey } from './legalDocuments';
import LegalMarkdownContent from './LegalMarkdownContent';
import LegalPageLayout from './LegalPageLayout';

type DynamicLegalPageProps = {
  docKey: LegalDocumentKey;
  fallbackTitle: string;
  fallbackSubtitle: string;
  fallbackContent: React.ReactNode;
};

function shortHash(hash: string | null | undefined): string {
  const value = String(hash || '').trim();
  if (!value) return '';
  if (value.length <= 14) return value;
  return `${value.slice(0, 10)}...${value.slice(-4)}`;
}

export default function DynamicLegalPage({
  docKey,
  fallbackTitle,
  fallbackSubtitle,
  fallbackContent,
}: DynamicLegalPageProps) {
  const { loading, error, document } = useLegalDocument(docKey);

  const title = document?.title || fallbackTitle;
  const subtitle = document?.subtitle || fallbackSubtitle;

  return (
    <LegalPageLayout title={title} subtitle={subtitle}>
      {loading && !document ? (
        <div className="text-sm text-slate-400">Loading legal policy...</div>
      ) : document?.markdown_body ? (
        <>
          <LegalMarkdownContent markdown={document.markdown_body} />
          <div className="flex flex-wrap items-center gap-2 text-[11px]">
            <span className="rounded-lg border border-cyan-300/20 bg-cyan-900/20 px-3 py-1.5 text-cyan-100 inline-block">
              Version: {document.version}
            </span>
            {document.content_hash ? (
              <span className="rounded-lg border border-indigo-300/20 bg-indigo-900/20 px-3 py-1.5 text-indigo-100 inline-block font-mono">
                Hash: {shortHash(document.content_hash)}
              </span>
            ) : null}
          </div>
        </>
      ) : (
        fallbackContent
      )}

      {error ? (
        <div className="rounded-xl border border-amber-400/30 bg-amber-950/40 px-4 py-3 text-xs text-amber-100">
          Using fallback legal text while published document data is unavailable.
        </div>
      ) : null}
    </LegalPageLayout>
  );
}
