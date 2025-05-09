// backend/server.js
const express = require('express');
const dotenv = require('dotenv');
const cors = require('cors');
const path = require('path');
const multer = require('multer');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const mongoSanitize = require('express-mongo-sanitize');
const xss = require('xss-clean');
const hpp = require('hpp');
const cookieParser = require('cookie-parser');
const connectDB = require('./config/db');

// Load Environment Variables
dotenv.config();

// Connect to Database
connectDB();

// Require Route Files
const authRoutes = require('./routes/authRoutes');
const userRoutes = require('./routes/userRoutes');
const postRoutes = require('./routes/postRoutes');
const adminRoutes = require('./routes/adminRoutes');
const storyRoutes = require('./routes/storyRoutes');
const eventRoutes = require('./routes/eventRoutes');
const businessRoutes = require('./routes/businessRoutes');

const app = express();

// Security Middleware
app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            styleSrc: ["'self'", "'unsafe-inline'", "https:"],
            scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'", "https:"],
            imgSrc: ["'self'", "data:", "blob:", "https:"],
            connectSrc: ["'self'", "https:", "wss:"]
        }
    },
    crossOriginEmbedderPolicy: false,
    crossOriginResourcePolicy: { policy: "cross-origin" }
}));

// Rate limiting
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // limit each IP to 100 requests per windowMs
    message: 'Too many requests from this IP, please try again after 15 minutes',
    standardHeaders: true,
    legacyHeaders: false
});
app.use('/api/', limiter);

// CORS Configuration
const corsOptions = {
    origin: process.env.NODE_ENV === 'production' 
        ? process.env.FRONTEND_URL 
        : ['http://localhost:3000', 'http://127.0.0.1:3000'],
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept'],
    credentials: true,
    maxAge: 600,
    exposedHeaders: ['Content-Range', 'X-Content-Range']
};
app.use(cors(corsOptions));

// Body Parsers with increased security
app.use(express.json({ 
    limit: '10mb',
    verify: (req, res, buf) => {
        req.rawBody = buf.toString();
    }
}));
app.use(express.urlencoded({ 
    extended: true, 
    limit: '10mb'
}));
app.use(cookieParser(process.env.COOKIE_SECRET));

// Data Sanitization
app.use(mongoSanitize());
app.use(xss());
app.use(hpp({
    whitelist: [
        'date',
        'type',
        'limit',
        'page',
        'sort',
        'fields'
    ]
}));

// Custom security middleware
app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('X-XSS-Protection', '1; mode=block');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    next();
});

// Static File Serving with Security Headers
app.use('/uploads', express.static(path.join(__dirname, 'uploads'), {
    setHeaders: (res, path) => {
        res.set('X-Content-Type-Options', 'nosniff');
        res.set('Cache-Control', 'public, max-age=3600');
        if (path.endsWith('.html')) {
            res.set('X-Frame-Options', 'DENY');
        }
    },
    maxAge: '1d'
}));

// Default Avatar Handler with Error Handling
app.get('/uploads/profile-pics/default_avatar.png', (req, res) => {
    const defaultAvatarPath = path.join(__dirname, 'uploads', 'profile-pics', 'default_avatar.png');
    res.sendFile(defaultAvatarPath, {
        headers: {
            'Cache-Control': 'public, max-age=86400',
            'X-Content-Type-Options': 'nosniff'
        }
    }, (err) => {
        if (err && !res.headersSent) {
            console.error("Error sending default avatar:", err);
            res.status(err.status || 404).json({
                success: false,
                message: 'Default avatar not found'
            });
        }
    });
});

// API Routes with version prefix
const apiRouter = express.Router();
apiRouter.use('/auth', authRoutes);
apiRouter.use('/users', userRoutes);
apiRouter.use('/posts', postRoutes);
apiRouter.use('/stories', storyRoutes);
apiRouter.use('/events', eventRoutes);
apiRouter.use('/businesses', businessRoutes);
apiRouter.use('/admin', adminRoutes);

app.use('/api/v1', apiRouter);

// Health Check Route
app.get('/health', (req, res) => {
    res.status(200).json({
        status: 'healthy',
        environment: process.env.NODE_ENV || 'development',
        timestamp: new Date().toISOString(),
        uptime: process.uptime()
    });
});

