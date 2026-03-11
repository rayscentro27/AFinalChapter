import React, { useEffect, useRef, useState } from 'react';
import { LogOut, User as UserIcon, Settings, UserCircle, ChevronDown, Shield } from 'lucide-react';
import NotificationBell from './NotificationBell';
import { useAuth } from '../contexts/AuthContext';

const roleLabel = (role: string) => {
  if (role === 'admin') return 'Master Admin';
  if (role === 'supervisor') return 'Supervisor';
  if (role === 'sales' || role === 'salesperson') return 'Sales';
  if (role === 'partner') return 'Partner';
  return 'User';
};

const UserHeader: React.FC = () => {
  const { user, signOut } = useAuth();
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsMenuOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  const handleSignOut = async () => {
    await signOut();
    window.location.hash = 'login';
  };

  const goToSettingsTab = (tabId: string) => {
    try {
      localStorage.setItem('nexus_settings_activeTab', tabId);
    } catch (e) {
      // Ignore storage failures (private mode, etc.)
    }

    window.location.hash = 'settings';

    // If Settings is already mounted, this switches tabs immediately.
    try {
      window.dispatchEvent(new CustomEvent('nexus:settings-tab', { detail: tabId }));
    } catch (e) {
      // No-op
    }
  };

  if (!user) return null;

  return (
    <header className="flex justify-between items-center px-6 py-3 bg-[#0B0C10] border-b border-[#66FCF1]/20 w-full animate-fade-in relative z-[100]">
      <div className="flex items-center gap-6">
        <div className="flex flex-col items-start">
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-black text-[#66FCF1] uppercase tracking-wider">{user.email?.split('@')[0]}</span>
            <span className="text-[8px] px-1.5 py-0.5 rounded bg-[#66FCF1]/10 text-[#66FCF1] border border-[#66FCF1]/30 font-black uppercase tracking-widest">
              {roleLabel(user.role)}
            </span>
          </div>
          <div className="flex items-center gap-1.5 mt-1">
            <Shield size={10} className="text-slate-500" />
            <span className="text-[8px] font-black text-slate-500 uppercase tracking-widest leading-none">Identity Link Verified</span>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-6">
        <NotificationBell />

        <div className="h-8 w-px bg-white/10 mx-1"></div>

        <div className="relative" ref={menuRef}>
          <button
            onClick={() => setIsMenuOpen(!isMenuOpen)}
            className="flex items-center gap-3 group outline-none bg-white/5 hover:bg-white/10 px-3 py-2 rounded-2xl border border-white/5 transition-all"
          >
            <div className="w-8 h-8 rounded-xl bg-[#66FCF1] text-slate-950 flex items-center justify-center shadow-[0_0_15px_rgba(102,252,241,0.3)] transform group-hover:scale-105 transition-all">
              <UserIcon size={16} />
            </div>
            <div className="flex flex-col items-start">
              <span className="text-[10px] font-black text-white uppercase tracking-tighter leading-none">Account</span>
              <ChevronDown
                size={10}
                className={`text-[#66FCF1] transition-transform duration-300 mt-0.5 ${isMenuOpen ? 'rotate-180' : ''}`}
              />
            </div>
          </button>

          {isMenuOpen && (
            <div className="absolute right-0 mt-3 w-64 bg-[#1F2833] rounded-2xl shadow-[0_30px_100px_rgba(0,0,0,0.8)] border border-[#66FCF1]/30 py-3 z-[200] animate-fade-in">
              <div className="px-5 py-3 border-b border-white/5 mb-2">
                <p className="text-[9px] font-black text-[#66FCF1] uppercase tracking-[0.2em] mb-1">Session Protocol</p>
                <p className="text-xs font-bold text-white truncate">{user.email}</p>
              </div>

              <button
                className="w-full flex items-center gap-3 px-5 py-3 text-xs font-bold text-slate-300 hover:bg-[#66FCF1]/10 hover:text-[#66FCF1] transition-all text-left uppercase tracking-widest"
                onClick={() => {
                  setIsMenuOpen(false);
                  goToSettingsTab('general');
                }}
              >
                <UserCircle size={16} /> Identity Profile
              </button>

              <button
                className="w-full flex items-center gap-3 px-5 py-3 text-xs font-bold text-slate-300 hover:bg-[#66FCF1]/10 hover:text-[#66FCF1] transition-all text-left uppercase tracking-widest"
                onClick={() => {
                  setIsMenuOpen(false);
                  goToSettingsTab('connectivity');
                }}
              >
                <Settings size={16} /> OS Parameters
              </button>

              <div className="h-px bg-white/5 my-2"></div>

              <button
                onClick={handleSignOut}
                className="w-full flex items-center gap-3 px-5 py-3 text-xs font-black uppercase tracking-widest text-red-400 hover:bg-red-400/10 transition-all text-left"
              >
                <LogOut size={16} /> Terminate Session
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
};

export default UserHeader;
