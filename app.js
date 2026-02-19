// Mahjong Solitaire — Telegram Mini App
// Initialize Telegram WebApp
const tg = window.Telegram.WebApp;
tg.ready();
tg.expand();
tg.setHeaderColor('#072e27');
tg.setBackgroundColor('#072e27');

// Disable vertical swipe to close for smoother gameplay in Telegram WebView
if (tg.disableVerticalSwipes) {
    tg.disableVerticalSwipes();
}

// Lock viewport height to prevent WebView resize jitter
if (tg.isExpanded) {
    document.documentElement.style.height = '100vh';
}

// Mahjong tile definitions — 36 types, 4 of each = 144 tiles
// Categories: Dots (1-9), Bamboo (1-9), Characters (1-9), Winds (4), Dragons (3), Seasons (4), Flowers (4)
// Seasons and Flowers are unique but each group of 4 matches with each other
const TILE_SUITS = {
    dots: ['🀙', '🀚', '🀛', '🀜', '🀝', '🀞', '🀟', '🀠', '🀡'],
    bamboo: ['🀐', '🀑', '🀒', '🀓', '🀔', '🀕', '🀖', '🀗', '🀘'],
    chars: ['🀇', '🀈', '🀉', '🀊', '🀋', '🀌', '🀍', '🀎', '🀏'],
    winds: ['🀀', '🀁', '🀂', '🀃'],
    dragons: ['🀄', '🀅', '🀆']
};

// Build full tile set: 34 unique types × 4 copies = 136, plus 4 seasons + 4 flowers = 144
function buildTileSet() {
    const tiles = [];
    let id = 0;

    // Suited tiles: 9 of each suit × 4 copies = 108
    for (const suit of ['dots', 'bamboo', 'chars']) {
        for (let i = 0; i < 9; i++) {
            for (let copy = 0; copy < 4; copy++) {
                tiles.push({ id: id++, face: TILE_SUITS[suit][i], matchGroup: `${suit}_${i}` });
            }
        }
    }

    // Winds: 4 types × 4 copies = 16
    for (let i = 0; i < 4; i++) {
        for (let copy = 0; copy < 4; copy++) {
            tiles.push({ id: id++, face: TILE_SUITS.winds[i], matchGroup: `wind_${i}` });
        }
    }

    // Dragons: 3 types × 4 copies = 12
    for (let i = 0; i < 3; i++) {
        for (let copy = 0; copy < 4; copy++) {
            tiles.push({ id: id++, face: TILE_SUITS.dragons[i], matchGroup: `dragon_${i}` });
        }
    }

    // Seasons: 4 unique tiles, all match each other
    const seasons = ['🌸', '🌻', '🍂', '❄️'];
    for (let i = 0; i < 4; i++) {
        tiles.push({ id: id++, face: seasons[i], matchGroup: 'season' });
    }

    // Flowers: 4 unique tiles, all match each other
    const flowers = ['🌷', '🌺', '🪻', '🌼'];
    for (let i = 0; i < 4; i++) {
        tiles.push({ id: id++, face: flowers[i], matchGroup: 'flower' });
    }

    return tiles; // 144 tiles total
}

// Classic Turtle layout targeting exactly 144 positions
// Portrait-oriented (taller than wide) — fits mobile phone screens in portrait mode
function getTurtleLayout() {
    const positions = [];

    // Portrait Turtle: taller than wide to fit mobile screens
    // Each tile occupies a 2×2 unit cell
    // Grid: ~10 columns wide, ~12 rows tall

    // Layer 0 — bottom (largest): 78 tiles
    const layer0 = [
        // row 0: 8 tiles
        [2, 4, 6, 8, 10, 12, 14, 16],
        // row 1: 6 tiles
        [4, 6, 8, 10, 12, 14],
        // row 2: 8 tiles
        [2, 4, 6, 8, 10, 12, 14, 16],
        // row 3: 10 tiles (widest — center with wings)
        [0, 2, 4, 6, 8, 10, 12, 14, 16, 18],
        // row 4: 8 tiles
        [2, 4, 6, 8, 10, 12, 14, 16],
        // row 5: 6 tiles
        [4, 6, 8, 10, 12, 14],
        // row 6: 8 tiles
        [2, 4, 6, 8, 10, 12, 14, 16],
        // row 7: 10 tiles (widest — center with wings)
        [0, 2, 4, 6, 8, 10, 12, 14, 16, 18],
        // row 8: 8 tiles
        [2, 4, 6, 8, 10, 12, 14, 16],
        // row 9: 6 tiles
        [4, 6, 8, 10, 12, 14],
    ];

    for (let row = 0; row < layer0.length; row++) {
        for (const col of layer0[row]) {
            positions.push({ layer: 0, r: row * 2, c: col });
        }
    }

    // Layer 1 — 40 tiles (5 cols × 8 rows, centered)
    for (let row = 0; row < 8; row++) {
        for (const col of [5, 7, 9, 11, 13]) {
            positions.push({ layer: 1, r: (row + 1) * 2, c: col });
        }
    }

    // Layer 2 — 18 tiles (3 cols × 6 rows, centered)
    for (let row = 0; row < 6; row++) {
        for (const col of [7, 9, 11]) {
            positions.push({ layer: 2, r: (row + 2) * 2, c: col + 1 });
        }
    }

    // Layer 3 — 4 tiles (2 cols × 2 rows, centered)
    for (let row = 0; row < 2; row++) {
        for (const col of [9, 11]) {
            positions.push({ layer: 3, r: (row + 3.5) * 2, c: col });
        }
    }

    // Extra tiles to reach 144 (base: 78 + 40 + 18 + 4 = 140, need 4 more)
    const extras = [
        // Top wing tiles
        { layer: 0, r: 0, c: 0 },
        { layer: 0, r: 0, c: 18 },
        // Bottom wing tiles
        { layer: 0, r: 18, c: 0 },
        { layer: 0, r: 18, c: 18 },
    ];

    for (const pos of extras) {
        positions.push(pos);
    }

    return positions; // 144 total
}

