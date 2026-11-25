import { WEAPONS, MODES, POINTS } from '../src/config.js';
import { cleanNick, seasonNow, seasonLeftText, seasonReward, TASK_BONUS, TASK_BONUS_PARTS, TASK_COINS, TASK_PARTS, TASK_XP } from '../src/profile.js';
import { clamp, fmtTime } from '../src/util.js';
import { drawHall, drawHome, drawModePicker, drawRankMenu, drawRoom, drawTrackMenu, taskResetText } from './lobby-ui.js';
import { drawShowroom } from './showroom-ui.js';
import { card, chip, gradient, hit, meter, pageHeader, scrim, GOLD, NAVY, PALE, ribbon } from './paint.js';

const SETTINGS = [
  ['match', '🎮', '对局', 'MATCH'],
  ['items', '🎁', '道具', 'ITEMS'],
  ['video', '🖥️', '画面声音', 'VIDEO & SOUND'],
  ['keys', '⌨️', '操作', 'CONTROLS'],
  ['guide', '📖', '玩法说明', 'GUIDE'],
];
const TASK_ICONS = {
  race3: '🏁', hit5: '💥', flip10: '🤸', drift8: '💨', short2: '🧱', podium2: '🏅', win1: '🏆',
  modes2: '🎮', pad6: '⚡', cup1: '🏅', chain4: '✨', skill20k: '🤸', spin5: '🌀', grab5: '🏂',
};
const TASK_TIPS = {
  race3: '什么模式都行，打完一场算一次', hit5: '用道具把对手打飞', flip10: '腾空后按住跳跃，落地前转正',
  drift8: '漂移蓄力后松手，触发加速', short2: '降速后连漂两弯，穿过石墙近道',
  podium2: '完成比赛并进入前三名', win1: '抢先冲线或赢下本局', modes2: '在模式选择里换不同玩法',
  pad6: '滑过赛道上闪着箭头的加速带', cup1: '在首页打开排位赛，打完一场',
  chain4: '连续做动作，并成功结算技巧链', skill20k: '空翻、转体、漂移都能积累分数',
  spin5: '空中按住漂移，再配合方向键', grab5: '空中按住刹车，落地前松开',
};

export function drawMenu(ui) {
  if (ui.tab === 'set') {
    drawSettings(ui);
  } else if (ui.tab !== 'race') {
    drawShowroom(ui);
  } else {
    const page = ui.panelPage || ui.racePick;
    const draw = { mode: drawModePicker, track: drawTrackMenu, rank: drawRankMenu, hall: drawHall, room: drawRoom, tasks: drawTasks }[page] || drawHome;
    draw(ui);
  }
  if (ui.queue && (ui.tab !== 'race' || ui.panelPage || ui.racePick !== 'home')) {
    const g = ui.game;
    const x = ui.w / 2 - 139, y = ui.t + 6;
    card(ui, { x, y, w: 278, h: 34 }, ['#ffb03a', '#ff5a2a'], { radius: 18, stroke: '#ffd9a0', width: 2, shadow: 4 });
    ui.text(ui.queue.info || ui.queue.label, x + 15, y + 17, { size: 14, bold: true, max: 177 });
    chip(ui, '取消', { x: x + 210, y: y + 2, w: 65, h: 30 }, () => g.cancelMatch(), { size: 14, radius: 17 });
  }
}

function optionGroup(ui, box, title, options, selected, apply) {
  const { x, y, w, h } = box;
  ui.panel(x, y, w, h, 'rgba(255,255,255,.075)', 12, null);
  ui.panel(x + 16, y + 19, 8, 8, GOLD, 4, null);
  ui.paragraph(title, x + 32, y + 23, Math.min(w * .29, 220), { size: 15, color: '#fff', bold: true, lines: 2 });
  let left = x + Math.min(w * .34, 253);
  const available = x + w - 14;
  const base = (available - left - (options.length - 1) * 6) / options.length;
  for (const [value, label] of options) {
    const width = Math.min(base, Math.max(62, 21 + label.length * 13));
    chip(ui, label, { x: left, y: y + 14, w: width, h: 34 }, () => apply(value), {
      fill: value === selected ? gradient(ui.ctx, left, y, 0, h, '#ffe973', '#ffbd12') : '#ffffff1c',
      color: value === selected ? NAVY : '#fff', size: 14,
    });
    left += width + 6;
  }
}

