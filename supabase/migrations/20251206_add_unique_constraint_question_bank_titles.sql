-- Migration: add UNIQUE constraint on question_bank_titles.title
-- This migration will:
-- 1. Find duplicate titles (if any).
-- 2. Keep the earliest id for each duplicate title and delete the others.
-- 3. Add a UNIQUE constraint on the `title` column.

BEGIN;

-- 1) Preview duplicates (run this separately if you want to inspect before applying)
-- SELECT title, COUNT(*) FROM public.question_bank_titles GROUP BY title HAVING COUNT(*) > 1;

-- 2) Remove duplicate rows, keeping the lexicographically smallest id for each title
WITH duplicates AS (
  SELECT title, array_agg(id ORDER BY id) AS ids, min(id::text)::uuid AS keep_id
  FROM public.question_bank_titles
  GROUP BY title
  HAVING COUNT(*) > 1
), to_delete AS (
  SELECT unnest(ids) AS id, keep_id, title FROM duplicates
)
DELETE FROM public.question_bank_titles q
USING to_delete d
WHERE q.id = d.id AND q.id <> d.keep_id;

-- 3) Add unique constraint on title
ALTER TABLE IF EXISTS public.question_bank_titles
  ADD CONSTRAINT question_bank_titles_title_key UNIQUE (title);

COMMIT;
