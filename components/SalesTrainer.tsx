import React, { useState, useRef, useEffect } from 'react';
import { GoogleGenAI, LiveServerMessage, Modality } from '../services/clientAiBridge';
import { 
  Mic, StopCircle, Play, Sparkles, Volume2, Award, AlertCircle, 
  BarChart3, Target, MessageSquare, Lightbulb, RefreshCw, 
  ChevronRight, BrainCircuit, Shield, Clock, Trophy, Activity, 
  CheckCircle, Zap, ZapOff, TrendingUp, TrendingDown, ListChecks
} from 'lucide-react';
import { SalesSession } from '../types';
import * as geminiService from '../services/geminiService';

const SCENARIOS = [
  {
    id: 'cold_call',
    title: 'Cold Call: The Gatekeeper',
    description: 'You are calling a construction company. The receptionist is trying to block you from speaking to the owner.',
    systemInstruction: 'You are "Sarah", a busy and slightly annoyed receptionist at a construction firm. Your goal is to screen calls. Do not let the user speak to the owner unless they give a very compelling reason or sound like a partner. Be curt but professional.'
  },
  {
    id: 'objection_price',
    title: 'Objection: "Rates are too high"',
    description: 'The client has received an offer but thinks the 1.35 factor rate is a rip-off. Explain the value.',
    systemInstruction: 'You are "Mike", a business owner. You just saw the funding offer and you are angry about the cost. You think 35% interest is crazy. You are skeptical and thinking about walking away. Demand a lower rate.'
  },
  {
    id: 'closing',
    title: 'Closing: Urgency',
    description: 'The client is stalling on signing the contract. Create urgency without being pushy.',
    systemInstruction: 'You are "David", a hesitant client. You like the deal but you want to "think about it" for a week. You are afraid of the daily payments. You need reassurance and a reason to act now.'
  }
];

