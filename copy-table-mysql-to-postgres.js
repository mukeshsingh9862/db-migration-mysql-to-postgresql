const { mysqlPromisePool, postgresPool } = require('./config/database');

// Configuration for large table copying
const CONFIG = {
    BATCH_SIZE: 5000,           // Records per batch (adjustable based on memory)
    STREAM_LIMIT: 10000,        // Records to fetch from MySQL at a time
    MAX_RETRIES: 3,             // Retry failed batches
    CHECKPOINT_INTERVAL: 50000,  // Save progress every N records
    MEMORY_CHECK_INTERVAL: 10   // Check memory every N batches
};

// Function to get system memory usage
const getMemoryUsage = () => {
    const used = process.memoryUsage();
    return {
        rss: Math.round(used.rss / 1024 / 1024), // MB
        heapUsed: Math.round(used.heapUsed / 1024 / 1024), // MB
        heapTotal: Math.round(used.heapTotal / 1024 / 1024), // MB
        external: Math.round(used.external / 1024 / 1024) // MB
    };
};

// Function to format file size
const formatSize = (bytes) => {
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    if (bytes === 0) return '0 B';
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return Math.round(bytes / Math.pow(1024, i) * 100) / 100 + ' ' + sizes[i];
};

// Function to get MySQL table structure
const getMySQLTableStructure = async (tableName) => {
    try {
        console.log(`📋 Getting MySQL table structure for: ${tableName}`);
        
        // Get table structure
        const [columns] = await mysqlPromisePool.execute(`DESCRIBE ${tableName}`);
        
        console.log('🔍 MySQL Table Structure:');
        columns.forEach(col => {
            console.log(`   ${col.Field}: ${col.Type} ${col.Null === 'NO' ? 'NOT NULL' : 'NULL'} ${col.Key ? `(${col.Key})` : ''} ${col.Default !== null ? `DEFAULT ${col.Default}` : ''}`);
        });
        
        return columns;
    } catch (error) {
        console.error('❌ Error getting MySQL table structure:', error.message);
        throw error;
    }
};

// Function to get total row count
const getTotalRowCount = async (tableName) => {
    try {
        const [result] = await mysqlPromisePool.execute(`SELECT COUNT(*) as total FROM ${tableName}`);
        return result[0].total;
    } catch (error) {
        console.error('❌ Error getting row count:', error.message);
        throw error;
    }
};

// Function to get estimated table size
const getTableSize = async (tableName) => {
    try {
        const [result] = await mysqlPromisePool.execute(`
            SELECT 
                ROUND(((data_length + index_length) / 1024 / 1024), 2) AS 'size_mb'
            FROM information_schema.tables 
            WHERE table_name = ? AND table_schema = DATABASE()
        `, [tableName]);
        
        return result[0] ? result[0].size_mb : 0;
    } catch (error) {
        console.log('⚠️  Could not get table size estimate');
        return 0;
    }
};

// Function to convert MySQL data type to PostgreSQL
const convertDataType = (mysqlType) => {
    const type = mysqlType.toLowerCase();
    
    // Handle common MySQL to PostgreSQL type conversions
    if (type.includes('int(')) return 'INTEGER';
    if (type.includes('bigint')) return 'BIGINT';
    if (type.includes('smallint')) return 'SMALLINT';
    if (type.includes('tinyint(1)')) return 'BOOLEAN';
    if (type.includes('tinyint')) return 'INTEGER'; // Changed from SMALLINT to INTEGER for better compatibility
    if (type.includes('varchar')) {
        const match = type.match(/varchar\((\d+)\)/);
        return match ? `VARCHAR(${match[1]})` : 'VARCHAR(255)';
    }
    if (type.includes('text')) return 'TEXT';
    if (type.includes('longtext')) return 'TEXT';
    if (type.includes('mediumtext')) return 'TEXT';
    if (type.includes('decimal')) {
        const match = type.match(/decimal\((\d+),(\d+)\)/);
        return match ? `DECIMAL(${match[1]},${match[2]})` : 'DECIMAL';
    }
    if (type.includes('float')) return 'REAL';
    if (type.includes('double')) return 'DOUBLE PRECISION';
    if (type.includes('datetime')) return 'TIMESTAMP';
    if (type.includes('timestamp')) return 'TIMESTAMP';
    if (type.includes('date')) return 'DATE';
    if (type.includes('time')) return 'TIME';
    if (type.includes('json')) return 'JSON';
    if (type.includes('enum')) return 'VARCHAR(50)'; // Convert enum to varchar
    
    // Default fallback
    return 'TEXT';
};

