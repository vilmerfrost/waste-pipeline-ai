# 🔍 Azure Connection Test

This script tests your Azure Blob Storage connection before integrating the auto-fetch functionality.

## 📋 Prerequisites

1. **Python 3.7+** installed
2. **Azure Storage Account** with connection string
3. **Required Python packages**:
   ```bash
   pip install azure-storage-blob python-dotenv
   ```

## 🚀 Quick Start

### Step 1: Add Connection String to `.env`

Add your Azure connection string to the `.env` file in the project root:

```bash
AZURE_STORAGE_CONNECTION_STRING="DefaultEndpointsProtocol=https;AccountName=YOUR_ACCOUNT_NAME;AccountKey=YOUR_ACCOUNT_KEY;EndpointSuffix=core.windows.net"
```

**Where to find your connection string:**
1. Go to Azure Portal → Storage Accounts
2. Select your storage account
3. Go to "Access keys" in the left menu
4. Copy the "Connection string" from key1 or key2

### Step 2: Run the Test

```bash
cd frost-waste-pipeline
python test_azure_connection.py
```

## ✅ What the Test Checks

1. **Connection**: Can connect to Azure Blob Storage
2. **Containers**: Lists all available containers
3. **Files**: Shows files in each container (first 10)
4. **File Types**: Counts Excel (.xlsx, .xls) and PDF files
5. **Download**: Tests downloading a file
6. **Upload**: Tests uploading and deleting a test file
7. **Filtering**: Tests filtering files by type

## 📊 Expected Output

```
🚀 FROST WASTE PIPELINE - AZURE CONNECTION TEST

🔍 TESTING AZURE BLOB STORAGE CONNECTION
============================================================
✅ Connection established!

📦 AVAILABLE CONTAINERS:
------------------------------------------------------------
  📁 arrivalwastedata
     Files (showing first 10 of 25):
       - file1.xlsx [EXCEL] (2.45 MB)
       - file2.pdf [PDF] (1.23 MB)
       ...

============================================================
✅ AZURE CONNECTION TEST PASSED!

📊 SUMMARY:
   Containers found: 3
   Total files found: 45
   Excel files (.xlsx, .xls): 30
   PDF files: 15

🧪 TESTING SPECIFIC OPERATIONS
============================================================

1️⃣ Testing file download...
   ✅ Successfully downloaded file1.xlsx (2568192 bytes)

2️⃣ Testing file upload...
   ✅ Successfully uploaded test file
   ✅ Successfully deleted test file

3️⃣ Testing file filtering...
   ✅ Found 30 Excel files
   ✅ Found 15 PDF files

============================================================
✅ OPERATION TESTS COMPLETE!

🎉 ALL TESTS PASSED! Ready to integrate!
```

## ❌ Troubleshooting

### Error: `AZURE_STORAGE_CONNECTION_STRING not found`
- Make sure `.env` file exists in the project root
- Check that the variable name is exactly `AZURE_STORAGE_CONNECTION_STRING`
- Restart your terminal after adding to `.env`

### Error: `Connection failed` or `Authentication failed`
- Verify your connection string is correct
- Check that your Azure Storage Account is active
- Ensure you have proper permissions (Storage Blob Data Contributor)

### Error: `No module named 'azure.storage.blob'`
```bash
pip install azure-storage-blob python-dotenv
```

### Error: `No containers found`
- This is OK if you're starting fresh
- The system will create containers as needed
- Check Azure Portal to verify containers exist

## 🎯 Next Steps

Once the test passes:

1. ✅ **Verify containers**: Make sure you see the expected containers
   - `arrivalwastedata` (or your main container)
   - `unable-to-process` (for failed files)
   - `unsupported-file-format` (for unsupported files)
   - `completed` (for processed files)

2. ✅ **Check file counts**: Note how many Excel/PDF files you have
   - This helps estimate processing time
   - Large batches (>100 files) may need optimization

3. ✅ **Test auto-fetch**: Once verified, the auto-fetch will use the same connection
   ```bash
   # Test manual sync
   curl -X POST http://localhost:3000/api/auto-fetch/manual
   ```

## 📝 Notes

- The test creates a temporary file `test_upload_delete_me.txt` and deletes it
- This is safe and won't affect your data
- The test only reads metadata, doesn't download full files unless testing download
- All operations use the same connection string as the main application

