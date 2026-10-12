--
-- PostgreSQL database dump
--

\restrict Zsidg60VLiIOV3M8skwipKSsGlNrrcLvVF7QYQScY9X2kGXgU5FR9aaRIjdityl

-- Dumped from database version 17.6
-- Dumped by pg_dump version 17.9

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'SQL_ASCII';
SET standard_conforming_strings = off;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET escape_string_warning = off;
SET row_security = off;

--
-- Name: public; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA public;


--
-- Name: SCHEMA public; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON SCHEMA public IS 'standard public schema';


--
-- Name: app_role; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.app_role AS ENUM (
    'admin',
    'employee'
);


--
-- Name: approval_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.approval_status AS ENUM (
    'Not Required',
    'Pending',
    'Approved',
    'Rejected'
);


--
-- Name: employee_type; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.employee_type AS ENUM (
    'Developer',
    'Graphic Designer',
    'Digital Marketer',
    'Video Editor',
    'Content Writer',
    'SEO Executive',
    'Sales',
    'Other'
);


--
-- Name: project_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.project_status AS ENUM (
    'Active',
    'On Hold',
    'Completed'
);


--
-- Name: recurrence_cadence; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.recurrence_cadence AS ENUM (
    'daily',
    'weekly',
    'monthly'
);


--
-- Name: task_priority; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.task_priority AS ENUM (
    'Low',
    'Medium',
    'High',
    'Urgent'
);


--
-- Name: task_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.task_status AS ENUM (
    'Not Started',
    'In Progress',
    'Finished'
);


--
-- Name: get_client_report_by_token(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_client_report_by_token(_token text) RETURNS json
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public'
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


--
-- Name: get_team_activity(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_team_activity() RETURNS json
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
DECLARE
    today_text text := to_char(now(), 'YYYY-MM-DD');
BEGIN
    RETURN (
        SELECT COALESCE(json_agg(
            json_build_object(
                'user_id', p.user_id,
                'name', p.name,
                'role', COALESCE(p.employee_type::text, 'Other'),
                'is_active', COALESCE(p.is_active, true),
                'current_task_title', active_task.title,
                'task_description', active_task.description,
                'task_status', active_task.status,
                'todo_tasks', COALESCE(daily_tasks.todo_list, '[]'::json),
                'progress_tasks', COALESCE(daily_tasks.progress_list, '[]'::json),
                'completed_tasks', COALESCE(daily_tasks.completed_list, '[]'::json)
            )
        ), '[]'::json)
        FROM profiles p
        
        -- Active Task
        LEFT JOIN LATERAL (
            SELECT t.id, t.title, t.description, t.status 
            FROM tasks t
            JOIN time_sessions ts ON ts.task_id = t.id 
            WHERE t.user_id = p.user_id AND ts.end_time IS NULL 
            ORDER BY ts.start_time DESC 
            LIMIT 1
        ) active_task ON true
        
        -- Daily Summary
        LEFT JOIN LATERAL (
            SELECT 
                json_agg(json_build_object('title', t.title)) 
                    FILTER (WHERE t.status::text NOT IN ('In Progress', 'Finished')) as todo_list,
                
                json_agg(json_build_object('title', t.title)) 
                    FILTER (WHERE t.status::text = 'In Progress' AND (active_task.id IS NULL OR t.id != active_task.id)) as progress_list,
                
                json_agg(json_build_object('title', t.title)) 
                    FILTER (WHERE t.status::text = 'Finished') as completed_list
            FROM tasks t
            WHERE t.user_id = p.user_id 
              AND t.date::text = today_text
        ) daily_tasks ON true
    );
END;
$$;


--
-- Name: handle_new_user(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.handle_new_user() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  INSERT INTO public.profiles (user_id, name, employee_type)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'name', NEW.email),
    COALESCE((NEW.raw_user_meta_data->>'employee_type')::employee_type, 'Other')
  );
  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, COALESCE((NEW.raw_user_meta_data->>'role')::app_role, 'employee'));
  RETURN NEW;
