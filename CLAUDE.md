# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

HMCTS Common Components Feature Catalogue - A server-side rendered web application for browsing, comparing, and assessing common components across HMCTS services. Built with Express, Nunjucks, GOV.UK Frontend, and SQLite.

## Essential Commands

**Setup and Development:**
```bash
cd prototype
npm install              # Install dependencies
npm start               # Start server on http://localhost:3000
npm run import          # Import data from Catalogue.xlsx to SQLite (requires xlsx file)
```

**Database Scripts:**
```bash
node scripts/create-assessment-tables.js    # Create assessment tables
node scripts/create-legacy-tables.js        # Create legacy feature tables
```

## Architecture

### Technology Stack
- **Backend**: Express.js (server-side rendering only, no client-side framework)
- **Templating**: Nunjucks (.njk files)
- **Database**: SQLite (data/catalogue.db)
- **UI Framework**: GOV.UK Frontend 5.3.0 + MoJ Frontend 1.8.1
- **File Processing**: XLSX for Excel imports, Multer for uploads

### Project Structure
```
prototype/
├── server.js                   # Main Express app (~2000 lines, all routes defined here)
├── component-descriptions.js   # Component metadata for assessment journey
├── views/                      # Nunjucks templates (32 files)
│   ├── admin-*.njk            # Admin panel templates (19 files)
│   ├── assessment-*.njk       # Assessment journey templates
│   ├── features.njk           # Main feature listing
│   ├── compare.njk            # Feature comparison view
│   └── layout.njk             # Base layout template
├── public/                     # Static assets
│   ├── javascripts/compare.js # Client-side comparison logic
│   └── govuk-frontend/        # GOV.UK Frontend assets
├── data/
│   └── catalogue.db           # SQLite database
├── scripts/                   # Database setup scripts
├── templates/                 # Excel templates for bulk operations
└── uploads/                   # Temporary upload directory
```

### Database Schema

**Core Tables:**
- `features` - All component features (component_code, feature_name, unique_id, etc.)
- `assessments` - Assessment sessions (code, user_name, service_name, service_type)
- `assessment_responses` - User responses per feature per assessment
- `audit_log` - Complete audit trail (action_type, entity_type, old_data, new_data, username)
- `legacy_feature_sets` - Historical snapshots of feature sets with replaced_at timestamp

**Key Fields:**
- Features use `unique_id` as primary identifier (format: COMPONENT-GROUP-ID)
- Components identified by `component_code` (ACM, BKP, CCD, DOC, etc.)
- Features grouped by `feature_group_code`

## Authentication & Authorization

**Public Access:**
- Simple login page at `/login` with access code
- Session-based authentication (no HTTP Basic Auth)
- Access code: `PUBLIC_ACCESS_CODE` environment variable (defaults to `DOCS_PASS` or 'prototype2026')
- All routes except `/login` and `/health` require authentication
- Users redirected to `/login` if not authenticated
- Logout available at `/logout` (also in header navigation)
- Session tracking in `req.session.loggedIn`

**Admin Panel:**
- Separate admin authentication at `/admin/login`
- Password: `ADMIN_PASSWORD` environment variable (default: 'snowball')
- Session-based with 1-hour timeout
- IP-based lockout: 3 failed attempts = 15 minute lockout
- Session tracking in `req.session.adminLoggedIn`

## Key Routes & Features

**Public Routes:**
- `/` - Redirects to /features
- `/features` - Browse/search features with filters (component, role, service type, keyword)
- `/feature/:id` - Single feature detail page
- `/compare?ids=X,Y,Z` - Compare up to 5 features
- `/components` - List all components
- `/component/:code` - Features by component

**Assessment Journey:**
- `/assessment/start` - Begin new assessment, generates 6-char code
- `/assessment/:code/walkthrough/:componentCode` - Step-by-step assessment
- `/assessment/:code/summary` - Review all responses
- `/assessment/:code/report` - Final report with CSV export

**Admin Routes (require admin session):**
- `/admin/dashboard` - Admin home with stats
- `/admin/components`, `/admin/features` - CRUD operations
- `/admin/feature-groups` - Manage feature groupings
- `/admin/bulk-upload` - Excel import (uses templates/Bulk_Upload_Template.xlsx)
- `/admin/replace-features` - Full replacement with archival to legacy tables
- `/admin/audit-log` - View/search/revert audit entries
- `/admin/assessments` - View all assessments

## Important Patterns & Conventions

### Query Building
- Search uses parameterized queries for safety
- Filter helpers in `getFilters()` and `buildWhere()` functions
- Pagination: 20 items per page, page parameter in query string

