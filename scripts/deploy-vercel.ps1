# SynBio-LLVM Web Demo Deployment Script
# Run: .\scripts\deploy-vercel.ps1

Write-Host "🚀 Deploying SynBio-LLVM Web Demo to Vercel..." -ForegroundColor Green

# Check if Vercel CLI is installed
if (-not (Get-Command vercel -ErrorAction SilentlyContinue)) {
    Write-Host "📦 Installing Vercel CLI..." -ForegroundColor Yellow
    npm i -g vercel
}

# Navigate to web-demo directory
$scriptPath = Split-Path -Parent $MyInvocation.MyCommand.Path
$webDemoPath = Join-Path $scriptPath "..\web-demo"
Set-Location $webDemoPath

# Install dependencies if needed
if (-not (Test-Path "node_modules")) {
    Write-Host "📦 Installing dependencies..." -ForegroundColor Yellow
    npm install
}

# Build the project
Write-Host "🔨 Building Next.js app..." -ForegroundColor Yellow
npm run build

if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ Build failed. Fix errors and try again." -ForegroundColor Red
    exit 1
}

# Deploy to Vercel
Write-Host "☁️  Deploying to Vercel..." -ForegroundColor Cyan
vercel --prod

if ($LASTEXITCODE -eq 0) {
    Write-Host "✅ Deployment complete!" -ForegroundColor Green
    Write-Host "📊 View your deployment: https://vercel.com/dashboard" -ForegroundColor Cyan
    Write-Host "🌐 Your demo should be live at: https://synbio-llvm.vercel.app" -ForegroundColor Cyan
} else {
    Write-Host "❌ Deployment failed. Check Vercel logs." -ForegroundColor Red
    exit 1
}
