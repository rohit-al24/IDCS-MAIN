-- Migration: create faculty_question_banks table
CREATE TABLE IF NOT EXISTS public.faculty_question_banks (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  faculty_user_id uuid NOT NULL,
  question_bank_id uuid NOT NULL,
  assigned_at timestamp with time zone NULL DEFAULT now(),
  CONSTRAINT faculty_question_banks_pkey PRIMARY KEY (id),
  CONSTRAINT faculty_question_banks_faculty_user_id_question_bank_id_key UNIQUE (faculty_user_id, question_bank_id),
  CONSTRAINT faculty_question_banks_faculty_user_id_fkey FOREIGN KEY (faculty_user_id) REFERENCES user_roles (user_id) ON DELETE CASCADE,
  CONSTRAINT faculty_question_banks_question_bank_id_fkey FOREIGN KEY (question_bank_id) REFERENCES question_bank_titles (id) ON DELETE CASCADE
) TABLESPACE pg_default;
