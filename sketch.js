/* ===========================================================
   GODS-LIKE PLATFORMER — ASCII LEVELS (Single File)
   - High-detail graphics drawn in code
   - Axis-based accurate collision
   - ASCII level authoring with auto-snapping for items/doors
   - Contact damage from enemies with i-frames
   - Fullscreen on mouse press + responsive resizing
   UK spelling in comments.
   =========================================================== */

/* =========================
   GLOBALS & CONFIG
   ========================= */
let TILE = 40;

// Start modest, then go fullscreen on first click
let CANVAS_W, CANVAS_H;

let WORLD = {
  gravity: 0.55,
  maxFallSpeed: 16,
  jumpStrength: 15,
  runAccel: 0.6,
  runDeccel: 0.75,
  runSpeed: 3.6,
  airControl: 0.5,
  frictionGround: 0.82,
  frictionAir: 0.98,
  coyoteFrames: 8,
  jumpBufferFrames: 8,
  cameraX: 0,
  cameraEase: 0.15,
  debug: false,

  // world state
  platforms: [],
  enemies: [],
  items: [],
  doors: [],
  tubes: [],
  bullets: [],
  enemyBullets: [],
  particles: [],

  player: null,
  currentLevel: 0,
  levelLength: 2000,
  score: 0,
  validationMessages: []
};

// Palette
const PAL = {
  sky1: '#0a2238',
  sky2: '#16324f',
  bgHill: '#1f4068',
  bgMid: '#244a73',
  bgNear: '#2c5d8a',

  platTop: '#9bbcdf',
  platSide: '#6f8ba6',
  platEdge: '#cfe3ff',

  playerMain: '#ffe7b3',
  playerShade: '#d9c08e',
  playerOutline: '#2b1b10',
  playerAccent: '#ffb84d',

  enemyRed: '#ff4d4d',
  enemyDark: '#8f2a2a',
  enemyGlow: '#ff8080',

  keyGold: '#ffd24d',
  keyGlow: '#fff0a6',
  healthGreen: '#6ee16e',
  coinGold: '#ffd966',
  coinEdge: '#c99720',
  coinGlow: '#fff2b5',
  powerBlue: '#61d7ff',
  powerPurple: '#b18bff',
  tubeGreen: '#3be37a',

  bullet: '#ffe55e',
  muzzle: '#fff7a8'
};

const EPS = 0.001;

/* =========================
   UTILS
   ========================= */
function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
function aabbOverlap(a, b) {
  return !(a.x + a.w <= b.x || a.x >= b.x + b.w || a.y + a.h <= b.y || a.y >= b.y + b.h);
}
function finite(n) { return Number.isFinite(n); }
function guardEntity(e) {
  if (!e) return false;
  if (!finite(e.x) || !finite(e.y)) return false;
  if (e.y > 1e7 || e.y < -1e7 || e.x < -1e7 || e.x > 1e9) return false;
  return true;
}

/* =========================================================
   COLLISION: Robust axis-based resolution
   ========================================================= */
function moveAxisX(ent, dx, solids) {
  if (dx === 0) return;
  let move = dx;

  if (dx > 0) {
    for (let s of solids) {
      if (!((ent.y + ent.h > s.y) && (ent.y < s.y + s.h))) continue;
      if (ent.x + ent.w <= s.x) {
        if (ent.x + ent.w + dx > s.x) {
          const allowed = s.x - (ent.x + ent.w) - EPS;
          move = Math.min(move, allowed);
        }
      }
    }
  } else {
    for (let s of solids) {
      if (!((ent.y + ent.h > s.y) && (ent.y < s.y + s.h))) continue;
      if (ent.x >= s.x + s.w) {
        if (ent.x + dx < s.x + s.w) {
          const allowed = (s.x + s.w) - ent.x + EPS; // negative or ~0
          move = Math.max(move, allowed);
        }
      }
    }
  }

  ent.x += move;
  if (move !== dx) ent.vx = 0;
}

function moveAxisY(ent, dy, solids) {
  if (dy === 0) return { collidedDown: false };
  let move = dy;
  let collidedDown = false;

  if (dy > 0) {
    for (let s of solids) {
      if (!((ent.x + ent.w > s.x) && (ent.x < s.x + s.w))) continue;
      if (ent.y + ent.h <= s.y) {
        if (ent.y + ent.h + dy > s.y) {
          const allowed = s.y - (ent.y + ent.h) - EPS;
          if (allowed < move) {
            move = allowed;
            collidedDown = true;
          }
        }
      }
    }
  } else {
    for (let s of solids) {
      if (!((ent.x + ent.w > s.x) && (ent.x < s.x + s.w))) continue;
      if (ent.y >= s.y + s.h) {
        if (ent.y + dy < s.y + s.h) {
          const allowed = (s.y + s.h) - ent.y + EPS;
          move = Math.max(move, allowed);
        }
      }
    }
  }

  ent.y += move;
  if (move !== dy) ent.vy = 0;
  return { collidedDown };
}

function moveWithCollisions(ent, dx, dy, solids) {
  moveAxisX(ent, dx, solids);
  return moveAxisY(ent, dy, solids);
}

/* =========================
   RENDER HELPERS
   ========================= */
function drawShadow(x, y, w, h, alpha = 48, rx = 6) {
  noStroke();
  fill(0, 0, 0, alpha);
  rect(x + 6, y + 8, w, h, rx);
}
function drawVerticalGradient(x, y, w, h, cTop, cBottom, steps = 24, radius = 6) {
  noStroke();
  for (let i = 0; i < steps; i++) {
    const t = i / (steps - 1);
    fill(lerpColor(color(cTop), color(cBottom), t));
    let iy = y + t * h;
    rect(x, iy, w, h / steps + 1, radius);
  }
}
function drawOutlineRect(x, y, w, h, fillCol, strokeCol = '#000', weight = 2, r = 6) {
  stroke(strokeCol);
  strokeWeight(weight);
  fill(fillCol);
  rect(x, y, w, h, r);
  strokeWeight(1);
}
function drawGlow(x, y, r, col, alpha = 90) {
  noStroke();
  const c = color(col);
  for (let i = 3; i >= 1; i--) {
    const rr = r * i;
    c.setAlpha(alpha / (i * 1.5));
    fill(c);
    ellipse(x, y, rr, rr);
  }
}

