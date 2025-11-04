# 🚀 Quick Commands Reference

## Most Important Commands

---

## 🔍 **System Audit (Check Everything)**

```powershell
.\system_audit.ps1
```

**Checks:**
- Server status
- Database (optional)
- Agent Runner (REQUIRED)
- Startup status
- Ollama (REQUIRED)
- DeepSeek R1 model
- API configuration
- Circuit breakers
- Trading config (MVP)

---

## 🚀 **Start Trading System**

```powershell
cd C:\Users\ttimm\Desktop\Manna
npm run dev
```

**Make sure Ollama is running first!**

---

## 🧠 **Start Ollama**

```powershell
ollama serve
```

**Keep this terminal open!**

**Wait 60 seconds before starting server** (for model to load)

---

## ✅ **Check Ollama Status**

```powershell
.\check_ollama.ps1
```

**Or manually:**
```powershell
Invoke-WebRequest -Uri "http://localhost:11434/api/tags" -UseBasicParsing
```

---

## 📊 **Check Agent Runner**

```powershell
Invoke-WebRequest -Uri "http://localhost:3001/api/agent-runner?action=status" -UseBasicParsing
```

---

## 🏥 **Check Server Health**

```powershell
Invoke-WebRequest -Uri "http://localhost:3001/api/health" -UseBasicParsing
```

---

## 🔄 **Initialize Services**

```powershell
Invoke-WebRequest -Uri "http://localhost:3001/api/startup?action=initialize" -UseBasicParsing
```

---

## 🧪 **Test DeepSeek R1 Chat**

```powershell
$body = @{
    model = "deepseek-r1:14b"
    messages = @(@{ role = "user"; content = "Test" })
    stream = $false
    options = @{ num_predict = 10 }
} | ConvertTo-Json

Invoke-WebRequest -Uri "http://localhost:11434/api/chat" -Method POST -Body $body -ContentType "application/json" -UseBasicParsing -TimeoutSec 60
```

---

## 🛑 **Stop Everything**

```powershell
.\restart_fresh.ps1
```

**Or manually:**
```powershell
taskkill /F /IM node.exe /T
taskkill /F /IM ollama.exe /T
```

---

## 📥 **Install DeepSeek R1 Model**

```powershell
ollama pull deepseek-r1:14b
```

**Takes 10-20 minutes**

---

## 🌐 **Open Dashboard**

**Browser:**
```
http://localhost:3001
```

---

## 📋 **Most Common Workflow**

### Terminal 1: Start Ollama
```powershell
ollama serve
```

### Wait 60 seconds (for model to load)

### Terminal 2: Start Server
```powershell
cd C:\Users\ttimm\Desktop\Manna
npm run dev
```

### Check Status
```powershell
.\system_audit.ps1
```

---

## 🎯 **Quick Status Check**

```powershell
# All-in-one check
.\system_audit.ps1
```

**This checks everything at once!**

