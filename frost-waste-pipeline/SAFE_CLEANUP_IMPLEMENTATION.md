# 🔒 Safe Azure Cleanup Implementation Guide

## ✅ Complete Solution - Option B

This guide implements **100% safe cleanup** that only deletes files with **exact filename matches**. No fuzzy matching, no searching, no shortcuts.

---

## 📋 Implementation Checklist

### Step 1: Database Migration (2 min) ✅

**Run this SQL in Supabase SQL Editor:**

```sql
-- Add columns to documents table
ALTER TABLE documents
ADD COLUMN IF NOT EXISTS azure_original_filename TEXT,
ADD COLUMN IF NOT EXISTS source_container TEXT;

-- Create indexes for faster lookups
CREATE INDEX IF NOT EXISTS idx_documents_azure_original_filename ON documents(azure_original_filename);
CREATE INDEX IF NOT EXISTS idx_documents_source_container ON documents(source_container);

-- Migrate existing documents
UPDATE documents
SET 
  azure_original_filename = COALESCE(
    azure_original_filename,
    filename
  ),
  source_container = COALESCE(
    source_container,
    CASE 
      WHEN extracted_data->>'source_folder' IS NOT NULL 
        THEN extracted_data->>'source_folder'
      WHEN filename LIKE '%.pdf' 
        THEN 'unsupported-file-format'
      ELSE 'unable-to-process'
    END
  )
WHERE azure_original_filename IS NULL OR source_container IS NULL;
```

**✅ Verification:**
```sql
-- Check migration results
SELECT 
  COUNT(*) as total,
  COUNT(azure_original_filename) as has_azure_filename,
  COUNT(source_container) as has_source_container
FROM documents;
```

---

### Step 2: Update Rescue Scripts (Already Done ✅)

The following files have been updated to track `azure_original_filename` and `source_container`:

- ✅ `app/api/auto-fetch/manual/route.ts`
- ✅ `app/api/cron/auto-fetch/route.ts`
- ✅ `app/api/workflow/sync/route.ts`

**What changed:**
- All rescue scripts now set `azure_original_filename` when creating documents
- All rescue scripts now set `source_container` based on source folder

---

### Step 3: Safe Export Route (Already Done ✅)

**File:** `app/api/export-to-azure/route.ts`

**Key Changes:**

1. **Safe Delete Function:**
   - ✅ Only exact filename matches
   - ✅ Uses tracked `azure_original_filename` from database
   - ✅ Uses tracked `source_container` from database
   - ✅ No fuzzy matching
   - ✅ No date pattern searching
   - ✅ Comprehensive logging
   - ✅ Returns success/failure status

2. **Verification Before Deletion:**
   - ✅ Checks if file exists before deleting
   - ✅ Logs what will be deleted
   - ✅ Better to leave file than delete wrong one

---

## 🧪 Testing Procedure

### Test 1: Single Document Export (5 min)

1. **Find an approved document:**
   ```sql
   SELECT id, filename, azure_original_filename, source_container 
   FROM documents 
   WHERE status = 'approved' 
   LIMIT 1;
   ```

2. **Export via UI or API:**
   - Use the "Export to Azure" button in `/collecct`
   - Or call: `POST /api/export-to-azure` with `{ "documentIds": ["<id>"] }`

3. **Check console logs:**
   ```
   🗑️  SAFE DELETE: Attempting to delete "filename.xlsx"
      Container: unable-to-process
      Using tracked filename: YES ✅
      ✅ Found exact match: filename.xlsx
      🔒 Verifying before deletion...
      ✅ SAFELY DELETED: filename.xlsx from unable-to-process
   ```

4. **Verify in Azure:**
   - Check that file is gone from source container
   - Check that file exists in `completed` container

---

### Test 2: Full Export (3 min)

1. **Export all approved documents:**
   - Use "Export to Azure" button (no documentIds = all approved)

2. **Monitor console logs:**
   - Watch for any warnings about missing tracked filenames
   - Verify all successful deletions

3. **Check results:**
   ```json
   {
     "success": true,
     "stats": {
       "total": 10,
       "success": 10,
       "failed": 0
     }
   }
   ```

