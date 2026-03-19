import React, { useEffect, useMemo, useState } from 'react';
import {
  BrainCircuit,
  FileText,
  RefreshCw,
  Save,
  Wand2,
  Link as LinkIcon,
  Upload,
  CheckCircle,
  AlertTriangle,
  Rocket,
  Copy,
} from 'lucide-react';
import { isSupabaseConfigured, supabase } from '../lib/supabaseClient';

type KnowledgeDocRow = {
  id: string;
  source_url: string;
  source_type: string;
  title: string;
  tags: string[];
  created_at: string;
};

type PromptPatchRow = {
  id: string;
  agent_name: string;
  patch_title: string;
  created_at: string;
};

const splitLines = (s: string) =>
  s
    .split('\n')
    .map((x) => x.trim())
    .filter(Boolean);

const safeJson = <T,>(s: string): { ok: true; value: T } | { ok: false; error: string } => {
  try {
    return { ok: true, value: JSON.parse(s) as T };
  } catch {
    return { ok: false, error: 'Invalid JSON.' };
  }
};

const copyToClipboard = async (text: string) => {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
};

const KnowledgeHub: React.FC = () => {
  const [tab, setTab] = useState<'distiller' | 'legacy'>('distiller');

  // Ingest
  const [url, setUrl] = useState('');
  const [title, setTitle] = useState('');
  const [tags, setTags] = useState('funding,sales');
  const [lang, setLang] = useState('en');
  const [docId, setDocId] = useState<string>('');
  const [bulkUrls, setBulkUrls] = useState('');


  // Social ingest (optional media upload to Storage + knowledge_docs insert)
  const [socialPlatform, setSocialPlatform] = useState<'instagram' | 'messenger' | 'facebook'>('instagram');
  const [socialUrl, setSocialUrl] = useState('');
  const [socialTitle, setSocialTitle] = useState('');
  const [socialTags, setSocialTags] = useState('sales,funding');
  const [socialCaption, setSocialCaption] = useState('');
  const [socialTranscript, setSocialTranscript] = useState('');
  const [socialFile, setSocialFile] = useState<File | null>(null);
  const [socialMediaPath, setSocialMediaPath] = useState('');
  const [socialMediaMime, setSocialMediaMime] = useState('');
  const [socialDocId, setSocialDocId] = useState<string>('');

  // Distilled assets
  const [playbookTitle, setPlaybookTitle] = useState('');
  const [summary, setSummary] = useState('');
  const [rulesText, setRulesText] = useState('');
  const [checklistText, setChecklistText] = useState('');
  const [templatesJson, setTemplatesJson] = useState('{"email":[],"portal_message":[],"call_script":[]}');

  const [patchAgentName, setPatchAgentName] = useState('Ghost Hunter');
  const [patchTitle, setPatchTitle] = useState('');
  const [patchText, setPatchText] = useState('');
  const [lastPatchId, setLastPatchId] = useState<string>('');

  const [scenarioPackTitle, setScenarioPackTitle] = useState('');
  const [scenariosJson, setScenariosJson] = useState('[]');

  // One-paste distiller import
  const [distillerJson, setDistillerJson] = useState('');

  // UI
  const [status, setStatus] = useState<string>('');
  const [busy, setBusy] = useState(false);
  const [refreshTick, setRefreshTick] = useState(0);
  const [recentDocs, setRecentDocs] = useState<KnowledgeDocRow[]>([]);
  const [recentPatches, setRecentPatches] = useState<PromptPatchRow[]>([]);

  const tagsArr = useMemo(
    () => tags.split(',').map((s) => s.trim()).filter(Boolean),
    [tags]
  );

  const canUseDb = isSupabaseConfigured;

  useEffect(() => {
    if (!canUseDb) return;

    let cancelled = false;
    (async () => {
      try {
        const [docsRes, patchesRes] = await Promise.all([
          supabase
            .from('knowledge_docs')
            .select('id, source_url, source_type, title, tags, created_at')
            .order('created_at', { ascending: false })
            .limit(8),
          supabase
            .from('prompt_patches')
            .select('id, agent_name, patch_title, created_at')
            .order('created_at', { ascending: false })
            .limit(8),
        ]);

        if (cancelled) return;

        if (!docsRes.error) setRecentDocs((docsRes.data as any) || []);
        if (!patchesRes.error) setRecentPatches((patchesRes.data as any) || []);
      } catch {
        // ignore
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [canUseDb, refreshTick]);

  const ingestBulk = async () => {
    const raw = String(bulkUrls || '').trim();
    if (!raw) {
      setStatus('Missing URLs. Paste one YouTube URL per line.');
      return;
    }

    const urls = raw
      .split(/\n+/)
      .map((x) => x.trim())
      .filter(Boolean);

    if (urls.length === 0) {
      setStatus('Missing URLs.');
      return;
    }

    setBusy(true);
    setStatus('Bulk ingest running...');

    try {
      const res = await fetch('/.netlify/functions/ingest_bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          urls,
          tags: tagsArr,
          lang: (lang || 'en').trim(),
        }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setStatus('Bulk ingest failed: ' + (data?.error || 'Unknown error'));
        return;
      }

      const failed = Array.isArray(data?.results) ? data.results.filter((r: any) => !r?.ok) : [];

      setStatus(
        'Bulk ingest complete. success=' +
          String(data?.success ?? 0) +
          ' failed=' +
          String(data?.failed ?? 0) +
          (failed.length ? '\nFirst failures: ' + failed.slice(0, 5).map((f: any) => f.url).join(' | ') : '')
      );

      setRefreshTick((x) => x + 1);
    } catch (e: any) {
      setStatus('Bulk ingest failed: ' + (e?.message || e));
    } finally {
      setBusy(false);
    }
  };

  const ingestYoutube = async () => {
    if (!url.trim()) {
      setStatus('Missing YouTube URL.');
      return;
    }

    setBusy(true);
    setStatus('Ingesting transcript...');
    try {
      const res = await fetch('/.netlify/functions/ingest_youtube', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: url.trim(),
          title: (title || 'YouTube Video').trim(),
          tags: tagsArr,
          lang: (lang || 'en').trim(),
        }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setStatus(`Ingest failed: ${data?.error || 'Unknown error'}`);
        return;
      }

      setDocId(String(data.doc_id || ''));
      setStatus(`Ingested. doc_id=${data.doc_id} segments=${data.segments} chars=${data.chars}`);
      setRefreshTick((x) => x + 1);
    } catch (e: any) {
      setStatus(`Ingest failed: ${e?.message || e}`);
    } finally {
      setBusy(false);
    }
  };

  const createSignedUploadToken = async (filename: string) => {
    const res = await fetch('/.netlify/functions/create_upload_url', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ filename }),
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(String((data as any)?.error || 'Failed to create signed upload URL'));
    return data as { ok: true; path: string; token: string };
  };

  const uploadSocialMedia = async (file: File) => {
    const safeName = (file.name || 'upload').replace(/[^\w.\-]/g, '_');
    const { path, token } = await createSignedUploadToken(safeName);
    const mime = file.type || 'application/octet-stream';

    const { error } = await supabase.storage
      .from('training_media')
      .uploadToSignedUrl(path, token, file, { contentType: mime });

    if (error) throw error;

    setSocialMediaPath(path);
    setSocialMediaMime(mime);

    return { path, mime };
  };

  const ingestSocial = async () => {
    if (!canUseDb) {
      setStatus('Supabase not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.');
      return;
    }

    const content = [socialCaption, socialTranscript].filter(Boolean).join('\n\n---\n\n');
    if (!content.trim() && !socialFile) {
      setStatus('Provide caption/transcript text or attach a video.');
      return;
    }

    setBusy(true);
    setSocialDocId('');

    try {
      setStatus('Uploading video (if selected)...');

      let media_path: string | undefined;
      let media_mime: string | undefined;

      if (socialFile) {
        const up = await uploadSocialMedia(socialFile);
        media_path = up.path;
        media_mime = up.mime;
      }

      setStatus('Saving knowledge doc...');

      const tagsArr = socialTags
        .split(',')
        .map((x) => x.trim())
        .filter(Boolean);

      const res = await fetch('/.netlify/functions/ingest_social', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          source_platform: socialPlatform,
          source_url: socialUrl || undefined,
          title: socialTitle || `Social Training (${socialPlatform})`,
          caption: socialCaption || undefined,
          transcript: socialTranscript || undefined,
          tags: tagsArr,
          media_path,
          media_mime,
        }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setStatus('Social ingest failed: ' + String((data as any)?.error || 'Unknown error'));
        return;
      }

      setSocialDocId(String((data as any)?.doc_id || ''));
      setStatus('Social ingest complete. doc_id=' + String((data as any)?.doc_id || ''));
      setRefreshTick((x) => x + 1);
    } catch (e: any) {
      setStatus('Social ingest failed: ' + String(e?.message || e));
    } finally {
      setBusy(false);
    }
  };

  const openSocialMedia = async () => {
    if (!socialMediaPath) {
      setStatus('No media_path yet. Upload a video first.');
      return;
    }

    setBusy(true);
    try {
      const res = await fetch('/.netlify/functions/get_media_url', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ media_path: socialMediaPath }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(String((data as any)?.error || 'Failed to get signed URL'));

      const signed = String((data as any)?.signed_url || '');
      if (!signed) throw new Error('Missing signed_url');
      window.open(signed, '_blank', 'noopener,noreferrer');
      setStatus('Opened media in a new tab.');
    } catch (e: any) {
      setStatus('Open media failed: ' + String(e?.message || e));
    } finally {
      setBusy(false);
    }
  };


  const savePlaybook = async () => {
    if (!canUseDb) return setStatus('Supabase not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.');
    if (!docId) return setStatus('Missing doc_id. Ingest a transcript first.');

    const rules = splitLines(rulesText);
    const checklist = splitLines(checklistText);
    const parsed = safeJson<Record<string, unknown>>(templatesJson);
    if (!parsed.ok) return setStatus(`Templates JSON invalid: ${parsed.error}`);

    setBusy(true);
    setStatus('Saving playbook...');
    try {
      const { error } = await supabase.from('playbooks').insert({
        doc_id: docId,
        title: (playbookTitle || 'Playbook').trim(),
        summary: summary || '',
        rules,
        checklist,
        templates: parsed.value,
      });

      if (error) return setStatus(`Save playbook failed: ${error.message}`);

      setStatus('Playbook saved.');
      setRefreshTick((x) => x + 1);
    } finally {
      setBusy(false);
    }
  };

  const savePromptPatch = async () => {
    if (!canUseDb) return setStatus('Supabase not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.');
    if (!docId) return setStatus('Missing doc_id. Ingest a transcript first.');
    if (!patchText.trim()) return setStatus('Missing patch text. Paste your PROMPT PATCH.');

    setBusy(true);
    setStatus('Saving prompt patch...');
    try {
      const { data, error } = await supabase
        .from('prompt_patches')
        .insert({
          doc_id: docId,
          agent_name: (patchAgentName || '').trim(),
          patch_title: (patchTitle || 'Patch').trim(),
          patch_text: patchText,
        })
        .select('id')
        .single();

      if (error) return setStatus(`Save patch failed: ${error.message}`);

      setLastPatchId(String((data as any)?.id || ''));
      setStatus(`Prompt patch saved. patch_id=${(data as any)?.id}`);
      setRefreshTick((x) => x + 1);
    } finally {
      setBusy(false);
    }
  };

  const applyPatch = async (patchId: string) => {
    if (!patchId.trim()) {
      setStatus('Missing patch_id.');
      return;
    }

    setBusy(true);
    setStatus('Applying patch to agent prompt...');
    try {
      const res = await fetch('/.netlify/functions/apply_patch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ patch_id: patchId.trim() }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setStatus(`Apply patch failed: ${data?.error || 'Unknown error'}`);
        return;
      }

      setStatus(`Applied patch to ${data.agent}. New version=${data.version}`);
    } catch (e: any) {
      setStatus(`Apply patch failed: ${e?.message || e}`);
    } finally {
      setBusy(false);
    }
  };

  const saveScenarioPack = async () => {
    if (!canUseDb) return setStatus('Supabase not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.');
    if (!docId) return setStatus('Missing doc_id. Ingest a transcript first.');

    const parsed = safeJson<any[]>(scenariosJson);
    if (!parsed.ok) return setStatus(`Scenarios JSON invalid: ${parsed.error}`);

    setBusy(true);
    setStatus('Saving scenario pack...');
    try {
      const { error } = await supabase.from('scenario_packs').insert({
        doc_id: docId,
        title: (scenarioPackTitle || 'Scenario Pack').trim(),
        scenarios: parsed.value,
      });

      if (error) return setStatus(`Save scenarios failed: ${error.message}`);

      setStatus('Scenario pack saved.');
      setRefreshTick((x) => x + 1);
    } finally {
      setBusy(false);
    }
  };

  const importDistiller = async () => {
    if (!distillerJson.trim()) {
      setStatus('Missing IMPORT_JSON. Paste only the JSON object.');
      return;
    }

    setBusy(true);
    setStatus('Importing distiller output...');
    try {
      let payload: any;
      try {
        payload = JSON.parse(distillerJson);
      } catch {
        setStatus('Invalid JSON. Paste only the IMPORT_JSON object (no code fences).');
        return;
      }

      if (docId && !payload.doc_id) payload.doc_id = docId;

      const res = await fetch('/.netlify/functions/import_distiller', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setStatus(`Import failed: ${data?.error || 'Unknown error'}`);
        return;
      }

      setStatus(
        `Imported. PB=${data.playbook_id || '—'} Applied=${data.patches_applied} Skipped=${data.patches_skipped} Failed=${data.patches_failed}`
      );
      setRefreshTick((x) => x + 1);
    } catch (e: any) {
      setStatus(`Import failed: ${e?.message || e}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="max-w-6xl mx-auto space-y-8 animate-fade-in pb-24">
      <div className="bg-slate-950 p-12 rounded-[3rem] text-white shadow-2xl relative overflow-hidden border border-white/10">
        <div className="absolute top-0 right-0 p-10 opacity-10 rotate-12">
          <BrainCircuit size={320} />
        </div>
        <div className="relative z-10 max-w-3xl">
          <div className="inline-flex items-center gap-2 bg-[#66FCF1]/10 text-[#66FCF1] px-4 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest mb-10 border border-[#66FCF1]/20">
            Distiller + Knowledge Vault
          </div>
          <h1 className="text-5xl md:text-6xl font-black mb-6 tracking-tighter uppercase leading-[0.9]">
            Train from <span className="text-[#66FCF1]">YouTube</span> into Employees
          </h1>
          <p className="text-slate-400 text-lg leading-relaxed font-medium">
            Ingest transcript, distill into playbooks, generate prompt patches and scenario packs, then apply patches to your Supabase-backed AI employees.
          </p>
        </div>
      </div>

      <div className="flex bg-white/5 p-1.5 rounded-2xl border border-white/10 shadow-inner w-fit mx-auto md:mx-0">
        <button
          onClick={() => setTab('distiller')}
          className={`px-8 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${
            tab === 'distiller' ? 'bg-slate-950 shadow-lg text-[#66FCF1]' : 'text-slate-400'
          }`}
        >
          Distiller Admin
        </button>
        <button
          onClick={() => setTab('legacy')}
          className={`px-8 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${
            tab === 'legacy' ? 'bg-slate-950 shadow-lg text-white' : 'text-slate-400'
          }`}
        >
          Legacy (Local)
        </button>
      </div>

      {!canUseDb && tab === 'distiller' && (
        <div className="bg-amber-500/10 border border-amber-500/20 rounded-[2.5rem] p-8 text-amber-200 flex items-start gap-4">
          <AlertTriangle className="shrink-0" />
          <div>
            <div className="font-black uppercase tracking-widest text-[10px]">Supabase Not Configured</div>
            <div className="text-sm text-amber-100/90 mt-2">
              Set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` (Netlify + local) so this page can write playbooks/prompt patches/scenario packs.
            </div>
          </div>
        </div>
      )}

      {tab === 'distiller' && (
        <div className="space-y-8">
          {/* 1) Ingest */}
          <div className="bg-slate-950 border border-white/10 rounded-[3rem] p-10 shadow-2xl">
            <div className="flex items-center justify-between gap-6 flex-wrap">
              <div>
                <h2 className="text-white text-2xl font-black uppercase tracking-tight">1) Ingest YouTube Transcript</h2>
                <p className="text-slate-400 text-sm mt-2">
                  Calls `/.netlify/functions/ingest_youtube` and upserts into `knowledge_docs`.
                </p>
              </div>
              <button
                onClick={ingestYoutube}
                disabled={busy}
                className="px-6 py-3 rounded-2xl bg-[#66FCF1] text-slate-950 text-[10px] font-black uppercase tracking-widest disabled:opacity-50 flex items-center gap-2"
              >
                {busy ? <RefreshCw size={16} className="animate-spin" /> : <Upload size={16} />}
                Ingest
              </button>
            </div>

            <div className="mt-8 grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2 ml-1">
                  YouTube URL
                </label>
                <div className="flex items-center gap-3">
                  <div className="p-3 rounded-xl bg-white/5 border border-white/10 text-slate-400">
                    <LinkIcon size={16} />
                  </div>
                  <input
                    value={url}
                    onChange={(e) => setUrl(e.target.value)}
                    placeholder="https://www.youtube.com/watch?v=..."
                    className="w-full rounded-xl bg-black/30 border border-white/10 px-4 py-3 text-white"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2 ml-1">
                  Title
                </label>
                <input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Video title (optional)"
                  className="w-full rounded-xl bg-black/30 border border-white/10 px-4 py-3 text-white"
                />
              </div>

              <div>
                <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2 ml-1">
                  Tags (comma)
                </label>
                <input
                  value={tags}
                  onChange={(e) => setTags(e.target.value)}
                  placeholder="funding,sales"
                  className="w-full rounded-xl bg-black/30 border border-white/10 px-4 py-3 text-white"
                />
              </div>

              <div>
                <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2 ml-1">
                  Lang
                </label>
                <input
                  value={lang}
                  onChange={(e) => setLang(e.target.value)}
                  placeholder="en"
                  className="w-full rounded-xl bg-black/30 border border-white/10 px-4 py-3 text-white"
                />
              </div>
            </div>

            <div className="mt-6 flex items-center justify-between flex-wrap gap-4">
              <div className="text-slate-400 text-sm">
                doc_id: <span className="text-white font-mono">{docId || '—'}</span>
              </div>
              {docId && (
                <button
                  onClick={async () => {
                    const ok = await copyToClipboard(docId);
                    setStatus(ok ? 'Copied doc_id.' : 'Copy failed.');
                  }}
                  className="px-4 py-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-white text-[10px] font-black uppercase tracking-widest flex items-center gap-2"
                >
                  <Copy size={14} /> Copy doc_id
                </button>
              )}
            </div>
          </div>


          {/* 1.25) Bulk ingest */}
          <div className="bg-slate-950 border border-white/10 rounded-[3rem] p-10 shadow-2xl">
            <div className="flex items-center justify-between gap-6 flex-wrap">
              <div>
                <h2 className="text-white text-2xl font-black uppercase tracking-tight">Bulk Ingest (URLs)</h2>
                <p className="text-slate-400 text-sm mt-2">
                  Paste one YouTube URL per line. Calls <span className="font-mono">/.netlify/functions/ingest_bulk</span>.
                </p>
              </div>
              <button
                onClick={ingestBulk}
                disabled={busy}
                className="px-6 py-3 rounded-2xl bg-[#66FCF1] text-slate-950 text-[10px] font-black uppercase tracking-widest disabled:opacity-50 flex items-center gap-2"
              >
                {busy ? <RefreshCw size={16} className="animate-spin" /> : <Upload size={16} />}
                Bulk Ingest
              </button>
            </div>

            <div className="mt-8">
              <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2 ml-1">
                URLs (one per line)
              </label>
              <textarea
                value={bulkUrls}
                onChange={(e) => setBulkUrls(e.target.value)}
                rows={8}
                className="w-full rounded-2xl bg-black/30 border border-white/10 px-4 py-3 text-white font-mono text-xs"
                placeholder="https://www.youtube.com/watch?v=...\nhttps://www.youtube.com/watch?v=..."
              />
              <div className="mt-3 text-slate-500 text-xs">
                Uses current Tags + Lang fields from the single ingest section.
              </div>
            </div>
          </div>


          {/* 1.25) Ingest Social */}
          <div className="bg-slate-950 border border-white/10 rounded-[3rem] p-10 shadow-2xl">
            <div className="flex items-center justify-between gap-6 flex-wrap">
              <div>
                <h2 className="text-white text-2xl font-black uppercase tracking-tight">1b) Ingest Social Training</h2>
                <p className="text-slate-400 text-sm mt-2">
                  Optional private video upload to Storage bucket <span className="font-mono">training_media</span>, then inserts into <span className="font-mono">knowledge_docs</span> via
                  <span className="font-mono"> /.netlify/functions/ingest_social</span>.
                </p>
              </div>
              <button
                onClick={ingestSocial}
                disabled={busy}
                className="px-6 py-3 rounded-2xl bg-[#66FCF1] text-slate-950 text-[10px] font-black uppercase tracking-widest disabled:opacity-50 flex items-center gap-2"
              >
                {busy ? <RefreshCw size={16} className="animate-spin" /> : <Upload size={16} />}
                Ingest Social
              </button>
            </div>

            <div className="mt-8 grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2 ml-1">Platform</label>
                <select
                  value={socialPlatform}
                  onChange={(e) => setSocialPlatform(e.target.value as any)}
                  className="w-full rounded-xl bg-black/30 border border-white/10 px-4 py-3 text-white"
                >
                  <option value="instagram">Instagram</option>
                  <option value="messenger">Messenger</option>
                  <option value="facebook">Facebook</option>
                </select>
              </div>

              <div>
                <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2 ml-1">Source URL (optional)</label>
                <input
                  value={socialUrl}
                  onChange={(e) => setSocialUrl(e.target.value)}
                  placeholder="https://..."
                  className="w-full rounded-xl bg-black/30 border border-white/10 px-4 py-3 text-white"
                />
              </div>

              <div>
                <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2 ml-1">Title</label>
                <input
                  value={socialTitle}
                  onChange={(e) => setSocialTitle(e.target.value)}
                  placeholder="Social training title"
                  className="w-full rounded-xl bg-black/30 border border-white/10 px-4 py-3 text-white"
                />
              </div>

              <div>
                <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2 ml-1">Tags (comma)</label>
                <input
                  value={socialTags}
                  onChange={(e) => setSocialTags(e.target.value)}
                  placeholder="sales,funding"
                  className="w-full rounded-xl bg-black/30 border border-white/10 px-4 py-3 text-white"
                />
              </div>

              <div className="md:col-span-2">
                <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2 ml-1">Caption (optional)</label>
                <textarea
                  value={socialCaption}
                  onChange={(e) => setSocialCaption(e.target.value)}
                  rows={4}
                  className="w-full rounded-2xl bg-black/30 border border-white/10 px-4 py-3 text-white font-mono text-xs"
                  placeholder="Paste caption text"
                />
              </div>

              <div className="md:col-span-2">
                <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2 ml-1">Transcript (optional)</label>
                <textarea
                  value={socialTranscript}
                  onChange={(e) => setSocialTranscript(e.target.value)}
                  rows={6}
                  className="w-full rounded-2xl bg-black/30 border border-white/10 px-4 py-3 text-white font-mono text-xs"
                  placeholder="Paste transcript text"
                />
              </div>

              <div className="md:col-span-2">
                <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2 ml-1">Optional Video</label>
                <input
                  type="file"
                  accept="video/*"
                  onChange={(e) => setSocialFile(e.target.files?.[0] || null)}
                  className="block w-full text-slate-300 text-sm"
                />

                {(socialMediaPath || socialDocId) && (
                  <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div className="rounded-2xl bg-black/30 border border-white/10 px-4 py-3">
                      <div className="text-[10px] font-black text-slate-500 uppercase tracking-widest">media_path</div>
                      <div className="mt-2 font-mono text-xs text-slate-200 break-all">{socialMediaPath || '-'}</div>
                      <div className="mt-3 flex items-center gap-2">
                        <button
                          onClick={openSocialMedia}
                          disabled={!socialMediaPath || busy}
                          className="px-4 py-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-white text-[10px] font-black uppercase tracking-widest disabled:opacity-50"
                        >
                          Open
                        </button>
                        <button
                          onClick={async () => {
                            if (await copyToClipboard(socialMediaPath)) setStatus('Copied media_path');
                          }}
                          disabled={!socialMediaPath}
                          className="px-4 py-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-white text-[10px] font-black uppercase tracking-widest disabled:opacity-50 flex items-center gap-2"
                        >
                          <Copy size={14} /> Copy
                        </button>
                      </div>
                      <div className="mt-2 text-[10px] text-slate-500">mime: {socialMediaMime || '-'}</div>
                    </div>

                    <div className="rounded-2xl bg-black/30 border border-white/10 px-4 py-3">
                      <div className="text-[10px] font-black text-slate-500 uppercase tracking-widest">doc_id</div>
                      <div className="mt-2 font-mono text-xs text-slate-200 break-all">{socialDocId || '-'}</div>
                      <div className="mt-3 flex items-center gap-2">
                        <button
                          onClick={async () => {
                            if (await copyToClipboard(socialDocId)) setStatus('Copied doc_id');
                          }}
                          disabled={!socialDocId}
                          className="px-4 py-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-white text-[10px] font-black uppercase tracking-widest disabled:opacity-50 flex items-center gap-2"
                        >
                          <Copy size={14} /> Copy
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
          {/* 1.5) One paste import */}
          <div className="bg-slate-950 border border-white/10 rounded-[3rem] p-10 shadow-2xl">
            <div className="flex items-center justify-between gap-6 flex-wrap">
              <div>
                <h2 className="text-white text-2xl font-black uppercase tracking-tight">2) Import Distiller Output (One Paste)</h2>
                <p className="text-slate-400 text-sm mt-2">
                  Paste only the final <span className="font-mono">IMPORT_JSON</span> object. This saves playbook + scenarios + patches and auto-applies patches with dedupe.
                </p>
              </div>
              <button
                onClick={importDistiller}
                disabled={busy}
                className="px-6 py-3 rounded-2xl bg-[#66FCF1] text-slate-950 text-[10px] font-black uppercase tracking-widest disabled:opacity-50 flex items-center gap-2"
              >
                {busy ? <RefreshCw size={16} className="animate-spin" /> : <Rocket size={16} />}
                Import + Auto-Apply
              </button>
            </div>

            <div className="mt-8">
              <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2 ml-1">
                IMPORT_JSON
              </label>
              <textarea
                value={distillerJson}
                onChange={(e) => setDistillerJson(e.target.value)}
                rows={14}
                className="w-full rounded-2xl bg-black/30 border border-white/10 px-4 py-3 text-white font-mono text-xs"
                placeholder="Paste ONLY the IMPORT_JSON object here"
              />
              <div className="mt-3 text-slate-500 text-xs">
                Tip: If you ingested first, your current <span className="font-mono">doc_id</span> will be injected automatically if missing.
              </div>
            </div>
          </div>

          {/* 2) Playbook */}
          <div className="bg-slate-950 border border-white/10 rounded-[3rem] p-10 shadow-2xl">
            <div className="flex items-center justify-between gap-6 flex-wrap">
              <div>
                <h2 className="text-white text-2xl font-black uppercase tracking-tight">3) Save Distilled Playbook</h2>
                <p className="text-slate-400 text-sm mt-2">Paste the Distiller output (rules/checklist/templates) and save to `playbooks`.</p>
              </div>
              <button
                onClick={savePlaybook}
                disabled={busy}
                className="px-6 py-3 rounded-2xl bg-white/5 hover:bg-white/10 border border-white/10 text-white text-[10px] font-black uppercase tracking-widest disabled:opacity-50 flex items-center gap-2"
              >
                {busy ? <RefreshCw size={16} className="animate-spin" /> : <Save size={16} />}
                Save Playbook
              </button>
            </div>

            <div className="mt-8 grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2 ml-1">Playbook Title</label>
                <input
                  value={playbookTitle}
                  onChange={(e) => setPlaybookTitle(e.target.value)}
                  placeholder="Playbook"
                  className="w-full rounded-xl bg-black/30 border border-white/10 px-4 py-3 text-white"
                />
              </div>

              <div>
                <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2 ml-1">Summary</label>
                <input
                  value={summary}
                  onChange={(e) => setSummary(e.target.value)}
                  placeholder="Short summary"
                  className="w-full rounded-xl bg-black/30 border border-white/10 px-4 py-3 text-white"
                />
              </div>

              <div>
                <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2 ml-1">Rules (1 per line)</label>
                <textarea
                  value={rulesText}
                  onChange={(e) => setRulesText(e.target.value)}
                  rows={10}
                  className="w-full rounded-2xl bg-black/30 border border-white/10 px-4 py-3 text-white"
                  placeholder="DO: ...\nDON'T: ..."
                />
              </div>

              <div>
                <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2 ml-1">Checklist (1 per line)</label>
                <textarea
                  value={checklistText}
                  onChange={(e) => setChecklistText(e.target.value)}
                  rows={10}
                  className="w-full rounded-2xl bg-black/30 border border-white/10 px-4 py-3 text-white"
                  placeholder="1) ...\n2) ..."
                />
              </div>

              <div className="md:col-span-2">
                <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2 ml-1">Templates JSON</label>
                <textarea
                  value={templatesJson}
                  onChange={(e) => setTemplatesJson(e.target.value)}
                  rows={8}
                  className="w-full rounded-2xl bg-black/30 border border-white/10 px-4 py-3 text-white font-mono text-xs"
                />
              </div>
            </div>
          </div>

          {/* 3) Prompt Patch */}
          <div className="bg-slate-950 border border-white/10 rounded-[3rem] p-10 shadow-2xl">
            <div className="flex items-center justify-between gap-6 flex-wrap">
              <div>
                <h2 className="text-white text-2xl font-black uppercase tracking-tight">4) Save Prompt Patch</h2>
                <p className="text-slate-400 text-sm mt-2">Save into `prompt_patches`, then apply server-side to `agents.system_prompt`.</p>
              </div>
              <button
                onClick={savePromptPatch}
                disabled={busy}
                className="px-6 py-3 rounded-2xl bg-white/5 hover:bg-white/10 border border-white/10 text-white text-[10px] font-black uppercase tracking-widest disabled:opacity-50 flex items-center gap-2"
              >
                {busy ? <RefreshCw size={16} className="animate-spin" /> : <Wand2 size={16} />}
                Save Patch
              </button>
            </div>

            <div className="mt-8 grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2 ml-1">Agent Name</label>
                <input
                  value={patchAgentName}
                  onChange={(e) => setPatchAgentName(e.target.value)}
                  placeholder="Ghost Hunter"
                  className="w-full rounded-xl bg-black/30 border border-white/10 px-4 py-3 text-white"
                />
              </div>

              <div>
                <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2 ml-1">Patch Title</label>
                <input
                  value={patchTitle}
                  onChange={(e) => setPatchTitle(e.target.value)}
                  placeholder="Patch"
                  className="w-full rounded-xl bg-black/30 border border-white/10 px-4 py-3 text-white"
                />
              </div>

              <div className="md:col-span-2">
                <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2 ml-1">Patch Text</label>
                <textarea
                  value={patchText}
                  onChange={(e) => setPatchText(e.target.value)}
                  rows={10}
                  className="w-full rounded-2xl bg-black/30 border border-white/10 px-4 py-3 text-white"
                  placeholder="Paste PROMPT PATCH here..."
                />
              </div>
            </div>

            <div className="mt-6 flex items-center justify-between gap-4 flex-wrap">
              <div className="text-slate-400 text-sm">
                patch_id: <span className="text-white font-mono">{lastPatchId || '—'}</span>
              </div>

              <div className="flex items-center gap-3">
                {lastPatchId && (
                  <button
                    onClick={async () => {
                      const ok = await copyToClipboard(lastPatchId);
                      setStatus(ok ? 'Copied patch_id.' : 'Copy failed.');
                    }}
                    className="px-4 py-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-white text-[10px] font-black uppercase tracking-widest flex items-center gap-2"
                  >
                    <Copy size={14} /> Copy patch_id
                  </button>
                )}

                <button
                  onClick={() => applyPatch(lastPatchId)}
                  disabled={busy || !lastPatchId}
                  className="px-5 py-2.5 rounded-xl bg-[#66FCF1] text-slate-950 text-[10px] font-black uppercase tracking-widest disabled:opacity-50 flex items-center gap-2"
                >
                  {busy ? <RefreshCw size={14} className="animate-spin" /> : <Rocket size={14} />}
                  Apply Patch
                </button>
              </div>
            </div>
          </div>

          {/* 4) Scenario Pack */}
          <div className="bg-slate-950 border border-white/10 rounded-[3rem] p-10 shadow-2xl">
            <div className="flex items-center justify-between gap-6 flex-wrap">
              <div>
                <h2 className="text-white text-2xl font-black uppercase tracking-tight">5) Save Scenario Pack</h2>
                <p className="text-slate-400 text-sm mt-2">Paste SCENARIO PACK JSON array and save to `scenario_packs`.</p>
              </div>
              <button
                onClick={saveScenarioPack}
                disabled={busy}
                className="px-6 py-3 rounded-2xl bg-white/5 hover:bg-white/10 border border-white/10 text-white text-[10px] font-black uppercase tracking-widest disabled:opacity-50 flex items-center gap-2"
              >
                {busy ? <RefreshCw size={16} className="animate-spin" /> : <FileText size={16} />}
                Save Pack
              </button>
            </div>

            <div className="mt-8 grid grid-cols-1 gap-4">
              <div>
                <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2 ml-1">Pack Title</label>
                <input
                  value={scenarioPackTitle}
                  onChange={(e) => setScenarioPackTitle(e.target.value)}
                  placeholder="Scenario Pack"
                  className="w-full rounded-xl bg-black/30 border border-white/10 px-4 py-3 text-white"
                />
              </div>
              <div>
                <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2 ml-1">Scenarios JSON</label>
                <textarea
                  value={scenariosJson}
                  onChange={(e) => setScenariosJson(e.target.value)}
                  rows={12}
                  className="w-full rounded-2xl bg-black/30 border border-white/10 px-4 py-3 text-white font-mono text-xs"
                />
              </div>
            </div>
          </div>

          {/* Recent */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="bg-slate-950 border border-white/10 rounded-[3rem] p-10 shadow-2xl">
              <div className="flex items-center justify-between">
                <h3 className="text-white font-black uppercase tracking-tight">Recent Docs</h3>
                <button
                  onClick={() => setRefreshTick((x) => x + 1)}
                  className="px-4 py-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-white text-[10px] font-black uppercase tracking-widest flex items-center gap-2"
                >
                  <RefreshCw size={14} /> Refresh
                </button>
              </div>
              <div className="mt-6 space-y-3">
                {recentDocs.length === 0 ? (
                  <div className="text-slate-500 text-sm">No docs yet.</div>
                ) : (
                  recentDocs.map((d) => (
                    <div key={d.id} className="bg-white/5 border border-white/10 rounded-[2rem] p-5">
                      <div className="text-white font-black truncate">{d.title}</div>
                      <div className="text-slate-500 text-xs mt-1 truncate">{d.source_url}</div>
                      <div className="text-slate-600 text-[10px] mt-2 font-mono">{d.id}</div>
                    </div>
                  ))
                )}
              </div>
            </div>

            <div className="bg-slate-950 border border-white/10 rounded-[3rem] p-10 shadow-2xl">
              <div className="flex items-center justify-between">
                <h3 className="text-white font-black uppercase tracking-tight">Recent Prompt Patches</h3>
                <button
                  onClick={() => setRefreshTick((x) => x + 1)}
                  className="px-4 py-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-white text-[10px] font-black uppercase tracking-widest flex items-center gap-2"
                >
                  <RefreshCw size={14} /> Refresh
                </button>
              </div>
              <div className="mt-6 space-y-3">
                {recentPatches.length === 0 ? (
                  <div className="text-slate-500 text-sm">No patches yet.</div>
                ) : (
                  recentPatches.map((p) => (
                    <div key={p.id} className="bg-white/5 border border-white/10 rounded-[2rem] p-5 flex items-start justify-between gap-4">
                      <div className="min-w-0">
                        <div className="text-white font-black truncate">{p.agent_name}</div>
                        <div className="text-slate-500 text-xs mt-1 truncate">{p.patch_title}</div>
                        <div className="text-slate-600 text-[10px] mt-2 font-mono">{p.id}</div>
                      </div>
                      <button
                        onClick={() => applyPatch(p.id)}
                        disabled={busy}
                        className="shrink-0 px-4 py-2 rounded-xl bg-[#66FCF1] text-slate-950 text-[10px] font-black uppercase tracking-widest disabled:opacity-50"
                      >
                        Apply
                      </button>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>

          {/* Status */}
          <div
            className={`rounded-[2.5rem] p-6 border flex items-start gap-4 ${
              status.toLowerCase().includes('failed')
                ? 'bg-red-500/10 border-red-500/20 text-red-200'
                : status.toLowerCase().includes('saved') ||
                    status.toLowerCase().includes('ingested') ||
                    status.toLowerCase().includes('applied')
                  ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-200'
                  : 'bg-white/5 border-white/10 text-slate-300'
            }`}
          >
            {status.toLowerCase().includes('failed') ? (
              <AlertTriangle className="shrink-0" />
            ) : status.toLowerCase().includes('saved') ||
                status.toLowerCase().includes('ingested') ||
                status.toLowerCase().includes('applied') ? (
              <CheckCircle className="shrink-0" />
            ) : (
              <BrainCircuit className="shrink-0" />
            )}
            <div className="text-sm whitespace-pre-wrap">{status || 'Ready.'}</div>
          </div>
        </div>
      )}

      {tab === 'legacy' && (
        <div className="bg-slate-950 border border-white/10 rounded-[3rem] p-10 shadow-2xl text-slate-200">
          <div className="text-white font-black uppercase tracking-tight text-2xl">Legacy Knowledge Hub</div>
          <p className="text-slate-400 text-sm mt-3">
            This tab used to store SOPs and correction pairs in localStorage. Option 2 replaces that workflow with Supabase tables + Netlify Functions.
          </p>
          <div className="mt-6 text-slate-400 text-sm">
            Run the SQL in <span className="font-mono">docs/supabase/knowledge_vault.sql</span> in Supabase SQL Editor, then use the Distiller Admin tab.
          </div>
        </div>
      )}
    </div>
  );
};

export default KnowledgeHub;
