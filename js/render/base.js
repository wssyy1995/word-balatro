const { formatMeaning, isValidWordOnline } = require('../game');
const { WORD_DATA, onlineWordCache, wordCheckState, LETTER_SCORE, letterUpgrades } = require('../data');
const { SettlementRenderer, WitchRewardRenderer } = require('../settlement');
const { ShopRenderer, ConfirmBuyRenderer, SHOP_POOL } = require('../shop');
const { getSkillForLevel, WITCH_SKILLS, WITCH_CARDS } = require('../witch_skills');
const { Easing } = require('../animation');
const { GameOverRenderer } = require('./gameover');

class Renderer {
  constructor(ctx, width, height) {
    this.ctx = ctx;
    this.W = width;
    this.H = height;
    
    // 响应式基准计算
    // 使用 min(width/375, height/667) 确保在任何屏幕上都适配
    const baseScale = Math.min(width / 375, height / 667);
    // 限制最大缩放，避免在 iPad 上元素过大
    this.scale = Math.min(baseScale, 1.4);
    // 限制最小缩放，避免在小屏幕上元素过小
    this.scale = Math.max(this.scale, 0.8);
    
    // 计算卡牌尺寸（支持最多4列）
    const maxCardW = Math.floor((width - 48) / 4); // 4列，左右边距24
    const maxCardH = Math.floor((height - 200) / 3); // 最多3行，预留上方HUD和下方按钮
    this.cardW = Math.min(Math.floor(74 * this.scale), maxCardW);
    this.cardH = Math.min(Math.floor(88 * this.scale), maxCardH);
    this.gap = Math.floor(8 * this.scale);
    
    // 安全区域（刘海屏/灵动岛适配）
    this.safeTop = 0;
    this.safeBottom = 0;
    this.hasDynamicIsland = false;
    this.platform = '';
    try {
      const sysInfo = wx.getSystemInfoSync();
      this.safeTop = sysInfo.safeArea?.top || sysInfo.statusBarHeight || 0;
      this.safeBottom = (sysInfo.screenHeight - (sysInfo.safeArea?.bottom || sysInfo.screenHeight));
      this.platform = sysInfo.platform || '';
      this.hasDynamicIsland = this.safeTop >= 44;
    } catch (e) {
      this.safeTop = 0;
      this.hasDynamicIsland = false;
    }
    
    this.animations = [];
    
    // 背景图强制从云存储加载（云端下载成功后通过 injectBgIconToRenderer 注入）
    this.bgImage = null;
    this.bgLoaded = false;
    
    // 新手引导（由 cloudStorage 在预加载时注入，不再使用本地图片）
    // witch_1~4 均使用精灵图（单张大图 + 坐标）
    this.guideImages = {
      witch_1: {
        type: 'spritesheet',
        img: null,
        loaded: false,
        frameCount: 16,
        frameDelay: 150,
        frameCoords: [
          { x: 0, y: 0, w: 360, h: 360 },
          { x: 360, y: 0, w: 360, h: 360 },
          { x: 720, y: 0, w: 360, h: 360 },
          { x: 1080, y: 0, w: 360, h: 360 },
          { x: 0, y: 360, w: 360, h: 360 },
          { x: 360, y: 360, w: 360, h: 360 },
          { x: 720, y: 360, w: 360, h: 360 },
          { x: 1080, y: 360, w: 360, h: 360 },
          { x: 0, y: 720, w: 360, h: 360 },
          { x: 360, y: 720, w: 360, h: 360 },
          { x: 720, y: 720, w: 360, h: 360 },
          { x: 1080, y: 720, w: 360, h: 360 },
          { x: 0, y: 1080, w: 360, h: 360 },
          { x: 360, y: 1080, w: 360, h: 360 },
          { x: 720, y: 1080, w: 360, h: 360 },
          { x: 1080, y: 1080, w: 360, h: 360 },
        ],
      },
      witch_2: {
        type: 'spritesheet',
        img: null,
        loaded: false,
        frameCount: 14,
        frameDelay: 150,
        frameCoords: [
          { x: 0, y: 0, w: 360, h: 360 },
          { x: 360, y: 0, w: 360, h: 360 },
          { x: 720, y: 0, w: 360, h: 360 },
          { x: 1080, y: 0, w: 360, h: 360 },
          { x: 0, y: 360, w: 360, h: 360 },
          { x: 360, y: 360, w: 360, h: 360 },
          { x: 720, y: 360, w: 360, h: 360 },
          { x: 1080, y: 360, w: 360, h: 360 },
          { x: 0, y: 720, w: 360, h: 360 },
          { x: 360, y: 720, w: 360, h: 360 },
          { x: 720, y: 720, w: 360, h: 360 },
          { x: 1080, y: 720, w: 360, h: 360 },
          { x: 0, y: 1080, w: 360, h: 360 },
          { x: 360, y: 1080, w: 360, h: 360 },
        ],
      },
      witch_3: {
        type: 'spritesheet',
        img: null,
        loaded: false,
        frameCount: 16,
        frameDelay: 150,
        frameCoords: [
          { x: 0, y: 0, w: 360, h: 360 },
          { x: 360, y: 0, w: 360, h: 360 },
          { x: 720, y: 0, w: 360, h: 360 },
          { x: 1080, y: 0, w: 360, h: 360 },
          { x: 0, y: 360, w: 360, h: 360 },
          { x: 360, y: 360, w: 360, h: 360 },
          { x: 720, y: 360, w: 360, h: 360 },
          { x: 1080, y: 360, w: 360, h: 360 },
          { x: 0, y: 720, w: 360, h: 360 },
          { x: 360, y: 720, w: 360, h: 360 },
          { x: 720, y: 720, w: 360, h: 360 },
          { x: 1080, y: 720, w: 360, h: 360 },
          { x: 0, y: 1080, w: 360, h: 360 },
          { x: 360, y: 1080, w: 360, h: 360 },
          { x: 720, y: 1080, w: 360, h: 360 },
          { x: 1080, y: 1080, w: 360, h: 360 },
        ],
      },
      witch_4: {
        type: 'spritesheet',
        img: null,
        loaded: false,
        frameCount: 14,
        frameDelay: 150,
        frameCoords: [
          { x: 0, y: 0, w: 360, h: 360 },
          { x: 360, y: 0, w: 360, h: 360 },
          { x: 720, y: 0, w: 360, h: 360 },
          { x: 1080, y: 0, w: 360, h: 360 },
          { x: 0, y: 360, w: 360, h: 360 },
          { x: 360, y: 360, w: 360, h: 360 },
          { x: 720, y: 360, w: 360, h: 360 },
          { x: 1080, y: 360, w: 360, h: 360 },
          { x: 0, y: 720, w: 360, h: 360 },
          { x: 360, y: 720, w: 360, h: 360 },
          { x: 720, y: 720, w: 360, h: 360 },
          { x: 1080, y: 720, w: 360, h: 360 },
          { x: 0, y: 1080, w: 360, h: 360 },
          { x: 360, y: 1080, w: 360, h: 360 },
        ],
      },
    };
    // witch_1~4 均使用精灵图，无需预分配帧槽位

    // 加载 top bar 图标
    this.topIcon = null;
    this.topIconLoaded = false;
    try {
      const icon = wx.createImage();
      icon.src = 'images/top_icon.png';
      icon.onload = () => { this.topIconLoaded = true; };
      icon.onerror = () => { this.topIconLoaded = false; };
      this.topIcon = icon;
    } catch (e) {
      this.topIconLoaded = false;
    }
    
    // 加载按钮图片
    this.pressedBtn = null;
    this.btnImages = {};
    const btnNames = ['out_card', 'throw_card', 'reset_select', 'challenge_button'];
    btnNames.forEach(name => {
      try {
        const img = wx.createImage();
        img.src = `images/${name}.png`;
        img.onload = () => { this.btnImages[name] = { img, loaded: true }; };
        img.onerror = () => { this.btnImages[name] = { img, loaded: false }; };
        this.btnImages[name] = { img, loaded: false };
      } catch (e) {
        this.btnImages[name] = { img: null, loaded: false };
      }
    });
    
    // 加载分数方块背景图
    this.scoreBoxImages = {};
    const boxNames = ['letter_score', 'length'];
    boxNames.forEach(name => {
      try {
        const img = wx.createImage();
        img.src = `images/${name}.png`;
        img.onload = () => { this.scoreBoxImages[name] = { img, loaded: true }; };
        img.onerror = () => { this.scoreBoxImages[name] = { img, loaded: false }; };
        this.scoreBoxImages[name] = { img, loaded: false };
      } catch (e) {
        this.scoreBoxImages[name] = { img: null, loaded: false };
      }
    });
    
    // 加载计分方块装饰线
    this.scoreLineImg = null;
    this.scoreLineLoaded = false;
    try {
      const img = wx.createImage();
      img.src = 'images/score_line.png';
      img.onload = () => { this.scoreLineLoaded = true; };
      img.onerror = () => { this.scoreLineLoaded = false; };
      this.scoreLineImg = img;
    } catch (e) {
      this.scoreLineLoaded = false;
    }

    // 加载游戏结束弹窗按钮图片
    this.gameOverBtnImages = {};
    const goBtnNames = ['relive_button', 'relive_limit_button', 'restart_button', 'rank_button'];
    goBtnNames.forEach(name => {
      try {
        const img = wx.createImage();
        img.src = `images/${name}.png`;
        img.onload = () => { this.gameOverBtnImages[name] = { img, loaded: true }; };
        img.onerror = () => { this.gameOverBtnImages[name] = { img: null, loaded: false }; };
        this.gameOverBtnImages[name] = { img, loaded: false };
      } catch (e) {
        this.gameOverBtnImages[name] = { img: null, loaded: false };
      }
    });
    
        // 加载错误图标
    this.errorIcon = null;
    this.errorIconLoaded = false;
    try {
      const img = wx.createImage();
      img.src = 'images/error.png';
      img.onload = () => { this.errorIconLoaded = true; };
      img.onerror = () => { this.errorIconLoaded = false; };
      this.errorIcon = img;
    } catch (e) {
      this.errorIconLoaded = false;
    }
    
    // 加载商店图标
    // 加载商店图标
    this.shopIcon = null;
    this.shopIconLoaded = false;
    try {
      const img = wx.createImage();
      img.src = 'images/shop_icon.png';
      img.onload = () => { this.shopIconLoaded = true; };
      img.onerror = () => { this.shopIconLoaded = false; };
      this.shopIcon = img;
    } catch (e) {
      this.shopIconLoaded = false;
    }

    // 加载卡牌图鉴图标与弹窗大图
    this.cardBookIcon = null;
    this.cardBookIconLoaded = false;
    try {
      const img = wx.createImage();
      img.src = 'images/card_book_icon.png';
      img.onload = () => { this.cardBookIconLoaded = true; };
      img.onerror = () => { this.cardBookIconLoaded = false; };
      this.cardBookIcon = img;
    } catch (e) {
      this.cardBookIconLoaded = false;
    }
    this.newBadgeIcon = null;
    this.newBadgeIconLoaded = false;
    try {
      const img = wx.createImage();
      img.src = 'images/new.png';
      img.onload = () => { this.newBadgeIconLoaded = true; };
      img.onerror = () => { this.newBadgeIconLoaded = false; };
      this.newBadgeIcon = img;
    } catch (e) {
      this.newBadgeIconLoaded = false;
    }
    this.cardBookImage = null;
    this.cardBookImageLoaded = false;
    try {
      const img = wx.createImage();
      img.src = 'images/card_book.png';
      img.onload = () => { this.cardBookImageLoaded = true; };
      img.onerror = () => { this.cardBookImageLoaded = false; };
      this.cardBookImage = img;
    } catch (e) {
      this.cardBookImageLoaded = false;
    }

    // 加载卡牌图鉴翻页按钮
    this.cardBookLeftBtn = null;
    this.cardBookLeftBtnLoaded = false;
    try {
      const img = wx.createImage();
      img.src = 'images/card_book_left.png';
      img.onload = () => { this.cardBookLeftBtnLoaded = true; };
      img.onerror = () => { this.cardBookLeftBtnLoaded = false; };
      this.cardBookLeftBtn = img;
    } catch (e) {
      this.cardBookLeftBtnLoaded = false;
    }
    this.cardBookRightBtn = null;
    this.cardBookRightBtnLoaded = false;
    try {
      const img = wx.createImage();
      img.src = 'images/card_book_right.png';
      img.onload = () => { this.cardBookRightBtnLoaded = true; };
      img.onerror = () => { this.cardBookRightBtnLoaded = false; };
      this.cardBookRightBtn = img;
    } catch (e) {
      this.cardBookRightBtnLoaded = false;
    }

    // 加载弹窗关闭按钮
    this.popCloseImage = null;
    this.popCloseLoaded = false;
    try {
      const img = wx.createImage();
      img.src = 'images/pop_close.png';
      img.onload = () => { this.popCloseLoaded = true; };
      img.onerror = () => { this.popCloseLoaded = false; };
      this.popCloseImage = img;
    } catch (e) {
      this.popCloseLoaded = false;
    }
    
    // 加载女巫礼物图标
    this.witchGiftIcon = null;
    this.witchGiftIconLoaded = false;
    try {
      const img = wx.createImage();
      img.src = 'images/witch_gift.png';
      img.onload = () => { this.witchGiftIconLoaded = true; };
      img.onerror = () => { this.witchGiftIconLoaded = false; };
      this.witchGiftIcon = img;
    } catch (e) {
      this.witchGiftIconLoaded = false;
    }

    // 加载女巫帽子图标（用于女巫约束提示）
    this.witchHatIcon = null;
    this.witchHatIconLoaded = false;
    try {
      const img = wx.createImage();
      img.src = 'images/witch_hat.png';
      img.onload = () => { this.witchHatIconLoaded = true; };
      img.onerror = () => { this.witchHatIconLoaded = false; };
      this.witchHatIcon = img;
    } catch (e) {
      this.witchHatIconLoaded = false;
    }
    // 女巫头像占位（由 CloudStorageManager 从云端注入，此处只初始化占位）
    this.witchAvatars = {};
    const witchLevels = [...new Set(WITCH_SKILLS.map(s => s.level))];
    witchLevels.forEach(level => {
      const name = `witch_${level}`;
      this.witchAvatars[name] = { img: null, loaded: false, width: 0, height: 0 };
    });

    // 女巫卡牌占位（由 CloudStorageManager 从云端注入）
    this.witchCardImages = {};
    witchLevels.forEach(level => {
      const name = `witch_card_${level}`;
      this.witchCardImages[name] = { img: null, loaded: false, width: 0, height: 0 };
    });

    // 加载金币图标
    this.coinIcon = null;
    this.coinIconLoaded = false;
    try {
      const img = wx.createImage();
      img.src = 'images/coin.png';
      img.onload = () => { this.coinIconLoaded = true; };
      img.onerror = () => { this.coinIconLoaded = false; };
      this.coinIcon = img;
    } catch (e) {
      this.coinIconLoaded = false;
    }

    // 加载刷新图标
    this.refreshIcon = null;
    this.refreshIconLoaded = false;
    try {
      const img = wx.createImage();
      img.src = 'images/shop_refresh.png';
      img.onload = () => { this.refreshIconLoaded = true; };
      img.onerror = () => { this.refreshIconLoaded = false; };
      this.refreshIcon = img;
    } catch (e) {
      this.refreshIconLoaded = false;
    }
    
    // 加载禁用锁图标
    this.cardDisableIcon = null;
    this.cardDisableIconLoaded = false;
    try {
      const img = wx.createImage();
      img.src = 'images/card_disable.png';
      img.onload = () => { this.cardDisableIconLoaded = true; };
      img.onerror = () => { this.cardDisableIconLoaded = false; };
      this.cardDisableIcon = img;
    } catch (e) {
      this.cardDisableIconLoaded = false;
    }

    // 加载 discount 标签图标
    this.discountIcon = null;
    this.discountIconLoaded = false;
    try {
      const img = wx.createImage();
      img.src = 'images/discount.png';
      img.onload = () => { this.discountIconLoaded = true; };
      img.onerror = () => { this.discountIconLoaded = false; };
      this.discountIcon = img;
    } catch (e) {
      this.discountIconLoaded = false;
    }

    // 加载目标分数图标
    this.targetScoreIcon = null;
    this.targetScoreIconLoaded = false;
    try {
      const img = wx.createImage();
      img.src = 'images/target_score_icon.png';
      img.onload = () => { this.targetScoreIconLoaded = true; };
      img.onerror = () => { this.targetScoreIconLoaded = false; };
      this.targetScoreIcon = img;
    } catch (e) {
      this.targetScoreIconLoaded = false;
    }

    // 加载卡牌背景图
    this.cardTemplate = null;
    this.cardTemplateLoaded = false;
    try {
      const img = wx.createImage();
      img.src = 'images/card_template.png';
      img.onload = () => { this.cardTemplateLoaded = true; };
      img.onerror = () => { this.cardTemplateLoaded = false; };
      this.cardTemplate = img;
    } catch (e) {
      this.cardTemplateLoaded = false;
    }
    
    // 加载卡牌选中态背景图
    this.cardTemplateSelected = null;
    this.cardTemplateSelectedLoaded = false;
    try {
      const img = wx.createImage();
      img.src = 'images/card_template_selected.png';
      img.onload = () => { this.cardTemplateSelectedLoaded = true; };
      img.onerror = () => { this.cardTemplateSelectedLoaded = false; };
      this.cardTemplateSelected = img;
    } catch (e) {
      this.cardTemplateSelectedLoaded = false;
    }
    // 加载游戏进度栏背景图
    this.gameProgressImage = null;
    this.gameProgressLoaded = false;
    try {
      const img = wx.createImage();
      img.src = 'images/game_progress.png';
      img.onload = () => { this.gameProgressLoaded = true; };
      img.onerror = () => { this.gameProgressLoaded = false; };
      this.gameProgressImage = img;
    } catch (e) {
      this.gameProgressLoaded = false;
    }

    // 加载购买成功弹窗底部飘带
    this.buySuccessBandImg = null;
    this.buySuccessBandLoaded = false;
    try {
      const img = wx.createImage();
      img.src = 'images/buy_succes_band.png';
      img.onload = () => { this.buySuccessBandLoaded = true; };
      img.onerror = () => { this.buySuccessBandLoaded = false; };
      this.buySuccessBandImg = img;
    } catch (e) {
      this.buySuccessBandLoaded = false;
    }
    
    // 设置弹窗图标
    this.settingIcons = {};
    const settingIconNames = ['sound', 'study', 'rank', 'feedback'];
    settingIconNames.forEach(name => {
      try {
        const img = wx.createImage();
        img.src = `images/setting_${name}.png`;
        img.onload = () => { this.settingIcons[name] = { img, loaded: true, width: img.width, height: img.height }; };
        img.onerror = () => { this.settingIcons[name] = { img: null, loaded: false, width: 0, height: 0 }; };
        this.settingIcons[name] = { img, loaded: false, width: 0, height: 0 };
      } catch (e) {
        this.settingIcons[name] = { img: null, loaded: false, width: 0, height: 0 };
      }
    });

    // 学习模式 toast 飞行星星图标
    this.toastStarIcon = { img: null, loaded: false, width: 0, height: 0 };
    try {
      const img = wx.createImage();
      img.src = 'images/study_toast_star.png';
      img.onload = () => { this.toastStarIcon = { img, loaded: true, width: img.width, height: img.height }; };
      img.onerror = () => { this.toastStarIcon = { img: null, loaded: false, width: 0, height: 0 }; };
    } catch (e) {
      this.toastStarIcon = { img: null, loaded: false, width: 0, height: 0 };
    }

    // 道具卡牌图标（由 CloudStorageManager 从云端注入，此处只初始化占位）
    this.shopCardImages = {};
    const shopCardNames = new Set();
    Object.values(SHOP_POOL).forEach(pool => {
      pool.forEach(item => {
        const iconName = item.trigger || item.effect;
        if (iconName) shopCardNames.add(iconName);
      });
    });
    shopCardNames.forEach(name => {
      this.shopCardImages[name] = { img: null, loaded: false, width: 0, height: 0 };
    });
    
    // 加载游戏结束弹窗小女巫图
    this.failWitchImg = null;
    this.failWitchLoaded = false;
    try {
      const img = wx.createImage();
      img.src = 'images/fail_witch.png';
      img.onload = () => { this.failWitchLoaded = true; };
      img.onerror = () => { this.failWitchLoaded = false; };
      this.failWitchImg = img;
    } catch (e) {
      this.failWitchLoaded = false;
    }

    // 加载空位替代图片
    ['empty_witch_card', 'empty_potion_card'].forEach((name) => {
      try {
        const img = wx.createImage();
        img.src = `images/${name}.png`;
        img.onload = () => {
          const data = this.shopCardImages[name];
          if (data) {
            data.loaded = true;
            data.width = img.width || 0;
            data.height = img.height || 0;
          }
        };
        img.onerror = () => { this.shopCardImages[name] = { img: null, loaded: false }; };
        try {
          wx.getImageInfo({
            src: `/images/${name}.png`,
            success: (res) => {
              const data = this.shopCardImages[name];
              if (data) {
                data.width = res.width;
                data.height = res.height;
              }
            }
          });
        } catch (e) {}
        this.shopCardImages[name] = { img, loaded: false, width: 0, height: 0 };
      } catch (e) {
        this.shopCardImages[name] = { img: null, loaded: false };
      }
    });
    
    // 动画粒子与飞行状态
    this.sparkles = [];
    this.flyingScore = null;
    this.scoreRoll = null;
    this.lastBoxScore = 0;
    this.lastScore = 0;
    this.scoreAnim = null;
    this.lastGold = 0;
    this.goldAnim = null;
    this.debugMenuOpen = false;
    this.witchPropRects = [];
    this.cloudLogScrollY = 0;
    this.cloudLogDragging = false;
    this.cloudLogDragStartY = 0;
    this.cloudLogDragStartScrollY = 0;
    this.cloudLogRect = null;
    this.cloudLogScrollBarRect = null;
    this.showCloudDebugLogs = false; // 调试日志开关，需要排查时设为 true
    
    // 子渲染器
    this.settlementRenderer = new SettlementRenderer(this);
    this.witchRewardRenderer = new WitchRewardRenderer(this);
    this.shopRenderer = new ShopRenderer(this);
    this.confirmBuyRenderer = new ConfirmBuyRenderer(this);
    this.gameOverRenderer = new GameOverRenderer(this);
    this.lifeExtensionBtnRect = null;

    // 女巫牌标签弹出动画状态
    this.lastLabelText = null;
    this.labelTagAnim = null;

    // 加载预加载页背景图
    this.previewLoadBg = null;
    this.previewLoadBgLoaded = false;
    try {
      const img = wx.createImage();
      img.src = 'images/preview_load.png';
      img.onload = () => { this.previewLoadBgLoaded = true; };
      img.onerror = () => { this.previewLoadBgLoaded = false; };
      this.previewLoadBg = img;
    } catch (e) {
      this.previewLoadBgLoaded = false;
    }

    // 加载预加载页走路小女巫精灵图（small_witch_preload 1~11 合成）
    this.witchWalkSprite = null;
    this.witchWalkSpriteLoaded = false;
    try {
      const img = wx.createImage();
      img.src = 'images/small_witch_sprite.png';
      img.onload = () => { this.witchWalkSpriteLoaded = true; };
      img.onerror = () => { this.witchWalkSpriteLoaded = false; };
      this.witchWalkSprite = img;
    } catch (e) {
      this.witchWalkSpriteLoaded = false;
      this.witchWalkSprite = null;
    }

    // 加载自定义标题字体（香萃灯粗宋 — 子集化后仅 4.4KB）
    this.titleFontFamily = '"PingFang SC", "Noto Sans SC", sans-serif';
    try {
      const fontFamily = wx.loadFont('images/fonts/XiangcuiDengcusong_subset.ttf');
      if (fontFamily) {
        this.titleFontFamily = fontFamily + ', sans-serif';
      }
    } catch (e) {
      console.warn('loadFont 失败，使用系统字体:', e);
    }
  }

