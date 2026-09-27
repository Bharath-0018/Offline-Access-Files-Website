// lib/transfer.js - High-Speed Direct LAN Peer-to-Peer File Transfer Engine
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const http = require('node:http');
const { query, get, run } = require('./db');
const { STORAGE_ROOT } = require('./auth');
const { getFileInfo, saveFileMetadata, sanitizePath } = require('./storage');

class TransferEngine {
  constructor(wsServer) {
    this.wsServer = wsServer;
    this.activeTransfers = new Map();
  }

  // Initiate an outgoing file transfer to a paired local device
  startOutgoingTransfer({ userId, fileId, targetDeviceId, targetIp, targetPort }) {
    const file = get('SELECT * FROM files WHERE id = ? AND user_id = ?', fileId, userId);
    if (!file) {
      throw new Error('File not found in personal library.');
    }

    const device = get('SELECT * FROM devices WHERE id = ?', targetDeviceId);
    if (!device) {
      throw new Error('Target device not recognized.');
    }

    const transferId = crypto.randomUUID();
    const now = Date.now();

    const transferRecord = {
      id: transferId,
      userId,
      fileId: file.id,
      fileName: file.original_name,
      fileSize: file.size_bytes,
      direction: 'send',
      peerDeviceName: device.device_name,
      peerIp: targetIp || device.ip_address,
      bytesTransferred: 0,
      status: 'transferring',
      speedBps: 0,
      startedAt: now
    };

    run(
      `INSERT INTO transfers 
       (id, user_id, file_id, file_name, file_size, direction, peer_device_name, peer_ip, bytes_transferred, status, started_at) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, 'transferring', ?)`,
      transferId, userId, file.id, file.original_name, file.size_bytes, 'send', device.device_name, targetIp || device.ip_address, now
    );

    const userBase = path.join(STORAGE_ROOT, userId);
    const fullPath = sanitizePath(userBase, file.file_path);

    this._executeDirectStreamTransfer({
      transferId,
      filePath: fullPath,
      fileSize: file.size_bytes,
      fileName: file.original_name,
      mimeType: file.mime_type,
      targetIp: targetIp || device.ip_address,
      targetPort: targetPort || device.port,
      userId
    });

    return transferRecord;
  }

