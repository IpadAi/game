// game.js  — Mobile-first single-file platformer
// Author: ChatGPT (rewritten for the user). Drop into same folder as index.html.

/* --------------------------------------------------------
   Canvas & Resize
   -------------------------------------------------------- */
const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");

// set canvas size to window
function resizeCanvas() {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
}
window.addEventListener("resize", resizeCanvas);
resizeCanvas();

/* --------------------------------------------------------
   DOM references for mobile UI
   -------------------------------------------------------- */
const titleOverlay = document.getElementById("titleOverlay");
const hudSmall = document.getElementById("hudSmall");
const btnLeft = document.getElementById("btnLeft");
const btnRight = document.getElementById("btnRight");
const btnUp = document.getElementById("btnUp");
const btnShoot = document.getElementById("btnShoot");
const btnPause = document.getElementById("btnPause");
const titleHighScore = document.getElementById("titleHighScore");

/* --------------------------------------------------------
   Assets (images)
   -------------------------------------------------------- */
const characterSprite = new Image();
characterSprite.src =
  "https://sdk.bitmoji.com/me/sticker/x9YP40td1zJHcC64oQ4htyATyVeig0bGqzyNqTVZDdcLWVJHRfxSeg/10207747.png?p=dD1zO2w9ZW4.v1&size=thumbnail";

const flagSprite = new Image();
flagSprite.src = "https://pngimg.com/d/flags_PNG14697.png";

const coinSprite = new Image();
coinSprite.src = "https://pngimg.com/d/coin_PNG36871.png";

/* fireball sprite intentionally blank; drawing fallback provided */
const fireballSprite = new Image();
fireballSprite.src = ""; // no external file, use circle fallback

/* --------------------------------------------------------
   Audio (simple WebAudio synthesized sounds)
   -------------------------------------------------------- */
const AudioCtx = window.AudioContext || window.webkitAudioContext;
let audioCtx = null;
function ensureAudio() {
  if (!audioCtx) {
    try { audioCtx = new AudioCtx(); }
    catch (e) { audioCtx = null; }
  }
}
function playBeep(freq = 440, type = "sine", duration = 0.08, volume = 0.08) {
  if (!audioCtx) return;
  try {
    const o = audioCtx.createOscillator();
    const g = audioCtx.createGain();
    o.type = type;
    o.frequency.value = freq;
    g.gain.value = volume;
    o.connect(g);
    g.connect(audioCtx.destination);
    o.start();
    o.stop(audioCtx.currentTime + duration);
  } catch (e) { /* ignore */ }
}
function playCoin() { playBeep(1200, "square", 0.06, 0.06); }
function playJump() { playBeep(780, "sine", 0.06, 0.08); }
function playPowerup() { playBeep(620, "sawtooth", 0.12, 0.09); }
function playHit() { playBeep(220, "sine", 0.12, 0.12); }
function playWin() { playBeep(880, "triangle", 0.22, 0.12); }

/* --------------------------------------------------------
   Game constants & state
   -------------------------------------------------------- */
const TICKS_PER_SECOND = 60;
const DEFAULT_LEVEL_SECONDS = 160;
const highScoreKey = "mobile_platformer_highscore";

let cameraX = 0;
let levelIndex = 0;
let levels = [];
let gameOver = false;
let gameWon = false;
let coinsCollected = 0;
let score = 0;
let lives = 5;

let levelTimer = 0; // in ticks
let showTitle = true;
let paused = false;

/* --------------------------------------------------------
   Player (original preserved + mobile-friendly additions)
   -------------------------------------------------------- */
const player = {
  x: 60,
  y: 0,
  width: 36,
  height: 48,
  speed: 4.4,
  jumpPower: 15,
  gravity: 0.9,
  vy: 0,
  jumping: false,
  invincible: false,
  invincibleTimer: 0,
  hasFire: false,
  fireCooldown: 0,
  facing: 1,
  respawnX: 80,
  respawnY: 0
};

/* --------------------------------------------------------
   Input (keyboard + touch)
   -------------------------------------------------------- */
const keys = { left:false, right:false, up:false, shoot:false };
const touchState = { left:false, right:false, up:false, shoot:false, pause:false };

document.addEventListener("keydown", (e) => {
  if (e.code === "ArrowLeft" || e.key === "a") keys.left = true;
  if (e.code === "ArrowRight" || e.key === "d") keys.right = true;
  if (e.code === "ArrowUp" || e.key === "Space" || e.key === "w") {
    if (!player.jumping) { player.vy = -player.jumpPower; player.jumping = true; playJump(); }
  }
  if (e.code === "KeyK") keys.shoot = true;
  if (e.code === "KeyP") { paused = !paused; }
  if (e.code === "Escape") { showTitle = true; paused = false; }
});
document.addEventListener("keyup", (e) => {
  if (e.code === "ArrowLeft" || e.key === "a") keys.left = false;
  if (e.code === "ArrowRight" || e.key === "d") keys.right = false;
  if (e.code === "KeyK") keys.shoot = false;
});

