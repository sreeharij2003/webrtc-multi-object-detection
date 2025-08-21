/**
 * WebRTC VLM Detection - Phone Application
 * Handles camera capture and streaming from mobile devices
 */

import { io } from 'socket.io-client';

class PhoneApp {
    constructor() {
        this.socket = null;
        this.peerConnection = null;
        this.localStream = null;
        this.dataChannel = null;
        
        this.config = {
            iceServers: [
                { urls: 'stun:stun.l.google.com:19302' },
                { urls: 'stun:stun1.l.google.com:19302' }
            ]
        };
        
        this.settings = {
            resolution: { width: 640, height: 480 },
            fps: 15,
            quality: 'medium',
            showOverlay: true,
            autoFocus: true
        };
        
        this.state = {
            connected: false,
            cameraActive: false,
            streaming: false,
            currentCamera: 'user' // 'user' or 'environment'
        };
        
        this.stats = {
            framesSent: 0,
            dataRate: 0,
            lastFrameTime: 0
        };
        
        this.elements = {};
        this.bindElements();
        this.setupEventListeners();
    }
    
    bindElements() {
        // Status elements
        this.elements.connectionStatus = document.getElementById('phone-connection-status');
        this.elements.statusText = document.getElementById('phone-status-text');
        
        // Video elements
        this.elements.localVideo = document.getElementById('local-video');
        this.elements.overlayCanvas = document.getElementById('phone-overlay-canvas');
        
        // Control elements
        this.elements.startCamera = document.getElementById('start-camera');
        this.elements.switchCamera = document.getElementById('switch-camera');
        this.elements.toggleTorch = document.getElementById('toggle-torch');
        
        // Info elements
        this.elements.resolution = document.getElementById('phone-resolution');
        this.elements.fps = document.getElementById('phone-fps');
        this.elements.latency = document.getElementById('phone-latency');
        
        // Settings elements
        this.elements.toggleSettings = document.getElementById('toggle-settings');
        this.elements.settingsContent = document.getElementById('settings-content');
        this.elements.resolutionSelect = document.getElementById('resolution-select');
        this.elements.fpsSelect = document.getElementById('fps-select');
        this.elements.qualitySelect = document.getElementById('quality-select');
        this.elements.showOverlay = document.getElementById('show-overlay');
        this.elements.autoFocus = document.getElementById('auto-focus');
        
        // Debug elements
        this.elements.framesSent = document.getElementById('frames-sent');
        this.elements.dataRate = document.getElementById('data-rate');
        this.elements.connectionType = document.getElementById('connection-type');
        
        // Modal elements
        this.elements.loading = document.getElementById('phone-loading');
        this.elements.loadingMessage = document.getElementById('phone-loading-message');
        this.elements.errorModal = document.getElementById('error-modal');
        this.elements.permissionModal = document.getElementById('permission-modal');
    }
    
    setupEventListeners() {
        // Camera controls
        this.elements.startCamera?.addEventListener('click', () => {
            this.startCamera();
        });
        
        this.elements.switchCamera?.addEventListener('click', () => {
            this.switchCamera();
        });
        
        this.elements.toggleTorch?.addEventListener('click', () => {
            this.toggleTorch();
        });
        
        // Settings
        this.elements.toggleSettings?.addEventListener('click', () => {
            this.toggleSettings();
        });
        
        this.elements.resolutionSelect?.addEventListener('change', (e) => {
            this.updateResolution(e.target.value);
        });
        
        this.elements.fpsSelect?.addEventListener('change', (e) => {
            this.updateFPS(parseInt(e.target.value));
        });
        
        this.elements.qualitySelect?.addEventListener('change', (e) => {
            this.updateQuality(e.target.value);
        });
        
        this.elements.showOverlay?.addEventListener('change', (e) => {
            this.settings.showOverlay = e.target.checked;
        });
        
        this.elements.autoFocus?.addEventListener('change', (e) => {
            this.settings.autoFocus = e.target.checked;
            this.updateCameraSettings();
        });
        
        // Modal controls
        document.getElementById('grant-permission')?.addEventListener('click', () => {
            this.requestCameraPermission();
        });
        
        document.getElementById('error-retry')?.addEventListener('click', () => {
            this.hideError();
            this.initialize();
        });
        
        document.getElementById('error-dismiss')?.addEventListener('click', () => {
            this.hideError();
        });
        
        // Prevent screen sleep
        this.preventScreenSleep();
    }
    