// Game state
let tiles = []; // Array of { id, face, matchGroup, layer, r, c, removed }
let selectedTile = null;
let score = 0;
let moves = 0;
let gameRunning = false;
let hintTimeout = null;
let maxLayer = 3; // Maximum layer in current layout
let lastRenderedLayout = null; // Store layout from last renderBoard call

// DOM elements
const boardEl = document.getElementById('game-board');
const tilesLeftEl = document.getElementById('tiles-left');
const scoreDisplayEl = document.getElementById('score-display');
const overlay = document.getElementById('game-overlay');
const overlayTitle = document.getElementById('overlay-title');
const overlayMessage = document.getElementById('overlay-message');
const startBtn = document.getElementById('btn-start');
const hintBtn = document.getElementById('btn-hint');
const shuffleBtn = document.getElementById('btn-shuffle');
const pairsAvailableEl = document.getElementById('pairs-available');

// Shuffle an array in place (Fisher-Yates)
function shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
}

// Check if a tile is "free" (can be selected)
// A tile is free if:
// 1. Nothing is on top of it (no tile on a higher layer overlapping it)
// 2. At least one side (left or right) is open (no adjacent tile on the same layer)
function isTileFree(tile) {
    if (tile.removed || tile.removing) return false;

    const activeTiles = tiles.filter(t => !t.removed && !t.removing && t !== tile);

    // Check if anything is on top — a tile on a higher layer overlaps if
    // its position is close enough to cover this tile
    for (const t of activeTiles) {
        if (t.layer > tile.layer) {
            // Tiles overlap if their row and column ranges intersect
            // Each tile occupies roughly 2 units in each direction
            if (Math.abs(t.r - tile.r) < 2 && Math.abs(t.c - tile.c) < 2) {
                return false;
            }
        }
    }

    // Check left/right neighbors on the same layer (landscape layout — tiles slide left/right)
    let blockedLeft = false;
    let blockedRight = false;

    for (const t of activeTiles) {
        if (t.layer === tile.layer && Math.abs(t.r - tile.r) < 2) {
            const dc = t.c - tile.c;
            if (dc >= 1.5 && dc <= 2.5) blockedRight = true;
            if (dc <= -1.5 && dc >= -2.5) blockedLeft = true;
        }
    }

    return !blockedLeft || !blockedRight;
}

// Check if two tiles match
function tilesMatch(a, b) {
    return a.matchGroup === b.matchGroup && a.id !== b.id;
}

// Find all available matches
function findAvailableMatches() {
    const freeTiles = tiles.filter(t => !t.removed && isTileFree(t));
    const matches = [];

    for (let i = 0; i < freeTiles.length; i++) {
        for (let j = i + 1; j < freeTiles.length; j++) {
            if (tilesMatch(freeTiles[i], freeTiles[j])) {
                matches.push([freeTiles[i], freeTiles[j]]);
            }
        }
    }

    return matches;
}

// Calculate the current highest active layer for zoom purposes
function getActiveMaxLayer() {
    let maxL = 0;
    for (const t of tiles) {
        if (!t.removed && t.layer > maxL) {
            maxL = t.layer;
        }
    }
    return maxL;
}

// Calculate zoom: scale and translate to center remaining tiles in view
function calculateZoom() {
    const activeTiles = tiles.filter(t => !t.removed);
    if (activeTiles.length === 0) return { scale: 1, translateX: 0, translateY: 0 };

    // Use stored layout from last renderBoard call to match actual tile positions
    const { tileW, tileH } = lastRenderedLayout || calculateLayout();
    const layerOffsetX = Math.max(2, tileW * 0.05);
    const layerOffsetY = Math.max(2, tileH * 0.05);

    // Find bounding box of remaining tiles (pixel coords within the board)
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const t of activeTiles) {
        const x = (t.c / 2) * tileW + t.layer * layerOffsetX;
        const y = (t.r / 2) * tileH + t.layer * layerOffsetY;
        if (x < minX) minX = x;
        if (y < minY) minY = y;
        if (x + tileW > maxX) maxX = x + tileW;
        if (y + tileH > maxY) maxY = y + tileH;
    }

    const contentW = maxX - minX;
    const contentH = maxY - minY;
    if (contentW <= 0 || contentH <= 0) return { scale: 1, translateX: 0, translateY: 0 };

    const boardW = parseFloat(boardEl.style.width) || boardEl.offsetWidth || 1;
    const boardH = parseFloat(boardEl.style.height) || boardEl.offsetHeight || 1;

    const boardArea = document.querySelector('.game-board-area');
    const availW = boardArea.clientWidth - 4;
    const availH = boardArea.clientHeight - 4;

    // Desired scale: fit the remaining content to the available area
    // Use 0.88 safety factor to ensure tiles stay well within bounds
    const desiredScale = Math.min(availW / contentW, availH / contentH) * 0.88;

    // Clamp: never shrink below 1.0, cap at 2.0x
    const scale = Math.max(Math.min(desiredScale, 2.0), 1);

    // Calculate translation to center the content bounding box in the container.
    // Transform is: translate(tx, ty) scale(s) with transform-origin: center center.
    // CSS applies right-to-left: first scale around center, then translate.
    // A board-local point (px, py) maps to visual position relative to board's layout box:
    //   visualX = tx + boardW/2 + (px - boardW/2) * scale
    //   visualY = ty + boardH/2 + (py - boardH/2) * scale
    // The board is flexbox-centered, so its layout-box left in container = (availW - boardW) / 2.
    // Container-space position = boardLeft + visualX.
    // We want the content center to appear at the container center.
    const contentCenterX = (minX + maxX) / 2;
    const contentCenterY = (minY + maxY) / 2;
    const boardCenterX = boardW / 2;
    const boardCenterY = boardH / 2;

    // Center the content: solve for tx such that content center maps to container center.
    // containerCenter = boardLeft + tx + boardW/2 + (contentCenterX - boardW/2) * scale
    // containerCenter = availW / 2
    // boardLeft = (availW - boardW) / 2
    // => (availW - boardW)/2 + tx + boardW/2 + (contentCenterX - boardW/2) * scale = availW/2
    // => tx = availW/2 - (availW - boardW)/2 - boardW/2 - (contentCenterX - boardW/2) * scale
    // => tx = boardW/2 - (contentCenterX - boardW/2) * scale - boardW/2
    // => tx = -(contentCenterX - boardW/2) * scale
    let tx = -(contentCenterX - boardCenterX) * scale;
    let ty = -(contentCenterY - boardCenterY) * scale;

    // Now clamp so no content edge goes outside the container.
    // Content left edge in container space:
    //   boardLeft + tx + boardW/2 + (minX - boardW/2) * scale >= margin
    // Content right edge:
    //   boardLeft + tx + boardW/2 + (maxX - boardW/2) * scale <= availW - margin
    const boardLeft = (availW - boardW) / 2;
    const boardTop = (availH - boardH) / 2;
    const margin = 2;

    const visLeftContent = boardLeft + tx + boardCenterX + (minX - boardCenterX) * scale;
    const visRightContent = boardLeft + tx + boardCenterX + (maxX - boardCenterX) * scale;
    const visTopContent = boardTop + ty + boardCenterY + (minY - boardCenterY) * scale;
    const visBottomContent = boardTop + ty + boardCenterY + (maxY - boardCenterY) * scale;

    // Clamp horizontally
    if (visRightContent - visLeftContent <= availW - 2 * margin) {
        // Content fits — just shift if overflowing either side
        if (visLeftContent < margin) {
            tx += margin - visLeftContent;
        } else if (visRightContent > availW - margin) {
            tx -= visRightContent - (availW - margin);
        }
    }
    // If content is wider than container, centering is the best we can do (already centered)

    // Clamp vertically
    if (visBottomContent - visTopContent <= availH - 2 * margin) {
        if (visTopContent < margin) {
            ty += margin - visTopContent;
        } else if (visBottomContent > availH - margin) {
            ty -= visBottomContent - (availH - margin);
        }
    }

    return { scale, translateX: tx, translateY: ty };
}

