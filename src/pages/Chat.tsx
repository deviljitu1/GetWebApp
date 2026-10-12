import { useState, useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useData } from '@/contexts/DataContext';
import { useCall } from '@/components/CallModal';
import { Send, Users, MessageSquare, Plus, Search, Info, MoreVertical, Pencil, Trash2, X, Paperclip, Smile, Image as ImageIcon, FileText, ArrowLeft, ChevronDown, Bell, Phone } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import EmojiPicker, { EmojiClickData } from 'emoji-picker-react';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { formatDistanceToNow } from 'date-fns';
import { cn } from '@/lib/utils';
import { toast } from '@/hooks/use-toast';
import { Badge } from '@/components/ui/badge';
import Seo from "@/components/Seo";

interface Message {
    id: string;
    sender_id: string;
    receiver_id: string | null;
    content: string;
    created_at: string;
    profiles?: { name: string } | null;
    is_edited?: boolean;
    is_deleted?: boolean;
    attachment_url?: string;
    attachment_type?: string; // 'image' | 'file'
    attachment_name?: string;
}

const Chat = () => {
    const { user } = useAuth();
    const { members } = useData(); // We need member list for 1:1 chat selection
    const { startAudioCall, ringMember } = useCall();
    const [messages, setMessages] = useState<Message[]>([]);
    const [newMessage, setNewMessage] = useState('');
    const [selectedUser, setSelectedUser] = useState<string | null>(null); // null = Group Chat
    const scrollRef = useRef<HTMLDivElement>(null);
    const [searchQuery, setSearchQuery] = useState('');
    const [editingMessage, setEditingMessage] = useState<Message | null>(null);
    const [showEmojiPicker, setShowEmojiPicker] = useState(false);
    const [selectedFile, setSelectedFile] = useState<File | null>(null);
    const [showMobileChat, setShowMobileChat] = useState(false);
    const [unreadCounts, setUnreadCounts] = useState<Record<string, number>>({});
    const [groupUnreadCount, setGroupUnreadCount] = useState(0);
    const [isAtBottom, setIsAtBottom] = useState(true);
    const [attachmentUrls, setAttachmentUrls] = useState<Record<string, string>>({});
    const fileInputRef = useRef<HTMLInputElement>(null);

    // Extract the storage-path portion of an attachment reference. Handles both
    // new-format paths (e.g. "userId/abc.png") and legacy full public URLs.
    const extractAttachmentPath = (ref: string): string => {
        const marker = '/chat-attachments/';
        const idx = ref.indexOf(marker);
        if (idx >= 0) return ref.slice(idx + marker.length).split('?')[0];
        return ref;
    };

    // Determine chat partner name for header
    const chatPartner = selectedUser
        ? members.find(e => e.user_id === selectedUser)
        : null;

    const fetchMessages = async () => {
        if (!user) return;

        let query = supabase
            .from('messages')
            .select(`
        *,
        profiles:sender_id (name)
      `)
            .order('created_at', { ascending: true });

        if (selectedUser) {
            // 1:1 Chat: (me -> them) OR (them -> me)
            query = query.or(`and(sender_id.eq.${user.userId},receiver_id.eq.${selectedUser}),and(sender_id.eq.${selectedUser},receiver_id.eq.${user.userId})`);

            // Mark messages as read immediately when fetching for open chat
            await supabase.from('messages')
                .update({ is_read: true })
                .eq('sender_id', selectedUser)
                .eq('receiver_id', user.userId)
                .eq('is_read', false); // Only update unread ones

        } else {
            // Group Chat: receiver_id is null
            query = query.is('receiver_id', null);
        }

        const { data, error } = await query;
        if (error) {
            console.error('Error fetching messages:', error);
        } else {
            setMessages(data as any || []);

            // For Group Chat, update last read time based on LATEST message
            if (!selectedUser) {
                const latestMsg = data && data.length > 0 ? data[data.length - 1] : null;
                const lastReadTime = latestMsg ? latestMsg.created_at : new Date().toISOString();
                localStorage.setItem('lastGroupReadTime', lastReadTime);
                setGroupUnreadCount(0);
            }
        }

        // Also refresh unread counts
        fetchUnreadCounts();
    };

    const fetchUnreadCounts = async () => {
        if (!user) return;

        // 1:1 Unread Counts
        const { data } = await supabase
            .from('messages')
            .select('sender_id')
            .eq('receiver_id', user.userId)
            .eq('is_read', false);

        const counts: Record<string, number> = {};
        if (data) {
            data.forEach((msg: any) => {
                counts[msg.sender_id] = (counts[msg.sender_id] || 0) + 1;
            });
        }
        setUnreadCounts(counts);

        // Group Unread Counts (Simulated via LocalStorage)
        const lastRead = localStorage.getItem('lastGroupReadTime') || '1970-01-01';
        // Note: Supabase .count() is cleaner but .select with head: true works too
        const { count } = await supabase
            .from('messages')
            .select('*', { count: 'exact', head: true })
            .is('receiver_id', null)
            .gt('created_at', lastRead);

        setGroupUnreadCount(count || 0);
    };

    // Realtime subscription & Polling fallback
    useEffect(() => {
        // Initial fetch
        fetchMessages();

        // Realtime
        const channel = supabase
            .channel('chat_updates')
            .on(
                'postgres_changes',
                {
                    event: 'INSERT',
                    schema: 'public',
                    table: 'messages',
                },
                (payload) => {
                    console.log('Realtime fetch triggered by:', payload);

                    // Play notification sound if message is not from me (gated by user prefs)
                    const newMsg = payload.new as any;
                    if (user && newMsg.sender_id !== user.userId) {
                        import('@/lib/notifications').then(({ playNotificationSound }) =>
                            playNotificationSound('/universfield-new-notification-035-485894.mp3'),
                        );
                    }

                    // If the new message is NOT for the current open chat, just refresh counts
                    // Otherwise refresh messages
                    fetchMessages();
                }
            )
            .subscribe();

        // Polling fallback (every 1 second) to ensure messages appear if WebSocket fails
        const interval = setInterval(() => {
            fetchMessages();
        }, 1000);

        return () => {
            supabase.removeChannel(channel);
            clearInterval(interval);
        };
    }, [selectedUser, user]);

    const lastMessageId = messages.length > 0 ? messages[messages.length - 1].id : null;

    const scrollToBottom = (behavior: 'smooth' | 'auto' = 'smooth') => {
        if (scrollRef.current) {
            scrollRef.current.scrollIntoView({ behavior, block: 'end' });
            // Fallback for some browsers where smooth scrolling gets interrupted
            if (behavior === 'smooth') {
                setTimeout(() => {
                    scrollRef.current?.scrollIntoView({ behavior: 'auto', block: 'end' });
                }, 300);
            }
        }
    };

    // Force scroll to bottom when switching chats
    useEffect(() => {
        setIsAtBottom(true);
        setTimeout(() => {
            scrollToBottom('auto');
        }, 50);
    }, [selectedUser]);

    // Scroll to bottom when new messages arrive, IF we were already at bottom
    useEffect(() => {
        if (isAtBottom) {
            setTimeout(() => {
                scrollToBottom('smooth');
            }, 50);
        }
    }, [lastMessageId]);

    // Resolve short-lived signed URLs for any attachments in the current message list.
    useEffect(() => {
        const missing = messages
            .filter((m) => m.attachment_url)
            .map((m) => extractAttachmentPath(m.attachment_url!))
            .filter((p) => !attachmentUrls[p]);

        if (missing.length === 0) return;
        const unique = Array.from(new Set(missing));

        (async () => {
            const updates: Record<string, string> = {};
            for (const path of unique) {
                const { data, error } = await supabase.storage
                    .from('chat-attachments')
                    .createSignedUrl(path, 3600);
                if (!error && data?.signedUrl) {
                    updates[path] = data.signedUrl;
                }
            }
            if (Object.keys(updates).length > 0) {
                setAttachmentUrls((prev) => ({ ...prev, ...updates }));
            }
        })();
    }, [messages]);

    const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
        const { scrollTop, scrollHeight, clientHeight } = e.currentTarget;
        // 100px threshold to be considered "at bottom"
        const isBottom = Math.abs(scrollHeight - clientHeight - scrollTop) < 100; 
        setIsAtBottom(isBottom);
    };

    const handleSendMessage = async (e: React.FormEvent) => {
        e.preventDefault();
        if ((!newMessage.trim() && !selectedFile) || !user) return;

        try {
            let attachmentUrl = null;
            let attachmentType = null;
            let attachmentName = null;

            if (selectedFile) {
                const fileExt = selectedFile.name.split('.').pop();
                const fileName = `${Math.random()}.${fileExt}`;
                const filePath = `${user.userId}/${fileName}`;

                const { error: uploadError } = await supabase.storage
                    .from('chat-attachments')
                    .upload(filePath, selectedFile);

                if (uploadError) {
                    throw uploadError;
                }

                // Store the storage path only; render via short-lived signed URLs.
                attachmentUrl = filePath;
                attachmentType = selectedFile.type.startsWith('image/') ? 'image' : 'file';
                attachmentName = selectedFile.name;
            }

            if (editingMessage) {
                // Update existing message
                const { error } = await supabase
                    .from('messages')
                    .update({ content: newMessage.trim(), is_edited: true })
                    .eq('id', editingMessage.id);

                if (error) throw error;
                setEditingMessage(null);
            } else {
                // Send new message
                const { error } = await supabase.from('messages').insert({
                    sender_id: user.userId,
                    receiver_id: selectedUser, // null for Group
                    content: newMessage.trim(),
                    attachment_url: attachmentUrl,
                    attachment_type: attachmentType,
                    attachment_name: attachmentName
                });

                if (error) throw error;
            }

            setNewMessage('');
            setSelectedFile(null);
            setShowEmojiPicker(false);
            
            // Force scroll to bottom when sending a message
            setIsAtBottom(true);
            setTimeout(() => {
                scrollToBottom('smooth');
            }, 100);

            // Immediately fetch messages to ensure it appears even if realtime lags
            await fetchMessages();
        } catch (error) {
            console.error('Error sending message:', error);
            toast({
                title: "Error",
                description: "Failed to send message/file. Check storage permissions.",
                variant: "destructive"
            });
        }
    };

    const handleEmojiClick = (emojiData: EmojiClickData) => {
        setNewMessage(prev => prev + emojiData.emoji);
        // Don't close picker immediately to allow multiple emojis
    };

    const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            setSelectedFile(e.target.files[0]);
        }
    };

    const handleDeleteMessage = async (messageId: string) => {
        try {
            const { error } = await supabase
                .from('messages')
                .update({ is_deleted: true, content: 'This message was deleted' })
                .eq('id', messageId);

            if (error) throw error;
            await fetchMessages();
        } catch (error) {
            console.error('Error deleting message:', error);
            toast({
                title: "Error",
                description: "Failed to delete message.",
                variant: "destructive"
            });
        }
    };

    const startEditing = (msg: Message) => {
        setEditingMessage(msg);
        setNewMessage(msg.content);
        // Focus input
        setTimeout(() => document.querySelector('input')?.focus(), 0);
    };

    const cancelEditing = () => {
        setEditingMessage(null);
        setNewMessage('');
    };

    const filteredMembers = members
        .filter(emp => emp.user_id !== user?.userId) // Don't chat with self
        .filter(emp => emp.name.toLowerCase().includes(searchQuery.toLowerCase()));

    return (
        <div className="flex h-[calc(100vh-8rem)] gap-6 animate-in fade-in duration-500">
            <Seo title="Team Communication — WorkTracker" description="Message teammates, share files, and keep project conversations in one place inside WorkTracker." path="/chat" noindex />
            <h1 className="sr-only">Team Communication</h1>
            {/* Sidebar: Chat List */}
            <div className={cn(
                "w-full md:w-80 flex-col glass-card border-none rounded-2xl overflow-hidden shrink-0",
                showMobileChat ? "hidden md:flex" : "flex"
            )}>
                <div className="p-4 border-b border-border/50 bg-muted/20">
                    <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
                        <MessageSquare className="h-5 w-5 text-primary" /> Changes
                    </h2>
                    <div className="relative">
                        <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                        <Input
                            placeholder="Search people..."
                            className="pl-9 bg-background/50 border-input/50"
                            value={searchQuery}
                            onChange={e => setSearchQuery(e.target.value)}
                        />
                    </div>
                </div>

                <ScrollArea className="flex-1">
                    <div className="p-3 space-y-2">
                        {/* Group Chat Item */}
                        <button
                            onClick={() => {
                                setSelectedUser(null);
                                setShowMobileChat(true);
                            }}
                            className={cn(
                                "w-full flex items-center gap-3 p-3 rounded-xl transition-all text-left",
                                selectedUser === null
                                    ? "bg-primary/10 text-primary shadow-sm ring-1 ring-primary/20"
                                    : "hover:bg-muted/50 text-muted-foreground hover:text-foreground"
                            )}
                        >
                            <div className="h-10 w-10 rounded-full bg-primary/20 flex items-center justify-center shrink-0">
                                <Users className="h-5 w-5" />
                            </div>
                            <div className="flex-1 overflow-hidden">
                                <p className="font-semibold truncate">Team Group Chat</p>
                                <p className="text-xs opacity-70 truncate">Public channel for everyone</p>
                            </div>
                            {groupUnreadCount > 0 && (
                                <Badge variant="destructive" className="ml-auto rounded-full h-5 min-w-[1.25rem] px-1 flex items-center justify-center text-[10px]">
                                    {groupUnreadCount}
                                </Badge>
                            )}
                        </button>

                        <Separator className="my-2 bg-border/40" />
                        <p className="px-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Direct Messages</p>

                        {/* Team Member List */}
                        {filteredMembers.map(emp => (
                            <button
                                key={emp.user_id}
                                onClick={() => {
                                    setSelectedUser(emp.user_id);
                                    setShowMobileChat(true);
                                }}
                                className={cn(
                                    "w-full flex items-center gap-3 p-3 rounded-xl transition-all text-left",
                                    selectedUser === emp.user_id
                                        ? "bg-primary/10 text-primary shadow-sm ring-1 ring-primary/20"
                                        : "hover:bg-muted/50 text-muted-foreground hover:text-foreground"
                                )}
                            >
                                <Avatar className="h-10 w-10 border border-background shadow-sm">
                                    <AvatarImage src={`https://api.dicebear.com/7.x/avataaars/svg?seed=${emp.name}`} />
                                    <AvatarFallback>{emp.name.charAt(0)}</AvatarFallback>
                                </Avatar>
                                <div className="flex-1 overflow-hidden">
                                    <p className="font-semibold truncate">{emp.name}</p>
                                    <p className="text-xs opacity-70 truncate capitalize">{emp.employee_type}</p>
                                </div>
                                {emp.is_active && (
                                    <div className="h-2 w-2 rounded-full bg-green-500 ring-2 ring-background absolute bottom-3 left-10" title="Active" />
                                )}
                                {unreadCounts[emp.user_id] > 0 && selectedUser !== emp.user_id && (
                                    <Badge variant="destructive" className="ml-auto rounded-full h-5 min-w-[1.25rem] px-1 flex items-center justify-center text-[10px]">
                                        {unreadCounts[emp.user_id]}
                                    </Badge>
                                )}
                            </button>
                        ))}
                    </div>
                </ScrollArea>
            </div>

            {/* Main Chat Area */}
            <div className={cn(
                "flex-1 flex-col glass-card border-none rounded-2xl overflow-hidden shadow-xl relative",
                showMobileChat ? "flex" : "hidden md:flex"
            )}>
                {/* Chat Header */}
                <div className="p-4 border-b border-border/50 bg-muted/20 flex items-center gap-4">
                    <Button
                        variant="ghost"
                        size="icon"
                        className="md:hidden mr-1"
                        onClick={() => setShowMobileChat(false)}
                        aria-label="Back to chat list"
                    >
                        <ArrowLeft className="h-5 w-5" />
                    </Button>
                    {selectedUser ? (
                        <>
                            <Avatar className="h-10 w-10 border border-background shadow-sm">
                                <AvatarImage src={`https://api.dicebear.com/7.x/avataaars/svg?seed=${chatPartner?.name}`} />
                                <AvatarFallback>{chatPartner?.name.charAt(0)}</AvatarFallback>
                            </Avatar>
                            <div className="flex-1 min-w-0">
                                <h3 className="font-bold text-lg leading-none truncate">{chatPartner?.name}</h3>
                                <p className="text-xs text-muted-foreground capitalize mt-1 truncate">{chatPartner?.employee_type}</p>
                            </div>
                            {chatPartner && (
                                <div className="flex items-center gap-1.5 ml-auto">
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        onClick={() => ringMember(chatPartner.user_id, chatPartner.name)}
                                        className="h-8 text-xs gap-1 border-amber-500/30 text-amber-700 dark:text-amber-400 hover:bg-amber-500/10 font-semibold px-2.5"
                                        title="Ring / Bell Teammate"
                                    >
                                        <Bell className="h-3.5 w-3.5 animate-pulse" />
                                        <span className="hidden sm:inline">Ring</span>
                                    </Button>
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        onClick={() => startAudioCall(chatPartner.user_id, chatPartner.name)}
                                        className="h-8 text-xs gap-1 border-emerald-500/30 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-500/10 font-semibold px-2.5"
                                        title="Start Internet Audio Call"
                                    >
                                        <Phone className="h-3.5 w-3.5" />
                                        <span className="hidden sm:inline">Call</span>
                                    </Button>
                                </div>
                            )}
                        </>
                    ) : (
                        <>
                            <div className="h-10 w-10 rounded-full bg-primary/20 flex items-center justify-center text-primary shadow-sm border border-primary/10">
                                <Users className="h-5 w-5" />
                            </div>
                            <div className="flex-1">
                                <h3 className="font-bold text-lg leading-none">Team Group Chat</h3>
                                <p className="text-xs text-muted-foreground mt-1 cursor-pointer hover:underline" onClick={() => document.getElementById('view-members-trigger')?.click()}>
                                    General discussion for all {members.length} members
                                </p>
                            </div>
                            <Dialog>
                                <DialogTrigger asChild>
                                    <Button variant="ghost" size="icon" id="view-members-trigger" title="View Members" aria-label="View Members">
                                        <Info className="h-5 w-5 text-muted-foreground" />
                                    </Button>
                                </DialogTrigger>
                                <DialogContent className="sm:max-w-md">
                                    <DialogHeader>
                                        <DialogTitle>Team Members ({members.length})</DialogTitle>
                                    </DialogHeader>
                                    <ScrollArea className="h-72 pr-4">
                                        <div className="space-y-3">
                                            {members.map(emp => (
                                                <div key={emp.user_id} className="flex items-center gap-3 p-2 hover:bg-muted/50 rounded-lg">
                                                    <Avatar className="h-8 w-8">
                                                        <AvatarImage src={`https://api.dicebear.com/7.x/avataaars/svg?seed=${emp.name}`} />
                                                        <AvatarFallback>{emp.name.charAt(0)}</AvatarFallback>
                                                    </Avatar>
                                                    <div>
                                                        <p className="font-medium text-sm">{emp.name}</p>
                                                        <p className="text-xs text-muted-foreground capitalize">{emp.employee_type}</p>
                                                    </div>
                                                    {emp.is_active && <div className="ml-auto h-2 w-2 bg-green-500 rounded-full" title="Active" />}
                                                </div>
                                            ))}
                                        </div>
                                    </ScrollArea>
                                </DialogContent>
                            </Dialog>
                        </>
                    )}
                </div>

                {/* Messages Area */}
                <ScrollArea 
                    className="flex-1 p-4 md:p-6 bg-slate-50/50 dark:bg-slate-900/20"
                    onScroll={handleScroll}
                >
                    <div className="space-y-2 max-w-3xl mx-auto">
                        {messages.length === 0 ? (
                            <div className="flex flex-col items-center justify-center h-48 text-muted-foreground text-center animate-in fade-in zoom-in-95 duration-500">
                                <MessageSquare className="h-12 w-12 mb-3 opacity-20" />
                                <p>No messages yet.</p>
                                <p className="text-sm opacity-70">Start the conversation!</p>
                            </div>
                        ) : (
                            messages.map((msg, i) => {
                                const isMe = msg.sender_id === user?.userId;
                                const showAvatar = i === 0 || messages[i - 1].sender_id !== msg.sender_id;

                                return (
                                    <div
                                        key={msg.id}
                                        className={cn(
                                            "flex gap-3",
                                            isMe ? "justify-end" : "justify-start"
                                        )}
                                    >
                                        {!isMe && (
                                            <div className="flex-shrink-0 w-8">
                                                {showAvatar && (
                                                    <Avatar className="h-8 w-8 mt-1 border border-background shadow-sm">
                                                        <AvatarImage src={`https://api.dicebear.com/7.x/avataaars/svg?seed=${msg.profiles?.name}`} />
                                                        <AvatarFallback className="text-[10px]">{msg.profiles?.name?.charAt(0)}</AvatarFallback>
                                                    </Avatar>
                                                )}
                                            </div>
                                        )}

                                        <div className={cn(
                                            "group max-w-[75%] space-y-1",
                                            isMe ? "items-end" : "items-start"
                                        )}>
                                            {!isMe && showAvatar && (
                                                <p className="text-xs text-muted-foreground ml-1 mb-1">{msg.profiles?.name}</p>
                                            )}

                                            <div className={cn(
                                                "p-3 rounded-2xl shadow-sm break-words leading-relaxed text-sm animate-in zoom-in-95 duration-200 relative group/msg",
                                                isMe
                                                    ? "bg-primary text-primary-foreground rounded-tr-sm"
                                                    : "bg-white dark:bg-muted border border-border/50 rounded-tl-sm ml-1",
                                                msg.is_deleted && "italic opacity-70 bg-muted/50 text-muted-foreground border-dashed"
                                            )}>
                                                {msg.is_deleted ? (
                                                    <span className="flex items-center gap-1"><Info className="h-3 w-3" /> This message was deleted</span>
                                                ) : (
                                                    <>
                                                        {msg.attachment_url && (() => {
                                                            const path = extractAttachmentPath(msg.attachment_url);
                                                            const signed = attachmentUrls[path];
                                                            if (!signed) {
                                                                return (
                                                                    <div className="mb-2 text-xs text-muted-foreground italic">Loading attachment…</div>
                                                                );
                                                            }
                                                            return (
                                                                <div className="mb-2">
                                                                    {msg.attachment_type === 'image' ? (
                                                                        <div className="relative group/img cursor-pointer">
                                                                            <img
                                                                                src={signed}
                                                                                alt="Attachment"
                                                                                className="rounded-lg max-w-full max-h-60 object-cover border border-border/50"
                                                                                onClick={() => window.open(signed, '_blank')}
                                                                            />
                                                                        </div>
                                                                    ) : (
                                                                        <a
                                                                            href={signed}
                                                                            target="_blank"
                                                                            rel="noopener noreferrer"
                                                                            className="flex items-center gap-2 p-2 bg-muted/50 rounded-lg hover:bg-muted transition-colors border border-border/50"
                                                                        >
                                                                            <FileText className="h-8 w-8 text-primary" />
                                                                            <div className="flex-1 min-w-0">
                                                                                <p className="text-sm font-medium truncate max-w-[150px]">{msg.attachment_name || 'File'}</p>
                                                                                <p className="text-[10px] text-muted-foreground uppercase">Download</p>
                                                                            </div>
                                                                        </a>
                                                                    )}
                                                                </div>
                                                            );
                                                        })()}
                                                        {msg.content}
                                                        {msg.is_edited && <span className="text-[10px] ml-1 opacity-70">(edited)</span>}
                                                    </>
                                                )}

                                                {/* Dropdown for Edit/Delete (Only for me and not deleted) */}
                                                {isMe && !msg.is_deleted && (
                                                    <div className="absolute top-1 right-1 opacity-0 group-hover/msg:opacity-100 transition-opacity">
                                                        <DropdownMenu>
                                                            <DropdownMenuTrigger asChild>
                                                                <Button variant="ghost" size="icon" className="h-6 w-6 rounded-full hover:bg-black/10 dark:hover:bg-white/10" aria-label="Message options">
                                                                    <MoreVertical className="h-3 w-3" />
                                                                </Button>
                                                            </DropdownMenuTrigger>
                                                            <DropdownMenuContent align="end">
                                                                <DropdownMenuItem onClick={() => startEditing(msg)}>
                                                                    <Pencil className="mr-2 h-3 w-3" /> Edit
                                                                </DropdownMenuItem>
                                                                <DropdownMenuItem onClick={() => handleDeleteMessage(msg.id)} className="text-destructive">
                                                                    <Trash2 className="mr-2 h-3 w-3" /> Delete
                                                                </DropdownMenuItem>
                                                            </DropdownMenuContent>
                                                        </DropdownMenu>
                                                    </div>
                                                )}
                                            </div>

                                            <p className={cn(
                                                "text-[10px] text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity px-2",
                                                isMe ? "text-right" : "text-left"
                                            )}>
                                                {formatDistanceToNow(new Date(msg.created_at), { addSuffix: true })}
                                            </p>
                                        </div>

                                        {isMe && (
                                            <div className="flex-shrink-0 w-8">
                                                {/* Placeholder for alignment or my avatar if desired */}
                                            </div>
                                        )}
                                    </div>
                                );
                            })
                        )}
                        <div ref={scrollRef} />
                    </div>
                </ScrollArea>

                {/* Scroll to Bottom Button */}
                {!isAtBottom && (
                    <div className="absolute bottom-28 right-6 z-40">
                        <Button 
                            size="icon" 
                            className="rounded-full shadow-xl bg-primary text-primary-foreground hover:bg-primary/90 h-10 w-10 animate-in slide-in-from-bottom-2 fade-in"
                            onClick={() => {
                                setIsAtBottom(true);
                                scrollToBottom('smooth');
                            }}
                            aria-label="Scroll to bottom"
                        >
                            <ChevronDown className="h-5 w-5" />
                        </Button>
                    </div>
                )}

                {/* Input Area */}
                <div className="p-4 bg-background border-t border-border/50 relative z-50">
                    {showEmojiPicker && (
                        <div className="absolute bottom-20 left-4 z-50 shadow-xl rounded-xl border border-border">
                            <EmojiPicker onEmojiClick={handleEmojiClick} theme={"auto" as never} />
                        </div>
                    )}

                    {selectedFile && (
                        <div className="absolute bottom-20 left-4 z-50 p-2 bg-background border border-border rounded-lg shadow-lg flex items-center gap-2 animate-in slide-in-from-bottom-2">
                            <div className="p-2 bg-muted rounded-md">
                                {selectedFile.type.startsWith('image/') ? <ImageIcon className="h-4 w-4" /> : <FileText className="h-4 w-4" />}
                            </div>
                            <div className="max-w-[200px] truncate text-sm">{selectedFile.name}</div>
                            <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => setSelectedFile(null)} aria-label="Remove attachment">
                                <X className="h-3 w-3" />
                            </Button>
                        </div>
                    )}

                    <form onSubmit={handleSendMessage} className="flex gap-2 max-w-3xl mx-auto items-end">
                        <input
                            type="file"
                            ref={fileInputRef}
                            className="hidden"
                            onChange={handleFileSelect}
                        />
                        <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="rounded-full h-10 w-10 shrink-0 text-muted-foreground hover:text-foreground"
                            onClick={() => fileInputRef.current?.click()}
                            title="Attach File"
                            aria-label="Attach File"
                        >
                            <Paperclip className="h-5 w-5" />
                        </Button>
                        <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="rounded-full h-10 w-10 shrink-0 text-muted-foreground hover:text-foreground"
                            onClick={() => setShowEmojiPicker(!showEmojiPicker)}
                            title="Add Emoji"
                            aria-label="Add Emoji"
                        >
                            <Smile className="h-5 w-5" />
                        </Button>
                        <Input
                            value={newMessage}
                            onChange={e => setNewMessage(e.target.value)}
                            placeholder={editingMessage ? "Edit message..." : `Message ${selectedUser ? chatPartner?.name : 'everyone'}...`}
                            className="flex-1 bg-muted/30 border-muted-foreground/20 focus:bg-background transition-colors rounded-full px-4 py-6"
                            autoFocus
                        />
                        {editingMessage && (
                            <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                onClick={cancelEditing}
                                className="rounded-full h-10 w-10 shrink-0 text-muted-foreground hover:text-destructive"
                                title="Cancel Edit"
                                aria-label="Cancel Edit"
                            >
                                <X className="h-4 w-4" />
                            </Button>
                        )}
                        <Button
                            type="submit"
                            size="icon"
                            disabled={!newMessage.trim() && !selectedFile}
                            className={cn(
                                "rounded-full h-10 w-10 shrink-0 shadow-md shadow-primary/20 disabled:opacity-50 transition-all hover:scale-105 active:scale-95",
                                editingMessage ? "bg-amber-500 hover:bg-amber-600" : ""
                            )}
                        >
                            {editingMessage ? <Pencil className="h-4 w-4" /> : <Send className="h-4 w-4" />}
                            <span className="sr-only">{editingMessage ? "Update" : "Send"}</span>
                        </Button>
                    </form>
                </div>
            </div>
        </div>
    );
};

export default Chat;
