import { WEAPONS, MODES, POINTS } from '../src/config.js';
import { cleanNick, seasonNow, seasonLeftText, seasonReward, TASK_BONUS, TASK_BONUS_PARTS, TASK_COINS, TASK_PARTS, TASK_XP } from '../src/profile.js';
import { clamp, fmtTime } from '../src/util.js';
import { drawHall, drawHome, drawModePicker, drawRoom, drawTrackMenu, taskResetText } from './lobby-ui.js';
import { drawRankMenu } from './ranked-ui.js';
import { drawShowroom } from './showroom-ui.js';
import { card, chip, gradient, hit, meter, pageHeader, scrim, GOLD, NAVY, PALE, ribbon } from './paint.js';
import { sideNavPanel, sideNavRow } from './side-nav.js';

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
  const inRankQueue = ui.tab === 'race' && (ui.panelPage || ui.racePick) === 'rank' && ui.game.rankMode;
  if (ui.queue && !inRankQueue && (ui.tab !== 'race' || ui.panelPage || ui.racePick !== 'home')) {
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
  const rowH = Math.min(50, (h - 24) / SETTINGS.length);
  const nav = sideNavPanel(ui, { x: x + 6, y: y + 6, w: 220, h: rowH * SETTINGS.length + 12 });
  SETTINGS.forEach(([key, icon, name, en], i) => {
    const box = { ...nav, y: nav.y + i * rowH, h: rowH - 4 };
    sideNavRow(ui, box, name, () => ui.page(key), { active: key === category, icon, detail: en });
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
