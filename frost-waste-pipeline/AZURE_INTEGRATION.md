# Azure Integration - Collecct Workflow

This document describes the Azure Blob Storage integration for the Collecct workflow system.

## Overview

The system integrates with Azure Blob Storage to:
1. **Automatically fetch files** from **configurable input folders** (every 5 minutes)
2. **Process them** through the AI extraction pipeline
3. **Create Excel files** in the correct format
4. **Upload to configurable output folder** for Simplitics processing
5. **Monitor responses** and retry if rejected

### Folder Configuration

Input and output folders are **configurable in the web interface** (Settings → Azure & GUIDs):
- Supports nested folder structures (e.g., `container/output/unable_to_process`)
- Manual path entry for folders not visible in the browser
- Multiple input folders can be configured
- Set `AZURE_CONTAINER_NAME` environment variable to limit browsing to one container

## Auto-Fetcher

The system includes an **automatic background fetcher** that:
- ✅ Runs every 5 minutes (via Vercel Cron or external cron)
- ✅ Checks both failed folders automatically
- ✅ Downloads and processes files automatically
- ✅ Queues for AI extraction automatically
- ✅ Files appear in dashboard automatically

**No manual sync needed!** See [AUTO_FETCHER_NEXTJS.md](./AUTO_FETCHER_NEXTJS.md) for details.

## Setup

### 1. Install Dependencies

```bash
npm install @azure/storage-blob
```

### 2. Configure Environment Variables

Add to your `.env.local`:

```env
# Required: Azure Storage connection string
AZURE_STORAGE_CONNECTION_STRING="DefaultEndpointsProtocol=https;AccountName=...;AccountKey=...;EndpointSuffix=core.windows.net"

# Required: Limit folder browsing to a specific container (recommended for performance)
AZURE_CONTAINER_NAME="arrivalwastedata"
```

### 3. Configure Input/Output Folders

Go to **Settings → Azure & GUIDs** in the web interface to configure:

1. **Input folders** - Where to fetch files for processing
   - Example: `arrivalwastedata/output/unable_to_process`
   - You can add multiple folders
   - Format: `container/folder/subfolder`

2. **Output folder** - Where processed Excel files are saved
   - Example: `arrivalwastedata/incoming`

You can either:
- Browse and select folders from the dropdown
- Enter the full path manually (supports nested folders)

### 4. Get Azure Credentials

Contact Martin at Collecct to get:
- Azure Storage Account connection string
- Container name (default: `arrivalwastedata`)

## API Endpoints

### List Failed Files
```
GET /api/azure/list-failed
```
Returns list of files in failed folders that need processing.

### Approve Document
```
POST /api/azure/approve
Body: {
  documentId: string,
  approvedData: object,
  summary?: object
}
```
Creates Excel file and uploads to Azure `incoming/` folder.

### Monitor File Status
```
POST /api/azure/monitor
Body: {
  filename: string
}
```
Checks if file has been processed by Simplitics:
- `accepted` - File found in `processed/` folder
- `rejected` - File found in failed folders
- `processing` - Still being processed

### Workflow Sync
```
POST /api/workflow/sync
```
Fetches all failed files from Azure and queues them for processing.

### Auto-Fetch Cron (Automatic)
```
GET /api/cron/auto-fetch
```
Runs automatically every 5 minutes (via Vercel Cron). Requires `Authorization: Bearer {CRON_SECRET}` header.

### Manual Auto-Fetch
```
POST /api/auto-fetch/manual
```
Manually triggers the auto-fetcher. Also available via button in `/collecct` dashboard.

## Workflow

### Complete Flow

```
1. Failed files in Azure → failed-to-process/ OR unsupported-file-formats/
   ↓
2. AUTO-FETCHER (runs every 5 min) OR Manual sync → Fetches files
   ↓
3. Files uploaded to Supabase → Status: "uploaded"
   ↓
4. AI Processing → Status: "needs_review"
   ↓
5. Human reviews on /collecct dashboard
   ↓
6. Approve → POST /api/azure/approve
   - Creates Excel (preserves filename!)
   - Uploads to incoming/
   ↓
7. Monitor → POST /api/azure/monitor
   - If in processed/ → SUCCESS! ✅
   - If in failed/ → LOOP BACK (max 3x)
   - If timeout → Manual escalation
   ↓
8. Success → Delete from failed folders
```

**Note:** The auto-fetcher runs automatically, so step 2 happens without manual intervention!

## Excel Format

The Excel files created match the Python `excel_creator.py` format:

**Columns:**
- Vikt (kg)
- Adress
- Datum
- Mottagare
- Avfallstyp

**Sheets:**
1. **Summary** - Processing summary with changes and flags
2. **Data** - Extracted data rows

## Components

### TypeScript Implementations

- `lib/azure-blob-connector.ts` - Azure Blob Storage operations
- `lib/excel-creator.ts` - Excel file creation
- `lib/summary-generator.ts` - Processing summaries

### API Routes

- `app/api/azure/list-failed/route.ts` - List failed files
- `app/api/azure/approve/route.ts` - Approve and upload
- `app/api/azure/monitor/route.ts` - Monitor processing status
- `app/api/workflow/sync/route.ts` - Sync workflow

### UI Components

- `app/collecct/page.tsx` - Review dashboard
- `components/collecct-dashboard.tsx` - Dashboard component

## Usage

### Manual Sync

```bash
curl -X POST http://localhost:3000/api/workflow/sync
```

### Approve Document

```typescript
const response = await fetch('/api/azure/approve', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    documentId: 'doc-id',
    approvedData: extractedData
  })
});
```

### Monitor File

```typescript
const response = await fetch('/api/azure/monitor', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    filename: 'invoice.xlsx'
  })
});
```

## Testing

1. **Test Azure Connection:**
   ```bash
   curl http://localhost:3000/api/azure/list-failed
   ```

2. **Test Workflow Sync:**
   ```bash
   curl -X POST http://localhost:3000/api/workflow/sync
   ```

3. **View Dashboard:**
   Navigate to `http://localhost:3000/collecct`

## Notes

- Files preserve their original filename when uploaded to `incoming/`
- Excel format matches Python implementation exactly
- Monitoring checks every 10 seconds (configurable)
- Max retries: 3 attempts before manual escalation
- All operations are logged for debugging

