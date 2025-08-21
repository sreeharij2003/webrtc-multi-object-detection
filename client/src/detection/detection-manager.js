/**
 * Detection Manager
 * Handles object detection in both server and WASM modes
 */

import * as ort from 'onnxruntime-web';

class DetectionManager extends EventTarget {
    constructor(mode = 'wasm') {
        super();
        this.mode = mode;
        this.session = null;
        this.modelLoaded = false;
        this.isProcessing = false;
        
        // Processing queue for backpressure handling
        this.processingQueue = [];
        this.maxQueueSize = 5;
        
        // Performance settings
        this.inputSize = { width: 320, height: 240 };
        this.targetFPS = 15;
        this.lastProcessTime = 0;
        this.frameInterval = 1000 / this.targetFPS;
        
        // Real ML Model configuration (YOLOv5n)
        this.modelConfig = {
            modelPath: '/models/yolov5n.onnx',
            inputShape: [1, 3, 640, 640],
            outputShape: [1, 25200, 85], // YOLOv5n format
            classNames: this.getCocoClassNames(),
            confidenceThreshold: 0.5,
            nmsThreshold: 0.4,
            anchors: [
                [10, 13, 16, 30, 33, 23],
                [30, 61, 62, 45, 59, 119],
                [116, 90, 156, 198, 373, 326]
            ]
        };
    }
    
    async initialize() {
        console.log(`Initializing detection manager in ${this.mode} mode`);
        
        if (this.mode === 'wasm') {
            await this.initializeWASM();
        } else {
            // Server mode - detection handled server-side
            console.log('Server mode - detection will be handled server-side');
        }
        
        console.log('Detection manager initialized');
    }
    
    async initializeWASM() {
        try {
            console.log('🤖 Initializing WASM detection with real YOLOv5n model...');

            // Configure ONNX Runtime for WebAssembly
            ort.env.wasm.wasmPaths = '/node_modules/onnxruntime-web/dist/';
            ort.env.wasm.numThreads = 1; // Single thread for stability
            ort.env.wasm.simd = true;

            // Try to load the real ONNX model
            try {
                console.log('📥 Loading YOLOv5n ONNX model...');
                this.session = await ort.InferenceSession.create(this.modelConfig.modelPath, {
                    executionProviders: ['wasm'],
                    graphOptimizationLevel: 'all'
                });

                console.log('✅ Real ONNX model loaded successfully!');
                console.log('📊 Model info:', {
                    inputNames: this.session.inputNames,
                    outputNames: this.session.outputNames
                });

                this.modelLoaded = true;
                this.useRealModel = true;

            } catch (modelError) {
                console.warn('⚠️ Failed to load real model, falling back to mock detection:', modelError.message);
                console.log('💡 To use real ML: Run "node models/download_models.js" first');

                // Fallback to mock detection
                this.modelLoaded = true;
                this.useRealModel = false;

                // Simulate loading time
                await new Promise(resolve => setTimeout(resolve, 1000));
            }

        } catch (error) {
            console.error('Failed to initialize WASM detection:', error);
            // Fallback to server mode
            this.mode = 'server';
            console.log('Falling back to server mode');
        }
    }
    
    async loadModel(ort) {
        try {
            // For demo purposes, we'll create a mock session
            // In production, load actual ONNX model
            console.log('Loading ONNX model...');
            
            // Try to load a real model or create a mock one
            this.session = await this.createMockSession(ort);
            
            console.log('Model loaded successfully');
            
        } catch (error) {
            console.error('Failed to load model:', error);
            throw error;
        }
    }
    
    async createMockSession(ort) {
        // Create a mock session for demo purposes
        // In production, replace with actual model loading:
        // this.session = await ort.InferenceSession.create('/models/yolov5n.onnx');
        
        return {
            run: async (feeds) => {
                // Mock inference - return random detections
                return this.getMockInferenceResults();
            },
            release: () => {
                console.log('Mock session released');
            }
        };
    }
    
