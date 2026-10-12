/**
 * WebRTC 1-on-1 Audio Calling and Sound Chimes Service
 * Uses Web Audio API for synthetic bell / ringtones (100% reliable, zero external assets).
 * Uses Supabase Realtime for WebRTC signaling (Offer, Answer, ICE candidates).
 */
import { supabase } from '@/integrations/supabase/client';

// Audio Context Singleton for synthetic sound effects
let audioCtx: AudioContext | null = null;
function getAudioContext(): AudioContext {
  if (!audioCtx) {
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    audioCtx = new AudioContextClass();
  }
  if (audioCtx.state === 'suspended') {
    audioCtx.resume();
  }
  return audioCtx;
}

/** Play a pleasant bell / ring chime sound */
export function playBellChime() {
  try {
    const ctx = getAudioContext();
    const now = ctx.currentTime;

    // Chime Note 1
    const osc1 = ctx.createOscillator();
    const gain1 = ctx.createGain();
    osc1.type = 'sine';
    osc1.frequency.setValueAtTime(880, now); // A5
    gain1.gain.setValueAtTime(0.3, now);
    gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.8);
    osc1.connect(gain1);
    gain1.connect(ctx.destination);
    osc1.start(now);
    osc1.stop(now + 0.8);

    // Chime Note 2 (harmonics)
    const osc2 = ctx.createOscillator();
    const gain2 = ctx.createGain();
    osc2.type = 'sine';
    osc2.frequency.setValueAtTime(1320, now + 0.15); // E6
    gain2.gain.setValueAtTime(0.25, now + 0.15);
    gain2.gain.exponentialRampToValueAtTime(0.001, now + 1.2);
    osc2.connect(gain2);
    gain2.connect(ctx.destination);
    osc2.start(now + 0.15);
    osc2.stop(now + 1.2);

    // Vibrate device if supported
    if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
      navigator.vibrate([200, 100, 200]);
    }
  } catch (err) {
    console.warn('Could not play bell chime:', err);
  }
}

/** Phone ring tone loop for incoming/outgoing call */
let ringInterval: number | null = null;

export function startRingTone() {
  stopRingTone();
  const playPulse = () => {
    try {
      const ctx = getAudioContext();
      const now = ctx.currentTime;

      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(440, now);
      gain.gain.setValueAtTime(0.15, now);
      gain.gain.linearRampToValueAtTime(0.15, now + 0.4);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.5);

      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.5);

      const osc2 = ctx.createOscillator();
      const gain2 = ctx.createGain();
      osc2.type = 'sine';
      osc2.frequency.setValueAtTime(480, now);
      gain2.gain.setValueAtTime(0.15, now);
      gain2.gain.linearRampToValueAtTime(0.15, now + 0.4);
      gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.5);

      osc2.connect(gain2);
      gain2.connect(ctx.destination);
      osc2.start(now);
      osc2.stop(now + 0.5);
    } catch {}
  };

  playPulse();
  ringInterval = window.setInterval(playPulse, 2000);
}

export function stopRingTone() {
  if (ringInterval) {
    clearInterval(ringInterval);
    ringInterval = null;
  }
}

export interface CallSignal {
  type: 'call-invite' | 'call-accepted' | 'call-declined' | 'call-ended' | 'sdp-offer' | 'sdp-answer' | 'ice-candidate';
  callId: string;
  callerId: string;
  callerName: string;
  recipientId: string;
  sdp?: any;
  candidate?: any;
}

const rtcConfig: RTCConfiguration = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
  ],
};

export class CallManager {
  private peerConnection: RTCPeerConnection | null = null;
  private localStream: MediaStream | null = null;
  private remoteAudio: HTMLAudioElement | null = null;
  private channel: any = null;
  public onStateChange?: (state: 'idle' | 'calling' | 'ringing' | 'connected' | 'ended') => void;
  public onRemoteStream?: (stream: MediaStream) => void;
  public onIncomingCall?: (call: { callId: string; callerId: string; callerName: string }) => void;

  constructor(private currentUserId: string, private currentUserName: string) {
    this.initRealtimeChannel();
  }

  private initRealtimeChannel() {
    this.channel = supabase.channel(`user-calls-${this.currentUserId}`, {
      config: { broadcast: { self: false } },
    });

    this.channel
      .on('broadcast', { event: 'call-signal' }, ({ payload }: { payload: CallSignal }) => {
        this.handleIncomingSignal(payload);
      })
      .subscribe();
  }

  private async sendSignal(targetUserId: string, signal: CallSignal) {
    const targetChannel = supabase.channel(`user-calls-${targetUserId}`);
    targetChannel.subscribe((status) => {
      if (status === 'SUBSCRIBED') {
        targetChannel.send({
          type: 'broadcast',
          event: 'call-signal',
          payload: signal,
        });
      }
    });
  }

  private async handleIncomingSignal(signal: CallSignal) {
    switch (signal.type) {
      case 'call-invite':
        startRingTone();
        if (this.onIncomingCall) {
          this.onIncomingCall({
            callId: signal.callId,
            callerId: signal.callerId,
            callerName: signal.callerName,
          });
        }
        break;

      case 'call-accepted':
        stopRingTone();
        if (this.onStateChange) this.onStateChange('connected');
        break;

      case 'call-declined':
      case 'call-ended':
        stopRingTone();
        this.cleanup();
        if (this.onStateChange) this.onStateChange('ended');
        break;

      case 'sdp-offer':
        await this.handleSdpOffer(signal);
        break;

      case 'sdp-answer':
        await this.handleSdpAnswer(signal);
        break;

      case 'ice-candidate':
        if (this.peerConnection && signal.candidate) {
          try {
            await this.peerConnection.addIceCandidate(new RTCIceCandidate(signal.candidate));
          } catch (e) {
            console.error('Error adding ICE candidate:', e);
          }
        }
        break;
    }
  }

