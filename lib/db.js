// lib/db.js - High-performance local SQLite database manager for Offline Personal Cloud
const { DatabaseSync } = require('node:sqlite');
const path = require('node:path');
const fs = require('node:fs');

const DB_PATH = process.env.DB_PATH || (process.env.VERCEL ? path.join('/tmp', 'cloud.db') : path.join(__dirname, '..', 'data', 'cloud.db'));

// Ensure data directory exists
const dataDir = path.dirname(DB_PATH);
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const db = new DatabaseSync(DB_PATH);

// Enable WAL mode and foreign keys for high concurrent performance and data integrity
db.exec('PRAGMA journal_mode = WAL;');
db.exec('PRAGMA foreign_keys = ON;');

// Initialize tables
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    email TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    password_salt TEXT NOT NULL,
    is_verified INTEGER DEFAULT 0,
    storage_quota_bytes INTEGER DEFAULT 53687091200, -- 50 GB default quota
    created_at INTEGER NOT NULL,
    last_login_at INTEGER
  );

  CREATE TABLE IF NOT EXISTS otps (
    id TEXT PRIMARY KEY,
    email TEXT NOT NULL,
    code TEXT NOT NULL,
    purpose TEXT NOT NULL,
    expires_at INTEGER NOT NULL,
    used INTEGER DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS sessions (
    token TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    expires_at INTEGER NOT NULL,
    created_at INTEGER NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS folders (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    name TEXT NOT NULL,
    parent_id TEXT,
    created_at INTEGER NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS files (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    folder_id TEXT,
    name TEXT NOT NULL,
    original_name TEXT NOT NULL,
    category TEXT NOT NULL, -- 'movies', 'videos', 'documents', 'images', 'audio', 'others'
    mime_type TEXT NOT NULL,
    size_bytes INTEGER NOT NULL,
    file_path TEXT NOT NULL,
    checksum_sha256 TEXT,
    upload_status TEXT DEFAULT 'completed',
    is_offline_available INTEGER DEFAULT 1,
    gdrive_file_id TEXT,
    gdrive_synced_at INTEGER,
    play_position_seconds REAL DEFAULT 0,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS upload_sessions (
    upload_id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    file_name TEXT NOT NULL,
    file_size INTEGER NOT NULL,
    folder_id TEXT,
    category TEXT NOT NULL,
    mime_type TEXT NOT NULL,
    chunk_size INTEGER NOT NULL,
    total_chunks INTEGER NOT NULL,
    received_chunks TEXT NOT NULL DEFAULT '[]',
    received_bytes INTEGER NOT NULL DEFAULT 0,
    temp_file_path TEXT NOT NULL,
    client_checksum TEXT,
    status TEXT NOT NULL DEFAULT 'active',
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS devices (
    id TEXT PRIMARY KEY,
    device_name TEXT NOT NULL,
    device_type TEXT NOT NULL,
    ip_address TEXT NOT NULL,
    port INTEGER NOT NULL,
    pair_code TEXT,
    is_paired INTEGER DEFAULT 0,
    pair_token TEXT,
    user_id TEXT,
    last_seen_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS transfers (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    file_id TEXT,
    file_name TEXT NOT NULL,
    file_size INTEGER NOT NULL,
    direction TEXT NOT NULL, -- 'send', 'receive'
    peer_device_name TEXT NOT NULL,
    peer_ip TEXT NOT NULL,
    bytes_transferred INTEGER DEFAULT 0,
    status TEXT NOT NULL, -- 'pending', 'transferring', 'paused', 'completed', 'failed', 'cancelled'
    speed_bps REAL DEFAULT 0,
    error_message TEXT,
    started_at INTEGER NOT NULL,
    completed_at INTEGER
  );

  CREATE TABLE IF NOT EXISTS system_settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );
`);

// Migration for existing databases
try {
  db.exec('ALTER TABLE files ADD COLUMN upload_status TEXT DEFAULT "completed";');
} catch (e) {}

// Pre-create indexes for fast search and listing
db.exec(`
  CREATE INDEX IF NOT EXISTS idx_files_user_cat ON files(user_id, category);
  CREATE INDEX IF NOT EXISTS idx_files_user_folder ON files(user_id, folder_id);
  CREATE INDEX IF NOT EXISTS idx_files_name ON files(name);
  CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
  CREATE INDEX IF NOT EXISTS idx_devices_ip ON devices(ip_address);
  CREATE INDEX IF NOT EXISTS idx_upload_sessions_user ON upload_sessions(user_id);
`);

module.exports = {
  db,
  query(sql, ...params) {
    const stmt = db.prepare(sql);
    return stmt.all(...params);
  },
  get(sql, ...params) {
    const stmt = db.prepare(sql);
    return stmt.get(...params);
  },
  run(sql, ...params) {
    const stmt = db.prepare(sql);
    return stmt.run(...params);
  }
};
