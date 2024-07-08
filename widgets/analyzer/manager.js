const fs = require("fs");
const path = require("path");
const childProcess = require('child_process');
const util = require("util");
const sleep = util.promisify(setTimeout);
const { connect, getAsync, runAsync } = require("./sqlite");
const { models, providers, init: initInit } = require("./init.js");

const workerScript = `${__dirname}/worker.js`;

const debug = {
    maxActiveWorkers: { last: 0, frequency: 10*1000 },
    noUnprocessedChatBlocks: { last: 0, frequency: 60*1000 },
    noProvider: { last: 0, frequency: 60*1000 }
};

let lastDebug = 0;
let maxActiveWorkers = 1;
let activeWorkers = 0;

main();

async function main() {
    if ( false ) {
        for ( let i = 0; i < 10; i++ ) {
            while ( true ) {
                if ( activeWorkers >= maxActiveWorkers ) {
                    console.log(`Reached maximum number of active workers (${activeWorkers})`);
                    await sleep(1000);
                    break;
                }

                const worker = i+1;
                let process = null;

                try {
                    process = childProcess.spawn("node", [ workerScript, worker]);
                    activeWorkers++;
                } catch ( err ) {
                    console.log(`ERROR: Failed to span worker process ${err}`);
                    await sleep(10);
                    continue;
                }

                process.on("exit", (code) => {
                    activeWorkers--; 
                    console.log(`Worker ${worker} exited with code ${code}`);
                });
            }
        }

        await sleep(100000); 
    }

    // Make sure this is only manager process running.  If there is another manager running, this
    // process will exit with an error message.
    onlyOneManager();

    // Initialize variables
    const db = connect();
    await initInit(db);

    // Do a clean up before continuing
    await cleanUp(db); 

    let ignoreModels = [];

    while (true) {
        if ( activeWorkers >= maxActiveWorkers ) {
            const now = new Date().getTime();
            const { last=0, frequency=30*1000 } = debug.maxActiveWorkers;

            if ( now - last >= frequency )  {
                debug.maxActiveWorkers.last = now;
                console.log(`There is currently ${activeWorkers} active workers.  Unable to process any new requests`);
            }

            await sleep(50);
            continue;
        }

        const block = await getUnprocessedChatBlock(db, ignoreModels);

        if ( !block ) {
            const now = new Date().getTime();
            const { last=0, frequency=30*1000 } = debug.noUnprocessedChatBlocks;

            if ( now - last >= frequency )  {
                debug.noUnprocessedChatBlocks.last = now;
                console.log("No unprocessed chat block");
            }

            await sleep(50);
            continue;
        }

        console.log("Found unprocessed chat block");
        console.log(block);

        const provider = getAvailableProvider(block.model);

        if ( !provider ) {
            const now = new Date().getTime();
            const { last=0, frequency=30*1000 } = debug.noAvailableProvider;

            if ( now - last >= frequency )  {
                debug.noAvailableProvider.last = now;
                console.log("No available providers");
            }

            ignoreModels.push(block.model);

            await sleep(10);
            continue;
        }

        console.log(`Found available provider ${provider.name}`);
        console.log(provider);

        const jobId = await newChatBlockJob(db, provider.name, block.id, block.text);
        console.log(`Successfully created new job #${jobId}`);

        ignoreModels = [];
        await sleep(1000000);
        break;
    }

    db.close();
    //const workers = await getActiveWorkers(db);
    //console.log(workers);
}

function onlyOneManager() {
    const managerLockFile = path.resolve(`${__dirname}/manager.lock`);
    const { exists, pid, isRunning } = checkManagerLockFile(managerLockFile);

    if ( exists && isRunning ) {
        console.error(`A manager process (${pid}) is currently running. Unable to continue.`);
        process.exit(1);
    }

    fs.writeFileSync(managerLockFile, process.pid.toString());

    function checkManagerLockFile(managerLockFile) {
        if ( fs.existsSync(managerLockFile) ) {
            const pid = fs.readFileSync(managerLockFile, "utf8");
            const isRunning = isProcessRunning(pid);
            return { exists: true, pid: parseInt(pid), isRunning };
        } else {
            return { exists: false };
        }
    }
}

async function cleanUp() {
    console.log("IMPLEMENT CLEAN UP");
}

async function getUnprocessedChatBlock(db, ignoreModels) {
    const ignoreModelsCondition = !ignoreModels || ignoreModels.length === 0 ?
        "" :
        " AND model NOT IN ("+ignoreModels.map((x) => `"${x}"`).join(",")+")";

    const select = `
        SELECT 
            cb.id,
            priority,
            block AS text,
            model,
            prompt,
            cb.created_at,
            cb.updated_at
        FROM 
            chat_blocks cb,
            blocks b,
            prompts p
        WHERE 
            active_job_id IS NULL AND
            messages IS NULL AND
            cb.block_id=b.id AND
            cb.prompt_id=p.id
            ${ignoreModelsCondition} 
        ORDER BY priority DESC, cb.created_at ASC
        LIMIT 1
    `;

    return await getAsync(db, select);
}

async function getActiveWorkers() {
    const select = `
        SELECT
            provider,
            COUNT(*) workers
        FROM
            blocks_ai_jobs
        WHERE
            finished_at IS NULL AND
            failed_at IS NULL
        GROUP BY provider
    `;
}

function getAvailableProvider(model) {
    const { providers: modelProviders } = models[model];

    if ( !modelProviders )
        return null;

    for ( let i = 0; i < modelProviders.length; i++ ) {
        const provider = providers[modelProviders[i].name];
        const { name, maxWorkers, workers, rateLimit={}, minRateLimitRequestTokens=-1 } = provider;

        if ( workers >= maxWorkers )
            continue;

        const { retryAfter, remainingRequests, remainingTokens, resetRequests, resetTokens } = rateLimit;
        const now = new Date().getTime();
        const retryAfterTime = retryAfter ? new Date(retryAfter).getTime() : null;
        const resetRequestsTime = resetRequests ? new Date(resetRequests).getTime() : null;
        const resetTokensTime = resetTokens ? new Date(resetTokens).getTime() : null;

        if ( retryAfterTime && now < retryAfterTime )
            continue;

        if ( remainingRequests === 0 )
            continue;

        if ( remainingTokens === 0 || remainingTokens < minRateLimitRequestTokens )
            continue;

        if ( resetRequests && resetRequestsTime < now )
            continue;

        if ( resetTokens && resetTokensTime < now )
            continue;

        return provider;
    }

    return null;
}

async function newChatBlockJob(db, provider, chatBlockId, message) {
    const insert = `
        INSERT INTO chat_block_jobs(
            chat_block_id,
            provider,
            message,
            created_at
        ) VALUES ( 
            ?,
            ?,
            ?,
            DateTime("now") 
        )
    `;

    try {
        const result = await runAsync(db, insert, [chatBlockId, provider, message]);
        return result.lastID;
    } catch ( err ) {
        throw(`ERROR: Failed to insert prompt:\n${insert}\n${err}`);
    }
}

function isProcessRunning(pid) {
    try {
        const processList = childProcess.execSync(`ps -p ${pid}`)
        const output = processList.toString();

        if ( output.includes(pid) && output.match(path.basename(__filename)) )
            return true;

        return false;
    } catch ( err ) {
        if ( err.stderr && err.stderr.toString() === "" )
            return false;

        throw(err);
    }
}
