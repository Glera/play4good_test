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
function getTurtleLayout() {
    const positions = [];

    // Layer 0 — bottom (largest) — 86 tiles
    const layer0 = [
        // Row 0: 12 tiles
        [4, 6, 8, 10, 12, 14, 16, 18, 20, 22, 24, 26],
        // Row 1: 8 tiles
        [6, 8, 10, 12, 14, 16, 18, 20],
        // Row 2: 10 tiles
        [4, 6, 8, 10, 12, 14, 16, 18, 20, 22],
        // Row 3: 14 tiles (widest — center row with wings)
        [0, 2, 4, 6, 8, 10, 12, 14, 16, 18, 20, 22, 24, 28],
        // Row 4: 10 tiles
        [4, 6, 8, 10, 12, 14, 16, 18, 20, 22],
        // Row 5: 8 tiles
        [6, 8, 10, 12, 14, 16, 18, 20],
        // Row 6: 12 tiles
        [4, 6, 8, 10, 12, 14, 16, 18, 20, 22, 24, 26],
    ];
    // Total: 12+8+10+14+10+8+12 = 74

    for (let row = 0; row < layer0.length; row++) {
        for (const col of layer0[row]) {
            positions.push({ layer: 0, r: row * 2, c: col });
        }
    }

    // Layer 1 — 40 tiles
    const layer1 = [
        // Row 0: 6
        [8, 10, 12, 14, 16, 18],
        // Row 1: 6
        [8, 10, 12, 14, 16, 18],
        // Row 2: 6
        [8, 10, 12, 14, 16, 18],
        // Row 3: 6
        [8, 10, 12, 14, 16, 18],
        // Row 4: 6
        [8, 10, 12, 14, 16, 18],
        // Row 5: 6
        [8, 10, 12, 14, 16, 18],
    ];
    // Total: 36

    for (let row = 0; row < layer1.length; row++) {
        for (const col of layer1[row]) {
            positions.push({ layer: 1, r: (row + 0.5) * 2, c: col + 1 });
        }
    }

    // Layer 2 — 16 tiles
    const layer2 = [
        [10, 12, 14, 16],
        [10, 12, 14, 16],
        [10, 12, 14, 16],
        [10, 12, 14, 16],
    ];
    // Total: 16

    for (let row = 0; row < layer2.length; row++) {
        for (const col of layer2[row]) {
            positions.push({ layer: 2, r: (row + 1) * 2, c: col + 2 });
        }
    }

    // Layer 3 — 4 tiles
    const layer3 = [
        [12, 14],
        [12, 14],
    ];
    // Total: 4

    for (let row = 0; row < layer3.length; row++) {
        for (const col of layer3[row]) {
            positions.push({ layer: 3, r: (row + 1.5) * 2, c: col + 3 });
        }
    }

    // Total so far: 74 + 36 + 16 + 4 = 130
    // Need 14 more — add layer edges to layer 0
    // Add extra tiles to extend layer 0 wings
    const extras = [
        { layer: 0, r: 2, c: 24 },
        { layer: 0, r: 2, c: 4 },
        { layer: 0, r: 10, c: 24 },
        { layer: 0, r: 10, c: 4 },
        { layer: 0, r: 4, c: 24 },
        { layer: 0, r: 8, c: 24 },
        { layer: 0, r: 4, c: 2 },
        { layer: 0, r: 8, c: 2 },
        { layer: 0, r: 0, c: 2 },
        { layer: 0, r: 12, c: 2 },
        { layer: 0, r: 0, c: 28 },
        { layer: 0, r: 12, c: 28 },
        { layer: 3, r: 5, c: 16 },
        { layer: 3, r: 7, c: 16 },
    ];

    for (const pos of extras) {
        positions.push(pos);
    }

    // Total: 130 + 14 = 144
    return positions;
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

    // Check left/right neighbors on the same layer
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

// Calculate zoom scale based on remaining tiles
function calculateZoomScale() {
    const remaining = tiles.filter(t => !t.removed).length;
    const total = tiles.length;
    if (total === 0) return 1;

    const removedRatio = 1 - (remaining / total);
    // Zoom in gradually: from 1.0 at start to ~1.3 when most tiles removed
    // Use a gentle curve so it's not too jarring
    return 1 + removedRatio * 0.35;
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

    // Each tile occupies 2 units. Add some padding for layer offset
    const gridCols = maxC + 2 + 2; // +2 for tile width, +2 for layer offsets
    const gridRows = maxR + 2 + 2;

    // Calculate tile size to fit
    const baseTileW = availW / gridCols * 2;
    const baseTileH = availH / gridRows * 2;

    // Maintain aspect ratio ~0.85 (w:h) — more square for better readability
    let tileW = Math.min(baseTileW, baseTileH * 0.85);
    let tileH = tileW / 0.85;

    // Clamp — allow larger tiles for bigger screens
    tileW = Math.max(24, Math.min(tileW, 60));
    tileH = tileW / 0.85;

    return { tileW, tileH, gridCols, gridRows };
}

// Render all tiles to the board
function renderBoard(animate) {
    boardEl.innerHTML = '';

    const { tileW, tileH, gridCols, gridRows } = calculateLayout();

    // Set CSS variables for tile size
    const fontSize = Math.max(16, Math.floor(tileW * 0.75));
    document.documentElement.style.setProperty('--tile-w', tileW + 'px');
    document.documentElement.style.setProperty('--tile-h', tileH + 'px');
    document.documentElement.style.setProperty('--tile-font', fontSize + 'px');

    // Layer offset for 3D effect
    const layerOffsetX = Math.max(2, tileW * 0.05);
    const layerOffsetY = Math.max(2, tileH * 0.05);

    // Calculate board dimensions
    const boardW = (gridCols / 2) * tileW + 4 * layerOffsetX + 10;
    const boardH = (gridRows / 2) * tileH + 4 * layerOffsetY + 10;
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

        // 3D depth sides
        const sideRight = document.createElement('div');
        sideRight.className = 'tile-side-right';
        el.appendChild(sideRight);

        const sideBottom = document.createElement('div');
        sideBottom.className = 'tile-side-bottom';
        el.appendChild(sideBottom);

        // Corner piece for 3D effect
        const corner = document.createElement('div');
        corner.className = 'tile-corner';
        el.appendChild(corner);

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

    // Stop auto-play if user manually clicks
    if (autoPlayActive) stopAutoPlay();

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

// Remove a matched pair with fly-together animation
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

    // Midpoint
    const midX = (ax + bx) / 2;
    const midY = (ay + by) / 2;

    // Calculate fly offsets for each tile
    const flyAx = midX - ax;
    const flyAy = midY - ay;
    const flyBx = midX - bx;
    const flyBy = midY - by;

    elA.style.setProperty('--fly-x', flyAx + 'px');
    elA.style.setProperty('--fly-y', flyAy + 'px');
    elB.style.setProperty('--fly-x', flyBx + 'px');
    elB.style.setProperty('--fly-y', flyBy + 'px');

    elA.classList.add('fly-match');
    elB.classList.add('fly-match');

    updateUI();

    // Spawn particles at midpoint after tiles meet
    setTimeout(() => {
        const tileW = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--tile-w'));
        const tileH = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--tile-h'));
        createParticles(midX + tileW / 2, midY + tileH / 2);
    }, 280);

    setTimeout(() => {
        if (elA) elA.remove();
        if (elB) elB.remove();
        updateTileStates();

        // Apply zoom-in after tiles removed
        applyZoom();

        checkGameState();
    }, 450);
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
        // No moves available — game stuck
        gameRunning = false;
        overlayTitle.textContent = 'NO MOVES';
        overlayMessage.textContent = `No more matches available. Score: ${score}`;
        startBtn.textContent = 'New Game';
        overlay.classList.remove('hidden');
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
function shuffleTiles() {
    if (!gameRunning) return;

    const active = tiles.filter(t => !t.removed);
    const faces = active.map(t => ({ face: t.face, matchGroup: t.matchGroup }));
    shuffle(faces);

    for (let i = 0; i < active.length; i++) {
        active[i].face = faces[i].face;
        active[i].matchGroup = faces[i].matchGroup;
    }

    selectedTile = null;
    score = Math.max(0, score - 50);
    updateUI();
    renderBoard();
}

// Start a new game
function startGame() {
    stopAutoPlay();
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

// Auto-play state
let autoPlayInterval = null;
let autoPlayActive = false;
const autoPlayBtn = document.getElementById('btn-autoplay');

function startAutoPlay() {
    if (!gameRunning || autoPlayActive) return;
    autoPlayActive = true;
    autoPlayBtn.classList.add('active');
    selectedTile = null;
    updateTileStates();

    autoPlayInterval = setInterval(() => {
        if (!gameRunning) { stopAutoPlay(); return; }
        const matches = findAvailableMatches();
        if (matches.length === 0) { stopAutoPlay(); return; }
        const [a, b] = matches[Math.floor(Math.random() * matches.length)];
        removePair(a, b);
    }, 600);
}

function stopAutoPlay() {
    autoPlayActive = false;
    if (autoPlayInterval) {
        clearInterval(autoPlayInterval);
        autoPlayInterval = null;
    }
    if (autoPlayBtn) autoPlayBtn.classList.remove('active');
}

function toggleAutoPlay() {
    if (autoPlayActive) {
        stopAutoPlay();
    } else {
        startAutoPlay();
    }
}

// Event listeners
startBtn.addEventListener('click', startGame);
hintBtn.addEventListener('click', showHint);
shuffleBtn.addEventListener('click', shuffleTiles);
if (autoPlayBtn) autoPlayBtn.addEventListener('click', toggleAutoPlay);

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
