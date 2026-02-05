-- Lily Bot Schema V1

-- 1. Tenants (Groups)
-- 1. Tenants (Groups)
CREATE TABLE IF NOT EXISTS groups (
    id BIGINT PRIMARY KEY, -- Telegram Chat ID
    title VARCHAR(255),
    status VARCHAR(50) DEFAULT 'ACTIVE', -- ACTIVE, EXPIRED, UNLICENSED
    current_state VARCHAR(20) DEFAULT 'WAITING_FOR_START',
    timezone VARCHAR(50) DEFAULT 'Asia/Shanghai',
    currency_symbol VARCHAR(10) DEFAULT 'CNY',
    license_key VARCHAR(50), 
    license_expiry TIMESTAMPTZ,
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
    
    -- Logic Config
    daily_reset_hour INT DEFAULT 4,        -- Default 4 AM
    
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

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
    
    -- Correction Logic (Constraint: Contra-entries are just new rows, so no special col needed besides is_voided link logic if we get fancy later)
    related_transaction_id VARCHAR(50) -- If correcting another tx
);

-- Indices
CREATE INDEX IF NOT EXISTS idx_ledger_day ON transactions (group_id, business_date, recorded_at DESC);
CREATE INDEX IF NOT EXISTS idx_ledger_balances ON transactions (group_id, business_date, currency);

-- 5. Audit
CREATE TABLE IF NOT EXISTS audit_logs (
    id SERIAL PRIMARY KEY,
    group_id BIGINT,
    user_id BIGINT,
    action VARCHAR(50),
    details JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