### Audit Logging
- All admin changes logged via `logAuditEvent(actionType, entityType, entityId, oldData, newData, username)`
- Action types: CREATE, UPDATE, DELETE, BULK_UPLOAD, REPLACE_ALL, REVERT
- Entity types: component, feature, feature_group, assessment
- Old/new data stored as JSON strings

### Error Handling
- Database errors return generic "Something went wrong" message to users
- Console logging for debugging (check server logs)
- Form validation errors passed back to templates via `error` variable

### Session Management
- Express-session with secret from `SESSION_SECRET` env var
- Cookie maxAge: 1 hour (3600000ms)
- Admin state stored in `req.session.adminLoggedIn`

## Deployment

### Deployment Approach
This application deploys to **Azure App Service (Linux, code-based)** using **GitHub Actions** with a Publish Profile. This approach avoids Docker, ACR, and container complexity, making it ideal for secured environments.

### Prerequisites
- Azure CLI installed and up to date:
  ```bash
  az version  # Check current version
  az upgrade  # Update if needed
  az login
  ```
- GitHub repo with Express app
- App must listen on `process.env.PORT` (already configured in server.js)

### Key Deployment Requirements
- `.github/workflows` must live at repo root
- Deploy subfolder (`prototype/`), not repo root, in monorepo setup
- Publish profile secret must be a repository secret
- Static assets must be explicitly served (already configured)

### Step-by-Step Azure Deployment

**1. Define Variables**
```bash
# Azure
RG="CFT-software-engineering"
LOCATION="uksouth"

# App Service
PLAN_NAME="hmctsdesignsystem-plan"
WEBAPP_NAME="hmctsdesignsystem-code"   # must be globally unique

# Runtime
RUNTIME="NODE:20-lts"

# Monorepo path (folder containing package.json)
APP_DIR="prototype"

# (Optional) Set subscription:
az account set --subscription <SUBSCRIPTION_ID>
```

**2. Create App Service Plan (Linux)**
```bash
az appservice plan create \
  --name "$PLAN_NAME" \
  --resource-group "$RG" \
  --location "$LOCATION" \
  --is-linux \
  --sku B1
```

**3. Create Code-Based Linux Web App (NOT container)**
```bash
az webapp create \
  --resource-group "$RG" \
  --plan "$PLAN_NAME" \
  --name "$WEBAPP_NAME" \
  --runtime "$RUNTIME"

# Verify it is not container-based
az webapp show \
  --name "$WEBAPP_NAME" \
  --resource-group "$RG" \
  --query "{kind:kind, linuxFxVersion:siteConfig.linuxFxVersion}" \
  -o json
```
Expected: `kind` includes `app,linux` and `linuxFxVersion` is NOT `DOCKER|...`

**4. Enable SCM Basic Authentication**
⚠️ **Critical**: Without this step, you will get `401 Unauthorized` errors during deployment.
```bash
# Enable Basic Auth for SCM (deployment)
az resource update \
  --resource-group "$RG" \
  --name scm \
  --namespace Microsoft.Web \
  --resource-type basicPublishingCredentialsPolicies \
  --parent sites/"$WEBAPP_NAME" \
  --set properties.allow=true

# Enable Basic Auth for FTP
az resource update \
  --resource-group "$RG" \
  --name ftp \
  --namespace Microsoft.Web \
  --resource-type basicPublishingCredentialsPolicies \
  --parent sites/"$WEBAPP_NAME" \
  --set properties.allow=true
```

**5. Configure Environment Variables**
⚠️ **Critical**: Set all required environment variables BEFORE first deployment.
```bash
az webapp config appsettings set \
  --name "$WEBAPP_NAME" \
  --resource-group "$RG" \
  --settings \
    NODE_ENV=production \
    PUBLIC_ACCESS_CODE="your-access-code" \
    ADMIN_PASSWORD="your-admin-password" \
    SESSION_SECRET="$(openssl rand -base64 32)"
```

Required environment variables:
- `PUBLIC_ACCESS_CODE` (optional, defaults to 'prototype2026') - Simple login access code for public users
- `ADMIN_PASSWORD` (optional, defaults to 'snowball') - Admin panel password
- `SESSION_SECRET` (optional) - Session encryption secret (recommended for production)
- `PORT` (automatically set by Azure) - Port the app should listen on

**Legacy environment variables** (for backwards compatibility):
- `DOCS_PASS` - If `PUBLIC_ACCESS_CODE` is not set, this will be used as the public access code
- `DOCS_USER` - No longer used (HTTP Basic Auth removed)

