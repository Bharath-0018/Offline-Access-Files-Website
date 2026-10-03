// public/js/app.js - Master SPA Controller for Offline Personal Cloud & Local File Sharing
(function (global) {
  // Global State
  const state = {
    currentView: 'dashboard',
    user: null,
    files: [],
    folders: [],
    currentFolderId: null,
    currentCategory: 'all',
    searchQuery: '',
    sortBy: 'created_at',
    sortOrder: 'DESC',
    storageStats: null,
    devices: [],
    myDeviceInfo: null,
    transfers: [],
    gdriveStatus: null,
    ws: null,
    pendingOtpEmail: null
  };

  // Toast notification helper
  global.showToast = function (message, type = 'info') {
    const container = document.getElementById('toast-container');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    let iconName = 'check-circle';
    if (type === 'error') iconName = 'x-circle';
    if (type === 'info') iconName = 'cloud';

    toast.innerHTML = `
      <div style="color: ${type === 'error' ? 'var(--accent-rose)' : type === 'success' ? 'var(--accent-emerald)' : 'var(--primary)'}">
        ${Icons.render(iconName, 20)}
      </div>
      <div style="flex:1">${escapeHtml(message)}</div>
    `;

    container.appendChild(toast);
    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateX(100%)';
      setTimeout(() => toast.remove(), 300);
    }, 4000);
  };

  function escapeHtml(text) {
    if (!text) return '';
    return String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function formatBytes(bytes) {
    if (!bytes || bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  function formatDate(timestamp) {
    if (!timestamp) return 'Unknown';
    const d = new Date(timestamp);
    return d.toLocaleDateString() + ' ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }

  // WebSocket Setup for Real-Time LAN Events
  function initWebSocket() {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws`;

    try {
      state.ws = new WebSocket(wsUrl);

      state.ws.onopen = () => {
        document.getElementById('network-status-text').textContent = 'Cloud & LAN Connected';
        document.getElementById('network-pill').style.display = 'flex';
        // Authenticate WebSocket connection for user-specific real-time sync
        if (api.token) {
          state.ws.send(JSON.stringify({ type: 'auth', token: api.token }));
        }
      };

      state.ws.onmessage = (event) => {
        try {
          const payload = JSON.parse(event.data);
          handleWebSocketMessage(payload);
        } catch (e) {}
      };

      state.ws.onclose = () => {
        document.getElementById('network-status-text').textContent = 'Offline Reconnecting...';
        setTimeout(initWebSocket, 3000);
      };

      state.ws.onerror = () => {
        state.ws.close();
      };
    } catch (e) {
      console.warn('WebSocket init warning:', e);
    }
  }

  function handleWebSocketMessage(msg) {
    const { event, data, type } = msg;

    // Multi-device real-time sync events from server
    if (event === 'file_uploaded' || event === 'file_deleted' || event === 'file_renamed') {
      const action = event === 'file_uploaded' ? 'New file uploaded' : event === 'file_deleted' ? 'File deleted' : 'File renamed';
      showToast(`Cloud Sync: ${action} on your account.`, 'info');

      if (state.currentView === 'dashboard') {
        loadDashboardRecentFiles();
      } else if (state.currentView === 'files') {
        loadFiles();
      } else if (state.currentView === 'offline') {
        const c = document.getElementById('view-content');
        if (c) renderOfflineMoviesView(c);
      }
      loadStorageStats();
      return;
    }

    if (event === 'transfer_progress') {
      updateTransferProgressUI(data);
    } else if (event === 'transfer_completed') {
      showToast('File transfer completed!', 'success');
      loadTransfers();
      loadFiles();
      loadStorageStats();
    } else if (event === 'file_received') {
      showToast(`🎬 ${data.message}`, 'success');
      loadFiles();
      loadStorageStats();
      loadTransfers();
    } else if (event === 'transfer_failed') {
      showToast(`Transfer failed: ${data.error}`, 'error');
      loadTransfers();
    }
  }

  function updateTransferProgressUI(data) {
    const bar = document.getElementById(`progress-bar-${data.transferId}`);
    const percentText = document.getElementById(`progress-percent-${data.transferId}`);
    const speedText = document.getElementById(`progress-speed-${data.transferId}`);
    const etaText = document.getElementById(`progress-eta-${data.transferId}`);

    if (bar) bar.style.width = `${data.percent}%`;
    if (percentText) percentText.textContent = `${data.percent}%`;
    if (speedText) speedText.textContent = `${formatBytes(data.speedBps)}/s`;
    if (etaText) etaText.textContent = data.etaSeconds > 0 ? `ETA: ${data.etaSeconds}s` : 'Finishing...';
  }

  // --- Router & View Rendering ---
  function navigateTo(viewName) {
    state.currentView = viewName;

    // Update sidebar active link
    document.querySelectorAll('.nav-item').forEach(el => {
      el.classList.toggle('active', el.dataset.view === viewName);
    });

    renderCurrentView();
  }

  async function renderCurrentView() {
    const container = document.getElementById('view-content');
    if (!container) return;

    if (!state.user) {
      renderAuthView(container);
      return;
    }

    if (state.currentView === 'dashboard') {
      renderDashboardView(container);
    } else if (state.currentView === 'files') {
      renderFilesView(container);
    } else if (state.currentView === 'offline') {
      renderOfflineMoviesView(container);
    } else if (state.currentView === 'devices') {
      renderDevicesView(container);
    } else if (state.currentView === 'transfers') {
      renderTransfersView(container);
    } else if (state.currentView === 'gdrive') {
      renderGDriveView(container);
    } else if (state.currentView === 'settings') {
      renderSettingsView(container);
    }
  }

  // --- 1. Dashboard View ---
  async function renderDashboardView(container) {
    container.innerHTML = `
      <div class="section-header">
        <div>
          <h1 class="section-title">Welcome to Velora, ${escapeHtml(state.user.name)}!</h1>
          <p class="section-subtitle">Personal cloud + pendrive-style file system across all your devices.</p>
        </div>
        <div style="display:flex; gap:10px; flex-wrap:wrap;">
          <button class="btn-primary" onclick="window.triggerUpload()">${Icons.render('upload-cloud')} Upload to Cloud</button>
          <button class="btn-secondary" onclick="window.shareAccountWithDevice()">${Icons.render('laptop')} Share with Computer B</button>
          <button class="btn-secondary" onclick="window.navigateTo('devices')">${Icons.render('devices')} Offline Transfer</button>
          <button class="btn-secondary" onclick="window.syncNow()">${Icons.render('refresh-cw')} Sync</button>
        </div>
      </div>

      <!-- Cloud Sync & Multi-Device Status Bar -->
      <div style="background: rgba(15, 23, 42, 0.9); border: 1px solid rgba(16, 185, 129, 0.3); border-radius: var(--radius-md); padding: 14px 20px; margin-bottom: 24px; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 12px;">
        <div style="display: flex; align-items: center; gap: 10px;">
          <span style="display: inline-block; width: 10px; height: 10px; border-radius: 50%; background: var(--accent-emerald); box-shadow: 0 0 10px var(--accent-emerald);"></span>
          <div>
            <div style="font-weight: 600; font-size: 0.9rem; color: var(--text-primary);">Multi-Device Cloud Sync Active</div>
            <div style="font-size: 0.78rem; color: var(--text-muted);">Files uploaded from Computer A appear automatically on Computer B, Mobile, and all connected devices.</div>
          </div>
        </div>
        <div style="display: flex; align-items: center; gap: 16px; font-size: 0.82rem; color: var(--text-secondary);">
          <span>Last Synced: <b id="dash-last-synced" style="color: var(--text-primary);">${state.lastSyncTime ? new Date(state.lastSyncTime).toLocaleTimeString() : 'Just now'}</b></span>
          <button class="btn-secondary" style="padding: 5px 12px; font-size: 0.8rem;" onclick="window.syncNow()">${Icons.render('refresh-cw', 14)} Sync Now</button>
        </div>
      </div>

      <!-- Quick Metrics Grid -->
      <div class="stats-grid">
        <div class="stat-card">
          <div class="stat-icon indigo">${Icons.render('hard-drive', 26)}</div>
          <div style="flex:1;">
            <div class="stat-number" id="dash-used-storage">...</div>
            <div class="stat-label">Storage Used (50 GB Quota)</div>
            <div class="progress-bar-bg" style="margin-top: 8px; height: 6px;">
              <div class="progress-bar-fill" id="dash-storage-fill" style="width: 0%;"></div>
            </div>
          </div>
        </div>
        <div class="stat-card">
          <div class="stat-icon emerald">${Icons.render('file', 26)}</div>
          <div>
            <div class="stat-number" id="dash-file-count">...</div>
            <div class="stat-label">Cloud Files in Account</div>
          </div>
        </div>
        <div class="stat-card">
          <div class="stat-icon amber">${Icons.render('film', 26)}</div>
          <div>
            <div class="stat-number" id="dash-movie-count">...</div>
            <div class="stat-label">Movies & Video Streams</div>
          </div>
        </div>
        <div class="stat-card">
          <div class="stat-icon cyan">${Icons.render('devices', 26)}</div>
          <div>
            <div class="stat-number" id="dash-device-count">...</div>
            <div class="stat-label">Nearby Transfer Devices</div>
          </div>
        </div>
      </div>

      <!-- Active Transfers Alert / Section -->
      <div id="dash-transfers-section" style="margin-bottom: 28px;"></div>

      <!-- Architecture Modes Card -->
      <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 16px; margin-bottom: 28px;">
        <div style="background: linear-gradient(135deg, rgba(30, 41, 59, 0.95), rgba(15, 23, 42, 0.9)); border: 1px solid rgba(99, 102, 241, 0.3); border-radius: var(--radius-lg); padding: 20px;">
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px;">
            <div style="display:flex; align-items:center; gap:8px;">
              <div style="color:var(--primary);">${Icons.render('cloud', 22)}</div>
              <h3 style="font-size:1rem; font-weight:700;">1. Velora Cloud Mode</h3>
            </div>
            <span class="badge" style="background:rgba(99, 102, 241, 0.2); color:var(--primary);">Persistent Storage</span>
          </div>
          <p style="font-size:0.83rem; color:var(--text-secondary); line-height:1.5;">
            Upload files (up to 2 GB+) from any computer. Your files are saved to server storage, linked to your user account, and synchronized across Computer A, Computer B, and Mobile.
          </p>
        </div>

        <div style="background: linear-gradient(135deg, rgba(30, 41, 59, 0.95), rgba(15, 23, 42, 0.9)); border: 1px solid rgba(16, 185, 129, 0.3); border-radius: var(--radius-lg); padding: 20px;">
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px;">
            <div style="display:flex; align-items:center; gap:8px;">
              <div style="color:var(--accent-emerald);">${Icons.render('zap', 22)}</div>
              <h3 style="font-size:1rem; font-weight:700;">2. Offline Local Transfer Mode</h3>
            </div>
            <span class="badge" style="background:rgba(16, 185, 129, 0.2); color:var(--accent-emerald);">Zero Internet</span>
          </div>
          <p style="font-size:0.83rem; color:var(--text-secondary); line-height:1.5;">
            When internet is not available, connect devices to the same local Wi-Fi router or mobile hotspot to discover, pair with 6-digit codes, and stream large files directly between disks.
          </p>
        </div>
      </div>

      <!-- Recent Files Section -->
      <div class="section-header" style="margin-bottom: 16px;">
        <h2 style="font-size: 1.15rem; font-weight: 700;">My Cloud Files</h2>
        <a href="javascript:void(0)" onclick="window.navigateTo('files')" style="color: var(--primary); font-size: 0.85rem; text-decoration: none; font-weight: 600;">View All Files &rarr;</a>
      </div>

      <div id="dash-recent-files" class="file-grid">
        <div style="padding: 24px; text-align: center; color: var(--text-muted); grid-column: 1/-1;">Loading files...</div>
      </div>
    `;

    // Populate data
    loadStorageStats();
    loadDashboardRecentFiles();
    loadDevices();
  }

  async function loadDashboardRecentFiles() {
    try {
      const res = await api.getFiles({ sortBy: 'created_at', sortOrder: 'DESC' });
      state.files = res.files || [];
      const container = document.getElementById('dash-recent-files');
      if (!container) return;

      if (state.files.length === 0) {
        container.innerHTML = `
          <div style="padding: 36px; text-align: center; color: var(--text-muted); grid-column: 1/-1; background: var(--bg-card); border-radius: var(--radius-md); border: 1px dashed var(--border-subtle);">
            ${Icons.render('file', 36, 'text-muted')}
            <p style="margin-top: 10px; font-weight: 500;">No files in your personal library yet.</p>
            <button class="btn-primary" style="margin-top: 14px;" onclick="window.triggerUpload()">${Icons.render('upload-cloud')} Upload Your First File</button>
          </div>
        `;
        return;
      }

      container.innerHTML = state.files.slice(0, 6).map(f => renderFileCardHtml(f)).join('');
    } catch (e) {
      console.error(e);
    }
  }

  // --- 2. Files Library View ---
  async function renderFilesView(container) {
    container.innerHTML = `
      <div class="section-header">
        <div>
          <h1 class="section-title">My Personal Files</h1>
          <p class="section-subtitle">Local storage library isolated to your account.</p>
        </div>
        <div style="display:flex; gap:10px;">
          <button class="btn-secondary" onclick="window.createNewFolderPrompt()">${Icons.render('plus')} New Folder</button>
          <button class="btn-primary" onclick="window.triggerUpload()">${Icons.render('upload-cloud')} Upload File</button>
        </div>
      </div>

      <!-- Categories Filter Bar -->
      <div class="filter-bar">
        <div class="filter-chip ${state.currentCategory === 'all' ? 'active' : ''}" onclick="window.setCategory('all')">${Icons.render('folder')} All Files</div>
        <div class="filter-chip ${state.currentCategory === 'movies' ? 'active' : ''}" onclick="window.setCategory('movies')">${Icons.render('film')} Movies & Videos</div>
        <div class="filter-chip ${state.currentCategory === 'documents' ? 'active' : ''}" onclick="window.setCategory('documents')">${Icons.render('file-text')} Documents</div>
        <div class="filter-chip ${state.currentCategory === 'images' ? 'active' : ''}" onclick="window.setCategory('images')">${Icons.render('image')} Images</div>
        <div class="filter-chip ${state.currentCategory === 'audio' ? 'active' : ''}" onclick="window.setCategory('audio')">${Icons.render('music')} Audio</div>
        <div class="filter-chip ${state.currentCategory === 'others' ? 'active' : ''}" onclick="window.setCategory('others')">${Icons.render('archive')} Other Files</div>
      </div>

      <!-- Sort & Action toolbar -->
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:18px;">
        <div id="folder-breadcrumbs" style="display:flex; align-items:center; gap:6px; font-size:0.85rem; color:var(--text-secondary);">
          <span style="cursor:pointer; color:var(--primary);" onclick="window.openFolder(null)">Home</span>
        </div>
        <div style="display:flex; align-items:center; gap:10px;">
          <select id="file-sort-select" class="form-input" style="padding:6px 12px; font-size:0.82rem; width:auto;" onchange="window.handleSortChange(this.value)">
            <option value="created_at_desc">Date (Newest first)</option>
            <option value="created_at_asc">Date (Oldest first)</option>
            <option value="size_desc">Size (Largest first)</option>
            <option value="size_asc">Size (Smallest first)</option>
            <option value="name_asc">Name (A-Z)</option>
          </select>
        </div>
      </div>

      <div id="files-grid-container" class="file-grid">
        <div style="padding: 24px; text-align: center; color: var(--text-muted); grid-column: 1/-1;">Loading files...</div>
      </div>
    `;

    loadFiles();
  }

  async function loadFiles() {
    try {
      const res = await api.getFiles({
        category: state.currentCategory,
        folderId: state.currentFolderId,
        search: state.searchQuery,
        sortBy: state.sortBy,
        sortOrder: state.sortOrder
      });
      state.files = res.files || [];

      const container = document.getElementById('files-grid-container');
      if (!container) return;

      if (state.files.length === 0) {
        container.innerHTML = `
          <div style="padding: 48px; text-align: center; color: var(--text-muted); grid-column: 1/-1; background: var(--bg-card); border-radius: var(--radius-md); border: 1px dashed var(--border-subtle);">
            ${Icons.render('folder', 48, 'text-muted')}
            <h3 style="margin-top: 14px; font-size: 1.1rem; color: var(--text-primary);">No files in this view</h3>
            <p style="margin-top: 6px; font-size: 0.85rem;">Upload files or transfer from a nearby computer to get started.</p>
            <button class="btn-primary" style="margin-top: 18px;" onclick="window.triggerUpload()">${Icons.render('upload-cloud')} Upload File</button>
          </div>
        `;
        return;
      }

      container.innerHTML = state.files.map(f => renderFileCardHtml(f)).join('');
    } catch (e) {
      console.error(e);
    }
  }

  function renderFileCardHtml(file) {
    const isVideo = file.category === 'movies' || file.category === 'videos' || file.mime_type.startsWith('video/');
    const isAudio = file.category === 'audio' || file.mime_type.startsWith('audio/');
    const isImage = file.category === 'images' || file.mime_type.startsWith('image/');

    let previewIcon = 'file';
    if (isVideo) previewIcon = 'film';
    else if (isAudio) previewIcon = 'music';
    else if (isImage) previewIcon = 'image';
    else if (file.category === 'documents') previewIcon = 'file-text';

    return `
      <div class="file-card" id="file-${file.id}">
        <div class="file-card-preview ${isVideo ? 'is-video' : ''}" onclick="${isVideo ? `window.playVideoFile('${file.id}')` : ''}" style="${isVideo ? 'cursor:pointer;' : ''}">
          ${isVideo ? `
            <div class="file-play-badge">
              ${Icons.render('play', 22)}
            </div>
          ` : Icons.render(previewIcon, 42)}
        </div>
        <div class="file-card-info">
          <div class="file-card-title" title="${escapeHtml(file.original_name)}">${escapeHtml(file.original_name)}</div>
          <div class="file-card-meta">
            <span>${formatBytes(file.size_bytes)}</span>
            <span style="color:var(--accent-emerald); font-weight:600; font-size:0.75rem;">✓ Cloud Synced</span>
          </div>
          <div style="font-size:0.7rem; color:var(--text-muted); margin-top:2px;">
            ${formatDate(file.created_at)}
          </div>
        </div>

        <div class="file-card-actions">
          ${isVideo ? `
            <button class="btn-icon" title="Play Video Offline" onclick="window.playVideoFile('${file.id}')" style="color:var(--primary);">
              ${Icons.render('play', 18)}
            </button>
          ` : ''}
          <button class="btn-icon" title="Download to Device" onclick="window.downloadFile('${file.id}')">
            ${Icons.render('download', 18)}
          </button>
          <button class="btn-icon" title="Send to Nearby Device" onclick="window.promptSendFile('${file.id}')" style="color:var(--accent-cyan);">
            ${Icons.render('send', 18)}
          </button>
          <button class="btn-icon" title="Backup to Google Drive" onclick="window.backupToGoogleDrive('${file.id}')" style="color:var(--accent-amber);">
            ${Icons.render('cloud', 18)}
          </button>
          <button class="btn-icon" title="Rename" onclick="window.renameFilePrompt('${file.id}', '${escapeHtml(file.original_name)}')">
            ${Icons.render('edit-2', 18)}
          </button>
          <button class="btn-icon" title="Delete" onclick="window.deleteFilePrompt('${file.id}')" style="color:var(--accent-rose); margin-left:auto;">
            ${Icons.render('trash-2', 18)}
          </button>
        </div>
      </div>
    `;
  }

  // --- 3. Offline Movies & Video Player View ---
  async function renderOfflineMoviesView(container) {
    container.innerHTML = `
      <div class="section-header">
        <div>
          <h1 class="section-title">Offline Movies & Media Player</h1>
          <p class="section-subtitle">Play large 1.5 GB movies directly from local disk storage without internet or buffering.</p>
        </div>
        <button class="btn-primary" onclick="window.triggerUpload()">${Icons.render('upload-cloud')} Add Movie</button>
      </div>

      <div style="background: rgba(15, 23, 42, 0.7); border: 1px solid var(--border-subtle); border-radius: var(--radius-lg); padding: 20px; margin-bottom: 24px;">
        <div style="display:flex; align-items:center; gap:14px;">
          <div style="width:44px; height:44px; border-radius:var(--radius-md); background:rgba(99, 102, 241, 0.15); color:var(--primary); display:flex; align-items:center; justify-content:center;">
            ${Icons.render('film', 24)}
          </div>
          <div>
            <h3 style="font-weight:700; font-size:1rem;">HTTP 206 Partial-Content Media Streaming</h3>
            <p style="font-size:0.82rem; color:var(--text-muted); margin-top:2px;">
              Fast seek forward & backward without loading entire files into browser memory. Resumes automatically from your last position.
            </p>
          </div>
        </div>
      </div>

      <div id="movies-grid-container" class="file-grid">
        <div style="padding: 24px; text-align: center; color: var(--text-muted); grid-column: 1/-1;">Loading offline movies...</div>
      </div>
    `;

    try {
      const res = await api.getFiles({ category: 'movies' });
      const movies = res.files || [];
      state.files = movies;
      const grid = document.getElementById('movies-grid-container');
      if (!grid) return;

      if (movies.length === 0) {
        grid.innerHTML = `
          <div style="padding: 48px; text-align: center; color: var(--text-muted); grid-column: 1/-1; background: var(--bg-card); border-radius: var(--radius-md); border: 1px dashed var(--border-subtle);">
            ${Icons.render('film', 48, 'text-muted')}
            <h3 style="margin-top: 14px; font-size: 1.1rem; color: var(--text-primary);">No offline movies available yet</h3>
            <p style="margin-top: 6px; font-size: 0.85rem;">Upload a movie or transfer from Computer A over your local Wi-Fi or hotspot.</p>
            <button class="btn-primary" style="margin-top: 18px;" onclick="window.triggerUpload()">${Icons.render('upload-cloud')} Upload Movie File</button>
          </div>
        `;
        return;
      }

      grid.innerHTML = movies.map(f => renderFileCardHtml(f)).join('');
    } catch (e) {
      console.error(e);
    }
  }

  // --- 4. Nearby Devices & P2P Pairing View ---
  async function renderDevicesView(container) {
    container.innerHTML = `
      <div class="section-header">
        <div>
          <h1 class="section-title">Nearby Local Devices</h1>
          <p class="section-subtitle">Automatic local network discovery over Wi-Fi router or mobile hotspot (Zero Internet).</p>
        </div>
        <button class="btn-secondary" onclick="window.refreshDevices()">${Icons.render('refresh-cw')} Refresh Discovery</button>
      </div>

      <!-- My Pairing Card with QR Code and 6-digit Code -->
      <div class="my-pairing-box">
        <div class="qr-wrapper">
          <canvas id="my-device-qr" width="140" height="140"></canvas>
        </div>
        <div style="flex:1;">
          <div style="display:flex; align-items:center; gap:8px;">
            <h2 style="font-size:1.25rem; font-weight:700;" id="my-device-name">My Computer</h2>
            <span class="brand-badge">Hosting Node</span>
          </div>
          <p style="font-size:0.85rem; color:var(--text-secondary); margin-top:4px;">
            Scan QR code or open <span id="my-device-url" style="color:var(--accent-cyan); font-weight:600;">http://...</span> on Laptop B to connect directly.
          </p>
          <div style="margin-top:10px;">
            <div style="font-size:0.75rem; text-transform:uppercase; letter-spacing:0.06em; color:var(--text-muted); font-weight:700;">Secure 6-Digit Pairing Code:</div>
            <div class="pair-code-display" id="my-pair-code">------</div>
          </div>
        </div>
      </div>

      <!-- Discovered Devices List -->
      <div class="section-header" style="margin-bottom: 16px;">
        <h2 style="font-size: 1.15rem; font-weight: 700;">Discovered Devices on Local Network</h2>
      </div>

      <div id="nearby-devices-container" class="devices-grid">
        <div style="padding: 24px; text-align: center; color: var(--text-muted); grid-column: 1/-1;">Scanning local network for nearby instances...</div>
      </div>
    `;

    loadMyDeviceInfo();
    loadDevices();
  }

  async function loadMyDeviceInfo() {
    try {
      const info = await api.getMyDeviceInfo();
      state.myDeviceInfo = info;

      const nameEl = document.getElementById('my-device-name');
      const urlEl = document.getElementById('my-device-url');
      const codeEl = document.getElementById('my-pair-code');

      if (nameEl) nameEl.textContent = info.deviceName;
      if (urlEl) urlEl.textContent = info.url;
      if (codeEl) codeEl.textContent = info.pairCode;

      // Draw QR Code
      const qrCanvas = document.getElementById('my-device-qr');
      if (qrCanvas && global.QRCodeGenerator) {
        QRCodeGenerator.draw(qrCanvas, info.url, 140);
      }
    } catch (e) {
      console.error(e);
    }
  }

  async function loadDevices() {
    try {
      const res = await api.getDevices();
      state.devices = res.devices || [];

      // Update badge in dashboard
      const dashDeviceCount = document.getElementById('dash-device-count');
      if (dashDeviceCount) dashDeviceCount.textContent = state.devices.length;

      const container = document.getElementById('nearby-devices-container');
      if (!container) return;

      if (state.devices.length === 0) {
        container.innerHTML = `
          <div style="padding: 40px; text-align: center; color: var(--text-muted); grid-column: 1/-1; background: var(--bg-card); border-radius: var(--radius-md); border: 1px dashed var(--border-subtle);">
            ${Icons.render('devices', 42, 'text-muted')}
            <h4 style="margin-top: 12px; color: var(--text-primary);">No other devices found on this Wi-Fi yet</h4>
            <p style="font-size: 0.85rem; margin-top: 4px;">Connect Laptop B or mobile phone to the same Wi-Fi or hotspot and open the application URL.</p>
          </div>
        `;
        return;
      }

      container.innerHTML = state.devices.map(d => `
        <div class="device-card ${d.isPaired ? 'paired' : ''}">
          <div class="device-header">
            <div class="device-icon-box">
              ${Icons.render(d.deviceType === 'laptop' ? 'laptop' : 'monitor', 24)}
            </div>
            <div class="device-title-box">
              <div class="device-name">${escapeHtml(d.deviceName)}</div>
              <div class="device-ip">${d.ipAddress}:${d.port}</div>
            </div>
            <span class="badge" style="background:${d.isOnline ? 'rgba(16, 185, 129, 0.2)' : 'rgba(100, 116, 139, 0.2)'}; color:${d.isOnline ? 'var(--accent-emerald)' : 'var(--text-muted)'};">
              ${d.isOnline ? 'Online' : 'Offline'}
            </span>
          </div>

          <div style="display:flex; justify-content:space-between; align-items:center; font-size:0.8rem; color:var(--text-muted); border-top:1px solid var(--border-subtle); padding-top:12px;">
            <span>Pairing Status:</span>
            <span style="font-weight:600; color:${d.isPaired ? 'var(--accent-emerald)' : 'var(--accent-amber)'};">
              ${d.isPaired ? '✓ Paired & Approved' : 'Unpaired'}
            </span>
          </div>

          <div style="display:flex; gap:10px; margin-top:4px;">
            ${d.isPaired ? `
              <button class="btn-primary" style="flex:1;" onclick="window.promptSendFileToDevice('${d.id}')">
                ${Icons.render('send')} Send File
              </button>
              <button class="btn-secondary" onclick="window.unpairDevice('${d.id}')">
                Unpair
              </button>
            ` : `
              <button class="btn-accent" style="flex:1;" onclick="window.pairDevicePrompt('${d.id}', '${escapeHtml(d.deviceName)}')">
                ${Icons.render('shield-check')} Pair Device
              </button>
            `}
          </div>
        </div>
      `).join('');
    } catch (e) {
      console.error(e);
    }
  }

  // --- 5. Transfers View ---
  async function renderTransfersView(container) {
    container.innerHTML = `
      <div class="section-header">
        <div>
          <h1 class="section-title">Transfer Hub & History</h1>
          <p class="section-subtitle">Real-time local streaming monitor with speed calculation, percentage, and ETA.</p>
        </div>
        <button class="btn-secondary" onclick="window.loadTransfers()">${Icons.render('refresh-cw')} Refresh</button>
      </div>

      <div id="transfers-list-container">
        <div style="padding: 24px; text-align: center; color: var(--text-muted);">Loading transfers...</div>
      </div>
    `;

    loadTransfers();
  }

  async function loadTransfers() {
    try {
      const res = await api.getTransfers();
      state.transfers = res.transfers || [];

      const container = document.getElementById('transfers-list-container');
      if (!container) return;

      if (state.transfers.length === 0) {
        container.innerHTML = `
          <div style="padding: 48px; text-align: center; color: var(--text-muted); background: var(--bg-card); border-radius: var(--radius-md); border: 1px dashed var(--border-subtle);">
            ${Icons.render('send', 42, 'text-muted')}
            <h4 style="margin-top: 12px; color: var(--text-primary);">No active or recent transfers</h4>
            <p style="font-size: 0.85rem; margin-top: 4px;">Transfers between Computer A and Laptop B will appear here in real-time.</p>
          </div>
        `;
        return;
      }

      container.innerHTML = state.transfers.map(t => {
        const percent = t.file_size > 0 ? Math.min(100, Math.round((t.bytes_transferred / t.file_size) * 100)) : (t.status === 'completed' ? 100 : 0);
        return `
          <div class="transfer-item">
            <div class="transfer-item-header">
              <div style="display:flex; align-items:center; gap:10px;">
                <div style="color:${t.direction === 'send' ? 'var(--primary)' : 'var(--accent-emerald)'};">
                  ${Icons.render(t.direction === 'send' ? 'arrow-up-right' : 'arrow-down-left', 20)}
                </div>
                <div>
                  <div class="transfer-file-name">${escapeHtml(t.file_name)}</div>
                  <div style="font-size:0.75rem; color:var(--text-muted);">
                    ${t.direction === 'send' ? 'Sending to' : 'Receiving from'} ${escapeHtml(t.peer_device_name)} (${t.peer_ip})
                  </div>
                </div>
              </div>
              <div style="display:flex; align-items:center; gap:12px;">
                <span class="badge" style="background:${t.status === 'completed' ? 'rgba(16, 185, 129, 0.2)' : t.status === 'transferring' ? 'rgba(99, 102, 241, 0.2)' : 'rgba(244, 63, 94, 0.2)'}; color:${t.status === 'completed' ? 'var(--accent-emerald)' : t.status === 'transferring' ? 'var(--primary)' : 'var(--accent-rose)'};">
                  ${t.status.toUpperCase()}
                </span>
                ${t.status === 'transferring' ? `
                  <button class="btn-icon" style="color:var(--accent-rose);" onclick="window.cancelTransfer('${t.id}')">
                    ${Icons.render('x-circle', 18)}
                  </button>
                ` : ''}
              </div>
            </div>

            <div class="progress-bar-bg" style="margin: 6px 0;">
              <div class="progress-bar-fill" id="progress-bar-${t.id}" style="width: ${percent}%;"></div>
            </div>

            <div class="transfer-metrics">
              <span>Transferred: ${formatBytes(t.bytes_transferred)} / ${formatBytes(t.file_size)}</span>
              <span class="transfer-speed-badge" id="progress-speed-${t.id}">${formatBytes(t.speed_bps)}/s</span>
              <span id="progress-percent-${t.id}">${percent}%</span>
              <span id="progress-eta-${t.id}">${t.status === 'completed' ? 'Done' : 'Streaming LAN'}</span>
            </div>
          </div>
        `;
      }).join('');
    } catch (e) {
      console.error(e);
    }
  }

  // --- 6. Google Drive Optional Cloud View ---
  async function renderGDriveView(container) {
    container.innerHTML = `
      <div class="section-header">
        <div>
          <h1 class="section-title">Google Drive Cloud Backup (Optional)</h1>
          <p class="section-subtitle">Strictly decoupled secondary backup service. Local offline cloud never depends on this.</p>
        </div>
      </div>

      <!-- Architectural Distinction Card -->
      <div style="background: rgba(15, 23, 42, 0.8); border: 1px solid var(--border-subtle); border-radius: var(--radius-lg); padding: 24px; margin-bottom: 28px;">
        <h3 style="font-size:1.1rem; font-weight:700; margin-bottom:8px;">Network Independence Guarantee</h3>
        <p style="font-size:0.88rem; color:var(--text-secondary); line-height:1.6;">
          Your local offline cloud functions 100% without internet. Google Drive is provided purely as an optional cloud backup target when an internet connection becomes available. Disconnecting Google Drive or turning off internet will never impact local P2P file transfers, offline video playback, or local file access.
        </p>
      </div>

      <div id="gdrive-status-container" style="background: var(--bg-card); border: 1px solid var(--border-subtle); border-radius: var(--radius-lg); padding: 24px;">
        <div style="padding: 24px; text-align: center; color: var(--text-muted);">Loading Google Drive status...</div>
      </div>
    `;

    loadGDriveStatus();
  }

  async function loadGDriveStatus() {
    try {
      const status = await api.getGDriveStatus();
      state.gdriveStatus = status;

      const container = document.getElementById('gdrive-status-container');
      if (!container) return;

      container.innerHTML = `
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:20px;">
          <div style="display:flex; align-items:center; gap:14px;">
            <div style="width:48px; height:48px; border-radius:var(--radius-md); background:rgba(245, 158, 11, 0.15); color:var(--accent-amber); display:flex; align-items:center; justify-content:center;">
              ${Icons.render('cloud', 26)}
            </div>
            <div>
              <h3 style="font-size:1.1rem; font-weight:700;">Google Drive Integration</h3>
              <div style="font-size:0.8rem; color:var(--text-muted);">Status: ${status.isConnected ? `<span style="color:var(--accent-emerald); font-weight:600;">Connected (${escapeHtml(status.connectedEmail)})</span>` : '<span style="color:var(--text-muted);">Disconnected (Offline Standby)</span>'}</div>
            </div>
          </div>
          <div>
            ${status.isConnected ? `
              <button class="btn-secondary" onclick="window.disconnectGDrive()">${Icons.render('cloud-off')} Disconnect Drive</button>
            ` : `
              <button class="btn-primary" onclick="window.connectGDrivePrompt()">${Icons.render('cloud')} Connect Google Drive</button>
            `}
          </div>
        </div>

        <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(200px, 1fr)); gap:16px; margin-top:20px; border-top:1px solid var(--border-subtle); padding-top:20px;">
          <div>
            <div style="font-size:0.75rem; color:var(--text-muted); text-transform:uppercase;">Cloud Storage Used</div>
            <div style="font-size:1.2rem; font-weight:700; margin-top:4px;">${status.cloudStorageUsed} / ${status.cloudStorageTotal}</div>
          </div>
          <div>
            <div style="font-size:0.75rem; color:var(--text-muted); text-transform:uppercase;">Last Cloud Sync</div>
            <div style="font-size:1.1rem; font-weight:600; margin-top:4px;">${status.lastSyncTime}</div>
          </div>
          <div>
            <div style="font-size:0.75rem; color:var(--text-muted); text-transform:uppercase;">Sync Mode</div>
            <div style="font-size:1.1rem; font-weight:600; margin-top:4px; color:var(--accent-cyan);">On-Demand Selective</div>
          </div>
        </div>
      `;
    } catch (e) {
      console.error(e);
    }
  }

  // --- 7. Settings View ---
  async function renderSettingsView(container) {
    container.innerHTML = `
      <div class="section-header">
        <div>
          <h1 class="section-title">Settings & Storage Management</h1>
          <p class="section-subtitle">Account security, storage quotas, and network configuration.</p>
        </div>
      </div>

      <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(320px, 1fr)); gap:24px;">
        <!-- Account Info -->
        <div style="background:var(--bg-card); border:1px solid var(--border-subtle); border-radius:var(--radius-lg); padding:24px;">
          <h3 style="font-size:1.1rem; font-weight:700; margin-bottom:16px;">User Profile</h3>
          <div class="form-group">
            <label>Full Name</label>
            <input type="text" class="form-input" value="${escapeHtml(state.user.name)}" readonly>
          </div>
          <div class="form-group">
            <label>Email Address</label>
            <input type="text" class="form-input" value="${escapeHtml(state.user.email)}" readonly>
          </div>
          <div class="form-group">
            <label>Account Status</label>
            <div style="color:var(--accent-emerald); font-weight:600; font-size:0.88rem;">✓ Verified & Isolated</div>
          </div>
          <button class="btn-secondary" style="margin-top:8px;" onclick="window.logout()">
            ${Icons.render('log-out')} Sign Out
          </button>
        </div>

        <!-- Velora Cloud Server Connection -->
        <div style="background:var(--bg-card); border:1px solid var(--border-subtle); border-radius:var(--radius-lg); padding:24px;">
          <h3 style="font-size:1.1rem; font-weight:700; margin-bottom:16px;">Velora Cloud Connection</h3>
          <div class="form-group">
            <label>Backend API Server URL</label>
            <input type="text" id="setting-server-url" class="form-input" value="${escapeHtml(api.serverUrl || window.location.origin)}" placeholder="http://localhost:3000">
            <p style="font-size:0.75rem; color:var(--text-muted); margin-top:4px;">
              Accessing from Computer B or Mobile? Set your host machine's IP (e.g. <code>http://192.168.1.50:3000</code>).
            </p>
          </div>
          <div style="display:flex; justify-content:space-between; align-items:center; margin-top:12px;">
            <div style="font-size:0.82rem; color:var(--text-secondary);">
              Status: <span style="color:var(--accent-emerald); font-weight:600;">● Active</span>
            </div>
            <button class="btn-primary" onclick="window.saveServerUrl()">
              Save Server URL
            </button>
          </div>
        </div>

        <!-- Storage Quota Detail -->
        <div style="background:var(--bg-card); border:1px solid var(--border-subtle); border-radius:var(--radius-lg); padding:24px;">
          <h3 style="font-size:1.1rem; font-weight:700; margin-bottom:16px;">Storage Architecture</h3>
          <div style="margin-bottom:16px;">
            <div style="display:flex; justify-content:space-between; font-size:0.85rem; margin-bottom:6px;">
              <span>Personal Cloud Allocation</span>
              <span id="settings-storage-text">Loading...</span>
            </div>
            <div class="progress-bar-bg">
              <div class="progress-bar-fill" id="settings-storage-fill" style="width:0%;"></div>
            </div>
          </div>

          <div style="font-size:0.82rem; color:var(--text-secondary); line-height:1.6;">
            • Files are stored in persistent server storage: <code style="background:rgba(0,0,0,0.3); padding:2px 6px; border-radius:4px;">data/storage/${state.user.id}/</code><br>
            • Multi-device sync: Files uploaded on Computer A appear instantly on Computer B and Mobile.<br>
            • Video streams use HTTP 206 partial content with zero RAM caching.<br>
            • 50 GB default quota per account.
          </div>
        </div>
      </div>
    `;

    loadStorageStats();
  }

  global.saveServerUrl = function () {
    const input = document.getElementById('setting-server-url');
    if (!input) return;
    const url = input.value.trim();
    api.setServerUrl(url);
    showToast('Velora server URL saved: ' + api.getServerUrl(), 'success');
  };

  // --- Auth View (Sign In / Sign Up / Offline OTP Modal) ---
  function renderAuthView(container) {
    container.innerHTML = `
      <div style="display:flex; align-items:center; justify-content:center; min-height:80vh;">
        <div class="modal-card" style="transform:none;">
          <div style="text-align:center; margin-bottom:24px;">
            <div class="brand-icon-wrapper" style="margin: 0 auto 12px; width:52px; height:52px;">
              ${Icons.render('cloud', 28)}
            </div>
            <h2 style="font-size:1.45rem; font-weight:700;">Velora</h2>
            <p style="font-size:0.85rem; color:var(--text-muted); margin-top:4px;">Personal cloud & pendrive file system across all your devices</p>
          </div>

          <!-- Auth Tabs -->
          <div style="display:flex; border-bottom:1px solid var(--border-subtle); margin-bottom:20px;">
            <button id="tab-login" class="nav-item active" style="flex:1; justify-content:center;" onclick="window.switchAuthTab('login')">Sign In</button>
            <button id="tab-signup" class="nav-item" style="flex:1; justify-content:center;" onclick="window.switchAuthTab('signup')">Sign Up</button>
          </div>

          <!-- Login Form -->
          <form id="form-login" onsubmit="window.handleLogin(event)">
            <div class="form-group">
              <label>Email Address</label>
              <input type="email" id="login-email" class="form-input" placeholder="user@example.com" required>
            </div>
            <div class="form-group">
              <label>Password</label>
              <div style="position:relative; display:flex; align-items:center;">
                <input type="password" id="login-password" class="form-input" style="padding-right:42px;" placeholder="••••••••" required>
                <button type="button" class="btn-toggle-pw" onclick="window.togglePasswordVisibility('login-password', this)" style="position:absolute; right:8px; background:transparent; border:none; color:var(--text-muted); cursor:pointer; padding:6px; display:flex; align-items:center; justify-content:center;" title="Show/Hide password">
                  ${Icons.render('eye', 18)}
                </button>
              </div>
            </div>
            <button type="submit" class="btn-primary" style="width:100%; justify-content:center; padding:11px; margin-top:8px;">
              Sign In to Velora Cloud
            </button>
            <div style="text-align:center; margin-top:14px;">
              <a href="javascript:void(0)" onclick="window.promptForgotPassword()" style="font-size:0.8rem; color:var(--text-muted); text-decoration:none;">Forgot Password?</a>
            </div>
          </form>

          <!-- Sign Up Form -->
          <form id="form-signup" style="display:none;" onsubmit="window.handleSignup(event)">
            <div class="form-group">
              <label>Full Name</label>
              <input type="text" id="signup-name" class="form-input" placeholder="Your Name" required>
            </div>
            <div class="form-group">
              <label>Email Address</label>
              <input type="email" id="signup-email" class="form-input" placeholder="user@example.com" required>
            </div>
            <div class="form-group">
              <label>Password (Min 6 chars)</label>
              <div style="position:relative; display:flex; align-items:center;">
                <input type="password" id="signup-password" class="form-input" style="padding-right:42px;" placeholder="••••••••" minlength="6" required>
                <button type="button" class="btn-toggle-pw" onclick="window.togglePasswordVisibility('signup-password', this)" style="position:absolute; right:8px; background:transparent; border:none; color:var(--text-muted); cursor:pointer; padding:6px; display:flex; align-items:center; justify-content:center;" title="Show/Hide password">
                  ${Icons.render('eye', 18)}
                </button>
              </div>
            </div>
            <button type="submit" class="btn-primary" style="width:100%; justify-content:center; padding:11px; margin-top:8px;">
              Create Velora Cloud Account
            </button>
          </form>

          <!-- Long-Distance Multi-Device Peer Cloud Card -->
          <div style="margin-top:20px; padding:14px; background:linear-gradient(135deg, rgba(30, 41, 59, 0.7), rgba(15, 23, 42, 0.8)); border:1px solid rgba(99, 102, 241, 0.3); border-radius:var(--radius-md); font-size:0.78rem;">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
              <span style="color:var(--text-primary); font-weight:600; display:flex; align-items:center; gap:6px;">
                ${Icons.render('globe', 16, 'text-primary')} Long-Distance Multi-Device Access
              </span>
              <span class="badge" style="background:rgba(16, 185, 129, 0.2); color:var(--accent-emerald); font-size:0.7rem;">
                ● Cloud Peer Sync Ready
              </span>
            </div>
            <p style="font-size:0.76rem; color:var(--text-secondary); margin-bottom:0; line-height:1.5;">
              🌐 <strong>Any Distance:</strong> Access from Coimbatore, Dindigul, or anywhere in the world.<br>
              👥 <strong>Up to 5 Friends:</strong> Log in with the same Email & Password simultaneously.<br>
              ⚡ <strong>Zero Setup:</strong> Direct login & file streaming without batch files or server setup!
            </p>
          </div>
        </div>
      </div>
    `;
  }

  global.togglePasswordVisibility = function (inputId, btn) {
    const input = document.getElementById(inputId);
    if (!input) return;
    const isPassword = input.type === 'password';
    input.type = isPassword ? 'text' : 'password';
    if (btn) {
      btn.innerHTML = Icons.render(isPassword ? 'eye-off' : 'eye', 18);
      btn.title = isPassword ? 'Hide password' : 'Show password';
      btn.style.color = isPassword ? 'var(--primary)' : 'var(--text-muted)';
    }
  };

  global.saveAuthServerUrl = async function () {
    const input = document.getElementById('auth-server-input');
    if (!input) return;
    const url = input.value.trim();
    if (!url) {
      api.setServerUrl('');
      showToast('Cleared backend server URL. Running in offline standalone mode.', 'info');
      return;
    }
    showToast('Testing connection to ' + url + '...', 'info');
    try {
      const res = await fetch(`${url.replace(/\/+$/, '')}/api/health`, { method: 'GET' });
      if (res.ok) {
        api.setServerUrl(url);
        api.isConnected = true;
        api.fallbackMode = false;
        showToast('✓ Successfully connected to Computer A Velora Cloud!', 'success');
        const pill = document.getElementById('server-status-pill');
        if (pill) {
          pill.style.background = 'rgba(16, 185, 129, 0.2)';
          pill.style.color = 'var(--accent-emerald)';
          pill.textContent = '● Connected';
        }
      } else {
        throw new Error('HTTP ' + res.status);
      }
    } catch (e) {
      api.setServerUrl(url);
      showToast('Saved URL, but could not connect. Ensure start-velora.bat is running on Computer A.', 'warning');
    }
  };

  global.shareAccountWithDevice = function () {
    if (!state.user) return;
    const syncData = {
      user: {
        id: state.user.id,
        email: state.user.email,
        name: state.user.name,
        storageQuotaBytes: state.user.storageQuotaBytes
      },
      files: (state.files || []).map(f => ({
        id: f.id,
        name: f.name,
        original_name: f.original_name,
        size_bytes: f.size_bytes,
        category: f.category,
        mime_type: f.mime_type,
        created_at: f.created_at,
        user_id: state.user.id,
        user_email: state.user.email
      })),
      serverUrl: api.getServerUrl() || window.location.origin
    };

    const encoded = btoa(unescape(encodeURIComponent(JSON.stringify(syncData))));
    const shareUrl = `${window.location.origin}${window.location.pathname}?sync=${encoded}`;

    const modal = document.createElement('div');
    modal.className = 'modal-backdrop open';
    modal.id = 'sync-share-modal';
    modal.innerHTML = `
      <div class="modal-card" style="max-width:540px;">
        <div class="modal-header">
          <div style="display:flex; align-items:center; gap:8px;">
            ${Icons.render('laptop', 22, 'text-primary')}
            <h3 style="font-size:1.15rem; font-weight:700;">Share Access with Computer B / Friend</h3>
          </div>
          <button class="btn-icon" onclick="document.getElementById('sync-share-modal').remove()">${Icons.render('x-circle', 18)}</button>
        </div>
        <p style="font-size:0.84rem; color:var(--text-secondary); margin:12px 0 16px; line-height:1.5;">
          Send this 1-click link to your friend on Computer B or Mobile. When opened, their browser will automatically recognize your account and files!
        </p>

        <div class="form-group">
          <label>1-Click Share Link for Computer B / Mobile:</label>
          <div style="display:flex; gap:6px;">
            <input type="text" id="share-sync-link-input" class="form-input" style="font-size:0.75rem;" value="${escapeHtml(shareUrl)}" readonly>
            <button class="btn-primary" style="white-space:nowrap;" onclick="navigator.clipboard.writeText('${shareUrl}').then(() => showToast('Link copied to clipboard!', 'success'))">Copy Link</button>
          </div>
        </div>

        <div class="form-group" style="margin-top:14px;">
          <label>Host Computer LAN URL (Same Wi-Fi):</label>
          <div style="display:flex; gap:6px;">
            <input type="text" class="form-input" style="font-size:0.8rem;" value="${escapeHtml(api.getServerUrl() || window.location.origin)}" readonly>
            <button class="btn-secondary" style="white-space:nowrap;" onclick="navigator.clipboard.writeText('${api.getServerUrl() || window.location.origin}').then(() => showToast('Server URL copied!', 'success'))">Copy URL</button>
          </div>
          <p style="font-size:0.72rem; color:var(--text-muted); margin-top:4px;">
            If both computers are on the same Wi-Fi, your friend can open this URL directly in Chrome/Edge.
          </p>
        </div>

        <div style="text-align:right; margin-top:18px;">
          <button class="btn-secondary" onclick="document.getElementById('sync-share-modal').remove()">Close</button>
        </div>
      </div>
    `;
    document.body.appendChild(modal);
  };

  global.importAccountSyncPayload = function (rawPayload) {
    try {
      let jsonStr = '';
      if (rawPayload.includes('sync=')) {
        const u = new URL(rawPayload, window.location.href);
        const code = u.searchParams.get('sync');
        jsonStr = decodeURIComponent(escape(atob(code)));
      } else {
        jsonStr = decodeURIComponent(escape(atob(rawPayload.trim())));
      }

      const data = JSON.parse(jsonStr);
      if (!data || !data.user || !data.user.email) {
        throw new Error('Invalid sync data package.');
      }

      // 1. Save user in offline users list
      let users = JSON.parse(localStorage.getItem('velora_offline_users') || '[]');
      const cleanEmail = (data.user.email || '').trim().toLowerCase();
      let existingUser = users.find(u => (u.email || '').trim().toLowerCase() === cleanEmail);
      if (!existingUser) {
        users.push(data.user);
      } else {
        Object.assign(existingUser, data.user);
      }
      localStorage.setItem('velora_offline_users', JSON.stringify(users));

      // 2. Import files
      if (Array.isArray(data.files) && data.files.length > 0) {
        let files = JSON.parse(localStorage.getItem('velora_offline_files') || '[]');
        data.files.forEach(df => {
          if (!files.some(f => f.id === df.id)) {
            files.unshift(df);
          }
        });
        localStorage.setItem('velora_offline_files', JSON.stringify(files));
      }

      // 3. Set host server URL if provided
      if (data.serverUrl && !data.serverUrl.includes('localhost')) {
        api.setServerUrl(data.serverUrl);
      }

      // Pre-fill login input if on auth screen
      const emailInput = document.getElementById('login-email');
      if (emailInput) {
        emailInput.value = data.user.email;
      }

      showToast(`✓ Account "${data.user.name}" & ${data.files ? data.files.length : 0} files imported! You can now sign in.`, 'success');
      return true;
    } catch (e) {
      showToast('Import failed: ' + e.message, 'error');
      return false;
    }
  };

  global.promptImportAccountSync = function () {
    const input = prompt('Paste the Share Link or Sync Key sent from Computer A:');
    if (!input || !input.trim()) return;
    window.importAccountSyncPayload(input.trim());
  };

  // --- Storage Stats Updater ---
  async function loadStorageStats() {
    if (!state.user) return;
    try {
      const stats = await api.getStorageStats();
      state.storageStats = stats;

      // Update sidebar
      const sidebarBar = document.getElementById('sidebar-storage-bar');
      const sidebarUsed = document.getElementById('sidebar-storage-used');
      const sidebarTotal = document.getElementById('sidebar-storage-total');

      if (sidebarBar) sidebarBar.style.width = `${stats.percentUsed}%`;
      if (sidebarUsed) sidebarUsed.textContent = formatBytes(stats.usedBytes);
      if (sidebarTotal) sidebarTotal.textContent = formatBytes(stats.quotaBytes);

      // Update dashboard cards
      const dashUsed = document.getElementById('dash-used-storage');
      const dashCount = document.getElementById('dash-file-count');
      const dashMovie = document.getElementById('dash-movie-count');

      if (dashUsed) dashUsed.textContent = `${formatBytes(stats.usedBytes)} / ${formatBytes(stats.quotaBytes)}`;
      if (dashCount) dashCount.textContent = stats.fileCount;

      const movieCat = stats.categories.find(c => c.category === 'movies');
      if (dashMovie) dashMovie.textContent = movieCat ? movieCat.count : '0';

      const dashFill = document.getElementById('dash-storage-fill');
      if (dashFill) dashFill.style.width = `${stats.percentUsed}%`;

      const dashSynced = document.getElementById('dash-last-synced');
      if (dashSynced) dashSynced.textContent = new Date().toLocaleTimeString();

      // Update settings
      const setBar = document.getElementById('settings-storage-fill');
      const setText = document.getElementById('settings-storage-text');
      if (setBar) setBar.style.width = `${stats.percentUsed}%`;
      if (setText) setText.textContent = `${formatBytes(stats.usedBytes)} / ${formatBytes(stats.quotaBytes)} (${stats.percentUsed}%)`;
    } catch (e) {
      console.error(e);
    }
  }

  // --- Auth Handlers ---
  global.switchAuthTab = function (tab) {
    const isLogin = tab === 'login';
    document.getElementById('tab-login').classList.toggle('active', isLogin);
    document.getElementById('tab-signup').classList.toggle('active', !isLogin);
    document.getElementById('form-login').style.display = isLogin ? 'block' : 'none';
    document.getElementById('form-signup').style.display = isLogin ? 'none' : 'block';
  };

  global.handleLogin = async function (e) {
    e.preventDefault();
    const emailEl = document.getElementById('login-email');
    const passEl = document.getElementById('login-password');
    const email = (emailEl ? emailEl.value : '').trim().toLowerCase();
    const password = passEl ? passEl.value : '';

    if (!email || !password) {
      showToast('Please enter both email and password.', 'error');
      return;
    }

    try {
      const res = await api.login(email, password);
      if (res.requiresVerification) {
        state.pendingOtpEmail = res.email;
        openOtpModal(res.email, res.otpCode);
        return;
      }
      state.user = res.user;
      showToast(`Welcome, ${res.user.name}!`, 'success');
      updateUserHeader();
      navigateTo('dashboard');
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  global.handleSignup = async function (e) {
    e.preventDefault();
    const nameEl = document.getElementById('signup-name');
    const emailEl = document.getElementById('signup-email');
    const passEl = document.getElementById('signup-password');
    const name = (nameEl ? nameEl.value : '').trim();
    const email = (emailEl ? emailEl.value : '').trim().toLowerCase();
    const password = passEl ? passEl.value : '';

    if (!name || !email || !password) {
      showToast('Please enter your name, email, and password.', 'error');
      return;
    }

    try {
      const res = await api.register(email, password, name);
      state.pendingOtpEmail = res.email;
      openOtpModal(res.email, res.otpCode);
      showToast('Account created! Please verify with your OTP code.', 'info');
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  function openOtpModal(email, code) {
    const modal = document.getElementById('otp-modal');
    document.getElementById('otp-target-email').textContent = email;
    document.getElementById('otp-offline-code').textContent = code || 'Check Server';
    document.getElementById('otp-input').value = code || '';
    modal.classList.add('open');
  }

  global.verifyOtpSubmit = async function () {
    const code = document.getElementById('otp-input').value;
    try {
      const res = await api.verifyOtp(state.pendingOtpEmail, code);
      state.user = res.user;
      document.getElementById('otp-modal').classList.remove('open');
      showToast('Account verified successfully!', 'success');
      updateUserHeader();
      navigateTo('dashboard');
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  global.logout = async function () {
    await api.logout();
    state.user = null;
    state.files = [];
    updateUserHeader();
    renderCurrentView();
    showToast('Signed out successfully. Your uploaded files remain permanently stored.', 'info');
  };

  function updateUserHeader() {
    const userBar = document.getElementById('user-profile-bar');
    if (!state.user) {
      if (userBar) userBar.style.display = 'none';
      return;
    }
    if (userBar) userBar.style.display = 'flex';
    const nameEl = document.getElementById('user-display-name');
    const emailEl = document.getElementById('user-display-email');
    const avatarEl = document.getElementById('user-display-avatar');

    if (nameEl) nameEl.textContent = state.user.name;
    if (emailEl) emailEl.textContent = state.user.email;
    if (avatarEl) avatarEl.textContent = state.user.name.charAt(0).toUpperCase();

    const badge = document.getElementById('friends-badge-count');
    const activeFriends = state.user.activeFriendsCount || 1;
    const maxFriends = state.user.maxAllowedFriends || 5;
    if (badge) badge.textContent = `${activeFriends}/${maxFriends}`;
  }

  // --- 5 Friends Long-Distance Access Controller ---
  global.openFriendsModal = async function () {
    const modal = document.getElementById('modal-friends-access');
    if (!modal) return;

    try {
      const meRes = await api.request('/auth/me');
      if (meRes && meRes.user) {
        state.user = { ...state.user, ...meRes.user };
        updateUserHeader();
      }
    } catch (e) {}

    const activeCount = (state.user && state.user.activeFriendsCount) || 1;
    const maxCount = (state.user && state.user.maxAllowedFriends) || 5;

    const pill = document.getElementById('modal-friends-active-pill');
    if (pill) {
      pill.textContent = `${activeCount} / ${maxCount} Active Logins`;
    }

    const inputUrl = document.getElementById('modal-friends-server-url');
    if (inputUrl) {
      inputUrl.value = window.location.href.split('?')[0].split('#')[0];
    }

    modal.classList.add('open');
  };

  global.closeFriendsModal = function () {
    const modal = document.getElementById('modal-friends-access');
    if (modal) modal.classList.remove('open');
  };

  global.copyFriendsUrl = function () {
    const input = document.getElementById('modal-friends-server-url');
    const url = input ? input.value.trim() : window.location.origin;
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(url);
    } else if (input) {
      input.select();
      document.execCommand('copy');
    }
    showToast('Link copied! Send to your 5 friends in Coimbatore or anywhere in the world.', 'success');
  };

  global.saveFriendsServerUrl = async function () {
    const input = document.getElementById('modal-friends-server-url');
    const url = input ? input.value.trim() : '';
    if (!url) {
      showToast('Please enter a valid URL.', 'error');
      return;
    }
    api.setServerUrl(url);
    const reachable = await api.pingServer();
    if (reachable) {
      showToast('Connected to cloud server!', 'success');
      loadFiles();
      loadStorageStats();
    } else {
      showToast('Could not reach server at this URL. Please verify server is running.', 'error');
    }
  };

  // --- File Actions & Chunked Upload ---
  let activeUploadId = null;

  global.cancelCurrentUpload = function () {
    if (activeUploadId) {
      api.cancelUpload(activeUploadId);
      activeUploadId = null;
    }
    closeUploadProgressModal();
    showToast('Upload cancelled.', 'info');
  };

  global.triggerUpload = function () {
    if (!navigator.onLine) {
      showToast('🌐 Internet connection is required to upload files to Real Online Cloud Storage.', 'error');
      return;
    }
    const input = document.createElement('input');
    input.type = 'file';
    input.onchange = async (e) => {
      const file = e.target.files[0];
      if (!file) return;

      openUploadProgressModal(file.name, file.size);

      try {
        await api.uploadFileChunked(file, state.currentFolderId, (prog) => {
          activeUploadId = prog.uploadId;
          const bar = document.getElementById('upload-modal-bar');
          const percent = document.getElementById('upload-modal-percent');
          const speed = document.getElementById('upload-modal-speed');
          const eta = document.getElementById('upload-modal-eta');

          if (bar) bar.style.width = `${prog.percent}%`;
          if (percent) percent.textContent = `${prog.percent}% (${formatBytes(prog.uploadedBytes)} / ${formatBytes(prog.totalBytes)}) - Chunk ${prog.chunkIndex + 1}/${prog.totalChunks}`;
          if (speed) speed.textContent = `${formatBytes(prog.speedBps)}/s`;
          if (eta) eta.textContent = prog.percent >= 100 ? 'Upload Complete!' : 'Uploading at Super-Speed...';
        });

        activeUploadId = null;
        setTimeout(() => {
          closeUploadProgressModal();
          showToast(`Uploaded "${file.name}" to Velora Cloud in seconds!`, 'success');
        }, 150);
        if (state.currentView === 'dashboard') {
          await loadDashboardRecentFiles();
        } else if (state.currentView === 'offline') {
          const c = document.getElementById('view-content');
          if (c) renderOfflineMoviesView(c);
        } else {
          await loadFiles();
        }
        loadStorageStats();
      } catch (err) {
        activeUploadId = null;
        closeUploadProgressModal();
        showToast('Upload failed: ' + err.message, 'error');
      }
    };
    input.click();
  };

  function openUploadProgressModal(fileName, totalSize) {
    const modal = document.getElementById('upload-modal');
    document.getElementById('upload-modal-name').textContent = fileName;
    document.getElementById('upload-modal-size').textContent = formatBytes(totalSize);
    document.getElementById('upload-modal-bar').style.width = '0%';
    document.getElementById('upload-modal-percent').textContent = '0%';
    modal.classList.add('open');
  }

  function closeUploadProgressModal() {
    const modal = document.getElementById('upload-modal');
    modal.classList.remove('open');
  }

  global.playVideoFile = async function (fileId) {
    let file = state.files.find(f => f.id === fileId);
    if (!file) {
      try {
        const res = await api.getFiles();
        file = (res.files || []).find(f => f.id === fileId);
      } catch (e) {}
    }
    if (!file) {
      showToast('Video file not found.', 'error');
      return;
    }
    await videoPlayer.playFile(file);
  };

  global.downloadFile = async function (fileId) {
    let file = state.files.find(f => f.id === fileId);
    if (!file) {
      try {
        const res = await api.getFiles();
        file = (res.files || []).find(f => f.id === fileId);
      } catch (e) {}
    }

    const fileName = (file && (file.original_name || file.name)) || 'download';

    // Prioritize Zero-Internet Device Storage Download Engine
    if (typeof window.downloadOfflineBlob === 'function') {
      window.downloadOfflineBlob(fileId);
      return;
    }

    const downloadUrl = api.getDownloadUrl(fileId);
    if (downloadUrl.startsWith('javascript:')) {
      return;
    }

    const a = document.createElement('a');
    a.href = downloadUrl;
    a.download = fileName;
    a.target = '_blank';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    showToast(`Downloading "${fileName}"...`, 'info');
  };

  global.renameFilePrompt = async function (fileId, currentName) {
    const newName = prompt('Enter new file name:', currentName);
    if (!newName || newName.trim() === currentName) return;

    try {
      await api.renameFile(fileId, newName.trim());
      showToast('File renamed successfully.', 'success');
      if (state.currentView === 'dashboard') {
        loadDashboardRecentFiles();
      } else if (state.currentView === 'offline') {
        const c = document.getElementById('view-content');
        if (c) renderOfflineMoviesView(c);
      } else {
        loadFiles();
      }
      if (window.veloraSyncChannel) {
        window.veloraSyncChannel.postMessage({ type: 'sync_files', time: Date.now() });
      }
    } catch (e) {
      showToast(e.message, 'error');
    }
  };

  global.deleteFilePrompt = async function (fileId) {
    if (!confirm('Are you sure you want to delete this file?')) return;
    try {
      // Instantly remove card from DOM (Optimistic 0ms update!)
      const card = document.getElementById(`file-${fileId}`);
      if (card) {
        card.style.opacity = '0.3';
        card.style.pointerEvents = 'none';
      }

      state.files = state.files.filter(f => f.id !== fileId);

      await api.deleteFile(fileId);
      if (card) card.remove();
      showToast('File deleted successfully.', 'success');

      if (state.currentView === 'dashboard') {
        await loadDashboardRecentFiles();
      } else if (state.currentView === 'offline') {
        const c = document.getElementById('view-content');
        if (c) renderOfflineMoviesView(c);
      } else {
        await loadFiles();
      }
      loadStorageStats();

      // Broadcast to all open tabs and windows
      if (window.veloraSyncChannel) {
        window.veloraSyncChannel.postMessage({ type: 'sync_files', time: Date.now() });
      }
    } catch (e) {
      showToast(e.message, 'error');
      if (state.currentView === 'files') loadFiles();
    }
  };

  global.backupToGoogleDrive = async function (fileId) {
    try {
      showToast('Backing up file to Google Drive...', 'info');
      const res = await api.backupFileToGDrive(fileId);
      showToast(res.message, 'success');
    } catch (e) {
      showToast('Google Drive: ' + e.message, 'error');
    }
  };

  // --- Device Transfer Prompt ---
  global.promptSendFile = function (fileId) {
    const file = state.files.find(f => f.id === fileId);
    if (!file) return;

    if (state.devices.length === 0) {
      alert('No nearby devices detected on the network yet. Open the app on Computer B first!');
      return;
    }

    const deviceOptions = state.devices.map((d, i) => `${i + 1}. ${d.deviceName} (${d.ipAddress})`).join('\n');
    const choice = prompt(`Select device to send "${file.original_name}" to:\n${deviceOptions}\nEnter number:`);
    const index = parseInt(choice, 10) - 1;
    if (isNaN(index) || !state.devices[index]) return;

    const targetDevice = state.devices[index];
    executeFileTransfer(file.id, targetDevice);
  };

  async function executeFileTransfer(fileId, targetDevice) {
    try {
      showToast(`Initiating direct LAN stream to ${targetDevice.deviceName}...`, 'info');
      await api.startTransfer(fileId, targetDevice.id, targetDevice.ipAddress, targetDevice.port);
      showToast('Transfer started!', 'success');
      navigateTo('transfers');
    } catch (e) {
      showToast('Transfer error: ' + e.message, 'error');
    }
  }

  global.pairDevicePrompt = async function (deviceId, deviceName) {
    const code = prompt(`Enter 6-digit pairing code shown on "${deviceName}":`);
    if (!code) return;

    try {
      await api.pairDevice(deviceId, code);
      showToast(`Successfully paired with ${deviceName}!`, 'success');
      loadDevices();
    } catch (e) {
      showToast('Pairing failed: ' + e.message, 'error');
    }
  };

  global.unpairDevice = async function (deviceId) {
    await api.unpairDevice(deviceId);
    showToast('Device unpaired.', 'info');
    loadDevices();
  };

  global.refreshDevices = function () {
    showToast('Scanning local network interfaces...', 'info');
    loadDevices();
  };

  global.setCategory = function (cat) {
    state.currentCategory = cat;
    navigateTo('files');
  };

  global.handleSortChange = function (val) {
    const [by, order] = val.split('_');
    state.sortBy = by === 'size' ? 'size_bytes' : by;
    state.sortOrder = order.toUpperCase();
    loadFiles();
  };

  global.checkOnlineStatus = function (showToastMsg = false) {
    const overlay = document.getElementById('offline-network-overlay');
    const pill = document.getElementById('network-pill');
    const pillText = document.getElementById('network-status-text');

    if (!navigator.onLine) {
      if (overlay) overlay.style.display = 'flex';
      if (pill) {
        pill.classList.add('offline');
        pill.classList.remove('online');
      }
      if (pillText) pillText.textContent = 'Offline (No Internet)';
      if (showToastMsg) showToast('⚠️ No internet connection detected. Please connect to Wi-Fi or Mobile Data.', 'warning');
    } else {
      if (overlay) overlay.style.display = 'none';
      if (pill) {
        pill.classList.remove('offline');
        pill.classList.add('online');
      }
      if (pillText) pillText.textContent = 'Real Cloud Online';
      if (showToastMsg) showToast('🌐 Connected to Real Online Cloud Storage!', 'success');
    }
  };

  global.viewOfflineCachedFiles = function () {
    const overlay = document.getElementById('offline-network-overlay');
    if (overlay) overlay.style.display = 'none';
    navigateTo('offline');
    showToast('Viewing local cached files. Connect to internet for online cloud files.', 'info');
  };

  global.navigateTo = navigateTo;

  // BroadcastChannel for 0ms cross-tab and cross-window sync
  try {
    const syncChannel = new BroadcastChannel('velora_sync');
    syncChannel.onmessage = (event) => {
      if (event.data && event.data.type === 'sync_files') {
        if (state.user) {
          if (state.currentView === 'dashboard') loadDashboardRecentFiles();
          else if (state.currentView === 'files') loadFiles();
          else if (state.currentView === 'offline') {
            const c = document.getElementById('view-content');
            if (c) renderOfflineMoviesView(c);
          }
          loadStorageStats();
        }
      }
    };
    window.veloraSyncChannel = syncChannel;
  } catch(e) {}

  // Automated Real-Time Background Synchronization (Checks every 2 seconds for instant updates across devices!)
  let realtimeSyncTimer = null;
  let lastFilesHash = '';

  function computeFilesHash(files) {
    if (!Array.isArray(files)) return '';
    return files.map(f => `${f.id}_${f.updated_at || f.created_at || 0}_${f.name}_${f.cloud_url || ''}`).join('|');
  }

  function startRealtimeSync() {
    if (realtimeSyncTimer) clearInterval(realtimeSyncTimer);
    realtimeSyncTimer = setInterval(async () => {
      if (!api.token && !localStorage.getItem('cloud_token')) return;
      try {
        const res = await api.getFiles({
          category: state.currentCategory,
          folderId: state.currentFolderId
        });
        const currentFiles = res.files || [];
        const newHash = computeFilesHash(currentFiles);

        if (lastFilesHash && newHash !== lastFilesHash) {
          console.log('[Velora Real-Time Sync] Cloud updates detected! Updating UI instantly...');
          state.files = currentFiles;
          lastFilesHash = newHash;

          if (state.currentView === 'files') {
            const container = document.getElementById('files-grid-container');
            if (container) {
              if (currentFiles.length === 0) {
                container.innerHTML = `
                  <div style="padding: 48px; text-align: center; color: var(--text-muted); grid-column: 1/-1; background: var(--bg-card); border-radius: var(--radius-md); border: 1px dashed var(--border-subtle);">
                    ${Icons.render('folder', 48, 'text-muted')}
                    <h3 style="margin-top: 14px; font-size: 1.1rem; color: var(--text-primary);">No files in this view</h3>
                    <p style="margin-top: 6px; font-size: 0.85rem;">Upload files or transfer from a nearby computer to get started.</p>
                    <button class="btn-primary" style="margin-top: 18px;" onclick="window.triggerUpload()">${Icons.render('upload-cloud')} Upload File</button>
                  </div>
                `;
              } else {
                container.innerHTML = currentFiles.map(f => renderFileCardHtml(f)).join('');
              }
            }
          } else if (state.currentView === 'offline') {
            const grid = document.getElementById('movies-grid-container');
            if (grid) {
              const movies = currentFiles.filter(f => f.category === 'movies' || (f.mime_type && f.mime_type.startsWith('video/')));
              grid.innerHTML = movies.length > 0 ? movies.map(f => renderFileCardHtml(f)).join('') : `
                <div style="padding: 48px; text-align: center; color: var(--text-muted); grid-column: 1/-1; background: var(--bg-card); border-radius: var(--radius-md); border: 1px dashed var(--border-subtle);">
                  ${Icons.render('film', 48, 'text-muted')}
                  <h3 style="margin-top: 14px; font-size: 1.1rem; color: var(--text-primary);">No offline movies available yet</h3>
                  <button class="btn-primary" style="margin-top: 18px;" onclick="window.triggerUpload()">${Icons.render('upload-cloud')} Upload Movie File</button>
                </div>
              `;
            }
          } else if (state.currentView === 'dashboard') {
            loadDashboardRecentFiles();
          }
          loadStorageStats();
        } else {
          lastFilesHash = newHash;
        }
      } catch(e) {}
    }, 2000); // 2000ms = 2 seconds instant sync!
  }

  // Initialize App on DOM Load
  document.addEventListener('DOMContentLoaded', async () => {
    // Realtime Peer Cloud File Sync updates
    window.addEventListener('velora:cloud_synced', () => {
      if (state.user) {
        if (state.currentView === 'dashboard') {
          loadDashboardRecentFiles();
        } else if (state.currentView === 'files') {
          loadFiles();
        } else if (state.currentView === 'offline') {
          const c = document.getElementById('view-content');
          if (c) renderOfflineMoviesView(c);
        }
        loadStorageStats();
      }
    });

    // Window focus and visibility listeners for instant sync upon switching tabs/windows
    window.addEventListener('focus', () => {
      if (api.token || localStorage.getItem('cloud_token')) {
        loadFiles();
        loadStorageStats();
      }
    });
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden && (api.token || localStorage.getItem('cloud_token'))) {
        loadFiles();
        loadStorageStats();
      }
    });

    videoPlayer.init();
    initWebSocket();
    startRealtimeSync();

    // Enforce Real Online Cloud gatekeeper status
    checkOnlineStatus(false);
    window.addEventListener('online', () => {
      checkOnlineStatus(true);
      if (state.user) {
        loadFiles();
        loadStorageStats();
      }
    });
    window.addEventListener('offline', () => {
      checkOnlineStatus(false);
    });

    // Check if opened via ?sync= URL parameter from Computer A
    try {
      const urlParams = new URLSearchParams(window.location.search);
      if (urlParams.has('sync')) {
        const syncVal = urlParams.get('sync');
        window.importAccountSyncPayload(syncVal);
        // Clean query parameter from address bar
        window.history.replaceState({}, document.title, window.location.pathname);
      }
    } catch (e) {}

    // Check existing auth
    if (api.token) {
      try {
        const res = await api.getMe();
        state.user = res.user;
        updateUserHeader();
      } catch (e) {
        state.user = null;
      }
    }

    renderCurrentView();
  });
})(window);
