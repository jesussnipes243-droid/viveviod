/* ==========================================================================
   VOID // VERSE
   --------------------------------------------------------------------------
   Interactive intro (follow the mystic light through the jungle) -> the fall
   into the void -> Rainforest Rift -> Galactic Wasteland. One shared Perlin
   flow field drives grid drift, mist, debris, and now danger — debris hurts
   you, power-ups counter it, and portal/shard layouts are patterned instead
   of fixed corners.
   ========================================================================== */

// ---------- shared flow field ----------
let riftInstability = 0.35;
const FLOW_SCALE = 0.006;

function currentFlowTimeScale() { return map(effectiveInstability(), 0, 1, 0.0006, 0.006); }
function currentGridJitter()    { return map(effectiveInstability(), 0, 1, 2, 9); }
function currentMaxDebris()     { return floor(map(effectiveInstability(), 0, 1, 2, 16)); }
function currentDebrisSpawnInterval() { return floor(map(effectiveInstability(), 0, 1, 70, 12)); }

function effectiveInstability() {
  let boost = (ROOMS[currentRoomIndex] && ROOMS[currentRoomIndex].instabilityBoost) || 0;
  return constrain(riftInstability + boost, 0, 1);
}

function flowAngle(x, y, t) {
  let n = noise(x * FLOW_SCALE, y * FLOW_SCALE, t);
  return n * 720; // angleMode(DEGREES)
}
function flowTime() { return frameCount * currentFlowTimeScale(); }

// ---------- grid ----------
let distMouse = 40;
let cols, rows;
let size = 10;
let offset = 4;
let blocks = [];
let gridColor = [90, 200, 140]; // jungle green by default (also intro backdrop)

// ---------- player ----------
const PLAYER_RADIUS = 9;
let PLAYER_MAX_HP = 3; // grows permanently when a secret is opened
let player = { x: 300, y: 560, vx: 0, vy: 0, glow: 0, hp: PLAYER_MAX_HP, invuln: 0 };

// ---------- puzzle pieces ----------
let shards = [];
let portals = [];
let walls = [];
let held = null;
let solved = 0;

// ---------- progression ----------
let inventory = 0;
let relic = null;
let relicSpawned = false;
let currentRoomIndex = 0;
let gameEnded = false;

// ---------- crafting / materials (persist across rooms) ----------
let materials = [];        // { id, col, kind: 'wild' | 'key' }
let materialIdCounter = 0;
let heldMaterialIdx = null;
const WILD_COLOR = [230, 210, 255];
const KEY_COLOR = [255, 210, 110];
const MATERIAL_TRAY_X = 20;
const MATERIAL_TRAY_Y = 82;
const MATERIAL_GAP = 20;

// ---------- secrets ----------
let secretGlyphObj = null;
let inSecretVignette = false;
let secretVignetteText = "";

// ---------- craft feedback ----------
let craftMessage = "";
let craftMessageTimer = 0;

// ---------- game state ----------
let gameState = 'intro'; // 'intro' | 'playing'

// ---------- intro (lore delivered as interactive follow sequence) ----------
const INTRO_STEPS = [
  { x: 150, y: 450, line: "you shouldn't be out this late." },
  { x: 460, y: 420, line: "something in the mist is watching back." },
  { x: 430, y: 150, line: "it wants you to follow. so you do." },
  { x: 300, y: 300, line: "the ground was never really there." },
];
let introIndex = 0;
let introStageStart = 0;
let firefly = null;
let fallSequenceActive = false;
let fallTimer = 0;

// ---------- transition ----------
let transitioning = false;
let transitionPhase = 'idle';
let transitionAlpha = 0;
let nextRoomIndex = 0;
let pendingEnd = false;

// ---------- fx ----------
let crackFlash = 0;
let hitFlash = 0;
let shakeAmount = 0;
let particles = [];
let debris = [];

// ---------- power-ups ----------
let activeEffects = { speed: 0, slow: 0, shield: 0 };
let activePowerUp = null;
let lastPowerUpAttempt = 0;
const POWERUP_INTERVAL = 480;
const POWERUP_DURATION = 360;

// ---------- audio ----------
let theme;
let soundReady = false;
let soundLoadAttempted = false;

