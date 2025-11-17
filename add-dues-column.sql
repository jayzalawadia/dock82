-- Add dues column to users table
ALTER TABLE public.users
ADD COLUMN IF NOT EXISTS dues NUMERIC(10, 2) DEFAULT NULL;

-- Add a comment to the column
COMMENT ON COLUMN public.users.dues IS 'Outstanding dues amount for homeowners (in dollars)';

-- Create an index for faster queries on homeowners with dues
CREATE INDEX IF NOT EXISTS idx_users_dues ON public.users(dues) WHERE dues IS NOT NULL AND dues > 0;

