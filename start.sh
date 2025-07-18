#!/bin/bash

# Yamato WhatsApp Bot v3.0 Enhanced - Production Startup Script
# This script provides robust startup with proper error handling and monitoring

set -euo pipefail  # Exit on error, undefined vars, pipe failures

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Logging function
log() {
    echo -e "${BLUE}[$(date +'%Y-%m-%d %H:%M:%S')] [INFO]${NC} $1"
}

warn() {
    echo -e "${YELLOW}[$(date +'%Y-%m-%d %H:%M:%S')] [WARN]${NC} $1"
}

error() {
    echo -e "${RED}[$(date +'%Y-%m-%d %H:%M:%S')] [ERROR]${NC} $1"
}

success() {
    echo -e "${GREEN}[$(date +'%Y-%m-%d %H:%M:%S')] [SUCCESS]${NC} $1"
}

# Check if running as root (not recommended)
if [[ $EUID -eq 0 ]]; then
   warn "Running as root is not recommended for security reasons"
   read -p "Continue anyway? (y/N): " -n 1 -r
   echo
   if [[ ! $REPLY =~ ^[Yy]$ ]]; then
       exit 1
   fi
fi

# Function to check system requirements
check_requirements() {
    log "Checking system requirements..."
    
    # Check Node.js version
    if ! command -v node &> /dev/null; then
        error "Node.js is not installed. Please install Node.js 18 or higher."
        exit 1
    fi
    
    NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
    if [[ $NODE_VERSION -lt 18 ]]; then
        error "Node.js version $NODE_VERSION is not supported. Please upgrade to Node.js 18 or higher."
        exit 1
    fi
    
    success "Node.js $(node -v) detected"
    
    # Check npm
    if ! command -v npm &> /dev/null; then
        error "npm is not installed"
        exit 1
    fi
    
    # Check if package.json exists
    if [[ ! -f "package.json" ]]; then
        error "package.json not found. Make sure you're in the correct directory."
        exit 1
    fi
    
    # Check if .env file exists
    if [[ ! -f ".env" ]]; then
        warn ".env file not found"
        if [[ -f ".env.example" ]]; then
            log "Found .env.example. Please copy it to .env and configure your settings:"
            echo "  cp .env.example .env"
            echo "  nano .env  # Edit with your settings"
            exit 1
        else
            error "No .env or .env.example file found"
            exit 1
        fi
    fi
    
    # Check if GROQ_API_KEY is set
    if ! grep -q "GROQ_API_KEY=" .env || grep -q "GROQ_API_KEY=your_groq_api_key_here" .env; then
        error "GROQ_API_KEY not properly configured in .env file"
        echo "Please get your API key from: https://console.groq.com/"
        exit 1
    fi
    
    success "Environment configuration looks good"
}

# Function to install dependencies
install_dependencies() {
    log "Installing/updating dependencies..."
    
    if [[ ! -d "node_modules" ]] || [[ "package.json" -nt "node_modules" ]]; then
        log "Installing npm dependencies..."
        npm install --production --silent
        success "Dependencies installed successfully"
    else
        log "Dependencies are up to date"
    fi
}

# Function to create necessary directories
create_directories() {
    log "Creating necessary directories..."
    
    # Create commands directory if it doesn't exist
    if [[ ! -d "commands" ]]; then
        mkdir -p commands
        log "Created commands directory"
    fi
    
    # Create stickers directory if it doesn't exist
    if [[ ! -d "stickers_webp" ]]; then
        mkdir -p stickers_webp
        log "Created stickers_webp directory"
        log "Add your .webp sticker files to this directory"
    fi
    
    # Check if auth directory exists (will be created by bot)
    if [[ -d "auth_info_bot" ]]; then
        log "Found existing WhatsApp session data"
    else
        log "No existing session found - QR code will be generated"
    fi
}

# Function to check port availability
check_port() {
    local port=${1:-3000}
    
    if command -v lsof &> /dev/null; then
        if lsof -Pi :$port -sTCP:LISTEN -t >/dev/null; then
            error "Port $port is already in use"
            echo "Please either:"
            echo "  1. Stop the service using port $port"
            echo "  2. Change PORT in .env file"
            echo "  3. Kill the process: sudo lsof -ti:$port | xargs kill -9"
            exit 1
        fi
    fi
    
    log "Port $port is available"
}

