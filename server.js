// server.js - Central HTTP/WebSocket Server for Offline Personal Cloud & Local File Sharing
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const url = require('node:url');
const { WebSocketServer } = require('./lib/websocket');
const auth = require('./lib/auth');
const storage = require('./lib/storage');
const DeviceDiscovery = require('./lib/discovery');
const TransferEngine = require('./lib/transfer');
const gdrive = require('./lib/gdrive');
const { get, query, run } = require('./lib/db');

const PORT = parseInt(process.env.PORT || '3000', 10);
const NODE_ENV = process.env.NODE_ENV || 'development';
const PUBLIC_DOMAIN = process.env.PUBLIC_DOMAIN || 'OfflineAccess.com';
const FORCE_HTTPS = process.env.FORCE_HTTPS === 'true' || NODE_ENV === 'production';
const PUBLIC_DIR = path.join(__dirname, 'public');

// Initialize WebSockets, Discovery, and Transfer engines
const wsServer = new WebSocketServer();
const discovery = new DeviceDiscovery(PORT);
const transferEngine = new TransferEngine(wsServer);

// Helper for sending JSON
function sendJson(res, statusCode, data) {
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Upload-Id, Range'
  });
  res.end(JSON.stringify(data));
}

// Helper for parsing JSON body
function parseJsonBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => {
      body += chunk;
      if (body.length > 10 * 1024 * 1024) { // 10MB limit for JSON
        reject(new Error('Payload too large'));
      }
    });
    req.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (e) {
        reject(e);
      }
    });
    req.on('error', reject);
  });
}

// Extract authenticated user from Authorization header or cookie
function getAuthenticatedUser(req) {
  let token = null;
  const authHeader = req.headers['authorization'];
  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.substring(7);
  } else if (req.headers.cookie) {
    const match = req.headers.cookie.match(/cloud_token=([^;]+)/);
    if (match) token = match[1];
  }

  if (!token) return null;
  return auth.getUserBySession(token);
}

// MIME types for static files
const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.vtt': 'text/vtt',
  '.mp4': 'video/mp4',
  '.mp3': 'audio/mpeg'
};

const server = http.createServer(async (req, res) => {
  const parsedUrl = url.parse(req.url, true);
  const pathname = parsedUrl.pathname;
  const method = req.method;

  // Production HTTPS Redirection
  if (FORCE_HTTPS) {
    const proto = req.headers['x-forwarded-proto'];
    if (proto && proto === 'http') {
      const host = req.headers['x-forwarded-host'] || req.headers.host || PUBLIC_DOMAIN;
      res.writeHead(301, {
        'Location': `https://${host}${req.url}`,
        'Strict-Transport-Security': 'max-age=31536000; includeSubDomains'
      });
      res.end();
      return;
    }
  }

  // Health Check Probe (for Cloud Hosting / Render / Railway / AWS / Docker)
  if (pathname === '/api/health' || pathname === '/health') {
    return sendJson(res, 200, {
      status: 'ok',
      service: 'OfflineAccess',
      environment: NODE_ENV,
      domain: PUBLIC_DOMAIN,
      uptime: Math.round(process.uptime()),
      timestamp: Date.now()
    });
  }

  // CORS preflight
  if (method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Upload-Id, Range'
    });
    res.end();
    return;
  }

  try {
    // -------------------------------------------------------------
    // API ROUTES
    // -------------------------------------------------------------

    // --- Authentication Routes ---
    if (pathname === '/api/auth/register' && method === 'POST') {
      const { email, password, name } = await parseJsonBody(req);
      if (!email || !password || !name) {
        return sendJson(res, 400, { error: 'Email, password, and name are required.' });
      }
      try {
        const result = auth.registerUser({ email, password, name });
        return sendJson(res, 201, {
          success: true,
          message: 'Account created! Please verify with the OTP code below.',
          ...result
        });
      } catch (err) {
        return sendJson(res, 400, { error: err.message });
      }
    }

    if (pathname === '/api/auth/verify-otp' && method === 'POST') {
      const { email, code } = await parseJsonBody(req);
      if (!email || !code) {
        return sendJson(res, 400, { error: 'Email and OTP code are required.' });
      }
      try {
        const result = auth.confirmRegistration(email, code);
        return sendJson(res, 200, {
          success: true,
          message: 'Verification successful!',
          token: result.sessionToken,
          user: result.user
        });
      } catch (err) {
        return sendJson(res, 400, { error: err.message });
      }
    }

    if (pathname === '/api/auth/login' && method === 'POST') {
      const { email, password } = await parseJsonBody(req);
      if (!email || !password) {
        return sendJson(res, 400, { error: 'Email and password are required.' });
      }
      try {
        const result = auth.loginUser(email, password);
        return sendJson(res, 200, result);
      } catch (err) {
        return sendJson(res, 401, { error: err.message });
      }
    }

    if (pathname === '/api/auth/me' && method === 'GET') {
      const user = getAuthenticatedUser(req);
      if (!user) {
        return sendJson(res, 401, { error: 'Not authenticated' });
      }
      return sendJson(res, 200, { user });
    }

    if (pathname === '/api/auth/logout' && method === 'POST') {
      const authHeader = req.headers['authorization'];
      if (authHeader && authHeader.startsWith('Bearer ')) {
        auth.logoutSession(authHeader.substring(7));
      }
      return sendJson(res, 200, { success: true });
    }

    if (pathname === '/api/auth/forgot-password' && method === 'POST') {
      const { email } = await parseJsonBody(req);
      const resData = auth.requestPasswordReset(email);
      return sendJson(res, 200, resData);
    }

    if (pathname === '/api/auth/reset-password' && method === 'POST') {
      const { email, code, newPassword } = await parseJsonBody(req);
      try {
        const resData = auth.resetPassword(email, code, newPassword);
        return sendJson(res, 200, resData);
      } catch (e) {
        return sendJson(res, 400, { error: e.message });
      }
    }

    // --- File Storage & Management Routes ---
    if (pathname === '/api/files' && method === 'GET') {
      const user = getAuthenticatedUser(req);
      if (!user) return sendJson(res, 401, { error: 'Unauthorized' });

      const { category, folderId, search, sortBy, sortOrder } = parsedUrl.query;
      const files = storage.listUserFiles(user.id, { category, folderId, search, sortBy, sortOrder });
      return sendJson(res, 200, { files });
    }

    if (pathname === '/api/folders' && method === 'GET') {
      const user = getAuthenticatedUser(req);
      if (!user) return sendJson(res, 401, { error: 'Unauthorized' });

      const parentId = parsedUrl.query.parentId || null;
      const folders = storage.listUserFolders(user.id, parentId);
      return sendJson(res, 200, { folders });
    }

    if (pathname === '/api/folders' && method === 'POST') {
      const user = getAuthenticatedUser(req);
      if (!user) return sendJson(res, 401, { error: 'Unauthorized' });

      const { name, parentId } = await parseJsonBody(req);
      if (!name) return sendJson(res, 400, { error: 'Folder name is required.' });

      const folder = storage.createFolder(user.id, name, parentId);
      return sendJson(res, 201, { folder });
    }

    if (pathname.startsWith('/api/folders/') && method === 'DELETE') {
      const user = getAuthenticatedUser(req);
      if (!user) return sendJson(res, 401, { error: 'Unauthorized' });

      const folderId = pathname.replace('/api/folders/', '');
      storage.deleteFolder(user.id, folderId);
      return sendJson(res, 200, { success: true });
    }

    if (pathname === '/api/storage/stats' && method === 'GET') {
      const user = getAuthenticatedUser(req);
      if (!user) return sendJson(res, 401, { error: 'Unauthorized' });

      const stats = storage.getUserStorageStats(user.id);
      return sendJson(res, 200, stats);
    }

    // --- Chunked Upload Endpoints (Scalable for 1.5GB - 5GB+ files) ---
    if (pathname === '/api/files/chunk/init' && method === 'POST') {
      const user = getAuthenticatedUser(req);
      if (!user) return sendJson(res, 401, { error: 'Unauthorized' });

      const { fileName, fileSize, folderId } = await parseJsonBody(req);
      if (!fileName || !fileSize) {
        return sendJson(res, 400, { error: 'fileName and fileSize are required.' });
      }

      // Check quota
      const stats = storage.getUserStorageStats(user.id);
      if (stats.usedBytes + fileSize > stats.quotaBytes) {
        return sendJson(res, 400, { error: 'Storage quota exceeded. Cannot upload this file.' });
      }

      const session = storage.initChunkedUpload({
        userId: user.id,
        fileName,
        fileSize,
        folderId
      });

      return sendJson(res, 200, session);
    }

    if (pathname === '/api/files/chunk/upload' && method === 'POST') {
      const uploadId = req.headers['x-upload-id'];
      if (!uploadId) {
        return sendJson(res, 400, { error: 'Missing X-Upload-Id header.' });
      }

      storage.appendUploadChunk(uploadId, req, (err, progress) => {
        if (err) {
          return sendJson(res, 500, { error: err.message });
        }
        return sendJson(res, 200, { success: true, ...progress });
      });
      return;
    }

    if (pathname === '/api/files/chunk/finalize' && method === 'POST') {
      const { uploadId } = await parseJsonBody(req);
      try {
        const fileRecord = storage.finalizeChunkedUpload(uploadId);
        return sendJson(res, 200, { success: true, file: fileRecord });
      } catch (err) {
        return sendJson(res, 400, { error: err.message });
      }
    }

    if (pathname === '/api/files/chunk/cancel' && method === 'POST') {
      const { uploadId } = await parseJsonBody(req);
      storage.cancelChunkedUpload(uploadId);
      return sendJson(res, 200, { success: true });
    }

    // --- Streaming Media (HTTP 206 Range for Offline Videos/Audios) ---
    if (pathname.startsWith('/api/files/stream/') && method === 'GET') {
      const fileId = pathname.replace('/api/files/stream/', '');
      const user = getAuthenticatedUser(req) || { id: parsedUrl.query.userId };

      if (!user || !user.id) {
        // Fallback for direct <video> tags if token passed in query
        const queryToken = parsedUrl.query.token;
        const queryUser = auth.getUserBySession(queryToken);
        if (queryUser) {
          storage.streamMediaFile(queryUser.id, fileId, req.headers.range, res);
          return;
        }
        return sendJson(res, 401, { error: 'Unauthorized to stream media' });
      }

      storage.streamMediaFile(user.id, fileId, req.headers.range, res);
      return;
    }

    // --- Download File ---
    if (pathname.startsWith('/api/files/download/') && method === 'GET') {
      const fileId = pathname.replace('/api/files/download/', '');
      const user = getAuthenticatedUser(req) || auth.getUserBySession(parsedUrl.query.token);
      if (!user) return sendJson(res, 401, { error: 'Unauthorized' });

      storage.downloadFile(user.id, fileId, res);
      return;
    }

    // --- Rename File ---
    if (pathname.match(/^\/api\/files\/([^\/]+)\/rename$/) && method === 'PUT') {
      const user = getAuthenticatedUser(req);
      if (!user) return sendJson(res, 401, { error: 'Unauthorized' });

      const fileId = pathname.split('/')[3];
      const { newName } = await parseJsonBody(req);
      if (!newName) return sendJson(res, 400, { error: 'New name required.' });

      try {
        const file = storage.renameFile(user.id, fileId, newName);
        return sendJson(res, 200, { file });
      } catch (e) {
        return sendJson(res, 400, { error: e.message });
      }
    }

    // --- Delete File ---
    if (pathname.match(/^\/api\/files\/([^\/]+)$/) && method === 'DELETE') {
      const user = getAuthenticatedUser(req);
      if (!user) return sendJson(res, 401, { error: 'Unauthorized' });

      const fileId = pathname.replace('/api/files/', '');
      try {
        storage.deleteFile(user.id, fileId);
        return sendJson(res, 200, { success: true });
      } catch (e) {
        return sendJson(res, 400, { error: e.message });
      }
    }

    // --- Update Play Position ---
    if (pathname.match(/^\/api\/files\/([^\/]+)\/play-position$/) && method === 'POST') {
      const user = getAuthenticatedUser(req);
      if (!user) return sendJson(res, 401, { error: 'Unauthorized' });

      const fileId = pathname.split('/')[3];
      const { positionSeconds } = await parseJsonBody(req);
      storage.updatePlayPosition(user.id, fileId, positionSeconds);
      return sendJson(res, 200, { success: true });
    }

    // --- Local Device Discovery & Pairing ---
    if (pathname === '/api/devices' && method === 'GET') {
      const devices = discovery.getDiscoveredDevices();
      return sendJson(res, 200, { devices });
    }

    if (pathname === '/api/devices/my-info' && method === 'GET') {
      const info = discovery.getMyPairingInfo();
      return sendJson(res, 200, { ...info, allIps: discovery.getLocalIps() });
    }

    if (pathname === '/api/devices/pair' && method === 'POST') {
      const { deviceId, pairCode } = await parseJsonBody(req);
      try {
        const result = discovery.pairDevice(deviceId, pairCode);
        return sendJson(res, 200, result);
      } catch (err) {
        return sendJson(res, 400, { error: err.message });
      }
    }

    if (pathname === '/api/devices/unpair' && method === 'POST') {
      const { deviceId } = await parseJsonBody(req);
      discovery.unpairDevice(deviceId);
      return sendJson(res, 200, { success: true });
    }

    // --- P2P / LAN File Transfers ---
    if (pathname === '/api/transfers/start' && method === 'POST') {
      const user = getAuthenticatedUser(req);
      if (!user) return sendJson(res, 401, { error: 'Unauthorized' });

      const { fileId, targetDeviceId, targetIp, targetPort } = await parseJsonBody(req);
      try {
        const transfer = transferEngine.startOutgoingTransfer({
          userId: user.id,
          fileId,
          targetDeviceId,
          targetIp,
          targetPort
        });
        return sendJson(res, 200, { success: true, transfer });
      } catch (err) {
        return sendJson(res, 400, { error: err.message });
      }
    }

    if (pathname === '/api/transfers/incoming' && method === 'POST') {
      // Direct stream endpoint called by peer device
      const { transferId, fileName, fileSize, mimeType } = parsedUrl.query;
      transferEngine.handleIncomingStream(req, res, {
        transferId: transferId || req.headers['x-transfer-id'],
        fileName: fileName || req.headers['x-file-name'] || 'received_file',
        fileSize: parseInt(fileSize || req.headers['content-length'] || '0', 10),
        mimeType: mimeType || req.headers['content-type']
      });
      return;
    }

    if (pathname.match(/^\/api\/transfers\/([^\/]+)\/cancel$/) && method === 'POST') {
      const transferId = pathname.split('/')[3];
      transferEngine.cancelTransfer(transferId);
      return sendJson(res, 200, { success: true });
    }

    if (pathname === '/api/transfers' && method === 'GET') {
      const user = getAuthenticatedUser(req);
      if (!user) return sendJson(res, 401, { error: 'Unauthorized' });

      const transfers = transferEngine.listTransfers(user.id);
      return sendJson(res, 200, { transfers });
    }

    // --- Google Drive Optional Cloud Integration ---
    if (pathname === '/api/gdrive/status' && method === 'GET') {
      return sendJson(res, 200, gdrive.getStatus());
    }

    if (pathname === '/api/gdrive/configure' && method === 'POST') {
      const { clientId, clientSecret } = await parseJsonBody(req);
      const resData = gdrive.configureOAuth({ clientId, clientSecret });
      return sendJson(res, 200, resData);
    }

    if (pathname === '/api/gdrive/connect' && method === 'POST') {
      const body = await parseJsonBody(req);
      const resData = gdrive.connectAccount(body);
      return sendJson(res, 200, resData);
    }

    if (pathname === '/api/gdrive/disconnect' && method === 'POST') {
      const resData = gdrive.disconnectAccount();
      return sendJson(res, 200, resData);
    }

    if (pathname.match(/^\/api\/gdrive\/backup\/([^\/]+)$/) && method === 'POST') {
      const user = getAuthenticatedUser(req);
      if (!user) return sendJson(res, 401, { error: 'Unauthorized' });

      const fileId = pathname.split('/')[4];
      try {
        const resData = gdrive.backupFile(user.id, fileId);
        return sendJson(res, 200, resData);
      } catch (err) {
        return sendJson(res, 400, { error: err.message });
      }
    }

    // --- Demo Data Generator (Quick Offline Test Data) ---
    if (pathname === '/api/demo/seed' && method === 'POST') {
      const demoEmail = 'bharath@example.com';
      let user = get('SELECT id, email, name, storage_quota_bytes FROM users WHERE email = ?', demoEmail);
      if (!user) {
        auth.registerUser({ email: demoEmail, password: 'Password123!', name: 'Bharath' });
        run('UPDATE users SET is_verified = 1 WHERE email = ?', demoEmail);
        user = get('SELECT id, email, name, storage_quota_bytes FROM users WHERE email = ?', demoEmail);
      }

      const sessionToken = auth.createSession(user.id);

      // Create sample video file (generates a valid MP4 / media file for testing player)
      const userMoviesDir = path.join(auth.STORAGE_ROOT, user.id, 'movies');
      if (!fs.existsSync(userMoviesDir)) fs.mkdirSync(userMoviesDir, { recursive: true });

      const sampleVideoName = 'Interstellar_Sample_Movie.mp4';
      const sampleVideoPath = path.join(userMoviesDir, sampleVideoName);
      
      // If doesn't exist, create a sample media placeholder
      if (!fs.existsSync(sampleVideoPath)) {
        // Minimal MP4 ftyp box header so it recognizes as video
        const dummyMp4 = Buffer.alloc(1024 * 1024 * 2); // 2MB sample buffer
        dummyMp4.write('ftypmp42', 4, 'ascii');
        fs.writeFileSync(sampleVideoPath, dummyMp4);
      }

      // Check if file is already registered
      let fileRecord = get('SELECT * FROM files WHERE user_id = ? AND original_name = ?', user.id, sampleVideoName);
      if (!fileRecord) {
        fileRecord = storage.saveFileMetadata({
          userId: user.id,
          folderId: null,
          originalName: sampleVideoName,
          relativePath: path.join('movies', sampleVideoName),
          sizeBytes: 1610612736, // 1.5 GB representation
          checksum: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
          mimeType: 'video/mp4',
          category: 'movies'
        });
      }

      // Also create a sample document
      const userDocsDir = path.join(auth.STORAGE_ROOT, user.id, 'documents');
      if (!fs.existsSync(userDocsDir)) fs.mkdirSync(userDocsDir, { recursive: true });
      const sampleDocName = 'Offline_Cloud_Architecture_Specs.pdf';
      const sampleDocPath = path.join(userDocsDir, sampleDocName);
      if (!fs.existsSync(sampleDocPath)) {
        fs.writeFileSync(sampleDocPath, '%PDF-1.4 ... Personal Cloud Technical Design ...');
      }
      let docRecord = get('SELECT * FROM files WHERE user_id = ? AND original_name = ?', user.id, sampleDocName);
      if (!docRecord) {
        docRecord = storage.saveFileMetadata({
          userId: user.id,
          folderId: null,
          originalName: sampleDocName,
          relativePath: path.join('documents', sampleDocName),
          sizeBytes: 4851200, // 4.8 MB
          checksum: '8f4c2810a9117b3e198754bba82c9e78a42b78912cde45689123456789abcdef',
          mimeType: 'application/pdf',
          category: 'documents'
        });
      }

      return sendJson(res, 200, {
        success: true,
        message: 'Demo account ready!',
        user,
        token: sessionToken,
        files: [fileRecord, docRecord]
      });
    }

    // -------------------------------------------------------------
    // STATIC FILE SERVING (Single Page App)
    // -------------------------------------------------------------
    // 1. If requesting an API endpoint that wasn't handled, return 404 JSON
    if (pathname.startsWith('/api/')) {
      return sendJson(res, 404, { error: 'API endpoint not found' });
    }

    // 2. Check if a real static file exists
    let filePath = path.join(PUBLIC_DIR, pathname === '/' ? 'index.html' : pathname);
    if (fs.existsSync(filePath) && !fs.statSync(filePath).isDirectory()) {
      const ext = path.extname(filePath).toLowerCase();
      const contentType = MIME_TYPES[ext] || 'application/octet-stream';
      res.writeHead(200, {
        'Content-Type': contentType,
        'Cache-Control': NODE_ENV === 'production' && ext !== '.html' ? 'public, max-age=86400' : 'no-cache'
      });
      fs.createReadStream(filePath).pipe(res);
      return;
    }

    // 3. SPA Route Fallback: For browser page refreshes (e.g. /dashboard, /files, /offline)
    const hasExtension = path.extname(pathname) !== '';
    if (!hasExtension) {
      const indexHtmlPath = path.join(PUBLIC_DIR, 'index.html');
      if (fs.existsSync(indexHtmlPath)) {
        res.writeHead(200, {
          'Content-Type': 'text/html; charset=utf-8',
          'Cache-Control': 'no-cache'
        });
        fs.createReadStream(indexHtmlPath).pipe(res);
        return;
      }
    }

    // 4. Missing static assets return 404
    sendJson(res, 404, { error: 'File not found' });
  } catch (error) {
    console.error('Server error:', error);
    sendJson(res, 500, { error: error.message || 'Internal server error' });
  }
});

// Attach WebSocket Upgrade Handler
server.on('upgrade', (req, socket, head) => {
  const parsed = url.parse(req.url, true);
  if (parsed.pathname === '/ws') {
    wsServer.handleUpgrade(req, socket, head);
  } else {
    socket.destroy();
  }
});

// Start Discovery and Server
discovery.start();

server.listen(PORT, '0.0.0.0', () => {
  const primaryIp = discovery.getPrimaryIp();
  console.log('================================================================');
  console.log('🚀 Velora - Offline Personal Cloud & Local File Sharing');
  console.log('================================================================');
  console.log(`🌐 Local Web Portal:      http://localhost:${PORT}`);
  console.log(`📶 LAN Access URL:         http://${primaryIp}:${PORT}`);
  console.log(`📡 Device Discovery:       UDP Port 41234 (Active)`);
  console.log(`🔌 WebSocket Signaling:    ws://${primaryIp}:${PORT}/ws`);
  console.log('🔒 Zero-Internet Engine:   ACTIVE & READY');
  console.log('================================================================');
});

// Handle graceful shutdown
process.on('SIGINT', () => {
  discovery.stop();
  server.close(() => {
    process.exit(0);
  });
});