/* Touch button wiring */
function bindTouchButtons() {
  const bind = (el, prop) => {
    if (!el) return;
    el.addEventListener("touchstart", (ev) => { ev.preventDefault(); touchState[prop] = true; }, {passive:false});
    el.addEventListener("touchend", (ev) => { ev.preventDefault(); touchState[prop] = false; }, {passive:false});
    el.addEventListener("mousedown", () => { touchState[prop] = true; });
    el.addEventListener("mouseup", () => { touchState[prop] = false; });
    el.addEventListener("mouseleave", () => { touchState[prop] = false; });
  };
  bind(btnLeft, "left");
  bind(btnRight, "right");
  bind(btnUp, "up");
  bind(btnShoot, "shoot");
  bind(btnPause, "pause");
  // pause button toggles game
  if (btnPause) btnPause.addEventListener("click", () => { paused = !paused; });
}
bindTouchButtons();

/* Helper to reflect touch into keys in update */
function applyTouchToKeys() {
  if (touchState.left) { keys.left = true; player.facing = -1; }
  else if (!keys.left) keys.left = false;
  if (touchState.right) { keys.right = true; player.facing = 1; }
  else if (!keys.right) keys.right = false;
  if (touchState.up && !player.jumping) { player.jumping = true; player.vy = -player.jumpPower; playJump(); }
  if (touchState.shoot) keys.shoot = true; else if (!keys.shoot) keys.shoot = false;
}

/* --------------------------------------------------------
   Utility: rectangles overlap
   -------------------------------------------------------- */
function rectsOverlap(a,b) {
  return a && b && (a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y);
}

/* --------------------------------------------------------
   Parallax background
   -------------------------------------------------------- */
let bgLayers = [];
function initBackground() {
  bgLayers = [
    { name: "sky", speed:0, draw: ()=>{} },
    { name: "clouds", speed:0.12, clouds: makeClouds(10), draw(offset){ ctx.globalAlpha=0.9; ctx.fillStyle="#fff"; this.clouds.forEach(c=>drawCloud((c.x - offset*this.speed) % (canvas.width*2) - 120, c.y, c.scale)); ctx.globalAlpha=1; } },
    { name: "mountains", speed:0.36, draw(offset){ ctx.fillStyle="#6b8e23"; for(let i=-2;i<6;i++){ const mx = i*400 + (-offset*this.speed % 400); ctx.beginPath(); ctx.moveTo(mx, canvas.height); ctx.lineTo(mx+200, canvas.height-180); ctx.lineTo(mx+400, canvas.height); ctx.closePath(); ctx.fill(); } } },
    { name: "trees", speed:0.65, draw(offset){ ctx.fillStyle="#2f4f2f"; for(let i=-2;i<10;i++){ const tx = i*160 + (-offset*this.speed % 160); ctx.fillRect(tx+20, canvas.height-220, 20, 80); ctx.beginPath(); ctx.ellipse(tx+30, canvas.height-240, 48, 32, 0, 0, Math.PI*2); ctx.fill(); } } }
  ];
}
function makeClouds(n) {
  const arr=[];
  for(let i=0;i<n;i++){ arr.push({ x: Math.random()* (canvas.width*2), y: 30 + Math.random()*160, scale: 0.6 + Math.random()*1.4 }); }
  return arr;
}
function drawCloud(x,y,scale=1) {
  ctx.save();
  ctx.translate(x,y);
  ctx.beginPath();
  ctx.ellipse(20*scale, 12*scale, 26*scale, 14*scale, 0, 0, Math.PI*2);
  ctx.ellipse(48*scale, 6*scale, 28*scale, 16*scale, 0, 0, Math.PI*2);
  ctx.ellipse(76*scale, 14*scale, 24*scale, 12*scale, 0, 0, Math.PI*2);
  ctx.fill();
  ctx.restore();
}

/* --------------------------------------------------------
   Level generator (preserves original structures)
   -------------------------------------------------------- */