// Apply zoom to the board (batched via rAF for smooth rendering)
let zoomRafId = null;
function applyZoom() {
    if (zoomRafId) return; // already scheduled
    zoomRafId = requestAnimationFrame(() => {
        zoomRafId = null;
        const { scale, translateX, translateY } = calculateZoom();
        boardEl.style.transform = `translate3d(${translateX}px, ${translateY}px, 0) scale(${scale})`;
    });
}

// Force-apply zoom synchronously (for cases where we need immediate update)
function applyZoomSync() {
    if (zoomRafId) {
        cancelAnimationFrame(zoomRafId);
        zoomRafId = null;
    }
    const { scale, translateX, translateY } = calculateZoom();
    boardEl.style.transform = `translate3d(${translateX}px, ${translateY}px, 0) scale(${scale})`;
}

// Calculate tile sizes and scale based on available space
function calculateLayout() {
    const boardArea = document.querySelector('.game-board-area');
    const availW = boardArea.clientWidth - 4;
    const availH = boardArea.clientHeight - 4;

    // Find bounds of the layout
    let maxR = 0, maxC = 0;
    for (const t of tiles) {
        if (!t.removed) {
            if (t.r > maxR) maxR = t.r;
            if (t.c > maxC) maxC = t.c;
        }
    }

    // Each tile occupies 2 units. Add padding for tile width + layer offsets
    const gridCols = maxC + 2 + 1; // +2 for tile width, +1 for layer offset
    const gridRows = maxR + 2 + 1;

    // Calculate tile size to fit
    const baseTileW = availW / gridCols * 2;
    const baseTileH = availH / gridRows * 2;

    // Maintain tile aspect ratio ~0.78 (w:h) — standard mahjong tile proportions
    const ratio = 0.78;
    let tileW = Math.min(baseTileW, baseTileH * ratio);
    let tileH = tileW / ratio;

    // Clamp — allow larger tiles for bigger screens
    tileW = Math.max(20, Math.min(tileW, 64));
    tileH = tileW / ratio;

    // Verify that the total board (grid + layer offsets + padding) fits within available space.
    // If not, scale tiles down to fit.
    const layerOffsetX = Math.max(2, tileW * 0.05);
    const layerOffsetY = Math.max(2, tileH * 0.05);
    const layerCount = getActiveMaxLayer();
    const totalBoardW = (gridCols / 2) * tileW + layerCount * layerOffsetX + 10;
    const totalBoardH = (gridRows / 2) * tileH + layerCount * layerOffsetY + 10;

    if (totalBoardW > availW || totalBoardH > availH) {
        const scaleW = availW / totalBoardW;
        const scaleH = availH / totalBoardH;
        const fit = Math.min(scaleW, scaleH);
        tileW = Math.max(20, tileW * fit);
        tileH = tileW / ratio;
    }

    return { tileW, tileH, gridCols, gridRows };
}