// API 404 Handler
app.use('/api/*', (req, res) => {
    res.status(404).json({
        success: false,
        message: `API endpoint not found: ${req.originalUrl}`,
        timestamp: new Date().toISOString()
    });
});

// Enhanced Error Handler
app.use((err, req, res, next) => {
    // Log error details
    console.error(`
--------------------ERROR LOG--------------------
Timestamp: ${new Date().toISOString()}
Method: ${req.method}
Path: ${req.path}
Error: ${err.message}
${process.env.NODE_ENV === 'development' ? `Stack: ${err.stack}` : ''}
------------------------------------------------
    `);
    
    // Initialize error response
    let statusCode = err.statusCode || 500;
    let message = err.message || 'Internal Server Error';
    let errorDetails = {};

    // Error type handling
    switch (true) {
        case err instanceof multer.MulterError:
            statusCode = 400;
            message = `File Upload Error: ${err.code}`;
            errorDetails = { 
                code: err.code,
                field: err.field
            };
            break;

        case err.name === 'ValidationError':
            statusCode = 400;
            message = 'Validation Error';
            errorDetails = Object.values(err.errors).reduce((acc, curr) => {
                acc[curr.path] = curr.message;
                return acc;
            }, {});
            break;

        case err.name === 'CastError':
            statusCode = 400;
            message = 'Invalid Data Format';
            errorDetails = { 
                path: err.path,
                value: err.value
            };
            break;

        case err.code === 11000:
            statusCode = 400;
            const field = Object.keys(err.keyValue)[0];
            message = `Duplicate Entry`;
            errorDetails = { 
                field,
                value: err.keyValue[field]
            };
            break;

        case err.name === 'JsonWebTokenError':
            statusCode = 401;
            message = 'Invalid Authentication Token';
            break;

        case err.name === 'TokenExpiredError':
            statusCode = 401;
            message = 'Authentication Token Expired';
            break;
    }

    // Sanitize response for production
    const response = {
        success: false,
        message,
        status: statusCode,
        timestamp: new Date().toISOString(),
        ...(process.env.NODE_ENV === 'development' && {
            details: errorDetails,
            stack: err.stack
        })
    };

    // Send response
    res.status(statusCode).json(response);
});

// Server Initialization
const PORT = process.env.PORT || 5000;
let server;

const startServer = async () => {
    try {
        server = app.listen(PORT, () => {
            console.log(`
Server Started Successfully!
Environment: ${process.env.NODE_ENV || 'development'}
Port: ${PORT}
Timestamp: ${new Date().toISOString()}
API Health Check: http://localhost:${PORT}/health
            `);
        });

        // Configure server timeout
        server.timeout = 30000; // 30 seconds
        server.keepAliveTimeout = 65000;
        server.headersTimeout = 66000;

    } catch (error) {
        console.error('Failed to start server:', error);
        process.exit(1);
    }
};

startServer();

// Graceful Shutdown Handler
const gracefulShutdown = async (signal) => {
    console.log(`\n${signal} received. Starting graceful shutdown...`);
    
    // Set a timeout for forceful shutdown
    const forceExit = setTimeout(() => {
        console.error('Could not close connections in time, forcefully shutting down');
        process.exit(1);
    }, 30000);
    
    try {
        // Close server
        if (server) {
            await new Promise((resolve) => server.close(resolve));
            console.log('Server closed');
        }
        
        // Close database connection (assuming mongoose)
        if (mongoose.connection.readyState === 1) {
            await mongoose.connection.close();
            console.log('Database connection closed');
        }
        
        clearTimeout(forceExit);
        console.log('Graceful shutdown completed');
        process.exit(0);
        
    } catch (err) {
        console.error('Error during graceful shutdown:', err);
        clearTimeout(forceExit);
        process.exit(1);
    }
};

// Process Handlers
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// Unhandled Promise Rejection Handler
process.on('unhandledRejection', (err) => {
    console.error('UNHANDLED REJECTION! Shutting down...');
    console.error(err.name, err.message);
    gracefulShutdown('Unhandled Promise Rejection');
});

// Uncaught Exception Handler
process.on('uncaughtException', (err) => {
    console.error('UNCAUGHT EXCEPTION! Shutting down...');
    console.error(err.name, err.message);
    process.exit(1);
});

module.exports = app;
