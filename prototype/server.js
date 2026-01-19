const path = require('path');
const express = require('express');
const session = require('express-session');
const nunjucks = require('nunjucks');
const sqlite3 = require('sqlite3').verbose();
const componentDescriptions = require('./component-descriptions');
const multer = require('multer');
const XLSX = require('xlsx');

// Configure multer for file uploads
const upload = multer({ 
  dest: 'uploads/',
  limits: { fileSize: 10 * 1024 * 1024 } // 10MB max
});

const app = express();
const PORT = process.env.PORT || 3000;
const DB_PATH = path.join(__dirname, 'data', 'catalogue.db');

// Admin password and lockout tracking
const ADMIN_PASSWORD = 'snowball';
const loginAttempts = new Map(); // { ip: [{ timestamp: Date, success: boolean }] }

// Session middleware
app.use(session({
  secret: 'hmcts-catalogue-secret-key-2026',
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 3600000 } // 1 hour
}));

// Middleware
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// Static assets: GOV.UK + MOJ
app.use(express.static(path.join(__dirname, 'public')));
app.use('/govuk-frontend', express.static(path.join(__dirname, 'node_modules', 'govuk-frontend', 'dist')));
app.use('/moj-frontend', express.static(path.join(__dirname, 'node_modules', '@ministryofjustice', 'frontend')));

// Views (include GOV.UK & MoJ macro paths)
const viewsPath = path.join(__dirname, 'views');
const govukPath = path.join(__dirname, 'node_modules', 'govuk-frontend');
const mojPath = path.join(__dirname, 'node_modules', '@ministryofjustice', 'frontend');
nunjucks.configure([viewsPath, govukPath, mojPath], {
  autoescape: true,
  express: app,
  noCache: true
});
app.set('view engine', 'njk');

// DB
const db = new sqlite3.Database(DB_PATH);

// Audit logging helper
function logAuditEvent(actionType, entityType, entityId, oldData, newData, username) {
  const oldDataJson = oldData ? JSON.stringify(oldData) : null;
  const newDataJson = newData ? JSON.stringify(newData) : null;
  
  db.run(`INSERT INTO audit_log (action_type, entity_type, entity_id, old_data, new_data, username) 
    VALUES (?, ?, ?, ?, ?, ?)`,
    [actionType, entityType, entityId, oldDataJson, newDataJson, username || 'Unknown'],
    (err) => {
      if (err) {
        console.error('Error logging audit event:', err);
      }
    });
}

// Core user roles (for dropdown filtering)
const CORE_USER_ROLES = [
  'Citizen',
  'Professional User',
  'Caseworker',
  'Judicial Office Holder',
  'System/System Administrator',
  'Finance Administrator',
  'Listing Officer',
  'Bailiff Administrator',
  'HMCTS'
];

// Helpers
function getFilters(req) {
  return {
    q: (req.query.q || '').trim(),
    component: (req.query.component || '').trim(),
    role: (req.query.role || '').trim(),
    serviceType: (req.query.serviceType || '').trim()
  };
}

function buildWhere(filters, params) {
  const where = [];
  if (filters.q) {
    where.push('(feature_name LIKE ? OR description LIKE ? OR i_want LIKE ? OR expected_outcomes LIKE ? OR unique_id LIKE ?)');
    const like = `%${filters.q}%`;
    params.push(like, like, like, like, like);
  }
  if (filters.component) {
    where.push('component_code = ?');
    params.push(filters.component);
  }
  if (filters.role) {
    where.push('as_a LIKE ?');
    params.push(`%${filters.role}%`);
  }
  if (filters.serviceType) {
    where.push('service_type = ?');
    params.push(filters.serviceType);
  }
  return where.length ? 'WHERE ' + where.join(' AND ') : '';
}

// Routes
app.get('/', (req, res) => {
  res.redirect('/features');
});

app.get('/components', (req, res) => {
  db.all(`SELECT component_code, component_name, COUNT(*) as feature_count 
    FROM features 
    GROUP BY component_code, component_name 
    ORDER BY component_code`, [], (err, components) => {
    if (err) return res.status(500).send('Something went wrong. Please try again.');
    res.render('components.njk', { components });
  });
});

app.get('/component/:code', (req, res) => {
  const code = req.params.code;
  db.get('SELECT component_code, component_name FROM features WHERE component_code = ? LIMIT 1', [code], (err, component) => {
    if (err) return res.status(500).send('Something went wrong. Please try again.');
    if (!component) return res.status(404).send('Component not found');
    db.all('SELECT * FROM features WHERE component_code = ? ORDER BY feature_group_code, feature_id', [code], (err2, items) => {
      if (err2) return res.status(500).send('Something went wrong. Please try again.');
      res.render('component.njk', { component, items });
    });
  });
});

app.get('/features', (req, res) => {
  const filters = getFilters(req);
  const params = [];
  const where = buildWhere(filters, params);
  const page = Math.max(parseInt(req.query.page || '1', 10), 1);
  const pageSize = 20;
  const offset = (page - 1) * pageSize;

  db.all(`SELECT COUNT(*) as cnt FROM features ${where}`, params, (err, rows) => {
    if (err) return res.status(500).send('Something went wrong. Please try again.');
    const total = rows[0].cnt;
    db.all(`SELECT * FROM features ${where} ORDER BY component_code, feature_group_code, feature_id LIMIT ? OFFSET ?`, [...params, pageSize, offset], (err2, items) => {
      if (err2) return res.status(500).send('Something went wrong. Please try again.');
      db.all('SELECT DISTINCT component_code, component_name FROM features ORDER BY component_code', [], (e3, components) => {
        if (e3) return res.status(500).send('Something went wrong. Please try again.');
        // Get all roles from database, then filter to only show core roles
        db.all('SELECT DISTINCT as_a FROM features ORDER BY as_a', [], (e4, allRoles) => {
          if (e4) return res.status(500).send('Something went wrong. Please try again.');
          const roleSet = new Set(allRoles.map(r => r.as_a));
          const roles = CORE_USER_ROLES.filter(r => roleSet.has(r)).map(r => ({ as_a: r }));
          db.all('SELECT DISTINCT service_type FROM features ORDER BY service_type', [], (e5, serviceTypes) => {
            if (e5) return res.status(500).send('Something went wrong. Please try again.');
            res.render('features.njk', {
              items,
              total,
              page,
              pageSize,
              pages: Math.ceil(total / pageSize),
              filters,
              components,
              roles,
              serviceTypes
            });
          });
        });
      });
    });
  });
});

app.get('/feature/:id', (req, res) => {
  db.get('SELECT * FROM features WHERE unique_id = ?', [req.params.id], (err, row) => {
    if (err) return res.status(500).send('Something went wrong. Please try again.');
    if (!row) return res.status(404).send('Feature not found');
    res.render('feature.njk', { item: row });
  });
});

app.get('/compare', (req, res) => {
  const rawIds = (req.query.ids || '').split(',').map(s => s.trim()).filter(Boolean);
  const ids = [];
  rawIds.forEach(id => {
    if (id && !ids.includes(id)) ids.push(id);
  });

  if (ids.length === 0) return res.redirect('/features');

  const errors = [];
  if (ids.length > 5) {
    errors.push('You can compare up to 5 features. Only the first 5 have been used.');
  }

  const selectedIds = ids.slice(0, 5);
  if (selectedIds.length < 2) {
    errors.push('Select at least two features to compare.');
  }

  const placeholders = selectedIds.map(() => '?').join(',');
  const query = selectedIds.length ? `SELECT * FROM features WHERE unique_id IN (${placeholders}) ORDER BY component_code, feature_group_code, feature_id` : null;

  if (!query) {
    return res.render('compare.njk', { items: [], errors });
  }

  db.all(query, selectedIds, (err, rows) => {
    if (err) return res.status(500).send('Something went wrong. Please try again.');

    if (rows.length < selectedIds.length) {
      errors.push('One or more selected features could not be found.');
    }

    res.render('compare.njk', { items: rows, errors });
  });
});

// Assessment routes
function generateCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

app.get('/assessment/start', (req, res) => {
  db.all('SELECT component_code, component_name, COUNT(*) as feature_count FROM features GROUP BY component_code ORDER BY component_code', [], (err, components) => {
    if (err) return res.status(500).send('Something went wrong. Please try again.');
    const totalFeatures = components.reduce((sum, c) => sum + c.feature_count, 0);
    res.render('assessment-start.njk', { componentCount: components.length, featureCount: totalFeatures });
  });
});