**6. Download Publish Profile**
⚠️ **Security**: DO NOT commit this file. Treat it like a password.
```bash
az webapp deployment list-publishing-profiles \
  --name "$WEBAPP_NAME" \
  --resource-group "$RG" \
  --xml > publishProfile.xml
```

Add to `.gitignore`:
```bash
echo "publishProfile.xml" >> .gitignore
git add .gitignore
git commit -m "Ignore Azure publish profile"
```

Copy to clipboard (Mac):
```bash
pbcopy < publishProfile.xml
```

**7. Add Publish Profile to GitHub Secrets**
1. Go to Repo → Settings → Secrets and variables → Actions
2. Click "New repository secret"
3. Name: `AZURE_WEBAPP_PUBLISH_PROFILE`
4. Value: paste the full XML content from publishProfile.xml

**8. GitHub Actions Workflow**
The workflow is already configured at `.github/workflows/deploy.yml`:
```yaml
name: Deploy to Azure Web App

on:
  push:
    branches: ["main"]
  workflow_dispatch:

jobs:
  build-and-deploy:
    runs-on: ubuntu-latest

    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Setup Node
        uses: actions/setup-node@v4
        with:
          node-version: "20"
          cache: "npm"
          cache-dependency-path: prototype/package-lock.json

      - name: Install dependencies
        working-directory: prototype
        run: npm ci

      - name: Build (if present)
        working-directory: prototype
        run: npm run build --if-present

      - name: Deploy to Azure Web App
        uses: azure/webapps-deploy@v3
        with:
          publish-profile: ${{ secrets.AZURE_WEBAPP_PUBLISH_PROFILE }}
          package: prototype
```

Note: The `app-name` parameter is optional since the publish profile already contains this information.

**9. Enable and Monitor Logs**
```bash
# Enable application logging
az webapp log config \
  --name "$WEBAPP_NAME" \
  --resource-group "$RG" \
  --application-logging filesystem

# Tail logs in real-time
az webapp log tail \
  --name "$WEBAPP_NAME" \
  --resource-group "$RG"

# Restart app if needed
az webapp restart \
  --name "$WEBAPP_NAME" \
  --resource-group "$RG"
```

**10. Verify Deployment**
```bash
# Check if app is running
az webapp show \
  --name "$WEBAPP_NAME" \
  --resource-group "$RG" \
  --query "state" -o tsv

# Verify runtime configuration
az webapp show \
  --name "$WEBAPP_NAME" \
  --resource-group "$RG" \
  --query "siteConfig.linuxFxVersion" -o tsv
```
Expected: `NODE|20-lts`

### Health Check
- Endpoint: `/health`
- Returns: `{"status": "healthy", "timestamp": "..."}`
- No authentication required
- Use this for Azure health probes and monitoring

### Troubleshooting
For detailed troubleshooting of common deployment issues (API version errors, 401 unauthorized, publish profile errors, missing environment variables, CSS/asset loading issues), see the comprehensive guide at:
**`DeployingToAzure/README.md`**

Common issues covered:
- Outdated Azure CLI causing API version errors
- Missing resource group in URI
- 401 Unauthorized during deployment (SCM auth not enabled)
- Invalid publish profile errors
- App crashes on startup due to missing environment variables
- CSS/static assets not loading (MIME type issues)

## Working with Features

When modifying routes or adding features:
1. All routes are in `server.js` - it's a single-file Express app
2. Add/modify templates in `views/` directory
3. Use Nunjucks macro imports from GOV.UK Frontend: `{% from "govuk/components/button/macro.njk" import govukButton %}`
4. Static assets go in `public/`
5. Database changes require manual SQLite schema updates (no migrations framework)
6. Always use parameterized queries (`?` placeholders) to prevent SQL injection
7. Audit log all admin data changes using the `logAuditEvent` helper

## Testing Notes

No automated test suite exists. Manual testing workflow:
1. Start server: `npm start`
2. Test public features at `http://localhost:3000/features`
3. Test admin at `http://localhost:3000/admin/login` (password: snowball)
4. Check database: `sqlite3 data/catalogue.db`

## Common Gotchas

- **Port conflicts**: Default port 3000, override with `PORT` env var
- **Missing database**: Run `npm run import` if catalogue.db doesn't exist (requires Catalogue.xlsx)
- **Node modules**: GOV.UK Frontend paths are served from node_modules, don't delete them in deployed environments
- **File uploads**: Uploads go to `uploads/` directory, cleaned up after processing
- **Nunjucks caching**: Set to `noCache: true` in development, consider enabling for production
