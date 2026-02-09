-- Lily Bot Schema V1 (Final Phase 2)

-- 1. Tenants (Groups)
CREATE TABLE IF NOT EXISTS groups (
    id BIGINT PRIMARY KEY, -- Telegram Chat ID
    title VARCHAR(255),
    status VARCHAR(50) DEFAULT 'ACTIVE', -- ACTIVE, EXPIRED, UNLICENSED
    current_state VARCHAR(20) DEFAULT 'WAITING_FOR_START', -- WAITING_FOR_START, RECORDING, ENDED
    timezone VARCHAR(50) DEFAULT 'Asia/Shanghai',
    currency_symbol VARCHAR(10) DEFAULT 'CNY',
    license_key VARCHAR(50), 
    license_expiry TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- MIGRATION PATCHES (Idempotent)
-- Ensure 'groups' table has new columns even if it already existed
DO $$ 
BEGIN 
    BEGIN
        ALTER TABLE groups ADD COLUMN status VARCHAR(50) DEFAULT 'ACTIVE';
    EXCEPTION
        WHEN duplicate_column THEN NULL;
    END;
    BEGIN
        ALTER TABLE groups ADD COLUMN license_key VARCHAR(50);
    EXCEPTION
        WHEN duplicate_column THEN NULL;
    END;
    BEGIN
        ALTER TABLE groups ADD COLUMN license_expiry TIMESTAMPTZ;
    EXCEPTION
        WHEN duplicate_column THEN NULL;
    END;
    BEGIN
        ALTER TABLE groups ADD COLUMN reset_hour INT DEFAULT 4;
    EXCEPTION
        WHEN duplicate_column THEN NULL;
    END;
    BEGIN
        ALTER TABLE groups ADD COLUMN last_auto_reset TIMESTAMPTZ;
    EXCEPTION
        WHEN duplicate_column THEN NULL;
    END;
    BEGIN
        ALTER TABLE groups ADD COLUMN system_url VARCHAR(255);
    EXCEPTION
        WHEN duplicate_column THEN NULL;
    END;
END $$;

-- 2. Configuration (Settings)
CREATE TABLE IF NOT EXISTS group_settings (
    group_id BIGINT PRIMARY KEY REFERENCES groups(id),
    
    -- Financial Config
    rate_in DECIMAL(10, 4) DEFAULT 0,      -- Deposit Fee %
    rate_out DECIMAL(10, 4) DEFAULT 0,     -- Payout Fee %
    
    -- Currency Rates (Manual)
    rate_usd DECIMAL(10, 4) DEFAULT 0,
    rate_myr DECIMAL(10, 4) DEFAULT 0,
    rate_php DECIMAL(10, 4) DEFAULT 0,
    rate_thb DECIMAL(10, 4) DEFAULT 0,
    
    -- Display Config
    display_mode INT DEFAULT 1,            -- 1=Full, 2=Top3, etc.
    show_decimals BOOLEAN DEFAULT TRUE,
    language_mode VARCHAR(10) DEFAULT 'CN' NOT NULL,
    
    -- Feature Config
    guardian_enabled BOOLEAN DEFAULT FALSE,
    ai_brain_enabled BOOLEAN DEFAULT FALSE,
    welcome_enabled BOOLEAN DEFAULT TRUE,
    
    -- Logic Config
    daily_reset_hour INT DEFAULT 4,        -- Default 4 AM
    
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Ensure 'group_settings' has forex columns and new config columns
DO $$ 
BEGIN 
    BEGIN
        ALTER TABLE group_settings ADD COLUMN rate_usd DECIMAL(10, 4) DEFAULT 0;
    EXCEPTION
        WHEN duplicate_column THEN NULL;
    END;
    BEGIN
        ALTER TABLE group_settings ADD COLUMN rate_myr DECIMAL(10, 4) DEFAULT 0;
    EXCEPTION
        WHEN duplicate_column THEN NULL;
    END;
    BEGIN
        ALTER TABLE group_settings ADD COLUMN rate_php DECIMAL(10, 4) DEFAULT 0;
    EXCEPTION
        WHEN duplicate_column THEN NULL;
    END;
    BEGIN
        ALTER TABLE group_settings ADD COLUMN rate_thb DECIMAL(10, 4) DEFAULT 0;
    EXCEPTION
        WHEN duplicate_column THEN NULL;
    END;
    BEGIN
        ALTER TABLE group_settings ADD COLUMN language_mode VARCHAR(10) DEFAULT 'CN' NOT NULL;
    EXCEPTION
        WHEN duplicate_column THEN NULL;
    END;
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

-- 3. Access Control (Operators)
CREATE TABLE IF NOT EXISTS group_operators (
    group_id BIGINT REFERENCES groups(id),
    user_id BIGINT,                        -- Telegram User ID
    username VARCHAR(255),                 -- Cached username
    role VARCHAR(20) CHECK (role IN ('OWNER', 'ADMIN', 'OPERATOR')),
    added_by BIGINT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (group_id, user_id)
);

-- Admin Sentinel (Guardian)
CREATE TABLE IF NOT EXISTS group_admins (
    id SERIAL PRIMARY KEY,
    group_id BIGINT REFERENCES groups(id),
    user_id BIGINT,
    username VARCHAR(255),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(group_id, user_id)
);

-- 4. The Ledger (Transactions)
CREATE TABLE IF NOT EXISTS transactions (
    id VARCHAR(50) PRIMARY KEY,            -- UUID or KSUID
    group_id BIGINT REFERENCES groups(id),
    
    -- Who & When
    operator_id BIGINT,
    operator_name VARCHAR(100),            -- Cached for speed
    recorded_at TIMESTAMPTZ DEFAULT NOW(),
    business_date DATE,                    -- The "Accounting Day"
    
    -- The Money
    type VARCHAR(20) CHECK (type IN ('DEPOSIT', 'PAYOUT', 'RETURN')),
    amount_raw DECIMAL(18, 4),
    fee_rate DECIMAL(10, 4),
    fee_amount DECIMAL(18, 4),
    net_amount DECIMAL(18, 4),
    
    -- Context
    currency VARCHAR(10) DEFAULT 'CNY',
    original_text TEXT,
    is_voided BOOLEAN DEFAULT FALSE,
    related_transaction_id VARCHAR(50)
);

-- 5. Audit
CREATE TABLE IF NOT EXISTS audit_logs (
    id SERIAL PRIMARY KEY,
    group_id BIGINT,
    user_id BIGINT,
    action VARCHAR(50),
    details JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 6. The Vault (Licenses)
CREATE TABLE IF NOT EXISTS licenses (
    key VARCHAR(50) PRIMARY KEY,
    duration_days INT NOT NULL,
    max_users INT DEFAULT 100,
    is_used BOOLEAN DEFAULT FALSE,
    used_by_group_id BIGINT REFERENCES groups(id),
    activated_at TIMESTAMPTZ,
    expires_at TIMESTAMPTZ,
    created_by BIGINT, -- Admin ID
    created_at TIMESTAMPTZ DEFAULT NOW()
);
-- 7. The Archive
CREATE TABLE IF NOT EXISTS historical_archives (
    id SERIAL PRIMARY KEY,
    group_id BIGINT REFERENCES groups(id),
    business_date DATE,
    type VARCHAR(50), 
    data_json JSONB, 
    pdf_blob BYTEA, 
    archived_at TIMESTAMPTZ DEFAULT NOW()
);

-- 8. User Cache
CREATE TABLE IF NOT EXISTS user_cache (
    group_id BIGINT,
    user_id BIGINT,
    username VARCHAR(100),
    last_seen TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (group_id, username)
);

-- Indices
CREATE INDEX IF NOT EXISTS idx_ledger_day ON transactions (group_id, business_date, recorded_at DESC);
CREATE INDEX IF NOT EXISTS idx_ledger_balances ON transactions (group_id, business_date, currency);
CREATE INDEX IF NOT EXISTS idx_archive_lookup ON historical_archives (group_id, business_date);
CREATE INDEX IF NOT EXISTS idx_user_cache_id ON user_cache (group_id, user_id);
