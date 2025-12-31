# 🚀 Azure Export Guide

Complete workflow for exporting approved documents to Azure Blob Storage.

## ✅ What's Implemented

### 1. **API Route** (`/api/export-to-azure`)
- Fetches approved documents from Supabase
- Converts to Excel format using `ExcelCreator`
- Uploads to Azure "completed" container
- Returns stats and Azure URL

### 2. **UI Button Component** (`ExportToAzureButton`)
- Green "Exportera till Azure" button
- Loading spinner during export
- Success modal with stats
- Link to view file in Azure

### 3. **Integration**
- Added to Collecct dashboard header
- Only shows when there are approved documents
- Exports all approved documents by default

## 🎯 Usage

### From UI:
1. Go to `/collecct` dashboard
2. Approve documents (they get status "approved")
3. Click "Exportera till Azure" button in header
4. Wait for export to complete
5. View success modal with stats and Azure URL

### From API:
```bash
# Export all approved documents
curl -X POST http://localhost:3000/api/export-to-azure \
  -H "Content-Type: application/json" \
  -d '{}'

# Export specific documents
curl -X POST http://localhost:3000/api/export-to-azure \
  -H "Content-Type: application/json" \
  -d '{"documentIds": ["doc-id-1", "doc-id-2"]}'
```

## 📊 Response Format

```json
{
  "success": true,
  "message": "Exported 5 documents to Azure",
  "azureUrl": "https://...blob.core.windows.net/completed/collecct-export-2024-12-28T23-30-00.xlsx",
  "stats": {
    "documents": 5,
    "rows": 45,
    "totalWeightKg": 12500,
    "totalWeightTon": "12.50",
    "filename": "collecct-export-2024-12-28T23-30-00.xlsx"
  }
}
```

## 🔄 Complete Workflow

```
1. Files arrive in Azure
   ↓
2. Auto-fetch downloads them
   ↓
3. AI processes with adaptive extraction
   ↓
4. User reviews in dashboard
   ↓
5. User approves documents
   ↓
6. Click "Exportera till Azure"
   ↓
7. Excel file generated
   ↓
8. Uploaded to Azure "completed" container
   ↓
9. Available in Power BI! 🎉
```

## 📁 File Structure

- **API Route**: `app/api/export-to-azure/route.ts`
- **UI Component**: `components/export-to-azure-button.tsx`
- **Excel Creator**: `lib/excel-creator.ts` (already exists)
- **Azure Connector**: `lib/azure-blob-connector.ts` (already exists)

## ⚙️ Configuration

Make sure `.env` has:
```bash
AZURE_STORAGE_CONNECTION_STRING="your_connection_string"
```

The export will:
- Create "completed" container if it doesn't exist
- Generate filename with timestamp: `collecct-export-YYYY-MM-DDTHH-MM-SS.xlsx`
- Upload Excel file with proper content type
- Return Azure blob URL

## 🎨 UI Features

- **Button**: Green, prominent, shows document count
- **Loading State**: Spinner + "Exporterar..." text
- **Success Modal**: 
  - Stats grid (documents, rows, weight, filename)
  - Azure URL with external link button
  - Info message about Power BI
  - Close button

## 🔍 Troubleshooting

### Button not showing
- Make sure you have approved documents (`status = "approved"`)
- Check browser console for errors

### Export fails
- Check Azure connection string in `.env`
- Verify Azure storage account has write permissions
- Check Next.js server logs for errors

### File not in Azure
- Check "completed" container exists
- Verify upload succeeded (check logs)
- Check Azure Portal for file

## 📝 Notes

- Export combines ALL approved documents into ONE Excel file
- Excel format matches Martin's expected structure exactly
- Files are timestamped for easy tracking
- Azure URL is stored in document metadata
- Export is idempotent (safe to run multiple times)

