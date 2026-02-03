# Multi-Model AI Pipeline Migration Guide

This document guides you through setting up the new multi-model document processing system.

## Overview

The system has been upgraded from a single-model approach to a sophisticated multi-model pipeline:

- **PDFs**: Mistral OCR (direct)
- **Excel files**: Gemini 3 Flash via OpenRouter (with agentic reasoning)
- **Verification**: Claude Haiku 4.5 (always on)
- **Reconciliation**: Claude Sonnet 4.5 (when confidence < 80%)
- **Document Assistant**: Claude Haiku 4.5 (was GPT-4o)

## Required Setup

### 1. Environment Variables

Add these new API keys to your `.env.local`:

```env
# Remove these (no longer needed):
# GOOGLE_API_KEY=...
# OPENAI_API_KEY=...

# Add this (required):
OPENROUTER_API_KEY=sk-or-your_openrouter_api_key_here

# Keep these (unchanged):
ANTHROPIC_API_KEY=sk-ant-...
MISTRAL_API_KEY=...
```

**Where to get API keys:**
- OpenRouter: https://openrouter.ai/keys (for Gemini 3 Flash)
- Mistral: https://console.mistral.ai/api-keys/
- Anthropic: https://console.anthropic.com/

### 2. Database Migration

Run this SQL in your Supabase SQL Editor to add verification settings:

```sql
-- Add verification settings if not exists
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

### 3. Next.js Configuration

If you plan to use drag & drop uploads with large files, update your `next.config.js`:

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

### 4. Install Dependencies

Dependencies have been updated automatically. Verify with:

```bash
npm install
```

**Changes:**
- ✅ Added: `openai` (for OpenRouter compatibility)
- ✅ Added: `@mistralai/mistralai`
- ❌ Removed: `@google/generative-ai`

## How to Test

### 1. Verify Installation

```bash
npm run build
```

Should complete without errors.

### 2. Start Development Server

```bash
npm run dev
```

### 3. Test Document Processing

#### Via Drag & Drop (Homepage `/`):
1. Drop a PDF or Excel file
2. Watch terminal for multi-model pipeline logs:
   ```
   🚀 Using MULTI-MODEL pipeline for: filename.pdf
   📊 Step 1: Quality Assessment...
   ⚡ Step 2: Primary Extraction...
   🔍 Step 4: Haiku Verification (ALWAYS ON)...
   ```

#### Via Azure Sync (`/collecct`):
1. Click "Synka från Azure"
2. Process files with "Batch Process" or "Granska"
3. Check processing logs in document details

### 4. Verify Model Routing

Check the `model` field in processed documents:

- **PDF files** should show: `mistral-ocr → haiku-verification`
- **Excel files** should show: `gemini-agentic → haiku-verification`
- **Low confidence** adds: `→ sonnet-reconciliation`

## Multi-Model Pipeline Flow

```
┌─────────────────────────────────────────────────────────┐
│  Document Upload (PDF or Excel)                          │
└─────────────────┬───────────────────────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────────────────────────┐
│  Step 1: Quality Assessment (Gemini 3 Flash)            │
│  - Assess complexity, quality, language                  │
│  - Route to appropriate extractor                        │
└─────────────────┬───────────────────────────────────────┘
                  │
         ┌────────┴────────┐
         ▼                 ▼
┌──────────────┐  ┌──────────────────┐
│ PDF          │  │ Excel            │
│ Mistral OCR  │  │ Gemini Agentic   │
└──────┬───────┘  └────────┬─────────┘
       │                   │
       └─────────┬─────────┘
                 ▼
┌─────────────────────────────────────────────────────────┐
│  Step 3: Reconciliation (if confidence < 80%)           │
│  Claude Sonnet 4.5 reviews and fixes data               │
└─────────────────┬───────────────────────────────────────┘
                  ▼
┌─────────────────────────────────────────────────────────┐
│  Step 4: Verification (ALWAYS ON)                       │
│  Claude Haiku 4.5 validates and detects hallucinations  │
└─────────────────┬───────────────────────────────────────┘
                  ▼
┌─────────────────────────────────────────────────────────┐
│  Final Status: approved / needs_review / error          │
└─────────────────────────────────────────────────────────┘
```

## Feature Flags

The multi-model pipeline is **enabled by default**. To use the legacy pipeline:

```
GET /api/process?id=<docId>&multiModel=false
```

## Troubleshooting

### "Missing API key" errors

**Solution**: Verify all API keys are set in `.env.local`:
```bash
grep "API_KEY" .env.local
```

### Settings API returns 500

**Cause**: Missing default settings in database

**Solution**: Run the database migration SQL above

### "Body exceeded 1 MB limit"

**Cause**: Large file upload without increased body size limit

**Solution**: Update `next.config.js` as shown in step 3

### OpenRouter rate limits

OpenRouter has different rate limits per model. If you hit limits:
- Check your OpenRouter dashboard
- Consider upgrading your plan
- Or switch back to direct Google API (requires code changes)

## API Key Costs

Estimated costs per 1000 documents:

- **Mistral OCR**: ~$15 (PDFs)
- **Gemini 3 Flash** (via OpenRouter): ~$2 (Excel)
- **Claude Haiku** (verification): ~$1
- **Claude Sonnet** (reconciliation, ~20% of docs): ~$3

**Total**: ~$21 per 1000 documents (mixed PDF/Excel)

## Rollback

If you need to rollback to the old system:

1. Checkout previous commit:
   ```bash
   git checkout HEAD~1
   ```

2. Reinstall old dependencies:
   ```bash
   npm install
   ```

3. Restore `.env.local` with Google/OpenAI keys

## Support

For issues or questions:
1. Check terminal logs for detailed error messages
2. Review processing logs in document details page
3. Check Supabase logs for API errors
4. Verify all API keys are valid and have sufficient credits
