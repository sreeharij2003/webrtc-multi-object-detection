/**
 * Metrics Collector
 * Collects and analyzes performance metrics for the WebRTC VLM system
 */

class MetricsCollector {
    constructor() {
        this.frames = [];
        this.startTime = Date.now();
        this.lastResetTime = Date.now();
        
        // Performance counters
        this.totalFrames = 0;
        this.processedFrames = 0;
        this.droppedFrames = 0;
        
        // Latency tracking
        this.latencies = {
            endToEnd: [],
            network: [],
            inference: [],
            overlay: []
        };
        
        // Bandwidth tracking
        this.bandwidth = {
            uplink: [],
            downlink: []
        };
        
        // System metrics
        this.systemMetrics = {
            cpuUsage: [],
            memoryUsage: [],
            timestamp: []
        };
        
        // Configuration
        this.maxFrameHistory = 1000;
        this.metricsWindow = 30000; // 30 seconds
        
        // Start system monitoring
        this.startSystemMonitoring();
    }
    
    recordFrame(frameData) {
        const {
            frame_id,
            capture_ts,
            recv_ts,
            inference_ts,
            detections
        } = frameData;
        
        const now = Date.now();
        
        // Calculate latencies
        const networkLatency = recv_ts - capture_ts;
        const inferenceLatency = inference_ts - recv_ts;
        const endToEndLatency = now - capture_ts;
        
        // Store frame data
        const frame = {
            frameId: frame_id,
            captureTs: capture_ts,
            recvTs: recv_ts,
            inferenceTs: inference_ts,
            overlayTs: now,
            networkLatency,
            inferenceLatency,
            endToEndLatency,
            detectionCount: detections ? detections.length : 0,
            timestamp: now
        };
        
        this.frames.push(frame);
        this.totalFrames++;
        this.processedFrames++;
        
        // Update latency arrays
        this.latencies.endToEnd.push(endToEndLatency);
        this.latencies.network.push(networkLatency);
        this.latencies.inference.push(inferenceLatency);
        
        // Maintain frame history limit
        if (this.frames.length > this.maxFrameHistory) {
            this.frames.shift();
        }
        
        // Maintain latency arrays within window
        this.cleanupOldMetrics();
    }
    
    recordDroppedFrame() {
        this.droppedFrames++;
        this.totalFrames++;
    }
    
    recordBandwidth(uplink, downlink) {
        const now = Date.now();
        
        this.bandwidth.uplink.push({
            value: uplink,
            timestamp: now
        });
        
        this.bandwidth.downlink.push({
            value: downlink,
            timestamp: now
        });
        
        // Clean up old bandwidth data
        this.cleanupBandwidthData();
    }
    
    startSystemMonitoring() {
        // Monitor system metrics every 5 seconds
        this.systemMonitorInterval = setInterval(() => {
            this.collectSystemMetrics();
        }, 5000);
    }
    
    collectSystemMetrics() {
        const now = Date.now();
        
        // Get memory usage
        const memUsage = process.memoryUsage();
        const memoryUsageMB = memUsage.heapUsed / 1024 / 1024;
        
        // Get CPU usage (simplified)
        const cpuUsage = process.cpuUsage();
        const cpuPercent = (cpuUsage.user + cpuUsage.system) / 1000000; // Convert to seconds
        
        this.systemMetrics.cpuUsage.push(cpuPercent);
        this.systemMetrics.memoryUsage.push(memoryUsageMB);
        this.systemMetrics.timestamp.push(now);
        
        // Maintain system metrics within window
        this.cleanupSystemMetrics();
    }
    
    cleanupOldMetrics() {
        const cutoffTime = Date.now() - this.metricsWindow;
        
        // Clean up latency arrays
        Object.keys(this.latencies).forEach(key => {
            if (Array.isArray(this.latencies[key])) {
                // For simple arrays, just keep recent entries
                if (this.latencies[key].length > 1000) {
                    this.latencies[key] = this.latencies[key].slice(-500);
                }
            }
        });
        
        // Clean up frames
        this.frames = this.frames.filter(frame => frame.timestamp > cutoffTime);
    }
    
    cleanupBandwidthData() {
        const cutoffTime = Date.now() - this.metricsWindow;
        
        this.bandwidth.uplink = this.bandwidth.uplink.filter(
            entry => entry.timestamp > cutoffTime
        );
        
        this.bandwidth.downlink = this.bandwidth.downlink.filter(
            entry => entry.timestamp > cutoffTime
        );
    }
    
    cleanupSystemMetrics() {
        const cutoffTime = Date.now() - this.metricsWindow;
        
        // Find the index to start keeping data
        let keepIndex = 0;
        for (let i = 0; i < this.systemMetrics.timestamp.length; i++) {
            if (this.systemMetrics.timestamp[i] > cutoffTime) {
                keepIndex = i;
                break;
            }
        }
        
        // Trim all arrays to the same length
        this.systemMetrics.cpuUsage = this.systemMetrics.cpuUsage.slice(keepIndex);
        this.systemMetrics.memoryUsage = this.systemMetrics.memoryUsage.slice(keepIndex);
        this.systemMetrics.timestamp = this.systemMetrics.timestamp.slice(keepIndex);
    }
    
