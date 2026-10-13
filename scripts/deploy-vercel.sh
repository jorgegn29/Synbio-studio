#!/bin/bash

echo "🚀 Deploying SynBio-LLVM Web Demo to Vercel..."

# Check if Vercel CLI is installed
if ! command -v vercel &> /dev/null; then
    echo "📦 Installing Vercel CLI..."
    npm i -g vercel
fi

# Navigate to web-demo directory
cd "$(dirname "$0")/../web-demo" || exit 1

# Install dependencies if needed
if [ ! -d "node_modules" ]; then
    echo "📦 Installing dependencies..."
    npm install
fi

# Build the project
echo "🔨 Building Next.js app..."
npm run build

# Deploy to Vercel
echo "☁️  Deploying to Vercel..."
vercel --prod

echo "✅ Deployment complete!"
echo "📊 View deployment: https://vercel.com/dashboard"
