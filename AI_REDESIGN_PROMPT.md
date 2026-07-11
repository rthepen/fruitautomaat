# 🤖 AI Prompt — Workout Slot Machine Redesign from Scratch

> Gebruik deze prompt in **Google AI Studio** (Gemini 2.0/2.5 Pro) of een vergelijkbaar AI-model.  
> Plak de volledige prompt hieronder in het chatvenster.

---

## ✂️ PROMPT (kopieer alles hieronder)

---

You are an expert web developer and UI/UX designer. I want you to build a **complete, production-ready single-page web application** from scratch using only **HTML, CSS, and Vanilla JavaScript** (no frameworks, no build tools, no npm).

---

### 🎯 App concept: Workout Slot Machine

A **fullscreen gym training tool** for group fitness classes. A trainer runs this on a beamer/TV. The app randomly selects an exercise, equipment, and duration using a **slot machine animation**, then counts down a "get ready" timer, then runs a **workout countdown timer**. YouTube videos play automatically in the background showing how to perform the exercise.

---

### 📐 Layout — Single Screen, Always Visible

The entire app must fit on **one screen with no scrolling (desktop only, no mobile layout)**, structured vertically:

**TOP PORTION (Slot Machine Cabinet):**
- Spans the **entire width of the screen** (100% width) and is **always visible in the exact same pinned position**.
- Shows 3 spinning reels (equipment | exercise name | duration in seconds) inside a pink neon highlighted cabinet, with a giant "SPIN" button below the reels.
- In idle state, it is centered vertically on the screen.
- **Vertical Collapse during Workout (IMPORTANT):** When the countdown starts, the cabinet collapses vertically to save space (reels viewport shrinks to 90px tall showing only the active middle card, padding decreases, and the SPIN button/controls are hidden). In JavaScript, reel translate offsets and heights must be recalculated/snapped (`realign()`) so the cards align perfectly inside the collapsed cabinet. This leaves plenty of vertical space for the workout area.

**BOTTOM PORTION (Workout Panel):**
- Hidden during idle state.
- Visible during countdown and active workout states, taking the remaining space below the slot machine, split into:
  - **Left side (≈ 35% width):** Large circular progress ring with a big digital number inside.
    - During "get ready": counts down from N to 0, labeled "MAAK JE KLAAR" in neon cyan, number pulses.
    - During workout: seamlessly transitions to counting down the workout duration (e.g. 90, 89, 88…), progress ring drains, last 5 seconds glow pink/red.
    - Below: PAUZE / AFRONDEN / STOP buttons (only visible during workout phase).
  - **Right side (≈ 65% width):** Exercise info and video.
    - Exercise name (large, uppercase, neon green glow).
    - Equipment/material name (smaller, gray).
    - YouTube video (iframe, autoplay + muted + loop, no controls). The video is loaded in a persistent iframe outside the state containers, positioned absolutely over a `#video-slot` placeholder using `getBoundingClientRect()`.
    - Instruction text card (dark glass card with white text).

**"LEKKER BEZIG!" Flash Overlay:**
- When an exercise completes, a full-screen semi-transparent overlay appears with a large animated "LEKKER BEZIG! 🔥" title and the exercise name
- Auto-dismisses after 3 seconds with a fade-out
- App returns to idle state (slot machine centered again)


**Header (always visible, compact):**
- App logo "Workout Slots" (left)
- Live clock showing current time + "Les eindigt om HH:MM" + countdown to class end (center)
- Buttons: "⏹ AUTO" (stop auto-play, only visible when auto-play is running) | 🔊 mute toggle | ⚙️ INSTELLINGEN (right)

---

### 🎰 Slot Machine Mechanics

- 3 reels: Equipment | Exercise | Duration
- Each reel is a vertically scrolling strip of cards
- Spin animation: cards scroll fast then decelerate smoothly to the chosen result
- Selected card lands in a highlighted "selection frame" (neon border)
- After spin completes (≈ 2s), automatically start the countdown phase after 1.5s pause
- Reel content is loaded from JSON files (one per equipment type)