    async initialize() {
        try {
            this.showLoading('Connecting to server...');
            
            // Initialize socket connection
            await this.initializeSocket();
            
            // Initialize WebRTC
            await this.initializeWebRTC();
            
            // Join room
            this.joinRoom();
            
            this.hideLoading();
            this.updateStatus('connected', 'Connected');
            
        } catch (error) {
            console.error('Failed to initialize phone app:', error);
            this.showError('Failed to connect: ' + error.message);
        }
    }
    
    async initializeSocket() {
        return new Promise((resolve, reject) => {
            this.socket = io({
                transports: ['websocket', 'polling'],
                timeout: 10000
            });
            
            this.socket.on('connect', () => {
                console.log('Socket connected');
                this.state.connected = true;
                resolve();
            });
            
            this.socket.on('disconnect', () => {
                console.log('Socket disconnected');
                this.state.connected = false;
                this.updateStatus('disconnected', 'Disconnected');
            });
            
            this.socket.on('connect_error', (error) => {
                console.error('Socket connection error:', error);
                reject(error);
            });
            
            // Register as phone client
            this.socket.emit('register', { type: 'phone' });
        });
    }
    
    async initializeWebRTC() {
        this.peerConnection = new RTCPeerConnection(this.config);
        
        // Handle connection state changes
        this.peerConnection.onconnectionstatechange = () => {
            console.log('Connection state:', this.peerConnection.connectionState);
            this.updateConnectionType();
        };
        
        // Handle ICE candidates
        this.peerConnection.onicecandidate = (event) => {
            if (event.candidate) {
                this.socket.emit('ice-candidate', {
                    targetId: this.remoteClientId,
                    candidate: event.candidate
                });
            }
        };
        
        // Handle data channel
        this.peerConnection.ondatachannel = (event) => {
            this.dataChannel = event.channel;
            this.setupDataChannel();
        };
        
        // Setup socket handlers for WebRTC signaling
        this.setupSignalingHandlers();
    }
    
    setupSignalingHandlers() {
        this.socket.on('offer', async (data) => {
            console.log('Received offer from:', data.fromId);
            this.remoteClientId = data.fromId;
            await this.handleOffer(data.offer);
        });
        
        this.socket.on('answer', async (data) => {
            console.log('Received answer from:', data.fromId);
            await this.handleAnswer(data.answer);
        });
        
        this.socket.on('ice-candidate', async (data) => {
            console.log('Received ICE candidate from:', data.fromId);
            await this.handleIceCandidate(data.candidate);
        });
    }
    
    async handleOffer(offer) {
        try {
            await this.peerConnection.setRemoteDescription(offer);
            
            const answer = await this.peerConnection.createAnswer();
            await this.peerConnection.setLocalDescription(answer);
            
            this.socket.emit('answer', {
                targetId: this.remoteClientId,
                answer: answer
            });
            
            console.log('Answer sent');
        } catch (error) {
            console.error('Failed to handle offer:', error);
        }
    }
    
    async handleAnswer(answer) {
        try {
            await this.peerConnection.setRemoteDescription(answer);
            console.log('Answer processed');
        } catch (error) {
            console.error('Failed to handle answer:', error);
        }
    }
    
    async handleIceCandidate(candidate) {
        try {
            await this.peerConnection.addIceCandidate(candidate);
            console.log('ICE candidate added');
        } catch (error) {
            console.error('Failed to add ICE candidate:', error);
        }
    }
    
    setupDataChannel() {
        if (!this.dataChannel) return;
        
        this.dataChannel.onopen = () => {
            console.log('Data channel opened');
            this.state.streaming = true;
        };
        
        this.dataChannel.onclose = () => {
            console.log('Data channel closed');
            this.state.streaming = false;
        };
        
        this.dataChannel.onmessage = (event) => {
            try {
                const data = JSON.parse(event.data);
                this.handleDataChannelMessage(data);
            } catch (error) {
                console.error('Failed to parse data channel message:', error);
            }
        };
    }
    
    handleDataChannelMessage(data) {
        if (data.type === 'detection-result') {
            this.renderDetections(data.detections);
            this.updateLatency(data.endToEndLatency);
        }
    }
    
    joinRoom() {
        const roomId = 'main-room'; // Simple room for demo
        this.socket.emit('join-room', { roomId });
    }
    
