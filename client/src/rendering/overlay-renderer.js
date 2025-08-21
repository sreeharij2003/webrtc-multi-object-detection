/**
 * Overlay Renderer
 * Renders detection bounding boxes and labels on video overlay
 */

class OverlayRenderer {
    constructor(canvas, video) {
        this.canvas = canvas;
        this.video = video;
        this.ctx = canvas.getContext('2d');
        
        this.colors = [
            '#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FFEAA7',
            '#DDA0DD', '#98D8C8', '#F7DC6F', '#BB8FCE', '#85C1E9'
        ];
        
        this.settings = {
            lineWidth: 2,
            fontSize: 14,
            fontFamily: 'Arial, sans-serif',
            showLabels: true,
            showConfidence: true,
            minConfidence: 0.3
        };
        
        this.lastDetections = [];
        this.animationFrame = null;
        
        this.setupCanvas();
    }
    
    setupCanvas() {
        // Set canvas size to match video
        this.updateCanvasSize();
        
        // Set up high DPI rendering
        const dpr = window.devicePixelRatio || 1;
        const rect = this.canvas.getBoundingClientRect();
        
        this.canvas.width = rect.width * dpr;
        this.canvas.height = rect.height * dpr;
        this.ctx.scale(dpr, dpr);
        
        // Set canvas style size
        this.canvas.style.width = rect.width + 'px';
        this.canvas.style.height = rect.height + 'px';
    }
    
    updateCanvasSize() {
        if (!this.video || !this.canvas) return;
        
        const videoRect = this.video.getBoundingClientRect();
        this.canvas.style.width = videoRect.width + 'px';
        this.canvas.style.height = videoRect.height + 'px';
        
        // Update canvas internal dimensions
        this.canvas.width = videoRect.width;
        this.canvas.height = videoRect.height;
    }
    
    renderDetections(detections) {
        if (!detections || !Array.isArray(detections)) {
            detections = [];
        }
        
        // Filter detections by confidence
        const filteredDetections = detections.filter(
            detection => detection.score >= this.settings.minConfidence
        );
        
        this.lastDetections = filteredDetections;
        this.render();
    }
    
    render() {
        if (!this.ctx || !this.video) return;
        
        // Clear canvas
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        
        if (this.lastDetections.length === 0) return;
        
        // Get video dimensions
        const videoWidth = this.video.videoWidth || this.video.clientWidth;
        const videoHeight = this.video.videoHeight || this.video.clientHeight;
        const canvasWidth = this.canvas.width;
        const canvasHeight = this.canvas.height;
        
        if (videoWidth === 0 || videoHeight === 0) return;
        
        // Calculate scaling factors
        const scaleX = canvasWidth / videoWidth;
        const scaleY = canvasHeight / videoHeight;
        
        // Render each detection
        this.lastDetections.forEach((detection, index) => {
            this.renderDetection(detection, index, scaleX, scaleY);
        });
    }
    
    renderDetection(detection, index, scaleX, scaleY) {
        const { label, score, xmin, ymin, xmax, ymax } = detection;
        
        // Convert normalized coordinates to canvas coordinates
        const x = xmin * this.canvas.width;
        const y = ymin * this.canvas.height;
        const width = (xmax - xmin) * this.canvas.width;
        const height = (ymax - ymin) * this.canvas.height;
        
        // Get color for this detection
        const color = this.colors[index % this.colors.length];
        
        // Set drawing style
        this.ctx.strokeStyle = color;
        this.ctx.lineWidth = this.settings.lineWidth;
        this.ctx.fillStyle = color;
        
        // Draw bounding box
        this.ctx.strokeRect(x, y, width, height);
        
        // Draw label background and text
        if (this.settings.showLabels) {
            this.renderLabel(label, score, x, y, color);
        }
        
        // Draw confidence indicator
        if (this.settings.showConfidence) {
            this.renderConfidenceBar(score, x, y, width);
        }
    }
    
    renderLabel(label, score, x, y, color) {
        const text = this.settings.showConfidence 
            ? `${label} ${(score * 100).toFixed(0)}%`
            : label;
        
        // Set font
        this.ctx.font = `${this.settings.fontSize}px ${this.settings.fontFamily}`;
        
        // Measure text
        const textMetrics = this.ctx.measureText(text);
        const textWidth = textMetrics.width;
        const textHeight = this.settings.fontSize;
        
        // Calculate label position
        const labelX = x;
        const labelY = y > textHeight + 10 ? y - 5 : y + textHeight + 5;
        
        // Draw label background
        this.ctx.fillStyle = color;
        this.ctx.fillRect(labelX - 2, labelY - textHeight - 2, textWidth + 4, textHeight + 4);
        
        // Draw label text
        this.ctx.fillStyle = '#FFFFFF';
        this.ctx.fillText(text, labelX, labelY - 2);
    }
    
    renderConfidenceBar(score, x, y, boxWidth) {
        const barWidth = Math.min(boxWidth * 0.8, 100);
        const barHeight = 4;
        const barX = x + (boxWidth - barWidth) / 2;
        const barY = y - 10;
        
        // Draw background
        this.ctx.fillStyle = 'rgba(255, 255, 255, 0.3)';
        this.ctx.fillRect(barX, barY, barWidth, barHeight);
        
        // Draw confidence level
        const confidenceWidth = barWidth * score;
        const confidenceColor = score > 0.7 ? '#4CAF50' : score > 0.5 ? '#FF9800' : '#F44336';
        this.ctx.fillStyle = confidenceColor;
        this.ctx.fillRect(barX, barY, confidenceWidth, barHeight);
    }
    
    // Animation methods for smooth rendering
    startAnimation() {
        if (this.animationFrame) return;
        
        const animate = () => {
            this.render();
            this.animationFrame = requestAnimationFrame(animate);
        };
        
        this.animationFrame = requestAnimationFrame(animate);
    }
    
    stopAnimation() {
        if (this.animationFrame) {
            cancelAnimationFrame(this.animationFrame);
            this.animationFrame = null;
        }
    }
    
    // Utility methods
    clear() {
        if (this.ctx) {
            this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        }
        this.lastDetections = [];
    }
    
    updateSettings(newSettings) {
        this.settings = { ...this.settings, ...newSettings };
        this.render(); // Re-render with new settings
    }
    
    getSettings() {
        return { ...this.settings };
    }
    
    // Export current frame as image
    exportFrame() {
        if (!this.canvas) return null;
        
        return this.canvas.toDataURL('image/png');
    }
    
    // Resize handler
    handleResize() {
        this.updateCanvasSize();
        this.render();
    }
    
    // Color utilities
    getColorForClass(className) {
        // Generate consistent color for class name
        let hash = 0;
        for (let i = 0; i < className.length; i++) {
            hash = className.charCodeAt(i) + ((hash << 5) - hash);
        }
        
        const colorIndex = Math.abs(hash) % this.colors.length;
        return this.colors[colorIndex];
    }
    
    // Performance monitoring
    getPerformanceStats() {
        return {
            lastRenderTime: this.lastRenderTime || 0,
            detectionsCount: this.lastDetections.length,
            canvasSize: {
                width: this.canvas.width,
                height: this.canvas.height
            },
            videoSize: {
                width: this.video.videoWidth,
                height: this.video.videoHeight
            }
        };
    }
    
    cleanup() {
        this.stopAnimation();
        this.clear();
        
        if (this.ctx) {
            this.ctx = null;
        }
        
        this.canvas = null;
        this.video = null;
        this.lastDetections = [];
        
        console.log('Overlay renderer cleaned up');
    }
}

export { OverlayRenderer };
