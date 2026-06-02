// 微信小游戏入口
const { Game, uploadScore } = require('./js/game');
const { Renderer } = require('./js/renderer');
const { InputHandler } = require('./js/input');
const { buyItem, upgradeLetter, refreshModule, generateShopItems } = require('./js/shop');
const { LETTER_SCORE, letterUpgrades } = require('./js/data');
const { StorageManager } = require('./js/storage');
const { CloudStorageManager } = require('./js/cloud_storage');

// 获取 Canvas 上下文
wx.onShow(() => {
  console.log('[Game] 切回前台');

  // === 分享复活检测 ===
  if (shareReviveState && shareReviveState.resolving && game && game.state === 'gameover') {
    const stayed = Date.now() - shareReviveState.startTime;
    console.log('[ShareRevive] 分享界面停留时间:', stayed, 'ms');
    if (stayed >= 2500) {
      console.log('[ShareRevive] 判定分享成功，执行复活');
      game._closingGameOver = true;
      game._closeStartTime = Date.now();
      setTimeout(() => {
        if (game && game.state === 'gameover') {
          game.revive();
          if (renderer.gameOverRenderer) {
            renderer.gameOverRenderer.animStartTime = null;
            renderer.gameOverRenderer.lastGameOverReason = null;
          }
          game.hintToast = { text: '复活成功！', expireAt: Date.now() + 2000 };
        }
      }, 200);
    } else {
      console.log('[ShareRevive] 分享取消或停留时间不足');
      if (game) {
        game._reviveBtnPressed = false;
        game.hintToast = { text: '分享后才可以复活哦~', expireAt: Date.now() + 2000 };
      }
    }
    shareReviveState = null;
  }
});

wx.onHide(() => {
  console.log('[Game] 切后台，立即存档');
  if (game && game.storageManager && game.state !== 'gameover') {
    game.storageManager.saveProgressImmediate();
  }
});

const info = wx.getSystemInfoSync();
const canvas = wx.createCanvas();
const ctx = canvas.getContext('2d');

// 平台判断：开发者工具不震动
const isDevTools = info.platform === 'devtools';
function vibrate() {
  if (!isDevTools && wx.vibrateShort) {
    try { wx.vibrateShort({ type: 'light' }); } catch (e) {}
  }
}

// ===== 排行榜相关 =====
let openDataContext = null;
let isRankShowing = false;

function getOpenDataContext() {
  if (!openDataContext && wx.getOpenDataContext) {
    openDataContext = wx.getOpenDataContext();
  }
  return openDataContext;
}

function showRankList() {
    const odc = getOpenDataContext();
  if (!odc) {
      return;
  }
  isRankShowing = true;
  if (game) game._showingRankList = true;

  // OffScreenCanvas 模式：主域设置 sharedCanvas 的宽高（开放域不能设）
  const sharedCanvas = odc.canvas;
  if (sharedCanvas) {
    try {
      sharedCanvas.width = canvas.width;
      sharedCanvas.height = canvas.height;
      } catch (e) {
      console.warn('sharedCanvas set failed', e.message);    }
  } else {
    }

  odc.postMessage({
    action: 'show',
    scaleDpr,
  });
  }

function hideRankList() {
  const odc = getOpenDataContext();
  if (!odc) return;
  isRankShowing = false;
  if (game) game._showingRankList = false;
  odc.postMessage({ action: 'hide' });
}

// 设置画布尺寸（适配 Retina 高分屏）
const WIDTH = info.windowWidth;
const HEIGHT = info.windowHeight;
const dpr = info.pixelRatio || 1;

// 限制 Canvas 物理像素上限，防止高分屏内存爆炸
const MAX_CANVAS_WIDTH = 1280;
const MAX_CANVAS_HEIGHT = 2560;
const scaleDpr = Math.min(dpr, MAX_CANVAS_WIDTH / WIDTH, MAX_CANVAS_HEIGHT / HEIGHT);

canvas.width = Math.floor(WIDTH * scaleDpr);
canvas.height = Math.floor(HEIGHT * scaleDpr);
ctx.scale(scaleDpr, scaleDpr);

// 游戏全局状态
let game = null;
const renderer = new Renderer(ctx, WIDTH, HEIGHT);

// 分享复活状态
let shareReviveState = null; // { startTime: number, resolving: boolean }

// 云存储管理器
const cloudStorage = new CloudStorageManager('cloud1-d3gecbtu10e4035de');
cloudStorage.init();

// 预加载状态
let preloadProgress = 0;
let preloadComplete = false;

// 过渡状态（预加载页 → 游戏页）
let transitionAlpha = 0;
let transitionStartTime = null;
const TRANSITION_DURATION = 600;

// 启动预加载：下载云图片并显示进度条
async function startPreload() {
  const shopNames = Object.keys(cloudStorage.cloudFileMap);
  const bgIconNames = Object.keys(cloudStorage.bgIconFileMap);

  // 只有新用户或引导未完成的用户才需要下载 guide 精灵图
  const savedProgress = wx.getStorageSync('word_balatro_progress');
  const needGuide = !savedProgress || (
    savedProgress.guidePhase !== undefined && savedProgress.guidePhase < 5
  );

  // 判断是否有存档恢复（同 startGame 中的逻辑）
  const isExpired = savedProgress && savedProgress.timestamp &&
    (Date.now() - savedProgress.timestamp > 7 * 24 * 60 * 60 * 1000);
  const hasRequiredFields = savedProgress &&
    Array.isArray(savedProgress.hand) &&
    Array.isArray(savedProgress.deck) &&
    typeof savedProgress.target === 'number' &&
    typeof savedProgress.state === 'string' &&
    Array.isArray(savedProgress._shuffledSkills);
  const isResuming = savedProgress && !isExpired && savedProgress.state !== 'gameover' && hasRequiredFields;

  // 读取已解锁的 witch_card（独立于存档恢复，新游戏也保留已收集卡牌）
  let collectedWitchCards = [];
  const raw = wx.getStorageSync('word_balatro_collected_witch_cards');
  if (raw) {
    try {
      const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
      if (Array.isArray(parsed)) collectedWitchCards = parsed;
    } catch (e) {}
  }

  // 注：witch 头像仍改为回合级按需下载，但 witch_card 在存档恢复时预加载
  const guideStepCount = needGuide ? 2 : 0; // witch_guide_1 + witch_guide_2

  // 扫描 music 文件，决定预加载数量
  const fs = wx.getFileSystemManager();
  const musicFiles = cloudStorage._scanMusicDir(fs, 'music');
  const musicCount = musicFiles.length > 0 ? musicFiles.length : Object.keys(cloudStorage.musicFileMap).length;

  const total = shopNames.length + bgIconNames.length + guideStepCount + musicCount;

  if (total === 0 && collectedWitchCards.length === 0) {
    console.log('[Game] 没有云存储映射，跳过预加载');
    preloadComplete = true;
    startGame();
    return;
  }

  let loaded = 0;
  function onProgress() {
    loaded++;
    preloadProgress = Math.floor((loaded / total) * 100);
  }

  await cloudStorage.preloadShopCardImages(onProgress);
  await cloudStorage.preloadBgIconImages(onProgress);
  if (needGuide) {
    await cloudStorage.preloadGuideGroup(1, renderer);
    onProgress();
    await cloudStorage.preloadGuideGroup(2, renderer);
    onProgress();
  }

  // 预加载 music 文件到本地缓存
  await cloudStorage.preloadMusicFiles(onProgress);

  // 存档恢复时：并行预加载所有已解锁的 witch_card
  if (collectedWitchCards.length > 0) {
    console.log('[Preload] 存档恢复，预加载已解锁 witch_card:', collectedWitchCards);
    await Promise.all(collectedWitchCards.map(level =>
      cloudStorage.preloadWitchCardForLevel(level, renderer)
    ));
    console.log('[Preload] 已解锁 witch_card 预加载完成');
  }

  cloudStorage.injectToRenderer(renderer);
  cloudStorage.injectBgIconToRenderer(renderer);
  if (needGuide) {
    cloudStorage.injectGuideToRenderer(renderer);
  }
  preloadComplete = true;
  startGame();
  console.log('[Game] 云图片预加载完成，进入游戏');
}