function note(ui, box, text) {
  ui.panel(box.x, box.y, box.w, box.h, 'rgba(255,255,255,.052)', 10, null);
  ui.paragraph(text, box.x + 14, box.y + 20, box.w - 28, { size: 13, color: PALE, lines: Math.max(1, Math.floor(box.h / 20)), bold: true });
}

function drawSettings(ui) {
  const g = ui.game, r = g.soloRules;
  const category = ui.panelPage || 'match';
  const active = SETTINGS.find(([key]) => key === category) || SETTINGS[0];
  const y = pageHeader(ui, '设置');
  const x = ui.l, w = ui.r - x, h = ui.b - y;
  card(ui, { x, y, w, h }, 'rgba(11,21,48,.95)', { radius: 21, stroke: '#ffffff45', shadow: 0 });
  ui.panel(x + 3, y + 3, 230, h - 6, 'rgba(3,11,32,.36)', 13, null);
  SETTINGS.forEach(([key, icon, name, en], i) => {
    const box = { x: x + 16, y: y + 20 + i * 62, w: 202, h: 56 };
    const on = key === category;
    card(ui, box, on ? ['#ffe973', '#ffc51d'] : 'rgba(255,255,255,.065)', { radius: 11, stroke: null, shadow: on ? 3 : 0 });
    ui.text(icon, box.x + 16, box.y + 29, { size: 22 });
    ui.text(name, box.x + 54, box.y + 22, { size: 17, bold: true, color: on ? NAVY : '#fff' });
    ui.text(en, box.x + 55, box.y + 39, { size: 10, bold: true, color: on ? '#765323' : '#a8b6cd' });
    hit(ui, box, name, () => ui.page(key));
  });
  const body = { x: x + 255, y: y + 77, w: w - 280, h: h - 92 };
  ui.text(`${active[1]}  ${active[2]}`, body.x, y + 38, { size: 24, bold: true });
  ui.text(active[3], body.x + 59 + active[2].length * 24, y + 41, { size: 12, bold: true, color: PALE });
  ui.panel(body.x, y + 61, body.w, 2, '#ffffff2c', 1, null);
  const onOff = [[true, '开启'], [false, '关闭']];
  const mode = r.mode;
  let groups = [], notes = [], weapons = false;
  if (category === 'match') {
    if (!['tt', 'team'].includes(mode)) groups.push(['bots', '机器人补位（总人数 = 你 + 机器人）',
      (mode === 'elim' ? [3, 5, 7] : [0, 1, 3, 5, 7]).map((n) => [n, n ? `${n} 个` : '独自练习'])]);
    if (mode !== 'tt') groups.push(['difficulty', '机器人难度', [[0, '简单'], [1, '普通'], [2, '困难']]]);
    if (mode === 'race' || mode === 'speed') {
      groups.push(['rounds', '锦标赛轮数', [[1, '单局'], [3, '3 轮'], [5, '5 轮']]]);
      notes.push(`锦标赛按每轮名次累计积分（${POINTS.join(' / ')}）。`);
    }
    notes.push(`${MODES[mode].icon} ${MODES[mode].name} · ${MODES[mode].desc}。`);
  } else if (category === 'items') {
    groups = [['items', '道具', [[true, '开启'], [false, '禁用道具（纯竞速）']]],
      ['itemRate', '道具箱密度', [[0, '稀少'], [1, '正常'], [2, '密集']]], ['wildlife', '野生动物袭击', onOff]];
    weapons = true;
  } else if (category === 'video') {
    groups = [['quality', '画质', [['auto', '自动'], ['high', '高'], ['mid', '中'], ['low', '低']]],
      ['shadows', '实时阴影（卡顿时可关闭）', onOff], ['mute', '声音', [[false, '开启'], [true, '静音']]]];
  } else if (category === 'keys') {
    notes = ['◀ / ▶　左右转向。默认自动俯冲，按住刹车可减速。',
      '跳　地面按下起跳，腾空后再按住可后空翻。落地前把雪板摆正。',
      '漂移 + 方向　转得更急，松开时按蓄力喷射。腾空时可用来转体。',
      '刹车　腾空时按住可抓板，落地前松开。',
      '道具 / 氮气　使用当前道具，或消耗一格氮气加速。',
      '表情 / 复位 / 暂停　位于右上角。'];
  } else {
    notes = ['撞上蓝紫色泡泡获得随机道具。名次越靠后，越容易拿到强力道具。',
      '翻跟头　红旗大跳台、黄旗断崖、绿旗波浪坡都能飞起来。转满整圈并站稳落地可加速。',
      '技巧链　空翻、转体、抓板、漂移和命中会累积分数与倍率。摔倒会打断技巧链。',
      '近道　山路两侧的石墙是入口。先降到 100 km/h 以下，再漂过之字弯。',
      '地形　冰面快但抓地弱。深雪减速，加速带提速。注意雪地摩托、滚石和雪崩。',
      '装备　车库用改装币升级，商城用雪花币购买。不同装备在转向、空中和抗击飞方面各有特点。'];
  }
  const entries = Object.entries(WEAPONS);
  const total = groups.length * 69 + notes.length * 55 + (weapons ? 34 + Math.ceil(entries.length / 6) * 43 : 0);
  ui.scrollArea('settings-' + category, body, total, (offset) => {
    let yy = body.y - offset;
    for (const [key, title, values] of groups) {
      optionGroup(ui, { x: body.x, y: yy, w: body.w, h: 61 }, title, values, key === 'mute' ? g.sfx.muted : r[key], (value) => {
        if (key === 'mute') {
          g.sfx.setMuted(value);
          wx.setStorageSync('huaxue_wechat_mute', value ? 1 : 0);
        } else g.setRule(key, value);
        ui.invalidate();
      });
      yy += 69;
    }
    for (const text of notes) {
      note(ui, { x: body.x, y: yy, w: body.w, h: 45 }, text);
      yy += 55;
    }
    if (weapons) {
      ui.text('武器池', body.x + 15, yy + 15, { size: 16, bold: true });
      const cw = (body.w - 30) / 6;
      entries.forEach(([key, weapon], i) => {
        const banned = r.banned.includes(key);
        chip(ui, weapon.icon + ' ' + weapon.name, { x: body.x + (i % 6) * (cw + 6), y: yy + 33 + Math.floor(i / 6) * 43, w: cw, h: 35 },
          () => { g.toggleBan(key); ui.invalidate(); }, { fill: banned ? '#603242' : '#ffffff24', color: banned ? '#d8aab7' : '#fff', size: 13 });
      });
    }
  });
}

