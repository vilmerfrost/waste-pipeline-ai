# Deployment Checklist for Collecct System

## Pre-Deployment

- [ ] All tests passing locally
- [ ] Environment variables configured
- [ ] Azure blob storage accessible
- [ ] Supabase tables created
- [ ] Claude API key valid
- [ ] Tested with real Collecct documents

## Environment Variables

Create `.env.production`:

```bash
# Supabase
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key

# Anthropic
ANTHROPIC_API_KEY=your_claude_key

# Azure (connection string is in azure-blob-connector.ts)
AZURE_STORAGE_CONNECTION_STRING=your_azure_connection_string

# Site URL (for health checks)
NEXT_PUBLIC_SITE_URL=https://your-domain.vercel.app
```

## Deployment Steps

1. **Commit all changes**
```bash
git add .
git commit -m "feat: Complete Collecct system with quality improvements"
```

2. **Push to GitHub**
```bash
git push origin main
```

3. **Deploy to Vercel**
- Push to main branch triggers automatic deployment
- Or use Vercel CLI: `vercel --prod`

4. **Verify Deployment**
- Check health endpoint: `https://your-domain.vercel.app/health`
- Test document upload
- Verify Azure integration

## Post-Deployment

- [ ] Health dashboard accessible at `/health`
- [ ] Collecct dashboard accessible at `/collecct`
- [ ] Document processing working
- [ ] Azure blob uploads working
- [ ] Auto-approve functioning correctly

## Monitoring

- Health Dashboard: `/health`
- Review Dashboard: `/collecct`
- Processing logs: Vercel dashboard

## Troubleshooting

### Azure Connection Issues
- Verify connection string in `azure-blob-connector.ts`
- Check container names match Azure setup

### Claude API Errors
- Verify API key in environment variables
- Check rate limits

### Supabase Errors
- Verify service role key has correct permissions
- Check RLS policies

