const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const QRCode = require('qrcode');

const WebRTCSignaling = require('./webrtc/signaling');
const ObjectDetectionService = require('./detection/detection-service');
const MetricsCollector = require('./metrics/metrics-collector');

class WebRTCVLMServer {
    constructor() {
        this.app = express();
        this.server = http.createServer(this.app);
        this.io = socketIo(this.server, {
            cors: {
                origin: "*",
                methods: ["GET", "POST"]
            }
        });
        
        this.port = process.env.PORT || 3000;
        this.mode = process.env.MODE || 'wasm';
        this.signalingPort = process.env.SIGNALING_PORT || 8080;
        
        this.webrtcSignaling = new WebRTCSignaling(this.io);
        this.detectionService = new ObjectDetectionService(this.mode);
        this.metricsCollector = new MetricsCollector();
        
        this.setupMiddleware();
        this.setupRoutes();
        this.setupWebRTC();
    }
    
    setupMiddleware() {
        // Security middleware
        this.app.use(helmet({
            contentSecurityPolicy: {
                directives: {
                    defaultSrc: ["'self'"],
                    scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'"],
                    styleSrc: ["'self'", "'unsafe-inline'"],
                    imgSrc: ["'self'", "data:", "blob:"],
                    mediaSrc: ["'self'", "blob:"],
                    connectSrc: ["'self'", "ws:", "wss:"]
                }
            }
        }));
        
        this.app.use(compression());
        this.app.use(cors());
        this.app.use(express.json({ limit: '50mb' }));
        this.app.use(express.urlencoded({ extended: true, limit: '50mb' }));
        
        // Serve static files
        this.app.use(express.static(path.join(__dirname, '../client/dist')));
        this.app.use('/models', express.static(path.join(__dirname, '../models')));
    }
    
    setupRoutes() {
        // Health check endpoint
        this.app.get('/health', (req, res) => {
            res.json({
                status: 'healthy',
                mode: this.mode,
                timestamp: new Date().toISOString(),
                uptime: process.uptime()
            });
        });
        
        // QR Code generation for phone connection
        this.app.get('/qr', async (req, res) => {
            try {
                const baseUrl = req.get('host');
                const protocol = req.secure ? 'https' : 'http';
                const url = `${protocol}://${baseUrl}/phone`;
                
                const qrCode = await QRCode.toDataURL(url, {
                    width: 256,
                    margin: 2,
                    color: {
                        dark: '#000000',
                        light: '#FFFFFF'
                    }
                });
                
                res.json({ qrCode, url });
            } catch (error) {
                console.error('QR Code generation error:', error);
                res.status(500).json({ error: 'Failed to generate QR code' });
            }
        });
        
        // Phone interface
        this.app.get('/phone', (req, res) => {
            res.sendFile(path.join(__dirname, '../client/dist/phone.html'));
        });
        
        // Desktop interface
        this.app.get('/', (req, res) => {
            res.sendFile(path.join(__dirname, '../client/dist/index.html'));
        });
        
        // API endpoints for detection
        this.app.post('/api/detect', async (req, res) => {
            try {
                const { imageData, frameId, captureTs } = req.body;
                const recvTs = Date.now();
                
                const detections = await this.detectionService.detectObjects(imageData);
                const inferenceTs = Date.now();
                
                const result = {
                    frame_id: frameId,
                    capture_ts: captureTs,
                    recv_ts: recvTs,
                    inference_ts: inferenceTs,
                    detections: detections
                };
                
                // Collect metrics
                this.metricsCollector.recordFrame(result);
                
                res.json(result);
            } catch (error) {
                console.error('Detection error:', error);
                res.status(500).json({ error: 'Detection failed' });
            }
        });
        
        // Metrics endpoint
        this.app.get('/api/metrics', (req, res) => {
            const metrics = this.metricsCollector.getMetrics();
            res.json(metrics);
        });
        
        // Reset metrics
        this.app.post('/api/metrics/reset', (req, res) => {
            this.metricsCollector.reset();
            res.json({ status: 'reset' });
        });
        
        // Configuration endpoint
        this.app.get('/api/config', (req, res) => {
            res.json({
                mode: this.mode,
                signalingPort: this.signalingPort,
                features: {
                    serverDetection: this.mode === 'server',
                    wasmDetection: this.mode === 'wasm',
                    webrtc: true,
                    metrics: true
                }
            });
        });
    }
    
    setupWebRTC() {
        this.io.on('connection', (socket) => {
            console.log(`Client connected: ${socket.id}`);
            
            // Handle WebRTC signaling
            this.webrtcSignaling.handleConnection(socket);
            
            // Handle detection requests via WebSocket
            socket.on('detect-frame', async (data) => {
                try {
                    const { imageData, frameId, captureTs } = data;
                    const recvTs = Date.now();
                    
                    const detections = await this.detectionService.detectObjects(imageData);
                    const inferenceTs = Date.now();
                    
                    const result = {
                        frame_id: frameId,
                        capture_ts: captureTs,
                        recv_ts: recvTs,
                        inference_ts: inferenceTs,
                        detections: detections
                    };
                    
                    // Collect metrics
                    this.metricsCollector.recordFrame(result);
                    
                    // Send result back
                    socket.emit('detection-result', result);
                } catch (error) {
                    console.error('WebSocket detection error:', error);
                    socket.emit('detection-error', { error: error.message });
                }
            });
            
            // Handle metrics requests
            socket.on('get-metrics', () => {
                const metrics = this.metricsCollector.getMetrics();
                socket.emit('metrics-update', metrics);
            });
            
            socket.on('disconnect', () => {
                console.log(`Client disconnected: ${socket.id}`);
            });
        });
    }
    
    async start() {
        try {
            // Initialize detection service
            await this.detectionService.initialize();
            
            // Start server
            this.server.listen(this.port, () => {
                console.log(`🚀 WebRTC VLM Detection Server running on port ${this.port}`);
                console.log(`📱 Mode: ${this.mode}`);
                console.log(`🔗 Local URL: http://localhost:${this.port}`);
                console.log(`📊 Health check: http://localhost:${this.port}/health`);
                console.log(`📱 Phone URL: http://localhost:${this.port}/phone`);
            });
            
        } catch (error) {
            console.error('Failed to start server:', error);
            process.exit(1);
        }
    }
    
    async stop() {
        console.log('Shutting down server...');
        
        if (this.detectionService) {
            await this.detectionService.cleanup();
        }
        
        if (this.server) {
            this.server.close();
        }
        
        console.log('Server stopped');
    }
}

// Handle graceful shutdown
const server = new WebRTCVLMServer();

process.on('SIGINT', async () => {
    console.log('\nReceived SIGINT, shutting down gracefully...');
    await server.stop();
    process.exit(0);
});

process.on('SIGTERM', async () => {
    console.log('\nReceived SIGTERM, shutting down gracefully...');
    await server.stop();
    process.exit(0);
});

// Start the server
server.start().catch(console.error);

module.exports = WebRTCVLMServer;
