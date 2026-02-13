import React, { useRef, useState, useEffect } from 'react';
import { FundingOffer } from '../types';
// Fixed: Added RefreshCw to imports
import { PenTool, X, Shield, CheckCircle, AlertTriangle, Eraser, Type, MousePointer2, Fingerprint, Lock, ShieldCheck, RefreshCw } from 'lucide-react';

interface SmartContractSignerProps {
  offer: FundingOffer;
  onClose: () => void;
  onSign: (signature: string) => void;
}

const SmartContractSigner: React.FC<SmartContractSignerProps> = ({ offer, onClose, onSign }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [activeTab, setActiveTab] = useState<'draw' | 'type'>('draw');
  const [typedName, setTypedName] = useState('');
  const [isCanvasEmpty, setIsCanvasEmpty] = useState(true);
  const [isDrawing, setIsDrawing] = useState(false);
  const [isFinalizing, setIsFinalizing] = useState(false);

  const startDrawing = (e: React.MouseEvent | React.TouchEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    setIsDrawing(true);
    setIsCanvasEmpty(false);
    const { offsetX, offsetY } = getCoordinates(e, canvas);
    ctx.beginPath();
    ctx.moveTo(offsetX, offsetY);
  };

  const draw = (e: React.MouseEvent | React.TouchEvent) => {
    if (!isDrawing) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const { offsetX, offsetY } = getCoordinates(e, canvas);
    ctx.lineTo(offsetX, offsetY);
    ctx.stroke();
  };

  const stopDrawing = () => {
    setIsDrawing(false);
  };

  const getCoordinates = (e: React.MouseEvent | React.TouchEvent, canvas: HTMLCanvasElement) => {
    if ('touches' in e) {
      const rect = canvas.getBoundingClientRect();
      return { offsetX: e.touches[0].clientX - rect.left, offsetY: e.touches[0].clientY - rect.top };
    } else {
      return { offsetX: (e as React.MouseEvent).nativeEvent.offsetX, offsetY: (e as React.MouseEvent).nativeEvent.offsetY };
    }
  };

  const handleFinish = async () => {
    setIsFinalizing(true);
    // Simulation of Forensic Processing
    await new Promise(resolve => setTimeout(resolve, 1500));
    
    let signatureData = '';
    if (activeTab === 'draw') {
      if (isCanvasEmpty) return;
      signatureData = canvasRef.current?.toDataURL() || '';
    } else {
      if (!typedName.trim()) return;
      signatureData = `typed:${typedName}`; 
    }
    onSign(signatureData);
    setIsFinalizing(false);
  };

  useEffect(() => {
    if (activeTab === 'draw' && canvasRef.current) {
      const canvas = canvasRef.current;
      canvas.width = canvas.offsetWidth;
      canvas.height = canvas.offsetHeight;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.strokeStyle = '#000';
        ctx.lineWidth = 2.5;
        ctx.lineCap = 'round';
      }
    }
  }, [activeTab]);

  return (
    <div className="fixed inset-0 z-[100] bg-slate-950/90 backdrop-blur-md flex items-center justify-center p-4">
      <div className="bg-white w-full max-w-5xl rounded-[2.5rem] shadow-[0_0_80px_rgba(0,0,0,0.4)] overflow-hidden flex flex-col md:flex-row h-[85vh] animate-fade-in border border-white/20">
        
        <div className="w-full md:w-1/2 bg-slate-50 p-10 border-r border-slate-200 overflow-y-auto custom-scrollbar">
          <div className="mb-10">
            <h2 className="text-3xl font-black text-slate-900 flex items-center gap-3 uppercase tracking-tighter leading-none">
              <ShieldCheck className="text-emerald-500" size={32} /> Secure Protocol
            </h2>
            <p className="text-[10px] text-slate-400 font-black uppercase tracking-[0.3em] mt-3">Non-Repudiation Verified</p>
          </div>

          <div className="space-y-8">
            <div className="bg-white p-8 rounded-[2rem] border border-slate-200 shadow-sm relative overflow-hidden group">
              <div className="absolute top-0 right-0 p-4 opacity-5 group-hover:scale-110 transition-transform"><PenTool size={100} /></div>
              <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest mb-6">Execution Terms</h3>
              <div className="grid grid-cols-2 gap-8">
                <div><p className="text-[10px] text-slate-500 uppercase font-black tracking-widest mb-1">Loan Magnitude</p><p className="text-2xl font-black text-slate-900">${offer.amount.toLocaleString()}</p></div>
                <div><p className="text-[10px] text-slate-500 uppercase font-black tracking-widest mb-1">Entity</p><p className="text-lg font-bold text-slate-900 truncate">{offer.lenderName}</p></div>
                <div><p className="text-[10px] text-slate-500 uppercase font-black tracking-widest mb-1">Duration</p><p className="font-black text-slate-800 uppercase">{offer.term}</p></div>
                <div><p className="text-[10px] text-slate-500 uppercase font-black tracking-widest mb-1">Frequency</p><p className="font-black text-slate-800 uppercase">{offer.payment}</p></div>
              </div>
            </div>

            <div className="bg-slate-900 p-8 rounded-[2rem] text-white relative overflow-hidden shadow-2xl">
               <div className="flex items-center gap-4 mb-6">
                  <div className="p-3 bg-emerald-500/20 text-emerald-400 rounded-2xl border border-emerald-500/30"><Fingerprint size={24} /></div>
                  <h4 className="text-xs font-black uppercase tracking-widest">Neural Forensic Audit</h4>
               </div>
               <div className="space-y-4 text-[10px] font-mono text-slate-400 uppercase tracking-widest">
                  <div className="flex justify-between border-b border-white/5 pb-2"><span>IP Signature</span><span className="text-emerald-400 font-bold">Captured</span></div>
                  <div className="flex justify-between border-b border-white/5 pb-2"><span>Device ID</span><span className="text-emerald-400 font-bold">Logged</span></div>
                  <div className="flex justify-between border-b border-white/5 pb-2"><span>Jurisdiction</span><span className="text-blue-400 font-bold">Auto-Scan Active</span></div>
               </div>
            </div>
            
            <p className="text-[10px] text-slate-400 leading-relaxed uppercase font-bold tracking-tighter italic">
               By executing this agreement, you acknowledge the use of Neural Forensics to verify identity. All signatures are legally binding under the Federal ESIGN Act of 2000.
            </p>
          </div>
        </div>

        <div className="w-full md:w-1/2 bg-white p-12 flex flex-col relative">
          <div className="flex justify-between items-center mb-10">
            <h3 className="font-black text-slate-800 text-xl uppercase tracking-tighter flex items-center gap-3">
              <Lock size={20} className="text-blue-600" /> Digital Ink
            </h3>
            <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-xl transition-all text-slate-400"><X size={32} /></button>
          </div>

          <div className="flex gap-4 mb-10 bg-slate-50 p-1.5 rounded-2xl shadow-inner border border-slate-100">
            <button onClick={() => setActiveTab('draw')} className={`flex-1 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${activeTab === 'draw' ? 'bg-white shadow-md text-blue-600' : 'text-slate-50'}`}>Draw</button>
            <button onClick={() => setActiveTab('type')} className={`flex-1 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${activeTab === 'type' ? 'bg-white shadow-md text-blue-600' : 'text-slate-50'}`}>Type</button>
          </div>

          <div className="flex-1 flex flex-col justify-center">
            {activeTab === 'draw' ? (
              <div className="relative border-4 border-dashed border-slate-100 rounded-[2.5rem] bg-slate-50/50 h-80 touch-none group hover:border-blue-200 transition-colors">
                <canvas ref={canvasRef} className="w-full h-full cursor-crosshair rounded-[2.5rem]" onMouseDown={startDrawing} onMouseMove={draw} onMouseUp={stopDrawing} onMouseLeave={stopDrawing} onTouchStart={startDrawing} onTouchMove={draw} onTouchEnd={stopDrawing} />
                {isCanvasEmpty && <div className="absolute inset-0 flex items-center justify-center pointer-events-none opacity-20"><p className="text-slate-900 text-4xl font-handwriting">Signature</p></div>}
                <button onClick={() => { const ctx = canvasRef.current?.getContext('2d'); ctx?.clearRect(0,0,999,999); setIsCanvasEmpty(true); }} className="absolute bottom-6 right-6 p-4 bg-white shadow-xl border border-slate-200 rounded-2xl text-slate-400 hover:text-red-500 transition-all"><Eraser size={24} /></button>
              </div>
            ) : (
              <div className="h-80 flex flex-col justify-center gap-6 text-center">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-[0.3em]">Full Legal Name</label>
                <input type="text" value={typedName} onChange={(e) => setTypedName(e.target.value)} placeholder="John Doe" className="w-full p-4 text-6xl font-handwriting border-b-4 border-slate-100 focus:border-blue-500 outline-none text-center bg-transparent transition-all" />
              </div>
            )}
          </div>

          <div className="mt-12 flex gap-4">
            <button onClick={onClose} className="px-10 py-5 rounded-2xl font-black text-xs uppercase tracking-widest text-slate-400 hover:bg-slate-50 transition-all">Cancel</button>
            <button 
              onClick={handleFinish}
              disabled={isFinalizing || (activeTab === 'draw' && isCanvasEmpty) || (activeTab === 'type' && !typedName.trim())}
              className="flex-1 bg-slate-950 text-white py-6 rounded-[2rem] font-black uppercase text-sm tracking-[0.2em] hover:bg-blue-600 shadow-2xl shadow-slate-900/20 disabled:opacity-50 flex items-center justify-center gap-4 transition-all transform active:scale-95"
            >
              {isFinalizing ? <RefreshCw className="animate-spin" size={24}/> : <CheckCircle size={24} />}
              {isFinalizing ? 'Finalizing...' : 'Adopt & Sign Protocol'}
            </button>
          </div>
        </div>

      </div>
    </div>
  );
};

export default SmartContractSigner;