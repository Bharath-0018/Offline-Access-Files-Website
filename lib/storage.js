// lib/storage.js - Scalable Local Storage Manager for 1.5GB+ Large Files, HTTP Range Streaming, and Quotas
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { query, get, run } = require('./db');
const { STORAGE_ROOT } = require('./auth');

const TEMP_ROOT = process.env.VERCEL ? path.join('/tmp', 'temp') : path.join(__dirname, '..', 'data', 'temp');
if (!fs.existsSync(TEMP_ROOT)) {
  fs.mkdirSync(TEMP_ROOT, { recursive: true });
}

// Map extensions to categories and MIME types
const EXT_MAP = {
  // Movies & Videos
  mp4: { category: 'movies', mime: 'video/mp4' },
  mkv: { category: 'movies', mime: 'video/x-matroska' },
  avi: { category: 'movies', mime: 'video/x-msvideo' },
  mov: { category: 'movies', mime: 'video/quicktime' },
  webm: { category: 'movies', mime: 'video/webm' },
  wmv: { category: 'movies', mime: 'video/x-ms-wmv' },
  flv: { category: 'movies', mime: 'video/x-flv' },
  m4v: { category: 'movies', mime: 'video/x-m4v' },
  ts:  { category: 'movies', mime: 'video/mp2t' },

  // Audio
  mp3: { category: 'audio', mime: 'audio/mpeg' },
  wav: { category: 'audio', mime: 'audio/wav' },
  flac: { category: 'audio', mime: 'audio/flac' },
  aac: { category: 'audio', mime: 'audio/aac' },
  ogg: { category: 'audio', mime: 'audio/ogg' },
  m4a: { category: 'audio', mime: 'audio/mp4' },

  // Images
  jpg: { category: 'images', mime: 'image/jpeg' },
  jpeg: { category: 'images', mime: 'image/jpeg' },
  png: { category: 'images', mime: 'image/png' },
  gif: { category: 'images', mime: 'image/gif' },
  webp: { category: 'images', mime: 'image/webp' },
  svg: { category: 'images', mime: 'image/svg+xml' },
  bmp: { category: 'images', mime: 'image/bmp' },

  // Documents
  pdf: { category: 'documents', mime: 'application/pdf' },
  doc: { category: 'documents', mime: 'application/msword' },
  docx: { category: 'documents', mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' },
  txt: { category: 'documents', mime: 'text/plain' },
  rtf: { category: 'documents', mime: 'application/rtf' },
  odt: { category: 'documents', mime: 'application/vnd.oasis.opendocument.text' },
  xls: { category: 'documents', mime: 'application/vnd.ms-excel' },
  xlsx: { category: 'documents', mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' },
  ppt: { category: 'documents', mime: 'application/vnd.ms-powerpoint' },
  pptx: { category: 'documents', mime: 'application/vnd.openxmlformats-officedocument.presentationml.presentation' },
  csv: { category: 'documents', mime: 'text/csv' },
  md: { category: 'documents', mime: 'text/markdown' }
};

function getFileInfo(filename) {
  const ext = path.extname(filename).toLowerCase().replace('.', '');
  if (EXT_MAP[ext]) {
    return EXT_MAP[ext];
  }
  return { category: 'others', mime: 'application/octet-stream' };
}

// Prevent path traversal
function sanitizePath(baseDir, relativePath) {
  const safeRelative = path.normalize(relativePath).replace(/^(\.\.[\/\\])+/, '');
  const resolved = path.resolve(baseDir, safeRelative);
  if (!resolved.startsWith(path.resolve(baseDir))) {
    throw new Error('Access denied: Path traversal detected.');
  }
  return resolved;
}

// Get user storage metrics
function getUserStorageStats(userId) {
  const user = get('SELECT storage_quota_bytes FROM users WHERE id = ?', userId);
  const row = get('SELECT COALESCE(SUM(size_bytes), 0) AS total_used, COUNT(*) AS file_count FROM files WHERE user_id = ?', userId);

  let diskFree = 0;
  let diskTotal = 0;
  try {
    if (fs.statfsSync) {
      const stats = fs.statfsSync(STORAGE_ROOT);
      diskFree = stats.bavail * stats.bsize;
      diskTotal = stats.blocks * stats.bsize;
    }
  } catch (err) {
    diskFree = 50 * 1024 * 1024 * 1024; // fallback 50GB
    diskTotal = 100 * 1024 * 1024 * 1024;
  }

  const quota = user ? user.storage_quota_bytes : 10 * 1024 * 1024 * 1024;
  const used = row ? row.total_used : 0;
  const count = row ? row.file_count : 0;

  // Breakdown by category
  const categories = query(
    'SELECT category, COUNT(*) as count, COALESCE(SUM(size_bytes), 0) as total_size FROM files WHERE user_id = ? GROUP BY category',
    userId
  );

  return {
    quotaBytes: quota,
    usedBytes: used,
    fileCount: count,
    freeBytes: Math.max(0, quota - used),
    percentUsed: quota > 0 ? Math.min(100, Math.round((used / quota) * 1000) / 10) : 0,
    diskFreeBytes: diskFree,
    diskTotalBytes: diskTotal,
    categories
  };
}

// List user files with optional category, folder, search and sorting
function listUserFiles(userId, { category, folderId, search, sortBy = 'created_at', sortOrder = 'DESC' } = {}) {
  let sql = 'SELECT * FROM files WHERE user_id = ?';
  const params = [userId];

  if (category && category !== 'all') {
    sql += ' AND category = ?';
    params.push(category);
  }

  if (folderId !== undefined) {
    if (folderId === 'root' || folderId === null) {
      sql += ' AND folder_id IS NULL';
    } else {
      sql += ' AND folder_id = ?';
      params.push(folderId);
    }
  }

  if (search && search.trim()) {
    sql += ' AND (name LIKE ? OR original_name LIKE ?)';
    params.push(`%${search.trim()}%`, `%${search.trim()}%`);
  }

  // Sanitize sort columns to avoid SQL injection
  const validSorts = ['name', 'size_bytes', 'created_at', 'category'];
  const sortCol = validSorts.includes(sortBy) ? sortBy : 'created_at';
  const orderDir = sortOrder.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';

  sql += ` ORDER BY ${sortCol} ${orderDir}`;

  return query(sql, ...params);
}

// List folders for user
function listUserFolders(userId, parentId = null) {
  if (parentId) {
    return query('SELECT * FROM folders WHERE user_id = ? AND parent_id = ? ORDER BY name ASC', userId, parentId);
  }
  return query('SELECT * FROM folders WHERE user_id = ? AND parent_id IS NULL ORDER BY name ASC', userId);
}

// Create a folder
function createFolder(userId, name, parentId = null) {
  const folderId = crypto.randomUUID();
  run(
    'INSERT INTO folders (id, user_id, name, parent_id, created_at) VALUES (?, ?, ?, ?, ?)',
    folderId, userId, name.trim(), parentId || null, Date.now()
  );
  return get('SELECT * FROM folders WHERE id = ?', folderId);
}

// Delete folder and its contents recursively
function deleteFolder(userId, folderId) {
  // Find all files in folder
  const files = query('SELECT * FROM files WHERE user_id = ? AND folder_id = ?', userId, folderId);
  for (const f of files) {
    deleteFile(userId, f.id);
  }

  // Delete subfolders recursively
  const subfolders = query('SELECT id FROM folders WHERE user_id = ? AND parent_id = ?', userId, folderId);
  for (const sub of subfolders) {
    deleteFolder(userId, sub.id);
  }

  run('DELETE FROM folders WHERE id = ? AND user_id = ?', folderId, userId);
  return { success: true };
}

// Register uploaded file
function saveFileMetadata({ userId, folderId, originalName, relativePath, sizeBytes, checksum, mimeType, category }) {
  const fileId = crypto.randomUUID();
  const now = Date.now();

  run(
    `INSERT INTO files 
     (id, user_id, folder_id, name, original_name, category, mime_type, size_bytes, file_path, checksum_sha256, is_offline_available, created_at, updated_at) 
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`,
    fileId, userId, folderId || null, originalName, originalName, category, mimeType, sizeBytes, relativePath, checksum, now, now
  );

  return get('SELECT * FROM files WHERE id = ?', fileId);
}

// Delete file
function deleteFile(userId, fileId) {
  const file = get('SELECT * FROM files WHERE id = ? AND user_id = ?', fileId, userId);
  if (!file) {
    throw new Error('File not found or unauthorized.');
  }

  const userBase = path.join(STORAGE_ROOT, userId);
  const fullPath = sanitizePath(userBase, file.file_path);

  if (fs.existsSync(fullPath)) {
    try {
      fs.unlinkSync(fullPath);
    } catch (e) {
      console.error('Failed to unlink file:', e.message);
    }
  }

  run('DELETE FROM files WHERE id = ? AND user_id = ?', fileId, userId);
  return { success: true };
}

// Rename file
function renameFile(userId, fileId, newName) {
  const file = get('SELECT * FROM files WHERE id = ? AND user_id = ?', fileId, userId);
  if (!file) {
    throw new Error('File not found.');
  }

  run('UPDATE files SET name = ?, updated_at = ? WHERE id = ? AND user_id = ?', newName.trim(), Date.now(), fileId, userId);
  return get('SELECT * FROM files WHERE id = ?', fileId);
}

// Update playback position
function updatePlayPosition(userId, fileId, positionSeconds) {
  run('UPDATE files SET play_position_seconds = ?, updated_at = ? WHERE id = ? AND user_id = ?', positionSeconds, Date.now(), fileId, userId);
  return { success: true };
}

// Stream video/audio with HTTP Range Support (206 Partial Content)
function streamMediaFile(userId, fileId, reqRange, res) {
  const file = get('SELECT * FROM files WHERE id = ? AND user_id = ?', fileId, userId);
  if (!file) {
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Media file not found' }));
    return;
  }

  const userBase = path.join(STORAGE_ROOT, userId);
  const fullPath = sanitizePath(userBase, file.file_path);

  if (!fs.existsSync(fullPath)) {
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'File data missing on disk' }));
    return;
  }

  const stat = fs.statSync(fullPath);
  const fileSize = stat.size;

  if (reqRange) {
    // Parse Range header e.g. "bytes=0-1048576"
    const parts = reqRange.replace(/bytes=/, '').split('-');
    const start = parseInt(parts[0], 10);
    const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;

    if (start >= fileSize || end >= fileSize || start > end) {
      res.writeHead(416, {
        'Content-Range': `bytes */${fileSize}`,
        'Content-Type': file.mime_type
      });
      res.end();
      return;
    }

    const chunksize = end - start + 1;
    const fileStream = fs.createReadStream(fullPath, { start, end });

    res.writeHead(206, {
      'Content-Range': `bytes ${start}-${end}/${fileSize}`,
      'Accept-Ranges': 'bytes',
      'Content-Length': chunksize,
      'Content-Type': file.mime_type,
      'Cache-Control': 'no-cache'
    });

    fileStream.pipe(res);
  } else {
    // Full stream
    res.writeHead(200, {
      'Content-Length': fileSize,
      'Content-Type': file.mime_type,
      'Accept-Ranges': 'bytes',
      'Cache-Control': 'no-cache'
    });
    fs.createReadStream(fullPath).pipe(res);
  }
}