const ROOMS = [
  {
    name: "THE RAINFOREST RIFT",
    biomeType: "rainforest",
    gridColor: [90, 200, 140],
    particleColor: [140, 255, 190],
    debrisColor: [90, 200, 120],
    portalColors: [[110, 231, 183], [110, 190, 231], [231, 110, 200]],
    portalPositions: [[130, 120], [470, 150], [300, 480]],
    wallCount: 0,
    driftPortals: false,
    instabilityBoost: 0,
  },
  {
    name: "THE GALACTIC WASTELAND",
    biomeType: "galactic",
    gridColor: [150, 110, 231],
    particleColor: [200, 200, 255],
    debrisColor: [170, 140, 220],
    portalColors: [[231, 190, 110], [110, 231, 200], [231, 110, 110], [140, 231, 110]],
    portalPositions: [[110, 110], [490, 130], [490, 470], [150, 480]],
    wallCount: 1,
    driftPortals: false,
    instabilityBoost: 0,
    secretGlyph: { x: 300, y: 220 },
    secretText: "the moonlight shard remembers a village that hasn't been built yet, or has already fallen.",
  },
  {
    // New mechanic: portals slowly orbit their anchor point, so a drop has
    // to be timed against motion instead of aimed at a fixed target.
    name: "THE HOLLOW CANOPY",
    biomeType: "rainforest",
    gridColor: [110, 210, 190],
    particleColor: [170, 240, 220],
    debrisColor: [120, 200, 180],
    portalColors: [[130, 231, 200], [190, 160, 231], [231, 200, 130]],
    portalPositions: [[150, 200], [450, 200], [300, 440]],
    wallCount: 0,
    driftPortals: true,
    instabilityBoost: 0.05,
  },
  {
    // New mechanic: two walls instead of one — this room can't be solved on
    // a single fragment. It rewards conserving fragments from earlier rooms
    // rather than spending them the moment you get one.
    name: "THE STATIC REEF",
    biomeType: "galactic",
    gridColor: [231, 120, 90],
    particleColor: [255, 180, 150],
    debrisColor: [231, 110, 90],
    portalColors: [[255, 180, 90], [255, 110, 140], [180, 255, 200], [140, 180, 255], [255, 240, 140]],
    portalPositions: [[110, 130], [490, 110], [520, 470], [300, 340], [90, 470]],
    wallCount: 2,
    driftPortals: false,
    instabilityBoost: 0.3,
    secretGlyph: { x: 420, y: 300 },
    secretText: "somewhere under all this wreckage, something is still growing.",
  },
];

function loadThemeIfNeeded() {
  if (soundLoadAttempted) return;
  soundLoadAttempted = true;
  soundFormats('mp3');
  theme = loadSound(
    'assets/theme.mp3',
    () => { soundReady = true; },
    (err) => { console.warn('VOID // VERSE: music failed to load —', err); }
  );
}

function setup() {
  const c = createCanvas(600, 600);
  c.parent('sketch');
  rectMode(CENTER);
  angleMode(DEGREES);
  noCursor();
  textFont('monospace');

  cols = floor(width / size);
  rows = floor(height / size);
  for (let i = 0; i < cols; i++) {
    blocks[i] = [];
    for (let j = 0; j < rows; j++) {
      blocks[i][j] = new Block(size / 2 + i * size, size / 2 + j * size);
    }
  }

  setupAudioControls();
  setupRiftControl();
  setupSkipIntro();
  loadThemeIfNeeded();
  setupIntro();
}

function setupIntro() {
  gameState = 'intro';
  introIndex = 0;
  introStageStart = frameCount;
  firefly = new Firefly(INTRO_STEPS[0].x, INTRO_STEPS[0].y);
  player.x = 300; player.y = 560; player.vx = 0; player.vy = 0;
  fallSequenceActive = false;
  fallTimer = 0;
}

function setupSkipIntro() {
  const btn = document.getElementById('skip-intro');
  if (!btn) return;
  btn.addEventListener('click', () => {
    if (gameState === 'intro') startPlaying();
  });
}

function startPlaying() {
  const btn = document.getElementById('skip-intro');
  if (btn) btn.style.display = 'none';
  player.hp = PLAYER_MAX_HP;
  player.invuln = 60;
  inventory = 0;
  gameEnded = false;
  gameState = 'playing';
  loadRoom(0);
}

function setupAudioControls() {
  const toggleBtn = document.getElementById('toggle-sound');
  const vol = document.getElementById('vol');
  const volVal = document.getElementById('volVal');
  if (!toggleBtn || !vol || !volVal) return;

  toggleBtn.addEventListener('click', () => {
    loadThemeIfNeeded();
    if (!theme || !soundReady) {
      toggleBtn.textContent = '♪ LOADING...';
      return;
    }
    if (theme.isPlaying()) {
      theme.pause();
      toggleBtn.classList.remove('is-active');
      toggleBtn.textContent = '♪ MUSIC';
    } else {
      theme.loop();
      theme.setVolume(parseFloat(vol.value));
      toggleBtn.classList.add('is-active');
      toggleBtn.textContent = '♪ MUSIC';
    }
  });

  vol.addEventListener('input', () => {
    volVal.textContent = parseFloat(vol.value).toFixed(2);
    if (soundReady) theme.setVolume(parseFloat(vol.value));
  });
}

function setupRiftControl() {
  const rift = document.getElementById('rift');
  const riftVal = document.getElementById('riftVal');
  if (!rift || !riftVal) return;

  riftInstability = parseFloat(rift.value);
  riftVal.textContent = riftLabel(riftInstability);

  rift.addEventListener('input', () => {
    riftInstability = parseFloat(rift.value);
    riftVal.textContent = riftLabel(riftInstability);
  });
}

function riftLabel(v) {
  if (v < 0.25) return 'CALM';
  if (v < 0.55) return 'RESTLESS';
  if (v < 0.8) return 'UNSTABLE';
  return 'TEARING';
}

function triggerShake(amount) {
  shakeAmount = max(shakeAmount, amount);
}