app.post('/assessment/start', (req, res) => {
  console.log('POST /assessment/start received');
  console.log('Request body:', req.body);
  const { user_name, service_name, service_type } = req.body;
  if (!user_name || !service_name || !service_type) {
    console.log('Validation failed - missing fields');
    return res.render('assessment-start.njk', { error: 'All fields are required', data: req.body });
  }
  
  const code = generateCode();
  console.log('Generated code:', code);
  db.run(`INSERT INTO assessments (code, user_name, service_name, service_type) VALUES (?, ?, ?, ?)`,
    [code, user_name, service_name, service_type], function(err) {
      if (err) {
        console.error('Error inserting assessment:', err);
        return res.status(500).send('Something went wrong. Please try again.');
      }
      console.log('Assessment inserted with ID:', this.lastID);
      // Get the first component and redirect to it
      db.get('SELECT component_code FROM features ORDER BY component_code LIMIT 1', [], (err2, row) => {
        if (err2 || !row) return res.status(500).send('Something went wrong. Please try again.');
        res.redirect(`/assessment/${this.lastID}/intro/${row.component_code}`);
      });
    });
});

app.get('/assessment/:id/intro/:code', (req, res) => {
  const assessmentId = req.params.id;
  const componentCode = req.params.code;
  
  db.get('SELECT * FROM assessments WHERE id = ?', [assessmentId], (err, assessment) => {
    if (err || !assessment) return res.status(404).send('Assessment not found');
    
    db.all('SELECT DISTINCT component_code FROM features ORDER BY component_code', [], (err1, allComponents) => {
      if (err1) return res.status(500).send('Something went wrong. Please try again.');
      
      const componentIndex = allComponents.findIndex(c => c.component_code === componentCode);
      const componentNumber = componentIndex + 1;
      const totalComponents = allComponents.length;
      const prevCode = componentIndex > 0 ? allComponents[componentIndex - 1].component_code : null;
      
      db.get('SELECT component_code, component_name, COUNT(*) as feature_count FROM features WHERE component_code = ? GROUP BY component_code, component_name', [componentCode], (err2, component) => {
        if (err2 || !component) return res.status(404).send('Component not found');
        
        const description = componentDescriptions[componentCode] || {};
        res.render('component-intro.njk', { 
          assessment, 
          component, 
          componentCode, 
          componentNumber, 
          totalComponents,
          prevCode,
          description
        });
      });
    });
  });
});

app.get('/assessment/:id/walkthrough/:code', (req, res) => {
  const assessmentId = req.params.id;
  const componentCode = req.params.code;
  
  db.get('SELECT * FROM assessments WHERE id = ?', [assessmentId], (err, assessment) => {
    if (err || !assessment) return res.status(404).send('Assessment not found');
    
    db.all('SELECT DISTINCT component_code FROM features ORDER BY component_code', [], (err1, allComponents) => {
      if (err1) return res.status(500).send('Something went wrong. Please try again.');
      
      const componentIndex = allComponents.findIndex(c => c.component_code === componentCode);
      const componentNumber = componentIndex + 1;
      const totalComponents = allComponents.length;
      
      db.get('SELECT component_name FROM features WHERE component_code = ? LIMIT 1', [componentCode], (err1b, comp) => {
        if (err1b) return res.status(500).send('Something went wrong. Please try again.');
        
        db.all('SELECT * FROM features WHERE component_code = ? ORDER BY feature_group_code, feature_id', [componentCode], (err2, features) => {
          if (err2) return res.status(500).send('Something went wrong. Please try again.');
          
          db.all('SELECT * FROM assessment_responses WHERE assessment_id = ? AND component_code = ?', [assessmentId, componentCode], (err3, responses) => {
            if (err3) return res.status(500).send('Something went wrong. Please try again.');
            
            const responseMap = {};
            responses.forEach(r => { responseMap[r.feature_id] = r.response; });
            
            res.render('walkthrough.njk', { 
              assessment, 
              componentCode, 
              componentName: comp.component_name,
              features, 
              responseMap,
              componentNumber,
              totalComponents
            });
          });
        });
      });
    });
  });
});

app.post('/assessment/:id/walkthrough/:code', (req, res) => {
  const assessmentId = req.params.id;
  const componentCode = req.params.code;
  const action = req.body.action || 'next';
  const responses = { ...req.body };
  delete responses.action; // Remove action from responses
  
  db.serialize(() => {
    db.run('DELETE FROM assessment_responses WHERE assessment_id = ? AND component_code = ?', [assessmentId, componentCode]);
    
    const stmt = db.prepare('INSERT INTO assessment_responses (assessment_id, component_code, feature_id, response) VALUES (?, ?, ?, ?)');
    for (const [featureId, response] of Object.entries(responses)) {
      stmt.run(assessmentId, componentCode, featureId, response);
    }
    stmt.finalize();
    
    db.run('UPDATE assessments SET updated_at = CURRENT_TIMESTAMP WHERE id = ?', [assessmentId], () => {
      if (action === 'summary') {
        // User wants to go directly to summary
        res.redirect(`/assessment/${assessmentId}/summary`);
      } else {
        // Find the next component
        db.all('SELECT DISTINCT component_code FROM features ORDER BY component_code', [], (err, allComponents) => {
          if (err) return res.status(500).send('Something went wrong. Please try again.');
          
          const componentIndex = allComponents.findIndex(c => c.component_code === componentCode);
          if (componentIndex < allComponents.length - 1) {
            // Go to next component
            const nextCode = allComponents[componentIndex + 1].component_code;
            res.redirect(`/assessment/${assessmentId}/intro/${nextCode}`);
          } else {
            // Last component, go to summary
            res.redirect(`/assessment/${assessmentId}/summary`);
          }
        });
      }
    });
  });
});

app.get('/assessment/:id/summary', (req, res) => {
  const assessmentId = req.params.id;
  
  db.get('SELECT * FROM assessments WHERE id = ?', [assessmentId], (err, assessment) => {
    if (err || !assessment) return res.status(404).send('Assessment not found');
    
    // Get all components
    db.all('SELECT DISTINCT component_code as code, component_name as name, COUNT(*) as feature_count FROM features GROUP BY component_code, component_name ORDER BY component_code', [], (err0, allComponents) => {
      if (err0) return res.status(500).send('Something went wrong. Please try again.');
      
      db.all(`
        SELECT ar.component_code, f.component_name, ar.response, COUNT(*) as count
        FROM assessment_responses ar
        JOIN features f ON ar.component_code = f.component_code AND ar.feature_id = f.unique_id
        WHERE ar.assessment_id = ?
        GROUP BY ar.component_code, f.component_name, ar.response
      `, [assessmentId], (err2, stats) => {
        if (err2) return res.status(500).send('Something went wrong. Please try again.');
        
        const componentStats = [];
        const statsMap = {};
        const assessedCodes = new Set();
        
        stats.forEach(s => {
          assessedCodes.add(s.component_code);
          if (!statsMap[s.component_code]) {
            statsMap[s.component_code] = {
              code: s.component_code,
              name: s.component_name,
              yes: 0,
              no: 0,
              maybe: 0
            };
            componentStats.push(statsMap[s.component_code]);
          }
          statsMap[s.component_code][s.response] = s.count;
        });
        
        // Find components not yet assessed
        const notAssessed = allComponents.filter(c => !assessedCodes.has(c.code));
        
        res.render('summary.njk', { assessment, componentStats, notAssessed });
      });
    });
  });
});

app.get('/assessment/:id/report', (req, res) => {
  const assessmentId = req.params.id;
  
  db.get('SELECT * FROM assessments WHERE id = ?', [assessmentId], (err, assessment) => {
    if (err || !assessment) return res.status(404).send('Assessment not found');
    
    // Get all components with features and responses
    db.all(`
      SELECT 
        f.component_code,
        f.component_name,
        f.unique_id,
        f.feature_name,
        f.description,
        f.as_a,
        f.i_want,
        f.expected_outcomes,
        ar.response
      FROM features f
      LEFT JOIN assessment_responses ar ON f.unique_id = ar.feature_id AND ar.assessment_id = ?
      ORDER BY f.component_code, f.feature_group_code, f.feature_id
    `, [assessmentId], (err2, rows) => {
      if (err2) return res.status(500).send('Something went wrong. Please try again.');
      
      // Group by component
      const components = [];
      let currentComponent = null;
      
      rows.forEach(row => {
        if (!currentComponent || currentComponent.code !== row.component_code) {
          currentComponent = {
            code: row.component_code,
            name: row.component_name,
            features: []
          };
          components.push(currentComponent);
        }
        currentComponent.features.push({
          id: row.unique_id,
          name: row.feature_name,
          description: row.description,
          as_a: row.as_a,
          i_want: row.i_want,
          expected_outcomes: row.expected_outcomes,
          response: row.response || 'Not answered'
        });
      });
      
      res.render('report.njk', { assessment, components });
    });
  });
});

