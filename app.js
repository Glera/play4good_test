// Initialize Telegram WebApp
const tg = window.Telegram.WebApp;
tg.ready();
tg.expand();

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
// Landscape-oriented (wider than tall) — uses full screen width in portrait WebView
function getTurtleLayout() {
    const positions = [];

    // Standard Turtle: rows go downward (r), columns go right (c)
    // Each tile occupies a 2×2 unit cell

    // Layer 0 — bottom (largest)
    const layer0 = [
        // row 0: 12 tiles
        [2, 4, 6, 8, 10, 12, 14, 16, 18, 20, 22, 24],
        // row 1: 8 tiles
        [6, 8, 10, 12, 14, 16, 18, 20],
        // row 2: 10 tiles
        [4, 6, 8, 10, 12, 14, 16, 18, 20, 22],
        // row 3: 12 tiles (center — widest with wing gaps)
        [0, 4, 6, 8, 10, 12, 14, 16, 18, 20, 22, 26],
        // row 4: 10 tiles
        [4, 6, 8, 10, 12, 14, 16, 18, 20, 22],
        // row 5: 8 tiles
        [6, 8, 10, 12, 14, 16, 18, 20],
        // row 6: 12 tiles
        [2, 4, 6, 8, 10, 12, 14, 16, 18, 20, 22, 24],
    ];

    for (let row = 0; row < layer0.length; row++) {
        for (const col of layer0[row]) {
            positions.push({ layer: 0, r: row * 2, c: col });
        }
    }

    // Layer 1 — 36 tiles (6 cols × 6 rows, centered)
    for (let row = 0; row < 6; row++) {
        for (const col of [7, 9, 11, 13, 15, 17]) {
            positions.push({ layer: 1, r: (row + 0.5) * 2, c: col });
        }
    }

    // Layer 2 — 16 tiles (4 cols × 4 rows, centered)
    for (let row = 0; row < 4; row++) {
        for (const col of [9, 11, 13, 15]) {
            positions.push({ layer: 2, r: (row + 1) * 2, c: col + 1 });
        }
    }

    // Layer 3 — 4 tiles (2 cols × 2 rows, centered)
    for (let row = 0; row < 2; row++) {
        for (const col of [11, 13]) {
            positions.push({ layer: 3, r: (row + 1.5) * 2, c: col + 2 });
        }
    }

    // Extra tiles to reach 144 (base: 72 + 36 + 16 + 4 = 128, need 16 more)
    const extras = [
        // Left wing column (c=0 and c=2)
        { layer: 0, r: 2, c: 0 },
        { layer: 0, r: 4, c: 0 },
        { layer: 0, r: 8, c: 0 },
        { layer: 0, r: 10, c: 0 },
        { layer: 0, r: 2, c: 2 },
        { layer: 0, r: 10, c: 2 },
        // Right wing column (c=26 and c=24)
        { layer: 0, r: 2, c: 26 },
        { layer: 0, r: 4, c: 26 },
        { layer: 0, r: 8, c: 26 },
        { layer: 0, r: 10, c: 26 },
        { layer: 0, r: 2, c: 24 },
        { layer: 0, r: 10, c: 24 },
        // Top cap tiles on layer 3
        { layer: 3, r: 5, c: 14 },
        { layer: 3, r: 5, c: 12 },
        // Additional center row wing tiles
        { layer: 0, r: 0, c: 0 },
        { layer: 0, r: 12, c: 0 },
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

// DOM elements
const boardEl = document.getElementById('game-board');
const tilesLeftEl = document.getElementById('tiles-left');
const movesEl = document.getElementById('moves');
const scoreEl = document.getElementById('score');
const overlay = document.getElementById('game-overlay');
const overlayTitle = document.getElementById('overlay-title');
const overlayMessage = document.getElementById('overlay-message');
const startBtn = document.getElementById('btn-start');
const hintBtn = document.getElementById('btn-hint');
const shuffleBtn = document.getElementById('btn-shuffle');

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
    if (tile.removed) return false;

    const activeTiles = tiles.filter(t => !t.removed && t !== tile);

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

// Calculate zoom scale: only zoom when remaining tiles leave enough margin
function calculateZoomScale() {
    const activeTiles = tiles.filter(t => !t.removed);
    if (activeTiles.length === 0) return 1;

    const { tileW, tileH } = calculateLayout();
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
    if (contentW <= 0 || contentH <= 0) return 1;

    // The board element is larger than the content (full grid).
    // When we scale the board, the entire board element grows from center.
    // We need: boardW * scale <= availW and boardH * scale <= availH
    const boardW = parseFloat(boardEl.style.width) || 1;
    const boardH = parseFloat(boardEl.style.height) || 1;

    const boardArea = document.querySelector('.game-board-area');
    const availW = boardArea.clientWidth - 4;
    const availH = boardArea.clientHeight - 4;

    // Maximum scale so scaled board still fits in container
    const maxScale = Math.min(availW / boardW, availH / boardH);

    // Desired scale: fit the remaining content bounding box to the available area
    const desiredScale = Math.min(availW / contentW, availH / contentH) * 0.92;

    // Clamp: never shrink below 1.0, never exceed container fit, cap at 1.5x
    const scale = Math.min(desiredScale, maxScale, 1.5);
    return Math.max(scale, 1);
}

// Apply zoom to the board
function applyZoom() {
    const scale = calculateZoomScale();
    boardEl.style.transform = `scale(${scale})`;
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

    // Maintain aspect ratio ~0.78 (w:h) for landscape layout readability
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

    // Set CSS variables for tile size
    const fontSize = Math.max(16, Math.floor(tileW * 0.92));
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
        face.textContent = tile.face;
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
            const delay = (tile.layer * 150) + (idx * 3) + Math.random() * 100;
            el.style.animationDelay = delay + 'ms';
            el.classList.add('fly-in');
        }

        boardEl.appendChild(el);
    }

    // Apply current zoom level
    applyZoom();
}