function loadRoom(idx) {
  currentRoomIndex = idx;
  let room = ROOMS[idx];
  gridColor = room.gridColor;

  let colors = shuffle(room.portalColors);
  portals = [];
  for (let i = 0; i < room.portalPositions.length; i++) {
    let pos = room.portalPositions[i];
    let portal = new Portal(pos[0], pos[1], colors[i]);
    if (room.driftPortals) {
      portal.driftCfg = { cx: pos[0], cy: pos[1], r: 42, speed: 0.6, phase: i * (360 / room.portalPositions.length) };
    }
    portals.push(portal);
  }

  walls = [];
  if (room.wallCount > 0) {
    let idxs = shuffle([...Array(portals.length).keys()]);
    for (let k = 0; k < room.wallCount; k++) {
      let wIdx = idxs[k];
      portals[wIdx].blocked = true;
      walls.push(new Wall(portals[wIdx].x, portals[wIdx].y));
    }
  }

  let n = portals.length;
  let ringR = 95;
  let rot = random(360);
  shards = [];
  for (let i = 0; i < n; i++) {
    let ang = rot + (360 / n) * i;
    let sx = width / 2 + cos(ang) * ringR;
    let sy = height / 2 + sin(ang) * ringR;
    shards.push(new Shard(sx, sy, colors[i]));
  }

  let wildAngle = random(360);
  let wildR = 220;
  let wx = constrain(width / 2 + cos(wildAngle) * wildR, 40, width - 40);
  let wy = constrain(height / 2 + sin(wildAngle) * wildR, 40, height - 40);
  shards.push(new Shard(wx, wy, WILD_COLOR, true));

  secretGlyphObj = room.secretGlyph ? new SecretGlyph(room.secretGlyph.x, room.secretGlyph.y) : null;
  inSecretVignette = false;
  heldMaterialIdx = null;

  debris = [];
  activePowerUp = null;
  solved = 0;
  relic = null;
  relicSpawned = false;
  held = null;
}

function draw() {
  push();
  if (shakeAmount > 0) {
    translate(random(-shakeAmount, shakeAmount), random(-shakeAmount, shakeAmount));
    shakeAmount *= 0.9;
    if (shakeAmount < 0.5) shakeAmount = 0;
  }

  background(0);

  for (let i = 0; i < cols; i++) {
    for (let j = 0; j < rows; j++) {
      blocks[i][j].move();
      blocks[i][j].display();
    }
  }

  if (gameState === 'intro') {
    drawIntro();
    pop();
    return;
  }

  // ---- gameState === 'playing' ----
  updateAndDisplayDebris();

  for (let w of walls) w.display();
  for (let p of portals) { p.update(); p.display(); }
  if (secretGlyphObj) secretGlyphObj.display();

  for (let s of shards) {
    if (s === held) {
      s.x = mouseX;
      s.y = mouseY;
    }
    s.update();
    s.display();
  }

  if (solved >= portals.length && !relicSpawned && !gameEnded) {
    relic = new Relic(300, 300);
    relicSpawned = true;
  }

  updateAndDisplayPowerUps();
  spawnAmbientParticles();
  updateAndDisplayParticles();

  updatePlayer();
  displayPlayer();
  updateActiveEffects();
  handlePlayerDebrisCollisions();
  handleWildShardPickup();

  if (relic && !transitioning) {
    relic.display();
    if (dist(player.x, player.y, relic.x, relic.y) < 18) {
      inventory++;
      player.hp = min(PLAYER_MAX_HP, player.hp + 1);
      relic = null;
      crackFlash = 150;
      transitioning = true;
      transitionPhase = 'out';
      transitionAlpha = 0;
      if (currentRoomIndex + 1 < ROOMS.length) {
        nextRoomIndex = currentRoomIndex + 1;
        pendingEnd = false;
      } else {
        pendingEnd = true;
      }
    }
  }

  if (crackFlash > 0) {
    push(); noStroke(); fill(255, crackFlash); rect(width / 2, height / 2, width, height); pop();
    crackFlash -= 8;
  }
  if (hitFlash > 0) {
    push(); noStroke(); fill(255, 60, 60, hitFlash); rect(width / 2, height / 2, width, height); pop();
    hitFlash -= 10;
  }

  if (craftMessageTimer > 0) {
    push();
    textAlign(CENTER, CENTER);
    let a = map(craftMessageTimer, 0, 100, 0, 230, true);
    fill(KEY_COLOR[0], KEY_COLOR[1], KEY_COLOR[2], a);
    textSize(12);
    text(craftMessage, width / 2, height / 2 + 70);
    pop();
    craftMessageTimer--;
  }

  drawHUD();

  if (gameEnded) {
    push();
    textAlign(CENTER, CENTER);
    fill(255, 200 + 55 * sin(frameCount * 4));
    textSize(16);
    text("THE MATRIX CRACKS OPEN...", width / 2, height / 2 - 10);
    textSize(10);
    fill(180);
    text("(more worlds await — click to wander again)", width / 2, height / 2 + 14);
    pop();
  }

  if (transitioning) {
    push(); noStroke(); fill(0, transitionAlpha); rect(width / 2, height / 2, width, height); pop();

    if (transitionPhase === 'out') {
      transitionAlpha += 8;
      if (transitionAlpha >= 255) {
        if (pendingEnd) {
          gameEnded = true;
          transitioning = false;
        } else {
          loadRoom(nextRoomIndex);
          transitionPhase = 'in';
        }
      }
    } else if (transitionPhase === 'in') {
      transitionAlpha -= 8;
      if (transitionAlpha <= 0) {
        transitionAlpha = 0;
        transitioning = false;
      }
    }
  }

  if (inSecretVignette) drawSecretVignette();

  pop();
}

