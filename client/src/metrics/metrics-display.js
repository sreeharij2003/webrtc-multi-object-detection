/**
 * Metrics Display
 * Handles real-time metrics collection and display
 */

class MetricsDisplay {
    constructor(socket) {
        this.socket = socket;
        this.metrics = {
            frames: [],
            latencies: [],
            fps: 0,
            bandwidth: { uplink: 0, downlink: 0 },
            system: { cpu: 0, memory: 0 }
        };
        
        this.startTime = Date.now();
        this.lastUpdateTime = Date.now();
        this.frameCount = 0;
        this.maxHistorySize = 100;
        
        this.updateInterval = null;
        this.elements = {};
        
        this.bindElements();
    }
    
    bindElements() {
        // Metrics display elements
        this.elements.e2eMedian = document.getElementById('e2e-median');
        this.elements.e2eP95 = document.getElementById('e2e-p95');
        this.elements.processingFps = document.getElementById('processing-fps');
        this.elements.uplinkBw = document.getElementById('uplink-bw');
        this.elements.downlinkBw = document.getElementById('downlink-bw');
        this.elements.cpuUsage = document.getElementById('cpu-usage');
        this.elements.memoryUsage = document.getElementById('memory-usage');
        this.elements.fpsCounter = document.getElementById('fps-counter');
    }
    
    initialize() {
        // Start periodic updates
        this.updateInterval = setInterval(() => {
            this.updateDisplay();
            this.requestServerMetrics();
        }, 1000);
        
        // Listen for server metrics
        this.socket.on('metrics-update', (serverMetrics) => {
            this.updateServerMetrics(serverMetrics);
        });
        
        console.log('Metrics display initialized');
    }
    
    recordFrame(frameResult) {
        const now = Date.now();
        
        // Record frame data
        const frameData = {
            timestamp: now,
            frameId: frameResult.frameId,
            captureTs: frameResult.captureTs,
            recvTs: frameResult.recvTs,
            inferenceTs: frameResult.inferenceTs,
            endToEndLatency: frameResult.endToEndLatency,
            processingTime: frameResult.processingTime,
            detectionCount: frameResult.detections ? frameResult.detections.length : 0
        };
        
        this.metrics.frames.push(frameData);
        this.frameCount++;
        
        // Record latency
        if (frameResult.endToEndLatency) {
            this.metrics.latencies.push(frameResult.endToEndLatency);
        }
        
        // Maintain history size
        if (this.metrics.frames.length > this.maxHistorySize) {
            this.metrics.frames.shift();
        }
        
        if (this.metrics.latencies.length > this.maxHistorySize) {
            this.metrics.latencies.shift();
        }
        
        // Update FPS
        this.updateFPS();
    }
    
    updateFPS() {
        const now = Date.now();
        const timeDiff = (now - this.lastUpdateTime) / 1000;
        
        if (timeDiff >= 1.0) {
            // Calculate FPS over the last second
            const recentFrames = this.metrics.frames.filter(
                frame => now - frame.timestamp <= 1000
            );
            
            this.metrics.fps = recentFrames.length;
            this.lastUpdateTime = now;
        }
    }
    
    updateDisplay() {
        // Update latency metrics
        this.updateLatencyDisplay();
        
        // Update FPS display
        this.updateFPSDisplay();
        
        // Update bandwidth display (if available)
        this.updateBandwidthDisplay();
        
        // Update system metrics (if available)
        this.updateSystemDisplay();
    }
    
    updateLatencyDisplay() {
        if (this.metrics.latencies.length === 0) return;
        
        const sortedLatencies = [...this.metrics.latencies].sort((a, b) => a - b);
        const median = this.calculatePercentile(sortedLatencies, 50);
        const p95 = this.calculatePercentile(sortedLatencies, 95);
        
        if (this.elements.e2eMedian) {
            this.elements.e2eMedian.textContent = Math.round(median);
        }
        
        if (this.elements.e2eP95) {
            this.elements.e2eP95.textContent = Math.round(p95);
        }
    }
    
    updateFPSDisplay() {
        if (this.elements.processingFps) {
            this.elements.processingFps.textContent = this.metrics.fps.toFixed(1);
        }
        
        if (this.elements.fpsCounter) {
            this.elements.fpsCounter.textContent = this.metrics.fps.toFixed(1);
        }
    }
    
    updateBandwidthDisplay() {
        if (this.elements.uplinkBw) {
            this.elements.uplinkBw.textContent = Math.round(this.metrics.bandwidth.uplink);
        }
        
        if (this.elements.downlinkBw) {
            this.elements.downlinkBw.textContent = Math.round(this.metrics.bandwidth.downlink);
        }
    }
    
