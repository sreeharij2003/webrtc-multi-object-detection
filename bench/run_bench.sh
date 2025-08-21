#!/bin/bash

# WebRTC VLM Detection Benchmark Script
# Runs automated performance tests and generates metrics.json

set -e

# Default configuration
DURATION=30
MODE="wasm"
OUTPUT="metrics.json"
VERBOSE=false

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

print_usage() {
    echo "Usage: $0 [OPTIONS]"
    echo ""
    echo "Options:"
    echo "  --duration SECONDS    Duration of benchmark in seconds (default: 30)"
    echo "  --mode MODE          Processing mode: server|wasm (default: wasm)"
    echo "  --output FILE        Output metrics file (default: metrics.json)"
    echo "  --verbose            Enable verbose logging"
    echo "  --help               Show this help message"
    echo ""
    echo "Examples:"
    echo "  $0 --duration 30 --mode wasm"
    echo "  $0 --duration 60 --mode server --verbose"
    echo "  $0 --output benchmark-results.json"
}

print_status() {
    echo -e "${GREEN}[BENCH]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

# Parse command line arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        --duration)
            DURATION="$2"
            shift 2
            ;;
        --mode)
            MODE="$2"
            shift 2
            ;;
        --output)
            OUTPUT="$2"
            shift 2
            ;;
        --verbose)
            VERBOSE=true
            shift
            ;;
        --help)
            print_usage
            exit 0
            ;;
        *)
            print_error "Unknown option: $1"
            print_usage
            exit 1
            ;;
    esac
done

print_status "Starting WebRTC VLM Detection Benchmark"
print_status "Duration: ${DURATION}s, Mode: ${MODE}, Output: ${OUTPUT}"

# Check if Node.js is available
if ! command -v node &> /dev/null; then
    print_error "Node.js is required but not installed"
    exit 1
fi

# Run the JavaScript benchmark
if [ "$VERBOSE" = true ]; then
    node run_bench.js --duration "$DURATION" --mode "$MODE" --output "$OUTPUT" --verbose
else
    node run_bench.js --duration "$DURATION" --mode "$MODE" --output "$OUTPUT"
fi

print_status "Benchmark completed successfully"
print_status "Results saved to: $OUTPUT"
