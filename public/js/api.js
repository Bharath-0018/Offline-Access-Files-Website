// public/js/api.js - Client HTTP API and Chunked Streaming Uploader for 1.5GB+ Files
(function (global) {
  const API_BASE = '/api';

  class ApiService {
    constructor() {
      this.token = localStorage.getItem('cloud_token') || null;
      this.user = JSON.parse(localStorage.getItem('cloud_user') || 'null');
      this.activeUploads = new Map();
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
      const url = `${API_BASE}${endpoint}`;
      const headers = this.getHeaders(options.headers || {});

      if (options.body && typeof options.body === 'object' && !(options.body instanceof Blob)) {
        headers['Content-Type'] = 'application/json';
        options.body = JSON.stringify(options.body);
      }

      options.headers = headers;

      try {
        const res = await fetch(url, options);
        if (res.status === 401) {
          // Token expired or invalid
          this.setAuth(null, null);
          window.dispatchEvent(new CustomEvent('auth:expired'));
        }
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          throw new Error(data.error || `HTTP ${res.status}`);
        }
        return data;
      } catch (err) {
        throw err;
      }
    }

    // --- Auth API ---
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

    // --- Files API ---
    async getFiles(params = {}) {
      const qs = new URLSearchParams();
      if (params.category) qs.set('category', params.category);
      if (params.folderId) qs.set('folderId', params.folderId);
      if (params.search) qs.set('search', params.search);
      if (params.sortBy) qs.set('sortBy', params.sortBy);
      if (params.sortOrder) qs.set('sortOrder', params.sortOrder);
      return this.request(`/files?${qs.toString()}`);
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

    // --- Chunked Large File Uploader (1.5GB to 5GB+ with 0 browser memory freeze) ---
    async uploadFileChunked(file, folderId, onProgress) {
      const CHUNK_SIZE = 5 * 1024 * 1024; // 5 MB per slice
      const totalSize = file.size;

      // 1. Initialize upload session
      const initRes = await this.request('/files/chunk/init', {
        method: 'POST',
        body: {
          fileName: file.name,
          fileSize: totalSize,
          folderId: folderId || null
        }
      });

      const uploadId = initRes.uploadId;
      let startByte = 0;
      let startTime = Date.now();
      let lastUploaded = 0;

      // Controller to allow cancelling
      const abortController = new AbortController();
      this.activeUploads.set(uploadId, { abortController, file });

      try {
        while (startByte < totalSize) {
          const endByte = Math.min(startByte + CHUNK_SIZE, totalSize);
          const chunk = file.slice(startByte, endByte);

          const res = await fetch(`${API_BASE}/files/chunk/upload`, {
            method: 'POST',
            headers: {
              'X-Upload-Id': uploadId,
              'Authorization': `Bearer ${this.token}`,
              'Content-Type': 'application/octet-stream'
            },
            body: chunk,
            signal: abortController.signal
          });

          if (!res.ok) {
            throw new Error(`Chunk upload failed with HTTP ${res.status}`);
          }

          startByte = endByte;

          // Calculate speed & ETA
          const now = Date.now();
          const elapsedSec = (now - startTime) / 1000;
          const speedBps = elapsedSec > 0 ? startByte / elapsedSec : 0;
          const remainingBytes = totalSize - startByte;
          const etaSec = speedBps > 0 ? Math.round(remainingBytes / speedBps) : 0;
          const percent = Math.min(100, Math.round((startByte / totalSize) * 100));

          if (onProgress) {
            onProgress({
              uploadId,
              fileName: file.name,
              uploadedBytes: startByte,
              totalBytes: totalSize,
              percent,
              speedBps,
              etaSec
            });
          }
        }

        // 2. Finalize upload
        const finalRes = await this.request('/files/chunk/finalize', {
          method: 'POST',
          body: { uploadId }
        });

        this.activeUploads.delete(uploadId);
        return finalRes;
      } catch (err) {
        this.activeUploads.delete(uploadId);
        try {
          await this.request('/files/chunk/cancel', {
            method: 'POST',
            body: { uploadId }
          });
        } catch (e) {}
        throw err;
      }
    }

    cancelUpload(uploadId) {
      const active = this.activeUploads.get(uploadId);
      if (active) {
        active.abortController.abort();
        this.activeUploads.delete(uploadId);
      }
    }

    // --- Device Discovery & Transfers API ---
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

    async startTransfer(fileId, targetDeviceId, targetIp, targetPort) {
      return this.request('/transfers/start', {
        method: 'POST',
        body: { fileId, targetDeviceId, targetIp, targetPort }
      });
    }

    async getTransfers() {
      return this.request('/transfers');
    }

    async cancelTransfer(transferId) {
      return this.request(`/transfers/${transferId}/cancel`, { method: 'POST' });
    }

    // --- Google Drive Optional Cloud API ---
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

    // --- Demo Quick Seed ---
    async seedDemo() {
      const res = await this.request('/demo/seed', { method: 'POST' });
      if (res.token) {
        this.setAuth(res.token, res.user);
      }
      return res;
    }
  }

  global.api = new ApiService();
})(window);
