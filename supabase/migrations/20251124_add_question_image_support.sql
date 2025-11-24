-- SQL for storing question images in Supabase Storage and linking in the DB
-- Assumes you have a 'question_bank' table and a Supabase Storage bucket (e.g., 'question-images')

-- 1. Add an image_url column to question_bank to store the image path/reference
ALTER TABLE question_bank
ADD COLUMN image_url TEXT;

-- 2. (Optional) If you want to track image metadata, create a separate table
CREATE TABLE IF NOT EXISTS question_images (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    question_id UUID REFERENCES question_bank(id) ON DELETE CASCADE,
    image_url TEXT NOT NULL, -- path in the storage bucket
    uploaded_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    alt_text TEXT
);

-- 3. Example: When uploading, store the image in the bucket (via Supabase Storage API),
-- then save the image_url (e.g., 'question-images/filename.png') in question_bank.image_url
-- or insert a row in question_images with the storage path.

-- 4. To fetch questions with images:
-- SELECT * FROM question_bank WHERE image_url IS NOT NULL;
-- or join with question_images for more metadata.