// Function to convert MySQL default values to PostgreSQL
const convertDefaultValue = (defaultValue, dataType) => {
    if (defaultValue === null || defaultValue === 'NULL') {
        return null;
    }
    
    const defaultStr = defaultValue.toString().toLowerCase();
    
    // Handle MySQL timestamp functions
    if (defaultStr.includes('current_timestamp') || defaultStr.includes('now()')) {
        return 'CURRENT_TIMESTAMP';
    }
    
    // Handle other common defaults
    if (defaultStr === '0' || defaultStr === 0) {
        return '0';
    }
    
    if (defaultStr === '1' || defaultStr === 1) {
        return '1';
    }
    
    // For string defaults, wrap in quotes
    if (typeof defaultValue === 'string' && !defaultStr.includes('current_timestamp')) {
        return `'${defaultValue}'`;
    }
    
    return defaultValue;
};

// Function to create PostgreSQL table
const createPostgreSQLTable = async (tableName, columns) => {
    try {
        console.log(`\n🔨 Creating PostgreSQL table: ${tableName}`);
        
        // Drop table if exists
        await postgresPool.query(`DROP TABLE IF EXISTS ${tableName}`);
        
        // Build CREATE TABLE statement
        let createSQL = `CREATE TABLE ${tableName} (\n`;
        
        const columnDefinitions = columns.map(col => {
            let definition = `    ${col.Field} ${convertDataType(col.Type)}`;
            
            // Handle NOT NULL
            if (col.Null === 'NO' && col.Key !== 'PRI') {
                definition += ' NOT NULL';
            }
            
            // Handle DEFAULT values
            const convertedDefault = convertDefaultValue(col.Default, col.Type);
            if (convertedDefault !== null) {
                definition += ` DEFAULT ${convertedDefault}`;
            }
            
            return definition;
        });
        
        createSQL += columnDefinitions.join(',\n');
        
        // Handle PRIMARY KEY
        const primaryKey = columns.find(col => col.Key === 'PRI');
        if (primaryKey) {
            createSQL += `,\n    PRIMARY KEY (${primaryKey.Field})`;
        }
        
        createSQL += '\n)';
        
        console.log('📝 PostgreSQL CREATE TABLE statement:');
        console.log(createSQL);
        
        await postgresPool.query(createSQL);
        console.log('✅ PostgreSQL table created successfully');
        
    } catch (error) {
        console.error('❌ Error creating PostgreSQL table:', error.message);
        throw error;
    }
};

