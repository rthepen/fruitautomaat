/**
 * Slot Machine Engine for Workout Slot Machine.
 * Manages unified single-machine layout:
 * Reel 1: TIJD (Shared work time)
 * Reel 2: Materiaal Team 1
 * Reel 3: Oefening Team 1
 * Reel 4: Materiaal Team 2
 * Reel 5: Oefening Team 2
 * ... and so on for all teams.
 */

class SlotReel {
  /**
   * @param {HTMLElement} containerEl - The viewport container of the reel
   * @param {string} itemType - Type of reel ('material', 'exercise', 'time')
   * @param {number} teamIndex - Index of the team (0-based)
   */
  constructor(containerEl, itemType, teamIndex = 0) {
    this.container = containerEl;
    this.strip = containerEl.querySelector('.reel-strip');
    this.itemType = itemType;
    this.teamIndex = teamIndex;
    
    this.items = [];
    this.itemHeight = 75; // Default height, dynamically updated
    this.offset = 0; // Vertical translate position
    
    this.state = 'IDLE'; // 'IDLE', 'SPINNING', 'DECELERATING'
    
    // Physics properties
    this.speed = 0;
    this.maxSpeed = 30 + Math.random() * 8; // Varied top speeds
    this.acceleration = 1.2;
    
    // Deceleration control
    this.decelStartTime = 0;
    this.decelDuration = 1300; // ms to decelerate (quick & punchy)
    this.decelStartOffset = 0;
    this.decelEndOffset = 0;
    
    this.targetItem = null;
    this.targetIndex = 0;
    this.lastTickIndex = 0;
    
    this.onStopCallback = null;
  }

  updateItemHeight() {
    const card = this.strip.querySelector('.reel-card');
    if (card && card.offsetHeight > 0) {
      this.itemHeight = card.offsetHeight;
    } else {
      this.itemHeight = 75;
    }
  }

  getBaselineOffset() {
    const vHeight = this.container.clientHeight || 150;
    return Math.round((vHeight - this.itemHeight) / 2);
  }

  /**
   * Populates the reel strip with HTML elements
   */
  setItems(items) {
    this.items = items;
    this.strip.innerHTML = '';
    
    if (!items || items.length === 0) {
      this.strip.innerHTML = '<div class="reel-card">---</div>';
      return;
    }

    const repetitions = Math.max(3, Math.ceil(20 / items.length));
    const renderList = [];
    for (let r = 0; r < repetitions; r++) {
      renderList.push(...items);
    }

    renderList.forEach((item, idx) => {
      const card = document.createElement('div');
      card.className = 'reel-card';
      card.dataset.index = idx % items.length;
      
      if (this.itemType === 'material') {
        card.innerHTML = `<div class="card-title">${item}</div>`;
      } else if (this.itemType === 'exercise') {
        card.innerHTML = `
          <div class="card-title exercise-title">${item.exercise_name}</div>
          <div class="card-subtitle">${item.category || ''}</div>
        `;
      } else if (this.itemType === 'time') {
        card.innerHTML = `
          <div class="card-time">${item}</div>
          <div class="card-unit">SEC</div>
        `;
      }
      
      this.strip.appendChild(card);
    });

    this.updateItemHeight();
    this.resetPosition();
  }

  /**
   * Resets position to index 0 (centered)
   */
  resetPosition() {
    this.updateItemHeight();
    this.offset = this.getBaselineOffset();
    this.updateTransform();
    this.lastTickIndex = 0;
  }

  /**
   * Apply translate3d to the strip for hardware-accelerated rendering.
   */
  updateTransform() {
    const loopHeight = this.items.length * this.itemHeight;
    let visualOffset = this.offset;
    if (loopHeight > 0) {
      visualOffset = this.offset % loopHeight;
      if (visualOffset > 0) {
        visualOffset -= loopHeight;
      }
    }
    this.strip.style.transform = `translate3d(0, ${visualOffset}px, 0)`;
  }

  /**
   * Starts constant speed spinning
   */
  spin() {
    this.updateItemHeight();
    this.state = 'SPINNING';
    this.speed = 0;
    this.resetPosition();
  }

