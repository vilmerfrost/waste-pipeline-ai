#!/bin/bash

# Collecct Demo System Setup Script
# NO AZURE CREDENTIALS NEEDED

echo "================================================================"
echo "🚀 COLLECCT DEMO SYSTEM SETUP"
echo "================================================================"
echo ""
echo "✅ NO Azure credentials needed"
echo "✅ Works 100% locally"
echo "✅ Perfect for testing and demos"
echo ""
echo "================================================================"
echo ""

# Check Python
if ! command -v python3 &> /dev/null; then
    echo "❌ Python 3 not found. Please install Python 3.8+"
    exit 1
fi

echo "✅ Python 3 found: $(python3 --version)"
echo ""

# Install dependencies
echo "📦 Installing Python dependencies..."
pip install -r requirements.txt --quiet
if [ $? -eq 0 ]; then
    echo "✅ Dependencies installed"
else
    echo "❌ Failed to install dependencies"
    exit 1
fi
echo ""

# Create directories
echo "📁 Creating directories..."
mkdir -p /tmp/collecct/incoming
mkdir -p /tmp/collecct/processed
mkdir -p /tmp/collecct/failed
mkdir -p /tmp/collecct/review
mkdir -p /tmp/collecct/uploads
mkdir -p /tmp/collecct/mock-blob/failed-files
mkdir -p /tmp/collecct/mock-blob/processed-files
echo "✅ Directories created"
echo ""

# Setup mock blob with samples
echo "🌱 Setting up mock blob storage..."
python3 utils/mock_blob_connector.py --seed
echo "✅ Mock blob ready"
echo ""

echo "================================================================"
echo "✅ SETUP COMPLETE!"
echo "================================================================"
echo ""
echo "📂 DEMO SYSTEM READY - 3 WAYS TO USE:"
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "1️⃣  LOCAL FILE WATCHER (Auto-process files)"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "Start the file watcher:"
echo "  python3 utils/local_file_watcher.py"
echo ""
echo "Then drop files here to auto-process:"
echo "  /tmp/collecct/incoming/"
echo ""
echo "Results appear in:"
echo "  /tmp/collecct/review/"
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "2️⃣  WEB UPLOAD INTERFACE (Drag & Drop)"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "Start the API server:"
echo "  python3 api/server_demo.py"
echo ""
echo "Then open your React frontend with web-upload.jsx"
echo "Drag & drop files for instant processing!"
echo ""
echo "API runs at: http://localhost:8000"
echo "API docs: http://localhost:8000/docs"
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "3️⃣  MOCK AZURE BLOB (Test full workflow)"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "Drop files in mock blob:"
echo "  /tmp/collecct/mock-blob/failed-files/"
echo ""
echo "Run orchestrator (uses mock blob):"
echo "  python3 agents/orchestrator.py --mock --batch-size 5"
echo ""
echo "Processed files appear in:"
echo "  /tmp/collecct/mock-blob/processed-files/"
echo ""
echo "================================================================"
echo ""
echo "💡 DEMO TO MARTIN:"
echo ""
echo "1. Start API server (option 2)"
echo "2. Open web upload interface"
echo "3. Drag & drop waste documents"
echo "4. Show instant extraction results"
echo "5. Download JSON output"
echo ""
echo "🎯 NO AZURE CREDENTIALS NEEDED!"
echo ""
echo "================================================================"
echo ""
echo "🔥 READY TO DEMO!"
echo ""
