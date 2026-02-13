
import React, { useState } from 'react';
import { Contact, Activity } from '../types';
// Added RefreshCw to the imports from lucide-react
import { Phone, Mail, FileText, Calendar, Send, User, Cpu, Clock, Mic, StopCircle, Sparkles, Loader, CheckSquare, MessageSquare, RefreshCw } from 'lucide-react';
import * as geminiService from '../services/geminiService';

interface ActivityTimelineProps {
  contact: Contact;
  onAddActivity: (contactId: string, activity: Activity) => void;
}

const ActivityTimeline: React.FC<ActivityTimelineProps> = ({ contact, onAddActivity }) => {
  const [newNote, setNewNote] = useState('');
  const [activityType, setActivityType] = useState<Activity['type']>('note');
  
  // Specialized Call State
  const [callDuration, setCallDuration] = useState('');
  const [callOutcome, setCallOutcome] = useState('Interested');
  
  const [isRecording, setIsRecording] = useState(false);
  const [isRefining, setIsRefining] = useState(false);
  const [recognitionInstance, setRecognitionInstance] = useState<any>(null);

  const activities = contact.activities || [];
  // Sort by date/id descending (newest first)
  const sortedActivities = [...activities].reverse();

  const handleStartRecording = () => {
    // @ts-ignore - SpeechRecognition is not standard in all TS definitions yet
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    
    if (!SpeechRecognition) {
      alert("Your browser does not support voice dictation. Please use Chrome or Edge.");
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = 'en-US';

    recognition.onstart = () => setIsRecording(true);
    
    recognition.onresult = (event: any) => {
      let interimTranscript = '';
      let finalTranscript = '';

      for (let i = event.resultIndex; i < event.results.length; ++i) {
        if (event.results[i].isFinal) {
          finalTranscript += event.results[i][0].transcript;
        } else {
          interimTranscript += event.results[i][0].transcript;
        }
      }
      
      if (finalTranscript) {
         setNewNote((prev) => prev ? prev + ' ' + finalTranscript : finalTranscript);
      }
    };

    recognition.onerror = (event: any) => {
      console.error(event.error);
      setIsRecording(false);
    };

    recognition.onend = () => {
      setIsRecording(false);
    };

    recognition.start();
    setRecognitionInstance(recognition);
  };

  const handleStopRecording = async () => {
    if (recognitionInstance) {
      recognitionInstance.stop();
      setIsRecording(false);
      
      if (newNote.length > 5) {
        setIsRefining(true);
        const polishedText = await geminiService.refineNoteContent(newNote);
        setNewNote(polishedText);
        setIsRefining(false);
      }
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newNote.trim() && activityType !== 'call') return;

    const newActivity: Activity = {
      id: `act_${Date.now()}`,
      type: activityType,
      description: newNote,
      date: new Date().toLocaleString(),
      user: 'Admin',
      duration: activityType === 'call' ? callDuration : undefined,
      outcome: activityType === 'call' ? callOutcome : undefined
    };

    onAddActivity(contact.id, newActivity);
    setNewNote('');
    setCallDuration('');
    setCallOutcome('Interested');
  };

  const getIcon = (type: Activity['type']) => {
    switch (type) {
      case 'call': return <Phone size={14} className="text-blue-500" />;
      case 'email': return <Mail size={14} className="text-purple-500" />;
      case 'meeting': return <Calendar size={14} className="text-orange-500" />;
      case 'system': return <Cpu size={14} className="text-slate-400" />;
      default: return <FileText size={14} className="text-emerald-500" />;
    }
  };

  const getBgColor = (type: Activity['type']) => {
    switch (type) {
      case 'call': return 'bg-blue-50 border-blue-100';
      case 'email': return 'bg-purple-50 border-purple-100';
      case 'meeting': return 'bg-orange-50 border-orange-100';
      case 'system': return 'bg-slate-50 border-slate-100';
      default: return 'bg-emerald-50 border-emerald-100';
    }
  };

  return (
    <div className="h-full flex flex-col">
      {/* Input Area */}
      <div className={`mb-6 p-5 rounded-[2rem] border transition-all shadow-sm ${isRecording ? 'bg-red-50 border-red-200' : 'bg-slate-50 border-slate-200'}`}>
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-4 gap-4">
          <div className="flex gap-2 bg-white/50 p-1 rounded-xl border border-slate-200 shadow-inner overflow-x-auto no-scrollbar max-w-full">
            {['note', 'call', 'email', 'meeting'].map((type) => (
              <button
                key={type}
                type="button"
                onClick={() => setActivityType(type as Activity['type'])}
                className={`text-[10px] font-black px-4 py-2 rounded-lg uppercase tracking-widest transition-all flex items-center gap-2 whitespace-nowrap ${
                  activityType === type 
                    ? 'bg-slate-900 text-white shadow-md' 
                    : 'text-slate-400 hover:text-slate-600'
                }`}
              >
                {type === 'call' && <Phone size={12} />}
                {type === 'email' && <Mail size={12} />}
                {type === 'meeting' && <Calendar size={12} />}
                {type === 'note' && <FileText size={12} />}
                {type}
              </button>
            ))}
          </div>
          
          <button
            type="button"
            onClick={isRecording ? handleStopRecording : handleStartRecording}
            className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${
              isRecording 
                ? 'bg-red-600 text-white animate-pulse shadow-lg' 
                : 'bg-white text-slate-900 border border-slate-200 hover:bg-slate-100 shadow-sm'
            }`}
          >
            {isRecording ? <StopCircle size={14} /> : <Mic size={14} />}
            {isRecording ? 'Stop' : 'Dictate'}
          </button>
        </div>

        {activityType === 'call' && (
          <div className="grid grid-cols-2 gap-4 mb-4 animate-fade-in">
             <div className="space-y-1.5">
                <label className="text-[9px] font-black uppercase tracking-widest text-slate-400 ml-1">Duration</label>
                <div className="relative">
                   <Clock size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                   <input 
                      type="text" 
                      placeholder="e.g. 5m 30s"
                      value={callDuration}
                      onChange={e => setCallDuration(e.target.value)}
                      className="w-full pl-9 pr-4 py-2.5 bg-white border border-slate-200 rounded-xl text-xs font-bold focus:ring-2 focus:ring-blue-500 outline-none"
                   />
                </div>
             </div>
             <div className="space-y-1.5">
                <label className="text-[9px] font-black uppercase tracking-widest text-slate-400 ml-1">Outcome</label>
                <div className="relative">
                   <CheckSquare size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                   <select 
                      value={callOutcome}
                      onChange={e => setCallOutcome(e.target.value)}
                      className="w-full pl-9 pr-4 py-2.5 bg-white border border-slate-200 rounded-xl text-xs font-bold focus:ring-2 focus:ring-blue-500 outline-none appearance-none"
                   >
                      <option>Interested</option>
                      <option>Follow-up Needed</option>
                      <option>Left Voicemail</option>
                      <option>Busy / Recall</option>
                      <option>Not Interested</option>
                      <option>Bad Lead</option>
                   </select>
                </div>
             </div>
          </div>
        )}

        <form onSubmit={handleSubmit} className="relative">
          <textarea
            value={newNote}
            onChange={(e) => setNewNote(e.target.value)}
            placeholder={isRecording ? "Listening..." : activityType === 'call' ? "Transcript summary / Neural context..." : `Add a ${activityType} activity...`}
            rows={2}
            className={`w-full text-sm p-4 pr-12 rounded-2xl border focus:outline-none focus:ring-2 resize-none bg-white transition-all shadow-inner placeholder:font-medium ${
              isRecording ? 'border-red-300 placeholder-red-400' : 'border-slate-200 focus:ring-blue-500'
            }`}
          />
          
          {isRefining && (
            <div className="absolute inset-0 bg-white/60 backdrop-blur-[2px] flex items-center justify-center rounded-2xl z-10">
              <div className="flex items-center gap-3 text-blue-600 text-xs font-black uppercase tracking-widest animate-pulse">
                <RefreshCw size={18} className="animate-spin" /> Neural Refinement...
              </div>
            </div>
          )}

          <button 
            type="submit"
            disabled={(!newNote.trim() && activityType !== 'call') || isRecording}
            className="absolute bottom-4 right-4 p-2.5 bg-slate-900 hover:bg-blue-600 text-white rounded-xl disabled:opacity-30 transition-all shadow-lg active:scale-90"
          >
            <Send size={18} />
          </button>
        </form>
      </div>

      {/* Timeline Feed */}
      <div className="flex-1 overflow-y-auto pr-2 custom-scrollbar">
        <div className="relative pl-6 border-l-2 border-slate-100 space-y-8 py-4">
          {sortedActivities.length === 0 && (
            <div className="text-center py-12 text-slate-400 opacity-30 flex flex-col items-center">
                <ActivityIcon size={48} className="mb-4" />
                <p className="text-[10px] font-black uppercase tracking-widest">Protocol Log Empty</p>
            </div>
          )}
          
          {sortedActivities.map((act) => (
            <div key={act.id} className="relative group/item animate-fade-in">
              {/* Dot */}
              <div className={`absolute -left-[31px] top-1 w-4 h-4 rounded-full border-4 border-white shadow-sm ring-1 ring-slate-200 transition-transform group-hover/item:scale-125 ${
                act.type === 'system' ? 'bg-slate-300' : 'bg-blue-600 shadow-blue-500/20'
              }`}></div>
              
              <div className={`p-6 rounded-[2rem] border transition-all shadow-sm group-hover/item:shadow-xl ${getBgColor(act.type)}`}>
                <div className="flex justify-between items-start mb-4">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-white rounded-xl shadow-sm border border-slate-100">{getIcon(act.type)}</div>
                    <div>
                        <span className="text-[10px] font-black text-slate-900 uppercase tracking-widest">{act.type}</span>
                        {act.user && <span className="text-[9px] text-slate-400 font-bold uppercase block mt-0.5">by {act.user}</span>}
                    </div>
                  </div>
                  <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-1.5">
                    <Clock size={12} /> {act.date}
                  </span>
                </div>

                {act.type === 'call' && (act.duration || act.outcome) && (
                    <div className="grid grid-cols-2 gap-4 mb-4 bg-white/50 p-4 rounded-2xl border border-white/50 shadow-inner">
                        {act.duration && (
                            <div className="flex items-center gap-3 text-[10px] font-black uppercase tracking-widest text-slate-600">
                                <Clock size={14} className="text-slate-400" />
                                <span>Duration: {act.duration}</span>
                            </div>
                        )}
                        {act.outcome && (
                            <div className="flex items-center gap-3 text-[10px] font-black uppercase tracking-widest text-slate-600">
                                <CheckSquare size={14} className="text-emerald-500" />
                                <span>Outcome: {act.outcome}</span>
                            </div>
                        )}
                    </div>
                )}

                {act.description && (
                    <div className="flex gap-4">
                        <MessageSquare size={14} className="text-slate-300 shrink-0 mt-1" />
                        <p className="text-sm text-slate-700 font-medium leading-relaxed italic">
                        "{act.description}"
                        </p>
                    </div>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

const ActivityIcon = (props: any) => (
    <svg 
      xmlns="http://www.w3.org/2000/svg" 
      width={props.size || 24} 
      height={props.size || 24} 
      viewBox="0 0 24 24" 
      fill="none" 
      stroke="currentColor" 
      strokeWidth="2.5" 
      strokeLinecap="round" 
      strokeLinejoin="round" 
      className={props.className}
    >
      <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
    </svg>
);

export default ActivityTimeline;
