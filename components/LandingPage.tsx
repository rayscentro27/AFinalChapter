
import React from 'react';
import { Hexagon, ArrowRight, ShieldCheck, Zap, BarChart3, Globe, CheckCircle, Star, Sparkles, Layout, Users, Smartphone, MapPin, Phone, Mail } from 'lucide-react';
import { ViewMode, AgencyBranding } from '../types';

interface LandingPageProps {
  onNavigate: (view: ViewMode) => void;
  branding: AgencyBranding;
}

const LandingPage: React.FC<LandingPageProps> = ({ onNavigate, branding }) => {
  return (
    <div className="min-h-screen bg-white font-sans text-slate-900 scroll-smooth">
      
      {/* Navigation */}
      <nav className="fixed w-full z-50 bg-white/90 backdrop-blur-md border-b border-slate-100 transition-all">
        <div className="max-w-7xl mx-auto px-6 h-16 flex justify-between items-center">
          <div className="flex items-center gap-2 cursor-pointer group" onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}>
            <div className="bg-blue-600 p-1.5 rounded-lg group-hover:scale-110 transition-transform" style={{ backgroundColor: branding.primaryColor }}>
              <Hexagon className="text-white fill-white/20" size={20} />
            </div>
            <span className="text-xl font-bold tracking-tight">{branding.name || 'Nexus'}<span className="text-blue-600" style={{ color: branding.primaryColor }}>CRM</span></span>
          </div>
          <div className="hidden md:flex gap-8 text-sm font-medium text-slate-600 items-center">
            <a href="#features" className="hover:text-blue-600 transition-colors">Features</a>
            <a href="#solutions" className="hover:text-blue-600 transition-colors">Solutions</a>
            <a href="#pricing" className="hover:text-blue-600 transition-colors">Pricing</a>
          </div>
          <div className="flex gap-3">
            <button 
              onClick={() => onNavigate(ViewMode.LOGIN)}
              className="px-4 py-2 text-sm font-bold text-slate-700 hover:text-slate-900 transition-colors"
            >
              Sign In
            </button>
            <button 
              onClick={() => onNavigate(ViewMode.SIGNUP)}
              className="px-5 py-2 text-sm font-bold bg-slate-900 text-white rounded-lg hover:opacity-90 transition-all shadow-lg"
              style={{ backgroundColor: branding.primaryColor }}
            >
              Get Started
            </button>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <header className="pt-32 pb-20 px-6 relative overflow-hidden bg-slate-50">
        <div className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
          <div className="relative z-10 animate-fade-in text-left">
            <div className="inline-flex items-center gap-2 bg-blue-50 text-blue-700 px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider mb-6 border border-blue-100">
              <Sparkles size={14} className="animate-pulse" /> The Future of Sales Ops
            </div>
            <h1 className="text-5xl md:text-7xl font-black leading-tight mb-6 tracking-tight">
              {branding.heroHeadline || "The Operating System for Business Funding."}
            </h1>
            <p className="text-lg text-slate-500 mb-8 leading-relaxed max-w-lg">
              {branding.heroSubheadline || "Consolidate your CRM, Dialer, and Underwriting into one AI platform."}
            </p>
            <div className="flex flex-col sm:flex-row gap-4">
              <button 
                onClick={() => onNavigate(ViewMode.SIGNUP)}
                className="px-8 py-4 bg-blue-600 text-white rounded-xl font-bold text-lg hover:opacity-90 shadow-xl transition-all flex items-center justify-center gap-2 transform hover:-translate-y-1"
                style={{ backgroundColor: branding.primaryColor }}
              >
                Launch Your Workspace <ArrowRight size={20} />
              </button>
              <button 
                onClick={() => onNavigate(ViewMode.LOGIN)}
                className="px-8 py-4 bg-white border border-slate-200 text-slate-700 rounded-xl font-bold text-lg hover:bg-slate-50 transition-all flex items-center justify-center gap-2"
              >
                Client Login
              </button>
            </div>
          </div>
          
          <div className="relative animate-slide-in-right hidden lg:block">
            <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 p-2 overflow-hidden transform rotate-1">
               <img src="https://images.unsplash.com/photo-1460925895917-afdab827c52f?q=80&w=2426&auto=format&fit=crop" alt="Dashboard" className="rounded-xl w-full" />
            </div>
          </div>
        </div>
      </header>

      {/* Features Grid */}
      <section id="features" className="py-24">
        <div className="max-w-7xl mx-auto px-6">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-black text-slate-900 mb-4">Unified Tools for Closing Teams</h2>
            <p className="text-slate-500 max-w-2xl mx-auto text-lg">Stop juggling tabs. Nexus CRM brings everything under one roof.</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            <FeatureCard 
              icon={<Zap size={32} className="text-amber-500" />}
              title="Automated Pipelines"
              desc="Intelligent lead routing and automated follow-ups based on deal status changes."
            />
            <FeatureCard 
              icon={<ShieldCheck size={32} className="text-emerald-500" />}
              title="Secure Client Portal"
              desc="Bank-grade document collection and transparent deal tracking for your clients."
            />
            <FeatureCard 
              icon={<Globe size={32} className="text-blue-500" />}
              title="Global Lead Search"
              desc="Real-time geo-intelligence to find and enrich new leads in any territory."
            />
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-slate-900 text-white py-20 px-6">
         <div className="max-w-7xl mx-auto grid grid-cols-1 md:grid-cols-4 gap-12 border-b border-white/10 pb-12">
            <div className="col-span-1 md:col-span-2">
               <div className="flex items-center gap-2 mb-6">
                  <div className="bg-blue-600 p-1 rounded" style={{ backgroundColor: branding.primaryColor }}>
                    <Hexagon size={14} className="text-white" />
                  </div>
                  <span className="text-xl font-bold tracking-tight">{branding.name}</span>
               </div>
               <p className="text-slate-400 max-w-sm mb-6">Empowering service-based agencies to scale through intelligent CRM automation and secure client engagement.</p>
               
               {/* Contact Vitals Display */}
               <div className="space-y-3 mt-8">
                  {branding.physicalAddress && (
                    <div className="flex items-start gap-3 text-xs text-slate-400">
                      <MapPin size={16} className="text-slate-500 shrink-0" />
                      <span>{branding.physicalAddress}</span>
                    </div>
                  )}
                  {branding.contactPhone && (
                    <div className="flex items-center gap-3 text-xs text-slate-400">
                      <Phone size={16} className="text-slate-500 shrink-0" />
                      <span>{branding.contactPhone}</span>
                    </div>
                  )}
                  {branding.contactEmail && (
                    <div className="flex items-center gap-3 text-xs text-slate-400">
                      <Mail size={16} className="text-slate-500 shrink-0" />
                      <span>{branding.contactEmail}</span>
                    </div>
                  )}
               </div>
            </div>
            <div>
               <h4 className="font-bold mb-4 uppercase text-xs tracking-widest text-slate-500">Product</h4>
               <ul className="text-slate-400 space-y-2 text-sm">
                  <li>Features</li>
                  <li>Client Portal</li>
                  <li>Admin CMS</li>
                  <li>Security</li>
               </ul>
            </div>
            <div>
               <h4 className="font-bold mb-4 uppercase text-xs tracking-widest text-slate-500">Legal</h4>
               <ul className="text-slate-400 space-y-2 text-sm">
                  <li>Privacy Policy</li>
                  <li>Terms of Service</li>
                  <li>Support</li>
               </ul>
            </div>
         </div>
         <div className="text-center text-slate-500 text-[10px] font-black uppercase tracking-[0.3em] mt-12">
            © 2024 {branding.name} • Nexus Intelligence OS
         </div>
      </footer>
    </div>
  );
};

const FeatureCard = ({ icon, title, desc }: any) => (
  <div className="bg-white p-8 rounded-2xl border border-slate-200 shadow-sm hover:shadow-xl transition-all">
     <div className="mb-6 bg-slate-50 w-16 h-16 rounded-xl flex items-center justify-center">{icon}</div>
     <h3 className="text-xl font-bold text-slate-900 mb-3">{title}</h3>
     <p className="text-slate-500 leading-relaxed text-sm">{desc}</p>
  </div>
);

export default LandingPage;
