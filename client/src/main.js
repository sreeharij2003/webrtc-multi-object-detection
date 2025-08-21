/**
 * WebRTC VLM Detection - Desktop Application
 * Main entry point for the desktop interface
 */

import { io } from 'socket.io-client';
import { WebRTCManager } from './webrtc/webrtc-manager.js';
import { DetectionManager } from './detection/detection-manager.js';
import { OverlayRenderer } from './rendering/overlay-renderer.js';
import { MetricsDisplay } from './metrics/metrics-display.js';
import { Logger } from './utils/logger.js';

class DesktopApp {
    constructor() {
        this.socket = null;
        this.webrtcManager = null;
        this.detectionManager = null;
        this.overlayRenderer = null;
        this.metricsDisplay = null;
        this.logger = new Logger('DesktopApp');
        
        this.config = {
            mode: 'wasm',
            signalingPort: 8080,
            features: {}
        };
        
        this.state = {
            connected: false,
            detectionActive: false,
            phoneConnected: false,
            currentRoom: null
        };
        
        this.elements = {};
        this.bindElements();
        this.setupEventListeners();
    }
    
    bindElements() {
        // Status elements
        this.elements.modeIndicator = document.getElementById('mode-indicator');
        this.elements.connectionStatus = document.getElementById('connection-status');
        this.elements.fpsCounter = document.getElementById('fps-counter');
        
        // QR code elements
        this.elements.qrCode = document.getElementById('qr-code');
        this.elements.phoneUrl = document.getElementById('phone-url');
        this.elements.copyUrl = document.getElementById('copy-url');
        
        // Video elements
        this.elements.remoteVideo = document.getElementById('remote-video');
        this.elements.overlayCanvas = document.getElementById('overlay-canvas');
        this.elements.toggleDetection = document.getElementById('toggle-detection');
        this.elements.toggleFullscreen = document.getElementById('toggle-fullscreen');
        
        // Info elements
        this.elements.videoResolution = document.getElementById('video-resolution');
        this.elements.latencyDisplay = document.getElementById('latency-display');
        this.elements.detectionCount = document.getElementById('detection-count');
        
        // Metrics elements
        this.elements.e2eMedian = document.getElementById('e2e-median');
        this.elements.e2eP95 = document.getElementById('e2e-p95');
        this.elements.processingFps = document.getElementById('processing-fps');
        this.elements.uplinkBw = document.getElementById('uplink-bw');
        this.elements.downlinkBw = document.getElementById('downlink-bw');
        this.elements.cpuUsage = document.getElementById('cpu-usage');
        this.elements.memoryUsage = document.getElementById('memory-usage');
        
        // Control elements
        this.elements.resetMetrics = document.getElementById('reset-metrics');
        this.elements.exportMetrics = document.getElementById('export-metrics');
        this.elements.toggleDebug = document.getElementById('toggle-debug');
        this.elements.clearLogs = document.getElementById('clear-logs');
        
        // Debug elements
        this.elements.debugPanel = document.getElementById('debug-panel');
        this.elements.logOutput = document.getElementById('log-output');
        this.elements.webrtcStats = document.getElementById('webrtc-stats');
        this.elements.detectionInfo = document.getElementById('detection-info');
        
        // Loading overlay
        this.elements.loadingOverlay = document.getElementById('loading-overlay');
        this.elements.loadingMessage = document.getElementById('loading-message');
    }
    
