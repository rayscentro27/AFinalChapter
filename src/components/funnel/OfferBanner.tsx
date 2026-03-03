import React, { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../../../contexts/AuthContext';
import {
  listOffersInboxForUser,
  markOfferClicked,
  markOfferDismissed,
  markOfferSeen,
  OfferInboxRow,
} from '../../services/funnelService';
import { supabase } from '../../../lib/supabaseClient';

type OfferRow = {
  key: string;
  title: string;
  body_md: string;
  target_tier: string;
};

type Props = {
  onUpgrade: () => void;
};

function normalizeString(value: unknown): string {
  return String(value || '').trim();
}

export default function OfferBanner({ onUpgrade }: Props) {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [inboxRows, setInboxRows] = useState<OfferInboxRow[]>([]);
  const [offerMap, setOfferMap] = useState<Record<string, OfferRow>>({});
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;

    async function load() {
      if (!user?.id) {
        setLoading(false);
        return;
      }

      setLoading(true);
      setError('');

      try {
        const rows = await listOffersInboxForUser(user.id);
        if (!active) return;
        setInboxRows(rows);

        const keys = Array.from(new Set(rows.map((row) => row.offer_key).filter(Boolean)));
        if (keys.length === 0) {
          setOfferMap({});
          setLoading(false);
          return;
        }

        const offersRes = await supabase
          .from('offers')
          .select('key,title,body_md,target_tier')
          .in('key', keys)
          .eq('is_active', true);

        if (!active) return;

        if (offersRes.error) {
          throw new Error(offersRes.error.message || 'Unable to load active offers.');
        }

        const map: Record<string, OfferRow> = {};
        for (const row of (offersRes.data || []) as any[]) {
          map[String(row.key)] = {
            key: String(row.key),
            title: String(row.title || ''),
            body_md: String(row.body_md || ''),
            target_tier: String(row.target_tier || ''),
          };
        }

        setOfferMap(map);
      } catch (e: any) {
        if (active) {
          setError(String(e?.message || e));
        }
      } finally {
        if (active) setLoading(false);
      }
    }

    void load();

    return () => {
      active = false;
    };
  }, [user?.id]);

  const currentOfferInbox = useMemo(() => {
    const preferred = inboxRows.find((row) => row.status === 'unseen');
    return preferred || inboxRows[0] || null;
  }, [inboxRows]);

  const currentOffer = useMemo(() => {
    if (!currentOfferInbox) return null;
    return offerMap[currentOfferInbox.offer_key] || null;
  }, [currentOfferInbox, offerMap]);

  if (!user || loading || !currentOfferInbox || !currentOffer) {
    return null;
  }

  async function handleDismiss() {
    if (!currentOfferInbox || busy) return;
    setBusy(true);
    try {
      await markOfferDismissed(currentOfferInbox.id);
      setInboxRows((prev) => prev.filter((row) => row.id !== currentOfferInbox.id));
    } catch {
      // no-op
    } finally {
      setBusy(false);
    }
  }

  async function handleUpgrade() {
    if (!currentOfferInbox || busy) return;

    setBusy(true);
    try {
      if (currentOfferInbox.status === 'unseen') {
        await markOfferSeen(currentOfferInbox.id);
      }
      await markOfferClicked(currentOfferInbox.id);
      onUpgrade();
    } catch {
      onUpgrade();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mb-4 rounded-2xl border border-cyan-500/30 bg-slate-900 p-4 text-slate-100">
      <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
        <div className="space-y-1">
          <p className="text-[11px] uppercase tracking-wider text-cyan-300">Offer</p>
          <h3 className="text-lg font-black text-white">{currentOffer.title}</h3>
          <p className="text-sm text-slate-300">{normalizeString(currentOffer.body_md)}</p>
          <p className="text-xs text-slate-500">Educational tools only. No guarantees of outcomes.</p>
          {error ? <p className="text-xs text-rose-300">{error}</p> : null}
        </div>

        <div className="flex gap-2 md:pl-4">
          <button
            type="button"
            onClick={() => void handleDismiss()}
            disabled={busy}
            className="rounded-xl border border-slate-600 px-3 py-2 text-xs font-black uppercase tracking-wider text-slate-200 disabled:opacity-60"
          >
            Dismiss
          </button>
          <button
            type="button"
            onClick={() => void handleUpgrade()}
            disabled={busy}
            className="rounded-xl bg-cyan-500 px-3 py-2 text-xs font-black uppercase tracking-wider text-slate-950 disabled:opacity-60"
          >
            Upgrade
          </button>
        </div>
      </div>
    </div>
  );
}
