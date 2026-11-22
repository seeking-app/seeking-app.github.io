# QUAERENS 尋道 — logo (adopted 22 Nov 2026)

Concept (道路與十字): the circle is a road (道). It sets out from the foot of the Cross, runs anticlockwise
(the chevrons mark the direction) and comes back to the Cross, stopping just short of it.
Christ is where the search begins and where it ends ("I am the Way", Jn 14:6; exitus–reditus).
Quaerens is a present participle: the pilgrim is still on the way. The gap before the Cross must stay
visible at every size; make.py keeps it proportional to the stroke.

Colours (app/site Marian palette): Marian blue #26457E, paper #F3F2EE, gold #A8842F.
(First drawn in navy #1E4457 / cream #FFFBDE; recoloured 22 Nov 2026 to match the app.)

svg/quaerens-logo.svg        master, cream on navy square
svg/quaerens-mark-*.svg      transparent mark: blue (light grounds), paper (dark grounds), gold (accents), black (print); files keep the names navy/cream
svg/quaerens-small.svg       heavier strokes, no chevrons: 48 px and below
png/*-1024.png               raster masters
icons/                       PWA + website icons

Line weight: 4.5% of the square, same for circle and Cross, everywhere except the small cut (heavier, no chevrons).

Manifest:
  "icons": [
    {"src": "icons/icon-192.png", "sizes": "192x192", "type": "image/png", "purpose": "any"},
    {"src": "icons/icon-512.png", "sizes": "512x512", "type": "image/png", "purpose": "any"},
    {"src": "icons/icon-maskable-192.png", "sizes": "192x192", "type": "image/png", "purpose": "maskable"},
    {"src": "icons/icon-maskable-512.png", "sizes": "512x512", "type": "image/png", "purpose": "maskable"}
  ],
  "theme_color": "#26457E", "background_color": "#26457E"

<head>:
  <link rel="icon" href="icons/favicon.svg" type="image/svg+xml">
  <link rel="icon" href="icons/favicon.ico" sizes="48x48">
  <link rel="apple-touch-icon" href="icons/apple-touch-icon.png">

make.py regenerates everything (needs rsvg-convert and Pillow).
