
import React from 'react';
import { ViewMode } from '../types';
import { 
  LayoutGrid, Globe, Users, ShieldCheck, Mail, Zap, 
  Phone, Mic, Target, Briefcase, RefreshCw, FileText, 
  Settings, CreditCard, Star, PieChart, GraduationCap,
  ArrowRight, Search, Layout, Crown, WalletCards, Workflow, Server, Calendar, Rocket, Gift, ShieldAlert
} from 'lucide-react';

interface SystemSitemapProps {
  onNavigate: (view: ViewMode) => void;
}

const SystemSitemap: React.FC<SystemSitemapProps> = ({ onNavigate }) => {
  const categories = [
    {
      title: 'Public Pages (Marketing)',
      color: 'text-blue-600',
      items: [
        { id: ViewMode.LANDING, label: 'Main Marketing Site', desc: 'SaaS-style landing page for brokers.', icon: Globe },
        { id: ViewMode.CLIENT_LANDING, label: 'Client Landing Page', desc: 'Consumer-focused funding portal entry.', icon: Globe },
        { id: ViewMode.LOGIN, label: 'Auth: Login', desc: 'Secure entrance for Admins and Clients.', icon: Users },
        { id: ViewMode.SIGNUP, label: 'Auth: Registration', desc: 'Self-onboarding for new leads.', icon: ArrowRight },
      ]
    },
    {
      title: 'Command',
      color: 'text-indigo-600',
      items: [
        { id: ViewMode.DASHBOARD, label: 'Dashboard', desc: 'Operational home for day-to-day review.', icon: LayoutGrid },
        { id: ViewMode.INBOX, label: 'Inbox', desc: 'Communication review and next steps.', icon: Mail },
        { id: ViewMode.ADMIN_CEO_BRIEFING, label: 'Founder Briefing', desc: 'CEO review layer for blockers and approvals.', icon: Crown },
      ]
    },
    {
      title: 'Operations',
      color: 'text-emerald-600',
      items: [
        { id: ViewMode.CRM, label: 'Clients', desc: 'Active client accounts and readiness states.', icon: Users },
        { id: ViewMode.FUNDING_FLOW, label: 'Funding', desc: 'Readiness, pipeline, outcomes, and billing triggers.', icon: WalletCards },
        { id: ViewMode.REVIEW_QUEUE, label: 'Approvals', desc: 'Decision queue for documents, applications, and exceptions.', icon: ShieldCheck },
        { id: ViewMode.SUPERVISOR_TRIAGE, label: 'Alerts', desc: 'Escalations and items needing attention.', icon: ShieldAlert },
        { id: ViewMode.DOCUMENTS, label: 'Documents', desc: 'Uploaded, approved, generated, archived.', icon: FileText },
        { id: ViewMode.GRANTS, label: 'Grants', desc: 'Grant discovery and application support.', icon: Gift },
      ]
    },
    {
      title: 'Growth',
      color: 'text-orange-600',
      items: [
        { id: ViewMode.LEAD_SCOUT, label: 'Opportunities', desc: 'Found leads, fit, and pursuit status.', icon: Search },
        { id: ViewMode.POWER_DIALER, label: 'Outreach', desc: 'Outbound follow-up and contact work.', icon: Phone },
      ]
    },
    {
      title: 'AI',
      color: 'text-purple-600',
      items: [
        { id: ViewMode.ADMIN_SUPER_ADMIN_COMMAND_CENTER, label: 'AI Employees', desc: 'Named employees, runtime services, and stored reports.', icon: Workflow },
        { id: ViewMode.KNOWLEDGE_HUB, label: 'Learning Center', desc: 'Approved training, SOPs, and walkthroughs.', icon: GraduationCap },
      ]
    },
    {
      title: 'System',
      color: 'text-slate-600',
      items: [
        { id: ViewMode.ADMIN_CONTROL_PLANE, label: 'Platform', desc: 'System control, flags, and operational safety.', icon: Server },
        { id: ViewMode.BILLING, label: 'Billing', desc: 'Revenue, plans, and subscription controls.', icon: CreditCard },
      ]
    },
    {
      title: 'Advanced',
      color: 'text-cyan-700',
      items: [
        { id: ViewMode.CALENDAR, label: 'Calendar', desc: 'Deadlines, due dates, and follow-ups.', icon: Calendar },
        { id: ViewMode.SCENARIO_RUNNER, label: 'Simulations', desc: 'Advanced experiments and scenario testing.', icon: Rocket },
      ]
    }
  ];

  return (
    <div className="max-w-6xl mx-auto pb-20 animate-fade-in">
      <div className="mb-10 text-center">
        <h1 className="text-4xl font-black text-slate-900 mb-4 tracking-tight">Nexus Journey Map</h1>
        <p className="text-slate-500 max-w-2xl mx-auto text-lg leading-relaxed">
            A simplified map of the client journey, admin command layers, and advanced system surfaces.
        </p>
      </div>

      <div className="space-y-12">
        {categories.map((cat, idx) => (
          <div key={idx} className="space-y-6">
            <h2 className={`text-xl font-black uppercase tracking-widest ${cat.color} border-b-2 border-slate-100 pb-2`}>
              {cat.title}
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {cat.items.map((item) => {
                const Icon = item.icon;
                return (
                  <div 
                    key={item.id}
                    onClick={() => onNavigate(item.id)}
                    className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm hover:shadow-xl hover:border-blue-300 transition-all cursor-pointer group flex flex-col"
                  >
                    <div className="flex items-center gap-4 mb-4">
                      <div className={`p-3 rounded-xl bg-slate-50 ${cat.color} group-hover:scale-110 transition-transform`}>
                          <Icon size={24} />
                      </div>
                      <h3 className="font-bold text-slate-900 group-hover:text-blue-600 transition-colors">
                          {item.label}
                      </h3>
                    </div>
                    <p className="text-sm text-slate-500 leading-relaxed flex-1">
                      {item.desc}
                    </p>
                    <div className="mt-4 pt-4 border-t border-slate-50 flex items-center justify-between">
                      <span className="text-[10px] font-mono font-bold text-slate-300 uppercase tracking-widest">{item.id}</span>
                      <button className="text-xs font-bold text-blue-600 flex items-center gap-1 group-hover:translate-x-1 transition-transform">
                          Launch View <ArrowRight size={12}/>
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default SystemSitemap;