// Render all tiles to the board
function renderBoard(animate) {
    boardEl.innerHTML = '';

    const { tileW, tileH, gridCols, gridRows } = calculateLayout();
    lastRenderedLayout = { tileW, tileH, gridCols, gridRows };

    // Set CSS variables for tile size
    const fontSize = Math.max(16, Math.floor(tileW * 1.05));
    document.documentElement.style.setProperty('--tile-w', tileW + 'px');
    document.documentElement.style.setProperty('--tile-h', tileH + 'px');
    document.documentElement.style.setProperty('--tile-font', fontSize + 'px');

    // Layer offset for 3D effect
    const layerOffsetX = Math.max(2, tileW * 0.05);
    const layerOffsetY = Math.max(2, tileH * 0.05);

    // Calculate board dimensions using actual layer count
    const currentLayerCount = getActiveMaxLayer();
    const boardW = (gridCols / 2) * tileW + currentLayerCount * layerOffsetX + 10;
    const boardH = (gridRows / 2) * tileH + currentLayerCount * layerOffsetY + 10;
    boardEl.style.width = boardW + 'px';
    boardEl.style.height = boardH + 'px';

    // Determine current max layer for gold highlighting
    const currentMaxLayer = getActiveMaxLayer();

    // Sort tiles by layer (draw bottom layers first) then by position
    const sortedTiles = [...tiles]
        .filter(t => !t.removed)
        .sort((a, b) => {
            if (a.layer !== b.layer) return a.layer - b.layer;
            if (a.r !== b.r) return a.r - b.r;
            return a.c - b.c;
        });

    // Use DocumentFragment to batch DOM insertions (avoids layout thrashing)
    const fragment = document.createDocumentFragment();

    for (let idx = 0; idx < sortedTiles.length; idx++) {
        const tile = sortedTiles[idx];
        const el = document.createElement('div');
        el.className = 'mahjong-tile';
        el.dataset.id = tile.id;

        // Position: each grid unit = half tile
        const x = (tile.c / 2) * tileW + tile.layer * layerOffsetX;
        const y = (tile.r / 2) * tileH + tile.layer * layerOffsetY;
        el.style.left = x + 'px';
        el.style.top = y + 'px';
        el.style.zIndex = tile.layer * 100 + Math.floor(tile.r) * 10;

        // Tile face
        const face = document.createElement('div');
        face.className = 'tile-face';
        const faceContent = document.createElement('span');
        faceContent.className = 'tile-face-content';
        // Flowers and seasons render taller — use smaller size and centered position
        const imageEmojis = ['🌸', '🌻', '🍂', '❄️', '🌷', '🌺', '🪻', '🌼'];
        if (imageEmojis.includes(tile.face)) {
            faceContent.classList.add('tile-face-image');
        }
        faceContent.textContent = tile.face;
        face.appendChild(faceContent);
        el.appendChild(face);

        // Mark free/blocked
        const free = isTileFree(tile);
        el.classList.add(free ? 'free' : 'blocked');

        // Click handler
        el.addEventListener('click', () => onTileClick(tile));

        // Board assembly animation: fly in from random edge
        if (animate) {
            const boardRect = { w: boardW, h: boardH };
            // Random start from outside the board
            const side = Math.floor(Math.random() * 4);
            let startX, startY;
            if (side === 0) { startX = -100 - Math.random() * 200; startY = Math.random() * boardRect.h; } // left
            else if (side === 1) { startX = boardRect.w + 100 + Math.random() * 200; startY = Math.random() * boardRect.h; } // right
            else if (side === 2) { startX = Math.random() * boardRect.w; startY = -100 - Math.random() * 200; } // top
            else { startX = Math.random() * boardRect.w; startY = boardRect.h + 100 + Math.random() * 200; } // bottom

            const flyInX = startX - x;
            const flyInY = startY - y;
            el.style.setProperty('--fly-in-x', flyInX + 'px');
            el.style.setProperty('--fly-in-y', flyInY + 'px');
            // Stagger: bottom layers first, then upper layers
            const delay = (tile.layer * 300) + (idx * 6) + Math.random() * 200;
            el.style.animationDelay = delay + 'ms';
            el.classList.add('fly-in');
        }

        fragment.appendChild(el);
    }

    boardEl.appendChild(fragment);

    // Apply current zoom level synchronously after render
    applyZoomSync();
}

// Update the visual state of tiles (selected, free/blocked) without full re-render
function updateTileStates() {
    const tileEls = boardEl.querySelectorAll('.mahjong-tile');
    for (const el of tileEls) {
        const id = parseInt(el.dataset.id, 10);
        const tile = tiles.find(t => t.id === id);
        if (!tile || tile.removed || tile.removing) continue;

        const free = isTileFree(tile);
        el.classList.toggle('free', free);
        el.classList.toggle('blocked', !free);
        el.classList.toggle('selected', selectedTile === tile);
    }
}

// Handle tile click
function onTileClick(tile) {
    if (!gameRunning || tile.removed || tile.removing) return;
    if (!isTileFree(tile)) {
        // Shake the blocked tile to indicate it can't be selected.
        // The shake animation runs on .tile-face (inner element) to avoid
        // conflicting with the outer .mahjong-tile transform (which is used
        // for hover, fly animations, and zoom). This prevents the "fly away" bug.
        const el = boardEl.querySelector(`[data-id="${tile.id}"]`);
        if (el) {
            const face = el.querySelector('.tile-face');
            // If no .tile-face exists (e.g. special tile variant), skip shake
            if (!face) return;

            // If already shaking (rapid re-click), clean up first
            if (el._shakeCleanup) {
                el._shakeCleanup();
            }
            el.classList.remove('shake');
            // Force reflow so re-adding the class restarts the animation
            void el.offsetWidth;
            el.classList.add('shake');

            let cleaned = false;

            function endShake() {
                if (cleaned) return;
                cleaned = true;
                face.removeEventListener('animationend', handler);
                clearTimeout(timer);
                el._shakeCleanup = null;
                el.classList.remove('shake');
            }

            function handler(e) {
                if (e.animationName !== 'tile-shake') return;
                endShake();
            }

            face.addEventListener('animationend', handler);

            // Safety timeout: if animationend doesn't fire (WebView quirk),
            // clean up after the CSS animation duration (0.4s) + small margin
            const timer = setTimeout(endShake, 450);

            // Store cleanup function for rapid re-click cancellation
            el._shakeCleanup = endShake;
        }
        return;
    }

    clearHints();

    if (selectedTile === null) {
        selectedTile = tile;
        updateTileStates();
        return;
    }

    if (selectedTile.id === tile.id) {
        selectedTile = null;
        updateTileStates();
        return;
    }

    // Check match
    if (tilesMatch(selectedTile, tile)) {
        removePair(selectedTile, tile);
        selectedTile = null;
    } else {
        // No match — select new tile
        selectedTile = tile;
        updateTileStates();
    }
}

