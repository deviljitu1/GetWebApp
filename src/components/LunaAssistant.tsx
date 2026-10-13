import { useState, useRef, useEffect } from 'react';
import { Sparkles, Send, X, Heart, Smile, Laugh } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useData } from '@/contexts/DataContext';
import { cn } from '@/lib/utils';
import { toast } from '@/hooks/use-toast';

type Message = { role: 'user' | 'assistant'; content: string };
type Personality = 'flirty' | 'funny' | 'sweet';

const personalityConfig: Record<Personality, { label: string; icon: typeof Heart; emoji: string }> = {
  flirty: { label: 'Flirty', icon: Heart, emoji: '😉' },
  funny: { label: 'Funny', icon: Laugh, emoji: '😂' },
  sweet: { label: 'Sweet', icon: Smile, emoji: '🌸' },
};

const LunaAssistant = () => {
  const { user } = useAuth();
  const { refreshTasks } = useData();
  const [open, setOpen] = useState(false);
  const [personality, setPersonality] = useState<Personality>(
    (localStorage.getItem('luna_personality') as Personality) || 'flirty'
  );
  const [messages, setMessages] = useState<Message[]>([
    {
      role: 'assistant',
      content: `Hey ${user?.name.split(' ')[0] || 'gorgeous'} 😉 I'm Luna — your work sidekick. Tell me what you finished, what you started, or just chat. I'll handle the boring task updates for you ✨`,
    },
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    localStorage.setItem('luna_personality', personality);
  }, [personality]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
    }
  }, [messages, loading]);

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 100);
  }, [open]);

  // Don't show for admin
  if (!user) return null;

  const send = async () => {
    const text = input.trim();
    if (!text || loading) return;
    setInput('');
    const newMessages: Message[] = [...messages, { role: 'user', content: text }];
    setMessages(newMessages);
    setLoading(true);

    try {
      const { data, error } = await supabase.functions.invoke('ai-assistant', {
        body: {
          messages: newMessages.map(m => ({ role: m.role, content: m.content })),
          userName: user.name.split(' ')[0],
          personality,
        },
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      setMessages([...newMessages, { role: 'assistant', content: data.reply || '...' }]);

      // If tools were used, refresh task data so the UI updates
      if (data?.toolsUsed) {
        await refreshTasks();
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Something broke';
      toast({ title: 'Luna had a hiccup', description: msg, variant: 'destructive' });
      setMessages([...newMessages, { role: 'assistant', content: `Oof, my brain glitched 🙃 (${msg}). Try again?` }]);
    } finally {
      setLoading(false);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  };

  const PersonalityIcon = personalityConfig[personality].icon;

  return (
    <>
      {/* Floating bubble */}
      {!open && (
        <button
          onClick={() => setOpen(true)}
          className="fixed bottom-[calc(5rem+env(safe-area-inset-bottom))] left-4 sm:bottom-6 sm:left-auto sm:right-24 z-40 h-14 w-14 rounded-full bg-gradient-to-br from-pink-500 via-purple-500 to-indigo-500 text-white shadow-xl hover:scale-110 transition-transform flex items-center justify-center group"
          aria-label="Open Luna AI"
        >
          <Sparkles className="h-6 w-6 group-hover:rotate-12 transition-transform" />
          <span className="absolute -top-1 -right-1 h-3 w-3 rounded-full bg-green-400 ring-2 ring-background animate-pulse" />
        </button>
      )}

      {/* Chat panel */}
      {open && (
        <Card className="fixed bottom-[calc(5rem+env(safe-area-inset-bottom))] left-4 sm:bottom-6 sm:left-auto sm:right-24 z-40 w-[calc(100vw-2rem)] sm:w-96 h-[min(32rem,calc(100dvh-11rem))] sm:h-[32rem] flex flex-col shadow-2xl border-2 border-primary/20 overflow-hidden">
          {/* Header */}
          <div className="p-3 bg-gradient-to-r from-pink-500 via-purple-500 to-indigo-500 text-white flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="h-9 w-9 rounded-full bg-white/20 flex items-center justify-center text-lg">
                {personalityConfig[personality].emoji}
              </div>
              <div>
                <p className="font-semibold leading-none">Luna</p>
                <p className="text-xs opacity-90 leading-tight mt-0.5">Your AI sidekick</p>
              </div>
            </div>
            <Button
              size="icon"
              variant="ghost"
              className="h-8 w-8 text-white hover:bg-white/20"
              onClick={() => setOpen(false)}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>

          {/* Personality switcher */}
          <div className="px-3 py-2 border-b bg-muted/30 flex items-center gap-1">
            <span className="text-xs text-muted-foreground mr-1">Mood:</span>
            {(Object.keys(personalityConfig) as Personality[]).map(p => {
              const Icon = personalityConfig[p].icon;
              return (
                <button
                  key={p}
                  onClick={() => setPersonality(p)}
                  className={cn(
                    'flex items-center gap-1 px-2 py-1 rounded-full text-xs transition-colors',
                    personality === p
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-background hover:bg-accent text-muted-foreground'
                  )}
                >
                  <Icon className="h-3 w-3" />
                  {personalityConfig[p].label}
                </button>
              );
            })}
          </div>

          {/* Messages */}
          <ScrollArea className="flex-1 p-3" ref={scrollRef as never}>
            <div className="space-y-3">
              {messages.map((m, i) => (
                <div
                  key={i}
                  className={cn(
                    'flex',
                    m.role === 'user' ? 'justify-end' : 'justify-start'
                  )}
                >
                  <div
                    className={cn(
                      'max-w-[85%] rounded-2xl px-3 py-2 text-sm whitespace-pre-wrap',
                      m.role === 'user'
                        ? 'bg-primary text-primary-foreground rounded-br-sm'
                        : 'bg-muted text-foreground rounded-bl-sm'
                    )}
                  >
                    {m.content}
                  </div>
                </div>
              ))}
              {loading && (
                <div className="flex justify-start">
                  <div className="bg-muted rounded-2xl rounded-bl-sm px-3 py-2.5 flex gap-1">
                    <span className="h-2 w-2 bg-muted-foreground/60 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                    <span className="h-2 w-2 bg-muted-foreground/60 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                    <span className="h-2 w-2 bg-muted-foreground/60 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                  </div>
                </div>
              )}
            </div>
          </ScrollArea>

          {/* Input */}
          <div className="p-3 border-t bg-background">
            <form
              onSubmit={e => {
                e.preventDefault();
                send();
              }}
              className="flex gap-2"
            >
              <Input
                ref={inputRef}
                value={input}
                onChange={e => setInput(e.target.value)}
                placeholder="Tell Luna what you're working on..."
                disabled={loading}
                maxLength={500}
                className="flex-1"
              />
              <Button type="submit" size="icon" disabled={loading || !input.trim()}>
                <Send className="h-4 w-4" />
              </Button>
            </form>
            <p className="text-[10px] text-muted-foreground mt-1.5 text-center">
              Try: "I just finished the login page" or "start timer on the design task"
            </p>
          </div>
        </Card>
      )}
    </>
  );
};

export default LunaAssistant;