app.get('/assessment/:id/export-csv', (req, res) => {
  const assessmentId = req.params.id;
  
  db.get('SELECT * FROM assessments WHERE id = ?', [assessmentId], (err, assessment) => {
    if (err || !assessment) return res.status(404).send('Assessment not found');
    
    db.all(`
      SELECT 
        f.component_code,
        f.component_name,
        f.unique_id,
        f.feature_name,
        f.description,
        ar.response
      FROM features f
      LEFT JOIN assessment_responses ar ON f.unique_id = ar.feature_id AND ar.assessment_id = ?
      ORDER BY f.component_code, f.feature_group_code, f.feature_id
    `, [assessmentId], (err2, rows) => {
      if (err2) return res.status(500).send('Something went wrong. Please try again.');
      
      // Generate CSV
      let csv = 'Component Code,Component Name,Feature ID,Feature Name,Description,Response\n';
      rows.forEach(row => {
        const escapeCsv = (str) => `"${(str || '').replace(/"/g, '""')}"`;
        csv += `${escapeCsv(row.component_code)},${escapeCsv(row.component_name)},${escapeCsv(row.unique_id)},${escapeCsv(row.feature_name)},${escapeCsv(row.description)},${escapeCsv(row.response || 'Not answered')}\n`;
      });
      
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="assessment-${assessment.code}-${Date.now()}.csv"`);
      res.send(csv);
    });
  });
});

app.get('/assessment/resume', (req, res) => {
  res.render('assessment-resume.njk');
});

app.post('/assessment/resume', (req, res) => {
  const { code } = req.body;
  if (!code) {
    return res.render('assessment-resume.njk', { error: 'Code is required' });
  }
  
  db.get('SELECT id FROM assessments WHERE code = ?', [code], (err, row) => {
    if (err) return res.status(500).send('Something went wrong. Please try again.');
    if (!row) return res.render('assessment-resume.njk', { error: 'Code not found', code });
    res.redirect(`/assessment/${row.id}/summary`);
  });
});

// Admin authentication helpers
function isLockedOut(ip) {
  const attempts = loginAttempts.get(ip) || [];
  const fiveMinutesAgo = Date.now() - (5 * 60 * 1000);
  const recentFailures = attempts.filter(a => !a.success && a.timestamp > fiveMinutesAgo);
  
  if (recentFailures.length >= 3) {
    const lastFailure = Math.max(...recentFailures.map(a => a.timestamp));
    const lockoutEnd = lastFailure + (15 * 60 * 1000);
    if (Date.now() < lockoutEnd) {
      return { locked: true, until: new Date(lockoutEnd) };
    }
  }
  return { locked: false };
}

function recordAttempt(ip, success) {
  const attempts = loginAttempts.get(ip) || [];
  attempts.push({ timestamp: Date.now(), success });
  loginAttempts.set(ip, attempts);
}

function requireAdmin(req, res, next) {
  if (req.session.isAdmin) {
    return next();
  }
  res.redirect('/admin/login');
}

// Admin routes
app.get('/admin/login', (req, res) => {
  const lockout = isLockedOut(req.ip);
  if (lockout.locked) {
    return res.render('admin-login.njk', { 
      error: `Too many failed attempts. Try again after ${lockout.until.toLocaleTimeString()}.`,
      locked: true
    });
  }
  res.render('admin-login.njk');
});

app.post('/admin/login', (req, res) => {
  const lockout = isLockedOut(req.ip);
  if (lockout.locked) {
    return res.render('admin-login.njk', { 
      error: `Too many failed attempts. Try again after ${lockout.until.toLocaleTimeString()}.`,
      locked: true
    });
  }
  
  const { username, password } = req.body;
  
  // Username is required (any value works) and password must be correct
  if (!username || !username.trim()) {
    return res.render('admin-login.njk', { error: 'Username is required' });
  }
  
  if (password === ADMIN_PASSWORD) {
    recordAttempt(req.ip, true);
    req.session.isAdmin = true;
    req.session.username = username;
    res.redirect('/admin');
  } else {
    recordAttempt(req.ip, false);
    const attempts = loginAttempts.get(req.ip) || [];
    const fiveMinutesAgo = Date.now() - (5 * 60 * 1000);
    const recentFailures = attempts.filter(a => !a.success && a.timestamp > fiveMinutesAgo).length;
    
    let error = 'Incorrect password';
    if (recentFailures >= 3) {
      const lastFailure = Math.max(...attempts.filter(a => !a.success).map(a => a.timestamp));
      const lockoutEnd = new Date(lastFailure + (15 * 60 * 1000));
      error = `Too many failed attempts. Try again after ${lockoutEnd.toLocaleTimeString()}.`;
    } else if (recentFailures > 0) {
      error = `Incorrect password (${recentFailures}/3 attempts)`;
    }
    
    res.render('admin-login.njk', { error });
  }
});

app.get('/admin/logout', (req, res) => {
  req.session.destroy();
  res.redirect('/admin/login');
});

app.get('/admin', requireAdmin, (req, res) => {
  db.all('SELECT component_code, component_name, COUNT(f.unique_id) as feature_count FROM features f WHERE feature_name != "_PLACEHOLDER_" GROUP BY component_code ORDER BY component_code', [], (err, components) => {
    if (err) return res.status(500).send('Something went wrong. Please try again.');
    
    // Calculate total features
    const totalFeatures = components.reduce((sum, comp) => sum + comp.feature_count, 0);
    
    // Count feature groups
    db.get('SELECT COUNT(DISTINCT component_code || "-" || feature_group_code) as count FROM features WHERE feature_name != "_PLACEHOLDER_"', [], (err2, featureGroupCount) => {
      if (err2) return res.status(500).send('Something went wrong. Please try again.');
      
      db.get('SELECT COUNT(*) as count FROM assessments', [], (err3, assessmentCount) => {
        if (err3) return res.status(500).send('Something went wrong. Please try again.');
        
        res.render('admin-dashboard.njk', { 
          components, 
          totalFeatures, 
          totalFeatureGroups: featureGroupCount.count,
          assessmentCount: assessmentCount.count 
        });
      });
    });
  });
});

// Component CRUD
app.get('/admin/components', requireAdmin, (req, res) => {
  db.all('SELECT DISTINCT component_code, component_name FROM features ORDER BY component_code', [], (err, components) => {
    if (err) return res.status(500).send('Something went wrong. Please try again.');
    res.render('admin-components.njk', { components });
  });
});

app.get('/admin/component/new', requireAdmin, (req, res) => {
  res.render('admin-component-form.njk', { component: null });
});

app.post('/admin/component/new', requireAdmin, (req, res) => {
  const { component_code, component_name } = req.body;
  if (!component_code || !component_name) {
    return res.render('admin-component-form.njk', { 
      error: 'All fields are required', 
      component: req.body 
    });
  }
  
  // Check if component already exists
  db.get('SELECT component_code FROM features WHERE component_code = ?', [component_code], (err, existing) => {
    if (existing) {
      return res.render('admin-component-form.njk', { 
        error: 'Component code already exists', 
        component: req.body 
      });
    }
    
    // Create a placeholder feature to establish the component
    db.run(`INSERT INTO features (component_code, component_name, unique_id, feature_name, description, as_a, i_want, expected_outcomes, service_type, feature_group_code, feature_id) 
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [component_code, component_name, `${component_code}-PLACEHOLDER`, '_PLACEHOLDER_', 'Placeholder for component structure', 'System', 'maintain component structure', 'the component exists in the database', 'Cross-cutting', '999', '999'],
      (err) => {
        if (err) {
          console.error('Error creating component:', err);
          return res.status(500).send('Something went wrong. Please try again.');
        }
        
        // Log audit event
        logAuditEvent('create', 'component', component_code, null, { component_code, component_name }, req.session.username);
        
        res.redirect('/admin/components');
      });
  });
});

app.get('/admin/component/:code/edit', requireAdmin, (req, res) => {
  const code = req.params.code;
  db.get('SELECT DISTINCT component_code, component_name FROM features WHERE component_code = ?', [code], (err, component) => {
    if (err || !component) return res.status(404).send('Component not found');
    res.render('admin-component-form.njk', { component, editing: true });
  });
});

app.post('/admin/component/:code/edit', requireAdmin, (req, res) => {
  const oldCode = req.params.code;
  const { component_name } = req.body;
  
  if (!component_name) {
    return res.render('admin-component-form.njk', { 
      error: 'Component name is required', 
      component: { component_code: oldCode, component_name },
      editing: true
    });
  }
  
  // Get old data before updating
  db.get('SELECT DISTINCT component_code, component_name FROM features WHERE component_code = ?', [oldCode], (err, oldData) => {
    if (err || !oldData) {
      return res.status(404).send('Component not found');
    }
    
    db.run('UPDATE features SET component_name = ? WHERE component_code = ?', [component_name, oldCode], (err) => {
      if (err) {
        console.error('Error updating component:', err);
        return res.status(500).send('Something went wrong. Please try again.');
      }
      
      // Log audit event
      logAuditEvent('edit', 'component', oldCode, oldData, { component_code: oldCode, component_name }, req.session.username);
      
      res.redirect('/admin/components');
    });
  });
});

// Component delete confirmation
app.get('/admin/component/:code/delete-confirm', requireAdmin, (req, res) => {
  const code = req.params.code;
  db.get('SELECT DISTINCT component_code, component_name FROM features WHERE component_code = ?', [code], (err, component) => {
    if (err || !component) return res.status(404).send('Component not found');
    res.render('admin-component-delete-confirm.njk', { component });
  });
});

app.post('/admin/component/:code/delete', requireAdmin, (req, res) => {
  const code = req.params.code;
  
  // Get old data before deleting
  db.get('SELECT DISTINCT component_code, component_name FROM features WHERE component_code = ?', [code], (err, oldData) => {
    if (err || !oldData) {
      return res.status(404).send('Component not found');
    }
    
    db.run('DELETE FROM features WHERE component_code = ?', [code], (err) => {
      if (err) {
        console.error('Error deleting component:', err);
        return res.status(500).send('Something went wrong. Please try again.');
      }
      
      // Log audit event
      logAuditEvent('delete', 'component', code, oldData, null, req.session.username);
      
      res.redirect('/admin/components');
    });
  });
});

// Feature Groups CRUD
app.get('/admin/feature-groups', requireAdmin, (req, res) => {
  const component = req.query.component || '';
  
  let query = `SELECT component_code, component_name, feature_group_code, feature_group_name, 
    COUNT(*) as feature_count 
    FROM features 
    WHERE feature_name != '_PLACEHOLDER_' 
    GROUP BY component_code, feature_group_code 
    ORDER BY component_code, feature_group_code`;
  let params = [];
  
  if (component) {
    query = `SELECT component_code, component_name, feature_group_code, feature_group_name, 
      COUNT(*) as feature_count 
      FROM features 
      WHERE component_code = ? AND feature_name != '_PLACEHOLDER_' 
      GROUP BY component_code, feature_group_code 
      ORDER BY feature_group_code`;
    params = [component];
  }
  
  db.all(query, params, (err, featureGroups) => {
    if (err) return res.status(500).send('Something went wrong. Please try again.');
    
    db.all('SELECT DISTINCT component_code, component_name FROM features ORDER BY component_code', [], (err2, components) => {
      if (err2) return res.status(500).send('Something went wrong. Please try again.');
      res.render('admin-feature-groups.njk', { featureGroups, components, selectedComponent: component });
    });
  });
});

app.get('/admin/feature-group/new', requireAdmin, (req, res) => {
  const preselectedComponent = req.query.component || '';
  db.all('SELECT DISTINCT component_code, component_name FROM features ORDER BY component_code', [], (err, components) => {
    if (err) return res.status(500).send('Something went wrong. Please try again.');
    res.render('admin-feature-group-form.njk', { featureGroup: null, components, preselectedComponent });
  });
});

app.post('/admin/feature-group/new', requireAdmin, (req, res) => {
  const { component_code, feature_group_name } = req.body;
  
  if (!component_code || !feature_group_name) {
    db.all('SELECT DISTINCT component_code, component_name FROM features ORDER BY component_code', [], (err, components) => {
      return res.render('admin-feature-group-form.njk', { 
        error: 'Component and feature group name are required', 
        featureGroup: req.body,
        components,
        preselectedComponent: component_code
      });
    });
    return;
  }
  
  // Get component name and next group code
  db.get('SELECT component_name FROM features WHERE component_code = ? LIMIT 1', [component_code], (err, comp) => {
    if (err || !comp) {
      db.all('SELECT DISTINCT component_code, component_name FROM features ORDER BY component_code', [], (err2, components) => {
        return res.render('admin-feature-group-form.njk', { 
          error: 'Component not found', 
          featureGroup: req.body,
          components,
          preselectedComponent: component_code
        });
      });
      return;
    }
    
    db.get(`SELECT MAX(CAST(feature_group_code AS INTEGER)) as max_code FROM features 
      WHERE component_code = ? AND feature_name != '_PLACEHOLDER_'`, 
      [component_code], (err, row) => {
      const nextGroupCode = (row && row.max_code) ? String(row.max_code + 10).padStart(3, '0') : '010';
      
      // Insert a placeholder feature to create the group
      const unique_id = `${component_code}-${nextGroupCode}-000`;
      
      db.run(`INSERT INTO features (component_code, component_name, unique_id, feature_name, description, as_a, i_want, expected_outcomes, service_type, feature_group_code, feature_id, feature_group_name) 
        VALUES (?, ?, ?, '_PLACEHOLDER_', '', '', '', '', '', ?, '000', ?)`,
        [component_code, comp.component_name, unique_id, nextGroupCode, feature_group_name],
        (err2) => {
          if (err2) {
            console.error('Error creating feature group:', err2);
            db.all('SELECT DISTINCT component_code, component_name FROM features ORDER BY component_code', [], (err3, components) => {
              return res.render('admin-feature-group-form.njk', { 
                error: 'Error creating feature group: ' + err2.message, 
                featureGroup: req.body,
                components,
                preselectedComponent: component_code
              });
            });
            return;
          }
          
          // Log audit event
          logAuditEvent('create', 'feature_group', `${component_code}-${nextGroupCode}`, null, { 
            component_code, 
            feature_group_code: nextGroupCode,
            feature_group_name 
          }, req.session.username);
          
          res.redirect('/admin/feature-groups?component=' + component_code);
        });
    });
  });
});

app.get('/admin/feature-group/:componentCode/:groupCode/edit', requireAdmin, (req, res) => {
  const { componentCode, groupCode } = req.params;
  
  db.get(`SELECT component_code, component_name, feature_group_code, feature_group_name 
    FROM features WHERE component_code = ? AND feature_group_code = ? LIMIT 1`, 
    [componentCode, groupCode], (err, featureGroup) => {
    if (err || !featureGroup) return res.status(404).send('Feature group not found');
    
    db.all('SELECT DISTINCT component_code, component_name FROM features ORDER BY component_code', [], (err2, components) => {
      if (err2) return res.status(500).send('Something went wrong. Please try again.');
      res.render('admin-feature-group-form.njk', { featureGroup, components, editing: true });
    });
  });
});

app.post('/admin/feature-group/:componentCode/:groupCode/edit', requireAdmin, (req, res) => {
  const { componentCode, groupCode } = req.params;
  const { feature_group_name } = req.body;
  
  if (!feature_group_name) {
    db.get(`SELECT component_code, component_name, feature_group_code, feature_group_name 
      FROM features WHERE component_code = ? AND feature_group_code = ? LIMIT 1`, 
      [componentCode, groupCode], (err, featureGroup) => {
      db.all('SELECT DISTINCT component_code, component_name FROM features ORDER BY component_code', [], (err2, components) => {
        return res.render('admin-feature-group-form.njk', { 
          error: 'Feature group name is required', 
          featureGroup: featureGroup || { component_code: componentCode, feature_group_code: groupCode, feature_group_name },
          components,
          editing: true
        });
      });
    });
    return;
  }
  
  // Get old data before updating
  db.get(`SELECT feature_group_name FROM features WHERE component_code = ? AND feature_group_code = ? LIMIT 1`, 
    [componentCode, groupCode], (err, oldData) => {
    if (err) return res.status(500).send('Something went wrong. Please try again.');
    
    db.run('UPDATE features SET feature_group_name = ? WHERE component_code = ? AND feature_group_code = ?', 
      [feature_group_name, componentCode, groupCode], (err) => {
      if (err) {
        console.error('Error updating feature group:', err);
        return res.status(500).send('Something went wrong. Please try again.');
      }
      
      // Log audit event
      logAuditEvent('edit', 'feature_group', `${componentCode}-${groupCode}`, 
        { feature_group_name: oldData ? oldData.feature_group_name : '' }, 
        { feature_group_name }, 
        req.session.username);
      
      res.redirect('/admin/feature-groups?component=' + componentCode);
    });
  });
});

app.get('/admin/feature-group/:componentCode/:groupCode/delete-confirm', requireAdmin, (req, res) => {
  const { componentCode, groupCode } = req.params;
  
  db.get(`SELECT component_code, component_name, feature_group_code, feature_group_name 
    FROM features WHERE component_code = ? AND feature_group_code = ? LIMIT 1`, 
    [componentCode, groupCode], (err, featureGroup) => {
    if (err || !featureGroup) return res.status(404).send('Feature group not found');
    
    db.get(`SELECT COUNT(*) as count FROM features WHERE component_code = ? AND feature_group_code = ? AND feature_name != '_PLACEHOLDER_'`, 
      [componentCode, groupCode], (err2, result) => {
      if (err2) return res.status(500).send('Something went wrong. Please try again.');
      
      res.render('admin-feature-group-delete-confirm.njk', { 
        featureGroup, 
        featureCount: result.count 
      });
    });
  });
});

app.post('/admin/feature-group/:componentCode/:groupCode/delete', requireAdmin, (req, res) => {
  const { componentCode, groupCode } = req.params;
  
  // Get old data before deleting
  db.all(`SELECT * FROM features WHERE component_code = ? AND feature_group_code = ?`, 
    [componentCode, groupCode], (err, oldData) => {
    if (err) return res.status(500).send('Something went wrong. Please try again.');
    
    db.run('DELETE FROM features WHERE component_code = ? AND feature_group_code = ?', 
      [componentCode, groupCode], (err) => {
      if (err) {
        console.error('Error deleting feature group:', err);
        return res.status(500).send('Something went wrong. Please try again.');
      }
      
      // Log audit event
      logAuditEvent('delete', 'feature_group', `${componentCode}-${groupCode}`, oldData, null, req.session.username);
      
      res.redirect('/admin/feature-groups?component=' + componentCode);
    });
  });
});

// API endpoint for getting feature groups by component
app.get('/admin/api/feature-groups/:componentCode', requireAdmin, (req, res) => {
  const componentCode = req.params.componentCode;
  db.all(`SELECT DISTINCT feature_group_code, feature_group_name FROM features 
    WHERE component_code = ? AND feature_name != '_PLACEHOLDER_' 
    ORDER BY feature_group_code`, [componentCode], (err, rows) => {
    if (err) return res.status(500).json({ error: 'Database error' });
    res.json(rows);
  });
});

app.get('/admin/api/next-feature-id/:componentCode/:groupCode', requireAdmin, (req, res) => {
  const { componentCode, groupCode } = req.params;
  db.get(`SELECT MAX(CAST(feature_id AS INTEGER)) as max_id FROM features 
    WHERE component_code = ? AND feature_group_code = ? AND feature_name != '_PLACEHOLDER_'`, 
    [componentCode, groupCode], (err, row) => {
    if (err) return res.status(500).json({ error: 'Database error' });
    const nextId = (row && row.max_id) ? row.max_id + 1 : 1;
    res.json({ nextId: String(nextId).padStart(3, '0') });
  });
});

app.get('/admin/api/next-group-code/:componentCode', requireAdmin, (req, res) => {
  const componentCode = req.params.componentCode;
  db.get(`SELECT MAX(CAST(feature_group_code AS INTEGER)) as max_code FROM features 
    WHERE component_code = ? AND feature_name != '_PLACEHOLDER_'`, 
    [componentCode], (err, row) => {
    if (err) return res.status(500).json({ error: 'Database error' });
    const nextCode = (row && row.max_code) ? row.max_code + 10 : 10;
    res.json({ nextCode: String(nextCode).padStart(3, '0') });
  });
});

// Feature CRUD
app.get('/admin/features', requireAdmin, (req, res) => {
  const component = req.query.component || '';
  let query = 'SELECT * FROM features WHERE feature_name != "_PLACEHOLDER_" ORDER BY component_code, feature_group_code, feature_id';
  let params = [];
  
  if (component) {
    query = 'SELECT * FROM features WHERE component_code = ? AND feature_name != "_PLACEHOLDER_" ORDER BY feature_group_code, feature_id';
    params = [component];
  }
  
  db.all(query, params, (err, features) => {
    if (err) return res.status(500).send('Something went wrong. Please try again.');
    
    db.all('SELECT DISTINCT component_code, component_name FROM features ORDER BY component_code', [], (err2, components) => {
      if (err2) return res.status(500).send('Something went wrong. Please try again.');
      res.render('admin-features.njk', { features, components, selectedComponent: component });
    });
  });
});

app.get('/admin/feature/new', requireAdmin, (req, res) => {
  const userRoles = [
    'Citizen',
    'Professional User',
    'Caseworker',
    'Judicial Office Holder',
    'System/System Administrator',
    'Finance Administrator',
    'Listing Officer',
    'Bailiff Administrator'
  ];
  
  db.all('SELECT DISTINCT component_code, component_name FROM features ORDER BY component_code', [], (err, components) => {
    if (err) return res.status(500).send('Something went wrong. Please try again.');
    res.render('admin-feature-form.njk', { feature: null, components, userRoles });
  });
});

app.post('/admin/feature/new', requireAdmin, (req, res) => {
  const { component_code, feature_name, description, user_roles, i_want, expected_outcomes, service_type, feature_group_code, feature_id, group_mode, new_group_name } = req.body;
  
  const userRoles = [
    'Citizen',
    'Professional User',
    'Caseworker',
    'Judicial Office Holder',
    'System/System Administrator',
    'Finance Administrator',
    'Listing Officer',
    'Bailiff Administrator'
  ];
  
  if (!component_code || !feature_name || !description) {
    db.all('SELECT DISTINCT component_code, component_name FROM features ORDER BY component_code', [], (err, components) => {
      return res.render('admin-feature-form.njk', { 
        error: 'Component, feature name, and description are required', 
        feature: req.body,
        components,
        userRoles
      });
    });
    return;
  }
  
  // Handle user roles (can be array or single value)
  const selectedRoles = Array.isArray(user_roles) ? user_roles : (user_roles ? [user_roles] : []);
  const as_a = selectedRoles.join(', ');
  
  db.get('SELECT component_name FROM features WHERE component_code = ? LIMIT 1', [component_code], (err, comp) => {
    if (err || !comp) {
      db.all('SELECT DISTINCT component_code, component_name FROM features ORDER BY component_code', [], (err2, components) => {
        return res.render('admin-feature-form.njk', { 
          error: 'Component not found', 
          feature: req.body,
          components,
          userRoles
        });
      });
      return;
    }
    
    // Determine final group code and feature ID
    const processFeatureCreation = (finalGroupCode, finalFeatureId, groupName) => {
      const unique_id = `${component_code}-${finalGroupCode}-${finalFeatureId}`;
      const featureData = {
        component_code,
        component_name: comp.component_name,
        unique_id,
        feature_name,
        description,
        as_a,
        i_want: i_want || '',
        expected_outcomes: expected_outcomes || '',
        service_type: service_type || 'Cross-cutting',
        feature_group_code: finalGroupCode,
        feature_id: finalFeatureId,
        feature_group_name: groupName || ''
      };
      
      db.run(`INSERT INTO features (component_code, component_name, unique_id, feature_name, description, as_a, i_want, expected_outcomes, service_type, feature_group_code, feature_id, feature_group_name) 
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [component_code, comp.component_name, unique_id, feature_name, description, as_a, i_want || '', expected_outcomes || '', service_type || 'Cross-cutting', finalGroupCode, finalFeatureId, groupName || ''],
        (err2) => {
          if (err2) {
            console.error('Error creating feature:', err2);
            db.all('SELECT DISTINCT component_code, component_name FROM features ORDER BY component_code', [], (err3, components) => {
              return res.render('admin-feature-form.njk', { 
                error: 'Error creating feature: ' + err2.message, 
                feature: req.body,
                components,
                userRoles
              });
            });
            return;
          }
          
          // Log audit event
          logAuditEvent('create', 'feature', unique_id, null, featureData, req.session.username);
          
          res.redirect('/admin/features?component=' + component_code);
        });
    };
    
    if (group_mode === 'new') {
      // Create new group - get next group code
      db.get(`SELECT MAX(CAST(feature_group_code AS INTEGER)) as max_code FROM features 
        WHERE component_code = ? AND feature_name != '_PLACEHOLDER_'`, 
        [component_code], (err, row) => {
        const nextGroupCode = (row && row.max_code) ? String(row.max_code + 10).padStart(3, '0') : '010';
        processFeatureCreation(nextGroupCode, '001', new_group_name);
      });
    } else {
      // Use existing group - get group name and next feature ID
      db.get(`SELECT feature_group_name FROM features 
        WHERE component_code = ? AND feature_group_code = ? AND feature_name != '_PLACEHOLDER_' LIMIT 1`, 
        [component_code, feature_group_code], (err, groupInfo) => {
        const existingGroupName = groupInfo ? groupInfo.feature_group_name : '';
        
        db.get(`SELECT MAX(CAST(feature_id AS INTEGER)) as max_id FROM features 
          WHERE component_code = ? AND feature_group_code = ? AND feature_name != '_PLACEHOLDER_'`, 
          [component_code, feature_group_code], (err, row) => {
          const nextFeatureId = (row && row.max_id) ? String(row.max_id + 1).padStart(3, '0') : '001';
          processFeatureCreation(feature_group_code, nextFeatureId, existingGroupName);
        });
      });
    }
  });
});

app.get('/admin/feature/:id/edit', requireAdmin, (req, res) => {
  const id = req.params.id;
  const userRoles = [
    'Citizen',
    'Professional User',
    'Caseworker',
    'Judicial Office Holder',
    'System/System Administrator',
    'Finance Administrator',
    'Listing Officer',
    'Bailiff Administrator'
  ];
  
  db.get('SELECT * FROM features WHERE unique_id = ?', [id], (err, feature) => {
    if (err || !feature) return res.status(404).send('Feature not found');
    
    // Parse existing user roles
    const selectedRoles = feature.as_a ? feature.as_a.split(',').map(r => r.trim()) : [];
    feature.selected_roles = selectedRoles;
    
    db.all('SELECT DISTINCT component_code, component_name FROM features ORDER BY component_code', [], (err2, components) => {
      if (err2) return res.status(500).send('Something went wrong. Please try again.');
      res.render('admin-feature-form.njk', { feature, components, userRoles, editing: true });
    });
  });
});

app.post('/admin/feature/:id/edit', requireAdmin, (req, res) => {
  const id = req.params.id;
  const { feature_name, description, user_roles, i_want, expected_outcomes, service_type } = req.body;
  
  const userRoles = [
    'Citizen',
    'Professional User',
    'Caseworker',
    'Judicial Office Holder',
    'System/System Administrator',
    'Finance Administrator',
    'Listing Officer',
    'Bailiff Administrator'
  ];
  
  if (!feature_name || !description) {
    db.get('SELECT * FROM features WHERE unique_id = ?', [id], (err, feature) => {
      db.all('SELECT DISTINCT component_code, component_name FROM features ORDER BY component_code', [], (err2, components) => {
        return res.render('admin-feature-form.njk', { 
          error: 'Feature name and description are required', 
          feature: { ...feature, ...req.body },
          components,
          userRoles,
          editing: true
        });
      });
    });
    return;
  }
  
  // Handle user roles
  const selectedRoles = Array.isArray(user_roles) ? user_roles : (user_roles ? [user_roles] : []);
  const as_a = selectedRoles.join(', ');
  
  // Get old data before updating
  db.get('SELECT * FROM features WHERE unique_id = ?', [id], (err, oldData) => {
    if (err || !oldData) {
      return res.status(404).send('Feature not found');
    }
    
    const newData = {
      ...oldData,
      feature_name,
      description,
      as_a,
      i_want: i_want || '',
      expected_outcomes: expected_outcomes || '',
      service_type: service_type || 'Cross-cutting'
    };
    
    db.run(`UPDATE features SET feature_name = ?, description = ?, as_a = ?, i_want = ?, expected_outcomes = ?, service_type = ? WHERE unique_id = ?`,
      [feature_name, description, as_a, i_want || '', expected_outcomes || '', service_type || 'Cross-cutting', id],
      (err) => {
        if (err) {
          console.error('Error updating feature:', err);
          return res.status(500).send('Something went wrong. Please try again.');
        }
        
        // Log audit event
        logAuditEvent('edit', 'feature', id, oldData, newData, req.session.username);
        
        db.get('SELECT component_code FROM features WHERE unique_id = ?', [id], (err2, row) => {
          res.redirect('/admin/features?component=' + (row ? row.component_code : ''));
        });
      });
  });
});

// Feature delete confirmation
app.get('/admin/feature/:id/delete-confirm', requireAdmin, (req, res) => {
  const id = req.params.id;
  db.get('SELECT * FROM features WHERE unique_id = ?', [id], (err, feature) => {
    if (err || !feature) return res.status(404).send('Feature not found');
    res.render('admin-feature-delete-confirm.njk', { feature });
  });
});

app.post('/admin/feature/:id/delete', requireAdmin, (req, res) => {
  const id = req.params.id;
  
  // Get old data before deleting
  db.get('SELECT * FROM features WHERE unique_id = ?', [id], (err, oldData) => {
    if (err || !oldData) {
      return res.status(404).send('Feature not found');
    }
    
    const component = oldData.component_code;
    
    db.run('DELETE FROM features WHERE unique_id = ?', [id], (err2) => {
      if (err2) {
        console.error('Error deleting feature:', err2);
        return res.status(500).send('Something went wrong. Please try again.');
      }
      
      // Log audit event
      logAuditEvent('delete', 'feature', id, oldData, null, req.session.username);
      
      res.redirect('/admin/features?component=' + component);
    });
  });
});

// Assessments management
app.get('/admin/assessments', requireAdmin, (req, res) => {
  db.all(`SELECT 
    a.id,
    a.code,
    a.user_name,
    a.service_name,
    a.service_type,
    a.created_at,
    a.updated_at,
    COUNT(DISTINCT ar.feature_id) as responses_count
  FROM assessments a
  LEFT JOIN assessment_responses ar ON a.id = ar.assessment_id
  GROUP BY a.id
  ORDER BY a.updated_at DESC`, [], (err, assessments) => {
    if (err) return res.status(500).send('Something went wrong. Please try again.');
    
    // Get total features count
    db.get('SELECT COUNT(*) as total FROM features WHERE feature_name != "_PLACEHOLDER_"', [], (err2, totalRow) => {
      if (err2) return res.status(500).send('Something went wrong. Please try again.');
      
      const totalFeatures = totalRow.total;
      
      // Calculate percentage for each assessment
      assessments.forEach(a => {
        a.percent_complete = totalFeatures > 0 ? Math.round((a.responses_count / totalFeatures) * 100) : 0;
      });
      
      res.render('admin-assessments.njk', { assessments, totalFeatures });
    });
  });
});

// Audit log
app.get('/admin/audit-log', requireAdmin, (req, res) => {
  db.all(`SELECT * FROM audit_log ORDER BY timestamp DESC`, [], (err, logs) => {
    if (err) return res.status(500).send('Something went wrong. Please try again.');
    
    // Parse JSON data for display
    logs.forEach(log => {
      if (log.old_data) {
        try {
          log.old_data_parsed = JSON.parse(log.old_data);
        } catch (e) {
          log.old_data_parsed = null;
        }
      }
      if (log.new_data) {
        try {
          log.new_data_parsed = JSON.parse(log.new_data);
        } catch (e) {
          log.new_data_parsed = null;
        }
      }
    });
    
    res.render('admin-audit-log.njk', { logs });
  });
});

// Revert edit - restore old data
app.post('/admin/audit-log/:id/revert-edit', requireAdmin, (req, res) => {
  const logId = req.params.id;
  
  db.get('SELECT * FROM audit_log WHERE id = ? AND action_type = "edit"', [logId], (err, log) => {
    if (err || !log) {
      return res.status(404).send('Audit log entry not found');
    }
    
    const oldData = JSON.parse(log.old_data);
    const newData = JSON.parse(log.new_data);
    
    if (log.entity_type === 'component') {
      // Revert component edit
      db.run('UPDATE features SET component_name = ? WHERE component_code = ?',
        [oldData.component_name, log.entity_id],
        (err) => {
          if (err) {
            console.error('Error reverting component edit:', err);
            return res.status(500).send('Something went wrong. Please try again.');
          }
          
          // Log the revert action
          logAuditEvent('edit', 'component', log.entity_id, newData, oldData, req.session.username);
          
          res.redirect('/admin/audit-log');
        });
    } else if (log.entity_type === 'feature') {
      // Revert feature edit
      db.run(`UPDATE features SET feature_name = ?, description = ?, as_a = ?, i_want = ?, expected_outcomes = ?, service_type = ? WHERE unique_id = ?`,
        [oldData.feature_name, oldData.description, oldData.as_a, oldData.i_want, oldData.expected_outcomes, oldData.service_type, log.entity_id],
        (err) => {
          if (err) {
            console.error('Error reverting feature edit:', err);
            return res.status(500).send('Something went wrong. Please try again.');
          }
          
          // Log the revert action
          logAuditEvent('edit', 'feature', log.entity_id, newData, oldData, req.session.username);
          
          res.redirect('/admin/audit-log');
        });
    }
  });
});

// Revert delete - restore deleted entity
app.post('/admin/audit-log/:id/revert-delete', requireAdmin, (req, res) => {
  const logId = req.params.id;
  
  db.get('SELECT * FROM audit_log WHERE id = ? AND action_type = "delete"', [logId], (err, log) => {
    if (err || !log) {
      return res.status(404).send('Audit log entry not found');
    }
    
    const oldData = JSON.parse(log.old_data);
    
    if (log.entity_type === 'component') {
      // Restore component (create placeholder)
      db.run(`INSERT INTO features (component_code, component_name, unique_id, feature_name, description, as_a, i_want, expected_outcomes, service_type, feature_group_code, feature_id) 
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [oldData.component_code, oldData.component_name, `${oldData.component_code}-PLACEHOLDER`, '_PLACEHOLDER_', 'Placeholder for component structure', 'System', 'maintain component structure', 'the component exists in the database', 'Cross-cutting', '999', '999'],
        (err) => {
          if (err) {
            console.error('Error restoring component:', err);
            return res.status(500).send('Something went wrong. Please try again.');
          }
          
          // Log the restore action
          logAuditEvent('create', 'component', oldData.component_code, null, oldData, req.session.username);
          
          res.redirect('/admin/audit-log');
        });
    } else if (log.entity_type === 'feature') {
      // Restore feature
      db.run(`INSERT INTO features (component_code, component_name, unique_id, feature_name, description, as_a, i_want, expected_outcomes, service_type, feature_group_code, feature_id, feature_group_name) 
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [oldData.component_code, oldData.component_name, oldData.unique_id, oldData.feature_name, oldData.description, oldData.as_a, oldData.i_want || '', oldData.expected_outcomes || '', oldData.service_type || 'Cross-cutting', oldData.feature_group_code, oldData.feature_id, oldData.feature_group_name || ''],
        (err) => {
          if (err) {
            console.error('Error restoring feature:', err);
            return res.status(500).send('Something went wrong. Please try again.');
          }
          
          // Log the restore action
          logAuditEvent('create', 'feature', oldData.unique_id, null, oldData, req.session.username);
          
          res.redirect('/admin/audit-log');
        });
    }
  });
});

app.post('/admin/assessment/:id/delete', requireAdmin, (req, res) => {
  const id = req.params.id;
  db.serialize(() => {
    db.run('DELETE FROM assessment_responses WHERE assessment_id = ?', [id]);
    db.run('DELETE FROM assessments WHERE id = ?', [id], (err) => {
      if (err) {
        console.error('Error deleting assessment:', err);
        return res.status(500).send('Something went wrong. Please try again.');
      }
      res.redirect('/admin/assessments');
    });
  });
});

// Serve template files for download
app.use('/templates', express.static(path.join(__dirname, 'templates')));

// Bulk upload page
app.get('/admin/bulk-upload', requireAdmin, (req, res) => {
  db.all('SELECT DISTINCT component_code, component_name FROM features WHERE feature_name != "_PLACEHOLDER_" ORDER BY component_code', [], (err, components) => {
    if (err) return res.status(500).send('Something went wrong. Please try again.');
    res.render('admin-bulk-upload.njk', { components });
  });
});

// Process bulk upload
app.post('/admin/bulk-upload', requireAdmin, upload.single('file'), (req, res) => {
  if (!req.file) {
    return res.render('admin-bulk-upload.njk', { error: 'Please select a file to upload' });
  }

  try {
    const workbook = XLSX.readFile(req.file.path);
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    const data = XLSX.utils.sheet_to_json(sheet);

    if (data.length === 0) {
      return res.render('admin-bulk-upload.njk', { error: 'The uploaded file contains no data' });
    }

    // Validate required columns
    const requiredColumns = ['Component Code', 'Feature Group Name', 'Feature Name', 'Description', 'User Roles'];
    const firstRow = data[0];
    const missingColumns = requiredColumns.filter(col => !(col in firstRow));
    
    if (missingColumns.length > 0) {
      return res.render('admin-bulk-upload.njk', { 
        error: `Missing required columns: ${missingColumns.join(', ')}` 
      });
    }

    // Process features
    processFeatures(data, req.session.username, (err, results) => {
      if (err) {
        return res.render('admin-bulk-upload.njk', { error: err.message });
      }
      
      // Log the bulk upload
      logAuditEvent('bulk-upload', 'features', null, null, { 
        count: results.inserted,
        errors: results.errors.length
      }, req.session.username);
      
      res.render('admin-bulk-upload-results.njk', { results });
    });

  } catch (e) {
    console.error('Error processing upload:', e);
    return res.render('admin-bulk-upload.njk', { error: 'Error reading file. Please ensure it is a valid Excel file.' });
  }
});

// Helper function to process features from upload
function processFeatures(data, username, callback) {
  const results = { inserted: 0, skipped: 0, errors: [] };
  const componentCodes = new Set();
  const featureGroupCache = {}; // { componentCode: { groupName: groupCode } }
  const featureIdCache = {}; // { componentCode-groupCode: nextId }

  // First, get all existing components
  db.all('SELECT DISTINCT component_code FROM features', [], (err, rows) => {
    if (err) return callback(err);
    
    rows.forEach(r => componentCodes.add(r.component_code));

    // Get existing feature groups for all components
    db.all('SELECT component_code, feature_group_code, feature_group_name FROM features WHERE feature_name != "_PLACEHOLDER_"', [], (err2, groupRows) => {
      if (err2) return callback(err2);

      groupRows.forEach(r => {
        if (!featureGroupCache[r.component_code]) {
          featureGroupCache[r.component_code] = {};
        }
        if (r.feature_group_name) {
          featureGroupCache[r.component_code][r.feature_group_name.toLowerCase()] = r.feature_group_code;
        }
      });

      // Get max feature IDs per component-group
      db.all(`SELECT component_code, feature_group_code, MAX(CAST(feature_id AS INTEGER)) as max_id 
              FROM features WHERE feature_name != "_PLACEHOLDER_" 
              GROUP BY component_code, feature_group_code`, [], (err3, maxRows) => {
        if (err3) return callback(err3);

        maxRows.forEach(r => {
          featureIdCache[`${r.component_code}-${r.feature_group_code}`] = r.max_id || 0;
        });

        // Get max group codes per component
        const maxGroupCodes = {};
        db.all(`SELECT component_code, MAX(CAST(feature_group_code AS INTEGER)) as max_code 
                FROM features WHERE feature_name != "_PLACEHOLDER_" 
                GROUP BY component_code`, [], (err4, maxGroupRows) => {
          if (err4) return callback(err4);

          maxGroupRows.forEach(r => {
            maxGroupCodes[r.component_code] = r.max_code || 0;
          });

          // Process each row
          const insertPromises = data.map((row, index) => {
            return new Promise((resolve) => {
              const componentCode = (row['Component Code'] || '').toString().trim().toUpperCase();
              const featureGroupName = (row['Feature Group Name'] || '').toString().trim();
              const featureName = (row['Feature Name'] || '').toString().trim();
              const description = (row['Description'] || '').toString().trim();
              const userRoles = (row['User Roles'] || '').toString().trim();
              const iWant = (row['I Want...'] || '').toString().trim();
              const expectedOutcomes = (row['Expected Outcomes'] || '').toString().trim();
              const serviceType = (row['Service Type'] || 'Cross-cutting').toString().trim();

              // Validate
              if (!componentCode || !featureGroupName || !featureName || !description || !userRoles) {
                results.errors.push({ row: index + 2, message: 'Missing required fields' });
                results.skipped++;
                return resolve();
              }

              if (!componentCodes.has(componentCode)) {
                results.errors.push({ row: index + 2, message: `Unknown component code: ${componentCode}` });
                results.skipped++;
                return resolve();
              }

              // Get or create feature group code
              if (!featureGroupCache[componentCode]) {
                featureGroupCache[componentCode] = {};
              }

              let groupCode = featureGroupCache[componentCode][featureGroupName.toLowerCase()];
              if (!groupCode) {
                // Create new group code
                const currentMax = maxGroupCodes[componentCode] || 0;
                const newGroupCode = Math.ceil((currentMax + 1) / 10) * 10;
                groupCode = String(newGroupCode).padStart(3, '0');
                featureGroupCache[componentCode][featureGroupName.toLowerCase()] = groupCode;
                maxGroupCodes[componentCode] = newGroupCode;
              }

              // Get next feature ID
              const cacheKey = `${componentCode}-${groupCode}`;
              const currentFeatureId = featureIdCache[cacheKey] || 0;
              const nextFeatureId = currentFeatureId + 1;
              featureIdCache[cacheKey] = nextFeatureId;
              const featureId = String(nextFeatureId).padStart(3, '0');

              // Generate unique ID
              const uniqueId = `${componentCode}-${groupCode}-${featureId}`;

              // Get component name
              db.get('SELECT component_name FROM features WHERE component_code = ? LIMIT 1', [componentCode], (err, compRow) => {
                if (err || !compRow) {
                  results.errors.push({ row: index + 2, message: `Could not find component name for ${componentCode}` });
                  results.skipped++;
                  return resolve();
                }

                // Insert the feature
                db.run(`INSERT INTO features (component_code, component_name, unique_id, feature_name, description, as_a, i_want, expected_outcomes, service_type, feature_group_code, feature_id, feature_group_name) 
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                  [componentCode, compRow.component_name, uniqueId, featureName, description, userRoles, iWant, expectedOutcomes, serviceType, groupCode, featureId, featureGroupName],
                  (err) => {
                    if (err) {
                      results.errors.push({ row: index + 2, message: `Database error: ${err.message}` });
                      results.skipped++;
                    } else {
                      results.inserted++;
                    }
                    resolve();
                  });
              });
            });
          });

          Promise.all(insertPromises).then(() => {
            callback(null, results);
          });
        });
      });
    });
  });
}

