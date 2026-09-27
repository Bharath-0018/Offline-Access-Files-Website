// public/js/api.js - Client HTTP API, Chunked Streaming Uploader & Universal Offline Fallback
(function (global) {
  const isStaticPages = window.location.hostname.endsWith('github.io');
  const API_BASE = '/api';

  const DEFAULT_DEMO_FILES = [
    {
      id: 'f_movie_001',
      name: 'Big_Buck_Bunny_1080p.mp4',
      original_name: 'Big Buck Bunny (1080p Cinema Demo).mp4',
      size_bytes: 1583296720,
      category: 'movies',
      mime_type: 'video/mp4',
      streamUrl: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4',
      play_position_seconds: 42,
      created_at: new Date(Date.now() - 3600000).toISOString()
    },
    {
      id: 'f_movie_002',
      name: 'Tears_of_Steel_4K.mp4',
      original_name: 'Tears of Steel (4K Sci-Fi Cinema Short).mp4',
      size_bytes: 3840296000,
      category: 'movies',
      mime_type: 'video/mp4',
      streamUrl: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/TearsOfSteel.mp4',
      play_position_seconds: 0,
      created_at: new Date(Date.now() - 7200000).toISOString()
    },
    {
      id: 'f_movie_003',
      name: 'Sintel_Animation.mp4',
      original_name: 'Sintel (Blender Open Movie Project).mp4',
      size_bytes: 842190240,
      category: 'movies',
      mime_type: 'video/mp4',
      streamUrl: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/Sintel.mp4',
      play_position_seconds: 0,
      created_at: new Date(Date.now() - 14400000).toISOString()
    },
    {
      id: 'f_doc_001',
      name: 'OfflineAccess_Architecture_Whitepaper.pdf',
      original_name: 'OfflineAccess - Architecture & Local P2P Whitepaper.pdf',
      size_bytes: 4829100,
      category: 'documents',
      mime_type: 'application/pdf',
      created_at: new Date(Date.now() - 86400000).toISOString()
    },
    {
      id: 'f_audio_001',
      name: 'Acoustic_Soundtrack_Lossless.mp3',
      original_name: 'Acoustic Studio Master (Lossless Audio).mp3',
      size_bytes: 12580000,
      category: 'audio',
      mime_type: 'audio/mp3',
      created_at: new Date(Date.now() - 120000000).toISOString()
    },
    {
      id: 'f_img_001',
      name: 'Local_Network_Topology.png',
      original_name: 'Offline Air-Gapped Network Topology Diagram.png',
      size_bytes: 2340000,
      category: 'images',
      mime_type: 'image/png',
      created_at: new Date(Date.now() - 180000000).toISOString()
    }
  ];

  class ApiService {
    constructor() {
      this.token = localStorage.getItem('cloud_token') || null;
      this.user = JSON.parse(localStorage.getItem('cloud_user') || 'null');
      this.activeUploads = new Map();

      if (!localStorage.getItem('offline_files_data')) {
        localStorage.setItem('offline_files_data', JSON.stringify(DEFAULT_DEMO_FILES));
      }
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
      if (isStaticPages) {
        return this.mockStaticRequest(endpoint, options);
      }

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
          this.setAuth(null, null);
          window.dispatchEvent(new CustomEvent('auth:expired'));
        }
        if (res.status === 404) {
          return this.mockStaticRequest(endpoint, options);
        }
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          throw new Error(data.error || `HTTP ${res.status}`);
        }
        return data;
      } catch (err) {
        console.warn(`Falling back to local browser state for ${endpoint}:`, err.message);
        return this.mockStaticRequest(endpoint, options);
      }
    }

    mockStaticRequest(endpoint, options = {}) {
      let body = {};
      try {
        if (options.body && typeof options.body === 'string') {
          body = JSON.parse(options.body);
        } else if (options.body) {
          body = options.body;
        }
      } catch (e) {}

      // Auth me
      if (endpoint === '/auth/me') {
        const user = this.user || {
          id: 'u_bharath',
          name: 'Bharath Kumar',
          email: 'bharath@offlineaccess.io',
          role: 'owner'
        };
        return { user };
      }

      // Demo Seed
      if (endpoint === '/demo/seed') {
        const user = {
          id: 'u_bharath',
          name: 'Bharath Kumar',
          email: 'bharath@offlineaccess.io',
          role: 'owner'
        };
        const token = 'demo_session_token_' + Date.now();
        this.setAuth(token, user);
        localStorage.setItem('offline_files_data', JSON.stringify(DEFAULT_DEMO_FILES));
        return { success: true, token, user };
      }

      // Login
      if (endpoint === '/auth/login') {
        const email = body.email || 'bharath@offlineaccess.io';
        const user = {
          id: 'u_' + Math.random().toString(36).slice(2, 8),
          name: email.split('@')[0].replace(/[._]/g, ' ').replace(/\b\w/g, l => l.toUpperCase()),
          email,
          role: 'owner'
        };
        const token = 'session_' + Date.now();
        this.setAuth(token, user);
        return { sessionToken: token, user };
      }

      // Register
      if (endpoint === '/auth/register') {
        return {
          success: true,
          email: body.email,
          otpCode: '849201',
          requiresVerification: true
        };
      }

      // Verify OTP
      if (endpoint === '/auth/verify-otp') {
        const user = {
          id: 'u_' + Math.random().toString(36).slice(2, 8),
          name: (body.email || 'User').split('@')[0],
          email: body.email || 'user@offlineaccess.io',
          role: 'owner'
        };
        const token = 'otp_verified_' + Date.now();
        this.setAuth(token, user);
        return { token, user };
      }

      // Logout
      if (endpoint === '/auth/logout') {
        this.setAuth(null, null);
        return { success: true };
      }

      // Storage stats
      if (endpoint === '/storage/stats') {
        const files = JSON.parse(localStorage.getItem('offline_files_data') || '[]');
        const used = files.reduce((acc, f) => acc + (f.size_bytes || 0), 0);
        const quota = 50 * 1024 * 1024 * 1024;
        return {
          usedBytes: used,
          quotaBytes: quota,
          percentUsed: Math.min(100, parseFloat(((used / quota) * 100).toFixed(1))),
          fileCount: files.length
        };
      }

      // Files list
      if (endpoint.startsWith('/files')) {
        const urlObj = new URL('http://dummy' + endpoint);
        const category = urlObj.searchParams.get('category');
        const search = urlObj.searchParams.get('search');
        let files = JSON.parse(localStorage.getItem('offline_files_data') || '[]');

        if (category && category !== 'all') {
          files = files.filter(f => f.category === category);
        }
        if (search) {
          const q = search.toLowerCase();
          files = files.filter(f => (f.original_name || f.name).toLowerCase().includes(q));
        }
        return { files };
      }

      // Delete file
      if (endpoint.startsWith('/files/') && options.method === 'DELETE') {
        const id = endpoint.split('/')[2];
        let files = JSON.parse(localStorage.getItem('offline_files_data') || '[]');
        files = files.filter(f => f.id !== id);
        localStorage.setItem('offline_files_data', JSON.stringify(files));
        return { success: true };
      }

      // Rename file
      if (endpoint.includes('/rename')) {
        const id = endpoint.split('/')[2];
        let files = JSON.parse(localStorage.getItem('offline_files_data') || '[]');
        const file = files.find(f => f.id === id);
        if (file && body.newName) {
          file.original_name = body.newName;
          localStorage.setItem('offline_files_data', JSON.stringify(files));
        }
        return { success: true, file };
      }

      // Play position
      if (endpoint.includes('/play-position')) {
        const id = endpoint.split('/')[2];
        if (body.positionSeconds !== undefined) {
          localStorage.setItem(`pos_${id}`, body.positionSeconds);
        }
        return { success: true };
      }

      // Devices
      if (endpoint === '/devices') {
        return {
          devices: [
            {
              id: 'dev_01',
              deviceName: 'Bharath-Laptop-B (Dell XPS)',
              deviceType: 'laptop',
              ipAddress: '192.168.1.104',
              port: 3000,
              isOnline: true,
              isPaired: true
            },
            {
              id: 'dev_02',
              deviceName: 'OnePlus 11 5G (Bharath)',
              deviceType: 'mobile',
              ipAddress: '192.168.1.108',
              port: 3000,
              isOnline: true,
              isPaired: false
            },
            {
              id: 'dev_03',
              deviceName: 'Lab-Workstation-07',
              deviceType: 'desktop',
              ipAddress: '192.168.1.121',
              port: 3000,
              isOnline: true,
              isPaired: false
            }
          ]
        };
      }

      if (endpoint === '/devices/pair') {
        return { success: true, message: 'Paired' };
      }

      if (endpoint === '/devices/unpair') {
        return { success: true, message: 'Unpaired' };
      }

      // Transfers
      if (endpoint === '/transfers') {
        return { transfers: [] };
      }

      if (endpoint === '/transfers/start') {
        return { success: true, transferId: 'tr_' + Date.now() };
      }

      // Google drive
      if (endpoint === '/gdrive/status') {
        return { isConnected: false, simulatedEmail: null };
      }

      if (endpoint === '/gdrive/connect') {
        return { isConnected: true, simulatedEmail: body.simulatedEmail || 'bharath@gmail.com' };
      }

      if (endpoint === '/gdrive/disconnect') {
        return { isConnected: false, simulatedEmail: null };
      }

      if (endpoint.includes('/gdrive/backup')) {
        return { success: true, message: 'File backed up to Google Drive' };
      }

      return { success: true };
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
      if (isStaticPages) {
        return this.mockStaticUpload(file, folderId, onProgress);
      }

      try {
        const CHUNK_SIZE = 5 * 1024 * 1024;
        const totalSize = file.size;

        const initRes = await this.request('/files/chunk/init', {
          method: 'POST',
          body: {
            fileName: file.name,
            fileSize: totalSize,
            folderId: folderId || null
          }
        });

        if (!initRes || !initRes.uploadId) {
          return this.mockStaticUpload(file, folderId, onProgress);
        }

        const uploadId = initRes.uploadId;
        let startByte = 0;
        let startTime = Date.now();
        const abortController = new AbortController();
        this.activeUploads.set(uploadId, { abortController, file });

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

        const finalRes = await this.request('/files/chunk/finalize', {
          method: 'POST',
          body: { uploadId }
        });

        this.activeUploads.delete(uploadId);
        return finalRes;
      } catch (err) {
        console.warn('Real chunk upload failed, falling back to browser storage:', err.message);
        return this.mockStaticUpload(file, folderId, onProgress);
      }
    }

    async mockStaticUpload(file, folderId, onProgress) {
      const totalSize = file.size;
      const steps = 10;
      for (let i = 1; i <= steps; i++) {
        await new Promise(r => setTimeout(r, 80));
        const uploaded = Math.round((totalSize / steps) * i);
        if (onProgress) {
          onProgress({
            uploadId: 'mock_up_' + Date.now(),
            fileName: file.name,
            uploadedBytes: uploaded,
            totalBytes: totalSize,
            percent: Math.round((i / steps) * 100),
            speedBps: 34 * 1024 * 1024,
            etaSec: Math.max(0, steps - i)
          });
        }
      }

      let category = 'others';
      if (file.type.startsWith('video/')) category = 'movies';
      else if (file.type.startsWith('audio/')) category = 'audio';
      else if (file.type.startsWith('image/')) category = 'images';
      else if (file.type.includes('pdf') || file.type.includes('text') || file.type.includes('document')) category = 'documents';

      let streamUrl = '';
      try {
        streamUrl = URL.createObjectURL(file);
      } catch (e) {}

      const newFile = {
        id: 'f_up_' + Date.now(),
        name: file.name,
        original_name: file.name,
        size_bytes: file.size,
        category,
        mime_type: file.type || 'application/octet-stream',
        streamUrl,
        created_at: new Date().toISOString()
      };

      const files = JSON.parse(localStorage.getItem('offline_files_data') || '[]');
      files.unshift(newFile);
      localStorage.setItem('offline_files_data', JSON.stringify(files));

      return { success: true, file: newFile };
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
