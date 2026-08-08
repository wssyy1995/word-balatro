// require('./js/render/test');
// 微信小游戏入口

// ===== 版本更新检查（必须在所有 require 之前同步注册）=====
// 微信在冷启动瞬间就检查并后台下载新版本；本游戏代码包小（图片/音频在云存储），
// 下载可能很快完成。若等数万行模块（巨型词库等）同步求值完再注册，
// onUpdateReady 可能已先于注册触发且不会补发，导致永远收不到回调。
(function checkGameUpdate() {
  try {
    if (typeof wx === 'undefined' || !wx.getUpdateManager) return;
    const updateManager = wx.getUpdateManager();
    updateManager.onCheckForUpdate((res) => {
      console.log('[Update] 检查新版本:', res.hasUpdate);
    });
    updateManager.onUpdateReady(() => {
      wx.showModal({
        title: '更新提示',
        content: '新版本已准备好，是否立即重启更新？',
        confirmText: '重启',
        cancelText: '稍后再说',
        success: (res) => {
          if (res.confirm) {
            updateManager.applyUpdate();
          }
        }
      });
    });
    updateManager.onUpdateFailed(() => {
      console.error('[Update] 新版本下载失败');
    });
  } catch (e) {
    console.error('[Update] 更新管理器初始化失败:', e);
  }
})();

const { Game, requestGlobalProfile, fetchGlobalRank, GAME_VERSION } = require('./js/game');
const { Renderer } = require('./js/renderer');
const { InputHandler } = require('./js/input');
const { buyItem, upgradeLetter, refreshModule, generateShopItems, getWitchUpgradeStep, getWitchUpgradeRateStep } = require('./js/shop');
const { LETTER_SCORE, letterUpgrades } = require('./js/data');
const { WITCH_SKILLS } = require('./js/witch_skills');
const { StorageManager } = require('./js/storage');
const { CloudStorageManager } = require('./js/cloud_storage');
const { reportEvent } = require('./js/report');
const { handleBattleInput } = require('./js/battle/input');
const { DailyAchievements } = require('./js/daily_achievements');