function taskHeader(ui, box, { name, title, countdown, count, colors, ink, labels }) {
  const { x, y, w, h } = box;
  card(ui, box, colors, { radius: 16, stroke: null, stripe: .18, shadow: 0 });
  ui.text(name, x + 15, y + 15, { size: 12, bold: true, color: ink });
  ui.text(title, x + 15, y + 39, { size: 24, bold: true, italic: true, color: ink });
  ui.text(countdown, x + 73, y + 40, { size: 13, bold: true, color: ink, max: w - 89 });
  chip(ui, count, { x: x + w - 146, y: y + 7, w: 134, h: 21 }, null, { fill: '#271c335c', size: 12, radius: 13 });
  const timelineX = x + 34;
  const timelineW = w - 68;
  const timelineY = y + h - 16;
  ui.panel(timelineX, timelineY - 2, timelineW, 4, '#271c335c', 2, null);
  labels.forEach((label, i) => {
    const width = String(label).length > 2 ? 50 : 27;
    const cx = timelineX + timelineW * i / (labels.length - 1);
    chip(ui, label, { x: cx - width / 2, y: timelineY - 11, w: width, h: 22 }, null, { fill: '#271c336b', size: 12, radius: 12 });
  });
}

function taskRow(ui, box, { icon, title, desc, progress, ratio = 0, prize, status, openBoard }) {
  const { x, y, w, h } = box;
  const top = y + (h - 64) / 2;
  const contentX = x + 56;
  const sideW = Math.min(128, w * .32);
  const sideX = x + w - sideW - 12;
  const contentW = sideX - contentX - 10;
  ui.panel(x + 12, top + 15, 34, 34, '#ede6fb', 17, '#c6b2ef');
  ui.text(icon, x + 29, top + 32, { size: 20, center: true });
  ui.text(title, contentX, top + 13, { size: 16, color: '#332d49', bold: true, max: contentW });
  ui.text(desc, contentX, top + 31, { size: 13, color: '#655f78', bold: true, max: contentW });
  meter(ui, contentX, top + 43, contentW, 15, ratio, '#6b41cf', '#31294c');
  ui.text(progress, contentX + contentW / 2, top + 51, { size: 12, bold: true, center: true, max: contentW - 8 });
  if (openBoard) {
    chip(ui, '看榜单 ›', { x: sideX + sideW - 90, y: top + 16, w: 90, h: 32 }, openBoard, {
      fill: '#e4edff', color: '#345fb8', radius: 14, size: 13,
    });
  } else {
    chip(ui, prize, { x: sideX, y: top + 9, w: sideW, h: 24 }, null, { fill: '#eee8f9', color: '#6738c9', size: 13, radius: 12 });
    ui.text(status, sideX + sideW / 2, top + 47, { size: 12, color: '#716381', bold: true, center: true, max: sideW });
  }
  ui.panel(x + 12, y + h - 1, w - 24, 1, '#e9e5f0', 0, null);
}

