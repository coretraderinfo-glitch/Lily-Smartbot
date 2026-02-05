# Lily Bot - Architecture & Data Blueprint

## 1. High-Level Architecture
To achieve "world-class" performance and reliability, we move beyond a simple polling bot to an Event-Driven Architecture.

- **Components**:
1.  **Ingress Layer (Telegram Webhook)**: High-performance endpoint receiving async updates via `grammy.js`.
2.  **Message Queue (BullMQ)**: Transactional decoupling via Redis to ensure linear execution.
3.  **PDF Export Engine**: Professional generation of world-class statements using `pdfkit-table`.
4.  **Chronos Engine**: Distributed scheduler (BullMQ Repeatable Jobs) for proactive 4AM rollover.
5.  **Database (PostgreSQL)**: Source of truth for all ledger and subscription data.
6.  **Cache (Redis)**: Operational storage for BullMQ and session management.

---

## 2. Database Schema (PostgreSQL)

### 2.1 Tenants (Groups)
```sql
CREATE TABLE groups (
    id BIGINT PRIMARY KEY, -- Telegram Chat ID
    title VARCHAR(255),
    status VARCHAR(50) DEFAULT 'ACTIVE',   -- Subscription Status of the bot
    current_state VARCHAR(20) DEFAULT 'WAITING_FOR_START', -- WAITING_FOR_START, RECORDING, ENDED
    timezone VARCHAR(50) DEFAULT 'Asia/Shanghai',
    currency_symbol VARCHAR(10) DEFAULT 'CNY',
    created_at TIMESTAMPTZ DEFAULT NOW()
);
```

### 2.2 Configuration (Settings)
JSONB is used for flexible config to avoid schema migrations for every new toggle.
```sql
CREATE TABLE group_settings (
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
```

### 2.3 Access Control (Operators)
```sql
CREATE TABLE group_operators (
    group_id BIGINT REFERENCES groups(id),
    user_id BIGINT,                        -- Telegram User ID
    username VARCHAR(255),                 -- Cached username
    role VARCHAR(20) CHECK (role IN ('OWNER', 'ADMIN', 'OPERATOR')),
    added_by BIGINT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (group_id, user_id)
);
```

### 2.4 The Ledger (Transactions)
This is the most critical table.
```sql
CREATE TABLE transactions (
    id UXID PRIMARY KEY,                   -- KSUID or UUIDv7 (sortable)
    group_id BIGINT REFERENCES groups(id),
    
    -- Who & When
    operator_id BIGINT,                    -- Who input the command
    recorded_at TIMESTAMPTZ DEFAULT NOW(), -- Actual server time
    business_date DATE,                    -- The "Accounting Day" (based on 4AM rule)
    
    -- The Money
    type VARCHAR(20) CHECK (type IN ('DEPOSIT', 'PAYOUT', 'RETURN')),
    amount_raw DECIMAL(18, 4),             -- The input amount (e.g., 1000)
    fee_rate DECIMAL(10, 4),               -- Rate snapshot at moment of tx
    fee_amount DECIMAL(18, 4),             -- Calculated fee
    net_amount DECIMAL(18, 4),             -- amount - fee
    
    -- Context
    currency VARCHAR(10) DEFAULT 'CNY',    -- CNY, USDT
    original_text TEXT,                    -- The raw command used (Audit)
    is_voided BOOLEAN DEFAULT FALSE,       -- If reverted
    dummy_entry BOOLEAN DEFAULT FALSE      -- For "Correction" entries logic? 
                                           -- Better: Use negative amounts for corrections.
);
-- Index for fast "Show Bill"
CREATE INDEX idx_ledger_day ON transactions (group_id, business_date, recorded_at DESC);
-- Index for Multi-Currency Balances (e.g. SELECT currency, SUM(net_amount) ...)
CREATE INDEX idx_ledger_balances ON transactions (group_id, business_date, currency);
```

### 2.5 Market Data (USDT)
```sql
CREATE TABLE market_rates (
    id SERIAL PRIMARY KEY,
    source VARCHAR(50) DEFAULT 'OKX',
    pair VARCHAR(20) DEFAULT 'USDT-CNY',
    method VARCHAR(20), -- Bank, Ali, Wechat
    price_buy DECIMAL(10, 4),
    price_sell DECIMAL(10, 4),
    captured_at TIMESTAMPTZ DEFAULT NOW()
);
```

---

## 3. Data Flow & Logic Details

### 3.1 The "Business Day" Algorithm
How to determine `business_date` correctly?
```python
def get_business_date(group_config, server_time_utc):
    # Convert UTC to Group Local Time
    local_time = convert_timezone(server_time_utc, group_config.timezone)
    
    # Check 4 AM boundary
    if local_time.hour < group_config.daily_reset_hour:
        return local_time.date() - timedelta(days=1)
    else:
        return local_time.date()
```

### 3.2 Idempotency (The "Double Post" Problem)
*   **Problem**: User has bad internet. Sends `+1000`. Telegram Client retries. Audit log shows two `+1000`.
*   **Solution**:
    *   Cache the `MessageID` of every processed Telegram message in Redis: `Key: seen_msg:{chat_id}:{msg_id}` TTL: 24h.
    *   If `seen_msg` exists → Ignore.

---

## 4. Scalability Strategy

1.  **Read vs Write**: "Show Bill" is Read-Heavy. `+1000` is Write-Heavy.
2.  **Snapshotting**:
    *   Instead of `SUM(transactions)` every time someone asks for a bill, we maintain a `DailySummary` in Redis.
    *   On `+1000`: Update Postgres AND Increment Redis Counter `HINCRBY group:{id}:day:{date} total_in 1000`.
    *   `Show Bill` reads directly from Redis (0ms latency).

3.  **Archiving**:
    *   Transactional data grows fast.
    *   Partition `transactions` table by `business_date` (Monthly partitions).