  /**
   * Initiates deceleration to land on targetItem
   */
  stop(targetItem, onStop) {
    this.updateItemHeight();
    this.targetItem = targetItem;
    this.onStopCallback = onStop;
    this.state = 'DECELERATING';
    
    // Find index of target in original items
    let originalIdx = -1;
    if (this.itemType === 'time') {
      originalIdx = this.items.indexOf(targetItem);
    } else if (this.itemType === 'material') {
      originalIdx = this.items.indexOf(targetItem);
    } else { // exercise
      originalIdx = this.items.findIndex(ex => ex.id === targetItem.id);
    }

    if (originalIdx === -1) {
      originalIdx = 0;
    }

    this.decelStartTime = performance.now();
    this.decelStartOffset = this.offset;

    const loopHeight = this.items.length * this.itemHeight;
    const rawTargetOffset = -(originalIdx * this.itemHeight) + this.getBaselineOffset();
    const minDecelDistance = 1.2 * loopHeight;
    
    let targetOffset = rawTargetOffset;
    while (targetOffset > this.offset - minDecelDistance) {
      targetOffset -= loopHeight;
    }

    this.decelEndOffset = targetOffset;
  }

  /**
   * Physics update loop
   */
  update(now) {
    if (this.state === 'IDLE') return;

    const loopHeight = this.items.length * this.itemHeight;

    if (this.state === 'SPINNING') {
      if (this.speed < this.maxSpeed) {
        this.speed = Math.min(this.maxSpeed, this.speed + this.acceleration);
      }
      
      this.offset -= this.speed;
      
      if (this.offset <= -loopHeight) {
        this.offset += loopHeight;
      }
      
      this.triggerTicks();
      this.updateTransform();
      
    } else if (this.state === 'DECELERATING') {
      const elapsed = now - this.decelStartTime;
      const progress = Math.min(1.0, elapsed / this.decelDuration);

      // Back-ease-out curve
      const t = progress;
      const ease = 1 - Math.pow(1 - t, 3) + 0.12 * Math.pow(1 - t, 2) * Math.sin(t * Math.PI * 1.5);
      
      this.offset = this.decelStartOffset + (this.decelEndOffset - this.decelStartOffset) * ease;
      
      this.triggerTicks();
      this.updateTransform();

      if (progress >= 1.0) {
        this.state = 'IDLE';
        
        let originalIdx = -1;
        if (this.itemType === 'time') {
          originalIdx = this.items.indexOf(this.targetItem);
        } else if (this.itemType === 'material') {
          originalIdx = this.items.indexOf(this.targetItem);
        } else {
          originalIdx = this.items.findIndex(ex => ex.id === this.targetItem.id);
        }
        if (originalIdx === -1) originalIdx = 0;
        
        this.offset = -(originalIdx * this.itemHeight) + this.getBaselineOffset();
        this.updateTransform();
        this.highlightActiveCard();

        if (this.onStopCallback) {
          this.onStopCallback();
        }
      }
    }
  }

  triggerTicks() {
    const currentTickIndex = Math.floor(Math.abs(this.offset) / (this.itemHeight || 75));
    if (currentTickIndex !== this.lastTickIndex) {
      this.lastTickIndex = currentTickIndex;
      // Only play tick sound from the primary reel or team 0 to keep audio crisp and clear
      if (this.itemType === 'time' || (this.teamIndex === 0 && this.itemType === 'material')) {
        if (window.audioEngine) {
          window.audioEngine.playSpin();
        }
      }
    }
  }

  highlightActiveCard() {
    this.strip.querySelectorAll('.reel-card').forEach(card => {
      card.classList.remove('active');
    });

    const loopHeight = this.items.length * this.itemHeight;
    if (loopHeight === 0) return;

    let targetPos = -this.offset + this.getBaselineOffset();
    targetPos = ((targetPos % loopHeight) + loopHeight) % loopHeight;
    
    const activeIdx = Math.round(targetPos / this.itemHeight) % this.items.length;
    
    this.strip.querySelectorAll('.reel-card').forEach(card => {
      if (parseInt(card.dataset.index) === activeIdx) {
        card.classList.add('active');
      }
    });
  }
}