function drawTasks(ui) {
  const p = ui.game.profile;
  const tasks = p.dailyTasks();
  const done = tasks.filter((t) => t.done).length;
  const season = seasonNow();
  const data = p.data.season?.id === season.id ? p.data.season : {};
  const dailyRows = tasks.map((task) => ({
    icon: TASK_ICONS[task.id], title: task.name, desc: TASK_TIPS[task.id],
    progress: `${Math.min(task.prog, task.goal)} / ${task.goal}`, ratio: task.prog / task.goal,
    prize: `❄ +${TASK_COINS}  ⬢ +${TASK_PARTS}`, status: task.done ? '✔ 已到账' : `+${TASK_XP} 经验 · 进行中`,
  }));
  const weeklyRows = [
    ['🏅', '赛季积分', '快速赛、联机赛完赛按名次计分', `${data.points || 0} 分`, 'points'],
    ['💥', '本周击飞', '记录比赛里击飞对手的次数', `${data.hits || 0} 次`, 'hits'],
    ['⏱', '计时赛最好成绩', '固定赛道用时 ÷ 金牌时间', data.ttTime ? fmtTime(data.ttTime) : '本周还没有成绩', 'tt'],
  ].map(([icon, title, desc, progress, key]) => ({
    icon, title, desc, progress,
    openBoard: () => {
      ui.boardKey = key;
      ui.page('');
      ui.refreshBoard();
    },
  }));
  const columns = [
    {
      rows: dailyRows, name: '每日任务', title: '今天', countdown: taskResetText(), count: `已完成 ${done} / ${tasks.length}`,
      colors: ['#ffca58', '#e18815'], ink: '#422407', labels: [...tasks.map((_, i) => i + 1), '🎁'],
      reward: '🏅  全勤奖励', detail: `❄ +${TASK_BONUS}  ⬢ +${TASK_BONUS_PARTS}  ·  完成全部任务后发放`,
      rewardFill: '#fff4d6', rewardStroke: '#edca73', rewardInk: '#755737',
    },
    {
      rows: weeklyRows, name: `第 ${season.id} 赛季`, title: '本周', countdown: seasonLeftText(season.left),
      count: `我的积分 ${data.points || 0}${ui.game.account.ready ? '' : ' · 离线'}`,
      colors: ['#9870dc', '#7044c6'], ink: '#fff', labels: ['前 50', '前 10', '前 3', '👑'],
      reward: '🏆  赛季奖励', detail: `第 1 名 ❄${seasonReward(1)}  ·  第 2–3 名 ❄${seasonReward(2)}  ·  第 4–10 名 ❄${seasonReward(4)}`,
      rewardFill: '#eee6fc', rewardStroke: '#cdb4f8', rewardInk: '#664eb1',
    },
  ];

  scrim(ui, 'rgba(14,20,52,.94)');
  const y = pageHeader(ui, '任务', () => ui.page('')) + 1;
  const width = Math.min(1080, ui.r - ui.l);
  const area = { x: (ui.l + ui.r - width) / 2, y, w: width, h: ui.b - y };
  const gap = 12;
  const w = (width - gap) / 2;
  const headerH = 86, rewardH = 58, inset = 10;
  const rowCount = Math.max(dailyRows.length, weeklyRows.length);
  const rowH = clamp(Math.floor((area.h - headerH - rewardH - inset * 2) / rowCount), 64, 74);
  const contentH = headerH + rowH * rowCount + rewardH + inset * 2;
  ui.scrollArea('tasks', area, contentH, (offset) => {
    columns.forEach((column, i) => {
      const x = area.x + i * (w + gap);
      const top = area.y - offset;
      ui.panel(x, top, w, contentH, '#fbfafc', 16, null);
      taskHeader(ui, { x, y: top, w, h: headerH }, column);
      column.rows.forEach((row, index) => taskRow(ui, { x, y: top + headerH + index * rowH, w, h: rowH }, row));
      const rewardY = top + headerH + rowH * rowCount + inset;
      ui.panel(x + 12, rewardY, w - 24, rewardH, column.rewardFill, 12, column.rewardStroke);
      ui.text(column.reward, x + 25, rewardY + 18, { size: 16, bold: true, color: '#332d49' });
      ui.text(column.detail, x + 25, rewardY + 39, { size: 13, bold: true, color: column.rewardInk, max: w - 50 });
    });
  });
}

