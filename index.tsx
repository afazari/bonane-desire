/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

// DOM Elements
const homeCover = document.getElementById('home-cover') as HTMLDivElement;
const gameContainer = document.querySelector('.game-container') as HTMLDivElement;
const canvas = document.getElementById('gameCanvas') as HTMLCanvasElement;
const ctx = canvas.getContext('2d') as CanvasRenderingContext2D;
const scoreEl = document.getElementById('score') as HTMLSpanElement;
const levelEl = document.getElementById('level') as HTMLSpanElement;
const startButton = document.getElementById('startButton') as HTMLButtonElement;
const pauseButton = document.getElementById('pauseButton') as HTMLButtonElement;
const restartButton = document.getElementById('restartButton') as HTMLButtonElement;
const gameOverlay = document.getElementById('gameOverlay') as HTMLDivElement;
const overlayTitle = document.getElementById('overlayTitle') as HTMLHeadingElement;

// Game constants
const GRID_SIZE = 20;
const CANVAS_WIDTH = canvas.width;
const CANVAS_HEIGHT = canvas.height;
const INITIAL_SNAKE_SPEED = 150; // ms per move
const SPEED_INCREMENT = 10; // ms faster per level

// Game state
let snake: { x: number; y: number }[];
let food: { x: number; y: number };
let direction: { x: number; y: number };
let score: number;
let level: number;
let currentSpeed: number;
let isGameOver: boolean;
let isPaused: boolean;
let gameStarted: boolean;
let gameInterval: number | undefined;

// Touch controls state
let touchStartX = 0;
let touchStartY = 0;
let swipeFeedback: { x: number; y: number; radius: number; alpha: number } | null = null;

// Audio state
let audioCtx: AudioContext | null = null;

function revealGameOnInteraction(e: MouseEvent | KeyboardEvent) {
    // Check if it's a click or the Enter key
    if (e instanceof MouseEvent || (e instanceof KeyboardEvent && e.key === 'Enter')) {
        homeCover.classList.add('hidden');
        gameContainer.classList.remove('hidden');
        
        // Clean up listeners
        window.removeEventListener('click', revealGameOnInteraction);
        window.removeEventListener('keydown', revealGameOnInteraction);
    }
}

window.addEventListener('click', revealGameOnInteraction);
window.addEventListener('keydown', revealGameOnInteraction);

function initAudio() {
    if (!audioCtx) {
        audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
    }
}

function playSound(frequency: number, duration: number, type: OscillatorType = 'sine') {
    if (!audioCtx) return;
    const oscillator = audioCtx.createOscillator();
    const gainNode = audioCtx.createGain();

    oscillator.type = type;
    oscillator.frequency.setValueAtTime(frequency, audioCtx.currentTime);

    gainNode.gain.setValueAtTime(0.5, audioCtx.currentTime); // Lower volume
    gainNode.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + duration / 1000);

    oscillator.connect(gainNode);
    gainNode.connect(audioCtx.destination);

    oscillator.start();
    oscillator.stop(audioCtx.currentTime + duration / 1000);
}

const playEatSound = () => playSound(880, 100, 'square');
const playGameOverSound = () => playSound(220, 500, 'sawtooth');
const playPauseSound = () => playSound(440, 100, 'triangle');
const playResumeSound = () => playSound(523, 100, 'triangle');


function initGame() {
  snake = [{ x: 10, y: 10 }]; // Start in the middle
  direction = { x: 0, y: 0 }; // No initial movement
  score = 0;
  level = 1;
  currentSpeed = INITIAL_SNAKE_SPEED;
  isGameOver = false;
  isPaused = false;
  gameStarted = false;
  scoreEl.textContent = score.toString();
  levelEl.textContent = level.toString();
  spawnFood();
  updateButtonStates();
}

function spawnFood() {
  let newFoodPosition;
  do {
    newFoodPosition = {
      x: Math.floor(Math.random() * (CANVAS_WIDTH / GRID_SIZE)),
      y: Math.floor(Math.random() * (CANVAS_HEIGHT / GRID_SIZE)),
    };
  } while (isFoodOnSnake(newFoodPosition));
  food = newFoodPosition;
}

function isFoodOnSnake(position: { x: number; y: number }): boolean {
  return snake.some(segment => segment.x === position.x && segment.y === position.y);
}