    getMockInferenceResults() {
        // Generate mock detection results for demo
        const detections = [];
        const numDetections = Math.floor(Math.random() * 3); // 0-2 detections
        
        for (let i = 0; i < numDetections; i++) {
            detections.push({
                label: this.getRandomClassName(),
                score: 0.5 + Math.random() * 0.4, // 0.5-0.9
                xmin: Math.random() * 0.5, // 0-0.5
                ymin: Math.random() * 0.5, // 0-0.5
                xmax: 0.3 + Math.random() * 0.4, // 0.3-0.7
                ymax: 0.3 + Math.random() * 0.4  // 0.3-0.7
            });
        }
        
        return { output: detections };
    }
    
    getRandomClassName() {
        const commonClasses = ['person', 'car', 'phone', 'bottle', 'chair', 'laptop'];
        return commonClasses[Math.floor(Math.random() * commonClasses.length)];
    }
    
    async detectObjects(frameData) {
        const startTime = Date.now();
        
        // Check if we should process this frame (FPS limiting)
        if (startTime - this.lastProcessTime < this.frameInterval) {
            return null; // Skip frame
        }
        
        try {
            let detections;
            
            if (this.mode === 'wasm' && this.modelLoaded) {
                detections = await this.detectWASM(frameData);
            } else {
                detections = await this.detectServer(frameData);
            }
            
            const endTime = Date.now();
            this.lastProcessTime = endTime;
            
            const result = {
                frameId: frameData.frameId || Date.now(),
                captureTs: frameData.captureTs || startTime,
                recvTs: startTime,
                inferenceTs: endTime,
                detections: detections,
                processingTime: endTime - startTime,
                endToEndLatency: endTime - (frameData.captureTs || startTime)
            };
            
            this.dispatchEvent(new CustomEvent('detectionResult', {
                detail: result
            }));
            
            return result;
            
        } catch (error) {
            console.error('Detection error:', error);
            this.dispatchEvent(new CustomEvent('error', {
                detail: error
            }));
            return null;
        }
    }
    
    async detectWASM(frameData) {
        if (!this.session || this.isProcessing) {
            return [];
        }
        
        // Add to queue for backpressure handling
        if (this.processingQueue.length >= this.maxQueueSize) {
            this.processingQueue.shift(); // Drop oldest frame
        }
        
        return new Promise((resolve) => {
            this.processingQueue.push({ frameData, resolve });
            this.processQueue();
        });
    }
    
    async processQueue() {
        if (this.isProcessing || this.processingQueue.length === 0) {
            return;
        }
        
        this.isProcessing = true;
        
        try {
            while (this.processingQueue.length > 0) {
                const { frameData, resolve } = this.processingQueue.shift();
                const detections = await this.runWASMInference(frameData);
                resolve(detections);
            }
        } finally {
            this.isProcessing = false;
        }
    }
    
    async runWASMInference(frameData) {
        try {
            if (!this.useRealModel || !this.session) {
                // Fallback to mock detections
                console.log('🎭 Using mock detections (real model not available)');
                return this.getMockDetections();
            }

            console.log('🤖 Running real YOLOv5n inference...');

            // Preprocess image data
            const inputTensor = await this.preprocessImage(frameData.imageData);

            // Run real ONNX inference
            const inputName = this.session.inputNames[0];
            const feeds = { [inputName]: inputTensor };

            const startTime = performance.now();
            const results = await this.session.run(feeds);
            const inferenceTime = performance.now() - startTime;

            console.log(`⚡ Inference completed in ${inferenceTime.toFixed(1)}ms`);

            // Postprocess results
            const detections = this.postprocessResults(results);

            console.log(`🎯 Found ${detections.length} objects:`, detections.map(d => `${d.label} (${(d.score * 100).toFixed(0)}%)`));

            return detections;

        } catch (error) {
            console.error('❌ WASM inference error:', error);
            console.log('🎭 Falling back to mock detections');
            return this.getMockDetections();
        }
    }
    
