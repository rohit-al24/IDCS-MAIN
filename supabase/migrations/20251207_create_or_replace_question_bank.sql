-- Migration: create or replace question_bank table and supporting objects

-- Create the question_bank table (id, metadata, linkage to question_bank_titles)
CREATE TABLE IF NOT EXISTS public.question_bank (
  id uuid not null default gen_random_uuid(),
  question_text text not null,
  answer_text text not null,
  subject text null,
  difficulty text null,
  created_at timestamp with time zone null default timezone('utc'::text, now()),
  updated_at timestamp with time zone null default timezone('utc'::text, now()),
  source_file_path text null,
  title text null,
  options jsonb null,
  correct_answer text null,
  btl integer null,
  status text null,
  chapter text null,
  course_outcomes text null,
  type text null,
  user_id uuid null,
  marks integer null,
  title_id uuid null,
  image_url text null,
  excel_type text null,
  course_outcomes_numbers text null,
  course_code text null,
  course_name text null,
  semester text null,
  constraint question_bank_pkey primary key (id),
  constraint question_bank_title_id_fkey foreign key (title_id) references question_bank_titles (id)
) TABLESPACE pg_default;

-- Index for excel_type
create index IF not exists question_bank_excel_type_idx on public.question_bank using btree (excel_type) TABLESPACE pg_default;

-- Create a function to prevent title_id changes if it doesn't exist
-- This function will prevent updates that attempt to change title_id once set.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'prevent_title_id_change') THEN
    CREATE FUNCTION public.prevent_title_id_change()
    RETURNS trigger
    LANGUAGE plpgsql
    AS $$
    BEGIN
      IF TG_OP = 'UPDATE' THEN
        IF OLD.title_id IS NOT NULL AND NEW.title_id IS DISTINCT FROM OLD.title_id THEN
          RAISE EXCEPTION 'Changing title_id is not allowed';
        END IF;
      END IF;
      RETURN NEW;
    END;
    $$;
  END IF;
END$$;

-- Create trigger to call the function before update
DROP TRIGGER IF EXISTS trg_prevent_title_id_change ON public.question_bank;
CREATE TRIGGER trg_prevent_title_id_change
  BEFORE UPDATE ON public.question_bank
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_title_id_change();

-- Ensure updated_at is maintained via trigger (optional helper)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'question_bank_set_updated_at') THEN
    CREATE FUNCTION public.question_bank_set_updated_at()
    RETURNS trigger
    LANGUAGE plpgsql
    AS $$
    BEGIN
      NEW.updated_at := timezone('utc', now());
      RETURN NEW;
    END;
    $$;
  END IF;
END$$;

DROP TRIGGER IF EXISTS trg_question_bank_set_updated_at ON public.question_bank;
CREATE TRIGGER trg_question_bank_set_updated_at
  BEFORE INSERT OR UPDATE ON public.question_bank
  FOR EACH ROW
  EXECUTE FUNCTION public.question_bank_set_updated_at();

-- End of migration
