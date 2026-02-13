
import React, { useState, useEffect } from 'react';
import { DripCampaign, EmailStep, Contact } from '../types';
import { 
  Mail, Plus, Trash2, Edit2, Play, Pause, Sparkles, RefreshCw, 
  Send, BarChart2, Users, Clock, ArrowRight, Save, X, ChevronRight,
  Layout, MessageSquare, AlertCircle, TrendingUp, Search, Wand2, Eye
} from 'lucide-react';
import * as geminiService from '../services/geminiService';

interface EmailCampaignManagerProps {
  contacts: Contact[];
  agencyName: string;
}

const MOCK_CAMPAIGNS: DripCampaign[] = [
  {
    id: 'camp_1',
    name: 'New Lead Welcome',
    status: 'Active',
    audience: 'Lead',
    steps: [
      { id: 's1', subject: 'Welcome to Nexus Funding', body: 'Hi there, we are excited to help you grow your business...', delayDays: 0 },
      { id: 's2', subject: 'Quick question about your revenue', body: 'Hi, just checking in to see if you have your bank statements ready...', delayDays: 2 }
    ],
    stats: { sent: 142, opened: 89, clicked: 24 }
  }
];

const EmailCampaignManager: React.FC<EmailCampaignManagerProps> = ({ contacts, agencyName }) => {
  const [campaigns, setCampaigns] = useState<DripCampaign[]>(MOCK_CAMPAIGNS);
  const [isEditing, setIsEditing] = useState(false);
  const [activeCampaign, setActiveCampaign] = useState<DripCampaign | null>(null);
  const [viewMode, setViewMode] = useState<'editor' | 'audience'>('editor');
  
  // AI Generation State
  const [goal, setGoal] = useState('');
  const [audience, setAudience] = useState('New Leads');
  const [isGenerating, setIsGenerating] = useState(false);
  const [isGeneratingStep, setIsGeneratingStep] = useState<string | null>(null);

  const matchedLeads = contacts.filter(c => c.status.toLowerCase() === (activeCampaign?.audience?.toLowerCase() || 'lead'));

  const handleCreateNew = () => {
    setActiveCampaign({
      id: `camp_${Date.now()}`,
      name: 'Untitled Automation',
      status: 'Draft',
      audience: 'Lead',
      steps: [],
      stats: { sent: 0, opened: 0, clicked: 0 }
    });
    setIsEditing(true);
  };

  const handleGenerateSequence = async () => {
    if (!goal) return;
    setIsGenerating(true);
    try {
      const sequence = await geminiService.generateEmailDripSequence(goal, audience, agencyName);
      if (activeCampaign && sequence) {
        const stepsWithIds = sequence.map((s, i) => ({ ...s, id: `s_${Date.now()}_${i}` }));
        setActiveCampaign({ ...activeCampaign, steps: stepsWithIds });
      }
    } catch (e) {
      console.error(e);
    } finally {
      setIsGenerating(false);
    }
  };

  const handleGenerateStepContent = async (stepIdx: number) => {
    if (!activeCampaign) return;
    const stepId = activeCampaign.steps[stepIdx].id;
    setIsGeneratingStep(stepId);
    try {
        const subject = await geminiService.generateEmailSubject(activeCampaign.name, stepIdx);
        const body = await geminiService.generateEmailBody(activeCampaign.name, stepIdx);
        const newSteps = [...activeCampaign.steps];
        newSteps[stepIdx] = { ...newSteps[stepIdx], subject, body };
        setActiveCampaign({ ...activeCampaign, steps: newSteps });
    } finally {
        setIsGeneratingStep(null);
    }
  };

  const handleSave = () => {
    if (activeCampaign) {
      const exists = campaigns.find(c => c.id === activeCampaign.id);
      if (exists) {
        setCampaigns(campaigns.map(c => c.id === activeCampaign.id ? activeCampaign : c));
      } else {
        setCampaigns([activeCampaign, ...campaigns]);
      }
      setIsEditing(false);
      setActiveCampaign(null);
    }
  };

  const toggleStatus = (id: string) => {
    setCampaigns(campaigns.map(c => c.id === id ? { ...c, status: c.status === 'Active' ? 'Paused' : 'Active' as any } : c));
  };

  return (
    <div className="space-y-8 animate-fade-in pb-12">
      
      {!isEditing ? (
        <>
          <div className="flex justify-between items-center bg-white p-8 rounded-[2.5rem] border border-slate-200 shadow-sm">
            <div>
              <h2 className="text-3xl font-black text-slate-900 uppercase tracking-tighter">Marketing Engine</h2>
              <p className="text-sm text-slate-500 font-medium">Manage your autonomous email drips and revenue funnels.</p>
            </div>
            <button 
              onClick={handleCreateNew}
              className="bg-slate-950 text-white px-8 py-3 rounded-2xl font-black text-[10px] uppercase tracking-widest flex items-center gap-2 hover:bg-blue-600 transition-all shadow-xl active:scale-95"
            >
              <Plus size={18} /> Design Workflow
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {campaigns.map(camp => (
              <div key={camp.id} className="bg-white rounded-[2.5rem] border border-slate-200 p-8 shadow-sm hover:shadow-xl transition-all group">
                <div className="flex justify-between items-start mb-8">
                  <div className={`p-4 rounded-2xl shadow-lg transform rotate-3 ${camp.status === 'Active' ? 'bg-emerald-50 text-emerald-600' : 'bg-slate-50 text-slate-400'}`}>
                    <Mail size={24} />
                  </div>
                  <div className="flex gap-2">
                    <button onClick={() => toggleStatus(camp.id)} className="p-2.5 rounded-xl bg-slate-100 text-slate-500 hover:bg-white hover:shadow-md transition-all">
                      {camp.status === 'Active' ? <Pause size={18} /> : <Play size={18} />}
                    </button>
                    <button onClick={() => { setActiveCampaign(camp); setIsEditing(true); }} className="p-2.5 bg-slate-100 text-slate-500 hover:text-blue-600 hover:bg-white hover:shadow-md rounded-xl transition-all">
                      <Edit2 size={18} />
                    </button>
                  </div>
                </div>

                <h3 className="text-xl font-black text-slate-900 mb-2 uppercase tracking-tight truncate">{camp.name}</h3>
                <div className="flex items-center gap-2 mb-8">
                  <span className={`text-[9px] font-black uppercase px-2 py-0.5 rounded-full border ${camp.status === 'Active' ? 'bg-emerald-50 text-emerald-700 border-emerald-100' : 'bg-slate-50 text-slate-500 border-slate-200'}`}>
                    {camp.status}
                  </span>
                  <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">• {camp.steps.length} Sequence Nodes</span>
                </div>

                <div className="grid grid-cols-3 gap-4 border-t border-slate-50 pt-8">
                    <div className="text-center">
                        <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">Delivered</p>
                        <p className="text-lg font-black text-slate-800">{camp.stats.sent}</p>
                    </div>
                    <div className="text-center border-x border-slate-50">
                        <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">Open Rate</p>
                        <p className="text-lg font-black text-blue-600">{Math.round((camp.stats.opened/camp.stats.sent)*100 || 0)}%</p>
                    </div>
                    <div className="text-center">
                        <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">Yield</p>
                        <p className="text-lg font-black text-emerald-600">{Math.round((camp.stats.clicked/camp.stats.opened)*100 || 0)}%</p>
                    </div>
                </div>
              </div>
            ))}
          </div>
        </>
      ) : (
        <div className="bg-white rounded-[3rem] border border-slate-200 shadow-2xl overflow-hidden flex flex-col animate-fade-in h-[85vh]">
          {/* Editor Header */}
          <div className="p-8 border-b border-slate-100 bg-slate-50 flex justify-between items-center shrink-0">
            <div className="flex items-center gap-4">
              <button onClick={() => setIsEditing(false)} className="p-3 hover:bg-white rounded-2xl text-slate-400 transition-all border border-transparent hover:border-slate-200"><X size={24} /></button>
              <div className="h-10 w-px bg-slate-200 mx-2 hidden md:block"></div>
              <input 
                className="text-2xl font-black text-slate-900 bg-transparent border-none focus:ring-0 p-0 uppercase tracking-tighter placeholder-slate-300 w-full md:w-96"
                value={activeCampaign?.name}
                onChange={(e) => setActiveCampaign({ ...activeCampaign!, name: e.target.value })}
                placeholder="Automation Name"
              />
            </div>
            <div className="flex gap-4">
                <div className="flex bg-slate-200 p-1 rounded-xl shadow-inner mr-4">
                    <button onClick={() => setViewMode('editor')} className={`px-6 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${viewMode === 'editor' ? 'bg-white shadow text-blue-600' : 'text-slate-500'}`}>Designer</button>
                    <button onClick={() => setViewMode('audience')} className={`px-6 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${viewMode === 'audience' ? 'bg-white shadow text-blue-600' : 'text-slate-500'}`}>Audience</button>
                </div>
                <button onClick={handleSave} className="bg-slate-900 text-white px-10 py-3 rounded-2xl font-black text-[10px] uppercase tracking-widest hover:bg-blue-600 shadow-xl transition-all active:scale-95 flex items-center gap-2">
                    <Save size={18} /> Protocol Safe
                </button>
            </div>
          </div>

          <div className="flex-1 overflow-hidden flex flex-col md:flex-row">
            {viewMode === 'editor' ? (
                <>
                {/* Visual Timeline */}
                <div className="flex-1 overflow-y-auto p-12 bg-slate-50 custom-scrollbar relative">
                    <div className="max-w-3xl mx-auto space-y-12">
                        {/* Start Node */}
                        <div className="flex flex-col items-center">
                            <div className="w-12 h-12 bg-slate-900 rounded-full flex items-center justify-center text-white shadow-xl relative z-10 border-4 border-white">
                                <Play size={18} fill="currentColor" className="ml-1" />
                            </div>
                            <div className="h-10 w-0.5 bg-slate-300"></div>
                            <div className="px-6 py-2 bg-white border border-slate-200 rounded-xl text-[9px] font-black uppercase tracking-widest text-slate-400 shadow-sm">Automation Trigger</div>
                        </div>

                        {activeCampaign?.steps.length === 0 && (
                            <div className="py-24 text-center border-2 border-dashed border-slate-200 rounded-[3rem] bg-white/50">
                                <Mail size={64} className="mx-auto mb-6 text-slate-200" />
                                <h3 className="text-xl font-black text-slate-400 uppercase tracking-widest">Awaiting Sequence nodes</h3>
                                <p className="text-xs text-slate-400 mt-2">Use the Neural Drafter to synthesize a 3-step protocol instantly.</p>
                            </div>
                        )}

                        {activeCampaign?.steps.map((step, idx) => (
                            <div key={step.id} className="relative">
                                {/* Connector Line */}
                                <div className="absolute left-1/2 -top-12 -bottom-12 w-0.5 bg-slate-200 -translate-x-1/2"></div>
                                
                                <div className="bg-white border border-slate-200 rounded-[2.5rem] p-10 shadow-sm relative z-10 group hover:border-blue-400 transition-all hover:shadow-xl">
                                    <div className="absolute top-6 right-6 opacity-0 group-hover:opacity-100 transition-all">
                                        <button 
                                            onClick={() => setActiveCampaign({...activeCampaign!, steps: activeCampaign!.steps.filter(s => s.id !== step.id)})}
                                            className="p-3 text-slate-300 hover:text-red-500 rounded-xl hover:bg-red-50 transition-all"
                                        >
                                            <Trash2 size={20} />
                                        </button>
                                    </div>

                                    <div className="flex items-center gap-6 mb-10">
                                        <div className="w-14 h-14 bg-blue-50 text-blue-600 rounded-2xl flex items-center justify-center font-black text-xl shadow-inner border border-blue-100">{idx + 1}</div>
                                        <div>
                                            <h4 className="text-xl font-black text-slate-900 uppercase tracking-tighter">Content Node</h4>
                                            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mt-1">Status: Operational</p>
                                        </div>
                                    </div>

                                    <div className="space-y-8">
                                        <div className="relative">
                                            <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-2 block ml-1">Protocol Subject</label>
                                            <input 
                                                className="w-full bg-slate-50 border border-slate-100 rounded-xl p-4 text-sm font-bold text-slate-800 outline-none focus:ring-2 focus:ring-blue-500 shadow-inner"
                                                value={step.subject}
                                                onChange={(e) => {
                                                    const newSteps = [...activeCampaign.steps];
                                                    newSteps[idx].subject = e.target.value;
                                                    setActiveCampaign({...activeCampaign, steps: newSteps});
                                                }}
                                            />
                                        </div>
                                        <div className="relative">
                                            <div className="flex justify-between items-center mb-2">
                                                <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest block ml-1">Autonomous Content Payload</label>
                                                <button 
                                                    onClick={() => handleGenerateStepContent(idx)}
                                                    disabled={isGeneratingStep !== null}
                                                    className="text-[9px] font-black text-indigo-600 uppercase flex items-center gap-1.5 hover:underline"
                                                >
                                                    {isGeneratingStep === step.id ? <RefreshCw className="animate-spin" size={10}/> : <Wand2 size={12}/>} Redraft with AI
                                                </button>
                                            </div>
                                            <textarea 
                                                className="w-full bg-slate-50 border border-slate-100 rounded-2xl p-6 text-sm font-medium text-slate-600 h-48 resize-none focus:ring-2 focus:ring-blue-500 shadow-inner leading-relaxed"
                                                value={step.body}
                                                onChange={(e) => {
                                                    const newSteps = [...activeCampaign.steps];
                                                    newSteps[idx].body = e.target.value;
                                                    setActiveCampaign({...activeCampaign, steps: newSteps});
                                                }}
                                            />
                                        </div>
                                        <div className="w-40">
                                            <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-2 block ml-1">Temporal Delay (Days)</label>
                                            <div className="flex items-center gap-3 bg-slate-100 p-2 rounded-xl border border-slate-200 shadow-inner">
                                                <Clock size={16} className="text-slate-400 ml-2" />
                                                <input 
                                                    type="number" 
                                                    className="w-full bg-transparent border-none focus:ring-0 font-black text-slate-700" 
                                                    value={step.delayDays} 
                                                    onChange={e => {
                                                        const newSteps = [...activeCampaign.steps];
                                                        newSteps[idx].delayDays = Number(e.target.value);
                                                        setActiveCampaign({...activeCampaign, steps: newSteps});
                                                    }}
                                                />
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        ))}

                        <button 
                            onClick={() => setActiveCampaign({...activeCampaign!, steps: [...activeCampaign!.steps, { id: `s_${Date.now()}`, subject: 'Manual Node', body: '', delayDays: 1 }]})}
                            className="w-full py-6 border-2 border-dashed border-slate-200 rounded-[2.5rem] text-slate-400 font-black uppercase text-[10px] tracking-[0.3em] hover:bg-white hover:border-blue-400 hover:text-blue-500 transition-all flex items-center justify-center gap-3 active:scale-95"
                        >
                            <Plus size={20} /> Add Automation Node
                        </button>
                    </div>
                </div>

                {/* AI Intelligence Panel */}
                <div className="w-full md:w-96 bg-white border-l border-slate-100 overflow-y-auto p-10 flex flex-col shrink-0 custom-scrollbar">
                    <div className="bg-slate-900 rounded-[2.5rem] p-8 text-white shadow-2xl relative overflow-hidden mb-10 border border-white/5">
                        <div className="absolute top-0 right-0 p-4 opacity-10"><Sparkles size={120} /></div>
                        <h4 className="text-xs font-black text-indigo-400 uppercase tracking-widest mb-8 flex items-center gap-2"><RefreshCw size={14}/> Sequence Architect</h4>
                        <div className="space-y-6 relative z-10">
                            <div>
                                <label className="block text-[9px] font-black text-slate-500 uppercase tracking-widest mb-2">Primary Goal</label>
                                <textarea 
                                    className="w-full bg-white/5 border border-white/10 rounded-xl p-4 text-xs font-medium text-slate-200 outline-none focus:ring-2 focus:ring-indigo-500 h-24 resize-none shadow-inner"
                                    value={goal}
                                    onChange={e => setGoal(e.target.value)}
                                    placeholder="e.g. Onboard new trucking leads and explain equipment financing terms."
                                />
                            </div>
                            <button 
                                onClick={handleGenerateSequence}
                                disabled={isGenerating || !goal}
                                className="w-full py-4 bg-blue-600 text-white rounded-xl font-black uppercase text-[10px] tracking-widest shadow-xl flex items-center justify-center gap-3 transition-all transform active:scale-95 disabled:opacity-50"
                            >
                                {isGenerating ? <RefreshCw className="animate-spin" size={16}/> : <Sparkles size={16}/>}
                                Synthesize Protocol
                            </button>
                        </div>
                    </div>

                    <div className="space-y-8">
                        <div className="bg-slate-50 rounded-[2rem] p-6 border border-slate-100">
                           <h5 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-4 flex items-center gap-2"><Eye size={14}/> Global Audience Check</h5>
                           <div className="flex justify-between items-end">
                              <div>
                                 <p className="text-4xl font-black text-slate-900 tracking-tighter">{matchedLeads.length}</p>
                                 <p className="text-[8px] font-black text-slate-500 uppercase tracking-widest">Active Leads in Segment</p>
                              </div>
                              <TrendingUp size={24} className="text-emerald-500 mb-2" />
                           </div>
                        </div>

                        <div className="p-6 bg-indigo-50 rounded-[2rem] border border-indigo-100">
                           <h5 className="text-[10px] font-black text-indigo-600 uppercase tracking-widest mb-3 flex items-center gap-2"><AlertCircle size={14}/> Optimization Tip</h5>
                           <p className="text-xs text-indigo-900 font-medium leading-relaxed italic">
                              {/* Fix: Wrap text containing double curly braces in a JSX expression to prevent interpretation as an object literal */}
                              {"\"Adding the {{company_name}} variable to the Step 2 subject line typically increases open rates by 22% for this niche.\""}
                           </p>
                        </div>
                    </div>
                </div>
                </>
            ) : (
                <div className="flex-1 bg-white overflow-y-auto p-12 animate-fade-in custom-scrollbar">
                    <div className="max-w-4xl mx-auto space-y-10">
                        <div className="bg-slate-50 p-10 rounded-[3rem] border border-slate-200 flex justify-between items-center relative overflow-hidden">
                           <div className="relative z-10">
                              <h3 className="text-3xl font-black text-slate-900 uppercase tracking-tighter mb-2">Audience Intelligence</h3>
                              <p className="text-sm font-medium text-slate-500">Entities currently synchronized with the <strong className="text-blue-600">{activeCampaign?.audience}</strong> protocol.</p>
                           </div>
                           <Users size={80} className="text-slate-200 absolute right-10 top-1/2 -translate-y-1/2" />
                        </div>

                        <div className="bg-white border border-slate-100 rounded-3xl shadow-xl overflow-hidden">
                            <table className="w-full text-left">
                                <thead className="bg-slate-50 border-b border-slate-100 text-[10px] font-black text-slate-400 uppercase tracking-widest">
                                    <tr>
                                        <th className="px-10 py-6">Entity Signature</th>
                                        <th className="px-10 py-6">Phase</th>
                                        <th className="px-10 py-6 text-right">Magnitude</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-50">
                                    {matchedLeads.map(lead => (
                                        <tr key={lead.id} className="hover:bg-slate-50 transition-colors">
                                            <td className="px-10 py-6 flex items-center gap-4">
                                                <div className="w-10 h-10 rounded-xl bg-slate-900 text-white flex items-center justify-center font-black text-xs shadow-lg transform rotate-3">{lead.company[0]}</div>
                                                <div>
                                                    <p className="font-black text-slate-900 uppercase tracking-tight text-sm">{lead.company}</p>
                                                    <p className="text-[10px] text-slate-400 font-bold uppercase">{lead.name}</p>
                                                </div>
                                            </td>
                                            <td className="px-10 py-6">
                                                <span className="bg-blue-50 text-blue-600 text-[9px] font-black uppercase px-3 py-1 rounded-full border border-blue-100">{lead.status}</span>
                                            </td>
                                            <td className="px-10 py-6 text-right font-black text-sm text-slate-800">${lead.value.toLocaleString()}</td>
                                        </tr>
                                    ))}
                                    {matchedLeads.length === 0 && (
                                        <tr>
                                            <td colSpan={3} className="p-20 text-center flex flex-col items-center">
                                                <AlertCircle size={48} className="opacity-10 mb-4" />
                                                <p className="text-xs font-black uppercase tracking-widest text-slate-400">Zero entities detected in this segment</p>
                                            </td>
                                        </tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default EmailCampaignManager;
