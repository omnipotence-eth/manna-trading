# Production Deployment Guide

## Prerequisites

Before deploying to production:

- [ ] Aster DEX account with API keys (30 keys recommended)
- [ ] PostgreSQL database (Neon.tech recommended)
- [ ] Server with Ollama + DeepSeek R1 model
- [ ] Node.js 18+ installed
- [ ] Minimum 8GB RAM (for DeepSeek R1:8b)

---

## Deployment Options

### Option 1: Vercel (Recommended for Frontend + API)

**Pros:**
- Easy deployment
- Auto-scaling
- Built-in CDN
- Zero-config

**Cons:**
- Need separate server for Ollama/DeepSeek
- Serverless functions have execution time limits

**Steps:**

1. **Push code to GitHub**
   ```bash
   git init
   git add .
   git commit -m "Initial commit"
   git remote add origin <your-repo-url>
   git push -u origin main
   ```

2. **Connect to Vercel**
   - Go to https://vercel.com
   - Import GitHub repository
   - Configure environment variables (see below)

3. **Set up external Ollama server**
   - Deploy DeepSeek on separate VPS
   - Set `OLLAMA_BASE_URL` in Vercel env vars

### Option 2: VPS (Full Control)

**Recommended Specs:**
- CPU: 8+ cores
- RAM: 16GB (for DeepSeek R1:8b)
- Storage: 100GB SSD
- OS: Ubuntu 22.04 LTS

**Providers:**
- DigitalOcean
- Linode
- Vultr
- AWS EC2

---

## Environment Configuration

### Production `.env.local`

```bash
# Node Environment
NODE_ENV=production

# Aster DEX API (30 Keys)
ASTER_API_KEY=primary_key
ASTER_SECRET_KEY=primary_secret
ASTER_BASE_URL=https://fapi.asterdex.com
USE_MULTI_KEY_API=true

# Multi-Key Pool (30 keys in JSON format)
ASTER_KEY_POOL={"keys":[{"id":"key-1","api":"...","secret":"..."},...]}

# Database (PostgreSQL - Neon.tech)
DATABASE_URL=postgresql://user:pass@host:5432/db?sslmode=require

# AI Model
DEEPSEEK_MODEL=deepseek-r1:8b
OLLAMA_BASE_URL=http://localhost:11434

# Trading Configuration
TRADING_CONFIDENCE_THRESHOLD=0.35
TRADING_STOP_LOSS=4.0
TRADING_TAKE_PROFIT=12.0
INITIAL_CAPITAL=100

# Performance
MAX_CONCURRENT_WORKFLOWS=3
RATE_LIMIT_PER_KEY_RPS=20
API_KEY_STRATEGY=least-used

# Logging
LOG_LEVEL=info
```

---

## VPS Deployment Steps

### 1. Server Setup

```bash
# Update system
sudo apt update && sudo apt upgrade -y

# Install Node.js 18
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt install -y nodejs

# Install Ollama
curl -fsSL https://ollama.com/install.sh | sh

# Pull DeepSeek R1 model
ollama pull deepseek-r1:8b

# Install PM2 (process manager)
sudo npm install -g pm2
```

### 2. Application Deployment

```bash
# Clone repository
git clone <your-repo-url>
cd manna

# Install dependencies
npm install

# Create .env.local
nano .env.local
# (paste production config from above)

# Build application
npm run build

# Start with PM2
pm2 start npm --name "manna-trading" -- start

# Save PM2 config
pm2 save
pm2 startup
```

### 3. Prewarm DeepSeek

```bash
# Create prewarming script
nano prewarm.sh

# Add content:
#!/bin/bash
ollama run deepseek-r1:8b ""

# Make executable
chmod +x prewarm.sh

# Run on startup (crontab)
crontab -e

# Add line:
@reboot sleep 30 && /path/to/prewarm.sh
```

### 4. Configure Nginx (Optional)

```bash
# Install Nginx
sudo apt install -y nginx

# Create config
sudo nano /etc/nginx/sites-available/manna

# Add configuration:
server {
    listen 80;
    server_name your-domain.com;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}

# Enable site
sudo ln -s /etc/nginx/sites-available/manna /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl restart nginx

# Setup SSL (Let's Encrypt)
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d your-domain.com
```

---

## Database Setup (Neon.tech)

### 1. Create Database

1. Go to https://neon.tech
2. Create new project
3. Copy connection string

### 2. Run Migrations

```bash
# Connect to database
psql <connection-string>

# Run schema (from scripts/schema.sql)
\i scripts/schema.sql

# Verify tables
\dt
```

### 3. Configure Connection

Add to `.env.local`:
```bash
DATABASE_URL=postgresql://user:pass@ep-xxx.neon.tech/db?sslmode=require
DATABASE_SSL=true
DATABASE_MAX_CONNECTIONS=30
```

---

## Monitoring & Maintenance

### Health Checks

```bash
# Check application status
pm2 status

# View logs
pm2 logs manna-trading

# Restart if needed
pm2 restart manna-trading
```

### Automated Monitoring

Create monitoring script:

```bash
nano monitor.sh

#!/bin/bash
# Check if server is running
if ! curl -f http://localhost:3000/api/health > /dev/null 2>&1; then
    echo "Server down! Restarting..."
    pm2 restart manna-trading
    
    # Send alert (optional)
    # curl -X POST https://your-webhook.com/alert \
    #   -d "message=Manna trading system restarted"
fi

# Make executable
chmod +x monitor.sh

# Run every 5 minutes (crontab)
crontab -e

# Add line:
*/5 * * * * /path/to/monitor.sh
```

