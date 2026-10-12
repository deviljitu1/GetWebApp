
DROP POLICY IF EXISTS "System inserts notifications for any user" ON public.notifications;
CREATE POLICY "Users insert notifications for self or as admin" ON public.notifications FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));
