
import React, { useState } from 'react';
import { 
    GraduationCap, Play, CheckCircle, Clock, BookOpen, Sparkles, 
    Zap, Phone, ShieldCheck, TrendingUp, Trophy, ArrowRight, Video, 
    Layers, BrainCircuit, RefreshCw, Star
} from 'lucide-react';

const StaffTraining: React.FC = () => {
  const [activeModule, setActiveModule] = useState(0);
  const [progress, setProgress] = useState(35);

  const modules = [
    {
      id: 0,
      title: 'Operational Readiness',
      desc: 'Master the Nexus HUD and global navigation.',
      icon: <Layers size={24} />,
      videos: [
        { title: 'The Executive Desk Layout', duration: '3:45', completed: true },
        { title: 'Neural Pipeline Management', duration: '5:12', completed: true }
      ]
    },
    {
      id: 1,
      title: 'Power Dialer Protocol',
      desc: 'Execute high-velocity outreach with AI assistance.',
      icon: <Phone size={24} />,
      videos: [
        { title: 'Activating Neural Scripts', duration: '4:20', completed: false },
        { title: 'Live Tactical Pivots', duration: '6:10', completed: false }
      ]
    },
    {
      id: 2,
      title: 'Compliance & Forensics',
      desc: 'Auditing merchant documents with autonomous precision.',
      icon: <ShieldCheck size={24} />,
      videos: [
        { title: 'Verifying Bank Statements', duration: '7:30', completed: false },
        { title: 'Detecting Stacked Debt', duration: '5:45', completed: false }
      ]
    },
    {
      id: 3,
      title: 'The Closing Move',
      desc: 'Mastering the AI Combat Trainer and Objection handling.',
      icon: <Trophy size={24} />,
      videos: [
        { title: 'Winning in Combat Simulation', duration: '12:00', completed: false },
        { title: 'Generating Final Contracts', duration: '4:30', completed: false }
      ]
    }
  ];

  return (
    <div className="max-w-7xl mx-auto space-y-10 animate-fade-in pb-20">
      
      {/* Hero HUD */}
      <div className="bg-slate-950 rounded-[3rem] p-16 text-white shadow-2xl relative overflow-hidden border border-white/5">
        <div className="absolute top-0 right-0 p-20 opacity-10 rotate-12"><GraduationCap size={320} /></div>
        <div className="relative z-10 max-w-3xl">
            <div className="inline-flex items-center gap-2 bg-emerald-500/10 text-emerald-400 px-4 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest mb-10 border border-emerald-500/20">
                Staff Academy
            </div>
            <h1 className="text-6xl font-black mb-8 tracking-tighter uppercase leading-[0.9]">
                Forge your <span className="text-emerald-500">Excellence.</span>
            </h1>
            <p className="text-slate-400 text-xl leading-relaxed mb-12 font-medium">
                Welcome to the Nexus Training Protocol. Mastering these modules is mandatory for full system clearance and deal participation.
            </p>

            <div className="flex flex-col sm:flex-row items-center gap-10">
                <div className="flex-1 w-full">
                    <div className="flex justify-between text-[10px] font-black uppercase text-slate-500 tracking-widest mb-3">
                        <span>Onboarding Maturity</span>
                        <span>{progress}%</span>
                    </div>
                    <div className="h-2 bg-white/5 rounded-full overflow-hidden border border-white/10">
                        <div className="h-full bg-emerald-500 shadow-[0_0_15px_rgba(16,185,129,0.5)] transition-all duration-1000" style={{ width: `${progress}%` }}></div>
                    </div>
                </div>
                <button className="bg-white text-slate-950 px-10 py-5 rounded-2xl font-black text-xs uppercase tracking-widest hover:bg-slate-100 transition-all shadow-2xl flex items-center gap-3">
                    Continue Module <ArrowRight size={18}/>
                </button>
            </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-10">
         
         {/* Syllabus Sidebar */}
         <div className="lg:col-span-4 space-y-6">
            <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.3em] px-4">Training Syllabus</h3>
            <div className="space-y-4">
                {modules.map((mod, idx) => (
                    <button 
                        key={mod.id}
                        onClick={() => setActiveModule(idx)}
                        className={`w-full p-8 rounded-[2.5rem] border-2 text-left transition-all relative overflow-hidden group ${activeModule === idx ? 'bg-white border-blue-600 shadow-xl' : 'bg-slate-50 border-transparent grayscale opacity-60 hover:opacity-100 hover:grayscale-0'}`}
                    >
                        <div className="relative z-10 flex items-start gap-6">
                            <div className={`p-4 rounded-2xl shadow-lg transition-transform group-hover:scale-110 ${activeModule === idx ? 'bg-blue-600 text-white shadow-blue-500/20' : 'bg-white text-slate-400'}`}>
                                {mod.icon}
                            </div>
                            <div>
                                <h4 className="font-black text-slate-900 text-lg uppercase tracking-tight leading-none mb-2">{mod.title}</h4>
                                <p className="text-xs text-slate-500 font-medium leading-relaxed">{mod.desc}</p>
                            </div>
                        </div>
                        {activeModule === idx && <div className="absolute top-0 right-0 p-4 opacity-5"><Zap size={80}/></div>}
                    </button>
                ))}
            </div>

            <div className="bg-indigo-600 rounded-[2.5rem] p-8 text-white shadow-2xl relative overflow-hidden group">
                <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:scale-110 transition-transform"><BrainCircuit size={120} /></div>
                <h3 className="text-xl font-black uppercase tracking-tight mb-4">Neural Advisor</h3>
                <p className="text-sm text-indigo-100 font-medium italic mb-8 leading-relaxed">
                    "Need tactical help on a live deal? Ask the neural core for a real-time battle card synthesis."
                </p>
                <button className="w-full py-4 bg-white text-indigo-600 rounded-xl font-black uppercase text-[10px] tracking-widest shadow-xl">
                    Launch AI Chat
                </button>
            </div>
         </div>

         {/* Content Player Area */}
         <div className="lg:col-span-8 space-y-8">
            <div className="bg-white rounded-[3rem] border border-slate-200 shadow-sm overflow-hidden flex flex-col h-full">
                <div className="bg-slate-50 p-10 border-b border-slate-100 flex justify-between items-center">
                    <div>
                        <h3 className="text-3xl font-black text-slate-900 uppercase tracking-tighter leading-none mb-2">{modules[activeModule].title}</h3>
                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Module {activeModule + 1} of {modules.length}</p>
                    </div>
                </div>

                <div className="p-10 flex-1 space-y-10">
                    {/* Featured Video Player Mock */}
                    <div className="aspect-video bg-slate-950 rounded-[2.5rem] relative group overflow-hidden shadow-2xl border-8 border-slate-50">
                        <img src="https://images.unsplash.com/photo-1552664730-d307ca884978?q=80&w=2670&auto=format&fit=crop" className="w-full h-full object-cover opacity-30 grayscale group-hover:opacity-40 group-hover:grayscale-0 transition-all duration-700" alt="Training Preview" />
                        <div className="absolute inset-0 flex items-center justify-center">
                            <button className="w-24 h-24 bg-white rounded-full flex items-center justify-center text-slate-950 shadow-[0_0_50px_rgba(255,255,255,0.4)] hover:scale-110 active:scale-95 transition-all">
                                <Play size={40} fill="currentColor" className="ml-2" />
                            </button>
                        </div>
                        <div className="absolute bottom-10 left-10 text-white">
                           <p className="text-[10px] font-black uppercase tracking-[0.4em] mb-2 opacity-60">Now Playing</p>
                           <h4 className="text-2xl font-black uppercase tracking-tight">{modules[activeModule].videos[0].title}</h4>
                        </div>
                    </div>

                    <div className="space-y-6">
                        <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-2">Module Lessons</h4>
                        <div className="grid grid-cols-1 gap-4">
                            {modules[activeModule].videos.map((vid, vIdx) => (
                                <div key={vIdx} className="bg-slate-50 border border-slate-100 p-6 rounded-3xl flex items-center justify-between group hover:bg-white hover:shadow-xl hover:border-blue-100 transition-all cursor-pointer">
                                    <div className="flex items-center gap-6">
                                        <div className={`w-12 h-12 rounded-2xl flex items-center justify-center shadow-inner ${vid.completed ? 'bg-emerald-50 text-emerald-500' : 'bg-white text-slate-300'}`}>
                                            {vid.completed ? <CheckCircle size={20}/> : <Video size={20}/>}
                                        </div>
                                        <div>
                                            <p className={`font-black text-sm uppercase tracking-tight ${vid.completed ? 'text-slate-400 line-through' : 'text-slate-800'}`}>{vid.title}</p>
                                            <div className="flex items-center gap-2 mt-1">
                                                <Clock size={12} className="text-slate-400" />
                                                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{vid.duration} Tutorial</span>
                                            </div>
                                        </div>
                                    </div>
                                    <button className="p-3 bg-white border border-slate-200 rounded-xl text-slate-400 group-hover:text-blue-600 group-hover:border-blue-200 transition-all shadow-sm">
                                        <Play size={18} fill="currentColor" />
                                    </button>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>

                <div className="p-10 bg-slate-50 border-t border-slate-100 flex justify-between items-center">
                    <p className="text-xs text-slate-500 font-medium">You must complete all lessons to unlock the <span className="font-bold text-slate-900">Nexus Certification Exam</span>.</p>
                    <button className="text-[10px] font-black uppercase text-blue-600 hover:underline tracking-widest">Download Study Guide (PDF)</button>
                </div>
            </div>
         </div>

      </div>
    </div>
  );
};

export default StaffTraining;