// ============================== intro ======================================

function drawIntro() {
  spawnAmbientParticles();
  updateAndDisplayParticles();

  firefly.update();
  firefly.display();

  updatePlayer();
  displayPlayer();

  if (!fallSequenceActive) {
    if (dist(player.x, player.y, firefly.x, firefly.y) < 40) {
      introIndex++;
      introStageStart = frameCount;
      if (introIndex < INTRO_STEPS.length) {
        firefly.setTarget(INTRO_STEPS[introIndex].x, INTRO_STEPS[introIndex].y);
      } else {
        fallSequenceActive = true;
        fallTimer = 0;
        triggerShake(14);
      }
    }
  } else {
    fallTimer++;
    push(); noStroke(); fill(255, min(255, fallTimer * 6)); rect(width / 2, height / 2, width, height); pop();
    if (fallTimer > 40) startPlaying();
  }

  push();
  textAlign(CENTER, CENTER);
  let lineIdx = min(introIndex, INTRO_STEPS.length - 1);
  let a = constrain(map(frameCount - introStageStart, 0, 30, 0, 255), 0, 255);
  fill(210, 255, 230, a);
  textSize(13);
  text(INTRO_STEPS[lineIdx].line, width / 2, height - 50);
  if (introIndex === 0 && frameCount - introStageStart > 60) {
    fill(255, 220, 150, 180);
    textSize(10);
    text("follow the light", width / 2, height - 26);
  }
  pop();
}

// ============================== HUD =========================================

function drawHUD() {
  push();
  noStroke();
  textAlign(LEFT, TOP);
  textSize(13);
  fill(210, 230, 255, 210);
  text(ROOMS[currentRoomIndex].name, 14, 14);

  for (let i = 0; i < PLAYER_MAX_HP; i++) {
    if (i < player.hp) fill(120, 255, 170, 230);
    else fill(60, 60, 70, 150);
    rect(20 + i * 16, 42, 10, 10);
  }

  textAlign(RIGHT, TOP);
  textSize(13);
  fill(210, 230, 255, 210);
  text("FRAGMENTS: " + inventory, width - 14, 14);

  textSize(10);
  let ey = 34;
  for (const k of ['speed', 'slow', 'shield']) {
    if (activeEffects[k] > 0) {
      fill(200, 220, 255, 210);
      text(k.toUpperCase() + " " + ceil(activeEffects[k] / 60) + "s", width - 14, ey);
      ey += 14;
    }
  }

  let unbrokenWalls = walls.filter(w => !w.broken).length;
  let msg = "";
  if (gameEnded) {
    msg = "";
  } else if (unbrokenWalls > 0) {
    if (inventory > 0) {
      msg = unbrokenWalls > 1
        ? "click a fractured wall to break it open — " + unbrokenWalls + " remain"
        : "click the fractured wall to break it open";
    } else {
      msg = "find a fragment to break through";
    }
  } else if (relic) {
    msg = "guide the glow to the fragment";
  } else {
    msg = "drag shards into matching portals — dodge the debris";
  }
  textAlign(CENTER, BOTTOM);
  textSize(11);
  fill(180, 200, 220, 160);
  text(msg, width / 2, height - 12);

  if (secretGlyphObj && !secretGlyphObj.opened && materials.some(m => m.kind === 'key')) {
    fill(230, 210, 255, 130);
    textSize(9);
    text("something answers, faintly", width / 2, height - 27);
  }

  drawMaterialsTray();
  pop();
}

// ============================== player ======================================

function updatePlayer() {
  let speedMult = activeEffects.speed > 0 ? 1.9 : 1;
  let ax = (mouseX - player.x) * 0.02 * speedMult;
  let ay = (mouseY - player.y) * 0.02 * speedMult;
  player.vx = (player.vx + ax) * 0.86;
  player.vy = (player.vy + ay) * 0.86;
  player.x += player.vx;
  player.y += player.vy;
  player.x = constrain(player.x, 10, width - 10);
  player.y = constrain(player.y, 10, height - 10);
  let speed = dist(0, 0, player.vx, player.vy);
  player.glow = lerp(player.glow, constrain(speed * 10, 40, 255), 0.2);
}

function displayPlayer() {
  push();
  translate(player.x, player.y);
  noStroke();
  for (let r = 18; r > 0; r -= 4) {
    fill(180, 255, 220, map(r, 0, 18, 90, 6));
    rect(0, 0, r, r);
  }
  fill(255);
  rect(0, 0, 6, 6);

  if (activeEffects.shield > 0) {
    noFill();
    strokeWeight(2);
    stroke(255, 120, 220, 180 + 60 * sin(frameCount * 6));
    rect(0, 0, 26, 26);
  }
  if (player.invuln > 0 && frameCount % 8 < 4) {
    noFill();
    stroke(255, 255, 255, 150);
    rect(0, 0, 20, 20);
  }
  pop();
}