# Function to cleanup on exit
cleanup() {
    log "Cleaning up..."
    # Kill any background processes if needed
    jobs -p | xargs -r kill 2>/dev/null || true
}

# Function to monitor bot health
monitor_health() {
    local port=${1:-3000}
    log "Setting up health monitoring..."
    
    # Wait for bot to start
    sleep 10
    
    # Health check loop (runs in background)
    (
        while true; do
            sleep 30
            if curl -s -f http://localhost:$port/health >/dev/null 2>&1; then
                log "Health check: OK"
            else
                warn "Health check failed - bot may be unresponsive"
            fi
        done
    ) &
    
    log "Health monitoring started (PID: $!)"
}

# Function to show startup info
show_startup_info() {
    echo
    echo "=================================="
    echo "🤖 Yamato WhatsApp Bot v3.0"
    echo "=================================="
    echo "📊 Status: Starting up..."
    echo "🌐 Health endpoint: http://localhost:${PORT:-3000}/health"
    echo "📈 Status endpoint: http://localhost:${PORT:-3000}/"
    echo "📝 Logs: Check terminal output"
    echo "🔧 Admin commands: /restart (if ADMIN_NUMBER set)"
    echo "=================================="
    echo
}

# Function to start the bot with monitoring
start_bot() {
    log "Starting Yamato WhatsApp Bot v3.0 Enhanced..."
    
    # Set trap for cleanup
    trap cleanup EXIT INT TERM
    
    # Show startup info
    show_startup_info
    
    # Get port from env file or use default
    PORT=$(grep "PORT=" .env 2>/dev/null | cut -d'=' -f2 || echo "3000")
    
    # Start health monitoring in background
    monitor_health $PORT &
    
    # Start the bot
    log "Launching bot process..."
    
    # Use exec to replace shell with node process for proper signal handling
    exec node whatsapp-bot.js
}

# Function to show help
show_help() {
    echo "Yamato WhatsApp Bot v3.0 Enhanced - Startup Script"
    echo
    echo "Usage: $0 [options]"
    echo
    echo "Options:"
    echo "  --help, -h     Show this help message"
    echo "  --check        Only check requirements and configuration"
    echo "  --clean        Clean auth data and user database"
    echo "  --reset        Clean everything and start fresh"
    echo "  --no-monitor   Start without health monitoring"
    echo
    echo "Examples:"
    echo "  $0              # Normal startup"
    echo "  $0 --check     # Check configuration only"
    echo "  $0 --clean     # Clean auth data and restart"
    echo "  $0 --reset     # Complete reset and restart"
    echo
}

# Function to clean data
clean_data() {
    log "Cleaning bot data..."
    
    if [[ -d "auth_info_bot" ]]; then
        rm -rf auth_info_bot
        success "Removed WhatsApp session data"
    fi
    
    if [[ -f "users.json" ]]; then
        rm -f users.json
        success "Removed user database"
    fi
    
    if [[ -d "commands" ]] && [[ "$(ls -A commands 2>/dev/null)" ]]; then
        rm -f commands/*.js
        success "Removed generated command files"
    fi
    
    log "Data cleanup completed"
}

# Main execution
main() {
    case "${1:-}" in
        --help|-h)
            show_help
            exit 0
            ;;
        --check)
            log "Running configuration check..."
            check_requirements
            success "Configuration check completed successfully"
            exit 0
            ;;
        --clean)
            clean_data
            log "Continuing with startup..."
            ;;
        --reset)
            clean_data
            log "Performing complete reset..."
            ;;
        --no-monitor)
            log "Starting without health monitoring..."
            NO_MONITOR=true
            ;;
        "")
            # Normal startup
            ;;
        *)
            error "Unknown option: $1"
            show_help
            exit 1
            ;;
    esac
    
    # Run startup sequence
    check_requirements
    install_dependencies
    create_directories
    
    # Get port and check availability
    PORT=$(grep "PORT=" .env 2>/dev/null | cut -d'=' -f2 || echo "3000")
    check_port $PORT
    
    # Start the bot
    start_bot
}

# Run main function with all arguments
main "$@"