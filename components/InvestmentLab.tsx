import React, { useState } from 'react';
import { Contact, InvestmentIdea } from '../types';
import {
  TrendingUp,
  Sparkles,
  Youtube,
  ArrowRight,
  RefreshCw,
  ListChecks,
  Layers,
  PieChart,
  AlertTriangle,
  CheckCircle2,
  Lock,
} from 'lucide-react';
import * as geminiService from '../services/geminiService';
import useTradingAccess from '../hooks/useTradingAccess';

interface InvestmentLabProps {
  contact: Contact;
  onUpdateContact: (contact: Contact) => void;
}

const InvestmentLab: React.FC<InvestmentLabProps> = ({ contact, onUpdateContact }) => {
  const [videoUrl, setVideoUrl] = useState('');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [activeStrategy, setActiveStrategy] = useState<InvestmentIdea | null>(null);
  const tradingAccess = useTradingAccess(contact.id, { reconcileOnFetch: true });

  const strategies = contact.investmentStrategies || [];
  const unlocked = Boolean(tradingAccess.snapshot?.access_ready);

  const handleAnalyzeVideo = async () => {
    if (!videoUrl) return;
    setIsAnalyzing(true);
    try {
      const idea = await geminiService.generateInvestmentIdea(videoUrl, contact);
      if (idea) {
        onUpdateContact({
          ...contact,
          investmentStrategies: [idea, ...(contact.investmentStrategies || [])],
        });
        setActiveStrategy(idea);
        setVideoUrl('');
      }
    } catch {
      alert('Failed to deconstruct investment strategy.');
    } finally {
      setIsAnalyzing(false);
    }
  };

  return (
    <div className="space-y-10 animate-fade-in pb-20">
      <div className="bg-indigo-950 rounded-[3rem] p-12 text-white shadow-2xl relative overflow-hidden border border-white/5">
        <div className="absolute top-0 right-0 p-10 opacity-10 rotate-12"><PieChart size={280} /></div>
        <div className="relative z-10 max-w-3xl">
          <div className="inline-flex items-center gap-2 bg-indigo-500/20 text-indigo-300 px-4 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest mb-10 border border-indigo-500/20">
            Wealth Alpha Core
          </div>
          <h1 className="text-6xl font-black mb-8 tracking-tighter uppercase leading-[0.9]">
            The <span className="text-indigo-400">Wealth</span> Accelerator.
          </h1>
          <p className="text-slate-300 text-xl leading-relaxed mb-0 font-medium">
            Advanced trading content is optional and educational-only. Complete the access checklist first, then start with paper trading.
          </p>
        </div>
      </div>

      {tradingAccess.loading && !tradingAccess.snapshot ? (
        <div className="rounded-[2.5rem] border border-slate-200 bg-white p-8 text-sm font-medium text-slate-700 flex items-center gap-3">
          <RefreshCw className="animate-spin text-slate-500" size={18} /> Checking trading access...
        </div>
      ) : null}

      {tradingAccess.error ? (
        <div className="rounded-[2.5rem] border border-red-200 bg-red-50 p-6 text-sm font-medium text-red-700">
          {tradingAccess.error}
        </div>
      ) : null}

      {tradingAccess.snapshot && !unlocked ? (
        <div className="rounded-[2.5rem] border border-slate-200 bg-white p-8 space-y-6">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="text-xl font-black text-slate-900 tracking-tight">Advanced Trading Access Setup</div>
            <span className="px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest border bg-amber-50 text-amber-700 border-amber-200">
              Locked
            </span>
          </div>

          {tradingAccess.snapshot.blockers.length > 0 ? (
            <div className="space-y-2">
              {tradingAccess.snapshot.blockers.map((blocker) => (
                <div key={blocker} className="text-sm text-slate-700 font-medium flex items-start gap-2">
                  <AlertTriangle size={15} className="text-amber-500 mt-0.5" />
                  <span>{blocker}</span>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-sm text-emerald-700 font-medium flex items-start gap-2">
              <CheckCircle2 size={16} className="mt-0.5" />
              <span>Eligibility checks passed. Complete the setup actions below.</span>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <button
              onClick={() => void tradingAccess.optIn()}
              disabled={!tradingAccess.snapshot.eligible || tradingAccess.snapshot.opted_in || tradingAccess.busyAction !== null}
              className="rounded-xl bg-slate-900 text-white px-4 py-3 text-xs font-black uppercase tracking-widest disabled:opacity-40"
            >
              {tradingAccess.busyAction === 'opt_in' ? 'Saving...' : tradingAccess.snapshot.opted_in ? 'Opt-In Complete' : 'Opt In'}
            </button>
            <button
              onClick={() => void tradingAccess.completeVideo()}
              disabled={!tradingAccess.snapshot.opted_in || tradingAccess.snapshot.video_complete || tradingAccess.busyAction !== null}
              className="rounded-xl bg-blue-600 text-white px-4 py-3 text-xs font-black uppercase tracking-widest disabled:opacity-40"
            >
              {tradingAccess.busyAction === 'video' ? 'Saving...' : tradingAccess.snapshot.video_complete ? 'Video Complete' : 'Mark Video Complete'}
            </button>
            <button
              onClick={() => void tradingAccess.acceptDisclaimer()}
              disabled={!tradingAccess.snapshot.video_complete || tradingAccess.snapshot.disclaimer_complete || tradingAccess.busyAction !== null}
              className="rounded-xl bg-emerald-600 text-white px-4 py-3 text-xs font-black uppercase tracking-widest disabled:opacity-40"
            >
              {tradingAccess.busyAction === 'disclaimer' ? 'Saving...' : tradingAccess.snapshot.disclaimer_complete ? 'Disclaimer Accepted' : 'Accept Disclaimer'}
            </button>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-xs text-slate-600 font-medium">
            Educational use only. No financial advice, no guarantees, and paper trading is recommended first.
          </div>
        </div>
      ) : null}

      {unlocked ? (
        <>
          <div className="rounded-[2.5rem] border border-emerald-200 bg-emerald-50 p-5 text-sm text-emerald-700 font-medium flex items-start gap-3">
            <CheckCircle2 size={18} className="mt-0.5" />
            <div>
              Access unlocked. Keep simulation-first discipline before applying live capital.
              {activeStrategy ? ` Latest strategy added: ${activeStrategy.title}.` : ''}
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-10">
            <div className="lg:col-span-4 space-y-8">
              <div className="bg-white rounded-[2.5rem] p-10 shadow-sm border border-slate-200">
                <h3 className="font-black text-xs uppercase tracking-[0.3em] text-slate-400 mb-8 flex items-center gap-2">
                  <Youtube size={18} className="text-red-600" /> Neural Video Scout
                </h3>
                <p className="text-sm text-slate-500 mb-8 leading-relaxed font-medium">
                  Paste one strategy video and convert it into a paper-trading-first execution checklist.
                </p>
                <div className="space-y-4">
                  <input
                    type="text"
                    value={videoUrl}
                    onChange={(e) => setVideoUrl(e.target.value)}
                    placeholder="Paste YouTube Link..."
                    className="w-full p-4 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold focus:ring-2 focus:ring-indigo-500 outline-none"
                  />
                  <button
                    onClick={handleAnalyzeVideo}
                    disabled={isAnalyzing || !videoUrl}
                    className="w-full bg-slate-950 text-white py-4 rounded-xl font-black uppercase text-[10px] tracking-widest hover:bg-indigo-600 transition-all flex items-center justify-center gap-3 active:scale-95 disabled:opacity-50"
                  >
                    {isAnalyzing ? <RefreshCw className="animate-spin" size={16} /> : <Sparkles size={16} />}
                    Deconstruct Strategy
                  </button>
                </div>
              </div>

              <div className="bg-slate-900 rounded-[2.5rem] p-8 text-white shadow-2xl relative overflow-hidden group">
                <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:scale-110 transition-transform"><Layers size={100} /></div>
                <h3 className="text-xs font-black uppercase tracking-[0.2em] opacity-60 mb-2">Capital Pool</h3>
                <div className="text-5xl font-black tracking-tighter mb-4">${(contact.revenue || 0).toLocaleString()}</div>
                <p className="text-[10px] font-black uppercase tracking-widest mt-4 opacity-70">Simulation First: Recommended</p>
              </div>
            </div>

            <div className="lg:col-span-8 space-y-8">
              <h3 className="font-black text-xs uppercase tracking-[0.3em] text-slate-400 px-4">Tactical Blueprint Library</h3>

              {strategies.length === 0 ? (
                <div className="bg-slate-50 border-2 border-dashed border-slate-200 rounded-[3rem] p-20 text-center flex flex-col items-center justify-center">
                  <TrendingUp size={64} className="opacity-10 mb-4" />
                  <p className="text-sm font-black text-slate-400 uppercase tracking-widest">No strategies analyzed yet.</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-6">
                  {strategies.map((strat) => (
                    <div key={strat.id} className="bg-white border border-slate-200 rounded-[2.5rem] p-8 shadow-sm hover:shadow-xl transition-all group overflow-hidden relative">
                      <div className="absolute top-0 right-0 p-8 opacity-5"><Layers size={120} /></div>
                      <div className="flex flex-col md:flex-row justify-between items-start mb-8 gap-6 relative z-10">
                        <div>
                          <span className="bg-indigo-100 text-indigo-700 px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-widest border border-indigo-200 mb-4 inline-block">
                            {strat.category}
                          </span>
                          <h4 className="text-3xl font-black text-slate-900 uppercase tracking-tight leading-none mb-2">{strat.title}</h4>
                          <p className="text-sm text-slate-500 font-medium italic">" {strat.description} "</p>
                        </div>
                        <div className="text-right">
                          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">ROI Potential</p>
                          <p className="text-3xl font-black text-emerald-600 tracking-tighter">{strat.roiPotential}</p>
                        </div>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-10 border-t border-slate-100 pt-8 relative z-10">
                        <div>
                          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-4 flex items-center gap-2"><ListChecks size={14} /> Execution Steps</p>
                          <div className="space-y-3">
                            {strat.steps.map((step, i) => (
                              <div key={i} className="flex gap-4 items-start">
                                <div className="w-5 h-5 bg-slate-100 rounded flex items-center justify-center text-[10px] font-black shrink-0">{i + 1}</div>
                                <p className="text-xs text-slate-600 font-medium leading-relaxed">{step}</p>
                              </div>
                            ))}
                          </div>
                        </div>
                        <div className="flex flex-col justify-end">
                          <div className="p-5 bg-slate-50 rounded-2xl border border-slate-100 mb-6">
                            <div className="flex justify-between items-center mb-2">
                              <span className="text-[10px] font-black text-slate-400 uppercase">Risk Rating</span>
                              <span className={`text-[10px] font-black uppercase ${strat.riskLevel === 'Low' ? 'text-emerald-500' : strat.riskLevel === 'High' ? 'text-red-500' : 'text-amber-500'}`}>{strat.riskLevel}</span>
                            </div>
                            <div className="h-1.5 bg-slate-200 rounded-full overflow-hidden">
                              <div className={`h-full ${strat.riskLevel === 'Low' ? 'bg-emerald-500 w-1/3' : strat.riskLevel === 'High' ? 'bg-red-500 w-full' : 'bg-amber-500 w-2/3'}`} />
                            </div>
                          </div>
                          <button className="w-full bg-slate-950 text-white py-4 rounded-2xl font-black uppercase text-[10px] tracking-widest hover:bg-indigo-600 transition-all shadow-xl active:scale-95 flex items-center justify-center gap-2">
                            Consult with Advisor <ArrowRight size={14} />
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </>
      ) : null}

      {tradingAccess.snapshot && !unlocked ? (
        <div className="rounded-[2.5rem] border border-slate-200 bg-slate-50 p-5 text-xs text-slate-600 font-medium flex items-start gap-3">
          <Lock size={16} className="mt-0.5 text-slate-500" />
          Advanced trading remains secondary to business growth. Complete setup steps to unlock this optional learning module.
        </div>
      ) : null}
    </div>
  );
};

export default InvestmentLab;
