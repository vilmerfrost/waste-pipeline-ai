# 🧊 Frost Waste Pipeline AI

**Intelligent document processing system for waste management data extraction**

Built by Frost Solutions for Collecct AB

---

## 📋 Overview

Frost Waste Pipeline AI automates the extraction, validation, and export of waste management data from unstructured documents (PDFs and Excel files). It serves as a fallback processor in Collecct's data pipeline, handling documents that fail primary processing systems.

### System Flow

```
Customer Upload → Power BI → Simplitics Program
                                    ↓ (fails)
                    Azure Blob: "unsupported-file-format"
                                    ↓
                    🧊 FROST AI PROCESSOR
                    - AI Extraction
                    - Human Review
                    - Quality Check
                                    ↓
                    Azure Blob: "completed"
                                    ↓
                    Simplitics picks up → SUCCESS → Power BI
```

---

## 🚀 Features

- **Automated AI Extraction**: Claude Sonnet 4 processes invoices with 90%+ accuracy
- **Multi-language Support**: Swedish, Finnish, Norwegian documents
- **Human-in-the-Loop Review**: Dashboard for edge case verification
- **Azure Integration**: Automatic sync from/to Azure Blob Storage
- **Batch Processing**: Process multiple documents simultaneously
- **Export to Excel**: Generates Simplitics-compatible XLSX files
- **Real-time Monitoring**: Health dashboard with system status

---

## 🛠️ Tech Stack

- **Frontend**: Next.js 14 (App Router), React, TypeScript, Tailwind CSS
- **Backend**: Python FastAPI (optional - currently using Next.js API routes)
- **Database**: Supabase (PostgreSQL)
- **Storage**: Azure Blob Storage
- **AI**: Anthropic Claude API (Sonnet 4)
- **Deployment**: Docker Compose

---

## 📦 Prerequisites

- Node.js 18+ and npm
- Docker and Docker Compose (for production deployment)
- Azure Storage Account with containers:
  - `unsupported-file-format` (input)
  - `completed` (output)
- Supabase project
- Anthropic API key

---

## ⚙️ Environment Variables

Create a `.env.local` file in the project root:

```bash
# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key

# Azure Blob Storage
AZURE_STORAGE_CONNECTION_STRING=DefaultEndpointsProtocol=https;AccountName=...
AZURE_STORAGE_ACCOUNT_NAME=your-storage-account
AZURE_STORAGE_ACCOUNT_KEY=your-storage-key

# Anthropic API
ANTHROPIC_API_KEY=sk-ant-...

# Application
NEXT_PUBLIC_APP_URL=http://localhost:3000
NODE_ENV=development
```

---

## 🏃 Local Development

1. **Clone the repository**
```bash
git clone <repository-url>
cd frost-waste-pipeline
```

2. **Install dependencies**
```bash
npm install
```

3. **Set up environment variables**
```bash
cp .env.example .env.local
# Edit .env.local with your credentials
```

4. **Run database migrations** (if needed)
```bash
# Supabase migrations are in /supabase/migrations
```

5. **Start development server**
```bash
npm run dev
```

6. **Open browser**
```
http://localhost:3000
```

---

## 🐳 Docker Deployment

### Build and Run

```bash
# Build the image
docker-compose build

# Start services
docker-compose up -d

# View logs
docker-compose logs -f

# Stop services
docker-compose down
```

### Production Deployment

1. **Update environment variables** in `docker-compose.yml` or use `.env` file
2. **Build for production**
```bash
docker-compose -f docker-compose.prod.yml up -d
```

3. **Monitor health**
```bash
curl http://localhost:3000/api/health
```

---

## 📊 System Architecture

### Database Schema (Supabase)

**documents table:**
```sql
- id (uuid, primary key)
- filename (text)
- original_filename (text)
- azure_url (text)
- status (enum: uploaded, processing, needs_review, approved, exported, error)
- extracted_data (jsonb)
- created_at (timestamp)
- updated_at (timestamp)
```

### API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/health` | GET | System health check |
| `/api/sync-azure` | POST | Sync documents from Azure |
| `/api/process-document` | POST | Process single document |
| `/api/process-batch` | POST | Batch process documents |
| `/api/export-to-azure` | POST | Export to Azure "completed" |
| `/api/documents/[id]` | GET/PATCH | Document CRUD |

---

## 🔧 Configuration

### Auto-Sync Settings

The system checks Azure Blob Storage for new files automatically. Configure sync interval in:

```typescript
// app/api/sync-azure/route.ts
const SYNC_INTERVAL = 5 * 60 * 1000; // 5 minutes (default)
```

### AI Processing Settings

```typescript
// Confidence thresholds
const AUTO_APPROVE_THRESHOLD = 95; // Auto-approve if quality > 95%
const NEEDS_REVIEW_THRESHOLD = 80; // Human review if < 80%
```

---

## 📖 User Guide

### How to Use the System

1. **Dashboard** (`/collecct`)
   - View all documents
   - Process documents (batch or single)
   - Filter and search
   - Export approved documents

2. **Review Documents** (`/review/[id]`)
   - Verify AI-extracted data
   - Edit line items
   - Approve or reject
   - See confidence scores

3. **Settings** (`/settings`)
   - Manage material synonyms
   - Configure thresholds
   - View system info

4. **Health Monitoring** (`/health`)
   - Check system status
   - View processing stats
   - Monitor Azure connection

### Workflow

```
1. Documents arrive in Azure "unsupported-file-format"
2. System auto-syncs every 5 minutes
3. AI processes and extracts data
4. If confidence < 95%, human reviews
5. Approved documents → export to "completed"
6. Original files deleted from "unsupported-file-format"
7. Simplitics picks up and processes successfully
```

---

## 🐛 Troubleshooting

### Common Issues

**Problem: Documents not syncing from Azure**
```bash
# Check Azure connection in health dashboard
# Verify AZURE_STORAGE_CONNECTION_STRING in .env
# Check container names match exactly
```

**Problem: AI extraction failing**
```bash
# Check ANTHROPIC_API_KEY is valid
# Verify API rate limits not exceeded
# Check document format is PDF or Excel
```

**Problem: Export failing**
```bash
# Verify Azure "completed" container exists
# Check write permissions on Azure storage
# Review logs: docker-compose logs -f
```

---

## 📈 Monitoring & Maintenance

### Health Checks

- Dashboard: `http://localhost:3000/health`
- API endpoint: `curl http://localhost:3000/api/health`

### Logs

```bash
# View all logs
docker-compose logs -f

# View specific service
docker-compose logs -f web

# Last 100 lines
docker-compose logs --tail=100
```

### Database Backup

```bash
# Backup Supabase (use Supabase dashboard or CLI)
# Or manual PostgreSQL dump if self-hosted
```

---

## 🔐 Security Notes

- Never commit `.env` files to git
- Rotate API keys regularly
- Use Azure SAS tokens for time-limited access
- Enable CORS only for trusted domains
- Keep dependencies updated (`npm audit`)

---

## 📞 Support

**Developed by:** Frost Solutions  
**Contact:** [Your contact info]  
**Client:** Collecct AB  
**Version:** 1.0.0  
**Last Updated:** December 30, 2025

---

## 🔄 Maintenance Plan

**Included in 2,000 SEK/month:**
- Bug fixes and security updates
- Email support (response within 24h)
- Minor feature adjustments
- Monthly health check reports
- Hosting and infrastructure maintenance

---

## 📄 License

Proprietary - Frost Solutions © 2025
