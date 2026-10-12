
CREATE TYPE public.recurrence_cadence AS ENUM ('daily', 'weekly', 'monthly');

-- Comments
CREATE TABLE public.task_comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  mentions UUID[] NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.task_comments TO authenticated;
GRANT ALL ON public.task_comments TO service_role;
ALTER TABLE public.task_comments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "View task comments" ON public.task_comments FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin')
    OR EXISTS (SELECT 1 FROM public.tasks t WHERE t.id = task_comments.task_id AND t.user_id = auth.uid())
    OR user_id = auth.uid()
  );
CREATE POLICY "Insert own task comments" ON public.task_comments FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND (
      public.has_role(auth.uid(), 'admin')
      OR EXISTS (SELECT 1 FROM public.tasks t WHERE t.id = task_id AND t.user_id = auth.uid())
    )
  );
CREATE POLICY "Update own task comments" ON public.task_comments FOR UPDATE TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "Delete own task comments" ON public.task_comments FOR DELETE TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER task_comments_updated_at BEFORE UPDATE ON public.task_comments
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Attachments
CREATE TABLE public.task_attachments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  uploaded_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  file_path TEXT NOT NULL,
  file_name TEXT NOT NULL,
  file_size BIGINT,
  content_type TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.task_attachments TO authenticated;
GRANT ALL ON public.task_attachments TO service_role;
ALTER TABLE public.task_attachments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "View task attachments" ON public.task_attachments FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin')
    OR uploaded_by = auth.uid()
    OR EXISTS (SELECT 1 FROM public.tasks t WHERE t.id = task_attachments.task_id AND t.user_id = auth.uid())
  );
CREATE POLICY "Insert task attachments" ON public.task_attachments FOR INSERT TO authenticated
  WITH CHECK (
    uploaded_by = auth.uid()
    AND (
      public.has_role(auth.uid(), 'admin')
      OR EXISTS (SELECT 1 FROM public.tasks t WHERE t.id = task_id AND t.user_id = auth.uid())
    )
  );
CREATE POLICY "Delete task attachments" ON public.task_attachments FOR DELETE TO authenticated
  USING (uploaded_by = auth.uid() OR public.has_role(auth.uid(), 'admin'));

-- Recurring templates
CREATE TABLE public.recurring_task_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  description TEXT,
  category TEXT NOT NULL DEFAULT 'Other',
  assignee_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  client_id UUID REFERENCES public.clients(id) ON DELETE SET NULL,
  project_id UUID REFERENCES public.projects(id) ON DELETE SET NULL,
  priority public.task_priority NOT NULL DEFAULT 'Medium',
  target_minutes INTEGER,
  is_billable BOOLEAN NOT NULL DEFAULT false,
  cadence public.recurrence_cadence NOT NULL,
  next_run_at DATE NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.recurring_task_templates TO authenticated;
GRANT ALL ON public.recurring_task_templates TO service_role;
ALTER TABLE public.recurring_task_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage recurring templates" ON public.recurring_task_templates
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER recurring_updated_at BEFORE UPDATE ON public.recurring_task_templates
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.tasks ADD COLUMN recurring_template_id UUID REFERENCES public.recurring_task_templates(id) ON DELETE SET NULL;

-- Report share links
CREATE TABLE public.report_share_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  token TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  date_from DATE,
  date_to DATE,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.report_share_links TO authenticated;
GRANT ALL ON public.report_share_links TO service_role;
ALTER TABLE public.report_share_links ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage share links" ON public.report_share_links
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Notifications
CREATE TABLE public.notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT,
  link_url TEXT,
  is_read BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.notifications TO authenticated;
GRANT ALL ON public.notifications TO service_role;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own notifications" ON public.notifications FOR SELECT TO authenticated
  USING (user_id = auth.uid());
CREATE POLICY "Users update own notifications" ON public.notifications FOR UPDATE TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "Users delete own notifications" ON public.notifications FOR DELETE TO authenticated
  USING (user_id = auth.uid());
CREATE POLICY "System inserts notifications for any user" ON public.notifications FOR INSERT TO authenticated
  WITH CHECK (true);

CREATE INDEX idx_notifications_user_unread ON public.notifications(user_id, is_read, created_at DESC);
CREATE INDEX idx_task_comments_task ON public.task_comments(task_id, created_at DESC);
CREATE INDEX idx_task_attachments_task ON public.task_attachments(task_id, created_at DESC);
CREATE INDEX idx_recurring_next_run ON public.recurring_task_templates(next_run_at) WHERE is_active = true;

-- Public report RPC (SECURITY DEFINER, token-gated)
CREATE OR REPLACE FUNCTION public.get_client_report_by_token(_token TEXT)
RETURNS JSON
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  link RECORD;
  result JSON;
BEGIN
  SELECT * INTO link FROM public.report_share_links WHERE token = _token AND expires_at > now();
  IF link IS NULL THEN
    RETURN json_build_object('error', 'Invalid or expired link');
  END IF;

  SELECT json_build_object(
    'client', (SELECT json_build_object('id', id, 'name', name, 'company', company) FROM public.clients WHERE id = link.client_id),
    'date_from', link.date_from,
    'date_to', link.date_to,
    'tasks', COALESCE((
      SELECT json_agg(json_build_object(
        'id', t.id,
        'title', t.title,
        'status', t.status,
        'category', t.category,
        'date', t.date,
        'project_link', t.project_link,
        'completion_notes', t.completion_notes,
        'assigned_to', (SELECT name FROM public.profiles WHERE user_id = t.user_id),
        'total_minutes', COALESCE((
          SELECT SUM(EXTRACT(EPOCH FROM (to_timestamp(ts.end_time/1000.0) - to_timestamp(ts.start_time/1000.0)))/60)::INTEGER
          FROM public.time_sessions ts WHERE ts.task_id = t.id AND ts.end_time IS NOT NULL
        ), 0)
      ) ORDER BY t.date DESC)
      FROM public.tasks t
      WHERE t.client_id = link.client_id
        AND (link.date_from IS NULL OR t.date >= link.date_from)
        AND (link.date_to IS NULL OR t.date <= link.date_to)
    ), '[]'::json)
  ) INTO result;

  RETURN result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_client_report_by_token(TEXT) TO anon, authenticated;

-- Recurring materializer
CREATE OR REPLACE FUNCTION public.materialize_due_recurring_tasks()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  tpl RECORD;
  count_created INTEGER := 0;
  next_date DATE;
BEGIN
  FOR tpl IN
    SELECT * FROM public.recurring_task_templates
    WHERE is_active = true AND next_run_at <= CURRENT_DATE AND assignee_id IS NOT NULL
  LOOP
    INSERT INTO public.tasks (user_id, title, description, category, date, target_minutes,
      client_id, project_id, priority, is_billable, recurring_template_id, status)
    VALUES (tpl.assignee_id, tpl.title, tpl.description, tpl.category, tpl.next_run_at, tpl.target_minutes,
      tpl.client_id, tpl.project_id, tpl.priority, tpl.is_billable, tpl.id, 'Not Started');

    next_date := CASE tpl.cadence
      WHEN 'daily' THEN tpl.next_run_at + INTERVAL '1 day'
      WHEN 'weekly' THEN tpl.next_run_at + INTERVAL '7 days'
      WHEN 'monthly' THEN tpl.next_run_at + INTERVAL '1 month'
    END;

    UPDATE public.recurring_task_templates SET next_run_at = next_date WHERE id = tpl.id;
    count_created := count_created + 1;
  END LOOP;
  RETURN count_created;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.materialize_due_recurring_tasks() FROM PUBLIC, anon, authenticated;
