-- Add a column to store Excel-style comma-separated CO numbers (e.g., '1,2,3,4,5')
ALTER TABLE public.question_bank
ADD COLUMN IF NOT EXISTS course_outcomes_numbers TEXT;
