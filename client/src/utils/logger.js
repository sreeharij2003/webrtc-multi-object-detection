/**
 * Logger Utility
 * Provides structured logging with different levels and output targets
 */

class Logger {
    constructor(name = 'App') {
        this.name = name;
        this.logs = [];
        this.maxLogs = 1000;
        this.logLevel = this.getLogLevel();
        
        this.levels = {
            ERROR: 0,
            WARN: 1,
            INFO: 2,
            DEBUG: 3
        };
        
        this.colors = {
            ERROR: '#FF5252',
            WARN: '#FF9800',
            INFO: '#2196F3',
            DEBUG: '#4CAF50'
        };
        
        this.setupConsoleOutput();
        this.setupDOMOutput();
    }
    
    getLogLevel() {
        // Get log level from URL params or localStorage
        const urlParams = new URLSearchParams(window.location.search);
        const urlLevel = urlParams.get('logLevel');
        
        if (urlLevel) {
            return urlLevel.toUpperCase();
        }
        
        const storedLevel = localStorage.getItem('logLevel');
        if (storedLevel) {
            return storedLevel.toUpperCase();
        }
        
        // Default to INFO in production, DEBUG in development
        return window.location.hostname === 'localhost' ? 'DEBUG' : 'INFO';
    }
    
    setupConsoleOutput() {
        // Store original console methods
        this.originalConsole = {
            log: console.log,
            warn: console.warn,
            error: console.error,
            debug: console.debug
        };
    }
    
    setupDOMOutput() {
        // Find log output element
        this.logOutput = document.getElementById('log-output');
        
        if (this.logOutput) {
            this.updateDOMOutput();
        }
    }
    
    shouldLog(level) {
        const currentLevelValue = this.levels[this.logLevel] || this.levels.INFO;
        const messageLevelValue = this.levels[level] || this.levels.INFO;
        
        return messageLevelValue <= currentLevelValue;
    }
    
    log(level, message, ...args) {
        if (!this.shouldLog(level)) {
            return;
        }
        
        const timestamp = new Date().toISOString();
        const logEntry = {
            timestamp,
            level,
            name: this.name,
            message,
            args: args.length > 0 ? args : undefined,
            id: Date.now() + Math.random()
        };
        
        // Add to internal log storage
        this.logs.push(logEntry);
        
        // Maintain log size limit
        if (this.logs.length > this.maxLogs) {
            this.logs.shift();
        }
        
        // Output to console
        this.outputToConsole(logEntry);
        
        // Output to DOM if available
        this.outputToDOM(logEntry);
        
        return logEntry;
    }
    
    outputToConsole(logEntry) {
        const { level, name, message, args } = logEntry;
        const prefix = `[${name}]`;
        
        switch (level) {
            case 'ERROR':
                this.originalConsole.error(prefix, message, ...(args || []));
                break;
            case 'WARN':
                this.originalConsole.warn(prefix, message, ...(args || []));
                break;
            case 'DEBUG':
                this.originalConsole.debug(prefix, message, ...(args || []));
                break;
            default:
                this.originalConsole.log(prefix, message, ...(args || []));
        }
    }
    
    outputToDOM(logEntry) {
        if (!this.logOutput) return;
        
        const { timestamp, level, name, message, args } = logEntry;
        const time = new Date(timestamp).toLocaleTimeString();
        
        // Create log line
        const logLine = document.createElement('div');
        logLine.className = `log-entry log-${level.toLowerCase()}`;
        logLine.style.color = this.colors[level] || '#333';
        
        // Format message
        let formattedMessage = `${time} [${name}] ${message}`;
        
        if (args && args.length > 0) {
            const argsStr = args.map(arg => {
                if (typeof arg === 'object') {
                    try {
                        return JSON.stringify(arg, null, 2);
                    } catch (e) {
                        return String(arg);
                    }
                }
                return String(arg);
            }).join(' ');
            
            formattedMessage += ' ' + argsStr;
        }
        
        logLine.textContent = formattedMessage;
        
        // Add to DOM
        this.logOutput.appendChild(logLine);
        
        // Auto-scroll to bottom
        this.logOutput.scrollTop = this.logOutput.scrollHeight;
        
        // Limit DOM log entries
        const maxDOMEntries = 100;
        while (this.logOutput.children.length > maxDOMEntries) {
            this.logOutput.removeChild(this.logOutput.firstChild);
        }
    }
    
