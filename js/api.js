// public/js/api.js - Velora Cloud API Client & Chunked Resumable Large File Uploader
(function (global) {
  // Lightweight IndexedDB helper for Offline Browser Fallback Mode
  const IDB_NAME = 'velora_offline_blobs';
  const IDB_STORE = 'blobs';

  function getIDB() {
    return new Promise((resolve, reject) => {
      if (typeof indexedDB === 'undefined') return resolve(null);
      const req = indexedDB.open(IDB_NAME, 1);
      req.onupgradeneeded = () => {
        if (!req.result.objectStoreNames.contains(IDB_STORE)) {
          req.result.createObjectStore(IDB_STORE);
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  async function idbPutBlob(id, blob) {
    try {
      const db = await getIDB();
      if (!db) return;
      return new Promise((resolve, reject) => {
        const tx = db.transaction(IDB_STORE, 'readwrite');
        tx.objectStore(IDB_STORE).put(blob, id);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
    } catch (e) {
      console.warn('IDB put error:', e);
    }
  }

  async function idbGetBlob(id) {
    try {
      const db = await getIDB();
      if (!db) return null;
      return new Promise((resolve, reject) => {
        const tx = db.transaction(IDB_STORE, 'readonly');
        const req = tx.objectStore(IDB_STORE).get(id);
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
    } catch (e) {
      return null;
    }
  }

  async function idbDeleteBlob(id) {
    try {
      const db = await getIDB();
      if (!db) return;
      return new Promise((resolve, reject) => {
        const tx = db.transaction(IDB_STORE, 'readwrite');
        tx.objectStore(IDB_STORE).delete(id);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
    } catch (e) {}
  }

  class ApiService {
    constructor() {
      const isStaticHost = window.location.hostname.includes('github.io') ||
                           window.location.protocol === 'file:' ||
                           (window.location.port !== '3000' && window.location.port !== '');

      const savedUrl = localStorage.getItem('velora_server_url');
      if (savedUrl) {
        this.serverUrl = savedUrl.replace(/\/+$/, '');
      } else if (isStaticHost) {
        // When loaded on GitHub Pages or custom port, default backend target to http://localhost:3000
        this.serverUrl = 'http://localhost:3000';
      } else {
        this.serverUrl = '';
      }

      this.token = localStorage.getItem('cloud_token') || null;
      this.user = JSON.parse(localStorage.getItem('cloud_user') || 'null');
      this.activeUploads = new Map();
      this.isConnected = true;
      this.lastSyncTime = null;
      this.fallbackMode = false;
      this.blobUrlCache = new Map();
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
      const base = this.serverUrl ? `${this.serverUrl.replace(/\/+$/, '')}/api` : '/api';
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
      const cleanEndpoint = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
      const url = `${this.getApiBase()}${cleanEndpoint}`;
      const headers = this.getHeaders(options.headers || {});

      if (options.body && typeof options.body === 'object' && !(options.body instanceof Blob) && !(options.body instanceof FormData)) {
        headers['Content-Type'] = 'application/json';
        options.body = JSON.stringify(options.body);
      }

      options.headers = headers;

      try {
        let res = null;
        let networkFailed = false;

        try {
          res = await fetch(url, options);
        } catch (fetchErr) {
          networkFailed = true;
        }

        // If primary URL failed on static host, probe http://localhost:3000 directly
        if ((networkFailed || (res && res.status === 404)) && !this.serverUrl && window.location.port !== '3000') {
          try {
            const localUrl = `http://localhost:3000/api${cleanEndpoint}`;
            const altRes = await fetch(localUrl, options);
            if (altRes.ok) {
              this.setServerUrl('http://localhost:3000');
              this.isConnected = true;
              this.fallbackMode = false;
              return await altRes.json().catch(() => ({}));
            }
          } catch (e) {}
        }

        if (res && res.status === 401) {
          const contentType = res.headers.get('content-type') || '';
          if (contentType.includes('application/json')) {
            const errData = await res.json().catch(() => ({}));
            // If it's a login failure (e.g. wrong password), return the error message
            if (cleanEndpoint.includes('/auth/login')) {
              throw new Error(errData.error || 'Invalid email or password.');
            }
          }
          this.setAuth(null, null);
          window.dispatchEvent(new CustomEvent('auth:expired'));
          throw new Error('Authentication session expired. Please sign in again.');
        }

        if (res && res.ok) {
          this.isConnected = true;
          this.fallbackMode = false;
          return await res.json().catch(() => ({}));
        }

        // Handle specific server JSON errors (e.g. 400 Bad Request, duplicate email, etc.)
        if (res) {
          const contentType = res.headers.get('content-type') || '';
          if (contentType.includes('application/json')) {
            const errData = await res.json().catch(() => ({}));
            if (errData && errData.error) {
              throw new Error(errData.error);
            }
          }
        }

        // If backend is 404 (static host without server) or network unreachable:
        // Activate Seamless Local Browser Fallback so users are NEVER blocked with HTTP 404!
        console.warn(`[Velora] Server not available at ${url} (HTTP ${res ? res.status : 'offline'}). Engaging Browser Local Mode.`);
        this.fallbackMode = true;
        this.isConnected = false;
        return await this.mockOfflineRequest(cleanEndpoint, options);

      } catch (err) {
        if (err.name === 'AbortError') throw err;
        // If it's an explicit validation/auth error from server, rethrow to user
        if (err.message && !err.message.includes('404') && !err.message.includes('Failed to fetch') && !err.message.includes('NetworkError')) {
          throw err;
        }

        // Fallback to offline local mode
        this.fallbackMode = true;
        this.isConnected = false;
        return await this.mockOfflineRequest(cleanEndpoint, options);
      }
    }

    // --- Seamless Browser Local Fallback Engine (prevents 404 on GitHub Pages) ---
    async mockOfflineRequest(endpoint, options = {}) {
      const method = (options.method || 'GET').toUpperCase();
      let body = {};
      if (options.body) {
        try {
          body = typeof options.body === 'string' ? JSON.parse(options.body) : options.body;
        } catch (e) {
          body = options.body;
        }
      }

      let users = JSON.parse(localStorage.getItem('velora_offline_users') || '[]');
      let files = JSON.parse(localStorage.getItem('velora_offline_files') || '[]');
      let folders = JSON.parse(localStorage.getItem('velora_offline_folders') || '[]');

      // 1. Sign Up (Only allowed once per email)
      if (endpoint === '/auth/register' && method === 'POST') {
        const cleanEmail = (body.email || '').trim().toLowerCase();
        if (!cleanEmail) {
          throw new Error('Email is required.');
        }
        if (!body.password || body.password.length < 6) {
          throw new Error('Password must be at least 6 characters.');
        }

        const existingUser = users.find(u => (u.email || '').trim().toLowerCase() === cleanEmail);
        if (existingUser) {
          throw new Error('An account with this email already exists. Please sign in.');
        }

        const newUser = {
          id: 'user_' + Date.now(),
          email: cleanEmail,
          name: (body.name || cleanEmail.split('@')[0]).trim(),
          password: body.password,
          is_verified: true,
          storageQuotaBytes: 53687091200,
          created_at: Date.now()
        };
        users.push(newUser);
        localStorage.setItem('velora_offline_users', JSON.stringify(users));

        return {
          success: true,
          message: 'Account created! Please verify with your OTP code.',
          userId: newUser.id,
          email: newUser.email,
          name: newUser.name,
          otpCode: '123456'
        };
      }

      // 2. Verify OTP
      if (endpoint === '/auth/verify-otp' && method === 'POST') {
        const cleanEmail = (body.email || '').trim().toLowerCase();
        let user = users.find(u => (u.email || '').trim().toLowerCase() === cleanEmail);
        if (!user) {
          throw new Error('No account found with this email. Please sign up first.');
        }
        user.is_verified = true;
        localStorage.setItem('velora_offline_users', JSON.stringify(users));

        const token = 'offline_token_' + Date.now();
        this.setAuth(token, user);
        return {
          success: true,
          message: 'Verified successfully!',
          token,
          user
        };
      }

      // 3. Login (Must already have signed up & enter correct password)
      if (endpoint === '/auth/login' && method === 'POST') {
        const cleanEmail = (body.email || '').trim().toLowerCase();
        const inputPassword = body.password || '';

        if (!cleanEmail) {
          throw new Error('Email is required.');
        }
        if (!inputPassword) {
          throw new Error('Password is required.');
        }

        let user = users.find(u => (u.email || '').trim().toLowerCase() === cleanEmail);
        if (!user) {
          throw new Error('No account found with this email. Please sign up first.');
        }

        if (user.password && user.password !== inputPassword) {
          throw new Error('Incorrect password. Please try again.');
        }

        // If legacy user did not have a password stored, bind it now
        if (!user.password && inputPassword) {
          user.password = inputPassword;
          localStorage.setItem('velora_offline_users', JSON.stringify(users));
        }

        const token = 'offline_token_' + Date.now();
        this.setAuth(token, user);

        // Bind any orphaned or unassigned files to this user account so they never disappear
        let allFiles = JSON.parse(localStorage.getItem('velora_offline_files') || '[]');
        let filesChanged = false;
        allFiles.forEach(f => {
          if ((!f.user_id || f.user_id === 'user_offline') && user.id) {
            f.user_id = user.id;
            f.user_email = user.email;
            filesChanged = true;
          }
        });
        if (filesChanged) {
          localStorage.setItem('velora_offline_files', JSON.stringify(allFiles));
        }

        return {
          requiresVerification: false,
          sessionToken: token,
          user
        };
      }

      // 4. Me
      if (endpoint === '/auth/me') {
        return { user: this.user || { id: 'user_offline', name: 'Velora User', email: 'user@velora.cloud' } };
      }

      // 5. Logout
      if (endpoint === '/auth/logout') {
        this.setAuth(null, null);
        return { success: true };
      }

      // 6. Storage Stats
      if (endpoint === '/storage/stats') {
        const currentUid = this.user ? this.user.id : null;
        const currentEmail = (this.user && this.user.email) ? this.user.email.trim().toLowerCase() : null;
        let userFiles = files;
        if (currentUid || currentEmail) {
          userFiles = files.filter(f =>
            (currentUid && f.user_id === currentUid) ||
            (currentEmail && f.user_email && f.user_email.toLowerCase() === currentEmail)
          );
        }
        const usedBytes = userFiles.reduce((acc, f) => acc + (f.size_bytes || 0), 0);
        const quotaBytes = (this.user && this.user.storageQuotaBytes) || 53687091200; // 50 GB
        return {
          usedBytes,
          quotaBytes,
          freeBytes: Math.max(0, quotaBytes - usedBytes),
          percentUsed: Math.min(100, Math.round((usedBytes / quotaBytes) * 100)),
          fileCount: userFiles.length,
          categories: [
            { category: 'movies', count: userFiles.filter(f => f.category === 'movies').length, totalBytes: 0 },
            { category: 'documents', count: userFiles.filter(f => f.category === 'documents').length, totalBytes: 0 },
            { category: 'images', count: userFiles.filter(f => f.category === 'images').length, totalBytes: 0 },
            { category: 'audio', count: userFiles.filter(f => f.category === 'audio').length, totalBytes: 0 },
            { category: 'others', count: userFiles.filter(f => f.category === 'others').length, totalBytes: 0 }
          ]
        };
      }

      // 7. Files List (Always preserve user files across logout and login)
      if (endpoint.startsWith('/files') && method === 'GET') {
        const currentUid = this.user ? this.user.id : null;
        const currentEmail = (this.user && this.user.email) ? this.user.email.trim().toLowerCase() : null;

        // Auto-adopt any orphaned offline files to current logged-in user
        let filesChanged = false;
        files.forEach(f => {
          if ((!f.user_id || f.user_id === 'user_offline') && currentUid) {
            f.user_id = currentUid;
            f.user_email = currentEmail;
            filesChanged = true;
          }
        });
        if (filesChanged) {
          localStorage.setItem('velora_offline_files', JSON.stringify(files));
        }

        let userFiles = files;
        if (currentUid || currentEmail) {
          userFiles = files.filter(f =>
            (currentUid && f.user_id === currentUid) ||
            (currentEmail && f.user_email && f.user_email.toLowerCase() === currentEmail)
          );
        }
        return { files: userFiles };
      }

      // 8. Folders List
      if (endpoint.startsWith('/folders') && method === 'GET') {
        return { folders };
      }

      // 9. Create Folder
      if (endpoint === '/folders' && method === 'POST') {
        const newFolder = {
          id: 'folder_' + Date.now(),
          name: body.name || 'New Folder',
          parent_id: body.parentId || null
        };
        folders.push(newFolder);
        localStorage.setItem('velora_offline_folders', JSON.stringify(folders));
        return { folder: newFolder };
      }

      // 10. Delete File (ONLY delete when user explicitly requests)
      if (endpoint.startsWith('/files/') && method === 'DELETE') {
        const fileId = endpoint.replace('/files/', '');
        files = files.filter(f => f.id !== fileId);
        localStorage.setItem('velora_offline_files', JSON.stringify(files));
        idbDeleteBlob(fileId);
        return { success: true };
      }

      // Fallback default
      return { success: true };
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

    async deleteFile(fileId) {
      return this.request(`/files/${fileId}`, { method: 'DELETE' });
    }

    async renameFile(fileId, newName) {
      return this.request(`/files/${fileId}/rename`, {
        method: 'PUT',
        body: { newName }
      });
    }

    async getStorageStats() {
      return this.request('/storage/stats');
    }

    async updatePlaybackPosition(fileId, positionSeconds) {
      return this.request(`/files/${fileId}/playback-position`, {
        method: 'PUT',
        body: { positionSeconds }
      });
    }

    getDownloadUrl(fileId) {
      if (this.fallbackMode) {
        return `javascript:window.downloadOfflineBlob('${fileId}')`;
      }
      const token = this.token ? `?token=${encodeURIComponent(this.token)}` : '';
      return `${this.getApiBase()}/files/download/${fileId}${token}`;
    }

    getStreamUrl(fileId) {
      if (this.fallbackMode) {
        return this.blobUrlCache.get(fileId) || '';
      }
      const token = this.token ? `?token=${encodeURIComponent(this.token)}` : '';
      return `${this.getApiBase()}/files/stream/${fileId}${token}`;
    }

    // --- Resumable 5MB Chunk Streaming Uploader ---
    async uploadFileChunked(file, optionsOrFolderId = null, maybeProgress = null) {
      return this.uploadFileInChunks(file, optionsOrFolderId, maybeProgress);
    }

    async uploadFileInChunks(file, optionsOrFolderId = null, maybeProgress = null) {
      let folderId = null;
      let onProgress = null;

      if (typeof optionsOrFolderId === 'function') {
        onProgress = optionsOrFolderId;
      } else if (optionsOrFolderId && typeof optionsOrFolderId === 'object' && !(optionsOrFolderId instanceof Blob)) {
        folderId = optionsOrFolderId.folderId || null;
        onProgress = optionsOrFolderId.onProgress || null;
      } else {
        folderId = optionsOrFolderId || null;
        onProgress = maybeProgress || null;
      }

      const CHUNK_SIZE = 5 * 1024 * 1024; // 5MB chunks
      const totalSize = file.size;
      const totalChunks = Math.ceil(totalSize / CHUNK_SIZE) || 1;

      // If running in browser fallback mode (GitHub Pages without running backend)
      if (this.fallbackMode || !this.isConnected) {
        const fileId = 'file_' + Date.now();
        await idbPutBlob(fileId, file);
        const blobUrl = URL.createObjectURL(file);
        this.blobUrlCache.set(fileId, blobUrl);

        let ext = file.name.split('.').pop().toLowerCase();
        let cat = 'others';
        if (['mp4', 'mkv', 'avi', 'mov', 'webm'].includes(ext)) cat = 'movies';
        else if (['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(ext)) cat = 'images';
        else if (['mp3', 'wav', 'flac', 'ogg', 'm4a'].includes(ext)) cat = 'audio';
        else if (['pdf', 'doc', 'docx', 'txt', 'zip'].includes(ext)) cat = 'documents';

        let files = JSON.parse(localStorage.getItem('velora_offline_files') || '[]');
        const currentUid = this.user ? this.user.id : 'user_offline';
        const currentEmail = (this.user && this.user.email) ? this.user.email.trim().toLowerCase() : '';

        const newFileRecord = {
          id: fileId,
          user_id: currentUid,
          user_email: currentEmail,
          folder_id: folderId,
          name: file.name,
          original_name: file.name,
          category: cat,
          mime_type: file.type || 'application/octet-stream',
          size_bytes: totalSize,
          created_at: Date.now(),
          updated_at: Date.now()
        };
        files.unshift(newFileRecord);
        localStorage.setItem('velora_offline_files', JSON.stringify(files));

        if (onProgress) {
          onProgress({
            uploadId: fileId,
            fileName: file.name,
            percent: 100,
            uploadedBytes: totalSize,
            totalBytes: totalSize,
            speedBps: 5000000,
            etaSec: 0,
            chunkIndex: 0,
            totalChunks: 1
          });
        }
        return { success: true, file: newFileRecord };
      }

      // True Persistent Server Chunked Upload
      let initRes;
      try {
        initRes = await this.request('/files/chunk/init', {
          method: 'POST',
          body: {
            fileName: file.name,
            fileSize: totalSize,
            folderId: folderId || null
          }
        });
      } catch (initErr) {
        // If server returned 404 or failed, fall back gracefully to local save
        this.fallbackMode = true;
        return this.uploadFileInChunks(file, { folderId, onProgress });
      }

      if (!initRes || !initRes.uploadId) {
        throw new Error('Server failed to initiate upload session.');
      }

      const uploadId = initRes.uploadId;
      const chunkSize = initRes.chunkSize || CHUNK_SIZE;
      const serverTotalChunks = initRes.totalChunks || totalChunks;
      const abortController = new AbortController();

      this.activeUploads.set(uploadId, {
        abortController,
        file,
        totalSize,
        chunkSize,
        totalChunks: serverTotalChunks
      });

      let uploadedBytes = 0;
      const startTime = Date.now();

      try {
        for (let chunkIndex = 0; chunkIndex < serverTotalChunks; chunkIndex++) {
          if (abortController.signal.aborted) {
            throw new Error('Upload cancelled by user.');
          }

          const startByte = chunkIndex * chunkSize;
          const endByte = Math.min(startByte + chunkSize, totalSize);
          const chunkBlob = file.slice(startByte, endByte);

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
                  'X-Total-Chunks': String(serverTotalChunks),
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
                await new Promise(r => setTimeout(r, 1000));
              }
            }
          }

          if (!chunkSuccess) {
            throw new Error(`Chunk ${chunkIndex + 1}/${serverTotalChunks} failed: ${lastChunkError ? lastChunkError.message : 'Unknown error'}`);
          }

          uploadedBytes = endByte;
          const elapsedSec = (Date.now() - startTime) / 1000;
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
              totalChunks: serverTotalChunks
            });
          }
        }

        const finalRes = await this.request('/files/chunk/finalize', {
          method: 'POST',
          body: { uploadId }
        });

        this.activeUploads.delete(uploadId);
        this.lastSyncTime = Date.now();
        return finalRes;
      } catch (err) {
        if (!abortController.signal.aborted) {
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

    // --- Device Discovery & Transfers API ---
    async getDevices() { return this.request('/devices'); }
    async getMyDeviceInfo() { return this.request('/devices/my-info'); }
    async pairDevice(deviceId, pairCode) { return this.request('/devices/pair', { method: 'POST', body: { deviceId, pairCode } }); }
    async unpairDevice(deviceId) { return this.request('/devices/unpair', { method: 'POST', body: { deviceId } }); }
    async getTransfers() { return this.request('/transfers'); }
    async startTransfer(targetDeviceId, fileId) { return this.request('/transfers/start', { method: 'POST', body: { targetDeviceId, fileId } }); }
    async cancelTransfer(transferId) { return this.request(`/transfers/${transferId}/cancel`, { method: 'POST' }); }

    // --- Google Drive Decoupled Backup ---
    async getGDriveStatus() { return this.request('/gdrive/status'); }
    async connectGDrive(email) { return this.request('/gdrive/connect', { method: 'POST', body: { simulatedEmail: email } }); }
    async disconnectGDrive() { return this.request('/gdrive/disconnect', { method: 'POST' }); }
    async backupFileToGDrive(fileId) { return this.request(`/gdrive/backup/${fileId}`, { method: 'POST' }); }
  }

  // Global helper for offline blob downloads
  global.downloadOfflineBlob = async function (fileId) {
    const blob = await idbGetBlob(fileId);
    if (!blob) return alert('File data not found in local storage.');
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileId;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
  };

  global.api = new ApiService();
})(window);
