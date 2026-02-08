-- 💎 LILY ENTERPRISE: DATABASE EVOLUTION (STEP 2)
-- Mission: Adding the "Hidden Pipes" for the Ghost Portal.
-- SAFETY: This script only ADDS columns. It does not delete or change existing data.
-- Your current bot will ignore these new columns and continue running 100% stable.

-- 1. EXTEND GROUPS TABLE (The Identity & Status Boxes)
ALTER TABLE groups 
ADD COLUMN IF NOT EXISTS creator_id BIGINT,             -- Anti-Hopping: ID of the person who invited Lily
ADD COLUMN IF NOT EXISTS tier TEXT DEFAULT 'TRIAL',     -- TRIAL / STANDARD / PREMIUM
ADD COLUMN IF NOT EXISTS robin_lock BOOLEAN DEFAULT FALSE, -- Master switch to freeze operations
ADD COLUMN IF NOT EXISTS trial_started_at TIMESTAMPTZ,  -- Countdown for 48h trial
ADD COLUMN IF NOT EXISTS language_mode TEXT DEFAULT 'CN',-- Global slogan/report language
ADD COLUMN IF NOT EXISTS timezone_str TEXT DEFAULT 'Asia/Shanghai'; -- Independent timezone

-- 2. EXTEND GROUP_SETTINGS TABLE (The Feature Toggles)
ALTER TABLE group_settings
ADD COLUMN IF NOT EXISTS ai_brain_enabled BOOLEAN DEFAULT FALSE; -- Toggle for Gemini AI

-- 3. CREATE TRIAL REGISTRY (The "Anti-Hopping" Database)
-- This table tracks every User ID that has ever used a trial across ALL groups.
CREATE TABLE IF NOT EXISTS user_trial_registry (
    user_id BIGINT PRIMARY KEY,
    first_trial_at TIMESTAMPTZ DEFAULT NOW(),
    first_group_id BIGINT
);

-- 4. CREATE SYSTEM_OWNER_SESSIONS (The "Magic Link" Security)
-- This stores the secure tokens used for the Backend Portal login.
CREATE TABLE IF NOT EXISTS boss_sessions (
    id SERIAL PRIMARY KEY,
    token TEXT UNIQUE NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    is_used BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
