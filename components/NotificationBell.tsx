
import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '../lib/supabaseClient';
import { Bell, Info, X, Zap, AlertTriangle, TrendingUp, DollarSign } from 'lucide-react';
import { AuditLogEntry } from '../types';

const NotificationBell: React.FC = () => {
  const [notifications, setNotifications] = useState<AuditLogEntry[]>([]);
  const [hasUnread, setHasUnread] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const fetchInitialLogs = async () => {
    const { data, error } = await supabase
      .from('audit_logs')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(8);

    if (!error && data) {
      setNotifications(data);
    }
  };

  useEffect(() => {
    fetchInitialLogs();

    const channel = supabase
      .channel('audit_logs_sentinel')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'audit_logs' },
        (payload) => {
          const newLog = payload.new as AuditLogEntry;
          const magnitude = newLog.meta?.magnitude || 0;
          
          setNotifications(prev => [newLog, ...prev].slice(0, 10));
          setHasUnread(true);

          if (magnitude >= 100000) {
             // Audio alert could be triggered here for high magnitude
             console.warn("CRITICAL: HIGH MAGNITUDE DETECTED", magnitude);
          }
        }
      )
      .subscribe();

    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      supabase.removeChannel(channel);
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  const toggleDropdown = () => {
    setIsOpen(!isOpen);
    if (!isOpen) setHasUnread(false);
  };

  return (
    <div className="relative" ref={dropdownRef}>
      <button 
        onClick={toggleDropdown}
        className={`p-2.5 rounded-xl bg-white/5 border border-white/10 text-slate-400 hover:bg-[#66FCF1]/10 hover:text-[#66FCF1] hover:border-[#66FCF1]/30 transition-all relative group shadow-inner ${hasUnread ? 'animate-pulse' : ''}`}
      >
        <Bell size={20} className="group-hover:rotate-12 transition-transform" />
        {hasUnread && (
          <span className="absolute top-2 right-2 w-2.5 h-2.5 bg-red-500 rounded-full border-2 border-[#0B0C10] animate-pulse shadow-[0_0_10px_rgba(239,68,68,0.8)]"></span>
        )}
      </button>

      {isOpen && (
        <div className="absolute right-0 mt-4 w-[400px] bg-[#0B0C10] rounded-[2rem] shadow-[0_30px_100px_rgba(0,0,0,0.9)] border border-white/10 overflow-hidden z-[100] animate-fade-in ring-1 ring-[#66FCF1]/20">
          <div className="p-6 border-b border-white/5 bg-[#1F2833]/40 backdrop-blur-xl flex justify-between items-center">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-[#66FCF1]/10 rounded-xl text-[#66FCF1] border border-[#66FCF1]/20">
                <Zap size={16} fill="currentColor" className="animate-pulse" />
              </div>
              <div>
                <h3 className="text-[11px] font-black text-white uppercase tracking-[0.2em] leading-none">Intelligence Feed</h3>
                <p className="text-[8px] font-black text-[#66FCF1] uppercase tracking-[0.1em] mt-1.5 opacity-60">Sentinel monitoring active</p>
              </div>
            </div>
            <button onClick={() => setIsOpen(false)} className="p-2 text-slate-600 hover:text-white transition-colors bg-white/5 rounded-xl">
              <X size={16} />
            </button>
          </div>

          <div className="max-h-[500px] overflow-y-auto custom-scrollbar bg-black/20">
            {notifications.length === 0 ? (
              <div className="p-20 text-center opacity-20">
                <span className="text-[10px] font-black uppercase text-slate-400 tracking-[0.3em]">Telemetry Inactive</span>
              </div>
            ) : (
              notifications.map((log) => {
                const magnitude = log.meta?.magnitude || 0;
                const isHighValue = magnitude >= 100000;
                
                return (
                  <div key={log.id} className={`p-6 border-b border-white/5 transition-all relative overflow-hidden group ${isHighValue ? 'bg-red-500/5 border-l-4 border-l-red-600 animate-critical-glow' : 'hover:bg-white/5 border-l-4 border-l-transparent'}`}>
                    <div className="flex justify-between items-start mb-3 relative z-10">
                      <div className="flex flex-col">
                        <span className={`text-[10px] font-black uppercase tracking-wider mb-1 ${isHighValue ? 'text-red-400' : 'text-[#66FCF1]'}`}>
                          {log.action.replace(/_/g, ' ')}
                        </span>
                        <div className="flex items-center gap-2">
                           <span className="text-[9px] font-bold text-slate-500 uppercase tracking-widest">{log.entity_type}</span>
                           <span className="text-[8px] text-slate-700 font-mono">:: {log.id.split('-')[0]}</span>
                        </div>
                      </div>
                      <span className="text-[9px] font-mono text-slate-600 whitespace-nowrap pt-0.5">
                        {new Date(log.created_at).toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>

                    {isHighValue && (
                        <div className="relative z-10 flex flex-col gap-3 mt-4 bg-red-600/10 p-4 rounded-2xl border border-red-500/20">
                            <div className="flex items-center justify-between">
                                <span className="text-[9px] font-black bg-red-600 text-white px-3 py-1 rounded-full uppercase tracking-widest shadow-[0_0_15px_rgba(239,68,68,0.4)]">HIGH MAGNITUDE</span>
                                <DollarSign size={14} className="text-red-500" />
                            </div>
                            <div className="flex items-baseline gap-2">
                                <span className="text-2xl font-black text-white tracking-tighter">${Number(magnitude).toLocaleString()}</span>
                            </div>
                            <button className="w-full py-2 bg-red-600/20 hover:bg-red-600 text-white rounded-lg text-[9px] font-black uppercase tracking-widest transition-all border border-red-500/30">
                                Launch Triage
                            </button>
                        </div>
                    )}
                    
                    {!isHighValue && (
                        <div className="mt-2 text-xs text-slate-400 font-medium leading-relaxed italic relative z-10">
                            Protocol synchronized successfully. Node updated.
                        </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default NotificationBell;