function spawnPowerup(x, y) {
  const subtype = random() < 0.5 ? 'haste' : 'power';
  WORLD.items.push(new Item('power', x - 10, y - 10, subtype));
}

function spawnCoin(x, y) {
  WORLD.items.push(new Item('coin', x - 10, y - 10));
}

/* =========================
   BASE CLASSES
   ========================= */
class Entity {
  constructor(x, y, w, h) {
    this.x = x; this.y = y; this.w = w; this.h = h;
    this.vx = 0; this.vy = 0;
    this.remove = false;
  }
  get rect() { return { x: this.x, y: this.y, w: this.w, h: this.h }; }
  update() {}
  draw() {}
}

class Platform extends Entity {
  constructor(x, y, w, h) { super(x, y, w, h); }
  draw() {
    const topH = 8;
    drawShadow(this.x, this.y, this.w, this.h, 24, 6);
    drawVerticalGradient(this.x, this.y, this.w, this.h, PAL.platSide, '#4e657d', 14, 6);
    noStroke();
    fill(PAL.platTop);
    rect(this.x, this.y, this.w, topH, 6, 6, 0, 0);
    stroke(PAL.platEdge);
    strokeWeight(2);
    line(this.x + 2, this.y + 3, this.x + this.w - 2, this.y + 3);
    strokeWeight(1);
    stroke(255, 255, 255, 22);
    for (let i = 8; i < this.w; i += 24) line(this.x + i, this.y + 10, this.x + i, this.y + this.h - 6);
    noStroke();
  }
}

class Particle extends Entity {
  constructor(x, y, vx, vy, life, col, size = 4) {
    super(x, y, size, size);
    this.vx = vx; this.vy = vy;
    this.life = life; this.maxLife = life;
    this.col = col;
  }
  update() {
    this.x += this.vx;
    this.y += this.vy;
    this.vy += 0.15;
    this.life--;
    if (this.life <= 0) this.remove = true;
  }
  draw() {
    const t = this.life / this.maxLife;
    const c = color(this.col);
    c.setAlpha(40 + 140 * t);
    noStroke(); fill(c);
    ellipse(this.x, this.y, this.w * (0.8 + 0.4 * t), this.h * (0.8 + 0.4 * t));
  }
}

/* =========================
   ITEMS & DOORS
   ========================= */
class Item extends Entity {
  constructor(type, x, y, subtype = null) {
    super(x, y, 20, 20);
    this.type = type;
    this.subtype = subtype;
    this.phase = random(0, TWO_PI);
  }
  draw() {
    const bob = sin(frameCount * 0.06 + this.phase) * 3;
    const cx = this.x + this.w / 2, cy = this.y + this.h / 2 + bob;
    if (this.type === 'key') {
      drawGlow(cx, cy, 38, PAL.keyGlow, 110);
      stroke('#7a5600'); strokeWeight(3);
      fill(PAL.keyGold);
      rect(this.x + 6, this.y + 8 + bob, 8, 4, 2);
      ellipse(this.x + 14, this.y + 10 + bob, 10, 10);
      rect(this.x + 2, this.y + 9 + bob, 6, 2, 1);
      strokeWeight(1);
    } else if (this.type === 'health') {
      drawGlow(cx, cy, 32, PAL.healthGreen, 90);
      noStroke(); fill(PAL.healthGreen);
      rect(this.x + 4, this.y + 6 + bob, 12, 12, 4);
      fill('#fff'); rect(this.x + 9, this.y + 8 + bob, 2, 8, 1);
      rect(this.x + 6, this.y + 11 + bob, 8, 2, 1);
    } else if (this.type === 'coin') {
      const spin = abs(sin(frameCount * 0.2 + this.phase));
      const w = 14 * (0.25 + spin * 0.75);
      drawGlow(cx, cy, 30, PAL.coinGlow, 90);
      noStroke(); fill(PAL.coinGold);
      ellipse(cx, cy, w, 14);
      stroke(PAL.coinEdge); strokeWeight(2);
      line(cx - w * 0.2, cy - 4, cx - w * 0.2, cy + 4);
      line(cx + w * 0.2, cy - 4, cx + w * 0.2, cy + 4);
      strokeWeight(1);
    } else if (this.type === 'power') {
      const glow = this.subtype === 'haste' ? PAL.powerBlue : PAL.powerPurple;
      drawGlow(cx, cy, 36, glow, 110);
      noStroke(); fill(glow);
      rect(this.x + 4, this.y + 5 + bob, 12, 12, 4);
      fill('#0b2230');
      rect(this.x + 7, this.y + 7 + bob, 6, 8, 2);
      fill('#fff');
      if (this.subtype === 'haste') {
        triangle(this.x + 6, this.y + 9 + bob, this.x + 14, this.y + 11 + bob, this.x + 6, this.y + 13 + bob);
      } else {
        rect(this.x + 8, this.y + 8 + bob, 4, 8, 1);
        rect(this.x + 6, this.y + 10 + bob, 8, 4, 1);
      }
    }
  }
}

class Tube extends Entity {
  constructor(x, y, w, h, targetLevel, hidden = false) {
    super(x, y, w, h);
    this.targetLevel = targetLevel;
    this.hidden = hidden;
    this.phase = random(0, TWO_PI);
  }
  draw() {
    const p = WORLD.player;
    const show = !this.hidden || (p && dist(p.x, p.y, this.x, this.y) < 140);
    if (!show) return;

    const glow = sin(frameCount * 0.06 + this.phase) * 0.5 + 0.5;
    const topCol = lerpColor(color('#1a7d44'), color(PAL.tubeGreen), glow);
    drawShadow(this.x, this.y, this.w, this.h, 26, 6);
    drawVerticalGradient(this.x, this.y, this.w, this.h, topCol, '#0f3a21', 14, 6);
    noStroke(); fill('#0c2918');
    rect(this.x + 4, this.y + 8, this.w - 8, this.h - 12, 6);
    fill('#b8ffd6');
    ellipse(this.x + this.w / 2, this.y + 12, this.w - 10, 10);
  }
}

