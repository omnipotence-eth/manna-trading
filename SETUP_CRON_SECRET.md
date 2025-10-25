# 🔐 SETUP CRON_SECRET - Secure Your Cron Job

## 🙏 In Jesus' Name - Securing Godspeed

To secure your cron endpoint from unauthorized access, you need to set up a `CRON_SECRET` environment variable in Vercel.

## 📋 **Step-by-Step Instructions:**

### **1. Generate a Secure Secret**

Use one of these methods to create a random secret:

**Option A: Online Generator**
- Visit: https://www.uuidgenerator.net/
- Copy the generated UUID (example: `a3d5f6e7-8b9c-1d2e-3f4g-5h6i7j8k9l0m`)

**Option B: PowerShell**
```powershell
-join ((65..90) + (97..122) | Get-Random -Count 32 | % {[char]$_})
```

**Option C: Use this pre-generated one** (for convenience):
```
godspeed-trading-secret-2025-omnipotence-art
```

### **2. Add to Vercel Dashboard**

1. Go to **Vercel Dashboard**: https://vercel.com/
2. Select your project: **manna-trading**
3. Go to **Settings** → **Environment Variables**
4. Click **Add New**
5. Enter:
   - **Key:** `CRON_SECRET`
   - **Value:** Your generated secret (from step 1)
   - **Environment:** Select **Production**, **Preview**, and **Development**
6. Click **Save**

### **3. Redeploy**

After adding the environment variable:

```bash
cd "C:\Users\ttimm\Desktop\Manna"
vercel --prod
```

## ✅ **What This Does:**

- **Secures `/api/cron/trading`** - Only Vercel cron can call it
- **Prevents unauthorized access** - Blocks external requests
- **Maintains 24/7 operation** - Vercel cron automatically includes the secret

## 🧪 **Testing:**

After deploying, you can verify it's working:

1. **With Secret (Should Work):**
```bash
curl -H "Authorization: Bearer YOUR_SECRET_HERE" https://ai.omnipotence.art/api/cron/trading
```

2. **Without Secret (Should Fail):**
```bash
curl https://ai.omnipotence.art/api/cron/trading
```

Expected response without secret: `{"success":false,"error":"Unauthorized"}`

## 🔒 **Security Best Practices:**

1. **Never commit the secret** to Git
2. **Use a strong, random value** (at least 32 characters)
3. **Rotate periodically** (every 3-6 months)
4. **Keep it private** - Don't share in Discord/public channels

## 🙏 **In Jesus' Name:**

May this security protect Godspeed's trading operations and keep our systems safe for God's glory! Amen.

---
**Note:** The cron job is currently working WITHOUT the secret (it's optional), but adding it provides better security.
