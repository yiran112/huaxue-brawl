// 调试用测试驱动（不属于游戏本体）。
// 浏览器窗口在后台时 requestAnimationFrame 会被节流，这里用固定步长手动推进模拟。
// 用法：在控制台执行  await import('/ref/harness.js')  之后调用 __sim(秒数)、__stat()
const g = window.game;

if (!window.__errs) {
  window.__errs = [];
  window.addEventListener('error', (e) => window.__errs.push(`${e.message} @${(e.filename || '').split('/').pop()}:${e.lineno}`));
  window.addEventListener('unhandledrejection', (e) => window.__errs.push('rej: ' + e.reason));
}

// 推进 seconds 秒。auto=true 时玩家借用机器人的转向逻辑（经由键盘状态，模拟数字输入）
window.__sim = (seconds, auto = true) => {
  const dt = 1 / 60;
  const n = Math.round(seconds / dt);
  let err = null;
  for (let i = 0; i < n; i++) {
    try {
      const p = g.player;
      if (auto && p && g.state === 'race' && !p.finished) {
        p.think(dt);
        const sp = p.input.spin;
        g.keys.left = sp ? sp < 0 : p.input.steer < -0.25;
        g.keys.right = sp ? sp > 0 : p.input.steer > 0.25;
        g.keys.up = p.input.tuck;
        g.keys.down = p.input.brake || p.input.grab;
        g.keys.drift = p.input.drift || !!sp;
        g.keys.flipB = p.input.flip > 0;
        // __autoTricks：玩家离地时按预估滞空安排空翻 / 转体 / 抓板（经由键盘）
        const T = window.__autoTricks;
        if (T) {
          if (!p.grounded && p.state === 'ski') {
            if (!T.plan) {
              const air = p.predictAir() + p.airT;
              T.plan = {
                flipN: T.flip === false ? 0 : Math.max(0, Math.min(2, Math.floor((air - 0.3) / 0.85))),
                spinN: T.spin ? Math.max(0, Math.min(2, Math.floor((air - 0.35) / 0.75))) : 0,
                dir: Math.random() < 0.5 ? -1 : 1,
                grabEnd: T.grab && air > 0.9 ? air - 0.35 : 0,
              };
            }
            const P = T.plan;
            g.keys.flipB = P.flipN > 0 && Math.abs(p.flip) < 6.2832 * P.flipN - 0.05;
            const spin = P.spinN > 0 && Math.abs(p.spinA) < 6.2832 * P.spinN - 0.05;
            g.keys.drift = spin;
            g.keys.left = spin && P.dir < 0;
            g.keys.right = spin && P.dir > 0;
            g.keys.down = p.airT > 0.12 && p.airT < P.grabEnd;
          } else {
            T.plan = null;
          }
        }
      }
      g.update(dt);
    } catch (e) {
      err = String((e && e.stack) || e).slice(0, 700);
      break;
    }
  }
  g.renderer.render(g.scene, g.camera);
  return { err };
};

// 一直推进到 pred() 为真（或超时），返回停止原因
window.__until = (pred, maxSeconds = 60, step = 0.05) => {
  for (let t = 0; t < maxSeconds; t += step) {
    const r = window.__sim(step);
    if (r.err) return 'ERR ' + r.err;
    if (pred()) return 'hit';
  }
  return 'timeout';
};