// 获取 Canvas 上下文
wx.onShow((res) => {
  console.log('[Game] 切回前台', res && res.scene, res && res.query);

  // 切回前台时：如果当前在首页且有未处理的分享房间号，则重置自动加入计时
  // 用于处理好友已在小游戏内，再点击分享链接进入的场景
  if (showHomepage && game && game._autoJoinBattleRoomId && !game._autoJoiningBattle) {
    cloudStorage.log('[Launch] onShow 重新触发自动加入房间: ' + game._autoJoinBattleRoomId);
    game._autoJoinBattleStartTime = Date.now();
  }

  // 切回前台时：如果当前在首页且尚未记录自动加入房间号，则读取本次启动参数并触发
  // 注意：热启动/重新触发 onShow 时，必须使用 onShow 回调参数 res.query，
  // wx.getLaunchOptionsSync() 只会返回冷启动参数，导致已在小游戏内的用户点击分享链接读不到 roomId
  if (showHomepage && game && !game._autoJoiningBattle) {
    try {
      const query = (res && res.query) || {};
      if (query.roomId) {
        cloudStorage.log('[Launch] onShow 读取到分享房间号: ' + query.roomId);
        game._pendingBattleRoomId = query.roomId;
        game._autoJoinBattleRoomId = query.roomId;
        game._autoJoinBattleStartTime = Date.now();
        game._battleJoinConfirmPopup = null;
        // 热启动场景立即尝试加入，未就绪时 gameLoop 会继续兜底
        tryAutoJoinFriendBattle();
      } else {
        cloudStorage.log('[Launch] onShow 未读取到 roomId res.query=' + JSON.stringify(query));
      }
    } catch (e) {
      cloudStorage.log('[Launch] onShow 读取启动参数失败: ' + (e && e.message ? e.message : String(e)));
    }
  }

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

// 每日金词分享配图（MP 后台自定义转发图片，已过审）
const GOLDEN_SHARE_IMAGE_URL = 'https://mmocgame.qpic.cn/wechatgame/cRzt0Nn4komGLIJSQia9MIqfnyZMDNVeTNY0gKOmYWqz9BEGJ1kjY2NJk6eUSFRux/0';
const GOLDEN_SHARE_IMAGE_ID = '+F+yMuPhQSO60Jy7bv7L3w==';

// 平台判断：开发者工具不震动
const isDevTools = info.platform === 'devtools';
function vibrate() {
  if (!isDevTools && wx.vibrateShort) {
    try { wx.vibrateShort({ type: 'light' }); } catch (e) {}
  }
}

// 版本判断：调试入口仅在非正式版本开放（开发版/体验版可用，正式版禁用）
function isDebugVersion() {
  if (!wx.getAccountInfoSync) return true; // 获取不到时默认开放，便于调试
  try {
    const accountInfo = wx.getAccountInfoSync();
    const env = accountInfo && accountInfo.miniProgram && accountInfo.miniProgram.envVersion;
    return env !== 'release';
  } catch (e) {
    console.warn('[Version] 获取账号信息失败', e);
    return true;
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
let globalAuthButton = null; // 全国榜授权按钮（wx.createUserInfoButton）
let profileAuthButton = null; // 游戏启动时头像昵称授权按钮（wx.createUserInfoButton）
let profileAuthShowTimer = null; // 控制授权按钮延迟显示，与 Canvas 弹窗动画同步

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

function calcProfileAuthButtonRect() {
  const s = renderer ? renderer.scale || 1 : 1;
  const W = canvas ? canvas.width / scaleDpr : 375;
  const H = canvas ? canvas.height / scaleDpr : 667;
  const panelW = Math.min(W * 0.88, 320 * s);
  const panelH = 210 * s;
  const panelX = (W - panelW) / 2;
  const panelY = H - panelH - 24 * s;
  const btnW = 220 * s;
  const btnH = 46 * s;
  const btnX = panelX + (panelW - btnW) / 2;
  const btnY = panelY + panelH - 28 * s - btnH;
  return { x: btnX, y: btnY, w: btnW, h: btnH, panelX, panelY, panelW, panelH, s, W, H };
}

function showRankList(panelRect) {
  const odc = getOpenDataContext();
  if (!odc) return;
  isRankShowing = true;
  if (game) game._showingRankList = true;

  // 2026-06-24 优化：sharedCanvas 不再默认全屏，按实际展示区域设置
  // 减少开放域 offscreen canvas 的内存占用
  let sharedW = canvas.width;
  let sharedH = canvas.height;
  if (panelRect) {
    // panelRect 是逻辑点，转为物理像素
    sharedW = Math.max(1, Math.floor(panelRect.w * scaleDpr));
    sharedH = Math.max(1, Math.floor(panelRect.h * scaleDpr));
  } else {
    // 全屏排行榜也限制上限，避免高分屏下过大
    sharedW = Math.min(sharedW, 960);
    sharedH = Math.min(sharedH, 1920);
  }

  // OffScreenCanvas 模式：主域设置 sharedCanvas 的宽高（开放域不能设）
  const sharedCanvas = odc.canvas;
  if (sharedCanvas) {
    try {
      sharedCanvas.width = sharedW;
      sharedCanvas.height = sharedH;
    } catch (e) {
      console.warn('sharedCanvas set failed', e.message);
    }
  }

  // 如果在弹窗内显示好友榜，使用 showPanel 模式，只绘制内容区域
  if (panelRect) {
    odc.postMessage({
      action: 'showPanel',
      scaleDpr,
      canvasWidth: sharedW,
      canvasHeight: sharedH,
      rect: panelRect,
    });
  } else {
    odc.postMessage({
      action: 'show',
      scaleDpr,
      canvasWidth: sharedW,
      canvasHeight: sharedH,
    });
  }
}

function hideRankList() {
  const odc = getOpenDataContext();
  if (!odc) return;
  isRankShowing = false;
  if (game) game._showingRankList = false;
  // 2026-06-24 优化：隐藏排行榜时通知开放域释放 sharedCanvas 内存
  odc.postMessage({ action: 'hide' });

  // 主域侧也把 sharedCanvas 尺寸降到最小，双保险
  const sharedCanvas = odc.canvas;
  if (sharedCanvas) {
    try {
      sharedCanvas.width = 1;
      sharedCanvas.height = 1;
    } catch (e) {
      console.warn('sharedCanvas reset failed', e.message);
    }
  }
}

function showRankPopup(tab = 'friend') {
  if (!game) return;
  game._showingRankPopup = true;
  game._rankTab = tab;

  // 点击排行榜时按需下载 rank_avatar 云图集（不阻塞弹窗展示）
  if (game.cloudStorage && !game._rankAvatarPreloaded) {
    game._rankAvatarPreloaded = true;
    game.cloudStorage.preloadRankAvatarImages().then(() => {
      if (game.cloudStorage) game.cloudStorage.injectRankAvatarToRenderer(renderer);
    });
  }

  switchRankTab(tab);
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
    // sharedCanvas 尺寸已按 content 区域设置，开放域内部从 (0,0) 绘制，
    // 主域再把 sharedCanvas 贴到 content 区域，避免坐标和尺寸错乱
    destroyGlobalAuthButton();
    game._showingGlobalAuthButton = false;
    const rect = calcRankPanelRect();
    showRankList({
      x: 0,
      y: 0,
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

// 静默尝试获取用户信息：若用户已授权，可直接拿到头像昵称而不弹窗
// 部分环境下 getSetting 的 scope.userInfo 不可靠，用此接口兜底
function tryGetUserInfoSilently() {
  if (!wx.getUserInfo) return Promise.resolve(false);
  return new Promise((resolve) => {
    wx.getUserInfo({
      withCredentials: false,
      lang: 'zh_CN',
      success: (res) => {
        const userInfo = res.userInfo || {};
        const ok = !!(userInfo.avatarUrl && userInfo.nickName);
        if (ok) {
          console.log('[ProfileAuth] 静默获取用户信息成功');
          try {
            wx.setStorageSync('userInfo', userInfo);
          } catch (e) {}
          if (renderer && renderer.battleRenderer && renderer.battleRenderer._setSelfAvatar) {
            renderer.battleRenderer._setSelfAvatar(userInfo.avatarUrl);
          }
        }
        resolve(ok);
      },
      fail: (err) => {
        console.log('[ProfileAuth] 静默获取用户信息失败', err);
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

function showProfileAuthButton() {
  if (!game) return;
  if (!wx.createUserInfoButton) {
    console.warn('[ProfileAuth] 当前环境不支持 createUserInfoButton');
    game._profileAuthCompleted = true;
    return;
  }

  destroyProfileAuthButton();

  const rect = calcProfileAuthButtonRect();
  console.log('[ProfileAuth] 创建头像昵称授权按钮', rect);

  game._showingProfileAuthButton = { startTime: Date.now() };
  profileAuthButton = wx.createUserInfoButton({
    type: 'text',
    text: '授权头像昵称',
    style: {
      left: rect.x,
      top: rect.y,
      width: rect.w,
      height: rect.h,
      lineHeight: rect.h,
      backgroundColor: '#c4a35a',
      color: '#ffffff',
      textAlign: 'center',
      fontSize: 16,
      borderRadius: Math.floor(rect.h / 2),
    }
  });

  profileAuthButton.onTap((res) => {
    console.log('[ProfileAuth] 授权按钮点击', res);
    const userInfo = res.userInfo || {};

    // 立即销毁原生按钮，但保留面板绘制状态，由 Canvas 面板执行向下退出动画
    destroyProfileAuthButton(true);
    game._closingProfileAuth = true;
    game._closeProfileAuthStartTime = Date.now();
    game._profileAuthResult = {
      success: !!(userInfo.avatarUrl && userInfo.nickName),
      userInfo: userInfo
    };
  });

  // 延迟显示原生按钮，等 Canvas 面板从底部弹出的 easeOutBack 动画（350ms）完成后再出现，
  // 避免面板还在滑动、按钮已经瞬间完整显示带来的割裂感。
  profileAuthShowTimer = setTimeout(() => {
    profileAuthShowTimer = null;
    if (profileAuthButton) {
      profileAuthButton.show();
    }
  }, 350);
}

function destroyProfileAuthButton(keepPanelState = false) {
  if (profileAuthShowTimer) {
    clearTimeout(profileAuthShowTimer);
    profileAuthShowTimer = null;
  }
  if (profileAuthButton) {
    try {
      profileAuthButton.destroy();
    } catch (e) {
      console.warn('[ProfileAuth] 销毁授权按钮异常', e);
    }
    profileAuthButton = null;
  }
  if (game && !keepPanelState) game._showingProfileAuthButton = false;
}

async function requestPrivacyAndProfile() {
  if (!game) return;
  // 已经授权过头像昵称或已完成本次流程，直接跳过
  if (game._profileAuthCompleted) return;

  const isAuth = await checkUserInfoAuth();
  if (isAuth) {
    game._profileAuthCompleted = true;
    return;
  }

  // getSetting 的 scope.userInfo 在某些环境下不可靠，再静默试一次 getUserInfo
  const hasUserInfo = await tryGetUserInfoSilently();
  if (hasUserInfo) {
    game._profileAuthCompleted = true;
    return;
  }

  // 未授权：先处理隐私保护提示，再展示头像昵称授权弹窗
  if (!wx.getPrivacySetting) {
    // 不支持隐私设置 API，直接展示授权弹窗
    showProfileAuthButton();
    return;
  }

  wx.getPrivacySetting({
    success: (res) => {
      console.log('[ProfileAuth] 隐私设置', res);
      if (!res.needAuthorization) {
        // 不需要隐私授权，直接展示头像昵称授权弹窗
        showProfileAuthButton();
        return;
      }

      // 需要隐私授权：触发微信框架自带隐私保护提示，用户点击同意后展示头像昵称授权弹窗
      if (wx.requirePrivacyAuthorize) {
        wx.requirePrivacyAuthorize({
          success: () => {
            console.log('[ProfileAuth] 隐私授权成功，展示头像昵称授权弹窗');
            // 用户在微信自带隐私弹窗中点击同意后，再弹出头像昵称授权
            showProfileAuthButton();
          },
          fail: (err) => {
            console.warn('[ProfileAuth] 隐私授权失败', err);
            // 不标记完成，下次启动可再次尝试
          }
        });
      } else {
        // 不支持 requirePrivacyAuthorize，直接展示授权弹窗
        showProfileAuthButton();
      }
    },
    fail: (err) => {
      console.warn('[ProfileAuth] getPrivacySetting 失败', err);
      showProfileAuthButton();
    }
  });
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
        game_version: GAME_VERSION
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
// 2026-06-24 优化：从 1280×2560 下调到 960×1920
// 在 DPR=3 的 iPhone 上 scaleDpr 从 ~2.75 降到 ~2.0，单帧缓冲减少约 45%
// 对 UI/图片清晰度影响轻微，但能显著降低显存/GPU 内存压力
const MAX_CANVAS_WIDTH = 960;
const MAX_CANVAS_HEIGHT = 1920;
const scaleDpr = Math.min(dpr, MAX_CANVAS_WIDTH / WIDTH, MAX_CANVAS_HEIGHT / HEIGHT);

canvas.width = Math.floor(WIDTH * scaleDpr);
canvas.height = Math.floor(HEIGHT * scaleDpr);
ctx.scale(scaleDpr, scaleDpr);

// 2026-06-24 优化：增加内存监控，便于观察优化效果
// 收到微信内存告警时立即打印
wx.onMemoryWarning && wx.onMemoryWarning((res) => {
  console.warn('[MemoryWarning] level=', res && res.level, 'time=', Date.now());
  if (wx.getPerformance) {
    const mem = wx.getPerformance().getMemoryInfo();
    console.warn('[MemoryWarning] used=', mem.used, 'total=', mem.total, 'limit=', mem.limit);
  }
});

// 每 10 秒采样一次内存（真机调试阶段使用，上线后可关闭或降低频率）
const MEMORY_LOG_INTERVAL = 10000;
setInterval(() => {
  if (!wx.getPerformance) return;
  try {
    const mem = wx.getPerformance().getMemoryInfo();
    console.log('[MemorySample] used=', mem.used, 'total=', mem.total, 'limit=', mem.limit, 'time=', Date.now());
  } catch (e) {}
}, MEMORY_LOG_INTERVAL);

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

// 预加载状态
let preloadProgress = 0;
let preloadComplete = false;

// homepage 展示开关（预加载完成后展示，点击通关模式后进入游戏）
let showHomepage = false;

// 主页 → 游戏 翻页过渡状态
let pageFlipState = null;
const PAGE_FLIP_DURATION = 1200;

// "继续闯关"可直接恢复的单人页面状态（与存档 saveProgress 可落地、_restoreFromProgress 可恢复的状态一致）
const SOLO_RESUMABLE_STATES = ['playing', 'settlement', 'shop'];

// 过渡状态（预加载页 → 游戏页）
let transitionAlpha = 0;
let transitionStartTime = null;
const TRANSITION_DURATION = 600;

// 启动预加载：下载云图片并显示进度条
async function startPreload() {
  // 版本更新检查已上移至 game.js 顶部（所有 require 之前同步注册），此处不再重复注册

  // 提前初始化 game 实例，使预加载页也能显示头像昵称授权弹窗
  initGameInstance();
  // 确保 game 关联上 cloudStorage，否则预加载阶段日志无法写入
  if (game) game.cloudStorage = cloudStorage;

  // 读取本次启动参数，若通过好友对战分享链接进入，则提前记录房间号，
  // 确保预加载阶段能优先加载 homepage 图片，并在首页入场后自动加入房间
  try {
    const launchOptions = wx.getLaunchOptionsSync ? wx.getLaunchOptionsSync() : {};
    const query = launchOptions.query || {};
    if (query.roomId && game) {
      cloudStorage.log('[Launch] startPreload 读取到分享房间号: ' + query.roomId);
      game._pendingBattleRoomId = query.roomId;
      game._autoJoinBattleRoomId = query.roomId;
      game._autoJoinBattleStartTime = Date.now();
      game._battleJoinConfirmPopup = null;
    } else {
      cloudStorage.log('[Launch] startPreload 未读取到 roomId query=' + JSON.stringify(query));
    }
  } catch (e) {
    cloudStorage.log('[Launch] startPreload 读取启动参数失败: ' + (e && e.message ? e.message : String(e)));
  }

  // 游戏启动后尽早触发隐私授权流程：预加载页即可展示头像昵称授权弹窗
  requestPrivacyAndProfile();

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

  const total = shopNames.length + bgIconNames.length + guideStepCount + musicCount;

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

  // 好友对战分享链接进入：预加载阶段优先下载 homepage 相关 bg_icon，
  // 确保首页按钮弹出时图片已就绪，避免资源未加载完成时卡住
  const isAutoJoinBattle = game && game._autoJoinBattleRoomId;
  if (isAutoJoinBattle) {
    const homepageIconNames = ['homepageBg', 'homepageTitle', 'homepageRound', 'homepageRoundContinue', 'homepageBattle'];
    cloudStorage.log('[AutoJoin] 优先加载 homepage 图片');
    for (const name of homepageIconNames) {
      if (cloudStorage.bgIconFileMap[name]) {
        await cloudStorage._loadBgIconImage(name).catch(err => {
          cloudStorage.log('[AutoJoin] 优先加载 homepage 图片失败: ' + name + ' ' + (err && err.message ? err.message : String(err)));
        });
      }
    }
  }

  cloudStorage.log('[AutoJoin] 开始预加载 shop_card');
  await cloudStorage.preloadShopCardImages(onProgress);
  cloudStorage.log('[AutoJoin] 开始预加载 bg_icon');
  await cloudStorage.preloadBgIconImages(onProgress, isResuming ? (savedProgress.round || 1) : 1);
  if (needGuide) {
    // 新手引导两个阶段均使用 witch_guide_1，只需预加载第 1 组
    await cloudStorage.preloadGuideGroup(1, renderer);
    onProgress();
    onProgress();
  }

  // 预加载 music 文件到本地缓存
  await cloudStorage.preloadMusicFiles(onProgress);

  // 预加载对战模式相关图片（按钮图标等），避免进入对战页/弹窗时资源未就绪
  if (game && game.cloudStorage && game.cloudStorage.preloadBattleModeButtonImages) {
    cloudStorage.log('[AutoJoin] 开始预加载对战模式按钮图');
    await game.cloudStorage.preloadBattleModeButtonImages().catch(err => {
      cloudStorage.log('[AutoJoin] 对战模式按钮图预加载失败: ' + (err && err.message ? err.message : String(err)));
    });
  }

  // 存档恢复时：并行预加载所有已解锁的 witch_card
  if (collectedWitchCards.length > 0) {
    cloudStorage.log('[Preload] 存档恢复，预加载已解锁 witch_card:' + JSON.stringify(collectedWitchCards));
    await Promise.all(collectedWitchCards.map(level =>
      cloudStorage.preloadWitchCardForLevel(level, renderer)
    ));
    cloudStorage.log('[Preload] 已解锁 witch_card 预加载完成');
  }

  cloudStorage.log('[AutoJoin] 预加载完成，准备进入主页');
  cloudStorage.injectToRenderer(renderer);
  cloudStorage.injectBgIconToRenderer(renderer);
  cloudStorage.injectBattleToRenderer(renderer);
  if (needGuide) {
    cloudStorage.injectGuideToRenderer(renderer);
  }
  preloadComplete = true;
  startGame();
  showHomepage = true;
  renderer.homepageAnimStartTime = Date.now();
  renderer._homepageEntryAnim = { startTime: Date.now() };
  renderer._resetHomepageEntryAnim();
  // 好友对战分享链接进入：提前重置自动加入计时，确保首页入场动画后能立即触发加入
  if (game && game._autoJoinBattleRoomId) {
    game._autoJoinBattleStartTime = Date.now();
    cloudStorage.log('[AutoJoin] 进入主页，已重置自动加入计时 roomId=' + game._autoJoinBattleRoomId);
  }
  cloudStorage.log('[Game] 云图片预加载完成，进入主页');
}

function initGameInstance() {
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
    cloudStorage.log('[Game] 从存档恢复，回合:' + saved.round);
  } else {
    game = new Game();
    // 无效或过期存档统一清理，避免反复加载旧存档导致异常
    if (saved && (!hasRequiredFields || isExpired)) {
      storage.clearProgress();
      cloudStorage.log('[Game] 旧存档字段不完整/已过期，已清理，开始新游戏');
    } else {
      cloudStorage.log('[Game] 新游戏');
    }
  }

  game.cloudStorage = cloudStorage;
  game.renderer = renderer;
  wx.game = game;
  game.startFriendRoomPolling = startFriendRoomPolling;
  game.applyFriendRoomState = applyFriendRoomState;
  game.startFriendBattleCountdown = startFriendBattleCountdown;
  return game;
}

function startGame() {
  // 如果预加载阶段已提前创建 game，则复用；否则重新创建
  if (!game) {
    initGameInstance();
  }

  // 确保 game 与 cloudStorage 关联，方便 startGame 后的日志写入
  if (game && !game.cloudStorage) {
    game.cloudStorage = cloudStorage;
  }

  // 恢复每日成就（只恢复今天的，非今天的自动清理）
  new DailyAchievements(game, true);

  // 2026-06-24 优化：进入游戏后再加载音效，homepage 阶段不占用音频实例
  game.initAudio();

  // 存档恢复时：补充按需下载可能遗漏的引导图（witch_guide_2 商店引导 / witch_guide_3 图鉴引导）
  if (game.round === 2 && game.shopGuidePhase === 0) {
    cloudStorage.preloadGuideGroup(2, renderer).catch(err => {
      console.error('[Restore] 补充下载 witch_guide_2 失败:', err);
    });
  }
  if (game.round === 3 && game.cardBookGuidePhase === 0) {
    cloudStorage.preloadGuideGroup(3, renderer).catch(err => {
      console.error('[Restore] 补充下载 witch_guide_3 失败:', err);
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

  // rank_avatar 不再在启动时预加载，改为点击排行榜/对战时按需下载
  // if (game.cloudStorage && !game._rankAvatarPreloaded) { ... }

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

  // 游戏启动后：隐私授权同意后，弹出底部头像昵称授权弹窗
  requestPrivacyAndProfile();

  // 检查是否通过好友对战分享链接启动
  setTimeout(() => {
    const launchOptions = wx.getLaunchOptionsSync ? wx.getLaunchOptionsSync() : {};
    const query = launchOptions.query || {};
    if (query.roomId && game) {
      cloudStorage.log('[Launch] setTimeout 读取到分享房间号: ' + query.roomId);
      game._pendingBattleRoomId = query.roomId;
      // 好友点击分享链接后，先进入首页，再自动加入房间，无需手动确认
      game._autoJoinBattleRoomId = query.roomId;
      // 记录 launch 时间；预加载完成后 gameLoop 再根据 autoJoinElapsed 自动加入
      game._autoJoinBattleStartTime = Date.now();
      game._battleJoinConfirmPopup = null;
      // 立即尝试加入（兼容冷启动预加载很快完成的场景），若未就绪 gameLoop 会继续兜底
      if (preloadComplete) {
        tryAutoJoinFriendBattle();
      }
    } else {
      cloudStorage.log('[Launch] setTimeout 未读取到 roomId query=' + JSON.stringify(query));
    }
  }, 500);

  cloudStorage.log('[Game] startGame 完成');
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
    game._witchUpgradePopup ||
    (game.confirmBuyItem !== undefined && game.confirmBuyItem !== null) ||
    game._newWitchCardPopup ||
    (game._lifeExtensionAnim && Date.now() - game._lifeExtensionAnim.startTime >= 1000) ||
    (renderer && renderer.debugMenuOpen) ||
    (game._showingProfileAuthButton && !game._profileAuthCompleted)
  );
  return (!hasModal && game && (game.state === 'playing' || game.state === 'shop' || game.state === 'life_extended' || game.state === 'daily_gold')) ? y - 10 : y;
}

  // ===== 好友对战相关函数 =====
  function enterBattlePage() {
    const targetState = 'battle';
    if (game && game.cloudStorage) {
      game.cloudStorage.preloadBattleImages().then(() => {
        if (game && game.cloudStorage) game.cloudStorage.injectBattleToRenderer(renderer);
      }).catch(err => {
        console.error('battle 图片预加载失败:', err);
      });
    }
    // 好友从分享链接进入，点击开始对战后从主页翻页到对战页
    // 翻页期间让 render() 绘制对战页，避免进入单人游戏画面
    if (game.state !== 'battle') {
      game._preBattleSoloState = game.state;
    }
    game.state = 'battle';
    game.battleMode = true;

    // 好友通过分享链接进入对战页时，用房间创建时已生成的统一种子词/手牌做背景预览，
    // 让 B 此时的字母牌区域就与 A 一致（旧逻辑是本地随机生成，正式开始后才被云端手牌覆盖）。
    // 旧版房间没有预生成手牌时 roomData 为空，退化为本地随机预览。
    if (game && game.battleManager && game._battleRoomId && !game._friendBattleStarted && !game.battleHand) {
      const roomData = game._pendingFriendRoomData || null;
      game._pendingFriendRoomData = null;
      game.battleManager.startBattle('easy', {
        online: true,
        roomId: game._battleRoomId,
        isHost: !!game._battleIsHost,
        roomData: roomData || undefined
      });
    }

    pageFlipState = { startTime: Date.now(), duration: PAGE_FLIP_DURATION, targetState };
  }

  function createBattleRoom() {
    if (game._battleModeSelectPopup) {
      game._battleModeSelectPopup.mode = 'friend_loading';
      game._battleModeSelectPopup.title = '对战房间创建中';
      game._battleModeSelectPopup.startTime = Date.now();
      game._battleModeSelectPopup.friendPressed = false;
      game._battleModeSelectPopup.onlinePressed = false;
    }

    wx.cloud.callFunction({
      name: 'battleRoom',
      success: (res) => {
        if (res.result && res.result.code === 0) {
          const roomId = res.result.roomId;
          game._battleRoomId = roomId;
          game._battleIsHost = true;
          game._friendBattleStarted = false;
          game._friendBattleLobbyUpdateTime = 0; // 新房间，重置 lobby 时间戳
          game._pendingFriendRoomData = null; // 房主侧不使用好友预览数据
          // 房间创建时已生成第一回合统一种子词/手牌：房主立即用它做背景预览，
          // 这样好友加入后看到的字母牌区域与房主一致
          const createdRoom = res.result.room || {};
          if (game.battleManager && !game.battleHand &&
              Array.isArray(createdRoom.seedWords) && createdRoom.seedWords.length &&
              Array.isArray(createdRoom.hand) && createdRoom.hand.length) {
            game.battleManager.startBattle('easy', {
              online: true,
              roomId: roomId,
              isHost: true,
              roomData: { seedWords: createdRoom.seedWords, hand: createdRoom.hand }
            });
          }
          // 创建房间后立即启动轮询，确保好友加入后能第一时间检测到
          // 注意必须在 startBattle 之后启动（startBattle 会清空 _battleRoomPollTimer）
          startFriendRoomPolling(roomId);
          if (game._battleModeSelectPopup) {
            game._battleModeSelectPopup.mode = 'friend_room';
            game._battleModeSelectPopup.title = '对战房间已创建';
            game._battleModeSelectPopup.roomId = roomId;
            game._battleModeSelectPopup.sharePressed = false;
            game._battleModeSelectPopup.cancelPressed = false;
            game._battleModeSelectPopup.startTime = Date.now();
          }
        } else {
          console.error('[battleRoom] 创建失败:', res.result);
          game.hintToast = { text: '创建房间失败，请重试', expireAt: Date.now() + 2000 };
          if (game._battleModeSelectPopup) {
            game._battleModeSelectPopup.mode = 'select';
            game._battleModeSelectPopup.title = '对战模式';
            game._battleModeSelectPopup.startTime = Date.now();
          }
        }
      },
      fail: (err) => {
        console.error('[battleRoom] 调用失败:', err);
        game.hintToast = { text: '创建房间失败，请重试', expireAt: Date.now() + 2000 };
        if (game._battleModeSelectPopup) {
          game._battleModeSelectPopup.mode = 'select';
          game._battleModeSelectPopup.title = '对战模式';
          game._battleModeSelectPopup.startTime = Date.now();
        }
      }
    });
  }

  function shareBattleRoom(roomId) {
    wx.shareAppMessage({
      title: '快来和我进行一场单词对战！',
      query: `roomId=${roomId}`
    });
  }

  function startOnlineBattleMatch() {
    if (game && game.battleManager) {
      game.battleManager.startBattle('easy');
      game.battleManager.startMatchAnim();
    }
    if (game) game._battleModeSelectPopup = null;
  }

  function startFriendBattle() {
    if (game && game.battleManager) {
      game.battleManager.startBattle('easy', { online: true, roomId: game._battleRoomId, isHost: true });
    }
    if (game) game._battleRoomPopup = null;
  }

  function joinFriendBattle(roomId) {
    cloudStorage.log('[AutoJoin] joinFriendBattle 开始 roomId=' + roomId);
    // 防止云函数调用长时间无回调导致 _autoJoiningBattle 永久锁定
    if (game._autoJoinBattleTimer) {
      clearTimeout(game._autoJoinBattleTimer);
      game._autoJoinBattleTimer = null;
    }
    game._autoJoinBattleTimer = setTimeout(() => {
      if (game._autoJoiningBattle) {
        cloudStorage.log('[AutoJoin] joinFriendBattle 10s 超时，解除锁定并重试');
        game._autoJoiningBattle = false;
        game.hintToast = { text: '加入房间超时，正在重试...', expireAt: Date.now() + 2000 };
      }
    }, 10000);

    wx.cloud.callFunction({
      name: 'battleJoin',
      data: { roomId },
      success: (res) => {
        if (game._autoJoinBattleTimer) {
          clearTimeout(game._autoJoinBattleTimer);
          game._autoJoinBattleTimer = null;
        }
        cloudStorage.log('[AutoJoin] battleJoin success: ' + JSON.stringify(res.result));
        if (res.result && res.result.code === 0) {
          const room = res.result.room || {};
          // 如果房间已经被关闭，说明房主已经退出，提示用户
          if (room.status === 'closed') {
            game._autoJoiningBattle = false;
            game._autoJoinBattleRoomId = null;
            game.hintToast = { text: '好友对战房间已关闭', expireAt: Date.now() + 3000 };
            cloudStorage.log('[AutoJoin] 房间已关闭，停止加入 roomId=' + roomId);
            return;
          }
          game._battleRoomId = roomId;
          game._pendingBattleRoomId = null;
          game._autoJoinBattleRoomId = null;
          game._autoJoiningBattle = false;
          game._friendBattleStarted = false;
          game._friendBattleLobbyUpdateTime = 0; // 新加入房间，重置 lobby 时间戳
          // 房间创建时已生成统一种子词/手牌，先存起来供 enterBattlePage 做背景预览，
          // 让好友在等待/倒计时阶段看到的字母牌区域就与房主一致；
          // 旧版房间没有预生成数据时置空，预览退化为本地随机手牌
          game._pendingFriendRoomData = (Array.isArray(room.seedWords) && room.seedWords.length &&
                                         Array.isArray(room.hand) && room.hand.length)
            ? { seedWords: room.seedWords, hand: room.hand }
            : null;
          const isHost = res.result.role === 'host';
          game._battleIsHost = isHost;
          cloudStorage.log('[AutoJoin] 加入房间成功 role=' + res.result.role + ' popup=' + (isHost ? 'friend_waiting' : 'friend_join_ready'));
          // 一加入房间就拿到对手 openid，提前加载头像/昵称/荣誉杯
          const opponentOpenId = isHost ? room.guest : room.host;
          if (opponentOpenId && game.battleManager) {
            game.battleManager._loadOnlineOpponent(opponentOpenId);
          }
          // 好友加入房间后：先自动翻页进入对战页，再在对战页上弹出准备确认弹窗
          // 避免在首页弹窗因homepage触摸拦截导致按钮无响应
          if (!isHost) {
            enterBattlePage();
            // 等翻页完成后再弹出好友对战弹窗，避免被 gameLoop pageFlipState.complete 覆盖
            game._pendingFriendJoinReadyPopup = {
              startTime: Date.now(),
              title: '好友对战',
              mode: 'friend_join_ready',
              roomId: roomId,
              cancelPressed: false,
              startPressed: false,
              closeBtnPressed: false,
              isHost: false
            };
          } else {
            game._battleModeSelectPopup = {
              startTime: Date.now(),
              title: '等待好友加入',
              mode: 'friend_waiting',
              roomId: roomId,
              cancelPressed: false,
              startPressed: false,
              closeBtnPressed: false,
              isHost: true
            };
          }
          // 双方都需要轮询房间状态（好友准备 / 倒计时结束 / 正式开始）
          startFriendRoomPolling(roomId);
        } else {
          cloudStorage.log('[AutoJoin] battleJoin 业务失败: ' + JSON.stringify(res.result));
          const msg = res.result && res.result.message ? res.result.message : '';
          // 房间已关闭或已开始等明确提示
          if (msg.includes('已开始') || msg.includes('已结束') || msg.includes('房间不存在')) {
            game.hintToast = { text: '好友对战房间已关闭', expireAt: Date.now() + 3000 };
          } else {
            game.hintToast = { text: '加入房间失败', expireAt: Date.now() + 2000 };
          }
          game._autoJoiningBattle = false;
        }
      },
      fail: (err) => {
        if (game._autoJoinBattleTimer) {
          clearTimeout(game._autoJoinBattleTimer);
          game._autoJoinBattleTimer = null;
        }
        cloudStorage.log('[AutoJoin] battleJoin fail: ' + (err && err.message ? err.message : String(err)));
        game.hintToast = { text: '加入房间失败', expireAt: Date.now() + 2000 };
        game._autoJoiningBattle = false;
      }
    });
  }

  // 重试加入好友对战房间，用于首次冷启动时预加载未完成或云函数未就绪的情况
  function tryAutoJoinFriendBattle() {
    if (!game._autoJoinBattleRoomId || game._autoJoiningBattle) {
      cloudStorage.log('[AutoJoin] tryAutoJoin 跳过，无 roomId 或正在加入');
      return;
    }
    game._autoJoiningBattle = true;
    const roomId = game._autoJoinBattleRoomId;
    game.hintToast = { text: '正在加入对战房间...', expireAt: Date.now() + 3000 };
    cloudStorage.log('[AutoJoin] tryAutoJoin 触发 roomId=' + roomId);
    try {
      joinFriendBattle(roomId);
    } catch (e) {
      cloudStorage.log('[AutoJoin] joinFriendBattle 异常: ' + (e && e.message ? e.message : String(e)));
      game._autoJoiningBattle = false;
      game.hintToast = { text: '加入房间失败，请重试', expireAt: Date.now() + 2000 };
    }
  }

  // 好友对战房间轮询（ lobby 阶段，检测到 playing 后正式进入对战）
  // 注意：lobby 轮询使用独立字段 _friendRoomPollTimer，与对局轮询 _battleRoomPollTimer 完全分离。
  // 历史上两者共用一个字段，重开时 stopFriendRoomPolling 经常清错定时器，
  // 导致 lobby 轮询存活进对局并重复触发 startBattleFromRoom（出牌状态被重置），这是重开后
  // 出牌状态不同步的根因。
  function startFriendRoomPolling(roomId) {
    if (game._friendRoomPollTimer) {
      clearInterval(game._friendRoomPollTimer);
      clearTimeout(game._friendRoomPollTimer);
    }
    game._friendRoomPollTimer = setInterval(() => {
      if (!game._battleRoomId) {
        clearInterval(game._friendRoomPollTimer);
        clearTimeout(game._friendRoomPollTimer);
        game._friendRoomPollTimer = null;
        return;
      }
      wx.cloud.callFunction({
        name: 'battleGet',
        data: { roomId: game._battleRoomId },
        success: (res) => {
          cloudStorage.log('[AutoJoin] battleGet poll: ' + JSON.stringify(res.result));
          if (res.result && res.result.code === 0) {
            applyFriendRoomState(res.result.room);
          }
        },
        fail: (err) => {
          cloudStorage.log('[AutoJoin] battleGet poll fail: ' + (err && err.message ? err.message : String(err)));
        }
      });
    }, 800); // 降低轮询间隔，减少好友准备/出牌状态同步延迟
  }

  function stopFriendRoomPolling() {
    if (game._friendRoomPollTimer) {
      clearInterval(game._friendRoomPollTimer);
      clearTimeout(game._friendRoomPollTimer);
      game._friendRoomPollTimer = null;
    }
  }

  function applyFriendRoomState(room) {
    if (!room || !game._battleRoomId) return;

    const roomUpdateTime = room.updateTime || 0;
    // 忽略比已处理房间状态更旧的 lobby 响应，防止重开/开局后的过期响应重复重置对战状态
    if (game._friendBattleLobbyUpdateTime && roomUpdateTime && roomUpdateTime <= game._friendBattleLobbyUpdateTime) {
      cloudStorage.log('[AutoJoin] applyFriendRoomState 忽略过期响应 roomId=' + game._battleRoomId + ' roomUpdateTime=' + roomUpdateTime + ' last=' + game._friendBattleLobbyUpdateTime);
      return;
    }
    // 记录本次处理的房间更新时间，后续旧响应用来过滤
    game._friendBattleLobbyUpdateTime = roomUpdateTime;

    // 好友房轮询已停止但对局进行中，说明是 stopFriendRoomPolling 之前已发出请求的残留响应，
    // 忽略它，避免重开/开局后被重复触发导致状态重置。
    // 注意 battle_end 阶段必须放行：对局轮询会把重开邀请转交这里处理，
    // 若此时拦截并把 _friendBattleLobbyUpdateTime 推进掉，受邀方将永远弹不出重开邀请弹窗。
    if (!game._friendRoomPollTimer && game._friendBattleStarted && game.battlePhase !== 'battle_end') {
      cloudStorage.log('[AutoJoin] applyFriendRoomState 忽略残留响应 roomId=' + game._battleRoomId);
      return;
    }

    const popup = game._battleModeSelectPopup;
    // 用房间字段计算当前用户 openid，避免 game.userid 未设置导致重开邀请身份判断错误
    const myOpenId = game._battleIsHost ? (room.host || '') : (room.guest || '');
    cloudStorage.log('[AutoJoin] applyFriendRoomState status=' + room.status + ' guest=' + (room.guest ? 'yes' : 'no') + ' guestReady=' + room.guestReady + ' host=' + game._battleIsHost + ' popup=' + (popup && popup.mode) + ' countdown=' + (!!game._friendBattleCountdown) + ' restart=' + (!!room.restartRequest));

    // 房主：轮询过程中一检测到好友加入，就提前加载对方头像/昵称/荣誉杯
    if (game._battleIsHost && room.guest && !game._battleOpponentOpenId && game.battleManager) {
      game._battleOpponentOpenId = room.guest;
      game.battleManager._loadOnlineOpponent(room.guest);
    }

    // 房间已被关闭（对方退出），弹出房间已结束提示或在首页提示
    if (room.status === 'closed') {
      stopFriendRoomPolling();
      cloudStorage.log('[AutoJoin] 检测到房间已关闭，对战结束');
      if (game.state === 'battle' && game.battleManager) {
        game.battleManager._showRoomClosedPopup();
      } else {
        game.hintToast = { text: '好友对战房间已关闭', expireAt: Date.now() + 3000 };
      }
      return;
    }

    // 处理重开邀请状态（status 可能是 playing/ready/waiting 等，只要有未接受的 restartRequest 就优先处理）
    if (room.restartRequest) {
      const req = room.restartRequest;
      // 对方已接受邀请且已准备：双方进入倒计时（房间已正式 playing 时交给下面的 playing 分支开局）
      if (req.accepted && room.status !== 'playing' && room.guestReady && !game._friendBattleCountdown) {
        cloudStorage.log('[AutoJoin] 重开邀请已接受，启动同步 countdown=' + (room.guestReadyAt || 'none'));
        startFriendBattleCountdown(room.guestReadyAt);
        return;
      }

      // 邀请尚未接受：根据身份显示对应弹窗，并关闭对战结束弹窗
      if (!req.accepted) {
        const isInviter = req.fromOpenId === myOpenId;
        const expectedMode = isInviter ? 'friend_restart_inviting' : 'friend_restart_invited';
        const expectedTitle = isInviter ? '正在邀请好友重开一局' : '好友邀请重开一局';
        if (!popup || popup.mode !== expectedMode) {
          game._battleModeSelectPopup = {
            mode: expectedMode,
            title: '重新挑战',
            roomId: game._battleRoomId,
            startTime: Date.now(),
            closing: false
          };
        }
        if (game.battlePhase === 'battle_end') {
          game.battlePhase = 'selecting';
          if (renderer) renderer.lastBattlePhase = null;
        }
        return;
      }
    }

    // 双方检测到 playing，正式开始对战
    if (room.status === 'playing') {
      // gameId 防护：这一局已经在本地开过时，直接跳过。
      // 重开流程中 lobby 轮询即便意外存活，读到本局 playing 也只会命中本分支并跳过，
      // 从机制上杜绝重复 startBattleFromRoom 把进行中的出牌状态整局重置。
      // （roomGameId 缺失说明云端是旧版函数，退化为原有行为，不影响兼容。）
      const roomGameId = room.gameId || 0;
      if (roomGameId && game._battleGameId && roomGameId === game._battleGameId &&
          game._friendBattleStarted && game.battleRound === (room.currentRound || 1)) {
        cloudStorage.log('[AutoJoin] applyFriendRoomState 本局已开局，跳过 playing 重复触发 gameId=' + roomGameId + ' round=' + game.battleRound);
        return;
      }
      stopFriendRoomPolling();
      // 立即上锁：防止 stopFriendRoomPolling 之前已发出请求的残留响应再次进入本分支，
      // 导致 startBattleFromRoom / startBattle 被重复调用。
      game._friendBattleStarted = true;
      if (popup) {
        popup.closing = true;
        popup.closeStartTime = Date.now();
      }
      startBattleFromRoom(room);
      return;
    }

    if (!popup) return;

    // 房主：检测到好友已准备，双方同步进入 3 秒倒计时
    if (game._battleIsHost && room.guestReady && !game._friendBattleCountdown) {
      cloudStorage.log('[AutoJoin] 房主检测到好友已准备，启动同步 countdown=' + (room.guestReadyAt || 'none'));
      startFriendBattleCountdown(room.guestReadyAt);
      return;
    }

    // 好友：检测到房主已经设置 playing 之前的状态迁移（防御性）
    // 如果房主已经点了开始但网络延迟，好友继续等待 playing 状态即可
  }

  function callBattleReady() {
    if (!game._battleRoomId) return;
    cloudStorage.log('[AutoJoin] callBattleReady roomId=' + game._battleRoomId + ' isHost=' + game._battleIsHost);
    // 只有好友需要通知云端；房主由轮询检测到 guestReady 后自动启动倒计时
    if (!game._battleIsHost) {
      cloudStorage.log('[AutoJoin] callBattleReady 以好友身份调用 battleReady roomId=' + game._battleRoomId);
      // 先立即切换到"已准备"等待状态，给用户即时反馈，避免云函数回调延迟时感觉"没反应"
      if (game._battleModeSelectPopup) {
        game._battleModeSelectPopup.mode = 'friend_join_wait';
        game._battleModeSelectPopup.title = '好友对战';
        game._battleModeSelectPopup.startTime = Date.now();
        game._battleModeSelectPopup.startPressed = false;
      }
      wx.cloud.callFunction({
        name: 'battleReady',
        data: { roomId: game._battleRoomId },
        success: (res) => {
          cloudStorage.log('[AutoJoin] battleReady success: ' + JSON.stringify(res.result));
          if (!res.result || res.result.code !== 0) {
            const msg = res.result && res.result.message ? res.result.message : '准备失败，请重试';
            cloudStorage.log('[AutoJoin] battleReady 业务失败: ' + msg + '，请检查 battleReady 云函数是否已部署');
            game.hintToast = { text: msg, expireAt: Date.now() + 2000 };
            game._friendBattleCountdown = null;
            if (game._battleModeSelectPopup) {
              game._battleModeSelectPopup.mode = 'friend_join_ready';
              game._battleModeSelectPopup.title = '好友对战';
              game._battleModeSelectPopup.startTime = Date.now();
              game._battleModeSelectPopup.startPressed = false;
            }
          } else if (res.result.room && res.result.room.guestReadyAt) {
            // 用云端返回的 guestReadyAt 作为统一起点，确保双方倒计时同步
            cloudStorage.log('[AutoJoin] battleReady 成功且返回 guestReadyAt，准备启动倒计时');
            startFriendBattleCountdown(res.result.room.guestReadyAt);
            cloudStorage.log('[AutoJoin] battleReady 倒计时启动完成 countdown=' + (!!game._friendBattleCountdown));
            // 兜底：如果倒计时已存在但弹窗仍停留在准备页，强制切到倒计时显示
            if (game._friendBattleCountdown && game._battleModeSelectPopup && game._battleModeSelectPopup.mode !== 'friend_countdown') {
              game._battleModeSelectPopup.mode = 'friend_countdown';
              game._battleModeSelectPopup.title = '对战即将开始';
              game._battleModeSelectPopup.startTime = Date.now();
              game._battleModeSelectPopup.startPressed = false;
              cloudStorage.log('[AutoJoin] battleReady 强制切到 countdown 弹窗');
            }
          } else {
            cloudStorage.log('[AutoJoin] battleReady 成功但未返回 guestReadyAt，不启动倒计时 res=' + JSON.stringify(res.result));
          }
        },
        fail: (err) => {
          const errMsg = err && err.message ? err.message : String(err);
          cloudStorage.log('[AutoJoin] battleReady fail: ' + errMsg + '，请检查 battleReady 云函数是否已部署');
          game.hintToast = { text: '准备失败，请重试', expireAt: Date.now() + 2000 };
          // 准备失败时重置倒计时，让用户可以再次点击
          game._friendBattleCountdown = null;
          if (game._battleModeSelectPopup) {
            game._battleModeSelectPopup.mode = 'friend_join_ready';
            game._battleModeSelectPopup.title = '好友对战';
            game._battleModeSelectPopup.startTime = Date.now();
            game._battleModeSelectPopup.startPressed = false;
          }
        }
      });
    }
  }

  // 好友对战：双方同步 3 秒倒计时，倒计时结束后正式进入对战
  // syncStartAt: 统一倒计时起点时间戳（毫秒），默认当前时间
  function startFriendBattleCountdown(syncStartAt) {
    cloudStorage.log('[AutoJoin] startFriendBattleCountdown 被调用 syncStartAt=' + syncStartAt + ' existing=' + (!!game._friendBattleCountdown));
    if (game._friendBattleCountdown) return;
    const now = Date.now();
    let startTime = syncStartAt || now;
    // 校正因设备时间差或网络延迟导致的时间戳异常：
    // 如果起始时间比当前时间晚（未来）或早超过一个倒计时周期，改用当前时间
    if (startTime > now || startTime < now - 5000) {
      cloudStorage.log('[AutoJoin] 倒计时时间戳异常，已校正: ' + startTime + ' -> ' + now);
      startTime = now;
    }
    cloudStorage.log('[AutoJoin] 启动好友对战同步倒计时 roomId=' + game._battleRoomId + ' isHost=' + game._battleIsHost + ' startTime=' + startTime);
    game._friendBattleCountdown = {
      startTime,
      duration: 3000,
      finished: false,
      _countdownSoundPlayed: false
    };
    if (game._battleModeSelectPopup) {
      game._battleModeSelectPopup.mode = 'friend_countdown';
      game._battleModeSelectPopup.title = '对战即将开始';
      game._battleModeSelectPopup.startTime = Date.now();
      game._battleModeSelectPopup.startPressed = false;
    }
  }

  // 好友对战倒计时 tick，由 gameLoop 调用
  function updateFriendBattleCountdown() {
    if (!game._friendBattleCountdown || game._friendBattleCountdown.finished) return;
    const elapsed = Date.now() - game._friendBattleCountdown.startTime;
    // 倒计时音效是完整音频，进入倒计时阶段只播放一次
    if (game.audioManager && !game._friendBattleCountdown._countdownSoundPlayed) {
      game.audioManager.play('battle_countdown');
      game._friendBattleCountdown._countdownSoundPlayed = true;
    }
    if (elapsed >= game._friendBattleCountdown.duration) {
      game._friendBattleCountdown.finished = true;
      cloudStorage.log('[AutoJoin] 好友对战倒计时结束 roomId=' + game._battleRoomId + ' isHost=' + game._battleIsHost);
      // 倒计时结束后由房主正式将房间状态改为 playing
      if (game._battleIsHost) {
        callBattleStart();
        // 房主调用 battleStart 后，等待轮询到 playing 状态再统一进入对战；
        // 此前若本地立即 startBattleFromRoom({ status: 'playing' }) 会拿不到
        // 云端生成的 seedWords/hand，导致房主用本地随机手牌，好友用云端手牌，双方不一致。
      }
      // 好友等待轮询到 playing 后由 applyFriendRoomState 进入对战
    }
  }

  function callBattleStart() {
    if (!game._battleRoomId) return;
    cloudStorage.log('[AutoJoin] callBattleStart roomId=' + game._battleRoomId);
    wx.cloud.callFunction({
      name: 'battleStart',
      data: { roomId: game._battleRoomId },
      success: (res) => {
        cloudStorage.log('[AutoJoin] callBattleStart success: ' + JSON.stringify(res.result));
        if (res.result && res.result.code === 0) {
          // 房间状态已变为 playing，轮询会处理进入对战
        } else {
          cloudStorage.log('[AutoJoin] callBattleStart 失败: ' + JSON.stringify(res.result));
          const msg = res.result && res.result.message ? res.result.message : '开始对战失败，请重试';
          game.hintToast = { text: msg, expireAt: Date.now() + 2000 };
        }
      },
      fail: (err) => {
        cloudStorage.log('[AutoJoin] callBattleStart fail: ' + (err && err.message ? err.message : String(err)));
        game.hintToast = { text: '开始对战失败，正在重试...', expireAt: Date.now() + 2000 };
        // 网络抖动时自动重试一次，避免双方卡在倒计时结束页面
        setTimeout(() => {
          if (game._battleRoomId && game._battleIsHost) {
            cloudStorage.log('[AutoJoin] callBattleStart 自动重试 roomId=' + game._battleRoomId);
            wx.cloud.callFunction({
              name: 'battleStart',
              data: { roomId: game._battleRoomId },
              success: (res2) => {
                cloudStorage.log('[AutoJoin] callBattleStart 重试成功: ' + JSON.stringify(res2.result));
              },
              fail: (err2) => {
                cloudStorage.log('[AutoJoin] callBattleStart 重试失败: ' + (err2 && err2.message ? err2.message : String(err2)));
                game.hintToast = { text: '开始对战失败，请重试', expireAt: Date.now() + 2000 };
              }
            });
          }
        }, 1000);
      }
    });
  }

  function startBattleFromRoom(room) {
    const roomId = game._battleRoomId;
    const isHost = game._battleIsHost;
    const roomRound = room.currentRound || 1;
    const roomUpdateTime = room.updateTime || 0;

    // 防御性跳过：如果已经启动到相同轮次且房间状态更旧，直接返回，避免残留响应重复重置对战状态
    // 注意：必须用 < 而不是 <=，因为 applyFriendRoomState 已经把 _friendBattleLobbyUpdateTime 设为当前响应的 updateTime，
    // 如果用 <= 会把当前这个正要开局的响应也跳过，导致 _startRound 不执行、双方手牌不一致。
    if (game._friendBattleStarted && game.battlePhase === 'selecting' && game.battleRound === roomRound && game._friendBattleLobbyUpdateTime && roomUpdateTime < game._friendBattleLobbyUpdateTime) {
      cloudStorage.log('[AutoJoin] startBattleFromRoom 已启动到相同轮次且响应更旧，跳过 roomId=' + roomId + ' roomUpdateTime=' + roomUpdateTime + ' last=' + game._friendBattleLobbyUpdateTime);
      return;
    }

    // 重开后的新一轮：房间 currentRound 回到 1 且本地已经玩过一轮，需要清空旧对战状态
    const isRestart = roomRound === 1 && game.battleRound > 1;
    if (isRestart) {
      cloudStorage.log('[AutoJoin] startBattleFromRoom 检测到房间重开，重置本地对战状态 roomId=' + roomId);
      if (game.battleManager) {
        game.battleManager._resetToSinglePlayer();
        // 保留房间关键信息（resetToSinglePlayer 会清掉）
        game._battleOnline = true;
        game._battleRoomId = roomId;
        game._battleIsHost = isHost;
      }
    }

    game._friendBattleStarted = true;
    cloudStorage.log('[AutoJoin] startBattleFromRoom roomId=' + roomId + ' isHost=' + isHost + ' state=' + game.state + ' restart=' + isRestart);
    // 埋点：好友对战正式开局（房主/好友双方都会走到这里；重开新局也计为新一场）
    reportEvent("battle_friend", {
      "userid": game.userid || ''
    });
    // 清理倒计时状态
    game._friendBattleCountdown = null;
    if (game.battleManager) {
      const roomData = room && room.seedWords && room.hand ? { seedWords: room.seedWords, hand: room.hand } : null;
      game.battleManager.startBattle('easy', { online: true, roomId, isHost, roomData, roomUpdateTime });
    }
    // 记录本次开局对应的房间更新时间，用于过滤 lobby 过期响应
    game._friendBattleLobbyUpdateTime = roomUpdateTime;
    // 记录本局局号：之后所有轮询响应/出牌同步都凭它识别并丢弃跨局数据
    game._battleGameId = room.gameId || 0;
    if (isHost) {
      // 房主已经在对战页，关闭弹窗即可
      game._battleModeSelectPopup = null;
      game.state = 'battle';
      game.battleMode = true;
    } else {
      // 好友需要翻页进入对战页；若已在对战页则直接关闭弹窗
      if (showHomepage || game.state !== 'battle') {
        enterBattlePage();
      } else {
        game._battleModeSelectPopup = null;
      }
    }
    if (game.battleManager) {
      game.battleManager.startRoomPolling();
    }
  }


// 触摸事件处理
wx.onTouchStart((e) => {
  const touch = e.touches[0];
  const x = touch.clientX;
  const y = touch.clientY;

  // homepage 触摸处理（预加载完成后展示；设置弹窗打开时不响应主页按钮；入场动画播放时不响应）
  // 排行榜/单词本弹窗打开时，homepage 不拦截触摸，让后续弹窗输入处理生效
  const settingsPopupOpen = game && game._settingsPopup && !game._closingSettings;
  const entryAnimPlaying = renderer._homepageEntryAnim &&
    (Date.now() - renderer._homepageEntryAnim.startTime) < 1200; // 按钮开始弹出后允许交互
  // 对战状态下 homepage 不应拦截触摸（防止翻页/匹配弹窗后 showHomepage 残留导致全屏无响应）
  // 头像昵称授权弹窗打开时也不拦截，避免误触主页按钮
  if (showHomepage && !(game && game.state === 'battle') && renderer.homepageBtnRects && !settingsPopupOpen && !entryAnimPlaying && !(game && game._showingRankPopup) && !(game && game._wordBookPopup) && !(game && game._dailyAchievementPopup) && !(game && game._goldenEntryPopup) && !(game && game._showingProfileAuthButton && !game._profileAuthCompleted)) {
    const hit = renderer.hitTest(x, y, renderer.homepageBtnRects);
    if (hit) {
      console.log('[Homepage] pressed:', hit.key);
      renderer._homepagePressedBtn = hit.key;
      touchStartPos = { x, y };
      longPressTriggered = false;
      if (hit.key === 'setting') {
        // 复用 top_icon 的按下行为（短按打开设置，长按打开调试面板）
        // 长按调试入口仅在非正式版本（开发版/体验版）开放，正式版禁用
        renderer._topIconPressAnim = { pressing: true, startTime: Date.now() };
        if (isDebugVersion()) {
          longPressTimer = setTimeout(() => {
            longPressTimer = null;
            longPressTriggered = true;
            renderer.debugMenuOpen = !renderer.debugMenuOpen;
          }, LONG_PRESS_DURATION);
        }
      }
      // 长按 battle 按钮也打开调试菜单（体验版排查好友对战问题用）
      if (hit.key === 'battle' && isDebugVersion()) {
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

  // 每日金词入口弹窗（主页弹窗，用原始 y 判定）
  if (game._goldenEntryPopup) {
    const popup = game._goldenEntryPopup;
    if (popup.closing) return;
    if (renderer.goldenEntryCloseRect && renderer.hitTest(x, y, [renderer.goldenEntryCloseRect])) {
      vibrate();
      game._goldenEntryClosePressed = true;
      return;
    }
    if (renderer.goldenEntryChallengeRect && renderer.hitTest(x, y, [renderer.goldenEntryChallengeRect])) {
      vibrate();
      // 今日挑战已结束（猜中/失败）：按钮变为分享，邀请好友一起竞猜神秘金词
      const bjToday = new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString().slice(0, 10);
      const gwSave = game.storageManager ? game.storageManager.getGoldenWord() : null;
      if (gwSave && gwSave.date === bjToday && gwSave.finished) {
        if (game.audioManager) game.audioManager.play('tap');
        const tries = gwSave.winTries || (gwSave.guesses || []).length;
        const shareTitle = gwSave.won
          ? `今日神秘金词我用了 ${tries} 次猜中！你能几次猜中？`
          : '今日的神秘金词我实在猜不出来了，你试试看！';
        wx.shareAppMessage({
          title: shareTitle,
          imageUrl: GOLDEN_SHARE_IMAGE_URL,
          imageUrlId: GOLDEN_SHARE_IMAGE_ID,
          query: 'from=golden_word'
        });
        return;
      }
      if (game.audioManager) game.audioManager.play('homepage_round_tap');
      game._goldenEntryPopup = null;
      // 异步备好数据（今日词/挑战进度/手牌）后翻页进入金词页
      game._startGoldenWord().then(ok => {
        if (ok) {
          pageFlipState = { startTime: Date.now(), duration: PAGE_FLIP_DURATION, targetState: 'daily_gold' };
        }
      }).catch(err => {
        console.error('startGoldenWord error:', err);
      });
      return;
    }
    // 点击面板外关闭
    if (renderer.goldenEntryPanelRect && !renderer.hitTest(x, y, [renderer.goldenEntryPanelRect])) {
      popup.closing = true;
      popup.closeStartTime = Date.now();
    }
    return;
  }

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

  // 检测 top_icon：短按返回主页，长按打开调试菜单（药水使用页面不响应）
  // 长按调试入口仅在非正式版本（开发版/体验版）开放，正式版禁用
  // 主页展示时不响应游戏内 top_icon：主页覆盖在 playing 画面上，drawHUD 残留的 topIconRect
  // 仍在左上角，若不排除会导致主页弹窗（设置/每日成就/单词本）打开时点击左上角穿透触发返回主页
  if (renderer.topIconRect && !showHomepage && !(game && game.state === 'potion')) {
    const iconHit = renderer.hitTest(x, inputY, [renderer.topIconRect]);
    if (iconHit) {
      longPressTriggered = false;
      renderer._topIconPressAnim = { pressing: true, startTime: Date.now() };
      if (isDebugVersion()) {
        longPressTimer = setTimeout(() => {
          longPressTimer = null;
          longPressTriggered = true;
          renderer.debugMenuOpen = !renderer.debugMenuOpen;
        }, LONG_PRESS_DURATION);
      }
      return; // 长按期间不触发其他交互（短按返回主页在 touchEnd 处理）
    }
  }

  // 主页长按 battle 按钮也打开调试菜单（体验版排查好友对战问题用）
  if (showHomepage && game && game.state !== 'battle' && isDebugVersion()) {
    const homepageBattleRect = renderer.homepageBtnRects && renderer.homepageBtnRects.find(r => r.key === 'battle');
    if (homepageBattleRect && renderer.hitTest(x, y, [homepageBattleRect])) {
      longPressTimer = setTimeout(() => {
        longPressTimer = null;
        longPressTriggered = true;
        renderer.debugMenuOpen = !renderer.debugMenuOpen;
      }, LONG_PRESS_DURATION);
      return;
    }
  }

  // 对战模式选择弹窗交互（优先）
  if (game._battleModeSelectPopup && !game._battleModeSelectPopup.closing) {
    const popup = game._battleModeSelectPopup;
    const mode = popup.mode || 'select';
    if (renderer.battleModeCloseRect && renderer.hitTest(x, y, [renderer.battleModeCloseRect])) {
      popup.closeBtnPressed = true;
      return;
    }
    if (mode === 'select') {
      const friendHit = renderer.battleModeFriendRect && renderer.hitTest(x, y, [renderer.battleModeFriendRect]);
      const onlineHit = renderer.battleModeOnlineRect && renderer.hitTest(x, y, [renderer.battleModeOnlineRect]);
      if (friendHit) {
        game._battleModeSelectPopup.friendPressed = true;
        return;
      }
      if (onlineHit) {
        game._battleModeSelectPopup.onlinePressed = true;
        return;
      }
    } else if (mode === 'friend_room' || mode === 'friend_waiting') {
      if (renderer.battleModeShareRect && renderer.hitTest(x, y, [renderer.battleModeShareRect])) {
        popup.sharePressed = true;
        console.log('[BattleMode] share pressed');
        return;
      }
      if (renderer.battleModeCancelRect && renderer.hitTest(x, y, [renderer.battleModeCancelRect])) {
        popup.cancelPressed = true;
        console.log('[BattleMode] cancel pressed');
        return;
      }
    } else if (mode === 'friend_ready' || mode === 'friend_join_ready' || mode === 'friend_join_wait' || mode === 'friend_restart_invited') {
      if (renderer.battleModeStartRect && renderer.hitTest(x, y, [renderer.battleModeStartRect])) {
        popup.startPressed = true;
        cloudStorage.log('[AutoJoin] touchStart 开始对战按钮被按下 mode=' + mode + ' roomId=' + game._battleRoomId);
        return;
      }
      if (renderer.battleModeCancelRect && renderer.hitTest(x, y, [renderer.battleModeCancelRect])) {
        popup.cancelPressed = true;
        return;
      }
    }
    return;
  }

  // 对战房间弹窗交互（优先）
  if (game._battleRoomPopup && !game._battleRoomPopup.closing) {
    const popup = game._battleRoomPopup;
    if (renderer.battleRoomStartRect && renderer.hitTest(x, y, [renderer.battleRoomStartRect])) {
      popup.startPressed = true;
      return;
    }
    if (renderer.battleRoomShareRect && renderer.hitTest(x, y, [renderer.battleRoomShareRect])) {
      popup.sharePressed = true;
      return;
    }
    if (renderer.battleRoomCancelRect && renderer.hitTest(x, y, [renderer.battleRoomCancelRect])) {
      popup.cancelPressed = true;
      return;
    }
    return;
  }

  // 加入好友对战确认弹窗交互（优先）
  if (game._battleJoinConfirmPopup && !game._battleJoinConfirmPopup.closing) {
    const popup = game._battleJoinConfirmPopup;
    if (renderer.battleRoomStartRect && renderer.hitTest(x, y, [renderer.battleRoomStartRect])) {
      popup.startPressed = true;
      return;
    }
    if (renderer.battleRoomCancelRect && renderer.hitTest(x, y, [renderer.battleRoomCancelRect])) {
      popup.cancelPressed = true;
      return;
    }
    return;
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

  // 每日成就弹窗交互（优先处理）
  if (game._dailyAchievementPopup && !game._dailyAchievementPopup.closing) {
    const daCloseHit = renderer.dailyAchievementCloseRect && renderer.hitTest(x, y, [renderer.dailyAchievementCloseRect]);
    const daContentHit = renderer.dailyAchievementContentRect && renderer.hitTest(x, y, [renderer.dailyAchievementContentRect]);
    const giftHit = renderer.dailyAchievementGiftRects && renderer.hitTest(x, y, renderer.dailyAchievementGiftRects);
    if (giftHit) {
      const daily = new DailyAchievements(game);
      const reward = daily.claim(giftHit.index);
      if (reward !== null) {
        game.gold = (game.gold || 0) + reward;
        game._dailyAchievementClaimAnim = { index: giftHit.index, startTime: Date.now() };
        if (game.audioManager) game.audioManager.play('round_win');

        // 首次领取奖励提示（每个用户只弹一次），使用通用 hintToast 模板
        // 定位在每日成就弹窗内部偏上位置，确保在弹窗里可见
        if (game.storageManager && !game.storageManager.get('daily_first_claim_toast_shown', false)) {
          const s = (renderer ? renderer.scale || 1 : 1) * 0.92; // 与每日成就弹窗缩小比例保持一致
          const popupH = 560 * s;
          const popupTop = (renderer ? renderer.H : 667) / 2 - popupH / 2;
          game.hintToast = {
            text: '金币奖励已到账，快去闯关吧！',
            expireAt: Date.now() + 3000,
            startTime: Date.now(),
            customY: popupTop + 70 * s
          };
          game.storageManager.set('daily_first_claim_toast_shown', true);
        }
      }
      return;
    }
    if (daCloseHit) {
      game._dailyAchievementClosePressed = true;
      return;
    }
    if (daContentHit) {
      game._dailyAchievementScrollState = 'dragging';
      game._dailyAchievementScrollVelocity = 0;
      game._dailyAchievementScrollDragStartY = game._dailyAchievementScrollY || 0;
      game._dailyAchievementScrollTouchStartY = y;
      game._dailyAchievementScrollLastTouchY = y;
      game._dailyAchievementScrollLastTime = Date.now();
      return;
    }
    // 点击弹窗外部关闭弹窗
    game._dailyAchievementPopup.closing = true;
    game._dailyAchievementPopup.closeStartTime = Date.now();
    if (game.audioManager) game.audioManager.play('tap');
    return;
  }

  // 单词本弹窗交互（优先处理）
  if (game._wordBookPopup && !game._closingWordBook) {
    const wbCloseHit = renderer.wordBookCloseRect && renderer.hitTest(x, y, [renderer.wordBookCloseRect]);
    const wbWordHeaderHit = renderer.wordBookWordHeaderRect && renderer.hitTest(x, y, [renderer.wordBookWordHeaderRect]);
    const wbCountHeaderHit = renderer.wordBookCountHeaderRect && renderer.hitTest(x, y, [renderer.wordBookCountHeaderRect]);
    const wbContentHit = renderer.wordBookContentRect && renderer.hitTest(x, y, [renderer.wordBookContentRect]);

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

  // 重新闯关二次确认弹窗交互（优先于设置弹窗）
  if (game._restartRoundConfirmPopup && !game._restartRoundConfirmPopup.closing) {
    const yesHit = renderer.restartRoundConfirmYesRect && renderer.hitTest(x, y, [renderer.restartRoundConfirmYesRect]);
    const noHit = renderer.restartRoundConfirmNoRect && renderer.hitTest(x, y, [renderer.restartRoundConfirmNoRect]);
    if (yesHit) {
      game._restartRoundConfirmPopup.yesPressed = true;
      return;
    }
    if (noHit) {
      game._restartRoundConfirmPopup.noPressed = true;
      return;
    }
    // 点击弹窗外区域直接取消
    game._restartRoundConfirmPopup.noPressed = true;
    return;
  }

  // 对战模式选择弹窗交互（优先）
  if (game._battleModeSelectPopup && !game._battleModeSelectPopup.closing) {
    const popup = game._battleModeSelectPopup;
    const mode = popup.mode || 'select';
    if (renderer.battleModeCloseRect && renderer.hitTest(x, y, [renderer.battleModeCloseRect])) {
      popup.closeBtnPressed = true;
      return;
    }
    if (mode === 'select') {
      const friendHit = renderer.battleModeFriendRect && renderer.hitTest(x, y, [renderer.battleModeFriendRect]);
      const onlineHit = renderer.battleModeOnlineRect && renderer.hitTest(x, y, [renderer.battleModeOnlineRect]);
      if (friendHit) {
        game._battleModeSelectPopup.friendPressed = true;
        return;
      }
      if (onlineHit) {
        game._battleModeSelectPopup.onlinePressed = true;
        return;
      }
    } else if (mode === 'friend_room' || mode === 'friend_waiting') {
      if (renderer.battleModeShareRect && renderer.hitTest(x, y, [renderer.battleModeShareRect])) {
        popup.sharePressed = true;
        console.log('[BattleMode] share pressed');
        return;
      }
      if (renderer.battleModeCancelRect && renderer.hitTest(x, y, [renderer.battleModeCancelRect])) {
        popup.cancelPressed = true;
        console.log('[BattleMode] cancel pressed');
        return;
      }
    } else if (mode === 'friend_ready' || mode === 'friend_join_ready' || mode === 'friend_join_wait' || mode === 'friend_restart_invited') {
      if (renderer.battleModeStartRect && renderer.hitTest(x, y, [renderer.battleModeStartRect])) {
        popup.startPressed = true;
        cloudStorage.log('[AutoJoin] touchStart 开始对战按钮被按下 mode=' + mode + ' roomId=' + game._battleRoomId);
        return;
      }
      if (renderer.battleModeCancelRect && renderer.hitTest(x, y, [renderer.battleModeCancelRect])) {
        popup.cancelPressed = true;
        return;
      }
    }
    return;
  }

  // 对战房间弹窗交互（优先）
  if (game._battleRoomPopup && !game._battleRoomPopup.closing) {
    const popup = game._battleRoomPopup;
    if (renderer.battleRoomStartRect && renderer.hitTest(x, y, [renderer.battleRoomStartRect])) {
      popup.startPressed = true;
      return;
    }
    if (renderer.battleRoomShareRect && renderer.hitTest(x, y, [renderer.battleRoomShareRect])) {
      popup.sharePressed = true;
      return;
    }
    if (renderer.battleRoomCancelRect && renderer.hitTest(x, y, [renderer.battleRoomCancelRect])) {
      popup.cancelPressed = true;
      return;
    }
    return;
  }

  // 加入好友对战确认弹窗交互（优先）
  if (game._battleJoinConfirmPopup && !game._battleJoinConfirmPopup.closing) {
    const popup = game._battleJoinConfirmPopup;
    if (renderer.battleRoomStartRect && renderer.hitTest(x, y, [renderer.battleRoomStartRect])) {
      popup.startPressed = true;
      return;
    }
    if (renderer.battleRoomCancelRect && renderer.hitTest(x, y, [renderer.battleRoomCancelRect])) {
      popup.cancelPressed = true;
      return;
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
    const restartRoundHit = renderer.settingsRestartRoundRect && renderer.hitTest(x, y, [renderer.settingsRestartRoundRect]);
    const feedbackHit = renderer.settingsFeedbackRect && renderer.hitTest(x, y, [renderer.settingsFeedbackRect]);

    // 反馈页按钮
    const feedbackBackHit = renderer.feedbackBackRect && renderer.hitTest(x, y, [renderer.feedbackBackRect]);
    const feedbackInputHit = renderer.feedbackInputRect && renderer.hitTest(x, y, [renderer.feedbackInputRect]);
    const feedbackSubmitHit = renderer.feedbackSubmitRect && renderer.hitTest(x, y, [renderer.feedbackSubmitRect]);

    if (soundHit) {
      game._settingsSoundPressed = true;
      return;
    }
    if (restartRoundHit) {
      game._settingsRestartRoundPressed = true;
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

  // 药水页面返回商店确认弹窗（优先拦截所有输入）
  if (game._potionBackConfirmPopup) {
    const cancelHit = renderer.potionBackConfirmCancelRect && renderer.hitTest(x, inputY, [renderer.potionBackConfirmCancelRect]);
    const okHit = renderer.potionBackConfirmOkRect && renderer.hitTest(x, inputY, [renderer.potionBackConfirmOkRect]);
    if (cancelHit) {
      game._potionBackConfirmCancelPressed = true;
      return;
    }
    if (okHit) {
      game._potionBackConfirmOkPressed = true;
      return;
    }
    // 点击弹窗外不关闭
    return;
  }

  // 药水页面左上角返回按钮（动画播放期间不响应，避免中断升级/洗涤/复制动画）
  const isPotionAnimating = !!(game._potionUpgrading || game._starlightWashAnim || game._replicateAnim || game._equalSplitAnim);
  // 吸星大法选择页有独立返回逻辑（handleInput 内处理，返回游戏且药水不消耗），
  // 此处跳过通用拦截，避免命中残留的 potionBackRect 误弹"卡槽已满"确认窗
  const isAbsorbStarsSelect = game.state === 'potion' && game.potionMode && game.potionMode.effect === 'absorb_stars';
  if (!isPotionAnimating && !isAbsorbStarsSelect && game.state === 'potion' && renderer.potionBackRect) {
    const potionBackHit = renderer.hitTest(x, inputY, [renderer.potionBackRect]);
    if (potionBackHit) {
      game._potionBackBtnPressed = true;
      return;
    }
  }

  handleInput(x, inputY, y);
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
  if (game._settingsRestartRoundPressed && renderer.settingsRestartRoundRect) {
    const hit = renderer.hitTest(touch.clientX, touch.clientY, [renderer.settingsRestartRoundRect]);
    if (!hit) game._settingsRestartRoundPressed = false;
  }
  if (game._restartRoundConfirmPopup && !game._restartRoundConfirmPopup.closing) {
    if (game._restartRoundConfirmPopup.yesPressed && renderer.restartRoundConfirmYesRect) {
      const hit = renderer.hitTest(touch.clientX, touch.clientY, [renderer.restartRoundConfirmYesRect]);
      if (!hit) game._restartRoundConfirmPopup.yesPressed = false;
    }
    if (game._restartRoundConfirmPopup.noPressed && renderer.restartRoundConfirmNoRect) {
      const hit = renderer.hitTest(touch.clientX, touch.clientY, [renderer.restartRoundConfirmNoRect]);
      if (!hit) game._restartRoundConfirmPopup.noPressed = false;
    }
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
  if (game._wordBookClosePressed && renderer.wordBookCloseRect) {
    const hit = renderer.hitTest(touch.clientX, touch.clientY, [renderer.wordBookCloseRect]);
    if (!hit) game._wordBookClosePressed = false;
  }

  // 移出金词入口弹窗关闭按钮区域时取消按下状态
  if (game._goldenEntryClosePressed && renderer.goldenEntryCloseRect) {
    const hit = renderer.hitTest(touch.clientX, touch.clientY, [renderer.goldenEntryCloseRect]);
    if (!hit) game._goldenEntryClosePressed = false;
  }

  // 移出对战 top_home 区域时取消长按
  if (game._battleTopHomePressed && renderer.battleRenderer && renderer.battleRenderer.battleTopHomeRect) {
    const hit = renderer.hitTest(touch.clientX, touch.clientY, [renderer.battleRenderer.battleTopHomeRect]);
    if (!hit) {
      game._battleTopHomePressed = false;
      if (longPressTimer) {
        clearTimeout(longPressTimer);
        longPressTimer = null;
      }
    }
  }

  // 移出药水页面返回按钮区域时取消按下
  if (game._potionBackBtnPressed && renderer.potionBackRect) {
    const hit = renderer.hitTest(touch.clientX, touch.clientY, [renderer.potionBackRect]);
    if (!hit) game._potionBackBtnPressed = false;
  }

  // 移出药水返回确认弹窗按钮区域时取消按下
  if (game._potionBackConfirmCancelPressed && renderer.potionBackConfirmCancelRect) {
    const hit = renderer.hitTest(touch.clientX, touch.clientY, [renderer.potionBackConfirmCancelRect]);
    if (!hit) game._potionBackConfirmCancelPressed = false;
  }
  if (game._potionBackConfirmOkPressed && renderer.potionBackConfirmOkRect) {
    const hit = renderer.hitTest(touch.clientX, touch.clientY, [renderer.potionBackConfirmOkRect]);
    if (!hit) game._potionBackConfirmOkPressed = false;
  }

  // 每日成就弹窗滚动
  if (game._dailyAchievementPopup && game._dailyAchievementScrollState === 'dragging') {
    const now = Date.now();
    const y = touch.clientY;
    const frameDelta = game._dailyAchievementScrollLastTouchY - y;
    const totalDelta = game._dailyAchievementScrollTouchStartY - y;
    const dt = now - game._dailyAchievementScrollLastTime;

    let targetY = game._dailyAchievementScrollDragStartY + totalDelta;

    const maxScroll = game._dailyAchievementMaxScroll || 0;
    const contentH = 300;
    if (targetY < 0) {
      const over = -targetY;
      targetY = -over * 0.55 * Math.pow(over / contentH, 0.35);
    } else if (maxScroll > 0 && targetY > maxScroll) {
      const over = targetY - maxScroll;
      targetY = maxScroll + over * 0.55 * Math.pow(over / contentH, 0.35);
    }

    game._dailyAchievementScrollY = targetY;

    if (dt > 0) {
      game._dailyAchievementScrollVelocity = frameDelta / dt;
    }

    game._dailyAchievementScrollLastTouchY = y;
    game._dailyAchievementScrollLastTime = now;
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
  if (game._settingsRestartRoundPressed && renderer.settingsRestartRoundRect) {
    const hit = renderer.hitTest(touch.clientX, touch.clientY, [renderer.settingsRestartRoundRect]);
    if (!hit) game._settingsRestartRoundPressed = false;
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
  if (game._absorbStarsBackPressed && renderer.absorbStarsBackRect) {
    const hit = renderer.hitTest(touch.clientX, touch.clientY, [renderer.absorbStarsBackRect]);
    if (!hit) game._absorbStarsBackPressed = false;
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
      if (btnKey === 'battle' && (!game || (game.round || 1) < 5)) {
        // 双人对战未解锁（回合数 < 5）：点击不进入对战页面，在两个大按钮上方弹出提示 toast
        if (game && game.audioManager) game.audioManager.play('tap');
        if (game) {
          const battleRect = renderer.homepageBtnRects && renderer.homepageBtnRects.find(r => r.key === 'battle');
          const toastH = 32 * renderer.scale;
          const customY = battleRect ? battleRect.y - toastH - 12 * renderer.scale : undefined;
          game.hintToast = { text: '闯关5回合后,即可解锁', expireAt: Date.now() + 2000, startTime: Date.now(), customY };
        }
      } else if (btnKey === 'round' || btnKey === 'battle') {
        // 首次点击"开始"：仅先持久化标记（冷启动后即显示"继续"）；
        // 本次会话的显示切换推迟到翻页完成、主页移出视野后再生效，避免点击瞬间主页大按钮突变
        if (btnKey === 'round' && game && !game._roundEntered && game.storageManager) {
          game.storageManager.saveRoundEntered(true);
        }
        if (game && game.audioManager) game.audioManager.play('homepage_round_tap');
        // 启动主页 → 游戏翻页过渡动画
        // 从金词页进入闯关/对战：先恢复进入金词前的单人页面状态（金词手牌独立，单人手牌未动）
        if (game && game.state === 'daily_gold') {
          const preGolden = game._preGoldenSoloState;
          game.state = (preGolden === 'shop' || preGolden === 'settlement') ? preGolden : 'playing';
          game._preGoldenSoloState = null;
        }
        // 闯关入口：若当前停留在可恢复的单人页面（商店/结算），"继续闯关"应回到原页面，
        // 而不是强制切到 playing（否则从商店回主页再继续会错误地回到出牌页）
        const targetState = btnKey === 'battle' ? 'battle'
          : (game && SOLO_RESUMABLE_STATES.indexOf(game.state) !== -1 ? game.state : 'playing');

        // 从对战入口进入时，若单人小女巫引导尚未完成，则直接结束并持久化，
        // 避免小女巫引导在对战页弹出（小女巫引导仅限单人回合游戏）
        if (btnKey === 'battle' && game && game.guidePhase >= 1 && game.guidePhase <= 4) {
          game.guidePhase = 5;
          game._guideExitStartTime = Date.now();
          if (game.audioManager) game.audioManager.stopSound('guide_type');
          if (game.storageManager) game.storageManager.saveGuidePhase(5);
        }

        const enterGame = () => {
          pageFlipState = { startTime: Date.now(), duration: PAGE_FLIP_DURATION, targetState };
          // 用户真正进入第一回合时才启动新手引导入场动画，避免预加载完成后在 homepage 等待过久导致动画被跳过
          if (btnKey === 'round' && game && game.guidePhase === 1) {
            game._guideOverlayStartTime = Date.now();
          }
        };

        // 双人对战：先启动翻页动画，翻页过程中并行下载 battle 云图片
        if (targetState === 'battle' && game && game.cloudStorage) {
          // 在翻页动画开始前就初始化对战默认值，确保翻页过程中能看到正确内容
          if (game.state !== 'battle') {
            game._preBattleSoloState = game.state;
          }
          game.state = 'battle';
          game.battleMode = true;
          game.battleRound = 1;
          game.battleTotalRounds = 10;
          game.battlePlayerScore = 0;
          game.battleBotScore = 0;
          game.battlePlayerRoundScores = [];
          game.battleBotRoundScores = [];
          game.battlePhase = 'selecting';
          game.battleSelected = [];
          game._battleMatchAnim = null;
          game._battleMatchFinished = false;
          game._battleOpponent = null;
          if (game.battleManager) game.battleManager.startBattle('easy');
          enterGame();
          game.cloudStorage.preloadBattleImages().then(() => {
            game.cloudStorage.injectBattleToRenderer(renderer);
          }).catch(err => {
            console.error('battle 图片预加载失败:', err);
          });
        } else {
          enterGame();
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
        showRankPopup('friend');
      } else if (btnKey === 'golden') {
        // 每日金词：先弹入口弹窗（月度日历 + 今日词长 + 挑战按钮），挑战按钮再翻页进入
        game._goldenEntryPopup = { startTime: Date.now() };
        // 预加载今日词，供弹窗展示词长
        game._ensureGoldenDailyWord().catch(err => {
          console.error('ensureGoldenDailyWord error:', err);
        });
        // 预加载对战图片（金词占位卡复用 battle_me_place / battle_me_word_bg 模板）
        if (game.cloudStorage) {
          game.cloudStorage.preloadBattleImages().then(() => {
            game.cloudStorage.injectBattleToRenderer(renderer);
          }).catch(err => {
            console.error('golden 占位卡图片预加载失败:', err);
          });
        }
      } else if (btnKey === 'study') {
        game._wordBookPopup = { startTime: Date.now() };
        game._wordBookScrollY = 0;
        game._wordBookScrollState = null;
      }
    }
    renderer._homepagePressedBtn = null;
  }

  if (!game) return;

  // 每日金词入口弹窗关闭按钮（按下态在 touchStart 记录，此处执行关闭，与单词本一致）
  if (game._goldenEntryClosePressed) {
    game._goldenEntryClosePressed = false;
    if (game._goldenEntryPopup && !game._goldenEntryPopup.closing) {
      game._goldenEntryPopup.closing = true;
      game._goldenEntryPopup.closeStartTime = Date.now();
      if (game.audioManager) game.audioManager.play('tap');
    }
  }


  // 辅助：药水页面返回商店，discard=true 表示槽位满时丢弃当前药水
  function returnPotionToShop(discard) {
    if (!discard && game.potionMode) {
      game.potions.push({ ...game.potionMode });
    }
    game.potionMode = null;
    game._randomUpgradePopup = null;
    game._potionSelectedLetter = null;
    game._starlightWashSelectedLetter = null;
    game._replicateSelectedLetters = [];
    game._equalSplitSelectedLetters = [];
    game.state = 'shop';
    if (game.storageManager) game.storageManager.saveProgress();
  }

  // 从游戏中道具栏进入的药水页：返回游戏进行页，药水放回原槽位
  function returnPotionToGame() {
    if (game.potionMode) {
      const potion = { ...game.potionMode };
      const idx = potion._potionIndex;
      delete potion._potionIndex;
      if (idx !== undefined && idx >= 0 && idx <= game.potions.length) {
        game.potions.splice(idx, 0, potion);
      } else {
        game.potions.push(potion);
      }
    }
    game.potionMode = null;
    game._randomUpgradePopup = null;
    game._potionSelectedLetter = null;
    game._starlightWashSelectedLetter = null;
    game._replicateSelectedLetters = [];
    game._equalSplitSelectedLetters = [];
    game._prePotionState = null;
    game.state = 'playing';
    if (game.storageManager) game.storageManager.saveProgress();
  }

  // top_icon 短按：返回主页（长按未触发时；主页展示/对战/药水状态不触发）
  if (!longPressTriggered && touchStartPos && renderer.topIconRect && !showHomepage && !(game && (game.state === 'battle' || game.state === 'potion'))) {
    const endInputY = getInputY(touchStartPos.x, touchStartPos.y);
    const iconHit = renderer.hitTest(touchStartPos.x, endInputY, [renderer.topIconRect]);
    if (iconHit) {
      showHomepage = true;
      renderer.homepageAnimStartTime = Date.now();
      renderer._homepageEntryAnim = null;
      if (game && game.audioManager) game.audioManager.play('tap');
    }
  }

  // 吸星大法选择页：返回按钮 -> 回到游戏进行页，药水不消耗
  if (game && game._absorbStarsBackPressed) {
    game._absorbStarsBackPressed = false;
    game.state = game._prePotionState || 'playing';
    game._prePotionState = null;
    game.potionMode = null;
    game._absorbStarsSelectedCardId = null;
    if (game.audioManager) game.audioManager.play('tap');
  }

  // 药水页面返回按钮：松开时若仍在按钮区域内，按来源返回（游戏中使用回游戏，商店使用回商店）
  if (game && game._potionBackBtnPressed) {
    game._potionBackBtnPressed = false;
    if (renderer.potionBackRect && touchStartPos && renderer.hitTest(touchStartPos.x, touchStartPos.y, [renderer.potionBackRect])) {
      if (game.audioManager) game.audioManager.play('tap');
      if (game._prePotionState === 'playing') {
        // 游戏中从道具栏使用的药水：进入时已腾出槽位，放回原位并返回游戏
        returnPotionToGame();
      } else if ((game.potions || []).length >= 2) {
        // 商店购买立即使用的药水：槽位满时弹出二次确认弹窗
        game._potionBackConfirmPopup = true;
        game._potionBackConfirmAnimStart = Date.now();
      } else {
        returnPotionToShop(false);
      }
    }
  }

  // 药水返回商店确认弹窗
  if (game && game._potionBackConfirmPopup) {
    if (game._potionBackConfirmCancelPressed) {
      game._potionBackConfirmCancelPressed = false;
      const hit = renderer.potionBackConfirmCancelRect && touchStartPos && renderer.hitTest(touchStartPos.x, touchStartPos.y, [renderer.potionBackConfirmCancelRect]);
      if (hit) {
        game._potionBackConfirmPopup = false;
        game._potionBackConfirmAnimStart = null;
        if (game.audioManager) game.audioManager.play('tap');
      }
    }
    if (game._potionBackConfirmOkPressed) {
      game._potionBackConfirmOkPressed = false;
      const hit = renderer.potionBackConfirmOkRect && touchStartPos && renderer.hitTest(touchStartPos.x, touchStartPos.y, [renderer.potionBackConfirmOkRect]);
      if (hit) {
        game._potionBackConfirmPopup = false;
        game._potionBackConfirmAnimStart = null;
        if (game.audioManager) game.audioManager.play('tap');
        returnPotionToShop(true); // 丢弃当前药水返回商店
      }
    }
  }

  // 对战模式 top_home 短按弹出确认弹窗（长按未触发时）
  if (!longPressTriggered && game && game._battleTopHomePressed && renderer.battleRenderer && renderer.battleRenderer.battleTopHomeRect) {
    const endInputY = getInputY(touchStartPos.x, touchStartPos.y);
    const homeHit = renderer.hitTest(touchStartPos.x, endInputY, [renderer.battleRenderer.battleTopHomeRect]);
    if (homeHit) {
      if (game.audioManager) game.audioManager.play('tap');
      game._battleHomeConfirmPopup = true;
      game._battleHomeConfirmAnimStart = Date.now();
    }
  }
  if (game) game._battleTopHomePressed = false;
  if (longPressTimer) {
    clearTimeout(longPressTimer);
    longPressTimer = null;
  }
  longPressTriggered = false;

  // 每日成就弹窗交互处理（松开时）
  if (game._dailyAchievementPopup) {
    if (game._dailyAchievementScrollState === 'dragging') {
      game._dailyAchievementScrollState = 'idle';
      const maxScroll = game._dailyAchievementMaxScroll || 0;
      if (game._dailyAchievementScrollY < 0) {
        game._dailyAchievementScrollState = 'bounce';
        game._dailyAchievementScrollBounceTarget = 0;
        game._dailyAchievementScrollBounceStartY = game._dailyAchievementScrollY;
        game._dailyAchievementScrollBounceStartTime = Date.now();
      } else if (maxScroll > 0 && game._dailyAchievementScrollY > maxScroll) {
        game._dailyAchievementScrollState = 'bounce';
        game._dailyAchievementScrollBounceTarget = maxScroll;
        game._dailyAchievementScrollBounceStartY = game._dailyAchievementScrollY;
        game._dailyAchievementScrollBounceStartTime = Date.now();
      } else if (Math.abs(game._dailyAchievementScrollVelocity) > 0.5) {
        game._dailyAchievementScrollState = 'inertia';
      } else {
        game._dailyAchievementScrollVelocity = 0;
      }
    }
  }

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

  // 每日成就弹窗关闭
  if (game._dailyAchievementClosePressed) {
    game._dailyAchievementClosePressed = false;
    const hit = renderer.dailyAchievementCloseRect && renderer.hitTest(touchStartPos.x, touchStartPos.y, [renderer.dailyAchievementCloseRect]);
    if (hit && game._dailyAchievementPopup) {
      game._dailyAchievementPopup.closing = true;
      game._dailyAchievementPopup.closeStartTime = Date.now();
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
        // 延迟 80ms 让按钮恢复后再拉起分享（配图为 MP 后台过审的自定义转发图片）
        game._delay(() => {
          game._tipHelpShareDelaying = false;
          wx.shareAppMessage({
            title: `🎯 我在女巫的词牌里遇到困难了，快来帮我想想！`,
            imageUrl: 'https://mmocgame.qpic.cn/wechatgame/QGtiasOFjAqtZG81lsaJYgmQWp2XwsTlWsQ5rn7OejoJgUfEA7kC6QNBvgvJibKRwN/0',
            imageUrlId: 'l0LnuKJhQpKbDY0j26N5Gw==',
            query: `from=tip_help&round=${game.round}`
          });
          shareTipHelpState = { startTime: Date.now(), resolving: true };
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

    if (game._settingsFeedbackPressed) {
      game._settingsFeedbackPressed = false;
      game._feedbackPage = 'feedback';
      if (game.audioManager) game.audioManager.play('tap');
    }

    if (game._settingsRestartRoundPressed) {
      game._settingsRestartRoundPressed = false;
      game._restartRoundConfirmPopup = { startTime: Date.now(), yesPressed: false, noPressed: false };
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

  // 重新闯关二次确认弹窗松开处理
  if (game._restartRoundConfirmPopup && !game._restartRoundConfirmPopup.closing) {
    const popup = game._restartRoundConfirmPopup;
    if (popup.yesPressed) {
      popup.yesPressed = false;
      popup.closing = true;
      popup.closeStartTime = Date.now();
      // 执行重置
      if (game.storageManager) {
        game.storageManager.clearProgress();
      }
      // 关闭设置弹窗
      game._closingSettings = true;
      game._closeSettingsStartTime = Date.now();
      // 创建新游戏实例并切换
      const newGame = new Game();
      newGame.cloudStorage = cloudStorage;
      newGame.renderer = renderer;
      newGame.initAudio();
      if (newGame.audioManager) {
        newGame.audioManager.loadFromCloud(cloudStorage);
        newGame.audioManager.tryStartBGM();
      }
      // 重新闯关后主页大按钮恢复为"开始闯关"
      newGame._roundEntered = false;
      // 重新加载每日成就（进度与领取状态保留）
      new DailyAchievements(newGame, true);
      wx.game = newGame;
      game = newGame;
      if (game.audioManager) game.audioManager.play('tap');
      // 触发主页显示
      game._returnToHomepage = true;
    } else if (popup.noPressed) {
      popup.noPressed = false;
      popup.closing = true;
      popup.closeStartTime = Date.now();
      if (game.audioManager) game.audioManager.play('tap');
    }
  }

  // 对战模式选择弹窗交互（优先）
  if (game._battleModeSelectPopup && !game._battleModeSelectPopup.closing) {
    const popup = game._battleModeSelectPopup;
    const mode = popup.mode || 'select';
    if (popup.closeBtnPressed) {
      popup.closeBtnPressed = false;
      popup.closing = true;
      popup.closeStartTime = Date.now();
      if (game.audioManager) game.audioManager.play('tap');
      stopFriendRoomPolling();
      // 只要是在联网对战房间里（包括 waiting/ready/playing），关闭弹窗都先关闭房间
      if (game._battleRoomId && game.battleManager) {
        game.battleManager.closeRoomAndReturnHomepage();
      } else if (game.state === 'battle') {
        game.returnToHomepage();
      }
    } else if (mode === 'select') {
      if (popup.friendPressed) {
        popup.friendPressed = false;
        popup.mode = 'friend_loading';
        popup.title = '对战房间创建中';
        popup.startTime = Date.now();
        if (game.audioManager) game.audioManager.play('tap');
        createBattleRoom();
      } else if (popup.onlinePressed) {
        popup.onlinePressed = false;
        popup.closing = true;
        popup.closeStartTime = Date.now();
        if (game.audioManager) game.audioManager.play('tap');
        startOnlineBattleMatch();
      }
    } else if (mode === 'friend_room') {
      if (popup.sharePressed) {
        popup.sharePressed = false;
        if (game.audioManager) game.audioManager.play('tap');
        shareBattleRoom(popup.roomId);
        popup.mode = 'friend_waiting';
        popup.title = '等待好友加入';
        popup.startTime = Date.now();
        popup.startPressed = false;
        startFriendRoomPolling(popup.roomId);
      } else if (popup.cancelPressed) {
        // friend_room 模式已去掉取消按钮，此处为防御性兜底：点取消等同关闭弹窗，关闭房间
        popup.cancelPressed = false;
        popup.closing = true;
        popup.closeStartTime = Date.now();
        if (game.audioManager) game.audioManager.play('tap');
        stopFriendRoomPolling();
        if (game._battleRoomId && game.battleManager) {
          game.battleManager.closeRoomAndReturnHomepage();
        } else {
          console.log('[BattleMode] friend_room cancel action');
        }
      }
    } else if (mode === 'friend_waiting') {
      if (popup.cancelPressed) {
        popup.cancelPressed = false;
        popup.closing = true;
        popup.closeStartTime = Date.now();
        if (game.audioManager) game.audioManager.play('tap');
        stopFriendRoomPolling();
        // 房主在等待阶段取消，关闭房间再返回首页
        if (game._battleRoomId && game.battleManager) {
          game.battleManager.closeRoomAndReturnHomepage();
        } else {
          console.log('[BattleMode] friend_waiting cancel action');
        }
      }
    } else if (mode === 'friend_ready') {
      if (popup.startPressed) {
        popup.startPressed = false;
        if (game.audioManager) game.audioManager.play('tap');
        callBattleReady();
      } else if (popup.cancelPressed) {
        popup.cancelPressed = false;
        popup.closing = true;
        popup.closeStartTime = Date.now();
        if (game.audioManager) game.audioManager.play('tap');
        stopFriendRoomPolling();
        if (game._battleRoomId && game.battleManager) {
          game.battleManager.closeRoomAndReturnHomepage();
        }
      }
    } else if (mode === 'friend_join_ready') {
      if (popup.startPressed) {
        popup.startPressed = false;
        if (game.audioManager) game.audioManager.play('tap');
        cloudStorage.log('[AutoJoin] friend_join_ready 点击开始对战 roomId=' + game._battleRoomId);
        callBattleReady();
      } else if (popup.cancelPressed) {
        popup.cancelPressed = false;
        popup.closing = true;
        popup.closeStartTime = Date.now();
        if (game.audioManager) game.audioManager.play('tap');
        if (game._battleRoomId && game.battleManager) {
          game.battleManager.closeRoomAndReturnHomepage();
        }
      }
    } else if (mode === 'friend_join_wait') {
      if (popup.cancelPressed) {
        popup.cancelPressed = false;
        popup.closing = true;
        popup.closeStartTime = Date.now();
        if (game.audioManager) game.audioManager.play('tap');
        stopFriendRoomPolling();
        if (game._battleRoomId && game.battleManager) {
          game.battleManager.closeRoomAndReturnHomepage();
        }
      }
    } else if (mode === 'friend_restart_invited') {
      if (popup.startPressed) {
        popup.startPressed = false;
        if (game.audioManager) game.audioManager.play('tap');
        cloudStorage.log('[AutoJoin] friend_restart_invited 点击开始对战 roomId=' + game._battleRoomId);
        if (game.battleManager) {
          game.battleManager.acceptRestart();
        }
      }
    }
  }

  // 对战房间弹窗交互（松开时）
  if (game._battleRoomPopup && !game._battleRoomPopup.closing) {
    const popup = game._battleRoomPopup;
    if (popup.startPressed) {
      popup.startPressed = false;
      popup.closing = true;
      popup.closeStartTime = Date.now();
      if (game.audioManager) game.audioManager.play('tap');
      startFriendBattle();
    } else if (popup.sharePressed) {
      popup.sharePressed = false;
      if (game.audioManager) game.audioManager.play('tap');
      shareBattleRoom(popup.roomId);
      popup.showShare = false;
      popup.showWaiting = true;
      popup.title = '等待好友加入';
      popup.hint = '房间号: ' + popup.roomId;
    } else if (popup.cancelPressed) {
      popup.cancelPressed = false;
      popup.closing = true;
      popup.closeStartTime = Date.now();
      if (game.audioManager) game.audioManager.play('tap');
    }
  }

  // 对战模式选择弹窗交互（优先）
  if (game._battleModeSelectPopup && !game._battleModeSelectPopup.closing) {
    const popup = game._battleModeSelectPopup;
    const mode = popup.mode || 'select';
    if (popup.closeBtnPressed) {
      popup.closeBtnPressed = false;
      popup.closing = true;
      popup.closeStartTime = Date.now();
      if (game.audioManager) game.audioManager.play('tap');
      stopFriendRoomPolling();
      // 只要是在联网对战房间里（包括 waiting/ready/playing），关闭弹窗都先关闭房间
      if (game._battleRoomId && game.battleManager) {
        game.battleManager.closeRoomAndReturnHomepage();
      } else if (game.state === 'battle') {
        game.returnToHomepage();
      }
    } else if (mode === 'select') {
      if (popup.friendPressed) {
        popup.friendPressed = false;
        popup.mode = 'friend_loading';
        popup.title = '对战房间创建中';
        popup.startTime = Date.now();
        if (game.audioManager) game.audioManager.play('tap');
        createBattleRoom();
      } else if (popup.onlinePressed) {
        popup.onlinePressed = false;
        popup.closing = true;
        popup.closeStartTime = Date.now();
        if (game.audioManager) game.audioManager.play('tap');
        startOnlineBattleMatch();
      }
    } else if (mode === 'friend_room') {
      if (popup.sharePressed) {
        popup.sharePressed = false;
        if (game.audioManager) game.audioManager.play('tap');
        shareBattleRoom(popup.roomId);
        popup.mode = 'friend_waiting';
        popup.title = '等待好友加入';
        popup.startTime = Date.now();
        popup.startPressed = false;
        startFriendRoomPolling(popup.roomId);
      } else if (popup.cancelPressed) {
        // friend_room 模式已去掉取消按钮，此处为防御性兜底：点取消等同关闭弹窗，关闭房间
        popup.cancelPressed = false;
        popup.closing = true;
        popup.closeStartTime = Date.now();
        if (game.audioManager) game.audioManager.play('tap');
        stopFriendRoomPolling();
        if (game._battleRoomId && game.battleManager) {
          game.battleManager.closeRoomAndReturnHomepage();
        } else {
          console.log('[BattleMode] friend_room cancel action');
        }
      }
    } else if (mode === 'friend_waiting') {
      if (popup.cancelPressed) {
        popup.cancelPressed = false;
        popup.closing = true;
        popup.closeStartTime = Date.now();
        if (game.audioManager) game.audioManager.play('tap');
        stopFriendRoomPolling();
        // 房主在等待阶段取消，关闭房间再返回首页
        if (game._battleRoomId && game.battleManager) {
          game.battleManager.closeRoomAndReturnHomepage();
        } else {
          console.log('[BattleMode] friend_waiting cancel action');
        }
      }
    } else if (mode === 'friend_ready') {
      if (popup.startPressed) {
        popup.startPressed = false;
        if (game.audioManager) game.audioManager.play('tap');
        callBattleReady();
      } else if (popup.cancelPressed) {
        popup.cancelPressed = false;
        popup.closing = true;
        popup.closeStartTime = Date.now();
        if (game.audioManager) game.audioManager.play('tap');
        stopFriendRoomPolling();
        if (game._battleRoomId && game.battleManager) {
          game.battleManager.closeRoomAndReturnHomepage();
        }
      }
    } else if (mode === 'friend_join_ready') {
      if (popup.startPressed) {
        popup.startPressed = false;
        if (game.audioManager) game.audioManager.play('tap');
        cloudStorage.log('[AutoJoin] friend_join_ready 点击开始对战 roomId=' + game._battleRoomId);
        callBattleReady();
      } else if (popup.cancelPressed) {
        popup.cancelPressed = false;
        popup.closing = true;
        popup.closeStartTime = Date.now();
        if (game.audioManager) game.audioManager.play('tap');
        if (game._battleRoomId && game.battleManager) {
          game.battleManager.closeRoomAndReturnHomepage();
        }
      }
    } else if (mode === 'friend_join_wait') {
      if (popup.cancelPressed) {
        popup.cancelPressed = false;
        popup.closing = true;
        popup.closeStartTime = Date.now();
        if (game.audioManager) game.audioManager.play('tap');
        stopFriendRoomPolling();
        if (game._battleRoomId && game.battleManager) {
          game.battleManager.closeRoomAndReturnHomepage();
        }
      }
    } else if (mode === 'friend_restart_invited') {
      if (popup.startPressed) {
        popup.startPressed = false;
        if (game.audioManager) game.audioManager.play('tap');
        cloudStorage.log('[AutoJoin] friend_restart_invited 点击开始对战 roomId=' + game._battleRoomId);
        if (game.battleManager) {
          game.battleManager.acceptRestart();
        }
      }
    }
  }

  // 对战房间弹窗交互（松开时）
  if (game._battleRoomPopup && !game._battleRoomPopup.closing) {
    const popup = game._battleRoomPopup;
    if (popup.startPressed) {
      popup.startPressed = false;
      popup.closing = true;
      popup.closeStartTime = Date.now();
      if (game.audioManager) game.audioManager.play('tap');
      startFriendBattle();
    } else if (popup.sharePressed) {
      popup.sharePressed = false;
      if (game.audioManager) game.audioManager.play('tap');
      shareBattleRoom(popup.roomId);
      popup.showShare = false;
      popup.showWaiting = true;
      popup.title = '等待好友加入';
      popup.hint = '房间号: ' + popup.roomId;
    } else if (popup.cancelPressed) {
      popup.cancelPressed = false;
      popup.closing = true;
      popup.closeStartTime = Date.now();
      if (game.audioManager) game.audioManager.play('tap');
    }
  }

  // 加入好友对战确认弹窗交互
  if (game._battleJoinConfirmPopup && !game._battleJoinConfirmPopup.closing) {
    const popup = game._battleJoinConfirmPopup;
    if (popup.startPressed) {
      popup.startPressed = false;
      popup.closing = true;
      popup.closeStartTime = Date.now();
      if (game.audioManager) game.audioManager.play('tap');
      joinFriendBattle(popup.roomId);
    } else if (popup.cancelPressed) {
      popup.cancelPressed = false;
      popup.closing = true;
      popup.closeStartTime = Date.now();
      if (game.audioManager) game.audioManager.play('tap');
      game._pendingBattleRoomId = null;
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
      game._potionDetailPopup = null;
      game._witchEmptyPopup = null;
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

// 游戏进行页使用魔法药水（道具栏点击 → 详情弹窗「使用」触发）
function usePotionInGame(potionIndex) {
  const potion = game.potions[potionIndex];
  if (!potion) return;
  // 本回合被禁用的药水牌无法使用
  if (potion._disabled) {
    game.hintToast = { text: '女巫约束：本回合禁用魔法药水牌', expireAt: Date.now() + 2000, startTime: Date.now() };
    return;
  }
  // 字母置换药水：游戏中直接使用，弹出选择弹窗
  if (potion.effect === 'change_letter') {
    const selectedCards = game.getSelectedCards();
    if (selectedCards.length !== 1) {
      game._changeLetterHint = { potionIndex, startTime: Date.now() };
      return;
    }
    game._changeLetterPopup = {
      potionIndex,
      cardId: selectedCards[0].id,
      originalLetter: selectedCards[0].letter,
      targetLetter: null,
      startTime: Date.now(),
    };
    return;
  }
  // 吸星大法：进入专属选择页，挑选目标手牌后点击确定
  if (potion.effect === 'absorb_stars') {
    game.potionMode = { ...potion, _potionIndex: potionIndex };
    game._prePotionState = 'playing';
    game._absorbStarsSelectedCardId = game.selected && game.selected[0] ? game.selected[0] : null;
    game.state = 'potion';
    if (game.storageManager) game.storageManager.saveProgress();
    return;
  }
  // 其他药水：从道具栏移除后进入 potion 状态（记下原槽位，返回时放回原位）
  game.potions.splice(potionIndex, 1);
  game.potionMode = { ...potion, _potionIndex: potionIndex };
  game._prePotionState = 'playing';
  game.state = 'potion';
  if (game.storageManager) game.storageManager.saveProgress();
}

function handleInput(x, inputY, rawY) {
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

  // 新手引导阶段：优先处理引导点击，禁用其他交互（对战/金词模式不受引导阶段限制）
  if (game.state !== 'battle' && game.state !== 'daily_gold' && game.guidePhase >= 1 && game.guidePhase <= 4) {
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

  // 新手引导退场后的「获得女巫牌」弹窗：只响应领取按钮，屏蔽其他交互
  if (game.state !== 'battle' && game.state !== 'daily_gold' && game.guidePhase === 5 && renderer.guideGiftClaimBtnRect) {
    const claimHit = renderer.hitTest(x, inputY, [renderer.guideGiftClaimBtnRect]);
    if (claimHit) {
      vibrate();
      game.requestCloseGuideGift(); // 先播放退出动画，完成后自动结束引导
    }
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
      if (debugHit.action === 'debug_battleWin') {
        renderer.debugMenuOpen = false;
        if (game.state === 'battle') {
          game.battlePlayerScore = 100;
          game.battleBotScore = 50;
          game.battlePlayerRoundScores = [20, 30, 50];
          game.battleBotRoundScores = [10, 20, 20];
          game.battlePhase = 'battle_end';
        }
        return;
      }
      if (debugHit.action === 'debug_battleLose') {
        renderer.debugMenuOpen = false;
        if (game.state === 'battle') {
          game.battlePlayerScore = 50;
          game.battleBotScore = 100;
          game.battlePlayerRoundScores = [10, 20, 20];
          game.battleBotRoundScores = [20, 30, 50];
          game.battlePhase = 'battle_end';
        }
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
      if (debugHit.action === 'debug_upload_battle') {
        cloudStorage.uploadBattleImages().then(res => {
          game.hintToast = { text: `battle 上传完成：${res.success.length} 张成功`, expireAt: Date.now() + 2000 };
        }).catch(err => {
          game.hintToast = { text: 'battle 上传失败', expireAt: Date.now() + 2000 };
          console.error('battle 上传失败:', err);
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
        game._guideExitStartTime = null;
        game._guideGiftPopupStartTime = null;
        renderer.guideGiftClaimBtnRect = null;
        // 如果已有 has_vowel 女巫牌，先移除以避免重复
        const hasVowelIdx = game.jokers.findIndex(j => j && j.trigger === 'has_vowel');
        if (hasVowelIdx >= 0) game.jokers.splice(hasVowelIdx, 1);
        if (game.storageManager) game.storageManager.saveProgress();
        // 如果 guide 图片尚未下载（老用户触发引导时），补充下载并注入（两个阶段均用 witch_guide_1）
        cloudStorage.preloadGuideGroup(1, renderer).then(() => {
          cloudStorage.injectGuideToRenderer(renderer);
        });
      }
      if (debugHit.action === 'debug_triggerShopGuide') {
        game.shopGuidePhase = 1;
        game._shopGuideStartTime = Date.now();
        if (game.storageManager) game.storageManager.saveProgress();
        // 先检查本地是否已有缓存，避免重复下载
        const witch2 = renderer.guideImages.witch_2;
        const hasCache = witch2 && witch2.loaded;
        if (!hasCache) {
          cloudStorage.preloadGuideGroup(2, renderer).catch(err => {
            console.error('[Debug] 触发商店引导下载失败:', err);
          });
        } else {
          console.log('[Debug] witch_guide_2 本地缓存已存在，跳过下载');
        }
      }
      if (debugHit.action === 'debug_triggerCardBookGuide') {
        game.cardBookGuidePhase = 1;
        game._cardBookGuideStartTime = Date.now();
        game._cardBookGuideTextStartTime = Date.now();
        if (game.storageManager) game.storageManager.saveProgress();
        // 先检查本地是否已有缓存，避免重复下载
        const witch3 = renderer.guideImages.witch_3;
        const hasCache = witch3 && witch3.loaded;
        if (!hasCache) {
          cloudStorage.preloadGuideGroup(3, renderer).catch(err => {
            console.error('[Debug] 触发图鉴引导下载失败:', err);
          });
        } else {
          console.log('[Debug] witch_guide_3 本地缓存已存在，跳过下载');
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
      if (debugHit.action === 'debug_toggleCloudLog') {
        renderer.showCloudDebugLogs = !renderer.showCloudDebugLogs;
      }
      renderer.debugMenuOpen = false;
      return;
    }
  }
  
  // 卡牌图鉴弹窗打开时，只有点击面板外部才关闭；面板内部（含翻页按钮）不关闭
  if (game.cardBookOpen && !game._closingCardBook) {
    // 0. 大图模式（黑色蒙层）：点击任意位置关闭大图，回到图鉴网格
    if (game._cardBookDetailLevel && !game._closingCardBookDetail) {
      vibrate();
      if (game.audioManager) game.audioManager.play('tap');
      game._closingCardBookDetail = true;
      game._closeCardBookDetailStartTime = Date.now();
      game._cardBookCellPressed = null;
      return;
    }
    // 1. 检测 tab 切换按钮
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

  // 对战模式 top_home 长按打开调试面板（短按返回主页在 touchEnd 处理）
  // 仅在非正式版本（开发版/体验版）开放该调试入口，正式版禁用
  if (game.state === 'battle' && renderer.battleRenderer && renderer.battleRenderer.battleTopHomeRect) {
    const battle = renderer.battleRenderer;
    const homeHit = renderer.hitTest(x, inputY, [battle.battleTopHomeRect]);
    if (homeHit) {
      longPressTriggered = false;
      game._battleTopHomePressed = true;
      if (isDebugVersion()) {
        longPressTimer = setTimeout(() => {
          longPressTimer = null;
          longPressTriggered = true;
          renderer.debugMenuOpen = !renderer.debugMenuOpen;
        }, LONG_PRESS_DURATION);
      }
      return;
    }
  }

  // 对战模式输入处理（匹配弹窗显示期间禁用对战交互）
  if (game.state === 'battle' && game._battleMatchAnim && renderer.battleRenderer && renderer.battleRenderer.battleMatchCloseRect) {
    const closeHit = renderer.hitTest(x, inputY, [renderer.battleRenderer.battleMatchCloseRect]);
    if (closeHit) {
      vibrate();
      if (game.audioManager) game.audioManager.play('tap');
      game._battleMatchAnim = null;
      // 匹配弹窗关闭时若仍在线对战房间中，先关闭房间
      if (game._battleOnline && game._battleRoomId && game.battleManager) {
        game.battleManager.closeRoomAndReturnHomepage();
      } else {
        game.returnToHomepage();
      }
      return;
    }
  }

  if (game.state === 'battle' && !game._battleMatchAnim && handleBattleInput(game, renderer, x, inputY, vibrate)) {
    return;
  }

  // ===== 每日金词模式输入处理 =====
  if (game.state === 'daily_gold') {
    const gw = game.goldenWord;

    // 历史弹窗优先（弹窗不下移，用原始 y 判定）
    if (game._goldenHistoryPopup) {
      const popup = game._goldenHistoryPopup;
      if (popup.closing) return;
      if (renderer.goldenHistoryCloseRect && renderer.hitTest(x, rawY, [renderer.goldenHistoryCloseRect])) {
        vibrate();
        if (game.audioManager) game.audioManager.play('tap');
        popup.closing = true;
        popup.closeStartTime = Date.now();
        return;
      }
      // 点击面板外关闭
      if (renderer.goldenHistoryPanelRect && !renderer.hitTest(x, rawY, [renderer.goldenHistoryPanelRect])) {
        popup.closing = true;
        popup.closeStartTime = Date.now();
      }
      return;
    }

    // 结果弹窗（猜中可分享；失败仅返回主页）
    if (game._goldenResultPopup) {
      const popup = game._goldenResultPopup;
      if (popup.closing) return;
      // 弹窗延迟显示期间（占位卡翻开动画中）不响应任何点击
      if (Date.now() < popup.startTime) return;
      if (renderer.goldenShareBtnRect && renderer.hitTest(x, rawY, [renderer.goldenShareBtnRect])) {
        vibrate();
        if (game.audioManager) game.audioManager.play('tap');
        const tries = gw ? (gw.winTries || gw.guesses.length) : 0;
        // 分享文案不揭秘金词：猜中/失败两种场景
        const shareTitle = popup.won
          ? `今日神秘金词我用了 ${tries} 次猜中！你能几次猜中？`
          : '今日的神秘金词我实在猜不出来了，你试试看！';
        wx.shareAppMessage({
          title: shareTitle,
          imageUrl: GOLDEN_SHARE_IMAGE_URL,
          imageUrlId: GOLDEN_SHARE_IMAGE_ID,
          query: 'from=golden_word'
        });
        if (gw && !gw.shared) {
          gw.shared = true;
          if (game.storageManager) game.storageManager.saveGoldenWord(gw);
        }
        return;
      }
      if (renderer.goldenHomeBtnRect && renderer.hitTest(x, rawY, [renderer.goldenHomeBtnRect])) {
        vibrate();
        if (game.audioManager) game.audioManager.play('tap');
        game._goldenResultPopup = null;
        showHomepage = true;
        renderer.homepageAnimStartTime = Date.now();
        renderer._homepageEntryAnim = null;
        return;
      }
      return;
    }

    // 卡牌选择（校验中或已结束时禁用）
    if (!game._goldenChecking && !(gw && gw.finished)) {
      const cardHit = renderer.hitTest(x, inputY, renderer.cardRects);
      if (cardHit) {
        vibrate();
        game.toggleGoldenSelect(cardHit.cardId);
        return;
      }
    }

    // 出牌按钮
    if (renderer.goldenPlayBtnRect) {
      const btnHit = renderer.hitTest(x, inputY, [renderer.goldenPlayBtnRect]);
      if (btnHit) {
        vibrate();
        renderer.pressedBtn = 'golden_play';
        if (game.animManager) game.animManager.buttonPress(renderer.goldenPlayBtnRect);
        const selected = game.getGoldenSelectedCards();
        if (selected.length >= 2 && !game._goldenChecking && gw && !gw.finished) {
          game.playGoldenHand().catch(err => {
            console.error('playGoldenHand error:', err);
          });
        }
        return;
      }
    }

    // 历史按钮
    if (renderer.goldenHistoryBtnRect) {
      const btnHit = renderer.hitTest(x, inputY, [renderer.goldenHistoryBtnRect]);
      if (btnHit) {
        vibrate();
        renderer.pressedBtn = 'golden_history';
        if (game.animManager) game.animManager.buttonPress(renderer.goldenHistoryBtnRect);
        if (game.audioManager) game.audioManager.play('tap');
        game._goldenHistoryPopup = { startTime: Date.now() };
        return;
      }
    }

    // 清空选择按钮
    if (renderer.goldenResetBtnRect) {
      const btnHit = renderer.hitTest(x, inputY, [renderer.goldenResetBtnRect]);
      if (btnHit) {
        vibrate();
        renderer.pressedBtn = 'golden_reset';
        if (game.animManager) game.animManager.buttonPress(renderer.goldenResetBtnRect);
        if (game.audioManager) game.audioManager.play('card_placement');
        game.clearGoldenSelection();
        return;
      }
    }
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
              // 用该字母真实的当前分（base*mult + add），而非基础分；
              // 否则靠 add 强化（字母强化/平分秋色）的字母会被置换成基础分
              const base = LETTER_SCORE[popup.targetLetter];
              const upgrade = letterUpgrades.get(popup.targetLetter);
              let newScore = base;
              let upgraded = false;
              let upgradeMult = 1;
              let upgradeAdd = 0;
              if (upgrade) {
                if (upgrade.mult) newScore = Math.floor(newScore * upgrade.mult);
                if (upgrade.add) newScore += upgrade.add;
                upgraded = true;
                upgradeMult = upgrade.mult || 1;
                upgradeAdd = upgrade.add || 0;
              }
              card.baseScore = base;
              card.score = newScore;
              card.upgraded = upgraded;
              card.upgradeMult = upgradeMult;
              card.upgradeAdd = upgradeAdd;
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

    // 药水详情弹窗：「使用」按钮或点击外部关闭
    if (game._potionDetailPopup) {
      if (renderer._potionDetailUseBtnRect && renderer.hitTest(x, inputY, [renderer._potionDetailUseBtnRect])) {
        vibrate();
        if (game.audioManager) game.audioManager.play('tap');
        const useIdx = game._potionDetailPopup.potionIndex;
        game._potionDetailPopup = null;
        usePotionInGame(useIdx);
        return;
      }
      // 点到女巫牌/药水牌（含空槽位）：关闭本弹窗并继续响应道具点击
      const hitProp = (renderer.witchPropRects && renderer.hitTest(x, inputY, renderer.witchPropRects)) ||
        (renderer.potionPropRects && renderer.hitTest(x, inputY, renderer.potionPropRects));
      game._potionDetailPopup = null;
      if (!hitProp) return;
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
        // 空槽位：弹出「女巫牌」一句话说明弹窗
        if (witchHit.empty) {
          vibrate();
          if (game.audioManager) game.audioManager.play('tap');
          if (game._witchEmptyPopup) {
            game._witchEmptyPopup = null;
          } else {
            game._witchDetailPopup = null;
            game._witchEmptyPopup = { rect: witchHit, kind: 'witch', animStartTime: Date.now() };
          }
          return;
        }
        const joker = game.jokers[witchHit.jokerIndex];
        if (joker && joker._disabled) return;
        vibrate();
        if (game.audioManager) game.audioManager.play('tap');
        if (game._witchDetailPopup && game._witchDetailPopup.jokerIndex === witchHit.jokerIndex) {
          game._witchDetailPopup = null;
        } else {
          game._witchEmptyPopup = null;
          game._witchDetailPopup = { jokerIndex: witchHit.jokerIndex, animStartTime: Date.now() };
        }
        return;
      }
    }

    // 女巫牌升级按钮（占位，暂不响应；点击不关闭弹窗）
    if (game._witchDetailPopup && renderer._witchDetailUpgradeBtnRect) {
      const upHit = renderer.hitTest(x, inputY, [renderer._witchDetailUpgradeBtnRect]);
      if (upHit) {
        vibrate();
        return;
      }
    }

    // 点击弹窗外部关闭女巫详情弹窗 / HUD 女巫弹窗 / 空槽位说明弹窗
    // （点到女巫牌/药水牌时只关弹窗不吞点击，让道具点击继续响应）
    if (game._witchDetailPopup) {
      const hitProp = (renderer.witchPropRects && renderer.hitTest(x, inputY, renderer.witchPropRects)) ||
        (renderer.potionPropRects && renderer.hitTest(x, inputY, renderer.potionPropRects));
      game._witchDetailPopup = null;
      if (!hitProp) return;
    }
    if (game._witchEmptyPopup) {
      const hitProp = (renderer.witchPropRects && renderer.hitTest(x, inputY, renderer.witchPropRects)) ||
        (renderer.potionPropRects && renderer.hitTest(x, inputY, renderer.potionPropRects));
      game._witchEmptyPopup = null;
      if (!hitProp) return;
    }

    // 检测卡牌图鉴图标点击
    if (renderer.cardBookIconRect && game.cardBookUnlocked) {
      const cbHit = renderer.hitTest(x, inputY, [renderer.cardBookIconRect]);
      if (cbHit) {
        vibrate();
        if (game.audioManager) game.audioManager.play('tap');
        game.cardBookOpen = true;
        // 每次打开图鉴默认回到「全部」tab
        game._cardBookTab = 'all';
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
        // 空槽位：弹出「魔法药水」一句话说明弹窗（绿色边框）
        if (potionHit.empty) {
          vibrate();
          if (game.audioManager) game.audioManager.play('tap');
          if (game._witchEmptyPopup) {
            game._witchEmptyPopup = null;
          } else {
            game._witchDetailPopup = null;
            game._witchEmptyPopup = { rect: potionHit, kind: 'potion', animStartTime: Date.now() };
          }
          return;
        }
        const potion = game.potions[potionHit.potionIndex];
        if (!potion) return;
        // 本回合被禁用的药水牌无法使用
        if (potion._disabled) {
          game.hintToast = { text: '女巫约束：本回合禁用魔法药水牌', expireAt: Date.now() + 2000, startTime: Date.now() };
          return;
        }
        vibrate();
        if (game.audioManager) game.audioManager.play('tap');
        // 弹出药水详情弹窗（效果说明 + 使用按钮）
        game._witchDetailPopup = null;
        game._witchEmptyPopup = null;
        game._potionDetailPopup = { potionIndex: potionHit.potionIndex, rect: potionHit, animStartTime: Date.now() };
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
        // 每次打开图鉴默认回到「全部」tab
        game._cardBookTab = 'all';
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
              // 升级系统：默认 Lv.1，real_value 初始等于 value
              if (item.level === undefined) item.level = 1;
              if (item.real_value === undefined) item.real_value = item.value;
              game.jokers.push(item);
              // 新购入卡牌缩放弹入动画
              game._newOwnedProp = { type: 'jokers', index: game.jokers.length - 1, startTime: Date.now() };
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
              // 新购入卡牌缩放弹入动画
              game._newOwnedProp = { type: 'potions', index: game.potions.length - 1, startTime: Date.now() };
              if (game.storageManager) game.storageManager.saveProgress();
            }
            // 药水牌且点击"立即使用"
            if (btnHit.action === 'usePotionNow' && game._confirmBuyItemData) {
              const item = game._confirmBuyItemData;
              // 字母置换 / 吸星大法：只能在游戏中使用，不进入 potion 状态
              if (item.effect === 'change_letter' || item.effect === 'absorb_stars') return;
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

    // 女巫牌升级弹窗（商店页）
    if (game._witchUpgradePopup) {
      const up = game._witchUpgradePopup;
      if (up.closing) return;
      // 关闭按钮
      if (renderer._witchUpgradeCloseRect && renderer.hitTest(x, inputY, [renderer._witchUpgradeCloseRect])) {
        vibrate();
        if (game.audioManager) game.audioManager.play('tap');
        up.closing = true;
        up.closeStartTime = Date.now();
        return;
      }
      // 确认升级
      if (renderer._witchUpgradeConfirmRect && renderer.hitTest(x, inputY, [renderer._witchUpgradeConfirmRect])) {
        vibrate();
        if (game.audioManager) game.audioManager.play('tap');
        // 升级成功视图：确认按钮 = 关闭弹窗
        if (up.upgraded) {
          up.closing = true;
          up.closeStartTime = Date.now();
          return;
        }
        if (!renderer._witchUpgradeConfirmRect.enabled) {
          game.hintToast = { text: '金币不足，无法升级', expireAt: Date.now() + 2000, startTime: Date.now() };
          return;
        }
        if (up._confirmPressed) return; // 动画进行中防重复点击
        const joker = (game.jokers || [])[up.jokerIndex];
        const step = getWitchUpgradeStep(joker);
        const rateStep = getWitchUpgradeRateStep(joker);
        if (joker && (step !== undefined || rateStep !== undefined)) {
          const lv = joker.level || 1;
          const cost = (lv + 1) * joker.cost;
          if (game.gold >= cost) {
            // 先播按钮按下偏移动画，150ms 后执行升级并切换弹窗内容
            up._confirmPressed = true;
            setTimeout(() => {
              up._confirmPressed = false;
              game.gold -= cost;
              joker.level = lv + 1;
              if (step !== undefined) {
                // 基于 _originalValue 升级并同步写回：resetRound/读档归一化会用 _originalValue 重算 real_value，
                // 不同步的话下一回合升级会被覆盖丢失；若当前处于 witch_card_value_half 试炼则按减半后生效
                const base = (joker._originalValue !== undefined) ? joker._originalValue
                  : ((joker.real_value !== undefined && joker.real_value !== null) ? joker.real_value : joker.value);
                joker._originalValue = Math.round((base + step) * 10) / 10;
                joker.real_value = (game._witchCardValueHalfActive && joker.scope === 'whole_word')
                  ? Math.round(joker._originalValue * 0.5 * 10) / 10
                  : joker._originalValue;
              } else {
                // rate 方向升级（概率类卡牌，如以小博大）：提升 rate 而非 real_value
                joker.rate = (joker.rate || 0) + rateStep;
              }
              if (game.storageManager) game.storageManager.saveProgress();
              if (game.audioManager) game.audioManager.play('magic_twinkle');
              // 切换到升级成功视图（卡牌移动放大动画起点）
              up.upgraded = true;
              up.upgradeAnimStart = Date.now();
            }, 150);
          }
        }
        return;
      }
      // 选择已有卡牌
      if (renderer._witchUpgradeCardRects && renderer._witchUpgradeCardRects.length > 0) {
        const cardHit = renderer.hitTest(x, inputY, renderer._witchUpgradeCardRects);
        if (cardHit) {
          vibrate();
          if (game.audioManager) game.audioManager.play('tap');
          up.jokerIndex = cardHit.index;
          return;
        }
      }
      // 点击面板外关闭
      if (renderer._witchUpgradePanelRect && !renderer.hitTest(x, inputY, [renderer._witchUpgradePanelRect])) {
        up.closing = true;
        up.closeStartTime = Date.now();
      }
      return;
    }

    // 检测已购买道具栏点击（选中/取消选中）
    if (renderer.shopRenderer && renderer.shopRenderer.shopOwnedPropRects) {
      const propHit = renderer.hitTest(x, inputY, renderer.shopRenderer.shopOwnedPropRects);
      if (propHit) {
        // 空槽位：弹出说明弹窗（女巫牌紫色 / 魔法药水绿色）
        if (propHit.empty) {
          vibrate();
          if (game.audioManager) game.audioManager.play('tap');
          if (game._witchEmptyPopup) {
            game._witchEmptyPopup = null;
          } else {
            game._witchDetailPopup = null;
            game._potionDetailPopup = null;
            renderer.shopRenderer.shopSelectedOwned = null;
            game._witchEmptyPopup = { rect: propHit, kind: propHit.kind || 'witch', animStartTime: Date.now() };
          }
          return;
        }
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
        // 药水牌：弹出详情弹窗（效果信息 + 售出/使用按钮）
        vibrate();
        if (game.audioManager) game.audioManager.play('tap');
        game._witchDetailPopup = null;
        game._witchEmptyPopup = null;
        game._potionDetailPopup = { potionIndex: propHit.index, rect: propHit, isShop: true, animStartTime: Date.now() };
        return;
      }
    }

    // 药水详情弹窗（商店页：售出/使用；点击外部关闭）
    if (game._potionDetailPopup) {
      if (renderer._potionDetailSellBtnRect && renderer.hitTest(x, inputY, [renderer._potionDetailSellBtnRect])) {
        vibrate();
        if (game.audioManager) game.audioManager.play('card_sell');
        const sellIdx = game._potionDetailPopup.potionIndex;
        const item = game.potions && game.potions[sellIdx];
        if (item) {
          game.gold += Math.round(item.cost / 2);
          game._sellingProp = { type: 'potions', index: sellIdx, startTime: Date.now() };
          renderer.shopRenderer.shopSelectedOwned = null;
          if (game.storageManager) game.storageManager.saveProgress();
        }
        game._potionDetailPopup = null;
        return;
      }
      if (renderer._potionDetailUseBtnRect && renderer.hitTest(x, inputY, [renderer._potionDetailUseBtnRect])) {
        vibrate();
        if (game.audioManager) game.audioManager.play('tap');
        const useIdx = game._potionDetailPopup.potionIndex;
        const potion = game.potions && game.potions[useIdx];
        if (potion) {
          // 从道具栏移除并进入使用页面
          game.potions.splice(useIdx, 1);
          game.potionMode = { ...potion };
          game._prePotionState = 'shop';
          game.state = 'potion';
          renderer.shopRenderer.shopSelectedOwned = null;
          if (game.storageManager) game.storageManager.saveProgress();
        }
        game._potionDetailPopup = null;
        return;
      }
      game._potionDetailPopup = null;
      return;
    }

    // 女巫牌升级按钮（打开升级弹窗；点击不关闭详情弹窗逻辑在此拦截）
    if (game._witchDetailPopup && renderer._witchDetailUpgradeBtnRect) {
      const upHit = renderer.hitTest(x, inputY, [renderer._witchDetailUpgradeBtnRect]);
      if (upHit) {
        vibrate();
        if (game.audioManager) game.audioManager.play('tap');
        const jokers = game.jokers || [];
        const canUp = j => getWitchUpgradeStep(j) !== undefined || getWitchUpgradeRateStep(j) !== undefined;
        let sel = game._witchDetailPopup.jokerIndex;
        if (!canUp(jokers[sel])) sel = jokers.findIndex(canUp);
        game._witchDetailPopup = null;
        game._witchUpgradePopup = { jokerIndex: sel, startTime: Date.now() };
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
          // 售价 = 基础售出价 × 女巫牌等级
          game.gold += Math.round(item.cost / 2) * (item.level || 1);
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

    // 点击商店页面其他地方，关闭售出按钮 / 女巫详情弹窗 / 空槽位说明弹窗
    let handled = false;
    if (game._witchDetailPopup && game._witchDetailPopup.isShop) {
      game._witchDetailPopup = null;
      handled = true;
    }
    if (game._witchEmptyPopup) {
      game._witchEmptyPopup = null;
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
        // 金币不足直接忽略（用折后价判定，与 buyItem/渲染端一致，避免折扣后买得起却点不动）
        const finalCost = game._shopDiscountActive ? Math.floor(item.cost * game._shopDiscountRate) : item.cost;
        if (game.gold < finalCost) return;
        const isAlwaysBuyablePotion = item.type === 'potion' && ['upgrade_letter', 'random_upgrade', 'replicate_letter', 'equal_split', 'starlight_wash'].includes(item.effect);
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
    // === 吸星大法：选择阶段 ===
    if (game.potionMode && game.potionMode.effect === 'absorb_stars') {
      // 动画播放期间忽略输入
      if (game._absorbStarsAnim) return;
      // 检测返回按钮
      if (renderer.absorbStarsBackRect) {
        const backHit = renderer.hitTest(x, inputY, [renderer.absorbStarsBackRect]);
        if (backHit) {
          game._absorbStarsBackPressed = true;
          return;
        }
      }
      // 检测手牌点击
      if (renderer.absorbStarsCardRects) {
        const cardHit = renderer.hitTest(x, inputY, renderer.absorbStarsCardRects);
        if (cardHit) {
          vibrate();
          game._absorbStarsSelectedCardId = cardHit.card.id;
          return;
        }
      }
      // 检测确定按钮
      if (renderer.absorbStarsConfirmBtnRect && renderer.absorbStarsConfirmBtnRect.enabled) {
        const btnHit = renderer.hitTest(x, inputY, [renderer.absorbStarsConfirmBtnRect]);
        if (btnHit) {
          vibrate();
          if (game.audioManager) game.audioManager.play('tap');
          const targetId = game._absorbStarsSelectedCardId;
          const targetCard = game.hand.find(c => c && c.id === targetId);
          if (targetCard) {
            let absorbTotal = 0;
            const sourceCardIds = [];
            for (const c of game.hand) {
              if (c && c.id !== targetId) {
                absorbTotal += c.score;
                sourceCardIds.push(c.id);
              }
            }
            // 启动吸星大法动画，动画结束后再应用 absorbBonus
            game._absorbStarsAnim = {
              startTime: Date.now(),
              targetCardId: targetId,
              sourceCardIds: sourceCardIds,
              oldScore: targetCard.score + (targetCard.absorbBonus || 0),
              newScore: targetCard.score + (targetCard.absorbBonus || 0) + absorbTotal,
              absorbTotal: absorbTotal,
              potionIndex: game.potionMode._potionIndex,
              prePotionState: game._prePotionState,
            };
            // 数字晃动结束（1000ms）时播放 fantasy 音效
            setTimeout(() => {
              if (game._absorbStarsAnim && game.audioManager) {
                game.audioManager.play('fantasy');
              }
            }, 1000);
          }
          return;
        }
      }
      return;
    }

    // === 危险复制：动画/结果阶段 ===
    if (game._replicateAnim) {
      if (game._replicateAnim.phase === 'result') {
        vibrate();
        if (game.audioManager) game.audioManager.play('tap');
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
        if (game.audioManager) game.audioManager.play('tap');
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
        if (game.audioManager) game.audioManager.play('tap');
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

    // === 危险复制：选择阶段 ===
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

        // 拉起分享复活（配图为 MP 后台过审的自定义转发图片）
        shareReviveState = { startTime: Date.now(), resolving: true };
        wx.shareAppMessage({
          title: `我正在收集女巫词牌，快来帮我过这关！`,
          imageUrl: 'https://mmocgame.qpic.cn/wechatgame/6hD7bZsarmyfjMmA0ogAzeCE0gAHxlc4fUGqHJkOUCMKnmbCjKdsVU5EnL0CuWnk/0',
          imageUrlId: 'MQ6jGSa0RLGY1UnTVCZ3tg==',
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
  // 清理启动时授权弹窗
  destroyProfileAuthButton();
  game = new Game();
  game.cloudStorage = cloudStorage;
  game.renderer = renderer;
  wx.game = game;
  game.startFriendRoomPolling = startFriendRoomPolling;
  game.applyFriendRoomState = applyFriendRoomState;
  game.startFriendBattleCountdown = startFriendBattleCountdown;

  // 2026-06-24 优化：restart 后也需要加载音效
  game.initAudio();

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
      // 翻页完成、主页已移出视野后再切换显示标记：下次回到主页时大按钮才显示"继续"
      // （单人闯关入口不论落在 playing/结算/商店，都算已进过闯关）
      if (targetState !== 'battle' && targetState !== 'daily_gold' && game) {
        game._roundEntered = true;
      }
      // 双人对战翻页完成后：如果已有好友对战弹窗则保留，否则弹出对战模式选择弹窗
      if (targetState === 'battle' && game && game.battleManager) {
        if (game._pendingFriendJoinReadyPopup) {
          // 好友从分享链接进入：翻页完成后显示准备好的好友对战弹窗
          game._battleModeSelectPopup = game._pendingFriendJoinReadyPopup;
          game._pendingFriendJoinReadyPopup = null;
        } else if (!game._battleModeSelectPopup) {
          game._battleModeSelectPopup = {
            startTime: Date.now(),
            title: '对战模式',
            friendPressed: false,
            onlinePressed: false
          };
        }
        // 翻页开始时已初始化对战数据，翻页完成后只需确保状态一致
        game.state = 'battle';
        game.battleMode = true;
        game.battleBotThinking = false;
        game._battleTurnDeadline = null;
      }
    }
  } else if (showHomepage) {
    // 测试阶段：优先展示 homepage
    renderer.drawHomepage();
    // 主页 setting 按钮复用 top_icon 行为，设置弹窗打开时叠加在主页上绘制
    if (game && game._settingsPopup) {
      renderer.drawSettingsPopup(game);
    }
    // 重新闯关二次确认弹窗
    if (game && game._restartRoundConfirmPopup && renderer._drawRestartRoundConfirmPopup) {
      renderer._drawRestartRoundConfirmPopup(game);
    }
    // 排行榜弹窗在主页上叠加绘制
    if (game && game._showingRankPopup && renderer._drawRankPopup) {
      renderer._drawRankPopup(game);
    }
    // 单词本弹窗在主页上叠加绘制
    if (game && game._wordBookPopup && renderer.drawWordBookPopup) {
      renderer.drawWordBookPopup(game);
    }
    // 每日金词入口弹窗在主页上叠加绘制
    if (game && game._goldenEntryPopup && renderer.drawGoldenEntryPopup) {
      renderer.drawGoldenEntryPopup(game);
    }
    // 学习模式（今日新词）弹窗在主页上叠加绘制
    if (game && game._dailyWordsPopup && renderer._drawDailyWordsPopup) {
      renderer._drawDailyWordsPopup(game);
    }
    // 每日成就弹窗在主页上叠加绘制
    if (game && game._dailyAchievementPopup && renderer._drawDailyAchievementPopup) {
      renderer._drawDailyAchievementPopup(game);
    }
    // 头像昵称授权底部弹窗背景在主页上叠加绘制（原生按钮在上层）
    if (game && game._showingProfileAuthButton && renderer._drawProfileAuthPopup) {
      renderer._drawProfileAuthPopup(renderer.ctx, game, renderer.W, renderer.H, renderer.scale);
    }

    // 首页调试日志（showCloudDebugLogs=false 时不绘制）
    // if (renderer.drawHomepageDebugLogs) {
    //   renderer.drawHomepageDebugLogs(game);
    // }
    // renderer._drawCompactDebugLogs(game);

    // 通过分享链接进入：homepage 入场动画后自动加入好友对战房间
    if (game && game._autoJoinBattleRoomId && !game._autoJoiningBattle) {
      const autoJoinElapsed = Date.now() - (game._autoJoinBattleStartTime || 0);
      cloudStorage.log('[AutoJoin] gameLoop autoJoinElapsed=' + autoJoinElapsed + ' preloadComplete=' + preloadComplete + ' state=' + game.state + ' roomId=' + game._autoJoinBattleRoomId);
      // 等 homepage 按钮弹出动画完成、且预加载完成后再自动加入，避免渲染循环未就绪时卡住
      if (autoJoinElapsed >= 1500 && preloadComplete && game && game.state !== 'battle') {
        tryAutoJoinFriendBattle();
      }
    }

    // 若首页入场动画期间未能自动加入，则入场动画完成后兜底尝试一次
    if (game && game._autoJoinBattleRoomId && !game._autoJoiningBattle && preloadComplete && game.state !== 'battle') {
      const entryElapsed = Date.now() - (renderer._homepageEntryAnim ? renderer._homepageEntryAnim.startTime : renderer.homepageAnimStartTime);
      if (entryElapsed >= 3200) {
        tryAutoJoinFriendBattle();
      }
    }

    // 持续尝试：好友对战链接进入时，即使前面失败也不要轻易放弃，每帧尝试直到成功或用户主动取消
    if (game && game._autoJoinBattleRoomId && !game._autoJoiningBattle && preloadComplete && game.state !== 'battle') {
      const retryElapsed = Date.now() - (game._autoJoinBattleStartTime || 0);
      if (retryElapsed >= 4000 && (!game._lastAutoJoinTry || Date.now() - game._lastAutoJoinTry >= 1000)) {
        game._lastAutoJoinTry = Date.now();
        tryAutoJoinFriendBattle();
      }
    }

    // 好友对战同步倒计时 tick
    updateFriendBattleCountdown();

    // 好友对战模式选择弹窗在主页上叠加绘制（加入房间后显示准备/开始按钮）
    if (game && game._battleModeSelectPopup && renderer._drawBattleModeSelectPopup) {
      renderer._drawBattleModeSelectPopup(game);
    }
    // 如果弹窗已标记关闭但对象仍在，1.2s 后强制清理，避免旧弹窗残留遮挡
    if (game && game._battleModeSelectPopup && game._battleModeSelectPopup.closing) {
      const closeElapsed = Date.now() - (game._battleModeSelectPopup.closeStartTime || 0);
      if (closeElapsed >= 1200) {
        game._battleModeSelectPopup = null;
      }
    }

    // 主页弹窗上的通用 hintToast（领取奖励等提示需要在弹窗打开时也能看到）
    if (game && game.hintToast && renderer._drawHintToast) {
      renderer._drawHintToast(game);
    }
    // 主页上打开的弹窗滚动物理也需要更新
    if (game) {
      // 主页不走 game.update()，需在此清除过期 hintToast，确保领取奖励等提示能自动消失
      if (game.hintToast && Date.now() > game.hintToast.expireAt) {
        game.hintToast = null;
      }
      game._updateDailyAchievementScroll(deltaTime);
      game._updateDailyWordsScroll(deltaTime);
      game._updateWordBookScroll(deltaTime);
      game._updateGlobalRankScroll(deltaTime);
    }
  } else if (!preloadComplete) {
    // 预加载阶段：绘制预加载页
    renderer.drawPreviewLoad(preloadProgress);
    // 预加载期间也可能显示头像昵称授权底部弹窗背景
    if (game && game._showingProfileAuthButton && renderer._drawProfileAuthPopup) {
      renderer._drawProfileAuthPopup(renderer.ctx, game, renderer.W, renderer.H, renderer.scale);
    }
    // 预加载阶段调试日志（showCloudDebugLogs=false 时不绘制）
    // if (renderer.drawHomepageDebugLogs) {
    //   renderer.drawHomepageDebugLogs(game);
    // }
    // renderer._drawCompactDebugLogs(game);
    // 预加载阶段每帧记录进度，便于排查卡住位置
    if (game && game._autoJoinBattleRoomId) {
      cloudStorage.log('[AutoJoin] preload progress=' + preloadProgress + ' complete=' + preloadComplete);
    }
  } else if (transitionStartTime !== null) {
    // 过渡阶段：直接渲染游戏页面（去掉淡入淡出）
    renderer.render(game);
    transitionStartTime = null;
  } else {
    // 对战相关弹窗（在对战页面上叠加绘制）
    renderer.render(game);

    // 好友对战同步倒计时 tick
    updateFriendBattleCountdown();

    // 对战模式选择弹窗
    if (game && game._battleModeSelectPopup && renderer._drawBattleModeSelectPopup) {
      renderer._drawBattleModeSelectPopup(game);
    }
    // 如果弹窗已标记关闭但对象仍在，1.2s 后强制清理，避免旧弹窗残留遮挡
    if (game && game._battleModeSelectPopup && game._battleModeSelectPopup.closing) {
      const closeElapsed = Date.now() - (game._battleModeSelectPopup.closeStartTime || 0);
      if (closeElapsed >= 1200) {
        game._battleModeSelectPopup = null;
      }
    }
    // 对战房间弹窗（创建/等待/加入确认）
    if (game && game._battleRoomPopup && renderer._drawBattleRoomPopup) {
      renderer._drawBattleRoomPopup(game);
    }
    // 加入好友对战确认弹窗（复用对战房间弹窗绘制）
    if (game && game._battleJoinConfirmPopup && renderer._drawBattleRoomPopup) {
      renderer._drawBattleRoomPopup({ ...game, _battleRoomPopup: game._battleJoinConfirmPopup });
    }

    // 对战页调试日志（showCloudDebugLogs=false 时不绘制）
    // renderer._drawCompactDebugLogs(game);

    // 对战模式状态更新（匹配弹窗/好友对战弹窗显示期间暂停 bot 思考与 reveal 检查）
    // 注意：弹窗对象可能残留但已标记 closing，此时不应再阻塞对战状态更新
    const battleModePopup = game && game._battleModeSelectPopup;
    const inFriendBattleLobby = game && game._battleRoomId && battleModePopup && !battleModePopup.closing;
    if (game && game.state === 'battle' && game.battleManager && !game._battleMatchAnim && !inFriendBattleLobby) {
      try {
        game.battleManager.updateTurnTimer();
        game.battleManager.updateBotThinking();
        game.battleManager.checkReveal();
      } catch (e) {
        if (game && game.cloudStorage && game.cloudStorage.log) {
          game.cloudStorage.log('[Battle] gameLoop 对战状态更新异常: ' + (e && e.message ? e.message : String(e)) + ' stack=' + (e && e.stack ? e.stack : 'null'));
        }
        console.error('[Battle] gameLoop 对战状态更新异常:', e);
      }
    }
    game.update(deltaTime);
  }

  requestAnimationFrame(gameLoop);
}

// 启动预加载并开始渲染循环
startPreload();
requestAnimationFrame(gameLoop);

// 暴露到全局（调试用）
wx.renderer = renderer;
