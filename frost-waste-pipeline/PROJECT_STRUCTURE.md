# Project Structure

```
frost-waste-pipeline/
│
├── 📁 app/                              # Next.js App Router
│   ├── 📁 api/                          # API Routes
│   │   ├── 📁 auto-fetch/
│   │   │   └── 📁 manual/
│   │   │       └── route.ts            # Manual auto-fetch trigger
│   │   ├── 📁 azure/
│   │   │   ├── 📁 approve/
│   │   │   │   └── route.ts            # Approve document & upload Excel to Azure
│   │   │   ├── 📁 list-failed/
│   │   │   │   └── route.ts            # List failed files from Azure containers
│   │   │   └── 📁 monitor/
│   │   │       └── route.ts            # Monitor Simplitics processing status
│   │   ├── 📁 cron/
│   │   │   └── 📁 auto-fetch/
│   │   │       └── route.ts            # Auto-fetcher cron job (runs every 5 min)
│   │   ├── 📁 process/
│   │   │   └── route.ts                # AI document processing worker (Claude)
│   │   └── 📁 workflow/
│   │       └── 📁 sync/
│   │           └── route.ts            # Workflow sync endpoint
│   │
│   ├── 📁 archive/
│   │   └── page.tsx                    # Archive page (archived documents)
│   │
│   ├── 📁 auth/
│   │   └── 📁 callback/
│   │       └── route.ts                # Supabase auth callback handler
│   │
│   ├── 📁 collecct/
│   │   └── page.tsx                    # Collecct review dashboard
│   │
│   ├── 📁 login/
│   │   ├── actions.ts                  # Login server actions
│   │   └── page.tsx                    # Login page
│   │
│   ├── 📁 review/
│   │   └── 📁 [id]/
│   │       └── page.tsx                # Document review page (dynamic route)
│   │
│   ├── 📁 settings/
│   │   └── page.tsx                    # Settings page (materials, GUIDs, Azure)
│   │
│   ├── actions.ts                      # Server actions (upload, save, delete, etc.)
│   ├── favicon.ico                     # Site favicon
│   ├── globals.css                     # Global CSS styles
│   ├── layout.tsx                      # Root layout component
│   └── page.tsx                        # Main dashboard page
│
├── 📁 components/                      # React Components
│   ├── auto-fetch-button.tsx          # Manual Azure sync button (client)
│   ├── collecct-dashboard.tsx         # Collecct dashboard component (client)
│   ├── dashboard-charts.tsx            # Dashboard charts component
│   ├── download-csv-button.tsx        # CSV download button
│   ├── excel-viewer.tsx                # Excel file viewer component
│   ├── export-actions.tsx             # Export actions (Excel/CSV with GUID)
│   ├── file-actions.tsx                # File action buttons (archive, delete)
│   ├── reverify-button.tsx            # Re-verify document button (client)
│   ├── review-form.tsx                 # Review form component (client)
│   ├── search-bar.tsx                 # Search bar component
│   ├── smart-input.tsx                # Smart input with AI confidence badges
│   ├── stats-cards.tsx                # Statistics cards component
│   └── upload-zone.tsx                 # File upload zone (drag & drop)
│
├── 📁 lib/                             # Library & Utilities
│   ├── azure-blob-connector.ts        # Azure Blob Storage connector (TypeScript)
│   ├── azure-sync.ts                  # Azure sync utilities (legacy)
│   ├── excel-creator.ts                # Excel file creator (matches Python format)
│   ├── sanitize-filename.ts           # Filename sanitization helper
│   ├── schemas.ts                      # Zod schemas for data validation
│   ├── summary-generator.ts           # Processing summary generator
│   └── supabase.ts                     # Supabase client utilities
│
├── 📁 public/                          # Static Assets
│   ├── file.svg
│   ├── globe.svg
│   ├── next.svg
│   ├── vercel.svg
│   └── window.svg
│
├── 📄 Configuration Files
│   ├── .env.local                      # Environment variables (not in git)
│   ├── .gitignore                      # Git ignore rules
│   ├── eslint.config.mjs               # ESLint configuration
│   ├── next.config.ts                  # Next.js configuration
│   ├── next-env.d.ts                   # Next.js type definitions
│   ├── package.json                    # npm dependencies
│   ├── package-lock.json               # Locked dependencies
│   ├── postcss.config.mjs              # PostCSS configuration
│   ├── tsconfig.json                   # TypeScript configuration
│   └── vercel.json                     # Vercel configuration (cron jobs)
│
├── 📄 Documentation
│   ├── AUTO_FETCHER_NEXTJS.md         # Auto-fetcher documentation
│   ├── AZURE_INTEGRATION.md           # Azure integration guide
│   ├── PROJECT_STRUCTURE.md           # This file
│   └── README.md                      # Project README
│
└── 📄 Test Scripts
    ├── test-api.js                    # API test script
    └── test-blob.js                   # Azure blob test script
```

## Key Directories

### `/app` - Next.js App Router
- **`/api`** - API routes for backend functionality
- **`/collecct`** - Collecct review dashboard
- **`/review/[id]`** - Individual document review pages
- **`/settings`** - Settings page for materials and GUIDs

### `/components` - React Components
- Client-side components for UI
- Reusable components like `SmartInput`, `ReviewForm`, etc.

### `/lib` - Library/Utilities
- **`azure-blob-connector.ts`** - Azure Blob Storage operations
- **`excel-creator.ts`** - Excel file generation
- **`schemas.ts`** - Data validation schemas
- **`supabase.ts`** - Supabase client setup

## API Routes

- **`/api/process`** - AI document processing worker
- **`/api/cron/auto-fetch`** - Automatic Azure sync (every 5 min)
- **`/api/auto-fetch/manual`** - Manual Azure sync trigger
- **`/api/azure/approve`** - Approve document & upload Excel
- **`/api/azure/list-failed`** - List failed files from Azure
- **`/api/azure/monitor`** - Monitor Simplitics processing status
- **`/api/workflow/sync`** - Workflow sync endpoint

## Key Features

- ✅ Azure Blob Storage integration
- ✅ Automatic file fetching (cron job)
- ✅ AI document extraction (Claude)
- ✅ Excel/CSV file support
- ✅ Review dashboard with status filtering
- ✅ Excel export with GUID mapping
- ✅ Smart input with confidence badges
- ✅ Material management
- ✅ GUID mapping for suppliers