function startGame() {
  const storage = new StorageManager();
  const saved = storage.loadProgress();

  // 存档超过 7 天视为过期
  const isExpired = saved && saved.timestamp && (Date.now() - saved.timestamp > 7 * 24 * 60 * 60 * 1000);

  // 检查存档字段完整性（旧版本存档缺少 hand/deck/target 等字段，不能恢复）
  const hasRequiredFields = saved &&
    Array.isArray(saved.hand) &&
    Array.isArray(saved.deck) &&
    typeof saved.target === 'number' &&
    typeof saved.state === 'string' &&
    Array.isArray(saved._shuffledSkills);

  if (saved && !isExpired && saved.state !== 'gameover' && hasRequiredFields) {
    game = new Game(saved);
    console.log('[Game] 从存档恢复，回合:', saved.round);
  } else {
    game = new Game();
    // 无效或过期存档统一清理，避免反复加载旧存档导致异常
    if (saved && (!hasRequiredFields || isExpired)) {
      storage.clearProgress();
      console.log('[Game] 旧存档字段不完整/已过期，已清理，开始新游戏');
    } else {
      console.log('[Game] 新游戏');
    }
  }

  game.cloudStorage = cloudStorage;
  game.renderer = renderer;
  wx.game = game;

  // 加载 cloudStorage 缓存的音频
  if (game.audioManager) game.audioManager.loadFromCloud(game.cloudStorage);

  // 从预加载页进入商店页时，强制刷新商店
  if (game.state === 'shop') {
    game.shopItems = generateShopItems(game);
  }

  transitionStartTime = Date.now();

  // 游戏启动后按需预加载女巫头像（当前回合兜底 + 下一回合提前）
  game._preloadWitchAvatars();
}

// 长按检测状态
let longPressTimer = null;
let touchStartPos = null;
const LONG_PRESS_DURATION = 600; // 600ms 长按
const LONG_PRESS_MOVE_THRESHOLD = 10; // 移动超过 10px 取消长按

// 触摸事件处理
wx.onTouchStart((e) => {
  // 预加载阶段不响应触摸
  if (!preloadComplete) return;

  const touch = e.touches[0];
  const x = touch.clientX;
  const y = touch.clientY;
  touchStartPos = { x, y };

  // 日志区域触摸（优先处理滚动）
  if (renderer.cloudLogRect) {
    const r = renderer.cloudLogRect;
    if (x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h) {
      renderer.cloudLogDragging = true;
      renderer.cloudLogDragStartY = y;
      renderer.cloudLogDragStartScrollY = renderer.cloudLogScrollY;
      return;
    }
  }

  // 检测 top_icon 长按（打开/关闭调试菜单）
  if (renderer.topIconRect) {
    const iconHit = renderer.hitTest(x, y, [renderer.topIconRect]);
    if (iconHit) {
      longPressTimer = setTimeout(() => {
        longPressTimer = null;
        renderer.debugMenuOpen = !renderer.debugMenuOpen;
      }, LONG_PRESS_DURATION);
      return; // 长按期间不触发其他交互
    }
  }

  // 检测卡牌图鉴图标按下
  if (renderer.cardBookIconRect && game.cardBookUnlocked && !game.cardBookOpen) {
    const cbHit = renderer.hitTest(x, y, [renderer.cardBookIconRect]);
    if (cbHit) {
      game._cardBookIconPressed = true;
    }
  }

  handleInput(x, y);
});

wx.onTouchMove((e) => {
  // 移动超过阈值时取消长按
  if (longPressTimer && touchStartPos) {
    const touch = e.touches[0];
    const dx = touch.clientX - touchStartPos.x;
    const dy = touch.clientY - touchStartPos.y;
    if (Math.sqrt(dx * dx + dy * dy) > LONG_PRESS_MOVE_THRESHOLD) {
      clearTimeout(longPressTimer);
      longPressTimer = null;
    }
  }

  // 移出卡牌图鉴图标区域时取消按下状态
  if (game._cardBookIconPressed && renderer.cardBookIconRect) {
    const touch = e.touches[0];
    const iconHit = renderer.hitTest(touch.clientX, touch.clientY, [renderer.cardBookIconRect]);
    if (!iconHit) {
      game._cardBookIconPressed = false;
    }
  }

  // 移出装备按钮区域时取消按下状态
  if (game._cardBookEquipBtnPressed && renderer.cardBookEquipBtnRect) {
    const touch = e.touches[0];
    const btnHit = renderer.hitTest(touch.clientX, touch.clientY, [renderer.cardBookEquipBtnRect]);
    if (!btnHit) {
      game._cardBookEquipBtnPressed = false;
    }
  }



  if (!renderer.cloudLogDragging) return;
  const touch = e.touches[0];
  const y = touch.clientY;
  const deltaY = renderer.cloudLogDragStartY - y;
  renderer.cloudLogScrollY = renderer.cloudLogDragStartScrollY + deltaY;
});

wx.onTouchEnd(() => {
  renderer.cloudLogDragging = false;
  renderer.pressedBtn = null;
  game._cardBookIconPressed = false;
  game._cardBookEquipBtnPressed = false;

  // 取消未触发的长按定时器
  if (longPressTimer) {
    clearTimeout(longPressTimer);
    longPressTimer = null;
  }
  touchStartPos = null;
});

