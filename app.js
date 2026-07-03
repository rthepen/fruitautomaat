/**
 * Workout Slot Machine - Main Controller (app.js)
 * Coordinates data loading, state transitions, event handling, and admin panel interactions.
 */

// Database list
const DATABASE_FILES = [
  "ab_wheel.json", "agility_ladder.json", "barbell.json", "battle_rope.json",
  "bodyweight.json", "bosu_ball.json", "cardio_equipment.json", "core_sliders.json",
  "deadball.json", "dumbbells.json", "jump_rope.json", "kettlebell.json",
  "medicine_ball.json", "monkey_bars.json", "parallettes.json", "partner.json",
  "pionnen.json", "plyo_box.json", "resistance_band.json", "sandbag.json",
  "spinningfiets.json", "sprint_track.json", "standing_punching_bag.json",
  "tractor_tyre.json", "trx___suspension.json"
];

class WorkoutApp {
  constructor() {
    // App State
    this.database = {}; // material_name -> Array of exercises
    this.disabledExerciseIds = new Set();
    this.tempDisabledExerciseIds = new Set(); // Temporary set for uncommitted settings changes
    this.minTime = 30;
    this.maxTime = 120;
    this.countdownTime = 10; // Get ready countdown time (customizable)
    this.classEndTime = ''; // 'HH:MM' string
    this.volume = 2.0;     // 0–3.0 (200% default)
    this.autoPlay = false;  // Auto-spin until class ends
    
    // Active selection
    this.activeMaterial = null;
    this.activeExercise = null;
    this.activeTime = 0;
    
    // Components
    this.slotMachine = null;
    this.timer = null;
    
    // Video audio state
    this.videoMuted = true;
    
    // Elements Cache
    this.elements = {};
    
    // Clock ticker interval
    this._clockInterval = null;
  }

  /**
   * Application Initialization
   */
  async init() {
    this.cacheElements();
    this.loadSettings();
    this.bindEvents();
    
    // Initialize components
    this.slotMachine = new SlotMachine([
      this.elements.reel1,
      this.elements.reel2,
      this.elements.reel3
    ]);
    
    this.timer = new WorkoutTimer();

    try {
      this.showLoading(true);
      await this.loadDatabase();
      this.buildAdminTree();
      this.updateReelsPool();
      this.showLoading(false);
      
      // Transition to Idle slot machine view
      this.switchView('idle-view');
    } catch (err) {
      console.error("Failed to initialize database:", err);
      alert("Fout bij inladen workout database. Controleer of de app via een webserver (HTTP) draait.");
    }
  }

  /**
   * Cash DOM elements
   */
  cacheElements() {
    this.elements = {
      // Views
      idleView: document.getElementById('idle-view'),
      countdownView: document.getElementById('countdown-view'),
      activeView: document.getElementById('active-view'),
      finishedView: document.getElementById('finished-view'),
      
      // Reels
      reel1: document.getElementById('reel-viewport-material'),
      reel2: document.getElementById('reel-viewport-exercise'),
      reel3: document.getElementById('reel-viewport-time'),
      
      // Buttons
      spinBtn: document.getElementById('spin-btn'),
      adminOpenBtn: document.getElementById('admin-open-btn'),
      adminCloseBtn: document.getElementById('admin-close-btn'),
      adminSaveBtn: document.getElementById('admin-save-btn'),
      audioToggleBtn: document.getElementById('audio-toggle-btn'),
      
      // Admin Panel
      adminOverlay: document.getElementById('admin-overlay'),
      scrim: document.getElementById('scrim'),
      minTimeInput: document.getElementById('min-time-input'),
      maxTimeInput: document.getElementById('max-time-input'),
      countdownTimeInput: document.getElementById('countdown-time-input'),
      classEndInput: document.getElementById('class-end-input'),
      volumeInput: document.getElementById('volume-input'),
      autoplayInput: document.getElementById('autoplay-input'),
      autoplayStopBtn: document.getElementById('autoplay-stop-btn'),
      databaseTree: document.getElementById('database-tree'),
      searchBar: document.getElementById('search-bar'),
      selectAllBtn: document.getElementById('select-all-btn'),
      deselectAllBtn: document.getElementById('deselect-all-btn'),
      
      // Header clock elements
      headerCurrentTime: document.getElementById('header-current-time'),
      headerClassEnd: document.getElementById('header-class-end'),
      headerRemaining: document.getElementById('header-remaining'),
      
      // Active Workout HUD
      hudExerciseName: document.getElementById('hud-exercise-name'),
      hudMaterialInfo: document.getElementById('hud-material-info'),
      timerDigits: document.getElementById('timer-digits'),
      timerProgressCircle: document.getElementById('timer-progress-circle'),
      workoutVideo: document.getElementById('workout-video'),
      videoFrame: document.getElementById('video-frame'),
      videoFallbackImg: document.getElementById('video-fallback-img'),
      videoSoundToggle: document.getElementById('video-sound-toggle'),
      instructionText: document.getElementById('instruction-text'),
      
      // Workout Controls (Trainer panel)
      btnPause: document.getElementById('btn-pause'),
      btnSkip: document.getElementById('btn-skip'),
      btnReset: document.getElementById('btn-reset'),
      
      // Countdown
      countdownNumber: document.getElementById('countdown-number'),
      countdownExerciseName: document.getElementById('countdown-exercise-name'),
      countdownMaterialInfo: document.getElementById('countdown-material-info'),
      countdownInstructionText: document.getElementById('countdown-instruction-text'),
      
      // Finished
      finishedExercise: document.getElementById('finished-exercise-text')
    };
  }

