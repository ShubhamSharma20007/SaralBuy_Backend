// index.js - Debug Version
import dotenv from 'dotenv'
dotenv.config();
import express from 'express'
import cors from 'cors'
import http from 'http';
import { logger } from './logger/windston.js';
import router from './routes/index.js';
import mongoCtx from './db/connection.js';
import cookieParser from 'cookie-parser';
import chatHandler from './chatHandler/index.js';
import path from 'path';
import { fileURLToPath } from 'url';
const app = express()
const server = http.createServer(app);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
chatHandler(server);
mongoCtx()


app.use(cors({
  origin :[
  "http://localhost:5173",
  "http://localhost:5174",
  "https://kaleidoscopic-pika-c2b489.netlify.app",
  "https://curious-khapse-f12cd1.netlify.app",
  "https://saralbuy.com"
  ],
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "Cookie"],
    exposedHeaders: ["Set-Cookie"]
}))


app.use(cookieParser());
app.use(express.json({limit:'10mb'}))
app.use(express.urlencoded({ extended: true }))


// app.get('/',(req,res)=>{
//   res.send('Hello World')
// })
app.use((req, res, next) => {
  logger.info(`${req.method} ${req.originalUrl}`);
  next();
});
app.use('/api/v1',router)


app.use(express.static(path.join(__dirname, 'build')));

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'build', 'index.html'));
});



// Start the server
const PORT = process.env.PORT || 8000;
server.listen(PORT, () => {
  console.log('🚀 ================================');
  console.log(`🌟 Server running on port ${PORT}`);
  console.log(`🔗 Health check: http://localhost:${PORT}/health`);
  console.log(`🔌 Socket.IO endpoint: http://localhost:${PORT}`);
  console.log(`🌍 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log('🚀 ================================');
});

// Handle server errors
server.on('error', (error) => {
  console.error('🚫 Server error:', error);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('🛑 SIGTERM received, shutting down gracefully');
  server.close(() => {
    console.log('✅ Server closed');
  });
});

export { server };