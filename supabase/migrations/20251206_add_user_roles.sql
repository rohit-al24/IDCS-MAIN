-- Create user_roles table for role-based access control
CREATE TABLE IF NOT EXISTS user_roles (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('admin', 'faculty')),
  full_name TEXT,
  email TEXT,
  college_id UUID REFERENCES college(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

ALTER TABLE user_roles ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns WHERE table_name='user_roles' AND column_name='full_name'
  ) THEN
    ALTER TABLE user_roles ADD COLUMN full_name TEXT;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns WHERE table_name='user_roles' AND column_name='email'
  ) THEN
    ALTER TABLE user_roles ADD COLUMN email TEXT;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns WHERE table_name='user_roles' AND column_name='college_id'
  ) THEN
    ALTER TABLE user_roles ADD COLUMN college_id UUID REFERENCES college(id) ON DELETE SET NULL;
  END IF;
END$$;

-- Policy: Users can read their own role
CREATE POLICY "Users can read own role" ON user_roles
  FOR SELECT USING (auth.uid() = user_id);

-- Policy: Only authenticated users can read their own role data
CREATE POLICY "Authenticated users can read own role" ON user_roles
  FOR SELECT USING (auth.uid() IS NOT NULL);

-- Grant access to authenticated users
GRANT ALL ON user_roles TO authenticated;

-- Create an index for faster lookups
CREATE INDEX idx_user_roles_user_id ON user_roles(user_id);
CREATE INDEX idx_user_roles_role ON user_roles(role);