    async startCamera() {
        try {
            this.showLoading('Starting camera...');
            
            const constraints = {
                video: {
                    width: this.settings.resolution.width,
                    height: this.settings.resolution.height,
                    frameRate: this.settings.fps,
                    facingMode: this.state.currentCamera
                },
                audio: false
            };
            
            this.localStream = await navigator.mediaDevices.getUserMedia(constraints);
            this.elements.localVideo.srcObject = this.localStream;
            
            // Add stream to peer connection
            this.localStream.getTracks().forEach(track => {
                this.peerConnection.addTrack(track, this.localStream);
            });
            
            this.state.cameraActive = true;
            this.updateCameraControls();
            this.updateVideoInfo();
            this.startFrameCapture();
            
            this.hideLoading();
            this.updateStatus('connected', 'Camera active');
            
        } catch (error) {
            console.error('Failed to start camera:', error);
            this.hideLoading();
            
            if (error.name === 'NotAllowedError') {
                this.showPermissionModal();
            } else {
                this.showError('Failed to start camera: ' + error.message);
            }
        }
    }
    
    async switchCamera() {
        if (!this.state.cameraActive) return;
        
        try {
            this.state.currentCamera = this.state.currentCamera === 'user' ? 'environment' : 'user';
            
            // Stop current stream
            if (this.localStream) {
                this.localStream.getTracks().forEach(track => track.stop());
            }
            
            // Start new stream with different camera
            await this.startCamera();
            
        } catch (error) {
            console.error('Failed to switch camera:', error);
            this.showError('Failed to switch camera: ' + error.message);
        }
    }
    
    async toggleTorch() {
        if (!this.localStream) return;
        
        try {
            const videoTrack = this.localStream.getVideoTracks()[0];
            const capabilities = videoTrack.getCapabilities();
            
            if (capabilities.torch) {
                const settings = videoTrack.getSettings();
                await videoTrack.applyConstraints({
                    advanced: [{ torch: !settings.torch }]
                });
            }
        } catch (error) {
            console.error('Failed to toggle torch:', error);
        }
    }
    
    startFrameCapture() {
        if (!this.state.cameraActive || !this.elements.localVideo) return;
        
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        
        const captureFrame = () => {
            if (!this.state.cameraActive) return;
            
            const video = this.elements.localVideo;
            if (video.readyState === video.HAVE_ENOUGH_DATA) {
                canvas.width = video.videoWidth;
                canvas.height = video.videoHeight;
                ctx.drawImage(video, 0, 0);
                
                // Convert to base64
                const imageData = canvas.toDataURL('image/jpeg', 0.8);
                
                // Send frame data
                this.sendFrame(imageData);
            }
            
            // Schedule next frame
            setTimeout(captureFrame, 1000 / this.settings.fps);
        };
        
        captureFrame();
    }
    
    sendFrame(imageData) {
        if (!this.dataChannel || this.dataChannel.readyState !== 'open') return;
        
        const frameData = {
            type: 'frame',
            frameId: Date.now(),
            captureTs: Date.now(),
            imageData: imageData
        };
        
        try {
            this.dataChannel.send(JSON.stringify(frameData));
            this.stats.framesSent++;
            this.updateStats();
        } catch (error) {
            console.error('Failed to send frame:', error);
        }
    }
    
    renderDetections(detections) {
        if (!this.settings.showOverlay || !detections) return;
        
        const canvas = this.elements.overlayCanvas;
        const video = this.elements.localVideo;
        
        if (!canvas || !video) return;
        
        const ctx = canvas.getContext('2d');
        canvas.width = video.clientWidth;
        canvas.height = video.clientHeight;
        
        // Clear canvas
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        
        // Draw detections
        detections.forEach((detection, index) => {
            this.drawDetection(ctx, detection, canvas.width, canvas.height);
        });
    }
    
    drawDetection(ctx, detection, canvasWidth, canvasHeight) {
        const { label, score, xmin, ymin, xmax, ymax } = detection;
        
        const x = xmin * canvasWidth;
        const y = ymin * canvasHeight;
        const width = (xmax - xmin) * canvasWidth;
        const height = (ymax - ymin) * canvasHeight;
        
        // Draw bounding box
        ctx.strokeStyle = '#00FF00';
        ctx.lineWidth = 2;
        ctx.strokeRect(x, y, width, height);
        
        // Draw label
        ctx.fillStyle = '#00FF00';
        ctx.font = '14px Arial';
        const text = `${label} ${(score * 100).toFixed(0)}%`;
        ctx.fillText(text, x, y - 5);
    }
    
