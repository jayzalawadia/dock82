-- Fix notifications table constraint issue
-- This SQL should be run in your Supabase SQL Editor

-- First, let's check the current foreign key constraints
-- SELECT conname, conrelid::regclass, confrelid::regclass, confdeltype
-- FROM pg_constraint
-- WHERE confrelid = 'users'::regclass AND conrelid = 'notifications'::regclass;

-- Option 1: Change the foreign key to use CASCADE instead of SET NULL
-- This will delete notifications when the user is deleted
ALTER TABLE notifications 
DROP CONSTRAINT IF EXISTS notifications_created_by_fkey;

ALTER TABLE notifications 
ADD CONSTRAINT notifications_created_by_fkey 
FOREIGN KEY (created_by) 
REFERENCES users(id) 
ON DELETE CASCADE;

-- Option 2: If you want to keep notifications but assign them to a system user
-- First create a system user (if it doesn't exist)
-- INSERT INTO users (id, name, email, password_hash, user_type) 
-- VALUES ('00000000-0000-0000-0000-000000000000', 'System', 'system@dock82.com', '', 'admin')
-- ON CONFLICT (id) DO NOTHING;

-- Then update the foreign key to set to this system user instead of null
-- ALTER TABLE notifications 
-- DROP CONSTRAINT IF EXISTS notifications_created_by_fkey;
-- 
-- ALTER TABLE notifications 
-- ADD CONSTRAINT notifications_created_by_fkey 
-- FOREIGN KEY (created_by) 
-- REFERENCES users(id) 
-- ON DELETE SET DEFAULT;

-- ALTER TABLE notifications 
-- ALTER COLUMN created_by SET DEFAULT '00000000-0000-0000-0000-000000000000';

-- Clean up any existing notifications with null created_by
-- (This will fail if there are notifications with null created_by and the constraint is still NOT NULL)
-- DELETE FROM notifications WHERE created_by IS NULL;

-- Verify the constraint
-- SELECT conname, conrelid::regclass, confrelid::regclass, confdeltype
-- FROM pg_constraint
-- WHERE confrelid = 'users'::regclass AND conrelid = 'notifications'::regclass;

