import React, { useState, useRef, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useData } from '@/contexts/DataContext';
import { chatCompletion, AI_TOOLS, generateSystemPrompt } from '@/lib/ai-agent';
import type { AIPersona } from '@/lib/ai-agent';
import { speakText, stopSpeaking } from '@/lib/voice';
import { Bot, X, Maximize2, Minimize2, Send, Loader2, Mic, MicOff, VolumeX } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn, todayStr } from '@/lib/utils';
import ReactMarkdown from 'react-markdown';
import { toast } from '@/hooks/use-toast';

export const AIAssistantWidget = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const [messages, setMessages] = useState<Array<Record<string, unknown>>>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [persona, setPersona] = useState<AIPersona>('Jarvis');
  
  // Speech Recognition Setup
  const SpeechRecognition: any = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
  const recognition = useRef<any>(null);

  useEffect(() => {
    if (SpeechRecognition) {
      recognition.current = new SpeechRecognition();
      recognition.current.continuous = false;
      recognition.current.interimResults = false;
      recognition.current.lang = 'en-US';

      recognition.current.onresult = (event: any) => {
        const transcript = event.results[0][0].transcript;
        // Auto-send the voice transcript immediately!
        handleSend(undefined, transcript);
      };

      recognition.current.onend = () => {
        setIsListening(false);
      };

      recognition.current.onerror = (event: any) => {
        console.error("Speech recognition error", event.error);
        setIsListening(false);
        if (event.error === 'not-allowed') {
          toast({ title: "Microphone Access Denied", description: "Please allow microphone access in your browser.", variant: "destructive" });
        }
      };
    }
  }, [SpeechRecognition]);

  const toggleListening = () => {
    if (isListening) {
      recognition.current?.stop();
      setIsListening(false);
    } else {
      // Stop any ongoing TTS when user starts speaking
      stopSpeaking();
      recognition.current?.start();
      setIsListening(true);
    }
  };
  
  const { user } = useAuth();
  const { tasks, members, addTask, deleteTask, updateTask } = useData();
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages]);

  const handleSend = async (e?: React.FormEvent, overrideText?: string) => {
    e?.preventDefault();
    
    const userMessage = overrideText || input.trim();
    if (!userMessage || isLoading || !user) return;

    if (!overrideText) setInput('');
    
    const newMessages = [...messages, { role: 'user', content: userMessage }];
    setMessages(newMessages);
    setIsLoading(true);

    try {
      const systemPrompt = generateSystemPrompt(user.name, user.role, members, tasks, persona);

      const conversation: any[] = [
        { role: 'system', content: systemPrompt },
        ...newMessages,
      ];

      const runner = await chatCompletion({
        messages: conversation as any,
        tools: AI_TOOLS,
        tool_choice: 'auto',
      });

      const responseMessage = runner.choices[0].message;

      // Handle tool calls
      if (responseMessage.tool_calls && responseMessage.tool_calls.length > 0) {
        setMessages(prev => [...prev, { role: 'assistant', content: 'Working on it...' }]);

        for (const toolCall of responseMessage.tool_calls) {
          const args = JSON.parse(toolCall.function.arguments);
          let resultStr = "Success";

          try {
            if (toolCall.function.name === 'create_task') {
              let targetUserId = user.userId;
              if (args.assigned_to && user.role === 'admin') {
                const member = members.find(e => e.name.toLowerCase() === args.assigned_to.toLowerCase() || e.name.toLowerCase().includes(args.assigned_to.toLowerCase()));
                if (member) {
                  targetUserId = member.user_id;
                }
              }

              await addTask({
                title: args.title,
                description: args.description || '',
                category: args.category || 'Other',
                date: todayStr(),
                target_minutes: args.target_minutes,
                user_id: targetUserId
              });
              resultStr = "Task created successfully.";
            }
            else if (toolCall.function.name === 'delete_task') {
              await deleteTask(args.task_id);
              resultStr = "Task deleted successfully.";
            }
            else if (toolCall.function.name === 'update_task') {
              await updateTask(args.task_id, {
                target_minutes: args.target_minutes,
                status: args.status
              });
              resultStr = "Task updated successfully.";
            }
          } catch (e: any) {
            resultStr = "Error: " + e.message;
          }

          // Push the tool result back into the message history
          conversation.push(responseMessage as any);
          conversation.push({
            role: 'tool',
            tool_call_id: toolCall.id,
            name: toolCall.function.name,
            content: resultStr,
          });
        }

        // Second call with tool results
        const secondResponse = await chatCompletion({
          messages: conversation as any,
        });
        
        // Replace the "Working on it..." with the actual response
        const finalResponse = secondResponse.choices[0].message.content || 'Done.';
        setMessages(prev => {
          const m = [...prev];
          m[m.length - 1] = { role: 'assistant', content: finalResponse };
          return m;
        });
        speakText(finalResponse);

      } else {
        const finalResponse = responseMessage.content || '';
        setMessages(prev => [...prev, { role: 'assistant', content: finalResponse }]);
        speakText(finalResponse);
      }

    } catch (error: any) {
      console.error(error);
      toast({ title: 'AI Error', description: error.message, variant: 'destructive' });
      setMessages(prev => [...prev, { role: 'assistant', content: "Sorry, I ran into an error reaching the AI service. Please try again in a moment." }]);
    } finally {
      setIsLoading(false);
    }
  };

  if (!isOpen) {
    return (
      <Button 
        onClick={() => setIsOpen(true)}
        className="fixed bottom-[calc(5rem+env(safe-area-inset-bottom))] right-4 sm:bottom-6 sm:right-6 h-14 w-14 rounded-full shadow-2xl shadow-primary/40 hover:scale-105 transition-all z-50 bg-primary"
      >
        <Bot className="h-6 w-6 text-primary-foreground" />
      </Button>
    );
  }

  return (
    <div className={cn(
      "fixed bottom-[calc(5rem+env(safe-area-inset-bottom))] right-4 sm:bottom-6 sm:right-6 bg-background border border-border/50 shadow-2xl rounded-2xl flex flex-col z-50 overflow-hidden transition-all duration-300",
      isExpanded ? "w-[calc(100vw-2rem)] h-[min(600px,calc(100dvh-11rem))] sm:w-[500px] sm:h-[700px]" : "w-[calc(100vw-2rem)] h-[min(500px,calc(100dvh-11rem))] sm:w-[350px] sm:h-[500px]"
    )}>
      <div className="p-4 bg-primary/5 border-b border-border/50 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="p-1.5 bg-primary/10 rounded-lg relative overflow-hidden">
            <Bot className="h-5 w-5 text-primary relative z-10" />
            {isListening && (
               <div className="absolute inset-0 bg-primary/20 animate-pulse z-0" />
            )}
          </div>
          <select 
            value={persona} 
            onChange={(e) => setPersona(e.target.value as AIPersona)}
            className="bg-transparent border-none text-sm font-semibold outline-none cursor-pointer focus:ring-0"
          >
            <option value="Jarvis">J.A.R.V.I.S</option>
            <option value="Professional">Professional</option>
            <option value="Funny">Funny</option>
            <option value="Flirty">Flirty</option>
          </select>
        </div>
        <div className="flex gap-1">
          <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-foreground" onClick={stopSpeaking} title="Stop Audio">
            <VolumeX className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-foreground" onClick={() => setIsExpanded(!isExpanded)}>
            {isExpanded ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
          </Button>
          <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-destructive" onClick={() => setIsOpen(false)}>
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>
      
      <ScrollArea className="flex-1 p-4 bg-slate-50/50 dark:bg-slate-900/20">
        {messages.length === 0 && (
          <div className="text-center text-muted-foreground mt-10 space-y-4">
            <Bot className="h-10 w-10 mx-auto opacity-20" />
            <p className="text-sm">Hi! I can help you create tasks, set reminders, and manage your workload. Just ask!</p>
          </div>
        )}
        <div className="space-y-4">
          {messages.map((m, i) => (
            <div key={i} className={cn("flex gap-2 max-w-[85%]", m.role === 'user' ? "ml-auto flex-row-reverse" : "")}>
              <div className={cn(
                "p-3 rounded-2xl text-sm", 
                m.role === 'user' ? "bg-primary text-primary-foreground rounded-tr-sm" : "bg-white dark:bg-muted border border-border/50 rounded-tl-sm prose prose-sm dark:prose-invert"
              )}>
                {m.role === 'user' ? String(m.content ?? '') : <ReactMarkdown>{String(m.content ?? '')}</ReactMarkdown>}
              </div>
            </div>
          ))}
          {isLoading && (
            <div className="flex gap-2">
               <div className="p-3 bg-white dark:bg-muted border border-border/50 rounded-2xl rounded-tl-sm flex items-center gap-2">
                 <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                 <span className="text-xs text-muted-foreground">Thinking...</span>
               </div>
            </div>
          )}
          <div ref={scrollRef} />
        </div>
      </ScrollArea>

      <form onSubmit={handleSend} className="p-3 border-t bg-background flex gap-2 items-center">
        {SpeechRecognition && (
          <Button 
            type="button" 
            variant="ghost" 
            size="icon" 
            onClick={toggleListening}
            className={cn("rounded-full shrink-0 transition-colors", isListening && "bg-red-500/10 text-red-500 hover:bg-red-500/20 hover:text-red-600")}
            title={isListening ? "Stop listening" : "Start speaking"}
          >
            {isListening ? <MicOff className="h-5 w-5 animate-pulse" /> : <Mic className="h-5 w-5" />}
          </Button>
        )}
        <Input 
          value={input} 
          onChange={e => setInput(e.target.value)} 
          placeholder="Ask me to create a task..." 
          disabled={isLoading}
          className="rounded-full bg-muted/50"
        />
        <Button type="submit" size="icon" disabled={!input.trim() || isLoading} className="rounded-full shrink-0">
          <Send className="h-4 w-4" />
        </Button>
      </form>
    </div>
  );
};