    calculatePercentile(values, percentile) {
        if (values.length === 0) return 0;
        
        const sorted = [...values].sort((a, b) => a - b);
        const index = Math.ceil((percentile / 100) * sorted.length) - 1;
        return sorted[Math.max(0, index)];
    }
    
    calculateAverage(values) {
        if (values.length === 0) return 0;
        return values.reduce((sum, val) => sum + val, 0) / values.length;
    }
    
    getMetrics() {
        const now = Date.now();
        const duration = (now - this.lastResetTime) / 1000; // seconds
        
        // Calculate FPS
        const fps = this.processedFrames / duration;
        const dropRate = this.totalFrames > 0 ? (this.droppedFrames / this.totalFrames) * 100 : 0;
        
        // Calculate latency statistics
        const endToEndStats = {
            median: this.calculatePercentile(this.latencies.endToEnd, 50),
            p95: this.calculatePercentile(this.latencies.endToEnd, 95),
            p99: this.calculatePercentile(this.latencies.endToEnd, 99),
            average: this.calculateAverage(this.latencies.endToEnd),
            min: Math.min(...this.latencies.endToEnd) || 0,
            max: Math.max(...this.latencies.endToEnd) || 0
        };
        
        const networkStats = {
            median: this.calculatePercentile(this.latencies.network, 50),
            p95: this.calculatePercentile(this.latencies.network, 95),
            average: this.calculateAverage(this.latencies.network)
        };
        
        const inferenceStats = {
            median: this.calculatePercentile(this.latencies.inference, 50),
            p95: this.calculatePercentile(this.latencies.inference, 95),
            average: this.calculateAverage(this.latencies.inference)
        };
        
        // Calculate bandwidth statistics
        const uplinkValues = this.bandwidth.uplink.map(entry => entry.value);
        const downlinkValues = this.bandwidth.downlink.map(entry => entry.value);
        
        const bandwidthStats = {
            uplink: {
                current: uplinkValues.length > 0 ? uplinkValues[uplinkValues.length - 1] : 0,
                average: this.calculateAverage(uplinkValues),
                max: Math.max(...uplinkValues) || 0
            },
            downlink: {
                current: downlinkValues.length > 0 ? downlinkValues[downlinkValues.length - 1] : 0,
                average: this.calculateAverage(downlinkValues),
                max: Math.max(...downlinkValues) || 0
            }
        };
        
        // System metrics
        const systemStats = {
            cpu: {
                current: this.systemMetrics.cpuUsage.length > 0 ? 
                    this.systemMetrics.cpuUsage[this.systemMetrics.cpuUsage.length - 1] : 0,
                average: this.calculateAverage(this.systemMetrics.cpuUsage),
                max: Math.max(...this.systemMetrics.cpuUsage) || 0
            },
            memory: {
                current: this.systemMetrics.memoryUsage.length > 0 ? 
                    this.systemMetrics.memoryUsage[this.systemMetrics.memoryUsage.length - 1] : 0,
                average: this.calculateAverage(this.systemMetrics.memoryUsage),
                max: Math.max(...this.systemMetrics.memoryUsage) || 0
            }
        };
        
        return {
            timestamp: now,
            duration: duration,
            
            // Frame statistics
            frames: {
                total: this.totalFrames,
                processed: this.processedFrames,
                dropped: this.droppedFrames,
                dropRate: dropRate,
                fps: fps
            },
            
            // Latency statistics
            latency: {
                endToEnd: endToEndStats,
                network: networkStats,
                inference: inferenceStats
            },
            
            // Bandwidth statistics
            bandwidth: bandwidthStats,
            
            // System statistics
            system: systemStats,
            
            // Raw data for detailed analysis
            recentFrames: this.frames.slice(-10),
            sampleCount: {
                frames: this.frames.length,
                latencies: this.latencies.endToEnd.length,
                bandwidth: this.bandwidth.uplink.length
            }
        };
    }
    
    reset() {
        this.frames = [];
        this.totalFrames = 0;
        this.processedFrames = 0;
        this.droppedFrames = 0;
        this.lastResetTime = Date.now();
        
        // Reset latency arrays
        Object.keys(this.latencies).forEach(key => {
            this.latencies[key] = [];
        });
        
        // Reset bandwidth arrays
        this.bandwidth.uplink = [];
        this.bandwidth.downlink = [];
        
        console.log('Metrics reset');
    }
    
    exportMetrics() {
        const metrics = this.getMetrics();
        
        // Format for JSON export
        return {
            timestamp: new Date().toISOString(),
            duration_seconds: metrics.duration,
            
            // Key metrics as specified in requirements
            median_latency_ms: metrics.latency.endToEnd.median,
            p95_latency_ms: metrics.latency.endToEnd.p95,
            processed_fps: metrics.frames.fps,
            uplink_kbps: metrics.bandwidth.uplink.average,
            downlink_kbps: metrics.bandwidth.downlink.average,
            
            // Additional metrics
            drop_rate_percent: metrics.frames.dropRate,
            inference_latency_ms: metrics.latency.inference.median,
            network_latency_ms: metrics.latency.network.median,
            cpu_usage_percent: metrics.system.cpu.average,
            memory_usage_mb: metrics.system.memory.average,
            
            // Full metrics object
            full_metrics: metrics
        };
    }
    
    cleanup() {
        if (this.systemMonitorInterval) {
            clearInterval(this.systemMonitorInterval);
        }
    }
}

module.exports = MetricsCollector;
