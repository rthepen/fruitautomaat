/**
 * Audio Engine for Workout Slot Machine
 * Synthesizes arcade effects dynamically via Web Audio API.
 * Prevents main thread stuttering, avoids garbage collection,
 * and allows background music players (e.g. Spotify) to remain active.
 */
class AudioEngine {
  constructor() {
    this.muted = localStorage.getItem('workout_audio_muted') === 'true';
    this.ctx = null;

    // Automatic initialization on first user touch/click interaction
    const initCtx = () => {
      try {
        if (!this.ctx) {
          this.ctx = new (window.AudioContext || window.webkitAudioContext)();
        }
        if (this.ctx.state === 'suspended') {
          this.ctx.resume().catch(() => {});
        }
        
        // Play a short silent buffer to unlock audio on iOS
        const buffer = this.ctx.createBuffer(1, 1, 22050);
        const source = this.ctx.createBufferSource();
        source.buffer = buffer;
        source.connect(this.ctx.destination);
        source.start(0);
        
        // Remove listeners once successfully initialized and unlocked
        window.removeEventListener('click', initCtx, { capture: true });
        window.removeEventListener('touchstart', initCtx, { capture: true });
        console.log("Web Audio API successfully unlocked!");
      } catch (e) {
        console.warn("Failed to initialize or unlock AudioContext:", e);
      }
    };

    window.addEventListener('click', initCtx, { capture: true });
    window.addEventListener('touchstart', initCtx, { capture: true });
  }

  /**
   * Resume context helper to guarantee audio is active on interaction
   */
  resumeContext() {
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
  }

  /**
   * Toggles the global sound effects mute state.
   */
  toggleMute() {
    this.muted = !this.muted;
    localStorage.setItem('workout_audio_muted', this.muted);
    return this.muted;
  }

  /**
   * Synthesize a mechanical click/tick for slot reels rotation
   */
  playSpin() {
    if (this.muted) return;
    this.resumeContext();
    if (!this.ctx) return;

    try {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.connect(gain);
      gain.connect(this.ctx.destination);

      // Brief mechanical-sounding triangle wave click
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(1000, this.ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(100, this.ctx.currentTime + 0.015);

      gain.gain.setValueAtTime(0.08, this.ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.015);

      osc.start(this.ctx.currentTime);
      osc.stop(this.ctx.currentTime + 0.02);
    } catch (e) {
      console.debug("Web Audio playSpin failed:", e);
    }
  }

  /**
   * Synthesize a clean countdown beep (880Hz A5 note)
   */
  playCountdown() {
    if (this.muted) return;
    this.resumeContext();
    if (!this.ctx) return;

    try {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.connect(gain);
      gain.connect(this.ctx.destination);

      osc.type = 'sine';
      osc.frequency.setValueAtTime(880, this.ctx.currentTime);

      gain.gain.setValueAtTime(0.2, this.ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.15);

      osc.start(this.ctx.currentTime);
      osc.stop(this.ctx.currentTime + 0.16);
    } catch (e) {
      console.debug("Web Audio playCountdown failed:", e);
    }
  }

  /**
   * Synthesize a boxing round start buzzer (detuned sawtooth + square)
   */
  playStart() {
    if (this.muted) return;
    this.resumeContext();
    if (!this.ctx) return;

    try {
      const osc1 = this.ctx.createOscillator();
      const osc2 = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc1.connect(gain);
      osc2.connect(gain);
      gain.connect(this.ctx.destination);

      osc1.type = 'sawtooth';
      osc1.frequency.setValueAtTime(150, this.ctx.currentTime);

      osc2.type = 'square';
      osc2.frequency.setValueAtTime(151, this.ctx.currentTime); // slightly detuned for chorus

      gain.gain.setValueAtTime(0.18, this.ctx.currentTime);
      gain.gain.setValueAtTime(0.18, this.ctx.currentTime + 0.4);
      gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.6);

      osc1.start(this.ctx.currentTime);
      osc2.start(this.ctx.currentTime);
      osc1.stop(this.ctx.currentTime + 0.6);
      osc2.stop(this.ctx.currentTime + 0.6);
    } catch (e) {
      console.debug("Web Audio playStart failed:", e);
    }
  }

  /**
   * Synthesize a descending buzzer alarm for end of workout
   */
  playStop() {
    if (this.muted) return;
    this.resumeContext();
    if (!this.ctx) return;

    try {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.connect(gain);
      gain.connect(this.ctx.destination);

      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(400, this.ctx.currentTime);
      osc.frequency.linearRampToValueAtTime(150, this.ctx.currentTime + 0.5);

      gain.gain.setValueAtTime(0.15, this.ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.55);

      osc.start(this.ctx.currentTime);
      osc.stop(this.ctx.currentTime + 0.6);
    } catch (e) {
      console.debug("Web Audio playStop failed:", e);
    }
  }
}

// Export the audio engine instance
window.audioEngine = new AudioEngine();
