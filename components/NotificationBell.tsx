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
    if (n.severity === 'danger') return <AlertTriangle size={16} className="text-red-400" />;
    if (n.severity === 'warn') return <AlertTriangle size={16} className="text-amber-300" />;
    return <Info size={16} className="text-[#66FCF1]" />;
  };

  if (!user) return null;

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={toggleDropdown}
        className={`p-2.5 rounded-xl bg-white/5 border border-white/10 text-slate-400 hover:bg-[#66FCF1]/10 hover:text-[#66FCF1] hover:border-[#66FCF1]/30 transition-all relative group shadow-inner ${
          hasUnread ? 'animate-pulse' : ''
        }`}
        title="Notifications"
      >
        <Bell size={20} className="group-hover:rotate-12 transition-transform" />
        {hasUnread && (
          <span className="absolute top-2 right-2 w-2.5 h-2.5 bg-red-500 rounded-full border-2 border-[#0B0C10] animate-pulse shadow-[0_0_10px_rgba(239,68,68,0.8)]" />
        )}
      </button>

      {isOpen && (
        <div className="absolute right-0 mt-4 w-[420px] bg-[#0B0C10] rounded-[2rem] shadow-[0_30px_100px_rgba(0,0,0,0.9)] border border-white/10 overflow-hidden z-[100] animate-fade-in ring-1 ring-[#66FCF1]/20">
          <div className="p-6 border-b border-white/5 bg-[#1F2833]/40 backdrop-blur-xl flex justify-between items-center">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-[#66FCF1]/10 rounded-xl text-[#66FCF1] border border-[#66FCF1]/20">
                <Zap size={16} fill="currentColor" className="animate-pulse" />
              </div>
              <div>
                <h3 className="text-[11px] font-black text-white uppercase tracking-[0.2em] leading-none">Notifications</h3>
                <p className="text-[8px] font-black text-[#66FCF1] uppercase tracking-[0.1em] mt-1.5 opacity-60">Tasks + status events</p>
              </div>
            </div>
            <button onClick={() => setIsOpen(false)} className="p-2 text-slate-600 hover:text-white transition-colors bg-white/5 rounded-xl">
              <X size={16} />
            </button>
          </div>

          <div className="max-h-[520px] overflow-y-auto custom-scrollbar bg-black/20">
            {notifications.length === 0 ? (
              <div className="p-20 text-center opacity-20">
                <span className="text-[10px] font-black uppercase text-slate-400 tracking-[0.3em]">No notifications</span>
              </div>
            ) : (
              notifications.map((n) => (
                <button
                  key={n.id}
                  onClick={() => markRead(n)}
                  className={`w-full text-left p-6 border-b border-white/5 transition-all hover:bg-white/5 ${
                    n.read ? 'opacity-60' : ''
                  }`}
                  title={n.read ? 'Read' : 'Mark read'}
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex items-start gap-3">
                      <div className="mt-0.5">{iconFor(n)}</div>
                      <div>
                        <div className="text-[10px] font-black uppercase tracking-widest text-white">{n.title}</div>
                        <div className="mt-2 text-xs text-slate-400 leading-relaxed">{n.message}</div>
                        <div className="mt-3 text-[9px] font-mono text-slate-600">
                          {new Date(n.created_at).toLocaleString([], { hour12: false })}
                        </div>
                      </div>
                    </div>
                    {!n.read ? <span className="mt-1 w-2 h-2 bg-[#66FCF1] rounded-full" /> : null}
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