export function drawMatch(ui) {
  const info = ui.match || {};
  const g = ui.game;
  const y = pageHeader(ui, info.id ? `好友房间 #${info.id}` : '好友房间', () => g.cancelMatch()) + 10;
  const x = ui.l, w = Math.min(440, ui.r - x);
  const players = info.players || [];
  const h = Math.min(ui.b - y, 176 + Math.max(players.length, info.max || 0) * 31);
  card(ui, { x, y, w, h }, 'rgba(11,21,48,.87)', { radius: 21, stroke: '#ffffff55', shadow: 3 });
  const status = info.status || `${players.length} / ${info.max || 8} 人${ui.matchSeconds ? ` · ${ui.matchSeconds} 秒` : ''}`;
  ui.text(status, x + 22, y + 28, { bold: true, size: 17, color: info.error ? '#ff5a6a' : GOLD, max: w - 48 });
  const list = { x: x + 22, y: y + 51, w: w - 44, h: h - 126 };
  ui.scrollArea('match', list, (info.max || players.length) * 30, (offset) => {
    for (let i = 0; i < (info.max || players.length); i++) {
      const p = players[i];
      const yy = list.y + i * 30 - offset;
      const me = p && p.id === info.me;
      ui.panel(list.x, yy, list.w, 27, me ? GOLD : '#ffffff19', 10, null);
      ui.text(p ? p.name + (me ? '（你）' : '') : '等待玩家加入…', list.x + 13, yy + 14, {
        bold: !!p, size: 14, color: me ? NAVY : p ? '#fff' : PALE, max: list.w - 24,
      });
    }
  });
  if (info.id && wx.shareAppMessage) ui.button('邀请好友', x + 22, y + h - 54, (w - 54) / 2, 40,
    () => wx.shareAppMessage({ title: '来雪山大乱斗和我比赛', query: `room=${info.id}` }));
  if (info.host) ui.button('立即开始 ▶', x + w / 2 + 6, y + h - 54, (w - 54) / 2, 40, () => g.startMatchNow(), { primary: true });
  ui.frame = { x: x + w, y, w: ui.r - x - w, h: ui.b - y };
}

export function drawAccount(ui) {
  const g = ui.game;
  const account = g.account;
  const w = Math.min(465, ui.r - ui.l);
  scrim(ui, 'rgba(11,21,48,.57)');
  const x = (ui.w - w) / 2, y = (ui.h - 235) / 2;
  card(ui, { x, y, w, h: 235 }, 'rgba(11,21,48,.97)', { radius: 21, stroke: '#ffffff60', shadow: 0 });
  ui.text('个人资料', x + 20, y + 34, { size: 27, bold: true, italic: true, color: GOLD });
  chip(ui, '✕', { x: x + w - 51, y: y + 14, w: 35, h: 35 }, () => account.hide(), { active: true, radius: 18 });
  ui.text(`Lv.${g.profile.level} · ${g.playerName}`, x + 21, y + 78, { bold: true, size: 17 });
  ui.text(account.ready ? '已连接云存档' : '进度保存在本机', x + 21, y + 105, { color: PALE, size: 13 });
  const rename = () => wx.showModal({ title: '修改昵称', editable: true, placeholderText: '2–12 位中文、字母或数字',
    success: ({ confirm, content }) => {
      if (!confirm) return;
      if (!cleanNick(content)) return ui.toast('请输入 2–12 位中文、字母或数字', true);
      g.setName(content);
      ui.refreshProfile();
    },
  });
  ui.button('修改昵称', x + 20, y + 145, g.mini.online && !account.ready ? (w - 52) / 2 : w - 40, 48, rename);
  if (g.mini.online && !account.ready) ui.button(account.busy ? '连接中…' : '开启云存档', x + w / 2 + 6, y + 145, (w - 52) / 2, 48,
    () => account.token ? account.boot() : account.onGuest(), { primary: true, disabled: account.busy });
}

