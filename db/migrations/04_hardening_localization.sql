-- 💎 LILY HARDENING: LOCALIZATION & INTEGRITY
-- Mission: Ensuring group settings are bulletproof and language is never NULL.

-- 1. ENFORCE NOT NULL & DEFAULTS
DO $$ 
BEGIN 
    -- group_settings table
    BEGIN
        ALTER TABLE group_settings ALTER COLUMN language_mode SET DEFAULT 'CN';
        UPDATE group_settings SET language_mode = 'CN' WHERE language_mode IS NULL;
        ALTER TABLE group_settings ALTER COLUMN language_mode SET NOT NULL;
    EXCEPTION
        WHEN undefined_column THEN NULL;
    END;

    -- groups table (Sync fallback)
    BEGIN
        ALTER TABLE groups ALTER COLUMN language_mode SET DEFAULT 'CN';
        UPDATE groups SET language_mode = 'CN' WHERE language_mode IS NULL;
        ALTER TABLE groups ALTER COLUMN language_mode SET NOT NULL;
    EXCEPTION
        WHEN undefined_column THEN NULL;
    END;
END $$;