function createLevels() {
  levels = [];
  const mobileScale = Math.min(1, canvas.width / 900);
  for (let li=0; li<10; li++) {
    const difficulty = li+1;
    const levelWidth = Math.round((2200 + li*500) * (1 - (1-mobileScale)*0.2)); // shrink a bit on small screens
    const groundY = Math.round(canvas.height * 0.42);

    // stairs
    const stairs = [];
    const stairClusters = 2 + Math.floor(difficulty*0.6);
    for (let s=0; s<stairClusters; s++) {
      const baseX = 300 + (s*(levelWidth-600))/stairClusters;
      const steps = 4 + Math.floor(difficulty/3);
      for (let step=0; step<steps; step++){
        stairs.push({ x: baseX + step*36, y: groundY - (step+1)*28, width:36, height:28 });
      }
    }

    // pits
    const pits=[];
    const pitCount = Math.floor(difficulty/3);
    for (let p=0;p<pitCount;p++){
      const px = 800 + p*400 + Math.random()*120;
      const width = 60 + difficulty*10;
      pits.push({ x:px, y:groundY, width, height: canvas.height-groundY });
    }

    // goombas
    const goombas=[];
    const gCount = Math.max(1, 1 + Math.floor(difficulty*1.6) - (canvas.width<600?1:0));
    for (let g=0; g<gCount; g++){
      const gx = 400 + g*200 + Math.random()*100;
      const speed = 0.8 + difficulty*0.2;
      goombas.push({ x:gx, y:groundY-28, width:28, height:28, speed, dir: Math.random()>0.5?1:-1, minX: gx-40, maxX: gx+40, dead:false, animTimer: Math.floor(Math.random()*30) });
    }

    // spikes
    const spikes=[];
    const spikeCount = Math.min(2 + difficulty, 8);
    for (let sp=0; sp<spikeCount; sp++){
      const sx = 600 + sp*250 + Math.random()*60;
      spikes.push({ x:sx, y:groundY-12, width:28, height:12 });
    }

    // coins
    const coins=[];
    const coinCount = Math.max(8, 20 + difficulty*4 - (canvas.width<600?8:0));
    for (let c=0; c<coinCount; c++){
      const cx = 200 + c*100 + Math.random()*60;
      const cy = groundY - 80 - Math.random()*100;
      coins.push({ x:cx, y:cy, width:20, height:20, collected:false, anim: Math.random()*8 });
    }

    // power-ups
    const powerUps=[];
    if (difficulty >= 3) {
      powerUps.push({ type: Math.random() < 0.4 ? "fire" : "life", x: 600 + difficulty*120 + Math.random()*80, y: groundY - 40, width:28, height:28, taken:false });
    }

    // mystery boxes
    const mysteryBoxes=[];
    const boxCount = 2 + Math.floor(difficulty/2);
    for (let b=0; b<boxCount; b++){
      const bx = 400 + b*400 + Math.random()*140;
      const by = groundY - 120 - Math.random()*80;
      mysteryBoxes.push({ x:bx, y:by, width:28, height:28, used:false, reward: Math.random() < 0.5 ? "coin" : (Math.random() < 0.75 ? "life" : "star") });
    }

    // flag
    const flag = { x: levelWidth - 120, y: groundY - 90, width: 28, height: 56 };

    // cannons
    const cannons = [];
    const cannonCount = Math.floor(difficulty/2);
    for (let c=0; c<cannonCount; c++){
      const cx = 500 + c*600 + Math.random()*220;
      cannons.push({ x:cx, y:groundY-28, width:28, height:28, dir: Math.random()>0.5? -1 : 1, cooldown: 80 + Math.floor(Math.random()*120), timer: Math.floor(Math.random()*60)});
    }

    // bats
    const bats=[];
    const batCount = Math.max(0, Math.floor(difficulty*1.1) - (canvas.width<600?1:0));
    for (let b=0; b<batCount; b++){
      const bx = 300 + Math.random()*(levelWidth-600);
      const baseY = groundY - 140 - Math.random()*100;
      bats.push({ x:bx, y:baseY, baseY, width:36, height:22, speed: 1.0 + difficulty*0.08, dir: Math.random()>0.5?1:-1, amplitude: 30 + Math.random()*40, freq: 0.02 + Math.random()*0.02, dead:false, anim: Math.random()*4});
    }

    // checkpoints (a few per level)
    const checkpoints=[];
    const cpCount = Math.min(3, Math.max(1, Math.floor(levelWidth/1000)));
    for (let cp=0; cp<cpCount; cp++){
      const cx = 200 + (cp * (levelWidth - 400)) / (cpCount - 0.0001);
      checkpoints.push({ x: cx, y: groundY - 120, width: 20, height: 80, active: false });
    }

    // particles container
    const particles = [];

    // level seconds scaled with difficulty
    const levelSeconds = Math.max(DEFAULT_LEVEL_SECONDS - difficulty*8, 60);

    levels.push({ width: levelWidth, groundY, stairs, pits, goombas, spikes, coins, powerUps, mysteryBoxes, flag, cannons, bats, checkpoints, particles, levelSeconds });
  }
}

/* --------------------------------------------------------
   Init / Reset
   -------------------------------------------------------- */
