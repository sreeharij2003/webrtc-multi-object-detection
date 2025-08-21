#!/usr/bin/env node

/**
 * Model Download Script
 * Downloads pre-trained ONNX models for object detection
 */

const fs = require('fs').promises;
const path = require('path');
const https = require('https');

class ModelDownloader {
    constructor() {
        this.modelsDir = path.join(__dirname);
        this.models = {
            // YOLOv5n - Nano version (small, fast)
            yolov5n: {
                url: 'https://github.com/ultralytics/yolov5/releases/download/v7.0/yolov5n.onnx',
                filename: 'yolov5n.onnx',
                size: '14MB',
                description: 'YOLOv5 Nano - Fast, lightweight object detection'
            },
            // MobileNet SSD (alternative)
            mobilenet_ssd: {
                url: 'https://storage.googleapis.com/tfhub-lite-models/tensorflow/lite-model/ssd_mobilenet_v1/1/metadata/1.tflite',
                filename: 'mobilenet_ssd.tflite',
                size: '27MB',
                description: 'MobileNet SSD - Mobile-optimized detection'
            }
        };
    }

    async ensureModelsDir() {
        try {
            await fs.access(this.modelsDir);
        } catch {
            await fs.mkdir(this.modelsDir, { recursive: true });
            console.log('📁 Created models directory');
        }
    }

    async downloadFile(url, filepath) {
        return new Promise((resolve, reject) => {
            const file = require('fs').createWriteStream(filepath);
            
            https.get(url, (response) => {
                if (response.statusCode === 302 || response.statusCode === 301) {
                    // Handle redirect
                    return this.downloadFile(response.headers.location, filepath)
                        .then(resolve)
                        .catch(reject);
                }
                
                if (response.statusCode !== 200) {
                    reject(new Error(`HTTP ${response.statusCode}: ${response.statusMessage}`));
                    return;
                }

                const totalSize = parseInt(response.headers['content-length'], 10);
                let downloadedSize = 0;

                response.on('data', (chunk) => {
                    downloadedSize += chunk.length;
                    if (totalSize) {
                        const percent = ((downloadedSize / totalSize) * 100).toFixed(1);
                        process.stdout.write(`\r📥 Downloading... ${percent}%`);
                    }
                });

                response.pipe(file);

                file.on('finish', () => {
                    file.close();
                    console.log('\n✅ Download complete');
                    resolve();
                });

                file.on('error', (err) => {
                    fs.unlink(filepath);
                    reject(err);
                });
            }).on('error', reject);
        });
    }

    async downloadModel(modelKey) {
        const model = this.models[modelKey];
        if (!model) {
            throw new Error(`Unknown model: ${modelKey}`);
        }

        const filepath = path.join(this.modelsDir, model.filename);
        
        // Check if model already exists
        try {
            await fs.access(filepath);
            console.log(`✅ Model ${model.filename} already exists`);
            return;
        } catch {
            // Model doesn't exist, download it
        }

        console.log(`📥 Downloading ${model.description}`);
        console.log(`📊 Size: ${model.size}`);
        console.log(`🔗 URL: ${model.url}`);
        
        try {
            await this.downloadFile(model.url, filepath);
            console.log(`✅ Successfully downloaded ${model.filename}`);
        } catch (error) {
            console.error(`❌ Failed to download ${model.filename}:`, error.message);
            throw error;
        }
    }

    async downloadAll() {
        await this.ensureModelsDir();
        
        console.log('🤖 Downloading ML models for object detection...\n');
        
        for (const [key, model] of Object.entries(this.models)) {
            try {
                await this.downloadModel(key);
                console.log('');
            } catch (error) {
                console.error(`❌ Failed to download ${key}:`, error.message);
                console.log('');
            }
        }
        
        console.log('🎉 Model download process completed!');
    }

    async createModelConfig() {
        const config = {
            models: {
                yolov5n: {
                    path: './models/yolov5n.onnx',
                    type: 'onnx',
                    inputShape: [1, 3, 640, 640],
                    outputShape: [1, 25200, 85],
                    classes: 80,
                    anchors: [
                        [10, 13, 16, 30, 33, 23],
                        [30, 61, 62, 45, 59, 119],
                        [116, 90, 156, 198, 373, 326]
                    ],
                    classNames: [
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
                    ]
                }
            },
            default: 'yolov5n',
            confidence_threshold: 0.5,
            nms_threshold: 0.4
        };

        const configPath = path.join(this.modelsDir, 'config.json');
        await fs.writeFile(configPath, JSON.stringify(config, null, 2));
        console.log('📝 Created model configuration file');
    }
}

// Run if called directly
if (require.main === module) {
    const downloader = new ModelDownloader();
    
    downloader.downloadAll()
        .then(() => downloader.createModelConfig())
        .then(() => {
            console.log('\n🎯 Ready to use real ML models!');
            console.log('💡 Models available:');
            console.log('   - YOLOv5n: Fast, lightweight detection');
            console.log('   - MobileNet SSD: Mobile-optimized');
        })
        .catch((error) => {
            console.error('❌ Setup failed:', error);
            process.exit(1);
        });
}

module.exports = ModelDownloader;
