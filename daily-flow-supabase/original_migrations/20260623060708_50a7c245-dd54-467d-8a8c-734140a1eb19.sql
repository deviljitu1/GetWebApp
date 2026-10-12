
-- 1) Lock down SECURITY DEFINER functions: revoke from PUBLIC/anon/authenticated
REVOKE EXECUTE ON FUNCTION public.is_admin() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.is_active_user() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.update_updated_at_column() FROM PUBLIC, anon, authenticated;

-- 2) Convert get_team_activity to SECURITY INVOKER so RLS applies; keep callable by authenticated
ALTER FUNCTION public.get_team_activity() SECURITY INVOKER;
REVOKE EXECUTE ON FUNCTION public.get_team_activity() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_team_activity() TO authenticated;

-- 3) Remove pg_graphql exposure (app uses REST only)
REVOKE USAGE ON SCHEMA graphql FROM anon, authenticated;
REVOKE ALL ON ALL TABLES IN SCHEMA graphql FROM anon, authenticated;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA graphql FROM anon, authenticated;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA graphql FROM anon, authenticated;

-- 4) Tighten group-message read access to active employees
DROP POLICY IF EXISTS "View Group Messages" ON public.messages;
CREATE POLICY "View Group Messages"
  ON public.messages
  FOR SELECT
  TO authenticated
  USING (receiver_id IS NULL AND public.is_active_user());

-- 5) Storage: scope chat-attachments to per-user folder, add UPDATE/DELETE policies
DROP POLICY IF EXISTS "Allow Authenticated Uploads" ON storage.objects;
DROP POLICY IF EXISTS "Allow Public View" ON storage.objects;

CREATE POLICY "chat_attachments_owner_select"
  ON storage.objects
  FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'chat-attachments'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "chat_attachments_owner_insert"
  ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'chat-attachments'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "chat_attachments_owner_update"
  ON storage.objects
  FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'chat-attachments'
    AND (storage.foldername(name))[1] = auth.uid()::text
  )
  WITH CHECK (
    bucket_id = 'chat-attachments'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "chat_attachments_owner_delete"
  ON storage.objects
  FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'chat-attachments'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );
