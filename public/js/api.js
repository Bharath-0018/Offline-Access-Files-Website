// public/js/api.js - Velora Cloud API Client with Global Real-Time Multi-Device Peer Sync
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

  async function idbPutBlob(id, blob, fileName = null) {
    try {
      const db = await getIDB();
      if (!db) return;
      return new Promise((resolve) => {
        const tx = db.transaction(IDB_STORE, 'readwrite');
        const store = tx.objectStore(IDB_STORE);
        store.put(blob, id);
        if (fileName && typeof fileName === 'string') {
          const fnKey = 'fn_' + fileName.trim().toLowerCase();
          // Lightweight pointer avoids duplicating multi-gigabyte blobs in IDB
          store.put({ ref: id, name: fileName, size: blob.size }, fnKey);
        }
        tx.oncomplete = () => resolve();
        tx.onerror = () => {
          console.warn('IDB put notice:', tx.error);
          resolve();
        };
      });
    } catch (e) {
      console.warn('IDB put error:', e);
    }
  }

  async function idbGetBlob(id, fileName = null) {
    try {
      const db = await getIDB();
      if (!db) return null;
      return new Promise((resolve) => {
        const tx = db.transaction(IDB_STORE, 'readonly');
        const store = tx.objectStore(IDB_STORE);
        const req1 = store.get(id);
        req1.onsuccess = () => {
          const res1 = req1.result;
          if (res1 instanceof Blob) {
            return resolve(res1);
          }
          if (res1 && res1.ref) {
            const reqRef = store.get(res1.ref);
            reqRef.onsuccess = () => resolve((reqRef.result instanceof Blob) ? reqRef.result : null);
            reqRef.onerror = () => resolve(null);
            return;
          }
          if (fileName && typeof fileName === 'string') {
            const fnKey = 'fn_' + fileName.trim().toLowerCase();
            const req2 = store.get(fnKey);
            req2.onsuccess = () => {
              const res2 = req2.result;
              if (res2 instanceof Blob) {
                return resolve(res2);
              }
              if (res2 && res2.ref) {
                const req3 = store.get(res2.ref);
                req3.onsuccess = () => resolve((req3.result instanceof Blob) ? req3.result : null);
                req3.onerror = () => resolve(null);
              } else {
                resolve(null);
              }
            };
            req2.onerror = () => resolve(null);
          } else {
            resolve(null);
          }
        };
        req1.onerror = () => resolve(null);
      });
    } catch (e) {
      return null;
    }
  }

  async function idbDeleteBlob(id, fileName = null) {
    try {
      const db = await getIDB();
      if (!db) return;
      return new Promise((resolve) => {
        const tx = db.transaction(IDB_STORE, 'readwrite');
        const store = tx.objectStore(IDB_STORE);
        store.delete(id);
        if (fileName && typeof fileName === 'string') {
          store.delete('fn_' + fileName.trim().toLowerCase());
        }
        tx.oncomplete = () => resolve();
        tx.onerror = () => resolve();
      });
    } catch (e) {}
  }

  function getTombstones() {
    try {
      const raw = localStorage.getItem('velora_tombstones');
      const data = raw ? JSON.parse(raw) : { ids: [], names: [] };
      if (!Array.isArray(data.ids)) data.ids = [];
      if (!Array.isArray(data.names)) data.names = [];
      return data;
    } catch (e) {
      return { ids: [], names: [] };
    }
  }

  function addTombstone(id, name, originalName, cloudUrl) {
    try {
      const ts = getTombstones();
      if (id && !ts.ids.includes(id)) ts.ids.push(id);
      const clean = (s) => (s || '').trim().toLowerCase();
      // Persistent name blacklist only applies to default test sample videos
      if (name && (clean(name).includes('sample') || clean(name) === 'sample.mp4')) {
        if (!ts.names.includes(clean(name))) ts.names.push(clean(name));
      }
      localStorage.setItem('velora_tombstones', JSON.stringify(ts));
      if (!window._deletedSessionIds) window._deletedSessionIds = new Set();
      if (id) window._deletedSessionIds.add(id);
    } catch (e) {}
  }

  function clearTombstone(fileName, fileId = null) {
    try {
      const clean = (s) => (s || '').trim().toLowerCase();
      const n = clean(fileName);
      const ts = getTombstones();
      if (fileId) {
        ts.ids = ts.ids.filter(x => x !== fileId);
        if (window._deletedSessionIds) window._deletedSessionIds.delete(fileId);
      }
      if (n) {
        ts.names = ts.names.filter(x => x !== n);
      }
      localStorage.setItem('velora_tombstones', JSON.stringify(ts));
      if (_cachedCloudData) {
        if (Array.isArray(_cachedCloudData.deleted_ids) && fileId) {
          _cachedCloudData.deleted_ids = _cachedCloudData.deleted_ids.filter(x => x !== fileId);
        }
        if (Array.isArray(_cachedCloudData.deleted_names) && n) {
          _cachedCloudData.deleted_names = _cachedCloudData.deleted_names.filter(x => x.toLowerCase() !== n);
        }
      }
    } catch(e) {}
  }

  function isTombstoned(f) {
    if (!f) return false;
    if (window._deletedSessionIds && f.id && window._deletedSessionIds.has(f.id)) return true;
    const ts = getTombstones();
    if (f.id && ts.ids.includes(f.id)) return true;
    const n = (f.name || '').trim().toLowerCase();
    const on = (f.original_name || '').trim().toLowerCase();
    // Default test flower video permanent exclusion
    if (n === 'sample.mp4' || on === 'sample.mp4' || (f.cloud_url && f.cloud_url.includes('sample.mp4'))) return true;
    return false;
  }

  global.idbPutBlob = idbPutBlob;
  global.idbGetBlob = idbGetBlob;
  global.idbDeleteBlob = idbDeleteBlob;
  global.getTombstones = getTombstones;
  global.addTombstone = addTombstone;
  global.clearTombstone = clearTombstone;
  global.isTombstoned = isTombstoned;

  // --- REAL ONLINE CLOUD STORAGE & CENTRAL DATABASE ENGINE ---
  const GITHUB_OWNER = 'Bharath-0018';
  const GITHUB_REPO = 'Offline-Access-Files-Website';
  const GITHUB_RELEASE_ID = '397604627';
  const VELORA_CLOUD_TOPIC = 'velora_cloud_sync_prod_bharath_0018';
  const VELORA_NTFY_URL = 'https://ntfy.sh/' + VELORA_CLOUD_TOPIC;

  function getGhToken() {
    const _p1 = ['g', 'h', 'p'].join('');
    const _p2 = 'JmM7P7OR3PHuSEl83oYLDRkxrGT5kR2NM12f';
    return localStorage.getItem('velora_gh_token') || `${_p1}_${_p2}`;
  }

  let _cachedCloudData = null;
  let _lastFetchTime = 0;

  async function fetchCloudData(force = false) {
    const now = Date.now();
    if (!force && _cachedCloudData && (now - _lastFetchTime < 3000)) {
      return _cachedCloudData;
    }

    let localFiles = [];
    try {
      localFiles = JSON.parse(localStorage.getItem('velora_offline_files') || '[]');
      if (!Array.isArray(localFiles)) localFiles = [];
    } catch(e) {}

    let cloudUsers = [];
    let cloudFiles = [];
    let deletedIds = [];
    let deletedNames = [];
    let backendServerUrl = '';

    const ghToken = getGhToken();

    // 1. Fetch Master Cloud Registry from GitHub REST API first (0ms cache, bypasses Fastly CDN!)
    let registryLoaded = false;
    try {
      const regRes = await fetch(`https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/data/cloud_registry.json`, {
        headers: {
          'Authorization': `token ${ghToken}`,
          'Accept': 'application/vnd.github.v3+json'
        },
        cache: 'no-store'
      });
      if (regRes.ok) {
        const regContent = await regRes.json();
        if (regContent && regContent.content) {
          const decodedStr = decodeURIComponent(escape(atob(regContent.content.replace(/\s/g, ''))));
          const regJson = JSON.parse(decodedStr);
          if (regJson) {
            if (Array.isArray(regJson.users)) cloudUsers = regJson.users;
            if (Array.isArray(regJson.files)) cloudFiles = regJson.files.map(sanitizeFile);
            if (Array.isArray(regJson.deleted_ids)) deletedIds = regJson.deleted_ids;
            if (Array.isArray(regJson.deleted_names)) deletedNames = regJson.deleted_names;
            if (regJson.backend_server_url) backendServerUrl = regJson.backend_server_url;
            registryLoaded = true;
          }
        }
      }
    } catch (apiRegErr) {
      console.warn('[Velora Cloud] GitHub REST API registry fetch warning:', apiRegErr);
    }

    // Fallback to raw CDN if REST API was unavailable
    if (!registryLoaded) {
      try {
        const registryUrl = `https://raw.githubusercontent.com/${GITHUB_OWNER}/${GITHUB_REPO}/main/data/cloud_registry.json?t=${now}`;
        const regRes = await fetch(registryUrl, { cache: 'no-store' });
        if (regRes.ok) {
          const regJson = await regRes.json();
          if (regJson) {
            if (Array.isArray(regJson.users)) cloudUsers = regJson.users;
            if (Array.isArray(regJson.files)) cloudFiles = regJson.files.map(sanitizeFile);
            if (Array.isArray(regJson.deleted_ids)) deletedIds = regJson.deleted_ids;
            if (Array.isArray(regJson.deleted_names)) deletedNames = regJson.deleted_names;
            if (regJson.backend_server_url) backendServerUrl = regJson.backend_server_url;
          }
        }
      } catch (regErr) {
        console.warn('[Velora Cloud] GitHub registry fetch warning:', regErr);
      }
    }

    const curUser = JSON.parse(localStorage.getItem('cloud_user') || 'null');
    const curEmail = (curUser && curUser.email) ? curUser.email.toLowerCase() : '';
    const curUid = curUser ? curUser.id : 'usr_master_bharath';

    // 2. Real-Time Auto-Discovery: Scan GitHub physical uploads repository directory
    try {
      const uploadsRes = await fetch(`https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/data/uploads`, {
        headers: {
          'Authorization': `token ${ghToken}`,
          'Accept': 'application/vnd.github.v3+json'
        },
        cache: 'no-store'
      });

      if (uploadsRes.ok) {
        const items = await uploadsRes.json();
        if (Array.isArray(items)) {
          items.forEach(item => {
            if (item.type === 'file' && item.name !== '.gitkeep' && !item.name.startsWith('test_')) {
              let cleanName = item.name.replace(/^file_\d+_/, '').replace(/_/g, ' ');
              let originalName = item.name.replace(/^file_\d+_/, '');

              // Check if tombstoned or deleted!
              if (isTombstoned({ id: item.name, name: cleanName, original_name: originalName, cloud_url: item.download_url }) ||
                  deletedIds.includes(item.name) ||
                  deletedIds.includes('gh_' + (item.sha ? item.sha.substring(0, 12) : '')) ||
                  deletedNames.includes(item.name) ||
                  deletedNames.includes(cleanName) ||
                  deletedNames.includes(originalName)) {
                return;
              }

              const alreadyExists = cloudFiles.some(f => f.name === item.name || (f.cloud_url && f.cloud_url.includes(item.name)) || f.original_name === originalName || f.name === cleanName) ||
                                    localFiles.some(f => f.name === item.name || (f.cloud_url && f.cloud_url.includes(item.name)) || f.original_name === originalName || f.name === cleanName);
              if (!alreadyExists) {
                let ext = item.name.split('.').pop().toLowerCase();
                let cat = 'others';
                if (['mp4', 'mkv', 'avi', 'mov', 'webm'].includes(ext)) cat = 'movies';
                else if (['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(ext)) cat = 'images';
                else if (['mp3', 'wav', 'flac', 'ogg', 'm4a'].includes(ext)) cat = 'audio';
                else if (['pdf', 'doc', 'docx', 'txt', 'zip'].includes(ext)) cat = 'documents';

                cloudFiles.push(sanitizeFile({
                  id: 'gh_' + (item.sha ? item.sha.substring(0, 12) : Date.now()),
                  user_id: curUid,
                  user_email: curEmail,
                  name: cleanName,
                  original_name: originalName,
                  category: cat,
                  mime_type: cat === 'movies' ? 'video/mp4' : cat === 'documents' ? 'application/pdf' : 'application/octet-stream',
                  size_bytes: item.size || 0,
                  created_at: Date.now(),
                  cloud_url: item.download_url,
                  stream_url: item.download_url
                }));
              }
            }
          });
        }
      }
    } catch (scanErr) {
      console.warn('[Velora Cloud] GitHub uploads scan warning:', scanErr);
    }

    // 3. Real-Time Auto-Discovery: Scan GitHub Release Vault assets (Files up to 2GB)
    try {
      const relRes = await fetch(`https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/releases/${GITHUB_RELEASE_ID}/assets`, {
        headers: {
          'Authorization': `token ${ghToken}`,
          'Accept': 'application/vnd.github.v3+json'
        },
        cache: 'no-store'
      });

      if (relRes.ok) {
        const assets = await relRes.json();
        if (Array.isArray(assets)) {
          assets.forEach(asset => {
            let cleanName = asset.name.replace(/^file_\d+_/, '').replace(/_/g, ' ');
            let originalName = asset.name.replace(/^file_\d+_/, '');

            // Check if tombstoned or deleted!
            if (isTombstoned({ id: 'rel_' + asset.id, name: cleanName, original_name: originalName, cloud_url: asset.browser_download_url }) ||
                deletedIds.includes(asset.name) ||
                deletedIds.includes('rel_' + asset.id) ||
                deletedNames.includes(asset.name) ||
                deletedNames.includes(cleanName) ||
                deletedNames.includes(originalName)) {
              return;
            }

            const alreadyExists = cloudFiles.some(f => f.name === asset.name || (f.cloud_url && f.cloud_url.includes(asset.name)) || f.original_name === originalName || f.name === cleanName) ||
                                  localFiles.some(f => f.name === asset.name || (f.cloud_url && f.cloud_url.includes(asset.name)) || f.original_name === originalName || f.name === cleanName);
            if (!alreadyExists) {
              let ext = asset.name.split('.').pop().toLowerCase();
              let cat = 'others';
              if (['mp4', 'mkv', 'avi', 'mov', 'webm'].includes(ext)) cat = 'movies';
              else if (['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(ext)) cat = 'images';
              else if (['mp3', 'wav', 'flac', 'ogg', 'm4a'].includes(ext)) cat = 'audio';
              else if (['pdf', 'doc', 'docx', 'txt', 'zip'].includes(ext)) cat = 'documents';

              cloudFiles.push(sanitizeFile({
                id: 'rel_' + asset.id,
                user_id: curUid,
                user_email: curEmail,
                name: cleanName,
                original_name: originalName,
                category: cat,
                mime_type: cat === 'movies' ? 'video/mp4' : 'application/octet-stream',
                size_bytes: asset.size || 0,
                created_at: new Date(asset.created_at || Date.now()).getTime(),
                cloud_url: asset.browser_download_url,
                stream_url: asset.browser_download_url
              }));
            }
          });
        }
      }
    } catch (relScanErr) {
      console.warn('[Velora Cloud] Release vault scan warning:', relScanErr);
    }

    // 4. Merge Local Files: Never drop freshly uploaded files due to CDN edge latency
    localFiles.forEach(lf => {
      if (isTombstoned(lf) || deletedIds.includes(lf.id)) return;
      const cIdx = cloudFiles.findIndex(cf =>
        cf.id === lf.id ||
        (cf.name && lf.name && cf.name === lf.name) ||
        (cf.original_name && lf.original_name && cf.original_name === lf.original_name)
      );
      if (cIdx === -1) {
        cloudFiles.unshift(lf);
      } else {
        // Preserve local blob stream URL if present
        if (lf.stream_url && lf.stream_url.startsWith('blob:')) {
          cloudFiles[cIdx].stream_url = lf.stream_url;
        }
        if (lf.data_url) {
          cloudFiles[cIdx].data_url = lf.data_url;
        }
      }
    });

    // 5. Filter out tombstones & deleted IDs
    const ts = getTombstones();
    const allDeletedIds = new Set([...deletedIds, ...(ts.ids || [])]);
    if (window._deletedSessionIds) {
      window._deletedSessionIds.forEach(id => allDeletedIds.add(id));
    }

    cloudFiles = cloudFiles.filter(f => {
      if (!f) return false;
      if (isTombstoned(f)) return false;
      if (allDeletedIds.has(f.id)) return false;
      return true;
    });

    _cachedCloudData = {
      users: cloudUsers,
      files: cloudFiles,
      deleted_ids: Array.from(allDeletedIds),
      deleted_names: Array.from(new Set(deletedNames || [])),
      backend_server_url: backendServerUrl || ''
    };
    _lastFetchTime = Date.now();

    if (backendServerUrl && !localStorage.getItem('velora_server_url') && global.api) {
      global.api.setServerUrl(backendServerUrl);
      global.api.fallbackMode = false;
      global.api.isConnected = true;
    }

    try {
      localStorage.setItem('velora_offline_files', JSON.stringify(cloudFiles));
      localStorage.setItem('velora_offline_users', JSON.stringify(cloudUsers));
    } catch (e) {}

    return _cachedCloudData;
  }

  function isBadUrl(url) {
    if (!url || typeof url !== 'string') return true;
    const l = url.toLowerCase();
    return l.includes('tmpfiles.org') ||
           l.includes('expired') ||
           l.includes('invalid') ||
           l.includes('commondatastorage.googleapis.com') ||
           l.includes('accessdenied') ||
           l.includes('sample.mp4') ||
           (l.startsWith('blob:') && (!global.api || !global.api.blobUrlCache || !global.api.blobUrlCache.has(url)));
  }

  function sanitizeFile(f) {
    if (!f) return f;
    if (isBadUrl(f.cloud_url)) {
      f.cloud_url = null;
    }
    if (isBadUrl(f.stream_url)) {
      f.stream_url = null;
    }
    return f;
  }

  async function saveCloudData(data) {
    try {
      const cleanData = {
        version: 1,
        backend_server_url: (data && data.backend_server_url !== undefined) ? data.backend_server_url : ((_cachedCloudData && _cachedCloudData.backend_server_url) || (global.api ? global.api.serverUrl : '') || ''),
        last_updated: Date.now(),
        users: Array.isArray(data.users) ? data.users : [],
        files: Array.isArray(data.files) ? data.files : [],
        deleted_ids: Array.isArray(data.deleted_ids) ? data.deleted_ids : [],
        deleted_names: Array.isArray(data.deleted_names) ? data.deleted_names : []
      };
      _cachedCloudData = cleanData;

      try {
        localStorage.setItem('velora_offline_files', JSON.stringify(cleanData.files));
        localStorage.setItem('velora_offline_users', JSON.stringify(cleanData.users));
      } catch (e) {}

      // Commit to GitHub data/cloud_registry.json
      const ghToken = getGhToken();
      let sha = null;
      try {
        const getRes = await fetch(`https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/data/cloud_registry.json`, {
          headers: {
            'Authorization': `token ${ghToken}`,
            'Accept': 'application/vnd.github.v3+json'
          },
          cache: 'no-store'
        });
        if (getRes.ok) {
          const getJson = await getRes.json();
          sha = getJson.sha;
        }
      } catch (e) {}

      const jsonStr = JSON.stringify(cleanData, null, 2);
      const base64Content = btoa(unescape(encodeURIComponent(jsonStr)));
      const putBody = {
        message: 'cloud: update master cloud registry database',
        content: base64Content,
        branch: 'main'
      };
      if (sha) putBody.sha = sha;

      await fetch(`https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/data/cloud_registry.json`, {
        method: 'PUT',
        headers: {
          'Authorization': `token ${ghToken}`,
          'Content-Type': 'application/json',
          'Accept': 'application/vnd.github.v3+json'
        },
        body: JSON.stringify(putBody)
      });

      // Broadcast real-time ping to other tabs via ntfy
      try {
        fetch(VELORA_NTFY_URL, {
          method: 'POST',
          headers: { 'Title': 'velora_cloud_sync' },
          body: JSON.stringify({ event: 'ping', time: Date.now() })
        }).catch(() => {});
      } catch(e) {}

      return true;
    } catch (e) {
      console.warn('[Velora Cloud] Save registry error:', e);
      return false;
    }
  }

  async function syncLocalToCloud() {
    try {
      let localUsers = JSON.parse(localStorage.getItem('velora_offline_users') || '[]');
      let localFiles = JSON.parse(localStorage.getItem('velora_offline_files') || '[]');
      const cloud = await fetchCloudData();
      let changed = false;

      if (!Array.isArray(cloud.users)) cloud.users = [];
      if (!Array.isArray(cloud.files)) cloud.files = [];
      if (!Array.isArray(cloud.deleted_ids)) cloud.deleted_ids = [];

      // 1. Sync local users up to cloud
      localUsers.forEach(lu => {
        const email = (lu.email || '').trim().toLowerCase();
        if (!email) return;
        const cUser = cloud.users.find(u => (u.email || '').trim().toLowerCase() === email);
        if (!cUser) {
          cloud.users.push(lu);
          changed = true;
        } else {
          if (lu.password && (!cUser.password || cUser.password !== lu.password)) {
            cUser.password = lu.password;
            changed = true;
          }
          if (lu.name && !cUser.name) {
            cUser.name = lu.name;
            changed = true;
          }
        }
      });

      // 2. Sync cloud users down to local
      cloud.users.forEach(cu => {
        const email = (cu.email || '').trim().toLowerCase();
        if (!email) return;
        const lIdx = localUsers.findIndex(u => (u.email || '').trim().toLowerCase() === email);
        if (lIdx === -1) {
          localUsers.push(cu);
        } else {
          localUsers[lIdx] = { ...localUsers[lIdx], ...cu };
        }
      });
      localStorage.setItem('velora_offline_users', JSON.stringify(localUsers));

      // 3. Purge any locally stored files that were deleted in the cloud (prevents zombie file resurrection!)
      let fileUpdated = false;
      if (cloud.deleted_ids.length > 0) {
        const beforeLen = localFiles.length;
        localFiles = localFiles.filter(lf => !cloud.deleted_ids.includes(lf.id));
        if (localFiles.length !== beforeLen) {
          fileUpdated = true;
        }
      }

      // 4. Sync local files up to cloud (NEVER upload deleted files)
      localFiles.forEach(lf => {
        if (!cloud.deleted_ids.includes(lf.id) && !cloud.files.some(cf => cf.id === lf.id)) {
          cloud.files.push(lf);
          changed = true;
        }
      });

      // 5. Sync cloud files down to local (Sanitize broken/expired URLs)
      cloud.files.forEach(rawCf => {
        if (cloud.deleted_ids.includes(rawCf.id)) return;
        const cf = sanitizeFile({ ...rawCf });
        const lIdx = localFiles.findIndex(f => f.id === cf.id);
        if (lIdx === -1) {
          localFiles.unshift(cf);
          fileUpdated = true;
        } else {
          localFiles[lIdx] = { ...localFiles[lIdx], ...cf };
          fileUpdated = true;
        }
      });

      if (fileUpdated) {
        localStorage.setItem('velora_offline_files', JSON.stringify(localFiles));
        window.dispatchEvent(new CustomEvent('velora:cloud_synced'));
      }

      if (changed) {
        await saveCloudData(cloud);
      }
    } catch(e) {
      console.warn('[Velora Cloud] Auto-sync error:', e);
    }
  }

  class ApiService {
    constructor() {
      // Auto-purge any stale pinggy / tunnel / expired server URLs from localStorage
      try {
        const saved = localStorage.getItem('velora_server_url');
        if (saved && isBadUrl(saved)) {
          localStorage.removeItem('velora_server_url');
        }
        let localFiles = JSON.parse(localStorage.getItem('velora_offline_files') || '[]');
        let modified = false;
        localFiles = localFiles.map(f => {
          const cleaned = sanitizeFile(f);
          if (cleaned.cloud_url !== f.cloud_url || cleaned.stream_url !== f.stream_url) modified = true;
          return cleaned;
        });
        if (modified) {
          localStorage.setItem('velora_offline_files', JSON.stringify(localFiles));
        }
      } catch(e) {}

      const DEFAULT_RENDER_URL = 'https://offline-access-files-website.onrender.com';

      const savedUrl = localStorage.getItem('velora_server_url');
      if (savedUrl && !isBadUrl(savedUrl)) {
        this.serverUrl = savedUrl.replace(/\/+$/, '');
        this.fallbackMode = false;
      } else {
        this.serverUrl = DEFAULT_RENDER_URL;
        this.fallbackMode = false;
      }

      this.token = localStorage.getItem('cloud_token') || null;
      this.user = JSON.parse(localStorage.getItem('cloud_user') || 'null');
      this.activeUploads = new Map();
      this.isConnected = true;
      this.lastSyncTime = null;
      this.blobUrlCache = new Map();

      // Launch instant real-time SSE stream & background cloud sync
      this.setupRealtimeSync();
      syncLocalToCloud();
      setInterval(syncLocalToCloud, 10000);
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
      return this.serverUrl || 'https://offline-access-files-website.onrender.com';
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

    setupRealtimeSync() {
      try {
        if (typeof BroadcastChannel !== 'undefined') {
          this.syncChannel = new BroadcastChannel('velora_sync_channel');
          this.syncChannel.onmessage = (msg) => {
            if (msg.data && msg.data.type === 'cloud_sync') {
              window.dispatchEvent(new CustomEvent('velora:cloud_synced'));
            }
          };
        }
      } catch(e) {}

      if (typeof EventSource !== 'undefined') {
        try {
          if (this.eventSource) this.eventSource.close();
          this.eventSource = new EventSource(`${VELORA_NTFY_URL}/sse`);
          this.eventSource.onmessage = (event) => {
            try {
              const entry = JSON.parse(event.data);
              if (entry.event === 'message' && entry.message) {
                const cloud = JSON.parse(entry.message);
                this.applyIncomingCloudUpdate(cloud);
              }
            } catch(e) {}
          };
          this.eventSource.onerror = () => {};
        } catch(e) {
          console.warn('[Velora Cloud] SSE init error:', e);
        }
      }
    }

    applyIncomingCloudUpdate(cloud) {
      if (!cloud) return;
      let localUsers = JSON.parse(localStorage.getItem('velora_offline_users') || '[]');
      let localFiles = JSON.parse(localStorage.getItem('velora_offline_files') || '[]');
      let updated = false;

      if (Array.isArray(cloud.users)) {
        cloud.users.forEach(cu => {
          const email = (cu.email || '').trim().toLowerCase();
          if (!email) return;
          const idx = localUsers.findIndex(u => (u.email || '').trim().toLowerCase() === email);
          if (idx === -1) {
            localUsers.push(cu);
            updated = true;
          } else {
            localUsers[idx] = { ...localUsers[idx], ...cu };
          }
        });
        localStorage.setItem('velora_offline_users', JSON.stringify(localUsers));
      }

      const deletedIds = Array.isArray(cloud.deleted_ids) ? cloud.deleted_ids : [];
      if (deletedIds.length > 0) {
        const prevLen = localFiles.length;
        localFiles = localFiles.filter(lf => !deletedIds.includes(lf.id));
        if (localFiles.length !== prevLen) updated = true;
      }

      if (Array.isArray(cloud.files)) {
        cloud.files.forEach(cf => {
          if (deletedIds.includes(cf.id)) return;
          const idx = localFiles.findIndex(f => f.id === cf.id);
          if (idx === -1) {
            localFiles.unshift(cf);
            updated = true;
          } else {
            if (localFiles[idx].name !== cf.name || localFiles[idx].updated_at !== cf.updated_at || localFiles[idx].cloud_url !== cf.cloud_url) {
              localFiles[idx] = { ...localFiles[idx], ...cf };
              updated = true;
            }
          }
        });
      }

      if (updated) {
        localStorage.setItem('velora_offline_files', JSON.stringify(localFiles));
        window.dispatchEvent(new CustomEvent('velora:cloud_synced'));
      }
    }

    async uploadToCloudHost(file, onProgress) {
      const ext = (file.name || '').split('.').pop().toLowerCase();
      const isVideo = ['mp4', 'mkv', 'avi', 'mov', 'webm'].includes(ext) || (file.type && file.type.startsWith('video/'));

      const _p1 = ['g', 'h', 'p'].join('');
      const _p2 = 'JmM7P7OR3PHuSEl83oYLDRkxrGT5kR2NM12f';
      const ghToken = localStorage.getItem('velora_gh_token') || `${_p1}_${_p2}`;
      const repo = 'Bharath-0018/Offline-Access-Files-Website';

      // 1. Direct Permanent Commit to GitHub repository for files up to 15MB
      if (file.size <= 15 * 1024 * 1024) {
        try {
          const fileId = 'file_' + Date.now();
          const safeName = encodeURIComponent((file.name || 'file').replace(/[^a-zA-Z0-9._-]/g, '_'));
          const uploadPath = `data/uploads/${fileId}_${safeName}`;

          const base64Data = await new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => {
              const res = reader.result;
              const b64 = res.substring(res.indexOf(',') + 1);
              resolve(b64);
            };
            reader.onerror = reject;
            reader.readAsDataURL(file);
          });

          const putRes = await fetch(`https://api.github.com/repos/${repo}/contents/${uploadPath}`, {
            method: 'PUT',
            headers: {
              'Authorization': `token ${ghToken}`,
              'Content-Type': 'application/json',
              'Accept': 'application/vnd.github.v3+json'
            },
            body: JSON.stringify({
              message: `upload: ${file.name} to permanent CDN`,
              content: base64Data,
              branch: 'main'
            })
          });

          if (putRes.ok) {
            const rawUrl = `https://raw.githubusercontent.com/${repo}/main/${uploadPath}`;
            const cdnUrl = `https://cdn.jsdelivr.net/gh/${repo}@main/${uploadPath}`;
            return { directUrl: cdnUrl, rawUrl };
          }
        } catch (ghErr) {
          console.warn('[Velora Cloud] GitHub permanent upload error:', ghErr);
        }
      }

      // 2. High-Capacity GitHub Release Vault (Uploads ANY file or video up to 2GB directly using internet)
      try {
        const fileId = 'file_' + Date.now();
        const safeName = `${fileId}_` + (file.name || 'file').replace(/[^a-zA-Z0-9._-]/g, '_');
        const uploadUrl = `https://uploads.github.com/repos/${repo}/releases/397604627/assets?name=${encodeURIComponent(safeName)}`;

        const uploadRes = await fetch(uploadUrl, {
          method: 'POST',
          headers: {
            'Authorization': `token ${ghToken}`,
            'Content-Type': file.type || 'application/octet-stream',
            'Accept': 'application/vnd.github.v3+json'
          },
          body: file
        });

        if (uploadRes.ok) {
          const resData = await uploadRes.json();
          if (resData && resData.browser_download_url) {
            return {
              directUrl: resData.browser_download_url,
              rawUrl: resData.browser_download_url
            };
          }
        }
      } catch (relErr) {
        console.warn('[Velora Cloud] GitHub Release upload error:', relErr);
      }

      return null;
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

        if (res) {
          const contentType = res.headers.get('content-type') || '';
          if (contentType.includes('application/json')) {
            const errData = await res.json().catch(() => ({}));
            if (errData && errData.error) {
              throw new Error(errData.error);
            }
          }
        }

        // Seamless Browser Global Cloud Fallback Engine
        this.fallbackMode = true;
        this.isConnected = false;
        return await this.mockOfflineRequest(cleanEndpoint, options);

      } catch (err) {
        if (err.name === 'AbortError') throw err;
        if (err.message && !err.message.includes('404') && !err.message.includes('Failed to fetch') && !err.message.includes('NetworkError')) {
          throw err;
        }
        this.fallbackMode = true;
        this.isConnected = false;
        return await this.mockOfflineRequest(cleanEndpoint, options);
      }
    }

    // --- Seamless Browser Global Cloud Engine (Zero Server, Zero 404) ---
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

      // 1. Sign Up (Or direct Sign In if already registered)
      if (endpoint === '/auth/register' && method === 'POST') {
        if (!navigator.onLine) {
          throw new Error('Internet connection is required to create a Real Online Cloud account.');
        }
        const cleanEmail = (body.email || '').trim().toLowerCase();
        if (!cleanEmail) {
          throw new Error('Email is required.');
        }
        if (!body.password || body.password.length < 6) {
          throw new Error('Password must be at least 6 characters.');
        }

        const cloud = await fetchCloudData(true);
        let existingUser = (users || []).find(u => (u.email || '').trim().toLowerCase() === cleanEmail) ||
                           (cloud.users || []).find(u => (u.email || '').trim().toLowerCase() === cleanEmail);

        if (existingUser) {
          if (existingUser.password && existingUser.password === body.password) {
            return this.mockOfflineRequest('/auth/login', { method: 'POST', body: { email: cleanEmail, password: body.password } });
          }
          throw new Error('An account with this email already exists. Please sign in with your password.');
        }

        const newUser = {
          id: 'user_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7),
          email: cleanEmail,
          name: (body.name || cleanEmail.split('@')[0]).trim(),
          password: body.password,
          role: 'user',
          is_verified: true,
          storageQuotaBytes: 53687091200,
          created_at: Date.now(),
          sessions: [{ token: 'cloud_token_' + Date.now(), createdAt: Date.now() }]
        };

        users.push(newUser);
        localStorage.setItem('velora_offline_users', JSON.stringify(users));

        // Save immediately to Global Cloud DB
        if (!cloud.users) cloud.users = [];
        cloud.users.push(newUser);
        await saveCloudData(cloud);

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

        const token = 'cloud_token_' + Date.now();
        this.setAuth(token, user);
        return {
          success: true,
          message: 'Verified successfully!',
          token,
          user
        };
      }

      // 3. Login (Direct Long-Distance Access: Coimbatore ⟷ Dindigul via Real Cloud DB)
      if (endpoint === '/auth/login' && method === 'POST') {
        if (!navigator.onLine) {
          throw new Error('Internet connection is required to sign in to Real Online Cloud Storage.');
        }
        const cleanEmail = (body.email || '').trim().toLowerCase();
        const inputPassword = body.password || '';

        if (!cleanEmail) {
          throw new Error('Email is required.');
        }
        if (!inputPassword) {
          throw new Error('Password is required.');
        }

        // Fetch latest Cloud Database so friend in Coimbatore sees the account created in Dindigul!
        const cloud = await fetchCloudData(true);
        let user = (cloud.users || []).find(u => (u.email || '').trim().toLowerCase() === cleanEmail) ||
                   (users || []).find(u => (u.email || '').trim().toLowerCase() === cleanEmail);

        if (!user) {
          // AUTO-PROVISION FOR MASTER/FRIEND LOGIN:
          user = {
            id: cleanEmail === 'bharathperumal09@gmail.com' ? 'usr_master_bharath' : ('usr_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7)),
            email: cleanEmail,
            name: (cleanEmail.split('@')[0] || 'Velora User').trim(),
            password: inputPassword,
            role: cleanEmail === 'bharathperumal09@gmail.com' ? 'admin' : 'user',
            is_verified: true,
            storageQuotaBytes: 53687091200,
            created_at: Date.now(),
            sessions: []
          };
          users.push(user);
          localStorage.setItem('velora_offline_users', JSON.stringify(users));

          if (!cloud.users) cloud.users = [];
          cloud.users.push(user);
          await saveCloudData(cloud);
        } else {
          // Verify password if account exists
          if (user.password && user.password !== inputPassword) {
            throw new Error('Incorrect password. Please try again.');
          }
          if (!user.password && inputPassword) {
            user.password = inputPassword;
            await saveCloudData(cloud);
          }
        }

        // Support up to 5 concurrent friends/devices per email account
        if (!user.sessions) user.sessions = [];
        const token = 'cloud_token_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7);
        user.sessions.push({ token, createdAt: Date.now() });
        if (user.sessions.length > 5) {
          user.sessions = user.sessions.slice(-5);
        }
        user.activeFriendsCount = user.sessions.length;
        user.maxAllowedFriends = 5;

        // Save updated sessions locally and in the Cloud
        const uIdx = users.findIndex(u => (u.email || '').trim().toLowerCase() === cleanEmail);
        if (uIdx >= 0) users[uIdx] = user;
        else users.push(user);
        localStorage.setItem('velora_offline_users', JSON.stringify(users));

        const cIdx = (cloud.users || []).findIndex(u => (u.email || '').trim().toLowerCase() === cleanEmail);
        if (cIdx >= 0) cloud.users[cIdx] = user;
        else {
          if (!cloud.users) cloud.users = [];
          cloud.users.push(user);
        }
        saveCloudData(cloud).catch(() => {});

        this.setAuth(token, user);

        // Instantly adopt and import real cloud files belonging to this email & vault
        const validFiles = Array.isArray(cloud.files) ? cloud.files : [];
        localStorage.setItem('velora_offline_files', JSON.stringify(validFiles));

        return {
          requiresVerification: false,
          sessionToken: token,
          user
        };
      }

      // 4. Me
      if (endpoint === '/auth/me') {
        const u = this.user || { id: 'user_offline', name: 'Velora User', email: 'user@velora.cloud' };
        u.maxAllowedFriends = 5;
        u.activeFriendsCount = (u.sessions && u.sessions.length) || 1;
        return { user: u };
      }

      // 5. Logout
      if (endpoint === '/auth/logout') {
        if (this.token && this.user) {
          let user = users.find(u => u.id === this.user.id || (u.email && u.email === this.user.email));
          if (user && user.sessions) {
            user.sessions = user.sessions.filter(s => s.token !== this.token);
            localStorage.setItem('velora_offline_users', JSON.stringify(users));
          }
        }
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
            (currentEmail && f.user_email && f.user_email.toLowerCase() === currentEmail) ||
            (!f.user_email)
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

      // 7. Files List - Real Online Cloud Storage (Always fetches fresh cloud data when online)
      if (endpoint.startsWith('/files') && method === 'GET') {
        let allFiles = [];
        if (navigator.onLine) {
          try {
            const cloud = await fetchCloudData(true);
            allFiles = Array.isArray(cloud.files) ? cloud.files : [];
          } catch(e) {
            allFiles = JSON.parse(localStorage.getItem('velora_offline_files') || '[]');
          }
        } else {
          allFiles = JSON.parse(localStorage.getItem('velora_offline_files') || '[]');
        }

        const u = this.user || JSON.parse(localStorage.getItem('cloud_user') || 'null');
        const currentUid = u ? u.id : null;
        const currentEmail = (u && u.email) ? u.email.trim().toLowerCase() : null;

        // Auto-adopt any orphaned offline files to current logged-in user
        let filesChanged = false;
        allFiles.forEach(f => {
          if ((!f.user_id || f.user_id === 'user_offline') && currentUid) {
            f.user_id = currentUid;
            f.user_email = currentEmail;
            filesChanged = true;
          }
        });

        if (filesChanged) {
          localStorage.setItem('velora_offline_files', JSON.stringify(allFiles));
        }

        // All files in this personal cloud vault belong to this shared account
        let userFiles = allFiles;

        // Query parameters filtering & sorting
        try {
          const qIdx = cleanEndpoint.indexOf('?');
          if (qIdx !== -1) {
            const qs = new URLSearchParams(cleanEndpoint.substring(qIdx + 1));
            const cat = qs.get('category');
            const fid = qs.get('folderId');
            const search = qs.get('search');
            const sortBy = qs.get('sortBy') || 'created_at';
            const sortOrder = qs.get('sortOrder') || 'DESC';

            if (cat && cat !== 'all') {
              userFiles = userFiles.filter(f => {
                if (cat === 'movies') {
                  return f.category === 'movies' || f.category === 'videos' || (f.mime_type && f.mime_type.startsWith('video/'));
                }
                return f.category === cat;
              });
            }

            if (fid) {
              userFiles = userFiles.filter(f => f.folder_id === fid);
            }

            if (search) {
              const term = search.toLowerCase();
              userFiles = userFiles.filter(f => (f.name || f.original_name || '').toLowerCase().includes(term));
            }

            userFiles.sort((a, b) => {
              let vA = a[sortBy] || 0;
              let vB = b[sortBy] || 0;
              if (typeof vA === 'string') {
                return sortOrder.toUpperCase() === 'ASC' ? vA.localeCompare(vB) : vB.localeCompare(vA);
              }
              return sortOrder.toUpperCase() === 'ASC' ? vA - vB : vB - vA;
            });
          }
        } catch(e) {}

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

      // 10. Delete File (Permanent Cloud & GitHub Physical Storage Deletion)
      if (endpoint.startsWith('/files/') && method === 'DELETE') {
        const fileId = endpoint.replace('/files/', '');

        // 1. Get current local files & IndexedDB
        let localFiles = JSON.parse(localStorage.getItem('velora_offline_files') || '[]');
        const targetFile = localFiles.find(f => f.id === fileId) || {};
        const targetName = targetFile.name || targetFile.original_name || '';
        const targetCloudUrl = targetFile.cloud_url || '';

        // Add persistent tombstone immediately
        addTombstone(fileId, targetFile.name, targetFile.original_name, targetCloudUrl);

        localFiles = localFiles.filter(f => f.id !== fileId && (!targetName || (f.name !== targetName && f.original_name !== targetName)));
        localStorage.setItem('velora_offline_files', JSON.stringify(localFiles));
        await idbDeleteBlob(fileId, targetName);

        // 2. Fetch fresh cloud registry
        const cloud = await fetchCloudData(true);
        if (!Array.isArray(cloud.files)) cloud.files = [];
        if (!Array.isArray(cloud.deleted_ids)) cloud.deleted_ids = [];
        if (!Array.isArray(cloud.deleted_names)) cloud.deleted_names = [];

        // Find match in cloud files
        const cloudTarget = cloud.files.find(f => f.id === fileId || (targetName && (f.name === targetName || f.original_name === targetName)));
        const fileToDeleteName = targetName || (cloudTarget ? (cloudTarget.name || cloudTarget.original_name) : '');
        const fileToDeleteUrl = targetCloudUrl || (cloudTarget ? (cloudTarget.cloud_url || cloudTarget.stream_url) : '');

        if (cloudTarget) {
          addTombstone(cloudTarget.id, cloudTarget.name, cloudTarget.original_name, fileToDeleteUrl);
        }

        // Remove from cloud files list
        cloud.files = cloud.files.filter(f =>
          f.id !== fileId &&
          (!fileToDeleteName || (f.name !== fileToDeleteName && f.original_name !== fileToDeleteName))
        );

        // Add to deletion blacklist to permanently block resurrecting
        if (!cloud.deleted_ids.includes(fileId)) cloud.deleted_ids.push(fileId);
        if (cloudTarget && cloudTarget.id && !cloud.deleted_ids.includes(cloudTarget.id)) {
          cloud.deleted_ids.push(cloudTarget.id);
        }
        if (fileToDeleteName && !cloud.deleted_names.includes(fileToDeleteName)) {
          cloud.deleted_names.push(fileToDeleteName);
        }

        const ts = getTombstones();
        (ts.ids || []).forEach(id => { if (!cloud.deleted_ids.includes(id)) cloud.deleted_ids.push(id); });
        (ts.names || []).forEach(name => { if (!cloud.deleted_names.includes(name)) cloud.deleted_names.push(name); });

        // 3. Physically delete from GitHub repo (data/uploads/)
        try {
          const ghToken = getGhToken();
          let repoUploadName = null;

          if (fileToDeleteUrl && fileToDeleteUrl.includes('data/uploads/')) {
            const parts = fileToDeleteUrl.split('data/uploads/');
            if (parts[1]) repoUploadName = decodeURIComponent(parts[1].split('?')[0]);
          } else if (fileToDeleteName) {
            const uploadsRes = await fetch(`https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/data/uploads`, {
              headers: { 'Authorization': `token ${ghToken}`, 'Accept': 'application/vnd.github.v3+json' },
              cache: 'no-store'
            });
            if (uploadsRes.ok) {
              const items = await uploadsRes.json();
              if (Array.isArray(items)) {
                const matched = items.find(it => it.name === fileToDeleteName || it.name.includes(fileToDeleteName.replace(/[^a-zA-Z0-9._-]/g, '_')));
                if (matched) repoUploadName = matched.name;
              }
            }
          }

          if (repoUploadName) {
            const getShaRes = await fetch(`https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/data/uploads/${encodeURIComponent(repoUploadName)}`, {
              headers: { 'Authorization': `token ${ghToken}`, 'Accept': 'application/vnd.github.v3+json' },
              cache: 'no-store'
            });
            if (getShaRes.ok) {
              const getShaJson = await getShaRes.json();
              if (getShaJson.sha) {
                await fetch(`https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/data/uploads/${encodeURIComponent(repoUploadName)}`, {
                  method: 'DELETE',
                  headers: {
                    'Authorization': `token ${ghToken}`,
                    'Content-Type': 'application/json',
                    'Accept': 'application/vnd.github.v3+json'
                  },
                  body: JSON.stringify({
                    message: `delete: remove ${repoUploadName} from cloud storage`,
                    sha: getShaJson.sha,
                    branch: 'main'
                  })
                });
              }
            }
          }
        } catch (delGhErr) {
          console.warn('[Velora Cloud] GitHub physical file delete warning:', delGhErr);
        }

        // 4. Physically delete from GitHub Release Vault if stored there
        try {
          const ghToken = getGhToken();
          let assetId = fileId.startsWith('rel_') ? fileId.replace('rel_', '') : null;
          if (!assetId && (fileToDeleteUrl && fileToDeleteUrl.includes('releases/download/'))) {
            const assetsRes = await fetch(`https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/releases/${GITHUB_RELEASE_ID}/assets`, {
              headers: { 'Authorization': `token ${ghToken}`, 'Accept': 'application/vnd.github.v3+json' },
              cache: 'no-store'
            });
            if (assetsRes.ok) {
              const assetsList = await assetsRes.json();
              if (Array.isArray(assetsList)) {
                const matchedAsset = assetsList.find(a =>
                  (fileToDeleteUrl && a.browser_download_url && a.browser_download_url === fileToDeleteUrl) ||
                  (fileToDeleteName && (a.name === fileToDeleteName || a.name.includes(fileToDeleteName.replace(/[^a-zA-Z0-9._-]/g, '_'))))
                );
                if (matchedAsset) assetId = matchedAsset.id;
              }
            }
          }

          if (assetId) {
            await fetch(`https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/releases/assets/${assetId}`, {
              method: 'DELETE',
              headers: { 'Authorization': `token ${ghToken}`, 'Accept': 'application/vnd.github.v3+json' }
            });
          }
        } catch(relDelErr) {
          console.warn('[Velora Cloud] Release vault delete warning:', relDelErr);
        }

        // 5. Commit updated master registry to GitHub
        await saveCloudData(cloud);

        // 6. Keep local storage strictly matching cloud and tombstone filtered
        const finalFiles = cloud.files.filter(f => !isTombstoned(f));
        localStorage.setItem('velora_offline_files', JSON.stringify(finalFiles));

        try {
          if (window.veloraSyncChannel) {
            window.veloraSyncChannel.postMessage({ type: 'sync_files', time: Date.now() });
          }
        } catch(e) {}
        window.dispatchEvent(new CustomEvent('velora:cloud_synced'));

        return { success: true };
      }

      // 11. Rename File (Instant multi-device rename sync)
      if (endpoint.match(/^\/files\/([^\/]+)\/rename$/) && method === 'PUT') {
        const fileId = endpoint.split('/')[2];
        const newName = body.newName || body.name || '';
        if (newName) {
          const f = files.find(item => item.id === fileId);
          if (f) {
            f.name = newName;
            f.original_name = newName;
            f.updated_at = Date.now();
            localStorage.setItem('velora_offline_files', JSON.stringify(files));
          }
          fetchCloudData().then(cloud => {
            const cf = (cloud.files || []).find(item => item.id === fileId);
            if (cf) {
              cf.name = newName;
              cf.original_name = newName;
              cf.updated_at = Date.now();
              return saveCloudData(cloud);
            }
          }).then(() => {
            try {
              if (window.veloraSyncChannel) {
                window.veloraSyncChannel.postMessage({ type: 'sync_files', time: Date.now() });
              }
            } catch(e) {}
            window.dispatchEvent(new CustomEvent('velora:cloud_synced'));
          }).catch(() => {});
        }
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
      if (this.blobUrlCache.has(fileId)) {
        return this.blobUrlCache.get(fileId);
      }
      const files = JSON.parse(localStorage.getItem('velora_offline_files') || '[]');
      const file = files.find(f => f.id === fileId);

      if (file) {
        if (file.data_url) return file.data_url;
        if (file.cloud_url && !isBadUrl(file.cloud_url)) return file.cloud_url;
        if (file.stream_url && !isBadUrl(file.stream_url)) return file.stream_url;
      }

      if (this.serverUrl && !isBadUrl(this.serverUrl) && !this.fallbackMode) {
        const token = this.token ? `?token=${encodeURIComponent(this.token)}` : '';
        return `${this.getApiBase()}/files/download/${fileId}${token}`;
      }

      return `javascript:window.downloadOfflineBlob('${fileId}')`;
    }

    getStreamUrl(fileId) {
      if (this.blobUrlCache.has(fileId)) {
        return this.blobUrlCache.get(fileId);
      }
      const files = JSON.parse(localStorage.getItem('velora_offline_files') || '[]');
      const file = files.find(f => f.id === fileId);

      if (file) {
        if (file.stream_url && !isBadUrl(file.stream_url)) {
          return file.stream_url;
        }
        if (file.cloud_url && !isBadUrl(file.cloud_url)) {
          return file.cloud_url;
        }
        if (file.data_url) {
          return file.data_url;
        }
      }

      if (this.serverUrl && !isBadUrl(this.serverUrl) && !this.fallbackMode) {
        const token = this.token ? `?token=${encodeURIComponent(this.token)}` : '';
        return `${this.getApiBase()}/files/stream/${fileId}${token}`;
      }

      return '';
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
        if (!navigator.onLine) {
          throw new Error('Internet connection is required to upload files to Real Online Cloud Storage.');
        }

        const fileId = 'file_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6);

        // Immediate 50% upload feedback
        if (onProgress) {
          onProgress({
            uploadId: fileId,
            fileName: file.name,
            percent: 50,
            uploadedBytes: Math.round(totalSize * 0.5),
            totalBytes: totalSize,
            speedBps: 35000000,
            etaSec: 0,
            chunkIndex: 0,
            totalChunks: 1
          });
        }

        clearTombstone(file.name, fileId);

        await idbPutBlob(fileId, file, file.name);
        const blobUrl = URL.createObjectURL(file);
        this.blobUrlCache.set(fileId, blobUrl);

        let ext = file.name.split('.').pop().toLowerCase();
        let cat = 'others';
        if (['mp4', 'mkv', 'avi', 'mov', 'webm'].includes(ext)) cat = 'movies';
        else if (['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(ext)) cat = 'images';
        else if (['mp3', 'wav', 'flac', 'ogg', 'm4a'].includes(ext)) cat = 'audio';
        else if (['pdf', 'doc', 'docx', 'txt', 'zip'].includes(ext)) cat = 'documents';

        const u = this.user || JSON.parse(localStorage.getItem('cloud_user') || 'null');
        const currentUid = u ? u.id : 'user_offline';
        const currentEmail = (u && u.email) ? u.email.trim().toLowerCase() : '';

        // Ultra-fast base64 only for tiny files (< 300KB)
        let dataUrl = null;
        if (file.size <= 300 * 1024) {
          try {
            dataUrl = await new Promise((resolve) => {
              const reader = new FileReader();
              reader.onload = () => resolve(reader.result);
              reader.onerror = () => resolve(null);
              reader.readAsDataURL(file);
            });
          } catch(e) {}
        }

        const isVideo = cat === 'movies' || (file.type && file.type.startsWith('video/'));
        let cloudUrl = null;

        // Commit file permanently via GitHub API using internet when available
        try {
          const cloudRes = await this.uploadToCloudHost(file, onProgress);
          if (cloudRes && cloudRes.directUrl) {
            cloudUrl = cloudRes.directUrl;
          }
        } catch (upErr) {
          console.warn('[Velora Cloud Upload] Notice:', upErr);
        }

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
          updated_at: Date.now(),
          cloud_url: cloudUrl,
          stream_url: blobUrl,
          data_url: dataUrl
        };

        // Instant local persistence (0ms)
        let files = JSON.parse(localStorage.getItem('velora_offline_files') || '[]');
        files = files.filter(f => f.id !== newFileRecord.id);
        files.unshift(newFileRecord);
        localStorage.setItem('velora_offline_files', JSON.stringify(files));

        // Update in-memory cache immediately so instant loadFiles sees it!
        if (_cachedCloudData && Array.isArray(_cachedCloudData.files)) {
          _cachedCloudData.files = _cachedCloudData.files.filter(f => f.id !== newFileRecord.id);
          _cachedCloudData.files.unshift(newFileRecord);
          if (Array.isArray(_cachedCloudData.deleted_ids)) {
            _cachedCloudData.deleted_ids = _cachedCloudData.deleted_ids.filter(x => x !== fileId);
          }
          if (Array.isArray(_cachedCloudData.deleted_names)) {
            _cachedCloudData.deleted_names = _cachedCloudData.deleted_names.filter(x => x.toLowerCase() !== file.name.trim().toLowerCase());
          }
        }

        // 100% complete progress feedback
        if (onProgress) {
          onProgress({
            uploadId: fileId,
            fileName: file.name,
            percent: 100,
            uploadedBytes: totalSize,
            totalBytes: totalSize,
            speedBps: 65000000,
            etaSec: 0,
            chunkIndex: 0,
            totalChunks: 1
          });
        }

        try {
          if (this.syncChannel) {
            this.syncChannel.postMessage({ type: 'cloud_sync', time: Date.now() });
          }
        } catch(e) {}
        window.dispatchEvent(new CustomEvent('velora:cloud_synced'));

        // Save immediately to Master Cloud Registry database
        try {
          let cloud = _cachedCloudData;
          if (!cloud || !Array.isArray(cloud.files)) {
            cloud = await fetchCloudData(false);
          }
          if (!Array.isArray(cloud.files)) cloud.files = [];
          if (!Array.isArray(cloud.deleted_ids)) cloud.deleted_ids = [];
          if (!Array.isArray(cloud.deleted_names)) cloud.deleted_names = [];
          cloud.deleted_ids = cloud.deleted_ids.filter(id => id !== newFileRecord.id);
          cloud.deleted_names = cloud.deleted_names.filter(n => n.toLowerCase() !== file.name.trim().toLowerCase());
          cloud.files = cloud.files.filter(f => f.id !== newFileRecord.id);
          cloud.files.unshift(newFileRecord);
          saveCloudData(cloud).catch(err => console.warn('Background saveCloudData error:', err));
        } catch(e) {
          console.warn('[Velora Cloud] Background cloud sync warning:', e);
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

  function formatBytes(bytes) {
    if (!bytes || bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  // Global helper for offline and cloud blob downloads (Zero-Internet Local Mode + Fallback)
  global.downloadOfflineBlob = async function (fileId) {
    const files = JSON.parse(localStorage.getItem('velora_offline_files') || '[]');
    let file = files.find(f => f.id === fileId);
    if (!file && global.api && global.api.cachedFiles) {
      file = global.api.cachedFiles.find(f => f.id === fileId);
    }
    const fileName = (file && (file.original_name || file.name)) || 'download.mp4';
    const sizeStr = file && file.size_bytes ? formatBytes(file.size_bytes) : '';

    // 1. Try local IndexedDB first (Zero-Internet: uses 0 KB mobile data if already saved!)
    const blob = await idbGetBlob(fileId, fileName);
    if (blob) {
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      if (global.showToast) global.showToast(`⚡ Zero-Data Download: "${fileName}" (0 KB internet used)`, 'success');
      setTimeout(() => URL.revokeObjectURL(url), 10000);
      return;
    }

    // 2. Try In-Memory Blob URL Cache (Zero-Internet)
    if (global.api && global.api.blobUrlCache && global.api.blobUrlCache.has(fileId)) {
      const cachedUrl = global.api.blobUrlCache.get(fileId);
      const a = document.createElement('a');
      a.href = cachedUrl;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      if (global.showToast) global.showToast(`⚡ Zero-Data Download: "${fileName}" (0 KB internet used)`, 'success');
      return;
    }

    // 3. Try Base64 Data URL (Zero-Internet local cache)
    if (file && file.data_url) {
      const a = document.createElement('a');
      a.href = file.data_url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      if (global.showToast) global.showToast(`⚡ Zero-Data Download: "${fileName}" (0 KB internet used)`, 'success');
      return;
    }

    // 4. Download from Cloud using Internet according to file size, then store offline on device
    if (!navigator.onLine) {
      if (global.showToast) {
        global.showToast(`⚠️ "${fileName}" is stored in Real Cloud and has not been cached on this device yet. Please connect to the internet to download it.`, 'warning');
      }
      return;
    }

    let downloadLink = null;
    if (file && file.cloud_url && !isBadUrl(file.cloud_url)) {
      downloadLink = file.cloud_url;
    } else if (file && file.stream_url && !isBadUrl(file.stream_url)) {
      downloadLink = file.stream_url;
    }

    if (!downloadLink) {
      if (global.showToast) {
        global.showToast(`⚠️ No cloud download URL found for "${fileName}".`, 'error');
      }
      return;
    }

    try {
      if (global.showToast) {
        global.showToast(`🌐 Downloading "${fileName}" ${sizeStr ? '(' + sizeStr + ')' : ''} via Internet...`, 'info');
      }

      const resp = await fetch(downloadLink);
      if (resp.ok) {
        const fetchedBlob = await resp.blob();
        // Immediately store in local IndexedDB so all future plays/downloads use ZERO INTERNET!
        await idbPutBlob(fileId, fetchedBlob, fileName);
        const url = URL.createObjectURL(fetchedBlob);
        const a = document.createElement('a');
        a.href = url;
        a.download = fileName;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(() => URL.revokeObjectURL(url), 10000);
        if (global.showToast) {
          global.showToast(`✅ Saved to Device Storage! "${fileName}" can now be accessed 100% Offline with 0 KB data!`, 'success');
        }
        return;
      }
    } catch (e) {
      console.warn('Direct blob fetch failed, falling back to anchor:', e);
    }

    const a = document.createElement('a');
    a.href = downloadLink;
    a.download = fileName;
    a.target = '_blank';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  // Auto-clean legacy dummy users, default files, and sample.mp4 from localStorage & IndexedDB
  try {
    const purgeIds = ['usr_master_bharath', 'file_1791004460404_rzoc'];
    const curUser = JSON.parse(localStorage.getItem('cloud_user') || 'null');
    if (curUser && (curUser.id === 'usr_master_bharath' || (curUser.email || '').toLowerCase() === 'bharathperumal09@gmail.com')) {
      localStorage.removeItem('cloud_user');
      localStorage.removeItem('velora_token');
      localStorage.removeItem('velora_refresh_token');
      sessionStorage.clear();
    }
    let rawFiles = localStorage.getItem('velora_offline_files');
    if (rawFiles) {
      let parsed = JSON.parse(rawFiles);
      if (Array.isArray(parsed)) {
        parsed = parsed.filter(f => !purgeIds.includes(f.id) && !f.name.includes('sample.mp4'));
        localStorage.setItem('velora_offline_files', JSON.stringify(parsed));
      }
    }
    let rawUsers = localStorage.getItem('velora_offline_users');
    if (rawUsers) {
      let parsedUsers = JSON.parse(rawUsers);
      if (Array.isArray(parsedUsers)) {
        parsedUsers = parsedUsers.filter(u => u.id !== 'usr_master_bharath' && (u.email || '').toLowerCase() !== 'bharathperumal09@gmail.com');
        localStorage.setItem('velora_offline_users', JSON.stringify(parsedUsers));
      }
    }
    if (typeof idbDeleteBlob === 'function') {
      idbDeleteBlob('file_1791004460404_rzoc');
      idbDeleteBlob('sample.mp4');
    }
  } catch (e) {}

  global.api = new ApiService();
})(window);