  drawPreviewLoad(progress) {
    const ctx = this.ctx;
    const W = this.W;
    const H = this.H;
    const s = this.scale;

    // 背景图
    if (this.previewLoadBg && this.previewLoadBgLoaded) {
      ctx.drawImage(this.previewLoadBg, 0, 0, W, H);
    } else {
      ctx.fillStyle = '#2d2d3a';
      ctx.fillRect(0, 0, W, H);
    }

    // 游戏标题（预加载页也显示）
    ctx.save();
    ctx.font = `${Math.floor(30 * s)}px ${this.titleFontFamily}`;
    ctx.fillStyle = '#8b6914';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('女巫的词牌', W / 2, H * 0.23);
    ctx.restore();

    // 进度条区域参数
    const barW = 260 * s;
    const barH = 18 * s;
    const barX = (W - barW) / 2;
    const barY = H * 0.80;
    const barR = barH / 2;

    // 副标题文字
    ctx.fillStyle = '#5a4a2a';
    ctx.font = `bold ${Math.floor(16 * s)}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('资源加载中...', W / 2, barY - 24 * s);

    // 外框：浅米色填充 + 粗深金色边框
    this.roundRect(barX, barY, barW, barH, barR, '#faf6ee', '#b8934a', 2 * s);
    // 内框：细浅金色边框
    const innerGap = 3 * s;
    this.roundRect(barX + innerGap, barY + innerGap, barW - innerGap * 2, barH - innerGap * 2, (barH - innerGap * 2) / 2, null, '#d4c9a8', 1 * s);

    // 深蓝色填充
    const fillPadding = 4 * s;
    const fillMaxW = barW - fillPadding * 2;
    const fillW = Math.max(fillMaxW * (progress / 100), 0);
    const fillX = barX + fillPadding;
    const fillY = barY + fillPadding;
    const fillH = barH - fillPadding * 2;
    const fillR = fillH / 2;

    if (fillW > 0) {
      this.roundRect(fillX, fillY, fillW, fillH, fillR, '#1a2a5e');

      // 填充左端小星星
      if (fillW > 8 * s) {
        this._drawTinyStar(ctx, fillX + 4 * s, fillY + fillH / 2, 2.5 * s, '#ffd700');
      }
      // 填充右端小星星
      if (fillW > 16 * s) {
        this._drawTinyStar(ctx, fillX + fillW - 4 * s, fillY + fillH / 2, 2.5 * s, '#ffd700');
      }
    }

    // 走路小女巫（精灵图，位置随进度条同步）
    const WITCH_FRAME_COUNT = 21;
    const WITCH_FRAME_W = 123;
    const WITCH_FRAME_H = 166;
    const frameIdx = Math.floor(Date.now() / 50) % WITCH_FRAME_COUNT;
    const witchImg = this.witchWalkSprite;
    if (witchImg && this.witchWalkSpriteLoaded) {
      const witchScale = 0.53; // 123 * 0.53 ≈ 65px，保持和压缩前一样的显示大小
      const witchW = WITCH_FRAME_W * s * witchScale;
      const witchH = WITCH_FRAME_H * s * witchScale;
      const witchX = barX + (barW * (progress / 100)) - witchW / 2;
      const witchY = H * 0.56 + 16 * s;
      ctx.drawImage(witchImg, frameIdx * WITCH_FRAME_W, 0, WITCH_FRAME_W, WITCH_FRAME_H, witchX, witchY, witchW, witchH);
    }

    // 百分比文字
    ctx.fillStyle = '#5a4a2a';
    ctx.font = `bold ${Math.floor(14 * s)}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(progress + '%', W / 2, barY + barH + 22 * s);
  }

