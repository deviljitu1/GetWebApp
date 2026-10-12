
-- ============ MESSAGES: lock down sender updates ============
DROP POLICY IF EXISTS "Update Own Messages" ON public.messages;

-- Trigger: senders may only change is_deleted (soft delete). All other columns immutable.
CREATE OR REPLACE FUNCTION public.messages_restrict_sender_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Only enforce when the updater is the sender (not the receiver marking-as-read path)
  IF auth.uid() = OLD.sender_id THEN
    IF NEW.sender_id     IS DISTINCT FROM OLD.sender_id     OR
       NEW.receiver_id   IS DISTINCT FROM OLD.receiver_id   OR
       NEW.content       IS DISTINCT FROM OLD.content       OR
       NEW.created_at    IS DISTINCT FROM OLD.created_at    OR
       NEW.is_read       IS DISTINCT FROM OLD.is_read       THEN
      RAISE EXCEPTION 'Senders may only soft-delete their own messages';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_messages_restrict_sender_update ON public.messages;
CREATE TRIGGER trg_messages_restrict_sender_update
BEFORE UPDATE ON public.messages
FOR EACH ROW EXECUTE FUNCTION public.messages_restrict_sender_update();

CREATE POLICY "Senders can soft-delete own messages"
ON public.messages
FOR UPDATE
TO authenticated
USING (auth.uid() = sender_id)
WITH CHECK (auth.uid() = sender_id);

-- ============ TIME_SESSIONS: add permanent owner column ============
ALTER TABLE public.time_sessions
  ADD COLUMN IF NOT EXISTS created_by uuid REFERENCES auth.users(id);

-- Backfill from current task owner
UPDATE public.time_sessions ts
SET created_by = t.user_id
FROM public.tasks t
WHERE ts.task_id = t.id AND ts.created_by IS NULL;

ALTER TABLE public.time_sessions
  ALTER COLUMN created_by SET NOT NULL,
  ALTER COLUMN created_by SET DEFAULT auth.uid();

-- Replace ownership policy to use created_by
DROP POLICY IF EXISTS "Users can manage own time sessions" ON public.time_sessions;

CREATE POLICY "Users can manage own time sessions"
ON public.time_sessions
FOR ALL
TO authenticated
USING (created_by = auth.uid() AND is_active_user())
WITH CHECK (created_by = auth.uid() AND is_active_user());