class Door extends Entity {
  constructor(x, y, w, h, needsKey = true) {
    super(x, y, w, h);
    this.needsKey = needsKey;
    this.phase = random(0, TWO_PI);
  }
  draw() {
    drawShadow(this.x, this.y, this.w, this.h, 30, 6);
    drawVerticalGradient(this.x, this.y, this.w, this.h, '#6b7c8a', '#2b3b49', 16, 6);
    stroke('#b9c7d6'); strokeWeight(2);
    noFill(); rect(this.x + 3, this.y + 3, this.w - 6, this.h - 6, 4);
    strokeWeight(1);
    let t = (sin(frameCount * 0.05 + this.phase) * 0.5 + 0.5);
    let lamp = lerpColor(color('#55707f'), color('#8af5ff'), t);
    if (this.needsKey === false) lamp = color('#8aff9c');
    noStroke(); fill(lamp); ellipse(this.x + this.w / 2, this.y + 10, 8, 8);

    if (this.needsKey) {
      // lock icon
      stroke('#f5d46b'); strokeWeight(2);
      noFill();
      arc(this.x + this.w / 2, this.y + this.h / 2 - 2, 10, 10, PI, TWO_PI);
      noStroke(); fill('#f5d46b');
      rect(this.x + this.w / 2 - 6, this.y + this.h / 2 - 2, 12, 10, 3);
      fill('#694a00');
      rect(this.x + this.w / 2 - 1, this.y + this.h / 2 + 2, 2, 5, 1);
    }
  }
}

/* =========================
   BULLETS
   ========================= */
class Bullet extends Entity {
  constructor(x, y, dir, speed = 9, damage = 20) {
    super(x, y, 12, 4);
    this.vx = speed * dir; this.vy = 0;
    this.lifetime = 120;
    this.damage = damage;
  }
  update() {
    this.x += this.vx; this.y += this.vy;
    for (let s of WORLD.platforms) {
      if (aabbOverlap(this.rect, s)) {
        this.remove = true;
        for (let i = 0; i < 6; i++) WORLD.particles.push(new Particle(this.x, this.y, random(-1, 1), random(-1, -2), 16, PAL.bullet, 3));
        break;
      }
    }
    this.lifetime--; if (this.lifetime <= 0) this.remove = true;
    if (this.x < WORLD.cameraX - 80 || this.x > WORLD.cameraX + width + 80) this.remove = true;
  }
  draw() { noStroke(); fill(PAL.bullet); rect(this.x, this.y, this.w, this.h, 2); }
}
class EnemyBullet extends Bullet {
  constructor(x, y, dir, speed = 6) { super(x, y, dir, speed); }
  draw() { noStroke(); fill(PAL.enemyGlow); rect(this.x, this.y, this.w, this.h, 2); }
}

/* =========================
   ENEMIES
   ========================= */
class Enemy extends Entity {
  constructor(x, y, w, h, hp = 40, type = 'enemy') { super(x, y, w, h); this.hp = hp; this.facing = 1; this.hitFlash = 0; this.type = type; this.powerDropChance = 0; }
  takeHit(dmg = 20) {
    this.hp -= dmg; this.hitFlash = 8;
    for (let i = 0; i < 6; i++) WORLD.particles.push(new Particle(this.x + this.w / 2, this.y + this.h / 2, random(-1, 1), random(-2, -0.5), 14, PAL.enemyGlow, 3));
    if (this.hp <= 0) {
      if (this.powerDropChance > 0 && random() < this.powerDropChance) {
        spawnPowerup(this.x + this.w / 2, this.y + this.h / 2);
      }
      this.remove = true;
    }
  }
  drawHealth() {
    let t = clamp(this.hp / 40, 0, 1);
    noStroke(); fill('#00000088'); rect(this.x, this.y - 8, this.w, 4, 2);
    fill('#00ff6a'); rect(this.x, this.y - 8, this.w * t, 4, 2);
  }
  enemyShadeFill() { return this.hitFlash > 0 ? '#ffffff' : PAL.enemyRed; }
}

class Walker extends Enemy {
  constructor(x, y) { super(x, y, 30, 40, 40, 'walker'); this.speed = 1.2; this.legPhase = random(0, TWO_PI); }
  update() {
    const p = WORLD.player; this.facing = (p.x > this.x) ? 1 : -1;
    let aheadX = this.x + (this.facing > 0 ? this.w + 2 : -2);
    let footRect = { x: aheadX, y: this.y + this.h + 1, w: 2, h: 2 };
    let onSomething = false;
    for (let s of WORLD.platforms) { if (aabbOverlap(footRect, s)) { onSomething = true; break; } }
    if (!onSomething) this.facing *= -1;

    this.vx = this.speed * this.facing;
    moveWithCollisions(this, this.vx, 0, WORLD.platforms);
    this.vy = clamp(this.vy + WORLD.gravity * 0.9, -999, WORLD.maxFallSpeed);
    const col = moveWithCollisions(this, 0, this.vy, WORLD.platforms);
    if (col.collidedDown) this.vy = 0;
    this.x = clamp(this.x, 0, WORLD.levelLength - this.w);

    this.legPhase += 0.15;
    if (this.hitFlash > 0) this.hitFlash--;
  }
  draw() {
    drawShadow(this.x, this.y, this.w, this.h, 30, 6);
    noStroke(); fill(this.enemyShadeFill()); rect(this.x, this.y + 6, this.w, this.h - 6, 6);
    rect(this.x + 4, this.y - 8, this.w - 8, 14, 4);
    fill('#1a0000'); rect(this.x + 7, this.y - 4, 4, 3, 1); rect(this.x + this.w - 11, this.y - 4, 4, 3, 1);
    const k = sin(this.legPhase) * 3; fill(PAL.enemyDark);
    rect(this.x + 4 + k, this.y + this.h - 10, 8, 10, 3);
    rect(this.x + this.w - 12 - k, this.y + this.h - 10, 8, 10, 3);
    this.drawHealth();
  }
}