END;
$$;


--
-- Name: has_role(uuid, public.app_role); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.has_role(_user_id uuid, _role public.app_role) RETURNS boolean
    LANGUAGE sql STABLE
    SET search_path TO 'public'
    AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  )
$$;


--
-- Name: is_active_user(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.is_active_user() RETURNS boolean
    LANGUAGE sql STABLE
    SET search_path TO 'public'
    AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE user_id = auth.uid() AND is_active = true
  )
$$;


--
-- Name: is_admin(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.is_admin() RETURNS boolean
    LANGUAGE sql STABLE
    SET search_path TO 'public'
    AS $$
  SELECT public.has_role(auth.uid(), 'admin')
$$;


--
-- Name: materialize_due_recurring_tasks(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.materialize_due_recurring_tasks() RETURNS integer
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
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


--
-- Name: messages_restrict_receiver_update(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.messages_restrict_receiver_update() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public'
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


--
-- Name: messages_restrict_sender_update(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.messages_restrict_sender_update() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public'
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


--
-- Name: profiles_prevent_self_privilege_escalation(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.profiles_prevent_self_privilege_escalation() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  IF auth.uid() = OLD.user_id AND NOT public.has_role(auth.uid(), 'admin') THEN
    IF NEW.employee_type IS DISTINCT FROM OLD.employee_type
       OR NEW.is_active   IS DISTINCT FROM OLD.is_active
       OR NEW.user_id     IS DISTINCT FROM OLD.user_id THEN
      RAISE EXCEPTION 'You cannot modify privileged profile fields';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;


--
-- Name: update_updated_at_column(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_updated_at_column() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: clients; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.clients (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    company text,
    contact_email text,
    contact_phone text,
    hourly_rate numeric(10,2),
    notes text,
    is_active boolean DEFAULT true NOT NULL,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: messages; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.messages (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    sender_id uuid NOT NULL,
    receiver_id uuid,
    content text NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    is_edited boolean DEFAULT false,
    is_deleted boolean DEFAULT false,
    attachment_url text,
    attachment_type text,
    attachment_name text,
    is_read boolean DEFAULT false
);


--
-- Name: notifications; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.notifications (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    kind text NOT NULL,
    title text NOT NULL,
    body text,
    link_url text,
    is_read boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: profiles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.profiles (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    name text NOT NULL,
    employee_type public.employee_type DEFAULT 'Other'::public.employee_type NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: projects; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.projects (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    client_id uuid NOT NULL,
    name text NOT NULL,
    description text,
    status public.project_status DEFAULT 'Active'::public.project_status NOT NULL,
    deadline date,
    budget_hours numeric(10,2),
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: recurring_task_templates; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.recurring_task_templates (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    title text NOT NULL,
    description text,
    category text DEFAULT 'Other'::text NOT NULL,
    assignee_id uuid,
    client_id uuid,
    project_id uuid,
    priority public.task_priority DEFAULT 'Medium'::public.task_priority NOT NULL,
    target_minutes integer,
    is_billable boolean DEFAULT false NOT NULL,
    cadence public.recurrence_cadence NOT NULL,
    next_run_at date NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: report_share_links; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.report_share_links (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    client_id uuid NOT NULL,
    token text NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    date_from date,
    date_to date,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: task_attachments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.task_attachments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    task_id uuid NOT NULL,
    uploaded_by uuid NOT NULL,
    file_path text NOT NULL,
    file_name text NOT NULL,
    file_size bigint,
    content_type text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: task_comments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.task_comments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    task_id uuid NOT NULL,
    user_id uuid NOT NULL,
    content text NOT NULL,
    mentions uuid[] DEFAULT '{}'::uuid[] NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: tasks; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tasks (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    title text NOT NULL,
    description text DEFAULT ''::text,
    category text DEFAULT 'Other'::text NOT NULL,
    date date DEFAULT CURRENT_DATE NOT NULL,
    status public.task_status DEFAULT 'Not Started'::public.task_status NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    target_minutes integer,
    completion_notes text,
    project_link text,
    client_id uuid,
    project_id uuid,
    priority public.task_priority DEFAULT 'Medium'::public.task_priority NOT NULL,
    due_date date,
    is_billable boolean DEFAULT false NOT NULL,
    hourly_rate_override numeric(10,2),
    approval_status public.approval_status DEFAULT 'Not Required'::public.approval_status NOT NULL,
    approved_by uuid,
    approved_at timestamp with time zone,
    rejection_reason text,
    recurring_template_id uuid
);


--
-- Name: time_sessions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.time_sessions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    task_id uuid NOT NULL,
    start_time bigint NOT NULL,
    end_time bigint,
    created_by uuid DEFAULT auth.uid() NOT NULL
);


--
-- Name: user_roles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_roles (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    role public.app_role DEFAULT 'employee'::public.app_role NOT NULL
);


--
-- Name: clients clients_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clients
    ADD CONSTRAINT clients_pkey PRIMARY KEY (id);


--
-- Name: messages messages_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.messages
    ADD CONSTRAINT messages_pkey PRIMARY KEY (id);


--
-- Name: notifications notifications_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notifications
    ADD CONSTRAINT notifications_pkey PRIMARY KEY (id);


--
-- Name: profiles profiles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_pkey PRIMARY KEY (id);


--
-- Name: profiles profiles_user_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_user_id_key UNIQUE (user_id);


--
-- Name: projects projects_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.projects
    ADD CONSTRAINT projects_pkey PRIMARY KEY (id);


--
-- Name: recurring_task_templates recurring_task_templates_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.recurring_task_templates
    ADD CONSTRAINT recurring_task_templates_pkey PRIMARY KEY (id);


--
-- Name: report_share_links report_share_links_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.report_share_links
    ADD CONSTRAINT report_share_links_pkey PRIMARY KEY (id);


--
-- Name: report_share_links report_share_links_token_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.report_share_links
    ADD CONSTRAINT report_share_links_token_key UNIQUE (token);


--
-- Name: task_attachments task_attachments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.task_attachments
    ADD CONSTRAINT task_attachments_pkey PRIMARY KEY (id);


--
-- Name: task_comments task_comments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.task_comments
    ADD CONSTRAINT task_comments_pkey PRIMARY KEY (id);


--
-- Name: tasks tasks_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tasks
    ADD CONSTRAINT tasks_pkey PRIMARY KEY (id);


--
-- Name: time_sessions time_sessions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.time_sessions
    ADD CONSTRAINT time_sessions_pkey PRIMARY KEY (id);


--
-- Name: user_roles user_roles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_roles
    ADD CONSTRAINT user_roles_pkey PRIMARY KEY (id);


--
-- Name: user_roles user_roles_user_id_role_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_roles
    ADD CONSTRAINT user_roles_user_id_role_key UNIQUE (user_id, role);


--
-- Name: idx_messages_unread; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_messages_unread ON public.messages USING btree (receiver_id, is_read);


--
-- Name: idx_notifications_user_unread; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_notifications_user_unread ON public.notifications USING btree (user_id, is_read, created_at DESC);


--
-- Name: idx_projects_client_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_projects_client_id ON public.projects USING btree (client_id);


--
-- Name: idx_recurring_next_run; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_recurring_next_run ON public.recurring_task_templates USING btree (next_run_at) WHERE (is_active = true);


--
-- Name: idx_task_attachments_task; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_task_attachments_task ON public.task_attachments USING btree (task_id, created_at DESC);


--
-- Name: idx_task_comments_task; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_task_comments_task ON public.task_comments USING btree (task_id, created_at DESC);


--
-- Name: idx_tasks_approval_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_tasks_approval_status ON public.tasks USING btree (approval_status);


--
-- Name: idx_tasks_client_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_tasks_client_id ON public.tasks USING btree (client_id);


--
-- Name: idx_tasks_due_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_tasks_due_date ON public.tasks USING btree (due_date);


--
-- Name: idx_tasks_project_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_tasks_project_id ON public.tasks USING btree (project_id);


--
-- Name: clients clients_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER clients_updated_at BEFORE UPDATE ON public.clients FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: messages messages_restrict_receiver_update_trg; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER messages_restrict_receiver_update_trg BEFORE UPDATE ON public.messages FOR EACH ROW EXECUTE FUNCTION public.messages_restrict_receiver_update();


--
-- Name: messages messages_restrict_sender_update_trg; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER messages_restrict_sender_update_trg BEFORE UPDATE ON public.messages FOR EACH ROW EXECUTE FUNCTION public.messages_restrict_sender_update();


--
-- Name: profiles profiles_prevent_self_privilege_escalation; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER profiles_prevent_self_privilege_escalation BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.profiles_prevent_self_privilege_escalation();


--
-- Name: projects projects_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER projects_updated_at BEFORE UPDATE ON public.projects FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: recurring_task_templates recurring_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER recurring_updated_at BEFORE UPDATE ON public.recurring_task_templates FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: task_comments task_comments_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER task_comments_updated_at BEFORE UPDATE ON public.task_comments FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: messages trg_messages_restrict_sender_update; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_messages_restrict_sender_update BEFORE UPDATE ON public.messages FOR EACH ROW EXECUTE FUNCTION public.messages_restrict_sender_update();


--
-- Name: profiles update_profiles_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_profiles_updated_at BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: tasks update_tasks_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_tasks_updated_at BEFORE UPDATE ON public.tasks FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: clients clients_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clients
    ADD CONSTRAINT clients_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: messages messages_receiver_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.messages
    ADD CONSTRAINT messages_receiver_id_fkey FOREIGN KEY (receiver_id) REFERENCES auth.users(id);


--
-- Name: messages messages_receiver_id_fkey_profiles; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.messages
    ADD CONSTRAINT messages_receiver_id_fkey_profiles FOREIGN KEY (receiver_id) REFERENCES public.profiles(user_id);


--
-- Name: messages messages_sender_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.messages
    ADD CONSTRAINT messages_sender_id_fkey FOREIGN KEY (sender_id) REFERENCES auth.users(id);


--
-- Name: messages messages_sender_id_fkey_profiles; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.messages
    ADD CONSTRAINT messages_sender_id_fkey_profiles FOREIGN KEY (sender_id) REFERENCES public.profiles(user_id);


--
-- Name: notifications notifications_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notifications
    ADD CONSTRAINT notifications_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: profiles profiles_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: projects projects_client_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.projects
    ADD CONSTRAINT projects_client_id_fkey FOREIGN KEY (client_id) REFERENCES public.clients(id) ON DELETE CASCADE;


--
-- Name: projects projects_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.projects
    ADD CONSTRAINT projects_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: recurring_task_templates recurring_task_templates_assignee_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.recurring_task_templates
    ADD CONSTRAINT recurring_task_templates_assignee_id_fkey FOREIGN KEY (assignee_id) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: recurring_task_templates recurring_task_templates_client_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.recurring_task_templates
    ADD CONSTRAINT recurring_task_templates_client_id_fkey FOREIGN KEY (client_id) REFERENCES public.clients(id) ON DELETE SET NULL;


--
-- Name: recurring_task_templates recurring_task_templates_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.recurring_task_templates
    ADD CONSTRAINT recurring_task_templates_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: recurring_task_templates recurring_task_templates_project_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.recurring_task_templates
    ADD CONSTRAINT recurring_task_templates_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE SET NULL;


--
-- Name: report_share_links report_share_links_client_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.report_share_links
    ADD CONSTRAINT report_share_links_client_id_fkey FOREIGN KEY (client_id) REFERENCES public.clients(id) ON DELETE CASCADE;


--
-- Name: report_share_links report_share_links_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.report_share_links
    ADD CONSTRAINT report_share_links_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: task_attachments task_attachments_task_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.task_attachments
    ADD CONSTRAINT task_attachments_task_id_fkey FOREIGN KEY (task_id) REFERENCES public.tasks(id) ON DELETE CASCADE;


--
-- Name: task_attachments task_attachments_uploaded_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.task_attachments
    ADD CONSTRAINT task_attachments_uploaded_by_fkey FOREIGN KEY (uploaded_by) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: task_comments task_comments_task_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.task_comments
    ADD CONSTRAINT task_comments_task_id_fkey FOREIGN KEY (task_id) REFERENCES public.tasks(id) ON DELETE CASCADE;


--
-- Name: task_comments task_comments_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.task_comments
    ADD CONSTRAINT task_comments_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: tasks tasks_approved_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tasks
    ADD CONSTRAINT tasks_approved_by_fkey FOREIGN KEY (approved_by) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: tasks tasks_client_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tasks
    ADD CONSTRAINT tasks_client_id_fkey FOREIGN KEY (client_id) REFERENCES public.clients(id) ON DELETE SET NULL;


--
-- Name: tasks tasks_project_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tasks
    ADD CONSTRAINT tasks_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE SET NULL;


--
-- Name: tasks tasks_recurring_template_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tasks
    ADD CONSTRAINT tasks_recurring_template_id_fkey FOREIGN KEY (recurring_template_id) REFERENCES public.recurring_task_templates(id) ON DELETE SET NULL;


--
-- Name: tasks tasks_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tasks
    ADD CONSTRAINT tasks_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: time_sessions time_sessions_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.time_sessions
    ADD CONSTRAINT time_sessions_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id);


--
-- Name: time_sessions time_sessions_task_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.time_sessions
    ADD CONSTRAINT time_sessions_task_id_fkey FOREIGN KEY (task_id) REFERENCES public.tasks(id) ON DELETE CASCADE;


--
-- Name: user_roles user_roles_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_roles
    ADD CONSTRAINT user_roles_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: profiles Admins can insert profiles; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can insert profiles" ON public.profiles FOR INSERT TO authenticated WITH CHECK (public.is_admin());


--
-- Name: tasks Admins can manage all tasks; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can manage all tasks" ON public.tasks TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());


--
-- Name: time_sessions Admins can manage all time sessions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can manage all time sessions" ON public.time_sessions TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());


--
-- Name: user_roles Admins can manage roles; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can manage roles" ON public.user_roles TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());


--
-- Name: profiles Admins can update all profiles; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can update all profiles" ON public.profiles FOR UPDATE TO authenticated USING (public.is_admin());


--
-- Name: profiles Admins can view all profiles; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can view all profiles" ON public.profiles FOR SELECT TO authenticated USING (public.is_admin());


--
-- Name: user_roles Admins can view all roles; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can view all roles" ON public.user_roles FOR SELECT TO authenticated USING (public.is_admin());


--
-- Name: tasks Admins can view all tasks; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can view all tasks" ON public.tasks FOR SELECT TO authenticated USING (public.is_admin());


--
-- Name: time_sessions Admins can view all time sessions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can view all time sessions" ON public.time_sessions FOR SELECT TO authenticated USING (public.is_admin());


--
-- Name: clients Admins manage clients; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins manage clients" ON public.clients TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role)) WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: projects Admins manage projects; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins manage projects" ON public.projects TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role)) WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: recurring_task_templates Admins manage recurring templates; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins manage recurring templates" ON public.recurring_task_templates TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role)) WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: report_share_links Admins manage share links; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins manage share links" ON public.report_share_links TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role)) WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: task_comments Delete own task comments; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Delete own task comments" ON public.task_comments FOR DELETE TO authenticated USING (((user_id = auth.uid()) OR public.has_role(auth.uid(), 'admin'::public.app_role)));


--
-- Name: task_attachments Delete task attachments; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Delete task attachments" ON public.task_attachments FOR DELETE TO authenticated USING (((uploaded_by = auth.uid()) OR public.has_role(auth.uid(), 'admin'::public.app_role)));


--
-- Name: tasks Employees can manage own tasks; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Employees can manage own tasks" ON public.tasks TO authenticated USING (((user_id = auth.uid()) AND public.is_active_user())) WITH CHECK (((user_id = auth.uid()) AND public.is_active_user()));


--
-- Name: profiles Enable read access for all users; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Enable read access for all users" ON public.profiles FOR SELECT USING ((auth.role() = 'authenticated'::text));


--
-- Name: messages Enable update for receivers to mark as read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Enable update for receivers to mark as read" ON public.messages FOR UPDATE USING ((auth.uid() = receiver_id)) WITH CHECK ((auth.uid() = receiver_id));


--
-- Name: messages Insert Access; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Insert Access" ON public.messages FOR INSERT TO authenticated WITH CHECK ((auth.uid() = sender_id));


--
-- Name: task_comments Insert own task comments; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Insert own task comments" ON public.task_comments FOR INSERT TO authenticated WITH CHECK (((user_id = auth.uid()) AND (public.has_role(auth.uid(), 'admin'::public.app_role) OR (EXISTS ( SELECT 1
   FROM public.tasks t
  WHERE ((t.id = task_comments.task_id) AND (t.user_id = auth.uid())))))));


--
-- Name: task_attachments Insert task attachments; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Insert task attachments" ON public.task_attachments FOR INSERT TO authenticated WITH CHECK (((uploaded_by = auth.uid()) AND (public.has_role(auth.uid(), 'admin'::public.app_role) OR (EXISTS ( SELECT 1
   FROM public.tasks t
  WHERE ((t.id = task_attachments.task_id) AND (t.user_id = auth.uid())))))));