  /**
   * Bind event listeners
   */
  bindEvents() {
    // Spin Button
    this.elements.spinBtn.addEventListener('click', () => this.handleSpin());
    
    // Admin Toggle
    this.elements.adminOpenBtn.addEventListener('click', () => this.openAdmin(true));
    this.elements.adminCloseBtn.addEventListener('click', () => this.openAdmin(false));
    this.elements.scrim.addEventListener('click', () => this.openAdmin(false));
    
    // Admin Search
    this.elements.searchBar.addEventListener('input', (e) => this.filterAdminTree(e.target.value));
    
    // Select All / Deselect All
    this.elements.selectAllBtn.addEventListener('click', () => this.toggleAllExercises(true));
    this.elements.deselectAllBtn.addEventListener('click', () => this.toggleAllExercises(false));
    
    // Save Admin Config
    this.elements.adminSaveBtn.addEventListener('click', () => {
      this.disabledExerciseIds = new Set(this.tempDisabledExerciseIds);
      this.saveSettings();
      this.updateReelsPool();
      this.openAdmin(false);
    });

    // Auto-play stop button
    this.elements.autoplayStopBtn.addEventListener('click', () => {
      this.autoPlay = false;
      this._setCookie('workout_autoplay', false);
      this.updateAutoPlayUI();
    });

    // Sound effects toggle
    this.elements.audioToggleBtn.addEventListener('click', () => this.toggleUIAudio());

    // Active Workout Controls
    this.elements.btnPause.addEventListener('click', () => this.toggleWorkoutPause());
    this.elements.btnSkip.addEventListener('click', () => this.handleWorkoutSkip());
    this.elements.btnReset.addEventListener('click', () => this.handleWorkoutReset());

    // Video sound control
    this.elements.videoSoundToggle.addEventListener('click', () => this.toggleVideoSound());
    
    // Video loading error boundary
    this.elements.workoutVideo.addEventListener('error', () => {
      console.warn(`Local video file missing: videos/${this.activeExercise.id}.mp4. Displaying fallback image.`);
      this.elements.videoFrame.classList.add('use-fallback');
    });
  }

