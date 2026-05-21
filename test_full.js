// 完整模拟：新游戏 → 玩几回合 → 保存 → 杀进程 → 重新打开 → 恢复
const _storage = {};
global.wx = {
  setStorageSync: (k, v) => { _storage[k] = JSON.parse(JSON.stringify(v)); },
  getStorageSync: (k) => _storage[k] !== undefined ? JSON.parse(JSON.stringify(_storage[k])) : null,
  removeStorageSync: (k) => { delete _storage[k]; },
  getStorageInfoSync: () => ({ keys: Object.keys(_storage) }),
  getSystemInfoSync: () => ({ windowWidth: 375, windowHeight: 667, pixelRatio: 2, platform: 'devtools' }),
  createCanvas: () => ({ getContext: () => ({}) }),
  onShow: () => {},
  onHide: () => {},
  onTouchStart: () => {},
  onTouchMove: () => {},
  onTouchEnd: () => {},
  vibrateShort: () => {},
  showModal: () => {},
  createImage: () => ({ src: '' }),
  getFileSystemManager: () => ({ readdirSync: () => [] }),
  request: () => {},
  cloud: {
    init: () => {},
    uploadFile: () => Promise.resolve({}),
    getTempFileURL: () => Promise.resolve({ fileList: [] })
  }
};
global.requestAnimationFrame = () => {};

const { StorageManager } = require('./js/storage');
const { Game } = require('./js/game');

function logGameState(label, g) {
  console.log(`\n=== ${label} ===`);
  console.log('  round:', g.round, 'target:', g.target, 'score:', g.score, 'gold:', g.gold);
  console.log('  state:', g.state, 'handsLeft:', g.handsLeft, 'discardsLeft:', g.discardsLeft);
  console.log('  hand.length:', g.hand ? g.hand.length : 'undefined');
  console.log('  deck.length:', g.deck ? g.deck.length : 'undefined');
  console.log('  selected.length:', g.selected ? g.selected.length : 'undefined');
  console.log('  jokers.length:', g.jokers ? g.jokers.length : 'undefined');
  console.log('  potions.length:', g.potions ? g.potions.length : 'undefined');
  console.log('  _maxHandSize:', g._maxHandSize, '_seedMinLen:', g._seedMinLen, '_seedMaxLen:', g._seedMaxLen);
  console.log('  shopItems:', g.shopItems ? '有' : '无');
  if (g.hand && g.hand.length > 0) {
    const c = g.hand[0];
    console.log('  first card:', c ? { letter: c.letter, score: c.score, id: c.id, selected: c.selected, animOffset: c.animOffset } : 'null');
  }
}

// ===== 第一次打开：新游戏 =====
console.log('【第一次打开】模拟 startGame...');
let storage = new StorageManager();
let saved = storage.loadProgress();
let game = saved && saved.state !== 'gameover' ? new Game(saved) : new Game();
logGameState('新游戏', game);

// 模拟玩了几回合，进入商店
game.round = 3;
game.score = 200;
game.target = 450;
game.gold = 15;
game.handsLeft = 2;
game.discardsLeft = 1;
game.state = 'shop';
game.shopItems = [
  { name: '元音强化', type: 'witch', scope: 'per_card', trigger: 'has_vowel', value: 3, cost: 6, desc: '元音字母分×3' },
  { name: '额外弃牌', type: 'crystal', effect: 'extra_discard', value: 1, cost: 3, desc: '下一回合弃牌次数+1' }
];
game.jokers = [{ name: '容错咒文', type: 'witch', trigger: 'shield_illegal', cost: 8, desc: '...' }];
game.potions = [{ name: '字母升级', type: 'potion', effect: 'upgrade_letter', value: 10, cost: 4 }];

// 强制保存（跳过防抖）
game.storageManager._doSaveProgress(game);
logGameState('保存前（商店状态）', game);

// ===== 杀进程：模拟进程被系统回收 =====
console.log('\n【杀进程】JS上下文销毁...');
// 模拟所有模块级缓存被清空（Node require cache 还在，但游戏里进程被杀是真清空）

// ===== 重新打开：模拟游戏重启 =====
console.log('\n【重新打开】模拟 startGame 重新执行...');
storage = new StorageManager();
saved = storage.loadProgress();
console.log('  loadProgress 返回:', saved ? `round=${saved.round}, state=${saved.state}, target=${saved.target}` : 'null');

let isExpired = saved && saved.timestamp && (Date.now() - saved.timestamp > 7 * 24 * 60 * 60 * 1000);
console.log('  isExpired:', isExpired);

if (saved && !isExpired && saved.state !== 'gameover') {
  game = new Game(saved);
  console.log('  → 走了恢复分支');
} else {
  game = new Game();
  console.log('  → 走了新游戏分支');
}
logGameState('恢复后', game);

// ===== 检查 renderer 可能访问到的 undefined =====
console.log('\n=== renderer 安全检查 ===');
const rendererChecks = [
  ['game.target', game.target],
  ['game.round', game.round],
  ['game.score', game.score],
  ['game.hand.length', game.hand ? game.hand.length : 'undefined'],
  ['game.hand[0]', game.hand && game.hand[0] ? '存在' : '缺失/null'],
  ['game.jokers', game.jokers ? `length=${game.jokers.length}` : 'undefined'],
  ['game.potions', game.potions ? `length=${game.potions.length}` : 'undefined'],
  ['game.maxJokerSlots', game.maxJokerSlots],
  ['game.state', game.state],
];
for (const [name, val] of rendererChecks) {
  const status = val === undefined || val === 'undefined' ? '❌ UNDEFINED' : '✅ OK';
  console.log(`  ${name}:`, val, status);
}

// 检查 String(game.target) 会输出什么
console.log('\n  String(game.target) =', String(game.target));
console.log('  drawCard 需要的字段:');
if (game.hand && game.hand[0]) {
  const c = game.hand[0];
  console.log('    letter:', c.letter, c.letter === undefined ? '❌' : '✅');
  console.log('    score:', c.score, c.score === undefined ? '❌' : '✅');
  console.log('    id:', c.id, c.id === undefined ? '❌' : '✅');
  console.log('    baseScore:', c.baseScore, c.baseScore === undefined ? '❌' : '✅');
  console.log('    isFace:', c.isFace, c.isFace === undefined ? '❌' : '✅');
}
