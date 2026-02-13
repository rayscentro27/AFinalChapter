
import React, { useState, useEffect } from 'react';
import { Star, MessageSquare, ThumbsUp, Shield, RefreshCw, Send, Code, AlertTriangle, CheckCircle, Sparkles, Globe, Link, X, Loader, Zap, ZapOff, CheckSquare, ExternalLink } from 'lucide-react';
import { Review, AgencyBranding } from '../types';
import * as geminiService from '../services/geminiService';

interface ReputationManagerProps {
  branding: AgencyBranding;
  onUpdateBranding: (branding: AgencyBranding) => void;
}

const ReputationManager: React.FC<ReputationManagerProps> = ({ branding, onUpdateBranding }) => {
  const [reviews, setReviews] = useState<Review[]>([]);
  const [activeTab, setActiveTab] = useState<'dashboard' | 'reviews' | 'settings'>('dashboard');
  const [isGenerating, setIsGenerating] = useState(false);
  const [replyDrafts, setReplyDrafts] = useState<Record<string, string>>({});

  // Connection State
  const [isConnecting, setIsConnecting] = useState(false);
  const [isConnectModalOpen, setIsConnectModalOpen] = useState(false);
  const [businessNameInput, setBusinessNameInput] = useState(branding.googleBusiness?.businessName || '');
  const [businessLocInput, setBusinessLocInput] = useState(branding.googleBusiness?.location || '');
  
  const [sentimentData, setSentimentData] = useState<any>(null);

  const googleConnected = branding.googleBusiness?.connected || false;
  const autoPilot = branding.googleBusiness?.autoPilot || false;

  useEffect(() => {
    if (googleConnected) {
        // Fetch existing reviews from system or simulate
        const fetchInitial = async () => {
            const initialReviews = await geminiService.generateMockGoogleReviews(branding.googleBusiness?.businessName || 'Nexus');
            setReviews(initialReviews);
            const analysis = await geminiService.analyzeReviewSentiment(initialReviews);
            setSentimentData(analysis);
        };
        fetchInitial();
    }
  }, [googleConnected]);

  const totalReviews = reviews.length;
  const avgRating = branding.googleBusiness?.rating || (reviews.length > 0 ? (reviews.reduce((acc, r) => acc + r.rating, 0) / reviews.length).toFixed(1) : "0.0");
  const nps = 72; 

  const handleGenerateReply = async (review: Review) => {
    setIsGenerating(true);
    const draft = await geminiService.generateReviewReply(review);
    setReplyDrafts({ ...replyDrafts, [review.id]: draft });
    setIsGenerating(false);
  };

  const handlePostReply = (id: string) => {
    setReviews(reviews.map(r => r.id === id ? { ...r, status: 'Replied', reply: replyDrafts[id] } : r));
    const newDrafts = { ...replyDrafts };
    delete newDrafts[id];
    setReplyDrafts(newDrafts);
  };

  const handleConnectGoogle = async () => {
    if (!businessNameInput || !businessLocInput) return;
    setIsConnecting(true);
    
    try {
        const profile = await geminiService.verifyBusinessPresence(businessNameInput, businessLocInput);
        
        if (profile.exists) {
            onUpdateBranding({
                ...branding,
                googleBusiness: {
                    connected: true,
                    businessName: profile.officialName || businessNameInput,
                    location: businessLocInput,
                    autoPilot: false,
                    rating: profile.rating,
                    reviewCount: profile.reviewCount,
                    lastSync: new Date().toISOString()
                }
            });
            setIsConnectModalOpen(false);
            alert(`Success: "${profile.officialName}" connected.`);
        } else {
            alert("No matching Google Business Profile found. Please verify the entity name and market location.");
        }
    } catch (e) {
        alert("Verification Protocol Failed.");
    } finally {
        setIsConnecting(false);
    }
  };

  const toggleAutoPilot = () => {
    onUpdateBranding({
        ...branding,
        googleBusiness: {
            ...(branding.googleBusiness || { connected: false, autoPilot: false }),
            autoPilot: !autoPilot
        }
    });
  };

  return (
    <div className="max-w-6xl mx-auto space-y-8 animate-fade-in pb-10">
      
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-4xl font-black text-slate-900 flex items-center gap-3 uppercase tracking-tighter">
            <Star className="text-yellow-400 fill-yellow-400" size={36} /> Reputation Sentinel
          </h1>
          <p className="text-slate-500 font-medium mt-1">Autonomous Google Business link & sentiment audit.</p>
        </div>
        <div className="flex bg-slate-100 p-1.5 rounded-2xl shadow-inner border border-slate-200">
           <button onClick={() => setActiveTab('dashboard')} className={`px-6 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${activeTab === 'dashboard' ? 'bg-white shadow-md text-blue-600' : 'text-slate-400 hover:text-slate-700'}`}>Pulse</button>
           <button onClick={() => setActiveTab('reviews')} className={`px-6 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${activeTab === 'reviews' ? 'bg-white shadow-md text-blue-600' : 'text-slate-400 hover:text-slate-700'}`}>Review Stream</button>
           <button onClick={() => setActiveTab('settings')} className={`px-6 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${activeTab === 'settings' ? 'bg-white shadow-md text-blue-600' : 'text-slate-400 hover:text-slate-700'}`}>Autopilot</button>
        </div>
      </div>

      {!googleConnected && activeTab === 'dashboard' && (
        <div className="bg-white p-12 rounded-[3rem] border border-slate-200 shadow-xl flex flex-col items-center text-center space-y-8 animate-fade-in relative overflow-hidden">
            <div className="absolute top-0 right-0 p-10 opacity-5"><Globe size={240} /></div>
            <div className="w-24 h-24 bg-slate-50 text-slate-300 rounded-[2.5rem] flex items-center justify-center border-2 border-dashed border-slate-200 shadow-inner">
                <Globe size={48} />
            </div>
            <div className="max-w-md">
                <h3 className="text-2xl font-black text-slate-900 uppercase tracking-tight mb-2">Connect Google Business</h3>
                <p className="text-slate-500 text-sm font-medium leading-relaxed">
                    Link your GBP account to activate automated review responses, local SEO syncing, and real-time sentiment alerts.
                </p>
            </div>
            <button 
                onClick={() => setIsConnectModalOpen(true)}
                className="px-12 py-4 bg-slate-950 text-white rounded-2xl font-black uppercase text-[10px] tracking-[0.2em] hover:bg-blue-600 transition-all shadow-2xl shadow-black/10 transform active:scale-95"
            >
                Link Google Account
            </button>
        </div>
      )}

      {googleConnected && activeTab === 'dashboard' && (
        <div className="space-y-8 animate-fade-in">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="bg-slate-950 text-white p-8 rounded-[2.5rem] shadow-2xl relative overflow-hidden group">
                    <div className="absolute top-0 right-0 p-8 opacity-10 group-hover:scale-110 transition-transform"><Star size={120} /></div>
                    <div className="relative z-10">
                        <p className="text-emerald-400 text-[9px] font-black uppercase tracking-widest mb-4 flex items-center gap-2">
                           <CheckCircle size={10} /> Google Sync Active
                        </p>
                        <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1">Average Global Rating</p>
                        <div className="flex items-end gap-3 mt-1">
                            <h3 className="text-5xl font-black text-white tracking-tighter">{avgRating}</h3>
                            <div className="flex mb-2">
                                {[1,2,3,4,5].map(i => <Star key={i} size={16} className={`${i <= Math.round(Number(avgRating)) ? 'text-yellow-400 fill-yellow-400' : 'text-slate-800'}`} />)}
                            </div>
                        </div>
                        <p className="text-[10px] font-black text-slate-400 mt-6 uppercase tracking-widest">
                            {branding.googleBusiness?.reviewCount || totalReviews} verified mentions detected
                        </p>
                    </div>
                </div>

                <div className="bg-white border border-slate-200 p-8 rounded-[2.5rem] shadow-sm flex flex-col justify-between group hover:border-blue-300 transition-all">
                    <div className="flex justify-between items-start">
                        <div>
                            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Net Promoter Score</p>
                            <h3 className="text-4xl font-black text-slate-900 mt-2 tracking-tighter">{nps}</h3>
                        </div>
                        <div className="p-3 bg-blue-50 text-blue-600 rounded-2xl group-hover:scale-110 transition-transform"><ThumbsUp size={24}/></div>
                    </div>
                    <div className="mt-8">
                        <div className="w-full bg-slate-100 h-1.5 rounded-full overflow-hidden">
                            <div className="bg-blue-600 h-full shadow-[0_0_100px_rgba(37,99,235,0.4)]" style={{ width: `${nps}%` }}></div>
                        </div>
                        <p className="text-[9px] font-black text-slate-400 mt-3 uppercase tracking-widest">Performance: High Fidelity</p>
                    </div>
                </div>

                <div className="bg-white border border-slate-200 p-8 rounded-[2.5rem] shadow-sm flex flex-col justify-between group hover:border-emerald-300 transition-all">
                    <div className="flex justify-between items-start">
                        <div>
                            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Sentiment Shield</p>
                            <h3 className="text-4xl font-black text-emerald-600 mt-2 tracking-tighter">Engaged</h3>
                        </div>
                        <div className="p-3 bg-emerald-50 text-emerald-600 rounded-2xl group-hover:scale-110 transition-transform"><Shield size={24}/></div>
                    </div>
                    <p className="text-[10px] text-slate-500 mt-8 leading-relaxed font-medium uppercase tracking-widest">
                        Redirecting <strong className="text-slate-900">100%</strong> of tier 1 reviews.<br/>
                        Intercepting low-yield feedback.
                    </p>
                </div>
            </div>

            <div className="bg-indigo-950 rounded-[2.5rem] p-10 text-white shadow-2xl relative overflow-hidden border border-white/5">
                <div className="absolute top-0 right-0 p-10 opacity-10"><MessageSquare size={180} /></div>
                <h3 className="font-black text-xs uppercase tracking-[0.3em] text-indigo-300 mb-8 flex items-center gap-2 relative z-10">
                    <Sparkles size={16} /> Neural Sentiment Intelligence
                </h3>
                
                {sentimentData ? (
                    <div className="space-y-8 relative z-10">
                        <p className="text-xl font-medium text-indigo-100 italic leading-relaxed border-l-2 border-indigo-500/30 pl-6">
                            "{sentimentData.summary}"
                        </p>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div className="p-6 bg-white/5 border border-white/10 rounded-2xl">
                                <p className="text-[10px] font-black text-emerald-400 uppercase tracking-widest mb-4">Positive Nuclei</p>
                                <div className="flex flex-wrap gap-2">
                                    {sentimentData.positiveKeywords?.map((k: string) => (
                                        <span key={k} className="text-[10px] font-black uppercase px-3 py-1 bg-white/5 border border-white/10 rounded-lg text-slate-300">{k}</span>
                                    ))}
                                </div>
                            </div>
                            <div className="p-6 bg-white/5 border border-white/10 rounded-2xl">
                                <p className="text-[10px] font-black text-red-400 uppercase tracking-widest mb-4">Vulnerability Matrix</p>
                                <div className="flex flex-wrap gap-2">
                                    {sentimentData.negativeKeywords?.map((k: string) => (
                                        <span key={k} className="text-[10px] font-black uppercase px-3 py-1 bg-white/5 border border-white/10 rounded-lg text-slate-300">{k}</span>
                                    ))}
                                </div>
                            </div>
                        </div>
                    </div>
                ) : (
                    <div className="flex flex-col items-center justify-center py-20 text-slate-600">
                        <RefreshCw className="animate-spin mb-4" size={32} />
                        <p className="text-[10px] font-black uppercase tracking-widest">Scanning Neural Data...</p>
                    </div>
                )}
            </div>
        </div>
      )}

      {activeTab === 'reviews' && (
        <div className="grid grid-cols-1 gap-4 animate-fade-in pb-12">
            <div className="flex justify-between items-center mb-4 px-2">
                <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.3em]">Review Execution Stream</h3>
                <div className="flex gap-4">
                    <span className="text-[9px] font-black text-blue-500 uppercase tracking-widest flex items-center gap-1.5"><Globe size={12}/> Google Stream</span>
                    <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-1.5"><Shield size={12}/> Internal Protocol</span>
                </div>
            </div>
            {reviews.map(review => (
                <div key={review.id} className={`bg-white border p-8 rounded-[2.5rem] shadow-sm hover:shadow-lg transition-all group relative overflow-hidden ${review.status === 'Replied' ? 'border-emerald-100 bg-emerald-50/10' : 'border-slate-200'}`}>
                    {review.source === 'Google' && <div className="absolute top-0 right-0 w-2 h-2 bg-blue-500 m-4 rounded-full shadow-[0_0_8px_rgba(59,130,246,0.6)]"></div>}
                    <div className="flex flex-col md:flex-row justify-between items-start mb-6 gap-6">
                        <div className="flex items-center gap-6">
                            <div className="w-14 h-14 bg-slate-950 rounded-2xl flex items-center justify-center font-black text-white text-xl shadow-xl transform rotate-3 transition-transform group-hover:rotate-0">
                                {review.contactName.charAt(0)}
                            </div>
                            <div>
                                <h4 className="font-black text-slate-900 text-lg uppercase tracking-tight">{review.contactName}</h4>
                                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mt-1">{review.company} • via {review.source} • {review.date}</p>
                            </div>
                        </div>
                        <div className="flex items-center gap-1 bg-slate-50 px-4 py-2 rounded-xl border border-slate-100">
                            {[1,2,3,4,5].map(i => <Star key={i} size={14} className={`${i <= review.rating ? 'text-yellow-400 fill-yellow-400' : 'text-slate-200'}`} />)}
                        </div>
                    </div>
                    
                    <p className="text-slate-700 text-base font-bold italic leading-relaxed mb-8 border-l-2 border-slate-100 pl-6">"{review.comment}"</p>
                    
                    {review.status === 'Pending' && !replyDrafts[review.id] && (
                        <div className="flex justify-end pt-4 border-t border-slate-50">
                            <button 
                                onClick={() => handleGenerateReply(review)}
                                disabled={isGenerating}
                                className="px-6 py-2.5 bg-slate-900 text-white rounded-xl text-[10px] font-black uppercase tracking-widest flex items-center gap-2 hover:bg-blue-600 transition-all shadow-lg shadow-black/10 transform active:scale-95"
                            >
                                {isGenerating ? <RefreshCw className="animate-spin" size={12}/> : <Sparkles size={12}/>} Synthesize Response
                            </button>
                        </div>
                    )}

                    {replyDrafts[review.id] && (
                        <div className="bg-slate-50 border border-slate-200 rounded-[2rem] p-8 mt-2 animate-fade-in">
                            <div className="flex justify-between items-center mb-4">
                                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Autonomous Draft</p>
                                <button onClick={() => { const d = {...replyDrafts}; delete d[review.id]; setReplyDrafts(d); }} className="text-slate-400 hover:text-red-500"><X size={16}/></button>
                            </div>
                            <textarea 
                                className="w-full text-sm font-medium bg-white border border-slate-200 rounded-2xl p-4 text-slate-600 h-24 mb-6 focus:ring-2 focus:ring-blue-500 outline-none transition-all resize-none shadow-inner"
                                value={replyDrafts[review.id]}
                                onChange={(e) => setReplyDrafts({...replyDrafts, [review.id]: e.target.value})}
                            />
                            <div className="flex gap-3 justify-end">
                                <button onClick={() => handlePostReply(review.id)} className="bg-blue-600 text-white font-black py-3 px-8 rounded-xl transition-all flex items-center justify-center gap-2 uppercase text-[10px] tracking-widest shadow-xl active:scale-95">
                                    <Send size={14}/> Transmit to {review.source}
                                </button>
                            </div>
                        </div>
                    )}

                    {review.status === 'Replied' && (
                        <div className="bg-emerald-50 border-l-4 border-emerald-500 p-6 rounded-r-[1.5rem] mt-2 shadow-sm animate-fade-in">
                            <p className="text-[10px] font-black text-emerald-700 uppercase tracking-widest mb-2 flex items-center gap-2"><CheckCircle size={10}/> Response Transmitted</p>
                            <p className="text-sm text-slate-700 font-medium italic">"{review.reply}"</p>
                        </div>
                    )}
                </div>
            ))}
        </div>
      )}

      {activeTab === 'settings' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 animate-fade-in pb-12">
            <div className={`p-10 rounded-[3rem] border-2 transition-all flex flex-col justify-between ${autoPilot ? 'bg-emerald-50 border-emerald-200 shadow-xl' : 'bg-white border-slate-200 shadow-sm'}`}>
                <div>
                    <div className="flex justify-between items-start mb-10">
                        <div className={`p-4 rounded-2xl shadow-lg ${autoPilot ? 'bg-emerald-500 text-white' : 'bg-slate-100 text-slate-400'}`}>
                            <Zap size={32} />
                        </div>
                        <div className={`px-4 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest border ${autoPilot ? 'bg-emerald-100 text-emerald-700 border-emerald-200' : 'bg-slate-100 text-slate-500 border-slate-200'}`}>
                            {autoPilot ? 'Protocol Active' : 'Off-Line'}
                        </div>
                    </div>
                    <h3 className="text-2xl font-black text-slate-900 uppercase tracking-tight mb-4">Neural Autopilot</h3>
                    <p className="text-slate-500 text-sm font-medium leading-relaxed mb-10">
                        When enabled, Nexus AI will automatically draft and post verified responses to **4 and 5 star reviews** within 15 minutes of detection. 
                        Critical reviews (1-2 stars) will always trigger a manual triage alert and will never be auto-replied.
                    </p>
                </div>
                <button 
                    onClick={toggleAutoPilot}
                    className={`w-full py-5 rounded-2xl font-black uppercase text-[10px] tracking-[0.2em] transition-all shadow-xl flex items-center justify-center gap-3 active:scale-95 ${autoPilot ? 'bg-slate-950 text-white' : 'bg-blue-600 text-white hover:bg-blue-500'}`}
                >
                    {autoPilot ? <ZapOff size={16}/> : <Zap size={16}/>}
                    {autoPilot ? 'Abort Autopilot' : 'Engage Autopilot'}
                </button>
            </div>

            <div className="bg-white border border-slate-200 p-10 rounded-[3rem] shadow-sm flex flex-col">
                <h3 className="text-xl font-black text-slate-900 uppercase tracking-tight mb-8 flex items-center gap-3">
                    <Code size={24} className="text-blue-600" /> SEO Widget Integration
                </h3>
                <p className="text-slate-500 text-sm font-medium leading-relaxed mb-10">
                    Display your neural review aggregate on your landing page. This widget pulls live data from your linked Google account.
                </p>
                <div className="flex-1 bg-slate-900 p-6 rounded-2xl border border-white/5 shadow-inner mb-8 font-mono text-[10px] text-blue-400 overflow-hidden relative">
                    <code>{`<script src="https://cdn.nexus.funding/v2/rep-widget.js"></script>`}</code><br/>
                    <code>{`<div id="nexus-reviews" data-key="NX_${Math.random().toString(36).substring(7).toUpperCase()}"></div>`}</code>
                    <button onClick={() => { navigator.clipboard.writeText(`<script src="https://cdn.nexus.funding/v2/rep-widget.js"></script>\n<div id="nexus-reviews" data-key="NX_GHOST"></div>`); alert('Widget code copied!'); }} className="absolute bottom-4 right-4 bg-white/5 hover:bg-white/10 p-2 rounded-lg transition-all text-slate-400">
                        <Link size={16}/>
                    </button>
                </div>
                <div className="bg-blue-50 border border-blue-100 p-4 rounded-xl flex items-start gap-4">
                    <AlertTriangle size={20} className="text-blue-600 shrink-0" />
                    <p className="text-xs text-blue-700 font-medium">
                        Increasing your Google review response rate to <span className="font-bold">100%</span> for positive reviews can boost local rankings by <span className="font-bold">24%</span>.
                    </p>
                </div>
            </div>
        </div>
      )}

      {/* Account Link Modal */}
      {isConnectModalOpen && (
        <div className="fixed inset-0 z-[100] bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="bg-white w-full max-w-lg rounded-[2.5rem] shadow-2xl overflow-hidden animate-fade-in relative border border-white/10">
                <div className="absolute top-0 right-0 p-8 opacity-5 transition-all"><Globe size={180}/></div>
                <div className="p-8 border-b border-slate-100 flex justify-between items-center bg-slate-50 relative z-10">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-blue-600 rounded-xl text-white shadow-lg"><Globe size={20}/></div>
                        <h3 className="font-black text-lg text-slate-900 uppercase tracking-tighter">Google Business Protocol</h3>
                    </div>
                    <button onClick={() => setIsConnectModalOpen(false)} className="text-slate-400 hover:text-slate-600 transition-all"><X size={24}/></button>
                </div>
                <div className="p-10 space-y-8 relative z-10">
                    <p className="text-sm text-slate-500 font-medium leading-relaxed">Enter your business vitals exactly as they appear in Google Local to synchronize verified reviews.</p>
                    <div className="space-y-6">
                        <div>
                            <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 ml-1">Merchant Trading Name</label>
                            <input 
                                type="text" 
                                placeholder="e.g. Nexus Funding Inc."
                                value={businessNameInput}
                                onChange={(e) => setBusinessNameInput(e.target.value)}
                                className="w-full p-4 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                            />
                        </div>
                        <div>
                            <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 ml-1">Market HQ City</label>
                            <input 
                                type="text" 
                                placeholder="e.g. Miami, FL"
                                value={businessLocInput}
                                onChange={(e) => setBusinessLocInput(e.target.value)}
                                className="w-full p-4 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                            />
                        </div>
                    </div>
                    <button 
                        onClick={handleConnectGoogle}
                        disabled={isConnecting || !businessNameInput || !businessLocInput}
                        className="w-full bg-slate-950 text-white py-5 rounded-2xl font-black uppercase text-[10px] tracking-[0.2em] hover:bg-blue-600 flex items-center justify-center gap-3 disabled:opacity-50 transition-all shadow-2xl transform active:scale-95"
                    >
                        {isConnecting ? <RefreshCw className="animate-spin" size={18}/> : <Link size={18}/>}
                        {isConnecting ? 'Verifying Neural Link...' : 'Engage Google Handshake'}
                    </button>
                    <div className="flex items-center justify-center gap-2 text-slate-400 text-[8px] font-black uppercase tracking-widest">
                        <Shield size={10} /> Bank-Grade TLS Verification
                    </div>
                </div>
            </div>
        </div>
      )}

    </div>
  );
};

export default ReputationManager;
