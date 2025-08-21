# WebRTC VLM Multi-Object Detection System

A real-time computer vision system that performs multi-object detection on live video streamed from a phone via WebRTC, with support for both server-side and client-side (WASM) inference modes.

## 🚀 Quick Start

### One-Command Start

```bash
# Default WASM mode (low-resource)
./start.sh

# Server mode (requires more resources)
./start.sh --mode server

# With ngrok for external access
./start.sh --ngrok

# Windows users
start.bat
```

### Using Docker

```bash
# Build and start with Docker Compose
docker-compose up --build

# Or with specific mode
MODE=server docker-compose up --build
```

## 📱 Phone Connection

1. Start the system using one of the methods above
2. Open http://localhost:3000 on your laptop
3. Scan the displayed QR code with your phone's camera
4. Allow camera permissions on your phone
5. You should see live video with detection overlays

### Troubleshooting Phone Connection

- **Phone won't connect**: Ensure phone and laptop are on the same network
- **No QR code**: Try refreshing the page or check console for errors
- **Camera permission denied**: Use `./start.sh --ngrok` for external access
- **Poor connection**: Reduce resolution in phone settings

## 🔧 Mode Switching

### WASM Mode (Default - Low Resource)
- Client-side inference using ONNX Runtime Web
- Optimized for modest laptops (Intel i5, 8GB RAM)
- Input resolution: 320×240
- Target FPS: 10-15
- CPU usage: ~30-50%

```bash
./start.sh --mode wasm
```

### Server Mode (High Performance)
- Server-side inference using ONNX Runtime Node.js
- Better accuracy and performance
- Input resolution: 640×480
- Target FPS: 15-30
- Requires dedicated GPU or powerful CPU

```bash
./start.sh --mode server
```

## 📊 Benchmarking

Run performance benchmarks to collect metrics:

```bash
# 30-second benchmark in WASM mode
./bench/run_bench.sh --duration 30 --mode wasm

# 60-second benchmark in server mode
node bench/run_bench.js --duration 60 --mode server --verbose

# Windows users
cd bench && node run_bench.js --duration 30 --mode wasm
```

### Benchmark Output

The benchmark generates `metrics.json` with:
- **Median & P95 end-to-end latency** (ms)
- **Processed FPS** (frames per second)
- **Uplink/Downlink bandwidth** (kbps)
- **CPU and memory usage**
- **Frame alignment accuracy**

Example metrics.json:
```json
{
  "median_latency_ms": 120.5,
  "p95_latency_ms": 250.8,
  "processed_fps": 12.3,
  "uplink_kbps": 850.2,
  "downlink_kbps": 1200.5
}
```

## 🏗️ Architecture

### System Components

```
Phone (Camera) → WebRTC → Desktop Browser → Detection Engine → Overlay Renderer
     ↓              ↓           ↓               ↓              ↓
  Video Stream → Signaling → Frame Capture → Inference → Bounding Boxes
```

### Detection Pipeline

1. **Frame Capture**: Phone captures video frames at configurable FPS
2. **WebRTC Streaming**: Frames transmitted via WebRTC data channels
3. **Frame Alignment**: Timestamp-based synchronization for overlay accuracy
4. **Object Detection**: YOLO/MobileNet-SSD inference (server or WASM)
5. **Overlay Rendering**: Real-time bounding box rendering on video

### Message Format

Detection results follow this JSON contract:
```json
{
  "frame_id": "string_or_int",
  "capture_ts": 1690000000000,
  "recv_ts": 1690000000100,
  "inference_ts": 1690000000120,
  "detections": [
    {
      "label": "person",
      "score": 0.93,
      "xmin": 0.12,
      "ymin": 0.08,
      "xmax": 0.34,
      "ymax": 0.67
    }
  ]
}
```

## ⚡ Performance Optimization

### Low-Resource Mode Features

- **Frame Thinning**: Processes only latest frames, drops old ones when overloaded
- **Adaptive Sampling**: Automatically adjusts FPS based on processing capacity
- **Quantized Models**: Uses INT8 quantized models for faster inference
- **Resolution Scaling**: Defaults to 320×240 input for WASM mode
- **Backpressure Handling**: Queue-based processing with configurable limits

### CPU Usage on Modest Hardware

