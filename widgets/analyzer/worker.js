const util = require("util");
const path = require("path");
const sleep = util.promisify(setTimeout);

// Groq API Key
// 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

main();

async function main() {
    const { argv } = process;
    const pgm = path.basename(__filename);
    
    if ( argv.length !== 3 ) {
        console.error(`Usage: node ${pgm} job-id`);
        process.exit(1);
    }
    
    const jobId = process.argv[2];
    await sleep(1000);

    process.exit(1);
}

async function getChatBlock() {

}

//CREATE TABLE IF NOT EXISTS chat_block_jobs (
//    id INTEGER PRIMARY KEY AUTOINCREMENT,
//    chat_block_id INTEGER NOT NULL,
//    pid INTEGER NOT NULL,
//    provider_id INTEGER NOT NULL,
//    started_at DATETIME NOT NULL,
//    finished_at DATETIME,
//    failed_at DATETIME,
//    fail_exception TEXT,
//    FOREIGN KEY (chat_block_id) REFERENCES chat_blocks(id)
//);
