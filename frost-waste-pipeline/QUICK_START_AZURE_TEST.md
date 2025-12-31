# 🚀 Quick Start: Azure Connection Test

## ✅ Step 1: Install Dependencies (if needed)

```bash
pip install -r requirements.txt
```

Or just the essentials:
```bash
pip install azure-storage-blob python-dotenv
```

## ✅ Step 2: Add Connection String to `.env`

Create or update `.env` file in the project root:

```bash
AZURE_STORAGE_CONNECTION_STRING="DefaultEndpointsProtocol=https;AccountName=YOUR_ACCOUNT_NAME;AccountKey=YOUR_ACCOUNT_KEY;EndpointSuffix=core.windows.net"
```

**Get your connection string from Azure Portal:**
1. Azure Portal → Storage Accounts
2. Select your storage account
3. Settings → Access keys
4. Copy "Connection string" from key1 or key2

## ✅ Step 3: Run the Test

```bash
python test_azure_connection.py
```

## 📊 What You'll See

The test will show:
- ✅ Connection status
- 📦 All containers
- 📄 Files in each container (first 10)
- 📈 Summary: Total files, Excel files, PDF files
- 🧪 Operation tests: Download, Upload, Filtering

## 🎯 Expected Result

```
✅ AZURE CONNECTION TEST PASSED!
📊 SUMMARY:
   Containers found: 3
   Total files found: 45
   Excel files (.xlsx, .xls): 30
   PDF files: 15
🎉 ALL TESTS PASSED! Ready to integrate!
```

## ❌ If It Fails

1. **Check `.env` file exists** and has the connection string
2. **Verify connection string** is correct (no extra quotes/spaces)
3. **Check Azure permissions** - you need Storage Blob Data Contributor role
4. **Test network connectivity** - can you access Azure Portal?

## 🎉 Next Steps After Success

Once the test passes, you're ready to:
1. ✅ Test auto-fetch sync: `POST /api/auto-fetch/manual`
2. ✅ Process files with AI extraction
3. ✅ Review and approve documents
4. ✅ Export to Excel and upload back to Azure

---

**Ready? Run:** `python test_azure_connection.py` 🚀