function initGame() {
  ensureAudio();
  initBackground();
  createLevels();
  resetToLevel(0);
  lastTime = performance.now();
  requestAnimationFrame(gameLoop);
}
function resetToLevel(idx) {
  if (idx === 0) {
    lives = 5; coinsCollected = 0; score = 0;
  }
  levelIndex = idx;
  const L = levels[levelIndex];
  player.x = 80;
  player.y = L.groundY - player.height;
  player.respawnX = player.x;
  player.respawnY = player.y;
  player.vy = 0; player.jumping = false; player.invincible = false; player.invincibleTimer = 0; player.hasFire = false; player.fireCooldown = 0;
  cameraX = 0; gameOver = false; gameWon = false; paused = false;

  L.coins.forEach(c=> c.collected=false);
  L.goombas.forEach(g=> g.dead=false);
  L.powerUps.forEach(p=> p.taken=false);
  L.mysteryBoxes.forEach(b=> b.used=false);
  L.cannons.forEach(c=> c.timer = Math.floor(Math.random()*c.cooldown));
  L.bats.forEach(b=> b.dead=false);
  L.checkpoints.forEach(c=> c.active=false);
  L.particles.length = 0;

  levelTimer = L.levelSeconds * TICKS_PER_SECOND;
}

/* --------------------------------------------------------
   Projectiles & particles
   -------------------------------------------------------- */
const fireballs = [];
function spawnPlayerFire(x,y,dir) {
  fireballs.push({ x,y,vx: 6*dir, vy: -1.5, width:12, height:12, life: 120, friendly:true });
  playBeep(880,"sine",0.08,0.06);
}
function spawnEnemyFire(x,y,vx,vy) {
  fireballs.push({ x,y,vx,vy,width:12,height:12,life: 200, friendly:false });
}
function spawnParticles(L, x,y, color="orange", count=8, speed=2) {
  for (let i=0;i<count;i++){
    L.particles.push({ x:x + Math.random()*8 - 4, y: y + Math.random()*8 - 4, vx: (Math.random()-0.5)*speed, vy: (Math.random()-0.5)*speed - 1, life: 30 + Math.floor(Math.random()*30), color });
  }
}

/* --------------------------------------------------------
   Damage & lives
   -------------------------------------------------------- */
function damagePlayer(ignoreCheckpoint=false) {
  if (player.invincible) return;
  playHit();
  lives--;
  player.invincible = true;
  player.invincibleTimer = 120;
  if (lives <= 0) {
    gameOver = true;
    saveHighScore();
  } else {
    // respawn at checkpoint or start
    const rx = ignoreCheckpoint ? 80 : (player.respawnX || 80);
    const ry = ignoreCheckpoint ? (levels[levelIndex].groundY - player.height) : (player.respawnY || (levels[levelIndex].groundY - player.height));
    player.x = rx; player.y = ry; player.vy = 0; player.jumping = false;
  }
}

/* --------------------------------------------------------
   High score persistence
   -------------------------------------------------------- */
function saveHighScore() {
  try {
    const prev = parseInt(localStorage.getItem(highScoreKey) || "0", 10);
    if (score > prev) localStorage.setItem(highScoreKey, String(score));
  } catch (e) { /* ignore */ }
}
function getHighScore() {
  try { return parseInt(localStorage.getItem(highScoreKey) || "0", 10); } catch(e){ return 0; }
}

/* --------------------------------------------------------
   Update — main logic (keeps original behavior + extras)
   -------------------------------------------------------- */
