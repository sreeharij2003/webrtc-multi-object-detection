#!/usr/bin/env node

/**
 * Benchmarking Script for WebRTC VLM Detection System
 * Runs automated performance tests and generates metrics.json
 */

const fs = require('fs').promises;
const path = require('path');
const { spawn } = require('child_process');

class BenchmarkRunner {
    constructor() {
        this.config = {
            duration: 30, // seconds
            mode: 'wasm',
            serverUrl: 'http://localhost:3000',
            outputFile: 'metrics.json',
            verbose: false
        };
        
        this.metrics = {
            startTime: null,
            endTime: null,
            duration: 0,
            frames: [],
            latencies: [],
            bandwidth: [],
            system: [],
            errors: []
        };
        
        this.serverProcess = null;
        this.isRunning = false;
    }
    
    parseArguments() {
        const args = process.argv.slice(2);
        
        for (let i = 0; i < args.length; i++) {
            switch (args[i]) {
                case '--duration':
                    this.config.duration = parseInt(args[++i]) || 30;
                    break;
                case '--mode':
                    this.config.mode = args[++i] || 'wasm';
                    break;
                case '--server-url':
                    this.config.serverUrl = args[++i] || 'http://localhost:3000';
                    break;
                case '--output':
                    this.config.outputFile = args[++i] || 'metrics.json';
                    break;
                case '--verbose':
                    this.config.verbose = true;
                    break;
                case '--help':
                    this.showHelp();
                    process.exit(0);
                    break;
                default:
                    console.error(`Unknown option: ${args[i]}`);
                    this.showHelp();
                    process.exit(1);
            }
        }
    }
    
    showHelp() {
        console.log(`
WebRTC VLM Detection Benchmark Tool

Usage: node run_bench.js [OPTIONS]

Options:
  --duration SECONDS    Duration of benchmark in seconds (default: 30)
  --mode MODE          Processing mode: server|wasm (default: wasm)
  --server-url URL     Server URL (default: http://localhost:3000)
  --output FILE        Output metrics file (default: metrics.json)
  --verbose            Enable verbose logging
  --help               Show this help message

Examples:
  node run_bench.js --duration 30 --mode wasm
  node run_bench.js --duration 60 --mode server --verbose
  node run_bench.js --output benchmark-results.json
        `);
    }
    
    log(message, ...args) {
        if (this.config.verbose) {
            console.log(`[BENCH] ${message}`, ...args);
        }
    }
    
    error(message, ...args) {
        console.error(`[ERROR] ${message}`, ...args);
    }
    
    async run() {
        try {
            console.log('🚀 Starting WebRTC VLM Detection Benchmark');
            console.log(`Duration: ${this.config.duration}s, Mode: ${this.config.mode}`);
            
            this.parseArguments();
            
            // Check if server is running
            const serverRunning = await this.checkServer();
            
            if (!serverRunning) {
                console.log('Starting server...');
                await this.startServer();
                await this.waitForServer();
            }
            
            // Run benchmark
            await this.runBenchmark();
            
            // Generate report
            await this.generateReport();
            
            console.log('✅ Benchmark completed successfully');
            console.log(`📊 Results saved to: ${this.config.outputFile}`);
            
        } catch (error) {
            this.error('Benchmark failed:', error);
            process.exit(1);
        } finally {
            await this.cleanup();
        }
    }
    
    async checkServer() {
        try {
            const response = await fetch(`${this.config.serverUrl}/health`, {
                timeout: 5000
            });
            return response.ok;
        } catch (error) {
            return false;
        }
    }
    
    async startServer() {
        return new Promise((resolve, reject) => {
            const env = { ...process.env, MODE: this.config.mode };
            
            this.serverProcess = spawn('npm', ['start'], {
                env,
                stdio: this.config.verbose ? 'inherit' : 'pipe'
            });
            
            this.serverProcess.on('error', reject);
            
            // Give server time to start
            setTimeout(resolve, 5000);
        });
    }
    
    async waitForServer() {
        const maxAttempts = 30;
        let attempts = 0;
        
        while (attempts < maxAttempts) {
            if (await this.checkServer()) {
                this.log('Server is ready');
                return;
            }
            
            await new Promise(resolve => setTimeout(resolve, 1000));
            attempts++;
        }
        
        throw new Error('Server failed to start within timeout');
    }
    