--
-- Name: profiles Profiles are viewable by everyone; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Profiles are viewable by everyone" ON public.profiles FOR SELECT TO authenticated USING (true);


--
-- Name: profiles Public profiles are viewable by everyone.; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Public profiles are viewable by everyone." ON public.profiles FOR SELECT TO authenticated USING (true);


--
-- Name: messages Send 1:1 Messages; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Send 1:1 Messages" ON public.messages FOR INSERT WITH CHECK (((sender_id = auth.uid()) AND (receiver_id IS NOT NULL)));


--
-- Name: messages Send Group Messages; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Send Group Messages" ON public.messages FOR INSERT WITH CHECK (((receiver_id IS NULL) AND (sender_id = auth.uid())));


--
-- Name: messages Senders can soft-delete own messages; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Senders can soft-delete own messages" ON public.messages FOR UPDATE TO authenticated USING ((auth.uid() = sender_id)) WITH CHECK ((auth.uid() = sender_id));


--
-- Name: clients Team views assigned clients; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Team views assigned clients" ON public.clients FOR SELECT TO authenticated USING ((public.has_role(auth.uid(), 'admin'::public.app_role) OR (EXISTS ( SELECT 1
   FROM public.tasks t
  WHERE ((t.client_id = clients.id) AND (t.user_id = auth.uid()))))));