### Log Rotation

```bash
# Install logrotate
sudo apt install -y logrotate

# Create config
sudo nano /etc/logrotate.d/manna

# Add configuration:
/home/user/.pm2/logs/*.log {
    daily
    rotate 7
    compress
    delaycompress
    notifempty
    missingok
    create 0640 user user
}
```

---

## Security Hardening

### 1. Firewall Configuration

```bash
# Enable UFW
sudo ufw enable

# Allow SSH
sudo ufw allow 22/tcp

# Allow HTTP/HTTPS (if using Nginx)
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp

# Block direct access to Node.js port
sudo ufw deny 3000/tcp
```

### 2. Environment Variable Protection

```bash
# Restrict .env.local permissions
chmod 600 .env.local

# Never commit to git
echo ".env.local" >> .gitignore
```

### 3. API Key Rotation

- Rotate keys every 90 days
- Monitor for suspicious activity
- Use separate keys for prod/dev

---

## Performance Tuning

### System Limits

```bash
# Increase file descriptor limit
sudo nano /etc/security/limits.conf

# Add lines:
* soft nofile 65535
* hard nofile 65535

# Increase inotify watchers
sudo nano /etc/sysctl.conf

# Add line:
fs.inotify.max_user_watches=524288

# Apply changes
sudo sysctl -p
```

### Node.js Optimization

```bash
# Set NODE_OPTIONS for production
export NODE_OPTIONS="--max-old-space-size=4096"

# Update PM2 config
pm2 start npm --name "manna-trading" -- start \
  --node-args="--max-old-space-size=4096"

pm2 save
```

### Database Connection Pooling

In `.env.local`:
```bash
DATABASE_MAX_CONNECTIONS=30
DATABASE_IDLE_TIMEOUT=30000
DATABASE_CONNECTION_TIMEOUT=10000
```

---

## Backup & Recovery

### Database Backups

```bash
# Daily backup script
nano backup.sh

#!/bin/bash
DATE=$(date +%Y-%m-%d)
pg_dump $DATABASE_URL > /backups/manna-$DATE.sql
gzip /backups/manna-$DATE.sql

# Keep only last 7 days
find /backups -name "manna-*.sql.gz" -mtime +7 -delete

# Make executable
chmod +x backup.sh

# Schedule daily (crontab)
crontab -e

# Add line:
0 2 * * * /path/to/backup.sh
```

### Configuration Backups

```bash
# Backup .env.local
cp .env.local .env.local.backup.$(date +%Y-%m-%d)

# Backup PM2 config
pm2 save
cp ~/.pm2/dump.pm2 ~/.pm2/dump.pm2.backup.$(date +%Y-%m-%d)
```

### Recovery Procedure

```bash
# 1. Stop application
pm2 stop manna-trading

# 2. Restore database
gunzip -c /backups/manna-YYYY-MM-DD.sql.gz | psql $DATABASE_URL

# 3. Restore configuration
cp .env.local.backup.YYYY-MM-DD .env.local

# 4. Restart application
pm2 restart manna-trading

# 5. Verify system
curl http://localhost:3000/api/health
```

---

## Scaling Strategies

### Horizontal Scaling

**Add more API keys:**
- Currently: 30 keys = 600 req/sec
- Add 30 more = 1200 req/sec capacity

**Multiple instances:**
```bash
# Start multiple instances
pm2 start npm --name "manna-1" -i 2 -- start

# Load balance with Nginx
upstream manna {
    server localhost:3000;
    server localhost:3001;
}
```

### Vertical Scaling

**Upgrade server specs:**
- More RAM for larger DeepSeek model (8B → 14B or 32B)
- Faster CPU for quicker AI inference
- SSD storage for faster I/O

**Optimize DeepSeek:**
```bash
# Use larger model if resources allow
DEEPSEEK_MODEL=deepseek-r1:8b

# Increase concurrent workflows
MAX_CONCURRENT_WORKFLOWS=5
```

---

## Troubleshooting Production Issues

### Application Won't Start

```bash
# Check logs
pm2 logs manna-trading --lines 100

# Common issues:
# 1. Port already in use
sudo lsof -i :3000
sudo kill -9 <PID>

# 2. Missing .env.local
ls -la .env.local

# 3. Node modules not installed
npm install
```

### High Memory Usage

```bash
# Check memory
free -h

# Restart application
pm2 restart manna-trading

# Monitor memory
watch -n 5 'pm2 status | grep manna'
```

### Database Connection Errors

```bash
# Test connection
psql $DATABASE_URL -c "SELECT 1"

# Check connection limits
psql $DATABASE_URL -c "SHOW max_connections"

# Reduce pool size if needed
DATABASE_MAX_CONNECTIONS=20
```

---

## Post-Deployment Checklist

- [ ] Application running (pm2 status)
- [ ] DeepSeek model prewarmed
- [ ] Database connected
- [ ] Health endpoint responding
- [ ] Services initialized
- [ ] Agent Runner active
- [ ] Balance displaying correctly
- [ ] Trades executing successfully
- [ ] Logs clean (no errors)
- [ ] Monitoring active
- [ ] Backups configured
- [ ] Firewall enabled
- [ ] SSL certificate active (if using domain)

---