// Audio Utils
function decode(base64: string) {
  const binaryString = atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

function encode(bytes: Uint8Array) {
  let binary = '';
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

async function decodeAudioData(data: Uint8Array, ctx: AudioContext, sampleRate: number, numChannels: number): Promise<AudioBuffer> {
  const dataInt16 = new Int16Array(data.buffer);
  const frameCount = dataInt16.length / numChannels;
  const buffer = ctx.createBuffer(numChannels, frameCount, sampleRate);
  for (let channel = 0; channel < numChannels; channel++) {
    const channelData = buffer.getChannelData(channel);
    for (let i = 0; i < frameCount; i++) {
      channelData[i] = dataInt16[i * numChannels + channel] / 32768.0;
    }
  }
  return buffer;
}

function createBlob(data: Float32Array): { data: string; mimeType: string } {
  const l = data.length;
  const int16 = new Int16Array(l);
  for (let i = 0; i < l; i++) {
    int16[i] = data[i] * 32768;
  }
  return {
    data: encode(new Uint8Array(int16.buffer)),
    mimeType: 'audio/pcm;rate=16000',
  };
}

const SalesTrainer: React.FC = () => {
  const [activeScenario, setActiveScenario] = useState(SCENARIOS[0]);
  const [status, setStatus] = useState<'idle' | 'prepping' | 'connecting' | 'active' | 'analyzing' | 'feedback'>('idle');
  const [volumeLevel, setVolumeLevel] = useState(0);
  const [transcript, setTranscript] = useState<{role: string, text: string}[]>([]);
  const [feedback, setFeedback] = useState<SalesSession | null>(null);
  
  // Advanced AI State
  const [objections, setObjections] = useState<{objection: string, handled: boolean, rebuttal?: string}[]>([]);
  const [liveCoaching, setLiveCoaching] = useState<string>('Establish rapport and mirror the client tone.');
  const [sentiment, setSentiment] = useState<number>(50); // 0 (Hostile) to 100 (Closing)
  const [isGettingRebuttal, setIsGettingRebuttal] = useState<number | null>(null);
  const [isAnalyzingCoach, setIsAnalyzingCoach] = useState(false);

  const sessionRef = useRef<any>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const nextStartTimeRef = useRef<number>(0);
  const sourcesRef = useRef<Set<AudioBufferSourceNode>>(new Set());
  const streamRef = useRef<MediaStream | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const currentInputTranscription = useRef('');
  const currentOutputTranscription = useRef('');

  // Neural Coach Watcher
  useEffect(() => {
    const updateCoaching = async () => {
        if (status !== 'active' || transcript.length < 2 || isAnalyzingCoach) return;
        
        setIsAnalyzingCoach(true);
        try {
            // Reusing analyzeCallStrategy for live roleplay coaching
            const pivot = await geminiService.analyzeCallStrategy(transcript, { 
                name: 'Roleplay Lead', 
                company: activeScenario.title,
                notes: activeScenario.description
            } as any);
            setLiveCoaching(pivot);
            
            // Heuristic sentiment update based on transcript length and context
            setSentiment(prev => Math.min(100, Math.max(0, prev + (transcript.length % 2 === 0 ? 5 : -2))));
            
            // Check if objections were handled
            const lastMsg = transcript[transcript.length - 1];
            if (lastMsg.role === 'ai') {
                setObjections(prev => prev.map(obj => {
                    if (lastMsg.text.toLowerCase().includes(obj.objection.toLowerCase().split(' ')[0])) {
                        return { ...obj, handled: true };
                    }
                    return obj;
                }));
            }
        } catch (e) {
            console.error(e);
        } finally {
            setIsAnalyzingCoach(false);
        }
    };

    const timer = setTimeout(updateCoaching, 4000);
    return () => clearTimeout(timer);
  }, [transcript.length, status, activeScenario, isAnalyzingCoach]);

  const handlePrepSession = async () => {
    setStatus('prepping');
    try {
        const mockContact = { 
            company: activeScenario.title, 
            revenue: 50000, 
            timeInBusiness: 24, 
            notes: activeScenario.description 
        } as any;
        
        const predicted = await geminiService.predictCommonObjections(mockContact);
        setObjections(predicted.map(o => ({ objection: o, handled: false })));
    } catch (e) {
        console.error("Prep failed", e);
    } finally {
        setStatus('idle');
    }
  };

  const fetchRebuttal = async (index: number) => {
    setIsGettingRebuttal(index);
    try {
        const mockContact = { company: activeScenario.title } as any;
        const rebuttal = await geminiService.generateObjectionResponse(mockContact, objections[index].objection);
        const newObjections = [...objections];
        newObjections[index].rebuttal = rebuttal;
        setObjections(newObjections);
    } catch (e) {
        console.error(e);
    } finally {
        setIsGettingRebuttal(null);
    }
  };

  const startSession = async () => {
    setStatus('connecting');
    setTranscript([]);
    setFeedback(null);
    setSentiment(40); // Start slightly defensive
    currentInputTranscription.current = '';
    currentOutputTranscription.current = '';

    try {
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      const ctx = new AudioContextClass({ sampleRate: 24000 }); 
      audioContextRef.current = ctx;
      nextStartTimeRef.current = ctx.currentTime;

      const ai = new GoogleGenAI();
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { sampleRate: 16000 } });
      streamRef.current = stream;

      const inputCtx = new AudioContextClass({ sampleRate: 16000 });
      const source = inputCtx.createMediaStreamSource(stream);
      const processor = inputCtx.createScriptProcessor(4096, 1, 1);
      processorRef.current = processor;

      const enhancedInstruction = `
        ${activeScenario.systemInstruction}
        
        LIVE TRAINING PROTOCOL:
        1. You MUST naturally work these specific objections into the conversation: ${objections.map(o => o.objection).join(', ')}.
        2. React to the user's rebuttals. If they use logic and empathy, become more cooperative. If they are aggressive or vague, become more difficult.
        3. Your current "Warmth Level" starts at 40/100.
      `;

      const sessionPromise = ai.live.connect({
        // Fixed: Updated model to compliant gemini-2.5-flash-native-audio-preview-12-2025
        model: 'gemini-2.5-flash-native-audio-preview-12-2025',
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Kore' } } },
          systemInstruction: enhancedInstruction,
          inputAudioTranscription: { model: "google-1" },
          outputAudioTranscription: { model: "google-1" }
        },
        callbacks: {
          onopen: () => {
            setStatus('active');
            processor.onaudioprocess = (e) => {
              const inputData = e.inputBuffer.getChannelData(0);
              let sum = 0;
              for(let i=0; i<inputData.length; i++) sum += inputData[i] * inputData[i];
              setVolumeLevel(Math.sqrt(sum / inputData.length) * 50);

              const pcmBlob = createBlob(inputData);
              // CRITICAL: Solely rely on sessionPromise resolves and then call `session.sendRealtimeInput`
              sessionPromise.then(session => session.sendRealtimeInput({ media: pcmBlob }));
            };
            source.connect(processor);
            processor.connect(inputCtx.destination);
          },
          onmessage: async (msg: LiveServerMessage) => {
            const audioData = msg.serverContent?.modelTurn?.parts?.[0]?.inlineData?.data;
            if (audioData && audioContextRef.current) {
              const buffer = await decodeAudioData(decode(audioData), audioContextRef.current, 24000, 1);
              const source = audioContextRef.current.createBufferSource();
              source.buffer = buffer;
              source.connect(audioContextRef.current.destination);
              
              const now = audioContextRef.current.currentTime;
              const start = Math.max(nextStartTimeRef.current, now);
              source.start(start);
              nextStartTimeRef.current = start + buffer.duration;
              
              source.onended = () => sourcesRef.current.delete(source);
              sourcesRef.current.add(source);
            }

            if (msg.serverContent?.outputTranscription?.text) {
               currentOutputTranscription.current += msg.serverContent.outputTranscription.text;
            }
            if (msg.serverContent?.inputTranscription?.text) {
               currentInputTranscription.current += msg.serverContent.inputTranscription.text;
            }

            if (msg.serverContent?.turnComplete) {
               if (currentInputTranscription.current) {
                 setTranscript(prev => [...prev, { role: 'user', text: currentInputTranscription.current }]);
                 currentInputTranscription.current = '';
               }
               if (currentOutputTranscription.current) {
                 setTranscript(prev => [...prev, { role: 'ai', text: currentOutputTranscription.current }]);
                 currentOutputTranscription.current = '';
               }
            }
          },
          onclose: () => setStatus('idle'),
          onerror: (err) => { console.error(err); stopSession(); }
        }
      });

      sessionRef.current = sessionPromise;

    } catch (e) {
      console.error(e);
      setStatus('idle');
      alert("Session failed. Ensure mic access and API key are valid.");
    }
  };

  const stopSession = async () => {
    if (processorRef.current) {
      processorRef.current.disconnect();
      processorRef.current.onaudioprocess = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
    }
    if (sessionRef.current) {
        try {
            const session = await sessionRef.current;
            session.close();
        } catch(e) {}
    }
    sourcesRef.current.forEach(s => s.stop());
    sourcesRef.current.clear();
    if (audioContextRef.current) {
      audioContextRef.current.close();
      audioContextRef.current = null;
    }

    if (transcript.length > 0) {
      generateFeedback();
    } else {
      setStatus('idle');
    }
  };

  const generateFeedback = async () => {
    setStatus('analyzing');
    const fullText = transcript.map(t => `${t.role}: ${t.text}`).join('\n');
    
    try {
      const ai = new GoogleGenAI();
      const res = await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: `Analyze this sales roleplay session. 
        Scenario Goal: Handle these objections: ${objections.map(o=>o.objection).join(',')}. 
        Transcript: 
        ${fullText}
        
        Return JSON: {
          score: number (0-100), 
          summary: string (2-3 concise sentences summarizing the call),
          actionItems: string[] (3-4 bullet points for improvement or next steps),
          feedback: string (detailed pedagogical feedback), 
          duration: string (e.g. "2:45")
        }`,
        config: { responseMimeType: "application/json" }
      });
      
      const json = JSON.parse(res.text || "{}");
      setFeedback({
        id: `sess_${Date.now()}`,
        date: new Date().toLocaleDateString(),
        scenario: activeScenario.title,
        duration: json.duration || '2 mins',
        score: json.score || 75,
        summary: json.summary,
        actionItems: json.actionItems,
        feedback: json.feedback || 'Review complete.'
      });
      setStatus('feedback');
    } catch (e) {
      setStatus('idle');
    }
  };

  return (
    <div className="max-w-7xl mx-auto h-[calc(100vh-100px)] flex flex-col animate-fade-in px-4 pb-10">
      
      <div className="flex justify-between items-start mb-8">
        <div>
          <h1 className="text-4xl font-black text-slate-900 tracking-tighter uppercase flex items-center gap-3">
            <Target className="text-blue-600" size={36} /> AI Combat Trainer
          </h1>
          <p className="text-slate-500 font-medium mt-1">Master objection handling with real-time neural simulation.</p>
        </div>
        {status === 'active' && (
           <div className="flex items-center gap-3 bg-red-50 px-5 py-2.5 rounded-2xl border border-red-100 animate-pulse shadow-sm">
              <div className="w-2.5 h-2.5 rounded-full bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.5)]"></div>
              <span className="text-red-600 font-black text-xs uppercase tracking-widest">Live Neural combat</span>
           </div>
        )}
      </div>

      {(status === 'idle' || status === 'prepping') && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2 space-y-6">
            <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.3em] mb-2 px-2">Select Operation</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {SCENARIOS.map(scen => (
                <div 
                  key={scen.id} 
                  onClick={() => { setActiveScenario(scen); setObjections([]); }}
                  className={`p-8 rounded-[2.5rem] border-2 cursor-pointer transition-all hover:shadow-2xl relative overflow-hidden group ${activeScenario.id === scen.id ? 'border-blue-600 bg-white shadow-xl scale-[1.02]' : 'border-slate-100 bg-slate-50/50 grayscale hover:grayscale-0'}`}
                >
                  <div className={`absolute top-0 right-0 p-8 opacity-5 group-hover:opacity-10 transition-opacity ${activeScenario.id === scen.id ? 'opacity-10' : ''}`}>
                     <BrainCircuit size={120} />
                  </div>
                  <h3 className={`font-black text-xl mb-3 tracking-tight uppercase ${activeScenario.id === scen.id ? 'text-slate-900' : 'text-slate-500'}`}>{scen.title}</h3>
                  <p className="text-sm text-slate-500 leading-relaxed font-medium">{scen.description}</p>
                  
                  {activeScenario.id === scen.id && (
                    <div className="mt-8 flex justify-end">
                      <div className="bg-blue-600 text-white rounded-2xl p-3 shadow-xl shadow-blue-500/20 transform hover:scale-110 transition-transform"><Play size={20} fill="currentColor" /></div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>

          <div className="lg:col-span-1 space-y-6">
             <div className="bg-slate-900 rounded-[2.5rem] p-10 text-white shadow-2xl relative overflow-hidden border border-white/5 h-full flex flex-col">
                <div className="absolute top-0 right-0 p-8 opacity-10"><Sparkles size={120} /></div>
                
                <h3 className="text-[10px] font-black text-emerald-400 uppercase tracking-[0.3em] mb-8 flex items-center gap-2"><Target size={18} /> Call Preparation</h3>
                
                <div className="flex-1 space-y-6">
                    {objections.length === 0 ? (
                        <div className="text-center py-10 flex flex-col items-center justify-center h-full">
                            <div className="bg-white/5 p-6 rounded-3xl mb-6">
                                <BrainCircuit size={48} className="text-slate-600" />
                            </div>
                            <p className="text-slate-400 text-sm font-medium mb-8 max-w-[200px]">Analyze scenario to predict neural obstacles.</p>
                            <button 
                                onClick={handlePrepSession}
                                disabled={status === 'prepping'}
                                className="w-full bg-white text-slate-950 py-4 rounded-2xl font-black uppercase text-[10px] tracking-widest hover:bg-emerald-400 transition-all flex items-center justify-center gap-2 shadow-xl active:scale-95"
                            >
                                {status === 'prepping' ? <RefreshCw className="animate-spin" size={16}/> : <Sparkles size={16}/>}
                                Synthesize OBJECTIONS
                            </button>
                        </div>
                    ) : (
                        <div className="animate-fade-in space-y-4">
                            <p className="text-[9px] font-black text-slate-500 uppercase tracking-[0.4em] mb-4">Neural Intelligence Profile</p>
                            <div className="space-y-3">
                                {objections.map((obj, i) => (
                                    <div key={i} className="p-4 bg-white/5 border border-white/10 rounded-2xl flex items-start gap-4 group hover:bg-white/10 transition-all">
                                        <div className="w-6 h-6 rounded-lg bg-red-500/20 text-red-400 flex items-center justify-center font-bold text-[10px] shrink-0 border border-red-500/20">{i+1}</div>
                                        <p className="text-xs font-bold text-slate-200 leading-snug">"{obj.objection}"</p>
                                    </div>
                                ))}
                            </div>
                            
                            <button 
                                onClick={startSession}
                                className="w-full mt-10 bg-emerald-500 text-slate-950 py-5 rounded-[2rem] font-black uppercase text-xs tracking-[0.3em] hover:bg-emerald-400 transition-all flex items-center justify-center gap-3 shadow-2xl shadow-emerald-500/20 transform hover:-translate-y-1 active:scale-95"
                            >
                                <Mic size={24} /> Launch Session
                            </button>
                        </div>
                    )}
                </div>
             </div>
          </div>
        </div>
      )}

      {status === 'active' && (
        <div className="flex-1 grid grid-cols-1 lg:grid-cols-12 gap-8 overflow-hidden pb-8">
          
          <div className="lg:col-span-8 bg-slate-950 rounded-[3rem] p-12 flex flex-col items-center justify-center relative overflow-hidden shadow-2xl border border-white/5">
             <div className="absolute top-0 left-0 p-8 flex items-center gap-2">
                <span className="text-[10px] font-black text-slate-600 uppercase tracking-widest">Client Sentiment</span>
                <div className="w-48 h-2 bg-white/5 rounded-full overflow-hidden border border-white/5">
                   <div className={`h-full transition-all duration-1000 ${sentiment > 70 ? 'bg-emerald-500' : sentiment > 40 ? 'bg-blue-500' : 'bg-red-500'}`} style={{ width: `${sentiment}%` }}></div>
                </div>
                <span className={`text-[10px] font-black uppercase ${sentiment > 70 ? 'text-emerald-500' : sentiment > 40 ? 'text-blue-500' : 'text-red-500'}`}>{sentiment}%</span>
             </div>

             <div className="relative mb-16">
                <div className={`w-56 h-56 rounded-full bg-gradient-to-br from-blue-500 to-emerald-600 flex items-center justify-center shadow-[0_0_100px_rgba(16,185,129,0.3)] transition-transform duration-100 relative z-10`} style={{ transform: `scale(${1 + volumeLevel/100})` }}>
                    <Volume2 size={100} className="text-white opacity-90" />
                </div>
                <div className="absolute inset-[-20px] rounded-full border border-white/10 animate-[ping_3s_infinite] opacity-20"></div>
                <div className="absolute inset-[-40px] rounded-full border border-white/5 animate-[ping_4s_infinite] opacity-10"></div>
             </div>

             <div className="text-center max-w-md">
                <h2 className="text-3xl font-black text-white mb-2 tracking-tighter uppercase">{activeScenario.title}</h2>
                <p className="text-emerald-500 text-[10px] font-black uppercase tracking-[0.5em] animate-pulse">Neural Link Live</p>
             </div>

             <div className="w-full mt-16 max-h-40 overflow-y-auto custom-scrollbar px-10 text-center">
                 {transcript.slice(-2).map((t, i) => (
                    <div key={i} className={`animate-fade-in mb-4 ${t.role === 'user' ? 'text-slate-400' : 'text-blue-400'}`}>
                        <span className="text-[9px] font-black uppercase tracking-widest block mb-1 opacity-40">{t.role === 'user' ? 'YOU' : 'AI CLIENT'}</span>
                        <p className="text-lg font-bold">"{t.text}"</p>
                    </div>
                 ))}
             </div>

             <button 
                onClick={stopSession}
                className="mt-12 bg-red-600 hover:bg-red-700 text-white px-10 py-5 rounded-[2rem] font-black uppercase tracking-widest text-[10px] shadow-2xl transition-all active:scale-95 flex items-center gap-3 border border-red-500/20"
             >
                <StopCircle size={20} /> End Operation
             </button>
          </div>

          <div className="lg:col-span-4 space-y-6 flex flex-col h-full overflow-hidden">
             <div className="bg-white border border-slate-200 rounded-[2.5rem] p-8 shadow-xl flex-1 flex flex-col overflow-hidden">
                <div className="flex justify-between items-center mb-8">
                    <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.3em] flex items-center gap-2">
                        <BrainCircuit size={16} className="text-blue-600"/> Neural Playbook
                    </h3>
                    {isAnalyzingCoach && <RefreshCw size={14} className="animate-spin text-blue-500" />}
                </div>
                
                <div className="space-y-6 overflow-y-auto flex-1 pr-2 custom-scrollbar">
                   {/* Objection Status */}
                   <div className="space-y-3">
                      <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-2">Live Objectives</p>
                      {objections.map((obj, i) => (
                        <div key={i} className={`p-4 rounded-2xl border transition-all ${obj.handled ? 'bg-emerald-50 border-emerald-200' : 'bg-slate-50 border-slate-100 shadow-inner'}`}>
                            <div className="flex justify-between items-start gap-4">
                                <p className={`text-xs font-bold leading-tight ${obj.handled ? 'text-emerald-700' : 'text-slate-600'}`}>"{obj.objection}"</p>
                                {obj.handled ? <CheckCircle size={14} className="text-emerald-500 shrink-0"/> : <div className="w-1.5 h-1.5 rounded-full bg-slate-300 mt-1 shrink-0"></div>}
                            </div>
                            {!obj.handled && (
                                <button 
                                    onClick={() => fetchRebuttal(i)}
                                    disabled={isGettingRebuttal !== null}
                                    className="mt-3 text-[9px] font-black uppercase tracking-widest text-blue-600 flex items-center gap-1 hover:underline"
                                >
                                    {isGettingRebuttal === i ? <RefreshCw className="animate-spin" size={10}/> : <Sparkles size={10}/>} Get AI Rebuttal
                                </button>
                            )}
                            {obj.rebuttal && !obj.handled && (
                                <div className="mt-3 p-3 bg-white rounded-xl border border-blue-100 text-[11px] font-medium text-blue-700 italic animate-fade-in">
                                    "{obj.rebuttal}"
                                </div>
                            )}
                        </div>
                      ))}
                   </div>

                   {/* Live Coach */}
                   <div className="pt-6 border-t border-slate-100">
                       <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-4">Neural Coach Insight</p>
                       <div className="bg-slate-950 p-6 rounded-[2rem] border border-white/5 shadow-2xl relative overflow-hidden">
                           <div className="absolute top-0 right-0 p-4 opacity-5"><Zap size={48} className="text-indigo-400" /></div>
                           <p className="text-xs text-indigo-200 font-bold leading-relaxed relative z-10 italic">
                               "{liveCoaching}"
                           </p>
                       </div>
                   </div>
                </div>

                <div className="mt-8 grid grid-cols-2 gap-3">
                   <div className="bg-slate-50 p-3 rounded-2xl text-center">
                       <p className="text-[9px] font-black text-slate-400 uppercase mb-1">Closer Index</p>
                       <div className="flex items-center justify-center gap-1">
                          {sentiment > 50 ? <TrendingUp size={14} className="text-emerald-500"/> : <TrendingDown size={14} className="text-red-500"/>}
                          <span className="text-sm font-black text-slate-900">{Math.round(sentiment * 0.8)}</span>
                       </div>
                   </div>
                   <div className="bg-slate-50 p-3 rounded-2xl text-center">
                       <p className="text-[9px] font-black text-slate-400 uppercase mb-1">Turns</p>
                       <p className="text-sm font-black text-slate-900">{transcript.length}</p>
                   </div>
                </div>
             </div>
          </div>
        </div>
      )}

      {status === 'analyzing' && (
        <div className="flex-1 flex flex-col items-center justify-center bg-slate-950 rounded-[3rem] text-white">
           <div className="relative mb-12">
              <RefreshCw className="animate-spin text-blue-500" size={120} />
              <Sparkles size={48} className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-white animate-pulse" />
           </div>
           <h3 className="text-4xl font-black tracking-tighter uppercase mb-4">Quantifying Performance</h3>
           <p className="text-slate-500 font-mono text-[10px] tracking-[0.4em] uppercase">Auditing sentiment index and objection handles...</p>
        </div>
      )}

      {status === 'feedback' && feedback && (
        <div className="flex-1 bg-white rounded-[3rem] border border-slate-200 shadow-2xl p-16 overflow-y-auto animate-fade-in custom-scrollbar">
           <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-16 gap-10 border-b border-slate-100 pb-10">
              <div>
                <h2 className="text-5xl font-black text-slate-900 tracking-tighter uppercase mb-4">{feedback.scenario} Review</h2>
                <div className="flex gap-6">
                    <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2"><Clock size={16}/> {feedback.duration} session</span>
                    <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2"><CheckCircle size={16}/> {feedback.date} completion</span>
                </div>
              </div>
              <div className="flex items-center gap-8 bg-slate-50 p-8 rounded-[3rem] border border-slate-100 shadow-inner">
                 <div className="text-center">
                    <div className={`text-7xl font-black tracking-tighter ${feedback.score > 80 ? 'text-emerald-500' : 'text-amber-500'}`}>{feedback.score}</div>
                    <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest mt-1">Combat Rating</div>
                 </div>
                 <div className={`p-6 rounded-[2rem] ${feedback.score > 80 ? 'bg-emerald-100 text-emerald-600 shadow-lg shadow-emerald-500/10' : 'bg-amber-100 text-amber-600'}`}>
                    {feedback.score > 80 ? <Trophy size={56} /> : <BarChart3 size={56} />}
                 </div>
              </div>
           </div>

           <div className="grid grid-cols-1 lg:grid-cols-2 gap-10 mb-16">
              <div className="space-y-8">
                <div className="bg-blue-50/50 p-10 rounded-[3rem] border border-blue-100 relative overflow-hidden">
                    <h4 className="text-sm font-black text-blue-900 mb-6 flex items-center gap-3 uppercase tracking-widest"><Sparkles size={24} /> AI Session Summary</h4>
                    <p className="text-blue-800 font-medium leading-relaxed text-lg italic">"{feedback.summary}"</p>
                </div>

                <div className="bg-emerald-50/50 p-10 rounded-[3rem] border border-emerald-100 relative overflow-hidden h-full flex flex-col">
                    <div className="absolute top-0 right-0 p-10 opacity-5"><MessageSquare size={180} className="text-emerald-600" /></div>
                    <h4 className="text-sm font-black text-emerald-900 mb-8 flex items-center gap-3 uppercase tracking-widest"><Award size={24} /> Strategic Feedback</h4>
                    <div className="prose prose-lg prose-emerald max-w-none flex-1">
                        <p className="text-emerald-800 font-medium leading-relaxed italic text-xl">"{feedback.feedback}"</p>
                    </div>
                </div>
              </div>

              <div className="space-y-8">
                <div className="bg-slate-900 p-10 rounded-[3rem] text-white shadow-2xl flex flex-col">
                    <h4 className="text-sm font-black text-blue-400 mb-8 flex items-center gap-3 uppercase tracking-widest"><ListChecks size={24} /> Key Action Items</h4>
                    <div className="space-y-4">
                        {feedback.actionItems?.map((item, i) => (
                            <div key={i} className="flex items-start gap-4 p-4 bg-white/5 rounded-2xl border border-white/10 group hover:bg-white/10 transition-all">
                                <div className="w-6 h-6 rounded-lg bg-blue-500/20 text-blue-400 flex items-center justify-center font-bold text-xs shrink-0">{i+1}</div>
                                <p className="text-sm font-medium text-slate-200">{item}</p>
                            </div>
                        ))}
                    </div>
                </div>

                <div className="bg-slate-900 p-10 rounded-[3rem] text-white shadow-2xl flex flex-col">
                    <h4 className="text-sm font-black text-emerald-400 mb-8 flex items-center gap-3 uppercase tracking-widest"><Activity size={24} /> Neural Objectives</h4>
                    <div className="space-y-4 flex-1 overflow-y-auto pr-4 custom-scrollbar">
                        {objections.map((obj, i) => (
                            <div key={i} className="flex items-center justify-between p-6 bg-white/5 rounded-3xl border border-white/10 group hover:bg-white/10 transition-all">
                                <div className="flex items-center gap-5">
                                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center font-black text-sm shrink-0 border transition-all ${obj.handled ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30' : 'bg-white/5 text-slate-500 border-white/5'}`}>
                                        {obj.handled ? <CheckCircle size={20}/> : i+1}
                                    </div>
                                    <span className={`text-sm font-bold transition-all ${obj.handled ? 'text-white' : 'text-slate-500'}`}>"{obj.objection}"</span>
                                </div>
                                {obj.handled && (
                                    <div className="flex items-center gap-2">
                                        <span className="text-[10px] font-black uppercase text-emerald-400 tracking-widest">Mastered</span>
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                </div>
              </div>
           </div>

           <div className="flex justify-center gap-6 no-print">
              <button onClick={() => setStatus('idle')} className="px-12 py-6 border-2 border-slate-200 rounded-[2rem] font-black text-xs uppercase tracking-[0.2em] text-slate-500 hover:bg-slate-50 transition-all active:scale-95">Back to Base</button>
              <button onClick={startSession} className="px-12 py-6 bg-slate-950 text-white rounded-[2rem] font-black text-xs uppercase tracking-[0.2em] hover:bg-blue-600 shadow-2xl shadow-slate-950/20 transition-all flex items-center gap-4 transform active:scale-95">
                 <RefreshCw size={24} /> Relaunch Session
              </button>
           </div>
        </div>
      )}
    </div>
  );
};

export default SalesTrainer;