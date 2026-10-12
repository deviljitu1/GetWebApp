
CREATE POLICY "task-attachments read" ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'task-attachments'
  AND (
    public.has_role(auth.uid(), 'admin')
    OR owner = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.tasks t
      WHERE t.id::text = split_part(name, '/', 1)
        AND t.user_id = auth.uid()
    )
  )
);

CREATE POLICY "task-attachments insert" ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'task-attachments'
  AND owner = auth.uid()
  AND (
    public.has_role(auth.uid(), 'admin')
    OR EXISTS (
      SELECT 1 FROM public.tasks t
      WHERE t.id::text = split_part(name, '/', 1)
        AND t.user_id = auth.uid()
    )
  )
);

CREATE POLICY "task-attachments delete" ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'task-attachments'
  AND (owner = auth.uid() OR public.has_role(auth.uid(), 'admin'))
);
