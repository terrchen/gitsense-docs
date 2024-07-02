const crypto = require("crypto");
const { OpenAI } = require("openai");
const { existsSync, readFileSync, readdirSync, statSync } = require("fs");
const { resolve, dirname, join: joinPaths } = require("path");
const { sleep }  = require("../../../../libs/utils.js");
const { init: initDB, connect, allAsync, prepareAsync, getAsync, runAsync, stmtAllAsync } = require("./sqlite.js");

const MODELS = {};
const PROMPTS = {};
const BLOCKS = {};

async function init() {
    const db = await initDB();
    await initGlobalModels(db);
    await initGlobalPrompts(db);
    await initGlobalBlocks(db);
    db.close();
    console.log({ BLOCKS, PROMPTS, MODELS });
}

function getData(req) {
    const { type } = req.query;

    if ( type === "markdown" )
        return getMarkdown(req.query);
    else if ( type === "options" )
        return getOptions();

    return {
        "status": "failed",
        "data": {
            "type": `Unrecognized type ${type}`
        }
    };

    function getOptions() {
        try {
            const options = readOptionsFile();
    
            if ( !options ) 
                return { "status": "failed", "message": "No config file found" };
    
            return { "status": "success", "data": options };
        } catch (err) {
            console.log(err);
            return { "status": "failed", "message": "Server side error" };
        }
    }
}

async function postData(req) {
    const { type } = req.body;

    if ( type === "ai-summary" )
        return await getAISummary(req.body);

    return {
        "status": "failed",
        "data": {
            "type": `Unrecognized type ${type}`
        }
    };
}

function getMarkdown(params) {
    const { path } = params;
    const devboard = dirname(dirname(dirname(dirname(__dirname))));
    const file = resolve(devboard+"/"+path);
    const data = readFileSync(file, "utf8");

    return {
        "status": "success",
        "data": data
    }
}

