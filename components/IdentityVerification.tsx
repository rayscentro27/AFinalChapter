
import React, { useState, useRef } from 'react';
// Added BrainCircuit to the imports from lucide-react
import { Camera, ShieldCheck, RefreshCw, X, CheckCircle, AlertTriangle, Fingerprint, Scan, UserCheck, Smartphone, BrainCircuit } from 'lucide-react';
import { Contact } from '../types';
import * as geminiService from '../services/geminiService';

interface IdentityVerificationProps {
  contact: Contact;
  onUpdateContact: (contact: Contact) => void;
}

const IdentityVerification: React.FC<IdentityVerificationProps> = ({ contact, onUpdateContact }) => {
  const [step, setStep] = useState<'intro' | 'capture' | 'analyzing' | 'success' | 'fail'>('intro');
  const [biometricResult, setBiometricResult] = useState<any>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const startCamera = async () => {
    setStep('capture');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' } });
      if (videoRef.current) videoRef.current.srcObject = stream;
    } catch (err) {
      setStep('intro');
    }
  };

  const captureAndVerify = () => {
    if (videoRef.current && canvasRef.current) {
      const context = canvasRef.current.getContext('2d');
      if (context) {
        canvasRef.current.width = videoRef.current.videoWidth;
        canvasRef.current.height = videoRef.current.videoHeight;
        context.drawImage(videoRef.current, 0, 0);
        const cameraBase64 = canvasRef.current.toDataURL('image/jpeg').split(',')[1];
        
        // Stop stream
        const stream = videoRef.current.srcObject as MediaStream;
        stream.getTracks().forEach(t => t.stop());
        
        setStep('analyzing');
        
        // Logic: Compare live frame vs document in vault
        const idDoc = contact.documents?.find(d => d.type === 'Identification');
        const idBase64 = idDoc?.fileUrl || "MOCK_BASE64"; // In real app, fetch from storage

        geminiService.verifyBiometricIdentity(cameraBase64, idBase64).then(res => {
            if (res.isMatch) {
                setBiometricResult(res);
                onUpdateContact({
                    ...contact,
                    compliance: { ...contact.compliance!, kycStatus: 'Verified' } as any,
                    activities: [...(contact.activities || []), { id: `kyc_${Date.now()}`, type: 'system', description: `Multimodal Biometric Link: Success (${res.confidence}% confidence).`, date: new Date().toLocaleString(), user: 'Sentinel' }]
                });
                setStep('success');
            } else {
                setStep('fail');
            }
        });
      }
    }
  };

  return (
    <div className="bg-white rounded-[2.5rem] border border-slate-200 shadow-sm overflow-hidden animate-fade-in">
      <div className="bg-slate-950 p-8 text-white flex justify-between items-center relative overflow-hidden">
        <div className="absolute top-0 right-0 p-8 opacity-10 animate-pulse"><Fingerprint size={120} /></div>
        <div className="relative z-10">
           <h3 className="text-2xl font-black uppercase tracking-tight flex items-center gap-3">
             <Smartphone className="text-blue-400" /> Multimodal ID Link
           </h3>
           <p className="text-slate-400 text-xs font-bold uppercase tracking-widest mt-1">Forensic 1:1 Cross-Check Protocol</p>
        </div>
      </div>

      <div className="p-10 flex flex-col items-center justify-center min-h-[450px]">
        {step === 'intro' && (
            <div className="text-center space-y-8 max-w-sm">
                <div className="w-24 h-24 bg-blue-50 border-2 border-dashed border-blue-200 rounded-[2.5rem] flex items-center justify-center mx-auto text-blue-500 shadow-inner">
                    <Scan size={40} />
                </div>
                <h4 className="text-xl font-black text-slate-900 uppercase">Audit Person vs. ID</h4>
                <p className="text-sm text-slate-500 font-medium leading-relaxed">
                    Nexus AI will compare your live video stream against the ID in your vault to verify digital and physical integrity.
                </p>
                <button onClick={startCamera} className="w-full py-5 bg-slate-950 text-white rounded-2xl font-black uppercase text-[10px] tracking-widest shadow-2xl transform active:scale-95 transition-all">
                    Initialize Verification Node
                </button>
            </div>
        )}

        {step === 'capture' && (
            <div className="relative w-full max-w-md animate-fade-in">
                <div className="aspect-square bg-black rounded-[3rem] overflow-hidden border-8 border-slate-900 relative shadow-2xl">
                    <video ref={videoRef} autoPlay playsInline className="w-full h-full object-cover scale-x-[-1]" />
                    <div className="animate-laser-scan"></div>
                </div>
                <button onClick={captureAndVerify} className="w-20 h-20 bg-white border-8 border-slate-200 rounded-full absolute -bottom-10 left-1/2 -translate-x-1/2 shadow-2xl flex items-center justify-center hover:scale-110 active:scale-95 transition-all z-20">
                    <div className="w-8 h-8 bg-blue-600 rounded-full animate-pulse" />
                </button>
            </div>
        )}

        {step === 'analyzing' && (
            <div className="text-center space-y-6">
                <div className="relative mb-10">
                   <RefreshCw className="animate-spin text-blue-600 opacity-20" size={120} />
                   <BrainCircuit size={48} className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-indigo-500 animate-pulse" />
                </div>
                <h4 className="text-2xl font-black text-slate-900 uppercase tracking-tight">Cross-Referencing...</h4>
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Performing 1:1 Multimodal Comparison</p>
            </div>
        )}

        {step === 'success' && (
            <div className="text-center animate-fade-in space-y-8">
                <div className="w-24 h-24 bg-emerald-50 text-emerald-500 rounded-[2.5rem] flex items-center justify-center mx-auto shadow-inner border border-emerald-100">
                    <UserCheck size={48} />
                </div>
                <div>
                    <h4 className="text-3xl font-black text-slate-900 uppercase tracking-tight">Identity Vaulted</h4>
                    <p className="text-sm text-slate-500 font-medium mt-2 italic">"{biometricResult?.reason}"</p>
                </div>
                <button onClick={() => setStep('intro')} className="px-10 py-4 bg-slate-900 text-white rounded-2xl font-black uppercase text-[10px] tracking-widest shadow-xl">Return to Desk</button>
            </div>
        )}
      </div>
      <canvas ref={canvasRef} className="hidden" />
    </div>
  );
};

export default IdentityVerification;
