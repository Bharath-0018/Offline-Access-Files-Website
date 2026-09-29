// js/api.js - Velora Cloud API Client & Chunked Resumable Large File Uploader
(function (global) {
  class ApiService {
    constructor() {
      this.serverUrl = localStorage.getItem('velora_server_url') || '';
      this.token = localStorage.getItem('cloud_token') || null;
      this.user = JSON.parse(localStorage.getItem('cloud_user') || 'null');
      this.activeUploads = new Map();
      this.isConnected = true;
      this.lastSyncTime = null;
    }

    setServerUrl(url) {
      if (!url) {
        this.serverUrl = '';
        localStorage.removeItem('velora_server_url');
      } else {
        const cleanUrl = url.trim().replace(/\/+$/, '');
        this.serverUrl = cleanUrl;
        localStorage.setItem('velora_server_url', cleanUrl);
      }
    }

    getServerUrl() {
      return this.serverUrl || window.location.origin;
    }

    getApiBase() {
      const base = this.serverUrl ? `${this.serverUrl}/api` : '/api';
      return base;
    }

    setAuth(token, user) {
      this.token = token;
      this.user = user;
      if (token) {
        localStorage.setItem('cloud_token', token);
        localStorage.setItem('cloud_user', JSON.stringify(user));
      } else {
        localStorage.removeItem('cloud_token');
        localStorage.removeItem('cloud_user');
      }
    }

    getHeaders(extra = {}) {
      const headers = { ...extra };
      if (this.token) {
        headers['Authorization'] = `Bearer ${this.token}`;
      }
      return headers;
    }

    async request(endpoint, options = {}) {
      const url = `${this.getApiBase()}${endpoint}`;
      const headers = this.getHeaders(options.headers || {});

      if (options.body && typeof options.body === 'object' && !(options.body instanceof Blob) && !(options.body instanceof FormData)) {
        headers['Content-Type'] = 'application/json';
        options.body = JSON.stringify(options.body);
      }

      options.headers = headers;

      try {
        const res = await fetch(url, options);
        this.isConnected = true;

        if (res.status === 401) {
          this.setAuth(null, null);
          window.dispatchEvent(new CustomEvent('auth:expired'));
          const errData = await res.json().catch(() => ({}));
          throw new Error(errData.error || 'Authentication session expired. Please sign in again.');
        }

        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          throw new Error(data.error || `Server returned HTTP ${res.status}`);
        }
        return data;
      } catch (err) {
        if (err.name === 'AbortError') {
          throw err;
        }
        if (err.message && err.message.includes('Failed to fetch')) {
          this.isConnected = false;
          throw new Error(`Cannot connect to Velora server at ${this.getServerUrl()}. Please verify the server is running.`);
        }
        throw err;
      }
    }

    // --- Authentication API ---
    async register(email, password, name) {
      return this.request('/auth/register', {
        method: 'POST',
        body: { email, password, name }
      });
    }

    async verifyOtp(email, code) {
      const res = await this.request('/auth/verify-otp', {
        method: 'POST',
        body: { email, code }
      });
      if (res.token) {
        this.setAuth(res.token, res.user);
      }
      return res;
    }

    async login(email, password) {
      const res = await this.request('/auth/login', {
        method: 'POST',
        body: { email, password }
      });
      if (res.sessionToken) {
        this.setAuth(res.sessionToken, res.user);
      }
      return res;
    }

    async getMe() {
      const res = await this.request('/auth/me');
      if (res.user) {
        this.user = res.user;
        localStorage.setItem('cloud_user', JSON.stringify(res.user));
      }
      return res;
    }

    async logout() {
      try {
        await this.request('/auth/logout', { method: 'POST' });
      } catch (e) {}
      this.setAuth(null, null);
    }

    async forgotPassword(email) {
      return this.request('/auth/forgot-password', {
        method: 'POST',
        body: { email }
      });
    }

    async resetPassword(email, code, newPassword) {
      return this.request('/auth/reset-password', {
        method: 'POST',
        body: { email, code, newPassword }
      });
    }

    // --- Files & Storage API ---
    async getFiles(params = {}) {
      const qs = new URLSearchParams();
      if (params.category) qs.set('category', params.category);
      if (params.folderId) qs.set('folderId', params.folderId);
      if (params.search) qs.set('search', params.search);
      if (params.sortBy) qs.set('sortBy', params.sortBy);
      if (params.sortOrder) qs.set('sortOrder', params.sortOrder);
      const res = await this.request(`/files?${qs.toString()}`);
      this.lastSyncTime = Date.now();
      return res;
    }

    async getFolders(parentId = null) {
      const qs = parentId ? `?parentId=${encodeURIComponent(parentId)}` : '';
      return this.request(`/folders${qs}`);
    }

    async createFolder(name, parentId = null) {
      return this.request('/folders', {
        method: 'POST',
        body: { name, parentId }
      });
    }

    async deleteFolder(folderId) {
      return this.request(`/folders/${folderId}`, { method: 'DELETE' });
    }

    async renameFile(fileId, newName) {
      return this.request(`/files/${fileId}/rename`, {
        method: 'PUT',
        body: { newName }
      });
    }

    async deleteFile(fileId) {
      return this.request(`/files/${fileId}`, { method: 'DELETE' });
    }

    async savePlayPosition(fileId, positionSeconds) {
      return this.request(`/files/${fileId}/play-position`, {
        method: 'POST',
        body: { positionSeconds }
      });
    }

    async getStorageStats() {
      return this.request('/storage/stats');
    }

    getDownloadUrl(fileId) {
      return `${this.getApiBase()}/files/download/${fileId}?token=${encodeURIComponent(this.token || '')}`;
    }

    getStreamUrl(fileId) {
      return `${this.getApiBase()}/files/stream/${fileId}?token=${encodeURIComponent(this.token || '')}`;
    }

    // --- Resumable Chunked Streaming Uploader for 1.5GB - 5GB+ Files ---
    async uploadFileChunked(file, folderId, onProgress) {
      const CHUNK_SIZE = 5 * 1024 * 1024; // 5MB standard chunk size
      const totalSize = file.size;
      const totalChunks = Math.ceil(totalSize / CHUNK_SIZE) || 1;

      // 1. Initialize upload session on server
      const initRes = await this.request('/files/chunk/init', {
        method: 'POST',
        body: {
          fileName: file.name,
          fileSize: totalSize,
          folderId: folderId || null
        }
      });

      if (!initRes || !initRes.uploadId) {
        throw new Error('Server failed to initiate upload session.');
      }

      const uploadId = initRes.uploadId;
      const chunkSize = initRes.chunkSize || CHUNK_SIZE;
      const abortController = new AbortController();

      this.activeUploads.set(uploadId, {
        abortController,
        file,
        totalSize,
        chunkSize,
        totalChunks
      });

      let uploadedBytes = 0;
      const startTime = Date.now();
      let lastUploadedBytes = 0;
      let lastTime = startTime;

      try {
        for (let chunkIndex = 0; chunkIndex < totalChunks; chunkIndex++) {
          if (abortController.signal.aborted) {
            throw new Error('Upload cancelled by user.');
          }

          const startByte = chunkIndex * chunkSize;
          const endByte = Math.min(startByte + chunkSize, totalSize);
          const chunkBlob = file.slice(startByte, endByte);

          // Upload chunk with retry logic
          let chunkAttempts = 0;
          let chunkSuccess = false;
          let lastChunkError = null;

          while (chunkAttempts < 3 && !chunkSuccess) {
            chunkAttempts++;
            try {
              const res = await fetch(`${this.getApiBase()}/files/chunk/upload`, {
                method: 'POST',
                headers: {
                  'X-Upload-Id': uploadId,
                  'X-Chunk-Index': String(chunkIndex),
                  'X-Total-Chunks': String(totalChunks),
                  'Authorization': `Bearer ${this.token}`,
                  'Content-Type': 'application/octet-stream'
                },
                body: chunkBlob,
                signal: abortController.signal
              });

              if (!res.ok) {
                const errData = await res.json().catch(() => ({}));
                throw new Error(errData.error || `HTTP ${res.status}`);
              }

              chunkSuccess = true;
            } catch (chunkErr) {
              if (abortController.signal.aborted) throw chunkErr;
              lastChunkError = chunkErr;
              if (chunkAttempts < 3) {
                // Short backoff before retrying chunk
                await new Promise(r => setTimeout(r, 1000));
              }
            }
          }

          if (!chunkSuccess) {
            throw new Error(`Chunk ${chunkIndex + 1}/${totalChunks} failed after 3 attempts: ${lastChunkError ? lastChunkError.message : 'Unknown error'}`);
          }

          uploadedBytes = endByte;
          const now = Date.now();
          const elapsedSec = (now - startTime) / 1000;
          const speedBps = elapsedSec > 0 ? uploadedBytes / elapsedSec : 0;
          const remainingBytes = totalSize - uploadedBytes;
          const etaSec = speedBps > 0 ? Math.round(remainingBytes / speedBps) : 0;
          const percent = Math.min(100, Math.round((uploadedBytes / totalSize) * 100));

          if (onProgress) {
            onProgress({
              uploadId,
              fileName: file.name,
              uploadedBytes,
              totalBytes: totalSize,
              percent,
              speedBps,
              etaSec,
              chunkIndex,
              totalChunks
            });
          }
        }

        // 2. Finalize upload session on server and verify integrity
        const finalRes = await this.request('/files/chunk/finalize', {
          method: 'POST',
          body: { uploadId }
        });

        this.activeUploads.delete(uploadId);
        this.lastSyncTime = Date.now();
        return finalRes;
      } catch (err) {
        if (!abortController.signal.aborted) {
          // Attempt cancellation cleanup on server
          this.request('/files/chunk/cancel', {
            method: 'POST',
            body: { uploadId }
          }).catch(() => {});
        }
        this.activeUploads.delete(uploadId);
        throw err;
      }
    }

    cancelUpload(uploadId) {
      const active = this.activeUploads.get(uploadId);
      if (active) {
        active.abortController.abort();
        this.activeUploads.delete(uploadId);
        this.request('/files/chunk/cancel', {
          method: 'POST',
          body: { uploadId }
        }).catch(() => {});
      }
    }

    // --- Device Discovery & Offline Local Transfers API ---
    async getDevices() {
      return this.request('/devices');
    }

    async getMyDeviceInfo() {
      return this.request('/devices/my-info');
    }

    async pairDevice(deviceId, pairCode) {
      return this.request('/devices/pair', {
        method: 'POST',
        body: { deviceId, pairCode }
      });
    }

    async unpairDevice(deviceId) {
      return this.request('/devices/unpair', {
        method: 'POST',
        body: { deviceId }
      });
    }

    async getTransfers() {
      return this.request('/transfers');
    }

    async startTransfer(targetDeviceId, fileId) {
      return this.request('/transfers/start', {
        method: 'POST',
        body: { targetDeviceId, fileId }
      });
    }

    async cancelTransfer(transferId) {
      return this.request(`/transfers/${transferId}/cancel`, { method: 'POST' });
    }

    // --- Google Drive Optional Cloud Backup ---
    async getGDriveStatus() {
      return this.request('/gdrive/status');
    }

    async connectGDrive(email) {
      return this.request('/gdrive/connect', {
        method: 'POST',
        body: { simulatedEmail: email }
      });
    }

    async disconnectGDrive() {
      return this.request('/gdrive/disconnect', { method: 'POST' });
    }

    async backupFileToGDrive(fileId) {
      return this.request(`/gdrive/backup/${fileId}`, { method: 'POST' });
    }
  }

  global.api = new ApiService();
})(window);