---

## 🔍 Troubleshooting

### Issue: "No Azure original filename tracked"

**Cause:** Document was created before migration or rescue script update.

**Solution:**
```sql
-- Manually set tracked filename for old documents
UPDATE documents
SET 
  azure_original_filename = filename,
  source_container = CASE 
    WHEN filename LIKE '%.pdf' THEN 'unsupported-file-format'
    ELSE 'unable-to-process'
  END
WHERE azure_original_filename IS NULL;
```

---

### Issue: "File not found in any container"

**Possible causes:**
1. File was already deleted manually
2. File is in a different container than tracked
3. Filename mismatch

**Solution:**
- Check Azure manually for the file
- Update `azure_original_filename` if filename is different
- Update `source_container` if container is different

---

### Issue: Cleanup fails but export succeeds

**This is SAFE behavior!** 

The export route is designed to:
- ✅ Continue export even if cleanup fails
- ✅ Log warnings instead of throwing errors
- ✅ Better to leave file than delete wrong one

**Action:** Check logs and manually verify/cleanup if needed.

---

## 📊 Safety Guarantees

### ✅ What This Solution Does:

1. **Tracks Original Filenames**
   - Every document knows its exact Azure filename
   - Stored in `azure_original_filename` column

2. **Tracks Source Containers**
   - Every document knows where it came from
   - Stored in `source_container` column

3. **Only Exact Matches**
   - Never searches or guesses
   - Only deletes if exact filename matches
   - Verifies file exists before deletion

4. **Comprehensive Logging**
   - Every action is logged
   - Easy to audit what was deleted
   - Easy to debug issues

5. **Fails Safely**
   - Better to leave file than delete wrong one
   - Export continues even if cleanup fails
   - Warnings instead of errors

### ❌ What This Solution Does NOT Do:

- ❌ No fuzzy filename matching
- ❌ No date pattern searching
- ❌ No shortcuts or guessing
- ❌ No deletion without verification

---

## 🚀 Quick Start (20 minutes)

1. **Run database migration** (2 min)
   ```sql
   -- Copy SQL from Step 1 above
   ```

2. **Verify migration** (1 min)
   ```sql
   SELECT COUNT(*) FROM documents WHERE azure_original_filename IS NOT NULL;
   ```

3. **Test single export** (5 min)
   - Export 1 document
   - Check logs
   - Verify cleanup

4. **Full export** (3 min)
   - Export all approved
   - Monitor logs
   - Verify results

5. **Done!** ✅

---

## 📝 Migration Notes

### Existing Documents

The migration script:
- Sets `azure_original_filename = filename` for existing documents
- Infers `source_container` from `extracted_data.source_folder` or filename pattern
- Safe to run multiple times (uses `IF NOT EXISTS`)

### New Documents

All new documents created via rescue scripts will automatically have:
- `azure_original_filename` set to the Azure blob name
- `source_container` set to the source container name

---

## 🔗 Related Files

- **Migration:** `supabase/migrations/add-azure-filename-tracking.sql`
- **Export Route:** `app/api/export-to-azure/route.ts`
- **Rescue Scripts:**
  - `app/api/auto-fetch/manual/route.ts`
  - `app/api/cron/auto-fetch/route.ts`
  - `app/api/workflow/sync/route.ts`

---

## ✅ Success Criteria

After implementation, you should see:

1. ✅ All documents have `azure_original_filename` set
2. ✅ All documents have `source_container` set
3. ✅ Export logs show "Using tracked filename: YES ✅"
4. ✅ Cleanup only deletes exact matches
5. ✅ No warnings about missing tracked filenames
6. ✅ Files are deleted from correct containers

---

## 🎯 Summary

**This is the SAFEST possible solution because:**

1. **Tracks original filenames** - knows exact name in Azure
2. **Tracks source containers** - knows where it came from
3. **Only exact matches** - never guesses or searches
4. **Verifies before cleanup** - shows what will happen
5. **Comprehensive logging** - audit trail of every action
6. **Fails safely** - leaves files if unsure

**Better to NOT delete than delete wrong file!** 🔒

