// public/js/player.js - VLC-Style Cinema Movie & Video Player
(function (global) {
  class VideoPlayerController {
    constructor() {
      this.currentFile = null;
      this.modal = null;
      this.container = null;
      this.video = null;
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
      this.mkvRetryAttempted = false;
    }

    init() {
      this.modal = document.getElementById('video-modal');
      this.container = document.getElementById('player-container');
      this.video = document.getElementById('player-video');
      this.scrubber = document.getElementById('player-scrubber');
      this.scrubberFill = document.getElementById('player-scrubber-fill');
      this.timeDisplay = document.getElementById('player-time');
      this.playBtn = document.getElementById('player-play-btn');
      this.volumeSlider = document.getElementById('player-volume');
      this.speedSelect = document.getElementById('player-speed');

      if (!this.video) return;

      // Video playback event listeners
      this.video.addEventListener('timeupdate', () => this._onTimeUpdate());
      this.video.addEventListener('loadedmetadata', () => this._onMetaLoaded());
      this.video.addEventListener('ended', () => this._onEnded());
      this.video.addEventListener('play', () => this._updatePlayIcon(true));
      this.video.addEventListener('pause', () => this._updatePlayIcon(false));

      // Error handler with automatic MKV compatibility fallback
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
          this.video.playbackRate = parseFloat(e.target.value);
          this._showOsd(`Speed: ${e.target.value}x`);
        });
      }

      // Subtitle track file loader
      const subInput = document.getElementById('player-sub-input');
      if (subInput) {
        subInput.addEventListener('change', (e) => this._loadSubtitleFile(e));
      }

      // Video screen click & double-click interactions (VLC Behavior)
      if (this.video) {
        this.video.addEventListener('click', (e) => {
          // Debounce click to allow double click
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
        this.video.addEventListener('wheel', (e) => {
          e.preventDefault();
          if (e.deltaY < 0) {
            this.setVolume(Math.min(1, this.video.volume + 0.05));
          } else {
            this.setVolume(Math.max(0, this.video.volume - 0.05));
          }
        }, { passive: false });
      }

      // Auto-hide controls & cursor when idle (VLC Cinema Style)
      if (this.container) {
        const resetIdle = () => {
          this.container.classList.remove('vlc-idle');
          if (this.idleTimeout) clearTimeout(this.idleTimeout);
          if (!this.video.paused) {
            this.idleTimeout = setTimeout(() => {
              if (this.isOpen() && !this.video.paused) {
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
          this.setVolume(Math.min(1, this.video.volume + 0.1));
        } else if (e.code === 'ArrowDown') {
          e.preventDefault();
          this.setVolume(Math.max(0, this.video.volume - 0.1));
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
            document.exitFullscreen();
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
      this.mkvRetryAttempted = false;
      const titleEl = document.getElementById('player-title');
      if (titleEl) titleEl.textContent = file.original_name || file.name;

      // Hide any previous codec error notices
      const helper = document.getElementById('vlc-mkv-helper');
      if (helper) helper.style.display = 'none';

      // 1. Try to get direct stream blob URL
      let streamUrl = null;
      if (global.api && global.api.getFileBlobUrl) {
        try {
          const isMkv = (file.name || file.original_name || '').toLowerCase().endsWith('.mkv');
          streamUrl = await global.api.getFileBlobUrl(file.id, isMkv ? 'video/webm' : null);
        } catch (e) {
          console.warn('Could not retrieve local blob:', e);
        }
      }

      // 2. Check if file has active blob URL
      if (!streamUrl && file.streamUrl && !file.streamUrl.startsWith('/api')) {
        streamUrl = file.streamUrl;
      }

      // 3. Fallback to server endpoint (for local server mode)
      if (!streamUrl) {
        streamUrl = `/api/files/stream/${file.id}?token=${(global.api && global.api.token) || ''}`;
      }

      this.video.src = streamUrl;
      this.video.load();

      // Check last position
      const savedSec = file.play_position_seconds || parseFloat(localStorage.getItem(`pos_${file.id}`) || '0');

      this.modal.classList.add('open');
      this.video.play().catch(e => console.log('Autoplay notice:', e));

      if (savedSec > 5) {
        const formatted = this._formatTime(savedSec);
        if (confirm(`Resume "${file.original_name || file.name}" from ${formatted}?`)) {
          this.video.currentTime = savedSec;
        }
      }

      // Start periodic position persistence
      if (this.saveInterval) clearInterval(this.saveInterval);
      this.saveInterval = setInterval(() => {
        if (!this.video.paused && this.video.currentTime > 2) {
          localStorage.setItem(`pos_${this.currentFile.id}`, this.video.currentTime);
          if (global.api && global.api.savePlayPosition) {
            global.api.savePlayPosition(this.currentFile.id, this.video.currentTime).catch(() => {});
          }
        }
      }, 5000);
    }

    _onPlaybackError(e) {
      if (!this.isOpen() || !this.video.src) return;
      const isMkv = this.currentFile && (this.currentFile.name || '').toLowerCase().endsWith('.mkv');

      console.warn('Video playback error detected:', this.video.error);

      // Automatic MKV retry with WebM/MP4 container fallback
      if (isMkv && !this.mkvRetryAttempted) {
        this.mkvRetryAttempted = true;
        this.retryCompatibilityMode();
        return;
      }

      // If still failing on an MKV or video, show the VLC Player download option
      const helper = document.getElementById('vlc-mkv-helper');
      if (helper) {
        helper.style.display = 'block';
      } else if (global.showToast) {
        global.showToast('Browser cannot decode this video codec. Use "Open in VLC Player".', 'error');
      }
    }

    async retryCompatibilityMode() {
      if (!this.currentFile) return;
      const helper = document.getElementById('vlc-mkv-helper');
      if (helper) helper.style.display = 'none';

      try {
        let streamUrl = null;
        if (global.api && global.api.getFileBlobUrl) {
          streamUrl = await global.api.getFileBlobUrl(this.currentFile.id, 'video/mp4');
          if (!streamUrl) {
            streamUrl = await global.api.getFileBlobUrl(this.currentFile.id, 'video/webm');
          }
        }
        if (streamUrl) {
          this.video.src = streamUrl;
          this.video.load();
          await this.video.play();
          this._showOsd('Compatibility Mode Active');
          return;
        }
      } catch (err) {
        console.warn('Retry compatibility mode failed:', err);
      }
      if (helper) helper.style.display = 'block';
    }

    downloadForVlc() {
      if (!this.currentFile) return;
      if (global.downloadFile) {
        global.downloadFile(this.currentFile.id);
      }
      this._showOsd('Downloading for VLC...');
    }

    togglePlay() {
      if (!this.video) return;
      if (this.video.paused) {
        this.video.play().catch(() => {});
        this._flashCenterIndicator(true);
      } else {
        this.video.pause();
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
      void indicator.offsetWidth; // Trigger reflow
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
      if (!this.video || !this.video.duration) return;
      const target = Math.max(0, Math.min(this.video.duration, this.video.currentTime + sec));
      this.video.currentTime = target;
      const sign = sec > 0 ? '+' : '';
      this._showOsd(`${sign}${sec}s (${this._formatTime(target)})`);
    }

    setVolume(vol) {
      if (!this.video) return;
      const clamped = Math.max(0, Math.min(1, vol));
      this.video.volume = clamped;
      if (this.volumeSlider) this.volumeSlider.value = clamped;
      const percent = Math.round(clamped * 100);
      this._showOsd(`🔊 Volume: ${percent}%`);
    }

    toggleMute() {
      if (!this.video) return;
      this.video.muted = !this.video.muted;
      this._showOsd(this.video.muted ? '🔇 Muted' : `🔊 Volume: ${Math.round(this.video.volume * 100)}%`);
    }

    cycleAspectRatio() {
      if (!this.video) return;
      this.aspectIndex = (this.aspectIndex + 1) % this.aspectModes.length;
      this.aspectModes.forEach(cls => this.video.classList.remove(cls));
      const newClass = this.aspectModes[this.aspectIndex];
      const newLabel = this.aspectLabels[this.aspectIndex];
      this.video.classList.add(newClass);

      const btn = document.getElementById('player-aspect-btn');
      if (btn) btn.textContent = newLabel;
      this._showOsd(newLabel);
    }

    async togglePip() {
      if (!this.video) return;
      try {
        if (document.pictureInPictureElement) {
          await document.exitPictureInPicture();
        } else if (document.pictureInPictureEnabled) {
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
          document.exitFullscreen();
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
      if (!this.video || !this.video.duration) return;
      const percent = (this.video.currentTime / this.video.duration) * 100;
      if (this.scrubberFill) {
        this.scrubberFill.style.width = `${percent}%`;
      }
      if (this.timeDisplay) {
        this.timeDisplay.textContent = `${this._formatTime(this.video.currentTime)} / ${this._formatTime(this.video.duration)}`;
      }
    }

    _onMetaLoaded() {
      if (this.timeDisplay && this.video) {
        this.timeDisplay.textContent = `00:00 / ${this._formatTime(this.video.duration)}`;
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
      if (!this.scrubber || !this.video || !this.video.duration) return;
      const rect = this.scrubber.getBoundingClientRect();
      const clickX = e.clientX - rect.left;
      const width = rect.width;
      const percentage = Math.max(0, Math.min(1, clickX / width));
      this.video.currentTime = percentage * this.video.duration;
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
        if (this.currentFile && this.video.currentTime > 2) {
          localStorage.setItem(`pos_${this.currentFile.id}`, this.video.currentTime);
          if (global.api && global.api.savePlayPosition) {
            global.api.savePlayPosition(this.currentFile.id, this.video.currentTime).catch(() => {});
          }
        }
        this.video.removeAttribute('src');
        this.video.load();
      }
      if (this.saveInterval) clearInterval(this.saveInterval);
      if (this.idleTimeout) clearTimeout(this.idleTimeout);
      if (this.modal) this.modal.classList.remove('open');
      if (this.container) this.container.classList.remove('vlc-idle');
      this.currentFile = null;
    }
  }

  global.videoPlayer = new VideoPlayerController();
})(window);
