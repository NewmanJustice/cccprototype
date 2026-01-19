# HMCTS Common Components Catalogue - Prototype Setup

This is a clean deployment package of the Common Components Catalogue prototype. It contains all necessary files to run the application with a pre-configured SQLite database.

## Quick Start

### 1. Install Dependencies
```bash
npm install
```

### 2. Initialize Database (First Time Only)
If the database needs to be recreated, run:
```bash
node scripts/create-assessment-tables.js
node scripts/create-legacy-tables.js
```

### 3. Start the Server
```bash
npm start
```

The application will be available at `http://localhost:3000`

## Project Structure

```
prototype/
├── server.js                          # Main Express application
├── component-descriptions.js          # Component metadata and descriptions
├── package.json                       # Dependencies and scripts
├── package-lock.json                  # Locked dependency versions
├── README.md                          # Original project README
├── PROTOTYPE_SETUP.md                 # This file
│
├── data/
│   └── catalogue.db                   # SQLite database with all data
│
├── views/                             # Nunjucks templates
│   ├── layout.njk                     # Base layout
│   ├── admin-*.njk                    # Admin panel templates
│   ├── assessment-*.njk               # Assessment flow templates
│   ├── component*.njk                 # Component listing/detail
│   ├── features.njk                   # Feature browse
│   ├── feature.njk                    # Feature detail
│   ├── compare.njk                    # Feature comparison
│   ├── report.njk                     # Assessment report
│   ├── summary.njk                    # Assessment summary
│   └── walkthrough.njk                # Assessment walkthrough
│
├── public/                            # Static assets
│   ├── govuk-frontend.min.css        # GOV.UK styles
│   ├── govuk-frontend.min.js         # GOV.UK scripts
│   ├── index.scss                    # Custom styles
│   └── javascripts/
│       └── compare.js                # Feature comparison script
│
├── templates/                         # Excel templates for bulk upload
│   ├── Bulk_Upload_Template.xlsx     # Template for adding features
│   └── Full_Feature_Set_Template.xlsx # Template for replacing entire set
│
├── scripts/                           # Setup and maintenance scripts
│   ├── create-assessment-tables.js   # Initialize assessment tables
│   └── create-legacy-tables.js       # Initialize legacy feature tables
│
└── uploads/                           # Temporary storage for uploads (created on first use)
```

## Features

### Public Interface
- **Browse Features** - Search, filter, and view all features organized by component
- **Feature Details** - View comprehensive feature specifications
- **Feature Comparison** - Compare up to 5 features side-by-side
- **Assessments** - Complete guided assessments for your service
  - Start new assessment or resume existing with code
  - Component-by-component walkthrough
  - Summary and reporting

### Admin Panel
**Login**: `/admin/login` (Password: `snowball`)

#### Core Management
- **Components** - Create, edit, delete components
- **Feature Groups** - Organize features into logical groups within components
- **Features** - Full CRUD operations with user role assignment
- **Assessments** - View and manage all assessments with progress tracking

#### Bulk Operations
- **Bulk Upload** - Import multiple features from Excel
  - Auto-generates feature codes
  - Creates feature groups automatically
  - Excel template provided
  
- **Replace All Features** - Replace entire feature set while preserving assessment history
  - Archives old features to legacy sets
  - Marks assessments as legacy (read-only)
  - Maintains assessment data for historical reference

#### Audit & Compliance
- **Audit Log** - Complete history of all create, edit, delete actions
  - View who made changes and when
  - Revert edits to restore previous data
  - Restore accidentally deleted items
  
- **Legacy Features** - View archived feature sets and associated assessments
  - Read-only access to previous versions
  - View which assessments used each legacy set

## Database Schema

### Core Tables
- **features** - All features with metadata, codes, grouping
- **assessments** - User assessments with response tracking
- **assessment_responses** - Individual feature responses per assessment

### Audit & Legacy
- **audit_log** - Complete change history
- **legacy_feature_sets** - Archived feature sets from replacements

## Admin Credentials

- **Username**: Any value (required)
- **Password**: `snowball`
- **Security**: 3 failed attempts triggers 15-minute lockout per IP address

## Excel Templates

Both templates are available in the `templates/` folder for download from the admin panel.

### Bulk Upload Template
- Blue headers (informational)
- Required columns: Component Code, Feature Group Name, Feature Name, Description, User Roles
- Optional columns: I Want..., Expected Outcomes, Service Type
- Auto-generates codes for new feature groups

### Full Replacement Template
- Red headers (warning color)
- Same column structure as bulk upload
- Used for completely replacing the feature set
- Archives all current features to legacy storage

## Development

### Key Dependencies
- **express** - Web framework
- **sqlite3** - Database
- **nunjucks** - Template engine
- **express-session** - Session management
- **multer** - File uploads (Excel)
- **xlsx** - Excel parsing
- **govuk-frontend** - GOV.UK components
- **@ministryofjustice/frontend** - MOJ components

### Environment
- **Node.js**: 14+ recommended
- **Port**: 3000 (configurable via PORT env var)
- **Database**: SQLite (data/catalogue.db)

## Deployment Notes

1. **Database**: SQLite file is included. For production, ensure proper backup procedures.
2. **Uploads**: The `uploads/` folder stores temporary Excel files during bulk operations. Ensure write permissions.
3. **Sessions**: Using in-memory session store. For multi-process deployment, configure external session store.
4. **Static Files**: Public folder is served statically. Consider CDN for production.

## Troubleshooting

### Database Issues
If the database becomes corrupted, recreate it:
```bash
rm data/catalogue.db
node scripts/create-assessment-tables.js
node scripts/create-legacy-tables.js
```

### Port Already in Use
Change the port:
```bash
PORT=3001 npm start
```

### Excel Upload Fails
- Ensure the Excel file matches the template structure
- Check that all required columns are present
- Verify file is not corrupted

## Support

For issues or questions about the prototype, refer to the original README.md or contact the development team.
