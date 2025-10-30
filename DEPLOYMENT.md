# Vercel Deployment Guide

## Prerequisites

1. **Vercel Account** - Sign up at https://vercel.com
2. **GitHub Repository** - Push your code to GitHub
3. **Environment Variables** - Configure in Vercel dashboard

## Environment Variables Required

### Required Variables:
```env
# Aster DEX API (REQUIRED)
ASTER_API_KEY=your_api_key_here
ASTER_SECRET_KEY=your_secret_key_here

# Database (REQUIRED)
DATABASE_URL=postgresql://user:password@host:5432/database

# Ollama/DeepSeek R1 (REQUIRED for AI trading)
OLLAMA_BASE_URL=http://your-ollama-server:11434

# Optional Configuration
ASTER_BASE_URL=https://fapi.asterdex.com
ASTER_WS_BASE_URL=wss://fstream.asterdex.com/stream
DEEPSEEK_MODEL=deepseek-r1:32b
ENABLE_24_7_AGENTS=true
AGENT_RUNNER_INTERVAL=2
TRADING_CONFIDENCE_THRESHOLD=0.65
TRADING_STOP_LOSS=4.0
TRADING_TAKE_PROFIT=12.0
MAX_CONCURRENT_POSITIONS=2
MAX_PORTFOLIO_RISK=10
LOG_LEVEL=info
```

## Deployment Steps

### 1. Connect Repository to Vercel

1. Go to https://vercel.com/dashboard
2. Click "Add New Project"
3. Import your GitHub repository
4. Vercel will auto-detect Next.js configuration

### 2. Configure Environment Variables

1. In Vercel project settings, go to "Environment Variables"
2. Add all required environment variables listed above
3. Make sure to set them for:
   - **Production** (required)
   - **Preview** (optional, for testing)
   - **Development** (optional)

### 3. Build Configuration

The project uses standard Next.js configuration:
- **Framework Preset**: Next.js (auto-detected)
- **Build Command**: `npm run build` (default)
- **Output Directory**: `.next` (default)
- **Install Command**: `npm install` (default)

### 4. Database Setup

This project requires PostgreSQL. Options:
- **Neon** (recommended): https://neon.tech
- **Supabase**: https://supabase.com
- **Vercel Postgres**: Available in Vercel dashboard

After creating database, add `DATABASE_URL` to Vercel environment variables.

### 5. Ollama/DeepSeek R1 Setup

Since Ollama runs locally, you have two options:

**Option A: External Ollama Server**
- Deploy Ollama on a VPS or cloud instance
- Set `OLLAMA_BASE_URL` to your server URL
- Ensure server is accessible from Vercel

**Option B: Vercel Serverless Functions**
- Ollama may not work well in serverless functions
- Consider using DeepSeek API directly (if available)
- Or use a dedicated VPS for Ollama

### 6. Deploy

1. Push changes to GitHub
2. Vercel will automatically deploy
3. Monitor build logs in Vercel dashboard
4. Check deployment status

## Important Notes

### API Routes Runtime
- All API routes use **Node.js runtime** (default)
- Edge runtime is not supported due to database connections
- Cron jobs configured in `vercel.json` run every minute

### Build Timeouts
- Default build timeout: 60 seconds
- If build times out, optimize dependencies or split into smaller chunks

### Function Timeouts
- Default API route timeout: 10 seconds
- Cron jobs timeout: 60 seconds
- For longer operations, use background jobs or external services

### WebSocket Limitations
- Vercel serverless functions don't support persistent WebSocket connections
- WebSocket simulation mode will be used automatically
- Real WebSocket requires external service (e.g., Pusher, Ably)

### Environment Variables
- **Never commit** `.env` files to Git
- All secrets must be in Vercel Environment Variables
- `NEXT_PUBLIC_*` variables are exposed to the browser

## Troubleshooting

### Build Fails
1. Check build logs in Vercel dashboard
2. Ensure all dependencies are in `package.json`
3. Check TypeScript errors: `npm run build` locally
4. Verify Node.js version (18+ required)

### Runtime Errors
1. Check function logs in Vercel dashboard
2. Verify environment variables are set
3. Check database connection string format
4. Verify API keys are correct

### Database Connection Issues
1. Ensure `DATABASE_URL` is set correctly
2. Check database allows connections from Vercel IPs
3. Verify SSL is enabled (required for Neon/Supabase)
4. Test connection string format: `postgresql://user:pass@host:5432/db?sslmode=require`

### API Timeout Errors
1. Reduce timeout-sensitive operations
2. Use background jobs for long-running tasks
3. Optimize database queries
4. Implement request caching

## Post-Deployment Checklist

- [ ] Environment variables configured
- [ ] Database connected and accessible
- [ ] Ollama/DeepSeek R1 accessible (if using AI features)
- [ ] API routes responding correctly
- [ ] Cron jobs running (check logs)
- [ ] Frontend loading properly
- [ ] Trading system initialized (check logs)

## Monitoring

- **Vercel Analytics**: Monitor performance in dashboard
- **Function Logs**: Check API route logs in Vercel
- **Build Logs**: Review build process for errors
- **Cron Job Logs**: Monitor `/api/cron/trading` execution

## Support

For issues:
1. Check Vercel deployment logs
2. Review application logs
3. Verify all environment variables
4. Test database connectivity
5. Check API endpoint responses

