const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const DB_PATH = path.join(__dirname, '..', 'data', 'catalogue.db');
const db = new sqlite3.Database(DB_PATH);

db.serialize(() => {
  // Create legacy_feature_sets table to store archived feature sets
  db.run(`CREATE TABLE IF NOT EXISTS legacy_feature_sets (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    features_json TEXT NOT NULL
  )`, (err) => {
    if (err) {
      console.error('Error creating legacy_feature_sets table:', err);
    } else {
      console.log('✅ Created legacy_feature_sets table');
    }
  });

  // Add legacy column to assessments table
  db.run(`ALTER TABLE assessments ADD COLUMN legacy INTEGER DEFAULT 0`, (err) => {
    if (err && !err.message.includes('duplicate column')) {
      console.error('Error adding legacy column:', err);
    } else if (!err) {
      console.log('✅ Added legacy column to assessments');
    } else {
      console.log('ℹ️  legacy column already exists');
    }
  });

  // Add legacy_feature_set_id column to assessments table
  db.run(`ALTER TABLE assessments ADD COLUMN legacy_feature_set_id INTEGER`, (err) => {
    if (err && !err.message.includes('duplicate column')) {
      console.error('Error adding legacy_feature_set_id column:', err);
    } else if (!err) {
      console.log('✅ Added legacy_feature_set_id column to assessments');
    } else {
      console.log('ℹ️  legacy_feature_set_id column already exists');
    }
  });
});

db.close(() => {
  console.log('\n✅ Database schema updates complete');
});