class SlotMachine {
  /**
   * @param {HTMLElement|Array<HTMLElement>} rootOrContainers - Either wrapper element or array of reels
   * @param {number} teamCount - Number of teams (1 to 4)
   */
  constructor(rootOrContainers, teamCount = 1) {
    this.container = Array.isArray(rootOrContainers) ? null : rootOrContainers;
    this.initialContainers = Array.isArray(rootOrContainers) ? rootOrContainers : null;
    this.teamCount = teamCount;

    this.timeReel = null;   // Single shared time reel
    this.teamReelSets = []; // Array of { teamIndex, materialReel, exerciseReel }
    this.reels = [];        // Flat array of all SlotReel instances in left-to-right order

    this.isSpinning = false;
    this.animationId = null;

    // Item caches
    this.lastMaterials = [];
    this.lastExercises = [];
    this.lastTimes = [];

    if (this.initialContainers) {
      this._setupFromInitialContainers(this.initialContainers);
    }
  }

  _setupFromInitialContainers(containers) {
    this.timeReel = new SlotReel(containers[2], 'time', 0);
    const matReel = new SlotReel(containers[0], 'material', 0);
    const exReel = new SlotReel(containers[1], 'exercise', 0);
    this.teamReelSets = [{ teamIndex: 0, materialReel: matReel, exerciseReel: exReel }];
    this.reels = [this.timeReel, matReel, exReel];
  }

  /**
   * Builds the single unified slot machine with reels in exact order:
   * 1st reel: TIJD
   * Then for each team: Materiaal, Oefening
   */
  configureTeams(teamCount, containerEl = null) {
    this.teamCount = Math.max(1, Math.min(8, teamCount));
    if (containerEl) {
      this.container = containerEl;
    }
    if (!this.container) return;

    this.container.innerHTML = '';
    this.timeReel = null;
    this.teamReelSets = [];
    this.reels = [];

    // Outer cabinet class for styling
    const cabinet = this.container.closest('.slot-machine-cabinet');
    if (cabinet) {
      cabinet.classList.remove(
        'team-count-1', 'team-count-2', 'team-count-3', 'team-count-4',
        'team-count-5', 'team-count-6', 'team-count-7', 'team-count-8'
      );
      cabinet.classList.add(`team-count-${this.teamCount}`);
    }

    // Create single unified reels wrapper
    const wrapper = document.createElement('div');
    wrapper.className = `reels-wrapper unified-horizontal-reels reels-teams-${this.teamCount}`;

    // 1st Wheel: TIJD
    const timeCol = document.createElement('div');
    timeCol.className = 'unified-reel-col time-col';
    timeCol.innerHTML = `
      <div class="reel-col-header time-header">⏱️ TIJD</div>
      <div class="reel-viewport reel-viewport-time" data-reel-type="time">
        <div class="reel-selection-frame"></div>
        <div class="reel-strip"><div class="reel-card">---</div></div>
      </div>
    `;
    wrapper.appendChild(timeCol);

    this.timeReel = new SlotReel(timeCol.querySelector('.reel-viewport'), 'time', 0);
    this.reels.push(this.timeReel);

    // Following Wheels: Team 1 Materiaal, Team 1 Oefening, Team 2 Materiaal, Team 2 Oefening, etc.
    for (let i = 0; i < this.teamCount; i++) {
      const teamNum = i + 1;

      // Material Column
      const matCol = document.createElement('div');
      matCol.className = `unified-reel-col mat-col team-col-${teamNum}`;
      matCol.innerHTML = `
        <div class="reel-col-header team-header-${teamNum}">
          <span class="team-dot"></span> T${teamNum} MAT.
        </div>
        <div class="reel-viewport reel-viewport-mat" data-reel-type="material" data-team="${i}">
          <div class="reel-selection-frame"></div>
          <div class="reel-strip"><div class="reel-card">---</div></div>
        </div>
      `;
      wrapper.appendChild(matCol);

      // Exercise Column
      const exCol = document.createElement('div');
      exCol.className = `unified-reel-col ex-col team-col-${teamNum}`;
      exCol.innerHTML = `
        <div class="reel-col-header team-header-${teamNum}">
          <span class="team-dot"></span> T${teamNum} OEF.
        </div>
        <div class="reel-viewport reel-viewport-ex" data-reel-type="exercise" data-team="${i}">
          <div class="reel-selection-frame"></div>
          <div class="reel-strip"><div class="reel-card">---</div></div>
        </div>
      `;
      wrapper.appendChild(exCol);

      const matReel = new SlotReel(matCol.querySelector('.reel-viewport'), 'material', i);
      const exReel = new SlotReel(exCol.querySelector('.reel-viewport'), 'exercise', i);

      this.teamReelSets.push({ teamIndex: i, materialReel: matReel, exerciseReel: exReel });
      this.reels.push(matReel, exReel);
    }

    this.container.appendChild(wrapper);

    // Repopulate if items already loaded
    if (this.lastMaterials.length > 0) {
      this.setupReels(this.lastMaterials, this.lastExercises, this.lastTimes);
    }
  }