function draw() {
  ctx.fillStyle = '#87CEEB'; // Sky blue background
  ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

  // Draw food
  ctx.fillStyle = '#ff8c00';
  ctx.strokeStyle = '#c06000';
  ctx.lineWidth = 2;
  const foodRadius = GRID_SIZE / 2;
  ctx.beginPath();
  ctx.arc(food.x * GRID_SIZE + foodRadius, food.y * GRID_SIZE + foodRadius, foodRadius - 2, 0, 2 * Math.PI);
  ctx.fill();
  ctx.stroke();

  // Draw snake
  const segmentRadius = GRID_SIZE / 2;
  snake.forEach((segment, index) => {
    ctx.fillStyle = '#000000';
    if (index === 0) { // Head
      drawSnakeHead(segment);
    } else { // Body
      ctx.beginPath();
      ctx.arc(segment.x * GRID_SIZE + segmentRadius, segment.y * GRID_SIZE + segmentRadius, segmentRadius, 0, 2 * Math.PI);
      ctx.fill();
    }
  });

  // Draw swipe feedback
  if (swipeFeedback) {
    ctx.save();
    ctx.globalAlpha = swipeFeedback.alpha;
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.8)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(swipeFeedback.x, swipeFeedback.y, swipeFeedback.radius, 0, 2 * Math.PI);
    ctx.stroke();
    ctx.restore();

    // Animate feedback
    swipeFeedback.radius += 2;
    swipeFeedback.alpha -= 0.04;
    if (swipeFeedback.alpha <= 0) {
      swipeFeedback = null;
    }
  }
}

function drawSnakeHead(segment: { x: number, y: number }) {
  const headX = segment.x * GRID_SIZE;
  const headY = segment.y * GRID_SIZE;
  const radius = GRID_SIZE / 2;
  const centerX = headX + radius;
  const centerY = headY + radius;

  // Head circle
  ctx.fillStyle = '#000000';
  ctx.beginPath();
  ctx.arc(centerX, centerY, radius, 0, 2 * Math.PI);
  ctx.fill();

  // Eyes
  ctx.fillStyle = 'white';
  const eyeSize = GRID_SIZE / 5;
  let eye1X, eye1Y, eye2X, eye2Y;
  const offset1 = GRID_SIZE / 4;
  const offset2 = GRID_SIZE - GRID_SIZE / 4;

  if (direction.x === 1) { // Right
    eye1X = headX + offset2; eye1Y = headY + offset1;
    eye2X = headX + offset2; eye2Y = headY + offset2;
  } else if (direction.x === -1) { // Left
    eye1X = headX + offset1; eye1Y = headY + offset1;
    eye2X = headX + offset1; eye2Y = headY + offset2;
  } else if (direction.y === 1) { // Down
    eye1X = headX + offset1; eye1Y = headY + offset2;
    eye2X = headX + offset2; eye2Y = headY + offset2;
  } else { // Up or stationary
    eye1X = headX + offset1; eye1Y = headY + offset1;
    eye2X = headX + offset2; eye2Y = headY + offset1;
  }
  ctx.beginPath();
  ctx.arc(eye1X, eye1Y, eyeSize / 2, 0, 2 * Math.PI);
  ctx.arc(eye2X, eye2Y, eyeSize / 2, 0, 2 * Math.PI);
  ctx.fill();
    
  // Direction Indicator (replaces mouth)
  if (direction.x !== 0 || direction.y !== 0) {
      ctx.fillStyle = 'white';
      ctx.beginPath();
      const indicatorSize = radius * 0.7;
      if (direction.x === 1) { // Right
          ctx.moveTo(centerX, centerY - indicatorSize);
          ctx.lineTo(centerX + radius, centerY);
          ctx.lineTo(centerX, centerY + indicatorSize);
      } else if (direction.x === -1) { // Left
          ctx.moveTo(centerX, centerY - indicatorSize);
          ctx.lineTo(centerX - radius, centerY);
          ctx.lineTo(centerX, centerY + indicatorSize);
      } else if (direction.y === 1) { // Down
          ctx.moveTo(centerX - indicatorSize, centerY);
          ctx.lineTo(centerX, centerY + radius);
          ctx.lineTo(centerX + indicatorSize, centerY);
      } else if (direction.y === -1){ // Up
          ctx.moveTo(centerX - indicatorSize, centerY);
          ctx.lineTo(centerX, centerY - radius);
          ctx.lineTo(centerX + indicatorSize, centerY);
      }
      ctx.closePath();
      ctx.fill();
  }
}

function update() {
  if (isGameOver || isPaused) return;

  const head = { ...snake[0] };
  head.x += direction.x;
  head.y += direction.y;

  if (head.x < 0 || head.x >= CANVAS_WIDTH / GRID_SIZE || head.y < 0 || head.y >= CANVAS_HEIGHT / GRID_SIZE) {
    endGame();
    return;
  }

  for (let i = 1; i < snake.length; i++) {
    if (head.x === snake[i].x && head.y === snake[i].y) {
      endGame();
      return;
    }
  }

  snake.unshift(head);

  if (head.x === food.x && head.y === food.y) {
    score++;
    scoreEl.textContent = score.toString();
    playEatSound();
    spawnFood();
    if (score % 5 === 0) {
      levelUp();
    }
  } else {
    if (direction.x !== 0 || direction.y !== 0) {
        snake.pop();
    }
  }
  draw();
}

