// core/storage/mariadb/pool.js - Shared MariaDB connection pool
const mysql = require('mysql2/promise');

let pool = null;

function getPool() {
    if (!pool) {
        pool = mysql.createPool({
            host: process.env.DB_HOST || 'localhost',
            port: Number(process.env.DB_PORT) || 3306,
            user: process.env.DB_USER || 'root',
            password: process.env.DB_PASSWORD || '',
            database: process.env.DB_NAME || 'bot_wa',
            waitForConnections: true,
            connectionLimit: 10,
            queueLimit: 0,
            dateStrings: true
        });
    }
    return pool;
}

module.exports = {
    getPool
};
