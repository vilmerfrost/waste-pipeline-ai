# 🚀 Azure Rescue Failed Files Script

This script fetches failed files from Azure containers (`unable-to-process` and `unsupported-file-format`) and processes them with the adaptive extraction system.

## 🎯 Two Modes

### 1. **API Mode (Recommended)** ✅
Uses the existing `/api/auto-fetch/manual` endpoint. This is simpler and handles everything server-side.

```bash
python azure_rescue_failed_files.py --api-mode
```

**Advantages:**
- No local file storage needed
- Uses existing, tested endpoint
- Handles all processing server-side
- Returns document IDs for tracking

### 2. **Direct Mode**
Downloads files locally and uploads them via file upload API.

```bash
python azure_rescue_failed_files.py --limit 10
```

**Use when:**
- You need to inspect files before uploading
- You want to process files in batches
- API mode is not available

## 📋 Prerequisites

1. **Python 3.7+** installed
2. **Required packages**:
   ```bash
   pip install azure-storage-blob python-dotenv requests
   ```
   Or install from requirements.txt:
   ```bash
   pip install -r requirements.txt
   ```

3. **Environment variables** in `.env`:
   ```bash
   AZURE_STORAGE_CONNECTION_STRING="your_connection_string"
   API_BASE_URL="http://localhost:3000"  # Optional, defaults to localhost:3000
   ```

4. **Next.js server running** (for API mode):
   ```bash
   npm run dev
   ```

## 🚀 Usage

### List Available Files
```bash
python azure_rescue_failed_files.py --list
```

### Fetch via API (Recommended)
```bash
# Fetch all failed files
python azure_rescue_failed_files.py --api-mode

# With custom API URL
python azure_rescue_failed_files.py --api-mode --api-url "https://your-domain.com"
```

### Direct Mode
```bash
# Fetch first 10 files
python azure_rescue_failed_files.py --limit 10

# Fetch all files
python azure_rescue_failed_files.py

# Dry run (see what would be fetched)
python azure_rescue_failed_files.py --dry-run --limit 5
```

## 📊 Output Examples

### API Mode Output:
```
🚀 AZURE AUTO-FETCH - RESCUE MISSION (API MODE)
======================================================================
📡 Calling API: http://localhost:3000/api/auto-fetch/manual

✅ API Response:
   Total files found: 15
   Files processed: 15
   Errors: 0

📄 Processed files:
   ✅ file1.xlsx - queued
      Document ID: abc123...
   ✅ file2.pdf - queued
      Document ID: def456...

🎉 Files fetched successfully via API!
```

### Direct Mode Output:
```
🚀 AZURE AUTO-FETCH - RESCUE MISSION (DIRECT MODE)
======================================================================

📦 Checking container: unable-to-process
----------------------------------------------------------------------
   Found 15 valid files (Excel/PDF)
   ⬇️  Downloaded: file1.xlsx (2457600 bytes)
   ✅ Uploaded and queued for processing
   ⬇️  Downloaded: file2.pdf (1234567 bytes)
   ✅ Uploaded and queued for processing
   ...

📊 RESCUE MISSION SUMMARY:
   Total files found: 15
   Files downloaded: 15
   Files uploaded: 15
======================================================================

🎉 Files fetched successfully!
```

## 🔍 What Happens After Fetching?

1. **Files are uploaded** to Supabase Storage (`raw_documents` bucket)
2. **Document records** are created in the database with status `uploaded`
3. **Processing jobs** are queued for AI extraction
4. **Files are processed** automatically by the `/api/process` endpoint
5. **Results appear** in the Collecct dashboard

## 🎯 Workflow

```
Azure Failed Containers
    ↓
[Rescue Script]
    ↓
Download Files
    ↓
Upload to Supabase
    ↓
Create Document Records
    ↓
Queue Processing Jobs
    ↓
AI Extraction (Adaptive)
    ↓
Review in Dashboard
    ↓
Approve & Export
```

## ❌ Troubleshooting

### Error: `AZURE_STORAGE_CONNECTION_STRING not found`
- Check `.env` file exists and has the connection string
- Restart terminal after adding to `.env`

### Error: `Cannot connect to API`
- Make sure Next.js server is running: `npm run dev`
- Check `API_BASE_URL` in `.env` matches your server URL
- For production, use: `--api-url "https://your-domain.com"`

### Error: `No failed files found`
- This is OK! It means there are no files in the failed containers
- Check Azure Portal to verify containers exist
- Run `--list` to see what's available

### Files uploaded but not processing
- Check Supabase `documents` table - files should have status `uploaded`
- Check `processing_jobs` table - jobs should be `queued`
- Trigger processing manually: `GET /api/process`

## 💡 Tips

1. **Start with `--list`** to see what's available
2. **Use `--dry-run`** first to preview what will happen
3. **Use `--limit 10`** for testing before processing all files
4. **API mode is faster** - no local file storage needed
5. **Check logs** in Next.js console for processing status

## 🔗 Related Files

- `/api/auto-fetch/manual/route.ts` - API endpoint used by API mode
- `/lib/azure-blob-connector.ts` - Azure connection logic
- `test_azure_connection.py` - Test Azure connection first

## 📝 Notes

- Files are fetched from both `unable-to-process` and `unsupported-file-format` containers
- Only Excel (.xlsx, .xls) and PDF files are processed
- Files are sanitized before upload (special characters removed)
- Processing happens asynchronously - check dashboard for status

