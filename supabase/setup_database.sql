-- ==========================================
-- COMPLETE SUPABASE DATABASE SETUP SCRIPT
-- Run this once in your Supabase SQL Editor
-- ==========================================

-- ----------------------------------------
-- Migration: 20260210100437_6215b44c-c98a-4323-8393-25872630b967.sql
-- ----------------------------------------

-- Employee type enum
CREATE TYPE public.employee_type AS ENUM (
  'Developer', 'Graphic Designer', 'Digital Marketer', 'Video Editor',
  'Content Writer', 'SEO Executive', 'Sales', 'Other'
);

-- App role enum
CREATE TYPE public.app_role AS ENUM ('admin', 'employee');

-- Task status enum
CREATE TYPE public.task_status AS ENUM ('Not Started', 'In Progress', 'Finished');

-- Profiles table
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL UNIQUE,
  name TEXT NOT NULL,
  employee_type employee_type NOT NULL DEFAULT 'Other',
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- User roles table
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  role app_role NOT NULL DEFAULT 'employee',
  UNIQUE (user_id, role)
);

-- Tasks table
CREATE TABLE public.tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  title TEXT NOT NULL,
  description TEXT DEFAULT '',
  category TEXT NOT NULL DEFAULT 'Other',
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  status task_status NOT NULL DEFAULT 'Not Started',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Time sessions table
CREATE TABLE public.time_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID REFERENCES public.tasks(id) ON DELETE CASCADE NOT NULL,
  start_time BIGINT NOT NULL,
  end_time BIGINT
);

-- Enable RLS on all tables
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.time_sessions ENABLE ROW LEVEL SECURITY;

-- Helper function: check if user has a specific role (SECURITY DEFINER to avoid RLS recursion)
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  )
$$;

-- Helper function: check if current user is admin
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.has_role(auth.uid(), 'admin')
$$;

-- Helper function: check if user is active (SECURITY DEFINER to avoid recursion)
CREATE OR REPLACE FUNCTION public.is_active_user()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE user_id = auth.uid() AND is_active = true
  )
$$;

-- Updated_at trigger function
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER update_profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_tasks_updated_at
  BEFORE UPDATE ON public.tasks
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Auto-create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
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

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ============ RLS POLICIES ============

-- PROFILES policies
CREATE POLICY "Users can view own profile" ON public.profiles
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Admins can view all profiles" ON public.profiles
  FOR SELECT TO authenticated
  USING (public.is_admin());

CREATE POLICY "Users can update own profile" ON public.profiles
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Admins can update all profiles" ON public.profiles
  FOR UPDATE TO authenticated
  USING (public.is_admin());

CREATE POLICY "Admins can insert profiles" ON public.profiles
  FOR INSERT TO authenticated
  WITH CHECK (public.is_admin());

-- USER_ROLES policies
CREATE POLICY "Users can view own roles" ON public.user_roles
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Admins can view all roles" ON public.user_roles
  FOR SELECT TO authenticated
  USING (public.is_admin());

CREATE POLICY "Admins can manage roles" ON public.user_roles
  FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- TASKS policies
CREATE POLICY "Employees can manage own tasks" ON public.tasks
  FOR ALL TO authenticated
  USING (user_id = auth.uid() AND public.is_active_user())
  WITH CHECK (user_id = auth.uid() AND public.is_active_user());

CREATE POLICY "Admins can view all tasks" ON public.tasks
  FOR SELECT TO authenticated
  USING (public.is_admin());

-- TIME_SESSIONS policies
CREATE POLICY "Users can manage own time sessions" ON public.time_sessions
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.tasks
      WHERE tasks.id = time_sessions.task_id
      AND tasks.user_id = auth.uid()
    )
    AND public.is_active_user()
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.tasks
      WHERE tasks.id = time_sessions.task_id
      AND tasks.user_id = auth.uid()
    )
    AND public.is_active_user()
  );

CREATE POLICY "Admins can view all time sessions" ON public.time_sessions
  FOR SELECT TO authenticated
  USING (public.is_admin());

-- ADDED POLICIES FOR ADMIN MANAGEMENT

CREATE POLICY "Admins can manage all tasks" ON public.tasks
  FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- Ensure this policy doesn't conflict or duplicate "Admins can view all tasks"
