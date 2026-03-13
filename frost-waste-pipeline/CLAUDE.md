# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev       # Start dev server (http://localhost:3000)
npm run build     # Production build
npm run lint      # Run ESLint
npm run test      # Run all tests (Vitest)
npx vitest run lib/stats-utils.test.ts  # Run a single test file
```

Docker:
```bash
docker-compose build && docker-compose up -d
curl http://localhost:3000/api/health  # Verify health
```

## Architecture

This is a **Next.js 16 App Router** application that serves as a fallback AI processor for Collecct AB's waste management pipeline. Documents that fail Simplitics' primary processing land in Azure Blob Storage, get picked up by this system, processed with AI, and returned to the Azure output folder for Simplitics to pick up.

### System Flow

```
Azure "unsupported-file-format" → Auto-fetch (every 5 min via /api/cron/auto-fetch)
→ Quality Assessment (Gemini Flash) → Route to correct model:
  - PDF → Mistral OCR
  - Excel → Gemini via OpenRouter
→ Extract line items with per-field confidence scores (0–1)
→ Verify (Claude Haiku 4.5)
→ Reconcile if confidence < 0.80 (Claude Sonnet)
→ confidence ≥ 95%: auto-approve → export Excel → Azure "completed"
→ 80–95%: human review queue
→ < 80%: error state
```

### Directory Structure

- **`app/api/`** — 20+ Next.js API routes (processing, Azure, cron, documents, health)
- **`app/collecct/`** — Main dashboard page
- **`app/review/[id]/`** — Per-document human review page
- **`lib/`** — Core business logic:
  - `adaptive-extraction.ts` — Main extraction orchestrator (largest file, 53KB)
  - `document-processor.ts` — Multi-model routing & processing
  - `extraction-mistral.ts` — Mistral OCR for PDFs
  - `extraction-gemini.ts` — Gemini via OpenRouter for Excel
  - `verification-haiku.ts` — Post-extraction verification
  - `reconciliation-sonnet.ts` — Low-confidence reconciliation
  - `schemas.ts` — Zod schemas with Swedish number/date parsing
  - `types/extraction.ts` — Core TypeScript interfaces
  - `ai-clients.ts` — Multi-model AI client factory
  - `azure-blob-connector.ts` — Azure Blob Storage operations
  - `excel-creator.ts` — Simplitics-compatible Excel output
  - `supabase.ts` — Supabase client (service role + SSR browser clients)
- **`components/`** — 45+ React components
- **`supabase/`** — SQL migrations

### Key Data Pattern: ConfidenceValue

Every extracted field is wrapped in a `ConfidenceValue<T>`:
```typescript
interface ConfidenceValue<T> {
  value: T;
  confidence: number; // 0–1
}
// e.g. material: { value: "Trä", confidence: 0.95 }
```

### Database (Supabase)

Key tables:
- **`documents`** — id, filename, azure_url, status (`uploaded|processing|needs_review|approved|error|exported`), extracted_data (JSONB)
- **`settings`** — auto_approve_threshold (default 80), material_synonyms (JSONB), azure folder config

### AI Models Used

| Model | Purpose |
|-------|---------|
| Gemini Flash (via OpenRouter) | Quality assessment, Excel extraction |
| Mistral OCR | PDF extraction |
| Claude Haiku 4.5 | Post-extraction verification |
| Claude Sonnet | Low-confidence reconciliation |

### Environment Variables Required

```
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY
ANTHROPIC_API_KEY
MISTRAL_API_KEY
OPENROUTER_API_KEY
AZURE_STORAGE_CONNECTION_STRING
AZURE_STORAGE_ACCOUNT_NAME
AZURE_STORAGE_ACCOUNT_KEY
AZURE_BLOB_CONTAINER_INPUT=unable-to-process
AZURE_BLOB_CONTAINER_OUTPUT=completed
AZURE_FAILED_FOLDER_2=unsupported-file-format
AZURE_INCOMING_FOLDER=incoming
NEXT_PUBLIC_APP_URL
```

### Swedish/Nordic Data Support

`lib/schemas.ts` includes custom Zod parsers for:
- Swedish decimal format (comma as separator: `1.234,56`)
- Swedish/Finnish/Norwegian date formats
- Material name synonym matching via `settings.material_synonyms`

### Build Notes

- `next.config.js` sets `output: 'standalone'` for Docker and ignores TS/ESLint errors during build
- Tests are in `lib/*.test.ts` (Vitest) — only 3 test files exist currently
