-- SQL code to create docs related tables.  
--
-- Note: We want to put this in a file as opposed to embedding this in JavaScript to take 
--       advantage of SQL syntax highlighting.

CREATE TABLE IF NOT EXISTS models (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    model TEXT NOT NULL UNIQUE,
    created_at DATETIME NOT NULL,
    updated_at DATETIME NOT NULL
);

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

CREATE TABLE IF NOT EXISTS blocks_ai (
    id INTEGER NOT NULL UNIQUE,
    block_id INTEGER NOT NULL,
    model_id INTEGER NOT NULL,
    prompt_id INTEGER NOT NULL,
    temperature DECIMAL NOT NULL,
    summary TEXT NOT NULL,
    job_id INTEGER,
    created_at DATETIME NOT NULL,
    updated_at DATETIME NOT NULL,
    PRIMARY KEY(block_id, prompt_id, model_id, temperature),
    FOREIGN KEY (block_id) REFERENCES blocks(id),
    FOREIGN KEY (model_id) REFERENCES models(id),
    FOREIGN KEY (prompt_id) REFERENCES prompts(id),
    FOREIGN KEY (job_id) REFERENCES jobs(id)
);

CREATE TABLE IF NOT EXISTS blocks_ai_conversations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    blocks_ai_id INTEGER NOT NULL,
    messages TEXT NOT NULL,
    response TEXT NOT NULL,
    created_at INTEGER, 
    FOREIGN KEY (blocks_ai_id) REFERENCES blocks_ai(id)
);

CREATE TABLE IF NOT EXISTS jobs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    type TEXT CHECK(type IN ('blocks_ai')) NOT NULL,
    type_id INTEGER NOT NULL,
    pid INTEGER NOT NULL,
    log_file TEXT,
    started_at DATETIME NOT NULL,
    finished_at DATETIME,
    failed_at DATETIME,
    fail_exception TEXT
);
