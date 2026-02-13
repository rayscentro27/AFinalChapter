
import React, { useState, useEffect } from 'react';
import { BookOpen, Upload, Save, CheckCircle, BrainCircuit, Sparkles, Plus, Trash2, ShieldCheck, Zap, RefreshCw, X, ChevronRight, FileText, Info, Gavel, Target, MessageSquare } from 'lucide-react';
import { KnowledgeDoc, TrainingPair } from '../types';

const KnowledgeHub: React.FC = () => {
    const [docs, setDocs] = useState<KnowledgeDoc[]>([]);
    const [pairs, setPairs] = useState<TrainingPair[]>([]);
    const [activeTab, setActiveTab] = useState<'sops' | 'corrections'>('sops');
    const [isAddingDoc, setIsAddingDoc] = useState(false);
    const [isAddingPair, setIsAddingPair] = useState(false);
    
    const [newDoc, setNewDoc] = useState<Partial<KnowledgeDoc>>({ title: '', content: '', category: 'Underwriting', isActive: true });
    const [newPair, setNewPair] = useState<Partial<TrainingPair>>({ scenario: '', aiResponse: '', humanCorrection: '' });
    
    const [isSaving, setIsSaving] = useState(false);

    useEffect(() => {
        const savedDocs = JSON.parse(localStorage.getItem('nexus_knowledge_vault') || '[]');
        const savedPairs = JSON.parse(localStorage.getItem('nexus_training_vault') || '[]');
        setDocs(savedDocs);
        setPairs(savedPairs);
    }, []);

    const saveDocs = (updated: KnowledgeDoc[]) => {
        setDocs(updated);
        localStorage.setItem('nexus_knowledge_vault', JSON.stringify(updated));
    };

    const savePairs = (updated: TrainingPair[]) => {
        setPairs(updated);
        localStorage.setItem('nexus_training_vault', JSON.stringify(updated));
    };

    const handleAddDoc = () => {
        if (!newDoc.title || !newDoc.content) return;
        setIsSaving(true);
        setTimeout(() => {
            const doc: KnowledgeDoc = {
                ...newDoc as KnowledgeDoc,
                id: `kb_${Date.now()}`,
                uploadedAt: new Date().toLocaleDateString()
            };
            saveDocs([doc, ...docs]);
            setIsAddingDoc(false);
            setNewDoc({ title: '', content: '', category: 'Underwriting', isActive: true });
            setIsSaving(false);
        }, 1000);
    };

    const handleAddPair = () => {
        if (!newPair.scenario || !newPair.humanCorrection) return;
        setIsSaving(true);
        setTimeout(() => {
            const pair: TrainingPair = {
                ...newPair as TrainingPair,
                id: `tp_${Date.now()}`,
                date: new Date().toLocaleDateString()
            };
            savePairs([pair, ...pairs]);
            setIsAddingPair(false);
            setNewPair({ scenario: '', aiResponse: '', humanCorrection: '' });
            setIsSaving(false);
        }, 800);
    };

    return (
        <div className="max-w-6xl mx-auto space-y-8 animate-fade-in pb-20">
            <div className="bg-slate-900 p-12 rounded-[3rem] text-white shadow-2xl relative overflow-hidden border border-white/5">
                <div className="absolute top-0 right-0 p-10 opacity-10 rotate-12"><BrainCircuit size={320} /></div>
                <div className="relative z-10 max-w-2xl">
                    <div className="inline-flex items-center gap-2 bg-blue-500/20 text-blue-400 px-4 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest mb-10 border border-blue-500/20">
                        Neural Training Node
                    </div>
                    <h1 className="text-6xl font-black mb-8 tracking-tighter uppercase leading-[0.9]">
                        Train your <span className="text-blue-500">Core.</span>
                    </h1>
                    <p className="text-slate-400 text-xl leading-relaxed mb-0 font-medium">
                        Standardize your agency logic. Upload SOPs for RAG grounding or provide "Golden Examples" to teach the AI how to handle complex deal scenarios.
                    </p>
                </div>
            </div>

            <div className="flex bg-slate-100 p-1.5 rounded-2xl border border-slate-200 shadow-inner w-fit mx-auto md:mx-0">
                <button onClick={() => setActiveTab('sops')} className={`px-8 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${activeTab === 'sops' ? 'bg-white shadow-lg text-blue-600' : 'text-slate-400'}`}>Standard Operating Procedures</button>
                <button onClick={() => setActiveTab('corrections')} className={`px-8 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${activeTab === 'corrections' ? 'bg-white shadow-lg text-indigo-600' : 'text-slate-400'}`}>Correction Vault</button>
            </div>

            {activeTab === 'sops' && (
                <div className="space-y-8">
                    <div className="flex justify-between items-center px-4">
                        <h3 className="font-black text-xs uppercase tracking-[0.3em] text-slate-400">Grounding Directives</h3>
                        <button 
                            onClick={() => setIsAddingDoc(true)}
                            className="bg-slate-950 text-white px-8 py-3 rounded-2xl font-black uppercase text-[10px] tracking-widest hover:bg-blue-600 transition-all shadow-xl flex items-center gap-2"
                        >
                            <Plus size={16}/> Upload Intelligence
                        </button>
                    </div>

                    {isAddingDoc && (
                        <div className="bg-white p-10 rounded-[3rem] border-2 border-blue-500 shadow-2xl animate-slide-up">
                            <div className="flex justify-between mb-8">
                                <h4 className="font-black text-slate-900 uppercase tracking-tight">New Knowledge Directive</h4>
                                <button onClick={() => setIsAddingDoc(false)} className="text-slate-400 hover:text-red-500"><X size={20}/></button>
                            </div>
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
                                <div className="md:col-span-2">
                                    <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2 ml-1">Subject Title</label>
                                    <input type="text" value={newDoc.title} onChange={e => setNewDoc({...newDoc, title: e.target.value})} placeholder="e.g. SBA 7(a) Real Estate Restrictions" className="w-full bg-slate-50 border border-slate-200 rounded-xl p-4 font-bold text-slate-800 outline-none focus:ring-2 focus:ring-blue-500" />
                                </div>
                                <div>
                                    <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2 ml-1">Domain</label>
                                    <select value={newDoc.category} onChange={e => setNewDoc({...newDoc, category: e.target.value as any})} className="w-full bg-slate-50 border border-slate-200 rounded-xl p-4 font-bold appearance-none outline-none focus:ring-2 focus:ring-blue-500">
                                        <option>Underwriting</option><option>Sales</option><option>Legal</option><option>Lender Rules</option>
                                    </select>
                                </div>
                            </div>
                            <div className="mb-8">
                                <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2 ml-1">Instruction Content</label>
                                <textarea value={newDoc.content} onChange={e => setNewDoc({...newDoc, content: e.target.value})} placeholder="Paste the full rules or SOP text here..." className="w-full bg-slate-50 border border-slate-200 rounded-2xl p-6 text-sm font-medium h-64 resize-none outline-none focus:ring-2 focus:ring-blue-500" />
                            </div>
                            <button onClick={handleAddDoc} disabled={isSaving} className="w-full bg-blue-600 text-white py-5 rounded-[2rem] font-black uppercase text-[11px] tracking-[0.3em] hover:bg-blue-700 shadow-2xl transition-all flex items-center justify-center gap-3">
                                {isSaving ? <RefreshCw className="animate-spin" size={18}/> : <Save size={18} />}
                                Deploy Directive
                            </button>
                        </div>
                    )}

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                        {docs.length === 0 ? (
                            <div className="md:col-span-2 py-32 text-center border-2 border-dashed border-slate-200 rounded-[3rem] bg-white/50">
                                <BookOpen size={64} className="mx-auto mb-6 text-slate-200" />
                                <p className="text-sm font-black text-slate-400 uppercase tracking-widest">Neural Vault Empty</p>
                            </div>
                        ) : docs.map(doc => (
                            <div key={doc.id} className="bg-white border border-slate-200 p-8 rounded-[3rem] shadow-sm hover:shadow-xl transition-all group">
                                <div className="flex justify-between items-start mb-6">
                                    <div className="flex items-center gap-4">
                                        <div className="p-4 bg-blue-50 text-blue-600 rounded-2xl group-hover:rotate-3 transition-transform"><FileText size={24} /></div>
                                        <div>
                                            <h4 className="font-black text-slate-900 uppercase tracking-tight text-lg">{doc.title}</h4>
                                            <span className="text-[9px] font-black uppercase bg-slate-100 px-2 py-0.5 rounded text-slate-500">{doc.category}</span>
                                        </div>
                                    </div>
                                    <button onClick={() => saveDocs(docs.filter(d => d.id !== doc.id))} className="text-slate-300 hover:text-red-500 p-2"><Trash2 size={18}/></button>
                                </div>
                                <p className="text-xs text-slate-500 font-medium leading-relaxed line-clamp-3 mb-8 italic">"{doc.content}"</p>
                                <div className="flex justify-between items-center pt-6 border-t border-slate-50">
                                    <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Added {doc.uploadedAt}</span>
                                    <div className="flex items-center gap-2 text-emerald-600 font-black text-[9px] uppercase"><ShieldCheck size={12}/> Actively Grounded</div>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {activeTab === 'corrections' && (
                <div className="space-y-8 animate-fade-in">
                    <div className="flex justify-between items-center px-4">
                        <h3 className="font-black text-xs uppercase tracking-[0.3em] text-slate-400">Few-Shot Training Pairs</h3>
                        <button 
                            onClick={() => setIsAddingPair(true)}
                            className="bg-indigo-600 text-white px-8 py-3 rounded-2xl font-black uppercase text-[10px] tracking-widest hover:bg-indigo-700 transition-all shadow-xl flex items-center gap-2"
                        >
                            <Plus size={16}/> Manual Training
                        </button>
                    </div>

                    {isAddingPair && (
                        <div className="bg-white p-10 rounded-[3rem] border-2 border-indigo-500 shadow-2xl animate-slide-up">
                            <div className="flex justify-between mb-8">
                                <h4 className="font-black text-slate-900 uppercase tracking-tight">AI Training Protocol</h4>
                                <button onClick={() => setIsAddingPair(false)} className="text-slate-400 hover:text-red-500"><X size={20}/></button>
                            </div>
                            <div className="space-y-6 mb-8">
                                <div>
                                    <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2 ml-1">Scenario/Prompt</label>
                                    <textarea value={newPair.scenario} onChange={e => setNewPair({...newPair, scenario: e.target.value})} placeholder="e.g. When a client asks about early payoff penalties..." className="w-full bg-slate-50 border border-slate-200 rounded-xl p-4 text-sm font-medium h-24 resize-none outline-none focus:ring-2 focus:ring-indigo-500" />
                                </div>
                                <div>
                                    <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2 ml-1">Correct Human Response</label>
                                    <textarea value={newPair.humanCorrection} onChange={e => setNewPair({...newPair, humanCorrection: e.target.value})} placeholder="Provide the 'Perfect' answer the AI should have given." className="w-full bg-slate-50 border border-slate-200 rounded-xl p-4 text-sm font-bold h-32 resize-none outline-none focus:ring-2 focus:ring-indigo-500" />
                                </div>
                            </div>
                            <button onClick={handleAddPair} disabled={isSaving} className="w-full bg-indigo-600 text-white py-5 rounded-[2rem] font-black uppercase text-[11px] tracking-[0.3em] hover:bg-indigo-700 shadow-2xl transition-all flex items-center justify-center gap-3">
                                {isSaving ? <RefreshCw className="animate-spin" size={18}/> : <Zap size={18} fill="currentColor"/>}
                                Commit Pair to Core
                            </button>
                        </div>
                    )}

                    <div className="space-y-4">
                        {pairs.length === 0 ? (
                            <div className="py-32 text-center border-2 border-dashed border-slate-200 rounded-[3rem] bg-white/50">
                                <Target size={64} className="mx-auto mb-6 text-slate-200" />
                                <p className="text-sm font-black text-slate-400 uppercase tracking-widest">No Training Pairs Detected</p>
                            </div>
                        ) : pairs.map(pair => (
                            <div key={pair.id} className="bg-white border border-slate-200 rounded-[2.5rem] p-8 shadow-sm hover:shadow-lg transition-all group grid grid-cols-1 md:grid-cols-12 gap-8 items-center">
                                <div className="md:col-span-1 flex flex-col items-center">
                                    <div className="p-3 bg-indigo-50 text-indigo-600 rounded-xl"><Gavel size={20}/></div>
                                    <div className="w-px h-12 bg-slate-100 my-2"></div>
                                    <span className="text-[8px] font-black text-slate-300 uppercase">Fixed</span>
                                </div>
                                <div className="md:col-span-5">
                                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Scenario Context</p>
                                    <p className="text-sm font-bold text-slate-800 line-clamp-3">{pair.scenario}</p>
                                </div>
                                <div className="md:col-span-5 bg-emerald-50 p-5 rounded-2xl border border-emerald-100">
                                    <p className="text-[9px] font-black text-emerald-600 uppercase tracking-widest mb-2 flex items-center gap-2"><Sparkles size={10}/> Expert Correction</p>
                                    <p className="text-xs font-medium text-emerald-900 italic line-clamp-3 leading-relaxed">"{pair.humanCorrection}"</p>
                                </div>
                                <div className="md:col-span-1 flex justify-end">
                                    <button onClick={() => savePairs(pairs.filter(p => p.id !== pair.id))} className="p-3 text-slate-300 hover:text-red-500 rounded-xl hover:bg-red-50 transition-all"><Trash2 size={20}/></button>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            <div className="bg-blue-50 rounded-[3rem] p-10 border border-blue-100 flex items-start gap-6">
                <Info size={32} className="text-blue-600 shrink-0" />
                <div>
                    <h4 className="text-xl font-black text-blue-900 uppercase tracking-tight mb-2">How it works</h4>
                    <p className="text-sm text-blue-700 leading-relaxed font-medium">
                        Directives in the **Knowledge Base** act as permanent context anchors. **Correction Pairs** provide Few-Shot learning examples, teaching the AI to mirror your specific expertise. When both are used, the AI's accuracy in specific niche tasks increases by over 40%.
                    </p>
                </div>
            </div>
        </div>
    );
};

export default KnowledgeHub;