// Function to copy data using streaming approach for large tables
const copyTableDataStream = async (tableName, totalRows, columns) => {
    try {
        console.log(`\n📊 Starting streaming data copy...`);
        console.log(`📈 Total rows to copy: ${totalRows.toLocaleString()}`);
        
        const columnNames = columns.map(col => col.Field).join(', ');
        let totalInserted = 0;
        let batchCount = 0;
        let offset = 0;
        
        const startTime = Date.now();
        let lastProgressTime = startTime;
        
        console.log(`🔄 Processing in batches of ${CONFIG.BATCH_SIZE} records...`);
        console.log(`📊 Memory monitoring enabled\n`);
        
        while (offset < totalRows) {
            const limit = Math.min(CONFIG.STREAM_LIMIT, totalRows - offset);
            
            try {
                // Fetch data in chunks to avoid memory overload
                console.log(`📥 Fetching records ${offset + 1} to ${offset + limit}...`);
                
                const [rows] = await mysqlPromisePool.execute(
                    `SELECT * FROM ${tableName} LIMIT ${limit} OFFSET ${offset}`
                );
                
                if (rows.length === 0) break;
                
                // Process fetched data in smaller batches
                for (let i = 0; i < rows.length; i += CONFIG.BATCH_SIZE) {
                    const batch = rows.slice(i, i + CONFIG.BATCH_SIZE);
                    batchCount++;
                    
                    let retries = 0;
                    let batchInserted = false;
                    
                    while (retries < CONFIG.MAX_RETRIES && !batchInserted) {
                        try {
                            // Prepare batch insert
                            const values = [];
                            const placeholders = [];
                            let parameterIndex = 1;
                            
                            batch.forEach(row => {
                                const rowPlaceholders = [];
                                columns.forEach(col => {
                                    let value = row[col.Field];
                                    
                                    if (value instanceof Date) {
                                        value = value.toISOString();
                                    }
                                    
                                    values.push(value);
                                    rowPlaceholders.push(`$${parameterIndex++}`);
                                });
                                placeholders.push(`(${rowPlaceholders.join(', ')})`);
                            });
                            
                            const batchInsertSQL = `INSERT INTO ${tableName} (${columnNames}) VALUES ${placeholders.join(', ')}`;
                            
                            await postgresPool.query(batchInsertSQL, values);
                            
                            totalInserted += batch.length;
                            batchInserted = true;
                            
                            // Progress reporting every 5 seconds
                            const currentTime = Date.now();
                            if (currentTime - lastProgressTime > 5000) {
                                const progress = ((totalInserted / totalRows) * 100).toFixed(1);
                                const elapsed = currentTime - startTime;
                                const speed = Math.round(totalInserted / (elapsed / 1000));
                                const eta = totalInserted > 0 ? Math.round((totalRows - totalInserted) / speed) : 0;
                                
                                console.log(`   📊 Progress: ${progress}% (${totalInserted.toLocaleString()}/${totalRows.toLocaleString()}) | Speed: ${speed} rec/sec | ETA: ${eta}s`);
                                lastProgressTime = currentTime;
                            }
                            
                            // Memory monitoring
                            if (batchCount % CONFIG.MEMORY_CHECK_INTERVAL === 0) {
                                const memory = getMemoryUsage();
                                if (memory.heapUsed > 1000) { // Warning if > 1GB
                                    console.log(`   ⚠️  Memory usage: ${memory.heapUsed}MB heap, ${memory.rss}MB total`);
                                    
                                    if (memory.heapUsed > 2000) { // Force garbage collection if > 2GB
                                        if (global.gc) {
                                            global.gc();
                                            console.log('   🧹 Forced garbage collection');
                                        }
                                    }
                                }
                            }
                            
                        } catch (error) {
                            retries++;
                            console.error(`❌ Batch ${batchCount} failed (attempt ${retries}/${CONFIG.MAX_RETRIES}):`, error.message);
                            
                            if (retries >= CONFIG.MAX_RETRIES) {
                                console.error(`❌ Batch ${batchCount} failed permanently, skipping...`);
                                break;
                            }
                            
                            // Wait before retry
                            await new Promise(resolve => setTimeout(resolve, 1000 * retries));
                        }
                    }
                }
                
                offset += rows.length;
                
                // Checkpoint progress
                if (totalInserted % CONFIG.CHECKPOINT_INTERVAL === 0) {
                    console.log(`   💾 Checkpoint: ${totalInserted.toLocaleString()} records copied`);
                }
                
            } catch (error) {
                console.error('❌ Error fetching data chunk:', error.message);
                throw error;
            }
        }
        
        const endTime = Date.now();
        const totalTime = endTime - startTime;
        const avgSpeed = Math.round(totalInserted / (totalTime / 1000));
        
        console.log(`\n✅ Data copy completed!`);
        console.log(`📊 Total inserted: ${totalInserted.toLocaleString()}/${totalRows.toLocaleString()} records`);
        console.log(`⏱️  Total time: ${formatDuration(totalTime)}`);
        console.log(`🚀 Average speed: ${avgSpeed} records/second`);
        
        if (totalInserted < totalRows) {
            console.log(`⚠️  Warning: ${totalRows - totalInserted} records were not copied`);
        }
        
        return totalInserted;
        
    } catch (error) {
        console.error('❌ Error in streaming data copy:', error.message);
        throw error;
    }
};

