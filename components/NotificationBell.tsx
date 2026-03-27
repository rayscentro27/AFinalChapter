import React, { useEffect, useRef, useState } from 'react';
import { Bell, X, Zap, AlertTriangle, Info } from 'lucide-react';
import { supabase } from '../lib/supabaseClient';
import { useAuth } from '../contexts/AuthContext';

type TenantNotification = {
  id: string;
  tenant_id: string;
  type: string;
  severity: 'info' | 'warn' | 'danger';
  title: string;
  message: string;
  read: boolean;
  created_at: string;
};

async function getAccessToken(): Promise<string | null> {
  const { data } = await supabase.auth.getSession();
  return data?.session?.access_token || null;
}

const NotificationBell: React.FC = () => {
  const { user } = useAuth();
  const [notifications, setNotifications] = useState<TenantNotification[]>([]);
  const [hasUnread, setHasUnread] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const fetchNotifications = async () => {
    const token = await getAccessToken();
    if (!token) return;

    const res = await fetch('/.netlify/functions/list_notifications?limit=8', {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!res.ok) return;
    const json = await res.json();
    const rows = (json?.notifications || []) as TenantNotification[];

    setNotifications(rows);
    setHasUnread(rows.some((n) => n.read === false));
  };

  useEffect(() => {
    if (!user) return;

    fetchNotifications();

    const interval = setInterval(fetchNotifications, 15000);

    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      clearInterval(interval);
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [user?.id]);

  const toggleDropdown = () => {
    setIsOpen(!isOpen);
    if (!isOpen) setHasUnread(false);
  };

  const markRead = async (n: TenantNotification) => {
    if (n.read) return;

    // Optimistic UI
    setNotifications((prev) => prev.map((x) => (x.id === n.id ? { ...x, read: true } : x)));

    const token = await getAccessToken();
    if (!token) return;

    await fetch('/.netlify/functions/mark_notification_read', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ notification_id: n.id }),
    });
  };

  const iconFor = (n: TenantNotification) => {
    if (n.severity === 'danger') return <AlertTriangle size={16} className="text-red-500" />;
    if (n.severity === 'warn') return <AlertTriangle size={16} className="text-amber-500" />;
    return <Info size={16} className="text-[#4A7AE8]" />;
  };

  if (!user) return null;

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={toggleDropdown}
        className={`group relative rounded-[1rem] border border-[#E2EAF7] bg-[linear-gradient(180deg,rgba(255,255,255,0.96)_0%,rgba(247,250,255,0.98)_100%)] p-2 text-[#6F84B0] shadow-[0_6px_18px_rgba(43,72,138,0.04)] transition-all hover:border-[#CAD7F1] hover:bg-white hover:text-[#315FD0] ${
          hasUnread ? 'animate-pulse' : ''
        }`}
        title="Notifications"
      >
        <Bell size={18} className="group-hover:rotate-12 transition-transform" />
        {hasUnread && (
          <span className="absolute right-2 top-2 h-2.5 w-2.5 animate-pulse rounded-full border-2 border-white bg-red-500 shadow-[0_0_10px_rgba(239,68,68,0.35)]" />
        )}
      </button>

      {isOpen && (
        <div className="absolute right-0 z-[100] mt-4 w-[420px] animate-fade-in overflow-hidden rounded-[1.55rem] border border-[#DEE7F6] bg-[rgba(255,255,255,0.97)] shadow-[0_20px_52px_rgba(36,58,114,0.1)] backdrop-blur-xl">
          <div className="flex items-center justify-between border-b border-[#EDF3FB] bg-[#FBFDFF] p-5 backdrop-blur-xl">
            <div className="flex items-center gap-3">
              <div className="rounded-[0.95rem] border border-[#DEE7F6] bg-[#F6FAFF] p-2 text-[#4A7AE8]">
                <Zap size={16} fill="currentColor" className="animate-pulse" />
              </div>
              <div>
                <h3 className="text-[11px] font-black uppercase tracking-[0.2em] leading-none text-[#203266]">Notifications</h3>
                <p className="mt-1.5 text-[8px] font-black uppercase tracking-[0.1em] text-[#6E84B2]">Tasks + status events</p>
              </div>
            </div>
            <button onClick={() => setIsOpen(false)} className="rounded-[0.95rem] bg-[#F4F8FF] p-2 text-[#7A8FBA] transition-colors hover:text-[#315FD0]">
              <X size={16} />
            </button>
          </div>

          <div className="max-h-[520px] overflow-y-auto bg-white custom-scrollbar">
            {notifications.length === 0 ? (
              <div className="p-20 text-center opacity-60">
                <span className="text-[10px] font-black uppercase tracking-[0.3em] text-slate-400">No notifications</span>
              </div>
            ) : (
              notifications.map((n) => (
                <button
                  key={n.id}
                  onClick={() => markRead(n)}
                  className={`w-full border-b border-[#EEF3FB] p-5 text-left transition-all hover:bg-[#F8FBFF] ${
                    n.read ? 'opacity-60' : ''
                  }`}
                  title={n.read ? 'Read' : 'Mark read'}
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex items-start gap-3">
                      <div className="mt-0.5">{iconFor(n)}</div>
                      <div>
                        <div className="text-[10px] font-black uppercase tracking-widest text-[#203266]">{n.title}</div>
                        <div className="mt-2 text-xs leading-relaxed text-[#60739A]">{n.message}</div>
                        <div className="mt-3 text-[9px] font-mono text-[#8B9DBF]">
                          {new Date(n.created_at).toLocaleString([], { hour12: false })}
                        </div>
                      </div>
                    </div>
                    {!n.read ? <span className="mt-1 h-2 w-2 rounded-full bg-[#4A7AE8]" /> : null}
                  </div>
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default NotificationBell;
