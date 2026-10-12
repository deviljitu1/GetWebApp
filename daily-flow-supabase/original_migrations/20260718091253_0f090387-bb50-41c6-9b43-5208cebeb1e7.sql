
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