function handlePlayerDebrisCollisions() {
  if (player.invuln > 0) { player.invuln--; return; }
  for (let i = debris.length - 1; i >= 0; i--) {
    let d = debris[i];
    let hitR = PLAYER_RADIUS + d.size * 0.6;
    if (dist(player.x, player.y, d.x, d.y) < hitR) {
      if (activeEffects.shield > 0) {
        spawnBurst(d.x, d.y, d.col);
        debris.splice(i, 1);
      } else {
        player.hp--;
        player.invuln = 70;
        triggerShake(10);
        hitFlash = 160;
        let pushA = atan2(player.y - d.y, player.x - d.x);
        player.vx += cos(pushA) * 6;
        player.vy += sin(pushA) * 6;
        spawnBurst(player.x, player.y, [255, 90, 90]);
        if (player.hp <= 0) {
          player.hp = PLAYER_MAX_HP;
          player.invuln = 100;
          if (inventory > 0) inventory--;
          triggerShake(18);
          hitFlash = 220;
        }
      }
      break;
    }
  }
}

function updateActiveEffects() {
  for (const k in activeEffects) {
    if (activeEffects[k] > 0) activeEffects[k]--;
  }
}

// ============================== debris / power-ups ==========================

function updateAndDisplayDebris() {
  let room = ROOMS[currentRoomIndex];

  if (debris.length < currentMaxDebris() && frameCount % currentDebrisSpawnInterval() === 0) {
    debris.push(new Debris(room.biomeType, room.debrisColor));
  }

  for (let i = debris.length - 1; i >= 0; i--) {
    let d = debris[i];
    d.update();
    d.display();
    if (d.offscreen()) debris.splice(i, 1);
  }
}

function updateAndDisplayPowerUps() {
  if (!activePowerUp && frameCount - lastPowerUpAttempt > POWERUP_INTERVAL) {
    lastPowerUpAttempt = frameCount;
    let types = ['speed', 'slow', 'shield'];
    let type = random(types);
    let px = random(80, 520);
    let py = random(80, 520);
    activePowerUp = new PowerUp(type, px, py);
  }

  if (activePowerUp) {
    activePowerUp.update();
    activePowerUp.display();
    if (dist(player.x, player.y, activePowerUp.x, activePowerUp.y) < 18) {
      activeEffects[activePowerUp.type] = POWERUP_DURATION;
      spawnBurst(activePowerUp.x, activePowerUp.y, activePowerUp.col);
      activePowerUp = null;
    } else if (activePowerUp.life <= 0) {
      activePowerUp = null;
    }
  }
}

// ---- particles --------------------------------------------------------
function spawnAmbientParticles() {
  let room = ROOMS[currentRoomIndex];
  if (room.biomeType === 'rainforest') {
    if (frameCount % 6 === 0) {
      particles.push(new Particle(
        random(width), height + 10, room.particleColor,
        { vx: random(-0.15, 0.15), vy: random(-1.1, -0.4), size: random(2, 3), life: 180, decay: 0.6 }
      ));
    }
  } else {
    if (frameCount % 4 === 0) {
      particles.push(new Particle(
        random(width), random(height), room.particleColor,
        { vx: random(-0.1, 0.1), vy: random(-0.05, 0.05), size: random(1, 2), life: 200, decay: 1.1 }
      ));
    }
  }
}

function spawnBurst(x, y, col) {
  for (let i = 0; i < 24; i++) {
    let a = random(360);
    let sp = random(1, 4);
    particles.push(new Particle(
      x, y, col,
      { vx: cos(a) * sp, vy: sin(a) * sp, size: random(2, 4), life: 255, decay: random(4, 8), flowSteered: false }
    ));
  }
}

function updateAndDisplayParticles() {
  for (let i = particles.length - 1; i >= 0; i--) {
    let p = particles[i];
    p.update();
    p.display();
    if (p.isDead() || p.y < -10) particles.splice(i, 1);
  }
}

// ---- interaction --------------------------------------------------------
function mousePressed() {
  if (gameState !== 'playing') return;

  if (inSecretVignette) { inSecretVignette = false; return; }

  if (gameEnded) {
    loadRoom(0);
    inventory = 0;
    gameEnded = false;
    return;
  }

  for (let i = 0; i < materials.length; i++) {
    let mx = MATERIAL_TRAY_X + i * MATERIAL_GAP;
    let my = MATERIAL_TRAY_Y;
    if (dist(mouseX, mouseY, mx, my) < 10) {
      heldMaterialIdx = i;
      return;
    }
  }

  if (secretGlyphObj && secretGlyphObj.hit(mouseX, mouseY)) {
    let keyIdx = materials.findIndex(m => m.kind === 'key');
    if (keyIdx !== -1) {
      materials.splice(keyIdx, 1);
      secretGlyphObj.opened = true;
      enterSecretRoom(ROOMS[currentRoomIndex].secretText);
    }
    return;
  }

  for (let w of walls) {
    if (w.hit(mouseX, mouseY) && inventory > 0) {
      w.broken = true;
      inventory--;
      for (let p of portals) if (p.x === w.x && p.y === w.y) p.blocked = false;
      spawnBurst(w.x, w.y, [255, 90, 90]);
      crackFlash = 100;
      return;
    }
  }

  let best = null;
  let bestD = 20;
  for (let s of shards) {
    if (s.locked || s.wild) continue;
    let d = dist(mouseX, mouseY, s.x, s.y);
    if (d < bestD) {
      bestD = d;
      best = s;
    }
  }
  held = best;
}

