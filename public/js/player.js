// public/js/player.js - Offline Movie & Video Player with Resume, Range Seeking, and Cinema Controls
(function (global) {
  class VideoPlayerController {
    constructor() {
      this.currentFile = null;
      this.modal = null;
      this.video = null;
      this.scrubber = null;
      this.scrubberFill = null;
      this.timeDisplay = null;
      this.playBtn = null;
      this.volumeSlider = null;
      this.speedSelect = null;
      this.isDragging = false;
      this.saveInterval = null;
    }

    init() {
      this.modal = document.getElementById('video-modal');
      this.video = document.getElementById('player-video');
      this.scrubber = document.getElementById('player-scrubber');
      this.scrubberFill = document.getElementById('player-scrubber-fill');
      this.timeDisplay = document.getElementById('player-time');
      this.playBtn = document.getElementById('player-play-btn');
      this.volumeSlider = document.getElementById('player-volume');
      this.speedSelect = document.getElementById('player-speed');

      if (!this.video) return;

      // Event listeners
      this.video.addEventListener('timeupdate', () => this._onTimeUpdate());
      this.video.addEventListener('loadedmetadata', () => this._onMetaLoaded());
      this.video.addEventListener('ended', () => this._onEnded());
      this.video.addEventListener('play', () => this._updatePlayIcon(true));
      this.video.addEventListener('pause', () => this._updatePlayIcon(false));
      this.video.addEventListener('error', () => {
        if (this.isOpen() && this.video.src) {
          console.warn('Playback error:', this.video.error);
          if (global.showToast) {
            global.showToast('Playback error. Ensure video format is supported (MP4 / WebM).', 'error');
          }
        }
      });

      // Scrubber click/drag
      this.scrubber.addEventListener('click', (e) => this._onScrub(e));

      // Volume
      if (this.volumeSlider) {
        this.volumeSlider.addEventListener('input', (e) => {
          this.video.volume = parseFloat(e.target.value);
        });
      }

      // Speed
      if (this.speedSelect) {
        this.speedSelect.addEventListener('change', (e) => {
          this.video.playbackRate = parseFloat(e.target.value);
        });
      }

      // Subtitle track file loader
      const subInput = document.getElementById('player-sub-input');
      if (subInput) {
        subInput.addEventListener('change', (e) => this._loadSubtitleFile(e));
      }

      // Keyboard shortcuts
      document.addEventListener('keydown', (e) => {
        if (!this.isOpen()) return;

        if (e.code === 'Space' || e.key === 'k') {
          e.preventDefault();
          this.togglePlay();
        } else if (e.code === 'ArrowRight') {
          e.preventDefault();
          this.video.currentTime = Math.min(this.video.duration, this.video.currentTime + 10);
        } else if (e.code === 'ArrowLeft') {
          e.preventDefault();
          this.video.currentTime = Math.max(0, this.video.currentTime - 10);
        } else if (e.code === 'ArrowUp') {
          e.preventDefault();
          this.video.volume = Math.min(1, this.video.volume + 0.1);
          if (this.volumeSlider) this.volumeSlider.value = this.video.volume;
        } else if (e.code === 'ArrowDown') {
          e.preventDefault();
          this.video.volume = Math.max(0, this.video.volume - 0.1);
          if (this.volumeSlider) this.volumeSlider.value = this.video.volume;
        } else if (e.key === 'f' || e.key === 'F') {
          e.preventDefault();
          this.toggleFullscreen();
        } else if (e.key === 'm' || e.key === 'M') {
          e.preventDefault();
          this.toggleMute();
        } else if (e.key === 'Escape') {
          this.close();
        }
      });
    }

    isOpen() {
      return this.modal && this.modal.classList.contains('open');
    }

    async playFile(file) {
      this.currentFile = file;
      document.getElementById('player-title').textContent = file.original_name || file.name;
      
      // 1. Check if we can get a direct local blob from IndexedDB / memory cache
      let streamUrl = null;
      if (global.api && global.api.getFileBlobUrl) {
        try {
          streamUrl = await global.api.getFileBlobUrl(file.id);
        } catch (e) {
          console.warn('Could not retrieve local blob:', e);
        }
      }

      // 2. Check if file has active blob URL
      if (!streamUrl && file.streamUrl && !file.streamUrl.startsWith('/api')) {
        streamUrl = file.streamUrl;
      }

      // 3. Fallback to server endpoint
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

    togglePlay() {
      if (this.video.paused) {
        this.video.play();
      } else {
        this.video.pause();
      }
    }

    _updatePlayIcon(isPlaying) {
      if (!this.playBtn) return;
      this.playBtn.innerHTML = isPlaying ? Icons.render('pause', 20) : Icons.render('play', 20);
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
        global.api.savePlayPosition(this.currentFile.id, 0).catch(() => {});
      }
    }

    _onScrub(e) {
      const rect = this.scrubber.getBoundingClientRect();
      const clickX = e.clientX - rect.left;
      const width = rect.width;
      const percentage = Math.max(0, Math.min(1, clickX / width));
      if (this.video.duration) {
        this.video.currentTime = percentage * this.video.duration;
      }
    }

    toggleMute() {
      this.video.muted = !this.video.muted;
      const muteBtn = document.getElementById('player-mute-btn');
      if (muteBtn) {
        muteBtn.innerHTML = this.video.muted ? Icons.render('volume-x', 20) : Icons.render('volume-2', 20);
      }
    }

    toggleFullscreen() {
      const container = document.getElementById('player-container');
      if (!document.fullscreenElement) {
        container.requestFullscreen().catch(err => {
          console.error(`Fullscreen request failed: ${err.message}`);
        });
      } else {
        document.exitFullscreen();
      }
    }

    _loadSubtitleFile(e) {
      const file = e.target.files[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = (event) => {
        let vttText = event.target.result;
        // Convert simple srt to vtt if needed
        if (!vttText.startsWith('WEBVTT')) {
          vttText = 'WEBVTT\n\n' + vttText.replace(/(\d{2}:\d{2}:\d{2}),(\d{3})/g, '$1.$2');
        }
        const blob = new Blob([vttText], { type: 'text/vtt' });
        const trackUrl = URL.createObjectURL(blob);

        // Remove existing tracks
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
        global.showToast('Subtitles loaded: ' + file.name, 'success');
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
      if (this.video) {
        this.video.pause();
        if (this.currentFile && this.video.currentTime > 2) {
          localStorage.setItem(`pos_${this.currentFile.id}`, this.video.currentTime);
          global.api.savePlayPosition(this.currentFile.id, this.video.currentTime).catch(() => {});
        }
        this.video.src = '';
      }
      if (this.saveInterval) clearInterval(this.saveInterval);
      if (this.modal) this.modal.classList.remove('open');
      this.currentFile = null;
    }
  }

  global.videoPlayer = new VideoPlayerController();
})(window);