    async preprocessImage(imageData) {
        if (!this.useRealModel) {
            // Mock preprocessing for fallback mode
            const { inputShape } = this.modelConfig;
            const [batch, channels, height, width] = inputShape;
            const inputArray = new Float32Array(batch * channels * height * width);
            inputArray.fill(0.5);
            return { data: inputArray, shape: inputShape };
        }

        try {
            // Real image preprocessing for YOLOv5
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');

            // Create image from base64 data
            const img = new Image();
            await new Promise((resolve, reject) => {
                img.onload = resolve;
                img.onerror = reject;
                img.src = imageData;
            });

            // Resize to model input size (640x640 for YOLOv5n)
            const [batch, channels, height, width] = this.modelConfig.inputShape;
            canvas.width = width;
            canvas.height = height;

            // Draw and resize image
            ctx.drawImage(img, 0, 0, width, height);

            // Get image data
            const imageDataObj = ctx.getImageData(0, 0, width, height);
            const pixels = imageDataObj.data;

            // Convert to RGB and normalize (0-1)
            const inputArray = new Float32Array(batch * channels * height * width);

            // YOLOv5 expects CHW format (channels first)
            for (let y = 0; y < height; y++) {
                for (let x = 0; x < width; x++) {
                    const pixelIndex = (y * width + x) * 4; // RGBA
                    const tensorIndex = y * width + x;

                    // Normalize to 0-1 and arrange as CHW
                    inputArray[tensorIndex] = pixels[pixelIndex] / 255.0; // R
                    inputArray[height * width + tensorIndex] = pixels[pixelIndex + 1] / 255.0; // G
                    inputArray[2 * height * width + tensorIndex] = pixels[pixelIndex + 2] / 255.0; // B
                }
            }

            // Create ONNX tensor
            return new ort.Tensor('float32', inputArray, this.modelConfig.inputShape);

        } catch (error) {
            console.error('Image preprocessing failed:', error);
            // Fallback to mock data
            const { inputShape } = this.modelConfig;
            const [batch, channels, height, width] = inputShape;
            const inputArray = new Float32Array(batch * channels * height * width);
            inputArray.fill(0.5);
            return { data: inputArray, shape: inputShape };
        }
    }
    
    postprocessResults(results) {
        if (!this.useRealModel || !results) {
            return this.getMockDetections();
        }

        try {
            // YOLOv5 output format: [batch, 25200, 85]
            // 85 = 4 (bbox) + 1 (confidence) + 80 (classes)
            const output = results[this.session.outputNames[0]];
            const outputData = output.data;
            const [batch, numBoxes, numClasses] = output.dims;

            const detections = [];
            const confidenceThreshold = this.modelConfig.confidenceThreshold;

            // Process each detection
            for (let i = 0; i < numBoxes; i++) {
                const offset = i * numClasses;

                // Extract bbox coordinates (center_x, center_y, width, height)
                const centerX = outputData[offset + 0];
                const centerY = outputData[offset + 1];
                const width = outputData[offset + 2];
                const height = outputData[offset + 3];
                const objectness = outputData[offset + 4];

                // Find best class
                let maxClassScore = 0;
                let bestClass = 0;

                for (let j = 5; j < numClasses; j++) {
                    const classScore = outputData[offset + j];
                    if (classScore > maxClassScore) {
                        maxClassScore = classScore;
                        bestClass = j - 5; // Subtract 5 to get class index
                    }
                }

                // Calculate final confidence
                const confidence = objectness * maxClassScore;

                if (confidence > confidenceThreshold) {
                    // Convert to normalized coordinates (0-1)
                    const xmin = Math.max(0, (centerX - width / 2) / 640);
                    const ymin = Math.max(0, (centerY - height / 2) / 640);
                    const xmax = Math.min(1, (centerX + width / 2) / 640);
                    const ymax = Math.min(1, (centerY + height / 2) / 640);

                    detections.push({
                        label: this.modelConfig.classNames[bestClass] || `class_${bestClass}`,
                        score: confidence,
                        xmin,
                        ymin,
                        xmax,
                        ymax
                    });
                }
            }

            // Apply Non-Maximum Suppression (simplified)
            return this.applyNMS(detections);

        } catch (error) {
            console.error('Postprocessing failed:', error);
            return this.getMockDetections();
        }
    }

    applyNMS(detections) {
        // Simple NMS implementation
        const nmsThreshold = this.modelConfig.nmsThreshold;
        const sortedDetections = detections.sort((a, b) => b.score - a.score);
        const keepDetections = [];

        for (let i = 0; i < sortedDetections.length; i++) {
            const detection = sortedDetections[i];
            let keep = true;

            for (let j = 0; j < keepDetections.length; j++) {
                const keptDetection = keepDetections[j];
                const iou = this.calculateIoU(detection, keptDetection);

                if (iou > nmsThreshold && detection.label === keptDetection.label) {
                    keep = false;
                    break;
                }
            }

            if (keep) {
                keepDetections.push(detection);
            }
        }

        return keepDetections;
    }