--
-- Name: projects Team views assigned projects; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Team views assigned projects" ON public.projects FOR SELECT TO authenticated USING ((public.has_role(auth.uid(), 'admin'::public.app_role) OR (EXISTS ( SELECT 1
   FROM public.tasks t
  WHERE ((t.project_id = projects.id) AND (t.user_id = auth.uid()))))));


--
-- Name: task_comments Update own task comments; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Update own task comments" ON public.task_comments FOR UPDATE TO authenticated USING ((user_id = auth.uid())) WITH CHECK ((user_id = auth.uid()));


--
-- Name: time_sessions Users can manage own time sessions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can manage own time sessions" ON public.time_sessions TO authenticated USING (((created_by = auth.uid()) AND public.is_active_user())) WITH CHECK (((created_by = auth.uid()) AND public.is_active_user()));


--
-- Name: profiles Users can update own profile; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update own profile" ON public.profiles FOR UPDATE TO authenticated USING ((user_id = auth.uid())) WITH CHECK ((user_id = auth.uid()));


--
-- Name: profiles Users can view own profile; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view own profile" ON public.profiles FOR SELECT TO authenticated USING ((user_id = auth.uid()));


--
-- Name: user_roles Users can view own roles; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view own roles" ON public.user_roles FOR SELECT TO authenticated USING ((user_id = auth.uid()));


