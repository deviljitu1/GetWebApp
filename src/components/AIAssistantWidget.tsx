import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useData } from '@/contexts/DataContext';
import { chatCompletion, AI_TOOLS, generateSystemPrompt } from '@/lib/ai-agent';
import type { AIPersona, ChatCompletionMessage } from '@/lib/ai-agent';
import { speakText, stopSpeaking } from '@/lib/voice';
import { getNotificationPrefs, setNotificationPrefs, playNotificationSound } from '@/lib/notifications';
import {
  Bot,
  Sparkles,
  X,
  Maximize2,
  Minimize2,
  Send,
  Loader2,
  Mic,
  MicOff,
  Volume2,
  VolumeX,
  Heart,
  Laugh,
  Briefcase,
  Play,
  Pause,
  CheckCircle2,
  PlusCircle,
  HelpCircle,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn, todayStr } from '@/lib/utils';
import ReactMarkdown from 'react-markdown';
import { toast } from '@/hooks/use-toast';

interface Message {
  role: 'user' | 'assistant' | 'system';
  content: string;
  toolCallInfo?: string;
}

interface PersonaConfig {
  id: AIPersona;
  name: string;
  tagline: string;
  emoji: string;
  badge: string;
  icon: React.ComponentType<{ className?: string }>;
  greeting: (name: string) => string;
  placeholder: string;
}

const PERSONA_CONFIGS: Record<string, PersonaConfig> = {
  'Luna-Flirty': {
    id: 'Luna-Flirty',
    name: 'Luna',
    tagline: 'Playful Sidekick',
    emoji: '😉',
    badge: 'Flirty & Charming',
    icon: Sparkles,
    greeting: (name) =>
      `Hey ${name || 'gorgeous'} 😉 I'm Luna — your work sidekick. Tell me what you finished, what to start, or let me handle your timers & tasks! ✨`,
    placeholder: 'Tell Luna what you finished or what to time...',
  },
  'Luna-Sweet': {
    id: 'Luna-Sweet',
    name: 'Luna',
    tagline: 'Sweet Companion',
    emoji: '🌸',
    badge: 'Warm & Encouraging',
    icon: Heart,
    greeting: (name) =>
      `Hi ${name || 'friend'}! 🌸 I'm Luna. I'm here to cheer you on, keep your tasks organized, and celebrate your wins! What are we working on?`,
    placeholder: 'Ask sweet Luna to create or time a task...',
  },
  'Luna-Funny': {
    id: 'Luna-Funny',
    name: 'Luna',
    tagline: 'Comedy Coach',
    emoji: '😂',
    badge: 'Sarcastic & Witty',
    icon: Laugh,
    greeting: (name) =>
      `Look who showed up to pretend to work! 😂 I'm ready to track your actual tasks or mock your procrastination. What's on the agenda?`,
    placeholder: 'Tell Luna your work excuses or tasks...',
  },
  Jarvis: {
    id: 'Jarvis',
    name: 'J.A.R.V.I.S',
    tagline: 'Tactical Assistant',
    emoji: '🤖',
    badge: 'Iron Man Mode',
    icon: Bot,
    greeting: (name) =>
      `Good day, ${name ? `Boss` : 'Sir'}. J.A.R.V.I.S online. All task tracking and timer telemetry systems are nominal. How may I direct your workflow?`,
    placeholder: 'Ask J.A.R.V.I.S to time, create, or update tasks...',
  },
  Professional: {
    id: 'Professional',
    name: 'Executive AI',
    tagline: 'Productivity Desk',
    emoji: '💼',
    badge: 'Concise & Business',
    icon: Briefcase,
    greeting: (name) =>
      `Hello ${name || ''}. Executive Assistant ready. Specify tasks to create, deadlines to set, or timers to initiate.`,
    placeholder: 'Enter task directive or inquiry...',
  },
};

// Normalize legacy stored persona keys
const normalizePersona = (key: string | null): AIPersona => {
  if (!key) return 'Luna-Flirty';
  if (key === 'flirty') return 'Luna-Flirty';
  if (key === 'sweet') return 'Luna-Sweet';
  if (key === 'funny' || key === 'Funny') return 'Luna-Funny';
  if (key === 'Flirty') return 'Luna-Flirty';
  if (key === 'Sweet') return 'Luna-Sweet';
  if (key === 'Jarvis') return 'Jarvis';
  if (key === 'Professional') return 'Professional';
  if (PERSONA_CONFIGS[key]) return key as AIPersona;
  return 'Luna-Flirty';
};

