// require('./js/render/test');
// 微信小游戏入口
const { Game, requestGlobalProfile, fetchGlobalRank } = require('./js/game');
const { Renderer } = require('./js/renderer');
const { InputHandler } = require('./js/input');
const { buyItem, upgradeLetter, refreshModule, generateShopItems } = require('./js/shop');
const { LETTER_SCORE, letterUpgrades } = require('./js/data');
const { WITCH_SKILLS } = require('./js/witch_skills');
const { StorageManager } = require('./js/storage');
const { CloudStorageManager } = require('./js/cloud_storage');
const { reportEvent } = require('./js/report');
const { handleBattleInput } = require('./js/battle/input');

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

  // === 分享求助检测 ===
  if (shareTipHelpState && shareTipHelpState.resolving && game) {
    const stayed = Date.now() - shareTipHelpState.startTime;
    console.log('[ShareTipHelp] 分享界面停留时间:', stayed, 'ms');
    if (stayed >= 2500) {
      console.log('[ShareTipHelp] 判定分享成功，执行提示');
      // 每日分享次数限制
      const today = new Date().toISOString().slice(0, 10);
      if (game._dailyShareDate !== today) {
        game._dailyShareDate = today;
        game._dailyShareCount = 0;
      }
      game._dailyShareCount++;
      if (game.storageManager) game.storageManager.saveProgress();
      game.closeTipHelpPopup();
      game.showSeedWordHint();
      const remain = Math.max(0, 3 - game._dailyShareCount);
      game.hintToast = { text: `分享成功！今日还可分享${remain}次`, expireAt: Date.now() + 2000 };
    } else {
      console.log('[ShareTipHelp] 分享取消或停留时间不足');
      if (game) {
        game._tipHelpSharePressed = false;
        game.hintToast = { text: '分享后才可以获得提示哦~', expireAt: Date.now() + 2000 };
      }
    }
    shareTipHelpState = null;
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

// ===== 键盘输入监听（反馈文本框用）=====
wx.onKeyboardInput((res) => {
  if (game && res.value !== undefined) {
    game._feedbackText = res.value.slice(0, 100);
  }
});
wx.onKeyboardConfirm(() => {
  wx.hideKeyboard();
});

// ===== 排行榜相关 =====
let openDataContext = null;
let isRankShowing = false;
let globalAuthButton = null; // wx.createUserInfoButton 实例

function getOpenDataContext() {
  if (!openDataContext && wx.getOpenDataContext) {
    openDataContext = wx.getOpenDataContext();
  }
  return openDataContext;
}

function calcRankPanelRect() {
  const s = renderer ? renderer.scale || 1 : 1;
  const W = canvas ? canvas.width / scaleDpr : 375;
  const H = canvas ? canvas.height / scaleDpr : 667;
  const panelW = Math.min(W * 0.9, 340 * s);
  const panelH = Math.min(H * 0.75, 520 * s);
  const panelX = (W - panelW) / 2;
  const panelY = (H - panelH) / 2;
  const headerH = 78 * s; // 标题 + Tab 高度 + Tab 与表头间距
  const paddingX = 16 * s;
  const paddingB = 16 * s;
  return {
    panelX, panelY, panelW, panelH,
    contentX: panelX + paddingX,
    contentY: panelY + headerH,
    contentW: panelW - paddingX * 2,
    contentH: panelH - headerH - paddingB,
    closeSize: 28 * s,
    s, W, H
  };
}

function calcGlobalAuthButtonRect() {
  const rect = calcRankPanelRect();
  const btnW = 180 * rect.s;
  const btnH = 44 * rect.s;
  const btnX = rect.panelX + (rect.panelW - btnW) / 2;
  const btnY = rect.contentY + rect.contentH / 2 - btnH / 2;
  return { x: btnX, y: btnY, w: btnW, h: btnH };
}

function showRankList(panelRect) {
  const odc = getOpenDataContext();
  if (!odc) return;
  isRankShowing = true;
  if (game) game._showingRankList = true;

  // OffScreenCanvas 模式：主域设置 sharedCanvas 的宽高（开放域不能设）
  const sharedCanvas = odc.canvas;
  if (sharedCanvas) {
    try {
      sharedCanvas.width = canvas.width;
      sharedCanvas.height = canvas.height;
    } catch (e) {
      console.warn('sharedCanvas set failed', e.message);
    }
  }

  // 如果在弹窗内显示好友榜，使用 showPanel 模式，只绘制内容区域
  if (panelRect) {
    odc.postMessage({
      action: 'showPanel',
      scaleDpr,
      canvasWidth: canvas.width,
      canvasHeight: canvas.height,
      rect: panelRect,
    });
  } else {
    odc.postMessage({
      action: 'show',
      scaleDpr,
      canvasWidth: canvas.width,
      canvasHeight: canvas.height,
    });
  }
}

function hideRankList() {
  const odc = getOpenDataContext();
  if (!odc) return;
  isRankShowing = false;
  if (game) game._showingRankList = false;
  odc.postMessage({ action: 'hide' });
}

function showRankPopup(tab = 'friend') {
  if (!game) return;
  game._showingRankPopup = true;
  game._rankTab = tab;
  switchRankTab(tab);

  // 阶段2优化：打开排行榜时后台预加载 rank_avatar
  if (game.cloudStorage && !game._rankAvatarPreloaded) {
    game._rankAvatarPreloaded = true;
    game.cloudStorage.preloadRankAvatarImages().then(() => {
      console.log('[Preload] rank_avatar 加载完成');
    }).catch(err => {
      console.error('[Preload] rank_avatar 预加载失败:', err);
    });
  }
}

function resetGlobalRankScroll() {
  if (!game) return;
  game._globalRankScrollY = 0;
  game._globalRankMaxScroll = 0;
  game._globalRankScrollState = 'idle';
  game._globalRankScrollVelocity = 0;
  game._globalRankScrollDragStartY = 0;
  game._globalRankScrollTouchStartY = 0;
  game._globalRankScrollLastTouchY = 0;
  game._globalRankScrollLastTime = 0;
  game._globalRankScrollBounceTarget = 0;
  game._globalRankScrollBounceStartY = 0;
  game._globalRankScrollBounceStartTime = 0;
}

function hideRankPopup() {
  if (!game) return;
  hideRankList();
  destroyGlobalAuthButton();
  game._showingRankPopup = false;
  game._rankTab = 'friend';
  game._globalRankData = null;
  game._globalRankLoading = false;
  game._globalRankError = null;
  game._showingGlobalAuthButton = false;
  game._globalProfileDeniedThisTime = false;
  resetGlobalRankScroll();
}

function switchRankTab(tab) {
  if (!game) return;
  game._rankTab = tab;

  if (tab === 'friend') {
    // 切换到好友榜：使用开放域 panel 模式
    destroyGlobalAuthButton();
    game._showingGlobalAuthButton = false;
    const rect = calcRankPanelRect();
    showRankList({
      x: rect.contentX,
      y: rect.contentY,
      w: rect.contentW,
      h: rect.contentH,
    });
    game._showingRankList = true;
  } else {
    // 切换到全国榜：隐藏好友榜，由主域绘制
    hideRankList();
    game._showingRankList = false;
    resetGlobalRankScroll();
    handleGlobalTabEnter();
  }
}

async function handleGlobalTabEnter() {
  if (!game) return;

  // 检查授权期间先显示 loading，避免短暂闪现“加载失败”
  game._globalRankLoading = true;
  game._globalRankError = null;
  game._globalRankData = null;

  // 先检查是否已经授权过头像昵称
  const isAuth = await checkUserInfoAuth();
  if (isAuth) {
    destroyGlobalAuthButton();
    game._showingGlobalAuthButton = false;
    game._globalProfileDeniedThisTime = false;
    loadGlobalRank(false);
  } else {
    // 未授权：隐藏 loading，显示原生授权按钮，由用户主动点击后授权
    game._globalRankLoading = false;
    showGlobalAuthButton();
  }
}

function checkUserInfoAuth() {
  if (!wx.getSetting) return Promise.resolve(false);
  return new Promise((resolve) => {
    wx.getSetting({
      success: (res) => {
        const auth = !!(res.authSetting && res.authSetting['scope.userInfo']);
        console.log('[GlobalRank] scope.userInfo 授权状态', auth);
        resolve(auth);
      },
      fail: (err) => {
        console.warn('[GlobalRank] getSetting 失败', err);
        resolve(false);
      }
    });
  });
}

function showGlobalAuthButton() {
  if (!game) return;
  if (!wx.createUserInfoButton) {
    console.warn('[GlobalRank] 当前环境不支持 createUserInfoButton');
    loadGlobalRank(false);
    return;
  }

  // 如果已经有按钮，先销毁避免重复
  destroyGlobalAuthButton();

  const rect = calcGlobalAuthButtonRect();
  console.log('[GlobalRank] 创建授权按钮', rect);

  game._showingGlobalAuthButton = true;
  globalAuthButton = wx.createUserInfoButton({
    type: 'text',
    text: '授权头像昵称',
    style: {
      left: rect.x,
      top: rect.y,
      width: rect.w,
      height: rect.h,
      lineHeight: rect.h,
      backgroundColor: 'rgba(196, 163, 90, 0.95)',
      color: '#ffffff',
      textAlign: 'center',
      fontSize: 16,
      borderRadius: 8,
    }
  });

  globalAuthButton.onTap((res) => {
    console.log('[GlobalRank] 授权按钮点击', res);
    const userInfo = res.userInfo || {};

    // 立即销毁按钮、显示 loading，避免用户感知卡顿
    destroyGlobalAuthButton();
    game._globalRankLoading = true;
    game._globalRankError = null;
    game._globalRankData = null;

    // 延迟一帧执行网络请求，确保 loading 先渲染出来
    setTimeout(() => {
      if (userInfo.avatarUrl && userInfo.nickName) {
        // 用户同意授权，本次不强制默认
        game._globalProfileDeniedThisTime = false;
        // 上传头像昵称
        wx.cloud.callFunction({
          name: 'updateUserProfile',
          data: { avatarUrl: userInfo.avatarUrl, nickname: userInfo.nickName },
          success: () => {
            console.log('[GlobalRank] 头像昵称上传成功');
            loadGlobalRank(false);
          },
          fail: (err) => {
            console.error('[GlobalRank] 头像昵称上传失败', err);
            loadGlobalRank(false);
          }
        });
      } else {
        // 用户拒绝或未获取到，标记本次拒绝，榜单中自己行不使用预制头像/昵称
        game._globalProfileDeniedThisTime = true;
        loadGlobalRank(false);
      }
    }, 50);
  });

  globalAuthButton.show();
}

function destroyGlobalAuthButton() {
  if (globalAuthButton) {
    try {
      globalAuthButton.destroy();
    } catch (e) {
      console.warn('[GlobalRank] 销毁授权按钮异常', e);
    }
    globalAuthButton = null;
  }
  if (game) game._showingGlobalAuthButton = false;
}

async function loadGlobalRank(requestProfile = true) {
  if (!game) return;

  // 每次切换到全国榜都重新拉取
  game._globalRankLoading = true;
  game._globalRankError = null;
  game._globalRankData = null;

  // 仅在非 Tab 切换入口时，内部兜底请求授权
  if (requestProfile && !game._globalProfileRequested) {
    game._globalProfileRequested = true;
    try {
      await requestGlobalProfile();
    } catch (e) {
      console.warn('[GlobalRank] 授权请求异常', e);
    }
  }

  try {
    const result = await fetchGlobalRank();
    game._globalRankLoading = false;
    if (result && result.code === 0) {
      game._globalRankData = result;
    } else {
      const msg = result && result.message ? result.message : '获取全国榜失败';
      game._globalRankError = msg;
      console.error('[GlobalRank] 数据返回错误', result);
    }
  } catch (e) {
    game._globalRankLoading = false;
    game._globalRankError = e.message || '获取全国榜失败';
    console.error('[GlobalRank] loadGlobalRank 异常', e);
  }
}

// 提交问题反馈到云数据库
async function submitFeedback(text) {
  if (!game) return;
  game._feedbackSubmitting = true;
  try {
    const db = wx.cloud.database();
    const collection = db.collection('feedback');
    await collection.add({
      data: {
        text,
        createTime: db.serverDate(),
        round: game.round || 0,
        version: '1.9.0'
      }
    });
    game._feedbackSubmitToast = { text: '反馈提交成功，感谢！', expireAt: Date.now() + 2000 };
    game._feedbackText = '';
  } catch (e) {
    console.error('反馈提交失败:', e);
    game._feedbackSubmitToast = { text: '提交失败，请稍后重试', expireAt: Date.now() + 2000 };
  } finally {
    game._feedbackSubmitting = false;
  }
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
renderer.dpr = scaleDpr;

// 分享复活状态
let shareReviveState = null; // { startTime: number, resolving: boolean }

// 分享求助状态
let shareTipHelpState = null; // { startTime: number, resolving: boolean }

// 云存储管理器
const cloudStorage = new CloudStorageManager('cloud1-d3gecbtu10e4035de');
cloudStorage.init();

// 阶段1优化：Renderer 通过统一资源池读取
renderer.setCloudStorage(cloudStorage);

// 预加载状态
let preloadProgress = 0;
let preloadComplete = false;

// homepage 展示开关（预加载完成后展示，点击通关模式后进入游戏）
let showHomepage = false;

// 主页 → 游戏 翻页过渡状态
let pageFlipState = null;
const PAGE_FLIP_DURATION = 1200;

// 过渡状态（预加载页 → 游戏页）
let transitionAlpha = 0;
let transitionStartTime = null;
const TRANSITION_DURATION = 600;

// 启动预加载：下载云图片并显示进度条
async function startPreload() {
  // 上报用户登录信息（fire-and-forget，不阻塞预加载）
  try {
    wx.cloud.callFunction({
      name: 'login',
      data: {
        brand: info.brand,
        model: info.model,
        system: info.system,
        platform: info.platform,
        language: info.language,
        version: info.version,
        SDKVersion: info.SDKVersion,
        screenWidth: info.screenWidth,
        screenHeight: info.screenHeight,
        pixelRatio: info.pixelRatio
      }
    }).then(res => {
      console.log('[Login] 云函数返回:', res);
      if (res.result && res.result.code === 0) {
        console.log('[Login]', res.result.isNew ? '新用户已创建' : '老用户登录更新', res.result.openid);
      } else {
        console.warn('[Login] 云函数业务失败:', res.result);
      }
    }).catch(err => {
      console.error('[Login] 云函数调用失败:', err);
    });
  } catch (e) {
    console.error('[Login] 登录上报异常:', e);
  }

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

  // 阶段2优化：只预加载 homepage 必需的 bg_icon + music + guide
  const homepageBgIconNames = ['homepageBg', 'homepageRound', 'homepageBattle', 'homepageSetting', 'homepageRanking', 'homepageDaily', 'homepageStudy', 'topHome'];
  const homepageBgIconCount = homepageBgIconNames.filter(name => cloudStorage.bgIconFileMap[name]).length;
  const total = homepageBgIconCount + guideStepCount + musicCount;

  if (total === 0 && collectedWitchCards.length === 0) {
    console.log('[Game] 没有云存储映射，跳过预加载');
    preloadComplete = true;
    startGame();
    showHomepage = true;
    renderer.homepageAnimStartTime = Date.now();
    renderer._homepageEntryAnim = { startTime: Date.now() };
    renderer._resetHomepageEntryAnim();
    return;
  }

  let loaded = 0;
  function onProgress() {
    loaded++;
    preloadProgress = Math.floor((loaded / total) * 100);
  }

  // 阶段2优化：只加载 homepage 必需资源
  await cloudStorage.preloadHomepageBgIcons(onProgress);
  await cloudStorage.preloadMusicFiles(onProgress);
  if (needGuide) {
    await cloudStorage.preloadGuideGroup(1, renderer);
    onProgress();
    await cloudStorage.preloadGuideGroup(2, renderer);
    onProgress();
  }

  // 不再预加载 shop_card、rank_avatar、witch_card
  // 这些资源移到对应事件点加载

  // 存档恢复时：不再预加载 witch_card，改为图鉴打开时按需加载
  if (collectedWitchCards.length > 0) {
    console.log('[Preload] 阶段2优化：witch_card 不再启动期预加载，改为图鉴打开时按需加载');
  }

  // 阶段2优化：不再注入到 renderer，renderer 通过 getter 读取
  // cloudStorage.injectToRenderer(renderer);
  // cloudStorage.injectBgIconToRenderer(renderer);
  if (needGuide) {
    cloudStorage.injectGuideToRenderer(renderer);
  }
  preloadComplete = true;
  startGame();
  showHomepage = true;
  renderer.homepageAnimStartTime = Date.now();
  renderer._homepageEntryAnim = { startTime: Date.now() };
  renderer._resetHomepageEntryAnim();
  console.log('[Game] 云图片预加载完成，进入主页');
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

  // 存档恢复时：补充按需下载可能遗漏的引导精灵图（witch_guide_3/4）
  if (game.round === 2 && game.shopGuidePhase === 0) {
    cloudStorage.preloadGuideGroup(3, renderer).catch(err => {
      console.error('[Restore] 补充下载 witch_guide_3 失败:', err);
    });
  }
  if (game.round === 3 && game.cardBookGuidePhase === 0) {
    cloudStorage.preloadGuideGroup(4, renderer).catch(err => {
      console.error('[Restore] 补充下载 witch_guide_4 失败:', err);
    });
  }

  // 加载 cloudStorage 缓存的音频
  if (game.audioManager) game.audioManager.loadFromCloud(game.cloudStorage);

  // 游戏启动后直接尝试播放 BGM（不强制要求用户交互）
  if (game.audioManager) game.audioManager.tryStartBGM();

  // 从预加载页进入商店页时，强制刷新商店
  if (game.state === 'shop') {
    game.shopItems = generateShopItems(game);
  }

  transitionStartTime = Date.now();

  // 游戏启动后按需预加载女巫头像（当前回合兜底 + 下一回合提前）
  game._preloadWitchAvatars();

  // 预加载页完成后进入游戏页面时，后台下载 rank_avatar 云图集（不区分是否第一回合）
  if (game.cloudStorage && !game._rankAvatarPreloaded) {
    game._rankAvatarPreloaded = true;
    game.cloudStorage.preloadRankAvatarImages().then(() => {
      if (game.cloudStorage) game.cloudStorage.injectRankAvatarToRenderer(renderer);
    });
  }

  // ===== 分享转发初始化 =====
  wx.showShareMenu({ withShareTicket: true });

  // 被动转发：用户点击右上角转发时，返回 Canvas 截图
  wx.onShareAppMessage(() => {
    try {
      const tempFilePath = canvas.toTempFilePathSync({
        x: 0,
        y: 0,
        width: canvas.width,
        height: Math.floor(canvas.height * 0.6),
        destWidth: 500,
        destHeight: 400,
        fileType: 'png',
        quality: 0.85
      });
      return {
        title: `我在女巫的词牌闯到了第${game?.round || 1}关，来挑战我吧！`,
        imageUrl: tempFilePath,
        query: `from=share&round=${game?.round || 1}&score=${game?.totalScore || 0}`
      };
    } catch (e) {
      console.warn('[Share] Canvas 截图失败:', e);
      return {
        title: `我在女巫的词牌闯到了第${game?.round || 1}关，来挑战我吧！`,
        query: `from=share&round=${game?.round || 1}&score=${game?.totalScore || 0}`
      };
    }
  });
}

// 长按检测状态
let longPressTimer = null;
let touchStartPos = null;
let longPressTriggered = false;
const LONG_PRESS_DURATION = 600; // 600ms 长按
const LONG_PRESS_MOVE_THRESHOLD = 10; // 移动超过 10px 取消长按

// 计算输入 Y 坐标：playing/shop/life_extended 且没有独立弹窗时，
// 页面内容整体下移 10px，因此触摸命中需要反向偏移 10px 对齐视觉位置
function getInputY(x, y) {
  const hasModal = game && (
    game._dailyWordsPopup ||
    (game._wordBookPopup && !game._closingWordBook) ||
    (game._settingsPopup && !game._closingSettings) ||
    game._showingRankPopup ||
    game._tipHelpPopup ||
    game.cardBookOpen ||
    game._changeLetterPopup ||
    (game.confirmBuyItem !== undefined && game.confirmBuyItem !== null) ||
    game._newWitchCardPopup ||
    (game._lifeExtensionAnim && Date.now() - game._lifeExtensionAnim.startTime >= 1000) ||
    (renderer && renderer.debugMenuOpen)
  );
  return (!hasModal && game && (game.state === 'playing' || game.state === 'shop' || game.state === 'life_extended')) ? y - 10 : y;
}

// 触摸事件处理
wx.onTouchStart((e) => {
  const touch = e.touches[0];
  const x = touch.clientX;
  const y = touch.clientY;

  // homepage 触摸处理（预加载完成后展示；设置弹窗打开时不响应主页按钮；入场动画播放时不响应）
  const settingsPopupOpen = game && game._settingsPopup && !game._closingSettings;
  const entryAnimPlaying = renderer._homepageEntryAnim &&
    (Date.now() - renderer._homepageEntryAnim.startTime) < 1200; // 按钮开始弹出后允许交互
  if (showHomepage && renderer.homepageBtnRects && !settingsPopupOpen && !entryAnimPlaying) {
    const hit = renderer.hitTest(x, y, renderer.homepageBtnRects);
    if (hit) {
      console.log('[Homepage] pressed:', hit.key);
      renderer._homepagePressedBtn = hit.key;
      touchStartPos = { x, y };
      longPressTriggered = false;
      if (hit.key === 'setting') {
        // 复用 top_icon 的按下行为（短按打开设置，长按打开调试面板）
        renderer._topIconPressAnim = { pressing: true, startTime: Date.now() };
        longPressTimer = setTimeout(() => {
          longPressTimer = null;
          longPressTriggered = true;
          renderer.debugMenuOpen = !renderer.debugMenuOpen;
        }, LONG_PRESS_DURATION);
      }
      return;
    }
    return;
  }

  // 预加载阶段不响应触摸
  if (!preloadComplete) return;
  if (!game) return;

  const inputY = getInputY(x, y);
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

  // 检测 top_icon：短按返回主页，长按打开调试菜单
  if (renderer.topIconRect) {
    const iconHit = renderer.hitTest(x, inputY, [renderer.topIconRect]);
    if (iconHit) {
      longPressTriggered = false;
      renderer._topIconPressAnim = { pressing: true, startTime: Date.now() };
      longPressTimer = setTimeout(() => {
        longPressTimer = null;
        longPressTriggered = true;
        renderer.debugMenuOpen = !renderer.debugMenuOpen;
      }, LONG_PRESS_DURATION);
      return; // 长按期间不触发其他交互
    }
  }

  // 今日新词弹窗交互（优先处理）
  if (game._dailyWordsPopup) {
    const dwBackHit = renderer.dailyWordsBackRect && renderer.hitTest(x, y, [renderer.dailyWordsBackRect]);
    const dwCloseHit = renderer.dailyWordsCloseRect && renderer.hitTest(x, y, [renderer.dailyWordsCloseRect]);
    const dwSwitchHit = renderer.dailyWordsSwitchRect && renderer.hitTest(x, y, [renderer.dailyWordsSwitchRect]);
    const dwShareHit = renderer.dailyWordsShareRect && renderer.hitTest(x, y, [renderer.dailyWordsShareRect]);
    if (dwBackHit) {
      game._dailyWordsBackPressed = true;
      return;
    }
    if (dwShareHit) {
      game._dailyWordsSharePressed = true;
      return;
    }
    const dwContentHit = renderer.dailyWordsContentRect && renderer.hitTest(x, y, [renderer.dailyWordsContentRect]);
    if (dwCloseHit) {
      game._dailyWordsClosePressed = true;
      return;
    }
    if (dwSwitchHit) {
      game._dailyWordsSwitchPressed = true;
      return;
    }
    if (dwContentHit) {
      // 开始滚动
      game._dailyWordsScrollState = 'dragging';
      game._dailyWordsScrollVelocity = 0;
      game._dailyWordsScrollDragStartY = game._dailyWordsScrollY || 0;
      game._dailyWordsScrollTouchStartY = y;
      game._dailyWordsScrollLastTouchY = y;
      game._dailyWordsScrollLastTime = Date.now();
      return;
    }
    // 点击弹窗外部（遮罩区域）关闭弹窗
    const dwPanelHit = renderer.dailyWordsPanelRect && renderer.hitTest(x, y, [renderer.dailyWordsPanelRect]);
    if (!dwPanelHit) {
      game._dailyWordsPopup.closing = true;
      game._dailyWordsPopup.closeStartTime = Date.now();
      if (game.audioManager) game.audioManager.play('tap');
    }
    return;
  }

  // 单词本弹窗交互（优先处理）
  if (game._wordBookPopup && !game._closingWordBook) {
    const wbBackHit = renderer.wordBookBackRect && renderer.hitTest(x, y, [renderer.wordBookBackRect]);
    const wbCloseHit = renderer.wordBookCloseRect && renderer.hitTest(x, y, [renderer.wordBookCloseRect]);
    const wbWordHeaderHit = renderer.wordBookWordHeaderRect && renderer.hitTest(x, y, [renderer.wordBookWordHeaderRect]);
    const wbCountHeaderHit = renderer.wordBookCountHeaderRect && renderer.hitTest(x, y, [renderer.wordBookCountHeaderRect]);
    const wbContentHit = renderer.wordBookContentRect && renderer.hitTest(x, y, [renderer.wordBookContentRect]);

    if (wbBackHit) {
      game._wordBookBackPressed = true;
      return;
    }
    if (wbCloseHit) {
      game._wordBookClosePressed = true;
      return;
    }
    if (wbWordHeaderHit) {
      // 点击单词表头：切换升序/倒序
      if (game._wordBookSortBy === 'word') {
        game._wordBookSortOrder = game._wordBookSortOrder === 'asc' ? 'desc' : 'asc';
      } else {
        game._wordBookSortBy = 'word';
        game._wordBookSortOrder = 'asc';
      }
      game._wordBookScrollY = 0;
      if (game.audioManager) game.audioManager.play('tap');
      return;
    }
    if (wbCountHeaderHit) {
      // 点击次数表头：切换升序/倒序
      if (game._wordBookSortBy === 'count') {
        game._wordBookSortOrder = game._wordBookSortOrder === 'asc' ? 'desc' : 'asc';
      } else {
        game._wordBookSortBy = 'count';
        game._wordBookSortOrder = 'desc';
      }
      game._wordBookScrollY = 0;
      if (game.audioManager) game.audioManager.play('tap');
      return;
    }
    if (wbContentHit) {
      game._wordBookScrollState = 'dragging';
      game._wordBookScrollVelocity = 0;
      game._wordBookScrollDragStartY = game._wordBookScrollY || 0;
      game._wordBookScrollTouchStartY = y;
      game._wordBookScrollLastTouchY = y;
      game._wordBookScrollLastTime = Date.now();
      return;
    }
    // 点击弹窗外部（遮罩区域）关闭弹窗，回到设置弹窗
    const wbPanelHit = renderer.wordBookPanelRect && renderer.hitTest(x, y, [renderer.wordBookPanelRect]);
    if (!wbPanelHit) {
      game._closingWordBook = true;
      game._closeWordBookStartTime = Date.now();
      if (game.audioManager) game.audioManager.play('tap');
    }
    return;
  }

  // 设置弹窗交互（优先处理）
  if (game._settingsPopup && !game._closingSettings) {
    // 精确检测关闭按钮（延迟关闭）
    const settingsCloseBtnHit = renderer.settingsCloseBtnRect && renderer.hitTest(x, y, [renderer.settingsCloseBtnRect]);
    const settingsCloseHit = renderer.settingsCloseRect && renderer.hitTest(x, y, [renderer.settingsCloseRect]);

    // 主页按钮
    const soundHit = renderer.settingsSoundRect && renderer.hitTest(x, y, [renderer.settingsSoundRect]);
    const dailyChallengeHit = renderer.settingsDailyChallengeRect && renderer.hitTest(x, y, [renderer.settingsDailyChallengeRect]);
    const rankHit = renderer.settingsRankRect && renderer.hitTest(x, y, [renderer.settingsRankRect]);
    const feedbackHit = renderer.settingsFeedbackRect && renderer.hitTest(x, y, [renderer.settingsFeedbackRect]);

    // 反馈页按钮
    const feedbackBackHit = renderer.feedbackBackRect && renderer.hitTest(x, y, [renderer.feedbackBackRect]);
    const feedbackInputHit = renderer.feedbackInputRect && renderer.hitTest(x, y, [renderer.feedbackInputRect]);
    const feedbackSubmitHit = renderer.feedbackSubmitRect && renderer.hitTest(x, y, [renderer.feedbackSubmitRect]);

    if (soundHit) {
      game._settingsSoundPressed = true;
      return;
    }
    if (dailyChallengeHit) {
      // 打开今日新词弹窗
      game._dailyWordsPopup = { startTime: Date.now() };
      if (game.audioManager) game.audioManager.play('tap');
      return;
    }
    if (renderer.settingsWordBookRect && renderer.hitTest(x, y, [renderer.settingsWordBookRect])) {
      // 打开单词本弹窗
      game._wordBookPopup = { startTime: Date.now() };
      game._wordBookScrollY = 0;
      game._wordBookScrollState = null;
      if (game.audioManager) game.audioManager.play('tap');
      return;
    }
    if (rankHit) {
      game._settingsRankPressed = true;
      return;
    }
    if (feedbackHit) {
      game._settingsFeedbackPressed = true;
      return;
    }
    if (feedbackBackHit) {
      game._feedbackBackPressed = true;
      return;
    }
    if (feedbackInputHit) {
      game._feedbackInputFocused = true;
      return;
    }
    if (feedbackSubmitHit) {
      game._feedbackSubmitPressed = true;
      return;
    }

    // 点击关闭按钮：延迟关闭（带按下反馈）
    if (settingsCloseBtnHit) {
      vibrate();
      game._settingsCloseBtnPressed = true;
      if (game.audioManager) game.audioManager.play('tap');
      return;
    }

    // 点击弹窗外区域（面板内部不关闭）
    const panelHit = renderer.settingsPanelRect && renderer.hitTest(x, y, [renderer.settingsPanelRect]);
    if (settingsCloseHit && !panelHit) {
      wx.hideKeyboard();
      if (game._feedbackPage === 'feedback') {
        game._feedbackPage = 'main';
        game._feedbackText = '';
      } else {
        game._closingSettings = true;
        game._closeSettingsStartTime = Date.now();
        if (game.audioManager) game.audioManager.play('tap');
      }
      return;
    }
  }

  // 检测卡牌图鉴图标按下
  if (renderer.cardBookIconRect && game.cardBookUnlocked && !game.cardBookOpen) {
    const cbHit = renderer.hitTest(x, inputY, [renderer.cardBookIconRect]);
    if (cbHit) {
      game._cardBookIconPressed = true;
    }
  }

  // 排行榜弹窗显示时，优先检测关闭按钮和 Tab 切换
  if (game._showingRankPopup) {
    const rect = calcRankPanelRect();
    const { panelX, panelY, panelW, panelH, s } = rect;

    // 关闭按钮区域
    const closeSize = 28 * s;
    const closeX = panelX + panelW - closeSize - 14 * s;
    const closeY = panelY + 14 * s;
    const hitPad = 20 * s;
    const rankCloseBtnRect = {
      x: closeX - hitPad - 10 * s,
      y: closeY - hitPad,
      w: closeSize + hitPad * 2 + 10 * s,
      h: closeSize + hitPad * 2 + 10 * s
    };
    const rankCloseBtnHit = renderer.hitTest(x, y, [rankCloseBtnRect]);
    if (rankCloseBtnHit) {
      vibrate();
      game._rankCloseBtnPressed = true;
      if (game.audioManager) game.audioManager.play('tap');
      const odc = getOpenDataContext();
      if (odc && game._rankTab === 'friend') odc.postMessage({ action: 'closeBtnPress', pressed: true });
      return;
    }

    // Tab 点击区域（标题下方居中）
    const tabY = panelY + 46 * s;
    const tabW = 140 * s;
    const tabH = 30 * s;
    const tabX = panelX + (panelW - tabW) / 2;
    const friendTabRect = { x: tabX, y: tabY, w: tabW / 2, h: tabH };
    const globalTabRect = { x: tabX + tabW / 2, y: tabY, w: tabW / 2, h: tabH };

    if (game._rankTab !== 'friend' && renderer.hitTest(x, y, [friendTabRect])) {
      if (game.audioManager) game.audioManager.play('tap');
      switchRankTab('friend');
      return;
    }
    if (game._rankTab !== 'global' && renderer.hitTest(x, y, [globalTabRect])) {
      if (game.audioManager) game.audioManager.play('tap');
      switchRankTab('global');
      return;
    }

    // 全国榜内容区域：开始滚动拖动
    if (game._rankTab === 'global') {
      const contentRect = { x: rect.contentX, y: rect.contentY, w: rect.contentW, h: rect.contentH };
      if (renderer.hitTest(x, y, [contentRect])) {
        game._globalRankScrollState = 'dragging';
        game._globalRankScrollVelocity = 0;
        game._globalRankScrollDragStartY = game._globalRankScrollY || 0;
        game._globalRankScrollTouchStartY = y;
        game._globalRankScrollLastTouchY = y;
        game._globalRankScrollLastTime = Date.now();
        return;
      }
    }

    // 点击面板内部（非关闭按钮/Tab）不关闭
    const insidePanel = x >= panelX && x <= panelX + panelW && y >= panelY && y <= panelY + panelH;
    if (insidePanel) {
      return;
    }
    hideRankPopup();
    return;
  }

  handleInput(x, inputY);
});

wx.onTouchMove((e) => {
  if (!game) return;
  const touch = e.touches[0];
  const inputY = getInputY(touch.clientX, touch.clientY);
  // 移动超过阈值时取消长按
  if (longPressTimer && touchStartPos) {
    const dx = touch.clientX - touchStartPos.x;
    const dy = touch.clientY - touchStartPos.y;
    if (Math.sqrt(dx * dx + dy * dy) > LONG_PRESS_MOVE_THRESHOLD) {
      clearTimeout(longPressTimer);
      longPressTimer = null;
    }
  }

  // 移出每日挑战奖励弹窗按钮区域时取消按下状态
  if (game._dailyChallengeSharePressed && renderer.dailyChallengeShareRect) {
    const hit = renderer.hitTest(touch.clientX, touch.clientY, [renderer.dailyChallengeShareRect]);
    if (!hit) game._dailyChallengeSharePressed = false;
  }
  if (game._dailyChallengeOkPressed && renderer.dailyChallengeOkRect) {
    const hit = renderer.hitTest(touch.clientX, touch.clientY, [renderer.dailyChallengeOkRect]);
    if (!hit) game._dailyChallengeOkPressed = false;
  }

  // 移出设置弹窗按钮区域时取消按下状态
  if (game._settingsSoundPressed && renderer.settingsSoundRect) {
    const hit = renderer.hitTest(touch.clientX, touch.clientY, [renderer.settingsSoundRect]);
    if (!hit) game._settingsSoundPressed = false;
  }
  if (game._dailyWordsBackPressed && renderer.dailyWordsBackRect) {
    const hit = renderer.hitTest(touch.clientX, touch.clientY, [renderer.dailyWordsBackRect]);
    if (!hit) game._dailyWordsBackPressed = false;
  }
  if (game._dailyWordsClosePressed && renderer.dailyWordsCloseRect) {
    const hit = renderer.hitTest(touch.clientX, touch.clientY, [renderer.dailyWordsCloseRect]);
    if (!hit) game._dailyWordsClosePressed = false;
  }
  if (game._dailyWordsSwitchPressed && renderer.dailyWordsSwitchRect) {
    const hit = renderer.hitTest(touch.clientX, touch.clientY, [renderer.dailyWordsSwitchRect]);
    if (!hit) game._dailyWordsSwitchPressed = false;
  }
  if (game._dailyWordsSharePressed && renderer.dailyWordsShareRect) {
    const hit = renderer.hitTest(touch.clientX, touch.clientY, [renderer.dailyWordsShareRect]);
    if (!hit) game._dailyWordsSharePressed = false;
  }

  // 移出单词本弹窗按钮区域时取消按下状态
  if (game._wordBookBackPressed && renderer.wordBookBackRect) {
    const hit = renderer.hitTest(touch.clientX, touch.clientY, [renderer.wordBookBackRect]);
    if (!hit) game._wordBookBackPressed = false;
  }
  if (game._wordBookClosePressed && renderer.wordBookCloseRect) {
    const hit = renderer.hitTest(touch.clientX, touch.clientY, [renderer.wordBookCloseRect]);
    if (!hit) game._wordBookClosePressed = false;
  }

  // 今日新词弹窗滚动
  if (game._dailyWordsPopup && game._dailyWordsScrollState === 'dragging') {
    const now = Date.now();
    const y = touch.clientY;
    const frameDelta = game._dailyWordsScrollLastTouchY - y;
    const totalDelta = game._dailyWordsScrollTouchStartY - y;
    const dt = now - game._dailyWordsScrollLastTime;

    // 计算未阻尼的目标位置（基于 touchstart 的总位移）
    let targetY = game._dailyWordsScrollDragStartY + totalDelta;

    // 边界阻尼（rubber band）
    const maxScroll = renderer.dailyWordsMaxScroll || 0;
    const contentH = renderer.dailyWordsContentH || 1;
    if (targetY < 0) {
      const over = -targetY;
      targetY = -over * 0.55 * Math.pow(over / contentH, 0.35);
    } else if (maxScroll > 0 && targetY > maxScroll) {
      const over = targetY - maxScroll;
      targetY = maxScroll + over * 0.55 * Math.pow(over / contentH, 0.35);
    }

    game._dailyWordsScrollY = targetY;

    // 计算速度（px/ms），基于帧间位移
    if (dt > 0) {
      game._dailyWordsScrollVelocity = frameDelta / dt;
    }

    game._dailyWordsScrollLastTouchY = y;
    game._dailyWordsScrollLastTime = now;
  }

  // 单词本弹窗滚动
  if (game._wordBookPopup && game._wordBookScrollState === 'dragging') {
    const now = Date.now();
    const y = touch.clientY;
    const frameDelta = game._wordBookScrollLastTouchY - y;
    const totalDelta = game._wordBookScrollTouchStartY - y;
    const dt = now - game._wordBookScrollLastTime;

    let targetY = game._wordBookScrollDragStartY + totalDelta;

    const maxScroll = renderer.wordBookContentRect ? game._wordBookMaxScroll || 0 : 0;
    const contentH = game._wordBookContentH || 1;
    if (targetY < 0) {
      const over = -targetY;
      targetY = -over * 0.55 * Math.pow(over / contentH, 0.35);
    } else if (maxScroll > 0 && targetY > maxScroll) {
      const over = targetY - maxScroll;
      targetY = maxScroll + over * 0.55 * Math.pow(over / contentH, 0.35);
    }

    game._wordBookScrollY = targetY;

    if (dt > 0) {
      game._wordBookScrollVelocity = frameDelta / dt;
    }

    game._wordBookScrollLastTouchY = y;
    game._wordBookScrollLastTime = now;
  }

  // 全国榜弹窗滚动
  if (game._showingRankPopup && game._rankTab === 'global' && game._globalRankScrollState === 'dragging') {
    const now = Date.now();
    const y = touch.clientY;
    const frameDelta = game._globalRankScrollLastTouchY - y;
    const totalDelta = game._globalRankScrollTouchStartY - y;
    const dt = now - game._globalRankScrollLastTime;

    let targetY = game._globalRankScrollDragStartY + totalDelta;

    const maxScroll = game._globalRankMaxScroll || 0;
    const rankRect = calcRankPanelRect();
    const contentH = rankRect.contentH || 1;
    if (targetY < 0) {
      const over = -targetY;
      targetY = -over * 0.55 * Math.pow(over / contentH, 0.35);
    } else if (maxScroll > 0 && targetY > maxScroll) {
      const over = targetY - maxScroll;
      targetY = maxScroll + over * 0.55 * Math.pow(over / contentH, 0.35);
    }

    game._globalRankScrollY = targetY;

    if (dt > 0) {
      game._globalRankScrollVelocity = frameDelta / dt;
    }

    game._globalRankScrollLastTouchY = y;
    game._globalRankScrollLastTime = now;
  }
  if (game._settingsCloseBtnPressed && renderer.settingsCloseBtnRect) {
    const hit = renderer.hitTest(touch.clientX, touch.clientY, [renderer.settingsCloseBtnRect]);
    if (!hit) game._settingsCloseBtnPressed = false;
  }
  // 移出求助提示弹窗按钮区域时取消按下状态
  if (game._tipHelpClosePressed && renderer.tipHelpCloseRect) {
    const hit = renderer.hitTest(touch.clientX, touch.clientY, [renderer.tipHelpCloseRect]);
    if (!hit) game._tipHelpClosePressed = false;
  }
  if (game._tipHelpBuyPressed && renderer.tipHelpBuyRect && !game._tipHelpBuyDelaying) {
    const hit = renderer.hitTest(touch.clientX, touch.clientY, [renderer.tipHelpBuyRect]);
    if (!hit) game._tipHelpBuyPressed = false;
  }
  if (game._tipHelpSharePressed && renderer.tipHelpShareRect && !game._tipHelpShareDelaying) {
    const hit = renderer.hitTest(touch.clientX, touch.clientY, [renderer.tipHelpShareRect]);
    if (!hit) game._tipHelpSharePressed = false;
  }
  if (game._feedbackBackPressed && renderer.feedbackBackRect) {
    const hit = renderer.hitTest(touch.clientX, touch.clientY, [renderer.feedbackBackRect]);
    if (!hit) game._feedbackBackPressed = false;
  }
  if (game._feedbackSubmitPressed && renderer.feedbackSubmitRect) {
    const hit = renderer.hitTest(touch.clientX, touch.clientY, [renderer.feedbackSubmitRect]);
    if (!hit) game._feedbackSubmitPressed = false;
  }
  // 移出卡牌图鉴图标区域时取消按下状态
  if (game._cardBookIconPressed && renderer.cardBookIconRect) {
    const iconHit = renderer.hitTest(touch.clientX, inputY, [renderer.cardBookIconRect]);
    if (!iconHit) {
      game._cardBookIconPressed = false;
    }
  }

  // 移出装备按钮区域时取消按下状态
  if (game._cardBookEquipBtnPressed && renderer.cardBookEquipBtnRect) {
    const btnHit = renderer.hitTest(touch.clientX, inputY, [renderer.cardBookEquipBtnRect]);
    if (!btnHit) {
      game._cardBookEquipBtnPressed = false;
    }
  }

  // 移出卡牌图鉴关闭按钮区域时取消按下状态
  if (game._cardBookCloseBtnPressed && renderer.cardBookCloseBtnRect) {
    const closeHit = renderer.hitTest(touch.clientX, inputY, [renderer.cardBookCloseBtnRect]);
    if (!closeHit) {
      game._cardBookCloseBtnPressed = false;
    }
  }

  // 取消女巫牌长按候选（移动超过阈值）
  if (game._pendingJokerSelect && touchStartPos) {
    const dx = touch.clientX - touchStartPos.x;
    const dy = touch.clientY - touchStartPos.y;
    if (Math.sqrt(dx * dx + dy * dy) > LONG_PRESS_MOVE_THRESHOLD) {
      if (game._pendingJokerSelectTimer) {
        clearTimeout(game._pendingJokerSelectTimer);
        game._pendingJokerSelectTimer = null;
      }
      game._pendingJokerSelect = null;
    }
  }

  // 更新女巫牌排序拖动位置与插入槽位
  if (game._jokerSortState) {
    game._jokerSortState.currentX = touch.clientX;
    game._jokerSortState.currentY = inputY;

    // 计算 insertSlot（手指最接近哪个槽位中心）
    const s = renderer.scale || 1;
    const W = renderer.canvasWidth || 375;
    const actualWitchSlots = game.maxJokerSlots || 4;
    const ownedW = actualWitchSlots >= 5 ? W - 8 * s : W - 20 * s;
    const ownedX = actualWitchSlots >= 5 ? 4 * s : 10 * s;
    const oPadX = 10 * s;
    const oDividerW = 1.5 * s;
    const BASE_GAP = 6 * s;
    const rawSlotW = (W - 30 * s - oPadX * 2 - 5 * BASE_GAP - oDividerW) / 6;
    const actualTotalSlots = actualWitchSlots + 2;
    const rawGap = (ownedW - oPadX * 2 - oDividerW - actualTotalSlots * rawSlotW) / (actualTotalSlots - 1);
    const actualGap = rawGap + (actualWitchSlots >= 5 ? 3.5 * s : 0);
    const slotW = rawSlotW - (actualWitchSlots >= 5 ? 2 * s : 0);
    const oWitchShift = actualWitchSlots >= 5 ? 5 * s : 1 * s;
    const oLeftStartX = ownedX + oPadX - oWitchShift - (actualWitchSlots >= 5 ? 2 * s : 0);

    let insertSlot = actualWitchSlots;
    for (let i = 0; i < actualWitchSlots; i++) {
      const slotCenterX = oLeftStartX + i * (slotW + actualGap) + slotW / 2;
      if (touch.clientX < slotCenterX) {
        insertSlot = i;
        break;
      }
    }
    // 如果在槽位边缘附近，保持原位（与 demo 一致）
    const fromIndex = game._jokerSortState.fromIndex;
    if (insertSlot > 0 && insertSlot < actualWitchSlots) {
      const mid = (oLeftStartX + (insertSlot - 1) * (slotW + actualGap) + slotW / 2 + oLeftStartX + insertSlot * (slotW + actualGap) + slotW / 2) / 2;
      if (touch.clientX < mid) insertSlot--;
    } else if (insertSlot === actualWitchSlots) {
      const edge = oLeftStartX + (actualWitchSlots - 1) * (slotW + actualGap) + slotW + actualGap / 2;
      if (touch.clientX < edge) insertSlot = actualWitchSlots - 1;
    }
    // 在目标槽位附近范围内保持原位（仅在原位或紧邻右侧时生效）
    if (insertSlot === fromIndex || insertSlot === fromIndex + 1) {
      const fromCenterX = oLeftStartX + fromIndex * (slotW + actualGap) + slotW / 2;
      if (Math.abs(touch.clientX - fromCenterX) < slotW * 0.4) {
        insertSlot = fromIndex;
      }
    }
    game._jokerSortState.insertSlot = insertSlot;
  }

  // 迷之优惠涂抹刮开（移动时记录轨迹）
  if (game.state === 'mystery_discount' && game._mysteryDiscountState) {
    const md = game._mysteryDiscountState;
    if (md._scratching && md.selectedIdx !== null && md.scratched && !md.revealed && renderer.mysteryDiscountRenderer) {
      const rect = renderer.mysteryDiscountRenderer.scratchZoneRect;
      if (rect) {
        const x = touch.clientX;
        const y = inputY;
        if (x >= rect.x && x <= rect.x + rect.w && y >= rect.y && y <= rect.y + rect.h) {
          addScratchPoint(md, rect, x, y);
        }
      }
    }
  }

  if (!renderer.cloudLogDragging) return;
  const y = touch.clientY;
  const deltaY = renderer.cloudLogDragStartY - y;
  renderer.cloudLogScrollY = renderer.cloudLogDragStartScrollY + deltaY;
});

wx.onTouchEnd(() => {
  renderer.cloudLogDragging = false;
  renderer.pressedBtn = null;
  if (game) {
    game._cardBookIconPressed = false;
    game._cardBookEquipBtnPressed = false;
    game._newWitchCardCollectBtnPressed = false;
  }

  // 迷之优惠涂抹刮开结束
  if (game && game._mysteryDiscountState) {
    game._mysteryDiscountState._scratching = false;
  }

  // 取消未触发的长按定时器
  if (longPressTimer) {
    clearTimeout(longPressTimer);
    longPressTimer = null;
  }

  // top_icon 按压动画恢复
  if (renderer._topIconPressAnim) {
    renderer._topIconPressAnim = { pressing: false, startTime: Date.now() };
  }

  // homepage 按钮松开：统一在这里播放音效并执行操作，避免 TouchStart 重复播放
  if (!longPressTriggered && touchStartPos && renderer._homepagePressedBtn) {
    const btnKey = renderer._homepagePressedBtn;
    const stillHit = showHomepage && renderer.homepageBtnRects &&
      renderer.hitTest(touchStartPos.x, touchStartPos.y, renderer.homepageBtnRects.filter(r => r.key === btnKey));
    if (stillHit) {
      if (!game) {
        startGame();
      }
      if (btnKey === 'round' || btnKey === 'battle') {
        if (game && game.audioManager) game.audioManager.play('homepage_round_tap');
        // 启动主页 → 游戏翻页过渡动画
        const targetState = btnKey === 'battle' ? 'battle' : 'playing';
        // 双人对战需要提前初始化，确保翻页过程中渲染的是对战页面而非通关页面
        if (targetState === 'battle' && game && game.battleManager) {
          game.battleManager.startBattle('easy');
        }
        pageFlipState = { startTime: Date.now(), duration: PAGE_FLIP_DURATION, targetState };

        // 阶段2优化：页面翻转期间后台加载游戏场景资源
        if (game && game.cloudStorage && !game._gameBgIconsPreloaded) {
          game._gameBgIconsPreloaded = true;
          game.cloudStorage.preloadGameBgIcons().catch(err => {
            console.error('[Preload] 游戏场景 bg_icon 预加载失败:', err);
          });
        }

        // 用户真正进入第一回合时才启动新手引导入场动画，避免预加载完成后在 homepage 等待过久导致动画被跳过
        if (btnKey === 'round' && game && game.guidePhase === 1) {
          game._guideOverlayStartTime = Date.now();
        }
      } else {
        if (game && game.audioManager) game.audioManager.play('tap');
      }
      if (btnKey === 'setting') {
        if (game._settingsPopup) {
          game._closingSettings = true;
          game._closeSettingsStartTime = Date.now();
        } else {
          game._settingsPopup = { startTime: Date.now() };
          game._closingSettings = false;
          game._closeSettingsStartTime = null;
        }
      } else if (btnKey === 'ranking') {
        showHomepage = false;
        showRankPopup('friend');
      }
    }
    renderer._homepagePressedBtn = null;
  }

  if (!game) return;

  // top_icon 短按：返回主页（长按未触发时）
  if (!longPressTriggered && touchStartPos && renderer.topIconRect) {
    const endInputY = getInputY(touchStartPos.x, touchStartPos.y);
    const iconHit = renderer.hitTest(touchStartPos.x, endInputY, [renderer.topIconRect]);
    if (iconHit) {
      showHomepage = true;
      renderer.homepageAnimStartTime = Date.now();
      renderer._homepageEntryAnim = null;
      if (game && game.audioManager) game.audioManager.play('tap');
    }
  }
  longPressTriggered = false;

  // 今日新词弹窗交互处理（松开时）
  if (game._dailyWordsPopup) {
    if (game._dailyWordsScrollState === 'dragging') {
      game._dailyWordsScrollState = 'idle';
      const maxScroll = renderer.dailyWordsMaxScroll || 0;
      const scrollY = game._dailyWordsScrollY || 0;
      const velocity = game._dailyWordsScrollVelocity || 0;

      // 如果超出边界，启动回弹；否则如果内容可滚动且速度足够大，启动惯性滚动
      if (scrollY < 0 || (maxScroll > 0 && scrollY > maxScroll)) {
        game._dailyWordsScrollState = 'bounce';
        game._dailyWordsScrollBounceTarget = scrollY < 0 ? 0 : maxScroll;
        game._dailyWordsScrollBounceStartY = scrollY;
        game._dailyWordsScrollBounceStartTime = Date.now();
      } else if (maxScroll > 0 && Math.abs(velocity) > 0.5) {
        game._dailyWordsScrollState = 'inertia';
      }
    }

    if (game._dailyWordsBackPressed) {
      game._dailyWordsBackPressed = false;
      // 关闭学习模式弹窗，回到设置弹窗
      game._dailyWordsPopup.closing = true;
      game._dailyWordsPopup.closeStartTime = Date.now();
      game._settingsPopup = { startTime: Date.now() };
      game._closingSettings = false;
      game._closeSettingsStartTime = null;
      if (game.audioManager) game.audioManager.play('tap');
    }
    if (game._dailyWordsClosePressed) {
      game._dailyWordsClosePressed = false;
      game._dailyWordsPopup.closing = true;
      game._dailyWordsPopup.closeStartTime = Date.now();
      // 同时关闭设置弹窗
      if (game._settingsPopup) {
        game._closingSettings = true;
        game._closeSettingsStartTime = Date.now();
      }
      if (game.audioManager) game.audioManager.play('tap');
    }
    if (game._dailyWordsSwitchPressed) {
      game._dailyWordsSwitchPressed = false;
      const oldValue = game.settings && game.settings.dailyWordChallengeEnabled === true;
      const newValue = !oldValue;
      game.settings.dailyWordChallengeEnabled = newValue;
      if (game.storageManager) game.storageManager.saveSettings(game.settings);
      // 学习模式打开埋点
      if (newValue && !oldValue) {
        reportEvent("study_mode_open", {
          "userid": game.userid || ''
        });
      }
      // 打开时弹出提示（仅首次）
      if (newValue && !oldValue && !game.settings.dailyWordHintShown) {
        game._dailyWordsSwitchHint = {
          text: '下回合起生效',
          startTime: Date.now(),
          expireAt: Date.now() + 2000
        };
        game.settings.dailyWordHintShown = true;
        if (game.storageManager) game.storageManager.saveSettings(game.settings);
      }
      if (game.audioManager) game.audioManager.play('tap');
    }
    if (game._dailyWordsSharePressed) {
      game._dailyWordsSharePressed = false;
      try {
        const tempFilePath = canvas.toTempFilePathSync();
        wx.shareAppMessage({
          title: `我今天在女巫的词牌里学习了10个新单词!一起来学习!`,
          imageUrl: tempFilePath,
          query: `from=daily_words&round=${game.round || 1}&score=${game.totalScore || 0}`
        });
      } catch (e) {
        wx.shareAppMessage({
          title: `我今天在女巫的词牌里学习了10个新单词!一起来学习!`,
          query: `from=daily_words&round=${game.round || 1}&score=${game.totalScore || 0}`
        });
      }
      if (game.audioManager) game.audioManager.play('tap');
    }
  }

  // 求助提示弹窗交互处理（松开时）
  if (game._tipHelpPopup && !game._closingTipHelp) {
    if (game._tipHelpClosePressed) {
      game._tipHelpClosePressed = false;
      game.closeTipHelpPopup();
    }
    if (game._tipHelpBuyPressed) {
      game._tipHelpBuyPressed = false;
      if (game.gold >= 2 && !game._tipHelpBuyDelaying) {
        game._tipHelpBuyDelaying = true;
        game.gold -= 2;
        if (game.audioManager) game.audioManager.play('card_sell');
        game.hintToast = { text: '购买提示成功！', expireAt: Date.now() + 1200, startTime: Date.now() };
        if (game.storageManager) game.storageManager.saveProgress();
        reportEvent("word_help_buy", {
          "userid": game.userid || '',
          "round": game.round
        });
        game._delay(() => {
          game.closeTipHelpPopup();
          game.showSeedWordHint();
        }, 1200);
      } else if (game.gold < 2) {
        game.hintToast = { text: '金币不足，需要2枚金币', expireAt: Date.now() + 1500, startTime: Date.now() };
        if (game.audioManager) game.audioManager.play('card_illegal');
      }
    }
    if (game._tipHelpSharePressed) {
      game._tipHelpSharePressed = false;
      // 每日分享次数限制检查
      const today = new Date().toISOString().slice(0, 10);
      if (game._dailyShareDate !== today) {
        game._dailyShareDate = today;
        game._dailyShareCount = 0;
      }
      if (game._dailyShareCount >= 3) {
        game.hintToast = { text: '今日分享次数已用完，请明日再来', expireAt: Date.now() + 2000, startTime: Date.now() };
        if (game.audioManager) game.audioManager.play('card_illegal');
      } else if (!game._tipHelpShareDelaying) {
        game._tipHelpShareDelaying = true;
        reportEvent("word_help_share", {
          "userid": game.userid || '',
          "round": game.round
        });
        // 延迟 80ms 让按钮恢复后再拉起分享
        game._delay(() => {
          game._tipHelpShareDelaying = false;
          try {
            const tempFilePath = canvas.toTempFilePathSync();
            wx.shareAppMessage({
              title: `🎯 我在女巫的词牌里遇到困难了，快来帮我想想！`,
              imageUrl: tempFilePath,
              query: `from=tip_help&round=${game.round}`
            });
            shareTipHelpState = { startTime: Date.now(), resolving: true };
          } catch (e) {
            wx.shareAppMessage({
              title: `🎯 我在女巫的词牌里遇到困难了，快来帮我想想！`,
              query: `from=tip_help&round=${game.round}`
            });
            shareTipHelpState = { startTime: Date.now(), resolving: true };
          }
        }, 80);
      }
    }
  }

  // 全国榜弹窗交互处理（松开时）
  if (game._showingRankPopup && game._rankTab === 'global') {
    if (game._globalRankScrollState === 'dragging') {
      game._globalRankScrollState = 'idle';
      const maxScroll = game._globalRankMaxScroll || 0;
      const scrollY = game._globalRankScrollY || 0;
      const velocity = game._globalRankScrollVelocity || 0;

      if (scrollY < 0 || (maxScroll > 0 && scrollY > maxScroll)) {
        game._globalRankScrollState = 'bounce';
        game._globalRankScrollBounceTarget = scrollY < 0 ? 0 : maxScroll;
        game._globalRankScrollBounceStartY = scrollY;
        game._globalRankScrollBounceStartTime = Date.now();
      } else if (maxScroll > 0 && Math.abs(velocity) > 0.5) {
        game._globalRankScrollState = 'inertia';
      }
    }
  }

  // 单词本弹窗交互处理（松开时）
  if (game._wordBookPopup) {
    if (game._wordBookScrollState === 'dragging') {
      game._wordBookScrollState = 'idle';
      const maxScroll = game._wordBookMaxScroll || 0;
      const scrollY = game._wordBookScrollY || 0;
      const velocity = game._wordBookScrollVelocity || 0;

      if (scrollY < 0 || (maxScroll > 0 && scrollY > maxScroll)) {
        game._wordBookScrollState = 'bounce';
        game._wordBookScrollBounceTarget = scrollY < 0 ? 0 : maxScroll;
        game._wordBookScrollBounceStartY = scrollY;
        game._wordBookScrollBounceStartTime = Date.now();
      } else if (maxScroll > 0 && Math.abs(velocity) > 0.5) {
        game._wordBookScrollState = 'inertia';
      }
    }

    if (game._wordBookBackPressed) {
      game._wordBookBackPressed = false;
      // 关闭单词本弹窗，回到设置弹窗
      game._closingWordBook = true;
      game._closeWordBookStartTime = Date.now();
      game._settingsPopup = { startTime: Date.now() };
      game._closingSettings = false;
      game._closeSettingsStartTime = null;
      if (game.audioManager) game.audioManager.play('tap');
    }
    if (game._wordBookClosePressed) {
      game._wordBookClosePressed = false;
      game._closingWordBook = true;
      game._closeWordBookStartTime = Date.now();
      // 同时关闭设置弹窗
      if (game._settingsPopup) {
        game._closingSettings = true;
        game._closeSettingsStartTime = Date.now();
      }
      if (game.audioManager) game.audioManager.play('tap');
    }
  }

  // 设置弹窗交互处理（松开时）
  if (game._settingsPopup && !game._closingSettings) {
    if (game._settingsSoundPressed) {
      game._settingsSoundPressed = false;
      game.settings.soundEnabled = !game.settings.soundEnabled;
      if (game.audioManager) {
        game.audioManager.setSoundEnabled(game.settings.soundEnabled);
      }
      if (game.storageManager) {
        game.storageManager.saveSettings(game.settings);
      }
      if (game.audioManager) game.audioManager.play('tap');
    }

    if (game._settingsRankPressed) {
      game._settingsRankPressed = false;
      game._closingSettings = true;
      game._closeSettingsStartTime = Date.now();
      if (game.audioManager) game.audioManager.play('tap');
      showRankPopup('friend');
    }
    if (game._settingsFeedbackPressed) {
      game._settingsFeedbackPressed = false;
      game._feedbackPage = 'feedback';
      if (game.audioManager) game.audioManager.play('tap');
    }

    // 反馈页交互
    if (game._feedbackBackPressed) {
      game._feedbackBackPressed = false;
      game._feedbackPage = 'main';
      game._feedbackText = '';
      wx.hideKeyboard();
      if (game.audioManager) game.audioManager.play('tap');
    }
    if (game._feedbackInputFocused) {
      game._feedbackInputFocused = false;
      // 直接弹出系统键盘
      wx.showKeyboard({
        defaultValue: game._feedbackText || '',
        maxLength: 100,
        multiple: false,
        confirmHold: true,
        confirmType: 'done'
      });
    }
    if (game._feedbackSubmitPressed) {
      game._feedbackSubmitPressed = false;
      if (game._feedbackText && game._feedbackText.trim() && !game._feedbackSubmitting) {
        submitFeedback(game._feedbackText.trim());
      } else if (!game._feedbackText || !game._feedbackText.trim()) {
        game._feedbackSubmitToast = { text: '请输入反馈内容', expireAt: Date.now() + 2000 };
      }
    }

    // 设置弹窗关闭按钮松开时直接关闭整个弹窗
    if (game._settingsCloseBtnPressed) {
      game._settingsCloseBtnPressed = false;
      game._closingSettings = true;
      game._closeSettingsStartTime = Date.now();
      wx.hideKeyboard();
    }
  }

  // 女巫牌短按：弹出详情弹窗
  if (game._pendingJokerSelect) {
    if (game._pendingJokerSelectTimer) {
      clearTimeout(game._pendingJokerSelectTimer);
      game._pendingJokerSelectTimer = null;
    }
    const index = game._pendingJokerSelect.index;
    game._pendingJokerSelect = null;
    if (game.audioManager) game.audioManager.play('tap');
    if (game._witchDetailPopup && game._witchDetailPopup.jokerIndex === index && game._witchDetailPopup.isShop) {
      // 再次点击同一张：关闭弹窗 + 取消选中上移
      game._witchDetailPopup = null;
      renderer.shopRenderer.shopSelectedOwned = null;
    } else {
      // 打开弹窗 + 保持选中上移效果
      const propRects = renderer.shopRenderer.shopOwnedPropRects || [];
      const rect = propRects.find(r => r.array === 'jokers' && r.index === index);
      game._witchDetailPopup = { jokerIndex: index, animStartTime: Date.now(), isShop: true, rect };
      renderer.shopRenderer.shopSelectedOwned = { type: 'jokers', index };
    }
  }

  // 女巫牌排序完成：从原位置取出，插入到目标位置
  if (game._jokerSortState) {
    const state = game._jokerSortState;
    const fromIndex = state.fromIndex;
    const insertSlot = state.insertSlot;

    if (insertSlot !== fromIndex && game.jokers && game.jokers[fromIndex]) {
      // 取出被拖动的牌
      const item = game.jokers.splice(fromIndex, 1)[0];
      // 插入到目标位置（已移除自身，若目标在原位置之后需减 1）
      const adjustedInsertSlot = insertSlot > fromIndex ? insertSlot - 1 : insertSlot;
      game.jokers.splice(adjustedInsertSlot, 0, item);
      if (game.storageManager) game.storageManager.saveProgress();
    }

    game._jokerSortState = null;
  }

  // 卡牌图鉴关闭按钮松开时关闭
  if (game._cardBookCloseBtnPressed) {
    game._cardBookCloseBtnPressed = false;
    game._closingCardBook = true;
    game._closeCardBookStartTime = Date.now();
    game._cardBookCellPressed = null;
    game._cardBookDetailLevel = null;
    game._closingCardBookDetail = false;
  }

  // 排行榜关闭按钮松开时关闭
  if (game._rankCloseBtnPressed) {
    game._rankCloseBtnPressed = false;
    const odc = getOpenDataContext();
    if (odc && game._rankTab === 'friend') odc.postMessage({ action: 'closeBtnPress', pressed: false });
    hideRankPopup();
  }

  touchStartPos = null;
});

// === 迷之优惠涂抹刮开辅助函数 ===
function initScratchGrid(md) {
  if (md.scratchGrid) return;
  const cols = 24;
  const rows = 16;
  md.scratchGrid = [];
  for (let r = 0; r < rows; r++) {
    md.scratchGrid[r] = new Array(cols).fill(false);
  }
  md.scratchCols = cols;
  md.scratchRows = rows;
  md.scratchPoints = [];
}

function markScratchCell(md, localX, localY) {
  const cols = md.scratchCols;
  const rows = md.scratchRows;
  const col = Math.min(cols - 1, Math.max(0, Math.floor(localX * cols)));
  const row = Math.min(rows - 1, Math.max(0, Math.floor(localY * rows)));
  // 5x5 笔刷，模拟涂抹半径（比之前稍粗）
  for (let dr = -2; dr <= 2; dr++) {
    for (let dc = -2; dc <= 2; dc++) {
      const r = row + dr;
      const c = col + dc;
      if (r >= 0 && r < rows && c >= 0 && c < cols) {
        md.scratchGrid[r][c] = true;
      }
    }
  }
}

function addScratchPoint(md, rect, x, y) {
  initScratchGrid(md);
  const cols = md.scratchCols;
  const rows = md.scratchRows;
  const localX = Math.max(0, Math.min(1, (x - rect.x) / rect.w));
  const localY = Math.max(0, Math.min(1, (y - rect.y) / rect.h));

  const last = md.scratchPoints[md.scratchPoints.length - 1];
  if (last) {
    const dx = localX - last.x;
    const dy = localY - last.y;
    if (dx * dx + dy * dy < 0.0002) return;
  }
  md.scratchPoints.push({ x: localX, y: localY });

  markScratchCell(md, localX, localY);

  if (last) {
    const dx = localX - last.x;
    const dy = localY - last.y;
    const steps = Math.max(1, Math.ceil(Math.sqrt(dx * dx + dy * dy) * Math.max(cols, rows) * 2));
    for (let i = 1; i < steps; i++) {
      const t = i / steps;
      const ix = last.x + dx * t;
      const iy = last.y + dy * t;
      markScratchCell(md, ix, iy);
    }
  }

  let scratchedCount = 0;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (md.scratchGrid[r][c]) scratchedCount++;
    }
  }
  md.scratchProgress = scratchedCount / (rows * cols);

  if (md.scratchProgress >= 0.5 && !md.revealed) {
    md.revealed = true;
    md.revealStartTime = Date.now();
    vibrate();
    if (game.audioManager) game.audioManager.play('tap');
  }
}

