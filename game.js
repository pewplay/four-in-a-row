// ================================================================
//  FOUR IN A ROW — PewPlay
//  @bg #0e1a3a
//  @accent #ffcc33
//  7×6, contro il computer (minimax con potatura alfa-beta) o in due
//  sullo stesso dispositivo. Pedine che cadono e rimbalzano.
// ================================================================
(function () {
  'use strict';
  const { clamp, sfx, store } = PP;

  const GAME_ID = 'four-in-a-row';
  const C = 7, R = 6;
  const MODES = ['vs Computer', '2 Players'];
  const LEVELS = ['Easy', 'Medium', 'Hard'];
  const DEPTH = [2, 4, 7];
  const COL = ['', '#ff4d5e', '#ffcc33'];

  let mode = 0, level = 1, humanFirst = true;
  let board, turn, winner, winLine, falling, hoverCol, aiThinking, aiTimer, moves;
  let geo = { x: 0, y: 0, cell: 60 };
  let stats = { w: 0, l: 0, d: 0 };

  const statsKey = () => `stats-${level}`;

  function layout() {
    const top = 70, bottom = 44;
    const cell = Math.min((PP.W - 24) / C, (PP.H - top - bottom) / (R + 1));
    geo = { cell, x: (PP.W - cell * C) / 2, y: top + cell + (PP.H - top - bottom - cell * (R + 1)) / 2 };
  }

  function start() {
    layout();
    board = Array.from({ length: R }, () => Array(C).fill(0));
    turn = 1; winner = 0; winLine = null; falling = null; hoverCol = 3; aiThinking = false; aiTimer = 0; moves = 0;
    if (mode === 0 && !humanFirst) { aiTimer = 0.5; aiThinking = true; }
    humanFirst = !humanFirst; // alterna chi comincia
  }

  const isAiTurn = () => mode === 0 && turn === 2;
  function dropRow(b, c) { for (let r = R - 1; r >= 0; r--) if (!b[r][c]) return r; return -1; }

  function play(c) {
    if (winner || falling) return;
    const r = dropRow(board, c);
    if (r < 0) { sfx.tone(160, 0.08, 'square', 0.06); return; }
    falling = { c, r, y: -geo.cell * 0.9, vy: 0, p: turn, bounced: 0 };
    sfx.tone(turn === 1 ? 520 : 440, 0.06, 'triangle', 0.1);
  }

  function land() {
    const f = falling;
    board[f.r][f.c] = f.p;
    falling = null;
    moves++;
    const line = findWin(board, f.r, f.c);
    if (line) return finish(f.p, line);
    if (moves === R * C) return finish(3, null);
    turn = 3 - turn;
    if (isAiTurn()) { aiThinking = true; aiTimer = 0.35; }
  }

  function finish(p, line) {
    winner = p; winLine = line;
    if (p === 3) { stats.d++; sfx.chord([392, 392], 0.2); }
    else if (mode === 0 && p === 2) { stats.l++; sfx.lose(); }
    else { stats.w += mode === 0 ? 1 : 0; sfx.win(); }
    if (mode === 0) store.set(statsKey(), stats);
    if (line) for (const [r, c] of line) PP.burst(geo.x + (c + 0.5) * geo.cell, geo.y + (r + 0.5) * geo.cell, [COL[p], '#fff'], 14, 200, 4, 0.9, 300);
    const title = p === 3 ? 'Draw!' : mode === 1 ? `${p === 1 ? 'Red' : 'Yellow'} wins!` : p === 1 ? 'You win!' : 'Computer wins';
    const text = mode === 0 ? `${LEVELS[level]} · Wins ${stats.w} · Losses ${stats.l} · Draws ${stats.d}` : 'Nice game!';
    PP.game.overDelay = 1300;
    PP.over(title, text);
  }

  function findWin(b, r, c) {
    const p = b[r][c];
    for (const [dr, dc] of [[0, 1], [1, 0], [1, 1], [1, -1]]) {
      const line = [[r, c]];
      for (const s of [1, -1]) {
        let rr = r + dr * s, cc = c + dc * s;
        while (rr >= 0 && rr < R && cc >= 0 && cc < C && b[rr][cc] === p) { line.push([rr, cc]); rr += dr * s; cc += dc * s; }
      }
      if (line.length >= 4) return line;
    }
    return null;
  }

  // ── IA ──────────────────────────────────────────
  const ORDER = [3, 2, 4, 1, 5, 0, 6];
  function scoreWindow(w, p) {
    const o = 3 - p; let mine = 0, theirs = 0, empty = 0;
    for (const v of w) { if (v === p) mine++; else if (v === o) theirs++; else empty++; }
    if (mine === 4) return 100000;
    if (mine === 3 && empty === 1) return 50;
    if (mine === 2 && empty === 2) return 8;
    if (theirs === 3 && empty === 1) return -60;
    if (theirs === 2 && empty === 2) return -6;
    return 0;
  }
  function evaluate(b, p) {
    let s = 0;
    for (let r = 0; r < R; r++) if (b[r][3] === p) s += 6; else if (b[r][3] === 3 - p) s -= 6;
    for (let r = 0; r < R; r++) for (let c = 0; c < C; c++) {
      if (c + 3 < C) s += scoreWindow([b[r][c], b[r][c + 1], b[r][c + 2], b[r][c + 3]], p);
      if (r + 3 < R) s += scoreWindow([b[r][c], b[r + 1][c], b[r + 2][c], b[r + 3][c]], p);
      if (r + 3 < R && c + 3 < C) s += scoreWindow([b[r][c], b[r + 1][c + 1], b[r + 2][c + 2], b[r + 3][c + 3]], p);
      if (r + 3 < R && c - 3 >= 0) s += scoreWindow([b[r][c], b[r + 1][c - 1], b[r + 2][c - 2], b[r + 3][c - 3]], p);
    }
    return s;
  }
  function minimax(b, depth, alpha, beta, maxing, p, filled) {
    if (depth === 0 || filled === R * C) return evaluate(b, p);
    let best = maxing ? -Infinity : Infinity;
    const who = maxing ? p : 3 - p;
    for (const c of ORDER) {
      const r = dropRow(b, c);
      if (r < 0) continue;
      b[r][c] = who;
      let v;
      if (findWin(b, r, c)) v = maxing ? 1e6 + depth : -1e6 - depth;
      else v = minimax(b, depth - 1, alpha, beta, !maxing, p, filled + 1);
      b[r][c] = 0;
      if (maxing) { best = Math.max(best, v); alpha = Math.max(alpha, v); }
      else { best = Math.min(best, v); beta = Math.min(beta, v); }
      if (beta <= alpha) break;
    }
    return best;
  }
  function aiMove() {
    const b = board.map(r => r.slice());
    const valid = ORDER.filter(c => dropRow(b, c) >= 0);
    // Facile: a volte sbaglia
    if (level === 0 && Math.random() < 0.35) return PP.pick(valid);
    let bestC = valid[0], bestV = -Infinity;
    for (const c of valid) {
      const r = dropRow(b, c);
      b[r][c] = 2;
      const v = findWin(b, r, c) ? 1e7 : minimax(b, DEPTH[level] - 1, -Infinity, Infinity, false, 2, moves + 1) + Math.random() * (level === 2 ? 0.5 : 4);
      b[r][c] = 0;
      if (v > bestV) { bestV = v; bestC = c; }
    }
    return bestC;
  }

  function update(dt) {
    if (falling) {
      const f = falling;
      const targetY = (f.r + 0.5) * geo.cell;
      f.vy += 3200 * dt; f.y += f.vy * dt * (geo.cell / 70);
      if (f.y >= targetY) {
        f.y = targetY;
        if (f.bounced < 2 && f.vy > 400) { f.vy = -f.vy * 0.3; f.bounced++; sfx.tone(200 + f.r * 30, 0.05, 'sine', 0.12); }
        else land();
      }
    }
    if (aiThinking && !falling && !winner) {
      aiTimer -= dt;
      if (aiTimer <= 0) { aiThinking = false; const c = aiMove(); hoverCol = c; play(c); }
    }
  }

  // ── DISEGNO ──────────────────────────────────────
  function disc(ctx, x, y, r, p, glow) {
    ctx.save();
    if (glow) { ctx.shadowColor = COL[p]; ctx.shadowBlur = r * 0.8; }
    const g = ctx.createRadialGradient(x - r * 0.3, y - r * 0.35, r * 0.1, x, y, r);
    g.addColorStop(0, p === 1 ? '#ff8a95' : '#ffe58a'); g.addColorStop(1, p === 1 ? '#d61f35' : '#e0a400');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.fill();
    ctx.restore();
    ctx.strokeStyle = 'rgba(0,0,0,.18)'; ctx.lineWidth = r * 0.12; ctx.beginPath(); ctx.arc(x, y, r * 0.66, 0, 7); ctx.stroke();
  }

  function draw(ctx, W, H) {
    layout();
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#1a2d63'); g.addColorStop(1, '#0a1430');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    const { x, y, cell } = geo;
    const rad = cell * 0.39;
    if (!board) return;

    // pedina in attesa sopra la colonna
    if (PP.state === 'playing' && !winner && !falling && !isAiTurn()) disc(ctx, x + (hoverCol + 0.5) * cell, y - cell * 0.55, rad, turn, true);
    if (aiThinking && !falling) disc(ctx, x + (hoverCol + 0.5) * cell, y - cell * 0.55, rad, 2, false);

    // pedine (dietro la griglia)
    for (let r = 0; r < R; r++) for (let c = 0; c < C; c++) if (board[r][c]) disc(ctx, x + (c + 0.5) * cell, y + (r + 0.5) * cell, rad, board[r][c], false);
    if (falling) disc(ctx, x + (falling.c + 0.5) * cell, y + falling.y, rad, falling.p, false);

    // griglia con buchi
    ctx.save();
    ctx.beginPath();
    PP.rr(x - cell * 0.12, y - cell * 0.08, cell * C + cell * 0.24, cell * R + cell * 0.2, cell * 0.25);
    for (let r = 0; r < R; r++) for (let c = 0; c < C; c++) { ctx.moveTo(x + (c + 0.5) * cell + rad + 2, y + (r + 0.5) * cell); ctx.arc(x + (c + 0.5) * cell, y + (r + 0.5) * cell, rad + 2, 0, Math.PI * 2, true); }
    const bg = ctx.createLinearGradient(0, y, 0, y + cell * R);
    bg.addColorStop(0, '#3a6df0'); bg.addColorStop(1, '#2049b8');
    ctx.fillStyle = bg; ctx.shadowColor = 'rgba(0,0,0,.45)'; ctx.shadowBlur = 24; ctx.shadowOffsetY = 8;
    ctx.fill('evenodd');
    ctx.restore();
    ctx.strokeStyle = 'rgba(255,255,255,.18)'; ctx.lineWidth = 2;
    PP.rr(x - cell * 0.12, y - cell * 0.08, cell * C + cell * 0.24, cell * R + cell * 0.2, cell * 0.25); ctx.stroke();
    // piedini
    ctx.fillStyle = '#183a96';
    ctx.fillRect(x - cell * 0.3, y + cell * R + cell * 0.12, cell * 0.5, cell * 0.25);
    ctx.fillRect(x + cell * C - cell * 0.2, y + cell * R + cell * 0.12, cell * 0.5, cell * 0.25);

    // linea vincente
    if (winLine) {
      const pulse = 0.6 + Math.sin(PP.time * 8) * 0.4;
      for (const [r, c] of winLine) {
        ctx.save(); ctx.shadowColor = '#fff'; ctx.shadowBlur = cell * 0.3;
        ctx.strokeStyle = `rgba(255,255,255,${0.55 + pulse * 0.45})`; ctx.lineWidth = cell * 0.1;
        ctx.beginPath(); ctx.arc(x + (c + 0.5) * cell, y + (r + 0.5) * cell, rad * (0.92 + pulse * 0.08), 0, 7); ctx.stroke();
        ctx.restore();
      }
    }
    PP.drawFx();

    // stato
    if (PP.state !== 'menu') {
      let msg;
      if (winner) msg = winner === 3 ? 'Draw' : mode === 1 ? `${winner === 1 ? 'Red' : 'Yellow'} wins` : winner === 1 ? 'You win!' : 'Computer wins';
      else if (mode === 1) msg = `${turn === 1 ? 'Red' : 'Yellow'}'s turn`;
      else msg = turn === 1 ? 'Your turn' : 'Computer is thinking…';
      PP.circle(24, 34, 9, COL[winner && winner !== 3 ? winner : turn]);
      PP.text(msg, 42, 35, 18, '#fff', 'left', 800);
      if (mode === 0) PP.text(`${LEVELS[level]} · W ${stats.w}  L ${stats.l}  D ${stats.d}`, 16, 60, 12, 'rgba(255,255,255,.6)', 'left', 600);
    }
  }

  // ── INPUT ────────────────────────────────────────
  const colAt = px => clamp(Math.floor((px - geo.x) / geo.cell), 0, C - 1);
  function pointerMove(p) { if (!isAiTurn()) hoverCol = colAt(p.x); }
  function pointerDown(p) {
    if (isAiTurn() || winner) return;
    if (p.x < geo.x - geo.cell * 0.3 || p.x > geo.x + geo.cell * (C + 0.3)) return;
    hoverCol = colAt(p.x);
    play(hoverCol);
  }
  function keyDown(code) {
    if (isAiTurn() || winner) return;
    if (code === 'ArrowLeft' || code === 'KeyA') { hoverCol = Math.max(0, hoverCol - 1); sfx.click(); }
    if (code === 'ArrowRight' || code === 'KeyD') { hoverCol = Math.min(C - 1, hoverCol + 1); sfx.click(); }
    if (code === 'Space' || code === 'Enter' || code === 'ArrowDown') play(hoverCol);
    const n = parseInt(code.replace('Digit', ''), 10);
    if (n >= 1 && n <= 7) { hoverCol = n - 1; play(hoverCol); }
  }

  function demo(n) {
    const boards = {
      1: ['.......', '.......', '...2...', '..21...', '..121..', '.11222.'],
      2: ['.......', '...1...', '..21...', '.2112..', '.21221.', '1121222'],
      3: ['.......', '.......', '.......', '...2...', '..11...', '..12...'],
    }[n];
    board = boards.map(row => [...row].map(ch => ch === '.' ? 0 : +ch));
    moves = board.flat().filter(Boolean).length;
    winner = 0; winLine = null; falling = null; aiThinking = false;
    turn = 1; hoverCol = n === 3 ? 4 : 2;
    if (n === 2) { winner = 1; winLine = [[5, 0], [4, 1], [3, 2], [2, 3]]; board[2][3] = 1; board[3][2] = 1; board[4][1] = 1; board[5][0] = 1; }
    if (n === 3) { falling = { c: 4, r: 4, y: geo.cell * 1.6, vy: 0, p: 1, bounced: 3 }; PP.game.update = () => {}; }
  }

  function icon(c, S) {
    const g = c.createLinearGradient(0, 0, 0, S); g.addColorStop(0, '#1a2d63'); g.addColorStop(1, '#0a1430');
    c.fillStyle = g; c.fillRect(0, 0, S, S);
    const cell = S * 0.15, x0 = S / 2 - cell * 2, y0 = S / 2 - cell * 2;
    const grid = ['.2..', '.12.', '2121', '1112'];
    c.fillStyle = '#3a6df0'; c.beginPath(); c.roundRect(x0 - cell * 0.15, y0 - cell * 0.15, cell * 4.3, cell * 4.3, cell * 0.4); c.fill();
    const keep = PP.ctx;
    for (let r = 0; r < 4; r++) for (let k = 0; k < 4; k++) {
      const v = grid[r][k], cx = x0 + (k + 0.5) * cell, cy = y0 + (r + 0.5) * cell;
      if (v === '.') { c.fillStyle = '#0d1b45'; c.beginPath(); c.arc(cx, cy, cell * 0.38, 0, 7); c.fill(); }
      else discOn(c, cx, cy, cell * 0.38, +v);
    }
    void keep;
  }
  function discOn(c, x, y, r, p) {
    const g = c.createRadialGradient(x - r * 0.3, y - r * 0.35, r * 0.1, x, y, r);
    g.addColorStop(0, p === 1 ? '#ff8a95' : '#ffe58a'); g.addColorStop(1, p === 1 ? '#d61f35' : '#e0a400');
    c.fillStyle = g; c.beginPath(); c.arc(x, y, r, 0, 7); c.fill();
    c.strokeStyle = 'rgba(0,0,0,.18)'; c.lineWidth = r * 0.12; c.beginPath(); c.arc(x, y, r * 0.66, 0, 7); c.stroke();
  }

  const realUpdate = update;
  PP.run({
    id: GAME_ID,
    title: 'Four in a Row',
    intro: 'Drop your discs and line up four in a row — across, down or diagonally.',
    bestText: () => mode === 0 ? `${LEVELS[level]}: ${stats.w} wins · ${stats.l} losses · ${stats.d} draws` : '',
    choices: () => [
      { label: 'Opponent', options: MODES, value: mode, onChange: i => { mode = i; store.set('mode', i); PP.showMain(); } },
      ...(mode === 0 ? [{ label: 'Difficulty', options: LEVELS, value: level, onChange: i => { level = i; store.set('level', i); stats = store.get(statsKey(), { w: 0, l: 0, d: 0 }); PP.showMain(); } }] : []),
    ],
    noPause: false,
    pauseText: () => (mode === 0 ? `${LEVELS[level]} difficulty` : 'Two players'),
    init() { mode = store.get('mode', 0); level = store.get('level', 1); stats = store.get(statsKey(), { w: 0, l: 0, d: 0 }); board = Array.from({ length: R }, () => Array(C).fill(0)); },
    start() { PP.game.update = realUpdate; PP.game.overDelay = 650; start(); },
    update, draw, pointerDown, pointerMove, keyDown, demo, icon,
    resize: layout,
  });
})();
