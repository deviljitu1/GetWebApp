import React, { useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useData } from '@/contexts/DataContext';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Send, BellRing, Users } from 'lucide-react';

export const AdminPushBroadcastDialog: React.FC<{ trigger?: React.ReactNode }> = ({ trigger }) => {
  const { user } = useAuth();
  const { members } = useData();
  const [open, setOpen] = useState(false);
  const [targetUser, setTargetUser] = useState<string>('all');
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [linkUrl, setLinkUrl] = useState('');
  const [loading, setLoading] = useState(false);

  const activeEmployees = members.filter((m) => m.is_active);

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !body.trim() || !user) {
      toast({ title: 'Please fill in title and message', variant: 'destructive' });
      return;
    }

    setLoading(true);
    try {
      let recipientIds: string[] = [];
      if (targetUser === 'all') {
        recipientIds = activeEmployees.map((m) => m.user_id);
      } else {
        recipientIds = [targetUser];
      }

      const { data, error } = await supabase.functions.invoke('send-push-notification', {
        body: {
          recipientIds,
          title: title.trim(),
          body: body.trim(),
          linkUrl: linkUrl.trim() || null,
        },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      toast({
        title: data?.delivered ? 'Push Notification Sent! 🚀' : 'In-app Notification Sent',
        description: data?.warning
          ? `${recipientIds.length} in-app notification${recipientIds.length === 1 ? '' : 's'} created. ${data.warning}.`
          : `${data?.delivered ?? 0} device push${data?.delivered === 1 ? '' : 'es'} delivered; ${recipientIds.length} in-app notification${recipientIds.length === 1 ? '' : 's'} created.`,
      });

      setTitle('');
      setBody('');
      setLinkUrl('');
      setTargetUser('all');
      setOpen(false);
    } catch (err: any) {
      console.error('Error sending push notification:', err);
      toast({
        title: 'Failed to send notification',
        description: err.message || 'Database error occurred.',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  if (user?.role !== 'admin') return null;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger || (
          <Button variant="outline" size="sm" className="gap-2 border-primary/30 hover:border-primary">
            <BellRing className="h-4 w-4 text-primary animate-pulse" />
            <span>Send Push Alert</span>
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="w-[calc(100vw-2rem)] max-h-[90dvh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <div className="p-2 bg-primary/10 rounded-lg">
              <BellRing className="h-5 w-5 text-primary" />
            </div>
            <div>
              <DialogTitle>Send Mobile Push Notification</DialogTitle>
              <DialogDescription>
                Broadcast an instant push alert to your team's mobile devices and browsers.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <form onSubmit={handleSend} className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label htmlFor="target">Recipient</Label>
            <Select value={targetUser} onValueChange={setTargetUser}>
              <SelectTrigger id="target">
                <SelectValue placeholder="Select Recipient" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">
                  <div className="flex items-center gap-2">
                    <Users className="h-4 w-4 text-primary" />
                    <span className="font-semibold">All Team Members ({activeEmployees.length})</span>
                  </div>
                </SelectItem>
                {activeEmployees.map((member) => (
                  <SelectItem key={member.user_id} value={member.user_id}>
                    {member.name} ({member.employee_type})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="title">Notification Title *</Label>
            <Input
              id="title"
              placeholder="e.g. 🚨 Urgent: Standup Meeting in 10 mins"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="body">Message Body *</Label>
            <Textarea
              id="body"
              placeholder="Write the notification message here..."
              rows={3}
              value={body}
              onChange={(e) => setBody(e.target.value)}
              required
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="linkUrl">Action Link (Optional)</Label>
            <Input
              id="linkUrl"
              placeholder="e.g. /chat or /team-status"
              value={linkUrl}
              onChange={(e) => setLinkUrl(e.target.value)}
            />
          </div>

          <DialogFooter className="mt-4 gap-2 sm:gap-2">
            <Button type="button" variant="outline" onClick={() => setOpen(false)} className="w-full sm:w-auto">
              Cancel
            </Button>
            <Button type="submit" disabled={loading} className="w-full gap-2 sm:w-auto">
              <Send className="h-4 w-4" />
              {loading ? 'Sending...' : 'Send Push Alert'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export default AdminPushBroadcastDialog;