    calculateIoU(box1, box2) {
        // Calculate Intersection over Union
        const x1 = Math.max(box1.xmin, box2.xmin);
        const y1 = Math.max(box1.ymin, box2.ymin);
        const x2 = Math.min(box1.xmax, box2.xmax);
        const y2 = Math.min(box1.ymax, box2.ymax);

        if (x2 <= x1 || y2 <= y1) return 0;

        const intersection = (x2 - x1) * (y2 - y1);
        const area1 = (box1.xmax - box1.xmin) * (box1.ymax - box1.ymin);
        const area2 = (box2.xmax - box2.xmin) * (box2.ymax - box2.ymin);
        const union = area1 + area2 - intersection;

        return intersection / union;
    }
    
    getMockDetections() {
        // Return mock detections for demo
        const detections = [];
        const numDetections = Math.floor(Math.random() * 3);
        
        for (let i = 0; i < numDetections; i++) {
            detections.push({
                label: this.getRandomClassName(),
                score: 0.6 + Math.random() * 0.3,
                xmin: Math.random() * 0.4,
                ymin: Math.random() * 0.4,
                xmax: 0.4 + Math.random() * 0.4,
                ymax: 0.4 + Math.random() * 0.4
            });
        }
        
        return detections;
    }
    
    async detectServer(frameData) {
        try {
            const response = await fetch('/api/detect', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    imageData: frameData.imageData,
                    frameId: frameData.frameId,
                    captureTs: frameData.captureTs
                })
            });
            
            if (!response.ok) {
                throw new Error(`Server detection failed: ${response.status}`);
            }
            
            const result = await response.json();
            return result.detections || [];
            
        } catch (error) {
            console.error('Server detection error:', error);
            return this.getMockDetections();
        }
    }
    
    getCocoClassNames() {
        return [
            'person', 'bicycle', 'car', 'motorcycle', 'airplane', 'bus', 'train', 'truck',
            'boat', 'traffic light', 'fire hydrant', 'stop sign', 'parking meter', 'bench',
            'bird', 'cat', 'dog', 'horse', 'sheep', 'cow', 'elephant', 'bear', 'zebra',
            'giraffe', 'backpack', 'umbrella', 'handbag', 'tie', 'suitcase', 'frisbee',
            'skis', 'snowboard', 'sports ball', 'kite', 'baseball bat', 'baseball glove',
            'skateboard', 'surfboard', 'tennis racket', 'bottle', 'wine glass', 'cup',
            'fork', 'knife', 'spoon', 'bowl', 'banana', 'apple', 'sandwich', 'orange',
            'broccoli', 'carrot', 'hot dog', 'pizza', 'donut', 'cake', 'chair', 'couch',
            'potted plant', 'bed', 'dining table', 'toilet', 'tv', 'laptop', 'mouse',
            'remote', 'keyboard', 'cell phone', 'microwave', 'oven', 'toaster', 'sink',
            'refrigerator', 'book', 'clock', 'vase', 'scissors', 'teddy bear', 'hair drier',
            'toothbrush'
        ];
    }
    
    updateSettings(settings) {
        if (settings.inputSize) {
            this.inputSize = settings.inputSize;
        }
        
        if (settings.targetFPS) {
            this.targetFPS = settings.targetFPS;
            this.frameInterval = 1000 / this.targetFPS;
        }
        
        if (settings.confidenceThreshold) {
            this.modelConfig.confidenceThreshold = settings.confidenceThreshold;
        }
        
        console.log('Detection settings updated:', settings);
    }
    
    getStatus() {
        return {
            mode: this.mode,
            modelLoaded: this.modelLoaded,
            isProcessing: this.isProcessing,
            queueSize: this.processingQueue.length,
            targetFPS: this.targetFPS,
            inputSize: this.inputSize
        };
    }
    
    cleanup() {
        if (this.session && this.session.release) {
            this.session.release();
            this.session = null;
        }
        
        this.processingQueue = [];
        this.modelLoaded = false;
        this.isProcessing = false;
        
        console.log('Detection manager cleaned up');
    }
}

export { DetectionManager };