    updateStatus(status, text) {
        if (this.elements.connectionStatus) {
            this.elements.connectionStatus.className = `status-indicator ${status}`;
        }
        
        if (this.elements.statusText) {
            this.elements.statusText.textContent = text;
        }
    }
    
    updateCameraControls() {
        if (this.elements.startCamera) {
            this.elements.startCamera.textContent = this.state.cameraActive ? 'Stop Camera' : 'Start Camera';
        }
        
        if (this.elements.switchCamera) {
            this.elements.switchCamera.disabled = !this.state.cameraActive;
        }
        
        if (this.elements.toggleTorch) {
            this.elements.toggleTorch.disabled = !this.state.cameraActive;
        }
    }
    
    updateVideoInfo() {
        const video = this.elements.localVideo;
        if (!video) return;
        
        if (this.elements.resolution) {
            this.elements.resolution.textContent = `${video.videoWidth}×${video.videoHeight}`;
        }
        
        if (this.elements.fps) {
            this.elements.fps.textContent = this.settings.fps;
        }
    }
    
    updateLatency(latency) {
        if (this.elements.latency) {
            this.elements.latency.textContent = `${latency}ms`;
        }
    }
    
    updateStats() {
        const now = Date.now();
        const timeDiff = (now - this.stats.lastFrameTime) / 1000;
        
        if (timeDiff >= 1.0) {
            this.stats.dataRate = this.stats.framesSent / timeDiff;
            this.stats.lastFrameTime = now;
            this.stats.framesSent = 0;
        }
        
        if (this.elements.framesSent) {
            this.elements.framesSent.textContent = this.stats.framesSent;
        }
        
        if (this.elements.dataRate) {
            this.elements.dataRate.textContent = `${this.stats.dataRate.toFixed(1)} fps`;
        }
    }
    
    updateConnectionType() {
        if (this.elements.connectionType && this.peerConnection) {
            this.elements.connectionType.textContent = this.peerConnection.connectionState;
        }
    }
    
    toggleSettings() {
        const isHidden = this.elements.settingsContent?.classList.contains('hidden');
        
        if (isHidden) {
            this.elements.settingsContent?.classList.remove('hidden');
        } else {
            this.elements.settingsContent?.classList.add('hidden');
        }
    }
    
    updateResolution(value) {
        const [width, height] = value.split('x').map(Number);
        this.settings.resolution = { width, height };
        
        if (this.state.cameraActive) {
            this.startCamera(); // Restart with new resolution
        }
    }
    
    updateFPS(fps) {
        this.settings.fps = fps;
        
        if (this.state.cameraActive) {
            this.startCamera(); // Restart with new FPS
        }
    }
    
    updateQuality(quality) {
        this.settings.quality = quality;
    }
    
    updateCameraSettings() {
        if (!this.localStream) return;
        
        const videoTrack = this.localStream.getVideoTracks()[0];
        if (videoTrack) {
            videoTrack.applyConstraints({
                focusMode: this.settings.autoFocus ? 'continuous' : 'manual'
            }).catch(console.error);
        }
    }
    
    preventScreenSleep() {
        // Request wake lock to prevent screen from sleeping
        if ('wakeLock' in navigator) {
            navigator.wakeLock.request('screen').catch(console.error);
        }
    }
    
    showLoading(message) {
        if (this.elements.loadingMessage) {
            this.elements.loadingMessage.textContent = message;
        }
        this.elements.loading?.classList.remove('hidden');
    }
    
    hideLoading() {
        this.elements.loading?.classList.add('hidden');
    }
    
    showError(message) {
        const errorMessage = document.getElementById('error-message');
        if (errorMessage) {
            errorMessage.textContent = message;
        }
        this.elements.errorModal?.classList.remove('hidden');
    }
    
    hideError() {
        this.elements.errorModal?.classList.add('hidden');
    }
    
    showPermissionModal() {
        this.elements.permissionModal?.classList.remove('hidden');
    }
    
    requestCameraPermission() {
        this.elements.permissionModal?.classList.add('hidden');
        this.startCamera();
    }
}

// Initialize the phone app when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    const app = new PhoneApp();
    app.initialize().catch(console.error);
    
    // Make app globally available for debugging
    window.phoneApp = app;
});
