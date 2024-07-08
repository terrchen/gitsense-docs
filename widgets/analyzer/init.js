const util = require("util");
const crypto = require("crypto");
const path = require("path");
const { existsSync, readFileSync, readdirSync, statSync } = require("fs");
const { init: initDB, allAsync, runAsync, serializeAsync } = require("./sqlite.js");

const models = {};
const prompts = {};
const blocks = {};
const providers = {};

async function init(db) {
    const closeDB = db ? false : true;

    if ( !db )
        db = await initDB();

    await initModels(db);
    await initPrompts(db);
    await initBlocks(db);
    await initProviders(db);

    console.log("");
    console.log("providers");
    console.log(providers);
    console.log("");
    console.log("models");
    console.log(util.inspect(models, { depth: 3} ));
    console.log("");

    // ensure provider models are correct
    for ( const provider in providers ) { 
        const { models: providerModels } = providers[provider];

        for ( const model in providerModels ) {
            if ( !models[model] ) 
                throw(`ERROR: No model name "${model}" for the provider "${provider}" defined`);
        }
    }

    if ( closeDB )
        db.close();
}

async function initModels(db) {
    const { models: optionModels } = readOptionsFile();

    for ( let i = 0; i < optionModels.length; i++ ) {
        const { name: model, providers: optionProviders } = optionModels[i];
        const providers = [];

        optionProviders.forEach((provider, i) => {
            const { name, modelId } = provider;
            providers.push({ name: name.toLowerCase(), modelId });
        });

        if ( models[model] ) 
            throw(`ERROR: A model with the name "${model}" has already been defined`);

        models[model] = { providers };
    }
}

async function initProviders(db) {
    const provider2RateLimit = getRateLimits();
    const { providers: optionProviders } = readOptionsFile();

    for ( let i = 0; i < optionProviders.length; i++ ) {
        const { name, maxWorkers } = optionProviders[i];
        const provider = name.toLowerCase();

        if ( providers[provider] ) 
            throw(`ERROR: A provider with the name "${provider}" has already been defined`);

        providers[provider] = { 
            name: provider,
            workers: 0,
            maxWorkers,
            rateLimit: provider2RateLimit[provider] || {}
        };
    }

    async function getRateLimits() {
        const tempTable = 'rate_limit';

        const create = `
            CREATE TEMP TABLE ${tempTable}(
                provider TEXT NOT NULL UNIQUE,
                request_retry_after DATETIME,
                request_ratelimit_limit_requests INTEGER,
                request_ratelimit_limit_tokens INTEGER,
                request_ratelimit_remaining_requests INTEGER,
                request_ratelimit_remaining_tokens INTEGER,
                request_ratelimit_reset_requests DATETIME,
                request_ratelimit_reset_tokens DATETIME
            );

            INSERT INTO ${tempTable} 
                SELECT 
                    provider,
                    request_retry_after,
                    request_ratelimit_limit_requests,
                    request_ratelimit_limit_tokens,
                    request_ratelimit_remaining_requests,
                    request_ratelimit_remaining_tokens,
                    request_ratelimit_reset_requests,
                    request_ratelimit_reset_tokens
                FROM
                    chat_block_jobs
                WHERE
                    started_at IS NOT NULL AND
                    request_received_at >= DATETIME('now', '-1 day')
                ORDER BY request_received_at DESC
                ON CONFLICT DO NOTHING;
        `;

        const provider2RateLimit = {};

        await serializeAsync(db, () => {
            db.exec(create);
            db.all(`SELECT * FROM ${tempTable}`, (err, rows) => {
                rows.forEach(row => {
                    const { provider } = row;
                    provider2RateLimit[provider] = row;
                });
            });
        });

        return provider2RateLimit;
    }
}

async function initBlocks(db) {
    const select = `SELECT id, hash FROM blocks`;
    const rows = await allAsync(db, select);

    rows.forEach(row => {
        const { hash} = row;
        blocks[hash] = row;
    });
}

async function initPrompts(db) {
    const hash2Id = await mapDBPrompts(db);
    const { prompts: optionPrompts } = readOptionsFile();

    for ( let i = 0; i < optionPrompts.length; i++ ) {
        const { name, fileName } = optionPrompts[i];

        if ( prompts[name] ) 
            throw(`ERROR: A prompt with the name "${name}" has already been defined`);

        const file = path.join(__dirname, "prompts", fileName);

        if ( !existsSync(file) )
            throw(`ERROR: No "${name}" prompt file named "${name}" exists at ${file}!`);

        let json = null;

        try {
            json = readFileSync(file);
        } catch ( err ) {
            throw(`ERROR: Failed to read prompt file ${file}: ${err}`);
        }

        let prompt = null;

        try {
            prompt = JSON.parse(json);
        } catch ( err ) {
            throw(`ERROR: Prompt file ${file} contains an invalid JSON: ${err}`);
        }

        const hash = crypto.createHash("sha256").update(JSON.stringify(prompt)).digest("hex");

        if ( !hash2Id[hash] ) {
            console.log(`Inserting prompt "${name}"`);
            const id = await insertPrompt(db, hash, JSON.stringify(prompt));
            console.log(`Successfully inserted with id ${id}`);
            hash2Id[hash] = id;
        }

        prompts[name] = { id: hash2Id[hash], name, hash };
    }

    async function mapDBPrompts() {
        const select = `SELECT id, hash FROM prompts`;
        const rows = await allAsync(db, select);
        const hash2Id = {};

        rows.forEach(row => {
            const { id, hash } = row;
            hash2Id[hash] = id;
        });

        return hash2Id;
    }

    async function insertPrompt(db, hash, prompt) {
        const insert = "INSERT OR IGNORE INTO prompts(hash, prompt, created_at) VALUES(?, ?, DATETIME('now'))";
    
        try {
            const result = await runAsync(db, insert, [hash, prompt]);
            return result.lastID;
        } catch ( err ) {
            throw(`ERROR: Failed to insert prompt:\n${insert}\n${err}`);
        }
    }

}

function readOptionsFile() { 
    const file = path.join(__dirname, "options.json");

    if ( !existsSync(file) )
        return null;

    const json = readFileSync(file, "utf8");
    let options = null;

    try {
        return JSON.parse(json);
    } catch ( err ) {
        throw(`ERROR: Invalid JSON file ${file}:\n${err}`);
    }
}

module.exports = { init, models, prompts, blocks, providers, readOptionsFile };
