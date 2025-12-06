-- Migration: Assign question banks to faculty
CREATE TABLE IF NOT EXISTS faculty_question_banks (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  faculty_user_id UUID NOT NULL REFERENCES user_roles(user_id) ON DELETE CASCADE,
  question_bank_id UUID NOT NULL REFERENCES question_bank_titles(id) ON DELETE CASCADE,
  assigned_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  UNIQUE(faculty_user_id, question_bank_id)
);

-- Policy: Faculty can read their own assignments
CREATE POLICY "Faculty can read own assigned banks" ON faculty_question_banks
  FOR SELECT USING (auth.uid() = faculty_user_id);

CREATE POLICY "Admin can assign banks" ON faculty_question_banks
  FOR INSERT WITH CHECK (EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role = 'admin'));