// 近道测试：把玩家放到第 bi 个岔路入口前，按 mode 跑到岔路区结束，返回用时和翻车次数。
// mode: 'drift' 走近道并漂移 / 'nodrift' 走近道但不漂移 / 'main' 走主路。vmax：之字入口处的限速（99 = 不减速）
window.__shortcutTest = (bi, mode, vmax = 99, v0 = 34) => {
  const c = g.course;
  const b = c.branches[bi];
  const p = g.player;
  const startD = b.path[0].d - 70;
  const endD = b.d1 + 60;
  const p0 = b.path[0];
  // 起点放在进场线的延长线上，朝向沿主路
  const yaw = Math.atan2(-(c.cx(startD + 6) - c.cx(startD - 6)) / 12, 1);
  const x0 = mode === 'main' ? c.cx(startD) : p0.x + (c.cx(startD) - c.cx(p0.d));
  p.place(x0, -startD, yaw);
  p.vel.set(-Math.sin(yaw) * v0, 0, -Math.cos(yaw) * v0);
  p.state = 'ski';
  p.invulnT = 0; p.tumbleT = 0; p.frozenT = 0; p.turboT = 0; p.boostT = 0; p.flip = 0; p.drifting = false;
  p.hits = 0;
  p.ai.scSeen = new Set(c.branches);
  p.ai.sc = mode === 'main' ? null : { b, i: 0, vmax };
  g.camYaw = yaw;
  let respawns = 0;
  const where = [];
  const orig = p.respawn.bind(p);
  p.respawn = () => { respawns++; where.push(`respawn@${Math.round(p.d - b.d0)} u=${c.offTrack(p.pos.x, p.d).toFixed(0)} v=${p.speed.toFixed(0)}`); return orig(); };
  const origKnock = g.onKnock.bind(g);
  g.onKnock = (v, s, cause, f) => { if (v === p) where.push(`${cause}@${Math.round(p.d - b.gate.d)}`); return origKnock(v, s, cause, f); };
  const noDrift = mode === 'nodrift';
  let t = 0, minV = 99, maxV = 0, enteredIce = false, turbo = 0, vGate = 0, err = null;
  const slow = { v: 99, at: 0, u: 0 };
  const dt = 1 / 60;
  while (p.d < endD && t < 60) {
    try {
      p.think(dt);
      if (noDrift) p.input.drift = false;
      g.keys.left = p.input.steer < -0.25;
      g.keys.right = p.input.steer > 0.25;
      g.keys.up = p.input.tuck;
      g.keys.down = p.input.brake;
      g.keys.drift = p.input.drift;
      g.update(dt);
    } catch (e) { err = String((e && e.stack) || e).slice(0, 500); break; }
    t += dt;
    if (p.d > b.gate.d && p.d < b.gate.d + 45) minV = Math.min(minV, p.speed);
    if (!vGate && p.d > b.gate.d - 6) vGate = p.speed;
    maxV = Math.max(maxV, p.speed);
    if (p.onIce) enteredIce = true;
    if (p.turboT > 0) turbo += dt;
    if (p.speed < slow.v) { slow.v = p.speed; slow.at = Math.round(p.d - b.d0); slow.u = c.offTrack(p.pos.x, p.d); }
  }
  p.respawn = orig;
  g.onKnock = origKnock;
  g.keys.left = g.keys.right = g.keys.up = g.keys.down = g.keys.drift = false;
  g.renderer.render(g.scene, g.camera);
  return { mode, vmax, time: +t.toFixed(2), crashes: p.hits, respawns, where: where.join(' | '), slow: `minV=${slow.v.toFixed(0)}@${slow.at} u=${slow.u.toFixed(0)}`, enteredIce, vGate: Math.round(vGate), minVinZ: Math.round(minV), maxV: Math.round(maxV), exitV: Math.round(p.speed), turbo: +turbo.toFixed(1), err };
};

// 坡地测试：把玩家放到第 fi 个特殊坡地前，直线俯冲过去。
// flip=true 时离地瞬间按预估滞空决定翻几圈（按住 E）。返回每段滞空、落地结果、通过用时
window.__featureTest = (fi, v0, flip, maxFlips = 3) => {
  const c = g.course;
  const f = c.features[fi];
  const p = g.player;
  const dt = 1 / 60;
  const startD = f.d - f.pre - 30;
  const endD = f.d + f.post + 40;
  const yaw = Math.atan2(-(c.cx(startD + 6) - c.cx(startD - 6)) / 12, 1);
  p.place(c.cx(startD), -startD, yaw);
  p.vel.set(-Math.sin(yaw) * v0, 0, -Math.cos(yaw) * v0);
  p.state = 'ski';
  p.invulnT = 0; p.tumbleT = 0; p.frozenT = 0; p.turboT = 0; p.boostT = 0; p.flip = 0; p.drifting = false;
  p.hits = 0;
  const airs = [];
  const result = [];
  const oT = g.onTrick.bind(g);
  g.onTrick = (r, name, n) => { if (r === p) result.push(`${name}x${n}`); return oT(r, name, n); };
  const oK = g.onKnock.bind(g);
  g.onKnock = (v, s, cause, ff) => { if (v === p) result.push('X' + cause); return oK(v, s, cause, ff); };
  let t = 0, was = true, plan = 0, cur = 0, turbo = 0, err = null;
  while (p.d < endD && t < 20) {
    const diff = Math.atan2(-(c.cx(p.d + 30) - p.pos.x), 30) - p.yaw;
    g.keys.left = diff > 0.06;
    g.keys.right = diff < -0.06;
    g.keys.up = true;
    if (was && !p.grounded) plan = flip ? Math.max(0, Math.min(maxFlips, Math.floor((p.predictAir() - 0.25) / 0.85))) : 0;
    g.keys.flipB = !p.grounded && plan > 0 && Math.abs(p.flip) < 6.2832 * plan - 0.05;
    if (!p.grounded) cur = p.airT;
    else if (!was) { if (cur > 0.3) airs.push(+cur.toFixed(2)); cur = 0; }
    was = p.grounded;
    try { g.update(dt); } catch (e) { err = String((e && e.stack) || e).slice(0, 400); break; }
    if (p.turboT > 0) turbo += dt;
    t += dt;
  }
  g.onTrick = oT;
  g.onKnock = oK;
  g.keys.left = g.keys.right = g.keys.up = g.keys.flipB = false;
  return { type: f.type, d: Math.round(f.d), v0, flip, airs, result: result.join(' '), time: +t.toFixed(2), exitV: Math.round(p.speed), turbo: +turbo.toFixed(1), err };
};

