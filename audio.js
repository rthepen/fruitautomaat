/**
 * Audio Engine for Workout Slot Machine
 * Synthesizes arcade effects dynamically via Web Audio API,
 * and plays high-energy coach voice cues (Tabataman / Eva) via decoded audio buffers.
 */
class AudioEngine {
  constructor() {
    // Read mute state from cookie
    this.muted = this._getCookie('workout_audio_muted') === 'true';
    // Read volume from cookie (default 200%)
    this.volume = parseFloat(this._getCookie('workout_volume')) || 2.0;
    // Active coach: 'tabataman' (default), 'eva', 'arcade'
    this.coach = this._getCookie('workout_coach') || 'tabataman';
    
    this.ctx = null;
    this.masterGain = null;
    this.audioCache = {}; // url -> AudioBuffer
    this.playlists = {};  // Track randomized playlists

    // Automatic initialization on first user interaction (touch, click, pointer, key)
    const initCtx = () => {
      try {
        this.resumeContext();
        
        // Play a short silent buffer to unlock audio on iOS / Safari
        if (this.ctx) {
          const buffer = this.ctx.createBuffer(1, 1, 22050);
          const source = this.ctx.createBufferSource();
          source.buffer = buffer;
          source.connect(this.masterGain || this.ctx.destination);
          source.start(0);
        }
        
        // Preload current coach sounds
        this.preloadCoach(this.coach);

        ['click', 'touchstart', 'touchend', 'pointerdown', 'keydown'].forEach(evt => {
          window.removeEventListener(evt, initCtx, { capture: true });
        });
      } catch (e) {
        console.warn("Failed to initialize AudioContext:", e);
      }
    };

    ['click', 'touchstart', 'touchend', 'pointerdown', 'keydown'].forEach(evt => {
      window.addEventListener(evt, initCtx, { capture: true });
    });

    // Start preloading immediately
    setTimeout(() => {
      this.preloadCoach(this.coach);
    }, 500);
  }

  /** Cookie helpers */
  _getCookie(name) {
    const match = document.cookie.match(new RegExp('(?:^|; )' + name + '=([^;]*)'));
    return match ? decodeURIComponent(match[1]) : null;
  }
  _setCookie(name, value) {
    const expires = new Date(Date.now() + 365 * 864e5).toUTCString();
    document.cookie = `${name}=${encodeURIComponent(value)}; expires=${expires}; path=/; SameSite=Lax`;
  }

  /** Set active coach (tabataman, eva, arcade) */
  setCoach(coachId) {
    this.coach = coachId || 'tabataman';
    this._setCookie('workout_coach', this.coach);
    if (this.coach !== 'arcade') {
      this.preloadCoach(this.coach);
    }
  }

  /** Set master volume (0–3.0 = 0–300%) */
  setVolume(fraction) {
    this.volume = Math.max(0, Math.min(3.0, fraction));
    this._setCookie('workout_volume', this.volume);
    if (this.masterGain && !this.muted) {
      this.masterGain.gain.value = this.volume;
    }
  }

  /** Resume context helper - ensures AudioContext exists and is running */
  resumeContext() {
    try {
      if (!this.ctx) {
        this.ctx = new (window.AudioContext || window.webkitAudioContext)();
        this.masterGain = this.ctx.createGain();
        this.masterGain.gain.value = this.muted ? 0 : this.volume;
        this.masterGain.connect(this.ctx.destination);
      }
      if (this.ctx && this.ctx.state === 'suspended') {
        this.ctx.resume().catch(() => {});
      }
    } catch (e) {}
  }

  /** Toggle sound effects mute state */
  toggleMute() {
    this.resumeContext();
    this.muted = !this.muted;
    this._setCookie('workout_audio_muted', this.muted);
    if (this.masterGain) {
      this.masterGain.gain.value = this.muted ? 0 : this.volume;
    }
    return this.muted;
  }