class Turret extends Enemy {
  constructor(x, y) { super(x, y, 32, 32, 50, 'turret'); this.cooldown = 60 + floor(random(0, 30)); this.blinkPhase = random(0, TWO_PI); this.powerDropChance = 0.45; }
  update() {
    const p = WORLD.player; this.facing = (p.x > this.x) ? 1 : -1;
    if (this.cooldown-- <= 0) {
      let dir = this.facing;
      WORLD.enemyBullets.push(new EnemyBullet(this.x + (dir > 0 ? this.w : 0), this.y + this.h / 2, dir, 6));
      this.cooldown = 80 + floor(random(0, 60));
    }
    if (this.hitFlash > 0) this.hitFlash--;
    this.x = clamp(this.x, 0, WORLD.levelLength - this.w);
  }
  draw() {
    drawShadow(this.x, this.y, this.w, this.h, 30, 6);
    drawVerticalGradient(this.x, this.y, this.w, this.h, '#6b7c8a', '#2b3b49', 16, 6);
    let bx = this.x + (this.facing > 0 ? this.w - 6 : -6);
    noStroke(); fill('#b9c7d6'); rect(bx, this.y + 10, 6, 8, 2);
    let t = (sin(frameCount * 0.2 + this.blinkPhase) * 0.5 + 0.5);
    fill(lerpColor(color('#444'), color(this.enemyShadeFill()), t)); ellipse(this.x + this.w / 2, this.y + 8, 6, 6);
    this.drawHealth();
  }
}

class Flyer extends Enemy {
  constructor(x, y) { super(x, y, 28, 24, 30, 'flyer'); this.speed = 1.8; this.wing = random(0, TWO_PI); this.powerDropChance = 0.35; }
  update() {
    const p = WORLD.player; const dx = p.x - this.x; const dy = p.y - this.y;
    const dist = max(1, sqrt(dx * dx + dy * dy));
    this.vx = (dx / dist) * this.speed; this.vy = (dy / dist) * this.speed * 0.8;
    this.x += this.vx; this.y += this.vy; this.wing += 0.35; if (this.hitFlash > 0) this.hitFlash--;
    this.x = clamp(this.x, 0, WORLD.levelLength - this.w);
  }
  draw() {
    drawShadow(this.x, this.y, this.w, this.h, 22, 4);
    noStroke(); fill(this.enemyShadeFill()); rect(this.x, this.y + 6, this.w, this.h - 6, 6);
    const flap = 6 + sin(this.wing) * 4; fill(PAL.enemyDark);
    ellipse(this.x + 6, this.y + 8, 14, flap); ellipse(this.x + this.w - 6, this.y + 8, 14, flap);
    fill('#1a0000'); rect(this.x + this.w / 2 - 2, this.y + 3, 4, 3, 1);
    this.drawHealth();
  }
}

/* =========================
   PLAYER
   ========================= */
