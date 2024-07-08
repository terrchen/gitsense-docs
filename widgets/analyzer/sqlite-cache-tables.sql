CREATE TABLE IF NOT EXISTS chat_block_completions_cache {
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    chat_block_job_id INTEGER UNIQUE,
    payload TEXT NOT NULL,
    payload_hash TEXT NOT NULL,
    response TEXT NOT NULL,
    sent_at TIMESTAMP NOT NULL,
    received_at TIMESTAMP NOT NULL
}
