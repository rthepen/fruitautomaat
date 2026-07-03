/**
 * Slot Machine Engine for Workout Slot Machine.
 * Manages reel population, spin physics, sound triggers, and final outcome alignment.
 */

class SlotReel {
  /**
   * @param {HTMLElement} containerEl - The viewport container of the reel
   * @param {string} itemType - Type of reel ('material', 'exercise', 'time')
   */
  constructor(containerEl, itemType) {
    this.container = containerEl;
    this.strip = containerEl.querySelector('.reel-strip');
    this.itemType = itemType;
    
    this.items = [];
    this.itemHeight = 120; // fallback height, updated dynamically
    this.offset = 0; // vertical translate position (negative value)
    
    this.state = 'IDLE'; // 'IDLE', 'SPINNING', 'DECELERATING'
    
    // Physics properties
    this.speed = 0;
    this.maxSpeed = 35 + Math.random() * 10; // slightly randomized top speeds for variation
    this.acceleration = 1.2;
    
    // Deceleration control
    this.decelStartTime = 0;
    this.decelDuration = 2500; // ms to decelerate
    this.decelStartOffset = 0;
    this.decelEndOffset = 0;
    
    this.targetItem = null;
    this.targetIndex = 0;
    this.lastTickIndex = 0;
    
    this.onStopCallback = null;
  }

  /**
   * Measures the actual card height in the DOM to handle responsive scaling correctly.
   */
  updateItemHeight() {
    const card = this.strip.querySelector('.reel-card');
    if (card && card.offsetHeight > 0) {
      this.itemHeight = card.offsetHeight;
    } else {
      // Fallback matching CSS media query values
      this.itemHeight = window.innerHeight <= 900 ? 100 : 120;
    }
  }

  /**
   * Populates the reel strip with HTML elements
   * To support infinite seamless scrolling, we repeat the items.
   */
  setItems(items) {
    this.items = items;
    this.strip.innerHTML = '';
    
    if (items.length === 0) {
      this.strip.innerHTML = '<div class="reel-card">---</div>';
      return;
    }

    // We repeat the items to ensure we have a long scrollable strip.
    // We want at least 15 items in the strip to make the spin look continuous.
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
        card.innerHTML = `
          <div class="card-title">${item}</div>
        `;
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
    // Card 0 centered in the middle of the viewport (translates by +itemHeight)
    this.offset = this.itemHeight;
    this.updateTransform();
    this.lastTickIndex = 0;
  }

