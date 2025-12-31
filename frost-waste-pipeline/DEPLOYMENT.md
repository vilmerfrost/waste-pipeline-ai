# 🚀 Frost Waste Pipeline - Deployment Guide

## Quick Start (5 minuter)

### 1. Förbered miljövariabler

Skapa en `.env` fil i projektets rot-mapp:

```bash
# Supabase (från https://app.supabase.com/project/_/settings/api)
NEXT_PUBLIC_SUPABASE_URL=https://xxxxxxxxxxxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...

# Azure Blob Storage (från Azure Portal > Storage Account > Access Keys)
AZURE_STORAGE_CONNECTION_STRING=DefaultEndpointsProtocol=https;AccountName=xxxxx;AccountKey=xxxxx;EndpointSuffix=core.windows.net
AZURE_STORAGE_ACCOUNT_NAME=ditt-storage-account-namn
AZURE_STORAGE_ACCOUNT_KEY=din-storage-account-key

# Anthropic API (från https://console.anthropic.com/settings/keys)
ANTHROPIC_API_KEY=sk-ant-api03-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx

# Application URL
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

### 2. Bygg och starta

```bash
# Bygg Docker image
docker-compose build

# Starta systemet
docker-compose up -d

# Visa loggar
docker-compose logs -f
```

### 3. Verifiera

Öppna din webbläsare:
- Dashboard: http://localhost:3000/collecct
- Health check: http://localhost:3000/health

---

## Vanliga kommandon

```bash
# Starta systemet
docker-compose up -d

# Stoppa systemet
docker-compose down

# Se loggar (live)
docker-compose logs -f web

# Starta om systemet
docker-compose restart

# Uppdatera systemet (efter kod-ändringar)
docker-compose down
docker-compose build
docker-compose up -d

# Rensa allt och starta om från början
docker-compose down -v
docker-compose build --no-cache
docker-compose up -d
```

---

## Systemkrav

- **Docker:** Version 20.10+
- **Docker Compose:** Version 2.0+
- **RAM:** Minimum 2GB tillgängligt
- **Disk:** 5GB ledigt utrymme

---

## Första körningen

### Kontrollera att allt fungerar:

1. **Health Check:**
   ```bash
   curl http://localhost:3000/api/health
   ```
   Förväntat svar: `{"status":"healthy",...}`

2. **Sync från Azure:**
   - Gå till http://localhost:3000/collecct
   - Klicka på "Synka från Azure" knappen
   - Vänta 10-30 sekunder
   - Dokument ska visas i listan

3. **Processa dokument:**
   - Välj ett dokument
   - Klicka "Granska"
   - Vänta 15-30 sekunder
   - Se resultat i modal

---

## Felsökning

### Problem: "Cannot connect to Docker daemon"
**Lösning:** Starta Docker Desktop eller Docker service
```bash
# Linux
sudo systemctl start docker

# Mac/Windows
# Starta Docker Desktop manuellt
```

### Problem: "Port 3000 already in use"
**Lösning 1:** Stoppa den andra processen som använder port 3000
```bash
# Mac/Linux
lsof -ti:3000 | xargs kill -9

# Windows
netstat -ano | findstr :3000
taskkill /PID <PID> /F
```

**Lösning 2:** Ändra port i docker-compose.yml
```yaml
ports:
  - "8080:3000"  # Använd port 8080 istället
```

### Problem: "Azure connection failed"
**Kontrollera:**
1. AZURE_STORAGE_CONNECTION_STRING är korrekt
2. Storage account har containers: `unsupported-file-format` och `completed`
3. Nätverksanslutning till Azure fungerar

```bash
# Testa Azure-anslutning
docker-compose exec web node -e "
  const { BlobServiceClient } = require('@azure/storage-blob');
  const client = BlobServiceClient.fromConnectionString(process.env.AZURE_STORAGE_CONNECTION_STRING);
  client.getProperties().then(() => console.log('✅ Azure OK')).catch(e => console.log('❌ Error:', e.message));
"
```

### Problem: "Supabase connection failed"
**Kontrollera:**
1. NEXT_PUBLIC_SUPABASE_URL är korrekt (ska sluta med .supabase.co)
2. SUPABASE_SERVICE_ROLE_KEY är rätt nyckel (inte anon key)
3. Supabase-projekt är aktivt

### Problem: Documents not syncing
**Debug:**
```bash
# Kör manuell sync
docker-compose exec web node -e "
  fetch('http://localhost:3000/api/sync-azure', {method: 'POST'})
    .then(r => r.json())
    .then(d => console.log(d));
"
```

---

## Production Checklist

Innan ni går live med riktiga dokument:

- [ ] Alla miljövariabler är konfigurerade
- [ ] Health check visar "healthy"
- [ ] Kan synka dokument från Azure
- [ ] Kan processa ett test-dokument
- [ ] Kan exportera tillbaka till Azure
- [ ] Martin har testat review-processen
- [ ] Backup-plan finns (hur återställer ni om något går fel)

---

## Support

**Problem under testning?**
- Kontakta: Vilmer/Frost Solutions
- E-post: kontakt@frostsolutions.se
- Skicka loggar: `docker-compose logs > logs.txt`

---

## Säkerhetsnoteringar

⚠️ **VIKTIGT:**
- Committa ALDRIG `.env` filen till Git
- Rotera API-nycklar regelbundet
- Använd starka lösenord för Supabase
- Begränsa Azure Storage access med SAS tokens om möjligt

---

## Nästa steg efter lyckad testning

1. **Konfigurera automatisk sync:**
   - Systemet synkar automatiskt var 5:e minut
   - Ingen manuell åtgärd behövs

2. **Utbildning:**
   - Praktikant: Hur man granskar dokument
   - Martin: Dashboard och statistik

3. **Övergång till produktion:**
   - Ta bort test-dokument
   - Börja processa riktiga dokument
   - Övervaka första veckan noggrant

---

**Lycka till! 🚀**
