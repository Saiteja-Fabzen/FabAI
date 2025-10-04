#!/bin/bash

echo "🚀 FabAI Setup Script"
echo "===================="
echo ""

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
    echo "❌ Node.js is not installed. Please install Node.js 18 or higher."
    exit 1
fi

# Check Node.js version
NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$NODE_VERSION" -lt 18 ]; then
    echo "❌ Node.js version must be 18 or higher. Current version: $(node -v)"
    exit 1
fi

echo "✅ Node.js version: $(node -v)"
echo ""

# Install dependencies
echo "📦 Installing dependencies..."
npm install

if [ $? -ne 0 ]; then
    echo "❌ Failed to install dependencies"
    exit 1
fi

echo "✅ Dependencies installed"
echo ""

# Check if .env exists
if [ ! -f .env ]; then
    echo "⚠️  .env file not found. Creating from .env.example..."
    cp .env.example .env
    echo "✅ .env file created. Please edit it with your credentials."
    echo ""
    echo "Required environment variables:"
    echo "  - SLACK_BOT_TOKEN"
    echo "  - SLACK_APP_TOKEN"
    echo "  - SLACK_SIGNING_SECRET"
    echo "  - ANTHROPIC_API_KEY"
    echo "  - GITHUB_TOKEN"
    echo "  - NGROK_AUTH_TOKEN"
    echo ""
fi

# Create logs directory
mkdir -p logs
echo "✅ Logs directory created"
echo ""

# Initialize git submodule
echo "📥 Initializing git submodule..."
git submodule update --init --recursive

if [ $? -ne 0 ]; then
    echo "⚠️  Warning: Failed to initialize submodule. This is normal if submodule doesn't exist yet."
fi

echo ""

# Build TypeScript
echo "🔨 Building TypeScript..."
npm run build

if [ $? -ne 0 ]; then
    echo "⚠️  Build completed with errors. Check TypeScript configuration."
else
    echo "✅ Build successful"
fi

echo ""
echo "🎉 Setup complete!"
echo ""
echo "Next steps:"
echo "1. Edit .env file with your credentials"
echo "2. Update config/users.json with your Slack user ID"
echo "3. Update config/websites.json with your websites"
echo "4. Run 'npm run dev' to start the bot"
echo ""
echo "📚 See SETUP_GUIDE.md for detailed instructions"