function handleInput(x, y) {
  // 新手引导阶段：优先处理引导点击，禁用其他交互
  if (game.guidePhase >= 1 && game.guidePhase <= 4) {
    if (renderer.guideNextBtnRect) {
      const btnHit = renderer.hitTest(x, y, [renderer.guideNextBtnRect]);
      if (btnHit) {
        vibrate();
        game.advanceGuide();
        return;
      }
    }
    // 引导阶段点击其他区域不响应
    return;
  }

  // 检测调试菜单按钮（优先）
  if (renderer.debugMenuOpen && renderer.debugMenuRects) {
    const debugHit = renderer.hitTest(x, y, renderer.debugMenuRects);
    if (debugHit) {
      if (debugHit.action === 'debug_resetHands') game.resetHands();
      if (debugHit.action === 'debug_addScore') game.addScore(100);
      if (debugHit.action === 'debug_addGold') {
        game.gold += 10;
        if (game.storageManager) game.storageManager.saveProgress();
      }
      if (debugHit.action === 'debug_jumpToRound') {
        wx.showModal({
          title: '跳转回合',
          editable: true,
          placeholderText: '输入目标回合数',
          success: (res) => {
            const round = parseInt(res.content, 10);
            if (round && round > 0) {
              game.jumpToRound(round);
            }
          }
        });
      }
      if (debugHit.action === 'debug_winRound') game.winRound();
      if (debugHit.action === 'debug_refreshShop') {
        if (!game.shopItems) {
          game.shopItems = generateShopItems(game);
        } else {
          refreshModule(game, 0);
          refreshModule(game, 1);
          refreshModule(game, 2);
        }
      }
      if (debugHit.action === 'debug_addWitchSlot') {
        game.maxJokerSlots = (game.maxJokerSlots || 4) + 1;
        if (game.storageManager) game.storageManager.saveProgress();
      }
      if (debugHit.action === 'debug_upload_shop_card') {
        cloudStorage.uploadShopCards().then(res => {
          game.hintToast = { text: `上传完成：${res.success.length} 张成功`, expireAt: Date.now() + 2000 };
          return cloudStorage.preloadShopCardImages();
        }).then(() => {
          cloudStorage.injectToRenderer(renderer);
          game.hintToast = { text: '云图片已加载到游戏', expireAt: Date.now() + 2000 };
        }).catch(err => {
          game.hintToast = { text: '上传失败', expireAt: Date.now() + 2000 };
          console.error('上传失败:', err);
        });
      }
      if (debugHit.action === 'debug_upload_witch') {
        cloudStorage.uploadWitchImages().then(res => {
          game.hintToast = { text: `witch 上传完成：${res.success.length} 张成功`, expireAt: Date.now() + 2000 };
          return Promise.all([
            cloudStorage.preloadWitchImages(),
            cloudStorage.preloadGuideImages(),
          ]);
        }).then(() => {
          cloudStorage.injectWitchToRenderer(renderer);
          cloudStorage.injectGuideToRenderer(renderer);
          game.hintToast = { text: 'witch 云图片已加载到游戏', expireAt: Date.now() + 2000 };
        }).catch(err => {
          game.hintToast = { text: 'witch 上传失败', expireAt: Date.now() + 2000 };
          console.error('witch 上传失败:', err);
        });
      }
      if (debugHit.action === 'debug_upload_bg_icon') {
        cloudStorage.uploadBgIconImages().then(res => {
          game.hintToast = { text: `bg_icon 上传完成：${res.success.length} 张成功`, expireAt: Date.now() + 2000 };
          return cloudStorage.preloadBgIconImages();
        }).then(() => {
          cloudStorage.injectBgIconToRenderer(renderer);
          game.hintToast = { text: 'bg_icon 云图片已加载到游戏', expireAt: Date.now() + 2000 };
        }).catch(err => {
          game.hintToast = { text: 'bg_icon 上传失败', expireAt: Date.now() + 2000 };
          console.error('bg_icon 上传失败:', err);
        });
      }
      if (debugHit.action === 'debug_upload_music') {
        cloudStorage.uploadMusicFiles().then(res => {
          game.hintToast = { text: `music 上传完成：${res.success.length} 个成功`, expireAt: Date.now() + 2000 };
        }).catch(err => {
          game.hintToast = { text: 'music 上传失败', expireAt: Date.now() + 2000 };
          console.error('music 上传失败:', err);
        });
      }
      if (debugHit.action === 'debug_triggerGuide') {
        game.guidePhase = 1;
        game._guideTextStartTime = Date.now();
        game._guideCardGiftStartTime = null;
        // 如果已有 has_vowel 女巫牌，先移除以避免重复
        const hasVowelIdx = game.jokers.findIndex(j => j && j.trigger === 'has_vowel');
        if (hasVowelIdx >= 0) game.jokers.splice(hasVowelIdx, 1);
        if (game.storageManager) game.storageManager.saveProgress();
        // 如果 guide 图片尚未下载（老用户触发引导时），补充下载并注入
        const guideGroupNum = game.guidePhase === 1 ? 1 : 2;
        cloudStorage.preloadGuideGroup(guideGroupNum, renderer).then(() => {
          cloudStorage.injectGuideToRenderer(renderer);
        });
      }
      if (debugHit.action === 'debug_triggerShopGuide') {
        game.shopGuidePhase = 1;
        game._shopGuideStartTime = Date.now();
        if (game.storageManager) game.storageManager.saveProgress();
        // 先检查本地是否已有缓存，避免重复下载
        const witch3 = renderer.guideImages.witch_3;
        const hasCache = witch3 && witch3.loaded;
        if (!hasCache) {
          cloudStorage.preloadGuideGroup(3, renderer).catch(err => {
            console.error('[Debug] 触发商店引导下载失败:', err);
          });
        } else {
          console.log('[Debug] witch_guide_3 本地缓存已存在，跳过下载');
        }
      }
      if (debugHit.action === 'debug_triggerCardBookGuide') {
        game.cardBookGuidePhase = 1;
        game._cardBookGuideStartTime = Date.now();
        game._cardBookGuideTextStartTime = Date.now();
        if (game.storageManager) game.storageManager.saveProgress();
        // 先检查本地是否已有缓存，避免重复下载
        const witch4 = renderer.guideImages.witch_4;
        const hasCache = witch4 && witch4.loaded;
        if (!hasCache) {
          cloudStorage.preloadGuideGroup(4, renderer).catch(err => {
            console.error('[Debug] 触发图鉴引导下载失败:', err);
          });
        } else {
          console.log('[Debug] witch_guide_4 本地缓存已存在，跳过下载');
        }
      }
      if (debugHit.action === 'debug_endGame') {
        console.log('[CardBook] debug_endGame 前 collectedWitchCards:', JSON.stringify(game.collectedWitchCards));
        game.state = 'gameover';
        game.gameOverReason = 'debug';
        if (game.audioManager) game.audioManager.play('game_over');
        if (game.storageManager) {
          game.storageManager.setHighScore(game.totalScore);
          uploadScore(game.storageManager.getHighScore());
          game.storageManager.updateStats(game);
          // 同步保存 gameover 状态并清理旧进度，避免下次启动时误判为可恢复存档
          game.storageManager.saveProgress();
          game.storageManager.clearProgress();
        }
      }
      if (debugHit.action === 'debug_flashCardBook') {
        game._forceCardBookFlash = true;
        game._cardBookIconFlashStart = Date.now();
      }
      renderer.debugMenuOpen = false;
      return;
    }
  }
  
  // 卡牌图鉴弹窗打开时，只有点击面板外部才关闭；面板内部（含翻页按钮）不关闭
  if (game.cardBookOpen && !game._closingCardBook) {
    // 1. 先检测是否点击了已解锁卡牌（最高优先级）
    if (renderer.cardBookCellRects && renderer.cardBookCellRects.length > 0) {
      const cellHit = renderer.hitTest(x, y, renderer.cardBookCellRects);
      if (cellHit && cellHit.isUnlocked) {
        vibrate();
        if (game.audioManager) game.audioManager.play('tap');
        if (game._cardBookCellPressed === cellHit.level) {
          // 再次点击同一张卡：复位 + 关闭详情
          game._cardBookCellPressed = null;
          game._cardBookDetailLevel = null;
          game._closingCardBookDetail = false;
        } else {
          // 点击新卡：切换选中 + 打开/切换详情
          game._cardBookCellPressed = cellHit.level;
          game._cardBookDetailLevel = cellHit.level;
          game._cardBookDetailStartTime = Date.now();
          game._closingCardBookDetail = false;
        }
        return;
      }
    }

    // 先检测关闭按钮（X）
    if (renderer.cardBookCloseBtnRect) {
      const closeHit = renderer.hitTest(x, y, [renderer.cardBookCloseBtnRect]);
      if (closeHit) {
        vibrate();
        if (game.audioManager) game.audioManager.play('tap');
        game._closingCardBook = true;
        game._closeCardBookStartTime = Date.now();
        game._cardBookDetailLevel = null;
        game._closingCardBookDetail = false;
        game._cardBookCellPressed = null;
        return;
      }
    }

    // 2. 如果详情弹窗打开，处理详情弹窗交互
    if (game._cardBookDetailLevel && !game._closingCardBookDetail) {
      // 检测装备/卸下按钮
      if (renderer.cardBookEquipBtnRect) {
        const equipHit = renderer.hitTest(x, y, [renderer.cardBookEquipBtnRect]);
        if (equipHit) {
          if (game.state === 'playing') {
            vibrate();
            game._equipBlockToast = {
              text: '回合进行中,无法切换',
              startTime: Date.now(),
            };
            return;
          }
          game._cardBookEquipBtnPressed = true;
          vibrate();
          if (game.audioManager) game.audioManager.play('tap');
          const level = game._cardBookDetailLevel;
          if (game.equippedWitchCard === level) {
            // 卸下
            game.equippedWitchCard = null;
            console.log('[Equipped] 卸下 witch_card_' + level);
          } else {
            // 装备（单选，自动替换）
            game.equippedWitchCard = level;
            console.log('[Equipped] 装备 witch_card_' + level);
          }
          if (game.storageManager) {
            game.storageManager.saveEquippedWitchCard(game.equippedWitchCard);
          }
          return;
        }
      }

      // 检测翻页按钮（点击区域可能超出详情面板，优先处理）
      if (renderer.cardBookPrevBtnRect) {
        const prevHit = renderer.hitTest(x, y, [renderer.cardBookPrevBtnRect]);
        if (prevHit && game.cardBookPage > 0) {
          vibrate();
          if (game.audioManager) game.audioManager.play('tap');
          game.cardBookPage--;
          game._cardBookDetailLevel = null;
          game._cardBookCellPressed = null;
          game._closingCardBookDetail = false;
          return;
        }
      }
      if (renderer.cardBookNextBtnRect) {
        const nextHit = renderer.hitTest(x, y, [renderer.cardBookNextBtnRect]);
        if (nextHit) {
          vibrate();
          if (game.audioManager) game.audioManager.play('tap');
          game.cardBookPage++;
          game._cardBookDetailLevel = null;
          game._cardBookCellPressed = null;
          game._closingCardBookDetail = false;
          return;
        }
      }

      const insideDetail = renderer.cardBookDetailPanelRect &&
        x >= renderer.cardBookDetailPanelRect.x && x <= renderer.cardBookDetailPanelRect.x + renderer.cardBookDetailPanelRect.w &&
        y >= renderer.cardBookDetailPanelRect.y && y <= renderer.cardBookDetailPanelRect.y + renderer.cardBookDetailPanelRect.h;
      if (insideDetail) {
        // 点击详情面板内部（非按钮），不关闭
        return;
      }
      // 点击详情面板外部 → 同时关闭图鉴和详情弹窗
      game._closingCardBook = true;
      game._closeCardBookStartTime = Date.now();
      game._cardBookDetailLevel = null;
      game._closingCardBookDetail = false;
      game._cardBookCellPressed = null;
      return;
    }

    // 先检测翻页按钮（点击区域可能超出面板，优先处理）
    if (renderer.cardBookPrevBtnRect) {
      const prevHit = renderer.hitTest(x, y, [renderer.cardBookPrevBtnRect]);
      if (prevHit && game.cardBookPage > 0) {
        vibrate();
        if (game.audioManager) game.audioManager.play('tap');
        game.cardBookPage--;
        game._cardBookDetailLevel = null;
        game._cardBookCellPressed = null;
        game._closingCardBookDetail = false;
        return;
      }
    }
    if (renderer.cardBookNextBtnRect) {
      const nextHit = renderer.hitTest(x, y, [renderer.cardBookNextBtnRect]);
      if (nextHit) {
        vibrate();
        if (game.audioManager) game.audioManager.play('tap');
        game.cardBookPage++;
        game._cardBookDetailLevel = null;
        game._cardBookCellPressed = null;
        game._closingCardBookDetail = false;
        return;
      }
    }

    const insidePanel = renderer.cardBookPanelRect &&
      x >= renderer.cardBookPanelRect.x && x <= renderer.cardBookPanelRect.x + renderer.cardBookPanelRect.w &&
      y >= renderer.cardBookPanelRect.y && y <= renderer.cardBookPanelRect.y + renderer.cardBookPanelRect.h;
    if (insidePanel) {
      // 点击面板内部非按钮区域 → 不关闭
      return;
    }
    // 面板外部 → 关闭弹窗
    game._closingCardBook = true;
    game._closeCardBookStartTime = Date.now();
    game._cardBookDetailLevel = null;
    game._closingCardBookDetail = false;
    game._cardBookCellPressed = null;
    return;
  }

  if (game.state === 'playing') {
    // 字母置换弹窗打开时，优先处理弹窗点击
    if (game._changeLetterPopup) {
      // 检测关闭按钮
      if (renderer.changeLetterCloseRect) {
        const closeHit = renderer.hitTest(x, y, [renderer.changeLetterCloseRect]);
        if (closeHit) {
          vibrate();
          if (game.audioManager) game.audioManager.play('tap');
          game._changeLetterPopup = null;
          return;
        }
      }
      // 检测字母块点击
      if (renderer.changeLetterRects) {
        const letterHit = renderer.hitTest(x, y, renderer.changeLetterRects);
        if (letterHit) {
          vibrate();
          game._changeLetterPopup.targetLetter = letterHit.letter;
          return;
        }
      }
      // 检测置换按钮
      if (renderer.changeLetterSwapBtnRect && renderer.changeLetterSwapBtnRect.enabled) {
        const btnHit = renderer.hitTest(x, y, [renderer.changeLetterSwapBtnRect]);
        if (btnHit) {
          vibrate();
          if (game.audioManager) game.audioManager.play('tap');
          if (game._closingChangeLetter) return;
          const popup = game._changeLetterPopup;
          const card = game.hand.find(c => c && c.id === popup.cardId);
          if (card && popup.targetLetter) {
            // 启动关闭动画，动画结束后执行置换
            game._closingChangeLetter = true;
            game._closeChangeLetterStartTime = Date.now();
            setTimeout(() => {
              // 执行字母置换
              const { LETTER_SCORE, letterUpgrades, FACE_CARDS } = require('./js/data');
              card.letter = popup.targetLetter;
              card.baseScore = LETTER_SCORE[popup.targetLetter];
              const upgrade = letterUpgrades.get(popup.targetLetter);
              card.score = upgrade ? Math.floor(card.baseScore * upgrade.mult) : card.baseScore;
              card.upgraded = !!upgrade;
              card.upgradeMult = upgrade ? upgrade.mult : 1;
              card.isFace = FACE_CARDS.has(popup.targetLetter);
              // 保持卡牌选中状态，不移除 game.selected
              // 消耗药水
              if (game.potions && game.potions[popup.potionIndex]) {
                game.potions.splice(popup.potionIndex, 1);
              }
              if (game.audioManager) game.audioManager.play('upgrade');
              if (game.storageManager) game.storageManager.saveProgress();
              game._changeLetterPopup = null;
              game._closingChangeLetter = false;
            }, 200);
          } else {
            // 条件不满足，直接关闭（无动画）
            game._changeLetterPopup = null;
          }
          return;
        }
      }
      // 弹窗空白区域点击不关闭，仅允许点击右上角 X
      return;
    }

    // 检测卡牌点击（动画播放期间禁用，但非法/约束失败提示期间允许点击以清除提示）
    if (!game.pendingCheck || game.pendingCheck.state === 'invalid' || game.pendingCheck.state === 'witch_failed') {
      const cardHit = renderer.hitTest(x, y, renderer.cardRects);
      if (cardHit) {
        vibrate();
        game.toggleSelect(cardHit.cardId);
        return;
      }
    }

    // 调试：点击第一个分数方块显示华丽 x2 标签
    if (renderer.firstBoxRect) {
      const boxHit = renderer.hitTest(x, y, [renderer.firstBoxRect]);
      if (boxHit) {
        vibrate();
        game._debugLabelShow = { startTime: Date.now(), text: 'x2' };
        return;
      }
    }

    // 检测出牌按钮
    if (renderer.playBtnRect) {
      const btnHit = renderer.hitTest(x, y, [renderer.playBtnRect]);
      if (btnHit) {
        vibrate();
        renderer.pressedBtn = 'play';
        if (game.animManager) game.animManager.buttonPress(renderer.playBtnRect);
        const selected = game.getSelectedCards();
        if (selected.length >= 2 && !game.pendingCheck) {
          game.playHand().then(() => {
            // result 消费完毕，不保存到全局变量
          }).catch(err => {
            console.error('playHand error:', err);
          });
        }
        return;
      }
    }

    // 检测弃牌按钮
    if (renderer.discardBtnRect) {
      const btnHit = renderer.hitTest(x, y, [renderer.discardBtnRect]);
      if (btnHit) {
        vibrate();
        renderer.pressedBtn = 'discard';
        if (game.animManager) game.animManager.buttonPress(renderer.discardBtnRect);
        game.discard();
        return;
      }
    }

    // 检测清空选择按钮
    if (renderer.resetBtnRect) {
      const btnHit = renderer.hitTest(x, y, [renderer.resetBtnRect]);
      if (btnHit) {
        vibrate();
        renderer.pressedBtn = 'reset';
        if (game.animManager) game.animManager.buttonPress(renderer.resetBtnRect);
        game.clearSelection();
        return;
      }
    }

    // 检测字母置换提示按钮点击
    if (renderer.changeLetterHintRect) {
      const hintHit = renderer.hitTest(x, y, [renderer.changeLetterHintRect]);
      if (hintHit) {
        vibrate();
        game._changeLetterHint = null;
        return;
      }
    }

    // 检测 HUD 女巫头像点击（温柔旋转星星）
    if (renderer.hudWitchAvatarRect) {
      const avatarHit = renderer.hitTest(x, y, [renderer.hudWitchAvatarRect]);
      if (avatarHit) {
        vibrate();
        const rect = renderer.hudWitchAvatarRect;
        game._witchStarBurst = {
          cx: rect.x + rect.w / 2,
          cy: rect.y + rect.h / 2,
          startTime: Date.now(),
        };
        return;
      }
    }

    // 检测已购买道具栏中的女巫牌点击（显示/关闭详情弹窗）
    if (renderer.witchPropRects) {
      const witchHit = renderer.hitTest(x, y, renderer.witchPropRects);
      if (witchHit) {
        const joker = game.jokers[witchHit.jokerIndex];
        if (joker && joker._disabled) return;
        vibrate();
        if (game._witchDetailPopup && game._witchDetailPopup.jokerIndex === witchHit.jokerIndex) {
          game._witchDetailPopup = null;
        } else {
          game._witchDetailPopup = { jokerIndex: witchHit.jokerIndex, animStartTime: Date.now() };
        }
        return;
      }
    }

    // 点击弹窗外部关闭女巫详情弹窗 / HUD 女巫弹窗
    if (game._witchDetailPopup) {
      game._witchDetailPopup = null;
      return;
    }

    // 检测卡牌图鉴图标点击
    if (renderer.cardBookIconRect && game.cardBookUnlocked) {
      const cbHit = renderer.hitTest(x, y, [renderer.cardBookIconRect]);
      if (cbHit) {
        vibrate();
        game.cardBookOpen = true;
        game.cardBookPage = 0;
        game._cardBookAnimStartTime = Date.now();
        game._closingCardBook = false;
        return;
      }
    }

    // 检测已购买道具栏中的药水牌点击
    if (renderer.potionPropRects) {
      const potionHit = renderer.hitTest(x, y, renderer.potionPropRects);
      if (potionHit) {
        vibrate();
        const potion = game.potions[potionHit.potionIndex];
        if (!potion) return;
        // 字母置换药水：游戏中直接使用，弹出选择弹窗
        if (potion.effect === 'change_letter') {
          const selectedCards = game.getSelectedCards();
          if (selectedCards.length !== 1) {
            game._changeLetterHint = { potionIndex: potionHit.potionIndex, startTime: Date.now() };
            return;
          }
          game._changeLetterPopup = {
            potionIndex: potionHit.potionIndex,
            cardId: selectedCards[0].id,
            originalLetter: selectedCards[0].letter,
            targetLetter: null,
            startTime: Date.now(),
          };
          return;
        }
        // 其他药水：从道具栏移除后进入 potion 状态
        game.potions.splice(potionHit.potionIndex, 1);
        game.potionMode = {...potion};
        game._prePotionState = 'playing';
        game.state = 'potion';
        if (game.storageManager) game.storageManager.saveProgress();
        return;
      }
    }
  }

  if (game.state === 'settlement') {
    if (renderer.settlementRenderer && renderer.settlementRenderer.claimBtnRect) {
      const btnHit = renderer.hitTest(x, y, [renderer.settlementRenderer.claimBtnRect]);
      if (btnHit) {
        vibrate();
        if (game.audioManager) game.audioManager.play('tap');
        renderer.settlementRenderer.claimBtnPressed = true;
        setTimeout(() => {
          renderer.settlementRenderer.claimBtnPressed = false;
          game.claimSettlement();
        }, 150);
        return;
      }
    }
  }

  if (game.state === 'witch_reward') {
    const wr = renderer.witchRewardRenderer;
    if (!wr) return;
    const data = game.witchRewardData;
    if (!data) return;

    if (data.phase === 'gift') {
      // 点击3个礼盒之一
      if (wr.giftRects && !data._opening && data._selectedGiftIndex === undefined) {
        const hit = renderer.hitTest(x, y, wr.giftRects);
        if (hit) {
          vibrate();
          if (game.audioManager) game.audioManager.play('tap');
          game.witchRewardData._selectedGiftIndex = hit.index;
          game.witchRewardData._disappearStartTime = Date.now();
          game.witchRewardData._opening = true;
          game.witchRewardData._openingStartTime = Date.now();
          return;
        }
      }
    } else if (data.phase === 'result') {
      // 防止重复触发
      if (wr.okBtnPressed || wr.stashBtnPressed || wr.useBtnPressed) return;

      if (data.result) {
        if (data.rewardItem && data.rewardItem.type === 'buff') {
          // buff 类奖励：领取按钮
          if (wr.okBtnRect) {
            const hit = renderer.hitTest(x, y, [wr.okBtnRect]);
            if (hit) {
              vibrate();
              if (game.audioManager) game.audioManager.play('tap');
              wr.okBtnPressed = true;
              setTimeout(() => {
                wr.okBtnPressed = false;
                game.closeWitchReward('ok');
              }, 150);
              return;
            }
          }
        } else {
          // 药水类奖励：暂存 / 立即使用
          const rects = [];
          if (wr.stashBtnRect) rects.push({ ...wr.stashBtnRect, action: 'stash' });
          if (wr.useBtnRect) rects.push({ ...wr.useBtnRect, action: 'use' });
          const btnHit = renderer.hitTest(x, y, rects);
          if (btnHit) {
            vibrate();
            if (game.audioManager) game.audioManager.play('tap');
            if (btnHit.action === 'stash') {
              wr.stashBtnPressed = true;
              setTimeout(() => {
                wr.stashBtnPressed = false;
                game.closeWitchReward('stash');
              }, 150);
            } else if (btnHit.action === 'use') {
              wr.useBtnPressed = true;
              setTimeout(() => {
                wr.useBtnPressed = false;
                game.closeWitchReward('use');
              }, 150);
            }
            return;
          }
        }
      } else {
        // 没中：确定按钮
        if (wr.okBtnRect) {
          const hit = renderer.hitTest(x, y, [wr.okBtnRect]);
          if (hit) {
            vibrate();
            if (game.audioManager) game.audioManager.play('tap');
            wr.okBtnPressed = true;
            setTimeout(() => {
              wr.okBtnPressed = false;
              game.closeWitchReward('ok');
            }, 150);
            return;
          }
        }
      }
    }
  }

  if (game.state === 'shop') {
    // 商店女巫技能引导：优先处理引导点击，禁用其他交互
    if (game.shopGuidePhase >= 1 && game.shopGuidePhase <= 2) {
      if (renderer.shopGuideNextBtnRect) {
        const btnHit = renderer.hitTest(x, y, [renderer.shopGuideNextBtnRect]);
        if (btnHit) {
          vibrate();
          if (game.audioManager) game.audioManager.play('tap');
          game.advanceShopGuide();
          return;
        }
      }
      // 引导阶段点击其他区域不响应
      return;
    }

    // 卡牌图鉴引导交互处理（简化版：Phase 1 高亮图标 → 弹出女巫+对话框 → 点击推进）
    if (game.cardBookGuidePhase >= 1 && game.cardBookGuidePhase <= 3) {
      if (game.cardBookGuidePhase === 1 || game.cardBookGuidePhase === 2) {
        // Phase 1/2: 女巫+对话框阶段，点击对话框推进
        if (renderer.cardBookGuideNextBtnRect) {
          const btnHit = renderer.hitTest(x, y, [renderer.cardBookGuideNextBtnRect]);
          if (btnHit) {
            vibrate();
            if (game.audioManager) game.audioManager.play('tap');
            game.advanceCardBookGuide();
            return;
          }
        }
        return;
      }
      // Phase 3: 退场动画中，阻塞输入
      return;
    }

    // 检测卡牌图鉴图标点击
    if (renderer.cardBookIconRect && game.cardBookUnlocked) {
      const cbHit = renderer.hitTest(x, y, [renderer.cardBookIconRect]);
      if (cbHit) {
        vibrate();
        game.cardBookOpen = true;
        game.cardBookPage = 0;
        game._cardBookAnimStartTime = Date.now();
        game._closingCardBook = false;
        return;
      }
    }

    // 确认购买弹窗打开时
    if (game.confirmBuyItem !== undefined && game.confirmBuyItem !== null) {
      // 购买成功弹窗
      if (game._confirmBuySuccess) {
        if (game._successBtnPressed) return;

        const rects = [];
        if (renderer.confirmBuyRenderer && renderer.confirmBuyRenderer.successBtnRect) {
          rects.push(renderer.confirmBuyRenderer.successBtnRect);
        }
        if (renderer.confirmBuyRenderer && renderer.confirmBuyRenderer.successBtn2Rect) {
          rects.push(renderer.confirmBuyRenderer.successBtn2Rect);
        }
        const btnHit = renderer.hitTest(x, y, rects);
        if (btnHit) {
          vibrate();
          if (game.audioManager) game.audioManager.play('tap');
          game._successBtnPressed = true;
          game._successPressedBtn = btnHit.action;
          game._successBtnPressTime = Date.now();
          setTimeout(() => {
            game._successBtnPressed = false;
            game._successPressedBtn = null;
            // 女巫牌且点击"装备"
            if (btnHit.action === 'equipWitch' && game._confirmBuyItemData) {
              const item = {...game._confirmBuyItemData};
              if (item.limit !== undefined && item.usesLeft === undefined) {
                item.usesLeft = item.limit;
              }
              game.jokers.push(item);
              if (game.storageManager) game.storageManager.saveProgress();
            }
            // 药水牌且点击"暂存"
            if (btnHit.action === 'stashPotion' && game._confirmBuyItemData) {
              game.potions.push({...game._confirmBuyItemData});
              if (game.storageManager) game.storageManager.saveProgress();
            }
            // 药水牌且点击"立即使用"
            if (btnHit.action === 'usePotionNow' && game._confirmBuyItemData) {
              const item = game._confirmBuyItemData;
              game.potionMode = {...item};
              game._prePotionState = 'shop';
              game.state = 'potion';
            }
            // 水晶球点击"生效"
            if (btnHit.action === 'applyCrystal' && game._confirmBuyItemData) {
              const item = game._confirmBuyItemData;
              if (item.effect === 'reroll_skill') {
                // 技能重掷：从 SKILL_POOL 随机选一个新技能替换下一回合的
                const { SKILL_POOL, shuffleSkills } = require('./js/witch_skills');
                const { WITCH_SKILLS } = require('./js/witch_skills');
                const nextRound = game.round + 1;
                const targetConfig = WITCH_SKILLS.find(s => s.level === nextRound);
                if (targetConfig && game._shuffledSkills) {
                  const idx = WITCH_SKILLS.indexOf(targetConfig);
                  if (idx >= 0 && idx < game._shuffledSkills.length) {
                    const newSkill = SKILL_POOL[Math.floor(Math.random() * SKILL_POOL.length)];
                    game._shuffledSkills[idx] = {...newSkill};
                  }
                }
              }
            }
            game._closingConfirmBuy = true;
            game._closeConfirmBuyStartTime = Date.now();
          }, 300);
          return;
        }
        return; // 点击外部不关闭
      }

      return;
    }

    // 检测已购买道具栏点击（选中/取消选中）
    if (renderer.shopRenderer && renderer.shopRenderer.shopOwnedPropRects) {
      const propHit = renderer.hitTest(x, y, renderer.shopRenderer.shopOwnedPropRects);
      if (propHit) {
        vibrate();
        const prev = renderer.shopRenderer.shopSelectedOwned;
        if (prev && prev.type === propHit.array && prev.index === propHit.index) {
          renderer.shopRenderer.shopSelectedOwned = null;
        } else {
          renderer.shopRenderer.shopSelectedOwned = { type: propHit.array, index: propHit.index };
        }
        return;
      }
    }

    // 检测售出按钮点击
    if (renderer.shopRenderer && renderer.shopRenderer.shopSellBtnRect) {
      const sellHit = renderer.hitTest(x, y, [renderer.shopRenderer.shopSellBtnRect]);
      if (sellHit) {
        vibrate();
        if (game.audioManager) game.audioManager.play('tap');
        const arr = game[sellHit.array];
        if (arr && arr[sellHit.index]) {
          const item = arr[sellHit.index];
          game.gold += Math.round(item.cost / 2);
          // 启动售出消失动画（400ms 后实际移除）
          game._sellingProp = {
            type: sellHit.array,
            index: sellHit.index,
            startTime: Date.now(),
          };
          renderer.shopRenderer.shopSelectedOwned = null;
          if (game.storageManager) game.storageManager.saveProgress();
        }
        return;
      }
    }

    // 点击商店页面其他地方，关闭售出按钮
    if (renderer.shopRenderer && renderer.shopRenderer.shopSelectedOwned) {
      renderer.shopRenderer.shopSelectedOwned = null;
      return;
    }

    // 检测全局重掷按钮点击（扣除 3 金币，刷新所有模块）
    if (renderer.shopRenderer && renderer.shopRenderer.shopGlobalRerollBtnRect) {
      const rerollHit = renderer.hitTest(x, y, [renderer.shopRenderer.shopGlobalRerollBtnRect]);
      if (rerollHit) {
        vibrate();
        if (game.audioManager) game.audioManager.play('tap');
        renderer.shopRenderer.rerollBtnPressed = { pressTime: Date.now() };
        if (game.gold >= 3) {
          game.gold -= 3;
          refreshModule(game, 0);
          refreshModule(game, 1);
          refreshModule(game, 2);
        }
        return;
      }
    }

    // 检测刷新按钮点击（扣除 5 金币）
    if (renderer.shopRenderer && renderer.shopRenderer.shopRefreshRects) {
      const refreshHit = renderer.hitTest(x, y, renderer.shopRenderer.shopRefreshRects);
      if (refreshHit) {
        vibrate();
        if (game.audioManager) game.audioManager.play('tap');
        renderer.shopRenderer.refreshBtnPressed = { modIdx: refreshHit.modIdx, pressTime: Date.now() };
        if (game.gold >= 5) {
          game.gold -= 5;
          refreshModule(game, refreshHit.modIdx);
        }
        return;
      }
    }

    // 点击价格按钮直接购买（跳过确认弹窗）
    if (renderer.shopRenderer && renderer.shopRenderer.shopPriceBtnRects) {
      const priceHit = renderer.hitTest(x, y, renderer.shopRenderer.shopPriceBtnRects);
      if (priceHit) {
        vibrate();
        if (game.audioManager) game.audioManager.play('tap');
        const item = game.shopItems[priceHit.index];
        if (!item) return;
        // 金币不足或已达上限，直接忽略
        if (game.gold < item.cost) return;
        if (item.type === 'witch' && (game.jokers || []).length >= game.maxJokerSlots) return;
        const isAlwaysBuyablePotion = item.type === 'potion' && (item.effect === 'upgrade_letter' || item.effect === 'random_upgrade');
        if (item.type === 'potion' && (game.potions || []).length >= 2 && !isAlwaysBuyablePotion) return;

        // 按下动效
        renderer.shopRenderer.priceBtnPressed = { index: priceHit.index, pressTime: Date.now() };

        setTimeout(() => {
          renderer.shopRenderer.priceBtnPressed = null;
          // 执行购买
          game._confirmBuyItemData = item ? {...item} : null;
          const success = buyItem(game, priceHit.index);
          if (success) {
            game.confirmBuyItem = priceHit.index;
            game._confirmBuySuccess = true;
            game._confirmBuySuccessTime = Date.now();
          }
        }, 200);
        return;
      }
    }

    if (renderer.shopRenderer && renderer.shopRenderer.nextRoundBtnRect) {
      const btnHit = renderer.hitTest(x, y, [renderer.shopRenderer.nextRoundBtnRect]);
      if (btnHit && !game._challengeBtnPressed) {
        vibrate();
        if (game.audioManager) game.audioManager.play('tap');
        game._challengeBtnPressed = true;
        renderer.shopRenderer.challengeBtnPressed = true;
        renderer.shopRenderer.challengeBtnPressTime = Date.now();
        // 启动页面过渡动画
        game._shopToGameTransition = { startTime: Date.now() };
        setTimeout(() => {
          game.nextRound();
        }, 400);
        return;
      }
    }
  }

  if (game.state === 'potion') {
    // 动画进行中，忽略所有点击
    if (game._potionUpgrading) return;

    // 防御：potionMode 异常为空时直接忽略
    if (!game.potionMode) return;

    // === 随机强化药水（老虎机）===
    if (game.potionMode && game.potionMode.effect === 'random_upgrade') {
      // 检测抽选按钮（只在 idle 阶段可点）
      if (renderer.randomSpinBtnRect && renderer.randomSpinBtnRect.enabled) {
        const spinHit = renderer.hitTest(x, y, [renderer.randomSpinBtnRect]);
        if (spinHit) {
          vibrate();
          if (game.audioManager) game.audioManager.play('tap');
          game.startRandomSpin();
          return;
        }
      }
      return;
    }

    // 检测字母点击
    if (renderer.potionLetterRects) {
      const letterHit = renderer.hitTest(x, y, renderer.potionLetterRects);
      if (letterHit) {
        vibrate();
        game._potionSelectedLetter = letterHit.letter;
        return;
      }
    }

    // 检测升级按钮
    if (renderer.potionUpgradeBtnRect && renderer.potionUpgradeBtnRect.enabled) {
      const btnHit = renderer.hitTest(x, y, [renderer.potionUpgradeBtnRect]);
      if (btnHit && game._potionSelectedLetter) {
        vibrate();
        if (game.audioManager) game.audioManager.play('tap');
        // 先计算升级后的分数
        const potion = game.potionMode;
        const letter = game._potionSelectedLetter;
        const baseScore = LETTER_SCORE[letter];
        const existing = letterUpgrades.get(letter) || {};
        const oldScore = Math.floor(baseScore * (existing.mult || 1)) + (existing.add || 0);
        let newScore, totalMult, totalAdd;
        if (potion.effect === 'upgrade_letter') {
          // 字母强化：加法叠加
          const add = potion.value || 10;
          totalMult = existing.mult || 1;
          totalAdd = (existing.add || 0) + add;
          newScore = Math.floor(baseScore * totalMult) + totalAdd;
        } else {
          // 其他（如随机强化/王牌强化）：乘法叠加
          const mult = potion.value || 2;
          totalMult = (existing.mult || 1) * mult;
          totalAdd = existing.add || 0;
          newScore = Math.floor(baseScore * totalMult) + totalAdd;
        }
        // 执行升级（保留 potionMode 让字母选择页面继续显示）
        const savedPotionMode = game.potionMode;
        upgradeLetter(game, letter);
        game.potionMode = savedPotionMode;
        // 启动弹出动画
        game._potionUpgrading = {
          startTime: Date.now(),
          letter: letter,
          oldScore: oldScore,
          newScore: newScore,
          upgradeMult: totalMult,
          upgradeAdd: totalAdd
        };
        game._potionSelectedLetter = null;
        return;
      }
    }

    // 检测暂存按钮
    if (renderer.potionStashBtnRect && renderer.potionStashBtnRect.enabled) {
      const btnHit = renderer.hitTest(x, y, [renderer.potionStashBtnRect]);
      if (btnHit) {
        vibrate();
        if (game.audioManager) game.audioManager.play('tap');
        // 将药水放入道具栏（如果不在的话）
        if (game.potionMode) {
          const alreadyStashed = game.potions && game.potions.some(p => p.effect === game.potionMode.effect);
          if (!alreadyStashed) {
            game.potions = game.potions || [];
            game.potions.push({...game.potionMode});
          }
          game.potionMode = null;
        }
        game.state = game._prePotionState || 'shop';
        game._prePotionState = null;
        game._potionSelectedLetter = null;
        if (game.storageManager) game.storageManager.saveProgress();
        return;
      }
    }
  }

  if (game.state === 'life_extended') {
    if (game._lifeExtensionBtnPressed) return;
    if (renderer.lifeExtensionBtnRect) {
      const btnHit = renderer.hitTest(x, y, [renderer.lifeExtensionBtnRect]);
      if (btnHit) {
        vibrate();
        if (game.audioManager) game.audioManager.play('tap');
        game._lifeExtensionBtnPressed = true;
        setTimeout(() => {
          game._lifeExtensionBtnPressed = false;
          game._lifeExtensionAnim = null;
          // 发放结算金币（与 _showSettlement 逻辑一致）
          const baseGold = 3 + Math.round(game.round / 3);
          const extraHands = game.handsLeft * 2;
          const extraDiscards = game.discardsLeft * 1;
          game.gold += baseGold + extraHands + extraDiscards;
          // 目标分脉冲动画（放大缩小，参考目标减免/金币胶囊）
          const bonus = game._lifeExtensionBonus || 0;
          if (bonus > 0) {
            game._lifeExtensionTargetAnim = { startTime: Date.now(), duration: 600 };
          }
          game.state = 'shop';
          if (!game.shopItems) game.shopItems = generateShopItems(game);
          if (game.storageManager) game.storageManager.saveProgress();
        }, 150);
        return;
      }
    }
  }

  if (game.state === 'gameover') {
    if (game._closingGameOver) return;
    if (game._restartBtnPressed) return;
    if (game._reviveBtnPressed) return;

    // 排行榜显示时，点击任意位置关闭
    if (isRankShowing) {
      hideRankList();
      return;
    }

    // 复活按钮
    if (renderer.gameOverRenderer && renderer.gameOverRenderer.reviveBtnRect) {
      const reviveHit = renderer.hitTest(x, y, [renderer.gameOverRenderer.reviveBtnRect]);
      if (reviveHit) {
        const dailyReviveUsed = game.storageManager && game.storageManager.isDailyReviveUsed();
        if (dailyReviveUsed) {
          game.hintToast = { text: '今日复活次数已用完', expireAt: Date.now() + 2000 };
          return;
        }
        vibrate();
        if (game.audioManager) game.audioManager.play('tap');
        game._reviveBtnPressed = true;
        game._reviveBtnPressTime = Date.now();

        // 拉起分享复活
        shareReviveState = { startTime: Date.now(), resolving: true };
        wx.shareAppMessage({
          title: `我正在收集女巫词牌，快来帮我过这关！`,
          query: `from=revive&round=${game.round}&score=${game.totalScore}`
        });
        return;
      }
    }

    // 排行榜按钮
    if (renderer.gameOverRenderer && renderer.gameOverRenderer.rankBtnRect) {
      const rankHit = renderer.hitTest(x, y, [renderer.gameOverRenderer.rankBtnRect]);
      if (rankHit) {
        vibrate();
        if (game.audioManager) game.audioManager.play('tap');
        showRankList();
        return;
      }
    }

    if (renderer.gameOverRenderer && renderer.gameOverRenderer.restartBtnRect) {
      const btnHit = renderer.hitTest(x, y, [renderer.gameOverRenderer.restartBtnRect]);
      if (btnHit) {
        vibrate();
        if (game.audioManager) game.audioManager.play('tap');
        game._restartBtnPressed = true;
        game._restartBtnPressTime = Date.now();
        setTimeout(() => {
          game._restartBtnPressed = false;
          game._closingGameOver = true;
          game._closeStartTime = Date.now();
          setTimeout(() => {
            restartGame();
          }, 200);
        }, 150);
        return;
      }
    }
  }
}

