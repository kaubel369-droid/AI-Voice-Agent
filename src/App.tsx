import React, { useState, useEffect, useRef, useCallback } from 'react';
import { GoogleGenAI, Modality } from "@google/genai";
import { Phone, PhoneOff, Calendar, User, Info, Activity, AlertCircle, Clock, CheckCircle2 } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { AudioProcessor } from './services/audioProcessor.ts';
import { SYSTEM_INSTRUCTION, TOOLS, BUSINESS_INFO } from './constants.ts';

interface Record {
  id: number;
  name: string;
  date?: string;
  time?: string;
  service?: string;
  phone?: string;
  reason?: string;
  created_at: string;
}

interface LogEntry {
  id: string;
  timestamp: string;
  type: 'info' | 'error' | 'success' | 'agent' | 'user';
  message: string;
}

export default function App() {
  const [isCalling, setIsCalling] = useState(false);
  const [status, setStatus] = useState<'idle' | 'connecting' | 'active' | 'error'>('idle');
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [appointments, setAppointments] = useState<Record[]>([]);
  const [callbacks, setCallbacks] = useState<Record[]>([]);
  const [transcription, setTranscription] = useState<{ user: string; agent: string }>({ user: '', agent: '' });
  
  const audioProcessor = useRef<AudioProcessor>(new AudioProcessor());
  const sessionRef = useRef<any>(null);
  const logEndRef = useRef<HTMLDivElement>(null);

  const addLog = useCallback((type: LogEntry['type'], message: string) => {
    const newLog: LogEntry = {
      id: Math.random().toString(36).substring(7),
      timestamp: new Date().toLocaleTimeString(),
      type,
      message
    };
    setLogs(prev => [newLog, ...prev].slice(0, 50));
  }, []);

  const fetchRecords = async () => {
    try {
      const res = await fetch('/api/records');
      const data = await res.json();
      setAppointments(data.appointments);
      setCallbacks(data.callbacks);
    } catch (err) {
      addLog('error', 'Failed to fetch records from server');
    }
  };

  useEffect(() => {
    fetchRecords();
  }, []);

  useEffect(() => {
    if (logEndRef.current) {
      logEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [logs]);

  const handleToolCall = async (call: any) => {
    addLog('info', `Tool Call: ${call.name}`);
    
    try {
      let result = {};
      if (call.name === 'get_business_info') {
        result = BUSINESS_INFO;
      } else if (call.name === 'book_appointment') {
        const res = await fetch('/api/appointments', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(call.args)
        });
        if (res.ok) {
          addLog('success', `Appointment booked for ${call.args.name}`);
          fetchRecords();
          result = { success: true, message: "Appointment booked successfully." };
        } else {
          throw new Error("Server error booking appointment");
        }
      } else if (call.name === 'request_callback') {
        const res = await fetch('/api/callbacks', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(call.args)
        });
        if (res.ok) {
          addLog('success', `Callback requested for ${call.args.name}`);
          fetchRecords();
          result = { success: true, message: "Callback request received." };
        } else {
          throw new Error("Server error requesting callback");
        }
      }

      if (sessionRef.current) {
        await sessionRef.current.sendToolResponse({
          functionResponses: [{
            name: call.name,
            response: { result },
            id: call.id
          }]
        });
      }
    } catch (error: any) {
      addLog('error', `Tool execution failed: ${error.message}`);
      if (sessionRef.current) {
        await sessionRef.current.sendToolResponse({
          functionResponses: [{
            name: call.name,
            response: { error: error.message },
            id: call.id
          }]
        });
      }
    }
  };

  const startCall = async () => {
    try {
      setIsCalling(true);
      setStatus('connecting');
      addLog('info', 'Initializing Gemini Live session...');

      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
      
      const session = await ai.live.connect({
        model: "gemini-2.5-flash-native-audio-preview-09-2025",
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: {
            voiceConfig: { prebuiltVoiceConfig: { voiceName: "Zephyr" } }
          },
          systemInstruction: SYSTEM_INSTRUCTION,
          tools: TOOLS,
          outputAudioTranscription: {},
          inputAudioTranscription: {}
        },
        callbacks: {
          onopen: () => {
            setStatus('active');
            addLog('success', 'Call connected');
            audioProcessor.current.startRecording((base64Data) => {
              session.sendRealtimeInput({
                media: { data: base64Data, mimeType: 'audio/pcm;rate=16000' }
              });
            });
          },
          onmessage: async (message) => {
            // Handle Audio Output
            const base64Audio = message.serverContent?.modelTurn?.parts?.[0]?.inlineData?.data;
            if (base64Audio) {
              audioProcessor.current.playAudioChunk(base64Audio);
            }

            // Handle Transcriptions
            if (message.serverContent?.modelTurn?.parts?.[0]?.text) {
               // This might be empty if only audio is sent, but handled by outputAudioTranscription
            }
            
            if (message.serverContent?.interrupted) {
              addLog('info', 'Agent interrupted');
            }

            // Transcription updates
            const userText = message.serverContent?.userTurn?.parts?.[0]?.text;
            if (userText) {
              setTranscription(prev => ({ ...prev, user: userText }));
              addLog('user', userText);
            }

            // Handle Tool Calls
            const toolCalls = message.serverContent?.modelTurn?.parts?.filter(p => p.functionCall);
            if (toolCalls && toolCalls.length > 0) {
              for (const p of toolCalls) {
                await handleToolCall(p.functionCall);
              }
            }
          },
          onclose: () => {
            endCall();
          },
          onerror: (err) => {
            addLog('error', `Session error: ${err.message}`);
            endCall();
          }
        }
      });

      sessionRef.current = session;
    } catch (error: any) {
      addLog('error', `Failed to start call: ${error.message}`);
      setIsCalling(false);
      setStatus('error');
    }
  };

  const endCall = () => {
    audioProcessor.current.stopRecording();
    sessionRef.current?.close();
    sessionRef.current = null;
    setIsCalling(false);
    setStatus('idle');
    setTranscription({ user: '', agent: '' });
    addLog('info', 'Call ended');
  };

  return (
    <div className="min-h-screen bg-[#E4E3E0] text-[#141414] font-sans selection:bg-[#141414] selection:text-[#E4E3E0]">
      {/* Header */}
      <header className="border-b border-[#141414] p-6 flex justify-between items-center">
        <div>
          <h1 className="font-serif italic text-2xl tracking-tight">VoxBiz</h1>
          <p className="text-[11px] uppercase tracking-widest opacity-50">AI Voice Receptionist POC</p>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <div className={`w-2 h-2 rounded-full ${status === 'active' ? 'bg-emerald-500 animate-pulse' : status === 'connecting' ? 'bg-amber-500 animate-pulse' : 'bg-red-500'}`} />
            <span className="text-[10px] font-mono uppercase tracking-wider opacity-70">
              {status === 'active' ? 'Live' : status === 'connecting' ? 'Connecting' : 'Offline'}
            </span>
          </div>
          <button 
            onClick={isCalling ? endCall : startCall}
            className={`flex items-center gap-2 px-6 py-2 rounded-full transition-all duration-300 ${
              isCalling 
                ? 'bg-[#141414] text-[#E4E3E0] hover:bg-red-600' 
                : 'border border-[#141414] hover:bg-[#141414] hover:text-[#E4E3E0]'
            }`}
          >
            {isCalling ? <PhoneOff size={18} /> : <Phone size={18} />}
            <span className="text-sm font-medium">{isCalling ? 'End Call' : 'Start Agent'}</span>
          </button>
        </div>
      </header>

      <main className="grid grid-cols-1 lg:grid-cols-12 h-[calc(100vh-88px)]">
        {/* Left Column: Call Interface & Transcription */}
        <div className="lg:col-span-4 border-r border-[#141414] flex flex-col p-6 gap-8 overflow-y-auto">
          <section>
            <h2 className="font-serif italic text-xs uppercase tracking-widest opacity-50 mb-4">Current Session</h2>
            <div className="aspect-square rounded-3xl border border-[#141414] flex flex-col items-center justify-center p-8 relative overflow-hidden bg-white/50 backdrop-blur-sm">
              <AnimatePresence mode="wait">
                {!isCalling ? (
                  <motion.div 
                    key="idle"
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 1.1 }}
                    className="text-center"
                  >
                    <div className="w-20 h-20 rounded-full border border-[#141414]/20 flex items-center justify-center mx-auto mb-4">
                      <Phone className="opacity-20" size={32} />
                    </div>
                    <p className="text-sm opacity-50">Ready to receive calls</p>
                  </motion.div>
                ) : (
                  <motion.div 
                    key="active"
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 1.1 }}
                    className="w-full h-full flex flex-col items-center justify-center"
                  >
                    <div className="relative mb-8">
                      <motion.div 
                        animate={{ scale: [1, 1.2, 1] }}
                        transition={{ repeat: Infinity, duration: 2 }}
                        className="w-32 h-32 rounded-full border border-[#141414] flex items-center justify-center"
                      >
                        <Activity className="text-[#141414]" size={48} />
                      </motion.div>
                      <div className="absolute -bottom-2 left-1/2 -translate-x-1/2 bg-[#141414] text-[#E4E3E0] text-[9px] px-3 py-1 rounded-full uppercase tracking-tighter">
                        Voice Active
                      </div>
                    </div>
                    
                    <div className="w-full space-y-4">
                      <div className="p-3 rounded-xl bg-[#141414]/5 border border-[#141414]/10">
                        <p className="text-[10px] uppercase tracking-widest opacity-40 mb-1">User Input</p>
                        <p className="text-sm font-medium italic min-h-[1.5rem]">
                          {transcription.user || "Listening..."}
                        </p>
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </section>

          <section className="flex-1 flex flex-col min-h-0">
            <h2 className="font-serif italic text-xs uppercase tracking-widest opacity-50 mb-4">System Logs</h2>
            <div className="flex-1 bg-[#141414] text-[#E4E3E0] rounded-2xl p-4 font-mono text-[11px] overflow-y-auto space-y-2 custom-scrollbar">
              {logs.length === 0 && <p className="opacity-30 italic">No logs yet...</p>}
              {logs.map((log) => (
                <div key={log.id} className="flex gap-2 border-b border-white/5 pb-2">
                  <span className="opacity-30 shrink-0">[{log.timestamp}]</span>
                  <span className={`uppercase font-bold shrink-0 ${
                    log.type === 'error' ? 'text-red-400' : 
                    log.type === 'success' ? 'text-emerald-400' : 
                    log.type === 'user' ? 'text-blue-400' : 
                    'text-amber-400'
                  }`}>
                    {log.type}:
                  </span>
                  <span className="break-words">{log.message}</span>
                </div>
              ))}
              <div ref={logEndRef} />
            </div>
          </section>
        </div>

        {/* Right Column: Records & Info */}
        <div className="lg:col-span-8 grid grid-rows-2 h-full overflow-hidden">
          {/* Top Row: Appointments */}
          <div className="border-b border-[#141414] p-6 overflow-y-auto">
            <div className="flex justify-between items-center mb-6">
              <h2 className="font-serif italic text-xl">Appointments</h2>
              <div className="flex items-center gap-2 text-[10px] uppercase tracking-widest opacity-50">
                <Calendar size={14} />
                <span>Real-time Sync</span>
              </div>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {appointments.length === 0 ? (
                <div className="col-span-full border border-dashed border-[#141414]/20 rounded-2xl p-12 flex flex-col items-center justify-center opacity-30">
                  <Clock size={32} className="mb-2" />
                  <p className="text-sm">No appointments booked yet</p>
                </div>
              ) : (
                appointments.map((apt) => (
                  <motion.div 
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    key={apt.id} 
                    className="p-4 rounded-2xl border border-[#141414] bg-white hover:shadow-xl transition-shadow"
                  >
                    <div className="flex justify-between items-start mb-3">
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-full bg-[#141414] text-[#E4E3E0] flex items-center justify-center">
                          <User size={14} />
                        </div>
                        <div>
                          <p className="text-sm font-bold">{apt.name}</p>
                          <p className="text-[10px] opacity-50">{new Date(apt.created_at).toLocaleString()}</p>
                        </div>
                      </div>
                      <div className="bg-emerald-100 text-emerald-800 text-[9px] px-2 py-1 rounded-full font-bold uppercase tracking-tighter">
                        Confirmed
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-2 mt-4">
                      <div className="p-2 rounded-lg bg-[#E4E3E0]/50 border border-[#141414]/5">
                        <p className="text-[9px] uppercase opacity-40">Service</p>
                        <p className="text-xs font-medium">{apt.service}</p>
                      </div>
                      <div className="p-2 rounded-lg bg-[#E4E3E0]/50 border border-[#141414]/5">
                        <p className="text-[9px] uppercase opacity-40">Time</p>
                        <p className="text-xs font-medium">{apt.date} @ {apt.time}</p>
                      </div>
                    </div>
                  </motion.div>
                ))
              )}
            </div>
          </div>

          {/* Bottom Row: Callbacks & Info */}
          <div className="grid grid-cols-1 md:grid-cols-2 h-full">
            <div className="border-r border-[#141414] p-6 overflow-y-auto">
              <h2 className="font-serif italic text-xl mb-6">Callback Requests</h2>
              <div className="space-y-3">
                {callbacks.length === 0 ? (
                  <p className="text-sm opacity-30 italic">No pending callbacks</p>
                ) : (
                  callbacks.map((cb) => (
                    <motion.div 
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      key={cb.id} 
                      className="p-4 rounded-xl border border-[#141414] bg-[#141414]/5 flex justify-between items-center"
                    >
                      <div>
                        <p className="text-sm font-bold">{cb.name}</p>
                        <p className="text-xs opacity-60">{cb.phone}</p>
                        <p className="text-[10px] italic mt-1 opacity-40">"{cb.reason}"</p>
                      </div>
                      <button className="p-2 rounded-full hover:bg-[#141414] hover:text-[#E4E3E0] transition-colors">
                        <Phone size={14} />
                      </button>
                    </motion.div>
                  ))
                )}
              </div>
            </div>
            
            <div className="p-6 bg-[#141414] text-[#E4E3E0] overflow-y-auto">
              <h2 className="font-serif italic text-xl mb-6">Business Context</h2>
              <div className="space-y-6">
                <div>
                  <p className="text-[10px] uppercase tracking-widest opacity-40 mb-2">Knowledge Base</p>
                  <div className="space-y-4">
                    <div className="flex items-start gap-3">
                      <Info size={16} className="shrink-0 mt-1 opacity-50" />
                      <div>
                        <p className="text-sm font-medium">{BUSINESS_INFO.name}</p>
                        <p className="text-xs opacity-60">{BUSINESS_INFO.location}</p>
                      </div>
                    </div>
                    <div className="flex items-start gap-3">
                      <Clock size={16} className="shrink-0 mt-1 opacity-50" />
                      <p className="text-xs opacity-60">{BUSINESS_INFO.hours}</p>
                    </div>
                  </div>
                </div>
                
                <div>
                  <p className="text-[10px] uppercase tracking-widest opacity-40 mb-2">Available Services</p>
                  <div className="grid grid-cols-1 gap-2">
                    {BUSINESS_INFO.services.map((s, i) => (
                      <div key={i} className="flex justify-between items-center p-2 rounded border border-white/10 text-xs">
                        <span>{s.name}</span>
                        <span className="opacity-50">{s.price}</span>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="p-4 rounded-xl border border-amber-500/30 bg-amber-500/5">
                  <div className="flex items-center gap-2 text-amber-500 mb-2">
                    <AlertCircle size={14} />
                    <span className="text-[10px] font-bold uppercase tracking-tighter">POC Status</span>
                  </div>
                  <p className="text-[10px] opacity-70 leading-relaxed">
                    This agent uses Gemini 2.5 Flash for real-time voice processing. 
                    Function calls are routed to a local SQLite database for persistence.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>

      <style>{`
        .custom-scrollbar::-webkit-scrollbar {
          width: 4px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: transparent;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: rgba(255, 255, 255, 0.1);
          border-radius: 10px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: rgba(255, 255, 255, 0.2);
        }
      `}</style>
    </div>
  );
}
