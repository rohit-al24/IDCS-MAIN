-- Create enum types for question handling
CREATE TYPE question_type AS ENUM ('objective', 'mcq', 'descriptive');
CREATE TYPE difficulty_level AS ENUM ('easy', 'medium', 'hard');
CREATE TYPE question_status AS ENUM ('pending', 'verified', 'rejected');

-- Question Bank table
CREATE TABLE question_bank (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  question_text TEXT NOT NULL,
  type question_type NOT NULL,
  options JSONB,
  correct_answer TEXT,
  difficulty difficulty_level NOT NULL DEFAULT 'medium',
  marks INTEGER NOT NULL DEFAULT 1,
  unit TEXT,
  topic TEXT,
  chapter TEXT,
  status question_status NOT NULL DEFAULT 'pending',
  user_id UUID NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Templates table
CREATE TABLE templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  sections JSONB NOT NULL,
  total_marks INTEGER NOT NULL,
  instructions TEXT,
  header_info JSONB,
  user_id UUID NOT NULL,
  is_default BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Generated Papers table
CREATE TABLE generated_papers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id UUID REFERENCES templates(id),
  questions JSONB NOT NULL,
  answer_key JSONB NOT NULL,
  version TEXT,
  user_id UUID NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS
ALTER TABLE question_bank ENABLE ROW LEVEL SECURITY;
ALTER TABLE templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE generated_papers ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view their own questions" ON question_bank
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own questions" ON question_bank
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own questions" ON question_bank
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own questions" ON question_bank
  FOR DELETE USING (auth.uid() = user_id);

CREATE POLICY "Users can view their own templates" ON templates
  FOR SELECT USING (auth.uid() = user_id OR is_default = true);

CREATE POLICY "Users can insert their own templates" ON templates
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own templates" ON templates
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can view their own papers" ON generated_papers
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own papers" ON generated_papers
  FOR INSERT WITH CHECK (auth.uid() = user_id);