// Create particle burst at a given position (relative to boardEl)
function createParticles(x, y) {
    const particleCount = 8;
    const colors = ['#ffe066', '#f5c842', '#d4a843', '#fff', '#ffd700', '#ff9900'];
    for (let i = 0; i < particleCount; i++) {
        const p = document.createElement('div');
        p.className = 'match-particle';
        const angle = (Math.PI * 2 * i) / particleCount + (Math.random() - 0.5) * 0.5;
        const dist = 30 + Math.random() * 40;
        const dx = Math.cos(angle) * dist;
        const dy = Math.sin(angle) * dist;
        const size = 4 + Math.random() * 5;
        p.style.width = size + 'px';
        p.style.height = size + 'px';
        p.style.left = x + 'px';
        p.style.top = y + 'px';
        p.style.background = colors[Math.floor(Math.random() * colors.length)];
        p.style.setProperty('--dx', dx + 'px');
        p.style.setProperty('--dy', dy + 'px');
        boardEl.appendChild(p);
        p.addEventListener('animationend', () => p.remove());
    }
}

// Animate a tile along an egg-curve arc using CSS transforms (GPU-accelerated)
// Longitudinal: linear — uniform forward speed, equal distance in equal time
// Lateral: sin(πt) — symmetric scatter peaking at 50%
// Phase 1 (0→50%): tiles move forward + scatter outward (разлёт)
// Phase 2 (50→100%): tiles move forward + converge inward (слетание)
// Both phases cover equal vertical distance and equal time
function animateArc(el, startX, startY, endX, endY, amplitude, perpX, perpY, duration, onContact, tContact) {
    const startTime = performance.now();
    el.classList.add('flying');
    let contactFired = false;
    if (tContact === undefined) tContact = 0.98;

    function step(now) {
        const t = Math.min((now - startTime) / duration, 1);

        // Longitudinal: linear — constant speed, no fast/slow phases
        const tLong = t;

        // Lateral: sin(πt) with quadratic fade-out in last 15%
        // Without fade, sin(π·0.94) = 0.187 → tiles arrive with 19% lateral offset
        // → inconsistent meeting angles (corners vs faces depending on direction)
        // Fade ensures lateral ≈ 0 at contact → always clean face-to-face meeting
        const sinVal = Math.sin(Math.PI * t);
        const fade = t < 0.85 ? 1 : (1 - t) / 0.15;
        const tLat = sinVal * fade * fade;

        // Position: uniform forward motion + lateral arc overlay
        const x = startX + (endX - startX) * tLong + perpX * amplitude * tLat;
        const y = startY + (endY - startY) * tLong + perpY * amplitude * tLat;

        // Slight scale-down as tiles approach impact point
        const scale = 1 - 0.08 * t * t;

        el.style.transform = `translate3d(${x - startX}px, ${y - startY}px, 0) scale(${scale})`;

        if (!contactFired && t >= tContact) {
            contactFired = true;
            if (onContact) onContact();
        }

        if (t < 1) {
            requestAnimationFrame(step);
        } else {
            el.classList.remove('flying');
            if (!contactFired) {
                contactFired = true;
                if (onContact) onContact();
            }
        }
    }
    requestAnimationFrame(step);
}

// Calculate normalized direction and perpendicular vectors from A→B.
// Returns fallback values when tiles have coincident centers (dist ≈ 0)
// to prevent NaN in downstream normal/perpendicular calculations.
function calcDirection(dx, dy, dist) {
    if (dist < 1) {
        return { nx: 1, ny: 0, perpX: 0, perpY: 1 };
    }
    const nx = dx / dist;
    const ny = dy / dist;
    return { nx, ny, perpX: -ny, perpY: nx };
}

