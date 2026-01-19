const path = require('path');
const fs = require('fs');
const sqlite3 = require('sqlite3').verbose();

const DB_DIR = path.join(__dirname, '..', 'data');
const DB_PATH = path.join(DB_DIR, 'catalogue.db');

const db = new sqlite3.Database(DB_PATH);

db.serialize(() => {
  // Assessments table
  db.run(`CREATE TABLE IF NOT EXISTS assessments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    code TEXT UNIQUE NOT NULL,
    user_name TEXT,
    service_name TEXT,
    service_type TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP
  )`);

  // Assessment responses table
  db.run(`CREATE TABLE IF NOT EXISTS assessment_responses (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    assessment_id INTEGER NOT NULL,
    component_code TEXT NOT NULL,
    feature_id TEXT NOT NULL,
    response TEXT NOT NULL,
    FOREIGN KEY (assessment_id) REFERENCES assessments(id),
    UNIQUE(assessment_id, feature_id)
  )`);

  console.log('Assessment tables created successfully');
});

db.close();
