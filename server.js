const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const { testConnection, testAllConnections } = require('./config/database');
require('dotenv').config();

// Import routes
const userRoutes = require('./routes/users');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// Health check endpoint
app.get('/health', async (req, res) => {
    const dbStatus = await testAllConnections();
    res.json({
        success: true,
        status: 'healthy',
        databases: {
            mysql: dbStatus.mysql ? 'connected' : 'disconnected',
            postgresql: dbStatus.postgresql ? 'connected' : 'disconnected',
            overall: dbStatus.overall ? 'all connected' : 'some disconnected'
        },
        timestamp: new Date().toISOString()
    });
});

// 404 handler
app.use('*', (req, res) => {
    res.status(404).json({
        success: false,
        message: 'Route not found'
    });
});

// Error handling middleware
app.use((error, req, res, next) => {
    console.error('Unhandled error:', error);
    res.status(500).json({
        success: false,
        message: 'Internal server error',
        error: process.env.NODE_ENV === 'development' ? error.message : 'Something went wrong'
    });
});

// Start server
const startServer = async () => {
    try {
        // Test database connections
        console.log('🔄 Testing database connections...');
        const dbStatus = await testAllConnections();
                
        app.listen(PORT, () => {
            console.log('🚀 Server started successfully!');
            console.log(`📍 Server running on http://localhost:${PORT}`);
            console.log(`📍 API documentation available at http://localhost:${PORT}`);
            console.log(`📍 Health check: http://localhost:${PORT}/health`);
            console.log('💾 Database Status:');
            console.log(`   MySQL: ${dbStatus.mysql ? '✅ Connected' : '❌ Disconnected'}`);
            console.log(`   PostgreSQL: ${dbStatus.postgresql ? '✅ Connected' : '❌ Disconnected'}`);
        });
        
    } catch (error) {
        console.error('❌ Failed to start server:', error);
        process.exit(1);
    }
};

// Handle graceful shutdown
process.on('SIGTERM', () => {
    console.log('🔄 SIGTERM received, shutting down gracefully...');
    process.exit(0);
});

process.on('SIGINT', () => {
    console.log('🔄 SIGINT received, shutting down gracefully...');
    process.exit(0);
});

// Start the server
startServer();