// Remove a matched pair with egg-curve arc animation
function removePair(a, b) {
    a.removing = true;
    b.removing = true;

    const elA = boardEl.querySelector(`[data-id="${a.id}"]`);
    const elB = boardEl.querySelector(`[data-id="${b.id}"]`);

    if (!elA || !elB) {
        a.removing = false;
        b.removing = false;
        a.removed = true;
        b.removed = true;
        moves++;
        score += 150;
        updateUI();
        updateTileStates();
        applyZoom();
        checkGameState();
        return;
    }

    // Get current positions (top-left corner of each tile)
    const ax = parseFloat(elA.style.left);
    const ay = parseFloat(elA.style.top);
    const bx = parseFloat(elB.style.left);
    const by = parseFloat(elB.style.top);

    const tileW = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--tile-w'));
    const tileH = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--tile-h'));

    // Centers of each tile
    const aCx = ax + tileW / 2;
    const aCy = ay + tileH / 2;
    const bCx = bx + tileW / 2;
    const bCy = by + tileH / 2;

    // Distance between tile centers
    const dx = bCx - aCx;
    const dy = bCy - aCy;
    const dist = Math.sqrt(dx * dx + dy * dy);

    // Meeting point: midpoint between tile centers
    const meetX = (aCx + bCx) / 2;
    const meetY = (aCy + bCy) / 2;

    // Direction & perpendicular vectors (with explicit guard for coincident tiles)
    const { nx, ny, perpX, perpY } = calcDirection(dx, dy, dist);

    // Tiles always meet SIDE BY SIDE horizontally (боковые грани)
    // regardless of whether they're horizontal, vertical, or diagonal
    // Left tile stays left, right tile stays right (no crossing)
    const aIsLeft = aCx < bCx || (aCx === bCx && aCy < bCy);
    const sideGap = Math.min(tileW * 0.45, dist * 0.4);
    const endAx = meetX + (aIsLeft ? -sideGap : sideGap) - tileW / 2;
    const endAy = meetY - tileH / 2;
    const endBx = meetX + (aIsLeft ? sideGap : -sideGap) - tileW / 2;
    const endBy = meetY - tileH / 2;

    // Board layout dimensions (pre-transform)
    const boardW = parseFloat(boardEl.style.width) || boardEl.offsetWidth || 1;
    const boardH = parseFloat(boardEl.style.height) || boardEl.offsetHeight || 1;

    // Scatter direction: ALWAYS HORIZONTAL
    // This guarantees Y movement is purely linear (50% vertical distance at midpoint)
    // Tile A scatters to its own side, tile B to the opposite side
    const scatterDirA = aIsLeft ? -1 : 1;
    const scatterDirB = -scatterDirA;

    // Amplitude: must guarantee visible scatter in ALL cases
    // Base: proportional to tile width
    // Minimum: at least 30% of vertical distance so stacked tiles visibly fly apart
    // Clamped by maxAmplitude so tiles stay on-screen on small devices (320px)
    const boardSpan = Math.min(boardW, boardH);
    const maxAmplitude = boardSpan * 0.35;
    const absDy = Math.abs(dy);
    const closeness = Math.max(0, 1 - dist / (tileW * 6));
    const baseAmplitude = Math.min(Math.max(tileW * 2.0, absDy * 0.3), maxAmplitude);
    const boost = 1 + closeness * 1.5;
    const amplitude = Math.min(baseAmplitude * boost, maxAmplitude);

    // Compute tContact from geometry: remove tiles when their edges would just touch
    // Use scale at t=0.98 (nominal contact time), not t=1, for accurate gap estimate
    // endGap = edge-to-edge gap at endpoint; negative means overlap
    // If no overlap → fire late (0.98); if overlap → fire earlier proportionally
    const nominalT = 0.98;
    const scaleAtContact = 1 - 0.08 * nominalT * nominalT; // animateArc: scale = 1 - 0.08*t*t
    const endGap = 2 * sideGap - tileW * scaleAtContact;
    const tContact = endGap >= 0 ? 0.98 : Math.max(0.90, 0.98 + endGap / tileW);

    // Duration scales with distance for smooth arc animation
    const duration = Math.round(Math.min(900, Math.max(520, 380 + dist * 0.7)));
    let contactCount = 0;

    // onContact fires near contact point for each tile (near-contact removal)
    // Both must fire before actual removal — shared counter guards synchronicity
    function onContact() {
        contactCount++;
        if (contactCount === 2) {
            createParticles(meetX, meetY);
            if (elA.parentNode) elA.remove();
            if (elB.parentNode) elB.remove();
            a.removing = false;
            b.removing = false;
            a.removed = true;
            b.removed = true;
            moves++;
            score += 150;
            updateUI();
            updateTileStates();
            applyZoom();
            checkGameState();
        }
    }

    // Make both tiles appear selected (blue) before the fly animation starts
    elA.classList.add('selected');
    elB.classList.add('selected');

    // Update tile states immediately so that tiles freed by this removal
    // become available (clickable) at the start of the fly animation,
    // not after it finishes
    updateTileStates();

    // Scatter is ALWAYS HORIZONTAL (perpY=0) — Y is purely linear → 50% at midpoint guaranteed
    // Tile A scatters to its side, tile B to the opposite side
    animateArc(elA, ax, ay, endAx, endAy, amplitude, scatterDirA, 0, duration, onContact, tContact);
    animateArc(elB, bx, by, endBx, endBy, amplitude, scatterDirB, 0, duration, onContact, tContact);
}

// Update UI counters
// Pairs count is cached and updated via a debounced rAF to avoid expensive
// findAvailableMatches() computation on every updateUI() call
let pairsRafId = null;

function updateUI() {
    const remaining = tiles.filter(t => !t.removed).length;
    tilesLeftEl.textContent = remaining;
    if (scoreDisplayEl) scoreDisplayEl.textContent = score;

    // Schedule debounced pairs count update (expensive O(n²) operation)
    if (pairsAvailableEl) {
        if (remaining > 0 && gameRunning && typeof findAvailableMatches === 'function') {
            if (!pairsRafId) {
                pairsRafId = requestAnimationFrame(() => {
                    pairsRafId = null;
                    const matches = findAvailableMatches();
                    pairsAvailableEl.textContent = matches ? matches.length : 0;
                });
            }
        } else {
            pairsAvailableEl.textContent = 0;
        }
    }
}

// Check if game is won or stuck
function checkGameState() {
    const remaining = tiles.filter(t => !t.removed).length;

    if (remaining === 0) {
        gameRunning = false;
        score += 1500; // Bonus for winning
        updateUI();
        overlayTitle.textContent = 'YOU WIN! 🏆';
        overlayMessage.textContent = `Score: ${score} | Matches: ${moves}`;
        startBtn.textContent = 'Play Again';
        overlay.classList.remove('hidden');
        return;
    }

    const matches = findAvailableMatches();
    if (matches.length === 0) {
        // No moves available — auto-shuffle the board
        shuffleTiles();
    }
}

// Hint: highlight one available pair
function showHint() {
    if (!gameRunning) return;

    clearHints();
    const matches = findAvailableMatches();
    if (matches.length === 0) return;

    const [a, b] = matches[0];
    const elA = boardEl.querySelector(`[data-id="${a.id}"]`);
    const elB = boardEl.querySelector(`[data-id="${b.id}"]`);

    if (elA) elA.classList.add('hint');
    if (elB) elB.classList.add('hint');

    // Deduct points for using hint
    score = Math.max(0, score - 25);
    updateUI();

    hintTimeout = setTimeout(clearHints, 2000);
}

// Clear hint highlights
function clearHints() {
    if (hintTimeout) {
        clearTimeout(hintTimeout);
        hintTimeout = null;
    }
    const hinted = boardEl.querySelectorAll('.hint');
    for (const el of hinted) {
        el.classList.remove('hint');
    }
}

