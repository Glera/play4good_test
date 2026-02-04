// Initialize Telegram WebApp
const tg = window.Telegram.WebApp;
tg.ready();
tg.expand();

// Game constants
const COLS = 10;
const ROWS = 20;
const BLOCK_SIZE = 24;

// Tetromino shapes and colors
const TETROMINOES = {
    I: {
        shape: [[1, 1, 1, 1]],
        color: '#00f5ff'
    },
    O: {
        shape: [[1, 1], [1, 1]],
        color: '#ffff00'
    },
    T: {
        shape: [[0, 1, 0], [1, 1, 1]],
        color: '#aa00ff'
    },
    S: {
        shape: [[0, 1, 1], [1, 1, 0]],
        color: '#00ff00'
    },
    Z: {
        shape: [[1, 1, 0], [0, 1, 1]],
        color: '#ff0000'
    },
    J: {
        shape: [[1, 0, 0], [1, 1, 1]],
        color: '#0000ff'
    },
    L: {
        shape: [[0, 0, 1], [1, 1, 1]],
        color: '#ff8800'
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

// Draw block
function drawBlock(context, x, y, color, size = BLOCK_SIZE) {
    context.fillStyle = color;
    context.fillRect(x * size, y * size, size - 1, size - 1);

    // Add highlight
    context.fillStyle = 'rgba(255, 255, 255, 0.3)';
    context.fillRect(x * size, y * size, size - 1, 3);
    context.fillRect(x * size, y * size, 3, size - 1);

    // Add shadow
    context.fillStyle = 'rgba(0, 0, 0, 0.3)';
    context.fillRect(x * size + size - 4, y * size, 3, size - 1);
    context.fillRect(x * size, y * size + size - 4, size - 1, 3);
}

// Draw board
function drawBoard() {
    ctx.fillStyle = '#0a0a15';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Draw grid
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
    ctx.lineWidth = 1;
    for (let r = 0; r <= ROWS; r++) {
        ctx.beginPath();
        ctx.moveTo(0, r * BLOCK_SIZE);
        ctx.lineTo(canvas.width, r * BLOCK_SIZE);
        ctx.stroke();
    }
    for (let c = 0; c <= COLS; c++) {
        ctx.beginPath();
        ctx.moveTo(c * BLOCK_SIZE, 0);
        ctx.lineTo(c * BLOCK_SIZE, canvas.height);
        ctx.stroke();
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
    nextCtx.fillStyle = '#0a0a15';
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

    overlayTitle.textContent = 'ИГРА ОКОНЧЕНА';
    overlayMessage.textContent = `Счёт: ${score}`;
    startBtn.textContent = 'Играть снова';
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
