-- Create daily_standups table
CREATE TABLE IF NOT EXISTS public.daily_standups (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL,
    date text NOT NULL,
    completed_today text NOT NULL DEFAULT '',
    blockers text DEFAULT '',
    tomorrow_plan text DEFAULT '',
    mood text DEFAULT 'good',
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT daily_standups_user_id_date_key UNIQUE (user_id, date)
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_daily_standups_date ON public.daily_standups (date);
CREATE INDEX IF NOT EXISTS idx_daily_standups_user_id ON public.daily_standups (user_id);

-- Enable RLS
ALTER TABLE public.daily_standups ENABLE ROW LEVEL SECURITY;

-- Policies
CREATE POLICY "Authenticated users can view daily standups"
ON public.daily_standups
FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "Users can insert own daily standup"
ON public.daily_standups
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own daily standup"
ON public.daily_standups
FOR UPDATE
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);
