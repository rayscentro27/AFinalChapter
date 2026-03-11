
import React, { useState, useRef, useEffect } from 'react';
import { VoiceAgentConfig, CallLog } from '../types';
import { PhoneCall, Mic, StopCircle, Settings, Save, PlayCircle, BarChart3, User, BookOpen, Volume2, ShieldCheck, AlertTriangle, RefreshCw, X } from 'lucide-react';
import { GoogleGenAI, LiveServerMessage, Modality } from '@google/genai';

// Audio Utils
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

const VoiceReceptionist: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'config' | 'simulator' | 'logs'>('config');
  const [config, setConfig] = useState<VoiceAgentConfig>({
    id: 'va_1',
    name: 'Sarah',
    voiceName: 'Puck',
    openingLine: "Thanks for calling the funding desk, this is Sarah. How can I assist your business today?",
    systemInstruction: `You are Sarah, an elite AI receptionist for a business funding agency.
Your goal is to qualify inbound leads.
1. Be warm, professional, and very efficient.
2. Ask for the business name, monthly revenue, and years in business.
3. If revenue is >$15,000/mo and they have been in business >6 months, tell them they are "Tier 1 Qualified" and offer to book a strategy session.
4. If not qualified, politely let them know we'll keep their profile on file for future micro-funding rounds.
5. Use the provided knowledge base to answer questions about products.`,
    knowledgeBase: `Products: 0% Interest Cards, SBA 7a, Revenue Based Financing.
Requirements: 680+ FICO for 0% cards, $15k+ revenue for high-limit lines.
Deployment Time: 24-48 hours.`,
    isActive: true
  });

  const [status, setStatus] = useState<'idle' | 'connecting' | 'active'>('idle');
  const [volumeLevel, setVolumeLevel] = useState(0);
  const [transcript, setTranscript] = useState<{role: string, text: string}[]>([]);

  const audioContextRef = useRef<AudioContext | null>(null);
  const nextStartTimeRef = useRef<number>(0);
  const sourcesRef = useRef<Set<AudioBufferSourceNode>>(new Set());
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const sessionRef = useRef<any>(null);
  const currentInputTranscription = useRef('');
  const currentOutputTranscription = useRef('');

  const startSession = async () => {
    setStatus('connecting');
    setTranscript([]);
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

      const sessionPromise = ai.live.connect({
        model: 'gemini-2.5-flash-native-audio-preview-12-2025',
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: config.voiceName } } },
          systemInstruction: `${config.systemInstruction}\n\nKnowledge Base:\n${config.knowledgeBase}`,
        },
        callbacks: {
          onopen: () => {
            setStatus('active');
            processor.onaudioprocess = (e) => {
              const inputData = e.inputBuffer.getChannelData(0);
              let sum = 0;
              for(let i=0; i<inputData.length; i++) sum += inputData[i] * inputData[i];
              setVolumeLevel(Math.sqrt(sum / inputData.length) * 50);
              sessionPromise.then(session => session.sendRealtimeInput({ media: createBlob(inputData) }));
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
          },
          onclose: () => setStatus('idle'),
          onerror: () => stopSession()
        }
      });
      sessionRef.current = sessionPromise;
    } catch (e) {
      console.error(e);
      setStatus('idle');
    }
  };

  const stopSession = async () => {
    if (processorRef.current) {
      processorRef.current.disconnect();
      processorRef.current.onaudioprocess = null;
    }
    if (streamRef.current) streamRef.current.getTracks().forEach(t => t.stop());
    if (sessionRef.current) {
        try { (await sessionRef.current).close(); } catch(e) {}
    }
    sourcesRef.current.forEach(s => s.stop());
    sourcesRef.current.clear();
    if (audioContextRef.current) {
      audioContextRef.current.close();
      audioContextRef.current = null;
    }
    setStatus('idle');
  };

  return (
    <div className="max-w-6xl mx-auto space-y-8 animate-fade-in pb-10">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-black text-slate-900 flex items-center gap-3 uppercase tracking-tighter">
            <PhoneCall className="text-blue-600" size={32} /> AI Inbound Receptionist
          </h1>
          <p className="text-slate-500 mt-2 font-medium">Manage your 24/7 autonomous qualifier and booking agent.</p>
        </div>
        <div className="flex gap-2 bg-slate-100 p-1.5 rounded-2xl shadow-inner border border-slate-200">
           {['config', 'simulator', 'logs'].map((t: any) => (
               <button key={t} onClick={() => setActiveTab(t)} className={`px-6 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${activeTab === t ? 'bg-white shadow-md text-blue-600' : 'text-slate-400'}`}>
                   {t}
               </button>
           ))}
        </div>
      </div>

      {activeTab === 'config' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
           <div className="bg-white p-10 rounded-[2.5rem] border border-slate-200 shadow-sm space-y-8">
              <h3 className="font-black text-slate-900 flex items-center gap-3 border-b border-slate-100 pb-4 mb-4 uppercase text-xs tracking-[0.2em]">
                <User size={20} className="text-blue-500"/> Agent Configuration
              </h3>
              <div className="space-y-6">
                 <div>
                    <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 ml-1">Agent Identity</label>
                    <input type="text" value={config.name} onChange={(e) => setConfig({...config, name: e.target.value})} className="w-full bg-slate-50 border border-slate-200 rounded-xl p-4 font-bold outline-none" />
                 </div>
                 <div>
                    <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 ml-1">Opening Directive</label>
                    <textarea value={config.openingLine} onChange={(e) => setConfig({...config, openingLine: e.target.value})} className="w-full bg-slate-50 border border-slate-200 rounded-xl p-4 h-24 resize-none text-sm font-medium" />
                 </div>
                 <div>
                    <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 ml-1">Neural Logic System</label>
                    <textarea value={config.systemInstruction} onChange={(e) => setConfig({...config, systemInstruction: e.target.value})} className="w-full bg-slate-50 border border-slate-200 rounded-xl p-4 h-48 resize-none text-xs font-mono" />
                 </div>
              </div>
           </div>
           <div className="space-y-8">
              <div className="bg-white p-10 rounded-[2.5rem] border border-slate-200 shadow-sm">
                 <h3 className="font-black text-slate-900 flex items-center gap-3 border-b border-slate-100 pb-4 mb-6 uppercase text-xs tracking-[0.2em]">
                    <BookOpen size={20} className="text-emerald-500"/> Agency Knowledge Base
                 </h3>
                 <textarea value={config.knowledgeBase} onChange={(e) => setConfig({...config, knowledgeBase: e.target.value})} className="w-full bg-slate-50 border border-slate-200 rounded-xl p-6 h-64 resize-none text-sm font-medium" placeholder="Upload product guides or FAQs..." />
              </div>
              <button onClick={() => alert("Deployment successful.")} className="w-full bg-slate-950 text-white py-5 rounded-[2rem] font-black uppercase text-[10px] tracking-[0.3em] hover:bg-blue-600 shadow-2xl transition-all flex items-center justify-center gap-3">
                 <Save size={18}/> Deploy Agent to Floor
              </button>
           </div>
        </div>
      )}

      {activeTab === 'simulator' && (
        <div className="bg-slate-950 rounded-[3rem] p-12 shadow-[0_0_80px_rgba(0,0,0,0.4)] min-h-[600px] flex flex-col items-center justify-center relative overflow-hidden border border-white/5">
           <div className="absolute top-8 right-8">
              <div className={`flex items-center gap-2 px-4 py-2 rounded-full text-[10px] font-black uppercase border ${status === 'active' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' : 'bg-white/5 text-slate-500 border-white/5'}`}>
                 <div className={`w-2 h-2 rounded-full ${status === 'active' ? 'bg-emerald-500 animate-pulse shadow-[0_0_8px_#10b981]' : 'bg-slate-700'}`}></div>
                 {status === 'active' ? 'Neural Link Active' : 'Idle'}
              </div>
           </div>

           {status === 'idle' ? (
              <div className="text-center max-w-md">
                 <div className="w-32 h-32 bg-slate-900 rounded-[3rem] flex items-center justify-center mx-auto mb-10 border-4 border-white/5 shadow-2xl transform hover:rotate-3 transition-transform">
                    <Mic size={48} className="text-slate-500" />
                 </div>
                 <h2 className="text-3xl font-black text-white mb-4 uppercase tracking-tight">Test Agent Sarah</h2>
                 <p className="text-slate-400 mb-10 leading-relaxed font-medium">Verify Sarah's qualifying logic and tone before pushing live to your inbound phone numbers.</p>
                 <button onClick={startSession} className="bg-emerald-500 hover:bg-emerald-400 text-slate-950 px-12 py-5 rounded-[2rem] font-black text-sm uppercase tracking-widest shadow-2xl transition-all flex items-center gap-3 mx-auto transform active:scale-95">
                    <Mic size={24} /> Initiate Test Session
                 </button>
              </div>
           ) : (
              <div className="w-full max-w-2xl flex flex-col items-center">
                 <div className="relative mb-20">
                    <div className="w-48 h-48 rounded-full bg-gradient-to-tr from-blue-600 to-emerald-600 flex items-center justify-center shadow-[0_0_60px_rgba(16,185,129,0.3)] transition-transform" style={{ transform: `scale(${1 + volumeLevel/150})` }}>
                       <Volume2 size={80} className="text-white opacity-90" />
                    </div>
                    <div className="absolute -bottom-10 left-1/2 -translate-x-1/2 text-white font-black uppercase tracking-[0.4em] text-[10px] animate-pulse">SARAH IS LISTENING</div>
                 </div>
                 <button onClick={stopSession} className="bg-red-600 hover:bg-red-700 text-white px-10 py-4 rounded-[2rem] font-black uppercase text-[10px] tracking-widest flex items-center gap-3 shadow-2xl">
                    <StopCircle size={20} /> Terminate Link
                 </button>
              </div>
           )}
        </div>
      )}

      {activeTab === 'logs' && (
          <div className="bg-white rounded-[2.5rem] border border-slate-200 shadow-sm overflow-hidden flex flex-col min-h-[500px]">
              <div className="p-10 border-b border-slate-100 flex justify-between items-center bg-slate-50">
                  <h3 className="font-black text-xs uppercase tracking-[0.2em] text-slate-800 flex items-center gap-2"><BarChart3 size={20} className="text-blue-500"/> Call Intelligence Ledger</h3>
              </div>
              <div className="p-20 text-center flex flex-col items-center">
                  <RefreshCw size={48} className="opacity-10 mb-4 animate-spin-slow" />
                  <p className="text-[10px] font-black uppercase tracking-[0.3em] text-slate-400">Awaiting Real-Time Call Data</p>
              </div>
          </div>
      )}
    </div>
  );
};

export default VoiceReceptionist;