function restartGame() {
  console.log('[CardBook] restartGame 前, 旧实例 collectedWitchCards:', game ? JSON.stringify(game.collectedWitchCards) : 'null');
  // 先销毁旧实例，释放音频、清除 timeout 闭包，防止内存泄漏
  if (game) {
    game.destroy();
  }
  if (renderer) {
    renderer.resetState();
  }
  // 清理可能残留的网络请求标记
  const { checkingWords } = require('./js/data');
  checkingWords.clear();

  if (renderer && renderer.gameOverRenderer) {
    renderer.gameOverRenderer.lastGameOverReason = null;
    renderer.gameOverRenderer.animStartTime = null;
  }
  game = new Game();
  game.cloudStorage = cloudStorage;
  game.renderer = renderer;
  wx.game = game;

  // 加载 cloudStorage 缓存的音频
  if (game.audioManager) game.audioManager.loadFromCloud(game.cloudStorage);
  console.log('[CardBook] restartGame 后, 新实例 collectedWitchCards:', JSON.stringify(game.collectedWitchCards));
  game._preloadWitchAvatars();
  game._potionSelectedLetter = null;
  game._potionUpgrading = null;
  game._randomUpgradePopup = null;
  game._changeLetterPopup = null;
  game._closingChangeLetter = false;
  game._closeChangeLetterStartTime = null;
  game._changeLetterHint = null;
  game.witchRewardData = null;
  game._lifeExtensionAnim = null;
  game._lifeExtensionBtnPressed = false;
}

// 游戏主循环
let lastTime = 0;
function gameLoop(timestamp) {
  const deltaTime = timestamp - lastTime;
  lastTime = timestamp;

  if (!preloadComplete) {
    // 预加载阶段：绘制预加载页
    renderer.drawPreviewLoad(preloadProgress);
  } else if (transitionStartTime !== null) {
    // 过渡阶段：直接渲染游戏页面（去掉淡入淡出）
    renderer.render(game);
    transitionStartTime = null;
  } else {
    game.update(deltaTime);
    renderer.render(game);
  }

  requestAnimationFrame(gameLoop);
}

// 启动预加载并开始渲染循环
startPreload();
requestAnimationFrame(gameLoop);

// 暴露到全局（调试用）
wx.renderer = renderer;
