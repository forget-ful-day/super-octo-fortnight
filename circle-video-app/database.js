const Database = require('better-sqlite3');
const path = require('path');

const db = new Database(path.join(__dirname, 'database.sqlite'));

// Initialize database tables
db.exec(`
  CREATE TABLE IF NOT EXISTS circles (
    id TEXT PRIMARY KEY,
    filename TEXT NOT NULL,
    github_url TEXT NOT NULL,
    created_at INTEGER DEFAULT (strftime('%s', 'now')),
    likes INTEGER DEFAULT 0,
    complaints INTEGER DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS comments (
    id TEXT PRIMARY KEY,
    circle_id TEXT NOT NULL,
    author TEXT NOT NULL,
    content TEXT NOT NULL,
    created_at INTEGER DEFAULT (strftime('%s', 'now')),
    FOREIGN KEY (circle_id) REFERENCES circles(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS likes (
    id TEXT PRIMARY KEY,
    circle_id TEXT NOT NULL,
    user_ip TEXT NOT NULL,
    created_at INTEGER DEFAULT (strftime('%s', 'now')),
    FOREIGN KEY (circle_id) REFERENCES circles(id) ON DELETE CASCADE,
    UNIQUE(circle_id, user_ip)
  );

  CREATE TABLE IF NOT EXISTS complaints (
    id TEXT PRIMARY KEY,
    circle_id TEXT NOT NULL,
    user_ip TEXT NOT NULL,
    reason TEXT NOT NULL,
    created_at INTEGER DEFAULT (strftime('%s', 'now')),
    FOREIGN KEY (circle_id) REFERENCES circles(id) ON DELETE CASCADE,
    UNIQUE(circle_id, user_ip)
  );

  CREATE TABLE IF NOT EXISTS admin_settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );
`);

module.exports = db;