  // Stream file directly to target device HTTP endpoint
  _executeDirectStreamTransfer({ transferId, filePath, fileSize, fileName, mimeType, targetIp, targetPort, userId }) {
    const options = {
      hostname: targetIp,
      port: targetPort,
      path: `/api/transfers/incoming?transferId=${transferId}&fileName=${encodeURIComponent(fileName)}&fileSize=${fileSize}&mimeType=${encodeURIComponent(mimeType)}`,
      method: 'POST',
      headers: {
        'Content-Type': mimeType || 'application/octet-stream',
        'Content-Length': fileSize
      }
    };

    let transferredBytes = 0;
    let lastBytes = 0;
    let lastTime = Date.now();

    const req = http.request(options, (res) => {
      let resBody = '';
      res.on('data', (d) => { resBody += d; });
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          this._markCompleted(transferId);
        } else {
          this._markFailed(transferId, `Remote rejected: HTTP ${res.statusCode}`);
        }
      });
    });

    req.on('error', (err) => {
      this._markFailed(transferId, `Network transfer failed: ${err.message}`);
    });

    const fileStream = fs.createReadStream(filePath, { highWaterMark: 1024 * 1024 }); // 1MB buffer

    const progressInterval = setInterval(() => {
      const now = Date.now();
      const elapsedSec = (now - lastTime) / 1000;
      if (elapsedSec > 0) {
        const speed = (transferredBytes - lastBytes) / elapsedSec; // bytes/sec
        const eta = speed > 0 ? Math.round((fileSize - transferredBytes) / speed) : 0;
        const percent = Math.min(100, Math.round((transferredBytes / fileSize) * 100));

        this._broadcastProgress({
          transferId,
          bytesTransferred: transferredBytes,
          fileSize,
          percent,
          speedBps: speed,
          etaSeconds: eta,
          status: 'transferring'
        });

        lastBytes = transferredBytes;
        lastTime = now;
      }
    }, 500);

    fileStream.on('data', (chunk) => {
      transferredBytes += chunk.length;
    });

    fileStream.on('end', () => {
      clearInterval(progressInterval);
    });

    fileStream.on('error', (err) => {
      clearInterval(progressInterval);
      req.destroy();
      this._markFailed(transferId, err.message);
    });

    fileStream.pipe(req);

    this.activeTransfers.set(transferId, {
      req,
      fileStream,
      progressInterval,
      status: 'transferring'
    });
  }

  // Handle incoming stream on receiving device
  handleIncomingStream(req, res, { transferId, fileName, fileSize, mimeType, defaultUserId }) {
    const info = getFileInfo(fileName);
    const category = info.category;

    // Use default or first user if air-gapped
    let targetUserId = defaultUserId;
    if (!targetUserId) {
      const firstUser = get('SELECT id FROM users ORDER BY created_at ASC LIMIT 1');
      if (firstUser) {
        targetUserId = firstUser.id;
      } else {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'No local user registered yet.' }));
        return;
      }
    }

    const userCatDir = path.join(STORAGE_ROOT, targetUserId, category);
    if (!fs.existsSync(userCatDir)) {
      fs.mkdirSync(userCatDir, { recursive: true });
    }

    const safeBaseName = `${Date.now()}_${fileName.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
    const targetFilePath = path.join(userCatDir, safeBaseName);
    const relativePath = path.join(category, safeBaseName);

    const writeStream = fs.createWriteStream(targetFilePath);
    const hasher = crypto.createHash('sha256');

    let received = 0;
    let lastBytes = 0;
    let lastTime = Date.now();

    // Register incoming transfer in DB
    run(
      `INSERT INTO transfers 
       (id, user_id, file_name, file_size, direction, peer_device_name, peer_ip, bytes_transferred, status, started_at) 
       VALUES (?, ?, ?, ?, 'receive', 'Nearby Device', ?, 0, 'transferring', ?)`,
      transferId, targetUserId, fileName, fileSize, req.socket.remoteAddress || 'LAN', Date.now()
    );

    const progressInterval = setInterval(() => {
      const now = Date.now();
      const elapsedSec = (now - lastTime) / 1000;
      if (elapsedSec > 0) {
        const speed = (received - lastBytes) / elapsedSec;
        const eta = speed > 0 ? Math.round((fileSize - received) / speed) : 0;
        const percent = Math.min(100, Math.round((received / fileSize) * 100));

        this._broadcastProgress({
          transferId,
          bytesTransferred: received,
          fileSize,
          percent,
          speedBps: speed,
          etaSeconds: eta,
          status: 'transferring'
        });

        lastBytes = received;
        lastTime = now;
      }
    }, 500);

    req.on('data', (chunk) => {
      received += chunk.length;
      hasher.update(chunk);
    });

    req.pipe(writeStream);

    writeStream.on('finish', () => {
      clearInterval(progressInterval);
      const checksum = hasher.digest('hex');

      // Save to personal file library
      const fileRecord = saveFileMetadata({
        userId: targetUserId,
        folderId: null,
        originalName: fileName,
        relativePath,
        sizeBytes: received,
        checksum,
        mimeType: mimeType || info.mime,
        category
      });

      this._markCompleted(transferId);

      // Notify clients
      if (this.wsServer) {
        this.wsServer.broadcast('file_received', {
          file: fileRecord,
          transferId,
          message: `Successfully received ${fileName} (${(received / (1024 * 1024)).toFixed(1)} MB)`
        });
      }

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, fileId: fileRecord.id }));
    });

    writeStream.on('error', (err) => {
      clearInterval(progressInterval);
      this._markFailed(transferId, err.message);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: err.message }));
    });
  }

  _broadcastProgress(data) {
    if (this.wsServer) {
      this.wsServer.broadcast('transfer_progress', data);
    }
  }

  _markCompleted(transferId) {
    run('UPDATE transfers SET status = "completed", completed_at = ? WHERE id = ?', Date.now(), transferId);
    if (this.wsServer) {
      this.wsServer.broadcast('transfer_completed', { transferId });
    }
    this.activeTransfers.delete(transferId);
  }

  _markFailed(transferId, errorMsg) {
    run('UPDATE transfers SET status = "failed", error_message = ?, completed_at = ? WHERE id = ?', errorMsg, Date.now(), transferId);
    if (this.wsServer) {
      this.wsServer.broadcast('transfer_failed', { transferId, error: errorMsg });
    }
    this.activeTransfers.delete(transferId);
  }

  cancelTransfer(transferId) {
    const active = this.activeTransfers.get(transferId);
    if (active) {
      if (active.progressInterval) clearInterval(active.progressInterval);
      if (active.req) active.req.destroy();
      if (active.fileStream) active.fileStream.destroy();
      this.activeTransfers.delete(transferId);
    }
    run('UPDATE transfers SET status = "cancelled", completed_at = ? WHERE id = ?', Date.now(), transferId);
    if (this.wsServer) {
      this.wsServer.broadcast('transfer_cancelled', { transferId });
    }
    return { success: true };
  }

  listTransfers(userId) {
    return query('SELECT * FROM transfers WHERE user_id = ? ORDER BY started_at DESC LIMIT 20', userId);
  }
}

module.exports = TransferEngine;
