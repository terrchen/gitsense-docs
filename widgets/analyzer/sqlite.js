const sqlite3 = require("sqlite3").verbose();
const { existsSync, readFileSync } = require("fs");

const SQLITE_DOCS_DB = `${__dirname}/docs.sqlite3`
const SQLITE_TABLES_SQL = `${__dirname}/sqlite-tables.sql`;

async function init() {
    if ( existsSync(SQLITE_DOCS_DB) ) {
        return connect();
        console.log(`No need to initialize database ${SQLITE_DOCS_DB} as it already exists.`);
        return;
    }

    console.log(`Initializing database ${SQLITE_DOCS_DB}`);
    const db = connect();
    const create = readFileSync(SQLITE_TABLES_SQL, "utf-8");

    try {
        console.log(`Executing SQL in ${SQLITE_TABLES_SQL}`);
        await execAsync(db, create);
    } catch ( error ) {
        throw(`ERROR: Failed to initialize database\n${create}\n${error}`);
    }

    console.log("Successfully initialized database");
    return db;
}

function connect() {
    console.log(`Connecting to ${SQLITE_DOCS_DB}`);

    try {
        const db = new sqlite3.Database(SQLITE_DOCS_DB, { verbose: false });
        console.log(`Successfully connected`);
        return db;
    } catch (error) {
        throw(`ERROR: Unable to connect to docs database ${SQLITE_DOCS_DB}\n${error}`); 
    }
}

function execAsync(db, sql) {
    return new Promise((resolve, reject) => {
        db.exec(sql, (err, rows) => {
            if (err) {
                reject(err);
            } else {
                resolve(rows);
            }
        });
    });
}

function runAsync(db, sql, params = []) {
    return new Promise((resolve, reject) => {
        db.run(sql, params, function(err) {
            if (err) {
                reject(err);
            } else {
                resolve(this);
            }
        });
    });
}

function getAsync(db, sql, params = []) {
    return new Promise((resolve, reject) => {
        db.get(sql, params, (err, row) => {
            if (err) {
                reject(err);
            } else {
                resolve(row);
            }
        });
    });
}

function allAsync(db, sql, params = []) {
    return new Promise((resolve, reject) => {
        db.all(sql, params, (err, rows) => {
            if (err) {
                reject(err);
            } else {
                resolve(rows);
            }
        });
    });
}

function eachAsync(db, sql, params = []) {
    return new Promise((resolve, reject) => {
        let rows = [];
        db.each(sql, params, (err, row) => {
            if (err) {
                reject(err);
            } else {
                rows.push(row);
            }
        }, (err, count) => {
            if (err) {
                reject(err);
            } else {
                resolve({ rows, count });
            }
        });
    });
}

function prepareAsync(db, sql) {
    return new Promise((resolve, reject) => {
        const stmt = db.prepare(sql, (err) => {
            if (err) {
                reject(err);
            } else {
                resolve(stmt);
            }
        });
    });
}

function stmtAllAsync(stmt, params = []) {
    return new Promise((resolve, reject) => {
        stmt.all(params, (err, rows) => {
            if (err) {
                reject(err);
            } else {
                resolve(rows);
            }
        });
    });
}

function serializeAsync(db, operations) {
    return new Promise((resolve, reject) => {
        db.serialize(() => {
            operations()
                .then(resolve)
                .catch(reject);
        });
    });
}

module.exports = { 
    allAsync, 
    connect, 
    execAsync, 
    getAsync, 
    init, 
    prepareAsync, 
    runAsync, 
    stmtAllAsync 
};