function readOptionsFile() { 
    const file = joinPaths(__dirname, "options.json");

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

async function getAISummary(params) {
    const { 
        "block-type": blockType,
        "block-hash": blockHash,
        "block-text": blockText,
        model,
        prompt,
        temperature,
        hashes
    } = params;

    const db = connect();

    try {
        const err = await validateParameters(); 

        if ( err )
            return { "status": "failed", data: err };
    } catch ( err ) {
        console.log(`ERROR: The following system error occurred while processing getAISummary: ${err}`)
        return { "status": "failed", "error": "Server side error" };
    }

    if ( blockText !== null && !BLOCKS[blockHash] ) {
        try {
            await insertBlock(db, blockType, blockHash, blockText);
        } catch ( err ) {
            console.log(`ERROR: Failed to insert the following block:\n${block}\n${err}`);
        }
    }

    const blockId = BLOCKS[blockHash].id;
    const modelId = MODELS[model].id;
    const promptId = PROMPTS[prompt].id;

    let match = await getBlockAISummary(db, blockId, modelId, promptId, temperature);

    if ( !match )
        match = await insertBlockAI(db, blockId, modelId, promptId, temperature); 

    return { status: "success", data: match };

    async function validateParameters() {
        const err = {};
        err.temperature = validateTemperature();
        err.model = validateModel();
        err.prompt = validatePrompt();
        err.block = validateBlock();

        for ( const key in err ) {
            if ( err[key] )
                return err;
        }

        function validateTemperature() {
            if ( temperature >= 0.0 && temperature <= 1.0 )
                return null;

            return `Invalid temperature ${temperature}`;
        }

        function validateModel() {
            if ( !MODELS[model] )
                return `Nothing known about model ${model}`;
        }

        function validatePrompt() {
            if ( !PROMPTS[prompt] )
                return `Nothing known about prompt ${prompt}`;
        }

        function validateBlock() {
            if ( blockType !== "sentence" ) 
                return `Unsupported block type ${blockType}!`;

            if ( blockHash && blockText ) {
                const hash = crypto.createHash("sha256").update(blockText).digest("hex");

                if ( hash !== blockHash )
                    return `Provided block hash is not the same as the SHA256 of the block text.`;
            }
        }
    }
}

function getHashesSummary(hashes) {
    const db = connect();

    db.serialize(() => {
        const hashesTable = createHashesTable();
    }); 

    db.close();

    function createHashesTable() {
        const table = "hashes";
        const create = `CREATE TEMP TABLE ${table} (hash TEXT)`;

        try {
            db.run(create);
        } catch ( error ) {
            throw(`ERROR: Failed to create temp ${table} table!${create}\n${error}`);
        }

        const insert = `INSERT INTO ${table} VALUES(?)`;
        let stmt = null;

        try {
            stmt = db.prepare(insert);
        } catch ( error ) {
            const msg = "ERROR:\n"+insert+"\n"+error;
            throw msg;
        }

        for ( let i = 0; i < hashes.length; i++ ) {
            let hash = hashes[i];

            try {
                stmt.run(hash);
            } catch ( error ) {
                const msg = "ERROR: "+insert+"\n"+hash+"\n"+error;
                throw msg;
            }
        }
   
        try {
            stmt.finalize();
        } catch ( error ) {
            throw("ERROR: Failed to finalize statement: "+error);
        }

        return table;
    }
}

async function initGlobalModels(db) {
    const model2Id = await mapDBModels(db);
    const { models } = readOptionsFile();

    for ( let i = 0; i < models.length; i++ ) {
        const { name: model, vendors } = models[i];

        if ( MODELS[model] ) 
            throw(`ERROR: A model with the name "${model}" has already been defined`);

        if ( !model2Id[model] ) {
            console.log(`Inserting model "${model}"`);
            const id = await insertModel(db, model);
            console.log(`Successfully inserted with id ${id}`);
            model2Id[model] = id;
        }

        MODELS[model] = { id: model2Id[model], model };
    }

    async function mapDBModels() {
        const select = `SELECT id, model FROM models`;
        const rows = await allAsync(db, select);
        const model2Id = {};

        rows.forEach(row => {
            const { id, model } = row;
            model2Id[model] = id;
        });

        return model2Id;
    }
}

async function initGlobalPrompts(db) {
    const hash2Id = await mapDBPrompts(db);
    const { prompts } = readOptionsFile();

    for ( let i = 0; i < prompts.length; i++ ) {
        const { name, fileName } = prompts[i];

        if ( PROMPTS[name] ) 
            throw(`ERROR: A prompt with the name "${name}" has already been defined`);

        const file = joinPaths(__dirname, "prompts", fileName);

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

        PROMPTS[name] = { id: hash2Id[hash], name, hash };
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
}

async function initGlobalBlocks(db) {
    const select = `SELECT id, hash FROM blocks`;
    const rows = await allAsync(db, select);
    const model2Id = {};

    rows.forEach(row => {
        const { hash} = row;
        BLOCKS[hash] = row;
    });
}

async function insertModel(db, model) {
    const insert = `
        INSERT OR IGNORE INTO models(
            model, 
            created_at, 
            updated_at
        ) VALUES(
            ?, 
            DATETIME('now'), 
            DATETIME('now')
        )
    `;

    try {
        const result = await runAsync(db, insert, [model]);
        return result.lastID;
    } catch ( err ) {
        throw(`ERROR: Failed to insert prompt:\n${insert}\n${err}`);
    }
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

async function insertBlock(db, type, hash, block) {
    const insert = `
        INSERT OR IGNORE INTO blocks(
            type, 
            hash, 
            block, 
            created_at
        ) VALUES(
            ?, 
            ?, 
            ?, 
            DATETIME('now')
        )`;

    try {
        const result = await runAsync(db, insert, [type, hash, block]);
        const id = result.lastID; 
        BLOCKS[hash] = { hash, id };
        console.log(`Created new block #${id}`);
        return id;
    } catch ( err ) {
        throw(`ERROR: Failed to insert prompt:\n${insert}\n${err}`);
    }
}

async function insertBlockAI(db, blockId, modelId, promptId, temperature) {
    const insert = `
        INSERT OR IGNORE INTO blocks_ai(
            id,
            block_id,
            model_id,
            prompt_id,
            temperature,
            summary,
            created_at,
            updated_at
        ) VALUES(
            (SELECT IFNULL(max(id),0)+1 FROM blocks_ai),
            ?,
            ?,
            ?,
            ?,
            'Waiting for analysis',
            DATETIME('now'),
            DATETIME('now')
        )`;

    try {
        const result = await runAsync(db, insert, [blockId, modelId, promptId, temperature]);
        const match = await getBlockAISummary(db, blockId, modelId, promptId, temperature);
        console.log(`Created or used existing block ai #${match.id}`);
        return match;
    } catch ( err ) {
        throw(`ERROR: Failed to insert block ai:\n${insert}\n${err}`);
    }
}

async function getBlockAISummary(db, blockId, modelId, promptId, temperature) {
    const select = `
        SELECT
            id,
            summary
        FROM 
            blocks_ai 
        WHERE 
            block_id=? AND
            model_id=? AND
            prompt_id=? AND
            temperature=?
    `;

    return await getAsync(db, select, [blockId, modelId, promptId, temperature]);
}

module.exports = { init, getData, postData };
