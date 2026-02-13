
import React from 'react';
import { ViewMode } from '../types';
import { 
  LayoutGrid, Globe, Users, ShieldCheck, Mail, Zap, 
  Phone, Mic, Target, Briefcase, RefreshCw, FileText, 
  Settings, CreditCard, Star, PieChart, GraduationCap,
  ArrowRight, Search, Layout
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
      title: 'Admin Workspace',
      color: 'text-indigo-600',
      items: [
        { id: ViewMode.DASHBOARD, label: 'Executive Dashboard', desc: 'Daily metrics and AI briefings.', icon: LayoutGrid },
        { id: ViewMode.CRM, label: 'CRM Pipeline', desc: 'Deal tracking and contact management.', icon: Users },
        { id: ViewMode.INBOX, label: 'Unified Inbox', desc: 'Omnichannel communication center.', icon: Mail },
        { id: ViewMode.ADMIN_CMS, label: 'No-Code Site Builder', desc: 'Manage branding and landing content.', icon: Layout },
        { id: ViewMode.RESOURCES, label: 'Tools & Toolkit', desc: 'MCA Calcs and external link bank.', icon: Briefcase },
        { id: ViewMode.SETTINGS, label: 'System Settings', desc: 'Global config, team, and security.', icon: Settings },
      ]
    },
    {
        title: 'Sales & Marketing Ops',
        color: 'text-orange-600',
        items: [
          { id: ViewMode.POWER_DIALER, label: 'Power Dialer', desc: 'Auto-dialing lead queue with AI scripts.', icon: Phone },
          { id: ViewMode.SALES_TRAINER, label: 'AI Sales Coach', desc: 'Voice-based roleplay and training.', icon: Mic },
          { id: ViewMode.MARKETING, label: 'AI Campaigns', desc: 'Email automation and social video studio.', icon: Zap },
          { id: ViewMode.LEAD_MAP, label: 'Lead Scout', icon: Search, desc: 'Geo-intelligence territory search.' },
          { id: ViewMode.FORM_BUILDER, label: 'Form Builder', desc: 'Drag-and-drop lead capture forms.', icon: FileText },
          { id: ViewMode.REPUTATION, label: 'Reputation Manager', desc: 'Google review automation and shield.', icon: Star },
        ]
      },
      {
        title: 'Underwriting & Capital',
        color: 'text-emerald-600',
        items: [
          { id: ViewMode.LENDERS, label: 'Lender Marketplace', desc: 'Manage rate sheets and partner rules.', icon: Briefcase },
          { id: ViewMode.REVIEW_QUEUE, label: 'Compliance Queue', desc: 'Verify client docs and ID items.', icon: ShieldCheck },
          { id: ViewMode.DOC_GENERATOR, label: 'Doc Generator', desc: 'AI-assisted NDAs and legal forms.', icon: FileText },
          { id: ViewMode.SERVICING, label: 'Loan Servicing', desc: 'Portfolio yields and collections assistant.', icon: Briefcase },
          { id: ViewMode.SYNDICATION, label: 'Syndication Manager', desc: 'Investor splits and deployed AUM.', icon: PieChart },
          { id: ViewMode.CREDIT_MEMO, label: 'Credit Memo Builder', desc: 'Formal loan packets for lenders.', icon: FileText },
        ]
      },
      {
        title: 'Client Experience',
        color: 'text-purple-600',
        items: [
          { id: ViewMode.PORTAL, label: 'Client Portal', desc: 'The dashboard your borrower sees.', icon: ShieldCheck },
          { id: ViewMode.COURSE_BUILDER, label: 'LMS Builder', desc: 'Build client training courses.', icon: GraduationCap },
          { id: ViewMode.GRANTS, label: 'Grant Manager', desc: 'AI discovery of free capital.', icon: Star },
        ]
      }
  ];

  return (
    <div className="max-w-6xl mx-auto pb-20 animate-fade-in">
      <div className="mb-10 text-center">
        <h1 className="text-4xl font-black text-slate-900 mb-4 tracking-tight">System Sitemap & View Reviewer</h1>
        <p className="text-slate-500 max-w-2xl mx-auto text-lg leading-relaxed">
            Quickly navigate every view in the Nexus OS ecosystem. Use this for testing, 
            auditing, and verifying the platform's comprehensive feature set.
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