// Download file stream
function downloadFile(userId, fileId, res) {
  const file = get('SELECT * FROM files WHERE id = ? AND user_id = ?', fileId, userId);
  if (!file) {
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'File not found' }));
    return;
  }

  const userBase = path.join(STORAGE_ROOT, userId);
  const fullPath = sanitizePath(userBase, file.file_path);

  if (!fs.existsSync(fullPath)) {
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'File missing on disk' }));
    return;
  }

  const stat = fs.statSync(fullPath);
  res.writeHead(200, {
    'Content-Type': file.mime_type || 'application/octet-stream',
    'Content-Length': stat.size,
    'Content-Disposition': `attachment; filename="${encodeURIComponent(file.original_name)}"`,
    'Accept-Ranges': 'bytes'
  });

  fs.createReadStream(fullPath).pipe(res);
}

// Chunked Upload In-Memory State
const uploadSessions = new Map();

function initChunkedUpload({ userId, fileName, fileSize, folderId }) {
  const uploadId = crypto.randomUUID();
  const info = getFileInfo(fileName);
  const userDir = path.join(STORAGE_ROOT, userId, info.category);
  if (!fs.existsSync(userDir)) {
    fs.mkdirSync(userDir, { recursive: true });
  }

  const tempFilePath = path.join(TEMP_ROOT, `${uploadId}_${fileName}`);
  // Create or empty temp file
  fs.writeFileSync(tempFilePath, Buffer.alloc(0));

  uploadSessions.set(uploadId, {
    uploadId,
    userId,
    fileName,
    fileSize,
    folderId,
    category: info.category,
    mimeType: info.mime,
    tempFilePath,
    receivedBytes: 0,
    hasher: crypto.createHash('sha256'),
    startedAt: Date.now()
  });

  return { uploadId, chunkSize: 5 * 1024 * 1024 }; // 5MB recommendation
}

