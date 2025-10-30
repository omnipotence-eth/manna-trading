# Vercel Deployment Cleanup Guide

## ⚠️ Warning: Deletion is Permanent

Deleting deployments will:
- ❌ Remove all deployment history
- ❌ Remove production/preview URLs
- ❌ Cannot be undone
- ❌ May affect any integrations

## Options

### Option 1: Delete Entire Project (Removes Everything)

```bash
# List all projects
vercel projects ls

# Delete a specific project
vercel projects rm manna-trading

# Or delete with confirmation
vercel projects rm manna-trading --yes
```

### Option 2: Delete Individual Deployments

```bash
# List deployments with IDs
vercel ls --debug

# Delete specific deployment
vercel rm <deployment-url>

# Example:
vercel rm https://manna-trading-41fen1xoy-tremayne-timms-projects.vercel.app
```

### Option 3: Disable Project (Safer - Keeps History)

```bash
# Use Vercel dashboard: Settings → Delete Project
# Or disable via API
```

## Recommended: Delete Project Entirely

Since you want to start fresh and test locally:

1. **Delete the project** (removes all deployments)
2. **Test locally** with version 3.0
3. **Create new project** when ready for deployment

## Commands

```bash
# 1. List projects to confirm name
vercel projects ls

# 2. Delete project (replaces all deployments)
vercel projects rm manna-trading --yes

# 3. Verify deletion
vercel projects ls
```

## After Deletion

1. Test version 3.0 locally (`npm run dev`)
2. When ready, create new Vercel project:
   ```bash
   vercel --prod
   ```
3. Configure environment variables in Vercel dashboard
4. Deploy fresh version 3.0