  /**
   * Apply translate3d to the strip for hardware-accelerated rendering.
   * Wraps the offset modulo the loop height to ensure we never run out of cards.
   */
  updateTransform() {
    const loopHeight = this.items.length * this.itemHeight;
    let visualOffset = this.offset;
    if (loopHeight > 0) {
      visualOffset = this.offset % loopHeight;
      // Keep visualOffset negative to align properly with repeating cards
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

    // Calculate loop height
    const loopHeight = this.items.length * this.itemHeight;

    // We want the reel to stop with the target item centered in the highlight frame.
    // The highlighted center frame starts at y = itemHeight relative to the viewport.
    // The target translation to align card 'originalIdx' in the middle is:
    // -(originalIdx * itemHeight) + itemHeight.
    const rawTargetOffset = -(originalIdx * this.itemHeight) + this.itemHeight;
    
    const minDecelDistance = 2.0 * loopHeight; // scroll at least 2 full loops
    
    // Find a target offset that is less than current offset (moving downwards)
    // and is at least minDecelDistance away.
    let targetOffset = rawTargetOffset;
    while (targetOffset > this.offset - minDecelDistance) {
      targetOffset -= loopHeight;
    }

    this.decelEndOffset = targetOffset;
  }

  /**
   * Physics update loop (called from SlotMachine requestAnimationFrame)
   */
  update(now) {
    if (this.state === 'IDLE') return;

    const loopHeight = this.items.length * this.itemHeight;

    if (this.state === 'SPINNING') {
      // Accelerate to max speed
      if (this.speed < this.maxSpeed) {
        this.speed = Math.min(this.maxSpeed, this.speed + this.acceleration);
      }
      
      // Update offset
      this.offset -= this.speed;
      
      // Loop the strip
      if (this.offset <= -loopHeight) {
        this.offset += loopHeight;
      }
      
      this.triggerTicks();
      this.updateTransform();
      
    } else if (this.state === 'DECELERATING') {
      const elapsed = now - this.decelStartTime;
      const progress = Math.min(1.0, elapsed / this.decelDuration);

      // Back-ease-out curve for that authentic bouncy elastic slot machine finish
      const t = progress;
      const ease = 1 - Math.pow(1 - t, 3) + 0.12 * Math.pow(1 - t, 2) * Math.sin(t * Math.PI * 1.5);
      
      this.offset = this.decelStartOffset + (this.decelEndOffset - this.decelStartOffset) * ease;
      
      this.triggerTicks();
      this.updateTransform();

      if (progress >= 1.0) {
        this.state = 'IDLE';
        
        // Find exact target index to snap to
        let originalIdx = -1;
        if (this.itemType === 'time') {
          originalIdx = this.items.indexOf(this.targetItem);
        } else if (this.itemType === 'material') {
          originalIdx = this.items.indexOf(this.targetItem);
        } else {
          originalIdx = this.items.findIndex(ex => ex.id === this.targetItem.id);
        }
        if (originalIdx === -1) originalIdx = 0;
        
        // Snap offset perfectly to target
        this.offset = -(originalIdx * this.itemHeight) + this.itemHeight;
        this.updateTransform();
        
        // Highlight active card
        this.highlightActiveCard();

        if (this.onStopCallback) {
          this.onStopCallback();
        }
      }
    }
  }

  /**
   * Sound tick trigger based on item boundary crossings
   */
  triggerTicks() {
    const currentTickIndex = Math.floor(Math.abs(this.offset) / this.itemHeight);
    if (currentTickIndex !== this.lastTickIndex) {
      this.lastTickIndex = currentTickIndex;
      if (window.audioEngine) {
        window.audioEngine.playSpin();
      }
    }
  }

  /**
   * Highlighting the selected card visually in the center of the viewport
   */
  highlightActiveCard() {
    // Remove active class from all cards
    this.strip.querySelectorAll('.reel-card').forEach(card => {
      card.classList.remove('active');
    });

    const loopHeight = this.items.length * this.itemHeight;
    if (loopHeight === 0) return;

    // The highlighted card is centered at viewport y = this.itemHeight.
    // Its position on the strip is (-this.offset + this.itemHeight).
    // We normalize this position to be within [0, loopHeight).
    let targetPos = -this.offset + this.itemHeight;
    targetPos = ((targetPos % loopHeight) + loopHeight) % loopHeight;
    
    const activeIdx = Math.round(targetPos / this.itemHeight) % this.items.length;
    
    // Find all rendered cards matching the target index and add active class
    this.strip.querySelectorAll('.reel-card').forEach(card => {
      if (parseInt(card.dataset.index) === activeIdx) {
        card.classList.add('active');
      }
    });
  }
}

class SlotMachine {
  constructor(reelContainers) {
    this.reels = [
      new SlotReel(reelContainers[0], 'material'),
      new SlotReel(reelContainers[1], 'exercise'),
      new SlotReel(reelContainers[2], 'time')
    ];
    this.isSpinning = false;
    this.animationId = null;
  }

  /**
   * Update card height measurement for all reels
   */
  updateReelsItemHeight() {
    this.reels.forEach(reel => reel.updateItemHeight());
  }

  /**
   * Populate all three reels with active items
   */
  setupReels(materials, exercises, times) {
    this.reels[0].setItems(materials);
    this.reels[1].setItems(exercises);
    this.reels[2].setItems(times);
  }

  /**
   * Start spinning all reels
   */
  spin(targetMaterial, targetExercise, targetTime, onCompleteCallback) {
    if (this.isSpinning) return;
    this.isSpinning = true;

    // Update item height configurations before starting the spin physics
    this.updateReelsItemHeight();

    // Start spin phase
    this.reels.forEach(reel => reel.spin());
    
    // Start standard requestAnimationFrame loop
    this.animationId = requestAnimationFrame((now) => this.loop(now));

    // Schedule sequential stopping
    // Reel 1 (Material) stops after 1.5 seconds
    setTimeout(() => {
      this.reels[0].stop(targetMaterial, () => {
        // Reel 2 (Exercise) stops 0.8s after Reel 1 stops
        setTimeout(() => {
          this.reels[1].stop(targetExercise, () => {
            // Reel 3 (Time) stops 0.8s after Reel 2 stops
            setTimeout(() => {
              this.reels[2].stop(targetTime, () => {
                this.isSpinning = false;
                cancelAnimationFrame(this.animationId);
                if (onCompleteCallback) onCompleteCallback();
              });
            }, 800);
          });
        }, 800);
      });
    }, 1500);
  }

  /**
   * Physics loop
   */
  loop(now) {
    this.reels.forEach(reel => reel.update(now));
    if (this.isSpinning) {
      this.animationId = requestAnimationFrame((now) => this.loop(now));
    }
  }
}

// Export SlotMachine to global scope
window.SlotMachine = SlotMachine;