function appendUploadChunk(uploadId, chunkStream, callback) {
  const session = uploadSessions.get(uploadId);
  if (!session) {
    return callback(new Error('Invalid or expired upload session.'));
  }

  const writeStream = fs.createWriteStream(session.tempFilePath, { flags: 'a' });

  chunkStream.on('data', (chunk) => {
    session.hasher.update(chunk);
    session.receivedBytes += chunk.length;
  });

  chunkStream.pipe(writeStream);

  writeStream.on('finish', () => {
    callback(null, {
      receivedBytes: session.receivedBytes,
      totalBytes: session.fileSize,
      percentage: Math.min(100, Math.round((session.receivedBytes / session.fileSize) * 100))
    });
  });

  writeStream.on('error', (err) => {
    callback(err);
  });
}

function finalizeChunkedUpload(uploadId) {
  const session = uploadSessions.get(uploadId);
  if (!session) {
    throw new Error('Upload session not found.');
  }

  const checksum = session.hasher.digest('hex');
  const userDir = path.join(STORAGE_ROOT, session.userId, session.category);
  const safeBaseName = `${Date.now()}_${session.fileName.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
  const finalPath = path.join(userDir, safeBaseName);
  const relativePath = path.join(session.category, safeBaseName);

  // Move temp file to final storage location
  fs.renameSync(session.tempFilePath, finalPath);

  const stat = fs.statSync(finalPath);

  // Save metadata
  const fileRecord = saveFileMetadata({
    userId: session.userId,
    folderId: session.folderId,
    originalName: session.fileName,
    relativePath,
    sizeBytes: stat.size,
    checksum,
    mimeType: session.mimeType,
    category: session.category
  });

  uploadSessions.delete(uploadId);
  return fileRecord;
}

function cancelChunkedUpload(uploadId) {
  const session = uploadSessions.get(uploadId);
  if (session) {
    if (fs.existsSync(session.tempFilePath)) {
      try { fs.unlinkSync(session.tempFilePath); } catch (e) {}
    }
    uploadSessions.delete(uploadId);
  }
  return { success: true };
}

module.exports = {
  getFileInfo,
  getUserStorageStats,
  listUserFiles,
  listUserFolders,
  createFolder,
  deleteFolder,
  saveFileMetadata,
  deleteFile,
  renameFile,
  updatePlayPosition,
  streamMediaFile,
  downloadFile,
  initChunkedUpload,
  appendUploadChunk,
  finalizeChunkedUpload,
  cancelChunkedUpload,
  sanitizePath
};
