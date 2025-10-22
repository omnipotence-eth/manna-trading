# 🚀 Deployment Guide - GitHub + Custom Domain

## 📋 Overview

This guide will help you:
1. Push code to a **private GitHub repository**
2. Deploy to **your custom domain**

---

## 🔐 Part 1: Push to Private GitHub Repository

### Step 1: Initialize Git (if not already done)

```bash
git init
git add .
git commit -m "Initial commit - Manna AI Trading Arena"
```

### Step 2: Create GitHub Repository

1. Go to: https://github.com/new
2. **Repository name**: `manna-trading` (or your choice)
3. **Privacy**: Select **Private** ✅
4. **Don't** initialize with README (we already have one)
5. Click **Create repository**

### Step 3: Connect and Push

```bash
# Add your GitHub repo as remote (replace with YOUR username and repo name)
git remote add origin https://github.com/YOUR_USERNAME/manna-trading.git

# Push to GitHub
git branch -M main
git push -u origin main
```

### Step 4: Secure Your API Keys

**IMPORTANT**: Make sure `.env.local` is in `.gitignore`:

```bash
# Check if .gitignore exists and contains .env.local
cat .gitignore | grep .env.local

# If not, add it
echo ".env.local" >> .gitignore
```

---

## 🌐 Part 2: Deploy to Your Custom Domain

You have **3 main hosting options**:

### Option A: Vercel (Recommended - Easiest)
### Option B: Netlify
### Option C: Your Own Server (VPS/Cloud)

---

## 🚀 Option A: Deploy with Vercel (Recommended)

**Why Vercel?**
- Built specifically for Next.js
- Free tier available
- Automatic HTTPS
- Easy custom domain setup
- Automatic deployments from GitHub

### Step 1: Install Vercel CLI

```bash
npm install -g vercel
```

### Step 2: Login to Vercel

```bash
vercel login
```

### Step 3: Deploy

```bash
# From your project directory
vercel

# Follow the prompts:
# - Set up and deploy? Yes
# - Which scope? Your account
# - Link to existing project? No
# - What's your project's name? manna-trading
# - In which directory is your code located? ./
# - Want to override settings? No
```

### Step 4: Add Environment Variables

```bash
# Add your API keys (if needed for production)
vercel env add ASTER_API_KEY
vercel env add ASTER_SECRET_KEY
vercel env add NEXT_PUBLIC_USE_REAL_WEBSOCKET

# Or use the Vercel dashboard:
# https://vercel.com/your-project/settings/environment-variables
```

### Step 5: Connect Your Custom Domain

1. Go to your Vercel project dashboard
2. Click **Settings** → **Domains**
3. Add your domain (e.g., `trading.yourdomain.com`)
4. Vercel will provide DNS records:

**Add to your domain's DNS:**
```
Type: CNAME
Name: trading (or @)
Value: cname.vercel-dns.com
```

### Step 6: Deploy Production

```bash
vercel --prod
```

**Your site will be live at**: `https://your-domain.com` 🎉

---

## 🌐 Option B: Deploy with Netlify

### Step 1: Build Your Project

```bash
npm run build
```

### Step 2: Install Netlify CLI

```bash
npm install -g netlify-cli
netlify login
```

### Step 3: Deploy

```bash
netlify deploy --prod

# Follow prompts:
# - Create new site
# - Publish directory: .next
```

### Step 4: Add Custom Domain

```bash
netlify domains:add your-domain.com
```

---

## 🖥️ Option C: Deploy to Your Own Server (VPS)

### Prerequisites:
- VPS (DigitalOcean, AWS, Linode, etc.)
- Domain pointing to your server IP
- SSH access

### Step 1: Prepare Your Server

```bash
# SSH into your server
ssh user@your-server-ip

# Install Node.js and npm
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs

# Install PM2 (process manager)
sudo npm install -g pm2
```

### Step 2: Clone Your Repo

```bash
# On your server
git clone https://github.com/YOUR_USERNAME/manna-trading.git
cd manna-trading
```

### Step 3: Install Dependencies

```bash
npm install
```

### Step 4: Create .env.local

```bash
nano .env.local
# Add your environment variables
# Save: Ctrl+X, Y, Enter
```