function levelUp() {
    level++;
    levelEl.textContent = level.toString();
    currentSpeed = Math.max(50, INITIAL_SNAKE_SPEED - (level - 1) * SPEED_INCREMENT);
    // Restart interval with new speed
    if (gameInterval) clearInterval(gameInterval);
    gameInterval = window.setInterval(update, currentSpeed);
}


function changeDirection(newDirection: { x: number, y: number }) {
  const isMoving = direction.x !== 0 || direction.y !== 0;
  if (snake.length > 1 && isMoving && newDirection.x === -direction.x && newDirection.y === -direction.y) {
    return;
  }
  direction = newDirection;
  
  if (!gameStarted && !isGameOver) {
     gameStarted = true;
     if (!gameInterval) {
        gameInterval = window.setInterval(update, currentSpeed);
     }
     updateButtonStates();
  }
}

function handleKeyDown(e: KeyboardEvent) {
  if (e.key === ' ' || e.key === 'p') {
    if(gameStarted && !isGameOver) togglePause();
    return;
  }
  if (isPaused) return;
  
  switch (e.key) {
    case 'ArrowUp': case 'w':
      if (direction.y === 0) changeDirection({ x: 0, y: -1 }); break;
    case 'ArrowDown': case 's':
      if (direction.y === 0) changeDirection({ x: 0, y: 1 }); break;
    case 'ArrowLeft': case 'a':
      if (direction.x === 0) changeDirection({ x: -1, y: 0 }); break;
    case 'ArrowRight': case 'd':
      if (direction.x === 0) changeDirection({ x: 1, y: 0 }); break;
  }
}

function handleTouchStart(e: TouchEvent) {
    e.preventDefault();
    const touch = e.changedTouches[0];
    touchStartX = touch.clientX;
    touchStartY = touch.clientY;
}

function handleTouchEnd(e: TouchEvent) {
    e.preventDefault();
    if(isPaused) return;

    const touch = e.changedTouches[0];
    const touchEndX = touch.clientX;
    const touchEndY = touch.clientY;
    const dx = touchEndX - touchStartX;
    const dy = touchEndY - touchStartY;
    const absDx = Math.abs(dx);
    const absDy = Math.abs(dy);

    if (absDx > 20 || absDy > 20) {
        const rect = canvas.getBoundingClientRect();
        const scaleX = canvas.width / rect.width;
        const scaleY = canvas.height / rect.height;
        const canvasX = (touch.clientX - rect.left) * scaleX;
        const canvasY = (touch.clientY - rect.top) * scaleY;
        showSwipeFeedback(canvasX, canvasY);
        
        if (absDx > absDy) {
            if (dx > 0 && direction.x === 0) changeDirection({ x: 1, y: 0 }); // Right
            else if (dx < 0 && direction.x === 0) changeDirection({ x: -1, y: 0 }); // Left
        } else {
            if (dy > 0 && direction.y === 0) changeDirection({ x: 0, y: 1 }); // Down
            else if (dy < 0 && direction.y === 0) changeDirection({ x: 0, y: -1 }); // Up
        }
    }
}

function showSwipeFeedback(x: number, y: number) {
    swipeFeedback = { x, y, radius: 10, alpha: 1.0 };
}

function startGame() {
  if (gameInterval) {
    clearInterval(gameInterval);
    gameInterval = undefined;
  }
  initAudio();
  initGame();
  overlayTitle.textContent = "Ready to Play?";
  startButton.textContent = "Start to Play";
  gameOverlay.classList.add('hidden');
  draw();
}

function endGame() {
  isGameOver = true;
  if (gameInterval) {
    clearInterval(gameInterval);
    gameInterval = undefined;
  }
  playGameOverSound();
  overlayTitle.textContent = 'Game Over!';
  startButton.textContent = 'Play Again';
  gameOverlay.classList.remove('hidden');
  
  updateButtonStates();
}

function togglePause() {
    if (isGameOver || !gameStarted) return;
    isPaused = !isPaused;
    if (isPaused) {
        playPauseSound();
        overlayTitle.textContent = 'Paused';
        gameOverlay.classList.remove('hidden');
    } else {
        playResumeSound();
        gameOverlay.classList.add('hidden');
    }
    updateButtonStates();
}

function restartGame() {
    startGame();
}

function updateButtonStates() {
    pauseButton.disabled = !gameStarted || isGameOver;
    restartButton.disabled = !gameStarted && !isGameOver;
    pauseButton.textContent = isPaused ? 'Resume' : 'Pause';
}

// Event Listeners
startButton.addEventListener('click', startGame);
pauseButton.addEventListener('click', togglePause);
restartButton.addEventListener('click', restartGame);
document.addEventListener('keydown', handleKeyDown);
canvas.addEventListener('touchstart', handleTouchStart, { passive: false });
canvas.addEventListener('touchend', handleTouchEnd, { passive: false });

// Initial setup
initGame();
draw();
updateButtonStates();