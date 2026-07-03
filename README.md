# 🎰 Workout Fruitautomaat

Een interactieve, high-energy front-end webapplicatie ontworpen voor groepslessen in de sportschool. De slotmachine combineert willekeurig materialen/oefeningen en een werktijd om een motiverende workout-dynamiek te creëren op grote schermen.

## 🚀 Kenmerken

- **High-Energy Visuals:** Neon arcade-achtige dark mode met vloeiende animaties en grote, makkelijk leesbare typografie voor achterin de zaal.
- **Precision Timer:** Een drift-vrije timer aangedreven door `requestAnimationFrame` en `performance.now()` die tab-throttling in browsers omzeilt.
- **Transactie-gebaseerde Instellingen:** Wijzigingen in de database worden pas committed na het expliciet opslaan van de instellingen.
- **Instelbare Afteltijd:** Pas de get-ready afteltijd aan (1-30s) waarbij de oefeningsnaam, het benodigde materiaal en de specifieke instructie alvast op het scherm getoond worden ter voorbereiding.
- **Lokale Video & Geluid:** Directe koppeling naar lokale instructievideo's en geluidseffecten met soepele audio-pooling om framerate-lag te voorkomen.

## 🛠️ Technologieën

- **Structuur:** HTML5 (semantisch)
- **Styling:** Vanilla CSS3 (custom properties, flexbox/grid, glassmorphism)
- **Logica:** Vanilla JavaScript (ES6 Modules)

## 📂 Project Structuur

- `index.html` - De visuele opbouw van het slotmachine cabinet, countdown overlay en workout HUD.
- `style.css` - Custom styling tokens en de neon-arcadestijl.
- `app.js` - Centrale controller die JSON's laadt, events bindt en de status beheert.
- `slotmachine.js` - Fysica-gebaseerde reel scroll- en uitlijnlogica.
- `timer.js` - Drift-vrije countdown & workout timer.
- `audio.js` - Audio preloading en pre-allocated node pools voor spin clicks.
- `workoutdatabase/` - 25 JSON bestanden met oefeningen per materiaal.
- `sounds/` - Geluidseffecten (`spin.mp3`, `countdown.mp3`, `start.mp3`, `stop.mp3`).
- `videos/` - Map voor lokale instructievideo's.

## ⚙️ Configuratielijst

Open het **INSTELLINGEN** paneel rechtsboven om:
1. De minimale en maximale willekeurige werktijd in te stellen.
2. De get-ready afteltijd te configureren.
3. Specifieke materialen of individuele oefeningen aan/uit te vinken.
4. Geluidseffecten te dempen.