function update() {
  if (showTitle || paused) return;
  if (gameOver || gameWon) return;

  const L = levels[levelIndex];

  // apply touch controls
  applyTouchToKeys();

  // horizontal movement
  if (keys.left) { player.x -= player.speed; player.facing = -1; }
  if (keys.right) { player.x += player.speed; player.facing = 1; }
  player.x = Math.max(0, Math.min(L.width - player.width, player.x));

  // animation bookkeeping omitted (we use simple sprite)

  // gravity
  player.y += player.vy;
  player.vy += player.gravity;

  // pit detection (original)
  const onPit = L.pits && L.pits.some(pit =>
    player.x + player.width > pit.x && player.x < pit.x + pit.width && player.y + player.height >= pit.y
  );
  if (!onPit && player.y + player.height >= L.groundY) {
    player.y = L.groundY - player.height;
    player.vy = 0;
    player.jumping = false;
  }

  // stairs collisions
  L.stairs.forEach(st => {
    if (rectsOverlap(player, st) && player.vy >= 0) {
      player.y = st.y - player.height;
      player.vy = 0;
      player.jumping = false;
    }
  });

  // goombas
  L.goombas.forEach(g => {
    if (g.dead) return;
    g.x += g.speed * g.dir;
    if (g.x < g.minX) g.dir = 1;
    if (g.x + g.width > g.maxX) g.dir = -1;
    g.animTimer = (g.animTimer + 1) % 30;

    if (rectsOverlap(player, g)) {
      if (player.invincible) { g.dead = true; score += 100; spawnParticles(L, g.x + g.width/2, g.y + g.height/2, "brown", 10); }
      else if (player.vy > 0 && player.y + player.height - g.y < 18) {
        g.dead = true; player.vy = -player.jumpPower*0.6; score += 100; playBeep(740, "square", 0.06, 0.08);
      } else {
        damagePlayer();
      }
    }
  });

  // bats
  L.bats.forEach(b => {
    if (b.dead) return;
    b.x += b.speed * b.dir;
    b.y = b.baseY + Math.sin(performance.now()*b.freq + b.x) * b.amplitude * 0.5;
    if (b.x < 0) b.dir = 1;
    if (b.x > L.width) b.dir = -1;
    b.anim = (b.anim + 0.2) % 4;
    if (rectsOverlap(player, b)) {
      if (player.invincible) { b.dead = true; score += 120; spawnParticles(L, b.x, b.y, "gray", 8); }
      else damagePlayer();
    }
  });

  // cannons
  L.cannons.forEach(c => {
    c.timer++;
    if (c.timer >= c.cooldown) {
      c.timer = 0;
      const dx = (player.x + player.width/2) - (c.x + c.width/2);
      const dy = (player.y + player.height/2) - (c.y + c.height/2) - 20;
      const dist = Math.sqrt(dx*dx + dy*dy) || 1;
      const vx = (dx / dist) * (3 + Math.random()*1.5);
      const vy = (dy / dist) * (3 + Math.random()*1.0);
      spawnEnemyFire(c.x, c.y - 8, vx, vy);
    }
  });

  // spikes
  L.spikes.forEach(sp => { if (!player.invincible && rectsOverlap(player, sp)) damagePlayer(); });

  // coins
  L.coins.forEach(c => {
    if (!c.collected && rectsOverlap(player, c)) {
      c.collected = true; coinsCollected++; score += 10; playCoin(); spawnParticles(L, c.x + 8, c.y + 8, "gold", 6, 1.6);
    }
    if (!c.collected) c.anim = (c.anim + 0.2) % 8;
  });

  // power-ups
  L.powerUps.forEach(p => {
    if (!p.taken && rectsOverlap(player, p)) {
      p.taken = true;
      if (p.type === "life") { lives++; playPowerup(); }
      else if (p.type === "star") { player.invincible = true; player.invincibleTimer = 600; playPowerup(); }
      else if (p.type === "fire") { player.hasFire = true; playPowerup(); }
    }
  });

  // mystery boxes (if hit from below)
  L.mysteryBoxes.forEach(b => {
    if (!b.used && rectsOverlap(player, b) && player.vy < 0) {
      b.used = true;
      if (b.reward === "coin") { coinsCollected++; score += 10; playCoin(); }
      else if (b.reward === "life") { lives++; playPowerup(); }
      else if (b.reward === "star") { player.invincible = true; player.invincibleTimer = 600; playPowerup(); }
    }
  });

  // checkpoints
  L.checkpoints.forEach(cp => {
    if (!cp.active && rectsOverlap(player, cp)) {
      cp.active = true;
      player.respawnX = cp.x + 10; player.respawnY = cp.y + cp.height - player.height;
      playBeep(1000, "sine", 0.08, 0.07);
    }
  });

  // invincibility timer
  if (player.invincibleTimer > 0) { player.invincibleTimer--; if (player.invincibleTimer === 0) player.invincible = false; }

  // shooting
  if (player.hasFire && player.fireCooldown > 0) player.fireCooldown--;
  if (keys.shoot && player.hasFire && player.fireCooldown <= 0) {
    const sx = player.x + (player.facing === 1 ? player.width : -12);
    const sy = player.y + player.height/2;
    spawnPlayerFire(sx, sy, player.facing);
    player.fireCooldown = 18;
  }

  // fireballs update
  for (let i = fireballs.length -1; i >= 0; i--) {
    const f = fireballs[i];
    f.x += f.vx; f.y += f.vy; f.vy += 0.12; f.life--;
    if (f.x < 0 || f.x > L.width || f.y > canvas.height + 200 || f.life <= 0) { fireballs.splice(i,1); continue; }
    let removed = false;
    if (f.friendly) {
      L.goombas.forEach(g => { if (!g.dead && rectsOverlap(f,g)) { g.dead = true; score += 80; spawnParticles(L, g.x+8, g.y+8, "brown", 8); removed = true; } });
      L.bats.forEach(b => { if (!b.dead && rectsOverlap(f,b)) { b.dead = true; score += 120; spawnParticles(L, b.x, b.y, "gray", 8); removed = true; } });
      L.cannons.forEach(c => { if (rectsOverlap(f,c)) { c.timer = Math.max(0, c.timer - 40); removed = true; } });
      if (removed) { fireballs.splice(i,1); playBeep(640, "square", 0.06, 0.06); continue; }
    } else {
      if (!player.invincible && rectsOverlap(f, player)) { fireballs.splice(i,1); damagePlayer(); continue; }
    }
  }

  // particles update
  for (let i=L.particles.length -1; i>=0; i--) {
    const p = L.particles[i];
    p.x += p.vx; p.y += p.vy; p.vy += 0.12; p.life--;
    if (p.life <= 0) L.particles.splice(i,1);
  }

  // flag
  if (rectsOverlap(player, L.flag)) {
    if (levelIndex < levels.length -1) {
      playWin();
      resetToLevel(levelIndex + 1);
      return;
    } else {
      gameWon = true;
      saveHighScore();
      playWin();
      return;
    }
  }

  // falling out
  if (player.y > canvas.height + 150) damagePlayer();

  // camera follow
  cameraX = Math.max(0, Math.min(player.x - canvas.width * 0.3, L.width - canvas.width));

  // timer countdown
  levelTimer--;
  if (levelTimer <= 0) damagePlayer(true);
}