  updateReelsItemHeight() {
    this.reels.forEach(reel => reel.updateItemHeight());
  }

  realign() {
    this.reels.forEach(reel => {
      reel.updateItemHeight();
      if (reel.state === 'IDLE') {
        let originalIdx = 0;
        if (reel.targetItem) {
          if (reel.itemType === 'time') {
            originalIdx = reel.items.indexOf(reel.targetItem);
          } else if (reel.itemType === 'material') {
            originalIdx = reel.items.indexOf(reel.targetItem);
          } else {
            originalIdx = reel.items.findIndex(ex => ex.id === reel.targetItem.id);
          }
          if (originalIdx === -1) originalIdx = 0;
        }
        reel.offset = -(originalIdx * reel.itemHeight) + reel.getBaselineOffset();
        reel.updateTransform();
        reel.highlightActiveCard();
      }
    });
  }

  /**
   * Populate all reels with active database items
   */
  setupReels(materials, exercises, times) {
    this.lastMaterials = materials;
    this.lastExercises = exercises;
    this.lastTimes = times;

    if (this.timeReel) {
      this.timeReel.setItems(times);
    }

    this.teamReelSets.forEach(set => {
      set.materialReel.setItems(materials);
      set.exerciseReel.setItems(exercises);
    });
  }

  /**
   * Start spinning reels in 1 single fruitautomaat:
   * Starts all wheels simultaneously and stops all wheels simultaneously
   */
  spin(arg1, arg2, arg3, arg4) {
    if (this.isSpinning) return;
    this.isSpinning = true;

    this.updateReelsItemHeight();

    let stations = [];
    let sharedTime = 0;
    let onCompleteCallback = null;

    if (Array.isArray(arg1)) {
      stations = arg1;
      sharedTime = arg2;
      onCompleteCallback = arg3;
    } else {
      stations = [{ material: arg1, exercise: arg2 }];
      sharedTime = arg3;
      onCompleteCallback = arg4;
    }

    // Start all wheels spinning simultaneously
    this.reels.forEach(r => {
      r.container.classList.add('active-spin');
      r.spin();
    });

    this.animationId = requestAnimationFrame((now) => this.loop(now));

    // Spin full-speed for 900ms, then stop ALL wheels at the exact same time
    setTimeout(() => {
      let remainingStops = this.reels.length;

      const checkAllStopped = () => {
        remainingStops--;
        if (remainingStops <= 0) {
          this.isSpinning = false;
          cancelAnimationFrame(this.animationId);
          if (onCompleteCallback) onCompleteCallback();
        }
      };

      // 1. Stop Time Reel
      this.timeReel.stop(sharedTime, () => {
        this.timeReel.container.classList.remove('active-spin');
        checkAllStopped();
      });

      // 2. Stop all Team Reels at the exact same time
      this.teamReelSets.forEach((set, idx) => {
        const targetMat = stations[idx] ? stations[idx].material : stations[0].material;
        const targetEx = stations[idx] ? stations[idx].exercise : stations[0].exercise;

        set.materialReel.stop(targetMat, () => {
          set.materialReel.container.classList.remove('active-spin');
          checkAllStopped();
        });

        set.exerciseReel.stop(targetEx, () => {
          set.exerciseReel.container.classList.remove('active-spin');
          checkAllStopped();
        });
      });
    }, 900);
  }

  loop(now) {
    this.reels.forEach(reel => reel.update(now));
    if (this.isSpinning) {
      this.animationId = requestAnimationFrame((now) => this.loop(now));
    }
  }
}

window.SlotMachine = SlotMachine;