// Function to verify copied data
const verifyData = async (tableName) => {
    try {
        console.log(`\n🔍 Verifying copied data...`);
        
        // Count rows in MySQL
        const [mysqlCount] = await mysqlPromisePool.execute(`SELECT COUNT(*) as count FROM ${tableName}`);
        
        // Count rows in PostgreSQL
        const postgresResult = await postgresPool.query(`SELECT COUNT(*) as count FROM ${tableName}`);
        const postgresCount = postgresResult.rows[0];
        
        console.log(`📊 MySQL rows: ${mysqlCount[0].count}`);
        console.log(`📊 PostgreSQL rows: ${postgresCount.count}`);
        
        if (mysqlCount[0].count === parseInt(postgresCount.count)) {
            console.log('✅ Data verification successful - row counts match!');
            
            // Show sample data from both databases
            console.log('\n📋 Sample data from PostgreSQL:');
            const sampleResult = await postgresPool.query(`SELECT * FROM ${tableName} LIMIT 3`);
            console.table(sampleResult.rows);
            
        } else {
            console.log('⚠️  Warning: Row counts do not match!');
        }
        
    } catch (error) {
        console.error('❌ Error verifying data:', error.message);
        throw error;
    }
};

// Function to format duration
const formatDuration = (milliseconds) => {
    const seconds = Math.floor(milliseconds / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    
    if (hours > 0) {
        return `${hours}h ${minutes % 60}m ${seconds % 60}s`;
    } else if (minutes > 0) {
        return `${minutes}m ${seconds % 60}s`;
    } else if (seconds > 0) {
        return `${seconds}.${String(milliseconds % 1000).padStart(3, '0').substr(0, 2)}s`;
    } else {
        return `${milliseconds}ms`;
    }
};

// Main function for large table copy
const copyTable = async () => {
    const tableName = 'users';
    const overallStartTime = Date.now();
    
    try {
        console.log('🚀 OPTIMIZED LARGE TABLE COPY PROCESS');
        console.log('='.repeat(60));
        console.log(`📋 Table: ${tableName}`);
        console.log(`🔄 MySQL → PostgreSQL`);
        console.log(`⏰ Start Time: ${new Date(overallStartTime).toLocaleString()}`);
        
        // Get initial memory usage
        const initialMemory = getMemoryUsage();
        console.log(`💾 Initial Memory: ${initialMemory.heapUsed}MB heap, ${initialMemory.rss}MB total`);
        
        // Step 1: Analyze table
        console.log('\n📋 Step 1: Analyzing MySQL table...');
        const step1Start = Date.now();
        
        const [columns, totalRows, tableSize] = await Promise.all([
            getMySQLTableStructure(tableName),
            getTotalRowCount(tableName),
            getTableSize(tableName)
        ]);
        
        const step1Duration = Date.now() - step1Start;
        
        console.log(`📊 Table Statistics:`);
        console.log(`   Rows: ${totalRows.toLocaleString()}`);
        console.log(`   Estimated Size: ${tableSize}MB (${formatSize(tableSize * 1024 * 1024)})`);
        console.log(`   Columns: ${columns.length}`);
        console.log(`⏱️  Duration: ${formatDuration(step1Duration)}`);
        
        // Check if table is really large
        if (totalRows > 1000000 || tableSize > 1000) {
            console.log(`\n⚠️  LARGE TABLE DETECTED!`);
            console.log(`📊 Estimated processing time: ${Math.round(totalRows / 5000)} seconds`);
            console.log(`💾 Using optimized streaming approach`);
            console.log(`🔧 Configuration:`);
            console.log(`   Batch Size: ${CONFIG.BATCH_SIZE} records`);
            console.log(`   Stream Limit: ${CONFIG.STREAM_LIMIT} records`);
            console.log(`   Max Retries: ${CONFIG.MAX_RETRIES}`);
        }
        
        // Step 2: Create PostgreSQL table
        console.log('\n🔨 Step 2: Creating PostgreSQL table...');
        const step2Start = Date.now();
        await createPostgreSQLTable(tableName, columns);
        const step2Duration = Date.now() - step2Start;
        console.log(`⏱️  Duration: ${formatDuration(step2Duration)}`);
        
        // Step 3: Stream copy data
        console.log('\n📊 Step 3: Streaming data copy...');
        const step3Start = Date.now();
        const copiedRows = await copyTableDataStream(tableName, totalRows, columns);
        const step3Duration = Date.now() - step3Start;
        console.log(`⏱️  Duration: ${formatDuration(step3Duration)}`);
        
        // Step 4: Verify data (quick count check only for large tables)
        console.log('\n🔍 Step 4: Verifying data...');
        const step4Start = Date.now();
        
        // For large tables, just do count verification
        const postgresResult = await postgresPool.query(`SELECT COUNT(*) as count FROM ${tableName}`);
        const postgresCount = parseInt(postgresResult.rows[0].count);
        
        console.log(`📊 MySQL rows: ${totalRows.toLocaleString()}`);
        console.log(`📊 PostgreSQL rows: ${postgresCount.toLocaleString()}`);
        
        if (totalRows === postgresCount) {
            console.log('✅ Data verification successful - row counts match!');
        } else {
            console.log(`⚠️  Warning: Row counts do not match! Difference: ${Math.abs(totalRows - postgresCount)}`);
        }
        
        const step4Duration = Date.now() - step4Start;
        console.log(`⏱️  Duration: ${formatDuration(step4Duration)}`);
        
        // Final summary
        const overallEndTime = Date.now();
        const totalDuration = overallEndTime - overallStartTime;
        const finalMemory = getMemoryUsage();
        
        console.log('\n' + '='.repeat(60));
        console.log('🎉 LARGE TABLE COPY COMPLETED!');
        console.log('='.repeat(60));
        console.log(`✅ Successfully copied ${copiedRows.toLocaleString()}/${totalRows.toLocaleString()} records`);
        console.log(`⏰ Start Time: ${new Date(overallStartTime).toLocaleString()}`);
        console.log(`⏰ End Time:   ${new Date(overallEndTime).toLocaleString()}`);
        console.log(`⏱️  Total Time: ${formatDuration(totalDuration)}`);
        console.log(`💾 Peak Memory: ${Math.max(initialMemory.heapUsed, finalMemory.heapUsed)}MB heap`);
        console.log(`📊 Average Speed: ${Math.round(copiedRows / (totalDuration / 1000))} records/second`);
        
        console.log('\n📊 Performance Breakdown:');
        console.log(`   Analysis:     ${formatDuration(step1Duration)} (${((step1Duration/totalDuration)*100).toFixed(1)}%)`);
        console.log(`   Table Setup:  ${formatDuration(step2Duration)} (${((step2Duration/totalDuration)*100).toFixed(1)}%)`);
        console.log(`   Data Copy:    ${formatDuration(step3Duration)} (${((step3Duration/totalDuration)*100).toFixed(1)}%)`);
        console.log(`   Verification: ${formatDuration(step4Duration)} (${((step4Duration/totalDuration)*100).toFixed(1)}%)`);
        
        if (copiedRows === totalRows) {
            console.log('\n✅ SUCCESS: All records copied successfully!');
        } else {
            console.log(`\n⚠️  PARTIAL SUCCESS: ${totalRows - copiedRows} records failed to copy`);
        }
        
    } catch (error) {
        const overallEndTime = Date.now();
        const totalDuration = overallEndTime - overallStartTime;
        
        console.log('\n' + '='.repeat(60));
        console.error('❌ LARGE TABLE COPY FAILED!');
        console.log('='.repeat(60));
        console.error(`Error: ${error.message}`);
        console.log(`⏰ Start Time: ${new Date(overallStartTime).toLocaleString()}`);
        console.log(`⏰ End Time:   ${new Date(overallEndTime).toLocaleString()}`);
        console.log(`⏱️  Time Before Failure: ${formatDuration(totalDuration)}`);
        
        process.exit(1);
    } finally {
        process.exit(0);
    }
};

// Run the copy process
copyTable();
