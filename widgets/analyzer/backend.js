const crypto = require("crypto");
const { OpenAI } = require("openai");
const { existsSync, readFileSync, readdirSync, statSync } = require("fs");
const { resolve, dirname } = require("path");
const { sleep }  = require("../../../../libs/utils.js");
const { init: initDB, connect, allAsync, prepareAsync, getAsync, runAsync, stmtAllAsync } = require("./sqlite.js");
const { init: initInit, models, prompts, blocks, readOptionsFile } = require("./init.js");

async function init() {
    await initInit();
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

async function getAISummary(params) {
    const { 
        priority=0,
        "thread-id": threadId=0,
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

    if ( blockText !== null && !blocks[blockHash] ) {
        try {
            await insertBlock(db, blockType, blockHash, blockText);
        } catch ( err ) {
            console.log(`ERROR: Failed to insert the following block:\n${block}\n${err}`);
        }
    }

    const blockId = blocks[blockHash].id;
    const promptId = prompts[prompt].id;

    if ( !blockId || !promptId ) {
        console.log(`SERIOUS: We have a logic error. Block id: ${blockId}  promptId: ${promptId}`);
        return { "status": "failed", "error": "Server side error" };
    } 

    let match = await getChatBlockSummary(db, threadId, blockId, model, promptId, temperature);

    if ( !match )
        match = await inserChatBlocks(db, priority, threadId, blockId, model, promptId, temperature); 

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
            if ( !models[model] )
                return `Nothing known about model ${model}`;
        }

        function validatePrompt() {
            if ( !prompts[prompt] )
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
        blocks[hash] = { hash, id };
        console.log(`Created new block #${id}`);
        return id;
    } catch ( err ) {
        throw(`ERROR: Failed to insert prompt:\n${insert}\n${err}`);
    }
}

async function inserChatBlocks(db, priority, threadId, blockId, modelId, promptId, temperature) {
    const insert = `
        INSERT OR IGNORE INTO chat_blocks(
            id,
            priority,
            thread_id,
            block_id,
            model,
            prompt_id,
            temperature,
            summary,
            created_at,
            updated_at
        ) VALUES(
            (SELECT IFNULL(max(id),0)+1 FROM chat_blocks),
            ?,
            ?,
            ?,
            ?,
            ?,
            ?,
            'Waiting for analysis',
            DATETIME('now'),
            DATETIME('now')
        )`;

    try {
        const result = await runAsync(db, insert, [priority, threadId, blockId, modelId, promptId, temperature]);
        const match = await getChatBlockSummary(db, blockId, modelId, promptId, temperature);
        console.log(`Created or used existing block chat #${match.id}`);
        return match;
    } catch ( err ) {
        throw(`ERROR: Failed to insert block chat:\n${insert}\n${err}`);
    }
}

async function getChatBlockSummary(db, blockId, modelId, promptId, temperature) {
    const select = `
        SELECT
            id,
            summary
        FROM 
            chat_blocks 
        WHERE 
            block_id=? AND
            model=? AND
            prompt_id=? AND
            temperature=?
    `;

    return await getAsync(db, select, [blockId, modelId, promptId, temperature]);
}

module.exports = { init, getData, postData };
