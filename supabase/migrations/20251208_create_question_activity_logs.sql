-- Migration: create question_activity_logs table
-- Date: 2025-12-08

-- Create pgcrypto extension if not present (for gen_random_uuid)
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Create the logs table
CREATE TABLE IF NOT EXISTS public.question_activity_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid,
  action text NOT NULL,
  question_id uuid,
  title_id uuid,
  details jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Helpful indexes for queries
CREATE INDEX IF NOT EXISTS idx_question_activity_logs_created_at ON public.question_activity_logs (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_question_activity_logs_question_id ON public.question_activity_logs (question_id);

-- Optional Row Level Security (RLS) examples
-- Uncomment and adapt these if you want RLS enabled for this table.
-- Note: enabling RLS requires creating appropriate policies for insert/select as needed.

-- Enable RLS (optional)
-- ALTER TABLE public.question_activity_logs ENABLE ROW LEVEL SECURITY;

-- Allow inserts by authenticated users (example)
-- CREATE POLICY "Allow insert for authenticated" ON public.question_activity_logs
--   FOR INSERT
--   USING (auth.role() = 'authenticated')
--   WITH CHECK (auth.role() = 'authenticated');

-- Allow selects by authenticated users (example)
-- CREATE POLICY "Allow select for authenticated" ON public.question_activity_logs
--   FOR SELECT
--   USING (auth.role() = 'authenticated');

-- Example test insert (run from SQL editor or via the client with an authenticated user):
-- INSERT INTO public.question_activity_logs (user_id, action, question_id, title_id, details)
-- VALUES ('00000000-0000-0000-0000-000000000000', 'verify', '00000000-0000-0000-0000-000000000000', '00000000-0000-0000-0000-000000000000', '{"changes": {"status": {"before": "pending", "after": "verified"}}}');

-- End of migration
