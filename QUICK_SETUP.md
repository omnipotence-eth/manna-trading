# ⚡ Quick Setup Guide

## ✅ Step 1: Git Initialized ✅

Your code is ready to push! Here's what was done:
- ✅ Git repository initialized
- ✅ All files committed (47 files)
- ✅ `.env.local` excluded (your API keys are safe!)

---

## 🔐 Step 2: Create GitHub Private Repository

### Option A: Using GitHub Website (Easiest)

1. Go to: **https://github.com/new**
2. **Repository name**: `manna-trading` (or your choice)
3. **Description**: `AI-powered crypto trading platform with real-time data`
4. **Privacy**: Select **🔒 Private**
5. **DO NOT** check "Initialize with README" (we already have one)
6. Click **"Create repository"**

### Option B: Using GitHub CLI

```bash
# Install GitHub CLI first: https://cli.github.com/
gh repo create manna-trading --private --source=. --remote=origin --push
```

---

## 📤 Step 3: Push Your Code

After creating the GitHub repo, run these commands:

```bash
# Add your GitHub repo as remote
# Replace YOUR_USERNAME with your actual GitHub username
git remote add origin https://github.com/YOUR_USERNAME/manna-trading.git

# Rename branch to main (GitHub standard)
git branch -M main

# Push to GitHub
git push -u origin main
```

**Example**:
```bash
git remote add origin https://github.com/johndoe/manna-trading.git
git branch -M main
git push -u origin main
```

---

## 🌐 Step 4: Deploy to Your Domain

### Recommended: Vercel (Fastest & Easiest)

#### Install Vercel CLI:
```bash
npm install -g vercel
```

#### Login:
```bash
vercel login
```

#### Deploy:
```bash
vercel
```

Follow prompts:
- Project name: `manna-trading`
- Directory: `./`
- Settings: Use defaults

#### Connect Your Domain:
```bash
vercel domains add yourdomain.com
```

Or use Vercel dashboard: https://vercel.com/dashboard

#### Deploy to Production:
```bash
vercel --prod
```

---

## 🔑 Step 5: Add Environment Variables (Production)

### For Vercel:

**Option A: Via CLI**
```bash
vercel env add NEXT_PUBLIC_USE_REAL_WEBSOCKET
# Enter: true

vercel env add INITIAL_CAPITAL
# Enter: 100

# Only if you have Aster DEX API keys:
vercel env add ASTER_API_KEY
vercel env add ASTER_SECRET_KEY
```

**Option B: Via Dashboard**
1. Go to: https://vercel.com/your-project/settings/environment-variables
2. Add each variable
3. Redeploy

---

## 📋 Quick Commands Cheatsheet

### Git Commands:
```bash
# Check status
git status

# Add changes
git add .

# Commit changes
git commit -m "Your message"

# Push to GitHub
git push

# Pull latest changes
git pull
```

### Deployment:
```bash
# Deploy to Vercel (preview)
vercel

# Deploy to production
vercel --prod

# Check deployment logs
vercel logs
```

### Development:
```bash
# Install dependencies
npm install

# Run dev server
npm run dev

# Build for production
npm run build

# Test production build
npm start
```

---

## 🎯 What Your GitHub Repo URL Will Be

```
https://github.com/YOUR_USERNAME/manna-trading
```

Replace `YOUR_USERNAME` with your actual GitHub username.

---

## 🚀 What Your Live Site URL Will Be

### Vercel Default:
```
https://manna-trading.vercel.app
```

### With Your Custom Domain:
```
https://yourdomain.com
```

---

## ✅ Deployment Checklist

Before pushing to production:

- [ ] Code committed to Git ✅ (DONE)
- [ ] Create private GitHub repository
- [ ] Push code to GitHub
- [ ] Choose hosting platform (Vercel recommended)
- [ ] Deploy site
- [ ] Add environment variables
- [ ] Connect custom domain
- [ ] Test live site
- [ ] Verify WebSocket works
- [ ] Check prices are real (~$108k BTC)

---

## 🔒 Security Reminder

**Your `.env.local` file is NOT in GitHub** ✅

The `.gitignore` file prevents these from being committed:
- `.env.local` (your API keys)
- `node_modules/` (dependencies)
- `.next/` (build files)

**This keeps your API keys safe!**

---

## 💡 Pro Tips

### 1. Automatic Deployments
Once connected to Vercel:
```bash
git add .
git commit -m "Update feature"
git push
# Vercel automatically deploys! 🚀
```

### 2. Preview Deployments
Every branch gets a preview URL:
```bash
git checkout -b new-feature
git push -u origin new-feature
# Get a preview URL to test before merging
```

### 3. Rollback if Needed
```bash
vercel rollback
```

---

## 📞 Need Help?

### GitHub Issues:
- Can't push? Check SSH keys: https://docs.github.com/en/authentication
- 403 error? Use personal access token instead of password

### Vercel Issues:
- Build fails? Check logs: `vercel logs`
- Domain not working? Check DNS propagation: https://dnschecker.org

---

## 🎉 Ready to Deploy!

**You're all set!** Just need to:

1. **Create GitHub repo** (2 minutes)
2. **Push code** (1 minute)
3. **Deploy to Vercel** (5 minutes)
4. **Connect domain** (5 minutes + DNS propagation)

**Total time**: ~15 minutes to go live! 🚀

---

## 📝 Your Next Commands

```bash
# 1. Create GitHub repo at: https://github.com/new

# 2. Then run (replace YOUR_USERNAME):
git remote add origin https://github.com/YOUR_USERNAME/manna-trading.git
git branch -M main
git push -u origin main

# 3. Deploy to Vercel:
npm install -g vercel
vercel login
vercel
vercel --prod

# 4. Done! 🎉
```

---

**Need help with any step? Just ask!** 🚀

