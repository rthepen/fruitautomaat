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
    this.coach = 'tabataman'; // 'tabataman', 'eva', 'arcade'
    this.noRepeatExercises = true; // Exhaust pool of exercises before repeating (default true)
    this.noRepeatMaterials = true; // Exhaust pool of materials before repeating (default true)
    this.usedExerciseIds = new Set(); // Track used exercises in current cycle
    this.usedMaterials = new Set();   // Track used materials in current cycle
    this.usedHistory = [];            // Chronological array of used exercises in current cycle
    
    // Broken video tracking & Google Sheets logging
    this.brokenVideoExerciseIds = new Set(); // Track exercises with refused/deleted/broken YouTube videos
    this.videoValidationCache = {};          // Cache videoId -> boolean validation results
    this.googleSheetsUrl = 'https://script.google.com/macros/s/AKfycbzjwH5TfLJEinllUn3wYlQE17uno0DdnLoBaG1FmdMeVBUE0wd5-pf07TEoOg6jj2sF/exec';
    this._loggedSheetIds = new Set();        // Prevent duplicate logs in same session
    
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
    window.workoutApp = this;
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
      this.renderUsedHistory();
      this.renderBrokenVideosList();
      this.showLoading(false);
      
      // Transition to Idle slot machine view
      this.switchView('idle');
      this.setStandbyState();
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
      coachSelect: document.getElementById('coach-select'),
      requireVideoInput: document.getElementById('require-video-input'),
      autoplayInput: document.getElementById('autoplay-input'),
      autoplayStopBtn: document.getElementById('autoplay-stop-btn'),
      noRepeatExercisesInput: document.getElementById('no-repeat-exercises-input'),
      noRepeatMaterialsInput: document.getElementById('no-repeat-materials-input'),
      usedHistoryList: document.getElementById('used-history-list'),
      usedHistoryStats: document.getElementById('used-history-stats'),
      resetHistoryBtn: document.getElementById('reset-history-btn'),
      scanVideosBtn: document.getElementById('scan-videos-btn'),
      syncSheetsBtn: document.getElementById('sync-sheets-btn'),
      downloadCsvBtn: document.getElementById('download-csv-btn'),
      resetBrokenVideosBtn: document.getElementById('reset-broken-videos-btn'),
      googleSheetsUrlInput: document.getElementById('google-sheets-url-input'),
      brokenVideosStats: document.getElementById('broken-videos-stats'),
      brokenVideosList: document.getElementById('broken-videos-list'),
      databaseTree: document.getElementById('database-tree'),
      searchBar: document.getElementById('search-bar'),
      selectAllBtn: document.getElementById('select-all-btn'),
      deselectAllBtn: document.getElementById('deselect-all-btn'),
      
      // Header clock elements
      headerCurrentTime: document.getElementById('header-current-time'),
      headerClassEnd: document.getElementById('header-class-end'),
      headerRemaining: document.getElementById('header-remaining'),
      
      // Main element for state class
      appMain: document.getElementById('app-main'),
      finishedOverlay: document.getElementById('finished-overlay'),
      unifiedTimerLabel: document.getElementById('unified-timer-label'),

      // Active Workout HUD
      hudExerciseName: document.getElementById('hud-exercise-name'),
      hudMaterialInfo: document.getElementById('hud-material-info'),
      timerDigits: document.getElementById('timer-digits'),
      timerProgressCircle: document.getElementById('timer-progress-circle'),
      workoutIframe: document.getElementById('workout-video-iframe'),
      videoSlot: document.getElementById('video-slot'),
      videoFallbackImg: document.getElementById('video-fallback-img'),
      instructionText: document.getElementById('instruction-text'),

      // Workout Controls (Trainer panel)
      btnPause: document.getElementById('btn-pause'),
      btnSkip: document.getElementById('btn-skip'),
      btnReset: document.getElementById('btn-reset'),

      // Finished flash overlay
      finishedExercise: document.getElementById('finished-exercise-text'),

      // Grand End-of-Class Celebration Overlay
      classFinishedOverlay: document.getElementById('class-finished-overlay'),
      classStatExercises: document.getElementById('class-stat-exercises'),
      classStatTime: document.getElementById('class-stat-time'),
      classStatMaterials: document.getElementById('class-stat-materials'),
      classFinishedNewBtn: document.getElementById('class-finished-new-btn'),
      classFinishedCloseBtn: document.getElementById('class-finished-close-btn')
    };
  }

  /**
   * Bind event listeners
   */
  bindEvents() {
    // Spin Button
    this.elements.spinBtn.addEventListener('click', () => this.handleSpin());
    
    // Class Finished Modal buttons
    if (this.elements.classFinishedNewBtn) {
      this.elements.classFinishedNewBtn.addEventListener('click', () => this.handleStartNewClass());
    }
    if (this.elements.classFinishedCloseBtn) {
      this.elements.classFinishedCloseBtn.addEventListener('click', () => this.hideClassFinishedModal());
    }
    
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

    // Video requirement toggle
    this.elements.requireVideoInput.addEventListener('change', (e) => {
      this.requireVideo = e.target.checked;
      this.buildAdminTree();
      this.filterAdminTree(this.elements.searchBar.value);
    });

    // Sound effects toggle
    this.elements.audioToggleBtn.addEventListener('click', () => this.toggleUIAudio());

    // Reset Pool History button
    if (this.elements.resetHistoryBtn) {
      this.elements.resetHistoryBtn.addEventListener('click', () => this.resetUsedHistory());
    }

    // Video check, sheets sync, and reset buttons
    if (this.elements.scanVideosBtn) {
      this.elements.scanVideosBtn.addEventListener('click', () => this.scanAllVideos());
    }
    if (this.elements.syncSheetsBtn) {
      this.elements.syncSheetsBtn.addEventListener('click', () => this.syncAllBrokenVideosToSheet());
    }
    if (this.elements.downloadCsvBtn) {
      this.elements.downloadCsvBtn.addEventListener('click', () => this.downloadBrokenVideosCSV());
    }
    if (this.elements.resetBrokenVideosBtn) {
      this.elements.resetBrokenVideosBtn.addEventListener('click', () => this.resetBrokenVideos());
    }

    // Active Workout Controls
    this.elements.btnPause.addEventListener('click', () => this.toggleWorkoutPause());
    this.elements.btnSkip.addEventListener('click', () => this.handleWorkoutSkip());
    this.elements.btnReset.addEventListener('click', () => this.handleWorkoutReset());

    // Window Resize / Orientation Change (e.g. iPhone rotation)
    let resizeTimer;
    window.addEventListener('resize', () => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => {
        if (this.slotMachine) this.slotMachine.realign();
      }, 100);
    });
    window.addEventListener('orientationchange', () => {
      setTimeout(() => {
        if (this.slotMachine) this.slotMachine.realign();
      }, 150);
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

        // Ensure globally unique IDs by prefixing with material name
        const prefix = matName.toLowerCase().replace(/[^a-z0-9]/g, '_') + '_';
        if (!exercise.id.startsWith(prefix)) {
          exercise.id = prefix + exercise.id;
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
    this.coach = this._getCookie('workout_coach') || 'tabataman';
    this.requireVideo = this._getCookie('workout_require_video') !== 'false';
    this.noRepeatExercises = this._getCookie('workout_no_repeat_exercises') !== 'false';
    this.noRepeatMaterials = this._getCookie('workout_no_repeat_materials') !== 'false';
    
    this.elements.minTimeInput.value = this.minTime;
    this.elements.maxTimeInput.value = this.maxTime;
    this.elements.countdownTimeInput.value = this.countdownTime;
    this.elements.classEndInput.value = this.classEndTime;
    this.elements.volumeInput.value = Math.round(this.volume * 100);
    if (this.elements.coachSelect) {
      this.elements.coachSelect.value = this.coach;
    }
    this.elements.autoplayInput.checked = this.autoPlay;
    this.elements.requireVideoInput.checked = this.requireVideo;
    if (this.elements.noRepeatExercisesInput) {
      this.elements.noRepeatExercisesInput.checked = this.noRepeatExercises;
    }
    if (this.elements.noRepeatMaterialsInput) {
      this.elements.noRepeatMaterialsInput.checked = this.noRepeatMaterials;
    }

    if (window.audioEngine) {
      window.audioEngine.setCoach(this.coach);
    }

    // Load used pool history from localStorage
    try {
      const savedHistory = localStorage.getItem('workout_used_history');
      if (savedHistory) {
        this.usedHistory = JSON.parse(savedHistory) || [];
        this.usedExerciseIds = new Set(this.usedHistory.map(h => h.id));
        this.usedMaterials = new Set(this.usedHistory.map(h => h.material));
      }
    } catch (e) {
      this.usedHistory = [];
    }

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

    // Broken videos list from localStorage
    try {
      const savedBroken = localStorage.getItem('workout_broken_videos');
      if (savedBroken) {
        this.brokenVideoExerciseIds = new Set(JSON.parse(savedBroken));
      }
    } catch (e) {
      this.brokenVideoExerciseIds = new Set();
    }

    // Google Sheets Webhook URL
    this.googleSheetsUrl = this._getCookie('workout_google_sheets_url') || localStorage.getItem('workout_google_sheets_url') || this.googleSheetsUrl;
    if (this.elements.googleSheetsUrlInput) {
      this.elements.googleSheetsUrlInput.value = this.googleSheetsUrl;
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
    let coach = this.elements.coachSelect ? this.elements.coachSelect.value : 'tabataman';
    let requireVideo = this.elements.requireVideoInput.checked;
    let noRepeatExercises = this.elements.noRepeatExercisesInput ? this.elements.noRepeatExercisesInput.checked : true;
    let noRepeatMaterials = this.elements.noRepeatMaterialsInput ? this.elements.noRepeatMaterialsInput.checked : true;

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
    this.coach = coach;
    this.requireVideo = requireVideo;
    this.noRepeatExercises = noRepeatExercises;
    this.noRepeatMaterials = noRepeatMaterials;

    this._setCookie('workout_min_time', this.minTime);
    this._setCookie('workout_max_time', this.maxTime);
    this._setCookie('workout_countdown_time', this.countdownTime);
    this._setCookie('workout_class_end', this.classEndTime);
    this._setCookie('workout_volume', this.volume);
    this._setCookie('workout_autoplay', this.autoPlay);
    this._setCookie('workout_coach', this.coach);
    this._setCookie('workout_require_video', this.requireVideo);
    this._setCookie('workout_no_repeat_exercises', this.noRepeatExercises);
    let gUrl = this.elements.googleSheetsUrlInput ? this.elements.googleSheetsUrlInput.value.trim() : this.googleSheetsUrl;
    this.googleSheetsUrl = gUrl;
    this._setCookie('workout_google_sheets_url', this.googleSheetsUrl);
    try {
      localStorage.setItem('workout_google_sheets_url', this.googleSheetsUrl);
    } catch (e) {}

    if (window.audioEngine) {
      window.audioEngine.setCoach(this.coach);
    }

    // Clear tracking if toggled off
    if (!this.noRepeatExercises) {
      this.usedExerciseIds.clear();
    }
    if (!this.noRepeatMaterials) {
      this.usedMaterials.clear();
    }
    this._saveUsedHistory();

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
    // Update used history UI
    this.renderUsedHistory();
  }

  /**
   * Save and render used pool items
   */
  _saveUsedHistory() {
    try {
      localStorage.setItem('workout_used_history', JSON.stringify(this.usedHistory));
    } catch (e) {}
  }

  resetUsedHistory() {
    this.usedExerciseIds.clear();
    this.usedMaterials.clear();
    this.usedHistory = [];
    this._saveUsedHistory();
    this.renderUsedHistory();
  }

  renderUsedHistory() {
    if (!this.elements.usedHistoryList || !this.elements.usedHistoryStats) return;

    // Calculate totals from current enabled pool
    let totalExercises = 0;
    let totalMaterials = 0;
    for (const mat in this.database) {
      const exs = this.database[mat].filter(ex => {
        if (this.disabledExerciseIds.has(ex.id)) return false;
        if (this.requireVideo && !(ex.video_search_url || '').trim()) return false;
        return true;
      });
      if (exs.length > 0) {
        totalMaterials++;
        totalExercises += exs.length;
      }
    }

    // Render Stats Badges
    this.elements.usedHistoryStats.innerHTML = `
      <span class="used-history-badge">Oefeningen geweest: ${this.usedExerciseIds.size} / ${totalExercises}</span>
      <span class="used-history-badge">Materialen geweest: ${this.usedMaterials.size} / ${totalMaterials}</span>
    `;

    // Render History List
    if (this.usedHistory.length === 0) {
      this.elements.usedHistoryList.innerHTML = `
        <div class="used-history-empty">Nog geen oefeningen geweest in deze ronde (alles zit in de pool).</div>
      `;
    } else {
      const itemsHtml = [...this.usedHistory].reverse().map((item, idx) => `
        <div class="used-history-item">
          <div class="used-history-item-left">
            <span class="used-history-item-name">${item.name}</span>
            <span class="used-history-item-material">${item.material}${item.timestamp ? ' • ' + item.timestamp : ''}</span>
          </div>
          <span class="used-history-item-time">${item.time}s</span>
        </div>
      `).join('');
      this.elements.usedHistoryList.innerHTML = itemsHtml;
    }
  }

  /**
   * Robust YouTube ID extractor from any URL format
   */
  _extractYouTubeId(url) {
    if (!url || typeof url !== 'string') return '';
    const trimmed = url.trim();
    const regExp = /(?:youtube(?:-nocookie)?\.com\/(?:[^\/\n\s]+\/\S+\/|(?:v|e(?:mbed)?)\/|\S*?[?&]v=)|youtu\.be\/)([a-zA-Z0-9_-]{11})/;
    const match = trimmed.match(regExp);
    return match ? match[1] : '';
  }

  /**
   * Helper to check if an exercise has a valid working YouTube video
   */
  _hasValidWorkingVideo(ex) {
    if (!ex) return false;
    const url = (ex.video_search_url || '').trim();
    if (!url) return false;
    if (this.brokenVideoExerciseIds.has(ex.id)) return false;
    const vId = this._extractYouTubeId(url);
    return !!vId;
  }

  /**
   * Asynchronously validate whether a YouTube video ID actually exists & is reachable
   */
  validateYouTubeVideo(videoId) {
    if (!videoId || videoId.length !== 11) return Promise.resolve(false);
    if (this.videoValidationCache[videoId] !== undefined) {
      return Promise.resolve(this.videoValidationCache[videoId]);
    }

    return new Promise((resolve) => {
      let settled = false;
      const img = new Image();
      const timer = setTimeout(() => {
        if (!settled) {
          settled = true;
          this.videoValidationCache[videoId] = true; // graceful fallback on timeout
          resolve(true);
        }
      }, 2500);

      img.onload = () => {
        if (!settled) {
          settled = true;
          clearTimeout(timer);
          // YouTube returns 120x90 image for deleted/private videos, or 320x180 for valid videos
          const isValid = img.naturalWidth && img.naturalWidth > 120;
          this.videoValidationCache[videoId] = isValid;
          resolve(isValid);
        }
      };

      img.onerror = () => {
        if (!settled) {
          settled = true;
          clearTimeout(timer);
          this.videoValidationCache[videoId] = false;
          resolve(false);
        }
      };

      img.src = `https://img.youtube.com/vi/${videoId}/mqdefault.jpg`;
    });
  }

  /**
   * Save broken videos list to localStorage
   */
  _saveBrokenVideos() {
    try {
      localStorage.setItem('workout_broken_videos', JSON.stringify(Array.from(this.brokenVideoExerciseIds)));
    } catch (e) {}
    this.renderBrokenVideosList();
  }

  /**
   * Clear broken videos list
   */
  resetBrokenVideos() {
    this.brokenVideoExerciseIds.clear();
    this.videoValidationCache = {};
    this._saveBrokenVideos();
    this.buildAdminTree();
    this.updateReelsPool();
  }

  /**
   * Scan entire database for broken/refused YouTube videos
   */
  async scanAllVideos() {
    if (!this.elements.scanVideosBtn) return;
    this.elements.scanVideosBtn.disabled = true;
    this.elements.scanVideosBtn.textContent = "⏳ Scannen...";

    const allExercises = [];
    for (const mat in this.database) {
      for (const ex of this.database[mat]) {
        if (ex.video_search_url && ex.video_search_url.trim()) {
          allExercises.push(ex);
        }
      }
    }

    let checked = 0;
    for (const ex of allExercises) {
      const vId = this._extractYouTubeId(ex.video_search_url);
      if (!vId) {
        this.brokenVideoExerciseIds.add(ex.id);
        this.logBrokenVideoToGoogleSheet(ex, 'Geen geldig YouTube ID');
      } else {
        const isValid = await this.validateYouTubeVideo(vId);
        if (!isValid) {
          this.brokenVideoExerciseIds.add(ex.id);
          this.logBrokenVideoToGoogleSheet(ex, 'Verbinding geweigerd / onbereikbaar');
        } else {
          this.brokenVideoExerciseIds.delete(ex.id);
        }
      }
      checked++;
      if (this.elements.brokenVideosStats) {
        this.elements.brokenVideosStats.innerHTML = `<span class="used-history-badge">Scannen: ${checked} / ${allExercises.length} video's gecontroleerd</span>`;
      }
    }

    this._saveBrokenVideos();
    this.buildAdminTree();
    this.updateReelsPool();

    this.elements.scanVideosBtn.disabled = false;
    this.elements.scanVideosBtn.textContent = "🔍 Scan video's";
  }

  /**
   * Render list of broken videos in admin drawer
   */
  renderBrokenVideosList() {
    if (!this.elements.brokenVideosList || !this.elements.brokenVideosStats) return;

    const brokenExercises = [];
    for (const mat in this.database) {
      for (const ex of this.database[mat]) {
        if (this.brokenVideoExerciseIds.has(ex.id)) {
          brokenExercises.push({ ...ex, material: mat });
        }
      }
    }

    if (brokenExercises.length === 0) {
      this.elements.brokenVideosStats.innerHTML = `
        <span class="used-history-badge" style="background:rgba(57,255,20,0.12); border-color:rgba(57,255,20,0.35); color:#39ff14;">
          ✓ Alle video's werken naar behoren (0 niet-werkend)
        </span>
      `;
      this.elements.brokenVideosList.innerHTML = `
        <div class="used-history-empty">Geen niet-werkende video's gedetecteerd.</div>
      `;
    } else {
      this.elements.brokenVideosStats.innerHTML = `
        <span class="used-history-badge" style="background:rgba(255,0,127,0.15); border-color:rgba(255,0,127,0.4); color:var(--neon-pink);">
          ⚠️ ${brokenExercises.length} niet-werkende video('s) uitgesloten van pool
        </span>
      `;
      const html = brokenExercises.map(ex => `
        <div class="used-history-item">
          <div class="used-history-item-left">
            <span class="used-history-item-name">${ex.exercise_name}</span>
            <span class="used-history-item-material">${ex.material} • Verbinding geweigerd</span>
          </div>
          <button class="btn btn-tiny btn-cyan" onclick="window.workoutApp.recheckVideo('${ex.id}')" title="Opnieuw controleren">
            🔄 Test
          </button>
        </div>
      `).join('');
      this.elements.brokenVideosList.innerHTML = html;
    }
  }

  /**
   * Recheck a single broken video
   */
  async recheckVideo(exerciseId) {
    let targetEx = null;
    for (const mat in this.database) {
      targetEx = this.database[mat].find(e => e.id === exerciseId);
      if (targetEx) break;
    }
    if (!targetEx) return;

    const vId = this._extractYouTubeId(targetEx.video_search_url);
    if (!vId) {
      alert(`Geen geldig YouTube ID gevonden voor ${targetEx.exercise_name}.`);
      return;
    }

    delete this.videoValidationCache[vId];
    const isValid = await this.validateYouTubeVideo(vId);
    if (isValid) {
      this.brokenVideoExerciseIds.delete(exerciseId);
      this._saveBrokenVideos();
      this.buildAdminTree();
      this.updateReelsPool();
      alert(`Video voor "${targetEx.exercise_name}" werkt correct en is weer toegevoegd aan de pool!`);
    } else {
      // Log to Google Sheets
      this.logBrokenVideoToGoogleSheet(targetEx, 'Handmatige test geweigerd');
      alert(`Video voor "${targetEx.exercise_name}" kan nog steeds niet worden geladen (gelogd naar Google Sheet).`);
    }
  }

  /**
   * Log an exercise with a broken video directly to Google Sheets via Webhook
   */
  async logBrokenVideoToGoogleSheet(exercise, reason = 'Verbinding geweigerd / video onbereikbaar') {
    if (!exercise) return;
    const url = (this.googleSheetsUrl || '').trim();
    if (!url) return;

    if (this._loggedSheetIds.has(exercise.id)) return;
    this._loggedSheetIds.add(exercise.id);

    const payload = {
      timestamp: new Date().toLocaleString('nl-NL'),
      id: exercise.id,
      exercise_name: exercise.exercise_name,
      material_name: exercise.material_name || exercise.material || '',
      video_url: exercise.video_search_url || '',
      error_reason: reason,
      app: 'Workout Fruitautomaat'
    };

    try {
      await fetch(url, {
        method: 'POST',
        mode: 'no-cors',
        headers: {
          'Content-Type': 'text/plain'
        },
        body: JSON.stringify(payload)
      });
      console.log(`[Google Sheet] Gelogd: ${exercise.exercise_name}`);
    } catch (err) {
      console.warn('[Google Sheet] Fout bij versturen naar sheet:', err);
    }
  }

  /**
   * Manual batch sync of all detected broken videos to Google Sheets
   */
  async syncAllBrokenVideosToSheet() {
    const url = (this.googleSheetsUrl || '').trim();
    if (!url) {
      alert("Vul eerst een geldige Google Sheets Webhook URL in.");
      return;
    }

    const broken = [];
    for (const mat in this.database) {
      for (const ex of this.database[mat]) {
        if (this.brokenVideoExerciseIds.has(ex.id)) {
          broken.push({ ...ex, material: mat });
        }
      }
    }

    if (broken.length === 0) {
      alert("Er zijn momenteel geen niet-werkende video's om te versturen.");
      return;
    }

    if (this.elements.syncSheetsBtn) {
      this.elements.syncSheetsBtn.disabled = true;
      this.elements.syncSheetsBtn.textContent = "⏳ Verzenden...";
    }

    let sent = 0;
    for (const ex of broken) {
      await this.logBrokenVideoToGoogleSheet(ex, 'Verbinding geweigerd / scan');
      sent++;
    }

    alert(`${sent} niet-werkende video('s) verzonden naar je Google Sheet!`);

    if (this.elements.syncSheetsBtn) {
      this.elements.syncSheetsBtn.disabled = false;
      this.elements.syncSheetsBtn.textContent = "📊 Naar Google Sheet";
    }
  }

  /**
   * Export broken videos as CSV file
   */
  downloadBrokenVideosCSV() {
    const broken = [];
    for (const mat in this.database) {
      for (const ex of this.database[mat]) {
        if (this.brokenVideoExerciseIds.has(ex.id)) {
          broken.push({ ...ex, material: mat });
        }
      }
    }

    if (broken.length === 0) {
      alert("Er zijn geen niet-werkende video's om te downloaden.");
      return;
    }

    const headers = ['Datum', 'Oefening ID', 'Oefening Naam', 'Materiaal', 'Video URL', 'Status'];
    const rows = broken.map(ex => [
      `"${new Date().toLocaleDateString('nl-NL')}"`,
      `"${ex.id}"`,
      `"${(ex.exercise_name || '').replace(/"/g, '""')}"`,
      `"${(ex.material || '').replace(/"/g, '""')}"`,
      `"${(ex.video_search_url || '').replace(/"/g, '""')}"`,
      `"Verbinding geweigerd"`
    ]);

    const csvContent = '\uFEFF' + [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const blobUrl = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', blobUrl);
    link.setAttribute('download', `niet-werkende-videos-${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
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
   * Check if class end time has passed or if there is not enough time remaining
   * for another full exercise cycle (countdown + max working time).
   */
  _isClassFinished() {
    if (!this.classEndTime) return false;
    const [h, m] = this.classEndTime.split(':').map(Number);
    const now = new Date();
    const end = new Date(now);
    end.setHours(h, m, 0, 0);
    const remainingSec = (end - now) / 1000;
    
    // Required seconds for a full next exercise cycle: countdown + max working time
    const requiredSec = this.countdownTime + this.maxTime;
    return remainingSec < requiredSec;
  }

  _classIsOver() {
    return this._isClassFinished();
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
      let exercises = this.database[materialName];
      if (this.requireVideo) {
        exercises = exercises.filter(ex => (ex.video_search_url || '').trim() !== '');
      }
      if (exercises.length === 0) return;
      
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

    let exercises = this.database[materialName];
    if (this.requireVideo) {
      exercises = exercises.filter(ex => (ex.video_search_url || '').trim() !== '');
    }
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
      let exercises = this.database[materialName];
      if (this.requireVideo) {
        exercises = exercises.filter(ex => (ex.video_search_url || '').trim() !== '');
      }
      exercises.forEach(ex => {
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
      const enabledExs = this.database[materialName].filter(ex => {
        if (this.disabledExerciseIds.has(ex.id)) return false;
        if (this.requireVideo && !this._hasValidWorkingVideo(ex)) return false;
        return true;
      });
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
  async handleSpin() {
    // If class end time has been reached or remaining time is insufficient for full exercise cycle
    if (this._isClassFinished()) {
      if (window.audioEngine) window.audioEngine.playFinish();
      this.showClassFinishedModal();
      return;
    }

    // Gather active pools
    const activeMaterials = [];
    const activeExercisesMap = {}; // material -> exercises
    const allEnabledExercises = [];

    for (const materialName in this.database) {
      const enabledExs = this.database[materialName].filter(ex => {
        if (this.disabledExerciseIds.has(ex.id)) return false;
        if (this.requireVideo && !this._hasValidWorkingVideo(ex)) return false;
        return true;
      });
      if (enabledExs.length > 0) {
        activeMaterials.push(materialName);
        activeExercisesMap[materialName] = enabledExs;
        allEnabledExercises.push(...enabledExs);
      }
    }

    // Validation
    if (activeMaterials.length === 0 || allEnabledExercises.length === 0) {
      alert("Kies tenminste één actieve oefening (met werkende video) in de instellingen!");
      this.openAdmin(true);
      return;
    }

    // Prune stale IDs from tracking sets if database/filters changed
    const activeExerciseIdSet = new Set(allEnabledExercises.map(ex => ex.id));
    for (const id of this.usedExerciseIds) {
      if (!activeExerciseIdSet.has(id)) {
        this.usedExerciseIds.delete(id);
      }
    }
    const activeMaterialSet = new Set(activeMaterials);
    for (const mat of this.usedMaterials) {
      if (!activeMaterialSet.has(mat)) {
        this.usedMaterials.delete(mat);
      }
    }

    let chosenMaterial = null;
    let chosenExercise = null;

    if (this.noRepeatExercises && this.noRepeatMaterials) {
      // 1. Both options active: Materials cycle uniquely AND exercises cycle uniquely
      // Find candidate materials: not yet used in current material-cycle AND with at least one unused exercise
      let candidateMaterials = activeMaterials.filter(m => 
        !this.usedMaterials.has(m) && activeExercisesMap[m].some(ex => !this.usedExerciseIds.has(ex.id))
      );

      // If no candidate materials available:
      if (candidateMaterials.length === 0) {
        // Check if all exercises across the entire active pool have been used
        const allExercisesUsed = allEnabledExercises.every(ex => this.usedExerciseIds.has(ex.id));
        if (allExercisesUsed) {
          this.usedExerciseIds.clear();
          this.usedHistory = [];
        }
        // Reset materials cycle when no unused materials with fresh exercises remain
        this.usedMaterials.clear();

        // Re-evaluate materials with unused exercises
        candidateMaterials = activeMaterials.filter(m => 
          activeExercisesMap[m].some(ex => !this.usedExerciseIds.has(ex.id))
        );

        // Fallback if still empty
        if (candidateMaterials.length === 0) {
          this.usedExerciseIds.clear();
          this.usedHistory = [];
          candidateMaterials = [...activeMaterials];
        }
      }

      chosenMaterial = candidateMaterials[Math.floor(Math.random() * candidateMaterials.length)];
      
      let candidateExercises = activeExercisesMap[chosenMaterial].filter(ex => !this.usedExerciseIds.has(ex.id));
      if (candidateExercises.length === 0) {
        candidateExercises = activeExercisesMap[chosenMaterial];
      }
      chosenExercise = candidateExercises[Math.floor(Math.random() * candidateExercises.length)];

    } else if (this.noRepeatExercises) {
      // 2. Only exercises non-repeating (materials can repeat)
      let candidateExercises = allEnabledExercises.filter(ex => !this.usedExerciseIds.has(ex.id));
      if (candidateExercises.length === 0) {
        this.usedExerciseIds.clear();
        this.usedHistory = [];
        candidateExercises = [...allEnabledExercises];
      }

      chosenExercise = candidateExercises[Math.floor(Math.random() * candidateExercises.length)];
      chosenMaterial = chosenExercise.material_name || Object.keys(activeExercisesMap).find(m => activeExercisesMap[m].includes(chosenExercise)) || activeMaterials[0];

    } else if (this.noRepeatMaterials) {
      // 3. Only materials non-repeating (exercises can repeat within or across cycles)
      let candidateMaterials = activeMaterials.filter(m => !this.usedMaterials.has(m));
      if (candidateMaterials.length === 0) {
        this.usedMaterials.clear();
        candidateMaterials = [...activeMaterials];
      }

      chosenMaterial = candidateMaterials[Math.floor(Math.random() * candidateMaterials.length)];
      const exercisesForMaterial = activeExercisesMap[chosenMaterial];
      chosenExercise = exercisesForMaterial[Math.floor(Math.random() * exercisesForMaterial.length)];

    } else {
      // 4. Pure random
      chosenMaterial = activeMaterials[Math.floor(Math.random() * activeMaterials.length)];
      const exercisesForMaterial = activeExercisesMap[chosenMaterial];
      chosenExercise = exercisesForMaterial[Math.floor(Math.random() * exercisesForMaterial.length)];
    }

    // Background validation during spin for chosen exercise video
    const videoId = this._extractYouTubeId(chosenExercise.video_search_url);
    if (videoId) {
      const isValid = await this.validateYouTubeVideo(videoId);
      if (!isValid) {
        // Video is refused / broken! Mark in broken list
        this.brokenVideoExerciseIds.add(chosenExercise.id);
        this._saveBrokenVideos();
        this.logBrokenVideoToGoogleSheet(chosenExercise, 'Gedetecteerd tijdens spin');
        // If requireVideo is on, pick an alternative working exercise
        if (this.requireVideo) {
          const workingAlternatives = allEnabledExercises.filter(ex => 
            ex.id !== chosenExercise.id && this._hasValidWorkingVideo(ex)
          );
          if (workingAlternatives.length > 0) {
            chosenExercise = workingAlternatives[Math.floor(Math.random() * workingAlternatives.length)];
            chosenMaterial = chosenExercise.material_name || chosenMaterial;
          }
        }
      }
    }

    // Finalize recording for non-repeat pools
    if (this.noRepeatMaterials) {
      this.usedMaterials.add(chosenMaterial);
    }
    if (this.noRepeatExercises) {
      this.usedExerciseIds.add(chosenExercise.id);
    }

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

    // Record used history
    this.usedHistory.push({
      id: chosenExercise.id,
      name: chosenExercise.exercise_name,
      material: chosenMaterial,
      time: chosenTime,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    });
    this._saveUsedHistory();

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
    this.switchView('countdown');
    
    // Set exercise info in right panel
    this.elements.hudExerciseName.textContent = this.activeExercise.exercise_name;
    this.elements.hudMaterialInfo.textContent = this.activeMaterial;
    this.elements.instructionText.textContent = this.activeExercise.instructions || "Voer de oefening gecontroleerd uit met de juiste techniek.";

    // Set initial countdown number in unified timer
    this.elements.timerDigits.textContent = this.countdownTime;

    // Load YouTube iframe NOW (during countdown) so it's already playing when workout starts
    this._loadYouTubeIframe();


    this.timer.start(this.activeTime, {
      countdownDuration: this.countdownTime,

      onCountdownTick: (secs) => {
        // Just update the unified timer digits — no separate countdown element needed
        this.elements.timerDigits.textContent = secs;
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
   * Setup HUD and move video to active-view slot
   */
  startWorkoutHUD() {
    this.switchView('active');

    // Setup circular progress ring
    const circle = this.elements.timerProgressCircle;
    const radius = circle.r.baseVal.value;
    const circumference = 2 * Math.PI * radius;
    circle.style.strokeDasharray = `${circumference} ${circumference}`;
    circle.style.strokeDashoffset = circumference;
    circle.classList.remove('low-time');

    // Reset Play/Pause trainer button
    this.elements.btnPause.innerHTML = '⏸ <span style="margin-left:5px;">PAUZE</span>';
    this.elements.btnPause.className = 'btn btn-cyan';

    // Initial digits draw
    this.updateHUDTimer(this.activeTime);
  }

  /**
   * Hide video and fallback image elements inside the video slot
   */
  _hideVideoFrame() {
    const iframe = this.elements.workoutIframe;
    const fallback = this.elements.videoFallbackImg;
    const slot = this.elements.videoSlot;
    if (iframe) iframe.style.display = 'none';
    if (fallback) fallback.style.display = 'none';
    if (slot) slot.classList.add('use-fallback');
  }

  _loadYouTubeIframe() {
    const iframe = this.elements.workoutIframe;
    const fallback = this.elements.videoFallbackImg;
    const slot = this.elements.videoSlot;

    const rawUrl = (this.activeExercise.video_search_url || '').trim();
    const videoId = this._extractYouTubeId(rawUrl);
    const thumb = (this.activeExercise.thumbnail || '').trim() || (videoId ? `https://img.youtube.com/vi/${videoId}/hqdefault.jpg` : '');

    const isBroken = this.brokenVideoExerciseIds.has(this.activeExercise.id);

    if (videoId && !isBroken) {
      const params = new URLSearchParams({
        autoplay:       '1',
        mute:           '1',
        loop:           '1',
        playlist:       videoId,
        controls:       '0',
        modestbranding: '1',
        rel:            '0',
        iv_load_policy: '3',
        fs:             '0',
        playsinline:    '1'
      });
      iframe.src = `https://www.youtube-nocookie.com/embed/${videoId}?${params.toString()}`;
      iframe.style.display = 'block';
      
      if (thumb) {
        fallback.src = thumb;
        fallback.style.display = 'block';
        fallback.alt = this.activeExercise.exercise_name;
      } else {
        fallback.src = '';
        fallback.style.display = 'none';
      }
      
      if (slot) slot.classList.remove('use-fallback');
    } else {
      iframe.src = '';
      iframe.style.display = 'none';
      if (thumb) {
        fallback.src = thumb;
        fallback.style.display = 'block';
        fallback.alt = this.activeExercise.exercise_name;
      } else {
        fallback.src = '';
        fallback.style.display = 'none';
      }
      if (slot) slot.classList.add('use-fallback');
    }
  }

  _stopYouTubeIframe() {
    const iframe = this.elements.workoutIframe;
    if (iframe) iframe.src = '';
    this._hideVideoFrame();
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
   * Trainer Controls - Pause / Resume
   */
  toggleWorkoutPause() {
    if (this.timer.state === 'RUNNING' || this.timer.state === 'COUNTDOWN') {
      this.timer.pause();
      // Pause YouTube: unload the iframe src so video stops
      this._stopYouTubeIframe();
      this.elements.btnPause.innerHTML = '▶ <span style="margin-left: 5px;">VERVOLG</span>';
      this.elements.btnPause.className = 'btn btn-pink';
    } else if (this.timer.state === 'PAUSED') {
      this.timer.resume();
      // Resume: reload the YouTube iframe
      this._loadYouTubeIframe();
      this.elements.btnPause.innerHTML = '⏸ <span style="margin-left: 5px;">PAUZE</span>';
      this.elements.btnPause.className = 'btn btn-cyan';
    }
  }

  /**
   * Trainer Controls - Skip
   */
  handleWorkoutSkip() {
    this.timer.stop();
    this._stopYouTubeIframe();
    if (window.audioEngine) window.audioEngine.playStop();
    this.handleWorkoutComplete();
  }

  /**
   * Trainer Controls - Reset
   */
  handleWorkoutReset() {
    this.timer.stop();
    this._stopYouTubeIframe();
    this.elements.spinBtn.disabled = false;
    this.elements.adminOpenBtn.disabled = false;
    this.switchView('idle');
    this.setStandbyState();
  }

  /**
   * Handle workout complete phase
   */
  handleWorkoutComplete() {
    this._stopYouTubeIframe();

    const isClassFinished = this._isClassFinished();

    if (isClassFinished) {
      // 🏆 END OF TRAINING: Play finish audio & show grand celebration modal!
      if (window.audioEngine) window.audioEngine.playFinish();
      this.autoPlay = false;
      this.updateAutoPlayUI();
      this.showClassFinishedModal();
    } else {
      // 🔄 NORMAL EXERCISE SWITCH: Play rest_switch_start audio & show 3-second flash overlay
      if (window.audioEngine) window.audioEngine.playSwitch();

      const overlay = this.elements.finishedOverlay;
      const exName = this.activeExercise ? this.activeExercise.exercise_name : 'Oefening';
      this.elements.finishedExercise.textContent = `${exName} afgerond. Wissel naar volgende!`;
      overlay.classList.add('show');

      // Hide after 3 seconds, then return to idle or auto-spin
      setTimeout(() => {
        overlay.classList.remove('show');

        this.elements.spinBtn.disabled = false;
        this.elements.adminOpenBtn.disabled = false;

        if (this.autoPlay && !this._isClassFinished()) {
          // Auto-spin after brief pause on idle
          this.switchView('idle');
          setTimeout(() => {
            if (this.autoPlay && !this._isClassFinished()) this.handleSpin();
          }, 900);
        } else {
          this.switchView('idle');
          this.setStandbyState();
        }
      }, 3000);
    }
  }

  /**
   * Grand End-of-Class Celebration Modal & Confetti
   */
  showClassFinishedModal() {
    const modal = this.elements.classFinishedOverlay;
    if (!modal) return;

    // Calculate session totals
    const totalExercises = this.usedHistory.length;
    const totalSeconds = this.usedHistory.reduce((acc, item) => acc + (item.time || 0), 0);
    const mins = Math.floor(totalSeconds / 60);
    const secs = totalSeconds % 60;
    const timeFormatted = mins > 0 ? `${mins}m ${secs > 0 ? secs + 's' : ''}` : `${secs}s`;
    const uniqueMaterials = new Set(this.usedHistory.map(h => h.material)).size;

    if (this.elements.classStatExercises) this.elements.classStatExercises.textContent = totalExercises;
    if (this.elements.classStatTime) this.elements.classStatTime.textContent = timeFormatted;
    if (this.elements.classStatMaterials) this.elements.classStatMaterials.textContent = uniqueMaterials;

    modal.classList.add('show');
    this.startConfetti();
  }

  hideClassFinishedModal() {
    const modal = this.elements.classFinishedOverlay;
    if (!modal) return;
    modal.classList.remove('show');
    this.stopConfetti();
    this.elements.spinBtn.disabled = false;
    this.elements.adminOpenBtn.disabled = false;
    this.switchView('idle');
    this.setStandbyState();
  }

  /**
   * Handler for starting a new class from the celebration screen
   */
  handleStartNewClass() {
    this.hideClassFinishedModal();
    this.resetUsedHistory();
    // Open settings drawer to optionally adjust class end time
    this.openAdmin(true);
  }

  /**
   * Dynamic Canvas Confetti Animation
   */
  startConfetti() {
    const canvas = document.getElementById('confetti-canvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;

    const colors = ['#00ffff', '#ff007f', '#39ff14', '#ffea00', '#ffffff', '#b34dff'];
    const particles = [];
    for (let i = 0; i < 140; i++) {
      particles.push({
        x: Math.random() * canvas.width,
        y: Math.random() * canvas.height - canvas.height,
        size: Math.random() * 9 + 4,
        color: colors[Math.floor(Math.random() * colors.length)],
        speedY: Math.random() * 3.5 + 1.8,
        speedX: Math.random() * 4 - 2,
        rotation: Math.random() * 360,
        rotSpeed: Math.random() * 4 - 2
      });
    }

    this._confettiActive = true;
    const render = () => {
      if (!this._confettiActive) return;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      particles.forEach(p => {
        p.y += p.speedY;
        p.x += p.speedX;
        p.rotation += p.rotSpeed;
        if (p.y > canvas.height) {
          p.y = -20;
          p.x = Math.random() * canvas.width;
        }
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate((p.rotation * Math.PI) / 180);
        ctx.fillStyle = p.color;
        ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * 0.65);
        ctx.restore();
      });
      requestAnimationFrame(render);
    };
    render();
  }

  stopConfetti() {
    this._confettiActive = false;
    const canvas = document.getElementById('confetti-canvas');
    if (canvas) {
      const ctx = canvas.getContext('2d');
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    }
  }

  /**
   * Resets all bottom panel labels to a clean standby look
   */
  setStandbyState() {
    this.elements.hudExerciseName.textContent = "DRUK OP SPIN";
    this.elements.hudMaterialInfo.textContent = "---";
    this.elements.instructionText.textContent = "Druk op de roze SPIN knop om een willekeurige oefening te selecteren.";
    this.elements.timerDigits.textContent = "00";
    if (this.elements.timerProgressCircle) {
      this.elements.timerProgressCircle.style.strokeDashoffset = '0';
    }
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
      
      // Sync inputs to saved state
      if (this.elements.coachSelect) {
        this.elements.coachSelect.value = this.coach;
      }
      if (this.elements.noRepeatExercisesInput) {
        this.elements.noRepeatExercisesInput.checked = this.noRepeatExercises;
      }
      if (this.elements.noRepeatMaterialsInput) {
        this.elements.noRepeatMaterialsInput.checked = this.noRepeatMaterials;
      }
      if (this.elements.googleSheetsUrlInput) {
        this.elements.googleSheetsUrlInput.value = this.googleSheetsUrl;
      }
      
      // Render used history list & stats
      this.renderUsedHistory();
      
      // Render broken videos list & stats
      this.renderBrokenVideosList();
      
      this.elements.adminOverlay.classList.add('open');
      this.elements.scrim.classList.add('open');
    } else {
      this.elements.adminOverlay.classList.remove('open');
      this.elements.scrim.classList.remove('open');
    }
  }

  switchView(state) {
    const main = this.elements.appMain;
    if (!main) return;
    main.classList.remove('state-idle', 'state-countdown', 'state-active');
    main.classList.add(`state-${state}`);

    if (this.slotMachine) {
      setTimeout(() => {
        this.slotMachine.realign();
      }, 60);
    }
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
