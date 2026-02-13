
import React, { useState } from 'react';
import { Search, Globe, Building2, User, Phone, DollarSign, Newspaper, CheckCircle, ArrowRight, Loader, Sparkles, X } from 'lucide-react';
import { EnrichedData, Contact } from '../types';
import * as geminiService from '../services/geminiService';

interface LeadEnrichmentModalProps {
  onClose: () => void;
  onCreateLead: (lead: Partial<Contact>) => void;
  existingName?: string;
}

const LeadEnrichmentModal: React.FC<LeadEnrichmentModalProps> = ({ onClose, onCreateLead, existingName = '' }) => {
  const [companyName, setCompanyName] = useState(existingName);
  const [website, setWebsite] = useState('');
  const [isScanning, setIsScanning] = useState(false);
  const [result, setResult] = useState<EnrichedData | null>(null);

  const handleScan = async () => {
    if (!companyName) return;
    setIsScanning(true);
    setResult(null);
    try {
      const data = await geminiService.enrichLeadData(companyName, website);
      setResult(data);
    } catch (e) { console.error(e); } finally { setIsScanning(false); }
  };

  const handleConfirm = () => {
    if (!result) return;
    onCreateLead({
      name: result.ceo || 'Decision Maker', 
      company: result.company || companyName,
      phone: result.phone || '',
      status: 'Lead',
      source: 'AI Scout',
      notes: `AI Scraped Dossier:\n${result.description}\n\nIcebreakers:\n${result.icebreakers.join('\n')}`,
      value: 0,
      businessProfile: {
        legalName: result.company,
        address: result.address || '',
        industry: result.industry || '',
        website: website,
        riskLevel: 'Low',
        taxId: '',
        structure: 'Sole Prop',
        ownershipPercentage: 100,
        establishedDate: '',
        city: '',
        state: '',
        zip: ''
      }
    });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-sm flex items-end md:items-center justify-center p-0 md:p-4 font-sans">
      <div className="bg-white w-full max-w-4xl rounded-t-2xl md:rounded-2xl shadow-2xl overflow-hidden flex flex-col h-[90vh] md:max-h-[90vh] border border-slate-200">
        <div className="bg-slate-950 p-6 flex justify-between items-center text-white border-b border-white/10">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-600 rounded-xl shadow-lg"><Sparkles size={24} className="text-white" /></div>
            <div>
              <h2 className="text-xl font-black uppercase tracking-tighter">Neural Intelligence Scraping</h2>
              <p className="text-blue-200 text-[10px] font-black uppercase tracking-widest">Protocol 1042-Enrichment</p>
            </div>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-white p-2 hover:bg-white/5 rounded-xl"><X size={24} /></button>
        </div>

        <div className="flex-1 flex flex-col md:flex-row overflow-hidden">
          <div className={`w-full md:w-1/3 bg-slate-50 p-6 border-b md:border-b-0 md:border-r border-slate-200 flex flex-col flex-shrink-0 ${result ? 'hidden md:flex' : 'flex'}`}>
            <div className="space-y-6">
              <div>
                <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2">Entity Name</label>
                <div className="relative"><Building2 className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} /><input type="text" value={companyName} onChange={e => setCompanyName(e.target.value)} placeholder="e.g. Acme Corp" className="w-full pl-9 pr-4 py-3 border border-slate-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 font-bold" /></div>
              </div>
              <div>
                <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2">Domain</label>
                <div className="relative"><Globe className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} /><input type="text" value={website} onChange={e => setWebsite(e.target.value)} placeholder="e.g. acme.com" className="w-full pl-9 pr-4 py-3 border border-slate-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 font-bold" /></div>
              </div>
              <button onClick={handleScan} disabled={isScanning || !companyName} className="w-full bg-slate-950 text-white font-black uppercase text-xs tracking-widest py-4 rounded-xl hover:bg-slate-900 transition-all shadow-xl flex items-center justify-center gap-2 disabled:opacity-50">{isScanning ? <Loader size={18} className="animate-spin" /> : <Search size={18} />}{isScanning ? 'Scraping...' : 'Initiate Scan'}</button>
            </div>
            {isScanning && <div className="mt-12 text-center animate-pulse"><div className="inline-block relative w-16 h-16"><div className="absolute inset-0 border-4 border-blue-200 rounded-full"></div><div className="absolute inset-0 border-4 border-blue-600 rounded-full border-t-transparent animate-spin"></div></div><p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mt-6">Searching Google News & LinkedIn...</p></div>}
          </div>

          <div className={`w-full md:w-2/3 p-8 overflow-y-auto bg-white ${!result && !isScanning ? 'hidden md:block' : 'block'}`}>
            {!result && !isScanning && <div className="h-full flex flex-col items-center justify-center text-slate-300"><Globe size={80} className="mb-6 opacity-20" /><p className="text-sm font-black uppercase tracking-widest">Awaiting Command...</p></div>}
            {result && (
              <div className="space-y-8 animate-fade-in">
                <div><h3 className="text-3xl font-black text-slate-900 uppercase tracking-tighter">{result.company}</h3><p className="text-slate-500 mt-2 max-w-lg leading-relaxed font-medium">{result.description}</p></div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                   <div className="p-5 bg-slate-50 rounded-2xl border border-slate-100 shadow-inner"><div className="flex items-center gap-2 text-slate-400 text-[9px] font-black uppercase mb-3 tracking-widest"><User size={12}/> Leadership</div><div className="font-black text-slate-800 text-lg uppercase tracking-tight">{result.ceo || 'Verified via AI'}</div></div>
                   <div className="p-5 bg-slate-50 rounded-2xl border border-slate-100 shadow-inner"><div className="flex items-center gap-2 text-slate-400 text-[9px] font-black uppercase mb-3 tracking-widest"><DollarSign size={12}/> Estimated Revenue</div><div className="font-black text-emerald-600 text-lg tracking-tight">{result.revenue || 'Proprietary Estimate'}</div></div>
                </div>
                <div>
                  <h4 className="text-xs font-black text-slate-400 uppercase tracking-widest mb-4 flex items-center gap-2"><Newspaper size={16} className="text-blue-600" /> Strategic Icebreakers</h4>
                  {result.icebreakers.length > 0 ? (
                    <div className="space-y-3">{result.icebreakers.map((news, idx) => (
                        <div key={idx} className="flex gap-4 p-4 bg-blue-50/50 rounded-2xl border border-blue-100">
                           <div className="mt-1"><CheckCircle size={16} className="text-blue-600" /></div>
                           <p className="text-sm text-slate-700 font-medium leading-relaxed">{news}</p>
                        </div>
                      ))}</div>
                  ) : <p className="text-sm text-slate-400 italic">No news found.</p>}
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="p-6 border-t border-slate-100 bg-slate-50 flex justify-end gap-3 flex-shrink-0">
          <button onClick={onClose} className="px-6 py-2.5 rounded-xl text-slate-500 font-black uppercase text-[10px] tracking-widest hover:bg-slate-200">Abort</button>
          <button onClick={handleConfirm} disabled={!result} className="px-8 py-3 bg-blue-600 text-white font-black uppercase text-[10px] tracking-widest rounded-xl hover:bg-blue-700 shadow-xl shadow-blue-500/20 disabled:opacity-50 flex items-center gap-2 transition-all">Bridge to CRM <ArrowRight size={18} /></button>
        </div>
      </div>
    </div>
  );
};

export default LeadEnrichmentModal;
