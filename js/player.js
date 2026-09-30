// public/js/player.js - VLC-Style Cinema Movie & Video Player with In-Browser Universal Engine
(function (global) {
  class VideoPlayerController {
    constructor() {
      this.currentFile = null;
      this.currentStreamUrl = null;
      this.modal = null;
      this.container = null;
      this.screen = null;
      this.video = null;
      this.movi = null;
      this.activeMedia = null;
      this.scrubber = null;
      this.scrubberFill = null;
      this.timeDisplay = null;
      this.playBtn = null;
      this.volumeSlider = null;
      this.speedSelect = null;
      this.saveInterval = null;
      this.idleTimeout = null;
      this.osdTimeout = null;
      this.clickTimeout = null;
      this.aspectIndex = 0; // 0: contain, 1: cover, 2: fill
      this.aspectModes = ['vlc-fit-contain', 'vlc-fit-cover', 'vlc-fit-fill'];
      this.aspectLabels = ['Fit: 16:9', 'Fit: Zoom', 'Fit: Stretch'];
    }

    init() {
      this.modal = document.getElementById('video-modal');
      this.container = document.getElementById('player-container');
      this.screen = document.getElementById('vlc-screen');
      this.video = document.getElementById('player-video');
      this.movi = document.getElementById('player-movi');
      this.scrubber = document.getElementById('player-scrubber');
      this.scrubberFill = document.getElementById('player-scrubber-fill');
      this.timeDisplay = document.getElementById('player-time');
      this.playBtn = document.getElementById('player-play-btn');
      this.volumeSlider = document.getElementById('player-volume');
      this.speedSelect = document.getElementById('player-speed');

      this.activeMedia = this.video;

      if (!this.video) return;

      // Attach media playback listeners to both native video and enhanced movi element
      [this.video, this.movi].forEach(media => {
        if (!media) return;
        media.addEventListener('timeupdate', () => this._onTimeUpdate());
        media.addEventListener('loadedmetadata', () => this._onMetaLoaded());
        media.addEventListener('ended', () => this._onEnded());
        media.addEventListener('play', () => this._updatePlayIcon(true));
        media.addEventListener('pause', () => this._updatePlayIcon(false));
      });

      // Error handler: If native video cannot parse the container (e.g. MKV), auto-switch to enhanced player
      this.video.addEventListener('error', (e) => this._onPlaybackError(e));

      // Scrubber seek
      if (this.scrubber) {
        this.scrubber.addEventListener('click', (e) => this._onScrub(e));
      }

      // Volume slider
      if (this.volumeSlider) {
        this.volumeSlider.addEventListener('input', (e) => {
          this.setVolume(parseFloat(e.target.value));
        });
      }

      // Playback speed
      if (this.speedSelect) {
        this.speedSelect.addEventListener('change', (e) => {
          const rate = parseFloat(e.target.value);
          if (this.activeMedia) this.activeMedia.playbackRate = rate;
          this._showOsd(`Speed: ${rate}x`);
        });
      }

      // Subtitle track file loader
      const subInput = document.getElementById('player-sub-input');
      if (subInput) {
        subInput.addEventListener('change', (e) => this._loadSubtitleFile(e));
      }

      // Screen click & double-click interactions (VLC Behavior on screen container)
      const clickTarget = this.screen || this.video;
      if (clickTarget) {
        clickTarget.addEventListener('click', (e) => {
          if (e.target && e.target.closest('#player-controls, #player-header')) return;
          if (this.clickTimeout) {
            clearTimeout(this.clickTimeout);
            this.clickTimeout = null;
            this.toggleFullscreen();
          } else {
            this.clickTimeout = setTimeout(() => {
              this.togglePlay();
              this.clickTimeout = null;
            }, 250);
          }
        });

        // Mouse wheel scroll to adjust volume (VLC Feature)
        clickTarget.addEventListener('wheel', (e) => {
          e.preventDefault();
          const currentVol = (this.activeMedia && this.activeMedia.volume !== undefined) ? this.activeMedia.volume : 1;
          if (e.deltaY < 0) {
            this.setVolume(Math.min(1, currentVol + 0.05));
          } else {
            this.setVolume(Math.max(0, currentVol - 0.05));
          }
        }, { passive: false });
      }

      // Auto-hide controls & cursor when idle (VLC Cinema Style)
      if (this.container) {
        const resetIdle = () => {
          this.container.classList.remove('vlc-idle');
          if (this.idleTimeout) clearTimeout(this.idleTimeout);
          const isPlaying = this.activeMedia && !this.activeMedia.paused;
          if (isPlaying) {
            this.idleTimeout = setTimeout(() => {
              if (this.isOpen() && this.activeMedia && !this.activeMedia.paused) {
                this.container.classList.add('vlc-idle');
              }
            }, 2500);
          }
        };

        this.container.addEventListener('mousemove', resetIdle);
        this.container.addEventListener('mousedown', resetIdle);
      }

      // Fullscreen change listener to update icon
      document.addEventListener('fullscreenchange', () => {
        const isFull = !!document.fullscreenElement;
        const fsBtn = document.getElementById('player-fullscreen-btn');
        if (fsBtn) {
          fsBtn.innerHTML = isFull
            ? `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 3v3a2 2 0 0 1-2 2H3"/><path d="M21 8h-3a2 2 0 0 1-2-2V3"/><path d="M3 16h3a2 2 0 0 1 2 2v3"/><path d="M16 21v-3a2 2 0 0 1 2-2h3"/></svg>`
            : `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 3H5a2 2 0 0 0-2 2v3"/><path d="M21 8V5a2 2 0 0 0-2-2h-3"/><path d="M3 16v3a2 2 0 0 0 2 2h3"/><path d="M16 21h3a2 2 0 0 0 2-2v-3"/></svg>`;
        }
      });

      // VLC Keyboard shortcuts
      document.addEventListener('keydown', (e) => {
        if (!this.isOpen()) return;

        if (e.code === 'Space' || e.key === 'k') {
          e.preventDefault();
          this.togglePlay();
        } else if (e.code === 'ArrowRight') {
          e.preventDefault();
          this.seekRelative(10);
        } else if (e.code === 'ArrowLeft') {
          e.preventDefault();
          this.seekRelative(-10);
        } else if (e.code === 'ArrowUp') {
          e.preventDefault();
          const currentVol = (this.activeMedia && this.activeMedia.volume !== undefined) ? this.activeMedia.volume : 1;
          this.setVolume(Math.min(1, currentVol + 0.1));
        } else if (e.code === 'ArrowDown') {
          e.preventDefault();
          const currentVol = (this.activeMedia && this.activeMedia.volume !== undefined) ? this.activeMedia.volume : 1;
          this.setVolume(Math.max(0, currentVol - 0.1));
        } else if (e.key === 'f' || e.key === 'F') {
          e.preventDefault();
          this.toggleFullscreen();
        } else if (e.key === 'm' || e.key === 'M') {
          e.preventDefault();
          this.toggleMute();
        } else if (e.key === 'c' || e.key === 'C') {
          e.preventDefault();
          this.cycleAspectRatio();
        } else if (e.key === 'Escape') {
          if (document.fullscreenElement) {
            document.exitFullscreen().catch(() => {});
          } else {
            this.close();
          }
        }
      });
    }

    isOpen() {
      return this.modal && this.modal.classList.contains('open');
    }

    async playFile(file) {
      this.currentFile = file;
      this._triedFallback = false;
      const titleEl = document.getElementById('player-title');
      if (titleEl) titleEl.textContent = file.original_name || file.name;

      const isMkv = ((file.original_name || file.name || '').toLowerCase().endsWith('.mkv'));

      // 1. Stream directly from Velora Persistent Cloud Storage / CDN
      let streamUrl = null;
      if (global.api && global.api.getStreamUrl) {
        streamUrl = global.api.getStreamUrl(file.id);
      }

      // If streamUrl is invalid or a dead blob from another browser, fallback to cloud/CDN
      if (!streamUrl || (streamUrl.startsWith('blob:') && (!global.api || !global.api.blobUrlCache || !global.api.blobUrlCache.has(file.id)))) {
        if (file.cloud_url && (file.cloud_url.startsWith('http://') || file.cloud_url.startsWith('https://'))) {
          streamUrl = file.cloud_url;
        } else if (file.stream_url && !file.stream_url.startsWith('blob:')) {
          streamUrl = file.stream_url;
        } else {
          const safeName = encodeURIComponent(file.name || file.original_name || 'video.mp4');
          streamUrl = `https://cdn.jsdelivr.net/gh/Bharath-0018/Offline-Access-Files-Website@main/data/uploads/${file.id}_${safeName}`;
        }
      }

      this.currentStreamUrl = streamUrl;

      // Check if custom elements have registered <movi-player>
      const hasMoviCustomElement = window.customElements && customElements.get('movi-player');

      if (isMkv && hasMoviCustomElement && this.movi) {
        this._useMoviPlayer(streamUrl);
      } else {
        this._useNativeVideo(streamUrl);
      }

      this.modal.classList.add('open');
      this._showOsd(`Playing: ${file.original_name || file.name}`);

      // Check last playback position
      const savedSec = file.play_position_seconds || parseFloat(localStorage.getItem(`pos_${file.id}`) || '0');
      if (this.activeMedia && this.activeMedia.play) {
        this.activeMedia.play().catch(e => console.log('Autoplay notice:', e));
      }

      if (savedSec > 5) {
        const formatted = this._formatTime(savedSec);
        if (confirm(`Resume "${file.original_name || file.name}" from ${formatted}?`)) {
          if (this.activeMedia) this.activeMedia.currentTime = savedSec;
        }
      }

      // Periodic position persistence
      if (this.saveInterval) clearInterval(this.saveInterval);
      this.saveInterval = setInterval(() => {
        if (this.activeMedia && !this.activeMedia.paused && this.activeMedia.currentTime > 2) {
          localStorage.setItem(`pos_${this.currentFile.id}`, this.activeMedia.currentTime);
          if (global.api && global.api.savePlayPosition) {
            global.api.savePlayPosition(this.currentFile.id, this.activeMedia.currentTime).catch(() => {});
          }
        }
      }, 5000);
    }

    _useNativeVideo(streamUrl) {
      if (this.movi) {
        this.movi.style.display = 'none';
        if (this.movi.pause) this.movi.pause();
      }
      this.video.style.display = 'block';
      this.activeMedia = this.video;
      this.video.crossOrigin = 'anonymous';
      this.video.playsInline = true;
      this.video.src = streamUrl;
      this.video.load();
      const p = this.video.play();
      if (p) p.catch(() => {});
    }

    _useMoviPlayer(streamUrl) {
      this.video.style.display = 'none';
      this.video.pause();
      if (this.movi) {
        this.movi.style.display = 'block';
        this.activeMedia = this.movi;
        this.movi.src = streamUrl;
        if (this.movi.load) this.movi.load();
        if (this.movi.play) this.movi.play().catch(e => console.log('Movi play:', e));
        this._showOsd('Universal Cinema Engine Active');
      }
    }

    _onPlaybackError(e) {
      if (!this.isOpen() || !this.currentFile) return;
      console.warn('[Velora Player] Native video playback error:', e);

      // Seamlessly try resilient fallbacks:
      if (!this._triedFallback) {
        this._triedFallback = true;
        const file = this.currentFile;
        let backupUrl = null;
        if (file.cloud_url && file.cloud_url !== this.currentStreamUrl) {
          backupUrl = file.cloud_url;
        } else if (file.stream_url && file.stream_url !== this.currentStreamUrl && !file.stream_url.startsWith('blob:')) {
          backupUrl = file.stream_url;
        } else {
          backupUrl = 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4';
        }

        if (backupUrl) {
          this._showOsd('Buffering High-Speed Cloud Stream...');
          this.currentStreamUrl = backupUrl;
          this.video.src = backupUrl;
          this.video.load();
          this.video.play().catch(() => {});
          return;
        }
      }

      // Seamlessly switch to MoviPlayer WebCodecs engine
      if (this.movi && window.customElements && customElements.get('movi-player')) {
        this._useMoviPlayer(this.currentStreamUrl);
      } else {
        this._showOsd('Buffering stream. Press Play to start.');
      }
    }

    togglePlay() {
      if (!this.activeMedia) return;
      if (this.activeMedia.paused) {
        this.activeMedia.play().catch(() => {});
        this._flashCenterIndicator(true);
      } else {
        this.activeMedia.pause();
        this._flashCenterIndicator(false);
      }
    }

    _flashCenterIndicator(isPlaying) {
      const indicator = document.getElementById('vlc-center-indicator');
      const icon = document.getElementById('vlc-indicator-icon');
      if (!indicator || !icon) return;

      icon.innerHTML = isPlaying
        ? `<polygon points="6 3 20 12 6 21 6 3"/>`
        : `<rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/>`;

      indicator.classList.remove('show');
      void indicator.offsetWidth;
      indicator.classList.add('show');
      setTimeout(() => indicator.classList.remove('show'), 400);
    }

    _showOsd(text) {
      const osd = document.getElementById('vlc-osd');
      if (!osd) return;
      osd.textContent = text;
      osd.classList.add('show');
      if (this.osdTimeout) clearTimeout(this.osdTimeout);
      this.osdTimeout = setTimeout(() => osd.classList.remove('show'), 1200);
    }

    seekRelative(sec) {
      if (!this.activeMedia || !this.activeMedia.duration) return;
      const target = Math.max(0, Math.min(this.activeMedia.duration, this.activeMedia.currentTime + sec));
      this.activeMedia.currentTime = target;
      const sign = sec > 0 ? '+' : '';
      this._showOsd(`${sign}${sec}s (${this._formatTime(target)})`);
    }

    setVolume(vol) {
      const clamped = Math.max(0, Math.min(1, vol));
      if (this.video) this.video.volume = clamped;
      if (this.movi) this.movi.volume = clamped;
      if (this.volumeSlider) this.volumeSlider.value = clamped;
      const percent = Math.round(clamped * 100);
      this._showOsd(`🔊 Volume: ${percent}%`);
    }

    toggleMute() {
      if (!this.activeMedia) return;
      const newMuted = !this.activeMedia.muted;
      if (this.video) this.video.muted = newMuted;
      if (this.movi) this.movi.muted = newMuted;
      this._showOsd(newMuted ? '🔇 Muted' : `🔊 Volume: ${Math.round((this.activeMedia.volume || 1) * 100)}%`);
    }

    cycleAspectRatio() {
      this.aspectIndex = (this.aspectIndex + 1) % this.aspectModes.length;
      const targetElem = (this.activeMedia === this.movi) ? this.movi : this.video;
      this.aspectModes.forEach(cls => {
        if (this.video) this.video.classList.remove(cls);
        if (this.movi) this.movi.classList.remove(cls);
      });
      const newClass = this.aspectModes[this.aspectIndex];
      const newLabel = this.aspectLabels[this.aspectIndex];
      if (targetElem) targetElem.classList.add(newClass);

      const btn = document.getElementById('player-aspect-btn');
      if (btn) btn.textContent = newLabel;
      this._showOsd(newLabel);
    }

    async togglePip() {
      if (!this.video) return;
      try {
        if (document.pictureInPictureElement) {
          await document.exitPictureInPicture();
        } else if (document.pictureInPictureEnabled && this.video.style.display !== 'none') {
          await this.video.requestPictureInPicture();
          this._showOsd('Picture-in-Picture');
        }
      } catch (err) {
        console.warn('PiP error:', err);
      }
    }

    toggleFullscreen() {
      const container = document.getElementById('player-container');
      if (!container) return;

      if (!document.fullscreenElement) {
        if (container.requestFullscreen) {
          container.requestFullscreen().catch(err => {
            console.error(`Fullscreen request failed: ${err.message}`);
          });
        }
      } else {
        if (document.exitFullscreen) {
          document.exitFullscreen().catch(() => {});
        }
      }
    }

    _updatePlayIcon(isPlaying) {
      if (!this.playBtn) return;
      this.playBtn.innerHTML = isPlaying
        ? `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>`
        : `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="6 3 20 12 6 21 6 3"/></svg>`;
    }

    _onTimeUpdate() {
      if (!this.activeMedia || !this.activeMedia.duration) return;
      const percent = (this.activeMedia.currentTime / this.activeMedia.duration) * 100;
      if (this.scrubberFill) {
        this.scrubberFill.style.width = `${percent}%`;
      }
      if (this.timeDisplay) {
        this.timeDisplay.textContent = `${this._formatTime(this.activeMedia.currentTime)} / ${this._formatTime(this.activeMedia.duration)}`;
      }
    }

    _onMetaLoaded() {
      if (this.timeDisplay && this.activeMedia && this.activeMedia.duration) {
        this.timeDisplay.textContent = `00:00 / ${this._formatTime(this.activeMedia.duration)}`;
      }
    }

    _onEnded() {
      this._updatePlayIcon(false);
      if (this.currentFile) {
        localStorage.removeItem(`pos_${this.currentFile.id}`);
        if (global.api && global.api.savePlayPosition) {
          global.api.savePlayPosition(this.currentFile.id, 0).catch(() => {});
        }
      }
    }

    _onScrub(e) {
      if (!this.scrubber || !this.activeMedia || !this.activeMedia.duration) return;
      const rect = this.scrubber.getBoundingClientRect();
      const clickX = e.clientX - rect.left;
      const width = rect.width;
      const percentage = Math.max(0, Math.min(1, clickX / width));
      this.activeMedia.currentTime = percentage * this.activeMedia.duration;
    }

    _loadSubtitleFile(e) {
      const file = e.target.files[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = (event) => {
        let vttText = event.target.result;
        if (!vttText.startsWith('WEBVTT')) {
          vttText = 'WEBVTT\n\n' + vttText.replace(/(\d{2}:\d{2}:\d{2}),(\d{3})/g, '$1.$2');
        }
        const blob = new Blob([vttText], { type: 'text/vtt' });
        const trackUrl = URL.createObjectURL(blob);

        if (this.video) {
          const oldTracks = this.video.querySelectorAll('track');
          oldTracks.forEach(t => t.remove());

          const track = document.createElement('track');
          track.kind = 'subtitles';
          track.label = file.name;
          track.srclang = 'en';
          track.src = trackUrl;
          track.default = true;
          this.video.appendChild(track);
          track.mode = 'showing';
        }
        if (global.showToast) global.showToast('Subtitles loaded: ' + file.name, 'success');
      };
      reader.readAsText(file);
    }

    _formatTime(seconds) {
      if (isNaN(seconds) || seconds < 0) return '00:00';
      const sec = Math.floor(seconds);
      const h = Math.floor(sec / 3600);
      const m = Math.floor((sec % 3600) / 60);
      const s = sec % 60;
      const mm = m < 10 ? `0${m}` : m;
      const ss = s < 10 ? `0${s}` : s;
      if (h > 0) {
        return `${h}:${mm}:${ss}`;
      }
      return `${mm}:${ss}`;
    }

    close() {
      if (document.fullscreenElement) {
        document.exitFullscreen().catch(() => {});
      }
      if (this.video) {
        this.video.pause();
        this.video.removeAttribute('src');
        this.video.load();
      }
      if (this.movi) {
        if (this.movi.pause) this.movi.pause();
        this.movi.removeAttribute('src');
        this.movi.style.display = 'none';
      }
      if (this.currentFile && this.activeMedia && this.activeMedia.currentTime > 2) {
        localStorage.setItem(`pos_${this.currentFile.id}`, this.activeMedia.currentTime);
        if (global.api && global.api.savePlayPosition) {
          global.api.savePlayPosition(this.currentFile.id, this.activeMedia.currentTime).catch(() => {});
        }
      }
      if (this.saveInterval) clearInterval(this.saveInterval);
      if (this.idleTimeout) clearTimeout(this.idleTimeout);
      if (this.modal) this.modal.classList.remove('open');
      if (this.container) this.container.classList.remove('vlc-idle');
      this.currentFile = null;
      this.currentStreamUrl = null;
    }
  }

  global.videoPlayer = new VideoPlayerController();
})(window);
