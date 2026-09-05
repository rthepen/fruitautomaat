/**
 * Workout Slot Machine - Main Controller (app.js)
 * Coordinates data loading, state transitions, event handling, and admin panel interactions.
 */

// GitHub Database Config
const GITHUB_DATABASE_URL = "https://raw.githubusercontent.com/rthepen/workout-database/main/dist/all_exercises.json";

// Fallback local database files
const DATABASE_FILES = [
  "ab_wheel.json", "agility_ladder.json", "barbell.json", "battle_rope.json",
  "bodyweight.json", "bosu_ball.json", "cardio_equipment.json", "core_sliders.json",
  "deadball.json", "dumbbells.json", "jump_rope.json", "kettlebell.json",
  "medicine_ball.json", "monkey_bars.json", "parallettes.json", "partner.json",
  "pionnen.json", "plyo_box.json", "resistance_band.json", "sandbag.json",
  "spinningfiets.json", "sprint_track.json", "standing_punching_bag.json",
  "tractor_tyre.json", "trx___suspension.json"
];

/**
 * Normalizes raw exercises from rthepen/workout-database GitHub repository
 */
function _normalizeGitHubExercise(rawEx) {
  // Exercise name (prefer Dutch, fallback English)
  let exName = "";
  if (typeof rawEx.exercise_name === "object" && rawEx.exercise_name !== null) {
    exName = rawEx.exercise_name.nl || rawEx.exercise_name.en || "Oefening";
  } else {
    exName = rawEx.exercise_name || "Oefening";
  }

  // Material name (e.g. "Ab Wheel", "Agility Ladder", etc.)
  let matName = "";
  if (rawEx.material && typeof rawEx.material.name === "object" && rawEx.material.name !== null) {
    matName = rawEx.material.name.en || rawEx.material.name.nl || "Lichaamsgewicht";
  } else if (rawEx.material_name) {
    matName = rawEx.material_name;
  } else {
    matName = "Lichaamsgewicht";
  }

  // Category
  let category = "";
  if (typeof rawEx.category === "object" && rawEx.category !== null) {
    category = rawEx.category.nl || rawEx.category.en || "Algemeen";
  } else {
    category = rawEx.category || "Algemeen";
  }

  // Material description
  let matDesc = "";
  if (rawEx.material && typeof rawEx.material.description === "object" && rawEx.material.description !== null) {
    matDesc = rawEx.material.description.nl || rawEx.material.description.en || "";
  } else if (rawEx.material_description) {
    matDesc = rawEx.material_description;
  }

  // Instructions
  let instructions = "";
  if (typeof rawEx.instructions === "string") {
    instructions = rawEx.instructions;
  } else if (rawEx.instructions && typeof rawEx.instructions === "object") {
    const langInst = rawEx.instructions.nl || rawEx.instructions.en || [];
    if (Array.isArray(langInst)) {
      instructions = langInst.join(" ");
    } else if (typeof langInst === "string") {
      instructions = langInst;
    }
  }

  // YouTube Video URL & Thumbnail
  let videoUrl = "";
  let thumbUrl = "";
  if (rawEx.media && Array.isArray(rawEx.media.videos) && rawEx.media.videos.length > 0) {
    const bestVid = rawEx.media.videos.find(v => v.youtube_id) || rawEx.media.videos[0];
    if (bestVid && bestVid.youtube_id) {
      videoUrl = `https://www.youtube.com/watch?v=${bestVid.youtube_id}`;
      thumbUrl = `https://img.youtube.com/vi/${bestVid.youtube_id}/hqdefault.jpg`;
    }
  }
  if (!videoUrl && rawEx.video_search_url) {
    videoUrl = rawEx.video_search_url;
  }
  if (!thumbUrl && rawEx.thumbnail) {
    thumbUrl = rawEx.thumbnail;
  }

  // ID with material prefix
  let id = rawEx.id || `ex_${Math.random().toString(36).substr(2, 9)}`;
  const prefix = matName.toLowerCase().replace(/[^a-z0-9]/g, '_') + '_';
  if (!id.startsWith(prefix)) {
    id = prefix + id;
  }

  return {
    id: id,
    exercise_name: exName,
    category: category,
    material_name: matName,
    material_description: matDesc,
    instructions: instructions || "Voer de oefening gecontroleerd uit met de juiste techniek.",
    video_search_url: videoUrl,
    thumbnail: thumbUrl
  };
}

class WorkoutApp {
  constructor() {
    // App State
    this.database = {}; // material_name -> Array of exercises
    this.disabledExerciseIds = new Set();
    this.tempDisabledExerciseIds = new Set(); // Temporary set for uncommitted settings changes
    this.minTime = 30;
    this.maxTime = 120;
    this.countdownTime = 15; // Get ready countdown time (customizable, default 15s)
    this.classStartTime = ''; // 'HH:MM' string (optional auto-start time)
    this.classEndTime = '';   // 'HH:MM' string (class finish time)
    this.volume = 2.0;       // 0–3.0 (200% default)
    this.autoPlay = true;    // Auto-spin is always active by default
    this.coach = 'tabataman'; // 'tabataman', 'eva', 'arcade'
    this.noRepeatExercises = true; // Exhaust pool of exercises before repeating (default true)
    this.noRepeatMaterials = true; // Exhaust pool of materials before repeating (default true)
    this.usedExerciseIds = new Set(); // Track used exercises in current cycle
    this.usedMaterials = new Set();   // Track used materials in current cycle
    this.usedHistory = [];            // Chronological array of used exercises in current cycle
    
    // Session Tracking
    this._sessionExerciseCount = 0;   // Count of exercises completed in this browser session

    // Pre-Planned Schedule
    this.plannedSchedule = [];        // Pre-generated workout sequence: [{ id, exercise, material, time, status }]
    this.currentScheduleIndex = 0;    // Index of the next exercise to spin
    this._isSessionActive = false;    // Whether class is actively running
    this._exactStartTimestamp = null; // Timestamp for precise 10s countdown start

    // Secret Planner state
    this._logoClicks = 0;
    this._logoClickTimer = null;

    // Broken video tracking & Google Sheets logging
    this.brokenVideoExerciseIds = new Set(); // Track exercises with refused/deleted/broken YouTube videos
    this.videoValidationCache = {};          // Cache videoId -> boolean validation results
    this.googleSheetsUrl = 'https://script.google.com/macros/s/AKfycbx6ccQx8Cobis3AF45-Gxg5GrkTCyPDn6KS32XykObIhMHD-aaWeElO2tD61UC9Ud4Vxw/exec';
    this._loggedSheetIds = new Set();        // Prevent duplicate logs in same session
    
    // Multi-team Circuit state & Per-team Tracking
    this.teamCount = 1;               // Number of teams (1 to 8)
    this.circuitRotation = true;      // true = teams rotate stations; false = fresh spin every round
    this.currentRotationIndex = 0;    // Active circuit station rotation (0 to teamCount - 1)
    this.activeStations = [];         // Active round stations: [{ stationIndex, material, exercise }]
    this.activeStationPreviewIndex = 0; // Station shown in preview player
    this.teamData = [];               // Per-team tracker: [{ usedMaterials: Set, materialCounts: {}, usedExerciseIds: Set, exerciseCounts: {}, history: [] }]
    this.globalMaterialCounts = {};   // Track usage count per material across all teams for global fairness
    this._usedHistoryTeamFilter = -1; // -1 = all teams, 0..7 = team index filter
    this._initTeamData(true);

    // Active selection
    this.activeMaterial = null;
    this.activeExercise = null;
    this.activeTime = 0;
    this.currentState = 'idle';       // 'idle', 'countdown', 'active'
    this._pendingTeamCount = null;    // Queued team count change to apply between rounds
    this._pendingReelsUpdate = false; // Flag to rebuild reels pool between rounds
    this._toastTimer = null;          // Notification timer
    
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
    this.slotMachine = new SlotMachine(
      this.elements.slotReelsContainer || [
        this.elements.reel1,
        this.elements.reel2,
        this.elements.reel3
      ],
      this.teamCount
    );
    
    this.timer = new WorkoutTimer();

    try {
      this.showLoading(true);
      await this.loadDatabase();
      this.buildAdminTree();
      if (this.elements.appMain) {
        if (this.teamCount > 1) {
          this.elements.appMain.classList.add('has-multi-teams');
        } else {
          this.elements.appMain.classList.remove('has-multi-teams');
        }
      }
      if (this.elements.slotReelsContainer) {
        this.slotMachine.configureTeams(this.teamCount, this.elements.slotReelsContainer);
      }
      this.updateReelsPool();
      this.renderUsedHistory();
      this.renderBrokenVideosList();
      
      // Pre-generate the full planned workout schedule in the background
      await this.generatePlannedSchedule();
      
      // Start live clock and tickers ONLY after database and schedule are fully loaded
      this.startClassClock();
      
      this.showLoading(false);
      
      // Transition to Idle slot machine view
      this.switchView('idle');
      this.setStandbyState();

      // Automatically scan all videos in background without requiring any user clicks
      setTimeout(() => {
        this.autoBackgroundScanVideos();
      }, 2000);
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
      
      // Buttons & Titles
      mainTitle: document.getElementById('main-title'),
      spinBtn: document.getElementById('spin-btn'),
      adminOpenBtn: document.getElementById('admin-open-btn'),
      adminCloseBtn: document.getElementById('admin-close-btn'),
      adminSaveBtn: document.getElementById('admin-save-btn'),
      audioToggleBtn: document.getElementById('audio-toggle-btn'),
      
      // Admin Panel
      adminOverlay: document.getElementById('admin-overlay'),
      scrim: document.getElementById('scrim'),
      classStartInput: document.getElementById('class-start-input'),
      btnStartNow: document.getElementById('btn-start-now'),
      classEndInput: document.getElementById('class-end-input'),
      classDurationSelect: document.getElementById('class-duration-select'),
      minTimeInput: document.getElementById('min-time-input'),
      maxTimeInput: document.getElementById('max-time-input'),
      countdownTimeInput: document.getElementById('countdown-time-input'),
      volumeInput: document.getElementById('volume-input'),
      coachSelect: document.getElementById('coach-select'),
      requireVideoInput: document.getElementById('require-video-input'),
      noRepeatExercisesInput: document.getElementById('no-repeat-exercises-input'),
      noRepeatMaterialsInput: document.getElementById('no-repeat-materials-input'),
      usedHistoryList: document.getElementById('used-history-list'),
      usedHistoryStats: document.getElementById('used-history-stats'),
      resetHistoryBtn: document.getElementById('reset-history-btn'),
      databaseTree: document.getElementById('database-tree'),
      searchBar: document.getElementById('search-bar'),
      selectAllBtn: document.getElementById('select-all-btn'),
      deselectAllBtn: document.getElementById('deselect-all-btn'),

      // Secret Planner Modal
      secretPlannerOverlay: document.getElementById('secret-planner-overlay'),
      secretPlannerOpenBtn: document.getElementById('secret-planner-open-btn'),
      secretPlannerCloseBtn: document.getElementById('secret-planner-close-btn'),
      secretPlannerStats: document.getElementById('secret-planner-stats'),
      secretScheduleList: document.getElementById('secret-schedule-list'),
      secretRegenerateBtn: document.getElementById('secret-regenerate-btn'),
      secretAddExerciseBtn: document.getElementById('secret-add-exercise-btn'),

      // Developer Tools inside Secret Menu
      scanVideosBtn: document.getElementById('scan-videos-btn'),
      syncSheetsBtn: document.getElementById('sync-sheets-btn'),
      downloadCsvBtn: document.getElementById('download-csv-btn'),
      resetBrokenVideosBtn: document.getElementById('reset-broken-videos-btn'),
      googleSheetsUrlInput: document.getElementById('google-sheets-url-input'),
      brokenVideosStats: document.getElementById('broken-videos-stats'),
      brokenVideosList: document.getElementById('broken-videos-list'),
      
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
      timerProgressFill: document.getElementById('timer-progress-fill'),
      timerProgressCircle: document.getElementById('timer-progress-circle'),
      workoutIframe: document.getElementById('workout-video-iframe'),
      videoSlot: document.getElementById('video-slot'),
      videoFallbackImg: document.getElementById('video-fallback-img'),
      instructionText: document.getElementById('instruction-text'),
      instructionThumbImg: document.getElementById('instruction-thumb-img'),
      instructionThumbPreview: document.getElementById('instruction-thumb-preview'),

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
      classFinishedCloseBtn: document.getElementById('class-finished-close-btn'),
      classFinishedTeamsSummary: document.getElementById('class-finished-teams-summary'),

      // Multi-Team & Circuit Elements
      singleTeamHudWrapper: document.getElementById('single-team-hud-wrapper'),
      multiVideoGrid: document.getElementById('multi-video-grid'),
      slotReelsContainer: document.getElementById('slot-reels-container'),
      quickTeamSelect: document.getElementById('quick-team-select'),
      teamCountInput: document.getElementById('team-count-input'),
      circuitRotationInput: document.getElementById('circuit-rotation-input'),
      circuitRotationBadge: document.getElementById('circuit-rotation-badge'),
      stationsTrackerBar: document.getElementById('stations-tracker-bar'),
      stationsOverviewPanel: document.getElementById('stations-overview-panel'),
      finishedOverlayTitle: document.getElementById('finished-overlay-title'),
      finishedRotationDetails: document.getElementById('finished-rotation-details'),

      // GitHub Database Sync Elements
      btnSyncDatabase: document.getElementById('btn-sync-database'),
      dbSyncStatusBadge: document.getElementById('db-sync-status-badge'),
      dbSyncLastTime: document.getElementById('db-sync-last-time'),
      dbSyncStatsModal: document.getElementById('db-sync-stats-modal'),
      dbSyncStatsBody: document.getElementById('db-sync-stats-body'),
      dbSyncStatsClose: document.getElementById('db-sync-stats-close'),
      dbSyncStatsOkBtn: document.getElementById('db-sync-stats-ok-btn')
    };
  }