/* --------------------------------------------------------
   Draw — all visuals (HUD scaled for mobile)
   -------------------------------------------------------- */
function draw() {
  // background gradient
  const grad = ctx.createLinearGradient(0,0,0,canvas.height);
  grad.addColorStop(0,"#87ceeb"); grad.addColorStop(1,"#a0d6ff");
  ctx.fillStyle = grad; ctx.fillRect(0,0,canvas.width,canvas.height);

  const L = levels[levelIndex];

  // parallax layers
  bgLayers.forEach(layer => {
    ctx.save();
    ctx.translate(-cameraX * (layer.speed || 0), 0);
    layer.draw(cameraX);
    ctx.restore();
  });

  // level drawing
  ctx.save(); ctx.translate(-cameraX, 0);

  // ground
  ctx.fillStyle = "#b5651d"; ctx.fillRect(0, L.groundY, L.width, canvas.height - L.groundY);

  // pits
  ctx.fillStyle = "#4d2b00"; L.pits.forEach(p=> ctx.fillRect(p.x, p.y, p.width, p.height));

  // stairs + wooden poles
  L.stairs.forEach(st => {
    ctx.fillStyle = "#a0522d"; ctx.fillRect(st.x, st.y, st.width, st.height);
    ctx.fillStyle = "#654321"; ctx.fillRect(st.x + st.width/2 - 3, st.y + st.height, 6, L.groundY - (st.y + st.height));
  });

  // spikes
  ctx.fillStyle = "black"; L.spikes.forEach(sp => { ctx.beginPath(); ctx.moveTo(sp.x, sp.y + sp.height); ctx.lineTo(sp.x + sp.width/2, sp.y); ctx.lineTo(sp.x + sp.width, sp.y + sp.height); ctx.fill(); });

  // coins
  L.coins.forEach(c => {
    if (!c.collected) {
      if (coinSprite.complete && coinSprite.naturalWidth !== 0) {
        const wob = Math.sin(c.anim*0.5)*4;
        ctx.drawImage(coinSprite, c.x, c.y + wob, c.width, c.height);
      } else {
        ctx.beginPath(); ctx.fillStyle="gold"; ctx.arc(c.x + c.width/2, c.y + c.height/2, c.width/2, 0, Math.PI*2); ctx.fill();
      }
    }
  });

  // power-ups
  L.powerUps.forEach(p => {
    if (!p.taken) {
      if (p.type === "life") { ctx.fillStyle="red"; ctx.fillRect(p.x,p.y,p.width,p.height); ctx.fillStyle="white"; ctx.font="14px Arial"; ctx.fillText("+", p.x+6, p.y+18); }
      else if (p.type === "star") { ctx.fillStyle="yellow"; ctx.beginPath(); ctx.arc(p.x + p.width/2, p.y + p.height/2, p.width/2, 0, Math.PI*2); ctx.fill(); }
      else if (p.type === "fire") { ctx.fillStyle="orange"; ctx.fillRect(p.x,p.y,p.width,p.height); ctx.fillStyle="white"; ctx.font="12px Arial"; ctx.fillText("F", p.x+6, p.y+18); }
    }
  });

  // mystery boxes
  L.mysteryBoxes.forEach(b => {
    if (!b.used) { ctx.fillStyle="orange"; ctx.fillRect(b.x,b.y,b.width,b.height); ctx.fillStyle="black"; ctx.font="20px Arial"; ctx.fillText("?", b.x+6, b.y+22); }
    else { ctx.fillStyle="#8b4513"; ctx.fillRect(b.x,b.y,b.width,b.height); }
  });

  // goombas
  ctx.fillStyle = "sienna"; L.goombas.forEach(g => {
    if (!g.dead) {
      const bob = Math.sin(g.animTimer*0.2)*2;
      ctx.fillRect(g.x, g.y + bob, g.width, g.height);
    } else {
      ctx.fillStyle = "#3a2b1b"; ctx.fillRect(g.x, g.y + 14, g.width, 6); ctx.fillStyle = "sienna";
    }
  });

  // bats
  L.bats.forEach(b => {
    if (!b.dead) {
      ctx.save(); ctx.translate(b.x + b.width/2, b.y + b.height/2); ctx.scale(b.dir,1);
      ctx.fillStyle = "gray";
      ctx.beginPath(); ctx.moveTo(-b.width/2,0); ctx.quadraticCurveTo(-b.width/2 - 10, -10 - Math.sin(b.anim)*6, -b.width, -10); ctx.quadraticCurveTo(-b.width/2, -6, -b.width/2 + 10, -2); ctx.closePath(); ctx.fill();
      ctx.restore();
    } else {
      ctx.fillStyle="rgba(120,120,120,0.6)"; ctx.fillRect(b.x, b.y, b.width, 4);
    }
  });

  // cannons
  L.cannons.forEach(c => {
    ctx.fillStyle="#222"; ctx.fillRect(c.x, c.y - 8, c.width, c.height + 8);
    ctx.fillStyle="#444"; ctx.fillRect(c.x + (c.dir === 1 ? c.width - 6 : 0), c.y - 12, 6, 6);
  });

  // checkpoints
  L.checkpoints.forEach(cp => {
    ctx.fillStyle = cp.active ? "yellow" : "white";
    ctx.fillRect(cp.x, cp.y, 6, cp.height);
    ctx.fillStyle = cp.active ? "orange" : "red";
    ctx.fillRect(cp.x + 6, cp.y + 12, 18, 12);
  });

  // flag
  if (flagSprite.complete && flagSprite.naturalWidth !== 0) ctx.drawImage(flagSprite, L.flag.x, L.flag.y, L.flag.width, L.flag.height);
  else { ctx.fillStyle = "red"; ctx.fillRect(L.flag.x, L.flag.y, L.flag.width, L.flag.height); }

  // fireballs
  fireballs.forEach(f => {
    if (fireballSprite.complete && fireballSprite.naturalWidth !== 0) ctx.drawImage(fireballSprite, f.x, f.y, f.width, f.height);
    else {
      ctx.beginPath(); ctx.fillStyle = f.friendly ? "orange" : "red"; ctx.arc(f.x + f.width/2, f.y + f.height/2, f.width/2, 0, Math.PI*2); ctx.fill();
    }
  });

  // particles
  L.particles.forEach(p => { ctx.globalAlpha = Math.max(0, Math.min(1, p.life/60)); ctx.fillStyle = p.color || "orange"; ctx.fillRect(p.x, p.y, 3, 3); ctx.globalAlpha = 1; });

  // player
  if (characterSprite.complete && characterSprite.naturalWidth !== 0) {
    if (!(player.invincible && Math.floor(performance.now()/120) % 2 === 0)) {
      ctx.drawImage(characterSprite, player.x, player.y, player.width, player.height);
    }
  } else {
    ctx.fillStyle = "blue"; ctx.fillRect(player.x, player.y, player.width, player.height);
  }

  ctx.restore();

  // HUD — adapt font sizes for mobile
  const small = canvas.width < 600;
  ctx.fillStyle = "black";
  ctx.font = small ? "14px Arial" : "18px Arial";
  ctx.fillText(`Lvl ${levelIndex+1}/${levels.length}`, 12, 24);
  ctx.fillText(`Coins: ${coinsCollected}`, 12, 24 + (small?20:26));
  ctx.fillText(`Score: ${score}`, 12, 24 + (small?40:52));
  ctx.fillText(`Lives: ${lives}`, 12, 24 + (small?60:78));
  if (player.invincible) ctx.fillText("Invincible!", 12, 24 + (small?80:104));
  if (player.hasFire) ctx.fillText("Fire: Ready", canvas.width - 130, 24);

  // level timer
  const secondsLeft = Math.max(0, Math.floor(levelTimer / TICKS_PER_SECOND));
  ctx.fillStyle = "black";
  ctx.font = small ? "14px Arial" : "16px Arial";
  ctx.fillText(`Time: ${secondsLeft}s`, canvas.width - (small?110:140), 24);

  // top-right small panel for high score readability
  ctx.fillStyle = "rgba(0,0,0,0.5)"; ctx.fillRect(canvas.width - 220, 34, 200, 38);
  ctx.fillStyle = "white"; ctx.font = "14px Arial"; ctx.fillText(`High: ${getHighScore()}`, canvas.width - 200, 58);

  // overlays
  if (paused) {
    ctx.fillStyle = "rgba(0,0,0,0.5)"; ctx.fillRect(0,0,canvas.width,canvas.height);
    ctx.fillStyle = "white"; ctx.font = "46px Arial"; ctx.fillText("PAUSED", canvas.width/2 - 100, canvas.height/2);
  }
  if (gameOver) {
    ctx.fillStyle = "rgba(0,0,0,0.6)"; ctx.fillRect(0, canvas.height/2 - 60, canvas.width, 140);
    ctx.fillStyle = "white"; ctx.font = "48px Arial"; ctx.fillText("GAME OVER", canvas.width/2 - 160, canvas.height/2);
    ctx.font = "20px Arial"; ctx.fillText("Tap the screen to restart (or use buttons)", canvas.width/2 - 160, canvas.height/2 + 40);
  } else if (gameWon) {
    ctx.fillStyle = "rgba(0,0,0,0.6)"; ctx.fillRect(0, canvas.height/2 - 60, canvas.width, 140);
    ctx.fillStyle = "white"; ctx.font = "42px Arial"; ctx.fillText("YOU WIN!", canvas.width/2 - 100, canvas.height/2);
    ctx.font = "20px Arial"; ctx.fillText(`Final Score: ${score}`, canvas.width/2 - 70, canvas.height/2 + 40);
  }

  // small help text at bottom
  ctx.font = "12px Arial"; ctx.fillStyle = "rgba(0,0,0,0.6)";
  ctx.fillText("Controls: use on-screen buttons or arrow keys/A-D (desktop).", 12, canvas.height - 12);

  // also reflect minimal HUD into DOM for accessibility on tiny screens
  hudSmall.innerHTML = `Lvl:${levelIndex+1} • Coins:${coinsCollected} • Score:${score} • Lives:${lives} • Time:${secondsLeft}s`;
}