export const AIAssistantWidget: React.FC = () => {
  const { user } = useAuth();
  const {
    tasks,
    members,
    addTask,
    deleteTask,
    updateTask,
    startTimer,
    pauseTimer,
    finishTask,
    refreshTasks,
  } = useData();

  const [isOpen, setIsOpen] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const [persona, setPersona] = useState<AIPersona>(() =>
    normalizePersona(localStorage.getItem('getwebapp_unified_persona') || localStorage.getItem('luna_personality'))
  );

  const initialGreeting = useMemo(() => {
    const config = PERSONA_CONFIGS[persona] || PERSONA_CONFIGS['Luna-Flirty'];
    const firstName = user?.name ? user.name.split(' ')[0] : 'there';
    return config.greeting(firstName);
  }, [persona, user?.name]);

  const [messages, setMessages] = useState<Message[]>([
    {
      role: 'assistant',
      content: initialGreeting,
    },
  ]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [voiceAudioEnabled, setVoiceAudioEnabled] = useState<boolean>(() => getNotificationPrefs().voiceEnabled);

  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const recognitionRef = useRef<any>(null);

  const currentConfig = PERSONA_CONFIGS[persona] || PERSONA_CONFIGS['Luna-Flirty'];
  const CurrentIcon = currentConfig.icon;

  // Persist persona selection
  useEffect(() => {
    localStorage.setItem('getwebapp_unified_persona', persona);
  }, [persona]);

  // Sync voice preference changes
  const toggleVoiceAudio = () => {
    const nextVal = !voiceAudioEnabled;
    setVoiceAudioEnabled(nextVal);
    setNotificationPrefs({ voiceEnabled: nextVal });
    if (!nextVal) {
      stopSpeaking();
    } else {
      toast({ title: 'Voice Audio Enabled', description: 'The assistant will speak responses out loud.' });
    }
  };

  // Scroll to bottom on updates
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, isLoading]);

  // Focus input on open
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 150);
    } else {
      stopSpeaking();
      if (isListening && recognitionRef.current) {
        recognitionRef.current.stop();
        setIsListening(false);
      }
    }
  }, [isOpen]);

  // Set up Speech Recognition (Web Speech API)
  const isSpeechSupported = typeof window !== 'undefined' && Boolean((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const SpeechClass = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechClass) return;

    try {
      const rec = new SpeechClass();
      rec.continuous = false;
      rec.interimResults = false;
      rec.lang = 'en-US';

      rec.onresult = (event: any) => {
        const transcript = event.results?.[0]?.[0]?.transcript;
        if (transcript) {
          handleSend(undefined, transcript);
        }
      };

      rec.onend = () => {
        setIsListening(false);
      };

      rec.onerror = (event: any) => {
        console.warn('Speech recognition error:', event.error);
        setIsListening(false);
        if (event.error === 'not-allowed') {
          toast({
            title: 'Microphone Access Denied',
            description: 'Please grant microphone permissions in browser settings.',
            variant: 'destructive',
          });
        }
      };

      recognitionRef.current = rec;
    } catch (e) {
      console.warn('Failed to initialize speech recognition:', e);
    }

    return () => {
      if (recognitionRef.current) {
        try {
          recognitionRef.current.abort();
        } catch {}
      }
    };
  }, []);

  const toggleListening = () => {
    if (!recognitionRef.current) {
      toast({
        title: 'Voice Input Unavailable',
        description: 'Speech recognition is not supported in this browser.',
      });
      return;
    }

    if (isListening) {
      recognitionRef.current.stop();
      setIsListening(false);
    } else {
      stopSpeaking();
      try {
        recognitionRef.current.start();
        setIsListening(true);
      } catch (err) {
        console.warn('Failed to start speech recognition:', err);
      }
    }
  };

  const handleSend = useCallback(async (e?: React.FormEvent, overrideText?: string) => {
    e?.preventDefault();
    const userText = (overrideText || input).trim();
    if (!userText || isLoading || !user) return;

    if (!overrideText) setInput('');

    const updatedMessages: Message[] = [...messages, { role: 'user', content: userText }];
    setMessages(updatedMessages);
    setIsLoading(true);

    try {
      const systemPrompt = generateSystemPrompt(
        user.name,
        user.role,
        members.map((m) => ({ user_id: m.user_id, name: m.name })),
        tasks,
        persona
      );

      const conversation: ChatCompletionMessage[] = [
        { role: 'system', content: systemPrompt },
        ...updatedMessages.map((m) => ({
          role: m.role,
          content: m.content,
        })),
      ];

      const initialRes = await chatCompletion({
        messages: conversation,
        tools: AI_TOOLS,
        tool_choice: 'auto',
      });

      const responseMessage = initialRes.choices[0]?.message;
      if (!responseMessage) throw new Error('No response from AI model');

      // If model requests tool calls
      if (responseMessage.tool_calls && responseMessage.tool_calls.length > 0) {
        const toolActionNotes: string[] = [];

        conversation.push(responseMessage);

        for (const toolCall of responseMessage.tool_calls) {
          let toolResult = 'Success';
          try {
            const args = JSON.parse(toolCall.function.arguments || '{}');
            const toolName = toolCall.function.name;

            if (toolName === 'create_task') {
              let targetUserId = user.userId;
              if (args.assigned_to && user.role === 'admin') {
                const assignedLower = String(args.assigned_to).toLowerCase();
                const matched = members.find(
                  (m) =>
                    m.name.toLowerCase() === assignedLower ||
                    m.name.toLowerCase().includes(assignedLower)
                );
                if (matched) targetUserId = matched.user_id;
              }

              await addTask({
                title: args.title,
                description: args.description || '',
                category: args.category || 'Other',
                date: todayStr(),
                target_minutes: args.target_minutes ? Number(args.target_minutes) : undefined,
                user_id: targetUserId,
              });

              toolResult = `Task "${args.title}" created successfully.`;
              toolActionNotes.push(`Created: "${args.title}"`);
              toast({ title: 'Task Created ✨', description: args.title });
            } else if (toolName === 'start_timer') {
              await startTimer(args.task_id);
              const targetTask = tasks.find((t) => t.id === args.task_id);
              toolResult = `Timer started for task "${targetTask?.title || args.task_id}".`;
              toolActionNotes.push(`Timer started on "${targetTask?.title || 'task'}"`);
              toast({ title: 'Timer Started ⏱️', description: targetTask?.title || 'Tracking time' });
            } else if (toolName === 'pause_timer') {
              await pauseTimer(args.task_id);
              const targetTask = tasks.find((t) => t.id === args.task_id);
              toolResult = `Timer paused for task "${targetTask?.title || args.task_id}".`;
              toolActionNotes.push(`Timer paused on "${targetTask?.title || 'task'}"`);
              toast({ title: 'Timer Paused ⏸️', description: targetTask?.title || 'Time paused' });
            } else if (toolName === 'finish_task') {
              await finishTask(args.task_id, {
                completion_notes: args.completion_notes,
                project_link: args.project_link,
              });
              const targetTask = tasks.find((t) => t.id === args.task_id);
              toolResult = `Task "${targetTask?.title || args.task_id}" marked as Finished.`;
              toolActionNotes.push(`Completed "${targetTask?.title || 'task'}"`);
              toast({ title: 'Task Finished ✅', description: targetTask?.title || 'Marked completed' });
            } else if (toolName === 'delete_task') {
              await deleteTask(args.task_id);
              toolResult = `Task deleted successfully.`;
              toolActionNotes.push(`Deleted task`);
              toast({ title: 'Task Deleted 🗑️' });
            } else if (toolName === 'update_task') {
              await updateTask(args.task_id, {
                target_minutes: args.target_minutes !== undefined ? Number(args.target_minutes) : undefined,
                status: args.status,
              });
              toolResult = `Task updated successfully.`;
              toolActionNotes.push(`Updated task details`);
              toast({ title: 'Task Updated' });
            }
          } catch (tErr: any) {
            toolResult = `Error executing tool: ${tErr.message || String(tErr)}`;
          }

          conversation.push({
            role: 'tool',
            tool_call_id: toolCall.id,
            name: toolCall.function.name,
            content: toolResult,
          });
        }

        // Refresh UI state and play subtle notification sound
        await refreshTasks();
        playNotificationSound();

        // Second model call to synthesize final user-facing response with tool results
        const finalRes = await chatCompletion({
          messages: conversation,
        });

        const finalText = finalRes.choices[0]?.message?.content || 'Done! I updated your tasks.';
        const infoString = toolActionNotes.length > 0 ? `⚡ Action taken: ${toolActionNotes.join(' • ')}` : undefined;

        setMessages((prev) => [
          ...prev,
          {
            role: 'assistant',
            content: finalText,
            toolCallInfo: infoString,
          },
        ]);

        if (voiceAudioEnabled) {
          speakText(finalText);
        }
      } else {
        const assistantText = responseMessage.content || '';
        setMessages((prev) => [
          ...prev,
          {
            role: 'assistant',
            content: assistantText,
          },
        ]);

        if (voiceAudioEnabled) {
          speakText(assistantText);
        }
      }
    } catch (err: any) {
      console.error('AI assistant error:', err);
      const errMsg = err.message || 'Network issue reaching AI service';
      toast({
        title: `${currentConfig.name} had a hiccup`,
        description: errMsg,
        variant: 'destructive',
      });
      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          content: `Oof, I hit a snag: ${errMsg}. Please try again!`,
        },
      ]);
    } finally {
      setIsLoading(false);
      setTimeout(() => inputRef.current?.focus(), 80);
    }
  }, [
    input,
    isLoading,
    user,
    messages,
    members,
    tasks,
    persona,
    addTask,
    startTimer,
    pauseTimer,
    finishTask,
    deleteTask,
    updateTask,
    refreshTasks,
    voiceAudioEnabled,
    currentConfig.name,
  ]);

  const handleQuickPrompt = (promptText: string) => {
    handleSend(undefined, promptText);
  };

  const handlePersonaChange = (newPersona: AIPersona) => {
    setPersona(newPersona);
    const conf = PERSONA_CONFIGS[newPersona];
    const firstName = user?.name ? user.name.split(' ')[0] : 'there';
    setMessages((prev) => [
      ...prev,
      {
        role: 'assistant',
        content: `*Switched to **${conf.name} (${conf.badge})*** ✨\n\n${conf.greeting(firstName)}`,
      },
    ]);
  };

  if (!user) return null;

  return (
    <>
      {/* Single Unified Floating Launcher */}
      {!isOpen && (
        <button
          onClick={() => setIsOpen(true)}
          className="fixed bottom-[calc(5rem+env(safe-area-inset-bottom))] right-4 sm:bottom-6 sm:right-6 z-50 h-14 w-14 rounded-full bg-gradient-to-tr from-primary via-indigo-600 to-purple-500 text-primary-foreground shadow-2xl shadow-primary/40 hover:scale-105 active:scale-95 transition-all flex items-center justify-center group ring-2 ring-primary/20"
          aria-label="Open AI Assistant"
          title={`Open ${currentConfig.name} AI Assistant`}
        >
          <CurrentIcon className="h-6 w-6 group-hover:rotate-12 transition-transform" />
          <span className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-400 ring-2 ring-background" />
          </span>
        </button>
      )}

      {/* Unified AI Chatbot Window */}
      {isOpen && (
        <div
          className={cn(
            'fixed bottom-[calc(5rem+env(safe-area-inset-bottom))] right-4 sm:bottom-6 sm:right-6 bg-background border border-border/60 shadow-2xl rounded-2xl flex flex-col z-50 overflow-hidden transition-all duration-300',
            isExpanded
              ? 'w-[calc(100vw-2rem)] h-[min(650px,calc(100dvh-9rem))] sm:w-[560px] sm:h-[720px]'
              : 'w-[calc(100vw-2rem)] h-[min(520px,calc(100dvh-10rem))] sm:w-[400px] sm:h-[560px]'
          )}
        >
          {/* Header */}
          <div className="p-3 sm:p-3.5 bg-gradient-to-r from-primary/10 via-indigo-500/10 to-purple-500/10 border-b border-border/60 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="h-9 w-9 rounded-xl bg-gradient-to-br from-primary via-indigo-600 to-purple-500 text-white flex items-center justify-center text-lg shadow-sm shrink-0">
                {currentConfig.emoji}
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-1.5">
                  <p className="font-semibold text-sm leading-none truncate">{currentConfig.name}</p>
                  <span className="text-[10px] font-medium bg-primary/15 text-primary px-1.5 py-0.5 rounded-full uppercase tracking-wider shrink-0">
                    {currentConfig.tagline}
                  </span>
                </div>
                <p className="text-[11px] text-muted-foreground truncate mt-0.5">
                  Voice • Task Timer • Live Execution
                </p>
              </div>
            </div>

            {/* Header Action Buttons */}
            <div className="flex items-center gap-0.5 shrink-0">
              {/* TTS Voice Toggle */}
              <Button
                variant="ghost"
                size="icon"
                className={cn(
                  'h-8 w-8 transition-colors',
                  voiceAudioEnabled
                    ? 'text-primary hover:bg-primary/15'
                    : 'text-muted-foreground hover:text-foreground'
                )}
                onClick={toggleVoiceAudio}
                title={voiceAudioEnabled ? 'Voice output on (Click to mute)' : 'Voice output muted (Click to unmute)'}
              >
                {voiceAudioEnabled ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4 opacity-70" />}
              </Button>

              {/* Maximize / Restore */}
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-muted-foreground hover:text-foreground hidden sm:flex"
                onClick={() => setIsExpanded(!isExpanded)}
                title={isExpanded ? 'Collapse' : 'Expand window'}
              >
                {isExpanded ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
              </Button>

              {/* Close */}
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                onClick={() => setIsOpen(false)}
                title="Close Assistant"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          </div>

          {/* Personality / Persona Switcher Bar */}
          <div className="px-3 py-1.5 bg-muted/40 border-b border-border/40 flex items-center gap-1.5 overflow-x-auto no-scrollbar text-xs">
            <span className="text-[11px] font-medium text-muted-foreground shrink-0 flex items-center gap-1">
              <span>Persona:</span>
            </span>
            {Object.values(PERSONA_CONFIGS).map((item) => {
              const active = persona === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => handlePersonaChange(item.id)}
                  className={cn(
                    'flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium whitespace-nowrap transition-all duration-150',
                    active
                      ? 'bg-primary text-primary-foreground shadow-xs'
                      : 'bg-background/80 hover:bg-background text-muted-foreground hover:text-foreground border border-border/40'
                  )}
                >
                  <span>{item.emoji}</span>
                  <span>{item.name}</span>
                  <span className="text-[10px] opacity-75">({item.badge.split(' ')[0]})</span>
                </button>
              );
            })}
          </div>

          {/* Messages Area */}
          <ScrollArea className="flex-1 p-3.5 bg-slate-50/40 dark:bg-slate-950/20">
            <div className="space-y-3.5">
              {messages.map((m, i) => (
                <div
                  key={i}
                  className={cn(
                    'flex flex-col',
                    m.role === 'user' ? 'items-end' : 'items-start'
                  )}
                >
                  <div
                    className={cn(
                      'max-w-[88%] rounded-2xl px-3.5 py-2.5 text-sm shadow-xs',
                      m.role === 'user'
                        ? 'bg-primary text-primary-foreground rounded-br-xs'
                        : 'bg-card text-card-foreground border border-border/70 rounded-bl-xs'
                    )}
                  >
                    {m.role === 'user' ? (
                      <p className="whitespace-pre-wrap">{m.content}</p>
                    ) : (
                      <div className="prose prose-sm dark:prose-invert max-w-none text-sm break-words [&>p]:leading-relaxed [&>ul]:my-1.5 [&>ol]:my-1.5 [&>p]:my-1">
                        <ReactMarkdown>{m.content}</ReactMarkdown>
                      </div>
                    )}
                  </div>

                  {/* Tool Action Badge */}
                  {m.toolCallInfo && (
                    <div className="mt-1 flex items-center gap-1 px-2 py-0.5 rounded-md bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 text-[11px] font-medium border border-emerald-500/20">
                      <Sparkles className="h-3 w-3 shrink-0" />
                      <span>{m.toolCallInfo}</span>
                    </div>
                  )}
                </div>
              ))}

              {/* Loading Indicator */}
              {isLoading && (
                <div className="flex items-start gap-2">
                  <div className="bg-card border border-border/70 rounded-2xl rounded-bl-xs px-3.5 py-2.5 flex items-center gap-2 text-xs text-muted-foreground shadow-xs">
                    <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
                    <span>{currentConfig.name} is thinking & checking tasks...</span>
                  </div>
                </div>
              )}

              <div ref={scrollRef} />
            </div>
          </ScrollArea>

          {/* Quick Action Suggestion Chips */}
          <div className="px-3 py-1.5 bg-muted/20 border-t border-border/40 flex items-center gap-1.5 overflow-x-auto no-scrollbar text-xs">
            <button
              onClick={() => handleQuickPrompt('What are my tasks for today?')}
              className="px-2.5 py-1 rounded-full bg-background border border-border/60 hover:border-primary/50 text-[11px] font-medium text-muted-foreground hover:text-foreground shrink-0 transition-colors flex items-center gap-1"
            >
              <HelpCircle className="h-3 w-3 text-primary" />
              <span>My Tasks</span>
            </button>
            <button
              onClick={() => handleQuickPrompt('Start the timer on my first task')}
              className="px-2.5 py-1 rounded-full bg-background border border-border/60 hover:border-primary/50 text-[11px] font-medium text-muted-foreground hover:text-foreground shrink-0 transition-colors flex items-center gap-1"
            >
              <Play className="h-3 w-3 text-emerald-500" />
              <span>Start Timer</span>
            </button>
            <button
              onClick={() => handleQuickPrompt('Pause my running timer')}
              className="px-2.5 py-1 rounded-full bg-background border border-border/60 hover:border-primary/50 text-[11px] font-medium text-muted-foreground hover:text-foreground shrink-0 transition-colors flex items-center gap-1"
            >
              <Pause className="h-3 w-3 text-amber-500" />
              <span>Pause Timer</span>
            </button>
            <button
              onClick={() => handleQuickPrompt('I just finished my current task, mark it finished')}
              className="px-2.5 py-1 rounded-full bg-background border border-border/60 hover:border-primary/50 text-[11px] font-medium text-muted-foreground hover:text-foreground shrink-0 transition-colors flex items-center gap-1"
            >
              <CheckCircle2 className="h-3 w-3 text-blue-500" />
              <span>Finish Task</span>
            </button>
            <button
              onClick={() => handleQuickPrompt('Create a new task: "Client Review Meeting" category Meeting')}
              className="px-2.5 py-1 rounded-full bg-background border border-border/60 hover:border-primary/50 text-[11px] font-medium text-muted-foreground hover:text-foreground shrink-0 transition-colors flex items-center gap-1"
            >
              <PlusCircle className="h-3 w-3 text-purple-500" />
              <span>+ New Task</span>
            </button>
          </div>

          {/* Input & Voice Controls */}
          <form onSubmit={(e) => handleSend(e)} className="p-2.5 sm:p-3 border-t bg-background flex items-center gap-2">
            {/* Speech-To-Text Mic Button */}
            {isSpeechSupported && (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={toggleListening}
                className={cn(
                  'h-9 w-9 rounded-full shrink-0 transition-all',
                  isListening
                    ? 'bg-rose-500 text-white animate-pulse hover:bg-rose-600'
                    : 'text-muted-foreground hover:text-primary hover:bg-primary/10'
                )}
                title={isListening ? 'Listening... click to stop' : 'Click to speak via voice'}
              >
                {isListening ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
              </Button>
            )}

            <Input
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={isListening ? 'Listening to your voice...' : currentConfig.placeholder}
              disabled={isLoading}
              maxLength={600}
              className="rounded-full bg-muted/40 border-border/60 text-xs sm:text-sm h-9 px-4 focus-visible:ring-1 focus-visible:ring-primary"
            />

            <Button
              type="submit"
              size="icon"
              disabled={!input.trim() || isLoading}
              className="h-9 w-9 rounded-full shrink-0 bg-primary text-primary-foreground shadow-xs hover:scale-105 active:scale-95 transition-transform"
            >
              <Send className="h-4 w-4" />
            </Button>
          </form>

          {/* Footer hint */}
          <div className="px-3 pb-2 pt-0 bg-background flex items-center justify-between text-[10px] text-muted-foreground/80">
            <span className="truncate">
              {isListening ? '🎙️ Speaking... will auto-send' : '💡 "Start timer on design", "Finish task", "Add task"'}
            </span>
            <span className="shrink-0 ml-1">Powered by AI</span>
          </div>
        </div>
      )}
    </>
  );
};

export default AIAssistantWidget;