    setupEventListeners() {
        // Copy URL button
        this.elements.copyUrl?.addEventListener('click', () => {
            this.copyPhoneUrl();
        });
        
        // Detection toggle
        this.elements.toggleDetection?.addEventListener('click', () => {
            this.toggleDetection();
        });
        
        // Fullscreen toggle
        this.elements.toggleFullscreen?.addEventListener('click', () => {
            this.toggleFullscreen();
        });
        
        // Metrics controls
        this.elements.resetMetrics?.addEventListener('click', () => {
            this.resetMetrics();
        });
        
        this.elements.exportMetrics?.addEventListener('click', () => {
            this.exportMetrics();
        });
        
        // Debug controls
        this.elements.toggleDebug?.addEventListener('click', () => {
            this.toggleDebug();
        });
        
        this.elements.clearLogs?.addEventListener('click', () => {
            this.clearLogs();
        });
        
        // Debug tabs
        document.querySelectorAll('.debug-tab').forEach(tab => {
            tab.addEventListener('click', (e) => {
                this.switchDebugTab(e.target.dataset.tab);
            });
        });
        
        // Video events
        this.elements.remoteVideo?.addEventListener('loadedmetadata', () => {
            this.onVideoLoaded();
        });
        
        this.elements.remoteVideo?.addEventListener('resize', () => {
            this.onVideoResize();
        });
    }
    
    async initialize() {
        try {
            this.showLoading('Initializing application...');
            this.logger.info('Starting desktop application initialization');
            
            // Load configuration
            await this.loadConfiguration();
            
            // Initialize socket connection
            await this.initializeSocket();
            
            // Initialize WebRTC manager
            this.webrtcManager = new WebRTCManager(this.socket);
            await this.webrtcManager.initialize();
            
            // Initialize detection manager
            this.detectionManager = new DetectionManager(this.config.mode);
            await this.detectionManager.initialize();
            
            // Initialize overlay renderer
            this.overlayRenderer = new OverlayRenderer(
                this.elements.overlayCanvas,
                this.elements.remoteVideo
            );
            
            // Initialize metrics display
            this.metricsDisplay = new MetricsDisplay(this.socket);
            this.metricsDisplay.initialize();
            
            // Setup WebRTC event handlers
            this.setupWebRTCHandlers();
            
            // Setup detection event handlers
            this.setupDetectionHandlers();
            
            // Generate QR code
            await this.generateQRCode();
            
            // Update UI
            this.updateUI();
            
            this.hideLoading();
            this.logger.info('Desktop application initialized successfully');
            
        } catch (error) {
            this.logger.error('Failed to initialize desktop application:', error);
            this.showError('Failed to initialize application: ' + error.message);
        }
    }
    
    async loadConfiguration() {
        try {
            const response = await fetch('/api/config');
            this.config = await response.json();
            this.logger.info('Configuration loaded:', this.config);
        } catch (error) {
            this.logger.warn('Failed to load configuration, using defaults:', error);
        }
    }
    
    async initializeSocket() {
        return new Promise((resolve, reject) => {
            this.socket = io({
                transports: ['websocket', 'polling'],
                timeout: 10000
            });
            
            this.socket.on('connect', () => {
                this.logger.info('Socket connected');
                this.state.connected = true;
                this.updateConnectionStatus();
                resolve();
            });
            
            this.socket.on('disconnect', () => {
                this.logger.warn('Socket disconnected');
                this.state.connected = false;
                this.updateConnectionStatus();
            });
            
            this.socket.on('connect_error', (error) => {
                this.logger.error('Socket connection error:', error);
                reject(error);
            });
            
            // Register as desktop client
            this.socket.emit('register', { type: 'desktop' });
        });
    }
    
    setupWebRTCHandlers() {
        this.webrtcManager.on('remoteStream', (stream) => {
            this.logger.info('Received remote stream');
            this.elements.remoteVideo.srcObject = stream;
            this.state.phoneConnected = true;
            this.updateUI();
        });
        
        this.webrtcManager.on('connectionStateChange', (state) => {
            this.logger.info('WebRTC connection state:', state);
            this.updateConnectionStatus();
        });
        
        this.webrtcManager.on('dataChannelMessage', (message) => {
            this.handleDataChannelMessage(message);
        });
    }
    