class Player extends Entity {
  constructor(x, y) {
    super(x, y, 28, 42);
    this.facing = 1; this.onGround = false;
    this.coyote = 0; this.jumpBuffer = 0;
    this.health = 100; this.keys = 0;
    this.runAnim = 0; this.shootFlash = 0;
    this.iFrames = 0;           // NEW: invulnerability frames after contact damage
    this.contactTick = 0;       // for periodic damage if staying in contact
    this.powerup = null;
    this.powerupTimer = 0;
  }
  inputAndPhysics() {
    let target = 0;
    if (keyIsDown(LEFT_ARROW)) target -= 1;
    if (keyIsDown(RIGHT_ARROW)) target += 1;
    if (target !== 0) this.facing = target;

    const speedBoost = this.powerup === 'haste' ? 1.35 : 1;
    const runSpeed = WORLD.runSpeed * speedBoost;
    const runAccel = WORLD.runAccel * speedBoost;
    const jumpStrength = WORLD.jumpStrength * (this.powerup === 'haste' ? 1.12 : 1);

    const accel = this.onGround ? runAccel : runAccel * WORLD.airControl;
    if (target !== 0) this.vx = clamp(this.vx + target * accel, -runSpeed, runSpeed);
    else { this.vx *= this.onGround ? WORLD.frictionGround : WORLD.frictionAir; if (abs(this.vx) < 0.05) this.vx = 0; }

    this.vy = clamp(this.vy + WORLD.gravity, -999, WORLD.maxFallSpeed);

    if (this.jumpBuffer > 0) this.jumpBuffer--;
    if (this.coyote > 0) this.coyote--;
    if (this.jumpBuffer > 0 && (this.onGround || this.coyote > 0)) {
      this.vy = -jumpStrength; this.onGround = false; this.coyote = 0; this.jumpBuffer = 0;
      for (let i = 0; i < 8; i++) WORLD.particles.push(new Particle(this.x + this.w / 2, this.y + this.h, random(-1.2, 1.2), random(-2.5, -1.0), 14, '#ffffff', 3));
    }

    moveWithCollisions(this, this.vx, 0, WORLD.platforms);
    const col = moveWithCollisions(this, 0, this.vy, WORLD.platforms);
    const wasGround = this.onGround; this.onGround = col.collidedDown;
    if (this.onGround) {
      this.coyote = WORLD.coyoteFrames;
      if (abs(this.vx) > 0.2 && frameCount % 8 === 0) WORLD.particles.push(new Particle(this.x + (this.facing > 0 ? this.w - 2 : 2), this.y + this.h - 2, random(-0.3, 0.3), random(-0.7, -0.2), 10, '#cfd6df', 2));
    }
    if (abs(this.vx) > 0.1 && this.onGround) this.runAnim += 0.3; else this.runAnim *= 0.9;
    if (this.shootFlash > 0) this.shootFlash--;
    if (this.iFrames > 0) this.iFrames--;
    if (this.contactTick > 0) this.contactTick--;

    this.x = clamp(this.x, 0, WORLD.levelLength - this.w);
  }
  shoot() {
    const bx = this.facing > 0 ? this.x + this.w + 2 : this.x - 10;
    const by = this.y + 16; const dir = this.facing > 0 ? 1 : -1;
    const dmg = this.powerup === 'power' ? 30 : 20;
    WORLD.bullets.push(new Bullet(bx, by, dir, 9, dmg));
    for (let i = 0; i < 6; i++) WORLD.particles.push(new Particle(bx, by, dir * random(1, 2), random(-1, 1), 10, PAL.muzzle, 3));
    this.shootFlash = 4;
  }
  damage(d = 8, giveIFrames = 30) {
    if (this.iFrames > 0) return;
    this.health -= d;
    this.iFrames = giveIFrames;  // short invulnerability so contact doesn’t melt hp
    if (this.health <= 0) loadLevel(WORLD.currentLevel, true);
  }
  update() {
    if (this.powerupTimer > 0) {
      this.powerupTimer--;
      if (this.powerupTimer === 0) this.powerup = null;
    }

    this.inputAndPhysics();

    if (this.y > height + 40) {
      loadLevel(WORLD.currentLevel, true);
      return;
    }

    // Bullets → enemies
    for (let b of WORLD.bullets) for (let e of WORLD.enemies) if (!e.remove && aabbOverlap(b.rect, e)) { e.takeHit(b.damage || 20); b.remove = true; }

    // Enemy bullets → player
    for (let eb of WORLD.enemyBullets) if (aabbOverlap(eb.rect, this)) { eb.remove = true; this.damage(12); }

    // NEW: Contact damage from enemies
    let touching = false;
    for (let e of WORLD.enemies) {
      if (!e.remove && aabbOverlap(e, this)) { touching = true; break; }
    }
    if (touching) {
      // Tick damage every few frames while overlapping, with i-frames gating
      if (this.iFrames === 0) {
        this.damage(10, 45);          // 10 damage, ~0.75s i-frames at 60fps
      }
      this.contactTick = 10;          // refresh minor cooldown indicator (optional use)
    }

    // Items
    for (let it of WORLD.items) if (!it.remove && aabbOverlap(it, this)) {
      switch (it.type) {
        case 'key':
          this.keys++;
          break;
        case 'health':
          this.health = Math.min(100, this.health + 35);
          break;
        case 'power':
          this.powerup = it.subtype; this.powerupTimer = 600;
          break;
        case 'coin':
          WORLD.score += 1;
          break;
      }
      it.remove = true;
    }

    // Doors
    for (let d of WORLD.doors) if (aabbOverlap(d, this)) { if (!d.needsKey || this.keys > 0) { if (d.needsKey) this.keys--; nextLevel(); break; } }

    // Tubes (touch to enter)
    for (let t of WORLD.tubes) {
      if (aabbOverlap(t, this)) {
        WORLD.currentLevel = t.targetLevel;
        loadLevel(t.targetLevel);
        break;
      }
    }
  }
  draw() {
    // Shadow
    noStroke(); fill(0, 0, 0, 40); ellipse(this.x + this.w / 2, this.y + this.h + 4, this.w * 0.9, 10);

    // Flash when invulnerable
    const flash = (this.iFrames > 0 && (frameCount % 6 < 3));
    const mainFill = flash ? '#fefefe' : (this.shootFlash > 0 ? '#fff6d3' : PAL.playerMain);

    // Cute robot body
    const sway = sin(this.runAnim) * 3;
    noStroke();
    fill(this.powerup === 'power' ? '#7d4cff' : '#2b3b5a');
    rect(this.x + (this.facing > 0 ? -4 : this.w - 6), this.y + 10, 10, 20 + sway, 6);

    // Torso (rounded)
    drawOutlineRect(this.x + 1, this.y + 6, this.w - 2, this.h - 8, mainFill, PAL.playerOutline, 2, 10);
    drawVerticalGradient(this.x + 4, this.y + 12, this.w - 8, this.h - 18, '#f3d9a6', '#caa16b', 10, 6);
    fill('#ffffff');
    ellipse(this.x + this.w / 2, this.y + this.h / 2 + 2, 10, 10);
    fill('#76d9ff');
    ellipse(this.x + this.w / 2, this.y + this.h / 2 + 2, 5, 5);

    // Head (big, cute)
    drawOutlineRect(this.x + 2, this.y - 14, this.w - 4, 18, mainFill, PAL.playerOutline, 2, 9);
    fill('#2a374a'); rect(this.x + 6, this.y - 9, this.w - 12, 7, 4);
    fill('#8fe6ff');
    ellipse(this.x + (this.facing > 0 ? this.w - 9 : 9), this.y - 5, 6, 6);
    ellipse(this.x + (this.facing > 0 ? this.w - 16 : 16), this.y - 5, 6, 6);
    fill('#ff9fb3');
    ellipse(this.x + (this.facing > 0 ? 8 : this.w - 8), this.y - 1, 4, 3);

    // Antenna
    stroke(PAL.playerOutline); strokeWeight(2);
    line(this.x + this.w / 2, this.y - 14, this.x + this.w / 2, this.y - 20);
    noStroke(); fill('#ffd36b');
    ellipse(this.x + this.w / 2, this.y - 21, 6, 6);

    // Arms
    noStroke(); fill(mainFill);
    rect(this.x + (this.facing > 0 ? this.w - 6 : 2), this.y + 18 + sway, 4, 12, 3);
    rect(this.x + (this.facing > 0 ? 2 : this.w - 6), this.y + 20 - sway * 0.5, 4, 10, 3);

    // Boots
    fill('#3b2a1e');
    rect(this.x + 4, this.y + this.h - 7, 9, 6, 3);
    rect(this.x + this.w - 13, this.y + this.h - 7, 9, 6, 3);

    if (this.shootFlash > 0) {
      const fx = this.facing > 0 ? this.x + this.w + 2 : this.x - 6;
      const fy = this.y + 16;
      drawGlow(fx, fy, 22, PAL.muzzle, 120);
    }

    if (this.powerup === 'haste') {
      drawGlow(this.x + this.w / 2, this.y + this.h / 2, 36, PAL.powerBlue, 70);
    }

    // Key icon
    if (this.keys > 0) {
      fill(PAL.keyGold); rect(this.x + this.w + 6, this.y - 16, 10, 6, 2);
      noStroke(); fill(PAL.keyGold); ellipse(this.x + this.w + 15, this.y - 13, 8, 8);
    }
  }
}

