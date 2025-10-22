# 🌐 Domain Setup - omnipotence.art

## ✅ Your Site is LIVE!

**Current URL**: https://manna-trading-e6i0s5zg0-tremayne-timms-projects.vercel.app

**Target URL**: https://omnipotence.art

---

## 🔧 DNS Configuration Required

### Step 1: Go to Vercel Dashboard

Visit: **https://vercel.com/tremayne-timms-projects/manna-trading/settings/domains**

### Step 2: Add Your Domain

The domain `omnipotence.art` has been added, but you need to verify ownership via DNS.

Vercel will show you one of these options:

#### Option A: Using CNAME (Recommended)
```
Type: CNAME
Name: @ (or www)
Value: cname.vercel-dns.com
```

#### Option B: Using A Record
```
Type: A
Name: @
Value: 76.76.21.21
```

---

## 🌐 Where to Add DNS Records

### Go to Your Domain Registrar

**Common Registrars**:
- **GoDaddy**: https://dcc.godaddy.com/manage/dns
- **Namecheap**: https://ap.www.namecheap.com/domains/list
- **Cloudflare**: https://dash.cloudflare.com
- **Google Domains**: https://domains.google.com

### Add the DNS Record

1. Login to your domain registrar
2. Find DNS settings for `omnipotence.art`
3. Add a **CNAME record**:
   - **Name**: `@` (or leave blank for root domain)
   - **Value**: `cname.vercel-dns.com`
   - **TTL**: Automatic (or 3600)
4. **Save** the changes

---

## ⏰ Wait for DNS Propagation

After adding the DNS record:
- **Wait**: 5-60 minutes (sometimes up to 24 hours)
- **Check**: https://dnschecker.org/#CNAME/omnipotence.art
- **Verify**: Green checkmarks = propagated

---

## ✅ Verification Steps

### In Vercel Dashboard:
1. Go to: https://vercel.com/tremayne-timms-projects/manna-trading/settings/domains
2. You should see `omnipotence.art` listed
3. Status will change from "Pending" → "Valid" when DNS propagates
4. Vercel will automatically provision SSL certificate

### Test Your Domain:
```bash
# After DNS propagates, test:
curl -I https://omnipotence.art

# Should return:
HTTP/2 200
```

---

## 🎯 Alternative: Use Subdomain

If you want to use a subdomain instead:

### Example: trading.omnipotence.art

**Vercel Command**:
```bash
vercel domains add trading.omnipotence.art
```

**DNS Record**:
```
Type: CNAME
Name: trading
Value: cname.vercel-dns.com
```

This is easier and faster to set up!

---

## 📊 Current Status

| Item | Status |
|------|--------|
| Code on GitHub | ✅ https://github.com/omnipotence-eth/manna-trading |
| Deployed to Vercel | ✅ https://manna-trading-...vercel.app |
| Domain Added | ✅ omnipotence.art |
| DNS Configured | ⏳ **YOU NEED TO DO THIS** |
| SSL Certificate | ⏳ Auto after DNS |
| Live Site | ⏳ After DNS propagates |

---

## 🚀 Quick Summary

**What's Done** ✅:
1. Code pushed to private GitHub repo
2. Deployed to Vercel
3. Domain added to Vercel project
4. Site is live (temporary URL)

**What You Need to Do** 📝:
1. Add DNS record at your domain registrar
2. Point `omnipotence.art` to `cname.vercel-dns.com`
3. Wait for propagation (5-60 min)
4. Site will be live at https://omnipotence.art

---

## 🔍 Exact DNS Settings

Copy these exact values to your domain registrar:

### For Root Domain (omnipotence.art):
```
Record Type: CNAME
Host/Name: @ (or leave blank)
Points to: cname.vercel-dns.com
TTL: 3600 (or Automatic)
```

### For WWW (www.omnipotence.art):
```
Record Type: CNAME
Host/Name: www
Points to: cname.vercel-dns.com
TTL: 3600 (or Automatic)
```

---

## 🎉 Final Steps

1. **Add DNS record** at your registrar (2 minutes)
2. **Wait** for DNS to propagate (5-60 minutes)
3. **Visit** https://omnipotence.art
4. **Enjoy** your live trading platform! 🚀

---

## 📞 Need Help?

**Check Vercel Dashboard**: 
https://vercel.com/tremayne-timms-projects/manna-trading/settings/domains

It will show:
- DNS configuration instructions
- Current status
- Verification steps

**Or tell me**:
- Your domain registrar (GoDaddy, Namecheap, etc.)
- And I'll give you specific instructions!

---

**Your trading platform is deployed and ready!** 🎉

Just add the DNS record and you'll be live at **omnipotence.art** in ~30 minutes!