  /**
   * Preload coach voice audio buffers into memory
   */
  preloadCoach(coachId) {
    if (!coachId || coachId === 'arcade') return;
    const files = [
      'finish_1.mp3',
      'prep_countdown_1.mp3',
      'prep_intro_1.mp3',
      'rest_switch_start_1.mp3',
      'work_start_1.mp3',
      'work_start_2.mp3',
      'work_start_3.mp3',
      'work_start_4.mp3',
      'work_start_lastround.mp3',
      'work_halfway_1.mp3',
      'work_30s_1.mp3',
      'work_10s_1.mp3'
    ];

    files.forEach(file => {
      const url = `coaches/${coachId}/${file}`;
      if (!this.audioCache[url]) {
        fetch(url)
          .then(res => {
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            return res.arrayBuffer();
          })
          .then(ab => {
            if (!this.ctx) {
              this.ctx = new (window.AudioContext || window.webkitAudioContext)();
              this.masterGain = this.ctx.createGain();
              this.masterGain.gain.value = this.muted ? 0 : this.volume;
              this.masterGain.connect(this.ctx.destination);
            }
            return this.ctx.decodeAudioData(ab);
          })
          .then(buffer => {
            if (buffer) this.audioCache[url] = buffer;
          })
          .catch(() => {});
      }
    });
  }

  /**
   * Play a specific coach MP3 audio file directly by filename
   */
  async playCoachDirect(fileName) {
    if (this.muted || this.coach === 'arcade') return false;
    this.resumeContext();
    if (!this.ctx) return false;

    const url = `coaches/${this.coach}/${fileName}`;
    try {
      let buffer = this.audioCache[url];
      if (!buffer) {
        const res = await fetch(url);
        if (!res.ok) throw new Error("Not found");
        const ab = await res.arrayBuffer();
        buffer = await this.ctx.decodeAudioData(ab);
        this.audioCache[url] = buffer;
      }

      if (buffer) {
        const source = this.ctx.createBufferSource();
        source.buffer = buffer;
        source.connect(this.masterGain || this.ctx.destination);
        source.start(0);
        return true;
      }
    } catch (e) {}
    return false;
  }

  /**
   * Play a coach MP3 audio file with randomized variants
   */
  async playCoachSound(key, variantCount = 1) {
    if (this.muted || this.coach === 'arcade') return false;
    this.resumeContext();
    if (!this.ctx) return false;

    let variant = 1;
    if (variantCount > 1) {
      if (!this.playlists[key] || this.playlists[key].length === 0) {
        const arr = Array.from({ length: variantCount }, (_, i) => i + 1);
        for (let i = arr.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [arr[i], arr[j]] = [arr[j], arr[i]];
        }
        this.playlists[key] = arr;
      }
      variant = this.playlists[key].pop();
    }

    const url = `coaches/${this.coach}/${key}_${variant}.mp3`;

    try {
      let buffer = this.audioCache[url];
      if (!buffer) {
        const res = await fetch(url);
        if (!res.ok) throw new Error("Not found");
        const ab = await res.arrayBuffer();
        buffer = await this.ctx.decodeAudioData(ab);
        this.audioCache[url] = buffer;
      }

      if (buffer) {
        const source = this.ctx.createBufferSource();
        source.buffer = buffer;
        source.connect(this.masterGain || this.ctx.destination);
        source.start(0);
        return true;
      }
    } catch (e) {}
    return false;
  }

  /**
   * Prep intro voice cue ("Get ready!" / "Maak je klaar!")
   */
  async playPrepIntro() {
    if (this.muted || this.coach === 'arcade') return false;
    this.resumeContext();
    return await this.playCoachSound('prep_intro', 1);
  }

