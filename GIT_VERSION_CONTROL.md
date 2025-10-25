# 🔄 Git Version Control Guide - Manna Arena AI

**Repository:** https://github.com/omnipotence-eth/manna-trading  
**Current Version:** v2.0.0  
**Status:** ✅ Pushed to GitHub

---

## 📋 Version History

### v2.0.0 (Current) - October 25, 2025
**Tag:** `v2.0.0`  
**Commit:** `fa26a7f`  
**Status:** ✅ Production Ready

**Features:**
- ✅ 100% margin utilization
- ✅ Dynamic maximum leverage (20x-50x)
- ✅ Real performance chart (actual trade history)
- ✅ NOF1 dashboard layout
- ✅ 90% faster market analysis
- ✅ 5,300+ lines of dead code removed

### v1.0.0 (Previous) - Before October 2025
**Tag:** *Not tagged yet*  
**Status:** Can be created for rollback

**Features:**
- Multi-model support
- 25-50% margin usage
- Fixed 20x leverage
- Original dashboard layout
- Simulated chart data

---

## 🚀 Using Version Control

### View All Versions

```bash
# List all tags
git tag -l

# View tag details
git show v2.0.0

# View commit history
git log --oneline --graph --decorate
```

### Switch Versions

#### Switch to v2.0.0 (Current)
```bash
cd "C:\Users\ttimm\Desktop\Manna"

# Checkout v2.0.0
git checkout v2.0.0

# Install dependencies
npm install

# Run
npm run dev
```

#### Rollback to Previous Version (if needed)
```bash
# View previous commits
git log --oneline

# Checkout a specific commit (before v2.0.0)
git checkout a5eb965  # Example commit hash

# Or create v1.0.0 tag from previous commit
git tag -a v1.0.0 a5eb965 -m "Version 1.0.0 - Original Config"
git push origin v1.0.0

# Then checkout v1.0.0
git checkout v1.0.0
```

### Return to Latest Version

```bash
# Go back to main branch (latest)
git checkout main

# Or checkout latest tag
git checkout v2.0.0
```

---

## 🔖 Creating New Versions

### For Future Updates (v2.1.0, v3.0.0, etc.)

```bash
# Make your changes...
# Test thoroughly...

# Stage all changes
git add -A

# Commit with descriptive message
git commit -m "Release v2.1.0 - Description of changes"

# Create annotated tag
git tag -a v2.1.0 -m "Version 2.1.0 - Feature description"

# Push to GitHub
git push origin main
git push origin v2.1.0

# Update VERSION file
echo "2.1.0" > VERSION
git add VERSION
git commit -m "Update VERSION to 2.1.0"
git push origin main
```

### Version Numbering (Semantic Versioning)

**Format:** `MAJOR.MINOR.PATCH` (e.g., 2.0.0)

- **MAJOR** (2.x.x): Breaking changes, major redesigns
  - Example: v1.0.0 → v2.0.0 (removed multi-model support)
  
- **MINOR** (x.1.x): New features, no breaking changes
  - Example: v2.0.0 → v2.1.0 (add new indicator)
  
- **PATCH** (x.x.1): Bug fixes, small improvements
  - Example: v2.0.0 → v2.0.1 (fix chart rendering bug)

---

## 🔄 Branching Strategy

### Main Branch (Production)
```bash
# Main branch = stable, production-ready code
git checkout main
```

### Feature Branches
```bash
# Create feature branch
git checkout -b feature/new-indicator

# Make changes...
# Test...

# Merge back to main
git checkout main
git merge feature/new-indicator

# Push
git push origin main
```

### Hotfix Branches
```bash
# Create hotfix branch
git checkout -b hotfix/critical-bug

# Fix bug...
# Test...

# Merge to main
git checkout main
git merge hotfix/critical-bug

# Create patch version
git tag -a v2.0.1 -m "Hotfix: Critical bug"
git push origin main v2.0.1
```

---

## 📊 Comparing Versions

### View Differences Between Versions

```bash
# Compare v1.0.0 and v2.0.0
git diff v1.0.0 v2.0.0

# View files changed
git diff --name-only v1.0.0 v2.0.0

# View specific file changes
git diff v1.0.0 v2.0.0 -- services/aiTradingService.ts
```

### View Changelog

```bash
# View commits between versions
git log v1.0.0..v2.0.0 --oneline

# View detailed changelog
git log v1.0.0..v2.0.0 --pretty=format:"%h - %s (%an, %ar)"
```

---