// Update the visual state of tiles (selected, free/blocked) without full re-render
function updateTileStates() {
    const tileEls = boardEl.querySelectorAll('.mahjong-tile');
    for (const el of tileEls) {
        const id = parseInt(el.dataset.id, 10);
        const tile = tiles.find(t => t.id === id);
        if (!tile || tile.removed) continue;

        const free = isTileFree(tile);
        el.classList.toggle('free', free);
        el.classList.toggle('blocked', !free);
        el.classList.toggle('selected', selectedTile === tile);
    }
}

// Handle tile click
function onTileClick(tile) {
    if (!gameRunning || tile.removed) return;
    if (!isTileFree(tile)) return;

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

// Animate a tile along a quadratic bezier arc
function animateArc(el, startX, startY, ctrlX, ctrlY, endX, endY, duration, onDone) {
    const startTime = performance.now();
    el.style.pointerEvents = 'none';
    el.style.zIndex = 9998;

    function step(now) {
        const t = Math.min((now - startTime) / duration, 1);
        // Quadratic bezier: B(t) = (1-t)²·P0 + 2(1-t)t·P1 + t²·P2
        const inv = 1 - t;
        const x = inv * inv * startX + 2 * inv * t * ctrlX + t * t * endX;
        const y = inv * inv * startY + 2 * inv * t * ctrlY + t * t * endY;
        el.style.left = x + 'px';
        el.style.top = y + 'px';
        if (t < 1) {
            requestAnimationFrame(step);
        } else if (onDone) {
            onDone();
        }
    }
    requestAnimationFrame(step);
}

// Remove a matched pair with fly-together arc animation
function removePair(a, b) {
    a.removed = true;
    b.removed = true;
    moves++;
    score += 100;

    const elA = boardEl.querySelector(`[data-id="${a.id}"]`);
    const elB = boardEl.querySelector(`[data-id="${b.id}"]`);

    if (!elA || !elB) {
        updateUI();
        updateTileStates();
        applyZoom();
        checkGameState();
        return;
    }

    // Get current positions
    const ax = parseFloat(elA.style.left);
    const ay = parseFloat(elA.style.top);
    const bx = parseFloat(elB.style.left);
    const by = parseFloat(elB.style.top);

    // Midpoint where tiles will meet
    const midX = (ax + bx) / 2;
    const midY = (ay + by) / 2;

    // Calculate perpendicular offset for the arc curve
    const dx = bx - ax;
    const dy = by - ay;
    const dist = Math.sqrt(dx * dx + dy * dy);
    // Arc height is proportional to distance, perpendicular to the line between tiles
    const arcHeight = Math.max(30, dist * 0.35);
    // Perpendicular direction (normalized)
    const px = -dy / (dist || 1);
    const py = dx / (dist || 1);

    // Control points for each tile's arc (curve in opposite directions)
    const ctrlAx = midX + px * arcHeight;
    const ctrlAy = midY + py * arcHeight;
    const ctrlBx = midX - px * arcHeight;
    const ctrlBy = midY - py * arcHeight;

    const duration = 450;
    let finished = 0;

    function onFinish() {
        finished++;
        if (finished === 2) {
            const tileW = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--tile-w'));
            const tileH = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--tile-h'));
            createParticles(midX + tileW / 2, midY + tileH / 2);
            if (elA) elA.remove();
            if (elB) elB.remove();
            updateTileStates();
            applyZoom();
            checkGameState();
        }
    }

    animateArc(elA, ax, ay, ctrlAx, ctrlAy, midX, midY, duration, onFinish);
    animateArc(elB, bx, by, ctrlBx, ctrlBy, midX, midY, duration, onFinish);

    updateUI();
}

// Update UI counters
function updateUI() {
    const remaining = tiles.filter(t => !t.removed).length;
    tilesLeftEl.textContent = remaining;
    movesEl.textContent = moves;
    scoreEl.textContent = score;
}

// Check if game is won or stuck
function checkGameState() {
    const remaining = tiles.filter(t => !t.removed).length;

    if (remaining === 0) {
        gameRunning = false;
        score += 1000; // Bonus for winning
        updateUI();
        overlayTitle.textContent = 'YOU WIN!';
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

// Shuffle remaining tiles' faces (keep positions, reassign tile faces)
// Animated: tiles fly out, faces reshuffle, tiles fly back in
let shuffleInProgress = false;

function shuffleTiles() {
    if (!gameRunning || shuffleInProgress) return;
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

        for (let i = 0; i < active.length; i++) {
            active[i].face = faces[i].face;
            active[i].matchGroup = faces[i].matchGroup;
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

// Start a new game
function startGame() {
    const tileSet = buildTileSet();
    shuffle(tileSet);

    const positions = getTurtleLayout();

    tiles = [];
    for (let i = 0; i < positions.length; i++) {
        const pos = positions[i];
        const tileData = tileSet[i];
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

// Prevent scrolling on touch
document.addEventListener('touchmove', (e) => {
    if (gameRunning) {
        e.preventDefault();
    }
}, { passive: false });

// Handle window resize — re-render the board
window.addEventListener('resize', () => {
    if (gameRunning && tiles.length > 0) {
        renderBoard();
    }
});
