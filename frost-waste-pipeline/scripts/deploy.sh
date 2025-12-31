#!/bin/bash

echo "🚀 Deploying Collecct System..."

# 1. Run type check
echo "📝 Type checking..."
npx tsc --noEmit

if [ $? -ne 0 ]; then
  echo "❌ Type check failed!"
  exit 1
fi

# 2. Run build test
echo "🏗️  Building..."
npm run build

if [ $? -ne 0 ]; then
  echo "❌ Build failed!"
  exit 1
fi

echo "✅ Build successful!"
echo "🔍 Check health at: https://your-domain.vercel.app/health"
echo "📊 Review dashboard: https://your-domain.vercel.app/collecct"

