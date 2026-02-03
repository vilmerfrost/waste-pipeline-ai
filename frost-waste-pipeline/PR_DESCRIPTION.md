# Pull Request: Multi-Model AI Document Processing Pipeline

## 🚀 Title
Multi-Model AI Document Processing Pipeline

## 📋 PR URL
Create at: https://github.com/vilmerfrost/waste-pipeline-ai/pull/new/feature/multi-model-ai-pipeline

---

## 📝 Description

This PR upgrades the document extraction system from a single-model approach to a sophisticated multi-model architecture with intelligent routing, verification, and reconciliation.

---

## 📊 Overview

### New Architecture

| Component | Model | Provider |
|-----------|-------|----------|
| **Quality Assessment** | Gemini 3 Flash | OpenRouter |
| **PDF Extraction** | Mistral OCR | Mistral Direct |
| **Excel Extraction** | Gemini 3 Flash | OpenRouter |
| **Verification** | Claude Haiku 4.5 | Anthropic Direct |
| **Reconciliation** | Claude Sonnet 4.5 | Anthropic Direct |
| **Document Assistant** | Claude Haiku 4.5 | Anthropic Direct |

### Processing Flow

```
Document Upload → Quality Assessment → Primary Extraction → Reconciliation (if needed) → Verification (always) → Status
```

**Detailed Flow:**
1. **Quality Assessment** (Gemini) - Analyzes document complexity and routes to appropriate extractor
2. **Primary Extraction** (Mistral for PDF / Gemini for Excel) - Extracts data
3. **Reconciliation** (Sonnet) - Reviews and fixes data if confidence < 80%
4. **Verification** (Haiku) - ALWAYS ON - Validates data and detects hallucinations
5. **Status Determination** - Sets document status: approved / needs_review / error

---

## ✨ Key Features

- ✅ **Intelligent Routing** - Documents routed to best model based on type and complexity
- ✅ **Always-On Verification** - Every document verified for hallucinations
- ✅ **Automatic Reconciliation** - Low-confidence extractions automatically reviewed
- ✅ **Multi-Language Support** - Swedish, Norwegian, Danish, Finnish, English
- ✅ **Backward Compatible** - Legacy pipeline available via feature flag
- ✅ **Cost Efficient** - ~$21 per 1000 documents (mixed PDF/Excel)

---

## 📦 Changes

### New Files (10)

- `lib/ai-clients.ts` - Centralized AI model clients
- `lib/document-router.ts` - Quality assessment and routing
- `lib/extraction-mistral.ts` - Mistral OCR for PDFs
- `lib/extraction-gemini.ts` - Gemini for Excel with agentic reasoning
- `lib/reconciliation-sonnet.ts` - Claude Sonnet reconciliation
- `lib/verification-haiku.ts` - Claude Haiku verification
- `lib/document-assistant.ts` - Document Q&A assistant
- `lib/document-processor.ts` - Main orchestrator
- `app/api/assistant/route.ts` - Assistant API endpoint
- `MIGRATION_GUIDE.md` - Complete setup guide

### Modified Files (3)

- `app/api/process/route.ts` - Integrated multi-model processor
- `package.json` - Updated dependencies
- `.env.example` - Added new API key template

### Dependencies

**Added:**
- `openai` (for OpenRouter compatibility)
- `@mistralai/mistralai` (Mistral OCR)

**Removed:**
- `@google/generative-ai` (replaced with OpenRouter)

---

## 🔧 Setup Required (CRITICAL - DO THIS FIRST)

### 1. Environment Variables

Add to `.env.local`:

```env
# New (required)
OPENROUTER_API_KEY=sk-or-your_key_here

# Remove these (no longer needed)
# GOOGLE_API_KEY=...
# OPENAI_API_KEY=... (not needed for GPT anymore)

# Keep these (unchanged)
ANTHROPIC_API_KEY=sk-ant-...
MISTRAL_API_KEY=...
```

**Get API keys:**
- OpenRouter: https://openrouter.ai/keys (for Gemini 3 Flash)
- Mistral: https://console.mistral.ai/api-keys/
- Anthropic: https://console.anthropic.com/

### 2. Database Migration (CRITICAL)

Run this in your Supabase SQL Editor:

```sql
-- Add verification settings
INSERT INTO settings (
  user_id, 
  auto_approve_threshold,
  enterprise_auto_approve,
  material_synonyms,
  enable_verification, 
  verification_confidence_threshold
)
VALUES (
  'default',
  80,
  false,
  '{
    "Trä": ["Brädor", "Virke", "Lastpall", "Spont"],
    "Gips": ["Gipsskivor", "Rivningsgips", "Gipsspill"],
    "Betong": ["Armerad betong", "Betongkross"],
    "Brännbart": ["Restavfall", "Blandat brännbart"]
  }'::jsonb,
  true,
  0.85
)
ON CONFLICT (user_id) DO UPDATE SET
  enable_verification = EXCLUDED.enable_verification,
  verification_confidence_threshold = EXCLUDED.verification_confidence_threshold;
```