  /**
   * Load JSON Workout Data
   */
  async loadDatabase() {
    this.database = {};
    const fetchPromises = DATABASE_FILES.map(async (filename) => {
      const response = await fetch(`./workoutdatabase/${filename}`);
      if (!response.ok) {
        throw new Error(`Failed to load ${filename}`);
      }
      const data = await response.json();
      
      // Group exercises by material name
      data.forEach(exercise => {
        // Fallback for missing fields
        const matName = exercise.material_name || "Lichaamsgewicht";
        if (!this.database[matName]) {
          this.database[matName] = [];
        }
        this.database[matName].push(exercise);
      });
    });

    await Promise.all(fetchPromises);
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

  /**
   * Settings management (cookies)
   */
  loadSettings() {
    this.minTime = parseInt(this._getCookie('workout_min_time')) || 30;
    this.maxTime = parseInt(this._getCookie('workout_max_time')) || 120;
    this.countdownTime = parseInt(this._getCookie('workout_countdown_time')) || 10;
    this.classEndTime = this._getCookie('workout_class_end') || '';
    this.volume = parseFloat(this._getCookie('workout_volume')) || 2.0;
    this.autoPlay = this._getCookie('workout_autoplay') === 'true';
    
    this.elements.minTimeInput.value = this.minTime;
    this.elements.maxTimeInput.value = this.maxTime;
    this.elements.countdownTimeInput.value = this.countdownTime;
    this.elements.classEndInput.value = this.classEndTime;
    this.elements.volumeInput.value = Math.round(this.volume * 100);
    this.elements.autoplayInput.checked = this.autoPlay;

    // Disabled exercises
    const savedDisabled = this._getCookie('workout_disabled_exercises');
    if (savedDisabled) {
      try {
        this.disabledExerciseIds = new Set(JSON.parse(savedDisabled));
      } catch (e) {
        this.disabledExerciseIds = new Set();
      }
    } else {
      this.disabledExerciseIds = new Set();
    }

    // Audio status sync
    this.updateAudioButtonUI();
    // Start the live header clock
    this.startClassClock();
    // Update auto-play button visibility
    this.updateAutoPlayUI();
  }

  saveSettings() {
    let min = parseInt(this.elements.minTimeInput.value) || 30;
    let max = parseInt(this.elements.maxTimeInput.value) || 120;
    let countdown = parseInt(this.elements.countdownTimeInput.value) || 10;
    let classEnd = this.elements.classEndInput.value || '';
    let vol = parseInt(this.elements.volumeInput.value) || 200;
    let autoPlay = this.elements.autoplayInput.checked;

    if (min < 10) min = 10;
    if (max < min) max = min;
    if (countdown < 1) countdown = 1;
    if (countdown > 60) countdown = 60;
    if (vol < 0) vol = 0;
    if (vol > 300) vol = 300;

    this.minTime = min;
    this.maxTime = max;
    this.countdownTime = countdown;
    this.classEndTime = classEnd;
    this.volume = vol / 100;
    this.autoPlay = autoPlay;

    this._setCookie('workout_min_time', this.minTime);
    this._setCookie('workout_max_time', this.maxTime);
    this._setCookie('workout_countdown_time', this.countdownTime);
    this._setCookie('workout_class_end', this.classEndTime);
    this._setCookie('workout_volume', this.volume);
    this._setCookie('workout_autoplay', this.autoPlay);

    // Apply volume to audio engine
    if (window.audioEngine) {
      window.audioEngine.setVolume(this.volume);
    }

    // Save disabled exercises
    this._setCookie('workout_disabled_exercises', JSON.stringify(Array.from(this.disabledExerciseIds)));

    // Update clock with new end time
    this.startClassClock();
    // Update auto-play UI
    this.updateAutoPlayUI();
  }

  /**
   * Update the auto-play stop button visibility
   */
  updateAutoPlayUI() {
    const btn = this.elements.autoplayStopBtn;
    if (!btn) return;
    if (this.autoPlay) {
      btn.style.display = '';
      btn.innerHTML = '⏹ AUTO AAN';
    } else {
      btn.style.display = 'none';
    }
  }

  /**
   * Check if class end time has passed or is not set
   */
  _classIsOver() {
    if (!this.classEndTime) return false;
    const [h, m] = this.classEndTime.split(':').map(Number);
    const now = new Date();
    const end = new Date(now);
    end.setHours(h, m, 0, 0);
    return now >= end;
  }

  /**
   * Starts the live header clock and class-end countdown ticker
   */
  startClassClock() {
    if (this._clockInterval) clearInterval(this._clockInterval);
    const tick = () => {
      const now = new Date();
      const hh = String(now.getHours()).padStart(2, '0');
      const mm = String(now.getMinutes()).padStart(2, '0');
      const ss = String(now.getSeconds()).padStart(2, '0');
      if (this.elements.headerCurrentTime) {
        this.elements.headerCurrentTime.textContent = `${hh}:${mm}:${ss}`;
      }
      
      if (this.classEndTime && this.elements.headerClassEnd) {
        const [endH, endM] = this.classEndTime.split(':').map(Number);
        this.elements.headerClassEnd.textContent = `LES EINDIGT: ${String(endH).padStart(2,'0')}:${String(endM).padStart(2,'0')}`;
        this.elements.headerClassEnd.style.display = '';
        
        const endDate = new Date(now);
        endDate.setHours(endH, endM, 0, 0);
        let diffMs = endDate - now;
        
        if (this.elements.headerRemaining) {
          if (diffMs <= 0) {
            this.elements.headerRemaining.textContent = 'LES VOORBIJ';
            this.elements.headerRemaining.className = 'header-clock-remaining ended';
          } else {
            const totalSec = Math.floor(diffMs / 1000);
            const rh = Math.floor(totalSec / 3600);
            const rm = Math.floor((totalSec % 3600) / 60);
            const rs = totalSec % 60;
            const parts = [];
            if (rh > 0) parts.push(`${rh}u`);
            parts.push(`${String(rm).padStart(2,'0')}m`);
            parts.push(`${String(rs).padStart(2,'0')}s`);
            this.elements.headerRemaining.textContent = parts.join(' ');
            this.elements.headerRemaining.className = totalSec < 300
              ? 'header-clock-remaining urgent'
              : 'header-clock-remaining';
          }
        }
      } else {
        if (this.elements.headerClassEnd) this.elements.headerClassEnd.style.display = 'none';
        if (this.elements.headerRemaining) this.elements.headerRemaining.textContent = '';
      }
    };
    tick();
    this._clockInterval = setInterval(tick, 1000);
  }

  /**
   * Toggles sound effects muting
   */
  toggleUIAudio() {
    if (window.audioEngine) {
      const isMuted = window.audioEngine.toggleMute();
      this.updateAudioButtonUI();
    }
  }

  updateAudioButtonUI() {
    if (!window.audioEngine) return;
    const isMuted = window.audioEngine.muted;
    this.elements.audioToggleBtn.innerHTML = isMuted ? 
      '<span class="btn-icon-symbol">🔇</span>' : 
      '<span class="btn-icon-symbol">🔊</span>';
    
    if (isMuted) {
      this.elements.audioToggleBtn.classList.remove('btn-cyan');
      this.elements.audioToggleBtn.classList.add('btn-pink');
    } else {
      this.elements.audioToggleBtn.classList.remove('btn-pink');
      this.elements.audioToggleBtn.classList.add('btn-cyan');
    }
  }

  /**
   * Admin Panel Tree Construction
   */
  buildAdminTree() {
    const treeContainer = this.elements.databaseTree;
    treeContainer.innerHTML = '';

    // Sort materials alphabetically
    const sortedMaterials = Object.keys(this.database).sort();

    sortedMaterials.forEach((materialName) => {
      const exercises = this.database[materialName];
      
      const node = document.createElement('div');
      node.className = 'material-node';
      node.dataset.material = materialName;

      // Calculate state of material checkbox based on active exercises in temporary set
      const exercisesIds = exercises.map(ex => ex.id);
      const disabledCount = exercisesIds.filter(id => this.tempDisabledExerciseIds.has(id)).length;
      
      let checkboxClass = 'checkbox-custom checked';
      if (disabledCount === exercisesIds.length) {
        checkboxClass = 'checkbox-custom';
      } else if (disabledCount > 0) {
        checkboxClass = 'checkbox-custom indeterminate';
      }

      // Material Row
      const row = document.createElement('div');
      row.className = 'material-row';
      row.innerHTML = `
        <span class="toggle-arrow">▶</span>
        <span class="${checkboxClass}" data-type="material"></span>
        <span class="node-label">${materialName}</span>
        <span class="node-count">(${exercises.length - disabledCount}/${exercises.length})</span>
      `;

      // Branch containing exercise checkbox nodes
      const branch = document.createElement('div');
      branch.className = 'exercises-branch';

      exercises.forEach((exercise) => {
        const exRow = document.createElement('div');
        exRow.className = 'exercise-row';
        
        const isChecked = !this.tempDisabledExerciseIds.has(exercise.id);
        const checkClass = isChecked ? 'checkbox-custom checked' : 'checkbox-custom';

        exRow.innerHTML = `
          <span class="${checkClass}" data-type="exercise" data-id="${exercise.id}"></span>
          <span class="exercise-label">${exercise.exercise_name}</span>
        `;
        
        // Exercise click listener
        const exCheckbox = exRow.querySelector('.checkbox-custom');
        const toggleExercise = () => {
          const enabled = !exCheckbox.classList.contains('checked');
          if (enabled) {
            exCheckbox.classList.add('checked');
            this.tempDisabledExerciseIds.delete(exercise.id);
          } else {
            exCheckbox.classList.remove('checked');
            this.tempDisabledExerciseIds.add(exercise.id);
          }
          this.updateMaterialParentState(materialName);
        };
        
        exRow.querySelector('.exercise-label').addEventListener('click', toggleExercise);
        exCheckbox.addEventListener('click', toggleExercise);

        branch.appendChild(exRow);
      });

      // Split up arrow click (collapse/expand) and text/checkbox click (toggle selection)
      const arrowSpan = row.querySelector('.toggle-arrow');
      const matCheckbox = row.querySelector('.checkbox-custom');
      const labelSpan = row.querySelector('.node-label');
      const countSpan = row.querySelector('.node-count');

      // Expand/Collapse material node on arrow click
      arrowSpan.addEventListener('click', () => {
        const isExpanded = branch.classList.toggle('expanded');
        arrowSpan.classList.toggle('expanded', isExpanded);
      });

      // Checkbox, label and count clicks will toggle the material group selection
      const toggleMaterial = () => {
        const checkState = matCheckbox.classList.contains('checked');
        const indeterminateState = matCheckbox.classList.contains('indeterminate');
        
        // If checked or indeterminate, clicking unchecks everything. Otherwise checks everything.
        const shouldCheck = !(checkState || indeterminateState);
        
        exercises.forEach(ex => {
          if (shouldCheck) {
            this.tempDisabledExerciseIds.delete(ex.id);
          } else {
            this.tempDisabledExerciseIds.add(ex.id);
          }
        });

        // Sync visual exercise nodes in branch
        branch.querySelectorAll('.checkbox-custom[data-type="exercise"]').forEach(cb => {
          cb.classList.toggle('checked', shouldCheck);
        });

        this.updateMaterialParentState(materialName);
      };

      matCheckbox.addEventListener('click', toggleMaterial);
      labelSpan.addEventListener('click', toggleMaterial);
      countSpan.addEventListener('click', toggleMaterial);

      node.appendChild(row);
      node.appendChild(branch);
      treeContainer.appendChild(node);
    });
  }

  /**
   * Helper to recalculate parent material node checkbox state
   */
  updateMaterialParentState(materialName) {
    const node = this.elements.databaseTree.querySelector(`.material-node[data-material="${CSS.escape(materialName)}"]`);
    if (!node) return;

    const exercises = this.database[materialName];
    const exercisesIds = exercises.map(ex => ex.id);
    const disabledCount = exercisesIds.filter(id => this.tempDisabledExerciseIds.has(id)).length;
    
    const matCheckbox = node.querySelector('.material-row .checkbox-custom');
    const countSpan = node.querySelector('.material-row .node-count');

    // Reset classes
    matCheckbox.className = 'checkbox-custom';

    if (disabledCount === 0) {
      matCheckbox.classList.add('checked');
    } else if (disabledCount < exercisesIds.length) {
      matCheckbox.classList.add('indeterminate');
    }

    countSpan.textContent = `(${exercises.length - disabledCount}/${exercises.length})`;
  }

  /**
   * Admin search filtering
   */
  filterAdminTree(query) {
    const cleanQuery = query.toLowerCase().trim();
    const nodes = this.elements.databaseTree.querySelectorAll('.material-node');

    nodes.forEach(node => {
      const materialName = node.dataset.material.toLowerCase();
      const exercises = node.querySelectorAll('.exercise-row');
      
      let materialMatches = materialName.includes(cleanQuery);
      let exercisesMatchesCount = 0;

      exercises.forEach(exRow => {
        const exName = exRow.querySelector('.exercise-label').textContent.toLowerCase();
        const matches = exName.includes(cleanQuery) || materialMatches;
        exRow.style.display = matches ? 'flex' : 'none';
        if (matches) exercisesMatchesCount++;
      });

      // Show/Hide whole material block
      const hasVisibleContent = materialMatches || exercisesMatchesCount > 0;
      node.style.display = hasVisibleContent ? 'block' : 'none';

      // Auto-expand if searching
      const branch = node.querySelector('.exercises-branch');
      const arrow = node.querySelector('.toggle-arrow');
      if (cleanQuery.length > 0 && hasVisibleContent) {
        branch.classList.add('expanded');
        arrow.classList.add('expanded');
      } else if (cleanQuery.length === 0) {
        branch.classList.remove('expanded');
        arrow.classList.remove('expanded');
      }
    });
  }

  /**
   * Bulk Select/Deselect
   */
  toggleAllExercises(shouldEnable) {
    for (const materialName in this.database) {
      this.database[materialName].forEach(ex => {
        if (shouldEnable) {
          this.tempDisabledExerciseIds.delete(ex.id);
        } else {
          this.tempDisabledExerciseIds.add(ex.id);
        }
      });
    }

    // Rebuild tree to update all nodes cleanly
    this.buildAdminTree();
  }

  /**
   * Update active pool inside the Slot reels
   */
  updateReelsPool() {
    // 1. Filter enabled materials & exercises
    const activeMaterials = [];
    const activeExercises = [];

    for (const materialName in this.database) {
      const enabledExs = this.database[materialName].filter(ex => !this.disabledExerciseIds.has(ex.id));
      if (enabledExs.length > 0) {
        activeMaterials.push(materialName);
        activeExercises.push(...enabledExs);
      }
    }

    // 2. Generate time choices in multiples of 10
    const activeTimes = [];
    const minStep = Math.ceil(this.minTime / 10) * 10;
    const maxStep = Math.floor(this.maxTime / 10) * 10;
    
    if (minStep <= maxStep) {
      for (let t = minStep; t <= maxStep; t += 10) {
        activeTimes.push(t);
      }
    } else {
      // Fallback
      const singleChoice = Math.round(this.minTime / 10) * 10;
      activeTimes.push(singleChoice > 0 ? singleChoice : 10);
    }

    // 3. Set into SlotMachine component
    this.slotMachine.setupReels(activeMaterials, activeExercises, activeTimes);
  }

  /**
   * Handle click on SPIN button
   */
  handleSpin() {
    // Gather active pools
    const activeMaterials = [];
    const activeExercisesMap = {}; // material -> exercises

    for (const materialName in this.database) {
      const enabledExs = this.database[materialName].filter(ex => !this.disabledExerciseIds.has(ex.id));
      if (enabledExs.length > 0) {
        activeMaterials.push(materialName);
        activeExercisesMap[materialName] = enabledExs;
      }
    }

    // Validation
    if (activeMaterials.length === 0) {
      alert("Kies tenminste één actieve oefening in de instellingen!");
      this.openAdmin(true);
      return;
    }

    // 1. Choose winning Material
    const chosenMaterial = activeMaterials[Math.floor(Math.random() * activeMaterials.length)];
    
    // 2. Choose winning Exercise for that material
    const exercisesForMaterial = activeExercisesMap[chosenMaterial];
    const chosenExercise = exercisesForMaterial[Math.floor(Math.random() * exercisesForMaterial.length)];
    
    // 3. Choose random time step
    const activeTimes = [];
    const minStep = Math.ceil(this.minTime / 10) * 10;
    const maxStep = Math.floor(this.maxTime / 10) * 10;
    if (minStep <= maxStep) {
      for (let t = minStep; t <= maxStep; t += 10) {
        activeTimes.push(t);
      }
    } else {
      const singleChoice = Math.round(this.minTime / 10) * 10;
      activeTimes.push(singleChoice > 0 ? singleChoice : 10);
    }
    const chosenTime = activeTimes[Math.floor(Math.random() * activeTimes.length)];

    // Cache selection
    this.activeMaterial = chosenMaterial;
    this.activeExercise = chosenExercise;
    this.activeTime = chosenTime;

    // Update UI status
    this.elements.spinBtn.disabled = true;
    this.elements.adminOpenBtn.disabled = true;
    this.elements.reel1.classList.add('active-spin');
    this.elements.reel2.classList.add('active-spin');
    this.elements.reel3.classList.add('active-spin');

    // Run animation
    this.slotMachine.spin(
      chosenMaterial,
      chosenExercise,
      chosenTime,
      () => this.handleSpinComplete()
    );
  }

  /**
   * Slot machine finish hook
   */
  handleSpinComplete() {
    this.elements.reel1.classList.remove('active-spin');
    this.elements.reel2.classList.remove('active-spin');
    this.elements.reel3.classList.remove('active-spin');
    
    // Short celebration delay, then launch countdown
    setTimeout(() => {
      this.startCountdown();
    }, 1500);
  }

  /**
   * Start the countdown phase
   */
  startCountdown() {
    this.switchView('countdown-view');
    
    // Set upcoming exercise info on countdown screen
    this.elements.countdownExerciseName.textContent = this.activeExercise.exercise_name;
    this.elements.countdownMaterialInfo.textContent = this.activeMaterial;
    this.elements.countdownInstructionText.textContent = this.activeExercise.instructions || "Voer de oefening gecontroleerd uit met de juiste techniek.";

    this.elements.countdownNumber.textContent = this.countdownTime;
    this.elements.countdownNumber.classList.remove('pulse');
    void this.elements.countdownNumber.offsetWidth; // trigger reflow
    this.elements.countdownNumber.classList.add('pulse');

    this.timer.start(this.activeTime, {
      countdownDuration: this.countdownTime,
      
      onCountdownTick: (secs) => {
        this.elements.countdownNumber.textContent = secs;
        // Re-trigger visual pulse animation
        this.elements.countdownNumber.classList.remove('pulse');
        void this.elements.countdownNumber.offsetWidth;
        this.elements.countdownNumber.classList.add('pulse');
      },

      onStateChange: (state) => {
        if (state === 'RUNNING') {
          this.startWorkoutHUD();
        }
      },

      onTick: (secs) => {
        this.updateHUDTimer(secs);
      },

      onComplete: () => {
        this.handleWorkoutComplete();
      }
    });
  }

  /**
   * Setup HUD and start playing local video
   */
  startWorkoutHUD() {
    this.switchView('active-view');
    
    // Set text
    this.elements.hudExerciseName.textContent = this.activeExercise.exercise_name;
    this.elements.hudMaterialInfo.textContent = this.activeMaterial;
    
    // Set instructions
    this.elements.instructionText.textContent = this.activeExercise.instructions || "Voer de oefening gecontroleerd uit met de juiste techniek.";
    
    // Setup video elements
    const video = this.elements.workoutVideo;
    this.elements.videoFrame.classList.remove('use-fallback');
    
    // Map video_search_url -> local mp4
    video.src = `videos/${this.activeExercise.id}.mp4`;
    video.muted = this.videoMuted;
    video.currentTime = 0;
    
    // Set video controls UI icon
    this.updateVideoSoundButtonUI();

    // Try playing
    video.play().catch(err => {
      console.warn("Video autoplay failed, waiting for user click.", err);
    });

    // Image fallback preview
    this.elements.videoFallbackImg.src = this.activeExercise.thumbnail || 'https://i.ytimg.com/vi/LcgWDIYgnhg/hqdefault.jpg';

    // Setup circular progress ring
    const circle = this.elements.timerProgressCircle;
    const radius = circle.r.baseVal.value;
    const circumference = 2 * Math.PI * radius;
    circle.style.strokeDasharray = `${circumference} ${circumference}`;
    circle.style.strokeDashoffset = circumference;
    circle.classList.remove('low-time');

    // Reset Play/Pause trainer button
    this.elements.btnPause.innerHTML = '⏸ <span style="margin-left: 5px;">PAUZE</span>';
    this.elements.btnPause.className = 'btn btn-cyan';

    // Initial digits draw
    this.updateHUDTimer(this.activeTime);
  }

  /**
   * Update circular ring progress and digital clock text
   */
  updateHUDTimer(secondsRemaining) {
    this.elements.timerDigits.textContent = secondsRemaining;
    
    // Calculate progress offset
    const circle = this.elements.timerProgressCircle;
    const radius = circle.r.baseVal.value;
    const circumference = 2 * Math.PI * radius;
    const progress = this.timer.getProgress();
    
    const offset = circumference - (progress * circumference);
    circle.style.strokeDashoffset = offset;

    // Visual urgency effect: last 5 seconds glow pink
    if (secondsRemaining <= 5) {
      circle.classList.add('low-time');
    } else {
      circle.classList.remove('low-time');
    }
  }

  /**
   * Toggle video sound muting
   */
  toggleVideoSound() {
    const video = this.elements.workoutVideo;
    this.videoMuted = !this.videoMuted;
    video.muted = this.videoMuted;
    this.updateVideoSoundButtonUI();
  }

  updateVideoSoundButtonUI() {
    this.elements.videoSoundToggle.textContent = this.videoMuted ? '🔇' : '🔊';
  }

  /**
   * Trainer Controls - Pause / Resume
   */
  toggleWorkoutPause() {
    if (this.timer.state === 'RUNNING' || this.timer.state === 'COUNTDOWN') {
      this.timer.pause();
      this.elements.workoutVideo.pause();
      this.elements.btnPause.innerHTML = '▶ <span style="margin-left: 5px;">VERVOLG</span>';
      this.elements.btnPause.className = 'btn btn-pink';
    } else if (this.timer.state === 'PAUSED') {
      this.timer.resume();
      this.elements.workoutVideo.play().catch(() => {});
      this.elements.btnPause.innerHTML = '⏸ <span style="margin-left: 5px;">PAUZE</span>';
      this.elements.btnPause.className = 'btn btn-cyan';
    }
  }

  /**
   * Trainer Controls - Skip
   */
  handleWorkoutSkip() {
    this.timer.stop();
    this.elements.workoutVideo.pause();
    
    // Play stop sound directly on skip
    if (window.audioEngine) window.audioEngine.playStop();
    
    this.handleWorkoutComplete();
  }

  /**
   * Trainer Controls - Reset
   */
  handleWorkoutReset() {
    this.timer.stop();
    this.elements.workoutVideo.pause();
    this.elements.workoutVideo.src = '';
    
    // Reset controls
    this.elements.spinBtn.disabled = false;
    this.elements.adminOpenBtn.disabled = false;
    
    this.switchView('idle-view');
  }

  /**
   * Handle workout complete phase
   */
  handleWorkoutComplete() {
    this.switchView('finished-view');
    
    this.elements.finishedExercise.innerHTML = `Lekker bezig! Oefening <span>${this.activeExercise.exercise_name}</span> is afgerond.`;
    
    // Stop video
    this.elements.workoutVideo.pause();
    this.elements.workoutVideo.src = '';

    // Wait 6 seconds showing finished panel, then transition back (or auto-spin)
    setTimeout(() => {
      if (this.timer.state === 'FINISHED' || this.timer.state === 'IDLE') {
        this.elements.spinBtn.disabled = false;
        this.elements.adminOpenBtn.disabled = false;
        
        // Auto-play: spin again if enabled and class isn't over yet
        if (this.autoPlay && !this._classIsOver()) {
          this.switchView('idle-view');
          // Brief pause on idle screen before spinning again
          setTimeout(() => {
            if (this.autoPlay && !this._classIsOver()) {
              this.handleSpin();
            } else {
              // Class is now over, stay on idle
            }
          }, 1200);
        } else {
          this.switchView('idle-view');
        }
      }
    }, 6000);
  }

  /**
   * Settings menu drawer slider
   */
  openAdmin(isOpen) {
    if (isOpen) {
      // Copy active disabled IDs to temporary set for uncommitted drawer session
      this.tempDisabledExerciseIds = new Set(this.disabledExerciseIds);
      
      // Rebuild to sync any new modifications
      this.buildAdminTree();
      this.elements.searchBar.value = '';
      this.filterAdminTree('');
      
      this.elements.adminOverlay.classList.add('open');
      this.elements.scrim.classList.add('open');
    } else {
      this.elements.adminOverlay.classList.remove('open');
      this.elements.scrim.classList.remove('open');
    }
  }

  /**
   * Switch displays
   */
  switchView(viewId) {
    const views = [
      this.elements.idleView,
      this.elements.countdownView,
      this.elements.activeView,
      this.elements.finishedView
    ];

    views.forEach(view => {
      if (view.id === viewId) {
        view.classList.add('active');
      } else {
        view.classList.remove('active');
      }
    });
  }

  /**
   * Helper loading display
   */
  showLoading(isLoading) {
    // Toggle spin button status during init
    this.elements.spinBtn.disabled = isLoading;
    this.elements.spinBtn.textContent = isLoading ? "LADEN..." : "SPIN";
  }
}

// Instantiate and start app
window.addEventListener('DOMContentLoaded', () => {
  const app = new WorkoutApp();
  window.workoutApp = app; // export to global for debugging/testing
  app.init();
});