// Feature set replacement confirmation page
app.get('/admin/replace-features', requireAdmin, (req, res) => {
  db.get('SELECT COUNT(*) as count FROM features WHERE feature_name != "_PLACEHOLDER_"', [], (err, featureCount) => {
    if (err) return res.status(500).send('Something went wrong. Please try again.');
    db.get('SELECT COUNT(*) as count FROM assessments WHERE legacy = 0 OR legacy IS NULL', [], (err2, assessmentCount) => {
      if (err2) return res.status(500).send('Something went wrong. Please try again.');
      res.render('admin-replace-features.njk', { 
        featureCount: featureCount.count,
        assessmentCount: assessmentCount.count
      });
    });
  });
});

// Process feature set replacement
app.post('/admin/replace-features', requireAdmin, upload.single('file'), (req, res) => {
  if (!req.file) {
    return res.redirect('/admin/replace-features?error=no-file');
  }

  try {
    const workbook = XLSX.readFile(req.file.path);
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    const data = XLSX.utils.sheet_to_json(sheet);

    if (data.length === 0) {
      return res.redirect('/admin/replace-features?error=empty-file');
    }

    // Validate required columns
    const requiredColumns = ['Component Code', 'Feature Group Name', 'Feature Name', 'Description', 'User Roles'];
    const firstRow = data[0];
    const missingColumns = requiredColumns.filter(col => !(col in firstRow));
    
    if (missingColumns.length > 0) {
      return res.redirect('/admin/replace-features?error=missing-columns');
    }

    // Step 1: Archive current features
    db.all('SELECT * FROM features WHERE feature_name != "_PLACEHOLDER_"', [], (err, currentFeatures) => {
      if (err) return res.status(500).send('Something went wrong. Please try again.');

      const archiveName = `Feature Set ${new Date().toISOString().split('T')[0]} ${new Date().toLocaleTimeString('en-GB').replace(/:/g, '-')}`;
      
      db.run('INSERT INTO legacy_feature_sets (name, features_json) VALUES (?, ?)',
        [archiveName, JSON.stringify(currentFeatures)],
        function(err) {
          if (err) return res.status(500).send('Failed to archive current features.');

          const legacySetId = this.lastID;

          // Step 2: Mark all active assessments as legacy
          db.run('UPDATE assessments SET legacy = 1, legacy_feature_set_id = ? WHERE legacy = 0 OR legacy IS NULL', 
            [legacySetId], (err2) => {
            if (err2) return res.status(500).send('Failed to mark assessments as legacy.');

            // Step 3: Delete all current features
            db.run('DELETE FROM features', [], (err3) => {
              if (err3) return res.status(500).send('Failed to clear features.');

              // Step 4: Insert new features
              // First collect unique component codes to create placeholders
              const componentSet = new Set();
              data.forEach(row => {
                const code = (row['Component Code'] || '').toString().trim().toUpperCase();
                if (code) componentSet.add(code);
              });

              // Create component placeholders first
              const componentPromises = Array.from(componentSet).map(code => {
                return new Promise((resolve) => {
                  db.run(`INSERT INTO features (component_code, component_name, unique_id, feature_name, description, as_a, i_want, expected_outcomes, service_type, feature_group_code, feature_id) 
                          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                    [code, code, `${code}-PLACEHOLDER`, '_PLACEHOLDER_', 'Placeholder', 'System', '', '', 'Cross-cutting', '999', '999'],
                    resolve);
                });
              });

              Promise.all(componentPromises).then(() => {
                // Now process features
                processFeatures(data, req.session.username, (err, results) => {
                  if (err) {
                    return res.status(500).send('Error processing new features: ' + err.message);
                  }

                  // Log the replacement
                  logAuditEvent('replace-feature-set', 'features', null, 
                    { archivedCount: currentFeatures.length, legacySetId }, 
                    { insertedCount: results.inserted }, 
                    req.session.username);

                  res.render('admin-replace-features-results.njk', { 
                    results,
                    archivedCount: currentFeatures.length,
                    legacySetId
                  });
                });
              });
            });
          });
        });
    });

  } catch (e) {
    console.error('Error processing replacement:', e);
    return res.redirect('/admin/replace-features?error=invalid-file');
  }
});

// Legacy feature sets list
app.get('/admin/legacy-features', requireAdmin, (req, res) => {
  db.all('SELECT * FROM legacy_feature_sets ORDER BY created_at DESC', [], (err, legacySets) => {
    if (err) return res.status(500).send('Something went wrong. Please try again.');
    
    // Parse feature counts
    legacySets.forEach(set => {
      try {
        const features = JSON.parse(set.features_json);
        set.featureCount = features.length;
      } catch (e) {
        set.featureCount = 0;
      }
    });

    res.render('admin-legacy-features.njk', { legacySets });
  });
});

// View specific legacy feature set (read-only)
app.get('/admin/legacy-features/:id', requireAdmin, (req, res) => {
  const id = req.params.id;
  db.get('SELECT * FROM legacy_feature_sets WHERE id = ?', [id], (err, legacySet) => {
    if (err || !legacySet) return res.status(404).send('Legacy feature set not found');

    try {
      const features = JSON.parse(legacySet.features_json);
      
      // Group by component
      const componentMap = {};
      features.forEach(f => {
        if (!componentMap[f.component_code]) {
          componentMap[f.component_code] = {
            code: f.component_code,
            name: f.component_name,
            features: []
          };
        }
        componentMap[f.component_code].features.push(f);
      });
      
      const components = Object.values(componentMap).sort((a, b) => a.code.localeCompare(b.code));

      // Get linked legacy assessments
      db.all('SELECT * FROM assessments WHERE legacy_feature_set_id = ? ORDER BY created_at DESC', [id], (err2, assessments) => {
        if (err2) assessments = [];
        
        res.render('admin-legacy-feature-view.njk', { 
          legacySet, 
          features, 
          components,
          assessments
        });
      });
    } catch (e) {
      return res.status(500).send('Error parsing legacy features');
    }
  });
});

// View legacy assessment (read-only)
app.get('/admin/legacy-assessment/:id', requireAdmin, (req, res) => {
  const id = req.params.id;
  db.get('SELECT * FROM assessments WHERE id = ? AND legacy = 1', [id], (err, assessment) => {
    if (err || !assessment) return res.status(404).send('Legacy assessment not found');

    // Get the legacy feature set
    db.get('SELECT * FROM legacy_feature_sets WHERE id = ?', [assessment.legacy_feature_set_id], (err2, legacySet) => {
      if (err2 || !legacySet) return res.status(404).send('Associated feature set not found');

      // Get assessment responses
      db.all('SELECT * FROM assessment_responses WHERE assessment_id = ?', [id], (err3, responses) => {
        if (err3) responses = [];

        const responseMap = {};
        responses.forEach(r => { responseMap[r.feature_id] = r.response; });

        try {
          const features = JSON.parse(legacySet.features_json);
          
          // Add responses to features
          features.forEach(f => {
            f.response = responseMap[f.unique_id] || 'Not answered';
          });

          res.render('admin-legacy-assessment-view.njk', { 
            assessment, 
            legacySet,
            features,
            responseMap
          });
        } catch (e) {
          return res.status(500).send('Error parsing legacy features');
        }
      });
    });
  });
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