  /**
   * Bind event listeners
   */
  bindEvents() {
    // Spin Button
    this.elements.spinBtn.addEventListener('click', () => this.handleSpin());

    // Teams Selectors
    if (this.elements.quickTeamSelect) {
      this.elements.quickTeamSelect.addEventListener('change', (e) => {
        const newCount = parseInt(e.target.value);
        const isWorkoutActive = (this.currentState === 'countdown' || this.currentState === 'active');
        if (isWorkoutActive) {
          this._pendingTeamCount = newCount;
          this._setCookie('workout_team_count', newCount);
          this.showToast(`✓ Teams aangepast naar ${newCount}! Actief vanaf de volgende ronde.`);
        } else {
          this.setTeamCount(newCount);
        }
      });
    }
    if (this.elements.teamCountInput) {
      this.elements.teamCountInput.addEventListener('change', (e) => {
        const newCount = parseInt(e.target.value);
        const isWorkoutActive = (this.currentState === 'countdown' || this.currentState === 'active');
        if (isWorkoutActive) {
          this._pendingTeamCount = newCount;
          this._setCookie('workout_team_count', newCount);
        }
      });
    }
    if (this.elements.circuitRotationInput) {
      this.elements.circuitRotationInput.addEventListener('change', (e) => {
        this.circuitRotation = e.target.checked;
        this._setCookie('workout_circuit_rotation', this.circuitRotation);
      });
    }

    // Direct Realtime Audio Controls (volume slider & coach voice)
    if (this.elements.volumeInput) {
      const onVolChange = (e) => {
        const val = parseInt(e.target.value) || 0;
        this.volume = Math.max(0, Math.min(300, val)) / 100;
        if (window.audioEngine) {
          window.audioEngine.setVolume(this.volume);
        }
        this._setCookie('workout_volume', this.volume);
      };
      this.elements.volumeInput.addEventListener('input', onVolChange);
      this.elements.volumeInput.addEventListener('change', onVolChange);
    }
    if (this.elements.coachSelect) {
      this.elements.coachSelect.addEventListener('change', (e) => {
        this.coach = e.target.value || 'tabataman';
        if (window.audioEngine) {
          window.audioEngine.setCoach(this.coach);
        }
        this._setCookie('workout_coach', this.coach);
      });
    }

    // GitHub Database Sync
    if (this.elements.btnSyncDatabase) {
      this.elements.btnSyncDatabase.addEventListener('click', () => {
        this.syncDatabaseFromGitHub(true);
      });
    }
    if (this.elements.dbSyncStatsClose) {
      this.elements.dbSyncStatsClose.addEventListener('click', () => {
        if (this.elements.dbSyncStatsModal) this.elements.dbSyncStatsModal.style.display = 'none';
      });
    }
    if (this.elements.dbSyncStatsOkBtn) {
      this.elements.dbSyncStatsOkBtn.addEventListener('click', () => {
        if (this.elements.dbSyncStatsModal) this.elements.dbSyncStatsModal.style.display = 'none';
      });
    }
    
    // Class Finished Modal buttons
    if (this.elements.classFinishedNewBtn) {
      this.elements.classFinishedNewBtn.addEventListener('click', () => this.handleStartNewClass());
    }
    if (this.elements.classFinishedCloseBtn) {
      this.elements.classFinishedCloseBtn.addEventListener('click', () => this.hideClassFinishedModal());
    }
    
    // Admin Toggle (always accessible during workout)
    this.elements.adminOpenBtn.addEventListener('click', () => this.openAdmin(true));
    this.elements.adminCloseBtn.addEventListener('click', () => this.openAdmin(false));
    this.elements.scrim.addEventListener('click', () => {
      this.openAdmin(false);
      this.openSecretPlanner(false);
    });
    
    // Admin Search
    this.elements.searchBar.addEventListener('input', (e) => this.filterAdminTree(e.target.value));
    
    // Select All / Deselect All
    this.elements.selectAllBtn.addEventListener('click', () => this.toggleAllExercises(true));
    this.elements.deselectAllBtn.addEventListener('click', () => this.toggleAllExercises(false));
    
    // Save Admin Config
    this.elements.adminSaveBtn.addEventListener('click', () => {
      this.saveSettings();
      this.openAdmin(false);
    });

    // Start Now (10s countdown) button
    if (this.elements.btnStartNow) {
      this.elements.btnStartNow.addEventListener('click', () => this.setStartNowIn10Seconds());
    }

    // Class duration dropdown
    if (this.elements.classDurationSelect) {
      this.elements.classDurationSelect.addEventListener('change', (e) => {
        const mins = parseInt(e.target.value);
        if (mins && mins > 0) {
          this.calculateEndTimeFromDuration(mins);
        }
      });
    }

    // Recalculate end time if start time changes and a duration is selected
    if (this.elements.classStartInput) {
      this.elements.classStartInput.addEventListener('change', () => {
        const mins = parseInt(this.elements.classDurationSelect?.value);
        if (mins && mins > 0) {
          this.calculateEndTimeFromDuration(mins);
        }
      });
    }

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

    // Secret Planner Controls
    if (this.elements.secretPlannerOpenBtn) {
      this.elements.secretPlannerOpenBtn.addEventListener('click', () => this.openSecretPlanner(true));
    }
    if (this.elements.secretPlannerCloseBtn) {
      this.elements.secretPlannerCloseBtn.addEventListener('click', () => this.openSecretPlanner(false));
    }
    if (this.elements.secretRegenerateBtn) {
      this.elements.secretRegenerateBtn.addEventListener('click', () => this.generatePlannedSchedule(true));
    }
    if (this.elements.secretAddExerciseBtn) {
      this.elements.secretAddExerciseBtn.addEventListener('click', () => this.addExerciseToSchedule());
    }

    // Secret trigger: Triple click/tap on logo
    if (this.elements.mainTitle) {
      this.elements.mainTitle.addEventListener('click', () => {
        this._logoClicks++;
        clearTimeout(this._logoClickTimer);
        this._logoClickTimer = setTimeout(() => {
          this._logoClicks = 0;
        }, 1200);

        if (this._logoClicks >= 3) {
          this._logoClicks = 0;
          this.openSecretPlanner(true);
        }
      });
    }

    // Secret shortcut: Press 'P' or 'S'
    document.addEventListener('keydown', (e) => {
      if ((e.key === 'p' || e.key === 'P' || e.key === 's' || e.key === 'S') && e.target.tagName !== 'INPUT') {
        this.openSecretPlanner(true);
      }
    });

    // Video check, sheets sync, and reset buttons (inside secret menu)
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
   * Populate internal database grouped by material name
   */
  _populateDatabaseFromRawArray(exercisesArray) {
    this.database = {};
    exercisesArray.forEach(rawEx => {
      const ex = _normalizeGitHubExercise(rawEx);
      const mat = ex.material_name || "Lichaamsgewicht";
      if (!this.database[mat]) {
        this.database[mat] = [];
      }
      this.database[mat].push(ex);
    });
  }

  /**
   * Fallback: load local JSON files from ./workoutdatabase
   */
  async _loadLocalDatabaseFiles() {
    this.database = {};
    const fetchPromises = DATABASE_FILES.map(async (filename) => {
      try {
        const response = await fetch(`./workoutdatabase/${filename}`);
        if (!response.ok) return;
        const data = await response.json();
        data.forEach(rawEx => {
          const ex = _normalizeGitHubExercise(rawEx);
          const mat = ex.material_name || "Lichaamsgewicht";
          if (!this.database[mat]) this.database[mat] = [];
          this.database[mat].push(ex);
        });
      } catch (err) {
        console.warn(`Local file load failed for ${filename}:`, err);
      }
    });
    await Promise.all(fetchPromises);
  }

  /**
   * Update sync UI status in settings drawer
   */
  _updateSyncUI(isGitHub, timestamp = null, isCached = false) {
    if (this.elements.dbSyncStatusBadge) {
      if (isGitHub) {
        this.elements.dbSyncStatusBadge.textContent = isCached ? "GITHUB (CACHE)" : "LIVE GITHUB";
        this.elements.dbSyncStatusBadge.style.color = "var(--neon-green)";
        this.elements.dbSyncStatusBadge.style.borderColor = "rgba(57,255,20,0.3)";
        this.elements.dbSyncStatusBadge.style.background = "rgba(57,255,20,0.15)";
      } else {
        this.elements.dbSyncStatusBadge.textContent = "LOKAAL (OFFLINE)";
        this.elements.dbSyncStatusBadge.style.color = "var(--neon-yellow)";
        this.elements.dbSyncStatusBadge.style.borderColor = "rgba(255,230,0,0.3)";
        this.elements.dbSyncStatusBadge.style.background = "rgba(255,230,0,0.15)";
      }
    }
    if (this.elements.dbSyncLastTime) {
      if (timestamp) {
        const d = (timestamp instanceof Date) ? timestamp : new Date(timestamp);
        this.elements.dbSyncLastTime.textContent = `Laatste sync: ${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} op ${d.toLocaleDateString()}`;
      } else {
        this.elements.dbSyncLastTime.textContent = "Laatste sync: zojuist";
      }
    }
  }

  /**
   * Load JSON Workout Data - always attempts GitHub repo first, then cache, then local files
   */
  async loadDatabase() {
    let loaded = false;

    // 1. Try Live GitHub fetch
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 6000);
      const res = await fetch(`${GITHUB_DATABASE_URL}?t=${Date.now()}`, { signal: controller.signal });
      clearTimeout(timeoutId);

      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data) && data.length > 0) {
          this._populateDatabaseFromRawArray(data);
          const now = new Date();
          try {
            localStorage.setItem('cached_github_workout_database', JSON.stringify(data));
            localStorage.setItem('cached_github_workout_database_time', now.toISOString());
          } catch(e) { console.warn("Could not save to localStorage:", e); }
          loaded = true;
          this._updateSyncUI(true, now, false);
          console.log(`Geladen vanaf GitHub repository: ${data.length} oefeningen`);
        }
      }
    } catch (err) {
      console.warn("GitHub live load niet geslaagd of offline, controleer cache...", err);
    }

    // 2. Try localStorage cache
    if (!loaded) {
      try {
        const cached = localStorage.getItem('cached_github_workout_database');
        const cachedTime = localStorage.getItem('cached_github_workout_database_time');
        if (cached) {
          const data = JSON.parse(cached);
          if (Array.isArray(data) && data.length > 0) {
            this._populateDatabaseFromRawArray(data);
            loaded = true;
            this._updateSyncUI(true, cachedTime ? new Date(cachedTime) : null, true);
            console.log(`Geladen uit lokale browser cache: ${data.length} oefeningen`);
          }
        }
      } catch (e) {
        console.warn("Fout bij lezen uit cache:", e);
      }
    }

    // 3. Fallback to local ./workoutdatabase files
    if (!loaded) {
      console.log("Val terug op lokale workoutdatabase bestanden...");
      await this._loadLocalDatabaseFiles();
      this._updateSyncUI(false, new Date());
    }
  }

  /**
   * Explicitly Sync Database with GitHub repository
   */
  async syncDatabaseFromGitHub(userTriggered = false) {
    const btn = this.elements.btnSyncDatabase;
    if (btn) {
      btn.disabled = true;
      btn.innerHTML = '⏳ Bezig...';
    }

    try {
      const res = await fetch(`${GITHUB_DATABASE_URL}?t=${Date.now()}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();

      if (!Array.isArray(data) || data.length === 0) {
        throw new Error("Geen oefeningen gevonden in data.");
      }

      this._populateDatabaseFromRawArray(data);
      const syncTime = new Date();
      try {
        localStorage.setItem('cached_github_workout_database', JSON.stringify(data));
        localStorage.setItem('cached_github_workout_database_time', syncTime.toISOString());
      } catch(e) { console.warn("Could not save to localStorage:", e); }

      this.buildAdminTree();
      this.updateReelsPool();
      this.generatePlannedSchedule(true);
      this._updateSyncUI(true, syncTime, false);

      if (userTriggered) {
        this._showSyncStatsModal(data, syncTime);
        try {
          if (window.audioEngine) {
            if (typeof window.audioEngine.playWin === 'function') {
              window.audioEngine.playWin();
            } else if (typeof window.audioEngine.playBell === 'function') {
              window.audioEngine.playBell();
            }
          }
        } catch (audioErr) {
          console.warn("Audio feedback error:", audioErr);
        }
      }
    } catch (err) {
      console.error("Sync database failed:", err);
      alert(`Synchronisatie mislukt: ${err.message}. Controleer je internetverbinding.`);
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.innerHTML = '🔄 Sync Database';
      }
    }
  }

  /**
   * Display statistics popup modal after successful GitHub sync
   */
  _showSyncStatsModal(data, syncTime) {
    const modal = this.elements.dbSyncStatsModal;
    const body = this.elements.dbSyncStatsBody;
    if (!modal || !body) return;

    const totalExercises = Object.values(this.database).reduce((acc, list) => acc + list.length, 0);
    const materialsCount = Object.keys(this.database).length;
    const categories = new Set();
    let withVideo = 0;

    Object.values(this.database).forEach(list => {
      list.forEach(ex => {
        if (ex.category) categories.add(ex.category);
        if (ex.video_search_url && !this.brokenVideoExerciseIds.has(ex.id)) withVideo++;
      });
    });

    const formattedTime = syncTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }) + 
      ' op ' + syncTime.toLocaleDateString();

    body.innerHTML = `
      <div style="font-size:0.85rem; color:#aaa; line-height:1.4;">
        Succesvol de meest recente oefeningen database binnengehaald vanaf <strong style="color:var(--neon-cyan);">github.com/rthepen/workout-database</strong>.
      </div>
      <div class="db-stats-grid">
        <div class="db-stat-box">
          <span class="db-stat-num">${totalExercises}</span>
          <span class="db-stat-lbl">Totaal Oefeningen</span>
        </div>
        <div class="db-stat-box">
          <span class="db-stat-num" style="color:var(--neon-pink);">${materialsCount}</span>
          <span class="db-stat-lbl">Workout Stations</span>
        </div>
        <div class="db-stat-box">
          <span class="db-stat-num" style="color:var(--neon-green);">${withVideo}</span>
          <span class="db-stat-lbl">Met YouTube Video</span>
        </div>
        <div class="db-stat-box">
          <span class="db-stat-num" style="color:var(--neon-yellow);">${categories.size}</span>
          <span class="db-stat-lbl">Categorieën</span>
        </div>
      </div>
      <div style="background:rgba(255,255,255,0.04); border-radius:8px; padding:0.6rem 0.8rem; font-size:0.75rem; color:#8888aa; display:flex; justify-content:space-between;">
        <span>Tijdstip:</span>
        <span style="color:#fff; font-weight:bold;">${formattedTime}</span>
      </div>
    `;

    modal.style.display = 'flex';
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
    this.countdownTime = parseInt(this._getCookie('workout_countdown_time')) || 15;
    this.classStartTime = this._getCookie('workout_class_start') || '';
    this.classEndTime = this._getCookie('workout_class_end') || '';
    this.volume = parseFloat(this._getCookie('workout_volume')) || 2.0;
    this.autoPlay = true; // Auto-play is always on
    this.coach = this._getCookie('workout_coach') || 'tabataman';
    this.requireVideo = this._getCookie('workout_require_video') !== 'false';
    this.noRepeatExercises = this._getCookie('workout_no_repeat_exercises') !== 'false';
    this.noRepeatMaterials = this._getCookie('workout_no_repeat_materials') !== 'false';
    this.teamCount = parseInt(this._getCookie('workout_team_count')) || 1;
    this.circuitRotation = this._getCookie('workout_circuit_rotation') !== 'false';
    
    // Default class schedule: Start 20:15, End 20:40
    // If reloaded between 20:15 and 20:40: keep end at 20:40, set start to now + 1 min
    const now = new Date();
    const tStart2015 = new Date(now);
    tStart2015.setHours(20, 15, 0, 0);

    const tEnd2040 = new Date(now);
    tEnd2040.setHours(20, 40, 0, 0);

    if (now >= tStart2015 && now < tEnd2040) {
      // Inside 20:15 - 20:40 window: start over 1 minuut vanaf huidige tijd
      const oneMinLater = new Date(now.getTime() + 1 * 60000);
      const sH = String(oneMinLater.getHours()).padStart(2, '0');
      const sM = String(oneMinLater.getMinutes()).padStart(2, '0');
      this.classStartTime = `${sH}:${sM}`;
      this.classEndTime = '20:40';
    } else {
      // Default standard times
      this.classStartTime = '20:15';
      this.classEndTime = '20:40';
    }

    this._setCookie('workout_class_start', this.classStartTime);
    this._setCookie('workout_class_end', this.classEndTime);

    if (this.elements.classStartInput) {
      this.elements.classStartInput.value = this.classStartTime;
    }
    if (this.elements.classEndInput) {
      this.elements.classEndInput.value = this.classEndTime;
    }
    if (this.elements.quickTeamSelect) {
      this.elements.quickTeamSelect.value = String(this.teamCount);
    }
    if (this.elements.teamCountInput) {
      this.elements.teamCountInput.value = String(this.teamCount);
    }
    if (this.elements.circuitRotationInput) {
      this.elements.circuitRotationInput.checked = this.circuitRotation;
    }
    this.elements.minTimeInput.value = this.minTime;
    this.elements.maxTimeInput.value = this.maxTime;
    this.elements.countdownTimeInput.value = this.countdownTime;
    this.elements.volumeInput.value = Math.round(this.volume * 100);
    if (this.elements.coachSelect) {
      this.elements.coachSelect.value = this.coach;
    }
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

    // Always reset session history on page load so a fresh workout begins
    this.usedHistory = [];
    this.usedExerciseIds = new Set();
    this.usedMaterials = new Set();
    this._sessionExerciseCount = 0;
    this.currentScheduleIndex = 0;
    this.currentRotationIndex = 0;
    this._isSessionActive = false;
    this._exactStartTimestamp = null;
    this._initTeamData(false);
    try {
      localStorage.removeItem('workout_used_history');
      localStorage.removeItem('workout_team_data');
      localStorage.removeItem('workout_global_material_counts');
    } catch (e) {}

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
  }

  /**
   * Change team count and reconfigure slot reels dynamically
   */
  setTeamCount(count) {
    const newCount = Math.max(1, Math.min(8, count || 1));
    this.teamCount = newCount;
    this._setCookie('workout_team_count', this.teamCount);

    if (this.elements.quickTeamSelect) {
      this.elements.quickTeamSelect.value = String(this.teamCount);
    }
    if (this.elements.teamCountInput) {
      this.elements.teamCountInput.value = String(this.teamCount);
    }

    if (this.elements.appMain) {
      if (this.teamCount > 1) {
        this.elements.appMain.classList.add('has-multi-teams');
      } else {
        this.elements.appMain.classList.remove('has-multi-teams');
      }
    }

    if (this.slotMachine && this.elements.slotReelsContainer) {
      this.slotMachine.configureTeams(this.teamCount, this.elements.slotReelsContainer);
      this.updateReelsPool();
    }

    this.currentRotationIndex = 0;
    this.generatePlannedSchedule(true);
  }

  saveSettings() {
    let min = parseInt(this.elements.minTimeInput.value) || 30;
    let max = parseInt(this.elements.maxTimeInput.value) || 120;
    let countdown = parseInt(this.elements.countdownTimeInput.value) || 15;
    let classStart = this.elements.classStartInput ? this.elements.classStartInput.value : '';
    let classEnd = this.elements.classEndInput.value || '';
    let vol = parseInt(this.elements.volumeInput.value) || 200;
    let coach = this.elements.coachSelect ? this.elements.coachSelect.value : 'tabataman';
    let requireVideo = this.elements.requireVideoInput.checked;
    let noRepeatExercises = this.elements.noRepeatExercisesInput ? this.elements.noRepeatExercisesInput.checked : true;
    let noRepeatMaterials = this.elements.noRepeatMaterialsInput ? this.elements.noRepeatMaterialsInput.checked : true;
    let teamCount = parseInt(this.elements.teamCountInput ? this.elements.teamCountInput.value : '1') || 1;
    let circuitRotation = this.elements.circuitRotationInput ? this.elements.circuitRotationInput.checked : true;

    if (min < 10) min = 10;
    if (max < min) max = min;
    if (countdown < 1) countdown = 1;
    if (countdown > 60) countdown = 60;
    if (vol < 0) vol = 0;
    if (vol > 300) vol = 300;

    this.minTime = min;
    this.maxTime = max;
    this.countdownTime = countdown;
    this.classStartTime = classStart;
    this.classEndTime = classEnd;
    this.volume = vol / 100;
    this.coach = coach;
    this.requireVideo = requireVideo;
    this.noRepeatExercises = noRepeatExercises;
    this.noRepeatMaterials = noRepeatMaterials;
    this.circuitRotation = circuitRotation;

    // 1. Direct Realtime Settings (Audio & Coach)
    this.volume = vol / 100;
    this.coach = coach;
    if (window.audioEngine) {
      window.audioEngine.setCoach(this.coach);
      window.audioEngine.setVolume(this.volume);
    }
    this._setCookie('workout_volume', this.volume);
    this._setCookie('workout_coach', this.coach);

    // 2. Commit parameter changes for future workouts
    this.minTime = min;
    this.maxTime = max;
    this.countdownTime = countdown;
    this.classStartTime = classStart;
    this.classEndTime = classEnd;
    this.requireVideo = requireVideo;
    this.noRepeatExercises = noRepeatExercises;
    this.noRepeatMaterials = noRepeatMaterials;
    this.circuitRotation = circuitRotation;

    this._setCookie('workout_min_time', this.minTime);
    this._setCookie('workout_max_time', this.maxTime);
    this._setCookie('workout_countdown_time', this.countdownTime);
    this._setCookie('workout_class_start', this.classStartTime);
    this._setCookie('workout_class_end', this.classEndTime);
    this._setCookie('workout_require_video', this.requireVideo);
    this._setCookie('workout_no_repeat_exercises', this.noRepeatExercises);
    this._setCookie('workout_no_repeat_materials', this.noRepeatMaterials);
    this._setCookie('workout_circuit_rotation', this.circuitRotation);

    let gUrl = this.elements.googleSheetsUrlInput ? this.elements.googleSheetsUrlInput.value.trim() : this.googleSheetsUrl;
    this.googleSheetsUrl = gUrl;
    this._setCookie('workout_google_sheets_url', this.googleSheetsUrl);
    try {
      localStorage.setItem('workout_google_sheets_url', this.googleSheetsUrl);
    } catch (e) {}

    // Save disabled exercises
    if (this.tempDisabledExerciseIds) {
      this.disabledExerciseIds = new Set(this.tempDisabledExerciseIds);
    }
    this._setCookie('workout_disabled_exercises', JSON.stringify(Array.from(this.disabledExerciseIds)));

    // 3. Check if training is currently running
    const isWorkoutActive = (this.currentState === 'countdown' || this.currentState === 'active' || (this.timer && this.timer.isRunning));

    if (isWorkoutActive) {
      // Training is actively running: queue team count change if altered so current station continues uninterrupted
      if (teamCount !== this.teamCount) {
        this._pendingTeamCount = teamCount;
        this._setCookie('workout_team_count', teamCount);
      }
      this._pendingReelsUpdate = true;
      // Re-plan future rounds from currentScheduleIndex onward
      this.generatePlannedSchedule(true);
      this.showToast("✓ Instellingen opgeslagen! Actief vanaf de volgende oefening.");
    } else {
      // Idle: apply team count and reels immediately
      if (teamCount !== this.teamCount) {
        this.setTeamCount(teamCount);
      }
      this.updateReelsPool();
      this.generatePlannedSchedule(true);
      if (this.elements.timerDigits) {
        this.elements.timerDigits.textContent = this.countdownTime;
      }
      this.renderStationsHUD();
      this.showToast("✓ Instellingen opgeslagen!");
    }

    // Clear tracking if toggled off
    if (!this.noRepeatExercises) {
      this.usedExerciseIds.clear();
    }
    if (!this.noRepeatMaterials) {
      this.usedMaterials.clear();
    }
    this._saveUsedHistory();

    // Update clock with new end time
    this.startClassClock();
    // Update used history UI
    this.renderUsedHistory();
  }

  /**
   * Initializes per-team tracking state for up to 8 teams
   */
  _initTeamData(keepExisting = true) {
    if (!this.teamData) this.teamData = [];
    for (let t = 0; t < 8; t++) {
      if (!this.teamData[t] || !keepExisting) {
        this.teamData[t] = {
          usedMaterials: new Set(),
          materialCounts: {},
          usedExerciseIds: new Set(),
          exerciseCounts: {},
          history: []
        };
      }
    }
    if (!this.globalMaterialCounts || !keepExisting) {
      this.globalMaterialCounts = {};
    }
  }

  /**
   * Records usage of an exercise and material for a specific team
   */
  _recordTeamUsage(teamIdx, material, exercise, time, stationNum) {
    if (!this.teamData[teamIdx]) this._initTeamData(true);
    const td = this.teamData[teamIdx];
    td.usedMaterials.add(material);
    td.materialCounts[material] = (td.materialCounts[material] || 0) + 1;
    td.usedExerciseIds.add(exercise.id);
    td.exerciseCounts[exercise.id] = (td.exerciseCounts[exercise.id] || 0) + 1;

    td.history.push({
      round: this._sessionExerciseCount,
      teamIndex: teamIdx,
      teamNum: teamIdx + 1,
      stationNum: stationNum,
      material: material,
      exerciseName: exercise.exercise_name,
      exerciseId: exercise.id,
      time: time,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    });

    this.globalMaterialCounts[material] = (this.globalMaterialCounts[material] || 0) + 1;

    if (this.noRepeatMaterials) {
      this.usedMaterials.add(material);
    }
    if (this.noRepeatExercises) {
      this.usedExerciseIds.add(exercise.id);
    }

    this.usedHistory.push({
      id: exercise.id,
      name: exercise.exercise_name,
      material: material,
      teamIndex: teamIdx,
      teamNum: teamIdx + 1,
      stationNum: stationNum,
      time: time,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    });
  }

  /**
   * Filter used history display by team
   */
  filterUsedHistory(teamIdx) {
    this._usedHistoryTeamFilter = teamIdx;
    this.renderUsedHistory();
  }

  /**
   * Save and render used pool items and per-team state
   */
  _saveUsedHistory() {
    try {
      localStorage.setItem('workout_used_history', JSON.stringify(this.usedHistory));

      const serializableTeamData = this.teamData.map(td => ({
        usedMaterials: Array.from(td.usedMaterials || []),
        materialCounts: td.materialCounts || {},
        usedExerciseIds: Array.from(td.usedExerciseIds || []),
        exerciseCounts: td.exerciseCounts || {},
        history: td.history || []
      }));
      localStorage.setItem('workout_team_data', JSON.stringify(serializableTeamData));
      localStorage.setItem('workout_global_material_counts', JSON.stringify(this.globalMaterialCounts));
    } catch (e) {}
  }

  resetUsedHistory() {
    this.usedExerciseIds.clear();
    this.usedMaterials.clear();
    this.usedHistory = [];
    this._initTeamData(false);
    this._saveUsedHistory();
    this.generatePlannedSchedule(true);
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

    const T = this.teamCount;
    const modeText = this.circuitRotation
      ? "Doordraaien (alle teams wisselen stations)"
      : "Unieke Oefeningen Per Team (geen doordraaien)";

    // Render Stats Badges
    let statsHtml = `
      <span class="used-history-badge" title="Totale unieke oefeningen">Oefeningen geweest: ${this.usedExerciseIds.size} / ${totalExercises}</span>
      <span class="used-history-badge" title="Totale unieke materialen">Materialen geweest: ${this.usedMaterials.size} / ${totalMaterials}</span>
      <span class="used-history-badge" style="border-color:${this.circuitRotation ? 'var(--neon-cyan)' : 'var(--neon-yellow)'}; color:${this.circuitRotation ? 'var(--neon-cyan)' : 'var(--neon-yellow)'}; font-size:0.7rem;">
        ${this.circuitRotation ? '🔄' : '⚡'} ${modeText}
      </span>
    `;

    // Multi-team tracker summary if T > 1
    if (T > 1) {
      statsHtml += `
        <div class="used-history-teams-summary">
          ${Array.from({ length: T }, (_, t) => {
            const teamNum = t + 1;
            const td = this.teamData[t] || { usedMaterials: new Set(), usedExerciseIds: new Set(), history: [] };
            const matList = Array.from(td.usedMaterials);
            const matsPreview = matList.length > 0 ? matList.slice(-4).join(', ') + (matList.length > 4 ? '...' : '') : 'Nog geen';
            return `
              <div class="team-summary-card team-border-${teamNum}">
                <div class="team-summary-card-header">
                  <span class="station-tab-team team-${teamNum}">TEAM ${teamNum}</span>
                  <span class="team-summary-count">${td.history.length} oef. • ${td.usedMaterials.size} mat.</span>
                </div>
                <div class="team-summary-mats" title="${matList.join(', ')}">
                  📦 ${matsPreview}
                </div>
              </div>
            `;
          }).join('')}
        </div>
      `;
    }

    this.elements.usedHistoryStats.innerHTML = statsHtml;

    // Filter controls for history list if T > 1
    const activeFilter = this._usedHistoryTeamFilter !== undefined ? this._usedHistoryTeamFilter : -1;
    let filterHtml = '';
    if (T > 1) {
      filterHtml = `
        <div class="used-history-filter-bar">
          <button class="btn btn-tiny ${activeFilter === -1 ? 'btn-cyan' : 'btn-outline'}" onclick="window.workoutApp.filterUsedHistory(-1)">Alle Teams</button>
          ${Array.from({ length: T }, (_, t) => `
            <button class="btn btn-tiny ${activeFilter === t ? 'btn-pink' : 'btn-outline'}" onclick="window.workoutApp.filterUsedHistory(${t})">Team ${t + 1}</button>
          `).join('')}
        </div>
      `;
    }

    // Filter list items
    let filteredHistory = [...this.usedHistory];
    if (T > 1 && activeFilter !== -1) {
      filteredHistory = filteredHistory.filter(item => item.teamIndex === activeFilter);
    }

    // Render History List
    if (filteredHistory.length === 0) {
      this.elements.usedHistoryList.innerHTML = `
        ${filterHtml}
        <div class="used-history-empty">Nog geen oefeningen geweest in deze ronde (alles zit in de pool).</div>
      `;
    } else {
      const itemsHtml = filteredHistory.reverse().map((item) => {
        const teamNum = (item.teamIndex !== undefined) ? (item.teamIndex + 1) : null;
        const teamBadge = (T > 1 && teamNum)
          ? `<span class="used-history-team-badge team-${teamNum}">TEAM ${teamNum}</span>`
          : '';
        return `
          <div class="used-history-item ${teamNum ? 'team-item-' + teamNum : ''}">
            <div class="used-history-item-left">
              <div style="display:flex; align-items:center; gap:0.4rem;">
                ${teamBadge}
                <span class="used-history-item-name">${item.name}</span>
              </div>
              <span class="used-history-item-material">${item.material}${item.timestamp ? ' • ' + item.timestamp : ''}</span>
            </div>
            <span class="used-history-item-time">${item.time}s</span>
          </div>
        `;
      }).join('');
      this.elements.usedHistoryList.innerHTML = filterHtml + itemsHtml;
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
   * Automatic background scan of all exercises without blocking the UI
   */
  async autoBackgroundScanVideos() {
    const allExercises = [];
    for (const mat in this.database) {
      for (const ex of this.database[mat]) {
        if (ex.video_search_url && ex.video_search_url.trim()) {
          allExercises.push(ex);
        }
      }
    }

    let hasNewBroken = false;
    for (const ex of allExercises) {
      const vId = this._extractYouTubeId(ex.video_search_url);
      if (!vId) {
        if (!this.brokenVideoExerciseIds.has(ex.id)) {
          this.brokenVideoExerciseIds.add(ex.id);
          this.logBrokenVideoToGoogleSheet(ex, 'Geen geldig YouTube ID (Automatische scan)');
          hasNewBroken = true;
        }
      } else {
        const isValid = await this.validateYouTubeVideo(vId);
        if (!isValid) {
          if (!this.brokenVideoExerciseIds.has(ex.id)) {
            this.brokenVideoExerciseIds.add(ex.id);
            this.logBrokenVideoToGoogleSheet(ex, 'Verbinding geweigerd / onbereikbaar (Automatische scan)');
            hasNewBroken = true;
          }
        }
      }
    }

    if (hasNewBroken) {
      this._saveBrokenVideos();
      this.buildAdminTree();
      this.updateReelsPool();
    }
  }

  /**
   * Scan entire database for broken/refused YouTube videos (Manual button)
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
   * Log completed workout / class session to Google Sheets (Tabblad 2: Afgeronde Workouts)
   */
  async logWorkoutCompletedToGoogleSheet() {
    const url = (this.googleSheetsUrl || '').trim();
    if (!url) return;

    const totalSeconds = this.usedHistory.reduce((acc, item) => acc + (item.time || 0), 0);
    const materialsUsed = Array.from(new Set(this.usedHistory.map(h => h.material))).join(', ');

    const payload = {
      event_type: 'workout_completed',
      type: 'Les Afgerond',
      timestamp: new Date().toLocaleString('nl-NL'),
      exercise_count: this.usedHistory.length,
      total_work_time: totalSeconds,
      materials_used: materialsUsed || 'Geen',
      coach: this.coach || 'tabataman',
      class_end_time: this.classEndTime || 'Handmatig beëindigd',
      app: 'Fruitautomaat'
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
      console.log('[Google Sheet] Afgeronde workout succesvol gelogd naar tabblad Afgeronde Workouts!');
    } catch (err) {
      console.warn('[Google Sheet] Fout bij loggen afgeronde workout:', err);
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
    // Prevent false trigger on fresh page reload before session is active
    if (!this._isSessionActive && this.usedHistory.length === 0) {
      return false;
    }
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
   * Quick start: set start time to 10 seconds from now and begin 10s countdown
   */
  setStartNowIn10Seconds() {
    const target = new Date(Date.now() + 10000);
    const hh = String(target.getHours()).padStart(2, '0');
    const mm = String(target.getMinutes()).padStart(2, '0');
    this.classStartTime = `${hh}:${mm}`;
    if (this.elements.classStartInput) {
      this.elements.classStartInput.value = this.classStartTime;
    }
    this._setCookie('workout_class_start', this.classStartTime);
    
    // If duration dropdown has a chosen value, recompute end time
    const mins = parseInt(this.elements.classDurationSelect?.value);
    if (mins && mins > 0) {
      this.calculateEndTimeFromDuration(mins);
    }
    
    this._isSessionActive = false;
    this._exactStartTimestamp = target.getTime();
    this.generatePlannedSchedule(true);
    this.startClassClock();
    this.openAdmin(false);
  }

  /**
   * Calculate and set classEndTime based on selected minutes duration
   */
  calculateEndTimeFromDuration(minutes) {
    let baseDate = new Date();
    const startVal = this.elements.classStartInput ? this.elements.classStartInput.value : this.classStartTime;
    if (startVal) {
      const [sH, sM] = startVal.split(':').map(Number);
      baseDate.setHours(sH, sM, 0, 0);
    }
    const endDate = new Date(baseDate.getTime() + minutes * 60000);
    const endHH = String(endDate.getHours()).padStart(2, '0');
    const endMM = String(endDate.getMinutes()).padStart(2, '0');
    this.classEndTime = `${endHH}:${endMM}`;
    if (this.elements.classEndInput) {
      this.elements.classEndInput.value = this.classEndTime;
    }
    this._setCookie('workout_class_end', this.classEndTime);
    this.generatePlannedSchedule(true);
    this.startClassClock();
  }

  /**
   * Starts the live header clock and schedule countdown ticker
   */
  startClassClock() {
    if (this._clockInterval) clearInterval(this._clockInterval);
    const tick = () => {
      // Guard: do not tick auto-start if database has not loaded yet
      if (!this.database || Object.keys(this.database).length === 0) return;

      const now = new Date();
      const hh = String(now.getHours()).padStart(2, '0');
      const mm = String(now.getMinutes()).padStart(2, '0');
      const ss = String(now.getSeconds()).padStart(2, '0');
      if (this.elements.headerCurrentTime) {
        this.elements.headerCurrentTime.textContent = `${hh}:${mm}:${ss}`;
      }
      
      // Auto-start check when precision timestamp or start time is configured
      if (this._exactStartTimestamp && !this._isSessionActive) {
        const diffMs = this._exactStartTimestamp - now.getTime();
        if (diffMs <= 0) {
          this._exactStartTimestamp = null;
          this._isSessionActive = true;
          this.handleSpin();
        } else {
          const diffSec = Math.ceil(diffMs / 1000);
          if (this.elements.headerClassEnd) {
            this.elements.headerClassEnd.textContent = `LES START: ${this.classStartTime || 'NU'}`;
            this.elements.headerClassEnd.style.display = '';
          }
          if (this.elements.headerRemaining) {
            this.elements.headerRemaining.textContent = `START OVER ${diffSec}s`;
            this.elements.headerRemaining.className = 'header-clock-remaining urgent';
          }
          return;
        }
      } else if (this.classStartTime && !this._isSessionActive) {
        const [startH, startM] = this.classStartTime.split(':').map(Number);
        const startDate = new Date(now);
        startDate.setHours(startH, startM, 0, 0);

        if (now >= startDate) {
          // Scheduled start time reached: start session automatically!
          this._isSessionActive = true;
          this.handleSpin();
        } else {
          // Waiting for start time: render countdown in header
          if (this.elements.headerClassEnd) {
            this.elements.headerClassEnd.textContent = `LES START: ${String(startH).padStart(2, '0')}:${String(startM).padStart(2, '0')}`;
            this.elements.headerClassEnd.style.display = '';
          }
          if (this.elements.headerRemaining) {
            const diffSec = Math.max(0, Math.floor((startDate - now) / 1000));
            const rm = Math.floor(diffSec / 60);
            const rs = diffSec % 60;
            this.elements.headerRemaining.textContent = `START OVER ${rm}m ${String(rs).padStart(2, '0')}s`;
            this.elements.headerRemaining.className = 'header-clock-remaining';
          }
          return;
        }
      }

      // Live end time ticker when active
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
   * =========================================================================
   * PRE-PLANNED WORKOUT SCHEDULE & SECRET PLANNER ENGINE
   * =========================================================================
   */

  /**
   * Helper: Creates a clean simulated team tracker for advance schedule generation
   */
  _createSimTracker() {
    const simTracker = {
      teamData: [],
      globalMaterialCounts: {}
    };
    for (let t = 0; t < 8; t++) {
      simTracker.teamData.push({
        usedMaterials: new Set(),
        materialCounts: {},
        usedExerciseIds: new Set(),
        exerciseCounts: {}
      });
    }
    return simTracker;
  }

  /**
   * Optimal Station Assignment Engine
   * Assigns strictly unique materials and exercises to each team.
   * Eliminates repeat bias across teams and ensures fair, balanced rotation.
   */
  _assignOptimalTeamStations(teamCount, trackerData, activeMaterials, activeExercisesMap) {
    if (!activeMaterials || activeMaterials.length === 0) return [];
    const T = Math.max(1, Math.min(8, teamCount));
    const td = trackerData.teamData || trackerData;
    const gc = trackerData.globalMaterialCounts || this.globalMaterialCounts || {};

    let chosenMaterials = [];

    if (activeMaterials.length < T) {
      // Edge-case: fewer materials enabled than teams -> allow shared materials with minimal duplication
      const roundCounts = {};
      for (let t = 0; t < T; t++) {
        const teamInfo = td[t] || { materialCounts: {} };
        const sorted = [...activeMaterials].sort((a, b) => {
          const costA = (teamInfo.materialCounts[a] || 0) * 10000 + (roundCounts[a] || 0) * 1000 + (gc[a] || 0) * 100 + Math.random() * 5;
          const costB = (teamInfo.materialCounts[b] || 0) * 10000 + (roundCounts[b] || 0) * 1000 + (gc[b] || 0) * 100 + Math.random() * 5;
          return costA - costB;
        });
        const picked = sorted[0];
        roundCounts[picked] = (roundCounts[picked] || 0) + 1;
        chosenMaterials.push(picked);
      }
    } else {
      // Standard case: active materials >= teams -> find optimal distinct assignment
      const teamOptions = [];
      for (let t = 0; t < T; t++) {
        const teamInfo = td[t] || { materialCounts: {}, usedExerciseIds: new Set() };
        const opts = activeMaterials.map(m => {
          const teamCnt = teamInfo.materialCounts[m] || 0;
          const globCnt = gc[m] || 0;
          const exs = activeExercisesMap[m] || [];
          const hasUnused = exs.some(e => !teamInfo.usedExerciseIds || !teamInfo.usedExerciseIds.has(e.id));
          return {
            material: m,
            cost: teamCnt * 10000 + globCnt * 100 + (hasUnused ? 0 : 500) + Math.random() * 5
          };
        });
        opts.sort((a, b) => a.cost - b.cost);
        teamOptions.push(opts);
      }

      let bestCost = Infinity;
      let bestAssignment = null;
      const assigned = new Set();
      const current = [];

      const backtrack = (teamIdx, currentCost) => {
        if (currentCost >= bestCost) return;
        if (teamIdx === T) {
          bestCost = currentCost;
          bestAssignment = [...current];
          return;
        }

        const options = teamOptions[teamIdx];
        for (let i = 0; i < options.length; i++) {
          const opt = options[i];
          if (assigned.has(opt.material)) continue;

          assigned.add(opt.material);
          current.push(opt.material);

          backtrack(teamIdx + 1, currentCost + opt.cost);

          current.pop();
          assigned.delete(opt.material);
        }
      };

      backtrack(0, 0);
      chosenMaterials = bestAssignment || activeMaterials.slice(0, T);
    }

    // Now select a unique or least-used exercise for each team's chosen material
    return chosenMaterials.map((mat, idx) => {
      const teamInfo = td[idx] || { usedExerciseIds: new Set(), exerciseCounts: {} };
      const exs = activeExercisesMap[mat] || [];

      let eligible = exs.filter(e => !teamInfo.usedExerciseIds || !teamInfo.usedExerciseIds.has(e.id));
      if (eligible.length === 0) {
        let minCount = Infinity;
        for (const e of exs) {
          const cnt = (teamInfo.exerciseCounts && teamInfo.exerciseCounts[e.id]) || 0;
          if (cnt < minCount) minCount = cnt;
        }
        eligible = exs.filter(e => ((teamInfo.exerciseCounts && teamInfo.exerciseCounts[e.id]) || 0) === minCount);
      }
      if (eligible.length === 0) eligible = exs;

      const chosenEx = eligible[Math.floor(Math.random() * eligible.length)];
      return {
        stationIndex: idx,
        material: mat,
        exercise: chosenEx
      };
    });
  }

  /**
   * Helper: Selects strictly unique materials and matching exercises for multi-team circuit stations
   */
  _pickMultiTeamStations(teamCount) {
    const activeMaterials = [];
    const activeExercisesMap = {};

    for (const mat in this.database) {
      const exs = this.database[mat].filter(ex => {
        if (this.disabledExerciseIds.has(ex.id)) return false;
        if (this.requireVideo && !this._hasValidWorkingVideo(ex)) return false;
        return true;
      });
      if (exs.length > 0) {
        activeMaterials.push(mat);
        activeExercisesMap[mat] = exs;
      }
    }

    if (activeMaterials.length === 0) return [];

    return this._assignOptimalTeamStations(
      teamCount,
      { teamData: this.teamData, globalMaterialCounts: this.globalMaterialCounts },
      activeMaterials,
      activeExercisesMap
    );
  }

  /**
   * Generates a complete workout sequence in advance and pre-tests all videos in parallel
   */
  async generatePlannedSchedule(forceNew = false) {
    if (!forceNew && this.plannedSchedule.length > 0) return;

    this._isScheduleValidating = true;

    const activeMaterials = [];
    const activeExercisesMap = {};
    const allEnabled = [];

    for (const mat in this.database) {
      const exs = this.database[mat].filter(ex => {
        if (this.disabledExerciseIds.has(ex.id)) return false;
        if (this.requireVideo && !this._hasValidWorkingVideo(ex)) return false;
        return true;
      });
      if (exs.length > 0) {
        activeMaterials.push(mat);
        activeExercisesMap[mat] = exs;
        allEnabled.push(...exs);
      }
    }

    if (activeMaterials.length === 0 || allEnabled.length === 0) {
      this.plannedSchedule = [];
      this._isScheduleValidating = false;
      this.renderSecretSchedule();
      return;
    }

    // Determine target duration in seconds
    let totalSessionSeconds = 2700; // 45 min default
    if (this.classStartTime && this.classEndTime) {
      const [sH, sM] = this.classStartTime.split(':').map(Number);
      const [eH, eM] = this.classEndTime.split(':').map(Number);
      const startMin = sH * 60 + sM;
      let endMin = eH * 60 + eM;
      if (endMin < startMin) endMin += 24 * 60;
      totalSessionSeconds = Math.max(300, (endMin - startMin) * 60);
    } else if (this.classEndTime) {
      const now = new Date();
      const [eH, eM] = this.classEndTime.split(':').map(Number);
      const endMin = eH * 60 + eM;
      const nowMin = now.getHours() * 60 + now.getMinutes();
      let diff = (endMin - nowMin) * 60;
      if (diff > 300) totalSessionSeconds = diff;
    }

    const minStep = Math.ceil(this.minTime / 10) * 10;
    const maxStep = Math.floor(this.maxTime / 10) * 10;
    const timeChoices = [];
    for (let t = minStep; t <= maxStep; t += 10) timeChoices.push(t);

    const avgWorkSec = (minStep + maxStep) / 2;
    const multiplier = this.circuitRotation ? this.teamCount : 1;
    const roundDurationSec = (avgWorkSec + this.countdownTime + 3) * multiplier;
    const countNeeded = Math.max(4, Math.ceil(totalSessionSeconds / roundDurationSec));

    const simTracker = this._createSimTracker();
    const newSchedule = [];
    let accumSeconds = 0;

    for (let i = 0; i < countNeeded; i++) {
      const chosenTime = timeChoices[Math.floor(Math.random() * timeChoices.length)] || 40;

      const roundStations = this._assignOptimalTeamStations(
        this.teamCount,
        simTracker,
        activeMaterials,
        activeExercisesMap
      );

      // Record simulated usage in simTracker
      for (let t = 0; t < roundStations.length; t++) {
        const st = roundStations[t];
        if (this.circuitRotation) {
          // With rotation, every team performs all stations in this round
          for (let u = 0; u < this.teamCount; u++) {
            const teamInfo = simTracker.teamData[u];
            teamInfo.usedMaterials.add(st.material);
            teamInfo.materialCounts[st.material] = (teamInfo.materialCounts[st.material] || 0) + 1;
            teamInfo.usedExerciseIds.add(st.exercise.id);
            teamInfo.exerciseCounts[st.exercise.id] = (teamInfo.exerciseCounts[st.exercise.id] || 0) + 1;
          }
        } else {
          // Without rotation: Team t performs station t exclusively!
          const teamInfo = simTracker.teamData[t];
          teamInfo.usedMaterials.add(st.material);
          teamInfo.materialCounts[st.material] = (teamInfo.materialCounts[st.material] || 0) + 1;
          teamInfo.usedExerciseIds.add(st.exercise.id);
          teamInfo.exerciseCounts[st.exercise.id] = (teamInfo.exerciseCounts[st.exercise.id] || 0) + 1;
        }
        simTracker.globalMaterialCounts[st.material] = (simTracker.globalMaterialCounts[st.material] || 0) + 1;
      }

      accumSeconds += ((this.countdownTime + chosenTime + 3) * multiplier);

      newSchedule.push({
        id: roundStations[0].exercise.id,
        exercise: roundStations[0].exercise,
        material: roundStations[0].material,
        stations: roundStations,
        time: chosenTime,
        status: 'pending',
        videoValid: true
      });

      if (accumSeconds >= totalSessionSeconds) break;
    }

    // Fast parallel background video validation across all scheduled items
    const validationPromises = [];
    newSchedule.forEach((item) => {
      const stationsToValidate = item.stations || [{ exercise: item.exercise, material: item.material }];
      stationsToValidate.forEach((st) => {
        validationPromises.push((async () => {
          const vId = this._extractYouTubeId(st.exercise.video_search_url);
          if (vId) {
            const isValid = await this.validateYouTubeVideo(vId);
            if (!isValid) {
              this.brokenVideoExerciseIds.add(st.exercise.id);
              this._saveBrokenVideos();
              this.logBrokenVideoToGoogleSheet(st.exercise, 'Pre-scan defect gevonden');
              const alt = allEnabled.find(a => a.id !== st.exercise.id && this._hasValidWorkingVideo(a));
              if (alt) {
                st.exercise = alt;
                st.material = alt.material_name || st.material;
              }
            }
          }
        })());
      });
    });

    await Promise.all(validationPromises);
    this._isScheduleValidating = false;

    const isWorkoutActive = (this.currentState === 'countdown' || this.currentState === 'active' || (this.timer && this.timer.isRunning));

    if (isWorkoutActive && this.plannedSchedule.length > 0 && this.currentScheduleIndex > 0) {
      // Keep past and current active rounds intact; replace only future rounds
      const preservedPastRounds = this.plannedSchedule.slice(0, this.currentScheduleIndex);
      this.plannedSchedule = [...preservedPastRounds, ...newSchedule];
    } else {
      this.plannedSchedule = newSchedule;
      this.currentScheduleIndex = 0;
    }
    this.renderSecretSchedule();
  }

  /**
   * Open / close the secret planner drawer
   */
  openSecretPlanner(isOpen) {
    if (!this.elements.secretPlannerOverlay) return;
    if (isOpen) {
      this.renderSecretSchedule();
      this.elements.secretPlannerOverlay.classList.add('open');
      this.elements.secretPlannerOverlay.setAttribute('aria-hidden', 'false');
    } else {
      this.elements.secretPlannerOverlay.classList.remove('open');
      this.elements.secretPlannerOverlay.setAttribute('aria-hidden', 'true');
    }
  }

  /**
   * Render the Secret Schedule UI list
   */
  renderSecretSchedule() {
    if (!this.elements.secretScheduleList || !this.elements.secretPlannerStats) return;

    const totalCount = this.plannedSchedule.length;
    const totalSecs = this.plannedSchedule.reduce((acc, item) => acc + item.time, 0);
    const mins = Math.round(totalSecs / 60);

    this.elements.secretPlannerStats.innerHTML = `
      <span class="used-history-badge">📋 ${totalCount} Geplande oefeningen</span>
      <span class="used-history-badge">⏱ ~${mins} min totale werktijd</span>
      <span class="used-history-badge" style="color:#39ff14;">✓ Alle video's vooraf gecontroleerd</span>
    `;

    if (totalCount === 0) {
      this.elements.secretScheduleList.innerHTML = `
        <div class="used-history-empty">Geen oefeningen in schema. Klik op 'Nieuw Schema Genereren'.</div>
      `;
      return;
    }

    const html = this.plannedSchedule.map((item, index) => {
      const isPast = index < this.currentScheduleIndex;
      const isCurrent = index === this.currentScheduleIndex;
      const statusClass = isCurrent ? 'item-active' : (isPast ? 'item-done' : '');

      const vId = this._extractYouTubeId(item.exercise.video_search_url || '');
      const thumb = (item.exercise.thumbnail || '').trim() || (vId ? `https://img.youtube.com/vi/${vId}/hqdefault.jpg` : '');

      return `
        <div class="secret-schedule-item ${statusClass}">
          <div class="secret-item-left">
            <div class="secret-item-index">${index + 1}</div>
            ${thumb ? `<img class="secret-item-thumb" src="${thumb}" alt="${item.exercise.exercise_name}">` : ''}
            <div class="secret-item-info">
              <div class="secret-item-name">
                ${(item.stations && item.stations.length > 1) 
                  ? `Ronde ${index + 1} (${item.stations.length} Stations Circuit)` 
                  : item.exercise.exercise_name}
              </div>
              <div class="secret-item-meta" style="flex-wrap:wrap; gap:0.25rem;">
                ${(item.stations && item.stations.length > 1)
                  ? item.stations.map((st, si) => `<span style="background:rgba(255,255,255,0.06); padding:1px 5px; border-radius:4px; font-size:0.75rem;">T${si+1}: ${st.material} - ${st.exercise.exercise_name}</span>`).join('')
                  : `<span>📦 ${item.material}</span>`}
                <span class="secret-item-time-badge">${item.time}s per wissel</span>
                <span style="color:#39ff14; font-size:0.72rem;">● Video OK</span>
                ${isCurrent ? '<span style="color:var(--neon-pink); font-weight:800;">[NU AAN DE BEURT]</span>' : ''}
                ${isPast ? '<span style="color:#888;">[AFGEROND]</span>' : ''}
              </div>
            </div>
          </div>
          <div class="secret-item-right">
            <button class="secret-item-btn" onclick="window.workoutApp.moveScheduleItem(${index}, -1)" ${index === 0 ? 'disabled' : ''} title="Verplaats omhoog">
              ▲
            </button>
            <button class="secret-item-btn" onclick="window.workoutApp.moveScheduleItem(${index}, 1)" ${index === totalCount - 1 ? 'disabled' : ''} title="Verplaats omlaag">
              ▼
            </button>
            <button class="secret-item-btn" onclick="window.workoutApp.replaceScheduleItem(${index})" title="Vervang met een andere oefening">
              🎲
            </button>
            <button class="secret-item-btn btn-delete" onclick="window.workoutApp.deleteScheduleItem(${index})" title="Verwijder uit schema">
              🗑️
            </button>
          </div>
        </div>
      `;
    }).join('');

    this.elements.secretScheduleList.innerHTML = html;
  }

  /**
   * Move an exercise up or down in the planned schedule
   */
  moveScheduleItem(index, direction) {
    const target = index + direction;
    if (target < 0 || target >= this.plannedSchedule.length) return;
    const temp = this.plannedSchedule[index];
    this.plannedSchedule[index] = this.plannedSchedule[target];
    this.plannedSchedule[target] = temp;
    this.renderSecretSchedule();
  }

  /**
   * Delete an exercise from today's planned schedule
   */
  deleteScheduleItem(index) {
    if (this.plannedSchedule.length <= 1) {
      alert("Het schema moet tenminste 1 oefening bevatten.");
      return;
    }
    this.plannedSchedule.splice(index, 1);
    if (this.currentScheduleIndex > index) {
      this.currentScheduleIndex = Math.max(0, this.currentScheduleIndex - 1);
    }
    this.renderSecretSchedule();
  }

  /**
   * Replace a specific exercise with another random working one
   */
  async replaceScheduleItem(index) {
    const allEnabled = [];
    for (const mat in this.database) {
      for (const ex of this.database[mat]) {
        if (!this.disabledExerciseIds.has(ex.id) && this._hasValidWorkingVideo(ex)) {
          allEnabled.push({ ...ex, material: mat });
        }
      }
    }

    const currentId = this.plannedSchedule[index]?.id;
    const alternatives = allEnabled.filter(a => a.id !== currentId);
    if (alternatives.length === 0) return;

    const chosen = alternatives[Math.floor(Math.random() * alternatives.length)];
    this.plannedSchedule[index].id = chosen.id;
    this.plannedSchedule[index].exercise = chosen;
    this.plannedSchedule[index].material = chosen.material;
    this.renderSecretSchedule();
  }

  /**
   * Add a new exercise to the end of the planned schedule
   */
  async addExerciseToSchedule() {
    const allEnabled = [];
    for (const mat in this.database) {
      for (const ex of this.database[mat]) {
        if (!this.disabledExerciseIds.has(ex.id) && this._hasValidWorkingVideo(ex)) {
          allEnabled.push({ ...ex, material: mat });
        }
      }
    }
    if (allEnabled.length === 0) return;

    const chosen = allEnabled[Math.floor(Math.random() * allEnabled.length)];
    const minStep = Math.ceil(this.minTime / 10) * 10;
    const maxStep = Math.floor(this.maxTime / 10) * 10;
    const timeChoices = [];
    for (let t = minStep; t <= maxStep; t += 10) timeChoices.push(t);
    const chosenTime = timeChoices[Math.floor(Math.random() * timeChoices.length)] || 40;

    this.plannedSchedule.push({
      id: chosen.id,
      exercise: chosen,
      material: chosen.material,
      time: chosenTime,
      status: 'pending',
      videoValid: true
    });
    this.renderSecretSchedule();
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
   * Handle click on SPIN button (or automatic trigger on start time)
   */
  async handleSpin() {
    // Resume/unlock Web Audio immediately on user interaction
    if (window.audioEngine) {
      window.audioEngine.resumeContext();
    }

    // If class end time has been reached or remaining time is insufficient for full exercise cycle
    if (this._isClassFinished()) {
      if (window.audioEngine) window.audioEngine.playFinish();
      this.showClassFinishedModal();
      return;
    }

    // If user clicked SPIN before scheduled start time, immediately activate session
    const now = new Date();
    const nowHHMM = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    if (!this._isSessionActive) {
      this._isSessionActive = true;
      if (this.classStartTime && this.classStartTime > nowHHMM) {
        this.classStartTime = nowHHMM;
      }
    }

    // If a team count or reels pool change was queued while a workout was active, apply it now before spinning
    if (this._pendingTeamCount && this._pendingTeamCount !== this.teamCount) {
      this.setTeamCount(this._pendingTeamCount);
      this._pendingTeamCount = null;
      this._pendingReelsUpdate = false;
    } else if (this._pendingReelsUpdate) {
      this.updateReelsPool();
      this._pendingReelsUpdate = false;
    }

    // Ensure planned schedule exists
    if (this.plannedSchedule.length === 0) {
      await this.generatePlannedSchedule(true);
    }

    // Wait if background video checks for the schedule are still finishing
    if (this._isScheduleValidating) {
      if (this.elements.spinBtn) {
        this.elements.spinBtn.disabled = true;
        this.elements.spinBtn.textContent = "⏳ VIDEO'S TESTEN...";
      }
      let waitCount = 0;
      while (this._isScheduleValidating && waitCount < 50) {
        await new Promise(r => setTimeout(r, 100));
        waitCount++;
      }
      if (this.elements.spinBtn) {
        this.elements.spinBtn.textContent = "SPIN";
        this.elements.spinBtn.disabled = false;
      }
    }

    if (this.plannedSchedule.length === 0) {
      alert("Kies tenminste één actieve oefening in de instellingen!");
      this.openAdmin(true);
      return;
    }

    let chosenMaterial = null;
    let chosenExercise = null;
    let chosenTime = null;
    let chosenStations = [];

    if (this.currentScheduleIndex < this.plannedSchedule.length) {
      const item = this.plannedSchedule[this.currentScheduleIndex];
      chosenTime = item.time;
      if (item.stations && item.stations.length === this.teamCount) {
        chosenStations = item.stations;
      } else {
        chosenStations = this._pickMultiTeamStations(this.teamCount);
        item.stations = chosenStations;
      }
      chosenMaterial = chosenStations[0].material;
      chosenExercise = chosenStations[0].exercise;
      item.status = 'active';
      this.currentScheduleIndex++;
    } else {
      // Beyond initial schedule: pick time choices and multi-team stations
      const minStep = Math.ceil(this.minTime / 10) * 10;
      const maxStep = Math.floor(this.maxTime / 10) * 10;
      const timeChoices = [];
      for (let t = minStep; t <= maxStep; t += 10) timeChoices.push(t);
      chosenTime = timeChoices[Math.floor(Math.random() * timeChoices.length)] || 40;

      chosenStations = this._pickMultiTeamStations(this.teamCount);
      if (chosenStations.length === 0) {
        await this.addExerciseToSchedule();
        const item = this.plannedSchedule[this.plannedSchedule.length - 1];
        chosenStations = [{ stationIndex: 0, material: item.material, exercise: item.exercise }];
      }
      chosenMaterial = chosenStations[0].material;
      chosenExercise = chosenStations[0].exercise;

      this.plannedSchedule.push({
        id: chosenExercise.id,
        exercise: chosenExercise,
        material: chosenMaterial,
        stations: chosenStations,
        time: chosenTime,
        status: 'active'
      });
      this.currentScheduleIndex = this.plannedSchedule.length;
    }

    // Increment count of exercises performed in this session
    this._sessionExerciseCount++;

    // Track active stations and current circuit rotation
    this.activeStations = chosenStations;
    this.activeTime = chosenTime;
    this.currentRotationIndex = 0;
    this.activeStationPreviewIndex = 0;
    this.activeMaterial = chosenMaterial;
    this.activeExercise = chosenExercise;

    // Track non-repeat cycle sets, per-team usage, and validate videos
    for (let t = 0; t < chosenStations.length; t++) {
      const st = chosenStations[t];

      const videoId = this._extractYouTubeId(st.exercise.video_search_url);
      if (videoId) {
        this.validateYouTubeVideo(videoId).then(isValid => {
          if (!isValid) {
            this.brokenVideoExerciseIds.add(st.exercise.id);
            this._saveBrokenVideos();
            this.logBrokenVideoToGoogleSheet(st.exercise, 'Gedetecteerd tijdens spin');
          }
        });
      }

      if (this.circuitRotation) {
        // With circuit rotation: all teams will rotate through all stations in this round
        for (let u = 0; u < this.teamCount; u++) {
          if (!this.teamData[u]) this._initTeamData(true);
          const td = this.teamData[u];
          td.usedMaterials.add(st.material);
          td.materialCounts[st.material] = (td.materialCounts[st.material] || 0) + 1;
          td.usedExerciseIds.add(st.exercise.id);
          td.exerciseCounts[st.exercise.id] = (td.exerciseCounts[st.exercise.id] || 0) + 1;
          td.history.push({
            round: this._sessionExerciseCount,
            teamIndex: u,
            teamNum: u + 1,
            stationNum: t + 1,
            material: st.material,
            exerciseName: st.exercise.exercise_name,
            exerciseId: st.exercise.id,
            time: chosenTime,
            timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
          });
        }

        this.globalMaterialCounts[st.material] = (this.globalMaterialCounts[st.material] || 0) + 1;
        if (this.noRepeatMaterials) this.usedMaterials.add(st.material);
        if (this.noRepeatExercises) this.usedExerciseIds.add(st.exercise.id);

        this.usedHistory.push({
          id: st.exercise.id,
          name: st.exercise.exercise_name,
          material: st.material,
          stationNum: t + 1,
          time: chosenTime,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        });
      } else {
        // Without circuit rotation (doordraaien UIT): Team t performs station t exclusively!
        this._recordTeamUsage(t, st.material, st.exercise, chosenTime, t + 1);
      }
    }

    this._saveUsedHistory();
    this.renderSecretSchedule();
    this.renderUsedHistory();

    // Update UI status (keep admin button always accessible)
    this.elements.spinBtn.disabled = true;

    // Run animation
    this.slotMachine.spin(
      chosenStations,
      chosenTime,
      () => this.handleSpinComplete()
    );
  }

  /**
   * Slot machine finish hook
   */
  handleSpinComplete() {
    if (this.slotMachine && this.slotMachine.reels) {
      this.slotMachine.reels.forEach(r => r.container.classList.remove('active-spin'));
    }
    
    // Short celebration delay, then launch countdown
    setTimeout(() => {
      this.startCountdown();
    }, 1500);
  }

  /**
   * Check if current exercise is the final round of the workout session
   */
  _isCurrentExerciseLastRound() {
    if (this.plannedSchedule && this.plannedSchedule.length > 0 && this.currentScheduleIndex >= this.plannedSchedule.length) {
      return true;
    }

    if (this.classEndTime) {
      const [h, m] = this.classEndTime.split(':').map(Number);
      const now = new Date();
      const end = new Date(now);
      end.setHours(h, m, 0, 0);
      const remainingSecAfterThis = ((end - now) / 1000) - (this.countdownTime + this.activeTime);
      const requiredNext = this.countdownTime + this.minTime;
      if (remainingSecAfterThis < requiredNext) {
        return true;
      }
    }

    return false;
  }

  /**
   * Switch the video and instruction preview to a specific station
   */
  updatePreviewStation(stationIdx) {
    if (!this.activeStations || this.activeStations.length === 0) return;
    const station = this.activeStations[stationIdx] || this.activeStations[0];
    this.activeStationPreviewIndex = stationIdx;

    this.activeExercise = station.exercise;
    this.activeMaterial = station.material;

    // Set exercise info in single video overlay
    if (this.elements.hudExerciseName) this.elements.hudExerciseName.textContent = station.exercise.exercise_name;
    if (this.elements.hudMaterialInfo) this.elements.hudMaterialInfo.textContent = station.material;
    if (this.elements.instructionText) {
      this.elements.instructionText.textContent = station.exercise.instructions || "Voer de oefening gecontroleerd uit met de juiste techniek.";
    }

    const rawUrl = (station.exercise.video_search_url || '').trim();
    const videoId = this._extractYouTubeId(rawUrl);
    const thumb = (station.exercise.thumbnail || '').trim() || (videoId ? `https://img.youtube.com/vi/${videoId}/hqdefault.jpg` : '');

    if (this.elements.instructionThumbImg) {
      if (thumb) {
        this.elements.instructionThumbImg.src = thumb;
        this.elements.instructionThumbImg.style.display = 'block';
        if (this.elements.instructionThumbPreview) this.elements.instructionThumbPreview.style.display = 'flex';
      } else {
        this.elements.instructionThumbImg.src = '';
        this.elements.instructionThumbImg.style.display = 'none';
        if (this.elements.instructionThumbPreview) this.elements.instructionThumbPreview.style.display = 'none';
      }
    }

    this._loadYouTubeIframe();

    // Update active tab styling
    if (this.elements.stationsTrackerBar) {
      const tabs = this.elements.stationsTrackerBar.querySelectorAll('.station-tab');
      tabs.forEach((tab, i) => {
        tab.classList.toggle('active-preview', i === stationIdx);
      });
    }
  }

  /**
   * Render Circuit Rotation Badge, Tracker Bar tabs, and Glanceable Overview Panel
   */
  renderStationsHUD() {
    const T = this.teamCount;

    // 1. Rotation badge above timer
    if (this.elements.circuitRotationBadge) {
      if (this.circuitRotation && T > 1) {
        this.elements.circuitRotationBadge.textContent = `WISSEL ${this.currentRotationIndex + 1} / ${T}`;
        this.elements.circuitRotationBadge.style.display = 'inline-block';
      } else {
        this.elements.circuitRotationBadge.style.display = 'none';
      }
    }

    // 2. Stations Switcher Bar
    if (this.elements.stationsTrackerBar) {
      if (T > 1 && this.activeStations && this.activeStations.length > 0) {
        this.elements.stationsTrackerBar.style.display = 'flex';
        this.elements.stationsTrackerBar.innerHTML = this.activeStations.map((station, sIdx) => {
          // Team currently at station sIdx: with circuit rotation, rotate; otherwise 1:1
          const teamIdx = this.circuitRotation ? ((sIdx - this.currentRotationIndex + T) % T) : sIdx;
          const teamNum = teamIdx + 1;
          const isSelected = (sIdx === this.activeStationPreviewIndex);

          return `
            <div class="station-tab ${isSelected ? 'active-preview' : ''}" onclick="window.workoutApp.updatePreviewStation(${sIdx})">
              <div class="station-tab-header">
                <span class="station-tab-num">STATION ${sIdx + 1}</span>
                <span class="station-tab-team team-${teamNum}">TEAM ${teamNum}</span>
              </div>
              <div class="station-tab-name">${station.exercise.exercise_name}</div>
              <div class="station-tab-mat">${station.material}</div>
            </div>
          `;
        }).join('');
      } else {
        this.elements.stationsTrackerBar.style.display = 'none';
        this.elements.stationsTrackerBar.innerHTML = '';
      }
    }

    // 3. Stations Overview Panel below instructions
    if (this.elements.stationsOverviewPanel) {
      if (T > 1 && this.activeStations && this.activeStations.length > 0) {
        this.elements.stationsOverviewPanel.style.display = 'grid';
        this.elements.stationsOverviewPanel.innerHTML = this.activeStations.map((station, sIdx) => {
          const teamIdx = this.circuitRotation ? ((sIdx - this.currentRotationIndex + T) % T) : sIdx;
          const teamNum = teamIdx + 1;
          return `
            <div class="station-chip team-chip-${teamNum}">
              <div class="station-chip-header">
                <span class="station-chip-team">TEAM ${teamNum}</span>
                <span class="station-chip-num">STATION ${sIdx + 1}</span>
              </div>
              <div class="station-chip-ex">${station.exercise.exercise_name}</div>
              <div class="station-chip-mat">${station.material}</div>
            </div>
          `;
        }).join('');
      } else {
        this.elements.stationsOverviewPanel.style.display = 'none';
        this.elements.stationsOverviewPanel.innerHTML = '';
      }
    }
  }

  /**
   * Start the countdown phase
   */
  startCountdown() {
    this.switchView('countdown');

    // Render stations tracker and overview
    this.renderStationsHUD();

    // Update right panel preview to active station
    this.updatePreviewStation(this.activeStationPreviewIndex);

    // Set initial countdown number in unified timer
    this.elements.timerDigits.textContent = this.countdownTime;

    const isFirstRound = (this._sessionExerciseCount === 1 && this.currentRotationIndex === 0);
    const isLastRound = this._isCurrentExerciseLastRound() && (this.currentRotationIndex === this.teamCount - 1);

    this.timer.start(this.activeTime, {
      countdownDuration: this.countdownTime,
      playPrepIntro: isFirstRound,
      isLastRound: isLastRound,

      onCountdownTick: (secs) => {
        if (this.elements.timerDigits) this.elements.timerDigits.textContent = secs;
        if (this.elements.timerProgressFill) {
          const cdPercent = Math.max(0, Math.min(100, (secs / (this.countdownTime || 15)) * 100));
          this.elements.timerProgressFill.style.width = `${cdPercent}%`;
          if (secs <= 3) {
            this.elements.timerProgressFill.classList.add('low-time');
          } else {
            this.elements.timerProgressFill.classList.remove('low-time');
          }
        }
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

    // Setup progress bar
    if (this.elements.timerProgressFill) {
      this.elements.timerProgressFill.style.width = '100%';
      this.elements.timerProgressFill.classList.remove('low-time');
    }
    if (this.elements.timerDigits) {
      this.elements.timerDigits.classList.remove('low-time');
    }

    // Setup circular progress ring (if present)
    if (this.elements.timerProgressCircle) {
      const circle = this.elements.timerProgressCircle;
      const radius = circle.r ? circle.r.baseVal.value : 220;
      const circumference = 2 * Math.PI * radius;
      circle.style.strokeDasharray = `${circumference} ${circumference}`;
      circle.style.strokeDashoffset = circumference;
      circle.classList.remove('low-time');
    }

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

  /**
   * Render all team YouTube videos simultaneously in a multi-video grid
   */
  _renderMultiVideoGrid() {
    if (!this.elements.multiVideoGrid) return;
    const grid = this.elements.multiVideoGrid;
    const T = this.teamCount;

    grid.className = `multi-video-grid grid-teams-${T}`;
    grid.innerHTML = '';

    if (!this.activeStations || this.activeStations.length === 0) return;

    for (let teamIdx = 0; teamIdx < T; teamIdx++) {
      const teamNum = teamIdx + 1;
      // Calculate current station index for this team given circuit rotation or fixed stations
      const stationIdx = this.circuitRotation ? ((teamIdx + this.currentRotationIndex) % T) : teamIdx;
      const station = this.activeStations[stationIdx] || this.activeStations[0];
      const ex = station.exercise;
      const mat = station.material;

      const rawUrl = (ex.video_search_url || '').trim();
      const videoId = this._extractYouTubeId(rawUrl);
      const isBroken = this.brokenVideoExerciseIds.has(ex.id);
      const thumb = (ex.thumbnail || '').trim() || (videoId ? `https://img.youtube.com/vi/${videoId}/hqdefault.jpg` : '');

      const card = document.createElement('div');
      card.className = `team-video-card team-card-${teamNum}`;

      let playerMarkup = '';
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
          playsinline:    '1',
          enablejsapi:    '1',
          origin:         window.location.origin
        });
        playerMarkup = `
          <iframe
            src="https://www.youtube.com/embed/${videoId}?${params.toString()}"
            frameborder="0"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
            referrerpolicy="strict-origin-when-cross-origin"
            allowfullscreen
          ></iframe>
        `;
      } else {
        playerMarkup = `
          <img class="team-video-fallback" src="${thumb || ''}" alt="${ex.exercise_name}" style="${thumb ? 'display:block;' : 'display:none;'}">
        `;
      }

      card.innerHTML = `
        <div class="team-video-header">
          <span class="team-video-badge team-badge-${teamNum}">
            <span class="team-dot"></span> TEAM ${teamNum}
          </span>
          <div class="team-video-info">
            <span class="team-video-ex-title" title="${ex.exercise_name}">${ex.exercise_name}</span>
            <span class="team-video-mat-title">📦 ${mat}</span>
          </div>
          <span class="team-video-station-num">STATION ${stationIdx + 1}</span>
        </div>
        <div class="team-video-player-wrap">
          ${playerMarkup}
        </div>
      `;

      grid.appendChild(card);
    }
  }

  _loadYouTubeIframe() {
    if (this.teamCount > 1) {
      if (this.elements.singleTeamHudWrapper) this.elements.singleTeamHudWrapper.style.display = 'none';
      if (this.elements.multiVideoGrid) {
        this.elements.multiVideoGrid.style.display = 'grid';
        this._renderMultiVideoGrid();
      }
      return;
    }

    // Single team mode
    if (this.elements.multiVideoGrid) this.elements.multiVideoGrid.style.display = 'none';
    if (this.elements.singleTeamHudWrapper) this.elements.singleTeamHudWrapper.style.display = 'block';

    const iframe = this.elements.workoutIframe;
    const fallback = this.elements.videoFallbackImg;
    const slot = this.elements.videoSlot;

    if (!this.activeExercise) return;

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
        playsinline:    '1',
        enablejsapi:    '1',
        origin:         window.location.origin
      });
      iframe.src = `https://www.youtube.com/embed/${videoId}?${params.toString()}`;
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
    if (this.elements.multiVideoGrid) {
      const iframes = this.elements.multiVideoGrid.querySelectorAll('iframe');
      iframes.forEach(f => { f.src = ''; });
    }
  }

  /**
   * Update circular ring progress and digital clock text
   */
  updateHUDTimer(secondsRemaining) {
    if (this.elements.timerDigits) {
      this.elements.timerDigits.textContent = secondsRemaining;
      if (secondsRemaining <= 5) {
        this.elements.timerDigits.classList.add('low-time');
      } else {
        this.elements.timerDigits.classList.remove('low-time');
      }
    }
    
    // Calculate progress (0.0 to 1.0)
    const progress = this.timer ? this.timer.getProgress() : 0;
    const fillPercent = Math.max(0, Math.min(100, (1 - progress) * 100));

    // Update full-width horizontal progress bar
    if (this.elements.timerProgressFill) {
      this.elements.timerProgressFill.style.width = `${fillPercent}%`;
      if (secondsRemaining <= 5) {
        this.elements.timerProgressFill.classList.add('low-time');
      } else {
        this.elements.timerProgressFill.classList.remove('low-time');
      }
    }

    // Calculate circular ring progress (if present)
    if (this.elements.timerProgressCircle) {
      const circle = this.elements.timerProgressCircle;
      const radius = circle.r ? circle.r.baseVal.value : 220;
      const circumference = 2 * Math.PI * radius;
      const offset = circumference - (progress * circumference);
      circle.style.strokeDashoffset = offset;
      if (secondsRemaining <= 5) {
        circle.classList.add('low-time');
      } else {
        circle.classList.remove('low-time');
      }
    }
  }

  /**
   * Trainer Controls - Pause / Resume
   */
  toggleWorkoutPause() {
    if (this.timer.state === 'RUNNING' || this.timer.state === 'COUNTDOWN') {
      this.timer.pause();
      this._stopYouTubeIframe();
      this.elements.btnPause.innerHTML = '▶ <span style="margin-left: 5px;">VERVOLG</span>';
      this.elements.btnPause.className = 'btn btn-pink';
    } else if (this.timer.state === 'PAUSED') {
      this.timer.resume();
      this._loadYouTubeIframe();
      this.elements.btnPause.innerHTML = '⏸ <span style="margin-left: 5px;">PAUZE</span>';
      this.elements.btnPause.className = 'btn btn-cyan';
    }
  }

  /**
   * Trainer Controls - Skip
   */
  skipWorkout() {
    if (this.timer.state === 'RUNNING' || this.timer.state === 'PAUSED' || this.timer.state === 'COUNTDOWN') {
      this.timer.skip();
    }
  }

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
   * Handle workout complete phase with circuit station rotations
   */
  handleWorkoutComplete() {
    this._stopYouTubeIframe();

    const T = this.teamCount;

    // 🔄 CHECK IF MORE ROTATIONS REMAIN IN THIS ROUND
    if (this.circuitRotation && T > 1 && this.currentRotationIndex < T - 1) {
      if (window.audioEngine) window.audioEngine.playSwitch();

      const nextRot = this.currentRotationIndex + 1;
      const overlay = this.elements.finishedOverlay;

      if (this.elements.finishedOverlayTitle) {
        this.elements.finishedOverlayTitle.textContent = "DOORWISSELEN! 🔄";
      }
      if (this.elements.finishedExercise) {
        this.elements.finishedExercise.textContent = `Wissel naar het volgende station (${this.currentRotationIndex + 1} ➔ ${nextRot + 1} van ${T})`;
      }

      // Build rotation transition cards showing clearly which team does which exercise
      if (this.elements.finishedRotationDetails) {
        this.elements.finishedRotationDetails.style.display = 'grid';
        let detailsHtml = '';
        for (let teamIdx = 0; teamIdx < T; teamIdx++) {
          const teamNum = teamIdx + 1;
          const nextStationIndex = (teamIdx + nextRot) % T;
          const nextStationNum = nextStationIndex + 1;
          const targetStation = this.activeStations[nextStationIndex] || this.activeStations[0];
          const exName = targetStation.exercise.exercise_name || "Oefening";
          const matName = targetStation.material || "Materiaal";

          detailsHtml += `
            <div class="rotation-team-card team-border-${teamNum}">
              <div class="rotation-team-card-header">
                <span class="rotation-team-badge team-badge-${teamNum}">
                  <span class="team-dot"></span> TEAM ${teamNum}
                </span>
                <span class="rotation-station-label">Station ${nextStationNum}</span>
              </div>
              <div class="rotation-team-ex-name">${exName}</div>
              <div class="rotation-team-mat">📦 ${matName}</div>
            </div>
          `;
        }
        this.elements.finishedRotationDetails.innerHTML = detailsHtml;
      }

      overlay.classList.add('show');

      // Advance rotation index & rotate station preview
      this.currentRotationIndex = nextRot;
      this.activeStationPreviewIndex = (this.activeStationPreviewIndex + 1) % T;

      // 4.5s transition display so teams can clearly see their new exercise and station
      setTimeout(() => {
        overlay.classList.remove('show');
        if (this.elements.finishedRotationDetails) {
          this.elements.finishedRotationDetails.style.display = 'none';
        }
        if (this.elements.finishedOverlayTitle) {
          this.elements.finishedOverlayTitle.textContent = "LEKKER BEZIG! 🔥";
        }

        // Start countdown for next station directly
        this.startCountdown();
      }, 4500);

      return;
    }

    // ── ALL ROTATIONS COMPLETE FOR THIS ROUND ──
    const isClassFinished = this._isClassFinished();

    if (isClassFinished) {
      if (window.audioEngine) window.audioEngine.playFinish();
      this.autoPlay = false;
      this.updateAutoPlayUI();
      this.showClassFinishedModal();
    } else {
      if (window.audioEngine) window.audioEngine.playSwitch();

      const overlay = this.elements.finishedOverlay;
      if (this.elements.finishedOverlayTitle) {
        this.elements.finishedOverlayTitle.textContent = "RONDE VOLTOOID! 🔥";
      }
      if (this.elements.finishedExercise) {
        this.elements.finishedExercise.textContent = (T > 1)
          ? `Alle ${T} teams hebben alle stations afgerond! Klaar voor de volgende ronde.`
          : `${this.activeExercise ? this.activeExercise.exercise_name : 'Oefening'} afgerond. Wissel naar volgende!`;
      }
      if (this.elements.finishedRotationDetails) {
        this.elements.finishedRotationDetails.style.display = 'none';
      }
      overlay.classList.add('show');

      // Hide after 3 seconds, then return to idle or auto-spin
      setTimeout(() => {
        overlay.classList.remove('show');
        if (this.elements.finishedOverlayTitle) {
          this.elements.finishedOverlayTitle.textContent = "LEKKER BEZIG! 🔥";
        }

        this.elements.spinBtn.disabled = false;
        this.elements.adminOpenBtn.disabled = false;

        if (this.autoPlay && !this._isClassFinished()) {
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

    if (this.elements.classFinishedTeamsSummary) {
      if (this.teamCount > 1) {
        this.elements.classFinishedTeamsSummary.style.display = 'grid';
        this.elements.classFinishedTeamsSummary.innerHTML = Array.from({ length: this.teamCount }, (_, t) => {
          const teamNum = t + 1;
          const td = this.teamData[t] || { history: [], usedMaterials: new Set() };
          return `
            <div class="finished-team-box team-border-${teamNum}">
              <div class="finished-team-name team-${teamNum}">TEAM ${teamNum}</div>
              <div class="finished-team-stats">${td.history.length} oefeningen • ${td.usedMaterials.size} unieke materialen</div>
            </div>
          `;
        }).join('');
      } else {
        this.elements.classFinishedTeamsSummary.style.display = 'none';
        this.elements.classFinishedTeamsSummary.innerHTML = '';
      }
    }

    modal.classList.add('show');
    this.startConfetti();
    this.logWorkoutCompletedToGoogleSheet();
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
    this._sessionExerciseCount = 0;
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
    if (this.elements.hudExerciseName) this.elements.hudExerciseName.textContent = "DRUK OP SPIN";
    if (this.elements.hudMaterialInfo) this.elements.hudMaterialInfo.textContent = "---";
    if (this.elements.instructionText) this.elements.instructionText.textContent = "Druk op de roze SPIN knop om een willekeurige oefening te selecteren.";
    if (this.elements.timerDigits) {
      this.elements.timerDigits.textContent = "--";
      this.elements.timerDigits.classList.remove('low-time');
    }
    if (this.elements.timerProgressFill) {
      this.elements.timerProgressFill.style.width = '100%';
      this.elements.timerProgressFill.classList.remove('low-time');
    }
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
      
      // Sync inputs to saved / pending state
      if (this.elements.minTimeInput) this.elements.minTimeInput.value = this.minTime;
      if (this.elements.maxTimeInput) this.elements.maxTimeInput.value = this.maxTime;
      if (this.elements.countdownTimeInput) this.elements.countdownTimeInput.value = this.countdownTime;
      if (this.elements.volumeInput) this.elements.volumeInput.value = Math.round(this.volume * 100);
      if (this.elements.teamCountInput) this.elements.teamCountInput.value = String(this._pendingTeamCount || this.teamCount);
      if (this.elements.circuitRotationInput) this.elements.circuitRotationInput.checked = this.circuitRotation;

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

  /**
   * Displays an unobtrusive toast notification
   */
  showToast(message, duration = 3200) {
    let toast = document.getElementById('app-toast');
    if (!toast) {
      toast = document.createElement('div');
      toast.id = 'app-toast';
      toast.className = 'app-toast';
      document.body.appendChild(toast);
    }
    toast.textContent = message;
    toast.classList.add('show');
    if (this._toastTimer) clearTimeout(this._toastTimer);
    this._toastTimer = setTimeout(() => {
      toast.classList.remove('show');
    }, duration);
  }

  switchView(state) {
    this.currentState = state;
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