    updateSystemDisplay() {
        if (this.elements.cpuUsage) {
            this.elements.cpuUsage.textContent = this.metrics.system.cpu.toFixed(1);
        }
        
        if (this.elements.memoryUsage) {
            this.elements.memoryUsage.textContent = Math.round(this.metrics.system.memory);
        }
    }
    
    updateServerMetrics(serverMetrics) {
        if (serverMetrics.bandwidth) {
            this.metrics.bandwidth = serverMetrics.bandwidth;
        }
        
        if (serverMetrics.system) {
            this.metrics.system = serverMetrics.system;
        }
        
        // Update display immediately
        this.updateBandwidthDisplay();
        this.updateSystemDisplay();
    }
    
    requestServerMetrics() {
        if (this.socket && this.socket.connected) {
            this.socket.emit('get-metrics');
        }
    }
    
    calculatePercentile(sortedArray, percentile) {
        if (sortedArray.length === 0) return 0;
        
        const index = Math.ceil((percentile / 100) * sortedArray.length) - 1;
        return sortedArray[Math.max(0, index)];
    }
    
    calculateAverage(array) {
        if (array.length === 0) return 0;
        return array.reduce((sum, val) => sum + val, 0) / array.length;
    }
    
    getCurrentFPS() {
        return this.metrics.fps;
    }
    
    getLatencyStats() {
        if (this.metrics.latencies.length === 0) {
            return { median: 0, p95: 0, average: 0, min: 0, max: 0 };
        }
        
        const sorted = [...this.metrics.latencies].sort((a, b) => a - b);
        
        return {
            median: this.calculatePercentile(sorted, 50),
            p95: this.calculatePercentile(sorted, 95),
            average: this.calculateAverage(sorted),
            min: Math.min(...sorted),
            max: Math.max(...sorted)
        };
    }
    
    getBandwidthStats() {
        return {
            uplink: this.metrics.bandwidth.uplink,
            downlink: this.metrics.bandwidth.downlink
        };
    }
    
    getSystemStats() {
        return {
            cpu: this.metrics.system.cpu,
            memory: this.metrics.system.memory
        };
    }
    
    exportMetrics() {
        const now = Date.now();
        const duration = (now - this.startTime) / 1000;
        const latencyStats = this.getLatencyStats();
        
        return {
            timestamp: new Date().toISOString(),
            duration_seconds: duration,
            
            // Key metrics as specified in requirements
            median_latency_ms: latencyStats.median,
            p95_latency_ms: latencyStats.p95,
            processed_fps: this.metrics.fps,
            uplink_kbps: this.metrics.bandwidth.uplink,
            downlink_kbps: this.metrics.bandwidth.downlink,
            
            // Additional metrics
            total_frames: this.frameCount,
            average_latency_ms: latencyStats.average,
            min_latency_ms: latencyStats.min,
            max_latency_ms: latencyStats.max,
            cpu_usage_percent: this.metrics.system.cpu,
            memory_usage_mb: this.metrics.system.memory,
            
            // Raw data for analysis
            recent_frames: this.metrics.frames.slice(-10),
            recent_latencies: this.metrics.latencies.slice(-10)
        };
    }
    
    reset() {
        this.metrics.frames = [];
        this.metrics.latencies = [];
        this.metrics.fps = 0;
        this.frameCount = 0;
        this.startTime = Date.now();
        this.lastUpdateTime = Date.now();
        
        // Clear display
        this.clearDisplay();
        
        // Request server to reset metrics
        if (this.socket && this.socket.connected) {
            this.socket.emit('reset-metrics');
        }
        
        console.log('Metrics reset');
    }
    
    clearDisplay() {
        const elements = [
            'e2eMedian', 'e2eP95', 'processingFps', 'uplinkBw', 
            'downlinkBw', 'cpuUsage', 'memoryUsage', 'fpsCounter'
        ];
        
        elements.forEach(elementKey => {
            if (this.elements[elementKey]) {
                this.elements[elementKey].textContent = '-';
            }
        });
    }
    
    getRealtimeStats() {
        return {
            fps: this.metrics.fps,
            latency: this.getLatencyStats(),
            bandwidth: this.getBandwidthStats(),
            system: this.getSystemStats(),
            frameCount: this.frameCount,
            duration: (Date.now() - this.startTime) / 1000
        };
    }
    
    cleanup() {
        if (this.updateInterval) {
            clearInterval(this.updateInterval);
            this.updateInterval = null;
        }
        
        // Remove socket listeners
        if (this.socket) {
            this.socket.off('metrics-update');
        }
        
        this.metrics = {
            frames: [],
            latencies: [],
            fps: 0,
            bandwidth: { uplink: 0, downlink: 0 },
            system: { cpu: 0, memory: 0 }
        };
        
        console.log('Metrics display cleaned up');
    }
}

export { MetricsDisplay };