// 整场比赛：玩家借用机器人逻辑，跑到全部完赛。统计翻车原因、空翻、漂移喷射、抄近道
window.__raceTest = (seed, difficulty) => {
  const saved = { ...g.rules };
  g.rules.difficulty = difficulty;
  g.seed = seed;
  g.buildWorld();
  g.startRace(false);
  const c = g.course;
  const causes = {};
  const tricks = {};
  const sc = { tried: 0, ice: 0 };
  const seenTry = new Set();
  const seenIce = new Set();
  let driftBoosts = 0, maxAir = 0, err = null, steps = 0;
  const oK = g.onKnock.bind(g);
  g.onKnock = (v, s, cause, f) => { causes[cause] = (causes[cause] || 0) + 1; return oK(v, s, cause, f); };
  const oT = g.onTrick.bind(g);
  g.onTrick = (r, name, n) => { const k = `${r.isPlayer ? '玩家' : '机器人'}${name}x${n}`; tricks[k] = (tricks[k] || 0) + 1; return oT(r, name, n); };
  const oD = g.onDriftBoost.bind(g);
  g.onDriftBoost = (r, big) => { driftBoosts++; return oD(r, big); };
  while (steps < 60 * 400) {
    const r = window.__sim(0.25);
    steps += 15;
    if (r.err) { err = r.err; break; }
    for (const q of g.racers) {
      if (q.ai.sc && !seenTry.has(q.name + q.ai.sc.b.d0)) { seenTry.add(q.name + q.ai.sc.b.d0); sc.tried++; }
      if (q.onIce && q.inShort && !seenIce.has(q.name + q.inShort.d0)) { seenIce.add(q.name + q.inShort.d0); sc.ice++; }
      if (!q.grounded && q.state === 'ski' && q.airT > maxAir) maxAir = q.airT;
    }
    if (g.racers.every((q) => q.finished)) break;
  }
  g.onKnock = oK;
  g.onTrick = oT;
  g.onDriftBoost = oD;
  const out = {
    seed, difficulty, L: Math.round(c.L), err,
    branches: c.branches.map((b) => `${Math.round(b.d0)}:省${Math.round(b.saved)}m`).join(' '),
    features: c.features.map((f) => f.type[0] + Math.round(f.d)).join(' '),
    raceTime: +g.raceTime.toFixed(1), causes, tricks, sc, driftBoosts, maxAir: +maxAir.toFixed(2),
    racers: g.order.map((r) => `${r.rank}.${r.isPlayer ? 'P' : 'b'} ${r.finished ? r.finishTime.toFixed(1) : 'DNF d=' + Math.round(r.d)} hits=${r.hits} tr=${r.tricks}`),
  };
  Object.assign(g.rules, saved);
  return out;
};

// 一局完整的比赛（快速赛 / 杯赛 / 挑战）：start() 负责开赛，跑到结算面板出来为止
window.__modeTest = (start, maxSec = 420) => {
  g.toMenu();
  window.__errs.length = 0;
  start();
  let err = null;
  let t = 0;
  let maxModeHud = '';
  while (t < maxSec) {
    const r = window.__sim(0.5);
    t += 0.5;
    if (r.err) { err = r.err; break; }
    const hud = document.getElementById('modeBox').textContent;
    if (hud) maxModeHud = hud;
    if (g.state === 'results') break;
  }
  const txt = (id) => document.getElementById(id).innerText.replace(/\s*\n\s*/g, ' | ');
  return {
    err, errs: window.__errs.slice(), state: g.state, mode: g.mode.key, track: g.trackDef ? g.trackDef.id : 'random',
    L: Math.round(g.course.L), raceTime: +g.raceTime.toFixed(1), racers: g.racers.length,
    out: g.racers.filter((r) => r.out).length, hud: maxModeHud,
    title: txt('resTitle'), sub: g.ui.lastResults?.sub ?? '', rows: txt('resList'), reward: txt('resReward'),
    next: document.getElementById('btnNext').textContent,
    rep: JSON.stringify(g.rep),
  };
};

window.__stat = () => ({
  state: g.state,
  theme: g.themeKey,
  raceTime: +g.raceTime.toFixed(1),
  ents: g.entities.map((e) => e.constructor.name).join(','),
  particles: g.fx.lit.list.length + g.fx.glow.list.length,
  drawCalls: g.renderer.info.render.calls,
  tris: g.renderer.info.render.triangles,
  errs: window.__errs,
  racers: g.order.map(
    (r) => `${r.rank}.${r.name} ${r.state}${r.finished ? `(F ${r.finishTime.toFixed(1)})` : ''} d=${Math.round(r.d)} v=${Math.round(r.speed)} w=${r.weapon || '-'} hits=${r.hits}`
  ),
});