    setupDetectionHandlers() {
        this.detectionManager.on('detectionResult', (result) => {
            this.handleDetectionResult(result);
        });
        
        this.detectionManager.on('error', (error) => {
            this.logger.error('Detection error:', error);
        });
    }
    
    handleDataChannelMessage(message) {
        try {
            const data = JSON.parse(message);
            
            if (data.type === 'frame') {
                this.processFrame(data);
            } else if (data.type === 'metrics') {
                this.updateMetrics(data.metrics);
            }
        } catch (error) {
            this.logger.error('Failed to parse data channel message:', error);
        }
    }
    
    async processFrame(frameData) {
        if (!this.state.detectionActive) return;
        
        try {
            const result = await this.detectionManager.detectObjects(frameData);
            
            // Render overlays
            this.overlayRenderer.renderDetections(result.detections);
            
            // Update metrics
            this.metricsDisplay.recordFrame(result);
            
            // Update UI
            this.updateFrameInfo(result);
            
        } catch (error) {
            this.logger.error('Frame processing error:', error);
        }
    }
    
    handleDetectionResult(result) {
        // Update detection count
        if (this.elements.detectionCount) {
            this.elements.detectionCount.textContent = result.detections.length;
        }
        
        // Update latency display
        if (this.elements.latencyDisplay && result.endToEndLatency) {
            this.elements.latencyDisplay.textContent = `${result.endToEndLatency}ms`;
        }
    }
    
    async generateQRCode() {
        try {
            const response = await fetch('/qr');
            const data = await response.json();
            
            if (data.qrCode) {
                this.elements.qrCode.innerHTML = `<img src="${data.qrCode}" alt="QR Code">`;
            }
            
            if (data.url) {
                this.elements.phoneUrl.value = data.url;
            }
            
        } catch (error) {
            this.logger.error('Failed to generate QR code:', error);
            this.elements.qrCode.innerHTML = '<p>QR code generation failed</p>';
        }
    }
    
    copyPhoneUrl() {
        if (this.elements.phoneUrl) {
            this.elements.phoneUrl.select();
            document.execCommand('copy');
            
            // Show feedback
            const originalText = this.elements.copyUrl.textContent;
            this.elements.copyUrl.textContent = 'Copied!';
            setTimeout(() => {
                this.elements.copyUrl.textContent = originalText;
            }, 2000);
        }
    }
    
    toggleDetection() {
        this.state.detectionActive = !this.state.detectionActive;

        if (this.elements.toggleDetection) {
            this.elements.toggleDetection.textContent =
                this.state.detectionActive ? 'Stop Detection' : 'Start Detection';
        }

        this.logger.info('Detection toggled:', this.state.detectionActive);

        // Test detection immediately when enabled
        if (this.state.detectionActive) {
            this.testDetection();
        }
    }

    async testDetection() {
        console.log('🧪 Testing detection system...');

        // Create mock frame data
        const mockFrameData = {
            frameId: Date.now(),
            captureTs: Date.now(),
            imageData: 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAYEBQYFBAYGBQYHBwYIChAKCgkJChQODwwQFxQYGBcUFhYaHSUfGhsjHBYWICwgIyYnKSopGR8tMC0oMCUoKSj/2wBDAQcHBwoIChMKChMoGhYaKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCj/wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAv/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAAAAX/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIRAxEAPwCdABmX/9k='
        };

        try {
            const result = await this.detectionManager.detectObjects(mockFrameData);
            console.log('🎯 Detection result:', result);

            if (result && result.detections && result.detections.length > 0) {
                console.log('✅ Detection working! Found', result.detections.length, 'objects');

                // Render the detections
                this.overlayRenderer.renderDetections(result.detections);

                // Update metrics
                this.metricsDisplay.recordFrame(result);

                // Update UI
                this.updateFrameInfo(result);
            } else {
                console.log('❌ No detections returned');
            }
        } catch (error) {
            console.error('❌ Detection test failed:', error);
        }
    }
    