function mouseReleased() {
  if (heldMaterialIdx !== null) {
    let target = null;
    for (let i = 0; i < materials.length; i++) {
      if (i === heldMaterialIdx) continue;
      let mx = MATERIAL_TRAY_X + i * MATERIAL_GAP;
      let my = MATERIAL_TRAY_Y;
      if (dist(mouseX, mouseY, mx, my) < 10) { target = i; break; }
    }
    if (target !== null) combineMaterials(heldMaterialIdx, target);
    heldMaterialIdx = null;
    return;
  }

  if (!held) return;
  for (let p of portals) {
    if (!p.blocked && p.matches(held) && dist(held.x, held.y, p.x, p.y) < 24) {
      held.lockTo(p);
      p.filled = true;
      solved++;
      crackFlash = 120;
      spawnBurst(p.x, p.y, p.col);
      break;
    }
  }
  held = null;
}

// ============================== classes ====================================

class Block {
  constructor(x, y) {
    this.origX = x; this.origY = y; this.x = x; this.y = y;
    this.angle = 0; this.c = 70;
  }
  display() {
    push();
    noFill();
    let factor = map(this.c, 70, 255, 0.35, 1);
    stroke(gridColor[0] * factor, gridColor[1] * factor, gridColor[2] * factor);
    translate(this.x, this.y);
    rotate(this.angle);
    let nSize = noise(this.origX * 0.005, this.origY * 0.005, frameCount * 0.01);
    let sizeVariation = map(nSize, 0, 1, -10, 10);
    rect(0, 0, size - offset + sizeVariation, size - offset + sizeVariation);
    pop();
  }
  move() {
    let t = flowTime();
    let a = flowAngle(this.origX, this.origY, t);
    let mag = currentGridJitter();
    this.x = this.origX + cos(a) * mag;
    this.y = this.origY + sin(a) * mag;

    let distance;
    if (pmouseX - mouseX !== 0 || pmouseY - mouseY !== 0) {
      distance = dist(mouseX, mouseY, this.x, this.y);
      if (distance < distMouse) { this.angle += 1; this.c = 255; }
    }
    if (this.angle > 0 && this.angle < 90) {
      this.angle += 1;
      if (this.c > 70) this.c -= 3;
    } else {
      this.angle = 0; this.c = 70;
    }
  }
}

class Portal {
  constructor(x, y, col) {
    this.x = x; this.y = y; this.col = col;
    this.filled = false; this.blocked = false; this.spin = 0;
    this.driftCfg = null;
  }
  update() {
    if (this.driftCfg) {
      let c = this.driftCfg;
      let ang = frameCount * c.speed + c.phase;
      this.x = c.cx + cos(ang) * c.r;
      this.y = c.cy + sin(ang) * c.r;
    }
  }
  display() {
    push();
    translate(this.x, this.y);
    this.spin += this.filled ? 3 : 0.6;
    rotate(this.spin);
    noFill();
    strokeWeight(2);
    let [r, g, b] = this.col;
    let a = this.filled ? 255 : (this.blocked ? 70 : 140);
    stroke(r, g, b, a);
    rect(0, 0, 30, 30);
    rotate(45);
    stroke(r, g, b, a * 0.6);
    rect(0, 0, 22, 22);
    pop();
  }
  matches(shard) { return shard.col === this.col; }
}

class Shard {
  constructor(x, y, col, wild = false) {
    this.x = x; this.y = y; this.col = col;
    this.locked = false; this.t = random(1000);
    this.wild = wild;
  }
  update() { this.t += 0.05; }
  display() {
    push();
    translate(this.x, this.y);
    let [r, g, b] = this.col;

    if (this.wild) {
      if (noise(this.t * 2) < 0.18) { pop(); return; } // flickers — it doesn't quite belong here
      rotate(this.t * 40);
      noStroke();
      let pulse = 170 + 80 * sin(this.t * 5);
      for (let s = 12; s > 0; s -= 4) {
        fill(r, g, b, map(s, 0, 12, 120, 20));
        hexagon(0, 0, s);
      }
      fill(r, g, b, pulse);
      hexagon(0, 0, 5);
      pop();
      return;
    }

    rotate(this.t * 20);
    noStroke();
    let pulse = this.locked ? 255 : 180 + 60 * sin(this.t * 3);
    for (let s = 14; s > 0; s -= 4) {
      fill(r, g, b, map(s, 0, 14, 120, 20));
      rect(0, 0, s, s);
    }
    fill(r, g, b, pulse);
    rect(0, 0, 5, 5);
    pop();
  }
  lockTo(portal) { this.x = portal.x; this.y = portal.y; this.locked = true; }
}

class Wall {
  constructor(x, y) { this.x = x; this.y = y; this.broken = false; this.jit = 0; }
  display() {
    if (this.broken) return;
    push();
    translate(this.x, this.y);
    this.jit += 1;
    noFill();
    strokeWeight(2);
    stroke(255, 70, 70, 210);
    for (let i = 0; i < 4; i++) {
      let ox = sin(this.jit * 13 + i * 40) * 3;
      let oy = cos(this.jit * 17 + i * 40) * 3;
      rect(ox, oy, 52 - i * 8, 52 - i * 8);
    }
    pop();
  }
  hit(mx, my) { return !this.broken && dist(mx, my, this.x, this.y) < 30; }
}