-- Actually "Admins can view all tasks" is FOR SELECT. "FOR ALL" covers SELECT, INSERT, UPDATE, DELETE.
-- We can drop the SELECT only one if we want, or just add this overlapping one. Postgres allows multiple policies (OR logic).
-- However, "FOR ALL" includes SELECT.

-- Policy for Admins to manage time sessions (e.g. stop timers for employees)
CREATE POLICY "Admins can manage all time sessions" ON public.time_sessions
  FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());


-- ----------------------------------------
-- Migration: 20260623060341_c6496926-56b0-4ad8-b63d-bd6dd734ff05.sql
-- ----------------------------------------
DROP TABLE IF EXISTS public.result;

-- ----------------------------------------
-- Migration: 20260623060708_50a7c245-dd54-467d-8a8c-734140a1eb19.sql
-- ----------------------------------------

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


-- ----------------------------------------
-- Migration: 20260623060721_5b41585d-3913-4233-ac61-a765a3480c26.sql
-- ----------------------------------------
DROP EXTENSION IF EXISTS pg_graphql CASCADE;

-- ----------------------------------------
-- Migration: 20260624101257_37c5a3e4-b8c2-4777-945c-708fa1fb0692.sql
-- ----------------------------------------

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


-- ----------------------------------------
-- Migration: 20260624101307_4b8883f4-7485-4e99-8179-d0a31ef916d2.sql
-- ----------------------------------------

REVOKE EXECUTE ON FUNCTION public.messages_restrict_sender_update() FROM PUBLIC, anon, authenticated;


-- ----------------------------------------
-- Migration: 20260624101610_d0a05b0b-c049-4c04-976c-c2060688cb57.sql
-- ----------------------------------------
GRANT EXECUTE ON FUNCTION public.is_active_user() TO authenticated, anon;

-- ----------------------------------------
-- Migration: 20260625132120_9866f038-b6f0-4c11-8e69-9d72538995cd.sql
-- ----------------------------------------

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


-- ----------------------------------------
-- Migration: 20260625132453_cdded676-d2d7-4bd4-a397-64e948447f7c.sql
-- ----------------------------------------

GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_active_user() TO authenticated;


-- ----------------------------------------
-- Migration: 20260702091944_61bfb5cc-25bd-4308-b724-0b21838d244b.sql
-- ----------------------------------------

-- 1) Prevent privilege escalation via profile self-update
CREATE OR REPLACE FUNCTION public.profiles_prevent_self_privilege_escalation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
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

REVOKE EXECUTE ON FUNCTION public.profiles_prevent_self_privilege_escalation() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS profiles_prevent_self_privilege_escalation ON public.profiles;
CREATE TRIGGER profiles_prevent_self_privilege_escalation
BEFORE UPDATE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.profiles_prevent_self_privilege_escalation();

-- 2) Remove redundant/duplicate SELECT policies on messages
DROP POLICY IF EXISTS "View 1:1 Messages" ON public.messages;

-- 3) Switch admin-check helper functions to SECURITY INVOKER so signed-in users
--    cannot invoke elevated definer-owned code paths.
ALTER FUNCTION public.has_role(uuid, app_role) SECURITY INVOKER;
ALTER FUNCTION public.is_admin() SECURITY INVOKER;

-- Ensure authenticated role can still read user_roles for the check
GRANT EXECUTE ON FUNCTION public.has_role(uuid, app_role) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated;

-- Lock down trigger-only definer functions (not user-callable)
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.messages_restrict_sender_update() FROM PUBLIC, anon, authenticated;


-- ----------------------------------------
-- Migration: 20260702111802_fix_message_updates.sql
-- ----------------------------------------
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


-- ----------------------------------------
-- Migration: 20260703150434_2c84cc85-8943-48eb-b979-061ae8af35b2.sql
-- ----------------------------------------
ALTER TABLE public.tasks ADD COLUMN IF NOT EXISTS completion_notes text, ADD COLUMN IF NOT EXISTS project_link text;

-- ----------------------------------------
-- Migration: 20260717033256_c57eefdf-afc0-4bab-8dff-af4b6e9ef352.sql
-- ----------------------------------------

DROP POLICY IF EXISTS "Public chat attachments read" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can upload chat attachments" ON storage.objects;
DROP POLICY IF EXISTS "Users can update their own chat attachments" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete their own chat attachments" ON storage.objects;


