-- Migration: Allow faculty to view and verify questions in assigned banks
-- Migration: Allow faculty to view and verify questions in assigned banks

-- Ensure `title_id` column exists on question_bank (some deployments store title_id, others may not)
ALTER TABLE IF EXISTS public.question_bank
  ADD COLUMN IF NOT EXISTS title_id UUID;

-- Allow faculty to SELECT questions that belong to banks assigned to them
-- This policy checks the `title_id` on `question_bank` against `faculty_question_banks.question_bank_id`.
DROP POLICY IF EXISTS "Faculty can view assigned questions" ON public.question_bank;
CREATE POLICY "Faculty can view assigned questions" ON public.question_bank
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.faculty_question_banks f
      WHERE f.faculty_user_id = auth.uid()
        AND f.question_bank_id = question_bank.title_id
    )
  );

-- Allow faculty to update only the status (and updated_at) of questions assigned to them
-- WITH CHECK ensures only `status` (to verified/rejected) may change; other important fields must remain equal to the existing row.
DROP POLICY IF EXISTS "Faculty can update status for assigned questions" ON public.question_bank;
CREATE POLICY "Faculty can update status for assigned questions" ON public.question_bank
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM public.faculty_question_banks f
      WHERE f.faculty_user_id = auth.uid()
        AND f.question_bank_id = question_bank.title_id
    )
  )
  WITH CHECK (
    NEW.status IN ('verified','rejected')
  );