/* =========================
   ASCII LEVELS
   =========================
   Symbols:
   # = solid block (merged into platforms)
   . = empty
   P = player start
   K = key
   H = health
  C = coin
   W = walker
   T = turret
   F = flyer
   D = door (locked)
   U = hidden tube (requires tubeTargets mapping)
   V = visible tube (requires tubeTargets mapping)
*/
const LEVELS_ASCII = [
  {
    name: 'Level 1',
    tubeTargets: { U: 2 },
    grid: [
      "...............................................................................................................",
      "...............................................................................................................",
      "..............................................F.....................................................C.........",
      "...............................................................................................................",
      "..............................................######..........................................................",
      "........................F.............#####.................................####...............................",
      "..............................#####...........................####.............................................",
      "......................#####............................####...................................................",
      ".....K....C....W............................W............W............................U.......................",
      "###########################U.............#############.............###############.......D......................",
      "###########################..............#############.....................###############....................."
    ]
  },
  {
    name: 'Level 2',
    tubeTargets: { U: 3 },
    grid: [
      "...............................................................................................................",
      ".............................................................................................F...............C",
      "..............................................######..........................................................",
      "..................................######.............................................#####...................",
      "..............######...........................................######.........................................",
      ".....W.........................................................................T......................U.......",
      "##############...................############...........................############.........................",
      "###############.................##############.........................#############.........................",
      "...........K................H....................P.........................................................D",
      "##############################################################################################################",
      "##############################################################################################################"
    ]
  },
  {
    name: 'Secret 1',
    secret: true,
    tubeTargets: { V: 0 },
    grid: [
      "....................................................................................",
      "...............F.....................................................F.............",
      "..............................................................................C.....",
      ".................######..................######....................................",
      "....W..............................................................W..............",
      "#########################...........#############..................############....",
      "#########################...........#############.............V....############...."
    ]
  },
  {
    name: 'Secret 2',
    secret: true,
    tubeTargets: { V: 1 },
    grid: [
      "............................................................................................",
      "........F..............................................F............................C......",
      ".............................######............................######.......................",
      "............W..........................................................T...................",
      "#######################.................###############................###################..",
      "#######################.................###############............V...###################.."
    ]
  }
];

/* =========================
   ASCII → WORLD PARSER
   ========================= */
function parseASCIILevel(asciiLevel) {
  const rows = asciiLevel.grid.length;
  const cols = asciiLevel.grid.reduce((m, r) => Math.max(m, r.length), 0);

  const solids = [];
  const items = [];
  const enemies = [];
  const doors = [];
  const tubes = [];
  let playerStart = { x: 40, y: 40 };
  const tubeTargets = asciiLevel.tubeTargets || {};

  const itemSymbols = {
    K: 'key',
    H: 'health',
    C: 'coin'
  };

  const enemySymbols = {
    W: { type: 'walker', dx: -15, dy: -40 },
    T: { type: 'turret', dx: -16, dy: -32 },
    F: { type: 'flyer',  dx: -14, dy: -12, fly: true }
  };

  // 1) Merge horizontal runs of '#'
  for (let r = 0; r < rows; r++) {
    let c = 0;
    while (c < cols) {
      const ch = asciiLevel.grid[r][c] || '.';
      if (ch === '#') {
        let c2 = c;
        while (c2 < cols && (asciiLevel.grid[r][c2] || '.') === '#') c2++;
        const x = c * TILE, y = r * TILE;
        const w = (c2 - c) * TILE, h = TILE;
        solids.push({ x, y, w, h });
        c = c2;
      } else {
        c++;
      }
    }
  }

  // 2) Place entities/items by symbols; drop them to the top of the nearest platform under them
  function dropToTop(x, y, w = TILE, h = TILE) {
    let candidate = null;
    for (let s of solids) {
      if (x >= s.x - w * 0.25 && x <= s.x + s.w + w * 0.25) {
        if (s.y >= y && (!candidate || s.y < candidate.y)) candidate = s;
      }
    }
    return candidate ? (candidate.y) : (rows * TILE);
  }

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const ch = asciiLevel.grid[r][c] || '.';
      const cx = c * TILE + TILE / 2;
      const yTop = r * TILE;

      if (ch === 'P') {
        const top = dropToTop(cx, yTop);
        playerStart = { x: cx - 14, y: top - 42 };
      } else if (itemSymbols[ch]) {
        const top = dropToTop(cx, yTop);
        items.push({ type: itemSymbols[ch], x: cx - 10, y: top - 26 });
      } else if (ch === 'D') {
        const top = dropToTop(cx, yTop);
        doors.push({ x: cx - 20, y: top - 40, w: 40, h: 40, needsKey: true });
      } else if (ch === 'U' || ch === 'V') {
        const top = dropToTop(cx, yTop);
        const target = tubeTargets[ch];
        if (Number.isFinite(target)) tubes.push({ x: cx - 20, y: top - 40, w: 40, h: 40, target, hidden: ch === 'U' });
      } else if (enemySymbols[ch]) {
        const cfg = enemySymbols[ch];
        const top = dropToTop(cx, yTop);
        const y = cfg.fly ? (yTop + TILE / 2 + cfg.dy) : (top + cfg.dy);
        const x = cx + cfg.dx;
        enemies.push({ type: cfg.type, x, y });
      }
    }
  }

  return {
    platforms: solids,
    items, enemies, doors, tubes, playerStart,
    length: cols * TILE
  };
}

/* =========================
   VALIDATION (snap + reach warn)
   ========================= */