class Relic {
  constructor(x, y) { this.x = x; this.y = y; this.t = 0; }
  display() {
    push();
    translate(this.x, this.y);
    this.t += 4;
    rotate(this.t);
    noFill();
    strokeWeight(2);
    stroke(255, 220, 120);
    rect(0, 0, 16, 16);
    rotate(45);
    rect(0, 0, 10, 10);
    pop();
  }
}

class Firefly {
  constructor(x, y) {
    this.x = x; this.y = y;
    this.target = { x, y };
    this.t = random(1000);
  }
  setTarget(x, y) { this.target = { x, y }; }
  update() {
    this.t += 0.05;
    let wobbleX = sin(this.t * 3) * 6;
    let wobbleY = cos(this.t * 2.4) * 6;
    this.x = lerp(this.x, this.target.x + wobbleX, 0.02);
    this.y = lerp(this.y, this.target.y + wobbleY, 0.02);
  }
  display() {
    push();
    translate(this.x, this.y);
    noStroke();
    for (let r = 16; r > 0; r -= 4) {
      fill(255, 220, 150, map(r, 0, 16, 100, 8));
      rect(0, 0, r, r);
    }
    fill(255, 245, 220);
    rect(0, 0, 5, 5);
    pop();
  }
}

class Debris {
  constructor(biomeType, col) {
    let edge = floor(random(4));
    if (edge === 0) { this.x = -20; this.y = random(height); }
    else if (edge === 1) { this.x = width + 20; this.y = random(height); }
    else if (edge === 2) { this.x = random(width); this.y = -20; }
    else { this.x = random(width); this.y = height + 20; }

    this.vx = 0; this.vy = 0;
    this.size = random(10, 20);
    this.rot = random(360);
    this.rotSpeed = random(-1.5, 1.5);
    this.biomeType = biomeType;
    this.col = col;

    let n = biomeType === 'rainforest' ? 6 : 7;
    this.pts = [];
    for (let i = 0; i < n; i++) {
      let ang = (360 / n) * i;
      let rFactor = biomeType === 'rainforest' ? (i % 2 === 0 ? 1 : 0.5) : random(0.6, 1);
      this.pts.push({ ang, rFactor });
    }
  }
  update() {
    let t = flowTime();
    let a = flowAngle(this.x, this.y, t);
    let slowMult = activeEffects.slow > 0 ? 0.3 : 1;
    let pushForce = map(effectiveInstability(), 0, 1, 0.03, 0.12) * slowMult;
    this.vx += cos(a) * pushForce;
    this.vy += sin(a) * pushForce;
    this.vx *= 0.99; this.vy *= 0.99;
    this.x += this.vx * slowMult;
    this.y += this.vy * slowMult;
    this.rot += this.rotSpeed * slowMult;
  }
  offscreen() { return this.x < -50 || this.x > width + 50 || this.y < -50 || this.y > height + 50; }
  display() {
    push();
    translate(this.x, this.y);
    rotate(this.rot);
    noFill();
    strokeWeight(1.5);
    stroke(this.col[0], this.col[1], this.col[2], 190);
    beginShape();
    for (let pt of this.pts) {
      let r = this.size * pt.rFactor;
      vertex(cos(pt.ang) * r, sin(pt.ang) * r);
    }
    endShape(CLOSE);
    pop();
  }
}

class PowerUp {
  constructor(type, x, y) {
    this.type = type; this.x = x; this.y = y;
    this.t = random(1000); this.life = 480;
    if (type === 'speed') { this.col = [255, 215, 80]; this.glyph = '>>'; }
    else if (type === 'slow') { this.col = [120, 200, 255]; this.glyph = 'SL'; }
    else { this.col = [255, 120, 220]; this.glyph = 'SH'; }
  }
  update() {
    this.t += 0.06;
    this.life--;
    this.y += sin(this.t * 40) * 0.15;
  }
  display() {
    push();
    translate(this.x, this.y);
    let pulse = 180 + 70 * sin(this.t * 4);
    noFill();
    strokeWeight(2);
    stroke(this.col[0], this.col[1], this.col[2], pulse);
    rotate(this.t * 30);
    rect(0, 0, 20, 20);
    pop();

    push();
    translate(this.x, this.y);
    noStroke();
    fill(this.col[0], this.col[1], this.col[2], 230);
    textAlign(CENTER, CENTER);
    textSize(8);
    text(this.glyph, 0, 1);
    pop();
  }
}

