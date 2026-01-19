# Common Components Feature Catalogue (Prototype)

A simple server-side rendered UI for browsing, searching, filtering, and comparing HMCTS Common Components features. Built per project guardrails: Express + Nunjucks, GOV.UK Frontend & MoJ Frontend, SQLite, SSR only.

## Quick Start

1. Ensure Node.js 18+ is installed.
2. From the project folder, install dependencies:

```bash
npm install
```

3. Import data from `Catalogue.xlsx` into SQLite:

```bash
npm run import
```

4. Start the server:

```bash
npm start
```

5. Open the prototype in your browser:

- http://localhost:3000/features

## Features
- Browse features by component, user role, and service type
- Keyword search across features, descriptions, user stories, and IDs
- Pagination for large lists (20 per page)
- Compare selected features in a table view
- Feature detail page with user story and dependencies

## Notes
- Service type defaults to `All` for MVP; can be extended later
- Dependencies are illustrative (static mapping) and can be refined with component teams
- Follows GOV.UK Design System patterns and MoJ frontend components

## Troubleshooting
- If the server fails to start, ensure `npm run import` completed and `data/catalogue.db` exists
- If assets don’t load, verify static paths in `server.js`

## License
Internal prototype only
