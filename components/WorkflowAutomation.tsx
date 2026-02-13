
import React, { useState } from 'react';
import { PipelineRule } from '../types';
import { GitBranch, Zap, Plus, Trash2, Play, AlertCircle, ArrowRight, CheckCircle, Sparkles, RefreshCw, Layers } from 'lucide-react';
import * as geminiService from '../services/geminiService';

const WorkflowAutomation: React.FC = () => {
  const [rules, setRules] = useState<PipelineRule[]>([
    {
      id: 'rule_1',
      name: 'High Value Deal Alert',
      isActive: true,
      trigger: { type: 'status_change', value: 'Negotiation' },
      conditions: [{ field: 'deal_value', operator: 'gt', value: 50000 }],
      actions: [{ type: 'notify_admin', params: { message: 'High value deal entered negotiation phase.' } }]
    }
  ]);

  const [isEditing, setIsEditing] = useState(false);
  const [currentRule, setCurrentRule] = useState<Partial<PipelineRule>>({
    name: 'New Automation',
    isActive: true,
    trigger: { type: 'status_change' },
    conditions: [],
    actions: []
  });

  const [aiPrompt, setAiPrompt] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);

  const handleGenerate = async () => {
    if (!aiPrompt) return;
    setIsGenerating(true);
    const generatedRule = await geminiService.generateWorkflowFromPrompt(aiPrompt);
    if (generatedRule.name) {
       setCurrentRule({ ...generatedRule, id: `rule_${Date.now()}`, isActive: true });
       setIsEditing(true);
    }
    setIsGenerating(false);
    setAiPrompt('');
  };

  const handleSave = () => {
    if (currentRule.id) {
        setRules(rules.map(r => r.id === currentRule.id ? currentRule as PipelineRule : r));
    } else {
        const newRule = { ...currentRule, id: `rule_${Date.now()}` } as PipelineRule;
        setRules([...rules, newRule]);
    }
    setIsEditing(false);
    setCurrentRule({ name: 'New Automation', isActive: true, trigger: { type: 'status_change' }, conditions: [], actions: [] });
  };

  return (
    <div className="max-w-6xl mx-auto space-y-8 animate-fade-in pb-10">
      
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold text-slate-900 flex items-center gap-3">
             <GitBranch className="text-blue-600" /> Automation Engine
          </h1>
          <p className="text-slate-500 mt-2">Design visual workflows to automate your CRM logic.</p>
        </div>
        <button 
            onClick={() => { setIsEditing(true); setCurrentRule({ name: 'Untitled Workflow', isActive: true, trigger: { type: 'status_change' }, conditions: [], actions: [] }); }}
            className="bg-slate-900 text-white px-6 py-3 rounded-xl font-bold hover:bg-slate-800 flex items-center gap-2 shadow-lg"
        >
            <Plus size={20} /> Create Workflow
        </button>
      </div>

      {!isEditing && (
        <div className="bg-gradient-to-r from-violet-600 to-indigo-600 rounded-2xl p-8 text-white shadow-xl relative overflow-hidden">
             <div className="absolute top-0 right-0 p-8 opacity-10"><Sparkles size={180} /></div>
             <div className="relative z-10 max-w-2xl">
                <h2 className="text-2xl font-bold mb-4 flex items-center gap-2"><Zap className="text-yellow-300 fill-yellow-300" /> AI Workflow Generator</h2>
                <p className="text-indigo-100 mb-6">Describe what you want to happen in plain English.</p>
                <div className="bg-white/10 p-2 rounded-xl flex gap-2 border border-white/20">
                    <input 
                        type="text" 
                        value={aiPrompt}
                        onChange={(e) => setAiPrompt(e.target.value)}
                        placeholder="e.g. When a lead uploads a document and deal value is over $50k, email me immediately."
                        className="flex-1 bg-transparent border-none text-white placeholder-indigo-200 focus:ring-0 px-4 py-2 outline-none"
                    />
                    <button 
                        onClick={handleGenerate}
                        disabled={isGenerating || !aiPrompt}
                        className="bg-white text-indigo-600 px-6 py-2 rounded-lg font-bold hover:bg-indigo-50 transition-colors flex items-center justify-center gap-2"
                    >
                        {isGenerating ? <RefreshCw className="animate-spin" size={18} /> : <Sparkles size={18} />}
                        Generate
                    </button>
                </div>
             </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-1 space-y-4">
            <h3 className="font-bold text-slate-700 uppercase text-xs tracking-wider mb-2">Active Workflows</h3>
            {rules.map(rule => (
                <div 
                    key={rule.id} 
                    onClick={() => { setCurrentRule(rule); setIsEditing(true); }}
                    className={`p-4 rounded-xl border cursor-pointer transition-all hover:shadow-md bg-white ${isEditing && currentRule.id === rule.id ? 'border-blue-500 ring-2 ring-blue-100' : 'border-slate-200'}`}
                >
                    <div className="flex justify-between items-start mb-2">
                        <div className="flex items-center gap-2">
                             <div className={`p-1.5 rounded-md ${rule.isActive ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-500'}`}>
                                 <Zap size={14} />
                             </div>
                             <h4 className="font-bold text-slate-800 text-sm">{rule.name}</h4>
                        </div>
                    </div>
                    <div className="text-xs text-slate-500">Trigger: {rule.trigger.type}</div>
                </div>
            ))}
        </div>

        <div className="lg:col-span-2">
            {isEditing ? (
                <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden flex flex-col min-h-[500px]">
                    <div className="bg-slate-50 border-b border-slate-200 p-4 flex justify-between items-center">
                        <input 
                            type="text" 
                            value={currentRule.name} 
                            onChange={(e) => setCurrentRule({...currentRule, name: e.target.value})}
                            className="bg-transparent font-bold text-lg text-slate-900 border-none focus:ring-0 p-0"
                        />
                        <button onClick={handleSave} className="px-6 py-2 bg-blue-600 text-white text-sm font-bold rounded-lg hover:bg-blue-700">Save</button>
                    </div>
                    <div className="flex-1 bg-slate-50 p-8 flex flex-col items-center">
                        <div className="bg-white rounded-xl border-2 border-blue-500 shadow-md p-4 w-full max-w-sm mb-4 relative">
                            <div className="mb-2 text-xs font-bold text-blue-600 uppercase">Trigger</div>
                            <div className="text-sm font-bold">{currentRule.trigger?.type}</div>
                        </div>
                        <div className="h-8 w-0.5 bg-slate-300"></div>
                        <div className="bg-white rounded-xl border border-slate-200 p-4 w-full max-w-sm shadow-sm">
                            <div className="mb-2 text-xs font-bold text-slate-400 uppercase">Action</div>
                            <div className="text-sm">Execute Protocol...</div>
                        </div>
                    </div>
                </div>
            ) : (
                <div className="h-full flex flex-col items-center justify-center text-slate-400 border-2 border-dashed border-slate-200 rounded-2xl bg-slate-50">
                    <Layers size={48} className="mb-4 opacity-20" />
                    <p>Select a workflow to edit</p>
                </div>
            )}
        </div>
      </div>
    </div>
  );
};

export default WorkflowAutomation;