function rewardRows(reward) {
  const base = (reward.lines || []).map((line) => ({ ...line, color: line.note ? PALE : '#fff' }));
  const extra = (reward.extra || []).map((line) => ({ ...line, color: GOLD }));
  const tasks = (reward.tasks || []).map((task) => ({ ...task, label: `✓ 每日任务 · ${task.name}`, color: '#8dff6a' }));
  const ach = (reward.ach || []).map((a) => ({ ...a, label: `🏆 成就「${a.name}」${a.title ? ` · 称号「${a.title}」` : ''}`, color: GOLD }));
  const bonus = reward.bonus ? [{ label: '🎁 今日任务全部完成', coins: reward.bonus, parts: reward.bonusParts, color: '#8dff6a' }] : [];
  const additions = [...extra, ...tasks, ...bonus, ...ach];
  const total = additions.reduce((sum, line) => ({ xp: sum.xp + (line.xp || 0), coins: sum.coins + (line.coins || 0),
    parts: sum.parts + (line.parts || 0) }), { xp: reward.xp || 0, coins: reward.coins || 0, parts: reward.parts || 0 });
  return { rows: [...base, ...additions], total };
}

function drawRewards(ui, area, reward) {
  const p = ui.game.profile;
  const info = p.levelInfo();
  const { x, y, w } = area;
  const { rows, total } = rewardRows(reward);
  const h = 79 + rows.length * 27 + Math.min(3, reward.unlocks?.length || 0) * 20;
  ui.panel(x, y, w, h, '#ffffff10', 15, null);
  const order = [w * .63, w * .82, w - 12];
  ui.text('奖励', x + 11, y + 19, { bold: true, color: PALE, size: 12 });
  ['经验', '雪花币', '改装币'].forEach((label, i) => ui.text(label, x + order[i], y + 19, { bold: true, color: PALE, size: 12, right: true }));
  const columns = (line, yy) => {
    const cells = [[line.xp, '#8dff6a', '+'], [line.coins, '#9fe4ff', '❄+'], [line.parts, '#d7adff', '+']];
    cells.forEach(([value, color, prefix], i) => {
      if (value) ui.text(prefix + value, x + order[i], yy, { right: true, bold: true, color, size: 12, max: w * .2 - 4 });
    });
  };
  rows.forEach((line, i) => {
    const yy = y + 44 + i * 27;
    ui.panel(x + 12, yy - 13, w - 24, 1, '#ffffff18', 0, null);
    ui.text(line.label, x + 12, yy, { size: 13, color: line.color, bold: true, max: line.note ? w - 24 : w * .49 - 14 });
    columns(line, yy);
  });
  const yy = y + 45 + rows.length * 27;
  ui.text('合计', x + 12, yy, { bold: true, size: 17 });
  columns(total, yy);
  ui.text(`Lv.${info.lv}`, x + 12, yy + 27, { size: 14, bold: true, color: reward.lvTo > reward.lvFrom ? GOLD : '#fff' });
  meter(ui, x + 50, yy + 23, w - 172, 7, info.need ? info.cur / info.need : 1,
    gradient(ui.ctx, x, yy, w, 0, '#4fd2ff', '#8dff6a'));
  ui.text(`❄ ${p.coins}   ⬢ ${p.parts}`, x + w - 13, yy + 28, { size: 13, bold: true, right: true, max: 113 });
  (reward.unlocks || []).slice(0, 3).forEach((label, i) => ui.text('解锁 ' + label, x + 12, yy + 48 + i * 20, { size: 12, color: '#8dff6a', max: w - 24 }));
  return h;
}