--
-- Name: notifications Users delete own notifications; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users delete own notifications" ON public.notifications FOR DELETE TO authenticated USING ((user_id = auth.uid()));


--
-- Name: notifications Users insert notifications for self or as admin; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users insert notifications for self or as admin" ON public.notifications FOR INSERT TO authenticated WITH CHECK (((user_id = auth.uid()) OR public.has_role(auth.uid(), 'admin'::public.app_role)));


--
-- Name: notifications Users update own notifications; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users update own notifications" ON public.notifications FOR UPDATE TO authenticated USING ((user_id = auth.uid())) WITH CHECK ((user_id = auth.uid()));


--
-- Name: notifications Users view own notifications; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users view own notifications" ON public.notifications FOR SELECT TO authenticated USING ((user_id = auth.uid()));


--
-- Name: messages View Group Messages; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "View Group Messages" ON public.messages FOR SELECT TO authenticated USING (((receiver_id IS NULL) AND public.is_active_user()));


--
-- Name: messages View Own Messages; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "View Own Messages" ON public.messages FOR SELECT TO authenticated USING (((auth.uid() = sender_id) OR (auth.uid() = receiver_id)));


--
-- Name: task_attachments View task attachments; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "View task attachments" ON public.task_attachments FOR SELECT TO authenticated USING ((public.has_role(auth.uid(), 'admin'::public.app_role) OR (uploaded_by = auth.uid()) OR (EXISTS ( SELECT 1
   FROM public.tasks t
  WHERE ((t.id = task_attachments.task_id) AND (t.user_id = auth.uid()))))));