function validateAndCorrectLevel(L) {
  WORLD.validationMessages = [];

  // Snap items to platform tops again (belt and braces)
  function snapItem(it) {
    let base = null;
    for (let s of L.platforms) {
      if (it.x + it.w / 2 >= s.x && it.x + it.w / 2 <= s.x + s.w) {
        if (!base || s.y < base.y) base = s;
      }
    }
    if (base) it.y = base.y - it.h - 6;
  }
  for (let it of L.items) snapItem(it);

  // Snap doors
  for (let d of L.doors) {
    let base = null;
    for (let s of L.platforms) {
      if (d.x + d.w / 2 >= s.x && d.x + d.w / 2 <= s.x + s.w) {
        if (!base || s.y < base.y) base = s;
      }
    }
    if (base) d.y = base.y - d.h;
  }

  // Simple reachability heuristic
  const gVal = WORLD.gravity;
  const v0 = WORLD.jumpStrength;
  const run = WORLD.runSpeed;
  const T = (2 * v0) / gVal;
  const R = run * T;
  const H = (v0 * v0) / (2 * gVal) + 6;

  // find start platform index
  let startIdx = 0;
  for (let i = 0; i < L.platforms.length; i++) {
    const p = L.platforms[i];
    if (L.playerStart.x >= p.x - 10 && L.playerStart.x <= p.x + p.w + 10 &&
        L.playerStart.y <= p.y && L.playerStart.y >= p.y - 100) { startIdx = i; break; }
  }

  const nodes = L.platforms.map((p, idx) => ({ idx, p }));
  const graph = new Map();
  for (let a of nodes) {
    graph.set(a.idx, []);
    for (let b of nodes) {
      if (a.idx === b.idx) continue;
      const dx = (b.p.x + b.p.w / 2) - (a.p.x + a.p.w / 2);
      const dy = b.p.y - a.p.y;
      if (abs(dx) <= R + 40 && dy <= H + 10) graph.get(a.idx).push(b.idx);
    }
  }

  function reachableX(targetX) {
    const visited = new Set([startIdx]);
    const q = [startIdx];
    while (q.length) {
      const i = q.shift();
      const p = L.platforms[i];
      if (targetX >= p.x && targetX <= p.x + p.w) return true;
      for (let n of graph.get(i)) if (!visited.has(n)) { visited.add(n); q.push(n); }
    }
    return false;
  }

  for (let it of L.items) {
    if (it.type !== 'key') continue;
    const cx = it.x + it.w / 2;
    if (!reachableX(cx)) {
      WORLD.validationMessages.push(`Key at x=${round(cx)} looked unreachable; snapped nearer start`);
      const sp = L.platforms[startIdx];
      it.x = sp.x + sp.w / 2 - it.w / 2;
      it.y = sp.y - it.h - 6;
    }
  }

  if (WORLD.validationMessages.length) console.warn('[Level Validation]', WORLD.validationMessages);
}

/* =========================
   LEVEL LOADING
   ========================= */
function computeTileForLevel(level) {
  const rows = level.grid.length || 1;
  const ideal = Math.floor(windowHeight / rows);
  return clamp(ideal, 24, 72);
}

function loadLevel(index, respawn = false) {
  WORLD.platforms = []; WORLD.enemies = []; WORLD.items = [];
  WORLD.doors = []; WORLD.tubes = []; WORLD.bullets = []; WORLD.enemyBullets = [];
  WORLD.particles = []; WORLD.validationMessages = [];

  TILE = computeTileForLevel(LEVELS_ASCII[index]);

  const parsed = parseASCIILevel(LEVELS_ASCII[index]);
  const L = {
    platforms: parsed.platforms.map(p => ({...p})),
    enemies: parsed.enemies.map(e => ({...e})),
    items: parsed.items.map(i => ({...i, w: 20, h: 20})),
    doors: parsed.doors.map(d => ({...d})),
    tubes: parsed.tubes.map(t => ({...t})),
    playerStart: {...parsed.playerStart},
    length: parsed.length
  };

  validateAndCorrectLevel(L);

  WORLD.levelLength = L.length;
  for (let p of L.platforms) WORLD.platforms.push(new Platform(p.x, p.y, p.w, p.h));
  for (let e of L.enemies) {
    const ctor = e.type === 'walker' ? Walker : (e.type === 'turret' ? Turret : Flyer);
    WORLD.enemies.push(new ctor(e.x, e.y));
  }
  for (let it of L.items) WORLD.items.push(new Item(it.type, it.x, it.y, it.subtype));
  for (let d of L.doors) WORLD.doors.push(new Door(d.x, d.y, d.w, d.h, d.needsKey));
  for (let t of L.tubes) WORLD.tubes.push(new Tube(t.x, t.y, t.w, t.h, t.target, t.hidden));

  WORLD.player = new Player(L.playerStart.x, L.playerStart.y);

  WORLD.cameraX = clamp(WORLD.player.x - width / 2, 0, Math.max(0, WORLD.levelLength - width));
}

/* =========================
   CAMERA & BACKGROUND
   ========================= */
function drawParallax() {
  noStroke();
  for (let i = 0; i < height; i++) {
    const t = i / height;
    fill(lerpColor(color(PAL.sky1), color(PAL.sky2), t));
    rect(0, i, width, 1);
  }

  // Stars (far layer)
  const starOff = -WORLD.cameraX * 0.05;
  for (let x = -200; x <= width + 200; x += 60) {
    for (let y = 30; y <= height * 0.45; y += 70) {
      const n = sin((x + starOff) * 0.05 + y * 0.03) * 0.5 + 0.5;
      const tw = 1.5 + n * 1.5;
      fill(255, 255, 255, 80 + n * 120);
      ellipse(x + starOff % 60, y + n * 6, tw, tw);
    }
  }

  // Clouds (mid-far layer)
  const cloudOff = -WORLD.cameraX * 0.12;
  for (let x = -300; x <= width + 300; x += 180) {
    const y = height * 0.18 + sin((x + cloudOff) * 0.01) * 16;
    const w = 90 + sin((x + cloudOff) * 0.02) * 20;
    fill(255, 255, 255, 18);
    ellipse(x + cloudOff % 180, y, w, 30);
    ellipse(x + 20 + cloudOff % 180, y + 6, w * 0.7, 24);
  }

  function layer(col, speed, yBase, waveAmp, step) {
    fill(col); noStroke();
    beginShape();
    const off = -WORLD.cameraX * speed;
    vertex(-1000, height);
    for (let x = -1000; x <= width + 1000; x += step) {
      const y = yBase + sin((x + off) * 0.002) * waveAmp + cos((x + off) * 0.0013) * (waveAmp * 0.6);
      vertex(x, y);
    }
    vertex(width + 1000, height);
    endShape(CLOSE);
  }
  layer(PAL.bgHill, 0.2, height - 120, 16, 24);
  layer(PAL.bgMid,  0.35, height - 90,  12, 20);
  layer(PAL.bgNear, 0.55, height - 60,   8, 16);
}