/* --------------------------------------------------------
   Game loop orchestration
   -------------------------------------------------------- */
let lastTime = performance.now();
function gameLoop(now = performance.now()) {
  const dt = now - lastTime;
  lastTime = now;
  // keep audio resumed on first gesture (some browsers)
  if (!audioCtx && !showTitle) ensureAudio();

  // update & draw
  for (let i=0;i<1;i++) update();
  draw();

  if (!gameOver && !gameWon && !showTitle) requestAnimationFrame(gameLoop);
  else if (showTitle) {
    // draw title overlay remains handled by DOM element; but continue loop to flash
    // we still want animation for parallax behind overlay
    bgLayers.forEach(layer => {
      // minor movement to animate clouds even while title is shown
      if (layer.name === "clouds") layer.clouds.forEach(c => { c.x += 0.02; });
    });
    requestAnimationFrame(gameLoop);
  }
}

/* --------------------------------------------------------
   Title & click-to-start handling
   -------------------------------------------------------- */
function showTitleOverlay(show=true) {
  showTitle = show;
  if (show) {
    titleOverlay.classList.remove("hidden");
    titleHighScore.innerText = `High Score: ${getHighScore()}`;
  } else {
    titleOverlay.classList.add("hidden");
  }
}
titleOverlay.addEventListener("click", (e) => {
  // start/resume the game
  ensureAudio();
  showTitleOverlay(false);
  lastTime = performance.now();
  requestAnimationFrame(gameLoop);
});