function podium(ui, { x, y, w }, rows) {
  const col = (w - 16) / 3;
  [1, 0, 2].forEach((place, i) => {
    const row = rows[place];
    const dy = [0, 25, 56][place];
    const tile = { x: x + i * (col + 8), y: y + dy, w: col, h: 242 - dy };
    card(ui, tile, ['#fff', '#edf3fc'], { radius: 13, stroke: row.me ? GOLD : null, shadow: 0 });
    ui.text(['🥇', '🥈', '🥉'][place], tile.x + 12, tile.y + 20, { size: 23 });
    if (row.me) chip(ui, '你', { x: tile.x + tile.w - 37, y: tile.y + 8, w: 26, h: 18 }, null, { fill: NAVY, color: GOLD, size: 11, radius: 10 });
    const mw = tile.w - 8;
    ui.models.push({ x: tile.x + 4, y: tile.y + 34, w: mw, h: tile.h - 87, row, place });
    ui.text(row.name, tile.x + tile.w / 2, tile.y + tile.h - 30, { center: true, size: 15, bold: true, color: NAVY, max: tile.w - 11 });
    ui.text([row.time, row.pts].filter((v) => v !== '' && v !== undefined).join(' · '), tile.x + tile.w / 2, tile.y + tile.h - 13,
      { center: true, size: 12, bold: true, color: '#5d6c87', max: tile.w - 9 });
  });
}

export function drawResults(ui) {
  const r = ui.results, g = ui.game;
  scrim(ui, 'rgba(11,21,48,.45)');
  const w = Math.min(1000, ui.r - ui.l - 8);
  const x = (ui.w - w) / 2, y = ui.t + 3, h = ui.b - y;
  card(ui, { x, y, w, h }, 'rgba(11,21,48,.94)', { radius: 22, stroke: '#ffffff48', shadow: 0 });
  const buttonHeight = 44;
  const buttonY = ui.b - buttonHeight - 16;
  const bodyY = y + 12;
  const body = { x: x + 27, y: bodyY, w: w - 57, h: buttonY - bodyY - 10 };
  const actions = [[r.backLabel || '返回大厅', () => g.toMenu()]];
  if (g.replay.btnShown) actions.push(['精彩回放', () => g.replay.play()]);
  if (r.swapLabel) actions.push([r.swapLabel, () => g.startPractice(g.session.gear === 'ski' ? 'learner' : 'ski')]);
  actions.push([r.nextLabel || '再来一局 ▶', () => g.nextRace()]);
  const usePodium = r.rows.length >= 3 && r.rows.slice(0, 3).every((v) => v.look);
  const rest = usePodium ? r.rows.slice(3) : r.rows;
  const reward = r.reward;
  const rw = reward ? Math.min(430, body.w * .49) : 0;
  const leftW = body.w - (rw ? rw + 18 : 0);
  const rewardH = reward ? 81 + rewardRows(reward).rows.length * 27 + Math.min(3, reward.unlocks?.length || 0) * 20 : 0;
  const leftH = (usePodium ? 252 : 0) + ((r.awards || []).length ? 41 : 0) + rest.length * 34;
  const content = 120 + Math.max(rewardH, leftH);
  ui.scrollArea('results', body, content, (offset) => {
    const yy = body.y + 16 - offset;
    ui.text(r.title, body.x, yy + 29, { size: 43, color: GOLD, bold: true, italic: true, outline: true, max: body.w });
    ui.text(r.sub, body.x, yy + 70, { size: 16, color: '#eef1f7', max: body.w, bold: true });
    if (usePodium) podium(ui, { x: body.x, y: yy + 91, w: leftW }, r.rows);
    let py = yy + 91 + (usePodium ? 252 : 0);
    if (r.awards?.length) {
      ui.text('本局之最', body.x, py + 7, { size: 12, color: GOLD, bold: true });
      ui.text(r.awards.map((a) => `${a.icon} ${a.name} · ${a.who} ${a.val}`).join('   '), body.x, py + 25, { size: 12, color: PALE, max: leftW });
      py += 41;
    }
    rest.forEach((row) => {
      ui.panel(body.x, py, leftW, 29, row.me ? GOLD : '#ffffff14', 8, null);
      const color = row.me ? NAVY : '#fff';
      ui.text(row.rank + '   ' + row.name, body.x + 10, py + 14, { bold: true, size: 14, color, max: leftW * .5 });
      ui.text([row.time, row.pts].filter((v) => v !== '' && v !== undefined).join(' · '), body.x + leftW - 10, py + 14,
        { right: true, bold: true, size: 13, color, max: leftW * .48 });
      py += 34;
    });
    if (reward) drawRewards(ui, { x: body.x + leftW + 18, y: yy + 94, w: rw }, reward);
  });
  const bw = (body.w - (actions.length - 1) * 10) / actions.length;
  actions.forEach(([label, run], i) => ui.button(label, body.x + i * (bw + 10), buttonY, bw, buttonHeight, run, {
    primary: i === actions.length - 1, size: 18,
  }));
}
