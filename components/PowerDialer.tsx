
import React, { useState, useEffect, useRef } from 'react';
import { Contact, Activity, ClientTask } from '../types';
import { 
  Phone, PhoneOff, Mic, StopCircle, User, FileText, ChevronRight, 
  X, Clock, Play, SkipForward, CheckCircle, AlertTriangle, 
  Calendar, MessageSquare, BarChart2, Zap, BrainCircuit, 
  RefreshCw, Volume2, ArrowRight, Sparkles, ClipboardCheck,
  ListChecks, Award, Hash, MessageCircle, AlertOctagon,
  Target, Terminal
} from 'lucide-react';
import * as geminiService from '../services/geminiService';
import { GoogleGenAI, LiveServerMessage, Modality, Type, FunctionDeclaration } from '@google/genai';

// --- Audio Utils ---
function decode(base64: string) {
  const binaryString = atob(base64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
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

const calendarTool: FunctionDeclaration = {
  name: 'schedule_meeting',
  parameters: {
    type: Type.OBJECT,
    description: 'Schedules a follow-up Zoom/Google Meet with the borrower.',
    properties: {
      meetingTime: { type: Type.STRING },
      meetingType: { type: Type.STRING, enum: ['Underwriting Review', 'Closing Call'] },
    },
    required: ['meetingTime', 'meetingType'],
  },
};

interface PowerDialerProps {
  queue: Contact[];
  onUpdateContact: (contact: Contact) => void;
  onClose: () => void;
}

const PowerDialer: React.FC<PowerDialerProps> = ({ queue, onUpdateContact, onClose }) => {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [callStatus, setCallStatus] = useState<'idle' | 'calling' | 'connected' | 'wrapping'>('idle');
  const [mode, setMode] = useState<'manual' | 'neural'>('neural');
  const [duration, setDuration] = useState(0);
  const [script, setScript] = useState('Generating intelligent script...');
  const [thinkingHUD, setThinkingHUD] = useState<string[]>([]);
  const [volumeLevel, setVolumeLevel] = useState(0);
  const [liveTranscript, setLiveTranscript] = useState<{ role: string; text: string }[]>([]);
  const [debrief, setDebrief] = useState<{ summary: string; actionItems: string[] } | null>(null);
  
  const currentContact = queue[currentIndex];
  
  // Audio & Session Refs
  const sessionRef = useRef<any>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const nextStartTimeRef = useRef<number>(0);
  const sourcesRef = useRef<Set<AudioBufferSourceNode>>(new Set());
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const transcriptBuffer = useRef({ input: '', output: '' });

  // Update Thinking HUD during call
  useEffect(() => {
    if (callStatus === 'connected' && liveTranscript.length > 0) {
        const interval = setInterval(async () => {
            const thought = await geminiService.explainNeuralThinking(liveTranscript, currentContact);
            setThinkingHUD(prev => [thought, ...prev].slice(0, 5));
        }, 8000);
        return () => clearInterval(interval);
    }
  }, [callStatus, liveTranscript.length]);

  const startNeuralCall = async () => {
    if (!currentContact) return;
    setCallStatus('calling');
    setLiveTranscript([]);
    setThinkingHUD(["Initializing Neural Loop...", "Authenticating Agent SARAH..."]);
    
    try {
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      audioContextRef.current = new AudioContextClass({ sampleRate: 24000 });
      nextStartTimeRef.current = audioContextRef.current.currentTime;

      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { sampleRate: 16000 } });
      streamRef.current = stream;

      const inputCtx = new AudioContextClass({ sampleRate: 16000 });
      const source = inputCtx.createMediaStreamSource(stream);
      const processor = inputCtx.createScriptProcessor(4096, 1, 1);
      processorRef.current = processor;

      const instruction = `
      AI AGENT: You are "Sarah", calling ${currentContact.name} at ${currentContact.company}.
      PERSONA: ${currentContact.persona || 'Visionary'}.
      GOAL: Qualify for Tier 2 capital.
      `;

      const sessionPromise = ai.live.connect({
        model: 'gemini-2.5-flash-native-audio-preview-12-2025',
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Zephyr' } } },
          systemInstruction: instruction,
          tools: [{ functionDeclarations: [calendarTool] }],
          inputAudioTranscription: {},
          outputAudioTranscription: {}
        },
        callbacks: {
          onopen: () => {
            setCallStatus('connected');
            processor.onaudioprocess = (e) => {
              const inputData = e.inputBuffer.getChannelData(0);
              let sum = 0;
              for(let i=0; i<inputData.length; i++) sum += inputData[i] * inputData[i];
              setVolumeLevel(Math.sqrt(sum / inputData.length) * 100);
              sessionPromise.then(s => s.sendRealtimeInput({ media: createBlob(inputData) }));
            };
            source.connect(processor);
            processor.connect(inputCtx.destination);
          },
          onmessage: async (msg: LiveServerMessage) => {
            const audioData = msg.serverContent?.modelTurn?.parts?.[0]?.inlineData?.data;
            if (audioData && audioContextRef.current) {
              const buffer = await decodeAudioData(decode(audioData), audioContextRef.current, 24000, 1);
              const audioSource = audioContextRef.current.createBufferSource();
              audioSource.buffer = buffer;
              audioSource.connect(audioContextRef.current.destination);
              const start = Math.max(nextStartTimeRef.current, audioContextRef.current.currentTime);
              audioSource.start(start);
              nextStartTimeRef.current = start + buffer.duration;
              sourcesRef.current.add(audioSource);
            }

            if (msg.serverContent?.inputTranscription?.text) transcriptBuffer.current.input += msg.serverContent.inputTranscription.text;
            if (msg.serverContent?.outputTranscription?.text) transcriptBuffer.current.output += msg.serverContent.outputTranscription.text;
            
            if (msg.serverContent?.turnComplete) {
              if (transcriptBuffer.current.input) setLiveTranscript(p => [...p, { role: 'Borrower', text: transcriptBuffer.current.input }]);
              if (transcriptBuffer.current.output) setLiveTranscript(p => [...p, { role: 'Nexus Agent', text: transcriptBuffer.current.output }]);
              transcriptBuffer.current = { input: '', output: '' };
            }
          }
        }
      });
      sessionRef.current = sessionPromise;
    } catch (e) {
      setCallStatus('idle');
    }
  };

  const stopNeuralSession = async () => {
    if (processorRef.current) {
      processorRef.current.disconnect();
      processorRef.current.onaudioprocess = null;
    }
    if (sessionRef.current) {
      try { (await sessionRef.current).close(); } catch (e) {}
    }
    if (streamRef.current) streamRef.current.getTracks().forEach(t => t.stop());
    setCallStatus('wrapping');
  };

  return (
    <div className="fixed inset-0 z-[200] bg-slate-950 flex flex-col animate-fade-in text-slate-100 font-sans">
      <div className="h-20 border-b border-white/5 flex items-center justify-between px-8 bg-slate-900/50 backdrop-blur-xl shrink-0">
        <div className="flex items-center gap-4">
          <div className={`p-2.5 rounded-2xl shadow-2xl transition-all duration-700 ${callStatus === 'connected' ? 'bg-indigo-600 shadow-indigo-500/40 animate-pulse' : 'bg-slate-800'}`}>
            <BrainCircuit size={28}/>
          </div>
          <div>
            <h2 className="font-black text-xl uppercase tracking-tighter">Neural Power Dialer</h2>
            <p className="text-[9px] text-slate-500 font-black uppercase tracking-widest">{currentIndex + 1} / {queue.length} TARGETED ENTITIES</p>
          </div>
        </div>
        <div className="flex items-center gap-6">
          <button onClick={onClose} className="p-3 hover:bg-white/10 rounded-2xl transition-all"><X size={28}/></button>
        </div>
      </div>

      <div className="flex-1 grid grid-cols-12 overflow-hidden">
        {/* Left Stats */}
        <div className="col-span-3 border-r border-white/5 bg-slate-900/40 p-8 overflow-y-auto custom-scrollbar">
          <div className="text-center mb-10">
            <div className="w-24 h-24 bg-gradient-to-br from-slate-800 to-slate-700 rounded-[2.5rem] mx-auto flex items-center justify-center text-3xl font-black mb-4 border border-white/10 shadow-2xl">
              {currentContact.name.charAt(0)}
            </div>
            <h3 className="text-xl font-black text-white tracking-tight uppercase mb-1">{currentContact.company}</h3>
            <div className="flex justify-center mt-2">
                <span className="bg-indigo-500/20 text-indigo-400 px-3 py-1 rounded-full text-[8px] font-black uppercase border border-indigo-500/20">
                    {currentContact.persona || 'Analyzing Persona...'}
                </span>
            </div>
          </div>

          <div className="space-y-4">
            <div className="p-5 bg-white/5 rounded-[1.5rem] border border-white/5">
                <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-4 flex items-center gap-2"><ClipboardCheck size={12}/> Merchant Intel</p>
                <div className="space-y-3">
                    <IntelBit label="Revenue (Mo)" val={`$${currentContact.revenue?.toLocaleString() || '---'}`} />
                    <IntelBit label="Pulse Index" val={`${currentContact.aiScore || 50}%`} />
                </div>
            </div>

            {/* NEW: THOUGHT TERMINAL */}
            <div className="p-5 bg-black/50 rounded-[1.5rem] border border-indigo-500/20 h-64 flex flex-col overflow-hidden">
                <p className="text-[9px] font-black text-indigo-400 uppercase tracking-[0.2em] mb-4 flex items-center gap-2">
                    <Terminal size={12}/> Neural Thinking HUD
                </p>
                <div className="flex-1 overflow-y-auto font-mono text-[9px] space-y-2 custom-scrollbar">
                    {thinkingHUD.length === 0 && <p className="text-slate-700 italic">Awaiting neural turns...</p>}
                    {thinkingHUD.map((thought, i) => (
                        <div key={i} className="text-indigo-200 animate-fade-in border-l border-indigo-500/30 pl-2">
                            <span className="text-indigo-600">{'>>'}</span> {thought}
                        </div>
                    ))}
                </div>
            </div>
          </div>
        </div>

        {/* Center: Live Call HUD */}
        <div className="col-span-6 p-10 flex flex-col items-center justify-center relative overflow-hidden bg-slate-950">
          {callStatus === 'idle' ? (
            <div className="text-center animate-fade-in max-w-sm">
              <div className="w-32 h-32 rounded-[3rem] bg-indigo-900/50 flex items-center justify-center mb-8 shadow-2xl mx-auto transform hover:rotate-3 transition-transform">
                <BrainCircuit size={56} className="text-indigo-400" />
              </div>
              <h2 className="text-3xl font-black mb-6 tracking-tight uppercase">Manifest Bridge</h2>
              <button onClick={startNeuralCall} className="w-full py-5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-[2rem] font-black uppercase text-sm tracking-[0.2em] shadow-2xl flex items-center justify-center gap-3">
                Launch AI Sales Node <ArrowRight size={18} />
              </button>
            </div>
          ) : (
            <div className="w-full flex flex-col items-center max-w-2xl animate-fade-in h-full">
              <div className="flex-1 flex flex-col items-center justify-center w-full">
                 <div className="relative mb-20">
                    <div className="w-48 h-48 rounded-full bg-gradient-to-tr from-indigo-600 via-blue-600 to-emerald-600 flex items-center justify-center shadow-[0_0_100px_rgba(79,70,229,0.5)] transition-transform duration-75 relative z-10" style={{ transform: `scale(${1 + volumeLevel/150})` }}>
                        <Volume2 size={80} className="text-white opacity-90" />
                    </div>
                    <div className="absolute inset-[-40px] rounded-full border border-white/5 animate-pulse opacity-10"></div>
                 </div>
                 <div className="w-full bg-black/40 rounded-[3rem] p-8 border border-white/5 h-72 overflow-y-auto custom-scrollbar relative shadow-inner">
                    {liveTranscript.map((t, i) => (
                      <div key={i} className={`flex ${t.role.includes('Agent') ? 'justify-start' : 'justify-end'} mb-4 animate-fade-in`}>
                        <div className={`max-w-[85%] p-4 rounded-3xl text-sm leading-relaxed ${t.role.includes('Agent') ? 'bg-indigo-600 text-white rounded-tl-none shadow-lg' : 'bg-slate-800 text-slate-300 rounded-tr-none border border-white/5'}`}>
                            <span className="text-[8px] font-black uppercase block opacity-50 mb-1 tracking-widest">{t.role}</span>
                            {t.text}
                        </div>
                      </div>
                    ))}
                 </div>
              </div>
              <button onClick={stopNeuralSession} className="mb-10 bg-red-600 hover:bg-red-700 text-white px-12 py-5 rounded-[2rem] font-black uppercase tracking-widest text-[11px] shadow-2xl transition-all">
                  <StopCircle size={20} className="mr-2 inline" /> End Session
              </button>
            </div>
          )}
        </div>

        {/* Right: Tactics */}
        <div className="col-span-3 border-l border-white/5 bg-slate-900/40 p-8 flex flex-col overflow-hidden">
          <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-6">Neural Strategy Output</p>
          <div className="bg-white/5 border border-white/5 rounded-3xl p-6 text-xs text-slate-400 italic leading-relaxed mb-8 h-48 overflow-y-auto custom-scrollbar">
            {script}
          </div>
          
          <div className="flex-1 flex flex-col gap-4 overflow-hidden">
             <div className="p-6 bg-indigo-600/20 border border-indigo-500/40 rounded-2xl animate-fade-in">
                <div className="flex items-center gap-2 mb-3 text-indigo-400 font-black text-[9px] uppercase tracking-widest">
                  <Sparkles size={14} /> Tactical Pivot
                </div>
                <p className="text-xs text-indigo-100 font-bold leading-relaxed italic">
                    {thinkingHUD[0] || "Awaiting merchant engagement..."}
                </p>
             </div>
          </div>
        </div>
      </div>
    </div>
  );
};

const IntelBit = ({ label, val }: { label: string; val: string }) => (
  <div className="flex flex-col">
    <p className="text-[8px] text-slate-500 uppercase font-black tracking-widest">{label}</p>
    <p className="font-black text-sm tracking-tight text-white">{val}</p>
  </div>
);

export default PowerDialer;
