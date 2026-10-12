insert into storage.buckets(id,name,public) values ('chat-attachments','chat-attachments',f) on conflict do nothing;
insert into storage.buckets(id,name,public) values ('task-attachments','task-attachments',f) on conflict do nothing;
create policy chat_attachments_owner_delete on storage.objects for DELETE to authenticated using (((bucket_id = 'chat-attachments'::text) AND ((storage.foldername(name))[1] = (auth.uid())::text))) ;
create policy chat_attachments_owner_insert on storage.objects for INSERT to authenticated using (true) with check (((bucket_id = 'chat-attachments'::text) AND ((storage.foldername(name))[1] = (auth.uid())::text)));
create policy chat_attachments_owner_select on storage.objects for SELECT to authenticated using (((bucket_id = 'chat-attachments'::text) AND ((storage.foldername(name))[1] = (auth.uid())::text))) ;
create policy chat_attachments_owner_update on storage.objects for UPDATE to authenticated using (((bucket_id = 'chat-attachments'::text) AND ((storage.foldername(name))[1] = (auth.uid())::text))) with check (((bucket_id = 'chat-attachments'::text) AND ((storage.foldername(name))[1] = (auth.uid())::text)));
create policy "task-attachments delete" on storage.objects for DELETE to authenticated using (((bucket_id = 'task-attachments'::text) AND ((owner = auth.uid()) OR has_role(auth.uid(), 'admin'::app_role)))) ;
create policy "task-attachments insert" on storage.objects for INSERT to authenticated using (true) with check (((bucket_id = 'task-attachments'::text) AND (owner = auth.uid()) AND (has_role(auth.uid(), 'admin'::app_role) OR (EXISTS ( SELECT 1
   FROM tasks t
  WHERE (((t.id)::text = split_part(objects.name, '/'::text, 1)) AND (t.user_id = auth.uid())))))));
create policy "task-attachments read" on storage.objects for SELECT to authenticated using (((bucket_id = 'task-attachments'::text) AND (has_role(auth.uid(), 'admin'::app_role) OR (owner = auth.uid()) OR (EXISTS ( SELECT 1
   FROM tasks t
  WHERE (((t.id)::text = split_part(objects.name, '/'::text, 1)) AND (t.user_id = auth.uid()))))))) ;