/* =========================
   GAME LOOP
   ========================= */
function setup() {
  // Start with a reasonable size; we’ll go fullscreen on first click
  CANVAS_W = windowWidth;
  CANVAS_H = windowHeight;
  createCanvas(CANVAS_W, CANVAS_H);
  textFont('monospace');
  loadLevel(WORLD.currentLevel);
}

function draw() {
  background(0);
  drawParallax();

  const targetCam = clamp(WORLD.player.x - width / 2, 0, Math.max(0, WORLD.levelLength - width));
  WORLD.cameraX += (targetCam - WORLD.cameraX) * WORLD.cameraEase;

  push();
  translate(-WORLD.cameraX, 0);

  for (let p of WORLD.platforms) p.draw();
  for (let it of WORLD.items) if (!it.remove) it.draw();
  for (let d of WORLD.doors) d.draw();
  for (let t of WORLD.tubes) t.draw();

  WORLD.player.update();
  WORLD.player.draw();

  for (let e of WORLD.enemies) { if (!e.remove) { e.update(); e.draw(); } }

  for (let b of WORLD.bullets) b.update();
  for (let b of WORLD.enemyBullets) b.update();
  for (let p of WORLD.particles) p.update();

  for (let b of WORLD.bullets) b.draw();
  for (let b of WORLD.enemyBullets) b.draw();
  for (let p of WORLD.particles) p.draw();

  // Guard world state to avoid NaN → rect() errors
  if (!guardEntity(WORLD.player)) { loadLevel(WORLD.currentLevel, true); pop(); return; }
  WORLD.enemies.forEach(e => { if (!guardEntity(e)) e.remove = true; });
  WORLD.bullets.forEach(b => { if (!guardEntity(b)) b.remove = true; });
  WORLD.enemyBullets.forEach(b => { if (!guardEntity(b)) b.remove = true; });
  WORLD.particles.forEach(pt => { if (!guardEntity(pt)) pt.remove = true; });

  // Clean up
  WORLD.enemies = WORLD.enemies.filter(e => !e.remove);
  WORLD.items = WORLD.items.filter(it => !it.remove);
  WORLD.bullets = WORLD.bullets.filter(b => !b.remove);
  WORLD.enemyBullets = WORLD.enemyBullets.filter(b => !b.remove);
  WORLD.particles = WORLD.particles.filter(pt => !pt.remove);

  if (WORLD.debug) drawDebugWorld();
  pop();

  drawHUD();
}

/* =========================
   DEBUG & HUD
   ========================= */
function drawDebugWorld() {
  noFill(); stroke('#00ffcc'); strokeWeight(1.5);
  for (let s of WORLD.platforms) rect(s.x, s.y, s.w, s.h);

  stroke('#ff66aa'); for (let e of WORLD.enemies) rect(e.x, e.y, e.w, e.h);
  stroke('#ffff00'); rect(WORLD.player.x, WORLD.player.y, WORLD.player.w, WORLD.player.h);
  stroke('#66ff66'); for (let it of WORLD.items) rect(it.x, it.y, it.w, it.h);
  stroke('#66aaff'); for (let d of WORLD.doors) rect(d.x, d.y, d.w, d.h);
  stroke('#44ff99'); for (let t of WORLD.tubes) rect(t.x, t.y, t.w, t.h);

  let y = 40; noStroke(); fill(255);
  for (let msg of WORLD.validationMessages) { text(msg, WORLD.cameraX + 20, y); y += 16; }
}

function drawHUD() {
  noStroke(); fill(0, 0, 0, 90); rect(0, 0, width, 54);
  fill('#fff'); textSize(14);
  text(`Level: ${WORLD.currentLevel + 1}/${LEVELS_ASCII.length} — ${LEVELS_ASCII[WORLD.currentLevel].name}`, 14, 22);
  fill(PAL.coinGold);
  text(`Score: ${WORLD.score}`, 14, 46);

  const hw = 180, hx = 260, hy = 10;
  fill('#333'); rect(hx, hy, hw, 14, 7);
  fill('#ff3355'); rect(hx, hy, hw * (WORLD.player.health / 100), 14, 7);

  fill(PAL.keyGold); rect(hx + hw + 20, hy, 12, 6, 2);
  fill('#fff'); text(`x ${WORLD.player.keys}`, hx + hw + 40, 22);

  if (WORLD.player.powerup) {
    const col = WORLD.player.powerup === 'haste' ? PAL.powerBlue : PAL.powerPurple;
    fill(col); rect(hx + hw + 90, hy, 12, 12, 3);
    fill('#fff'); text(WORLD.player.powerup === 'haste' ? 'HASTE' : 'POWER', hx + hw + 108, 22);
  }

  if (WORLD.debug) { fill('#ff0'); text('DEBUG ON (D)', width - 130, 22); }
}

/* =========================
   INPUT
   ========================= */
function keyPressed() {
  if (keyCode === UP_ARROW) WORLD.player.jumpBuffer = WORLD.jumpBufferFrames;
  if (key === ' ') WORLD.player.shoot();
  if (key === 'D' || key === 'd') WORLD.debug = !WORLD.debug;
  if (key === 'R' || key === 'r') loadLevel(WORLD.currentLevel, true);
}

// NEW: Fullscreen on first mouse/touch
function mousePressed() {
  // Only request fullscreen if not already in it
  if (!fullscreen()) {
    try { fullscreen(true); } catch (e) { /* some browsers block; ignore */ }
  }
}

// Keep canvas matched to the window size (and adjust camera clamp)
function windowResized() {
  resizeCanvas(windowWidth, windowHeight);
  loadLevel(WORLD.currentLevel, true);
}

/* =========================
   LEVEL FLOW
   ========================= */
function nextLevel() {
  let idx = WORLD.currentLevel;
  for (let i = 0; i < LEVELS_ASCII.length; i++) {
    idx = (idx + 1) % LEVELS_ASCII.length;
    if (!LEVELS_ASCII[idx].secret) break;
  }
  WORLD.currentLevel = idx;
  loadLevel(WORLD.currentLevel);
}