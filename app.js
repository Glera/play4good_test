// Initialize Telegram WebApp
const tg = window.Telegram.WebApp;
tg.ready();
tg.expand();

// Game constants
const COLS = 10;
const ROWS = 20;
const BLOCK_SIZE = 24;

// Tetromino shapes and colors (NES-style palette)
const TETROMINOES = {
    I: {
        shape: [[1, 1, 1, 1]],
        color: '#00bbcc'
    },
    O: {
        shape: [[1, 1], [1, 1]],
        color: '#cccc00'
    },
    T: {
        shape: [[0, 1, 0], [1, 1, 1]],
        color: '#9900cc'
    },
    S: {
        shape: [[0, 1, 1], [1, 1, 0]],
        color: '#00aa00'
    },
    Z: {
        shape: [[1, 1, 0], [0, 1, 1]],
        color: '#cc0000'
    },
    J: {
        shape: [[1, 0, 0], [1, 1, 1]],
        color: '#0000cc'
    },
    L: {
        shape: [[0, 0, 1], [1, 1, 1]],
        color: '#cc6600'
    }
};

const TETROMINO_NAMES = Object.keys(TETROMINOES);

// Game state
let board = [];
let currentPiece = null;
let nextPiece = null;
let score = 0;
let level = 1;
let lines = 0;
let gameRunning = false;
let gameOver = false;
let lastTime = 0;
let dropInterval = 1000;
let dropCounter = 0;

// DOM elements
const canvas = document.getElementById('game-board');
const ctx = canvas.getContext('2d');
const nextCanvas = document.getElementById('next-piece');
const nextCtx = nextCanvas.getContext('2d');
const scoreEl = document.getElementById('score');
const levelEl = document.getElementById('level');
const linesEl = document.getElementById('lines');
const overlay = document.getElementById('game-overlay');
const overlayTitle = document.getElementById('overlay-title');
const overlayMessage = document.getElementById('overlay-message');
const startBtn = document.getElementById('btn-start');

// Control buttons
const btnLeft = document.getElementById('btn-left');
const btnRight = document.getElementById('btn-right');
const btnDown = document.getElementById('btn-down');
const btnRotate = document.getElementById('btn-rotate');
const btnDrop = document.getElementById('btn-drop');

// Colorize title: wrap each non-space character in a colored span
const TITLE_COLORS = ['clr-1','clr-2','clr-3','clr-4','clr-5','clr-6','clr-7','clr-8','clr-9'];
function colorizeTitle(text) {
    let colorIdx = 0;
    return text.split('').map(ch => {
        if (ch === ' ') return ' ';
        const cls = TITLE_COLORS[colorIdx % TITLE_COLORS.length];
        colorIdx++;
        return `<span class="${cls}">${ch}</span>`;
    }).join('');
}

// Initialize canvas sizes
canvas.width = COLS * BLOCK_SIZE;
canvas.height = ROWS * BLOCK_SIZE;
nextCanvas.width = 4 * BLOCK_SIZE;
nextCanvas.height = 4 * BLOCK_SIZE;

// Create empty board
function createBoard() {
    return Array.from({ length: ROWS }, () => Array(COLS).fill(null));
}

// Get random tetromino
function getRandomTetromino() {
    const name = TETROMINO_NAMES[Math.floor(Math.random() * TETROMINO_NAMES.length)];
    const tetromino = TETROMINOES[name];
    return {
        shape: tetromino.shape.map(row => [...row]),
        color: tetromino.color,
        x: Math.floor((COLS - tetromino.shape[0].length) / 2),
        y: 0
    };
}

// Rotate matrix clockwise
function rotateMatrix(matrix) {
    const rows = matrix.length;
    const cols = matrix[0].length;
    const rotated = Array.from({ length: cols }, () => Array(rows).fill(0));
    for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
            rotated[c][rows - 1 - r] = matrix[r][c];
        }
    }
    return rotated;
}

// Check collision
function checkCollision(piece, offsetX = 0, offsetY = 0) {
    for (let r = 0; r < piece.shape.length; r++) {
        for (let c = 0; c < piece.shape[r].length; c++) {
            if (piece.shape[r][c]) {
                const newX = piece.x + c + offsetX;
                const newY = piece.y + r + offsetY;
                if (newX < 0 || newX >= COLS || newY >= ROWS) {
                    return true;
                }
                if (newY >= 0 && board[newY][newX]) {
                    return true;
                }
            }
        }
    }
    return false;
}

// Lock piece to board
function lockPiece() {
    for (let r = 0; r < currentPiece.shape.length; r++) {
        for (let c = 0; c < currentPiece.shape[r].length; c++) {
            if (currentPiece.shape[r][c]) {
                const y = currentPiece.y + r;
                const x = currentPiece.x + c;
                if (y >= 0) {
                    board[y][x] = currentPiece.color;
                }
            }
        }
    }
}

// Clear completed lines
function clearLines() {
    let clearedLines = 0;
    for (let r = ROWS - 1; r >= 0; r--) {
        if (board[r].every(cell => cell !== null)) {
            board.splice(r, 1);
            board.unshift(Array(COLS).fill(null));
            clearedLines++;
            r++;
        }
    }

    if (clearedLines > 0) {
        const points = [0, 100, 300, 500, 800];
        score += points[clearedLines] * level;
        lines += clearedLines;

        // Level up every 10 lines
        const newLevel = Math.floor(lines / 10) + 1;
        if (newLevel > level) {
            level = newLevel;
            dropInterval = Math.max(100, 1000 - (level - 1) * 100);
        }

        updateUI();
    }
}

// Update UI elements
function updateUI() {
    scoreEl.textContent = score;
    levelEl.textContent = level;
    linesEl.textContent = lines;
}

// Draw block (retro 8-bit style with sharp beveled edges)
function drawBlock(context, x, y, color, size = BLOCK_SIZE) {
    const px = x * size;
    const py = y * size;
    const s = size;
    const border = Math.max(2, Math.floor(s / 8));

    // Main fill
    context.fillStyle = color;
    context.fillRect(px, py, s, s);

    // Top-left highlight (lighter)
    context.fillStyle = 'rgba(255, 255, 255, 0.45)';
    context.fillRect(px, py, s, border);
    context.fillRect(px, py, border, s);

    // Bottom-right shadow (darker)
    context.fillStyle = 'rgba(0, 0, 0, 0.45)';
    context.fillRect(px, py + s - border, s, border);
    context.fillRect(px + s - border, py, border, s);

    // Inner dark outline
    context.fillStyle = 'rgba(0, 0, 0, 0.15)';
    context.fillRect(px + border, py + border, s - border * 2, s - border * 2);

    // Inner bright center
    context.fillStyle = color;
    context.fillRect(px + border + 1, py + border + 1, s - border * 2 - 2, s - border * 2 - 2);
}

// Draw board
function drawBoard() {
    ctx.fillStyle = '#111';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Draw subtle grid dots (retro style)
    ctx.fillStyle = 'rgba(255, 255, 255, 0.08)';
    for (let r = 1; r < ROWS; r++) {
        for (let c = 1; c < COLS; c++) {
            ctx.fillRect(c * BLOCK_SIZE - 1, r * BLOCK_SIZE - 1, 2, 2);
        }
    }

    // Draw locked blocks
    for (let r = 0; r < ROWS; r++) {
        for (let c = 0; c < COLS; c++) {
            if (board[r][c]) {
                drawBlock(ctx, c, r, board[r][c]);
            }
        }
    }
}

// Draw current piece
function drawPiece() {
    if (!currentPiece) return;

    // Draw ghost piece
    let ghostY = currentPiece.y;
    while (!checkCollision(currentPiece, 0, ghostY - currentPiece.y + 1)) {
        ghostY++;
    }

    ctx.globalAlpha = 0.3;
    for (let r = 0; r < currentPiece.shape.length; r++) {
        for (let c = 0; c < currentPiece.shape[r].length; c++) {
            if (currentPiece.shape[r][c]) {
                drawBlock(ctx, currentPiece.x + c, ghostY + r, currentPiece.color);
            }
        }
    }
    ctx.globalAlpha = 1;

    // Draw actual piece
    for (let r = 0; r < currentPiece.shape.length; r++) {
        for (let c = 0; c < currentPiece.shape[r].length; c++) {
            if (currentPiece.shape[r][c]) {
                drawBlock(ctx, currentPiece.x + c, currentPiece.y + r, currentPiece.color);
            }
        }
    }
}

// Draw next piece preview
function drawNextPiece() {
    nextCtx.fillStyle = '#111';
    nextCtx.fillRect(0, 0, nextCanvas.width, nextCanvas.height);

    if (!nextPiece) return;

    const offsetX = (4 - nextPiece.shape[0].length) / 2;
    const offsetY = (4 - nextPiece.shape.length) / 2;

    for (let r = 0; r < nextPiece.shape.length; r++) {
        for (let c = 0; c < nextPiece.shape[r].length; c++) {
            if (nextPiece.shape[r][c]) {
                drawBlock(nextCtx, offsetX + c, offsetY + r, nextPiece.color);
            }
        }
    }
}

