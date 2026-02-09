-- 💎 LILY FIX: LANGUAGE COLUMN LOCATION
-- This migration ensures language_mode exists in group_settings where the code expects it.
-- We also keep it in groups just in case, but group_settings is the primary source for the UI.

DO $$ 
BEGIN 
    BEGIN
        ALTER TABLE group_settings ADD COLUMN language_mode TEXT DEFAULT 'CN';
    EXCEPTION
        WHEN duplicate_column THEN NULL;
    END;
END $$;