  public async startCall(recipientId: string, recipientName: string): Promise<string> {
    const callId = `call_${Date.now()}`;
    startRingTone();
    if (this.onStateChange) this.onStateChange('calling');

    // Notify recipient in Supabase notifications table for push alerts
    await supabase.from('notifications').insert({
      user_id: recipientId,
      kind: 'call',
      title: `📞 Incoming Call from ${this.currentUserName}`,
      body: `${this.currentUserName} is calling you on GetWebApp. Click to answer!`,
      link_url: '/',
    });

    // Send realtime invite
    await this.sendSignal(recipientId, {
      type: 'call-invite',
      callId,
      callerId: this.currentUserId,
      callerName: this.currentUserName,
      recipientId,
    });

    await this.setupPeerConnection(recipientId, callId, true);
    return callId;
  }

  public async acceptCall(callId: string, callerId: string) {
    stopRingTone();
    if (this.onStateChange) this.onStateChange('connected');

    await this.sendSignal(callerId, {
      type: 'call-accepted',
      callId,
      callerId,
      callerName: this.currentUserName,
      recipientId: this.currentUserId,
    });

    await this.setupPeerConnection(callerId, callId, false);
  }

  public async declineCall(callId: string, callerId: string) {
    stopRingTone();
    await this.sendSignal(callerId, {
      type: 'call-declined',
      callId,
      callerId,
      callerName: this.currentUserName,
      recipientId: this.currentUserId,
    });
    this.cleanup();
    if (this.onStateChange) this.onStateChange('ended');
  }

  public async endCall(otherUserId: string, callId: string) {
    stopRingTone();
    await this.sendSignal(otherUserId, {
      type: 'call-ended',
      callId,
      callerId: this.currentUserId,
      callerName: this.currentUserName,
      recipientId: otherUserId,
    });
    this.cleanup();
    if (this.onStateChange) this.onStateChange('ended');
  }

  private async setupPeerConnection(otherUserId: string, callId: string, isCaller: boolean) {
    try {
      this.localStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
    } catch (err) {
      console.warn('Microphone permission denied or not available:', err);
      // Fallback: still create peer connection
    }

    this.peerConnection = new RTCPeerConnection(rtcConfig);

    if (this.localStream) {
      this.localStream.getTracks().forEach((track) => {
        this.peerConnection?.addTrack(track, this.localStream!);
      });
    }

    this.peerConnection.ontrack = (event) => {
      const [remoteStream] = event.streams;
      if (remoteStream) {
        if (!this.remoteAudio) {
          this.remoteAudio = new Audio();
          this.remoteAudio.autoplay = true;
        }
        this.remoteAudio.srcObject = remoteStream;
        if (this.onRemoteStream) this.onRemoteStream(remoteStream);
      }
    };

    this.peerConnection.onicecandidate = (event) => {
      if (event.candidate) {
        this.sendSignal(otherUserId, {
          type: 'ice-candidate',
          callId,
          callerId: this.currentUserId,
          callerName: this.currentUserName,
          recipientId: otherUserId,
          candidate: event.candidate.toJSON(),
        });
      }
    };

    if (isCaller) {
      const offer = await this.peerConnection.createOffer();
      await this.peerConnection.setLocalDescription(offer);
      await this.sendSignal(otherUserId, {
        type: 'sdp-offer',
        callId,
        callerId: this.currentUserId,
        callerName: this.currentUserName,
        recipientId: otherUserId,
        sdp: offer,
      });
    }
  }

  private async handleSdpOffer(signal: CallSignal) {
    if (!this.peerConnection) return;
    await this.peerConnection.setRemoteDescription(new RTCSessionDescription(signal.sdp));
    const answer = await this.peerConnection.createAnswer();
    await this.peerConnection.setLocalDescription(answer);
    await this.sendSignal(signal.callerId, {
      type: 'sdp-answer',
      callId: signal.callId,
      callerId: this.currentUserId,
      callerName: this.currentUserName,
      recipientId: signal.callerId,
      sdp: answer,
    });
  }

  private async handleSdpAnswer(signal: CallSignal) {
    if (!this.peerConnection) return;
    await this.peerConnection.setRemoteDescription(new RTCSessionDescription(signal.sdp));
  }

  public toggleMute(muted: boolean) {
    if (this.localStream) {
      this.localStream.getAudioTracks().forEach((track) => {
        track.enabled = !muted;
      });
    }
  }

  public toggleSpeaker(enabled: boolean) {
    if (this.remoteAudio) this.remoteAudio.volume = enabled ? 1 : 0;
  }

  public cleanup() {
    stopRingTone();
    if (this.localStream) {
      this.localStream.getTracks().forEach((t) => t.stop());
      this.localStream = null;
    }
    if (this.peerConnection) {
      this.peerConnection.close();
      this.peerConnection = null;
    }
    if (this.remoteAudio) {
      this.remoteAudio.srcObject = null;
      this.remoteAudio = null;
    }
  }

  public destroy() {
    this.cleanup();
    if (this.channel) {
      supabase.removeChannel(this.channel);
    }
  }
}