-- ----------------------------------------
-- Migration: 20260718091253_0f090387-bb50-41c6-9b43-5208cebeb1e7.sql
-- ----------------------------------------

CREATE TYPE public.project_status AS ENUM ('Active', 'On Hold', 'Completed');
CREATE TYPE public.task_priority AS ENUM ('Low', 'Medium', 'High', 'Urgent');
CREATE TYPE public.approval_status AS ENUM ('Not Required', 'Pending', 'Approved', 'Rejected');

-- Clients
CREATE TABLE public.clients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  company TEXT,
  contact_email TEXT,
  contact_phone TEXT,
  hourly_rate NUMERIC(10,2),
  notes TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.clients TO authenticated;
GRANT ALL ON public.clients TO service_role;
ALTER TABLE public.clients ENABLE ROW LEVEL SECURITY;

-- Projects
CREATE TABLE public.projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  status public.project_status NOT NULL DEFAULT 'Active',
  deadline DATE,
  budget_hours NUMERIC(10,2),
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.projects TO authenticated;
GRANT ALL ON public.projects TO service_role;
ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;

-- Extend tasks FIRST so policies can reference the new columns
ALTER TABLE public.tasks
  ADD COLUMN client_id UUID REFERENCES public.clients(id) ON DELETE SET NULL,
  ADD COLUMN project_id UUID REFERENCES public.projects(id) ON DELETE SET NULL,
  ADD COLUMN priority public.task_priority NOT NULL DEFAULT 'Medium',
  ADD COLUMN due_date DATE,
  ADD COLUMN is_billable BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN hourly_rate_override NUMERIC(10,2),
  ADD COLUMN approval_status public.approval_status NOT NULL DEFAULT 'Not Required',
  ADD COLUMN approved_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN approved_at TIMESTAMPTZ,
  ADD COLUMN rejection_reason TEXT;

CREATE INDEX idx_tasks_client_id ON public.tasks(client_id);
CREATE INDEX idx_tasks_project_id ON public.tasks(project_id);
CREATE INDEX idx_tasks_approval_status ON public.tasks(approval_status);
CREATE INDEX idx_tasks_due_date ON public.tasks(due_date);
CREATE INDEX idx_projects_client_id ON public.projects(client_id);

-- Policies (after columns exist)
CREATE POLICY "Admins manage clients" ON public.clients
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Team views assigned clients" ON public.clients
  FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin')
    OR EXISTS (SELECT 1 FROM public.tasks t WHERE t.client_id = clients.id AND t.user_id = auth.uid())
  );

CREATE POLICY "Admins manage projects" ON public.projects
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Team views assigned projects" ON public.projects
  FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin')
    OR EXISTS (SELECT 1 FROM public.tasks t WHERE t.project_id = projects.id AND t.user_id = auth.uid())
  );

CREATE TRIGGER clients_updated_at BEFORE UPDATE ON public.clients
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER projects_updated_at BEFORE UPDATE ON public.projects
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


-- ----------------------------------------
-- Migration: 20260718091355_7ac31283-e3a8-4e2f-9e81-38dd9458129f.sql
-- ----------------------------------------

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


-- ----------------------------------------
-- Migration: 20260718091413_4721071e-5659-47e3-a8e4-0629c78117c2.sql
-- ----------------------------------------

DROP POLICY IF EXISTS "System inserts notifications for any user" ON public.notifications;
CREATE POLICY "Users insert notifications for self or as admin" ON public.notifications FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));


-- ----------------------------------------
-- Migration: 20260718091424_e4e41b12-594a-4e78-a6e5-6a03b73e9624.sql
-- ----------------------------------------

REVOKE EXECUTE ON FUNCTION public.get_client_report_by_token(TEXT) FROM PUBLIC, anon, authenticated;


-- ----------------------------------------
-- Migration: 20260718091444_fe3d6d4d-ccde-4b50-a436-b4de71f9a8b4.sql
-- ----------------------------------------

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

-- Ensure storage buckets exist
INSERT INTO storage.buckets (id, name, public) VALUES ('task-attachments', 'task-attachments', false) ON CONFLICT (id) DO NOTHING;
INSERT INTO storage.buckets (id, name, public) VALUES ('chat-attachments', 'chat-attachments', true) ON CONFLICT (id) DO NOTHING;