  _drawTinyStar(ctx, cx, cy, r, color) {
    ctx.save();
    ctx.fillStyle = color;
    ctx.beginPath();
    for (let i = 0; i < 4; i++) {
      const angle = (i * Math.PI / 2) - Math.PI / 4;
      const x = cx + Math.cos(angle) * r;
      const y = cy + Math.sin(angle) * r;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  resetState() {
    this.sparkles = [];
    this.flyingScore = null;
    this.scoreRoll = null;
    this.scoreAnim = null;
    this.goldAnim = null;
    this._lashParticles = [];
    this._lastFloatingText = null;
    this.debugMenuOpen = false;
    this.pressedBtn = null;
    this.settlementRenderer.claimBtnPressed = false;
    this.witchRewardRenderer.okBtnPressed = false;
    this.witchRewardRenderer.stashBtnPressed = false;
    this.witchRewardRenderer.useBtnPressed = false;
    // 清理图鉴相关点击区域，防止 restart 后残留
    this.cardBookCellRects = [];
    this.cardBookDetailPanelRect = null;
    this.cardBookEquipBtnRect = null;
    // 清理结算渲染器残留数据，防止旧 Game 对象被闭包引用
    if (this.settlementRenderer) {
      this.settlementRenderer.lastSettlementData = null;
      this.settlementRenderer.animStartTime = null;
    }
  }

  drawShopCardIcon(x, y, size, name) {
    const ctx = this.ctx;
    const data = this.shopCardImages[name];
    if (data && data.loaded && data.img) {
      ctx.drawImage(data.img, x, y, size, size);
    } else {
      // fallback: 装饰圆
      ctx.beginPath();
      ctx.arc(x + size / 2, y + size / 2, size / 2, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(255,255,255,0.12)';
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.25)';
      ctx.lineWidth = 1 * this.scale;
      ctx.stroke();
    }
  }

  _getWitchLetters(trigger) {
    switch (trigger) {
      case 'letter_a': return ['A'];
      case 'letter_e': return ['E'];
      case 'has_vowel': return ['A', 'E', 'I', 'O', 'U'];
      case 'has_face': return ['J', 'Q', 'X', 'Y', 'Z'];
      case 'initial_vowel': return ['A', 'E', 'I', 'O', 'U'];
      default: return null;
    }
  }

  _drawStar(ctx, cx, cy, outerR, innerR, spikes = 5, rotation = 0) {
    let rot = Math.PI / 2 * 3 + rotation;
    let x = cx;
    let y = cy;
    let step = Math.PI / spikes;
    ctx.beginPath();
    ctx.moveTo(cx + Math.cos(rot) * outerR, cy + Math.sin(rot) * outerR);
    for (let i = 0; i < spikes; i++) {
      x = cx + Math.cos(rot) * outerR;
      y = cy + Math.sin(rot) * outerR;
      ctx.lineTo(x, y);
      rot += step;
      x = cx + Math.cos(rot) * innerR;
      y = cy + Math.sin(rot) * innerR;
      ctx.lineTo(x, y);
      rot += step;
    }
    ctx.closePath();
    ctx.fill();
  }

  // 绘制虚线空位
  _drawEmptySlot(ctx, x, y, w, h, s, type = null) {
    // 如果有对应的空位图片，优先使用（cover 模式裁剪到圆角矩形）
    if (type) {
      const imgName = type === 'witch' ? 'empty_witch_card' : 'empty_potion_card';
      const data = this.shopCardImages[imgName];
      if (data && data.loaded && data.img) {
        const r = 4 * s;
        ctx.save();
        ctx.beginPath();
        ctx.moveTo(x + r, y);
        ctx.lineTo(x + w - r, y);
        ctx.quadraticCurveTo(x + w, y, x + w, y + r);
        ctx.lineTo(x + w, y + h - r);
        ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
        ctx.lineTo(x + r, y + h);
        ctx.quadraticCurveTo(x, y + h, x, y + h - r);
        ctx.lineTo(x, y + r);
        ctx.quadraticCurveTo(x, y, x + r, y);
        ctx.closePath();
        ctx.clip();

        const cardAspect = w / h;
        const aspect = (data.width > 0 && data.height > 0)
          ? data.width / data.height
          : cardAspect;
        let drawW, drawH, imgX, imgY;
        if (aspect > cardAspect) {
          drawW = w;
          drawH = drawW / aspect;
          imgX = x;
          imgY = y + (h - drawH) / 2;
        } else {
          drawH = h;
          drawW = drawH * aspect;
          imgX = x + (w - drawW) / 2;
          imgY = y;
        }
        ctx.drawImage(data.img, imgX, imgY, drawW, drawH);
        ctx.restore();
        return;
      }
    }

    // 兜底：虚线框
    ctx.save();
    ctx.strokeStyle = 'rgba(196,163,90,0.3)';
    ctx.lineWidth = 1.2 * s;
    ctx.setLineDash([3 * s, 3 * s]);
    ctx.beginPath();
    const r = 4 * s;
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();
  }

  _roundedRectPath(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
  }

  roundRect(x, y, w, h, r, fill, stroke, lineWidth = 2) {
    const ctx = this.ctx;
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.lineTo(x + w, y + h - r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.lineTo(x + r, y + h);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.lineTo(x, y + r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
    if (fill) { ctx.fillStyle = fill; ctx.fill(); }
    if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = lineWidth; ctx.stroke(); }
  }

  text(str, x, y, size, color, align = 'center') {
    const ctx = this.ctx;
    ctx.font = `${Math.floor(size * this.scale)}px sans-serif`;
    ctx.fillStyle = color;
    ctx.textAlign = align;
    ctx.textBaseline = 'middle';
    ctx.fillText(str, x, y);
  }

  button(label, x, y, w, h, color, textColor = '#fff') {
    this.roundRect(x, y, w, h, 8 * this.scale, color);
    this.text(label, x + w / 2, y + h / 2, 16, textColor);
    return { x, y, w, h };
  }

  drawBtnImage(name, x, y, w, h) {
    const ctx = this.ctx;
    const btn = this.btnImages[name];
    if (btn && btn.loaded && btn.img) {
      ctx.drawImage(btn.img, x, y, w, h);
    } else {
      // 图片未加载时显示占位色块
      this.roundRect(x, y, w, h, 8 * this.scale, '#555');
    }
  }

  drawCard(card, x, y, isNew = false, displayScoreOverride = null) {
    const ctx = this.ctx;
    const w = this.cardW;
    const h = this.cardH;
    const s = this.scale;

    // 应用动画偏移
    let drawX = x;
    let drawY = y;
    let rotation = 0;
    let scale = 1;
    let opacity = 1;

    if (card.animOffset) {
      drawX += card.animOffset.x || 0;
      drawY += card.animOffset.y || 0;
      rotation = card.animOffset.rotation || 0;
      opacity = card.animOffset.opacity !== undefined ? card.animOffset.opacity : 1;
      scale = card.animOffset.scale || 1;
    }

    if (card.selectOffset) {
      drawY += card.selectOffset;
    }
    if (card.jumpOffsetY) {
      drawY += card.jumpOffsetY;
    }

    // 提示高亮：可爱小抖动 + 边框水波纹（持续直到用户点击任意卡牌）
    if (card._hintHighlight) {
      const elapsed = Date.now() - card._hintHighlight.startTime;
      const t1 = elapsed / 70;
      const t2 = elapsed / 95 + 1.2;
      const t3 = elapsed / 110 + 0.5;
      // 小幅位移：左右 1.2px，上下 0.9px，不同频叠加更灵动
      drawX += (Math.sin(t1) * 0.7 + Math.sin(t3) * 0.5) * s;
      drawY += (Math.sin(t2) * 0.55 + Math.cos(t3) * 0.35) * s;
      // 轻微摇头：±1.8 度
      rotation += Math.sin(elapsed / 85) * 1.8;

      // 边框水波纹：2 层从卡牌边框向外扩散的圆角矩形
      const cx = drawX + w / 2;
      const cy = drawY + h / 2;
      const aspect = h / w;
      const maxExpand = 22 * s;
      for (let i = 0; i < 2; i++) {
        const phase = (elapsed / 800 + i * 0.5) % 1;
        const expand = phase * maxExpand;
        const rw = w + expand * 2;
        const rh = h + expand * 2 * aspect;
        const alpha = 0.28 * (1 - phase);
        ctx.save();
        ctx.globalAlpha = alpha;
        this.roundRect(cx - rw / 2, cy - rh / 2, rw, rh, 10 * s, null, 'rgba(196,163,90,0.9)', 1 * s);
        ctx.restore();
      }
    }

    ctx.save();
    ctx.globalAlpha *= opacity;
    ctx.translate(drawX + w / 2, drawY + h / 2);
    ctx.rotate((rotation * Math.PI) / 180);
    ctx.scale(scale, scale);

    const hw = w / 2;
    const hh = h / 2;
    const darkBlue = '#1a2f4a';
    const warmGold = '#9a7b3d';

    // === 1. 背景图（普通 / 选中态） ===
    if (card.selected && this.cardTemplateSelected && this.cardTemplateSelectedLoaded) {
      ctx.drawImage(this.cardTemplateSelected, -hw, -hh, w, h);
    } else if (this.cardTemplate && this.cardTemplateLoaded) {
      ctx.drawImage(this.cardTemplate, -hw, -hh, w, h);
    } else {
      // 兜底：暖白色圆角矩形
      this.roundRect(-hw, -hh, w, h, 10 * s, '#faf6ee', '#c4a35a');
    }

    // === 2. 大写字母 ===
    ctx.font = `bold ${Math.floor(32 * s)}px Georgia, 'Times New Roman', serif`;
    ctx.fillStyle = darkBlue;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(card.letter, 0, -hh + h * 0.33 - 2 * s + 1 * s);

    // === 3. 分数（支持过渡动画 + 脉冲强调）===
    ctx.save();
    const scoreX = 0;
    const scoreY = -hh + h * 0.74;
    ctx.translate(scoreX, scoreY);

    // 字母之神分数脉冲动画（放大→回弹，与 HUD 分数更新一致）
    let scoreScale = 1;
    if (card._scorePulseAnim) {
      const pulse = this._calcPulseScale(card._scorePulseAnim, 0.35);
      scoreScale = pulse.scale;
      if (pulse.progress >= 1) {
        delete card._scorePulseAnim;
      }
    }
    if (card._scoreScale) {
      scoreScale = card._scoreScale;
    }
    ctx.scale(scoreScale, scoreScale);

    let displayScore = displayScoreOverride !== null ? displayScoreOverride : card.score;

    ctx.font = `bold ${Math.floor(11 * s)}px Georgia, serif`;
    ctx.fillStyle = darkBlue;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(`${displayScore}分`, 0, 0);
    ctx.restore();

    // === 6. 新牌标记 ===
    if (isNew) {
      ctx.font = `bold ${Math.floor(10 * s)}px sans-serif`;
      ctx.fillStyle = '#2ecc71';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('NEW', -hw + 16 * s, -hh + 14 * s);
    }

    // === 7. Face 牌标记（JQK） ===
    if (card.isFace) {
      ctx.font = `bold ${Math.floor(10 * s)}px sans-serif`;
      ctx.fillStyle = warmGold;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('★', hw - 10 * s, hh - 10 * s);
    }

    ctx.restore();
    ctx.globalAlpha = 1;
  }

  hitTest(x, y, rects) {
    if (!rects) return null;
    for (let i = rects.length - 1; i >= 0; i--) {
      const r = rects[i];
      if (x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h) {
        return r;
      }
    }
    return null;
  }

}

module.exports = { Renderer };
