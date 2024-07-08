-- SQL code to create docs related tables.  
--
-- Note: We want to put this in a file as opposed to embedding this in JavaScript to take 
--       advantage of SQL syntax highlighting.

CREATE TABLE IF NOT EXISTS prompts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    hash TEXT NOT NULL UNIQUE,
    prompt TEXT NOT NULL,
    created_at DATETIME NOT NULL
);

CREATE TABLE IF NOT EXISTS blocks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    type TEXT NOT NULL,
    hash TEXT NOT NULL UNIQUE,
    block TEXT NOT NULL,
    created_at DATETIME NOT NULL
);

CREATE TABLE IF NOT EXISTS chat_blocks (
    id INTEGER NOT NULL UNIQUE,
    priority INTEGER NOT NULL,
    thread_id INTEGER NOT NULL,
    block_id INTEGER NOT NULL,
    prompt_id INTEGER NOT NULL,
    model TEXT NOT NULL,
    temperature DECIMAL NOT NULL,
    summary TEXT,
    messages TEXT,
    active_job_id INTEGER,
    created_at DATETIME NOT NULL,
    updated_at DATETIME NOT NULL,
    PRIMARY KEY(thread_id, block_id, prompt_id, model, temperature),
    FOREIGN KEY (block_id) REFERENCES blocks(id),
    FOREIGN KEY (prompt_id) REFERENCES prompts(id)
);

CREATE TABLE IF NOT EXISTS chat_block_jobs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    chat_block_id INTEGER NOT NULL,
    provider TEXT NOT NULL,
    message TEXT NOT NULL,
    response TEXT,
    created_at DATETIME NOT NULL,
    started_at DATETIME,
    finished_at DATETIME,
    failed_at DATETIME,
    fail_exception TEXT,
    merged_response_at DATETIME,
    request_retry_after DATETIME,
    request_ratelimit_limit_requests INTEGER,
    request_ratelimit_limit_tokens INTEGER,
    request_ratelimit_remaining_requests INTEGER,
    request_ratelimit_remaining_tokens INTEGER,
    request_ratelimit_reset_requests DATETIME,
    request_ratelimit_reset_tokens DATETIME,
    request_sent_at DATETIME,
    request_received_at DATETIME,
    FOREIGN KEY (chat_block_id) REFERENCES chat_blocks(id)
);
