
import React, { useState, useEffect, useRef } from 'react';
import { Search, User, FileText, ArrowRight, LayoutDashboard, Settings, Users, Mail, Phone, Briefcase, WalletCards, Gift, Workflow, Server, CreditCard, Calendar, Rocket, Sparkles, ShieldCheck } from 'lucide-react';
import { Contact, ViewMode } from '../types';

interface CommandPaletteProps {
  isOpen: boolean;
  onClose: () => void;
  contacts: Contact[];
  onNavigate: (view: ViewMode) => void;
  onSelectContact: (contact: Contact) => void;
}

interface CommandItem {
  id: string;
  icon: React.ReactNode;
  label: string;
  subLabel?: string;
  action: () => void;
}

const CommandPalette: React.FC<CommandPaletteProps> = ({ isOpen, onClose, contacts, onNavigate, onSelectContact }) => {
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  // Focus input when opened
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 50);
      setQuery('');
      setSelectedIndex(0);
    }
  }, [isOpen]);

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!isOpen) return;

      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex(prev => (prev < filteredResults.length - 1 ? prev + 1 : prev));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex(prev => (prev > 0 ? prev - 1 : 0));
      } else if (e.key === 'Enter') {
        e.preventDefault();
        if (filteredResults[selectedIndex]) {
          handleSelect(filteredResults[selectedIndex]);
        }
      } else if (e.key === 'Escape') {
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, selectedIndex, query]); // Re-bind when results change

  if (!isOpen) return null;

  const sections: { heading: string; items: CommandItem[] }[] = [
    {
      heading: 'Core Journey',
      items: [
        { id: 'act_dash', icon: <LayoutDashboard size={16} />, label: 'Dashboard', action: () => onNavigate(ViewMode.DASHBOARD) },
        { id: 'act_inbox', icon: <Mail size={16} />, label: 'Inbox', action: () => onNavigate(ViewMode.INBOX) },
        { id: 'act_founder', icon: <Sparkles size={16} />, label: 'Founder Briefing', action: () => onNavigate(ViewMode.ADMIN_CEO_BRIEFING) },
        { id: 'act_clients', icon: <Users size={16} />, label: 'Clients', action: () => onNavigate(ViewMode.CRM) },
        { id: 'act_funding', icon: <WalletCards size={16} />, label: 'Funding', action: () => onNavigate(ViewMode.FUNDING_FLOW) },
        { id: 'act_docs', icon: <FileText size={16} />, label: 'Documents', action: () => onNavigate(ViewMode.DOCUMENTS) },
        { id: 'act_approvals', icon: <ShieldCheck size={16} />, label: 'Approvals', action: () => onNavigate(ViewMode.REVIEW_QUEUE) },
        { id: 'act_grants', icon: <Gift size={16} />, label: 'Grants', action: () => onNavigate(ViewMode.GRANTS) },
        { id: 'act_library', icon: <FileText size={16} />, label: 'Learning Center', action: () => onNavigate(ViewMode.KNOWLEDGE_HUB) },
      ]
    },
    {
      heading: 'Operations & Systems',
      items: [
        { id: 'tool_ops', icon: <Search size={16} />, label: 'Opportunities', action: () => onNavigate(ViewMode.LEAD_SCOUT) },
        { id: 'tool_outreach', icon: <Phone size={16} />, label: 'Outreach', action: () => onNavigate(ViewMode.POWER_DIALER) },
        { id: 'tool_ai', icon: <Workflow size={16} />, label: 'AI Employees', action: () => onNavigate(ViewMode.ADMIN_SUPER_ADMIN_COMMAND_CENTER) },
        { id: 'tool_platform', icon: <Server size={16} />, label: 'Platform', action: () => onNavigate(ViewMode.ADMIN_CONTROL_PLANE) },
        { id: 'tool_billing', icon: <CreditCard size={16} />, label: 'Billing', action: () => onNavigate(ViewMode.BILLING) },
        { id: 'tool_calendar', icon: <Calendar size={16} />, label: 'Calendar', action: () => onNavigate(ViewMode.CALENDAR) },
        { id: 'tool_sim', icon: <Rocket size={16} />, label: 'Simulations', action: () => onNavigate(ViewMode.SCENARIO_RUNNER) },
        { id: 'tool_settings', icon: <Settings size={16} />, label: 'Settings', action: () => onNavigate(ViewMode.SETTINGS) },
      ]
    },
    {
      heading: 'Contacts',
      items: contacts.map(c => ({
        id: c.id,
        icon: <User size={16} />,
        label: c.name,
        subLabel: c.company,
        action: () => {
          onNavigate(ViewMode.CRM);
          onSelectContact(c);
        }
      }))
    }
  ];

  // Flatten and filter
  const filteredResults = sections.flatMap(section => 
    section.items.filter(item => 
      item.label.toLowerCase().includes(query.toLowerCase()) || 
      (item.subLabel && item.subLabel.toLowerCase().includes(query.toLowerCase()))
    ).map(item => ({ ...item, heading: section.heading }))
  );

  const handleSelect = (item: any) => {
    item.action();
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[100] bg-black/50 backdrop-blur-sm flex items-start justify-center pt-[15vh] px-4 animate-fade-in" onClick={onClose}>
      <div 
        className="bg-white w-full max-w-2xl rounded-xl shadow-2xl overflow-hidden border border-slate-200 flex flex-col max-h-[60vh]"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 px-4 py-4 border-b border-slate-100">
          <Search className="text-slate-400" size={20} />
          <input
            ref={inputRef}
            type="text"
            placeholder="Type a command or search..."
            className="flex-1 text-lg bg-transparent border-none focus:ring-0 outline-none text-slate-800 placeholder-slate-400"
            value={query}
            onChange={e => { setQuery(e.target.value); setSelectedIndex(0); }}
          />
          <div className="flex gap-1">
            <kbd className="hidden sm:inline-block px-2 py-0.5 bg-slate-100 border border-slate-300 rounded text-xs font-mono text-slate-500">ESC</kbd>
          </div>
        </div>

        <div className="overflow-y-auto p-2 custom-scrollbar">
          {filteredResults.length === 0 ? (
            <div className="py-8 text-center text-slate-400 text-sm">No results found.</div>
          ) : (
            filteredResults.map((item, idx) => (
              <div
                key={`${item.id}_${idx}`}
                onClick={() => handleSelect(item)}
                className={`flex items-center justify-between px-4 py-3 rounded-lg cursor-pointer transition-colors ${
                  idx === selectedIndex ? 'bg-blue-50 text-blue-700' : 'text-slate-700 hover:bg-slate-50'
                }`}
              >
                <div className="flex items-center gap-3">
                  <div className={`w-8 h-8 rounded-md flex items-center justify-center ${
                    idx === selectedIndex ? 'bg-blue-100 text-blue-600' : 'bg-slate-100 text-slate-500'
                  }`}>
                    {item.icon}
                  </div>
                  <div>
                    <div className="font-medium text-sm">{item.label}</div>
                    {item.subLabel && <div className="text-xs opacity-70">{item.subLabel}</div>}
                  </div>
                </div>
                {idx === selectedIndex && <ArrowRight size={16} className="text-blue-500" />}
              </div>
            ))
          )}
        </div>
        
        <div className="bg-slate-50 px-4 py-2 border-t border-slate-100 text-[10px] text-slate-400 flex justify-between">
           <span><strong>Pro Tip:</strong> Use arrow keys to navigate</span>
           <span>Nexus OS v2.5</span>
        </div>
      </div>
    </div>
  );
};

export default CommandPalette;
