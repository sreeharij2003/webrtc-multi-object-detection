#!/bin/bash

# WebRTC VLM Detection System Startup Script
set -e

# Default configuration
MODE=${MODE:-"wasm"}
USE_NGROK=${USE_NGROK:-false}
PORT=${PORT:-3000}
SIGNALING_PORT=${SIGNALING_PORT:-8080}

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Function to print colored output
print_status() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

print_header() {
    echo -e "${BLUE}================================${NC}"
    echo -e "${BLUE} WebRTC VLM Detection System${NC}"
    echo -e "${BLUE}================================${NC}"
}

# Parse command line arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        --mode)
            MODE="$2"
            shift 2
            ;;
        --ngrok)
            USE_NGROK=true
            shift
            ;;
        --port)
            PORT="$2"
            shift 2
            ;;
        --help)
            echo "Usage: $0 [OPTIONS]"
            echo ""
            echo "Options:"
            echo "  --mode MODE     Set processing mode (server|wasm) [default: wasm]"
            echo "  --ngrok         Enable ngrok for external access"
            echo "  --port PORT     Set HTTP port [default: 3000]"
            echo "  --help          Show this help message"
            echo ""
            echo "Examples:"
            echo "  $0                          # Start in WASM mode"
            echo "  $0 --mode server            # Start in server mode"
            echo "  $0 --ngrok                  # Start with ngrok tunnel"
            echo "  $0 --mode server --ngrok    # Server mode with ngrok"
            exit 0
            ;;
        *)
            print_error "Unknown option: $1"
            echo "Use --help for usage information"
            exit 1
            ;;
    esac
done

print_header

# Validate mode
if [[ "$MODE" != "server" && "$MODE" != "wasm" ]]; then
    print_error "Invalid mode: $MODE. Must be 'server' or 'wasm'"
    exit 1
fi

print_status "Starting in $MODE mode..."

# Check if Docker is available
if command -v docker &> /dev/null && command -v docker-compose &> /dev/null; then
    print_status "Using Docker Compose..."
    
    # Set environment variables for docker-compose
    export MODE
    export PORT
    export SIGNALING_PORT
    
    # Build and start services
    docker-compose down --remove-orphans 2>/dev/null || true
    docker-compose up --build -d
    
    # Wait for services to be ready
    print_status "Waiting for services to start..."
    sleep 5
    
    # Check if services are running
    if docker-compose ps | grep -q "Up"; then
        print_status "Services started successfully!"
    else
        print_error "Failed to start services"
        docker-compose logs
        exit 1
    fi
    
else
    print_status "Docker not available, starting locally..."
    
    # Check if Node.js is available
    if ! command -v node &> /dev/null; then
        print_error "Node.js is required but not installed"
        exit 1
    fi
    
    # Install dependencies if needed
    if [ ! -d "node_modules" ]; then
        print_status "Installing dependencies..."
        npm install
    fi
    
    # Install client dependencies if needed
    if [ ! -d "client/node_modules" ]; then
        print_status "Installing client dependencies..."
        cd client && npm install && cd ..
    fi
    
    # Build client if needed
    if [ ! -d "client/dist" ]; then
        print_status "Building client..."
        cd client && npm run build && cd ..
    fi
    
    # Set environment variables
    export MODE
    export PORT
    export SIGNALING_PORT
    
    # Start the application
    npm start &
    SERVER_PID=$!
fi

# Setup ngrok if requested
if [ "$USE_NGROK" = true ]; then
    if command -v ngrok &> /dev/null; then
        print_status "Starting ngrok tunnel..."
        ngrok http $PORT --log=stdout > ngrok.log 2>&1 &
        NGROK_PID=$!
        
        # Wait for ngrok to start
        sleep 3
        
        # Get ngrok URL
        NGROK_URL=$(curl -s http://localhost:4040/api/tunnels | grep -o 'https://[^"]*\.ngrok\.io')
        
        if [ -n "$NGROK_URL" ]; then
            print_status "Ngrok tunnel active: $NGROK_URL"
            echo "$NGROK_URL" > ngrok_url.txt
        else
            print_warning "Could not retrieve ngrok URL"
        fi
    else
        print_warning "ngrok not found, install it from https://ngrok.com/"
    fi
fi

# Display connection information
print_status "System ready!"
echo ""
echo "Local URL: http://localhost:$PORT"
if [ "$USE_NGROK" = true ] && [ -n "$NGROK_URL" ]; then
    echo "Public URL: $NGROK_URL"
fi
echo ""
echo "Mode: $MODE"
echo "Signaling Port: $SIGNALING_PORT"
echo ""
print_status "Open the URL on your laptop and scan the QR code with your phone"
print_status "Press Ctrl+C to stop the system"

# Cleanup function
cleanup() {
    print_status "Shutting down..."
    
    if command -v docker-compose &> /dev/null; then
        docker-compose down
    else
        if [ -n "$SERVER_PID" ]; then
            kill $SERVER_PID 2>/dev/null || true
        fi
    fi
    
    if [ -n "$NGROK_PID" ]; then
        kill $NGROK_PID 2>/dev/null || true
    fi
    
    print_status "Cleanup complete"
}

# Set up signal handlers
trap cleanup SIGINT SIGTERM

# Wait for user interrupt
if command -v docker-compose &> /dev/null; then
    docker-compose logs -f
else
    wait $SERVER_PID
fi
