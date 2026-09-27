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
        document.getElementById('network-status-text').textContent = 'LAN Connected';
        document.getElementById('network-pill').style.display = 'flex';
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
    const { event, data } = msg;

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
          <h1 class="section-title">Welcome back, ${escapeHtml(state.user.name)}!</h1>
          <p class="section-subtitle">Your personal offline cloud is running on local network. Zero internet required.</p>
        </div>
        <div style="display:flex; gap:10px;">
          <button class="btn-primary" onclick="window.triggerUpload()">${Icons.render('upload-cloud')} Upload File</button>
          <button class="btn-secondary" onclick="window.navigateTo('devices')">${Icons.render('devices')} Nearby Devices</button>
        </div>
      </div>

      <!-- Quick Metrics Grid -->
      <div class="stats-grid">
        <div class="stat-card">
          <div class="stat-icon indigo">${Icons.render('hard-drive', 26)}</div>
          <div>
            <div class="stat-number" id="dash-used-storage">...</div>
            <div class="stat-label">Personal Storage Quota</div>
          </div>
        </div>
        <div class="stat-card">
          <div class="stat-icon emerald">${Icons.render('file', 26)}</div>
          <div>
            <div class="stat-number" id="dash-file-count">...</div>
            <div class="stat-label">Local Files Available</div>
          </div>
        </div>
        <div class="stat-card">
          <div class="stat-icon amber">${Icons.render('film', 26)}</div>
          <div>
            <div class="stat-number" id="dash-movie-count">...</div>
            <div class="stat-label">Offline Movies & Media</div>
          </div>
        </div>
        <div class="stat-card">
          <div class="stat-icon cyan">${Icons.render('devices', 26)}</div>
          <div>
            <div class="stat-number" id="dash-device-count">...</div>
            <div class="stat-label">Nearby Paired Devices</div>
          </div>
        </div>
      </div>

      <!-- Active Transfers Alert / Section -->
      <div id="dash-transfers-section" style="margin-bottom: 28px;"></div>

      <!-- Primary Acceptance Test Card -->
      <div style="background: linear-gradient(135deg, rgba(30, 41, 59, 0.95), rgba(15, 23, 42, 0.9)); border: 1px solid rgba(99, 102, 241, 0.3); border-radius: var(--radius-lg); padding: 22px; margin-bottom: 28px;">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">
          <div style="display:flex; align-items:center; gap:10px;">
            <div style="width:36px; height:36px; border-radius:8px; background:rgba(99, 102, 241, 0.2); color:var(--primary); display:flex; align-items:center; justify-content:center;">
              ${Icons.render('shield-check', 20)}
            </div>
            <div>
              <h3 style="font-size:1.05rem; font-weight:700;">Offline Direct P2P File Sharing Engine</h3>
              <p style="font-size:0.8rem; color:var(--text-muted);">Transfer 1.5 GB movies between computers over Wi-Fi without pendrive, cables, or internet.</p>
            </div>
          </div>
          <span class="brand-badge">Offline Local Mode</span>
        </div>
        <p style="font-size:0.85rem; color:var(--text-secondary); line-height:1.5;">
          Both devices can discover each other on the same Wi-Fi router or mobile hotspot. Files are streamed directly between disks with zero RAM overflow and full pause/resume support.
        </p>
      </div>

      <!-- Recent Files Section -->
      <div class="section-header" style="margin-bottom: 16px;">
        <h2 style="font-size: 1.15rem; font-weight: 700;">Recent Offline Files</h2>
        <a href="javascript:void(0)" onclick="window.navigateTo('files')" style="color: var(--primary); font-size: 0.85rem; text-decoration: none; font-weight: 600;">View All &rarr;</a>
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
            <span style="color:var(--accent-emerald); font-weight:600;">✓ Offline Ready</span>
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
            • Files are stored in your private local directory: <code style="background:rgba(0,0,0,0.3); padding:2px 6px; border-radius:4px;">data/storage/${state.user.id}/</code><br>
            • Video streams use direct filesystem chunking with zero RAM caching.<br>
            • Quotas prevent accidental disk exhaustion.
          </div>
        </div>
      </div>
    `;

    loadStorageStats();
  }

  // --- Auth View (Sign In / Sign Up / Offline OTP Modal) ---
  function renderAuthView(container) {
    container.innerHTML = `
      <div style="display:flex; align-items:center; justify-content:center; min-height:80vh;">
        <div class="modal-card" style="transform:none;">
          <div style="text-align:center; margin-bottom:24px;">
            <div class="brand-icon-wrapper" style="margin: 0 auto 12px; width:52px; height:52px;">
              ${Icons.render('cloud', 28)}
            </div>
            <h2 style="font-size:1.45rem; font-weight:700;">Velora Offline Cloud</h2>
            <p style="font-size:0.85rem; color:var(--text-muted); margin-top:4px;">Personal media & file sharing without the internet</p>
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
              <input type="email" id="login-email" class="form-input" placeholder="bharath@example.com" required>
            </div>
            <div class="form-group">
              <label>Password</label>
              <input type="password" id="login-password" class="form-input" placeholder="••••••••" required>
            </div>
            <button type="submit" class="btn-primary" style="width:100%; justify-content:center; padding:11px; margin-top:8px;">
              Sign In to Personal Cloud
            </button>
            <div style="text-align:center; margin-top:14px;">
              <a href="javascript:void(0)" onclick="window.promptForgotPassword()" style="font-size:0.8rem; color:var(--text-muted); text-decoration:none;">Forgot Password?</a>
            </div>
          </form>

          <!-- Sign Up Form -->
          <form id="form-signup" style="display:none;" onsubmit="window.handleSignup(event)">
            <div class="form-group">
              <label>Full Name</label>
              <input type="text" id="signup-name" class="form-input" placeholder="Bharath Kumar" required>
            </div>
            <div class="form-group">
              <label>Email Address</label>
              <input type="email" id="signup-email" class="form-input" placeholder="bharath@example.com" required>
            </div>
            <div class="form-group">
              <label>Password (Min 8 chars)</label>
              <input type="password" id="signup-password" class="form-input" placeholder="••••••••" minlength="6" required>
            </div>
            <button type="submit" class="btn-primary" style="width:100%; justify-content:center; padding:11px; margin-top:8px;">
              Create Offline Account
            </button>
          </form>

          <!-- 1-Click Offline Demo Account Loader -->
          <div style="margin-top:20px; padding-top:16px; border-top:1px solid var(--border-subtle); text-align:center;">
            <p style="font-size:0.75rem; color:var(--text-muted); margin-bottom:10px;">Quick Offline Testing & Demonstration:</p>
            <button class="btn-secondary" style="width:100%; justify-content:center;" onclick="window.seedDemoAccount()">
              ${Icons.render('shield-check')} 1-Click Demo Login (Bharath + 1.5 GB Movie)
            </button>
          </div>
        </div>
      </div>
    `;
  }

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
    const email = document.getElementById('login-email').value;
    const password = document.getElementById('login-password').value;

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
    const name = document.getElementById('signup-name').value;
    const email = document.getElementById('signup-email').value;
    const password = document.getElementById('signup-password').value;

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

  global.seedDemoAccount = async function () {
    try {
      const res = await api.seedDemo();
      state.user = res.user;
      showToast('Logged in as Bharath with 1.5 GB test movie!', 'success');
      updateUserHeader();
      navigateTo('dashboard');
    } catch (e) {
      showToast('Demo seed failed: ' + e.message, 'error');
    }
  };

  global.logout = async function () {
    await api.logout();
    state.user = null;
    updateUserHeader();
    renderCurrentView();
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
  }

  // --- File Actions & Chunked Upload ---
  global.triggerUpload = function () {
    const input = document.createElement('input');
    input.type = 'file';
    input.onchange = async (e) => {
      const file = e.target.files[0];
      if (!file) return;

      openUploadProgressModal(file.name, file.size);

      try {
        await api.uploadFileChunked(file, state.currentFolderId, (prog) => {
          const bar = document.getElementById('upload-modal-bar');
          const percent = document.getElementById('upload-modal-percent');
          const speed = document.getElementById('upload-modal-speed');
          const eta = document.getElementById('upload-modal-eta');

          if (bar) bar.style.width = `${prog.percent}%`;
          if (percent) percent.textContent = `${prog.percent}% (${formatBytes(prog.uploadedBytes)} / ${formatBytes(prog.totalBytes)})`;
          if (speed) speed.textContent = `${formatBytes(prog.speedBps)}/s`;
          if (eta) eta.textContent = prog.etaSec > 0 ? `ETA: ${prog.etaSec}s` : 'Finalizing...';
        });

        closeUploadProgressModal();
        showToast(`Uploaded "${file.name}" successfully!`, 'success');
        loadFiles();
        loadStorageStats();
      } catch (err) {
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

  global.playVideoFile = function (fileId) {
    const file = state.files.find(f => f.id === fileId);
    if (!file) return;
    videoPlayer.playFile(file);
  };

  global.downloadFile = function (fileId) {
    window.open(`/api/files/download/${fileId}?token=${api.token || ''}`, '_blank');
  };

  global.renameFilePrompt = async function (fileId, currentName) {
    const newName = prompt('Enter new file name:', currentName);
    if (!newName || newName.trim() === currentName) return;

    try {
      await api.renameFile(fileId, newName.trim());
      showToast('File renamed.', 'success');
      loadFiles();
    } catch (e) {
      showToast(e.message, 'error');
    }
  };

  global.deleteFilePrompt = async function (fileId) {
    if (!confirm('Are you sure you want to delete this file from local storage?')) return;
    try {
      await api.deleteFile(fileId);
      showToast('File deleted.', 'success');
      loadFiles();
      loadStorageStats();
    } catch (e) {
      showToast(e.message, 'error');
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

  global.navigateTo = navigateTo;

  // Initialize App on DOM Load
  document.addEventListener('DOMContentLoaded', async () => {
    videoPlayer.init();
    initWebSocket();

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
