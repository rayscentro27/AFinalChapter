
import React, { useState, useEffect } from 'react';
import { Contact, MarketingAutomation, SocialPost, AgencyBranding } from '../types';
import { 
  Zap, Mail, Sparkles, Video, Instagram, Linkedin, Smartphone, 
  RefreshCw, Film, Wand2, CheckCircle, Share2, Play, 
  AlertCircle, Layout, Plus, Trash2, Calendar, Music as TikTokIcon, Key, ExternalLink,
  AlertTriangle, Settings, ArrowRight, BrainCircuit, Youtube, Link as LinkIcon, Layers,
  Download, Search, Globe, MapPin, BarChart3, ListChecks, Type, Copy, Phone, Building2, Fingerprint,
  Save, LayoutDashboard, Target, MessageSquare, ShieldCheck, X, TrendingUp, Lightbulb, Mail as MailIcon
} from 'lucide-react';
import * as geminiService from '../services/geminiService';
import * as mailerliteService from '../services/mailerliteService';
import EmailCampaignManager from './EmailCampaignManager';

interface MarketingCampaignsProps {
  contacts: Contact[];
  branding: AgencyBranding;
  onUpdateContact?: (contact: Contact) => void;
  onUpdateBranding?: (branding: AgencyBranding) => void;
}

const MarketingCampaigns: React.FC<MarketingCampaignsProps> = ({ contacts, branding, onUpdateContact, onUpdateBranding }) => {
  const [activeTab, setActiveTab] = useState<'studio' | 'strategy' | 'seo' | 'local' | 'emails' | 'hooks' | 'footprint'>('studio');
  
  // Creative Mode: 'text' or 'recreate'
  const [creativeMode, setCreativeMode] = useState<'text' | 'recreate'>('text');
  
  // Footprint State - Linked to Global Branding
  const [localFootprint, setLocalFootprint] = useState(branding);
  const [footprintCitations, setFootprintCitations] = useState<any>(null);
  const [isCiting, setIsCiting] = useState(false);
  const [socialBios, setSocialBios] = useState<any>(null);
  const [isBioLoading, setIsBioLoading] = useState(false);

  // Strategy State
  const [marketingDirectives, setMarketingDirectives] = useState<any[]>([]);
  const [isAnalyzingStrategy, setIsAnalyzingStrategy] = useState(false);

  // MailerLite State
  const [isSyncingMailerLite, setIsSyncingMailerLite] = useState(false);

  // Sync when global branding changes
  useEffect(() => {
    setLocalFootprint(branding);
  }, [branding]);

  // Studio State
  const [videoPrompt, setVideoPrompt] = useState('');
  const [youtubeUrl, setYoutubeUrl] = useState('');
  const [selectedPlatform, setSelectedPlatform] = useState<'TikTok' | 'Instagram' | 'LinkedIn' | 'Facebook' | 'YouTube'>('YouTube');
  const [isGenerating, setIsGenerating] = useState(false);
  const [neuralStatus, setNeuralStatus] = useState('');
  const [generatedPost, setGeneratedPost] = useState<SocialPost | null>(null);
  const [hasKey, setHasKey] = useState(false);
  
  // SEO State
  const [seoIndustry, setSeoIndustry] = useState('');
  const [seoTargetMarket, setSeoTargetMarket] = useState('');
  const [seoResult, setSeoResult] = useState<any>(null);
  const [isSeoLoading, setIsSeoLoading] = useState(false);

  // GBP State
  const [gbpDesc, setGbpDesc] = useState('');
  const [gbpLoc, setGbpLoc] = useState('');
  const [gbpResult, setGbpResult] = useState<any>(null);
  const [isGbpLoading, setIsGbpLoading] = useState(false);

  // Viral Hooks State
  const [hookTopic, setHookTopic] = useState('');
  const [hookResults, setHookResults] = useState<string[]>([]);
  const [isHookLoading, setIsHookLoading] = useState(false);

  useEffect(() => {
    const checkKey = async () => {
      // Access aistudio via window casting as per guidelines
      if ((window as any).aistudio) {
        const selected = await (window as any).aistudio.hasSelectedApiKey();
        setHasKey(selected);
      }
    };
    checkKey();
  }, []);

  const handleCaptureTrainingFromSync = async (syncSummary: mailerliteService.MailerLiteBulkSyncResult) => {
    const additionalInfo = window.prompt('Add additional information to train AI employees (required):', 'Focus on failed sync contacts, compliance-safe outreach language, and retry sequencing.');
    if (!additionalInfo || !additionalInfo.trim()) return;

    const employeesRaw = window.prompt('Target AI employees (comma-separated):', 'Nexus Founder,Nexus Analyst,Sentinel Scout') || '';
    const employeeTargets = employeesRaw
      .split(',')
      .map((v) => v.trim())
      .filter(Boolean);

    const tenantIdRaw = window.prompt('Tenant UUID for task creation (required if you manage multiple tenants):', '') || '';
    const tenantId = tenantIdRaw.trim() || undefined;

    const taskTitle =
      window.prompt(
        'Task title:',
        'Review MailerLite sync outcomes and apply new employee training patch'
      ) || 'Review MailerLite sync outcomes and apply new employee training patch';

    const result = await mailerliteService.createTaskAndTrainingFromMailerLite({
      trainingTitle: `MailerLite Sync Training ${new Date().toISOString().slice(0, 10)}`,
      additionalInfo: additionalInfo.trim(),
      tenantId,
      employeeTargets,
      createTask: true,
      autoApplyPatches: true,
      task: {
        title: taskTitle,
        type: 'education',
        signal: 'yellow',
      },
      syncSummary: {
        total: syncSummary.total,
        successful: syncSummary.successful,
        failed: syncSummary.failed || 0,
        error: syncSummary.error,
      },
    });

    if (result.error) {
      alert(`Training/task creation failed: ${result.error}`);
      return;
    }

    alert(
      `Training captured. Task: ${result.task_id || 'not created'}. ` +
        `Patches applied: ${result.patches_applied || 0}, skipped: ${result.patches_skipped || 0}, failed: ${result.patches_failed || 0}.`
    );
  };

  const handleSyncMailerLite = async () => {
      if (!branding.mailerLite?.groupId?.trim()) {
        alert('MailerLite Group ID is missing. Set it in Settings -> Marketing Nodes.');
        return;
      }

      setIsSyncingMailerLite(true);
      const res = await mailerliteService.bulkSyncLeads(contacts, branding);
      setIsSyncingMailerLite(false);

      if (res.error) {
        const firstIssue = res.errors?.[0]?.error ? ` First issue: ${res.errors[0].error}` : '';
        alert(`MailerLite sync failed: ${res.error}.${firstIssue}`);
        return;
      }

      const failedCount = res.failed || 0;
      const summary = `MailerLite protocol execution: ${res.successful} synchronized out of ${res.total}${failedCount ? ` (${failedCount} failed)` : ''}.`;
      const createTraining = window.confirm(`${summary}\n\nCreate a follow-up task + training update for AI employees now?`);
      if (createTraining) {
        await handleCaptureTrainingFromSync(res);
        return;
      }

      alert(summary);
  };

  const handleRunSEO = async () => {
    if (!seoIndustry || !seoTargetMarket) return;
    setIsSeoLoading(true);
    const res = await geminiService.generateSEOStrategy(seoIndustry, seoTargetMarket);
    setSeoResult(res);
    setIsSeoLoading(false);
  };

  const handleRunGBP = async () => {
    if (!gbpDesc || !gbpLoc) return;
    setIsGbpLoading(true);
    const res = await geminiService.optimizeGBP(gbpDesc, gbpLoc);
    setGbpResult(res);
    setIsGbpLoading(false);
  };

  const handleRunHooks = async () => {
    if (!hookTopic) return;
    setIsHookLoading(true);
    const res = await geminiService.generateViralHooks(hookTopic);
    setHookResults(res);
    setIsHookLoading(false);
  };

  const handleSaveFootprint = () => {
      if (onUpdateBranding) {
          onUpdateBranding(localFootprint);
          alert("Digital Vitals Synchronized with Infrastructure Settings.");
      }
  };

  const handleGenerateCitations = async () => {
    setIsCiting(true);
    const res = await geminiService.generateDirectoryCitations(localFootprint);
    setFootprintCitations(res);
    setIsCiting(false);
  };

  const handleGenerateBios = async () => {
      setIsBioLoading(true);
      const res = await geminiService.generateSocialBios(localFootprint);
      setSocialBios(res);
      setIsBioLoading(false);
  };

  const handleAnalyzeMarketingStrategy = async () => {
      setIsAnalyzingStrategy(true);
      const res = await geminiService.generateMarketingDirectives(contacts);
      setMarketingDirectives(res.directives || []);
      setIsAnalyzingStrategy(false);
  };

  const handleOpenKeyPicker = async () => {
    if ((window as any).aistudio) {
      await (window as any).aistudio.openSelectKey();
      setHasKey(true);
    }
  };

  const handleGenerateContent = async () => {
    if (creativeMode === 'text' && !videoPrompt) return;
    if (creativeMode === 'recreate' && !youtubeUrl) return;
    
    // Ensure AI Studio key selection state is verified before generation
    if ((window as any).aistudio) {
      const selected = await (window as any).aistudio.hasSelectedApiKey();
      if (!selected) {
        await (window as any).aistudio.openSelectKey();
        setHasKey(true);
      }
    }
    
    setIsGenerating(true);
    setGeneratedPost(null);
    
    const aspectRatio = ['TikTok', 'Instagram'].includes(selectedPlatform) ? '9:16' : '16:9';
    
    const statusCycle = creativeMode === 'recreate' ? [
        "Infiltrating Source Video...",
        "Deconstructing Semantic Narrative...",
        "Abstracting Visual Metaphors...",
        "Synthesizing Cinema (Veo 3.1)...",
        "Finalizing Faceless Render..."
    ] : [
      "Interfacing with Neural Core...",
      "Deconstructing Creative Directive...",
      "Rendering Cinema-Grade Frames (Veo 3.1)...",
      "Optimizing for " + selectedPlatform + " algorithms...",
      "Finalizing Visual Polish..."
    ];
    
    let i = 0;
    const interval = setInterval(() => {
      setNeuralStatus(statusCycle[i % statusCycle.length]);
      i++;
    }, 4500);

    try {
      let finalPrompt = videoPrompt;

      if (creativeMode === 'recreate') {
        finalPrompt = await geminiService.transformVideoToDirective(youtubeUrl);
      }

      const videoUrl = await geminiService.generateSocialVideo(finalPrompt, aspectRatio);
      const caption = await geminiService.generateSocialCaption(selectedPlatform, finalPrompt);

      if (videoUrl) {
        const newPost: SocialPost = {
          id: `post_${Date.now()}`,
          platform: selectedPlatform as any,
          content: caption,
          videoUrl,
          status: 'Ready',
          aspectRatio
        };
        setGeneratedPost(newPost);
      }
    } catch (e: any) {
      if (e.message?.includes("Requested entity was not found")) {
        setHasKey(false);
        alert("Session Expired. Please re-select your AI Studio Key.");
        if ((window as any).aistudio) await (window as any).aistudio.openSelectKey();
      } else {
        alert("Neural synthesis interrupted.");
      }
    } finally {
      clearInterval(interval);
      setIsGenerating(false);
      setNeuralStatus('');
    }
  };

  const CopyableSnippet = ({ label, value, icon }: any) => (
      <div className="bg-slate-50 border border-slate-200 p-4 rounded-2xl flex items-center justify-between group hover:border-emerald-300 transition-all">
          <div className="flex-1 overflow-hidden pr-4">
              <div className="flex items-center gap-2 text-[9px] font-black uppercase text-slate-400 mb-1">
                  {icon} {label}
              </div>
              <p className="text-xs font-bold text-slate-800 truncate">{value || 'Not Set'}</p>
          </div>
          <button onClick={() => { if(value) { navigator.clipboard.writeText(value); alert('Copied!'); } }} className="p-2.5 text-slate-300 hover:text-emerald-600 transition-colors">
              <Copy size={16}/>
          </button>
      </div>
  );

  return (
    <div className="h-full flex flex-col animate-fade-in pb-12">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-4">
        <div>
          <h1 className="text-4xl font-black text-slate-900 tracking-tighter uppercase flex items-center gap-3">
            <Film className="text-blue-600" size={36} /> Content Factory
          </h1>
          <p className="text-slate-500 font-medium mt-1">Autonomous exposure and corporate identity tools.</p>
        </div>
        
        <div className="flex bg-slate-100 p-1.5 rounded-2xl shadow-inner border border-slate-200 overflow-x-auto no-scrollbar">
           {[
             { id: 'studio', label: 'AI Video', icon: <Video size={16}/> },
             { id: 'strategy', label: 'Strategy', icon: <TrendingUp size={16}/> },
             { id: 'footprint', label: 'Footprint', icon: <Fingerprint size={16}/> },
             { id: 'seo', label: 'SEO Architect', icon: <Globe size={16}/> },
             { id: 'local', label: 'Local Maps', icon: <MapPin size={16}/> },
             { id: 'hooks', label: 'Hooks', icon: <Sparkles size={16}/> },
             { id: 'emails', label: 'Emails', icon: <Mail size={16}/> }
           ].map(tab => (
             <button 
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)} 
                className={`px-6 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all flex items-center gap-2 whitespace-nowrap ${activeTab === tab.id ? 'bg-white shadow-md text-blue-600' : 'text-slate-400 hover:text-slate-700'}`}
             >
                {tab.icon} {tab.label}
             </button>
           ))}
        </div>
      </div>

      {activeTab === 'studio' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 flex-1">
           <div className="lg:col-span-5 bg-white rounded-[2.5rem] border border-slate-200 shadow-xl p-10 flex flex-col h-fit">
              <div className="mb-10">
                 <div className="inline-flex items-center gap-2 bg-indigo-50 text-indigo-600 px-4 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest mb-6 border border-indigo-100 shadow-sm">
                    <Sparkles size={14} /> Cinema Synthesis: Veo 3.1
                 </div>
                 <h2 className="text-2xl font-black text-slate-900 tracking-tight uppercase">Generate Asset</h2>
                 
                 <div className="mt-8 flex bg-slate-100 p-1.5 rounded-2xl border border-slate-200 shadow-inner">
                    <button 
                        onClick={() => setCreativeMode('text')}
                        className={`flex-1 py-3 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all flex items-center justify-center gap-2 ${creativeMode === 'text' ? 'bg-white shadow-lg text-blue-600' : 'text-slate-50'}`}
                    >
                        <Film size={14} /> Text-to-Video
                    </button>
                    <button 
                        onClick={() => setCreativeMode('recreate')}
                        className={`flex-1 py-3 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all flex items-center justify-center gap-2 ${creativeMode === 'recreate' ? 'bg-white shadow-lg text-indigo-600' : 'text-slate-50'}`}
                    >
                        <RefreshCw size={14} /> Neural Recreate
                    </button>
                 </div>

                 {branding.mailerLite?.groupId && (
                   <div className="mt-6 p-6 bg-emerald-50 border border-emerald-200 rounded-[1.5rem] shadow-sm animate-fade-in">
                      <p className="text-xs text-emerald-800 font-black uppercase tracking-widest flex items-center gap-2 mb-3">
                        <MailIcon size={16} /> MailerLite Sync Node
                      </p>
                      <p className="text-[10px] text-emerald-700 mb-4 font-medium">
                        Uses server-side key storage via <span className="font-mono">MAILERLITE_API_KEY</span>.
                      </p>
                      <button 
                        onClick={handleSyncMailerLite} 
                        disabled={isSyncingMailerLite}
                        className="w-full py-3 bg-emerald-600 text-white text-[10px] font-black uppercase tracking-widest rounded-xl flex items-center justify-center gap-2 hover:bg-emerald-500 transition-all shadow-lg"
                      >
                        {isSyncingMailerLite ? <RefreshCw className="animate-spin" size={14}/> : <RefreshCw size={14} />} 
                        Sync Global Contacts
                      </button>
                   </div>
                 )}

                 {!hasKey && (
                   <div className="mt-6 p-6 bg-amber-50 border border-amber-200 rounded-[1.5rem] shadow-sm">
                      <p className="text-xs text-amber-800 font-black uppercase tracking-widest flex items-center gap-2 mb-3">
                        <AlertTriangle size={16} /> Link Required
                      </p>
                      <p className="text-[10px] text-amber-700 leading-relaxed mb-6 font-medium">
                        High-quality synthesis requires a Google Cloud project with billing enabled.
                        <a href="https://ai.google.dev/gemini-api/docs/billing" target="_blank" className="underline ml-1 inline-flex items-center gap-0.5">Docs <ExternalLink size={8}/></a>
                      </p>
                      <button onClick={handleOpenKeyPicker} className="w-full py-3 bg-amber-600 text-white text-[10px] font-black uppercase tracking-widest rounded-xl flex items-center justify-center gap-2 hover:bg-amber-500 transition-all shadow-lg shadow-amber-600/10">
                        <Key size={14} /> Link Project
                      </button>
                   </div>
                 )}
              </div>

              <div className="space-y-8">
                 <div>
                    <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-4">Distribution Channel</label>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                        {(['YouTube', 'TikTok', 'Instagram', 'LinkedIn', 'Facebook'] as const).map(p => (
                            <button
                                key={p}
                                onClick={() => setSelectedPlatform(p)}
                                className={`py-4 rounded-2xl text-[10px] font-black uppercase tracking-widest border transition-all flex flex-col items-center gap-3 ${selectedPlatform === p ? 'bg-slate-950 text-white border-slate-950 shadow-2xl scale-105' : 'bg-slate-50 text-slate-500 border-slate-200 hover:bg-slate-100'}`}
                            >
                                {p === 'YouTube' && <Youtube size={20} className="text-red-500" />}
                                {p === 'TikTok' && <TikTokIcon size={20}/>}
                                {p === 'Instagram' && <Instagram size={20}/>}
                                {p === 'LinkedIn' && <Linkedin size={20}/>}
                                {p === 'Facebook' && <Share2 size={20}/>}
                                {p}
                            </button>
                        ))}
                    </div>
                 </div>

                 {creativeMode === 'text' ? (
                     <div className="animate-fade-in">
                        <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-4">Creative Directive</label>
                        <textarea 
                            value={videoPrompt} 
                            onChange={(e) => setVideoPrompt(e.target.value)} 
                            placeholder="e.g. A futuristic landscape representing financial freedom with abstract gold threads..." 
                            className="w-full bg-slate-100 border-none rounded-[1.5rem] p-5 h-40 resize-none text-sm font-medium focus:ring-2 focus:ring-blue-500 transition-all outline-none" 
                        />
                     </div>
                 ) : (
                     <div className="animate-fade-in space-y-6">
                        <div>
                            <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-4">Source Video URL</label>
                            <div className="relative">
                                <Youtube className="absolute left-4 top-1/2 -translate-y-1/2 text-red-500" size={20} />
                                <input 
                                    type="text" 
                                    value={youtubeUrl}
                                    onChange={(e) => setYoutubeUrl(e.target.value)}
                                    placeholder="Paste YouTube Link..."
                                    className="w-full pl-12 pr-4 py-4 bg-slate-100 border-none rounded-2xl text-sm font-medium focus:ring-2 focus:ring-indigo-500 outline-none"
                                />
                            </div>
                        </div>
                     </div>
                 )}

                 <button 
                    onClick={handleGenerateContent}
                    disabled={isGenerating || (creativeMode === 'text' && !videoPrompt) || (creativeMode === 'recreate' && !youtubeUrl)}
                    className="w-full py-6 bg-gradient-to-br from-blue-600 to-indigo-700 text-white font-black uppercase text-xs tracking-[0.3em] rounded-[1.5rem] shadow-2xl hover:shadow-blue-500/20 transition-all flex items-center justify-center gap-4 disabled:opacity-50 transform active:scale-95"
                 >
                    {isGenerating ? <RefreshCw className="animate-spin" size={24}/> : (creativeMode === 'recreate' ? <Layers size={24} /> : <Film size={24} />)}
                    {isGenerating ? 'Synthesizing...' : (creativeMode === 'recreate' ? 'Transform to Social' : 'Manifest AI Video')}
                 </button>
              </div>
           </div>

           <div className="lg:col-span-7 flex flex-col gap-6 h-full">
              <div className="flex-1 bg-slate-950 rounded-[3.5rem] border border-white/5 shadow-2xl relative overflow-hidden flex flex-col items-center justify-center min-h-[600px]">
                 {isGenerating ? (
                    <div className="text-center animate-fade-in px-12">
                       <div className="relative mb-12 inline-block">
                          <RefreshCw size={120} className="text-blue-500 animate-spin opacity-10" />
                          {creativeMode === 'recreate' ? <Layers size={48} className="text-white absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 animate-pulse" /> : <Film size={48} className="text-white absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 animate-pulse" />}
                       </div>
                       <h3 className="text-3xl font-black text-white uppercase tracking-tighter mb-6">Neural Synthesis Active</h3>
                       <div className="bg-white/5 backdrop-blur-xl rounded-2xl p-5 border border-white/10 shadow-inner min-w-[300px]">
                          <p className="text-blue-400 font-mono text-[10px] tracking-[0.2em] uppercase">{neuralStatus}</p>
                       </div>
                    </div>
                 ) : generatedPost ? (
                    <div className="w-full h-full flex flex-col animate-fade-in">
                        <div className="flex-1 bg-black flex items-center justify-center p-12">
                            <div className={`${generatedPost.aspectRatio === '9:16' ? 'w-72 aspect-[9/16]' : 'w-full max-w-2xl aspect-video'} bg-slate-900 rounded-[3rem] overflow-hidden shadow-[0_0_80px_rgba(0,0,0,0.8)] border border-white/10 relative group`}>
                                <video 
                                    src={generatedPost.videoUrl} 
                                    autoPlay 
                                    loop 
                                    muted 
                                    playsInline
                                    className="w-full h-full object-cover"
                                />
                                <div className="absolute inset-0 bg-gradient-to-t from-black/80 to-transparent"></div>
                                <div className="absolute bottom-10 left-10 right-10">
                                    <p className="text-sm text-white line-clamp-3 font-medium opacity-90 leading-relaxed shadow-sm">{generatedPost.content}</p>
                                </div>
                            </div>
                        </div>

                        <div className="p-12 bg-slate-900/50 backdrop-blur-xl border-t border-white/5">
                           <textarea 
                              className="w-full bg-white/5 border border-white/10 rounded-2xl p-5 text-sm text-slate-300 h-28 resize-none outline-none focus:border-blue-500 transition-all font-medium leading-relaxed"
                              value={generatedPost.content}
                              readOnly
                           />
                           <div className="mt-8 flex gap-6">
                              <button onClick={() => alert("Asset Exported!")} className="flex-1 bg-white/5 hover:bg-white/10 text-white py-5 rounded-2xl font-black uppercase text-[10px] tracking-widest border border-white/10 transition-all flex items-center justify-center gap-3">
                                 <Download size={18}/> Download
                              </button>
                              <button onClick={() => alert("Asset Published!")} className="flex-1 bg-blue-600 text-white py-5 rounded-2xl font-black uppercase text-[10px] tracking-widest hover:bg-blue-50 transition-all flex items-center justify-center gap-3 shadow-2xl transform active:scale-95">
                                 <Share2 size={18}/> Publish to {generatedPost.platform}
                              </button>
                           </div>
                        </div>
                    </div>
                 ) : (
                    <div className="text-center text-slate-800">
                       <div className="w-32 h-32 bg-white/5 rounded-[2.5rem] flex items-center justify-center mx-auto mb-8 border border-white/5 shadow-inner">
                          <Wand2 size={56} className="opacity-20" />
                       </div>
                       <p className="text-xs font-black uppercase tracking-[0.3em] opacity-30">Awaiting Directive</p>
                    </div>
                 )}
              </div>
           </div>
        </div>
      )}

      {activeTab === 'strategy' && (
          <div className="space-y-8 animate-fade-in">
              <div className="bg-slate-950 p-12 rounded-[3rem] text-white shadow-2xl relative overflow-hidden border border-white/5">
                <div className="absolute top-0 right-0 p-10 opacity-10 rotate-12"><Target size={300} /></div>
                <div className="relative z-10 flex flex-col md:flex-row items-center justify-between gap-10">
                    <div className="max-w-2xl">
                        <div className="inline-flex items-center gap-2 bg-emerald-500/10 text-emerald-400 px-4 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest mb-10 border border-emerald-500/20">
                            Neural Revenue Intelligence
                        </div>
                        <h2 className="text-5xl font-black mb-8 tracking-tighter uppercase leading-[0.9]">
                            Identify the <span className="text-emerald-500">Path to Yield.</span>
                        </h2>
                        <p className="text-slate-400 text-xl leading-relaxed mb-0 font-medium">
                            Nexus AI analyzes your closed deals and stalled leads to identify high-probability niches. Launch data-backed campaigns with one click.
                        </p>
                    </div>
                    <button 
                        onClick={handleAnalyzeMarketingStrategy}
                        disabled={isAnalyzingStrategy}
                        className="bg-emerald-50 text-slate-950 px-12 py-6 rounded-[2rem] font-black uppercase text-sm tracking-[0.2em] shadow-2xl hover:bg-emerald-400 transition-all flex items-center justify-center gap-4 active:scale-95 disabled:opacity-50"
                    >
                        {isAnalyzingStrategy ? <RefreshCw className="animate-spin" size={24}/> : <Sparkles size={24}/>}
                        {isAnalyzingStrategy ? 'Scrutinizing...' : 'Audit Market Opportunity'}
                    </button>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                  {marketingDirectives.length === 0 ? (
                      <div className="col-span-3 py-24 text-center border-2 border-dashed border-slate-200 rounded-[3rem] bg-white/50">
                          <Lightbulb size={64} className="mx-auto mb-6 text-slate-200" />
                          <p className="text-sm font-black text-slate-400 uppercase tracking-widest">Execute Audit to Generate Directives</p>
                      </div>
                  ) : (
                      marketingDirectives.map((d, i) => (
                          <div key={i} className="bg-white border border-slate-200 p-8 rounded-[3rem] shadow-sm hover:shadow-xl transition-all group flex flex-col justify-between">
                              <div>
                                  <div className="flex justify-between items-start mb-6">
                                      <div className={`p-4 rounded-2xl shadow-lg transition-transform group-hover:rotate-3 ${d.urgency === 'High' ? 'bg-red-50 text-red-600 shadow-red-100' : 'bg-blue-50 text-blue-600 shadow-blue-100'}`}>
                                          <Zap size={24} fill="currentColor" />
                                      </div>
                                      <div className="text-right">
                                          <p className="text-[9px] font-black text-slate-400 uppercase">Est. ROI</p>
                                          <p className="text-xl font-black text-emerald-600">{d.projectedRoi}</p>
                                      </div>
                                  </div>
                                  <h4 className="font-black text-xl text-slate-900 uppercase tracking-tight mb-2">{d.niche}</h4>
                                  <p className="text-blue-600 text-[10px] font-black uppercase tracking-widest mb-6">Hook: {d.angle}</p>
                                  <p className="text-xs text-slate-500 font-medium leading-relaxed mb-10 italic">"{d.logic}"</p>
                              </div>
                              <button 
                                onClick={() => { setActiveTab('emails'); }}
                                className="w-full bg-slate-950 text-white py-4 rounded-2xl font-black uppercase text-[10px] tracking-widest hover:bg-blue-600 shadow-xl transition-all flex items-center justify-center gap-2"
                              >
                                  Deploy Protocol <ArrowRight size={16}/>
                              </button>
                          </div>
                      ))
                  )}
              </div>
          </div>
      )}

      {activeTab === 'footprint' && (
        <div className="space-y-8 animate-fade-in">
           <div className="bg-white border border-slate-200 rounded-[3rem] p-10 shadow-sm flex flex-col md:flex-row justify-between items-center gap-10">
              <div className="flex items-center gap-6">
                <div className="p-4 bg-emerald-50 text-emerald-600 rounded-3xl shadow-lg shadow-emerald-100 transform rotate-3"><Fingerprint size={32} /></div>
                <div>
                   <h2 className="text-3xl font-black text-slate-900 uppercase tracking-tighter">Digital Vitals</h2>
                   <p className="text-sm text-slate-500 font-medium">Synchronize your agency across the identity matrix.</p>
                </div>
              </div>
              <button 
                onClick={handleSaveFootprint}
                className="bg-slate-950 text-white px-10 py-4 rounded-2xl font-black uppercase text-[10px] tracking-widest hover:bg-emerald-600 shadow-xl transition-all active:scale-95"
              >
                  Update Identity
              </button>
           </div>

           <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
              <div className="lg:col-span-4 space-y-6">
                 <div className="bg-white border border-slate-200 p-8 rounded-[2.5rem] shadow-sm">
                    <h3 className="font-black text-xs uppercase tracking-[0.3em] text-slate-400 mb-8">N.A.P. Standard</h3>
                    <div className="space-y-6">
                       <div><label className="block text-[9px] font-black text-slate-400 uppercase tracking-widest mb-2 ml-1">Agency Name</label><input className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 text-sm font-bold" value={localFootprint.name} onChange={e => setLocalFootprint({...localFootprint, name: e.target.value})} /></div>
                       <div><label className="block text-[9px] font-black text-slate-400 uppercase tracking-widest mb-2 ml-1">Market HQ</label><input className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 text-sm font-bold" value={localFootprint.physicalAddress} onChange={e => setLocalFootprint({...localFootprint, physicalAddress: e.target.value})} /></div>
                       <div><label className="block text-[9px] font-black text-slate-400 uppercase tracking-widest mb-2 ml-1">Phone Protocol</label><input className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 text-sm font-bold" value={localFootprint.contactPhone} onChange={e => setLocalFootprint({...localFootprint, contactPhone: e.target.value})} /></div>
                    </div>
                 </div>
                 
                 <div className="bg-slate-950 rounded-[2.5rem] p-8 text-white relative overflow-hidden group">
                    <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:scale-110 transition-transform"><Smartphone size={100}/></div>
                    <h3 className="font-black text-xs uppercase tracking-widest text-emerald-400 mb-4">Neural Bio Generator</h3>
                    <p className="text-xs text-slate-400 leading-relaxed font-medium mb-8">Synthesize platform-specific bios that match your current agency magnitude.</p>
                    <button onClick={handleGenerateBios} disabled={isBioLoading} className="w-full py-4 bg-white/5 hover:bg-white/10 border border-white/10 rounded-2xl text-[9px] font-black uppercase tracking-widest transition-all flex items-center justify-center gap-2">
                        {isBioLoading ? <RefreshCw className="animate-spin" size={14}/> : <Sparkles size={14}/>} {isBioLoading ? 'Weaving...' : 'Synthesize Bios'}
                    </button>
                 </div>
              </div>

              <div className="lg:col-span-8 space-y-8">
                 <div className="bg-white border border-slate-200 p-10 rounded-[3rem] shadow-sm flex flex-col h-full">
                    <div className="flex justify-between items-center mb-10">
                        <h3 className="font-black text-xs uppercase tracking-[0.2em] text-slate-800 flex items-center gap-2"><MapPin size={18} className="text-blue-500"/> Citations & Footprint</h3>
                        <button onClick={handleGenerateCitations} disabled={isCiting} className="text-[9px] font-black text-blue-600 uppercase flex items-center gap-2 hover:underline">
                            {isCiting ? <RefreshCw className="animate-spin" size={12}/> : <ListChecks size={14}/>} {isCiting ? 'Indexing...' : 'Audit Directories'}
                        </button>
                    </div>
                    
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {footprintCitations ? Object.entries(footprintCitations).map(([k, v]: any) => (
                            <CopyableSnippet key={k} label={k} value={v} icon={<Globe size={10}/>} />
                        )) : (
                            <div className="md:col-span-2 py-20 text-center opacity-20"><Search size={48} className="mx-auto mb-4" /><p className="text-[10px] font-black uppercase">Run audit to find footprint gaps</p></div>
                        )}
                    </div>
                    
                    {socialBios && (
                        <div className="mt-12 pt-12 border-t border-slate-100 space-y-8 animate-fade-in">
                            <h4 className="font-black text-xs uppercase tracking-widest text-slate-400">Neural Bios</h4>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                <div className="bg-slate-50 p-6 rounded-2xl border border-slate-100 group relative">
                                    <span className="text-[8px] font-black uppercase text-blue-600 mb-2 block">LinkedIn Professional</span>
                                    <p className="text-xs text-slate-600 font-medium italic leading-relaxed">"{socialBios.linkedin}"</p>
                                    <button onClick={() => { navigator.clipboard.writeText(socialBios.linkedin); alert('Copied!'); }} className="absolute bottom-4 right-4 text-slate-300 hover:text-blue-600 transition-colors"><Copy size={14}/></button>
                                </div>
                                <div className="bg-slate-50 p-6 rounded-2xl border border-slate-100 group relative">
                                    <span className="text-[8px] font-black uppercase text-pink-600 mb-2 block">Instagram / TikTok</span>
                                    <p className="text-xs text-slate-600 font-medium italic leading-relaxed">"{socialBios.instagram}"</p>
                                    <button onClick={() => { navigator.clipboard.writeText(socialBios.instagram); alert('Copied!'); }} className="absolute bottom-4 right-4 text-slate-300 hover:text-pink-600 transition-colors"><Copy size={14}/></button>
                                </div>
                            </div>
                        </div>
                    )}
                 </div>
              </div>
           </div>
        </div>
      )}

      {activeTab === 'seo' && (
        <div className="space-y-8 animate-fade-in">
           <div className="bg-slate-900 rounded-[3rem] p-12 text-white shadow-2xl relative overflow-hidden border border-white/5">
              <div className="absolute top-0 right-0 p-10 opacity-10 rotate-12"><Globe size={280} /></div>
              <div className="relative z-10 flex flex-col md:flex-row items-center justify-between gap-10">
                 <div className="max-w-2xl">
                    <div className="inline-flex items-center gap-2 bg-blue-500/20 text-blue-400 px-4 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest mb-10 border border-blue-500/20">
                        Search Intelligence Protocol
                    </div>
                    <h2 className="text-5xl font-black mb-8 tracking-tighter uppercase leading-[0.9]">
                        SEO <span className="text-blue-500">Architect.</span>
                    </h2>
                    <p className="text-slate-400 text-xl leading-relaxed mb-0 font-medium">
                        Research high-yield keywords and content roadmaps for your specific funding niche using Search Grounding data.
                    </p>
                 </div>
              </div>
           </div>

           <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
              <div className="lg:col-span-4 bg-white border border-slate-200 p-8 rounded-[2.5rem] shadow-sm space-y-8">
                 <h3 className="font-black text-xs uppercase tracking-[0.3em] text-slate-400">Market Targeting</h3>
                 <div className="space-y-6">
                    <div><label className="block text-[9px] font-black text-slate-400 uppercase tracking-widest mb-2 ml-1">Core Industry</label><input className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 text-sm font-bold" placeholder="e.g. Dry Cleaning" value={seoIndustry} onChange={e => setSeoIndustry(e.target.value)} /></div>
                    <div><label className="block text-[9px] font-black text-slate-400 uppercase tracking-widest mb-2 ml-1">Target Market</label><input className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 text-sm font-bold" placeholder="e.g. New Jersey" value={seoTargetMarket} onChange={e => setSeoTargetMarket(e.target.value)} /></div>
                    <button 
                        onClick={handleRunSEO}
                        disabled={isSeoLoading || !seoIndustry}
                        className="w-full py-4 bg-slate-950 text-white rounded-2xl font-black uppercase text-[10px] tracking-widest hover:bg-blue-600 transition-all shadow-xl active:scale-95 flex items-center justify-center gap-2"
                    >
                        {isSeoLoading ? <RefreshCw className="animate-spin" size={16}/> : <Globe size={16}/>} {isSeoLoading ? 'Researching...' : 'Generate Roadmap'}
                    </button>
                 </div>
              </div>

              <div className="lg:col-span-8">
                 {seoResult ? (
                    <div className="space-y-8 animate-fade-in">
                       <div className="bg-white border border-slate-200 p-10 rounded-[3rem] shadow-sm">
                          <h3 className="font-black text-xs uppercase tracking-[0.2em] text-slate-400 mb-8 flex items-center gap-2"><TrendingUp size={18} className="text-emerald-500"/> Semantic Target Index</h3>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                             {seoResult.keywords?.map((k: any, i: number) => (
                                <div key={i} className="p-4 bg-slate-50 rounded-2xl border border-slate-100 flex justify-between items-center group hover:border-emerald-300 transition-all">
                                   <div><p className="text-sm font-black text-slate-900 uppercase tracking-tight">{k.phrase}</p><p className="text-[8px] font-bold text-slate-400 uppercase mt-1">Volume: {k.volume}</p></div>
                                   <div className={`text-[9px] font-black px-2 py-0.5 rounded border ${k.difficulty.toLowerCase() === 'low' ? 'bg-emerald-50 text-emerald-700 border-emerald-100' : 'bg-amber-50 text-amber-700 border-amber-100'}`}>DIFFICULTY: {k.difficulty}</div>
                                </div>
                             ))}
                          </div>
                       </div>
                       
                       <div className="bg-white border border-slate-200 p-10 rounded-[3rem] shadow-sm">
                          <h3 className="font-black text-xs uppercase tracking-[0.2em] text-slate-400 mb-8 flex items-center gap-2"><Calendar size={18} className="text-blue-500"/> Content Protocol</h3>
                          <div className="space-y-6">
                             {seoResult.roadmap?.map((m: any, i: number) => (
                                <div key={i} className="flex gap-8 group">
                                   <div className="flex flex-col items-center">
                                      <div className="w-10 h-10 rounded-xl bg-slate-950 text-white flex items-center justify-center font-black text-xs shadow-xl">{i+1}</div>
                                      {i < seoResult.roadmap.length - 1 && <div className="w-0.5 h-full bg-slate-100 my-2"></div>}
                                   </div>
                                   <div className="pb-8 flex-1">
                                      <h4 className="font-black text-slate-900 text-lg uppercase tracking-tight mb-2">{m.month} :: {m.focus}</h4>
                                      <div className="flex flex-wrap gap-2">
                                         {m.contentIdeas?.map((idea: string, j: number) => (
                                            <span key={j} className="text-[10px] font-black uppercase text-blue-600 bg-blue-50 px-3 py-1 rounded-lg border border-blue-100">{idea}</span>
                                         ))}
                                      </div>
                                   </div>
                                </div>
                             ))}
                          </div>
                       </div>
                    </div>
                 ) : (
                    <div className="h-full flex flex-col items-center justify-center py-40 border-2 border-dashed border-slate-200 rounded-[3.5rem] bg-white/50 text-slate-300">
                       <BarChart3 size={64} className="opacity-10 mb-6" />
                       <p className="text-sm font-black uppercase tracking-widest opacity-40">Awaiting Search Matrix Deployment</p>
                    </div>
                 )}
              </div>
           </div>
        </div>
      )}

      {activeTab === 'local' && (
          <div className="space-y-8 animate-fade-in">
              <div className="bg-emerald-950 p-12 rounded-[3rem] text-white shadow-2xl relative overflow-hidden border border-white/5">
                <div className="absolute top-0 right-0 p-10 opacity-10 rotate-12"><MapPin size={280} /></div>
                <div className="relative z-10 flex flex-col md:flex-row items-center justify-between gap-10">
                    <div className="max-w-2xl">
                        <div className="inline-flex items-center gap-2 bg-emerald-500/20 text-emerald-400 px-4 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest mb-10 border border-emerald-500/20">
                            Local Presence Sentinel
                        </div>
                        <h2 className="text-5xl font-black mb-8 tracking-tighter uppercase leading-[0.9]">
                            Maps <span className="text-emerald-500">Sentinel.</span>
                        </h2>
                        <p className="text-slate-400 text-xl leading-relaxed mb-0 font-medium">
                            Nexus AI audits your local listing performance and suggests semantic updates to increase your map-pack proximity score.
                        </p>
                    </div>
                </div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
                  <div className="lg:col-span-4 bg-white border border-slate-200 p-8 rounded-[2.5rem] shadow-sm space-y-8">
                      <h3 className="font-black text-xs uppercase tracking-[0.3em] text-slate-400">Listing Vitals</h3>
                      <div className="space-y-6">
                          <div><label className="block text-[9px] font-black text-slate-400 uppercase tracking-widest mb-2 ml-1">Market HQ Address</label><textarea className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 text-sm font-bold h-24" placeholder="Full address as it appears on Google..." value={gbpLoc} onChange={e => setGbpLoc(e.target.value)} /></div>
                          <div><label className="block text-[9px] font-black text-slate-400 uppercase tracking-widest mb-2 ml-1">Current Logic (Desc)</label><textarea className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 text-sm font-bold h-32" placeholder="Tell AI what you currently emphasize..." value={gbpDesc} onChange={e => setGbpDesc(e.target.value)} /></div>
                          <button 
                            onClick={handleRunGBP}
                            disabled={isGbpLoading || !gbpLoc}
                            className="w-full py-4 bg-slate-950 text-white rounded-2xl font-black uppercase text-[10px] tracking-widest hover:bg-emerald-600 transition-all shadow-xl active:scale-95 flex items-center justify-center gap-2"
                          >
                            {isGbpLoading ? <RefreshCw className="animate-spin" size={16}/> : <MapPin size={16}/>} {isGbpLoading ? 'Scrutinizing...' : 'Optimize Listing'}
                          </button>
                      </div>
                  </div>

                  <div className="lg:col-span-8">
                      {gbpResult ? (
                          <div className="space-y-8 animate-fade-in">
                              <div className="bg-white border border-slate-200 p-10 rounded-[3rem] shadow-sm">
                                  <h3 className="font-black text-xs uppercase tracking-[0.2em] text-slate-400 mb-8 flex items-center gap-2"><Type size={18} className="text-blue-500"/> Semantic Optimized Description</h3>
                                  <div className="bg-slate-50 p-6 rounded-2xl border border-slate-200 shadow-inner relative group">
                                      <p className="text-sm text-slate-600 font-medium italic leading-relaxed">"{gbpResult.optimizedDescription}"</p>
                                      <button onClick={() => { navigator.clipboard.writeText(gbpResult.optimizedDescription); alert('Copied!'); }} className="absolute bottom-4 right-4 p-2 bg-white border border-slate-200 rounded-xl text-slate-400 hover:text-blue-600 opacity-0 group-hover:opacity-100 transition-all shadow-sm"><Copy size={16}/></button>
                                  </div>
                              </div>
                              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                                  <div className="bg-white border border-slate-200 p-10 rounded-[3rem] shadow-sm">
                                      <h3 className="font-black text-xs uppercase tracking-[0.2em] text-slate-400 mb-8 flex items-center gap-2"><Layers size={18} className="text-emerald-500"/> Category Expansion</h3>
                                      <div className="flex flex-wrap gap-2">
                                          {gbpResult.categories?.map((cat: string, i: number) => (
                                              <span key={i} className="text-[10px] font-black uppercase text-emerald-700 bg-emerald-50 px-3 py-1 rounded-lg border border-emerald-100">{cat}</span>
                                          ))}
                                      </div>
                                  </div>
                                  <div className="bg-white border border-slate-200 p-10 rounded-[3rem] shadow-sm">
                                      <h3 className="font-black text-xs uppercase tracking-[0.2em] text-slate-400 mb-8 flex items-center gap-2"><Smartphone size={18} className="text-blue-500"/> GBP Posting Protocol</h3>
                                      <div className="space-y-3">
                                          {gbpResult.postIdeas?.map((post: string, i: number) => (
                                              <div key={i} className="p-3 bg-slate-50 rounded-xl border border-slate-100 text-[10px] font-bold text-slate-600 uppercase tracking-widest">{post}</div>
                                          ))}
                                      </div>
                                  </div>
                              </div>
                          </div>
                      ) : (
                          <div className="h-full flex flex-col items-center justify-center py-40 border-2 border-dashed border-slate-200 rounded-[3.5rem] bg-white/50 text-slate-300">
                             <Globe size={64} className="opacity-10 mb-6" />
                             <p className="text-sm font-black uppercase tracking-widest opacity-40">Awaiting Geographic Scan</p>
                          </div>
                      )}
                  </div>
              </div>
          </div>
      )}

      {activeTab === 'hooks' && (
          <div className="space-y-8 animate-fade-in">
              <div className="bg-indigo-950 p-12 rounded-[3rem] text-white shadow-2xl relative overflow-hidden border border-white/5">
                <div className="absolute top-0 right-0 p-10 opacity-10 rotate-12"><Sparkles size={280} /></div>
                <div className="relative z-10 flex flex-col md:flex-row items-center justify-between gap-10">
                    <div className="max-w-2xl">
                        <div className="inline-flex items-center gap-2 bg-indigo-500/20 text-indigo-400 px-4 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest mb-10 border border-indigo-500/20">
                            Attention Economics protocol
                        </div>
                        <h2 className="text-5xl font-black mb-8 tracking-tighter uppercase leading-[0.9]">
                            Viral <span className="text-indigo-400">Hooks.</span>
                        </h2>
                        <p className="text-slate-400 text-xl leading-relaxed mb-0 font-medium">
                            Nexus AI converts complex financial data into 15-second high-retention hooks for social algorithms. Master the pattern interrupt.
                        </p>
                    </div>
                </div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
                  <div className="lg:col-span-4 bg-white border border-slate-200 p-8 rounded-[2.5rem] shadow-sm space-y-8">
                      <h3 className="font-black text-xs uppercase tracking-[0.3em] text-slate-400">Directive Input</h3>
                      <div className="space-y-6">
                          <div><label className="block text-[9px] font-black text-slate-400 uppercase tracking-widest mb-2 ml-1">Content Subject</label><textarea className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 text-sm font-bold h-32" placeholder="e.g. Why most MCA deals fail in 6 months..." value={hookTopic} onChange={e => setHookTopic(e.target.value)} /></div>
                          <button 
                            onClick={handleRunHooks}
                            disabled={isHookLoading || !hookTopic}
                            className="w-full py-4 bg-slate-950 text-white rounded-2xl font-black uppercase text-[10px] tracking-widest hover:bg-indigo-600 transition-all shadow-xl active:scale-95 flex items-center justify-center gap-2"
                          >
                            {isHookLoading ? <RefreshCw className="animate-spin" size={16}/> : <Zap size={16} fill="currentColor"/>} {isHookLoading ? 'Synthesizing...' : 'Manifest Hooks'}
                          </button>
                      </div>
                  </div>

                  <div className="lg:col-span-8">
                      <div className="grid grid-cols-1 gap-4">
                          {hookResults.length > 0 ? hookResults.map((hook, i) => (
                              <div key={i} className="bg-white border border-slate-200 p-8 rounded-[2.5rem] shadow-sm group hover:border-indigo-400 transition-all flex items-center justify-between">
                                  <div className="flex items-center gap-6">
                                      <div className="w-10 h-10 rounded-xl bg-slate-50 text-slate-300 flex items-center justify-center font-black text-xs group-hover:bg-indigo-50 group-hover:text-indigo-600 group-hover:rotate-3 transition-all">{i+1}</div>
                                      <p className="text-lg font-black text-slate-900 uppercase tracking-tight italic">"{hook}"</p>
                                  </div>
                                  <button onClick={() => { navigator.clipboard.writeText(hook); alert('Hook copied!'); }} className="p-3 text-slate-300 hover:text-indigo-600 transition-colors"><Copy size={20}/></button>
                              </div>
                          )) : (
                              <div className="h-full flex flex-col items-center justify-center py-40 border-2 border-dashed border-slate-200 rounded-[3.5rem] bg-white/50 text-slate-300">
                                 <Sparkles size={64} className="opacity-10 mb-6" />
                                 <p className="text-sm font-black uppercase tracking-widest opacity-40">Awaiting Creative Directive</p>
                              </div>
                          )}
                      </div>
                  </div>
              </div>
          </div>
      )}

      {activeTab === 'emails' && (
        <EmailCampaignManager contacts={contacts} agencyName={branding.name} />
      )}

    </div>
  );
};

export default MarketingCampaigns;
