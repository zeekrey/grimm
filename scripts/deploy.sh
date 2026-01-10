#!/bin/bash
# Deploy Grimm to Raspberry Pi
#
# Usage:
#   ./scripts/deploy.sh pi@raspberrypi.local
#   ./scripts/deploy.sh pi@192.168.1.100
#
# This script:
#   1. Creates a deployment package (excluding node_modules, .git, etc.)
#   2. Copies it to the Raspberry Pi
#   3. Extracts and installs dependencies on the Pi

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check arguments
if [ -z "$1" ]; then
    echo -e "${RED}Error: Please provide the Raspberry Pi SSH target${NC}"
    echo ""
    echo "Usage: $0 user@hostname"
    echo "Example: $0 pi@raspberrypi.local"
    echo "Example: $0 pi@192.168.1.100"
    exit 1
fi

TARGET="$1"
DEPLOY_DIR="/home/pi/grimm"
PACKAGE_NAME="grimm-deploy.tar.gz"

echo -e "${GREEN}Deploying Grimm to ${TARGET}${NC}"
echo ""

# Step 1: Create package
echo -e "${YELLOW}Step 1: Creating deployment package...${NC}"
tar -czvf "$PACKAGE_NAME" \
    --exclude=node_modules \
    --exclude=.git \
    --exclude=.env \
    --exclude="*.wav" \
    --exclude="*.mp3" \
    --exclude="models/*.onnx" \
    --exclude="$PACKAGE_NAME" \
    .

echo -e "${GREEN}Created ${PACKAGE_NAME}${NC}"
echo ""

# Step 2: Copy to Pi
echo -e "${YELLOW}Step 2: Copying to Raspberry Pi...${NC}"
scp "$PACKAGE_NAME" "${TARGET}:~/"
echo -e "${GREEN}Package copied${NC}"
echo ""

# Step 3: Extract and install on Pi
echo -e "${YELLOW}Step 3: Installing on Raspberry Pi...${NC}"
ssh "$TARGET" << 'REMOTE_SCRIPT'
set -e

# Create directory
mkdir -p ~/grimm
cd ~/grimm

# Extract
tar -xzvf ~/grimm-deploy.tar.gz

# Check for Bun
if ! command -v bun &> /dev/null; then
    echo "Installing Bun..."
    curl -fsSL https://bun.sh/install | bash
    source ~/.bashrc
fi

# Install dependencies
echo "Installing dependencies..."
~/.bun/bin/bun install

# Download models
echo "Downloading wake word models..."
~/.bun/bin/bun run models:download

# Clean up
rm -f ~/grimm-deploy.tar.gz

echo ""
echo "Installation complete!"
echo ""
echo "Next steps:"
echo "  1. Create .env file: nano ~/grimm/.env"
echo "  2. Add your API keys (see .env.example)"
echo "  3. Test: cd ~/grimm && bun run demo:llm --full"
REMOTE_SCRIPT

# Clean up local package
rm -f "$PACKAGE_NAME"

echo ""
echo -e "${GREEN}Deployment complete!${NC}"
echo ""
echo "Connect to your Pi and configure:"
echo "  ssh ${TARGET}"
echo "  cd ~/grimm"
echo "  cp .env.example .env"
echo "  nano .env  # Add your API keys"
echo "  bun run demo:llm --full"
