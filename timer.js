/**
 * Precise drift-free timer engine for Workout Slot Machine.
 * Uses requestAnimationFrame and performance.now() to prevent drift.
 */
class WorkoutTimer {
  constructor() {
    this.state = 'IDLE'; // 'IDLE', 'COUNTDOWN', 'RUNNING', 'PAUSED', 'FINISHED'
    
    this.duration = 0; // Workout duration in seconds
    this.countdownDuration = 5; // Get ready countdown duration in seconds
    
    this.elapsedTime = 0; // Elapsed time in milliseconds in current state
    this.startTime = null; // Start timestamp (performance.now())
    this.pauseTime = null; // Timestamp when paused
    
    this.animationFrameId = null;
    this.lastSecFired = null; // To ensure callbacks and sounds fire exactly once per second
    
    // Callbacks
    this.onTick = null; // fn(secondsRemaining)
    this.onCountdownTick = null; // fn(secondsRemaining)
    this.onStateChange = null; // fn(newState)
    this.onComplete = null; // fn()
  }

  /**
   * Start the timer sequence (Countdown -> Running -> Finished)
   */
  start(workoutSeconds, callbacks = {}) {
    this.stop(); // Reset existing timer if running

    this.duration = workoutSeconds;
    this.countdownDuration = callbacks.countdownDuration !== undefined ? callbacks.countdownDuration : 5;
    
    this.onTick = callbacks.onTick || null;
    this.onCountdownTick = callbacks.onCountdownTick || null;
    this.onStateChange = callbacks.onStateChange || null;
    this.onComplete = callbacks.onComplete || null;

    this.elapsedTime = 0;
    this.lastSecFired = null;
    
    this.setState(this.countdownDuration > 0 ? 'COUNTDOWN' : 'RUNNING');
    
    this.startTime = performance.now();
    this.tickLoop();
  }

  /**
   * Pause the active timer
   */
  pause() {
    if (this.state !== 'COUNTDOWN' && this.state !== 'RUNNING') return;
    this.pauseTime = performance.now();
    cancelAnimationFrame(this.animationFrameId);
    this.setState('PAUSED');
  }

  /**
   * Resume the paused timer
   */
  resume() {
    if (this.state !== 'PAUSED') return;
    
    // Adjust start time to account for the paused duration
    const pauseDuration = performance.now() - this.pauseTime;
    this.startTime += pauseDuration;
    this.pauseTime = null;
    
    // Determine target state based on where we paused
    const hasRemainingCountdown = (this.countdownDuration * 1000) - this.elapsedTime;
    if (this.countdownDuration > 0 && hasRemainingCountdown > 0) {
      this.setState('COUNTDOWN');
    } else {
      this.setState('RUNNING');
    }

    this.tickLoop();
  }

  /**
   * Stop/Reset the timer completely
   */
  stop() {
    cancelAnimationFrame(this.animationFrameId);
    this.state = 'IDLE';
    this.elapsedTime = 0;
    this.startTime = null;
    this.pauseTime = null;
    this.lastSecFired = null;
  }

  /**
   * Main game loop that checks time difference
   */
  tickLoop() {
    if (this.state === 'PAUSED' || this.state === 'IDLE' || this.state === 'FINISHED') return;

    const now = performance.now();
    this.elapsedTime = now - this.startTime;

    if (this.state === 'COUNTDOWN') {
      const totalCountdownMs = this.countdownDuration * 1000;
      const remainingMs = Math.max(0, totalCountdownMs - this.elapsedTime);
      const remainingSecs = Math.ceil(remainingMs / 1000);

      // Fire tick exactly once per second
      if (this.lastSecFired !== remainingSecs) {
        this.lastSecFired = remainingSecs;
        if (this.onCountdownTick) this.onCountdownTick(remainingSecs);
        
        // Audio tick rule: beep for the last 3, 2, 1 seconds of countdown
        if (remainingSecs <= 3 && remainingSecs > 0) {
          if (window.audioEngine) window.audioEngine.playCountdown();
        }
      }

      if (remainingMs <= 0) {
        // Transition to RUNNING
        this.setState('RUNNING');
        this.startTime = performance.now();
        this.elapsedTime = 0;
        this.lastSecFired = null;
        
        // Play start signal
        if (window.audioEngine) window.audioEngine.playStart();
      }
    } else if (this.state === 'RUNNING') {
      const totalWorkoutMs = this.duration * 1000;
      const remainingMs = Math.max(0, totalWorkoutMs - this.elapsedTime);
      const remainingSecs = Math.ceil(remainingMs / 1000);

      if (this.lastSecFired !== remainingSecs) {
        this.lastSecFired = remainingSecs;
        if (this.onTick) this.onTick(remainingSecs);

        // Audio tick rule: beep for the last 3, 2, 1 seconds of the workout
        if (remainingSecs <= 3 && remainingSecs > 0) {
          if (window.audioEngine) window.audioEngine.playCountdown();
        }
      }

      if (remainingMs <= 0) {
        // Workout Finished
        this.setState('FINISHED');
        cancelAnimationFrame(this.animationFrameId);
        
        // Play stop signal
        if (window.audioEngine) window.audioEngine.playStop();
        
        if (this.onComplete) this.onComplete();
        return;
      }
    }

    this.animationFrameId = requestAnimationFrame(() => this.tickLoop());
  }

  /**
   * Helper to set state and trigger callback
   */
  setState(newState) {
    if (this.state === newState) return;
    this.state = newState;
    if (this.onStateChange) this.onStateChange(newState);
  }

  /**
   * Get progress fraction from 0.0 to 1.0 (for graphics/circle indicator)
   */
  getProgress() {
    if (this.state === 'COUNTDOWN') {
      return this.elapsedTime / (this.countdownDuration * 1000);
    } else if (this.state === 'RUNNING') {
      return this.elapsedTime / (this.duration * 1000);
    } else if (this.state === 'FINISHED') {
      return 1.0;
    }
    return 0.0;
  }
}

// Export timer class to global scope
window.WorkoutTimer = WorkoutTimer;
