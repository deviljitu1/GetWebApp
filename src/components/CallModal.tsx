import React, { createContext, useContext, useEffect, useState, useRef } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { CallManager, playBellChime } from '@/lib/callService';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Phone, PhoneOff, PhoneIncoming, Mic, MicOff, Volume2, VolumeX, Bell, User } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';

interface CallContextType {
  startAudioCall: (targetUserId: string, targetUserName: string) => void;
  ringMember: (targetUserId: string, targetUserName: string) => Promise<void>;
}

const CallContext = createContext<CallContextType | null>(null);

export const useCall = () => {
  const ctx = useContext(CallContext);
  if (!ctx) throw new Error('useCall must be used within CallProvider');
  return ctx;
};

export const CallProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user } = useAuth();
  const [callManager, setCallManager] = useState<CallManager | null>(null);
  const [callState, setCallState] = useState<'idle' | 'calling' | 'ringing' | 'connected' | 'ended'>('idle');
  const [activeCallId, setActiveCallId] = useState<string | null>(null);
  const [otherPeer, setOtherPeer] = useState<{ id: string; name: string } | null>(null);
  const [isMuted, setIsMuted] = useState(false);
  const [isSpeakerOn, setIsSpeakerOn] = useState(true);
  const [callDuration, setCallDuration] = useState(0);

  // Incoming Ring popup
  const [incomingRing, setIncomingRing] = useState<{ senderName: string } | null>(null);

  // Initialize CallManager when user is authenticated
  useEffect(() => {
    if (!user) return;
    const manager = new CallManager(user.userId, user.name);

    manager.onStateChange = (state) => {
      setCallState(state);
      if (state === 'ended') {
        setTimeout(() => {
          setCallState('idle');
          setOtherPeer(null);
          setActiveCallId(null);
          setCallDuration(0);
        }, 1500);
      }
    };

    manager.onIncomingCall = ({ callId, callerId, callerName }) => {
      setActiveCallId(callId);
      setOtherPeer({ id: callerId, name: callerName });
      setCallState('ringing');
    };

    setCallManager(manager);

    // Listen to real-time ring broadcast
    const ringChannel = supabase
      .channel(`team-rings-${user.userId}`)
      .on('broadcast', { event: 'ring-alert' }, ({ payload }) => {
        playBellChime();
        setIncomingRing({ senderName: payload.senderName || 'Teammate' });
        toast({
          title: `🔔 Bell / Ring from ${payload.senderName || 'Teammate'}`,
          description: `${payload.senderName || 'Teammate'} is buzzing you for an urgent check-in!`,
        });
      })
      .subscribe();

    return () => {
      manager.destroy();
      supabase.removeChannel(ringChannel);
    };
  }, [user]);

  // Duration timer during connected call
  useEffect(() => {
    let interval: number;
    if (callState === 'connected') {
      interval = window.setInterval(() => {
        setCallDuration((prev) => prev + 1);
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [callState]);

  const formatCallTime = (secs: number) => {
    const mins = Math.floor(secs / 60);
    const remaining = secs % 60;
    return `${mins.toString().padStart(2, '0')}:${remaining.toString().padStart(2, '0')}`;
  };

  const startAudioCall = async (targetUserId: string, targetUserName: string) => {
    if (!callManager) return;
    setIsSpeakerOn(true);
    setIsMuted(false);
    setOtherPeer({ id: targetUserId, name: targetUserName });
    const callId = await callManager.startCall(targetUserId, targetUserName);
    setActiveCallId(callId);
  };

  const handleAcceptCall = async () => {
    if (!callManager || !activeCallId || !otherPeer) return;
    setIsSpeakerOn(true);
    setIsMuted(false);
    await callManager.acceptCall(activeCallId, otherPeer.id);
  };

  const handleDeclineCall = async () => {
    if (!callManager || !activeCallId || !otherPeer) return;
    await callManager.declineCall(activeCallId, otherPeer.id);
    setCallState('idle');
  };

  const handleEndCall = async () => {
    if (!callManager || !activeCallId || !otherPeer) return;
    await callManager.endCall(otherPeer.id, activeCallId);
    setCallState('idle');
  };

  const handleToggleMute = () => {
    if (!callManager) return;
    const nextMuted = !isMuted;
    setIsMuted(nextMuted);
    callManager.toggleMute(nextMuted);
  };

  const handleToggleSpeaker = () => {
    if (!callManager) return;
    const nextSpeakerOn = !isSpeakerOn;
    setIsSpeakerOn(nextSpeakerOn);
    callManager.toggleSpeaker(nextSpeakerOn);
  };

  /** Ring / Bell a team member */
  const ringMember = async (targetUserId: string, targetUserName: string) => {
    if (!user) return;
    playBellChime();

    // Broadcast realtime ring event to recipient channel
    const channel = supabase.channel(`team-rings-${targetUserId}`);
    channel.subscribe((status) => {
      if (status === 'SUBSCRIBED') {
        channel.send({
          type: 'broadcast',
          event: 'ring-alert',
          payload: { senderId: user.userId, senderName: user.name },
        });
      }
    });

    // Also persist in database notifications so it appears on their phone lock screen
    await supabase.from('notifications').insert({
      user_id: targetUserId,
      kind: 'ring',
      title: `🔔 Ring from ${user.name}`,
      body: `${user.name} is ringing / buzzing you! Please check in on GetWebApp.`,
      link_url: '/',
    });

    toast({
      title: `Rung ${targetUserName} 🔔`,
      description: `Bell chime and notification sent to ${targetUserName}.`,
    });
  };

  return (
    <CallContext.Provider value={{ startAudioCall, ringMember }}>
      {children}

      {/* Incoming Ring Modal */}
      <Dialog open={!!incomingRing} onOpenChange={() => setIncomingRing(null)}>
        <DialogContent className="w-[calc(100vw-2rem)] max-h-[90dvh] overflow-y-auto sm:max-w-md text-center p-4 sm:p-6 bg-card border-amber-500/30">
          <DialogHeader>
            <div className="mx-auto bg-amber-500/10 p-4 rounded-full w-16 h-16 flex items-center justify-center animate-bounce mb-2">
              <Bell className="h-8 w-8 text-amber-500" />
            </div>
            <DialogTitle className="text-xl font-bold">
              {incomingRing?.senderName} is Ringing You! 🔔
            </DialogTitle>
            <DialogDescription className="text-muted-foreground">
              Your teammate wants your attention for a quick check-in.
            </DialogDescription>
          </DialogHeader>
          <div className="flex gap-3 justify-center mt-4">
            <Button
              variant="outline"
              onClick={() => setIncomingRing(null)}
              className="px-6"
            >
              Dismiss
            </Button>
            <Button
              onClick={() => {
                setIncomingRing(null);
                if (otherPeer) startAudioCall(otherPeer.id, otherPeer.name);
              }}
              className="bg-amber-600 hover:bg-amber-700 text-white gap-2 px-6"
            >
              <Phone className="h-4 w-4" />
              Call Back
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Active Call / Incoming Call Dialog */}
      <Dialog open={callState !== 'idle'} onOpenChange={() => {}}>
        <DialogContent className="w-[calc(100vw-2rem)] max-h-[90dvh] overflow-y-auto sm:max-w-sm text-center p-4 sm:p-6 bg-card border-border shadow-2xl rounded-2xl">
          <DialogHeader className="items-center">
            <div className="relative mb-4 mt-2">
              <Avatar className="h-20 w-20 sm:h-24 sm:w-24 border-4 border-primary/20 shadow-xl">
                <AvatarImage src={`https://api.dicebear.com/7.x/avataaars/svg?seed=${otherPeer?.name}`} />
                <AvatarFallback className="bg-primary/10 text-2xl font-bold text-primary">
                  {otherPeer?.name?.charAt(0) || <User />}
                </AvatarFallback>
              </Avatar>
              {callState === 'connected' && (
                <span className="absolute bottom-1 right-1 h-5 w-5 rounded-full bg-emerald-500 border-2 border-background animate-pulse" />
              )}
            </div>

            <DialogTitle className="text-xl sm:text-2xl font-bold break-words">
              {otherPeer?.name || 'Teammate'}
            </DialogTitle>
            <DialogDescription className="text-sm font-medium text-muted-foreground">
              {callState === 'calling' && 'Calling... 📶'}
              {callState === 'ringing' && 'Incoming Audio Call... 📞'}
              {callState === 'connected' && (
                <span className="text-emerald-500 font-mono text-base font-bold">
                  Connected • {formatCallTime(callDuration)}
                </span>
              )}
              {callState === 'ended' && 'Call Ended'}
            </DialogDescription>
          </DialogHeader>

          {/* Incoming Call Actions */}
          {callState === 'ringing' && (
            <div className="flex items-center justify-center gap-6 mt-6">
              <Button
                variant="destructive"
                size="lg"
                onClick={handleDeclineCall}
                className="rounded-full h-14 w-14 p-0 shadow-lg"
                title="Decline"
              >
                <PhoneOff className="h-6 w-6" />
              </Button>
              <Button
                size="lg"
                onClick={handleAcceptCall}
                className="bg-emerald-600 hover:bg-emerald-700 text-white rounded-full h-14 w-14 p-0 shadow-lg animate-bounce"
                title="Accept"
              >
                <PhoneIncoming className="h-6 w-6" />
              </Button>
            </div>
          )}

          {/* Calling / Connected Call Controls */}
          {(callState === 'calling' || callState === 'connected') && (
            <div className="flex items-center justify-center gap-4 mt-6">
              {callState === 'connected' && (
                <Button
                  variant="outline"
                  size="icon"
                  onClick={handleToggleMute}
                  className={`h-12 w-12 rounded-full border-2 ${
                    isMuted ? 'bg-destructive/10 border-destructive text-destructive' : 'border-border'
                  }`}
                  title={isMuted ? 'Unmute' : 'Mute'}
                >
                  {isMuted ? <MicOff className="h-5 w-5" /> : <Mic className="h-5 w-5" />}
                </Button>
              )}
              {callState === 'connected' && (
                <Button
                  variant="outline"
                  size="icon"
                  onClick={handleToggleSpeaker}
                  className={`h-12 w-12 rounded-full border-2 transition-colors ${
                    isSpeakerOn ? 'border-primary/40 bg-primary/10 text-primary' : 'border-border text-muted-foreground'
                  }`}
                  title={isSpeakerOn ? 'Speaker on' : 'Speaker off'}
                  aria-label={isSpeakerOn ? 'Turn speaker off' : 'Turn speaker on'}
                >
                  {isSpeakerOn ? <Volume2 className="h-5 w-5" /> : <VolumeX className="h-5 w-5" />}
                </Button>
              )}
              <Button
                variant="destructive"
                size="icon"
                onClick={handleEndCall}
                className="h-14 w-14 rounded-full shadow-lg"
                title="End Call"
              >
                <PhoneOff className="h-6 w-6" />
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </CallContext.Provider>
  );
};
