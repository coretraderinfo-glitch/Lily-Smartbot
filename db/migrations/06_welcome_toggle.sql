-- 💎 LILY HARDENING: WELCOME TOGGLE
-- Adding a dedicated toggle for the 'FIGHTER' Welcome greetings.

DO $$ 
BEGIN 
    BEGIN
        ALTER TABLE group_settings ADD COLUMN welcome_enabled BOOLEAN DEFAULT TRUE;
    EXCEPTION
        WHEN duplicate_column THEN NULL;
    END;
END $$;
