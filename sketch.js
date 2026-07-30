/* ==========================================================================
   VOID // VERSE
   --------------------------------------------------------------------------
   Follow the mystic light -> fall through the seam -> four rooms of the void.
   Match shards to portals, dodge what drifts, and pocket the loose light that
   was never part of the puzzle. Combine what you pocket. What you carry when
   the last wall gives decides how this ends.
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

// ---------- crafting ----------
// Two raw materials fall loose in the void, one flavour per biome. Everything
// else is something you made. Each crafted thing does its work just by being
// carried — there is no "use" button, only what you chose to hold.
const MATERIAL_TYPES = {
  mote:    { col: [140, 255, 190], label: 'MOTE',    note: 'living light, from the green rooms' },
  cinder:  { col: [190, 150, 255], label: 'CINDER',  note: 'dead star matter, from the cold rooms' },
  bloom:   { col: [120, 255, 175], label: 'BLOOM',   note: 'mends you, slowly, while you hold it' },
  key:     { col: [255, 210, 110], label: 'KEY',     note: 'opens what the void hid' },
  lantern: { col: [255, 240, 180], label: 'LANTERN', note: 'reveals the hidden — and calms the drift' },
  seed:    { col: [255, 255, 225], label: 'SEED',    note: 'something that could still grow' },
};

const RECIPES = [
  { a: 'mote',  b: 'mote',    out: 'bloom' },
  { a: 'cinder', b: 'cinder', out: 'key' },
  { a: 'mote',  b: 'cinder',  out: 'lantern' },
  { a: 'bloom', b: 'lantern', out: 'seed' },
];

let materials = [];        // { id, kind }
let materialIdCounter = 0;
let heldMaterialIdx = null;
let discoveredRecipes = [];
let bloomTimer = 0;

const MATERIAL_TRAY_X = 22;
const MATERIAL_TRAY_Y = 84;
const MATERIAL_GAP = 22;

function hasMaterial(kind) { return materials.some(m => m.kind === kind); }
function matCol(kind) { return MATERIAL_TYPES[kind].col; }

// ---------- secrets ----------
let secretGlyphObj = null;
let inSecretVignette = false;
let secretVignetteText = "";

// ---------- craft feedback ----------
let craftMessage = "";
let craftMessageSub = "";
let craftMessageTimer = 0;
let craftMessageCol = [255, 210, 110];

// ---------- game state ----------
let gameState = 'intro'; // 'intro' | 'playing' | 'finale'

// ---------- finale ----------
// Paced in milliseconds, not frames — this gets shown on machines I can't test,
// and the ending should breathe the same on all of them.
let finalePhase = 'hush';
let finalePhaseStart = 0;
let finaleSeed = false;   // locked in the moment the last wall gives
let finaleFireflies = [];
const HUSH_MS = 2000;
const UNRAVEL_MS = 3800;

function phaseMs() { return millis() - finalePhaseStart; }
// 1.0 at 60fps; scales motion so the unravel drifts at one speed everywhere.
function dtScale() { return constrain(deltaTime, 8, 50) / 16.67; }

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
    // Portals slowly orbit their anchor, so a drop has to be timed against
    // motion instead of aimed at a fixed target.
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
    secretGlyph: { x: 300, y: 120 },
    secretText: "the canopy keeps a hollow where the mist pools. something small sleeps in it, and it is not afraid of you.",
  },
  {
    // Two walls — this room can't be solved on a single fragment. It rewards
    // conserving fragments from earlier rooms.
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

function fullReset() {
  PLAYER_MAX_HP = 3;
  player.hp = 3;
  materials = [];
  discoveredRecipes = [];
  inventory = 0;
  gameEnded = false;
  gameState = 'playing';
  for (let i = 0; i < cols; i++) {
    for (let j = 0; j < rows; j++) blocks[i][j].reset();
  }
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

  // Two loose ones per room, flavoured by the biome. They match no portal —
  // they're only good for what you decide to make out of them.
  let wildKind = room.biomeType === 'rainforest' ? 'mote' : 'cinder';
  let baseAng = random(360);
  for (let k = 0; k < 2; k++) {
    let ang = baseAng + 180 * k + random(-40, 40);
    let r = random(190, 240);
    let wx = constrain(width / 2 + cos(ang) * r, 40, width - 40);
    let wy = constrain(height / 2 + sin(ang) * r, 40, height - 40);
    shards.push(new Shard(wx, wy, matCol(wildKind), wildKind));
  }

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

  if (gameState === 'finale') {
    drawFinale();
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
  updateCarriedEffects();
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

  drawCraftMessage();
  drawHUD();

  if (transitioning) {
    push(); noStroke(); fill(0, transitionAlpha); rect(width / 2, height / 2, width, height); pop();

    if (transitionPhase === 'out') {
      transitionAlpha += 8;
      if (transitionAlpha >= 255) {
        if (pendingEnd) {
          beginFinale();
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

// ============================== finale =====================================
// The grid has been the void's cage for the whole game. Here it comes apart.
// What it comes apart *into* depends on whether you made something that could
// still grow, or just made it out.

function beginFinale() {
  gameState = 'finale';
  finalePhase = 'hush';
  finalePhaseStart = millis();
  finaleSeed = hasMaterial('seed');
  finaleFireflies = [];
  transitioning = false;
  transitionAlpha = 0;
  held = null;
  heldMaterialIdx = null;
  debris = [];
  particles = [];
}

function releaseGrid() {
  for (let i = 0; i < cols; i++) {
    for (let j = 0; j < rows; j++) {
      // Only half the grid lifts; the rest dims out so the screen can breathe.
      if ((i + j) % 2 === 0) blocks[i][j].release(finaleSeed);
      else blocks[i][j].dissolve();
    }
  }
}

function drawFinale() {
  let t = phaseMs();

  if (finalePhase === 'hush') {
    if (t < 40) triggerShake(10);
    updatePlayer();
    displayPlayer();

    push();
    textAlign(CENTER, CENTER);
    let a = constrain(map(t, 0, 700, 0, 220), 0, 220);
    fill(210, 230, 255, a);
    textSize(13);
    text("the last wall gives.", width / 2, height / 2);
    pop();

    if (t > HUSH_MS) {
      finalePhase = 'unravel';
      finalePhaseStart = millis();
      releaseGrid();
      triggerShake(16);
    }
    return;
  }

  if (finalePhase === 'unravel') {
    updatePlayer();
    displayPlayer();

    if (finaleSeed) {
      // The lifted grid keeps rising as warm light. Seed the sky with more.
      if (frameCount % 2 === 0 && finaleFireflies.length < 150) {
        finaleFireflies.push(new EndFirefly(random(width), height + random(10, 120)));
      }
    }
    for (let f of finaleFireflies) { f.update(); f.display(); }

    push();
    textAlign(CENTER, CENTER);
    let a = constrain(map(t, 400, 1600, 0, 200), 0, 200);
    fill(210, 230, 255, a * 0.8);
    textSize(11);
    text(finaleSeed ? "it doesn't collapse. it lets go."
                    : "the grid comes apart, and keeps nothing.",
         width / 2, height - 60);
    pop();

    if (t > UNRAVEL_MS) { finalePhase = 'reveal'; finalePhaseStart = millis(); }
    return;
  }

  // ---- reveal ----
  if (finaleSeed && frameCount % 4 === 0 && finaleFireflies.length < 150) {
    finaleFireflies.push(new EndFirefly(random(width), height + random(10, 60)));
  }
  for (let f of finaleFireflies) { f.update(); f.display(); }

  if (finaleSeed) {
    // The light from the very first scene comes back, and waits.
    if (!firefly) firefly = new Firefly(width / 2, height / 2);
    firefly.setTarget(width / 2, height / 2 - 40);
    firefly.update();
    firefly.display();
  }

  updatePlayer();
  displayPlayer();

  push();
  textAlign(CENTER, CENTER);
  let a = constrain(map(t, 200, 1000, 0, 255), 0, 255);

  if (finaleSeed) {
    fill(255, 245, 210, a);
    textSize(14);
    text("you didn't break the matrix.", width / 2, height / 2 + 60);
    let a2 = constrain(map(t, 1300, 2100, 0, 255), 0, 255);
    fill(180, 255, 210, a2);
    textSize(14);
    text("you let the forest back in.", width / 2, height / 2 + 88);
    let a3 = constrain(map(t, 2600, 3400, 0, 190), 0, 190);
    fill(200, 220, 240, a3);
    textSize(10);
    text("the light was never leading you away from home.", width / 2, height / 2 + 128);
  } else {
    fill(220, 230, 245, a);
    textSize(14);
    text("you got out.", width / 2, height / 2 + 60);
    let a2 = constrain(map(t, 1300, 2100, 0, 235), 0, 235);
    fill(190, 200, 220, a2);
    textSize(12);
    text("you're not sure what you left in there.", width / 2, height / 2 + 88);
    let a3 = constrain(map(t, 2600, 3400, 0, 175), 0, 175);
    fill(230, 210, 255, a3);
    textSize(10);
    text("something could have grown, if you'd carried it out.", width / 2, height / 2 + 128);
  }

  let a4 = constrain(map(t, 3800, 4500, 0, 160), 0, 160);
  fill(150, 170, 190, a4);
  textSize(9);
  text("(click to wander again)", width / 2, height - 40);
  pop();

  if (t > 4000) gameEnded = true;
}

class EndFirefly {
  constructor(x, y) {
    this.x = x; this.y = y;
    this.t = random(1000);
    this.vy = random(-0.7, -0.25);
    this.sz = random(3, 6);
    this.hueShift = random(-30, 30);
  }
  update() {
    this.t += 0.05;
    this.y += this.vy;
    this.x += sin(this.t * 40) * 0.4;
    if (this.y < -20) { this.y = height + 20; this.x = random(width); }
  }
  display() {
    push();
    translate(this.x, this.y);
    noStroke();
    let pulse = 150 + 105 * sin(this.t * 90);
    for (let r = this.sz * 3; r > 0; r -= 3) {
      fill(255, 225 + this.hueShift * 0.2, 150, map(r, 0, this.sz * 3, 70, 5));
      rect(0, 0, r, r);
    }
    fill(255, 248, 210, pulse);
    rect(0, 0, this.sz * 0.7, this.sz * 0.7);
    pop();
  }
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
  if (hasMaterial('lantern')) { fill(255, 240, 180, 200); text("LANTERN LIT", width - 14, ey); ey += 14; }
  if (hasMaterial('bloom'))   { fill(120, 255, 175, 200); text("BLOOM MENDING", width - 14, ey); ey += 14; }
  if (hasMaterial('seed'))    { fill(255, 255, 225, 220); text("SEED CARRIED", width - 14, ey); ey += 14; }

  let unbrokenWalls = walls.filter(w => !w.broken).length;
  let msg = "";
  if (unbrokenWalls > 0) {
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

  if (secretGlyphObj && !secretGlyphObj.opened && (hasMaterial('key') || hasMaterial('lantern'))) {
    fill(230, 210, 255, 130);
    textSize(9);
    text(hasMaterial('key') ? "something answers, faintly"
                            : "the lantern shows it — but it stays shut without a key",
         width / 2, height - 27);
  }

  drawMaterialsTray();
  drawRecipeBook();
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

  // Carrying the seed changes how you look, everywhere, for the rest of the run.
  let seedGlow = hasMaterial('seed');
  for (let r = 18; r > 0; r -= 4) {
    if (seedGlow) fill(255, 250, 210, map(r, 0, 18, 110, 8));
    else fill(180, 255, 220, map(r, 0, 18, 90, 6));
    rect(0, 0, r, r);
  }
  fill(255);
  rect(0, 0, 6, 6);

  if (seedGlow) {
    noFill();
    strokeWeight(1);
    stroke(255, 245, 200, 70 + 50 * sin(frameCount * 3));
    rect(0, 0, 30 + 3 * sin(frameCount * 2), 30 + 3 * sin(frameCount * 2));
  }
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

// What you're carrying works on its own, without being spent.
function updateCarriedEffects() {
  if (hasMaterial('bloom')) {
    bloomTimer++;
    if (bloomTimer >= 600) {          // ~10s
      bloomTimer = 0;
      if (player.hp < PLAYER_MAX_HP) {
        player.hp++;
        spawnBurst(player.x, player.y, matCol('bloom'));
      }
    }
  } else {
    bloomTimer = 0;
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
  if (gameState === 'finale') {
    if (gameEnded) { fullReset(); }
    return;
  }
  if (gameState !== 'playing') return;

  if (inSecretVignette) { inSecretVignette = false; return; }

  for (let i = 0; i < materials.length; i++) {
    let mx = MATERIAL_TRAY_X + i * MATERIAL_GAP;
    let my = MATERIAL_TRAY_Y;
    if (dist(mouseX, mouseY, mx, my) < 11) {
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
      if (dist(mouseX, mouseY, mx, my) < 11) { target = i; break; }
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
    this.released = false; this.warm = false; this.fading = false;
    this.vx = 0; this.vy = 0; this.alpha = 255; this.spin = 0;
  }
  reset() {
    this.x = this.origX; this.y = this.origY;
    this.angle = 0; this.c = 70;
    this.released = false; this.warm = false; this.fading = false;
    this.vx = 0; this.vy = 0; this.alpha = 255; this.spin = 0;
  }
  release(warm) {
    this.released = true;
    this.warm = warm;
    this.spin = random(-3, 3);
    if (warm) {
      // lifts, like it was never a wall
      this.vx = random(-0.3, 0.3);
      this.vy = random(-1.6, -0.5);
    } else {
      // falls out from under itself
      this.vx = random(-0.4, 0.4);
      this.vy = random(0.4, 1.5);
    }
  }
  dissolve() { this.fading = true; }
  display() {
    push();
    noFill();
    if (this.released) {
      let a = this.alpha;
      if (this.warm) stroke(255, 225, 160, a);
      else stroke(90, 95, 110, a * 0.8);
    } else if (this.fading) {
      stroke(gridColor[0] * 0.35, gridColor[1] * 0.35, gridColor[2] * 0.35, this.alpha);
    } else {
      let factor = map(this.c, 70, 255, 0.35, 1);
      stroke(gridColor[0] * factor, gridColor[1] * factor, gridColor[2] * factor);
    }
    translate(this.x, this.y);
    rotate(this.angle);
    let nSize = noise(this.origX * 0.005, this.origY * 0.005, frameCount * 0.01);
    let sizeVariation = map(nSize, 0, 1, -10, 10);
    rect(0, 0, size - offset + sizeVariation, size - offset + sizeVariation);
    pop();
  }
  move() {
    if (this.released) {
      let d = dtScale();
      this.x += this.vx * d;
      this.y += this.vy * d;
      this.angle += this.spin * d;
      if (this.warm) {
        this.x += sin(frameCount * 2 + this.origX) * 0.15 * d;
        this.alpha = max(0, this.alpha - 0.5 * d);
      } else {
        this.vy += 0.02 * d;
        this.alpha = max(0, this.alpha - 1.0 * d);
      }
      return;
    }
    if (this.fading) {
      this.alpha = max(0, this.alpha - 2.0 * dtScale());
      return;
    }

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
  // `wildKind` is falsy for ordinary puzzle shards, or a material key
  // ('mote' / 'cinder') for the loose ones that match no portal.
  constructor(x, y, col, wildKind = null) {
    this.x = x; this.y = y; this.col = col;
    this.locked = false; this.t = random(1000);
    this.wild = !!wildKind;
    this.wildKind = wildKind;
  }
  update() { this.t += 0.05; }
  display() {
    push();
    translate(this.x, this.y);
    let [r, g, b] = this.col;

    if (this.wild) {
      if (noise(this.t * 2) < 0.15) { pop(); return; } // flickers — it doesn't quite belong here
      rotate(this.t * 40);
      noStroke();
      let pulse = 170 + 80 * sin(this.t * 5);
      for (let s = 12; s > 0; s -= 4) {
        fill(r, g, b, map(s, 0, 12, 120, 20));
        if (this.wildKind === 'cinder') triangleGlyph(0, 0, s);
        else hexagon(0, 0, s);
      }
      fill(r, g, b, pulse);
      if (this.wildKind === 'cinder') triangleGlyph(0, 0, 5);
      else hexagon(0, 0, 5);
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
    if (hasMaterial('lantern')) slowMult *= 0.75; // a lit lantern steadies the drift
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

function triangleGlyph(cx, cy, r) {
  beginShape();
  for (let i = 0; i < 3; i++) {
    let a = i * 120 - 90;
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
    // It isn't there until you're carrying something that could find it.
    if (!hasMaterial('key') && !hasMaterial('lantern')) return;
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
    if (s.wild && dist(player.x, player.y, s.x, s.y) < 19) {
      materials.push({ id: materialIdCounter++, kind: s.wildKind });
      spawnBurst(s.x, s.y, matCol(s.wildKind));
      showCraftMessage(MATERIAL_TYPES[s.wildKind].label + " POCKETED",
                       MATERIAL_TYPES[s.wildKind].note, matCol(s.wildKind));
      shards.splice(i, 1);
    }
  }
}

function findRecipe(kindA, kindB) {
  return RECIPES.find(r =>
    (r.a === kindA && r.b === kindB) || (r.a === kindB && r.b === kindA));
}

function combineMaterials(i, j) {
  let kindA = materials[i].kind;
  let kindB = materials[j].kind;
  let recipe = findRecipe(kindA, kindB);

  if (!recipe) {
    showCraftMessage("THEY WON'T JOIN",
      MATERIAL_TYPES[kindA].label + " + " + MATERIAL_TYPES[kindB].label + " — try another pair",
      [200, 120, 120]);
    return;
  }

  let hi = max(i, j), lo = min(i, j);
  let dropX = MATERIAL_TRAY_X + hi * MATERIAL_GAP;
  let dropY = MATERIAL_TRAY_Y;
  materials.splice(hi, 1);
  materials.splice(lo, 1);
  materials.push({ id: materialIdCounter++, kind: recipe.out });

  let outCol = matCol(recipe.out);
  spawnBurst(dropX, dropY, outCol);
  spawnBurst(dropX, dropY, outCol);
  spawnBurst(player.x, player.y, outCol);
  triggerShake(recipe.out === 'seed' ? 12 : 5);
  crackFlash = recipe.out === 'seed' ? 110 : 40;

  let label = MATERIAL_TYPES[kindA].label + " + " + MATERIAL_TYPES[kindB].label +
              " → " + MATERIAL_TYPES[recipe.out].label;
  if (!discoveredRecipes.includes(label)) discoveredRecipes.push(label);

  if (recipe.out === 'seed') {
    showCraftMessage("A SEED. IT'S WARM.",
      "carry it to the last wall and don't let go", outCol);
  } else {
    showCraftMessage(MATERIAL_TYPES[recipe.out].label + " TAKES SHAPE",
      MATERIAL_TYPES[recipe.out].note, outCol);
  }
}

function showCraftMessage(msg, sub, col) {
  craftMessage = msg;
  craftMessageSub = sub || "";
  craftMessageCol = col || [255, 210, 110];
  craftMessageTimer = 130;
}

function drawCraftMessage() {
  if (craftMessageTimer <= 0) return;
  push();
  textAlign(CENTER, CENTER);
  let a = map(craftMessageTimer, 0, 130, 0, 240, true);
  let [r, g, b] = craftMessageCol;
  fill(r, g, b, a);
  textSize(13);
  text(craftMessage, width / 2, height / 2 + 66);
  if (craftMessageSub) {
    fill(r, g, b, a * 0.65);
    textSize(9);
    text(craftMessageSub, width / 2, height / 2 + 86);
  }
  pop();
  craftMessageTimer--;
}

function drawMaterialsTray() {
  push();
  noStroke();
  textAlign(LEFT, TOP);
  textSize(8);
  fill(180, 200, 220, materials.length ? 150 : 90);
  text(materials.length
        ? "CARRYING — drag one onto another"
        : "CARRYING — nothing yet",
       MATERIAL_TRAY_X - 2, MATERIAL_TRAY_Y - 17);

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
  let [r, g, b] = matCol(m.kind);

  // soft halo so items read against a busy grid
  noStroke();
  for (let s = 20; s > 0; s -= 5) {
    fill(r, g, b, map(s, 0, 20, 40, 6));
    rect(0, 0, s, s);
  }

  rotate(frameCount * 1.5);
  noFill();
  strokeWeight(1.5);
  stroke(r, g, b, 235);

  switch (m.kind) {
    case 'mote':    hexagon(0, 0, 7); break;
    case 'cinder':  triangleGlyph(0, 0, 8); break;
    case 'bloom':
      for (let k = 0; k < 3; k++) { rotate(40); rect(0, 0, 11, 5); }
      break;
    case 'key':
      rect(0, 0, 11, 11); rotate(45); rect(0, 0, 6, 6);
      break;
    case 'lantern':
      rect(0, 0, 12, 12);
      strokeWeight(1);
      stroke(r, g, b, 150);
      rect(0, 0, 18, 18);
      break;
    case 'seed':
      strokeWeight(2);
      hexagon(0, 0, 8);
      stroke(r, g, b, 140 + 80 * sin(frameCount * 5));
      hexagon(0, 0, 13);
      break;
  }
  pop();
}

function drawRecipeBook() {
  if (discoveredRecipes.length === 0) return;
  push();
  noStroke();
  textAlign(LEFT, BOTTOM);
  textSize(8);
  let y = height - 16 - (discoveredRecipes.length - 1) * 11;
  fill(150, 170, 195, 120);
  text("MADE SO FAR", 14, y - 12);
  for (let i = 0; i < discoveredRecipes.length; i++) {
    fill(190, 205, 225, 150);
    text(discoveredRecipes[i], 14, y + i * 11);
  }
  pop();
}

function enterSecretRoom(text) {
  inSecretVignette = true;
  secretVignetteText = text || "the void keeps something back, even here.";
  PLAYER_MAX_HP = min(PLAYER_MAX_HP + 1, 6);
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
