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
      'Cache-Control': 'no-cache',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Expose-Headers': 'Content-Range, Accept-Ranges, Content-Length, Content-Type'
    });

    fileStream.pipe(res);
  } else {
    // Full stream
    res.writeHead(200, {
      'Content-Length': fileSize,
      'Content-Type': file.mime_type,
      'Accept-Ranges': 'bytes',
      'Cache-Control': 'no-cache',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Expose-Headers': 'Content-Range, Accept-Ranges, Content-Length, Content-Type'
    });
    fs.createReadStream(fullPath).pipe(res);
  }
}

// Download file stream
function downloadFile(userId, fileId, res) {
  const file = get('SELECT * FROM files WHERE id = ? AND user_id = ?', fileId, userId);
  if (!file) {
    res.writeHead(404, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
    res.end(JSON.stringify({ error: 'File not found' }));
    return;
  }

  const userBase = path.join(STORAGE_ROOT, userId);
  const fullPath = sanitizePath(userBase, file.file_path);

  if (!fs.existsSync(fullPath)) {
    res.writeHead(404, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
    res.end(JSON.stringify({ error: 'File missing on disk' }));
    return;
  }

  const stat = fs.statSync(fullPath);
  res.writeHead(200, {
    'Content-Type': file.mime_type || 'application/octet-stream',
    'Content-Length': stat.size,
    'Content-Disposition': `attachment; filename="${encodeURIComponent(file.original_name)}"`,
    'Accept-Ranges': 'bytes',
    'Access-Control-Allow-Origin': '*'
  });

  fs.createReadStream(fullPath).pipe(res);
}

// Helper to stream-calculate SHA-256 without memory spikes
function calculateFileSha256(filePath) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256');
    const stream = fs.createReadStream(filePath, { highWaterMark: 4 * 1024 * 1024 });
    stream.on('data', chunk => hash.update(chunk));
    stream.on('end', () => resolve(hash.digest('hex')));
    stream.on('error', reject);
  });
}

function initChunkedUpload({ userId, fileName, fileSize, chunkSize: customChunkSize, folderId, clientChecksum }) {
  const uploadId = crypto.randomUUID();
  const info = getFileInfo(fileName);
  const chunkSize = (customChunkSize && customChunkSize > 0) ? parseInt(customChunkSize, 10) : (5 * 1024 * 1024);
  const totalChunks = Math.ceil(fileSize / chunkSize) || 1;

  // Validate user storage quota (50 GB default)
  const stats = getUserStorageStats(userId);
  if (stats.usedBytes + fileSize > stats.quotaBytes) {
    throw new Error(`Storage quota exceeded. File size: ${(fileSize / (1024 * 1024)).toFixed(1)} MB, Available quota: ${(stats.freeBytes / (1024 * 1024)).toFixed(1)} MB.`);
  }

  const safeFileName = fileName.replace(/[^a-zA-Z0-9._-]/g, '_');
  const tempFilePath = path.join(TEMP_ROOT, `${uploadId}_${safeFileName}`);

  // Create/truncate temp file
  const fd = fs.openSync(tempFilePath, 'w');
  try {
    fs.ftruncateSync(fd, fileSize);
  } catch (e) {}
  fs.closeSync(fd);

  const now = Date.now();
  run(
    `INSERT INTO upload_sessions 
     (upload_id, user_id, file_name, file_size, folder_id, category, mime_type, chunk_size, total_chunks, received_chunks, received_bytes, temp_file_path, client_checksum, status, created_at, updated_at) 
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, '[]', 0, ?, ?, 'active', ?, ?)`,
    uploadId, userId, fileName, fileSize, folderId || null, info.category, info.mime, chunkSize, totalChunks, tempFilePath, clientChecksum || null, now, now
  );

  return {
    uploadId,
    chunkSize,
    totalChunks,
    fileSize,
    fileName
  };
}

function getChunkedUploadStatus(uploadId, userId) {
  const session = get('SELECT * FROM upload_sessions WHERE upload_id = ? AND user_id = ?', uploadId, userId);
  if (!session) {
    throw new Error('Upload session not found.');
  }

  let receivedChunks = [];
  try {
    receivedChunks = JSON.parse(session.received_chunks || '[]');
  } catch (e) {}

  return {
    uploadId: session.upload_id,
    fileName: session.file_name,
    fileSize: session.file_size,
    chunkSize: session.chunk_size,
    totalChunks: session.total_chunks,
    receivedChunks,
    receivedBytes: session.received_bytes,
    percent: Math.min(100, Math.round((session.received_bytes / session.file_size) * 100)),
    status: session.status
  };
}