// Move piece
function movePiece(dx, dy) {
    if (!gameRunning || !currentPiece) return;

    if (!checkCollision(currentPiece, dx, dy)) {
        currentPiece.x += dx;
        currentPiece.y += dy;
    } else if (dy > 0) {
        lockPiece();
        clearLines();
        spawnPiece();
    }
}

// Rotate piece
function rotatePiece() {
    if (!gameRunning || !currentPiece) return;

    const rotated = rotateMatrix(currentPiece.shape);
    const originalShape = currentPiece.shape;
    currentPiece.shape = rotated;

    // Wall kick
    const kicks = [0, -1, 1, -2, 2];
    let kicked = false;
    for (const kick of kicks) {
        if (!checkCollision(currentPiece, kick, 0)) {
            currentPiece.x += kick;
            kicked = true;
            break;
        }
    }

    if (!kicked) {
        currentPiece.shape = originalShape;
    }
}

// Hard drop
function hardDrop() {
    if (!gameRunning || !currentPiece) return;

    while (!checkCollision(currentPiece, 0, 1)) {
        currentPiece.y++;
        score += 2;
    }

    lockPiece();
    clearLines();
    spawnPiece();
    updateUI();
}

// Spawn new piece
function spawnPiece() {
    currentPiece = nextPiece || getRandomTetromino();
    nextPiece = getRandomTetromino();

    // Check game over
    if (checkCollision(currentPiece, 0, 0)) {
        endGame();
    }

    drawNextPiece();
}

// Start game
function startGame() {
    board = createBoard();
    score = 0;
    level = 1;
    lines = 0;
    dropInterval = 1000;
    gameOver = false;
    gameRunning = true;

    updateUI();

    nextPiece = getRandomTetromino();
    spawnPiece();

    overlay.classList.add('hidden');

    lastTime = performance.now();
    requestAnimationFrame(gameLoop);
}

// End game
function endGame() {
    gameRunning = false;
    gameOver = true;

    overlayTitle.innerHTML = colorizeTitle('GAME OVER');
    overlayMessage.textContent = `Score: ${score}`;
    startBtn.textContent = 'Play again';
    overlay.classList.remove('hidden');
}

// Game loop
function gameLoop(timestamp) {
    if (!gameRunning) return;

    const deltaTime = timestamp - lastTime;
    lastTime = timestamp;
    dropCounter += deltaTime;

    if (dropCounter >= dropInterval) {
        movePiece(0, 1);
        dropCounter = 0;
    }

    drawBoard();
    drawPiece();

    requestAnimationFrame(gameLoop);
}

// Event listeners
startBtn.addEventListener('click', startGame);

// Touch controls
btnLeft.addEventListener('click', () => movePiece(-1, 0));
btnRight.addEventListener('click', () => movePiece(1, 0));
btnDown.addEventListener('click', () => movePiece(0, 1));
btnRotate.addEventListener('click', rotatePiece);
btnDrop.addEventListener('click', hardDrop);

// Keyboard controls
document.addEventListener('keydown', (e) => {
    // Prevent scrolling for game keys
    const gameKeys = ['ArrowLeft', 'ArrowRight', 'ArrowDown', 'ArrowUp', ' ', 'a', 'A', 'd', 'D', 's', 'S', 'w', 'W'];
    if (gameKeys.includes(e.key)) {
        e.preventDefault();
    }

    if (!gameRunning) {
        if (e.key === 'Enter' || e.key === ' ') {
            startGame();
        }
        return;
    }

    switch (e.key) {
        case 'ArrowLeft':
        case 'a':
        case 'A':
            movePiece(-1, 0);
            break;
        case 'ArrowRight':
        case 'd':
        case 'D':
            movePiece(1, 0);
            break;
        case 'ArrowDown':
        case 's':
        case 'S':
            movePiece(0, 1);
            score += 1;
            updateUI();
            break;
        case 'ArrowUp':
        case 'w':
        case 'W':
            rotatePiece();
            break;
        case ' ':
            hardDrop();
            break;
    }
});

// Prevent scrolling on touch devices
document.addEventListener('touchmove', (e) => {
    if (gameRunning) {
        e.preventDefault();
    }
}, { passive: false });

// Initial draw
drawBoard();
drawNextPiece();