---

### ⏱ Timer System

- Drift-free countdown using `performance.now()` (not `setInterval` alone)
- **Phase 1 — Countdown ("Maak je klaar"):** configurable 1–60 seconds
- **Phase 2 — Workout:** randomly chosen duration between min/max, rounded to 10s increments
- Smooth transition: the same big number display is reused — no visual jump between phases
- Circular SVG progress ring depletes during workout phase
- Pause/resume support

---

### YouTube Video Integration

- Each exercise JSON has a `video_search_url` field with a YouTube embed URL (e.g. `https://www.youtube.com/embed/ABC123`)
- Build the embed URL with these params: `autoplay=1&mute=1&loop=1&playlist=VIDEO_ID&controls=0&modestbranding=1&rel=0`
- Use a **persistent `<iframe>`** that lives as a direct child of `<main>` (outside all view/state sections)
- Position it absolutely over a `#video-slot` placeholder div using `getBoundingClientRect()` and inline `style.left/top/width/height`
- Load iframe at countdown start, keep it alive (don't hide with `display:none`) through workout — seamless playback
- Hide iframe (set `src=""` and `display:none`) on stop/reset/complete

**Thumbnail always visible (IMPORTANT):**
- The `thumbnail` image must **always be shown** as a background layer inside the video frame, from the moment the countdown starts
- Both the `<img class="thumbnail">` and the `<iframe>` are `position: absolute; inset: 0; width: 100%; height: 100%`
- The thumbnail uses `object-fit: cover` and is always rendered as the bottom layer (z-index lower than iframe)
- The iframe sits on top — so when the YouTube video loads it plays over the thumbnail, but the thumbnail is always the visible base
- This ensures something is always shown immediately, even while the iframe is loading
- When `video_search_url` is empty: only the thumbnail is shown (no iframe)
- When both `video_search_url` AND `thumbnail` are empty: show a styled `"Geen video beschikbaar"` placeholder


---


### 🔊 Audio System

- Use **Web Audio API** (synthesize all sounds — no MP3 files required):
  - Spin tick: short percussive click during reel spin
  - Countdown beep: tone per second during "Maak je klaar"
  - Start sound: ascending chord when workout begins
  - Complete sound: descending tone
- Route through a **master gain node** for global volume (default 200%, range 0–300%)
- Initialize AudioContext on first user gesture
- Mute toggle (🔊/🔇) persisted in cookie

---

### ⚙️ Settings Panel

A slide-out drawer from the right with:

**Timer & Les instellingen (2-column grid):**
- Min. werktijd (sec) — number input, default 30
- Max. werktijd (sec) — number input, default 120
- Maak je klaar (sec) — number input, default 10
- Les eindigt om — time input (triggers class-end countdown in header)
- Volume (%) — number input 0–300, default 200
- Auto-play — iOS-style toggle switch (auto-spins after each exercise until class end)

**Materialen & Oefeningen:**
- Searchable tree list of all equipment groups
- Each group expands to show individual exercises
- Checkboxes to enable/disable per exercise or whole group
- "Alles selecteren" / "Alles de-selecteren" buttons

**OPSLAAN & SLUITEN** button at bottom.

All settings **saved to cookies** (1-year expiry), restored on page load.

---

### 💾 Exercise Database Format

JSON structure for each exercise:
```json
{
  "id": "air_squats",
  "exercise_name": "Air Squats",
  "category": "Onderlichaam",
  "material_name": "Bodyweight",
  "material_description": "Eigen lichaamsgewicht",
  "instructions": "Sta rechtop met voeten op schouderbreedte...",
  "video_search_url": "https://www.youtube.com/embed/-5LhNSMBrEs",
  "thumbnail": "https://i.ytimg.com/vi/-5LhNSMBrEs/hqdefault.jpg"
}
```

Load multiple JSON files via `fetch()`. Each file = one equipment category (e.g. `bodyweight.json`, `dumbbells.json`). Group exercises by `material_name`.

---

### 🎨 Visual Design — Neon Arcade / Dark Mode

**Colors (CSS custom properties):**
```css
--bg-primary: #0b0b0f;
--bg-secondary: #121218;
--bg-card: rgba(22, 22, 30, 0.7);
--neon-cyan: #00ffff;
--neon-pink: #ff007f;
--neon-green: #39ff14;
--neon-yellow: #ffea00;
```

**Design rules:**
- Background: near-black with subtle purple radial gradient in center
- All neon elements have `text-shadow` / `box-shadow` glow at 10px + 30px
- Glass morphism cards: semi-transparent dark bg + `backdrop-filter: blur(12px)` + subtle white border
- `overflow: hidden` everywhere — zero scrollbars on any element
- Smooth CSS transitions (0.3–0.5s ease) on all state changes

**Typography (Google Fonts):**
```html
<link href="https://fonts.googleapis.com/css2?family=Orbitron:wght@500;700;900&family=Oswald:wght@500;700&family=Outfit:wght@400;600;800&display=swap" rel="stylesheet">
```
- Titles/labels: `Oswald` (bold uppercase)
- Timer numbers: `Orbitron` (digital look)
- Body/buttons/UI: `Outfit` (clean modern)

**All font sizes use `clamp()` for responsive scaling.**

---

### 🏗 File Structure

Generate each file separately, one at a time:

| File | Purpose |
|---|---|
| `index.html` | Semantic HTML, all IDs needed for JS, single-screen layout |
| `style.css` | All styling, CSS variables, state-based layout (`.state-idle`, `.state-countdown`, `.state-active`) |
| `app.js` | `WorkoutApp` class — main controller |
| `slotmachine.js` | `SlotMachine` class — reel physics and animation |
| `timer.js` | `WorkoutTimer` class — drift-free phases: IDLE / COUNTDOWN / RUNNING / PAUSED / FINISHED |
| `audio.js` | `AudioEngine` class — Web Audio API synthesis |

---

### 🔌 State System

Manage app state via CSS class on `<main id="app-main">`:

| Class | What's visible / styling |
|---|---|
| `.state-idle` | Slot machine cabinet fully open, centered vertically, SPIN button visible; workout panel hidden. |
| `.state-countdown` | Slot machine cabinet collapses vertically (SPIN button hidden, reels viewport 90px tall); workout panel visible (timer panel + right panel) and trainer controls hidden. |
| `.state-active` | Slot machine cabinet remains collapsed vertically; workout panel visible and trainer controls visible. |

Flash overlay (`#finished-overlay`) uses `.show` class, positioned `absolute` over everything with `z-index: 100`.

---

### ✅ Acceptance Criteria

1. App loads fully from GitHub Pages or `file://` — no server required
2. SPIN picks random exercise, equipment and duration from loaded JSON data
3. "Maak je klaar" counts down, then seamlessly transitions to workout timer — same element, same position
4. YouTube video plays from countdown start, stays playing through workout without reloading
5. "LEKKER BEZIG! 🔥" overlay appears on complete, auto-dismisses after 3s, then idle state returns
6. All settings (timers, class-end time, volume, auto-play, enabled exercises) save to cookies and restore on reload
7. Auto-play mode re-spins automatically after each exercise until class end time is reached
8. No scrollbars anywhere. Everything fits on landscape screen (16:9 beamer/TV)
9. Audio synthesized via Web Audio API — no mp3 dependencies
10. Code has JSDoc comments, clean class structure
11. **Thumbnail always visible** as a base layer in the video frame from countdown start — even while iframe is loading or when no YouTube URL is available

---

**Instructions for the AI:**
- Generate one file at a time, starting with `index.html`
- After each file, wait for my confirmation before proceeding to the next
- Use Dutch for all user-facing text (labels, buttons, placeholders)
- The code must work immediately by pasting into files — no compilation needed