    async runBenchmark() {
        this.log('Starting benchmark collection...');
        
        this.metrics.startTime = Date.now();
        this.isRunning = true;
        
        // Start metrics collection
        const metricsInterval = setInterval(async () => {
            if (!this.isRunning) {
                clearInterval(metricsInterval);
                return;
            }
            
            try {
                await this.collectMetrics();
            } catch (error) {
                this.error('Failed to collect metrics:', error);
                this.metrics.errors.push({
                    timestamp: Date.now(),
                    error: error.message
                });
            }
        }, 1000);
        
        // Start system monitoring
        const systemInterval = setInterval(async () => {
            if (!this.isRunning) {
                clearInterval(systemInterval);
                return;
            }
            
            try {
                await this.collectSystemMetrics();
            } catch (error) {
                this.error('Failed to collect system metrics:', error);
            }
        }, 2000);
        
        // Run for specified duration
        await new Promise(resolve => {
            setTimeout(() => {
                this.isRunning = false;
                this.metrics.endTime = Date.now();
                this.metrics.duration = (this.metrics.endTime - this.metrics.startTime) / 1000;
                resolve();
            }, this.config.duration * 1000);
        });
        
        clearInterval(metricsInterval);
        clearInterval(systemInterval);
        
        this.log(`Benchmark completed. Collected ${this.metrics.frames.length} frame metrics`);
    }
    
