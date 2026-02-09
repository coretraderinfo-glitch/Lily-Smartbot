-- Force Default to FALSE (Quiet Mode)
ALTER TABLE group_settings ALTER COLUMN welcome_enabled SET DEFAULT FALSE;

-- Reset existing groups to QUIET (As requested by SIR)
-- They will only be enabled if explicitly turned ON later
UPDATE group_settings SET welcome_enabled = FALSE WHERE welcome_enabled IS TRUE;
