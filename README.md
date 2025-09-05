# MySQL to PostgreSQL Database Migration Tool

A robust Node.js application designed for efficient migration of large tables from MySQL to PostgreSQL databases. This tool features optimized streaming, batch processing, memory management, and comprehensive error handling for enterprise-grade database migrations.

## 🚀 Features

- ✅ **Dual Database Support**: MySQL and PostgreSQL connection pools
- ✅ **Optimized Large Table Migration**: Streaming approach with batch processing
- ✅ **Memory Management**: Built-in memory monitoring and garbage collection
- ✅ **Automatic Schema Conversion**: MySQL to PostgreSQL data type mapping
- ✅ **Progress Monitoring**: Real-time progress reporting with ETA
- ✅ **Error Handling**: Retry mechanisms and checkpoint recovery
- ✅ **Data Verification**: Automatic row count verification
- ✅ **Performance Analytics**: Detailed timing and speed metrics

## 📋 Prerequisites

Before running this project, ensure you have:

- **Node.js** (v14 or higher) - [Download here](https://nodejs.org/)
- **MySQL** (v5.7 or higher) - Source database
- **PostgreSQL** (v10 or higher) - Target database
- **npm** (comes with Node.js)

## 🛠️ Installation

### 1. Clone and Install Dependencies

```bash
# Navigate to project directory
cd db-migration-mysql-to-postgresql

# Install dependencies
npm install
```

### 2. Database Configuration

Update the database connection settings in `config/database.js`:

```javascript
// MySQL Connection Pool
const mysqlPool = mysql.createPool({
    host: 'localhost',
    user: 'root',
    password: 'your_mysql_password',
    database: 'source_database',
    port: 3306,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
});

// PostgreSQL Connection Pool
const postgresPool = new Pool({
    host: 'localhost',
    user: 'postgres',
    password: 'your_postgres_password',
    database: 'target_database',
    port: 5432,
    max: 10,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 2000,
});
```

### 3. Environment Setup (Optional)

Create a `.env` file for environment-specific configurations:

```env
# Server Configuration
PORT=3000
NODE_ENV=development

# Database Credentials (if using environment variables)
MYSQL_HOST=localhost
MYSQL_USER=root
MYSQL_PASSWORD=your_mysql_password
MYSQL_DATABASE=source_database
MYSQL_PORT=3306

POSTGRES_HOST=localhost
POSTGRES_USER=postgres
POSTGRES_PASSWORD=your_postgres_password
POSTGRES_DATABASE=target_database
POSTGRES_PORT=5432
```

## 🚀 Usage

### Start the Health Check Server

```bash
# Development mode (with auto-restart)
npm run dev

# Production mode
npm start
```

The server will start on `http://localhost:3000` and provide:
- Health check endpoint at `/health`
- Database connection status monitoring

### Run Table Migration

```bash
# Copy table from MySQL to PostgreSQL
npm run copy-table
```

### Test Database Connections

```bash
# Test both database connections
npm run test-db
```

## 📊 Migration Process

The migration tool follows a 4-step optimized process:

### Step 1: Table Analysis
- Analyzes MySQL table structure and metadata
- Counts total rows and estimates table size
- Displays column information and data types

### Step 2: PostgreSQL Schema Creation
- Converts MySQL data types to PostgreSQL equivalents
- Creates target table with proper constraints
- Handles primary keys and default values

### Step 3: Streaming Data Copy
- Uses optimized batch processing (configurable batch size)
- Implements streaming to handle large tables efficiently
- Provides real-time progress monitoring
- Includes automatic retry mechanisms for failed batches

### Step 4: Data Verification
- Verifies row counts between source and target
- Displays sample data from migrated table
- Provides detailed performance metrics

## ⚙️ Configuration

### Migration Settings

Adjust these settings in `copy-table-mysql-to-postgres.js`:

```javascript
const CONFIG = {
    BATCH_SIZE: 5000,           // Records per batch
    STREAM_LIMIT: 10000,        // Records to fetch at once
    MAX_RETRIES: 3,             // Retry failed batches
    CHECKPOINT_INTERVAL: 50000, // Progress checkpoints
    MEMORY_CHECK_INTERVAL: 10   // Memory monitoring frequency
};
```

### Table Configuration

Currently configured to migrate the `users` table. To change the target table, modify:

```javascript
// In copyTable() function
const tableName = 'your_table_name';
```

## 📁 Project Structure

```
db-migration-mysql-to-postgresql/
├── config/
│   └── database.js              # Database connections and pools
├── copy-table-mysql-to-postgres.js # Main migration script
├── server.js                    # Health check API server
├── package.json                 # Dependencies and scripts
├── package-lock.json           # Dependency lock file
└── README.md                   # This documentation
```

## 📊 Performance Features

### Memory Management
- Real-time memory usage monitoring
- Automatic garbage collection for large datasets
- Memory leak prevention

### Progress Tracking
- Real-time progress percentage
- Processing speed (records/second)
- Estimated time to completion (ETA)
- Checkpoint progress saving

### Error Handling
- Automatic retry for failed batches
- Graceful handling of connection issues
- Detailed error logging and reporting

## 🔧 Scripts

- `npm start` - Start health check server
- `npm run dev` - Start server in development mode with nodemon
- `npm run copy-table` - Execute table migration

## 🚨 Troubleshooting

### Common Issues

1. **Database Connection Failed**
   - Verify both MySQL and PostgreSQL services are running
   - Check database credentials in `config/database.js`
   - Ensure target databases exist
   - Verify network connectivity and firewall settings

2. **Memory Issues with Large Tables**
   - Reduce `BATCH_SIZE` in configuration
   - Increase Node.js memory limit: `node --max-old-space-size=4096`
   - Monitor system memory usage

3. **Migration Fails Partway Through**
   - Check the last checkpoint in console output
   - Verify disk space on target database
   - Review error logs for specific issues
   - Consider resuming from last successful batch

4. **Data Type Conversion Errors**
   - Review the data type mapping in `convertDataType()` function
   - Add custom type conversions as needed
   - Check for unsupported MySQL features

### Performance Optimization

- **For Very Large Tables (>10M rows)**:
  - Increase `BATCH_SIZE` to 10000-20000
  - Use dedicated database connections
  - Run during off-peak hours
  - Consider parallel processing for multiple tables

- **For Memory-Constrained Environments**:
  - Reduce `BATCH_SIZE` to 1000-2000
  - Lower `STREAM_LIMIT` to 5000
  - Enable more frequent garbage collection

## 📈 Monitoring and Logging

The tool provides comprehensive logging including:
- Migration progress with timestamps
- Memory usage statistics
- Processing speeds and ETAs
- Error details and retry attempts
- Performance breakdown by phase

## ⚠️ Important Notes

- **Always backup your databases** before running migrations
- **Test migrations on sample data** before production use
- **Monitor system resources** during large table migrations
- **Verify data integrity** after migration completion
- **Consider maintenance windows** for production migrations

---

For support or questions, please review the troubleshooting section or create an issue in the repository.