    async collectMetrics() {
        try {
            const response = await fetch(`${this.config.serverUrl}/api/metrics`, {
                timeout: 5000
            });
            
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }
            
            const metrics = await response.json();
            
            // Store frame metrics
            if (metrics.recentFrames) {
                this.metrics.frames.push(...metrics.recentFrames);
            }
            
            // Store latency data
            if (metrics.latency && metrics.latency.endToEnd) {
                this.metrics.latencies.push({
                    timestamp: Date.now(),
                    median: metrics.latency.endToEnd.median,
                    p95: metrics.latency.endToEnd.p95,
                    average: metrics.latency.endToEnd.average
                });
            }
            
            // Store bandwidth data
            if (metrics.bandwidth) {
                this.metrics.bandwidth.push({
                    timestamp: Date.now(),
                    uplink: metrics.bandwidth.uplink.current,
                    downlink: metrics.bandwidth.downlink.current
                });
            }
            
            this.log(`Collected metrics - FPS: ${metrics.frames?.fps || 0}, Latency: ${metrics.latency?.endToEnd?.median || 0}ms`);
            
        } catch (error) {
            this.log('Failed to collect metrics:', error.message);
        }
    }
    
    async collectSystemMetrics() {
        try {
            // Collect CPU and memory usage
            const cpuUsage = process.cpuUsage();
            const memUsage = process.memoryUsage();
            
            this.metrics.system.push({
                timestamp: Date.now(),
                cpu: {
                    user: cpuUsage.user,
                    system: cpuUsage.system
                },
                memory: {
                    rss: memUsage.rss,
                    heapUsed: memUsage.heapUsed,
                    heapTotal: memUsage.heapTotal,
                    external: memUsage.external
                }
            });
            
        } catch (error) {
            this.log('Failed to collect system metrics:', error.message);
        }
    }
    
    async generateReport() {
        this.log('Generating benchmark report...');
        
        const report = {
            benchmark: {
                timestamp: new Date().toISOString(),
                duration_seconds: this.metrics.duration,
                mode: this.config.mode,
                server_url: this.config.serverUrl
            },
            
            // Key metrics as specified in requirements
            median_latency_ms: this.calculateMedianLatency(),
            p95_latency_ms: this.calculateP95Latency(),
            processed_fps: this.calculateAverageFPS(),
            uplink_kbps: this.calculateAverageBandwidth('uplink'),
            downlink_kbps: this.calculateAverageBandwidth('downlink'),
            
            // Additional metrics
            total_frames: this.metrics.frames.length,
            error_count: this.metrics.errors.length,
            
            // Detailed statistics
            latency_stats: this.calculateLatencyStats(),
            fps_stats: this.calculateFPSStats(),
            bandwidth_stats: this.calculateBandwidthStats(),
            system_stats: this.calculateSystemStats(),
            
            // Raw data (limited for file size)
            sample_frames: this.metrics.frames.slice(0, 10),
            sample_latencies: this.metrics.latencies.slice(0, 10),
            errors: this.metrics.errors
        };
        
        // Write to file
        const outputPath = path.resolve(this.config.outputFile);
        await fs.writeFile(outputPath, JSON.stringify(report, null, 2));
        
        // Print summary
        this.printSummary(report);
    }
    
    calculateMedianLatency() {
        const latencies = this.metrics.latencies.map(l => l.median).filter(l => l > 0);
        if (latencies.length === 0) return 0;
        
        latencies.sort((a, b) => a - b);
        const mid = Math.floor(latencies.length / 2);
        return latencies.length % 2 === 0 
            ? (latencies[mid - 1] + latencies[mid]) / 2 
            : latencies[mid];
    }
    
    calculateP95Latency() {
        const latencies = this.metrics.latencies.map(l => l.p95).filter(l => l > 0);
        if (latencies.length === 0) return 0;
        
        latencies.sort((a, b) => a - b);
        const index = Math.ceil(0.95 * latencies.length) - 1;
        return latencies[Math.max(0, index)];
    }
    
    calculateAverageFPS() {
        if (this.metrics.frames.length === 0) return 0;
        return this.metrics.frames.length / this.metrics.duration;
    }
    
    calculateAverageBandwidth(type) {
        const values = this.metrics.bandwidth.map(b => b[type]).filter(v => v > 0);
        if (values.length === 0) return 0;
        return values.reduce((sum, val) => sum + val, 0) / values.length;
    }
    
    calculateLatencyStats() {
        const latencies = this.metrics.latencies.map(l => l.median).filter(l => l > 0);
        if (latencies.length === 0) return {};
        
        latencies.sort((a, b) => a - b);
        return {
            min: Math.min(...latencies),
            max: Math.max(...latencies),
            average: latencies.reduce((sum, val) => sum + val, 0) / latencies.length,
            count: latencies.length
        };
    }
    
    calculateFPSStats() {
        const fps = this.calculateAverageFPS();
        return {
            average: fps,
            target: 15, // Target FPS
            efficiency: fps / 15 * 100 // Percentage of target
        };
    }
    
    calculateBandwidthStats() {
        return {
            uplink: {
                average: this.calculateAverageBandwidth('uplink'),
                samples: this.metrics.bandwidth.length
            },
            downlink: {
                average: this.calculateAverageBandwidth('downlink'),
                samples: this.metrics.bandwidth.length
            }
        };
    }
    
    calculateSystemStats() {
        if (this.metrics.system.length === 0) return {};
        
        const memoryValues = this.metrics.system.map(s => s.memory.heapUsed / 1024 / 1024);
        
        return {
            memory_mb: {
                average: memoryValues.reduce((sum, val) => sum + val, 0) / memoryValues.length,
                max: Math.max(...memoryValues),
                samples: memoryValues.length
            }
        };
    }
    
    printSummary(report) {
        console.log('\n📊 Benchmark Summary');
        console.log('===================');
        console.log(`Duration: ${report.benchmark.duration_seconds}s`);
        console.log(`Mode: ${report.benchmark.mode}`);
        console.log(`Total Frames: ${report.total_frames}`);
        console.log(`Processed FPS: ${report.processed_fps.toFixed(2)}`);
        console.log(`Median Latency: ${report.median_latency_ms.toFixed(2)}ms`);
        console.log(`P95 Latency: ${report.p95_latency_ms.toFixed(2)}ms`);
        console.log(`Uplink: ${report.uplink_kbps.toFixed(2)} kbps`);
        console.log(`Downlink: ${report.downlink_kbps.toFixed(2)} kbps`);
        console.log(`Errors: ${report.error_count}`);
        console.log('===================\n');
    }
    
    async cleanup() {
        this.log('Cleaning up...');
        
        if (this.serverProcess) {
            this.serverProcess.kill('SIGTERM');
            
            // Wait for graceful shutdown
            await new Promise(resolve => {
                this.serverProcess.on('exit', resolve);
                setTimeout(() => {
                    this.serverProcess.kill('SIGKILL');
                    resolve();
                }, 5000);
            });
        }
    }
}

// Run benchmark if called directly
if (require.main === module) {
    const runner = new BenchmarkRunner();
    runner.run().catch(console.error);
}

module.exports = BenchmarkRunner;
