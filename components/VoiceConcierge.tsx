
import React, { useState, useRef, useEffect } from 'react';
import { GoogleGenAI, LiveServerMessage, Modality } from '@google/genai';
import { Mic, StopCircle, Volume2, Sparkles, X, BrainCircuit, ShieldCheck, Zap } from 'lucide-react';

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

interface VoiceConciergeProps {
  isOpen: boolean;
  onClose: () => void;
  context: any;
}

const VoiceConcierge: React.FC<VoiceConciergeProps> = ({ isOpen, onClose, context }) => {
  const [status, setStatus] = useState<'idle' | 'connecting' | 'active'>('idle');
  const [volumeLevel, setVolumeLevel] = useState(0);
  const sessionRef = useRef<any>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const nextStartTimeRef = useRef<number>(0);
  const sourcesRef = useRef<Set<AudioBufferSourceNode>>(new Set());
  const processorRef = useRef<ScriptProcessorNode | null>(null);

  useEffect(() => {
    if (isOpen && status === 'idle') {
      startSession();
    }
    return () => {
      if (!isOpen) stopSession();
    };
  }, [isOpen]);

  const startSession = async () => {
    setStatus('connecting');
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
        You are "Nexus Advisor", an elite business funding concierge for ${context.company}.
        Current Bankability Score: ${context.bankability}%.
        Your goal is to have a real-time voice conversation to help the business owner reach Tier 2 funding.
        Be encouraging, data-driven, and brief.
        Encourage them to connect their bank accounts if they haven't yet.
      `;

      const sessionPromise = ai.live.connect({
        model: 'gemini-2.5-flash-native-audio-preview-12-2025',
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Zephyr' } } },
          systemInstruction: instruction,
        },
        callbacks: {
          onopen: () => {
            setStatus('active');
            processor.onaudioprocess = (e) => {
              const inputData = e.inputBuffer.getChannelData(0);
              let sum = 0;
              for (let i = 0; i < inputData.length; i++) sum += inputData[i] * inputData[i];
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
    if (sessionRef.current) {
      try { (await sessionRef.current).close(); } catch (e) {}
    }
    if (streamRef.current) streamRef.current.getTracks().forEach(t => t.stop());
    sourcesRef.current.forEach(s => s.stop());
    sourcesRef.current.clear();
    if (audioContextRef.current) {
      audioContextRef.current.close();
      audioContextRef.current = null;
    }
    setStatus('idle');
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[300] bg-slate-950/80 backdrop-blur-xl flex items-center justify-center p-6 font-sans">
      <div className="bg-slate-900 w-full max-w-lg rounded-[3rem] border border-white/10 shadow-[0_0_100px_rgba(16,185,129,0.1)] overflow-hidden flex flex-col relative animate-fade-in">
        <div className="p-8 flex justify-between items-center border-b border-white/5">
           <div className="flex items-center gap-3">
              <div className="p-3 bg-emerald-500/20 text-emerald-400 rounded-2xl shadow-lg">
                 <BrainCircuit size={24} />
              </div>
              <div>
                 <h3 className="text-white font-black uppercase tracking-tight">Neural Concierge</h3>
                 <p className="text-[9px] text-emerald-500 font-black uppercase tracking-widest animate-pulse">Secure Link Active</p>
              </div>
           </div>
           <button onClick={onClose} className="p-3 text-slate-500 hover:text-white transition-colors bg-white/5 rounded-2xl">
              <X size={24} />
           </button>
        </div>

        <div className="flex-1 flex flex-col items-center justify-center p-12 text-center">
            <div className="relative mb-16">
               <div 
                 className={`w-48 h-48 rounded-full bg-gradient-to-tr from-emerald-600 to-blue-600 shadow-[0_0_60px_rgba(16,185,129,0.3)] transition-all duration-100 flex items-center justify-center relative z-10`}
                 style={{ transform: `scale(${1 + volumeLevel / 150})` }}
               >
                  <Volume2 size={80} className="text-white opacity-80" />
               </div>
               <div className="absolute inset-[-20px] rounded-full border border-white/5 animate-[ping_3s_infinite]"></div>
            </div>

            <div className="space-y-4">
                <h2 className="text-3xl font-black text-white tracking-tighter uppercase">
                    {status === 'connecting' ? 'Establishing Link...' : 'Ask your Advisor'}
                </h2>
                <p className="text-slate-400 font-medium leading-relaxed italic max-w-xs mx-auto">
                    "I am reviewing your liquidity vectors. How can I help you scale today?"
                </p>
            </div>

            <div className="mt-16 grid grid-cols-2 gap-4 w-full">
                <div className="bg-white/5 border border-white/10 p-4 rounded-2xl text-center">
                    <p className="text-[9px] font-black text-slate-500 uppercase mb-1">Privacy Shield</p>
                    <div className="flex items-center justify-center gap-1.5 text-emerald-400">
                        <ShieldCheck size={14} />
                        <span className="text-[10px] font-black uppercase">Verified</span>
                    </div>
                </div>
                <div className="bg-white/5 border border-white/10 p-4 rounded-2xl text-center">
                    <p className="text-[9px] font-black text-slate-500 uppercase mb-1">Neural Model</p>
                    <div className="flex items-center justify-center gap-1.5 text-blue-400">
                        <Zap size={14} fill="currentColor" />
                        <span className="text-[10px] font-black uppercase">v2.5 Pro</span>
                    </div>
                </div>
            </div>
        </div>

        <div className="p-8 bg-slate-950/50 border-t border-white/5 flex flex-col items-center">
            <button 
                onClick={onClose}
                className="bg-red-600/10 border border-red-500/20 hover:bg-red-600 text-red-500 hover:text-white px-10 py-4 rounded-[2rem] font-black uppercase tracking-widest text-[10px] transition-all active:scale-95 flex items-center gap-3 shadow-2xl"
            >
                <StopCircle size={18} /> Disconnect Session
            </button>
        </div>
      </div>
    </div>
  );
};

export default VoiceConcierge;