  /**
   * Slot spin tick (WebAudio synthesized)
   */
  playSpin() {
    if (this.muted) return;
    this.resumeContext();
    if (!this.ctx) return;

    try {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.connect(gain);
      gain.connect(this.masterGain || this.ctx.destination);

      osc.type = 'triangle';
      osc.frequency.setValueAtTime(1000, this.ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(100, this.ctx.currentTime + 0.015);

      gain.gain.setValueAtTime(0.08, this.ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.015);

      osc.start(this.ctx.currentTime);
      osc.stop(this.ctx.currentTime + 0.02);
    } catch (e) {}
  }

  /**
   * Countdown tick / voice
   */
  async playCountdown(seconds) {
    if (this.muted) return;
    this.resumeContext();

    if (seconds === 3 && this.coach !== 'arcade') {
      const played = await this.playCoachSound('prep_countdown', 1);
      if (played) return;
    }

    // Synthesized clean beep
    if (!this.ctx) return;
    try {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.connect(gain);
      gain.connect(this.masterGain || this.ctx.destination);

      osc.type = 'sine';
      osc.frequency.setValueAtTime(seconds === 1 ? 950 : 880, this.ctx.currentTime);

      gain.gain.setValueAtTime(0.25, this.ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.18);

      osc.start(this.ctx.currentTime);
      osc.stop(this.ctx.currentTime + 0.2);
    } catch (e) {}
  }

  /**
   * Start of workout (or last round start)
   */
  async playStart(isLastRound = false) {
    if (this.muted) return;
    this.resumeContext();

    if (this.coach !== 'arcade') {
      if (isLastRound) {
        const playedLast = await this.playCoachDirect('work_start_lastround.mp3');
        if (playedLast) return;
      }
      const played = await this.playCoachSound('work_start', 4);
      if (played) return;
    }

    // Synthesized buzzer fallback
    if (!this.ctx) return;
    try {
      const osc1 = this.ctx.createOscillator();
      const osc2 = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc1.connect(gain);
      osc2.connect(gain);
      gain.connect(this.masterGain || this.ctx.destination);

      osc1.type = 'sawtooth';
      osc1.frequency.setValueAtTime(150, this.ctx.currentTime);

      osc2.type = 'square';
      osc2.frequency.setValueAtTime(151, this.ctx.currentTime);

      gain.gain.setValueAtTime(0.2, this.ctx.currentTime);
      gain.gain.setValueAtTime(0.2, this.ctx.currentTime + 0.4);
      gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.6);

      osc1.start(this.ctx.currentTime);
      osc2.start(this.ctx.currentTime);
      osc1.stop(this.ctx.currentTime + 0.6);
      osc2.stop(this.ctx.currentTime + 0.6);
    } catch (e) {}
  }

  /**
   * Halfway cue ("Halverwege!")
   */
  async playHalfway() {
    if (this.muted || this.coach === 'arcade') return;
    await this.playCoachSound('work_halfway', 1);
  }

  /**
   * 30 seconds left cue ("Nog 30 seconden!")
   */
  async play30s() {
    if (this.muted || this.coach === 'arcade') return;
    await this.playCoachSound('work_30s', 1);
  }

  /**
   * 10 seconds left cue ("Nog 10 seconden!")
   */
  async play10s() {
    if (this.muted || this.coach === 'arcade') return;
    await this.playCoachSound('work_10s', 1);
  }

  /**
   * Switch / Rest cue between exercises ("Wissel!")
   */
  async playSwitch() {
    if (this.muted) return;
    this.resumeContext();

    if (this.coach !== 'arcade') {
      const played = await this.playCoachSound('rest_switch_start', 1);
      if (played) return;
    }

    // Synthesized chime fallback
    if (!this.ctx) return;
    try {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.connect(gain);
      gain.connect(this.masterGain || this.ctx.destination);

      osc.type = 'sine';
      osc.frequency.setValueAtTime(587.33, this.ctx.currentTime); // D5
      osc.frequency.setValueAtTime(880, this.ctx.currentTime + 0.12); // A5

      gain.gain.setValueAtTime(0.2, this.ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.35);

      osc.start(this.ctx.currentTime);
      osc.stop(this.ctx.currentTime + 0.4);
    } catch (e) {}
  }

  /**
   * Workout finish cue ("Lekker gewerkt / training voltooid!")
   */
  async playFinish() {
    if (this.muted) return;
    this.resumeContext();

    if (this.coach !== 'arcade') {
      const played = await this.playCoachSound('finish', 1);
      if (played) return;
    }

    this.playStop();
  }

  /**
   * Stop / pause buzzer
   */
  playStop() {
    if (this.muted) return;
    this.resumeContext();
    if (!this.ctx) return;

    try {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.connect(gain);
      gain.connect(this.masterGain || this.ctx.destination);

      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(400, this.ctx.currentTime);
      osc.frequency.linearRampToValueAtTime(150, this.ctx.currentTime + 0.5);

      gain.gain.setValueAtTime(0.18, this.ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.55);

      osc.start(this.ctx.currentTime);
      osc.stop(this.ctx.currentTime + 0.6);
    } catch (e) {}
  }
}

// Export the audio engine instance
window.audioEngine = new AudioEngine();