function handleInput(x, inputY) {
  // 设置弹窗打开时，屏蔽底层游戏交互（设置弹窗的点击已在 touchStart 中处理）
  if (game._settingsPopup && !game._closingSettings) return;

  // 求助提示弹窗优先处理
  if (game._tipHelpPopup && !game._closingTipHelp) {
    // 关闭按钮
    if (renderer.tipHelpCloseRect) {
      const closeHit = renderer.hitTest(x, inputY, [renderer.tipHelpCloseRect]);
      if (closeHit) {
        vibrate();
        game._tipHelpClosePressed = true;
        return;
      }
    }
    // 购买提示按钮
    if (renderer.tipHelpBuyRect && !game._tipHelpBuyDelaying) {
      const buyHit = renderer.hitTest(x, inputY, [renderer.tipHelpBuyRect]);
      if (buyHit) {
        vibrate();
        game._tipHelpBuyPressed = true;
        return;
      }
    }
    // 转发求助按钮
    if (renderer.tipHelpShareRect && !game._tipHelpShareDelaying) {
      const shareHit = renderer.hitTest(x, inputY, [renderer.tipHelpShareRect]);
      if (shareHit) {
        vibrate();
        game._tipHelpSharePressed = true;
        return;
      }
    }
    // 点击弹窗外部区域关闭弹窗
    if (renderer.tipHelpPanelRect) {
      const panelHit = renderer.hitTest(x, inputY, [renderer.tipHelpPanelRect]);
      if (!panelHit) {
        game.closeTipHelpPopup();
      }
    }
    return;
  }

  // 首次用户交互时尝试启动 BGM（真机音频必须在用户触摸事件回调内首次播放）
  if (game.audioManager && !game.audioManager.bgmStarted) {
    game.audioManager.tryStartBGM();
  }

  // 新手引导阶段：优先处理引导点击，禁用其他交互
  if (game.guidePhase >= 1 && game.guidePhase <= 4) {
    if (renderer.guideDialogRect) {
      const btnHit = renderer.hitTest(x, inputY, [renderer.guideDialogRect]);
      if (btnHit) {
        const now = Date.now();
        if (game._guideTapTime && now - game._guideTapTime < 300) {
          game._guideSkipTyping = true;
          vibrate();
          if (game.audioManager) game.audioManager.play('tap');
          return;
        }
        game._guideTapTime = now;
        if (renderer.guideNextBtnRect) {
          vibrate();
          if (game.audioManager) game.audioManager.play('tap');
          game.advanceGuide();
        } else {
          // 文字未显示完时点击对话框，也播放点击音效作为反馈
          if (game.audioManager) game.audioManager.play('tap');
        }
        return;
      }
    }
    // 引导阶段点击其他区域不响应
    return;
  }

  // 检测调试菜单按钮（优先）
  if (renderer.debugMenuOpen && renderer.debugMenuRects) {
    const debugHit = renderer.hitTest(x, inputY, renderer.debugMenuRects);
    if (debugHit) {
      if (debugHit.action === 'debug_startBattle') {
        renderer.debugMenuOpen = false;
        game.battleManager.startBattle('easy');
        return;
      }
      if (debugHit.action === 'debug_resetHands') game.resetHands();
      if (debugHit.action === 'debug_addScore') game.addScore(1000);
      if (debugHit.action === 'debug_addGold') {
        game.gold += 100;
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
      if (debugHit.action === 'debug_upload_rank_avatar') {
        cloudStorage.uploadRankAvatarImages().then(res => {
          game.hintToast = { text: `rank_avatar 上传完成：${res.success.length} 张成功`, expireAt: Date.now() + 2000 };
          return cloudStorage.preloadRankAvatarImages();
        }).then(() => {
          cloudStorage.injectRankAvatarToRenderer(renderer);
          game.hintToast = { text: 'rank_avatar 云图片已加载到游戏', expireAt: Date.now() + 2000 };
        }).catch(err => {
          game.hintToast = { text: 'rank_avatar 上传失败', expireAt: Date.now() + 2000 };
          console.error('rank_avatar 上传失败:', err);
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
          game._uploadRankData();
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
      if (debugHit.action === 'debug_completeDailyWords') {
        if (game.dailyChallenge && game.dailyChallenge.words) {
          const wordList = game.dailyChallenge.words.map(item => typeof item === 'string' ? item.toLowerCase() : item.word.toLowerCase());
          game.dailyChallenge.collected = [...wordList];
          if (!game.dailyChallenge.rewarded) {
            game.dailyChallenge.rewarded = true;
            game.gold += 50;
          }
          if (game.storageManager) game.storageManager.saveDailyChallenge(game.dailyChallenge);
          game.hintToast = { text: '今日新词已全部学习完成！', expireAt: Date.now() + 2000, startTime: Date.now() };
        }
      }
      renderer.debugMenuOpen = false;
      return;
    }
  }
  
  // 卡牌图鉴弹窗打开时，只有点击面板外部才关闭；面板内部（含翻页按钮）不关闭
  if (game.cardBookOpen && !game._closingCardBook) {
    // 0. 检测 tab 切换按钮
    if (renderer.cardBookTabRects) {
      const tabHit = renderer.hitTest(x, inputY, renderer.cardBookTabRects);
      if (tabHit) {
        vibrate();
        if (game.audioManager) game.audioManager.play('tap');
        game._cardBookTab = tabHit.tab;
        game.cardBookPage = 0;
        game._cardBookCellPressed = null;
        game._cardBookDetailLevel = null;
        game._closingCardBookDetail = false;
        return;
      }
    }

    // 1. 先检测是否点击了已解锁卡牌（最高优先级）
    if (renderer.cardBookCellRects && renderer.cardBookCellRects.length > 0) {
      const cellHit = renderer.hitTest(x, inputY, renderer.cardBookCellRects);
      if (cellHit && cellHit.isUnlocked) {
        vibrate();
        if (game.audioManager) game.audioManager.play('tap');
        // 点击新增卡牌后，NEW 标签消失
        if (game._newWitchCardThisShop === cellHit.level) {
          game._newWitchCardThisShop = null;
          game._cardBookNewBadge = false;
        }
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

    // 先检测关闭按钮（X）——延迟关闭，带按下反馈
    if (renderer.cardBookCloseBtnRect) {
      const closeHit = renderer.hitTest(x, inputY, [renderer.cardBookCloseBtnRect]);
      if (closeHit) {
        vibrate();
        if (game.audioManager) game.audioManager.play('tap');
        game._cardBookCloseBtnPressed = true;
        return;
      }
    }

    // 2. 如果详情弹窗打开，处理详情弹窗交互
    if (game._cardBookDetailLevel && !game._closingCardBookDetail) {
      // 检测装备/卸下按钮
      if (renderer.cardBookEquipBtnRect) {
        const equipHit = renderer.hitTest(x, inputY, [renderer.cardBookEquipBtnRect]);
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
          const equippedArr = game.equippedWitchCards || [];
          if (equippedArr.includes(level)) {
            // 卸下
            game.equippedWitchCards = equippedArr.filter(l => l !== level);
            console.log('[Equipped] 卸下 witch_card_' + level);
          } else {
            // 装备（最多3张）
            if (equippedArr.length >= 3) {
              game._equipFullToast = { text: '已达最大装备数（3张），请先卸下其他词牌', startTime: Date.now() };
              return;
            }
            game.equippedWitchCards = [...equippedArr, level];
            console.log('[Equipped] 装备 witch_card_' + level, '当前:', game.equippedWitchCards);
            // 触发装备字母牌升级动画
            const { WITCH_CARDS } = require('./js/witch_skills');
            const equippedConfig = WITCH_CARDS.find(c => {
              const cardLevel = parseInt(c.card_id.replace('witch_card_', ''), 10);
              return cardLevel === level;
            });
            if (equippedConfig && equippedConfig.card_letter) {
              game._cardBookEquipAnim = {
                startTime: Date.now(),
                letter: equippedConfig.card_letter.toUpperCase(),
              };
            }
          }
          if (game.storageManager) {
            game.storageManager.saveEquippedWitchCard(game.equippedWitchCards);
          }
          return;
        }
      }

      // 检测翻页按钮（点击区域可能超出详情面板，优先处理）
      if (renderer.cardBookPrevBtnRect) {
        const prevHit = renderer.hitTest(x, inputY, [renderer.cardBookPrevBtnRect]);
        if (prevHit && game.cardBookPage > 0) {
          vibrate();
          if (game.audioManager) game.audioManager.play('card_book_page');
          game.cardBookPage--;
          game._cardBookDetailLevel = null;
          game._cardBookCellPressed = null;
          game._closingCardBookDetail = false;
          return;
        }
      }
      if (renderer.cardBookNextBtnRect) {
        const nextHit = renderer.hitTest(x, inputY, [renderer.cardBookNextBtnRect]);
        if (nextHit) {
          vibrate();
          if (game.audioManager) game.audioManager.play('card_book_page');
          game.cardBookPage++;
          game._cardBookDetailLevel = null;
          game._cardBookCellPressed = null;
          game._closingCardBookDetail = false;
          return;
        }
      }

      const insideDetail = renderer.cardBookDetailPanelRect &&
        x >= renderer.cardBookDetailPanelRect.x && x <= renderer.cardBookDetailPanelRect.x + renderer.cardBookDetailPanelRect.w &&
        inputY >= renderer.cardBookDetailPanelRect.y && inputY <= renderer.cardBookDetailPanelRect.y + renderer.cardBookDetailPanelRect.h;
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
      const prevHit = renderer.hitTest(x, inputY, [renderer.cardBookPrevBtnRect]);
      if (prevHit && game.cardBookPage > 0) {
        vibrate();
        if (game.audioManager) game.audioManager.play('card_book_page');
        game.cardBookPage--;
        game._cardBookDetailLevel = null;
        game._cardBookCellPressed = null;
        game._closingCardBookDetail = false;
        return;
      }
    }
    if (renderer.cardBookNextBtnRect) {
      const nextHit = renderer.hitTest(x, inputY, [renderer.cardBookNextBtnRect]);
      if (nextHit) {
        vibrate();
        if (game.audioManager) game.audioManager.play('card_book_page');
        game.cardBookPage++;
        game._cardBookDetailLevel = null;
        game._cardBookCellPressed = null;
        game._closingCardBookDetail = false;
        return;
      }
    }

    const insidePanel = renderer.cardBookPanelRect &&
      x >= renderer.cardBookPanelRect.x && x <= renderer.cardBookPanelRect.x + renderer.cardBookPanelRect.w &&
      inputY >= renderer.cardBookPanelRect.y && inputY <= renderer.cardBookPanelRect.y + renderer.cardBookPanelRect.h;
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

  // 对战模式输入处理
  if (game.state === 'battle' && handleBattleInput(game, renderer, x, inputY, vibrate)) {
    return;
  }

  if (game.state === 'playing') {
    // 字母置换弹窗打开时，优先处理弹窗点击
    if (game._changeLetterPopup) {
      // 检测关闭按钮
      if (renderer.changeLetterCloseRect) {
        const closeHit = renderer.hitTest(x, inputY, [renderer.changeLetterCloseRect]);
        if (closeHit) {
          vibrate();
          if (game.audioManager) game.audioManager.play('tap');
          game._changeLetterPopup = null;
          return;
        }
      }
      // 检测字母块点击
      if (renderer.changeLetterRects) {
        const letterHit = renderer.hitTest(x, inputY, renderer.changeLetterRects);
        if (letterHit) {
          vibrate();
          game._changeLetterPopup.targetLetter = letterHit.letter;
          return;
        }
      }
      // 检测置换按钮
      if (renderer.changeLetterSwapBtnRect && renderer.changeLetterSwapBtnRect.enabled) {
        const btnHit = renderer.hitTest(x, inputY, [renderer.changeLetterSwapBtnRect]);
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
              if (game.storageManager) game.storageManager.saveProgress();
              game._changeLetterPopup = null;
              game._closingChangeLetter = false;
            }, 300);
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
      const cardHit = renderer.hitTest(x, inputY, renderer.cardRects);
      if (cardHit) {
        vibrate();
        game.toggleSelect(cardHit.cardId);
        return;
      }
    }

    // 检测出牌按钮
    if (renderer.playBtnRect) {
      const btnHit = renderer.hitTest(x, inputY, [renderer.playBtnRect]);
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
      const btnHit = renderer.hitTest(x, inputY, [renderer.discardBtnRect]);
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
      const btnHit = renderer.hitTest(x, inputY, [renderer.resetBtnRect]);
      if (btnHit) {
        vibrate();
        renderer.pressedBtn = 'reset';
        if (game.animManager) game.animManager.buttonPress(renderer.resetBtnRect);
        if (game.audioManager) game.audioManager.play('card_placement');
        game.clearSelection();
        return;
      }
    }

    // 检测种子词提示按钮点击（预览区左侧 help 按钮）
    if (renderer.hintBtnRect) {
      const hintHit = renderer.hitTest(x, inputY, [renderer.hintBtnRect]);
      if (hintHit) {
        vibrate();
        game.showTipHelpPopup();
        return;
      }
    }

    // 检测字母置换提示按钮点击
    if (renderer.changeLetterHintRect) {
      const hintHit = renderer.hitTest(x, inputY, [renderer.changeLetterHintRect]);
      if (hintHit) {
        vibrate();
        game._changeLetterHint = null;
        return;
      }
    }

    // 检测 HUD 女巫头像点击（温柔旋转星星）
    if (renderer.hudWitchAvatarRect) {
      const avatarHit = renderer.hitTest(x, inputY, [renderer.hudWitchAvatarRect]);
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
      const witchHit = renderer.hitTest(x, inputY, renderer.witchPropRects);
      if (witchHit) {
        const joker = game.jokers[witchHit.jokerIndex];
        if (joker && joker._disabled) return;
        vibrate();
        if (game.audioManager) game.audioManager.play('tap');
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
      const cbHit = renderer.hitTest(x, inputY, [renderer.cardBookIconRect]);
      if (cbHit) {
        vibrate();
        if (game.audioManager) game.audioManager.play('tap');
        game.cardBookOpen = true;

        // 阶段2优化：打开图鉴时按需预加载已收集 witch_card
        if (game.cloudStorage && game.collectedWitchCards && game.collectedWitchCards.length > 0) {
          game.collectedWitchCards.forEach(level => {
            game.cloudStorage.preloadWitchCardForLevel(level).catch(err => {
              console.error('[Preload] witch_card 预加载失败:', err);
            });
          });
        }

        // 如果有新收集的卡牌，自动翻到对应页码
        if (game._newWitchCardThisShop) {
          const allLevels = WITCH_SKILLS.map(s => s.level);
          const itemsPerPage = 4;
          const levelIndex = allLevels.indexOf(game._newWitchCardThisShop);
          game.cardBookPage = levelIndex >= 0 ? Math.floor(levelIndex / itemsPerPage) : 0;
        } else {
          game.cardBookPage = 0;
        }
        game._cardBookAnimStartTime = Date.now();
        game._closingCardBook = false;
        game._cardBookNewBadge = false;
        return;
      }
    }

    // 检测已购买道具栏中的药水牌点击
    if (renderer.potionPropRects) {
      const potionHit = renderer.hitTest(x, inputY, renderer.potionPropRects);
      if (potionHit) {
        const potion = game.potions[potionHit.potionIndex];
        if (!potion) return;
        // 本回合被禁用的药水牌无法使用
        if (potion._disabled) {
          game.hintToast = { text: '女巫约束：本回合禁用魔法药水牌', expireAt: Date.now() + 2000, startTime: Date.now() };
          return;
        }
        vibrate();
        if (game.audioManager) game.audioManager.play('tap');
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
        // 吸星大法：游戏中直接使用，进入选牌状态
        if (potion.effect === 'absorb_stars') {
          game._absorbStarsState = { potionIndex: potionHit.potionIndex, selecting: true };
          game.hintToast = {
            text: '选择一张手牌作为吸星目标',
            expireAt: Date.now() + 3000,
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
      const btnHit = renderer.hitTest(x, inputY, [renderer.settlementRenderer.claimBtnRect]);
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
        const hit = renderer.hitTest(x, inputY, wr.giftRects);
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
            const hit = renderer.hitTest(x, inputY, [wr.okBtnRect]);
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
          const btnHit = renderer.hitTest(x, inputY, rects);
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
          const hit = renderer.hitTest(x, inputY, [wr.okBtnRect]);
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

  // === 迷之优惠页面交互 ===
  if (game.state === 'mystery_discount') {
    const md = game._mysteryDiscountState;
    if (!md) return;

    // 选择优惠券
    if (md.selectedIdx === null && renderer.mysteryDiscountRenderer) {
      const rects = renderer.mysteryDiscountRenderer.couponRects || [];
      const hit = renderer.hitTest(x, inputY, rects);
      if (hit) {
        vibrate();
        if (game.audioManager) game.audioManager.play('tap');
        md.selectedIdx = hit.index;
        md.scratched = true;
        md.scratchProgress = 0;
        md.scratchStartTime = Date.now();
        return;
      }
      return;
    }

    // 刮开优惠券（涂抹刮奖区）
    if (md.selectedIdx !== null && md.scratched && !md.revealed && renderer.mysteryDiscountRenderer) {
      const rect = renderer.mysteryDiscountRenderer.scratchZoneRect;
      if (rect) {
        const hit = renderer.hitTest(x, inputY, [rect]);
        if (hit) {
          md._scratching = true;
          initScratchGrid(md);
          addScratchPoint(md, rect, x, inputY);
          return;
        }
      }
      return;
    }

    // 点击"收下优惠"按钮
    if (md.revealed && renderer.mysteryDiscountRenderer) {
      const rect = renderer.mysteryDiscountRenderer.collectBtnRect;
      if (rect) {
        const hit = renderer.hitTest(x, inputY, [rect]);
        if (hit) {
          vibrate();
          if (game.audioManager) game.audioManager.play('tap');
          // 应用随机折扣（6~9折）
          game._shopDiscountActive = true;
          game._shopDiscountRate = (md.rates && md.rates[md.selectedIdx]) || 0.8;
          console.log('[MysteryDiscount] applied rate:', game._shopDiscountRate, 'selectedIdx:', md.selectedIdx, 'rates:', md.rates);
          game._mysteryDiscountState = null;
          game.state = 'shop';
          if (game.storageManager) game.storageManager.saveProgress();
          return;
        }
      }
      return;
    }
    return;
  }

  if (game.state === 'shop') {
    // 获得新词牌弹窗优先处理（覆盖在商店上方）
    if (game._newWitchCardPopup && !game._closingNewWitchCardPopup) {
      if (renderer.newWitchCardCollectBtnRect) {
        const hit = renderer.hitTest(x, inputY, [renderer.newWitchCardCollectBtnRect]);
        if (hit) {
          vibrate();
          if (game.audioManager) game.audioManager.play('tap');
          game._newWitchCardCollectBtnPressed = true;
          setTimeout(() => {
            game._newWitchCardCollectBtnPressed = false;
            game.closeNewWitchCardPopup();
          }, 150);
          return;
        }
      }
      // 弹窗出现时屏蔽商店其他交互
      return;
    }

    // 商店女巫技能引导：优先处理引导点击，禁用其他交互
    if (game.shopGuidePhase >= 1 && game.shopGuidePhase <= 2) {
      if (renderer.shopGuideDialogRect) {
        const btnHit = renderer.hitTest(x, inputY, [renderer.shopGuideDialogRect]);
        if (btnHit) {
          const now = Date.now();
          if (game._shopGuideTapTime && now - game._shopGuideTapTime < 300) {
            game._shopGuideSkipTyping = true;
            vibrate();
            if (game.audioManager) game.audioManager.play('tap');
            return;
          }
          game._shopGuideTapTime = now;
          if (renderer.shopGuideNextBtnRect) {
            vibrate();
            if (game.audioManager) game.audioManager.play('tap');
            game.advanceShopGuide();
          }
          return;
        }
      }
      // 引导阶段点击其他区域不响应
      return;
    }

    // 卡牌图鉴引导交互处理（简化版：Phase 1 高亮图标 → 弹出女巫+对话框 → 点击推进）
    if (game.cardBookGuidePhase >= 1 && game.cardBookGuidePhase <= 4) {
      if (game.cardBookGuidePhase === 1 || game.cardBookGuidePhase === 2 || game.cardBookGuidePhase === 3) {
        // Phase 1/2/3: 女巫+对话框阶段，点击对话框推进
        if (renderer.cardBookGuideDialogRect) {
          const btnHit = renderer.hitTest(x, inputY, [renderer.cardBookGuideDialogRect]);
          if (btnHit) {
            const now = Date.now();
            if (game._cardBookGuideTapTime && now - game._cardBookGuideTapTime < 300) {
              game._cardBookGuideSkipTyping = true;
              vibrate();
              if (game.audioManager) game.audioManager.play('tap');
              return;
            }
            game._cardBookGuideTapTime = now;
            if (renderer.cardBookGuideNextBtnRect) {
              vibrate();
              if (game.audioManager) game.audioManager.play('tap');
              game.advanceCardBookGuide();
            }
            return;
          }
        }
        return;
      }
      // Phase 4: 退场动画中，阻塞输入
      return;
    }

    // 检测卡牌图鉴图标点击
    if (renderer.cardBookIconRect && game.cardBookUnlocked) {
      const cbHit = renderer.hitTest(x, inputY, [renderer.cardBookIconRect]);
      if (cbHit) {
        vibrate();
        if (game.audioManager) game.audioManager.play('tap');
        game.cardBookOpen = true;
        // 如果有新收集的卡牌，自动翻到对应页码
        if (game._newWitchCardThisShop) {
          const allLevels = WITCH_SKILLS.map(s => s.level);
          const itemsPerPage = 4;
          const levelIndex = allLevels.indexOf(game._newWitchCardThisShop);
          game.cardBookPage = levelIndex >= 0 ? Math.floor(levelIndex / itemsPerPage) : 0;
        } else {
          game.cardBookPage = 0;
        }
        game._cardBookAnimStartTime = Date.now();
        game._closingCardBook = false;
        game._cardBookNewBadge = false;
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
        const btnHit = renderer.hitTest(x, inputY, rects);
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
              // 装备第 2 张女巫牌时：2张女巫牌一起轻微抖动 + toast 提示排序（每个用户仅一次）
              if (game.jokers.length === 2) {
                const hasShownSortHint = game.storageManager && game.storageManager.loadJokerSortHintShown();
                if (!hasShownSortHint) {
                  game._jokerShakeHint = {
                    startTime: Date.now(),
                    duration: 3500,
                  };
                  game.hintToast = {
                    text: '长按女巫牌可以排序，卡牌按顺序进行触发',
                    expireAt: Date.now() + 3500,
                    startTime: Date.now(),
                    customPosition: 'propBarBottom',
                  };
                  if (game.storageManager) game.storageManager.saveJokerSortHintShown(true);
                }
              }
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
              // 吸星大法：直接设置选择状态（不进入 potion 状态）
              if (item.effect === 'absorb_stars') {
                game._absorbStarsState = { potionIndex: -1, selecting: true };
                game.hintToast = {
                  text: '选择一张手牌作为吸星目标',
                  expireAt: Date.now() + 3000,
                  startTime: Date.now(),
                };
              } else {
                game.potionMode = {...item};
                game._prePotionState = 'shop';
                game.state = 'potion';
              }
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
            // 迷之优惠点击"开奖"
            if (btnHit.action === 'openMystery' && game._confirmBuyItemData) {
              game._mysteryDiscountState = {
                selectedIdx: null,
                scratched: false,
                scratchProgress: 0,
                revealed: false,
                animStartTime: Date.now(),
                // 3张优惠券预生成6~9折随机折扣
                rates: Array.from({ length: 3 }, () => 0.6 + Math.random() * 0.3)
              };
              console.log('[MysteryDiscount] generated rates:', game._mysteryDiscountState.rates);
              game.state = 'mystery_discount';
              game._closingConfirmBuy = true;
              game._closeConfirmBuyStartTime = Date.now();
              return;
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
      const propHit = renderer.hitTest(x, inputY, renderer.shopRenderer.shopOwnedPropRects);
      if (propHit) {
        // 女巫牌支持长按排序（400ms），药水牌保持原有短按逻辑
        if (propHit.array === 'jokers') {
          game._pendingJokerSelect = { index: propHit.index, startTime: Date.now() };
          game._pendingJokerSelectTimer = setTimeout(() => {
            game._pendingJokerSelect = null;
            game._pendingJokerSelectTimer = null;
            // 进入排序状态
            game._jokerSortState = {
              fromIndex: propHit.index,
              insertSlot: propHit.index,
              currentX: x,
              currentY: inputY,
            };
            // 取消当前选中状态，避免排序时显示售出按钮
            renderer.shopRenderer.shopSelectedOwned = null;
          }, 400);
          return;
        }
        // 药水牌：保持短按逻辑
        vibrate();
        if (game.audioManager) game.audioManager.play('tap');
        const prev = renderer.shopRenderer.shopSelectedOwned;
        if (prev && prev.type === propHit.array && prev.index === propHit.index) {
          renderer.shopRenderer.shopSelectedOwned = null;
        } else {
          renderer.shopRenderer.shopSelectedOwned = { type: propHit.array, index: propHit.index };
        }
        return;
      }
    }

    // 检测女巫详情弹窗售出按钮点击（商店页）
    if (game._witchDetailPopup && game._witchDetailPopup.isShop && renderer._shopWitchDetailSellBtnRect) {
      const sellHit = renderer.hitTest(x, inputY, [renderer._shopWitchDetailSellBtnRect]);
      if (sellHit) {
        vibrate();
        if (game.audioManager) game.audioManager.play('card_sell');
        const arr = game.jokers;
        const idx = sellHit.index;
        if (arr && arr[idx]) {
          const item = arr[idx];
          game.gold += Math.round(item.cost / 2);
          game._sellingProp = {
            type: 'jokers',
            index: idx,
            startTime: Date.now(),
          };
          game._witchDetailPopup = null;
          renderer.shopRenderer.shopSelectedOwned = null;
          if (game.storageManager) game.storageManager.saveProgress();
        }
        return;
      }
    }

    // 检测售出按钮点击
    if (renderer.shopRenderer && renderer.shopRenderer.shopSellBtnRect) {
      const sellHit = renderer.hitTest(x, inputY, [renderer.shopRenderer.shopSellBtnRect]);
      if (sellHit) {
        vibrate();
        if (game.audioManager) game.audioManager.play('card_sell');
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

    // 检测使用按钮点击（随机强化 / 字母升级药水）
    if (renderer.shopRenderer && renderer.shopRenderer.shopUseBtnRect) {
      const useHit = renderer.hitTest(x, inputY, [renderer.shopRenderer.shopUseBtnRect]);
      if (useHit) {
        vibrate();
        if (game.audioManager) game.audioManager.play('tap');
        const arr = game[useHit.array];
        if (arr && arr[useHit.index]) {
          const potion = arr[useHit.index];
          // 从道具栏移除并进入使用页面
          arr.splice(useHit.index, 1);
          game.potionMode = {...potion};
          game._prePotionState = 'shop';
          game.state = 'potion';
          renderer.shopRenderer.shopSelectedOwned = null;
          if (game.storageManager) game.storageManager.saveProgress();
        }
        return;
      }
    }

    // 点击商店页面其他地方，关闭售出按钮 / 女巫详情弹窗
    let handled = false;
    if (game._witchDetailPopup && game._witchDetailPopup.isShop) {
      game._witchDetailPopup = null;
      handled = true;
    }
    if (renderer.shopRenderer && renderer.shopRenderer.shopSelectedOwned) {
      renderer.shopRenderer.shopSelectedOwned = null;
      handled = true;
    }
    if (handled) return;

    // 检测全局重掷按钮点击（扣除 3 金币，刷新所有模块）
    if (renderer.shopRenderer && renderer.shopRenderer.shopGlobalRerollBtnRect) {
      const rerollHit = renderer.hitTest(x, inputY, [renderer.shopRenderer.shopGlobalRerollBtnRect]);
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
      const refreshHit = renderer.hitTest(x, inputY, renderer.shopRenderer.shopRefreshRects);
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

    // 二次确认框点击处理（优先于其他交互）
    if (game._buyConfirmPopup) {
      const popup = game._buyConfirmPopup;
      // 确认按钮
      if (popup.confirmRect) {
        const confirmHit = renderer.hitTest(x, inputY, [popup.confirmRect]);
        if (confirmHit) {
          vibrate();
          if (game.audioManager) game.audioManager.play('tap');
          // 确认按钮按下动画
          game._buyConfirmBtnPressed = true;
          game._buyConfirmBtnPressTime = Date.now();
          const itemIndex = popup.itemIndex;
          const itemData = popup.item;
          // 延迟 150ms 执行购买
          setTimeout(() => {
            game._confirmBuyItemData = itemData;
            const success = buyItem(game, itemIndex);
            if (success) {
              game.confirmBuyItem = itemIndex;
              game._confirmBuySuccess = true;
              game._confirmBuySuccessTime = Date.now();
              if (game.audioManager) game.audioManager.play('buy_success');
              // 上报：卡牌购买
              const typeMap = { witch: '1', crystal: '2', potion: '3' };
              reportEvent("card_buy", {
                "card_type": typeMap[itemData.type] || itemData.type,
                "card_name": itemData.name
              });
            }
            game._buyConfirmPopup = null;
            game._buyConfirmBtnPressed = false;
            renderer.shopRenderer.priceBtnPressed = null;
          }, 150);
          return;
        }
      }
      // 取消按钮
      if (popup.cancelRect) {
        const cancelHit = renderer.hitTest(x, inputY, [popup.cancelRect]);
        if (cancelHit) {
          vibrate();
          if (game.audioManager) game.audioManager.play('tap');
          game._buyConfirmPopup = null;
          renderer.shopRenderer.priceBtnPressed = null;
          return;
        }
      }
      // 点击确认框外部：关闭
      game._buyConfirmPopup = null;
      renderer.shopRenderer.priceBtnPressed = null;
      return;
    }

    // 点击价格按钮：显示二次确认框
    if (renderer.shopRenderer && renderer.shopRenderer.shopPriceBtnRects) {
      const priceHit = renderer.hitTest(x, inputY, renderer.shopRenderer.shopPriceBtnRects);
      if (priceHit) {
        vibrate();
        if (game.audioManager) game.audioManager.play('tap');
        const item = game.shopItems[priceHit.index];
        if (!item) return;
        // 金币不足直接忽略
        if (game.gold < item.cost) return;
        const isAlwaysBuyablePotion = item.type === 'potion' && (item.effect === 'upgrade_letter' || item.effect === 'random_upgrade');
        if (item.type === 'potion' && (game.potions || []).length >= 2 && !isAlwaysBuyablePotion) return;

        const witchFull = item.type === 'witch' && (game.jokers || []).length >= game.maxJokerSlots;

        // 按下动效
        renderer.shopRenderer.priceBtnPressed = { index: priceHit.index, pressTime: Date.now() };

        // 显示二次确认气泡框
        game._buyConfirmPopup = {
          itemIndex: priceHit.index,
          item: {...item},
          startTime: Date.now(),
          witchFull: witchFull || undefined,
        };
        return;
      }
    }

    if (renderer.shopRenderer && renderer.shopRenderer.nextRoundBtnRect) {
      const btnHit = renderer.hitTest(x, inputY, [renderer.shopRenderer.nextRoundBtnRect]);
      if (btnHit && !game._challengeBtnPressed && !game._pendingWitchRewardDelay) {
        vibrate();
        if (game.audioManager) game.audioManager.play('challenge');
        game._challengeBtnPressed = true;
        renderer.shopRenderer.challengeBtnPressed = true;
        renderer.shopRenderer.challengeBtnPressTime = Date.now();
        // 启动页面过渡动画
        game._shopToGameTransition = { startTime: Date.now() };
        setTimeout(() => {
          renderer.lastScore = 0;
          game.nextRound();
        }, 400);
        return;
      }
    }
  }

  if (game.state === 'potion') {
    // === 复刻水：动画/结果阶段 ===
    if (game._replicateAnim) {
      if (game._replicateAnim.phase === 'result') {
        vibrate();
        game._replicateAnim = null;
        game.potionMode = null;
        game.state = game._prePotionState || 'shop';
        game._prePotionState = null;
      }
      return;
    }

    // === 平分秋色：选择阶段 ===
    if (game.potionMode && game.potionMode.effect === 'equal_split') {
      // 动画结束阶段点击 → 关闭
      if (game._equalSplitAnim && game._equalSplitAnim.phase === 'result') {
        vibrate();
        game._equalSplitAnim = null;
        game.potionMode = null;
        game.state = game._prePotionState || 'shop';
        game._prePotionState = null;
        return;
      }
      // 检测字母点击
      if (renderer.potionLetterRects) {
        const letterHit = renderer.hitTest(x, inputY, renderer.potionLetterRects);
        if (letterHit) {
          vibrate();
          const selected = game._equalSplitSelectedLetters || [];
          const idx = selected.indexOf(letterHit.letter);
          if (idx >= 0) {
            selected.splice(idx, 1);
          } else if (selected.length < 2) {
            selected.push(letterHit.letter);
          }
          game._equalSplitSelectedLetters = selected;
          return;
        }
      }
      // 检测开始按钮
      if (renderer.equalSplitStartBtnRect && renderer.equalSplitStartBtnRect.enabled) {
        const btnHit = renderer.hitTest(x, inputY, [renderer.equalSplitStartBtnRect]);
        if (btnHit) {
          vibrate();
          if (game.audioManager) game.audioManager.play('tap');
          game.startEqualSplit();
          return;
        }
      }
      // 检测重选按钮
      if (renderer.equalSplitResetBtnRect) {
        const btnHit = renderer.hitTest(x, inputY, [renderer.equalSplitResetBtnRect]);
        if (btnHit) {
          vibrate();
          game._equalSplitSelectedLetters = [];
          return;
        }
      }
      return;
    }

    // === 星辉洗涤：选择阶段 ===
    if (game.potionMode && game.potionMode.effect === 'starlight_wash') {
      // 动画结束阶段点击 → 关闭
      if (game._starlightWashAnim && game._starlightWashAnim.phase === 'result') {
        vibrate();
        game._starlightWashAnim = null;
        game.potionMode = null;
        game.state = game._prePotionState || 'shop';
        game._prePotionState = null;
        return;
      }
      // 检测字母点击
      if (renderer.potionLetterRects) {
        const letterHit = renderer.hitTest(x, inputY, renderer.potionLetterRects);
        if (letterHit) {
          vibrate();
          const selected = game._starlightWashSelectedLetter;
          if (selected === letterHit.letter) {
            game._starlightWashSelectedLetter = null;
          } else {
            game._starlightWashSelectedLetter = letterHit.letter;
          }
          return;
        }
      }
      // 检测开始按钮
      if (renderer.starlightWashStartBtnRect && renderer.starlightWashStartBtnRect.enabled) {
        const btnHit = renderer.hitTest(x, inputY, [renderer.starlightWashStartBtnRect]);
        if (btnHit) {
          vibrate();
          if (game.audioManager) game.audioManager.play('tap');
          game.startStarlightWash();
          return;
        }
      }
      // 检测重选按钮
      if (renderer.starlightWashResetBtnRect) {
        const btnHit = renderer.hitTest(x, inputY, [renderer.starlightWashResetBtnRect]);
        if (btnHit) {
          vibrate();
          game._starlightWashSelectedLetter = null;
          return;
        }
      }
      return;
    }

    // === 复刻水：选择阶段 ===
    if (game.potionMode && game.potionMode.effect === 'replicate_letter') {
      // 检测字母点击
      if (renderer.potionLetterRects) {
        const letterHit = renderer.hitTest(x, inputY, renderer.potionLetterRects);
        if (letterHit) {
          vibrate();
          const selected = game._replicateSelectedLetters || [];
          const idx = selected.indexOf(letterHit.letter);
          if (idx >= 0) {
            selected.splice(idx, 1);
          } else if (selected.length < 2) {
            selected.push(letterHit.letter);
          }
          game._replicateSelectedLetters = selected;
          return;
        }
      }
      // 检测开始按钮
      if (renderer.replicateStartBtnRect && renderer.replicateStartBtnRect.enabled) {
        const btnHit = renderer.hitTest(x, inputY, [renderer.replicateStartBtnRect]);
        if (btnHit) {
          vibrate();
          if (game.audioManager) game.audioManager.play('tap');
          game.startReplicate();
          return;
        }
      }
      // 检测重选按钮
      if (renderer.replicateResetBtnRect) {
        const btnHit = renderer.hitTest(x, inputY, [renderer.replicateResetBtnRect]);
        if (btnHit) {
          vibrate();
          game._replicateSelectedLetters = [];
          return;
        }
      }
      return;
    }

    // 动画进行中，忽略所有点击
    if (game._potionUpgrading) return;

    // 防御：potionMode 异常为空时直接忽略
    if (!game.potionMode) return;

    // === 随机强化药水（老虎机）===
    if (game.potionMode && game.potionMode.effect === 'random_upgrade') {
      // 检测抽选按钮（只在 idle 阶段可点）
      if (renderer.randomSpinBtnRect && renderer.randomSpinBtnRect.enabled) {
        const spinHit = renderer.hitTest(x, inputY, [renderer.randomSpinBtnRect]);
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
      const letterHit = renderer.hitTest(x, inputY, renderer.potionLetterRects);
      if (letterHit) {
        vibrate();
        game._potionSelectedLetter = letterHit.letter;
        return;
      }
    }

    // 检测升级按钮
    if (renderer.potionUpgradeBtnRect && renderer.potionUpgradeBtnRect.enabled) {
      const btnHit = renderer.hitTest(x, inputY, [renderer.potionUpgradeBtnRect]);
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
      const btnHit = renderer.hitTest(x, inputY, [renderer.potionStashBtnRect]);
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
      const btnHit = renderer.hitTest(x, inputY, [renderer.lifeExtensionBtnRect]);
      if (btnHit) {
        vibrate();
        if (game.audioManager) game.audioManager.play('tap');
        game._lifeExtensionBtnPressed = true;
        setTimeout(() => {
          game._lifeExtensionBtnPressed = false;
          game._lifeExtensionAnim = null;
          // 发放结算金币（与 _showSettlement 逻辑一致）
          const baseGold = 2 + Math.round(game.round / 3);
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
    if (game._showingRankPopup) {
      hideRankPopup();
      return;
    }

    // 复活按钮
    if (renderer.gameOverRenderer && renderer.gameOverRenderer.reviveBtnRect) {
      const reviveHit = renderer.hitTest(x, inputY, [renderer.gameOverRenderer.reviveBtnRect]);
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
      const rankHit = renderer.hitTest(x, inputY, [renderer.gameOverRenderer.rankBtnRect]);
      if (rankHit) {
        vibrate();
        if (game.audioManager) game.audioManager.play('tap');
        showRankPopup('friend');
        return;
      }
    }

    if (renderer.gameOverRenderer && renderer.gameOverRenderer.restartBtnRect) {
      const btnHit = renderer.hitTest(x, inputY, [renderer.gameOverRenderer.restartBtnRect]);
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

  // 统一处理返回主页请求（如对战页 top_home 按钮）
  if (game && game._returnToHomepage) {
    game._returnToHomepage = false;
    showHomepage = true;
    renderer.homepageAnimStartTime = Date.now();
    renderer._homepageEntryAnim = null;
  }

  if (pageFlipState) {
    // 主页 → 游戏翻页过渡
    renderer.drawPageFlip(game, pageFlipState);
    if (pageFlipState.complete) {
      const targetState = pageFlipState.targetState || 'playing';
      pageFlipState = null;
      showHomepage = false;
      // 双人对战已在点击时初始化，这里只需切到对应状态
    }
  } else if (showHomepage) {
    // 测试阶段：优先展示 homepage
    renderer.drawHomepage();
    // 主页 setting 按钮复用 top_icon 行为，设置弹窗打开时叠加在主页上绘制
    if (game && game._settingsPopup) {
      renderer.drawSettingsPopup(game);
    }
  } else if (!preloadComplete) {
    // 预加载阶段：绘制预加载页
    renderer.drawPreviewLoad(preloadProgress);
  } else if (transitionStartTime !== null) {
    // 过渡阶段：直接渲染游戏页面（去掉淡入淡出）
    renderer.render(game);
    transitionStartTime = null;
  } else {
    // 对战模式状态更新
    if (game && game.state === 'battle' && game.battleManager) {
      game.battleManager.updateBotThinking();
      game.battleManager.checkReveal();
    }
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