--
-- Name: task_comments View task comments; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "View task comments" ON public.task_comments FOR SELECT TO authenticated USING ((public.has_role(auth.uid(), 'admin'::public.app_role) OR (EXISTS ( SELECT 1
   FROM public.tasks t
  WHERE ((t.id = task_comments.task_id) AND (t.user_id = auth.uid())))) OR (user_id = auth.uid())));


--
-- Name: clients; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.clients ENABLE ROW LEVEL SECURITY;

--
-- Name: messages; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;

--
-- Name: notifications; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

--
-- Name: profiles; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

--
-- Name: projects; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;

--
-- Name: recurring_task_templates; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.recurring_task_templates ENABLE ROW LEVEL SECURITY;

--
-- Name: report_share_links; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.report_share_links ENABLE ROW LEVEL SECURITY;

--
-- Name: task_attachments; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.task_attachments ENABLE ROW LEVEL SECURITY;

--
-- Name: task_comments; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.task_comments ENABLE ROW LEVEL SECURITY;

--
-- Name: tasks; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;

--
-- Name: time_sessions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.time_sessions ENABLE ROW LEVEL SECURITY;

--
-- Name: user_roles; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

--
-- PostgreSQL database dump complete
--

\unrestrict Zsidg60VLiIOV3M8skwipKSsGlNrrcLvVF7QYQScY9X2kGXgU5FR9aaRIjdityl