// Generate a solvable face assignment for a reshuffle (same logic as generateSolvableLayout
// but works with an existing set of faces/matchGroups instead of building a new tile set)
function generateSolvableShuffleLayout(positions, faces) {
    // Group faces into pairs by matchGroup
    const pairGroups = {};
    for (const f of faces) {
        if (!pairGroups[f.matchGroup]) pairGroups[f.matchGroup] = [];
        pairGroups[f.matchGroup].push(f);
    }

    const pairs = [];
    for (const group of Object.values(pairGroups)) {
        shuffle(group);
        for (let i = 0; i < group.length; i += 2) {
            pairs.push([group[i], group[i + 1]]);
        }
    }
    shuffle(pairs);

    // All positions start as occupied
    const occupied = positions.map(p => ({ ...p }));
    const assignment = new Array(positions.length).fill(null);

    let pairIndex = 0;

    // Repeatedly find free positions and assign pairs (reverse placement)
    while (pairIndex < pairs.length) {
        const active = occupied.filter(Boolean);

        const freeIndices = [];
        for (let i = 0; i < occupied.length; i++) {
            if (occupied[i] && isPositionFree(occupied[i], active)) {
                freeIndices.push(i);
            }
        }

        if (freeIndices.length < 2) {
            break;
        }

        shuffle(freeIndices);

        const idx1 = freeIndices[0];
        const idx2 = freeIndices[1];

        assignment[idx1] = pairs[pairIndex][0];
        assignment[idx2] = pairs[pairIndex][1];

        occupied[idx1] = null;
        occupied[idx2] = null;

        pairIndex++;
    }

    // Fallback: assign any remaining pairs to unassigned positions
    const unassigned = [];
    for (let i = 0; i < assignment.length; i++) {
        if (!assignment[i]) unassigned.push(i);
    }
    while (pairIndex < pairs.length && unassigned.length >= 2) {
        assignment[unassigned.pop()] = pairs[pairIndex][0];
        assignment[unassigned.pop()] = pairs[pairIndex][1];
        pairIndex++;
    }

    return assignment;
}

// Shuffle remaining tiles' faces (keep positions, reassign tile faces)
// Animated: tiles fly out, faces reshuffle, tiles fly back in
let shuffleInProgress = false;

function shuffleTiles() {
    if (!gameRunning || shuffleInProgress || tiles.some(t => t.removing)) return;
    shuffleInProgress = true;

    clearHints();
    selectedTile = null;

    const tileEls = boardEl.querySelectorAll('.mahjong-tile');
    const boardRect = { w: boardEl.offsetWidth, h: boardEl.offsetHeight };

    // Phase 1: Fly out all tiles
    let flyOutCount = 0;
    const totalTiles = tileEls.length;
    let reshuffleDone = false;

    // Fallback in case no tiles are on the board
    if (totalTiles === 0) {
        shuffleInProgress = false;
        return;
    }

    // Calculate max animation delay + duration for fallback timeout
    const maxDelay = totalTiles * 3 + 50; // max possible delay
    const animDuration = 500; // fly-out-anim is 0.5s
    const fallbackMs = maxDelay + animDuration + 300; // extra safety margin

    for (let i = 0; i < tileEls.length; i++) {
        const el = tileEls[i];
        // Random fly-out direction — use pure relative offsets from current position
        const side = Math.floor(Math.random() * 4);
        let offX, offY;
        if (side === 0) { offX = -(boardRect.w + 100 + Math.random() * 150); offY = (Math.random() - 0.5) * 200; } // left
        else if (side === 1) { offX = boardRect.w + 100 + Math.random() * 150; offY = (Math.random() - 0.5) * 200; } // right
        else if (side === 2) { offX = (Math.random() - 0.5) * 200; offY = -(boardRect.h + 100 + Math.random() * 150); } // top
        else { offX = (Math.random() - 0.5) * 200; offY = boardRect.h + 100 + Math.random() * 150; } // bottom

        el.style.setProperty('--fly-out-x', offX + 'px');
        el.style.setProperty('--fly-out-y', offY + 'px');
        el.style.animationDelay = (i * 3 + Math.random() * 50) + 'ms';
        el.classList.add('fly-out');

        el.addEventListener('animationend', function handler() {
            el.removeEventListener('animationend', handler);
            flyOutCount++;
            if (flyOutCount === totalTiles && !reshuffleDone) {
                reshuffleDone = true;
                doReshuffle();
            }
        });
    }

    // Safety fallback: if animationend events don't all fire, force reshuffle
    setTimeout(() => {
        if (!reshuffleDone) {
            reshuffleDone = true;
            doReshuffle();
        }
    }, fallbackMs);

    function doReshuffle() {
        const active = tiles.filter(t => !t.removed);
        const faces = active.map(t => ({ face: t.face, matchGroup: t.matchGroup }));
        shuffle(faces);

        // Use reverse placement to guarantee solvability after shuffle
        const positions = active.map(t => ({ layer: t.layer, r: t.r, c: t.c }));
        const solvableAssignment = generateSolvableShuffleLayout(positions, faces);

        for (let i = 0; i < active.length; i++) {
            active[i].face = solvableAssignment[i].face;
            active[i].matchGroup = solvableAssignment[i].matchGroup;
        }

        score = Math.max(0, score - 50);
        updateUI();
        renderBoard(true); // fly-in animation
        shuffleInProgress = false;

        // After the shuffle animation settles, check if there are still no moves
        setTimeout(() => {
            if (gameRunning) {
                checkGameState();
            }
        }, 1200);
    }
}

// Check if a position is "free" (removable) given a set of occupied positions
// A position is free if nothing is on top and at least one side (left or right) is open
function isPositionFree(pos, occupied) {
    // Check if anything is on top
    for (const other of occupied) {
        if (other === pos) continue;
        if (other.layer > pos.layer &&
            Math.abs(other.r - pos.r) < 2 &&
            Math.abs(other.c - pos.c) < 2) {
            return false;
        }
    }

    // Check left/right neighbors on the same layer
    let blockedLeft = false;
    let blockedRight = false;

    for (const other of occupied) {
        if (other === pos) continue;
        if (other.layer === pos.layer && Math.abs(other.r - pos.r) < 2) {
            const dc = other.c - pos.c;
            if (dc >= 1.5 && dc <= 2.5) blockedRight = true;
            if (dc <= -1.5 && dc >= -2.5) blockedLeft = true;
        }
    }

    return !blockedLeft || !blockedRight;
}

