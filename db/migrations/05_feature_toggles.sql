-- 💎 LILY PRODUCTION READY: FEATURE COLUMNS
-- Adding Guardian and AI Brain toggles to group_settings

DO $$ 
BEGIN 
    BEGIN
        ALTER TABLE group_settings ADD COLUMN guardian_enabled BOOLEAN DEFAULT FALSE;
    EXCEPTION
        WHEN duplicate_column THEN NULL;
    END;

    BEGIN
        ALTER TABLE group_settings ADD COLUMN ai_brain_enabled BOOLEAN DEFAULT FALSE;
    EXCEPTION
        WHEN duplicate_column THEN NULL;
    END;
END $$;