**Intel i5-8250U, 8GB RAM:**
- WASM Mode: 35-45% CPU, 150-200MB RAM
- Server Mode: 60-80% CPU, 300-500MB RAM

**Optimization Strategies:**
- Use WASM mode for battery-powered devices
- Enable hardware acceleration when available
- Adjust resolution based on network conditions
- Implement frame skipping during high load

## 🛠️ Development

### Prerequisites

- Node.js 16+
- npm or yarn
- Modern browser with WebRTC support
- Camera-enabled mobile device

### Installation

```bash
# Clone repository
git clone <repo-url>
cd webrtc-vlm-detection

# Install dependencies
npm install
cd client && npm install && cd ..

# Start development server
npm run dev
```

### Project Structure

```
├── server/                 # Node.js backend
│   ├── index.js           # Main server entry
│   ├── webrtc/            # WebRTC signaling
│   ├── detection/         # Object detection service
│   └── metrics/           # Performance monitoring
├── client/                # Frontend application
│   ├── src/
│   │   ├── main.js        # Desktop app entry
│   │   ├── phone.js       # Phone app entry
│   │   ├── webrtc/        # WebRTC client
│   │   ├── detection/     # WASM detection
│   │   └── rendering/     # Overlay rendering
├── bench/                 # Benchmarking tools
├── models/                # ML models (downloaded)
└── docker-compose.yml     # Container orchestration
```

### API Endpoints

- `GET /` - Desktop interface
- `GET /phone` - Phone interface  
- `GET /qr` - QR code generation
- `POST /api/detect` - Object detection
- `GET /api/metrics` - Performance metrics
- `GET /health` - Health check

## 🔍 Debugging

### Debug Mode

Enable verbose logging:
```bash
./start.sh --mode wasm --verbose
```

### Browser Debug Tools

1. Open Chrome DevTools
2. Go to `chrome://webrtc-internals/`
3. Monitor RTP stats and connection quality
4. Check console for WebRTC events

### Common Issues

**High Latency:**
- Check network conditions
- Reduce video resolution
- Switch to WASM mode
- Enable hardware acceleration

**Frame Drops:**
- Increase processing queue size
- Reduce target FPS
- Check CPU usage
- Optimize detection model

**Connection Issues:**
- Verify firewall settings
- Check STUN/TURN server connectivity
- Use ngrok for NAT traversal
- Ensure WebRTC support in browser

## 📈 Metrics & Monitoring

### Real-time Metrics

The system tracks:
- **End-to-end latency**: capture_ts → overlay_display_ts
- **Network latency**: capture_ts → recv_ts  
- **Inference latency**: recv_ts → inference_ts
- **Frame rate**: Processed frames per second
- **Bandwidth**: Upload/download rates
- **System resources**: CPU and memory usage

### Performance Targets

| Metric | WASM Mode | Server Mode |
|--------|-----------|-------------|
| Latency (median) | <200ms | <150ms |
| Latency (P95) | <400ms | <300ms |
| FPS | 10-15 | 15-30 |
| CPU Usage | <50% | <80% |
| Memory Usage | <200MB | <500MB |

## 🚢 Deployment

### Production Deployment

```bash
# Build production images
docker-compose -f docker-compose.prod.yml build

# Deploy with SSL
docker-compose -f docker-compose.prod.yml up -d

# Scale services
docker-compose up --scale webrtc-vlm-app=3
```

### Environment Variables

```bash
MODE=server              # Processing mode
PORT=3000               # HTTP port
SIGNALING_PORT=8080     # WebRTC signaling port
NODE_ENV=production     # Environment
LOG_LEVEL=info          # Logging level
```

## 📄 License

MIT License - see LICENSE file for details.

## 🤝 Contributing

1. Fork the repository
2. Create feature branch (`git checkout -b feature/amazing-feature`)
3. Commit changes (`git commit -m 'Add amazing feature'`)
4. Push to branch (`git push origin feature/amazing-feature`)
5. Open Pull Request

## 📞 Support

- **Issues**: GitHub Issues
- **Discussions**: GitHub Discussions
- **Documentation**: Wiki pages
- **Performance**: Benchmark results in `metrics.json`

---

**Next Improvements:**
- Edge deployment with WebAssembly
- Multi-model ensemble detection
- Real-time model switching
- Advanced frame interpolation
- Mobile app with native WebRTC
"# webrtc-multi-object-detection" 
