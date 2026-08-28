Tabataman Coach MP3 Instructies
=================================

Plaats hier je MP3 bestanden. De bestandsnaam moet PRECIES overeenkomen met de 'key'.
Als het bestand niet bestaat, valt de app terug op de computerstem.

----------------------------------------------------------------------------------
AUDIO BESTANDEN - NAMING CONVENTION (Updated v1.31.45)
----------------------------------------------------------------------------------
De app ondersteunt nu "Randomized Playlists" voor ALLE geluiden.
Dit betekent dat je meerdere variaties van een geluid kunt hebben die willekeurig
worden afgespeeld (en daarna rouleren in een vaste volgorde).

BELANGRIJK:
Alle bestanden moeten nu eindigen op _1, _2, _3 etc. (zelfs als er maar 1 is).

Voorbeeld (Start commando):
- work_start_1.mp3  (Standaard)
- work_start_2.mp3  (Alternatief 1)
- work_start_3.mp3  (Alternatief 2)

CONFIGURATIE:
Als je extra bestanden toevoegt (bijv. een 2e 'work_start'), moet je dit ook
aangeven in het bestand `index.html`.
Zoek naar `const coachPresets` en pas het getal aan bij `variants`.
Bijvoorbeeld: 'work_start': 2.

----------------------------------------------------------------------------------
BESCHIKBARE KEYS
----------------------------------------------------------------------------------

-- VOORBEREIDING --
prep_intro_X.mp3          (Start van de app / welkom)
prep_countdown_X.mp3      (De 3-2-1 countdown, indien mogelijk)

-- TIJDENS WERKEN --
work_start_X.mp3          (Startsignaal oefening)
work_halfway_X.mp3        ("Halverwege!")
work_30s_X.mp3            ("Nog 30 seconden")
work_10s_X.mp3            ("Nog 10 seconden")
work_5s_X.mp3             ("Nog 5 seconden")

-- TIJDENS RUST (Kleine rust tussen sets) --
rest_set_start_X.mp3      (Start rust)
rest_set_tips_X.mp3       (Tips tijdens rust, wordt willekeurig gekozen)

-- WISSEL (Tussen verschillende oefeningen) --
rest_switch_start_X.mp3   (Start wissel)
rest_switch_10s_X.mp3     ("Nog 10 sec wissel")

-- RONDE PAUZE (Grote rust) --
rest_round_start_X.mp3    (Start grote pauze)
rest_round_15s_X.mp3      ("Nog 15 sec pauze")

-- MIJLPALEN --
mile_start_X.mp3          (25% voltooid)
mile_half_X.mp3           (50% voltooid)
mile_end_X.mp3            (75% voltooid)
mile_lastround_X.mp3      (Start laatste ronde)

-- EINDE --
finish_X.mp3              (Training voltooid)
