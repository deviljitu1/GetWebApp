-- 1. FIX DELETING & EDITING MESSAGES
-- Update the trigger function to allow the sender to update the 'content', 'is_edited', and 'is_deleted' fields
CREATE OR REPLACE FUNCTION public.messages_restrict_sender_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  -- Only enforce when the updater is the sender (not the receiver marking-as-read path)
  IF auth.uid() = OLD.sender_id THEN
    IF NEW.sender_id     IS DISTINCT FROM OLD.sender_id     OR
       NEW.receiver_id   IS DISTINCT FROM OLD.receiver_id   OR
       NEW.created_at    IS DISTINCT FROM OLD.created_at    OR
       NEW.is_read       IS DISTINCT FROM OLD.is_read       THEN
      RAISE EXCEPTION 'Senders may only edit or soft-delete their own messages';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;


-- 2. FIX SENDING ATTACHMENTS (Storage Bucket & Permissions)
-- Create the chat-attachments bucket if it doesn't exist (and make it public)
INSERT INTO storage.buckets (id, name, public) 
VALUES ('chat-attachments', 'chat-attachments', true)
ON CONFLICT (id) DO UPDATE SET public = true;

-- Drop existing storage policies just in case to prevent duplicates
DROP POLICY IF EXISTS "Public chat attachments read" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can upload chat attachments" ON storage.objects;
DROP POLICY IF EXISTS "Users can update their own chat attachments" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete their own chat attachments" ON storage.objects;

-- Create storage policies to allow viewing and uploading files
CREATE POLICY "Public chat attachments read" 
ON storage.objects FOR SELECT 
USING (bucket_id = 'chat-attachments');

CREATE POLICY "Authenticated users can upload chat attachments" 
ON storage.objects FOR INSERT 
TO authenticated
WITH CHECK (bucket_id = 'chat-attachments');

CREATE POLICY "Users can update their own chat attachments" 
ON storage.objects FOR UPDATE 
TO authenticated
USING (bucket_id = 'chat-attachments' AND (auth.uid() = owner OR owner IS NULL));

CREATE POLICY "Users can delete their own chat attachments" 
ON storage.objects FOR DELETE 
TO authenticated
USING (bucket_id = 'chat-attachments' AND (auth.uid() = owner OR owner IS NULL));