function writeUploadChunk({ uploadId, userId, chunkIndex, chunkBuffer }, callback) {
  const session = get('SELECT * FROM upload_sessions WHERE upload_id = ? AND user_id = ?', uploadId, userId);
  if (!session) {
    return callback(new Error('Upload session not found or unauthorized.'));
  }
  if (session.status !== 'active') {
    return callback(new Error(`Upload session is ${session.status}.`));
  }

  const offset = chunkIndex * session.chunk_size;
  let fd;
  try {
    fd = fs.openSync(session.temp_file_path, 'r+');
    fs.writeSync(fd, chunkBuffer, 0, chunkBuffer.length, offset);
    fs.closeSync(fd);
  } catch (err) {
    if (fd !== undefined) {
      try { fs.closeSync(fd); } catch (e) {}
    }
    return callback(err);
  }

  let receivedChunks = [];
  try {
    receivedChunks = JSON.parse(session.received_chunks || '[]');
  } catch (e) {}

  if (!receivedChunks.includes(chunkIndex)) {
    receivedChunks.push(chunkIndex);
  }

  // Calculate actual bytes received based on received chunks
  let receivedBytes = 0;
  for (const idx of receivedChunks) {
    if (idx === session.total_chunks - 1) {
      receivedBytes += (session.file_size - (idx * session.chunk_size));
    } else {
      receivedBytes += session.chunk_size;
    }
  }
  receivedBytes = Math.min(session.file_size, Math.max(session.received_bytes, receivedBytes));

  run(
    'UPDATE upload_sessions SET received_chunks = ?, received_bytes = ?, updated_at = ? WHERE upload_id = ?',
    JSON.stringify(receivedChunks), receivedBytes, Date.now(), uploadId
  );

  const percent = Math.min(100, Math.round((receivedBytes / session.file_size) * 100));

  callback(null, {
    uploadId,
    chunkIndex,
    receivedBytes,
    totalBytes: session.file_size,
    percentage: percent,
    receivedChunksCount: receivedChunks.length,
    totalChunks: session.total_chunks
  });
}

async function finalizeChunkedUpload(uploadId, userId, clientChecksum) {
  const session = get('SELECT * FROM upload_sessions WHERE upload_id = ? AND user_id = ?', uploadId, userId);
  if (!session) {
    throw new Error('Upload session not found.');
  }

  if (session.status === 'completed') {
    const existing = get('SELECT * FROM files WHERE user_id = ? AND original_name = ? ORDER BY created_at DESC LIMIT 1', userId, session.file_name);
    if (existing) return existing;
  }

  let receivedChunks = [];
  try {
    receivedChunks = JSON.parse(session.received_chunks || '[]');
  } catch (e) {}

  if (receivedChunks.length < session.total_chunks) {
    throw new Error(`Incomplete upload: received ${receivedChunks.length} of ${session.total_chunks} chunks.`);
  }

  if (!fs.existsSync(session.temp_file_path)) {
    throw new Error('Temp file data missing on server.');
  }

  // Streaming SHA-256 calculation
  const computedChecksum = await calculateFileSha256(session.temp_file_path);

  // Verify client checksum if provided
  const expectedChecksum = clientChecksum || session.client_checksum;
  if (expectedChecksum && expectedChecksum.toLowerCase() !== computedChecksum.toLowerCase()) {
    try { fs.unlinkSync(session.temp_file_path); } catch (e) {}
    run('UPDATE upload_sessions SET status = ?, updated_at = ? WHERE upload_id = ?', 'failed', Date.now(), uploadId);
    throw new Error(`File integrity verification failed. Expected ${expectedChecksum}, computed ${computedChecksum}.`);
  }

  const userDir = path.join(STORAGE_ROOT, session.user_id, session.category);
  if (!fs.existsSync(userDir)) {
    fs.mkdirSync(userDir, { recursive: true });
  }

  const safeBaseName = `${Date.now()}_${session.file_name.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
  const finalPath = path.join(userDir, safeBaseName);
  const relativePath = path.join(session.category, safeBaseName);

  // Move temp file to persistent user storage
  fs.renameSync(session.temp_file_path, finalPath);

  const stat = fs.statSync(finalPath);

  // Save metadata
  const fileRecord = saveFileMetadata({
    userId: session.user_id,
    folderId: session.folder_id,
    originalName: session.file_name,
    relativePath,
    sizeBytes: stat.size,
    checksum: computedChecksum,
    mimeType: session.mime_type,
    category: session.category
  });

  run('UPDATE upload_sessions SET status = ?, updated_at = ? WHERE upload_id = ?', 'completed', Date.now(), uploadId);

  return fileRecord;
}

function cancelChunkedUpload(uploadId, userId) {
  const session = get('SELECT * FROM upload_sessions WHERE upload_id = ? AND user_id = ?', uploadId, userId);
  if (session) {
    if (fs.existsSync(session.temp_file_path)) {
      try { fs.unlinkSync(session.temp_file_path); } catch (e) {}
    }
    run('UPDATE upload_sessions SET status = ?, updated_at = ? WHERE upload_id = ?', 'cancelled', Date.now(), uploadId);
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
  getChunkedUploadStatus,
  writeUploadChunk,
  finalizeChunkedUpload,
  cancelChunkedUpload,
  sanitizePath
};
