/**
 * Audio Engine for Workout Slot Machine
 * Handles preloading, overlapping playback, and muting of custom MP3 effects.
 */
class AudioEngine {
  constructor() {
    this.muted = localStorage.getItem('workout_audio_muted') === 'true';
    this.sounds = {
      countdown: new Audio('sounds/countdown.mp3'),
      start: new Audio('sounds/start.mp3'),
      stop: new Audio('sounds/stop.mp3')
    };

    // Configure and preload sounds
    this.sounds.countdown.volume = 0.6;
    this.sounds.start.volume = 0.8;
    this.sounds.stop.volume = 0.8;

    for (const key in this.sounds) {
      this.sounds[key].load();
    }

    // High-performance pool for spin ticks to prevent GC and UI rendering lag
    this.spinPool = [];
    this.spinPoolSize = 10;
    this.spinPoolIndex = 0;
    for (let i = 0; i < this.spinPoolSize; i++) {
      const a = new Audio('sounds/spin.mp3');
      a.volume = 0.25;
      a.load();
      this.spinPool.push(a);
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
   * Internal helper to play a preloaded sound, handles overlapping clicks and countdowns.
   */
  playSound(name) {
    if (this.muted) return;
    const sound = this.sounds[name];
    if (sound) {
      try {
        // For countdown beeps, clone to support overlap, start/stop are played once
        if (name === 'countdown') {
          const clone = sound.cloneNode();
          clone.volume = sound.volume;
          clone.play().catch(err => {
            console.debug(`Autoplay restriction or audio playback error for sound [${name}]:`, err);
          });
        } else {
          sound.currentTime = 0;
          sound.play().catch(err => {
            console.debug(`Autoplay restriction or audio playback error for sound [${name}]:`, err);
          });
        }
      } catch (e) {
        console.error(`Error playing sound [${name}]:`, e);
      }
    }
  }

  playSpin() {
    if (this.muted) return;
    try {
      const audio = this.spinPool[this.spinPoolIndex];
      audio.currentTime = 0;
      audio.play().catch(err => {
        console.debug("Autoplay restriction for spin tick:", err);
      });
      this.spinPoolIndex = (this.spinPoolIndex + 1) % this.spinPoolSize;
    } catch (e) {
      console.error("Error playing spin tick:", e);
    }
  }

  playCountdown() {
    this.playSound('countdown');
  }

  playStart() {
    this.playSound('start');
  }

  playStop() {
    this.playSound('stop');
  }
}

// Export the audio engine instance
window.audioEngine = new AudioEngine();
