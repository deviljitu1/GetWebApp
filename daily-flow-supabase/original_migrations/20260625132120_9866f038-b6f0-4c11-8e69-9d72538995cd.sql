
-- Fix: SECURITY DEFINER executable by anon/authenticated (is_active_user)
ALTER FUNCTION public.is_active_user() SECURITY INVOKER;

-- Fix: messages UPDATE policies without WITH CHECK
DROP POLICY IF EXISTS "Allow receivers to mark messages as read" ON public.messages;
DROP POLICY IF EXISTS "Enable update for receivers" ON public.messages;
-- Keep "Enable update for receivers to mark as read" (has WITH CHECK), but add column-level guard via trigger

CREATE OR REPLACE FUNCTION public.messages_restrict_receiver_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() = OLD.receiver_id AND auth.uid() <> OLD.sender_id THEN
    IF NEW.sender_id      IS DISTINCT FROM OLD.sender_id      OR
       NEW.receiver_id    IS DISTINCT FROM OLD.receiver_id    OR
       NEW.content        IS DISTINCT FROM OLD.content        OR
       NEW.attachment_url IS DISTINCT FROM OLD.attachment_url OR
       NEW.created_at     IS DISTINCT FROM OLD.created_at     OR
       NEW.is_deleted     IS DISTINCT FROM OLD.is_deleted     THEN
      RAISE EXCEPTION 'Receivers may only update is_read on their messages';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS messages_restrict_receiver_update_trg ON public.messages;
CREATE TRIGGER messages_restrict_receiver_update_trg
BEFORE UPDATE ON public.messages
FOR EACH ROW EXECUTE FUNCTION public.messages_restrict_receiver_update();

-- Ensure sender restriction trigger is attached too (was created earlier as function only)
DROP TRIGGER IF EXISTS messages_restrict_sender_update_trg ON public.messages;
CREATE TRIGGER messages_restrict_sender_update_trg
BEFORE UPDATE ON public.messages
FOR EACH ROW EXECUTE FUNCTION public.messages_restrict_sender_update();

-- Fix: redundant public SELECT policy on tasks
DROP POLICY IF EXISTS "Enable read access for all users" ON public.tasks;