## 💾 Backup and Restore

### Create Backup Branch

```bash
# Create backup of current state
git branch backup-2025-10-25
git push origin backup-2025-10-25

# List all branches
git branch -a
```

### Restore from Backup

```bash
# Checkout backup branch
git checkout backup-2025-10-25

# Or merge backup into main
git checkout main
git merge backup-2025-10-25
```

---

## 🎯 Common Workflows

### Workflow 1: Test v2.0.0 → Rollback if Needed

```bash
# 1. Test v2.0.0 in production
git checkout v2.0.0
npm install
npm run build
# ... test thoroughly ...

# 2. If issues found, rollback to previous version
git checkout main~1  # Go back one commit
# OR
git checkout a5eb965  # Specific commit

# 3. Fix issues and create v2.0.1
# ... make fixes ...
git add -A
git commit -m "Hotfix v2.0.1"
git tag -a v2.0.1 -m "Hotfix"
git push origin main v2.0.1
```

### Workflow 2: Switch Between Versions for Testing

```bash
# Terminal 1: Run v2.0.0
git checkout v2.0.0
npm install
npm run dev  # Port 3000

# Terminal 2: Run v1.0.0 (if tagged)
git checkout v1.0.0
npm install
PORT=3001 npm run dev  # Port 3001

# Compare both versions side by side!
```

### Workflow 3: Cherry-Pick Features from v2.0.0 to v1.0.0

```bash
# If you want a specific feature from v2.0.0 in v1.0.0

# 1. Checkout v1.0.0
git checkout v1.0.0

# 2. Create new branch
git checkout -b v1-with-feature

# 3. Cherry-pick specific commit from v2.0.0
git cherry-pick <commit-hash>

# 4. Test and push
git push origin v1-with-feature
```

---

## 🔐 GitHub Repository Management

### Repository URL
```
https://github.com/omnipotence-eth/manna-trading
```

### Clone Repository (Fresh Start)

```bash
# Clone repo
git clone https://github.com/omnipotence-eth/manna-trading.git
cd manna-trading

# Checkout specific version
git checkout v2.0.0

# Install and run
npm install
npm run dev
```

### View on GitHub

- **Releases:** https://github.com/omnipotence-eth/manna-trading/releases
- **Tags:** https://github.com/omnipotence-eth/manna-trading/tags
- **Commits:** https://github.com/omnipotence-eth/manna-trading/commits/main
- **Branches:** https://github.com/omnipotence-eth/manna-trading/branches

---

## 📝 Version Documentation

### Files to Update for Each Version

1. **`VERSION`** - Version number (e.g., "2.0.0")
2. **`package.json`** - `"version": "2.0.0"`
3. **`CHANGELOG.md`** - Add new version section
4. **`README_V2.md`** - Update if major changes

### Documentation Checklist

- [ ] Update VERSION file
- [ ] Update package.json version
- [ ] Add entry to CHANGELOG.md
- [ ] Update README if needed
- [ ] Create git tag
- [ ] Push to GitHub

---

## 🎉 Current Status

### ✅ Version 2.0.0 is Live!

```
✅ Committed: fa26a7f
✅ Tagged: v2.0.0
✅ Pushed to main branch
✅ Pushed tag to GitHub
✅ Documentation complete
```

### Repository Info

```
Repository: https://github.com/omnipotence-eth/manna-trading
Branch: main
Tag: v2.0.0
Commit: fa26a7f
Date: October 25, 2025
```

---

## 🚀 Next Steps

### To Use v2.0.0 in Production

```bash
# On production server
git pull origin main
git checkout v2.0.0
npm install
npm run build
npm start
```

### To Continue Development

```bash
# Stay on main branch
git checkout main

# Make changes...
# Test...

# Commit and push
git add -A
git commit -m "Feature: Description"
git push origin main
```

### To Create v2.0.1 (Patch)

```bash
# Fix bugs...
# Test...

git add -A
git commit -m "Hotfix v2.0.1: Bug description"
git tag -a v2.0.1 -m "Patch: Bug fixes"
git push origin main v2.0.1

# Update VERSION file
echo "2.0.1" > VERSION
git add VERSION
git commit -m "Update VERSION to 2.0.1"
git push origin main
```

---

## 📚 Resources

- **Git Documentation:** https://git-scm.com/doc
- **Semantic Versioning:** https://semver.org/
- **GitHub Guides:** https://guides.github.com/

---

**Version control is set up! You can now safely switch between versions and always rollback if needed! 🎉**

