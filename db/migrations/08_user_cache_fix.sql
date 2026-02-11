-- 💎 LILY RECOVERY: USER CACHE INTEGRITY
-- Mission: Fix the unique constraint on user_cache to support ON CONFLICT updates by user_id.

-- 1. Ensure user_id is unique per group
-- Note: We drop the old PK if it was only on (group_id, username)
DO $$ 
BEGIN 
    -- Check if the constraint already exists
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'user_cache_group_user_unique'
    ) THEN
        ALTER TABLE user_cache ADD CONSTRAINT user_cache_group_user_unique UNIQUE (group_id, user_id);
    END IF;
END $$;
