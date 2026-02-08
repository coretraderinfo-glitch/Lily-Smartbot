-- 💎 LILY GUARDIAN: SENTINEL REGISTRY
-- This table stores the Supervisors/Admins for each group for the Sentinel feature.

CREATE TABLE IF NOT EXISTS group_admins (
    group_id BIGINT NOT NULL,
    user_id BIGINT NOT NULL,
    username TEXT,
    added_at TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (group_id, user_id)
);
