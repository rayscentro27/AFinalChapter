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
    <header className="relative z-[100] flex items-center justify-between animate-fade-in subpixel-antialiased">
      <div className="flex items-center gap-2.5">
        <div className="flex flex-col items-start">
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-black uppercase tracking-[0.18em] text-[#36518E]">{user.email?.split('@')[0]}</span>
            <span className="rounded-full border border-[#E2EAF7] bg-[#F8FBFF] px-2.5 py-1 text-[8px] font-black uppercase tracking-[0.18em] text-[#627AA8]">
              {roleLabel(user.role)}
            </span>
          </div>
          <div className="mt-1 flex items-center gap-1.5">
            <Shield size={10} className="text-[#8FA1C0]" />
            <span className="text-[8px] font-black uppercase tracking-[0.18em] leading-none text-[#8A9ABC]">Identity Link Verified</span>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-2.5">
        <NotificationBell />

        <div className="mx-0.5 h-8 w-px bg-[#E5EBF6]"></div>

        <div className="relative" ref={menuRef}>
          <button
            onClick={() => setIsMenuOpen(!isMenuOpen)}
            className="group flex items-center gap-2.5 rounded-[1.05rem] border border-[#E2EAF7] bg-[linear-gradient(180deg,rgba(255,255,255,0.96)_0%,rgba(247,250,255,0.98)_100%)] px-2.5 py-2 outline-none shadow-[0_6px_18px_rgba(43,72,138,0.04)] transition-all hover:border-[#CAD7F1] hover:bg-white"
          >
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[linear-gradient(135deg,#6EA4FF,#7AD7D0)] text-white shadow-[0_8px_18px_rgba(80,128,233,0.16)] transition-all group-hover:scale-105">
              <UserIcon size={14} />
            </div>
            <div className="flex flex-col items-start">
              <span className="text-[10px] font-black uppercase tracking-[0.16em] leading-none text-[#22396F]">Account</span>
              <ChevronDown
                size={10}
                className={`mt-0.5 text-[#7A8DB7] transition-transform duration-300 ${isMenuOpen ? 'rotate-180' : ''}`}
              />
            </div>
          </button>

          {isMenuOpen && (
            <div className="absolute right-0 z-[200] mt-3 w-64 animate-fade-in rounded-[1.45rem] border border-[#DFE7F4] bg-[rgba(255,255,255,0.97)] py-3 shadow-[0_20px_46px_rgba(36,58,114,0.1)] backdrop-blur-xl">
              <div className="mb-2 border-b border-[#EEF3FB] px-5 py-3">
                <p className="mb-1 text-[9px] font-black uppercase tracking-[0.2em] text-[#6A84BC]">Session</p>
                <p className="truncate text-xs font-bold text-[#203266]">{user.email}</p>
              </div>

              <button
                className="flex w-full items-center gap-3 px-5 py-3 text-left text-xs font-bold uppercase tracking-[0.16em] text-[#526B9A] transition-all hover:bg-[#F4F8FF] hover:text-[#315FD0]"
                onClick={() => {
                  setIsMenuOpen(false);
                  goToSettingsTab('general');
                }}
              >
                <UserCircle size={16} /> Identity Profile
              </button>

              <button
                className="flex w-full items-center gap-3 px-5 py-3 text-left text-xs font-bold uppercase tracking-[0.16em] text-[#526B9A] transition-all hover:bg-[#F4F8FF] hover:text-[#315FD0]"
                onClick={() => {
                  setIsMenuOpen(false);
                  goToSettingsTab('connectivity');
                }}
              >
                <Settings size={16} /> OS Parameters
              </button>

              <div className="my-2 h-px bg-[#EEF3FB]"></div>

              <button
                onClick={handleSignOut}
                className="flex w-full items-center gap-3 px-5 py-3 text-left text-xs font-black uppercase tracking-[0.16em] text-red-500 transition-all hover:bg-red-50"
              >
                <LogOut size={16} /> Sign Out
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
};

export default UserHeader;