### Step 5: Build

```bash
npm run build
```

### Step 6: Start with PM2

```bash
pm2 start npm --name "manna-trading" -- start
pm2 save
pm2 startup
```

### Step 7: Set Up Nginx (Reverse Proxy)

```bash
sudo apt install nginx

# Create nginx config
sudo nano /etc/nginx/sites-available/manna-trading
```

**Nginx Config**:
```nginx
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
```

**Enable and restart**:
```bash
sudo ln -s /etc/nginx/sites-available/manna-trading /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl restart nginx
```

### Step 8: Set Up SSL (HTTPS)

```bash
sudo apt install certbot python3-certbot-nginx
sudo certbot --nginx -d your-domain.com
```

---

## 📝 Deployment Checklist

### Before Deploying:

- [ ] Code pushed to private GitHub repo
- [ ] `.env.local` in `.gitignore`
- [ ] API keys secured (not in repo)
- [ ] `npm run build` works locally
- [ ] Tests pass: `npm test`
- [ ] No console errors in production build

### After Deploying:

- [ ] Site loads at custom domain
- [ ] HTTPS working (green lock)
- [ ] WebSocket connects properly
- [ ] Prices display correctly
- [ ] No console errors
- [ ] Mobile responsive works

---

## 🔒 Security Best Practices

### 1. Environment Variables

**NEVER commit**:
- API keys
- Secret keys
- Database credentials

**Store in**:
- `.env.local` (local dev)
- Vercel/Netlify environment variables (production)
- Server environment (VPS)

### 2. GitHub Security

```bash
# Make sure sensitive files are ignored
echo "node_modules/" >> .gitignore
echo ".env*" >> .gitignore
echo ".env.local" >> .gitignore
echo ".vercel" >> .gitignore
echo "*.log" >> .gitignore
```

### 3. API Rate Limiting

Already implemented in your code:
- Rate limiter in `lib/rateLimiter.ts`
- API proxy in `app/api/asterdex/[...path]/route.ts`

---

## 🚀 Quick Start Commands

### Push to GitHub:
```bash
git init
git add .
git commit -m "Initial commit"
git remote add origin https://github.com/YOUR_USERNAME/YOUR_REPO.git
git push -u origin main
```

### Deploy to Vercel:
```bash
npm install -g vercel
vercel login
vercel
vercel --prod
```

### Deploy to Netlify:
```bash
npm install -g netlify-cli
netlify login
netlify deploy --prod
```

---

## 🔧 Troubleshooting

### Issue: Build Fails

```bash
# Clear cache and rebuild
rm -rf .next node_modules
npm install
npm run build
```

### Issue: WebSocket Not Working in Production

Add to `next.config.js`:
```javascript
module.exports = {
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'Access-Control-Allow-Origin', value: '*' },
        ],
      },
    ];
  },
};
```

### Issue: Environment Variables Not Working

**Vercel/Netlify**: Add via dashboard
**VPS**: Check `.env.local` exists and is loaded

---

## 📊 Monitoring

### Vercel Analytics (Free)
```bash
npm install @vercel/analytics
```

Add to `app/layout.tsx`:
```typescript
import { Analytics } from '@vercel/analytics/react';

export default function RootLayout({ children }) {
  return (
    <html>
      <body>
        {children}
        <Analytics />
      </body>
    </html>
  );
}
```

---

## 💰 Cost Breakdown

| Platform | Free Tier | Paid Plan |
|----------|-----------|-----------|
| **Vercel** | ✅ Unlimited (hobby) | $20/mo (Pro) |
| **Netlify** | ✅ 100GB bandwidth | $19/mo (Pro) |
| **VPS** | ❌ | $5-20/mo |

**Recommendation**: Start with **Vercel free tier**

---

## 🎯 Next Steps

1. **Choose your hosting option** (I recommend Vercel)
2. **Run the commands below** to get started
3. **Test everything works**
4. **Share your live URL!**

Ready to deploy? Tell me:
- Your preferred hosting platform (Vercel/Netlify/VPS)
- Your GitHub username
- Your custom domain

And I'll guide you through step-by-step! 🚀

