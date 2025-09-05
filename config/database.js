const mysql = require('mysql2');
const { Pool } = require('pg');
require('dotenv').config();

// MySQL Connection Pool
const mysqlPool = mysql.createPool({
    // host: 'localhost',
    // user: 'root',
    // password: '',
    // database: 'test',
    // port: 3306,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
    // Removed invalid options: acquireTimeout, timeout, reconnect
});

// Get promise-based MySQL connection
const mysqlPromisePool = mysqlPool.promise();

// PostgreSQL Connection Pool
const postgresPool = new Pool({
    // host: 'localhost',
    // user: 'root',
    // password: 'DSsXXXXXXXdwe3',
    // database: 'test_one',
    // port: 5432,
    max: 10,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 2000,
});

// Test MySQL connection
const testMySQLConnection = async () => {
    try {
        const [rows] = await mysqlPromisePool.execute('SELECT 1 as test');
        console.log('✅ MySQL Database connected successfully');
        return true;
    } catch (error) {
        console.error('❌ MySQL Database connection failed:', error.message);
        return false;
    }
};

// Test PostgreSQL connection
const testPostgreSQLConnection = async () => {
    try {
        const client = await postgresPool.connect();
        const result = await client.query('SELECT 1 as test');
        client.release();
        console.log('✅ PostgreSQL Database connected successfully');
        return true;
    } catch (error) {
        console.error('❌ PostgreSQL Database connection failed:', error.message);
        return false;
    }
};

// Test both database connections
const testAllConnections = async () => {
    console.log('🔄 Testing database connections...');
    
    const mysqlStatus = await testMySQLConnection();
    const postgresStatus = await testPostgreSQLConnection();
    
    return {
        mysql: mysqlStatus,
        postgresql: postgresStatus,
        overall: mysqlStatus && postgresStatus
    };
};

module.exports = {
    // MySQL exports
    mysqlPool,
    mysqlPromisePool,
    
    // PostgreSQL exports
    postgresPool,
    
    // Test functions
    testMySQLConnection,
    testPostgreSQLConnection,
    testAllConnections,
    
    // Backward compatibility
    pool: mysqlPool,
    promisePool: mysqlPromisePool,
    testConnection: testMySQLConnection
};