// Generate a solvable tile placement using reverse layout method
// 1. Start with all positions "occupied"
// 2. Find free (removable) positions, pick pairs, assign matching tiles
// 3. Remove those positions from occupied set
// 4. Repeat until all positions are assigned
function generateSolvableLayout(positions) {
    const tileSet = buildTileSet();
    shuffle(tileSet);

    // Group tiles into pairs by matchGroup
    const pairGroups = {};
    for (const tile of tileSet) {
        if (!pairGroups[tile.matchGroup]) pairGroups[tile.matchGroup] = [];
        pairGroups[tile.matchGroup].push(tile);
    }

    // Build list of pairs: each matchGroup has 4 tiles = 2 pairs (except seasons/flowers which are 4 tiles = 2 pairs)
    const pairs = [];
    for (const group of Object.values(pairGroups)) {
        shuffle(group);
        for (let i = 0; i < group.length; i += 2) {
            pairs.push([group[i], group[i + 1]]);
        }
    }
    shuffle(pairs);

    // All positions start as occupied
    const occupied = positions.map(p => ({ ...p }));
    const assignment = new Array(positions.length).fill(null); // index -> tile data

    let pairIndex = 0;

    // Repeatedly find free positions and assign pairs
    while (pairIndex < pairs.length) {
        // Build active list once per iteration
        const active = occupied.filter(Boolean);

        // Find all free positions in current occupied set
        const freeIndices = [];
        for (let i = 0; i < occupied.length; i++) {
            if (occupied[i] && isPositionFree(occupied[i], active)) {
                freeIndices.push(i);
            }
        }

        if (freeIndices.length < 2) {
            // Shouldn't happen with a valid layout, but fallback: break and fill remaining randomly
            break;
        }

        // Shuffle free positions to add randomness
        shuffle(freeIndices);

        // Pick two free positions and assign a matching pair
        const idx1 = freeIndices[0];
        const idx2 = freeIndices[1];

        const [tileA, tileB] = pairs[pairIndex];
        assignment[idx1] = tileA;
        assignment[idx2] = tileB;

        // "Remove" these positions from occupied
        occupied[idx1] = null;
        occupied[idx2] = null;

        pairIndex++;
    }

    // Fallback: assign any remaining pairs to unassigned positions
    const unassigned = [];
    for (let i = 0; i < assignment.length; i++) {
        if (!assignment[i]) unassigned.push(i);
    }
    while (pairIndex < pairs.length && unassigned.length >= 2) {
        const [tileA, tileB] = pairs[pairIndex];
        assignment[unassigned.pop()] = tileA;
        assignment[unassigned.pop()] = tileB;
        pairIndex++;
    }

    return assignment;
}

// Clean up any in-flight animation state (flying tiles, stale flags).
// Called on game reset to prevent "dirty" state when animations are interrupted.
function cleanupFlyingTiles() {
    const flyingEls = boardEl.querySelectorAll('.mahjong-tile.flying');
    for (const el of flyingEls) {
        el.classList.remove('flying');
    }
    for (const t of tiles) {
        if (t.removing) t.removing = false;
    }
}

// Start a new game
function startGame() {
    cleanupFlyingTiles();
    shuffleInProgress = false;
    const positions = getTurtleLayout();
    const assignment = generateSolvableLayout(positions);

    tiles = [];
    for (let i = 0; i < positions.length; i++) {
        const pos = positions[i];
        const tileData = assignment[i];
        tiles.push({
            id: tileData.id,
            face: tileData.face,
            matchGroup: tileData.matchGroup,
            layer: pos.layer,
            r: pos.r,
            c: pos.c,
            removed: false,
        });
    }

    // Calculate max layer
    maxLayer = 0;
    for (const t of tiles) {
        if (t.layer > maxLayer) maxLayer = t.layer;
    }

    selectedTile = null;
    score = 0;
    moves = 0;
    gameRunning = true;

    updateUI();
    renderBoard(true); // animate board assembly
    overlay.classList.add('hidden');
}

// Auto-play: remove one pair per click
const autoPlayBtn = document.getElementById('btn-autoplay');

function doAutoMove() {
    if (!gameRunning) return;
    selectedTile = null;
    updateTileStates();

    const matches = findAvailableMatches();
    if (matches.length === 0) return;
    const [a, b] = matches[Math.floor(Math.random() * matches.length)];
    removePair(a, b);
}

// Event listeners
startBtn.addEventListener('click', startGame);
hintBtn.addEventListener('click', showHint);
shuffleBtn.addEventListener('click', shuffleTiles);
if (autoPlayBtn) autoPlayBtn.addEventListener('click', doAutoMove);

// Prevent scrolling/zooming on touch — critical for Telegram WebView stability
document.addEventListener('touchmove', (e) => {
    e.preventDefault();
}, { passive: false });

// Prevent double-tap zoom on iOS WebView
document.addEventListener('dblclick', (e) => {
    e.preventDefault();
}, { passive: false });

// Prevent pinch-zoom gestures in WebView
document.addEventListener('gesturestart', (e) => {
    e.preventDefault();
}, { passive: false });
document.addEventListener('gesturechange', (e) => {
    e.preventDefault();
}, { passive: false });
document.addEventListener('gestureend', (e) => {
    e.preventDefault();
}, { passive: false });

// Handle window resize — debounced re-render of the board
let resizeTimer = null;
window.addEventListener('resize', () => {
    if (!gameRunning || tiles.length === 0) return;
    if (resizeTimer) clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
        resizeTimer = null;
        renderBoard();
    }, 150);
});
