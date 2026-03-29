
import React, { useState, useEffect } from 'react';
import { Contact, ClientTask } from '../types';
import { Sparkles, BrainCircuit, RefreshCw, CheckCircle, Plus, Info, Zap } from 'lucide-react';
import * as geminiService from '../services/geminiService';

interface TaskSuggesterProps {
  contact: Contact;
  onUpdateContact: (contact: Contact) => void;
}

const TaskSuggester: React.FC<TaskSuggesterProps> = ({ contact, onUpdateContact }) => {
  const [suggestions, setSuggestions] = useState<Partial<ClientTask>[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [hasError, setHasError] = useState(false);

  const fetchSuggestions = async () => {
    setIsLoading(true);
    setHasError(false);
    try {
      const data = await geminiService.suggestAITasks(contact);
      setSuggestions(data);
    } catch (e) {
      setHasError(true);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchSuggestions();
  }, [contact.status, contact.businessProfile?.industry]);

  const handleAdoptTask = (task: Partial<ClientTask>) => {
    const newTask: ClientTask = {
      id: task.id || `ai_${Date.now()}`,
      title: task.title || 'AI Recommendation',
      description: task.description,
      status: 'pending',
      date: new Date().toISOString().slice(0, 10),
      type: task.type || 'action'
    };

    onUpdateContact({
      ...contact,
      clientTasks: [newTask, ...(contact.clientTasks || [])],
      activities: [
        ...(contact.activities || []),
        {
          id: `act_adopt_${Date.now()}`,
          type: 'system',
          description: `Client adopted AI-suggested task: ${newTask.title}`,
          date: new Date().toLocaleString(),
          user: 'Client'
        }
      ]
    });

    setSuggestions(prev => prev.filter(t => t.id !== task.id));
  };

  return (
    <div className="bg-indigo-950 rounded-[2.5rem] p-8 text-white shadow-2xl relative overflow-hidden border border-white/5 animate-fade-in mb-8">
      <div className="absolute top-0 right-0 p-8 opacity-10 rotate-12">
        <BrainCircuit size={180} />
      </div>

      <div className="relative z-10">
        <div className="flex justify-between items-center mb-8">
          <div>
            <h3 className="text-xl font-black uppercase tracking-widest flex items-center gap-2">
              <Sparkles className="text-indigo-400" size={20} /> Autonomous Directives
            </h3>
            <p className="text-indigo-300 text-[9px] font-black uppercase tracking-[0.3em] mt-1">
              Neural Guidance Engine v2.5
            </p>
          </div>
          <button 
            onClick={fetchSuggestions}
            disabled={isLoading}
            className="p-2 hover:bg-white/10 rounded-xl transition-all"
          >
            <RefreshCw className={`text-indigo-400 ${isLoading ? 'animate-spin' : ''}`} size={18} />
          </button>
        </div>

        {isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {[1, 2, 3].map(i => (
              <div key={i} className="bg-white/5 border border-white/10 rounded-2xl p-6 animate-pulse">
                <div className="h-4 bg-white/10 rounded w-3/4 mb-4"></div>
                <div className="h-2 bg-white/5 rounded w-full mb-2"></div>
                <div className="h-2 bg-white/5 rounded w-2/3"></div>
              </div>
            ))}
          </div>
        ) : suggestions.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {suggestions.map((task, idx) => (
              <div 
                key={idx} 
                className="bg-white/5 border border-white/10 rounded-[2rem] p-6 hover:bg-white/10 transition-all group flex flex-col justify-between"
              >
                <div>
                  <div className="flex justify-between items-start mb-4">
                    <span className="text-[8px] font-black uppercase bg-indigo-500/20 text-indigo-300 px-2 py-0.5 rounded border border-indigo-500/20">
                      {task.type}
                    </span>
                    <Zap size={14} className="text-indigo-500 opacity-50 group-hover:opacity-100" />
                  </div>
                  <h4 className="font-black text-sm uppercase tracking-tight text-white mb-2 leading-tight">
                    {task.title}
                  </h4>
                  <p className="text-[10px] text-slate-400 leading-relaxed font-medium mb-6 line-clamp-3 italic">
                    "{task.description}"
                  </p>
                </div>
                <button 
                  onClick={() => handleAdoptTask(task)}
                  className="w-full bg-indigo-600 text-white py-3 rounded-xl font-black uppercase text-[10px] tracking-widest hover:bg-indigo-500 shadow-xl transition-all flex items-center justify-center gap-2 active:scale-95"
                >
                  <Plus size={14} /> Adopt Protocol
                </button>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-10 text-indigo-300/50">
            <CheckCircle size={40} className="mx-auto mb-3 opacity-20" />
            <p className="text-xs font-black uppercase tracking-widest">Protocol Alignment Complete</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default TaskSuggester;