class Particle {
  constructor(x, y, col, opts = {}) {
    this.x = x; this.y = y; this.col = col;
    this.vx = opts.vx !== undefined ? opts.vx : random(-0.3, 0.3);
    this.vy = opts.vy !== undefined ? opts.vy : random(-0.6, -0.2);
    this.size = opts.size || random(2, 4);
    this.life = opts.life || 255;
    this.decay = opts.decay || random(1.5, 3);
    this.flowSteered = opts.flowSteered !== undefined ? opts.flowSteered : true;
  }
  update() {
    if (this.flowSteered) {
      let t = flowTime();
      let a = flowAngle(this.x, this.y, t);
      let push = map(effectiveInstability(), 0, 1, 0.012, 0.05);
      this.vx += cos(a) * push;
      this.vy += sin(a) * push;
      this.vx *= 0.98; this.vy *= 0.98;
    }
    this.x += this.vx;
    this.y += this.vy;
    this.life -= this.decay;
  }
  isDead() { return this.life <= 0; }
  display() {
    push();
    noStroke();
    let [r, g, b] = this.col;
    fill(r, g, b, this.life);
    rect(this.x, this.y, this.size, this.size);
    pop();
  }
}

// ============================== crafting / secrets ==========================

function hexagon(cx, cy, r) {
  beginShape();
  for (let i = 0; i < 6; i++) {
    let a = i * 60;
    vertex(cx + cos(a) * r, cy + sin(a) * r);
  }
  endShape(CLOSE);
}

class SecretGlyph {
  constructor(x, y) {
    this.x = x; this.y = y; this.t = 0; this.opened = false;
  }
  display() {
    if (this.opened) return;
    let hasKey = materials.some(m => m.kind === 'key');
    if (!hasKey) return; // doesn't exist to you until you're carrying something to open it with
    push();
    translate(this.x, this.y);
    this.t += 1;
    let near = dist(player.x, player.y, this.x, this.y) < 90;
    let a = near ? 200 + 55 * sin(this.t * 4) : 90;
    noFill();
    strokeWeight(1);
    stroke(230, 210, 255, a);
    rotate(this.t * 0.6);
    for (let k = 0; k < 3; k++) hexagon(0, 0, 9 + k * 6);
    pop();
  }
  hit(mx, my) {
    return !this.opened && dist(mx, my, this.x, this.y) < 24;
  }
}

function handleWildShardPickup() {
  for (let i = shards.length - 1; i >= 0; i--) {
    let s = shards[i];
    if (s.wild && dist(player.x, player.y, s.x, s.y) < 18) {
      materials.push({ id: materialIdCounter++, col: WILD_COLOR, kind: 'wild' });
      spawnBurst(s.x, s.y, WILD_COLOR);
      shards.splice(i, 1);
    }
  }
}

function combineMaterials(i, j) {
  let hi = max(i, j), lo = min(i, j);
  let dropX = MATERIAL_TRAY_X + hi * MATERIAL_GAP;
  let dropY = MATERIAL_TRAY_Y;
  materials.splice(hi, 1);
  materials.splice(lo, 1);
  materials.push({ id: materialIdCounter++, col: KEY_COLOR, kind: 'key' });
  spawnBurst(dropX, dropY, KEY_COLOR);
  spawnBurst(dropX, dropY, KEY_COLOR);
  triggerShake(5);
  craftMessage = "A KEY TAKES SHAPE";
  craftMessageTimer = 100;
}

function drawMaterialsTray() {
  if (materials.length === 0) return;
  push();
  noStroke();
  textAlign(LEFT, TOP);
  textSize(8);
  fill(180, 200, 220, 140);
  text("MATERIALS — drag one onto another to combine", MATERIAL_TRAY_X, MATERIAL_TRAY_Y - 16);

  for (let i = 0; i < materials.length; i++) {
    if (i === heldMaterialIdx) continue; // drawn last, on top
    drawMaterialIcon(materials[i], MATERIAL_TRAY_X + i * MATERIAL_GAP, MATERIAL_TRAY_Y);
  }
  if (heldMaterialIdx !== null && materials[heldMaterialIdx]) {
    drawMaterialIcon(materials[heldMaterialIdx], mouseX, mouseY);
  }
  pop();
}

function drawMaterialIcon(m, x, y) {
  push();
  translate(x, y);
  rotate(frameCount * 1.5);
  noFill();
  strokeWeight(1.5);
  let [r, g, b] = m.col;
  stroke(r, g, b, 220);
  if (m.kind === 'key') {
    rect(0, 0, 11, 11);
    rotate(45);
    rect(0, 0, 6, 6);
  } else {
    hexagon(0, 0, 7);
  }
  pop();
}

function enterSecretRoom(text) {
  inSecretVignette = true;
  secretVignetteText = text || "the void keeps something back, even here.";
  PLAYER_MAX_HP = min(PLAYER_MAX_HP + 1, 5);
  player.hp = PLAYER_MAX_HP;
  triggerShake(6);
}

function drawSecretVignette() {
  push();
  noStroke();
  fill(6, 7, 10, 235);
  rect(width / 2, height / 2, width, height);

  push();
  translate(width / 2, height / 2 - 70);
  noFill();
  strokeWeight(1);
  stroke(230, 210, 255, 180 + 60 * sin(frameCount * 3));
  for (let k = 0; k < 3; k++) hexagon(0, 0, 14 + k * 8);
  pop();

  textAlign(CENTER, CENTER);
  fill(210, 230, 255, 230);
  textSize(11);
  text(secretVignetteText, width / 2, height / 2 + 20, width - 160);
  textSize(9);
  fill(120, 255, 170, 200);
  text("you feel steadier now.", width / 2, height / 2 + 78);
  fill(150, 170, 190, 180);
  text("(click to return)", width / 2, height / 2 + 100);
  pop();
}