    toggleFullscreen() {
        const videoWrapper = this.elements.remoteVideo?.parentElement;
        if (!videoWrapper) return;
        
        if (!document.fullscreenElement) {
            videoWrapper.requestFullscreen().catch(err => {
                this.logger.error('Failed to enter fullscreen:', err);
            });
        } else {
            document.exitFullscreen();
        }
    }
    
    resetMetrics() {
        this.metricsDisplay?.reset();
        this.logger.info('Metrics reset');
    }
    
    exportMetrics() {
        const metrics = this.metricsDisplay?.exportMetrics();
        if (metrics) {
            const blob = new Blob([JSON.stringify(metrics, null, 2)], {
                type: 'application/json'
            });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `metrics-${new Date().toISOString()}.json`;
            a.click();
            URL.revokeObjectURL(url);
        }
    }
    
    toggleDebug() {
        const isHidden = this.elements.debugPanel?.classList.contains('hidden');
        
        if (isHidden) {
            this.elements.debugPanel?.classList.remove('hidden');
            this.elements.toggleDebug.textContent = 'Hide Debug';
        } else {
            this.elements.debugPanel?.classList.add('hidden');
            this.elements.toggleDebug.textContent = 'Show Debug';
        }
    }
    
    switchDebugTab(tabName) {
        // Update tab buttons
        document.querySelectorAll('.debug-tab').forEach(tab => {
            tab.classList.toggle('active', tab.dataset.tab === tabName);
        });
        
        // Update tab content
        document.querySelectorAll('.debug-tab-content').forEach(content => {
            content.classList.toggle('active', content.id === `debug-${tabName}`);
        });
    }
    
    clearLogs() {
        if (this.elements.logOutput) {
            this.elements.logOutput.textContent = '';
        }
        this.logger.clear();
    }
    
    onVideoLoaded() {
        this.logger.info('Video loaded');
        this.overlayRenderer?.updateCanvasSize();
        this.updateVideoInfo();
    }
    
    onVideoResize() {
        this.overlayRenderer?.updateCanvasSize();
        this.updateVideoInfo();
    }
    
    updateVideoInfo() {
        const video = this.elements.remoteVideo;
        if (video && this.elements.videoResolution) {
            this.elements.videoResolution.textContent = 
                `${video.videoWidth}×${video.videoHeight}`;
        }
    }
    
    updateFrameInfo(result) {
        // Update FPS counter
        if (this.elements.fpsCounter) {
            const fps = this.metricsDisplay?.getCurrentFPS() || 0;
            this.elements.fpsCounter.textContent = fps.toFixed(1);
        }
    }
    
    updateConnectionStatus() {
        const status = this.state.connected ? 'connected' : 'disconnected';
        const text = this.state.connected ? 'Connected' : 'Disconnected';
        
        if (this.elements.connectionStatus) {
            this.elements.connectionStatus.textContent = text;
            this.elements.connectionStatus.className = `status-value ${status}`;
        }
    }
    
    updateUI() {
        // Update mode indicator
        if (this.elements.modeIndicator) {
            this.elements.modeIndicator.textContent = this.config.mode.toUpperCase();
        }
        
        // Update connection status
        this.updateConnectionStatus();
        
        // Update detection button state
        if (this.elements.toggleDetection) {
            this.elements.toggleDetection.disabled = !this.state.phoneConnected;
        }
    }
    
    showLoading(message) {
        if (this.elements.loadingMessage) {
            this.elements.loadingMessage.textContent = message;
        }
        this.elements.loadingOverlay?.classList.remove('hidden');
    }
    
    hideLoading() {
        this.elements.loadingOverlay?.classList.add('hidden');
    }
    
    showError(message) {
        this.logger.error(message);
        alert(message); // Simple error display - could be improved
    }
}

// Initialize the application when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    const app = new DesktopApp();
    app.initialize().catch(console.error);
    
    // Make app globally available for debugging
    window.desktopApp = app;
});
