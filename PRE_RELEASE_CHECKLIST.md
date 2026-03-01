# Pre-Release Checklist

Use this checklist before making the repository public on GitHub.

## Critical (Must Complete)

- [x] ✅ Verify `.env.local` is in `.gitignore`
- [x] ✅ Create `.env.example` template
- [x] ✅ Add `tmp/` to `.gitignore`
- [x] ✅ Fix console statements in components
- [ ] ⏳ Delete log files from `logs/` directory
- [ ] ⏳ Verify `.env.local` is NOT in git history
- [ ] ⏳ Run TypeScript type check (`npx tsc --noEmit`)
- [ ] ⏳ Run linting (`npm run lint`)
- [ ] ⏳ Run build test (`npm run build`)

## Security

- [x] ✅ No hardcoded secrets in source code
- [x] ✅ All API keys use environment variables
- [x] ✅ Created SECURITY.md
- [ ] ⏳ Review API routes for security vulnerabilities
- [ ] ⏳ Verify no sensitive data in error messages

## Documentation

- [x] ✅ Updated README.md (license badge, links)
- [x] ✅ Created CONTRIBUTING.md
- [x] ✅ Created SECURITY.md
- [x] ✅ LICENSE file is MIT
- [ ] ⏳ Review all documentation for accuracy
- [ ] ⏳ Test installation instructions from scratch

## Code Quality

- [x] ✅ TypeScript strict mode enabled
- [x] ✅ ESLint configuration present
- [x] ✅ Fixed console statements
- [ ] ⏳ Fix any TypeScript errors
- [ ] ⏳ Fix any linting errors
- [ ] ⏳ Remove any TODO comments or create issues

## Git Repository

- [ ] ⏳ Check git history for sensitive files
- [ ] ⏳ Clean up commit history if needed
- [ ] ⏳ Create initial release tag
- [ ] ⏳ Write release notes

## Final Steps

- [ ] ⏳ Test full installation from `.env.example`
- [ ] ⏳ Verify all links in README work
- [ ] ⏳ Review CHANGELOG.md
- [ ] ⏳ Create GitHub repository
- [ ] ⏳ Push code to GitHub
- [ ] ⏳ Create initial release

---

## Commands to Run

```bash
# Type check
npx tsc --noEmit

# Lint
npm run lint

# Build
npm run build

# Check for tracked sensitive files
git ls-files | grep -E "\.env|secret|key|credential|password"

# Check git history for .env.local (if found, need to remove)
git log --all --full-history -- .env.local

# Delete log files
rm -rf logs/*.json logs/*.txt

# Test installation
rm -rf node_modules package-lock.json
npm install
cp .env.example .env.local
# Edit .env.local with test values
npm run build
```

---

**Status**: In Progress  
**Last Updated**: 2025-01-XX