    updateDOMOutput() {
        if (!this.logOutput) return;
        
        // Clear existing content
        this.logOutput.innerHTML = '';
        
        // Add recent logs
        const recentLogs = this.logs.slice(-50);
        recentLogs.forEach(logEntry => {
            this.outputToDOM(logEntry);
        });
    }
    
    // Public logging methods
    error(message, ...args) {
        return this.log('ERROR', message, ...args);
    }
    
    warn(message, ...args) {
        return this.log('WARN', message, ...args);
    }
    
    info(message, ...args) {
        return this.log('INFO', message, ...args);
    }
    
    debug(message, ...args) {
        return this.log('DEBUG', message, ...args);
    }
    
    // Utility methods
    clear() {
        this.logs = [];
        
        if (this.logOutput) {
            this.logOutput.innerHTML = '';
        }
    }
    
    setLevel(level) {
        this.logLevel = level.toUpperCase();
        localStorage.setItem('logLevel', this.logLevel);
        this.info(`Log level set to ${this.logLevel}`);
    }
    
    getLogs(level = null, limit = null) {
        let filteredLogs = this.logs;
        
        if (level) {
            filteredLogs = this.logs.filter(log => log.level === level.toUpperCase());
        }
        
        if (limit) {
            filteredLogs = filteredLogs.slice(-limit);
        }
        
        return filteredLogs;
    }
    
    exportLogs() {
        const exportData = {
            timestamp: new Date().toISOString(),
            logLevel: this.logLevel,
            name: this.name,
            logs: this.logs
        };
        
        return JSON.stringify(exportData, null, 2);
    }
    
    // Performance logging
    time(label) {
        const startTime = performance.now();
        
        return {
            end: () => {
                const endTime = performance.now();
                const duration = endTime - startTime;
                this.debug(`Timer [${label}]: ${duration.toFixed(2)}ms`);
                return duration;
            }
        };
    }
    
    // Group logging
    group(label) {
        this.info(`▼ ${label}`);
        
        return {
            log: (message, ...args) => this.info(`  ${message}`, ...args),
            warn: (message, ...args) => this.warn(`  ${message}`, ...args),
            error: (message, ...args) => this.error(`  ${message}`, ...args),
            debug: (message, ...args) => this.debug(`  ${message}`, ...args),
            end: () => this.info(`▲ End ${label}`)
        };
    }
    
    // Network request logging
    logRequest(method, url, status, duration) {
        const message = `${method} ${url} - ${status} (${duration}ms)`;
        
        if (status >= 400) {
            this.error(message);
        } else if (status >= 300) {
            this.warn(message);
        } else {
            this.debug(message);
        }
    }
    
    // Error boundary logging
    logError(error, context = '') {
        const errorInfo = {
            message: error.message,
            stack: error.stack,
            name: error.name,
            context
        };
        
        this.error('Unhandled error:', errorInfo);
        
        // Send to error reporting service if available
        if (window.errorReporter) {
            window.errorReporter.report(error, context);
        }
    }
    
    // System info logging
    logSystemInfo() {
        const info = {
            userAgent: navigator.userAgent,
            platform: navigator.platform,
            language: navigator.language,
            cookieEnabled: navigator.cookieEnabled,
            onLine: navigator.onLine,
            screen: {
                width: screen.width,
                height: screen.height,
                colorDepth: screen.colorDepth
            },
            viewport: {
                width: window.innerWidth,
                height: window.innerHeight
            },
            location: {
                href: window.location.href,
                protocol: window.location.protocol,
                host: window.location.host
            }
        };
        
        this.info('System info:', info);
    }
}

export { Logger };