/* restart on click when game over or win */
canvas.addEventListener("click", () => {
  if (!gameOver && !gameWon) return;
  if (gameOver) { if (lives > 0) resetToLevel(levelIndex); else resetToLevel(0); showTitleOverlay(false); lastTime = performance.now(); requestAnimationFrame(gameLoop); }
  else if (gameWon) { resetToLevel(0); showTitleOverlay(false); lastTime = performance.now(); requestAnimationFrame(gameLoop); }
});

/* keyboard Enter to restart */
document.addEventListener("keydown", (e) => {
  if (e.code === "Enter" && (gameOver || gameWon)) {
    if (lives > 0) resetToLevel(levelIndex); else resetToLevel(0);
    showTitleOverlay(false);
    lastTime = performance.now();
    requestAnimationFrame(gameLoop);
  }
});

/* --------------------------------------------------------
   Utilities & debug console integration
   -------------------------------------------------------- */
window.__MOBILEGAME = {
  addCoins(n=10) { coinsCollected+=n; score += n*10; },
  nextLevel() { resetToLevel(Math.min(levelIndex+1, levels.length-1)); },
  giveLife() { lives++; },
  setTime(s) { levelTimer = s * TICKS_PER_SECOND; },
  toggleInvincible() { player.invincible = !player.invincible; },
  teleport(x) { player.x = x; cameraX = Math.max(0, Math.min(player.x - canvas.width * 0.3, levels[levelIndex].width - canvas.width)); }
};

/* --------------------------------------------------------
   Boot sequence: wait for images then start
   -------------------------------------------------------- */
let assetsLoaded = 0;
function assetReady() { assetsLoaded++; if (assetsLoaded >= 3) { initGame(); showTitleOverlay(true); } }
characterSprite.onload = assetReady;
flagSprite.onload = assetReady;
coinSprite.onload = assetReady;
// If images fail to load quickly, still start after short timeout for mobile
setTimeout(()=>{ if (assetsLoaded < 3) { initGame(); showTitleOverlay(true); } }, 2500);

/* --------------------------------------------------------
   End of file
   -------------------------------------------------------- */

/* Notes:
 - The file preserves and expands on your original features:
   coins, goombas, spikes, pits, power-ups, mystery boxes, flags.
 - Added mobile-first responsive canvas, on-screen touch buttons, parallax,
   additional enemies (bats, cannons), fireball projectile, checkpoints,
   level timer, particles, simple WebAudio sounds, and persistence for high score.
 - Tweak constants (speeds, counts, timers) near top of file for balancing.
 - If you'd like audio samples instead of synth beeps, I can swap them in.
 - If you want the file split into modules, tell me and I will export separate files.
*/