**Why this is needed**: The settings API currently returns 500 errors because this row doesn't exist. This blocks Azure sync and other features.

### 3. Next.js Config (Optional but Recommended)

For drag & drop uploads with large files, update `next.config.js`:

```javascript
/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    serverActions: {
      bodySizeLimit: '10mb', // Allow up to 10MB files in drag & drop
    },
  },
}

module.exports = nextConfig
```

**Why this is needed**: Current 1MB limit causes "Body exceeded 1 MB limit" errors on file uploads.

### 4. Install Dependencies

```bash
cd frost-waste-pipeline
npm install
```

---

## 🧪 Testing Checklist

### Before Approving

- [ ] All API keys added to `.env.local`
- [ ] Database migration SQL executed in Supabase
- [ ] `npm install` completed successfully
- [ ] `npm run build` succeeds without TypeScript errors
- [ ] `npm run dev` starts without crashes

### After Setup

- [ ] Upload a test **PDF** document
  - Check terminal shows: `mistral-ocr → haiku-verification`
  - Verify data extracted correctly
- [ ] Upload a test **Excel** document
  - Check terminal shows: `gemini-agentic → haiku-verification`
  - Verify all rows extracted
- [ ] Test Azure sync (if configured)
  - Should no longer show "Could not fetch settings" error
- [ ] Check document detail page shows processing log
- [ ] Verify document status is correct (approved/needs_review)

### Expected Terminal Output

When processing a document, you should see:

```
🚀 Using MULTI-MODEL pipeline for: filename.pdf
📊 Step 1: Quality Assessment...
✅ Assessment complete
   Quality: 85%
   Complexity: MEDIUM
   Language: Swedish
   Routed to: mistral-ocr
⚡ Step 2: Primary Extraction...
✅ Extraction complete: 15 items, 87% confidence
✅ Step 3: Confidence OK (87%), skipping reconciliation
🔍 Step 4: Haiku Verification (ALWAYS ON)...
✅ Verification complete
📊 Confidence: 90%
❌ Errors: 0, ⚠️ Warnings: 0
✅ PASSED
✅ Status: APPROVED
```

---

## 💰 Cost Impact

Estimated per 1000 documents (mixed PDF/Excel, 50/50 split):

| Component | Cost |
|-----------|------|
| Mistral OCR (500 PDFs) | ~$15 |
| Gemini 3 Flash (500 Excel) | ~$2 |
| Claude Haiku (1000 verifications) | ~$1 |
| Claude Sonnet (200 reconciliations) | ~$3 |
| **Total** | **~$21** |

**Previous cost**: ~$25 per 1000 (Claude only)
**Savings**: ~$4 per 1000 + improved quality

---

## ⚡ Performance

- Quality assessment: +1-2s per document
- Verification (always on): +2-3s per document  
- Reconciliation (when triggered): +3-5s per document
- **Total overhead**: 5-10s per document

Acceptable for background processing queue.

---

## 🔄 Backward Compatibility

- ✅ No breaking changes to existing data
- ✅ All existing documents work unchanged
- ✅ Legacy pipeline available: `GET /api/process?multiModel=false`
- ✅ Database schema fully compatible

---

## 🐛 Known Issues & Solutions

### Settings API returns 500

**Symptom**: Can't load settings page, Azure sync fails
**Cause**: Missing default settings in database
**Fix**: Run database migration SQL (step 2 above)

### "Body exceeded 1 MB limit"

**Symptom**: Drag & drop uploads fail
**Cause**: Next.js Server Action body size limit
**Fix**: Update next.config.js (step 3 above)

### "Missing API key" errors

**Symptom**: Extraction fails immediately
**Cause**: Missing OPENROUTER_API_KEY
**Fix**: Add to .env.local (step 1 above)

---

## 📚 Documentation

- **Complete guide**: `MIGRATION_GUIDE.md`
- **API keys template**: `.env.example`
- **Code documentation**: Inline comments in all new files

---

## 🚦 Deployment Notes

### Before Deploying to Production

1. ✅ Test thoroughly in development
2. ✅ Verify all API keys have sufficient credits
3. ✅ Run database migration in production Supabase
4. ✅ Update production environment variables
5. ✅ Monitor first 20-30 documents closely

### Monitoring

After deployment, watch for:
- Processing times (should be 10-20s per document)
- Error rates (should be <5%)
- API costs (check OpenRouter/Mistral/Anthropic dashboards)
- Verification failure rate (should be <10%)

---

## 🎯 Success Metrics

After 100 documents processed:

- **Extraction accuracy**: Should be >95%
- **Auto-approval rate**: Should be >80%
- **Verification pass rate**: Should be >90%
- **Processing time**: Should be <30s per document
- **Cost per document**: Should be ~$0.02

---

## 🙋 Questions?

See `MIGRATION_GUIDE.md` or contact the team.
