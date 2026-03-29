
import React from 'react';
import { CreditCard, Sparkles, CheckCircle, ArrowRight, ExternalLink, ShieldCheck, DollarSign, Info } from 'lucide-react';
import { Contact, CreditCardProduct } from '../types';

interface ClientCardSuggestionsProps {
  contact: Contact;
}

const CARD_DATABASE: CreditCardProduct[] = [
  { 
    id: 'cc_chase_ink_preferred', 
    name: 'Ink Business Preferred®', 
    issuer: 'Chase', 
    network: 'Visa', 
    minScore: 700, 
    bureauPulled: 'Experian', 
    annualFee: 95, 
    introOffer: '100,000 Points', 
    applicationLink: 'https://chase.com', 
    recommendedFor: 'Travel & Growth' 
  },
  { 
    id: 'cc_amex_gold', 
    name: 'American Express® Business Gold', 
    issuer: 'Amex', 
    network: 'Amex', 
    minScore: 680, 
    bureauPulled: 'Experian', 
    annualFee: 375, 
    introOffer: '70,000 Points', 
    applicationLink: 'https://amex.com', 
    recommendedFor: 'Advertising & Shipping' 
  },
  { 
    id: 'cc_cap1_spark', 
    name: 'Capital One Spark Cash Plus', 
    issuer: 'Capital One', 
    network: 'Mastercard', 
    minScore: 690, 
    bureauPulled: 'TransUnion', 
    annualFee: 150, 
    introOffer: '$1,200 Cash Back', 
    applicationLink: 'https://capitalone.com', 
    recommendedFor: 'Flat Rate Cash Back' 
  },
  { 
    id: 'cc_divvy', 
    name: 'BILL Divvy Corporate Card', 
    issuer: 'BILL', 
    network: 'Mastercard', 
    minScore: 600, 
    bureauPulled: 'Soft Pull', 
    annualFee: 0, 
    introOffer: 'High Limit Credit Line', 
    applicationLink: 'https://getdivvy.com', 
    recommendedFor: 'Expense Management' 
  },
  { 
    id: 'cc_ramp', 
    name: 'Ramp Corporate Card', 
    issuer: 'Ramp', 
    network: 'Visa', 
    minScore: 0, // Revenue based
    bureauPulled: 'No Credit Pull', 
    annualFee: 0, 
    introOffer: '1.5% Cash Back', 
    applicationLink: 'https://ramp.com', 
    recommendedFor: 'Revenue-Based Limits' 
  }
];

const ClientCardSuggestions: React.FC<ClientCardSuggestionsProps> = ({ contact }) => {
  const clientScore = contact.creditAnalysis?.score || 0;
  const clientRevenue = contact.revenue || 0;

  const matchedCards = CARD_DATABASE.filter(card => {
    if (card.minScore === 0) return clientRevenue >= 25000;
    return clientScore >= card.minScore - 10;
  });

  return (
    <div className="space-y-8 animate-fade-in">
      <div className="bg-slate-900 rounded-3xl p-8 text-white relative overflow-hidden shadow-2xl border border-white/5">
        <div className="absolute top-0 right-0 p-10 opacity-10 rotate-12">
          <CreditCard size={200} />
        </div>
        <div className="relative z-10">
          <div className="inline-flex items-center gap-2 bg-blue-500/20 text-blue-400 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-[0.2em] mb-4 border border-blue-500/20">
            AI Marketplace
          </div>
          <h2 className="text-4xl font-black mb-4 tracking-tighter uppercase">Matched Capital Products</h2>
          <p className="text-slate-400 text-lg leading-relaxed max-w-2xl font-medium">
            Based on your current <span className="text-white font-bold">FICO {clientScore || 'Unknown'}</span> and <span className="text-white font-bold">${clientRevenue.toLocaleString()} monthly revenue</span>, we've identified the following high-limit business credit lines.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {matchedCards.map((card) => {
          const isHighMatch = card.minScore > 0 && clientScore >= card.minScore + 20;
          return (
            <div key={card.id} className="bg-white rounded-3xl border border-slate-200 p-6 shadow-sm hover:shadow-xl transition-all group flex flex-col h-full relative">
              {isHighMatch && (
                <div className="absolute top-4 right-4 bg-emerald-100 text-emerald-700 text-[10px] font-black px-3 py-1 rounded-full border border-emerald-200 flex items-center gap-1">
                  <Sparkles size={12} /> High Odds
                </div>
              )}
              
              <div className="flex items-center gap-4 mb-6">
                <div className="w-14 h-14 bg-slate-950 rounded-2xl flex items-center justify-center text-white shadow-lg overflow-hidden border border-white/10">
                   <span className="font-black text-xl">{card.issuer.charAt(0)}</span>
                </div>
                <div>
                  <h3 className="font-black text-slate-900 text-lg leading-tight">{card.name}</h3>
                  <p className="text-xs text-slate-500 font-bold uppercase tracking-widest">{card.issuer} • {card.network}</p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4 mb-6">
                <div className="bg-slate-50 p-3 rounded-2xl border border-slate-100">
                  <p className="text-[10px] font-black text-slate-400 uppercase mb-1">Welcome Offer</p>
                  <p className="font-bold text-emerald-600 text-sm">{card.introOffer}</p>
                </div>
                <div className="bg-slate-50 p-3 rounded-2xl border border-slate-100">
                  <p className="text-[10px] font-black text-slate-400 uppercase mb-1">Annual Fee</p>
                  <p className="font-bold text-slate-800 text-sm">${card.annualFee}</p>
                </div>
                <div className="bg-slate-50 p-3 rounded-2xl border border-slate-100">
                  <p className="text-[10px] font-black text-slate-400 uppercase mb-1">Bureau Pulled</p>
                  <p className="font-bold text-slate-800 text-sm">{card.bureauPulled}</p>
                </div>
                <div className="bg-slate-50 p-3 rounded-2xl border border-slate-100">
                  <p className="text-[10px] font-black text-slate-400 uppercase mb-1">Min Score</p>
                  <p className="font-bold text-slate-800 text-sm">{card.minScore === 0 ? 'Rev-Based' : card.minScore}</p>
                </div>
              </div>

              <div className="mt-auto pt-6 border-t border-slate-100">
                <div className="flex items-center gap-2 mb-4 text-xs font-medium text-slate-500">
                   <Info size={14} className="text-blue-500" />
                   Best for: <span className="text-slate-800 font-bold">{card.recommendedFor}</span>
                </div>
                <a 
                  href={card.applicationLink} 
                  target="_blank" 
                  rel="noreferrer"
                  className="w-full bg-slate-900 text-white py-4 rounded-2xl font-black text-xs uppercase tracking-widest flex items-center justify-center gap-2 hover:bg-blue-600 transition-all shadow-lg group-hover:-translate-y-1"
                >
                  Apply via Portal <ExternalLink size={14} />
                </a>
              </div>
            </div>
          );
        })}
      </div>

      <div className="p-6 bg-blue-50 rounded-[2rem] border border-blue-100 flex items-start gap-4">
        <ShieldCheck className="text-blue-600 mt-1" size={24} />
        <div>
          <h4 className="font-bold text-blue-900">Capital Strategy Insight</h4>
          <p className="text-sm text-blue-800 leading-relaxed mt-1">
            Applying for cards within the same 24-hour window can consolidate credit inquiries. Ensure your <span className="font-bold">Business Address</span> and <span className="font-bold">EIN</span> match exactly what you provided in the Compliance tab to maximize approval limits.
          </p>
        </div>
      </div>
    </div>
  );
};

export default ClientCardSuggestions;
