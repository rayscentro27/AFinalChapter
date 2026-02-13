
import React, { useState } from 'react';
import { Contact, BusinessProfile } from '../types';
import { Building2, Save, CheckCircle, AlertTriangle, RefreshCw, Sparkles, Wand2 } from 'lucide-react';
import { GoogleGenAI } from '@google/genai';

interface BusinessProfileProps {
  contact: Contact;
  onUpdateContact?: (contact: Contact) => void;
}

const BusinessProfile: React.FC<BusinessProfileProps> = ({ contact, onUpdateContact }) => {
  const [isEditing, setIsEditing] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [successMsg, setSuccessMsg] = useState('');

  const defaultProfile: BusinessProfile = {
    legalName: contact.company,
    taxId: '',
    structure: 'LLC',
    industry: '',
    ownershipPercentage: 100,
    establishedDate: '',
    address: '',
    city: '',
    state: '',
    zip: '',
    website: '',
    riskLevel: 'Low',
    missionStatement: '',
    impactSummary: ''
  };

  const [formData, setFormData] = useState<BusinessProfile>(contact.businessProfile || defaultProfile);

  const handleAiPolish = async () => {
    if (!formData.missionStatement && !formData.impactSummary) return;
    setIsGenerating(true);
    try {
        const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
        const res = await ai.models.generateContent({
            model: 'gemini-3-flash-preview',
            contents: `Improve this business mission and impact summary for a loan application. 
            Mission: ${formData.missionStatement} 
            Impact: ${formData.impactSummary}
            Return JSON: {mission, impact}`,
            config: { responseMimeType: "application/json" }
        });
        const data = JSON.parse(res.text || "{}");
        setFormData({ ...formData, missionStatement: data.mission, impactSummary: data.impact });
        setSuccessMsg("Narrative polished by AI Core.");
        setTimeout(() => setSuccessMsg(''), 3000);
    } catch (e) {
        console.error(e);
    } finally {
        setIsGenerating(false);
    }
  };

  const handleSave = () => {
    if (onUpdateContact) {
      onUpdateContact({
        ...contact,
        company: formData.legalName,
        businessProfile: formData
      });
      setSuccessMsg('Profile synchronized.');
      setTimeout(() => setSuccessMsg(''), 3000);
      setIsEditing(false);
    }
  };

  return (
    <div className="animate-fade-in space-y-6">
      <div className="bg-white rounded-[2.5rem] shadow-sm border border-slate-200 overflow-hidden">
        
        <div className="bg-slate-50 p-8 border-b border-slate-100 flex justify-between items-center">
          <div>
            <h2 className="text-xl font-black text-slate-900 flex items-center gap-2 uppercase tracking-tighter leading-none">
              <Building2 className="text-blue-600" /> Entity Identity
            </h2>
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mt-2">Core profile for Underwriting & Grants.</p>
          </div>
          {!isEditing ? (
            <button onClick={() => setIsEditing(true)} className="px-6 py-2 bg-slate-900 text-white font-black rounded-xl hover:bg-slate-800 text-[10px] uppercase tracking-widest shadow-lg">Edit ID</button>
          ) : (
            <div className="flex gap-2">
                <button onClick={() => setIsEditing(false)} className="px-4 py-2 text-slate-500 font-bold text-xs">Cancel</button>
                <button onClick={handleSave} className="px-6 py-2 bg-blue-600 text-white font-black rounded-xl hover:bg-blue-700 text-[10px] uppercase tracking-widest shadow-lg">Save & Sync</button>
            </div>
          )}
        </div>

        <div className="p-10">
          {successMsg && (
            <div className="mb-8 bg-emerald-50 text-emerald-700 px-6 py-3 rounded-xl flex items-center gap-2 text-xs font-black border border-emerald-200 animate-fade-in shadow-xl shadow-emerald-500/10">
              <CheckCircle size={16} /> {successMsg}
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-12">
            
            <div className="space-y-6">
              <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.3em] border-b border-slate-100 pb-4 mb-6">Structural Vitals</h3>
              
              <div className="grid grid-cols-1 gap-6">
                <div><label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2 ml-1">Legal Name</label><input type="text" disabled={!isEditing} value={formData.legalName} onChange={e => setFormData({...formData, legalName: e.target.value})} className="w-full p-4 bg-slate-50 border border-slate-200 rounded-xl font-bold disabled:opacity-60" /></div>
                <div className="grid grid-cols-2 gap-4">
                    <div><label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2 ml-1">EIN / Tax ID</label><input type="text" disabled={!isEditing} value={formData.taxId} onChange={e => setFormData({...formData, taxId: e.target.value})} className="w-full p-4 bg-slate-50 border border-slate-200 rounded-xl font-mono text-sm disabled:opacity-60" /></div>
                    <div><label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2 ml-1">Structure</label><select disabled={!isEditing} value={formData.structure} onChange={e => setFormData({...formData, structure: e.target.value as any})} className="w-full p-4 bg-slate-50 border border-slate-200 rounded-xl font-bold disabled:opacity-60"><option>LLC</option><option>S-Corp</option><option>C-Corp</option><option>Sole Prop</option></select></div>
                </div>
                <div><label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2 ml-1">Industry Sector</label><input type="text" disabled={!isEditing} value={formData.industry} onChange={e => setFormData({...formData, industry: e.target.value})} className="w-full p-4 bg-slate-50 border border-slate-200 rounded-xl font-bold disabled:opacity-60" /></div>
              </div>
            </div>

            <div className="space-y-6">
              <div className="flex justify-between items-center border-b border-slate-100 pb-4 mb-6">
                 <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.3em]">Narrative Builder</h3>
                 <button onClick={handleAiPolish} disabled={!isEditing || isGenerating} className="text-[9px] font-black uppercase text-blue-600 flex items-center gap-1.5 hover:bg-blue-50 px-3 py-1.5 rounded-lg transition-all border border-blue-100 shadow-sm">
                    {isGenerating ? <RefreshCw className="animate-spin" size={10}/> : <Wand2 size={10}/>} Polish with AI
                 </button>
              </div>

              <div>
                <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2 ml-1">Mission Statement</label>
                <textarea disabled={!isEditing} value={formData.missionStatement} onChange={e => setFormData({...formData, missionStatement: e.target.value})} placeholder="What is the core purpose of your business?" className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl font-medium text-sm h-32 resize-none disabled:opacity-60 focus:ring-2 focus:ring-blue-500 outline-none" />
              </div>

              <div>
                <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2 ml-1">Impact Summary</label>
                <textarea disabled={!isEditing} value={formData.impactSummary} onChange={e => setFormData({...formData, impactSummary: e.target.value})} placeholder="How are you helping your community or industry?" className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl font-medium text-sm h-32 resize-none disabled:opacity-60 focus:ring-2 focus:ring-blue-500 outline-none" />
                <p className="text-[9px] text-slate-400 mt-2 font-bold italic">Critical: This data powers your AI Grant Writer.</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default BusinessProfile;
