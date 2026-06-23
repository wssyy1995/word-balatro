const { formatMeaning, isValidWordOnline } = require('../game');
const { WORD_DATA, onlineWordCache, wordCheckState, LETTER_SCORE, letterUpgrades } = require('../data');
const { SettlementRenderer, WitchRewardRenderer } = require('../settlement');
const { ShopRenderer, ConfirmBuyRenderer, MysteryDiscountRenderer, SHOP_POOL } = require('../shop');
const { getSkillForLevel, WITCH_SKILLS, WITCH_CARDS } = require('../witch_skills');
const { Easing } = require('../animation');
const { GameOverRenderer } = require('./gameover');
const { BattleRenderer } = require('../battle/renderer');

class Renderer {
  constructor(ctx, width, height) {
    this.ctx = ctx;
    this.W = width;
    this.H = height;
    
    // 安全区域（刘海屏/灵动岛适配）—— 先获取，供 scale 计算参考
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

    // 响应式基准计算
    // 使用 min(width/375, height/667) 确保在任何屏幕上都适配
    const baseScale = Math.min(width / 375, height / 667);
    // 限制最大缩放，避免在 iPad 上元素过大
    this.scale = Math.min(baseScale, 1.4);
    // 限制最小缩放，避免在小屏幕上元素过小
    this.scale = Math.max(this.scale, 0.8);

    // 折叠屏/矮屏适配：当 scale 被放大到 1.0 以上，且 740*s 超过可用高度时，
    // 整体缩小 scale，避免在 16:10 折叠屏（如 HUAWEI Pura X 内屏）上内容溢出。
    // 注意：playing/shop/life_extended 页面整体下移了 10px，所以额外预留 10px。
    const requiredHeight = Math.floor(740 * this.scale + 10);
    const availableHeight = height - this.safeTop - this.safeBottom;
    if (this.scale > 1.0 && requiredHeight > availableHeight && availableHeight > 0) {
      this.scale = Math.max((availableHeight - 10) / 740, 0.75);
    }

    // 计算卡牌尺寸（支持最多4列）
    const maxCardW = Math.floor((width - 48) / 4); // 4列，左右边距24
    const maxCardH = Math.floor((height - 200) / 3); // 最多3行，预留上方HUD和下方按钮
    this.cardW = Math.min(Math.floor(74 * this.scale), maxCardW);
    this.cardH = Math.min(Math.floor(88 * this.scale), maxCardH);
    this.gap = Math.floor(8 * this.scale);
    
    this.animations = [];
    
    // 背景图强制从云存储加载（云端下载成功后通过 injectBgIconToRenderer 注入）
    this.bgImage = null;
    this.bgLoaded = false;

    // 商店分类栏背景图（由 cloudStorage 在预加载时注入）
    this.shopCardBarImages = {};
    
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

    // top bar 图标（由 cloudStorage.injectBgIconToRenderer 从云存储注入）
    this.topIcon = null;
    this.topIconLoaded = false;

    // 加载提示按钮图标
    this.helpIcon = null;
    this.helpIconLoaded = false;
    try {
      const helpImg = wx.createImage();
      helpImg.src = 'images/help.png';
      helpImg.onload = () => { this.helpIconLoaded = true; };
      helpImg.onerror = () => { this.helpIconLoaded = false; };
      this.helpIcon = helpImg;
    } catch (e) {
      this.helpIconLoaded = false;
    }

    // 加载转发按钮图标
    this.shareIcon = null;
    this.shareIconLoaded = false;
    try {
      const shareImg = wx.createImage();
      shareImg.src = 'images/share.png';
      shareImg.onload = () => { this.shareIconLoaded = true; };
      shareImg.onerror = () => { this.shareIconLoaded = false; };
      this.shareIcon = shareImg;
    } catch (e) {
      this.shareIconLoaded = false;
    }

    // 加载求助弹窗资源（pop_close 本地加载，buy_tip/share_tip 由 cloudStorage 统一预加载）
    this.tipHelpImages = {};
    ['pop_close'].forEach(name => {
      try {
        const img = wx.createImage();
        img.src = `images/${name}.png`;
        img.onload = () => { this.tipHelpImages[name] = { img, loaded: true }; };
        img.onerror = () => { this.tipHelpImages[name] = { img, loaded: false }; };
        this.tipHelpImages[name] = { img, loaded: false };
      } catch (e) {
        this.tipHelpImages[name] = { img: null, loaded: false };
      }
    });
    
    // 加载按钮图片
    this.pressedBtn = null;
    this._homepagePressedBtn = null;
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

    // 对战轮次徽章背景图强制从云存储注入，见 cloud_storage.injectBgIconToRenderer
    this.battleRoundBadge = null;
    this.battleRoundBadgeLoaded = false;

    // 对战玩家 VS 条背景图强制从云存储注入，见 cloud_storage.injectBgIconToRenderer
    this.battlePlayer = null;
    this.battlePlayerLoaded = false;

    // 对战 VS 徽章图强制从云存储注入，见 cloud_storage.injectBgIconToRenderer
    this.battleVS = null;
    this.battleVSLoaded = false;

    // 对战单词预览区装饰线 / 主玩法计分方块装饰线强制从云存储注入，见 cloud_storage.injectBgIconToRenderer
    this.scoreLine = null;
    this.scoreLineLoaded = false;
    this.scoreLineImg = null;
    this.scoreLineImgLoaded = false;

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
    // card_book.png 强制从云存储注入，见 cloud_storage.injectBgIconToRenderer
    // 不再尝试加载本地 images/bg_icon/card_book.png，避免文件缺失报错

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

    // 加载名字标签
    this.nameTagImage = null;
    this.nameTagLoaded = false;
    try {
      const img = wx.createImage();
      img.src = 'images/name_tag.png';
      img.onload = () => { this.nameTagLoaded = true; };
      img.onerror = () => { this.nameTagLoaded = false; };
      this.nameTagImage = img;
    } catch (e) {
      this.nameTagLoaded = false;
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

    // 加载女巫牌倍率下降图标
    this.cardValueDownIcon = null;
    this.cardValueDownIconLoaded = false;
    try {
      const img = wx.createImage();
      img.src = 'images/card_value_down.png';
      img.onload = () => { this.cardValueDownIconLoaded = true; };
      img.onerror = () => { this.cardValueDownIconLoaded = false; };
      this.cardValueDownIcon = img;
    } catch (e) {
      this.cardValueDownIconLoaded = false;
    }

    // 加载 discount 标签图标（女巫奖励5折）
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

    // discount 标签雪碧图（迷之优惠6~9折，每帧100x100）强制从云存储注入
    // 不再尝试加载本地 images/bg_icon/discount_spritesheet.png，避免文件缺失报错
    this.discountSpritesheet = null;
    this.discountSpritesheetLoaded = false;

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

    // 主页图片（由 cloudStorage.injectBgIconToRenderer 从云存储注入）
    this.homepageBg = null;
    this.homepageBgLoaded = false;
    this.homepageRound = null;
    this.homepageRoundLoaded = false;
    this.homepageBattle = null;
    this.homepageBattleLoaded = false;
    this.homepageSetting = null;
    this.homepageSettingLoaded = false;
    this.homepageRanking = null;
    this.homepageRankingLoaded = false;
    this.homepageDaily = null;
    this.homepageDailyLoaded = false;
    this.homepageStudy = null;
    this.homepageStudyLoaded = false;
    this.homepageBtnRects = [];
    this.homepageAnimStartTime = Date.now();
    this._homepageBubbleStarted = false;
    this._homepageBubbleCount = 0;
    this._homepageBigBtnSoundPlayed = false;
    this._homepageEntryAnim = null;
    this._homepageEntryBGMStarted = false;

    // 卡牌背景图强制从云存储加载（云端下载成功后通过 injectBgIconToRenderer 注入）
    this.cardTemplate = null;
    this.cardTemplateLoaded = false;
    this.cardTemplateSelected = null;
    this.cardTemplateSelectedLoaded = false;
    this.cardTemplateUpgrade = null;
    this.cardTemplateUpgradeLoaded = false;
    this.cardTemplateUpgradeSelected = null;
    this.cardTemplateUpgradeSelectedLoaded = false;
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
    const settingIconNames = ['sound', 'study', 'wordbook', 'rank', 'feedback', 'right'];
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

    // Toast 提示图标
    this.toastIcon = { img: null, loaded: false, width: 0, height: 0 };
    try {
      const img = wx.createImage();
      img.src = 'images/toast_icon.png';
      img.onload = () => { this.toastIcon = { img, loaded: true, width: img.width, height: img.height }; };
      img.onerror = () => { this.toastIcon = { img: null, loaded: false, width: 0, height: 0 }; };
    } catch (e) {
      this.toastIcon = { img: null, loaded: false, width: 0, height: 0 };
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
    // 迷之优惠优惠券图片（非 SHOP_POOL 商品，单独初始化占位）
    this.shopCardImages['cupon'] = { img: null, loaded: false, width: 0, height: 0 };
    
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
    this._equippedLetters = new Set(); // 已装备女巫卡牌对应的字母集合
    
    // 子渲染器
    this.settlementRenderer = new SettlementRenderer(this);
    this.witchRewardRenderer = new WitchRewardRenderer(this);
    this.shopRenderer = new ShopRenderer(this);
    this.confirmBuyRenderer = new ConfirmBuyRenderer(this);
    this.gameOverRenderer = new GameOverRenderer(this);
    this.mysteryDiscountRenderer = new MysteryDiscountRenderer(this);
    this.battleRenderer = new BattleRenderer(this);
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
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  // 主页 → 游戏翻页过渡动画（古卷展轴）
  drawPageFlip(game, state) {
    const ctx = this.ctx;
    const W = this.W;
    const H = this.H;
    const s = this.scale;

    const elapsed = Date.now() - state.startTime;
    const duration = state.duration || 1200;
    const t = Math.min(elapsed / duration, 1);
    const eased = Easing.easeInOutQuad(t);

    if (eased < 0.5) {
      // === 第一阶段：homepage 像古卷一样从右向左卷起 ===
      const roll = eased * 2;

      // 1. 底层游戏页面（playing）
      this.render(game);

      // 2. homepage 未卷起部分
      ctx.save();
      ctx.beginPath();
      ctx.rect(0, 0, W * (1 - roll), H);
      ctx.clip();
      this.drawHomepage();
      ctx.restore();

      // 3. 卷轴
      const rollX = W * (1 - roll);
      const rollR = (6 + roll * 10) * s;

      // 卷轴阴影
      ctx.fillStyle = 'rgba(80,50,20,0.5)';
      ctx.fillRect(rollX - 2 * s, -2 * s, rollR + 4 * s, H + 4 * s);

      // 卷轴本体渐变
      const g = ctx.createLinearGradient(rollX, 0, rollX + rollR, 0);
      g.addColorStop(0, '#e8d5a0');
      g.addColorStop(0.5, '#f5e8c0');
      g.addColorStop(1, '#c4a86c');
      ctx.fillStyle = g;
      ctx.fillRect(rollX, -1 * s, rollR, H + 2 * s);

      // 卷轴上下木轴装饰
      ctx.fillStyle = '#a08050';
      ctx.fillRect(rollX - 2 * s, -4 * s, rollR + 4 * s, 8 * s);
      ctx.fillRect(rollX - 2 * s, H - 4 * s, rollR + 4 * s, 8 * s);
      ctx.fillStyle = '#d4af60';
      ctx.fillRect(rollX, -3 * s, rollR, 6 * s);
      ctx.fillRect(rollX, H - 3 * s, rollR, 6 * s);

      // 卷轴边缘金色粒子
      for (let i = 0; i < 5; i++) {
        ctx.fillStyle = `rgba(255,220,140,${0.3 + 0.4 * Math.random()})`;
        ctx.beginPath();
        ctx.arc(rollX - 4 * s + Math.random() * 12 * s, Math.random() * H, 1.5 * s, 0, Math.PI * 2);
        ctx.fill();
      }
    } else {
      // === 第二阶段：playing 页面已完全露出，添加展开光效 ===
      const unroll = (eased - 0.5) * 2;

      this.render(game);

      const glowX = W * unroll;
      const g2 = ctx.createLinearGradient(glowX - 30 * s, 0, glowX + 10 * s, 0);
      g2.addColorStop(0, 'rgba(255,240,200,0)');
      g2.addColorStop(0.5, 'rgba(255,230,180,0.3)');
      g2.addColorStop(1, 'rgba(255,240,200,0)');
      ctx.fillStyle = g2;
      ctx.fillRect(glowX - 30 * s, 0, 40 * s, H);

      for (let i = 0; i < 8; i++) {
        ctx.fillStyle = `rgba(220,170,80,${0.25 + 0.35 * Math.random()})`;
        ctx.beginPath();
        ctx.arc(glowX + Math.random() * 20 * s - 10 * s, Math.random() * H, (1.3 + Math.random() * 2.5) * s, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    if (t >= 1) {
      state.complete = true;
    }
  }

  drawHomepage() {
    const ctx = this.ctx;
    const W = this.W;
    const H = this.H;
    const s = this.scale;

    // 背景图
    if (this.homepageBg && this.homepageBgLoaded) {
      ctx.drawImage(this.homepageBg, 0, 0, W, H);
    } else {
      ctx.fillStyle = '#0a1628';
      ctx.fillRect(0, 0, W, H);
    }

    // 游戏标题（与预加载页保持一致）
    ctx.save();
    ctx.font = `${Math.floor(30 * s)}px ${this.titleFontFamily}`;
    ctx.fillStyle = '#8b6914';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('女巫的词牌', W / 2, H * 0.18);
    ctx.restore();

    this.homepageBtnRects = [];
    const elapsed = Date.now() - this.homepageAnimStartTime;

    // 主页入场动画：预加载页 → 主页时，在两个大按钮位置播放
    const ENTRY_ANIM_DURATION = 3200;   // 入场动画总时长
    const ENTRY_BTN_START = 1200;       // 按钮开始弹出的时间点
    const ENTRY_BGM_DURATION = 1200;
    const entryOffset = this._homepageEntryAnim ? ENTRY_BTN_START : 0;
    const game = wx.game;
    if (this._homepageEntryAnim) {
      const entryElapsed = Date.now() - this._homepageEntryAnim.startTime;
      if (entryElapsed < ENTRY_ANIM_DURATION) {
        const animCX = W / 2;
        const animCY = H * 0.49;
        this._drawHomepageEntryAnim(ctx, animCX, animCY, s, entryElapsed);
        // 金色圆环动画开始时播放 witch_guide_1_bg 音效
        if (entryElapsed < ENTRY_BGM_DURATION && !this._homepageEntryBGMStarted && game && game.audioManager) {
          this._homepageEntryBGMStarted = true;
          game.audioManager.play('witch_guide_1_bg');
        }
      }
    }

    // 4 个小按钮开始弹出时播放 bubble 音效（重复 2 次）
    const bubbleElapsed = elapsed - entryOffset;
    if (bubbleElapsed < 800) {
      this._homepageBubbleStarted = false;
      this._homepageBubbleCount = 0;
    }
    if (bubbleElapsed >= 900 && !this._homepageBubbleStarted && game && game.audioManager) {
      this._homepageBubbleStarted = true;
      this._homepageBubbleCount = 0;
      this._homepageBubbleNextTime = Date.now();
    }
    if (this._homepageBubbleStarted && this._homepageBubbleCount < 2 && game && game.audioManager) {
      if (Date.now() >= this._homepageBubbleNextTime) {
        game.audioManager.play('bubble');
        this._homepageBubbleCount++;
        this._homepageBubbleNextTime = Date.now() + 180;
      }
    }

    // 两个大按钮开始弹出时播放 homepage_big_button 音效（每次展示 homepage 仅一次）
    const bigBtnElapsed = elapsed - entryOffset;
    if (bigBtnElapsed < 100) {
      this._homepageBigBtnSoundPlayed = false;
    }
    if (bigBtnElapsed >= 150 && !this._homepageBigBtnSoundPlayed && game && game.audioManager) {
      game.audioManager.play('homepage_big_button');
      this._homepageBigBtnSoundPlayed = true;
    }

    // 按钮入场缩放（果冻感）
    const getBtnScale = (delay, duration) => {
      const e = elapsed - delay - entryOffset;
      if (e <= 0) return 0;
      const progress = Math.min(e / duration, 1);
      return Easing.easeOutBackStrong(progress);
    };

    // 小按钮光晕（位于按钮下方，跟随按钮一起缩放）
    const drawGlowHalo = (cx, cy, w, h, alpha = 1) => {
      ctx.save();
      ctx.translate(cx, cy);

      const haloW = w * 1.15;
      const haloH = h * 1.15;
      const grad = ctx.createRadialGradient(
        0, 0, 0,
        0, 0, Math.max(haloW, haloH) / 2
      );
      grad.addColorStop(0, `rgba(255, 230, 40, ${0.08 * alpha})`);
      grad.addColorStop(0.35, `rgba(255, 222, 0, ${0.26 * alpha})`);
      grad.addColorStop(0.55, `rgba(255, 215, 0, ${0.30 * alpha})`);
      grad.addColorStop(0.75, `rgba(255, 220, 20, ${0.16 * alpha})`);
      grad.addColorStop(1, 'rgba(255, 225, 60, 0)');

      // 柔和弥散发光
      ctx.shadowBlur = 16 * s;
      ctx.shadowColor = `rgba(255, 215, 0, ${0.18 * alpha})`;

      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.ellipse(0, 0, haloW / 2, haloH / 2, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    };

    // 辅助函数：按宽度适配绘制图片按钮，支持缩放、光晕与立体感
    const drawImgBtn = (img, loaded, cx, cy, maxW, maxH, key, animScale = 1, showGlow = false, glowAlpha = 1, showDepth = false) => {
      let recordW = maxW;
      let recordH = maxH;
      if (loaded && img && img.width > 0 && img.height > 0) {
        const aspect = img.width / img.height;
        let drawW = maxW;
        let drawH = drawW / aspect;
        if (drawH > maxH) {
          drawH = maxH;
          drawW = drawH * aspect;
        }
        recordW = drawW;
        recordH = drawH;
      }

      if (animScale > 0) {
        ctx.save();
        ctx.translate(cx, cy);
        ctx.scale(animScale, animScale);
        ctx.translate(-cx, -cy);

        // 光晕在按钮图层下方，跟随按钮一起缩放
        if (showGlow && glowAlpha > 0) {
          drawGlowHalo(cx, cy, recordW, recordH, glowAlpha);
        }

        // 立体感：下方阴影（金色投影，随按钮飘动呼吸渐变）
        if (showDepth) {
          ctx.save();
          const shadowY = recordH * 0.52;
          const shadowW = recordW * 0.78;
          const shadowH = recordH * 0.14;
          const floatFactor = 0.75 - 0.25 * Math.sin((Date.now() / 1000) * 1.6);
          const sg = ctx.createRadialGradient(cx, cy + shadowY, 0, cx, cy + shadowY, shadowW / 2);
          sg.addColorStop(0, `rgba(255, 210, 70, ${0.32 * floatFactor})`);
          sg.addColorStop(0.45, `rgba(255, 185, 35, ${0.14 * floatFactor})`);
          sg.addColorStop(1, 'rgba(255, 160, 0, 0)');
          ctx.fillStyle = sg;
          ctx.beginPath();
          ctx.ellipse(cx, cy + shadowY, shadowW / 2, shadowH / 2, 0, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();
        }

        if (!loaded || !img || img.width <= 0 || img.height <= 0) {
          const fx = cx - maxW / 2;
          const fy = cy - maxH / 2;
          this.roundRect(fx, fy, maxW, maxH, 8 * s, 'rgba(255,255,255,0.15)', 'rgba(255,255,255,0.35)', 1 * s);
          ctx.font = `bold ${Math.floor(12 * s)}px sans-serif`;
          ctx.fillStyle = '#fff';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(key.replace('homepage', ''), cx, cy);
        } else {
          const drawX = cx - recordW / 2;
          const drawY = cy - recordH / 2;
          ctx.drawImage(img, drawX, drawY, recordW, recordH);


        }
        ctx.restore();
      }

      this.homepageBtnRects.push({ x: cx - recordW / 2, y: cy - recordH / 2, w: recordW, h: recordH, key });
    };

    // 中间 45% 高度：左右两个大按钮先缩放弹出
    const bigBtnMaxW = W * 0.75;
    const bigBtnMaxH = H * 0.26;
    const bigBtnY = H * 0.49;
    const bigGap = W * 0.08;

    const bigBtnInfos = [
      { img: this.homepageRound, loaded: this.homepageRoundLoaded, key: 'round', delay: 150 },
      { img: this.homepageBattle, loaded: this.homepageBattleLoaded, key: 'battle', delay: 150 },
    ].map(({ img, loaded, key, delay }) => {
      let drawW = bigBtnMaxW;
      let drawH = bigBtnMaxH;
      if (loaded && img && img.width > 0 && img.height > 0) {
        const aspect = img.width / img.height;
        drawW = bigBtnMaxW;
        drawH = drawW / aspect;
        if (drawH > bigBtnMaxH) {
          drawH = bigBtnMaxH;
          drawW = drawH * aspect;
        }
      }
      return { img, loaded, key, drawW, drawH, delay };
    });

    const bigTotalW = bigBtnInfos.reduce((sum, b) => sum + b.drawW, 0) + bigGap;
    let bigX = (W - bigTotalW) / 2;
    bigBtnInfos.forEach(({ img, loaded, key, drawW, drawH, delay }) => {
      const cx = bigX + drawW / 2;
      const scale = getBtnScale(delay, 550);
      drawImgBtn(img, loaded, cx, bigBtnY, drawW, drawH, key, scale);
      bigX += drawW + bigGap;
    });

    // 两个大按钮斜光扫过（round=紫色，battle=绿色），仅在大按钮完全弹出后开始
    const bigBtnFinishTime = entryOffset + 150 + 550;
    if (elapsed >= bigBtnFinishTime && this.homepageBtnRects.length >= 2) {
      const roundRect = this.homepageBtnRects[0];
      const battleRect = this.homepageBtnRects[1];
      this._drawRectSweep(ctx, roundRect.x, roundRect.y, roundRect.w, roundRect.h, s, 'purple', 0);
      this._drawRectSweep(ctx, battleRect.x, battleRect.y, battleRect.w, battleRect.h, s, 'green', 0.5);
    }

    // 下方 65% 高度：4 个小按钮依次从左往右缩放弹出
    const smallBtnMaxW = W * 0.24;
    const smallBtnMaxH = H * 0.12;
    const smallBtnY = H * 0.74;
    const smallGap = 14 * s;
    const smallKeys = [
      { img: this.homepageSetting, loaded: this.homepageSettingLoaded, key: 'setting' },
      { img: this.homepageRanking, loaded: this.homepageRankingLoaded, key: 'ranking' },
      { img: this.homepageDaily, loaded: this.homepageDailyLoaded, key: 'daily' },
      { img: this.homepageStudy, loaded: this.homepageStudyLoaded, key: 'study' },
    ];

    const smallBtnInfos = smallKeys.map(({ img, loaded, key }) => {
      let drawW = smallBtnMaxW;
      let drawH = smallBtnMaxH;
      if (loaded && img && img.width > 0 && img.height > 0) {
        const aspect = img.width / img.height;
        drawW = smallBtnMaxW;
        drawH = drawW / aspect;
        if (drawH > smallBtnMaxH) {
          drawH = smallBtnMaxH;
          drawW = drawH * aspect;
        }
      }
      return { img, loaded, key, drawW, drawH };
    });

    const smallTotalW = smallBtnInfos.reduce((sum, b) => sum + b.drawW, 0) + smallGap * 3;
    let smallX = (W - smallTotalW) / 2;
    smallBtnInfos.forEach(({ img, loaded, key, drawW, drawH }, i) => {
      const cx = smallX + drawW / 2;
      const delay = 900 + i * 150;
      const duration = 550;
      const scale = getBtnScale(delay, duration);
      const glowProgress = (elapsed - delay - entryOffset) / duration;
      const showGlow = glowProgress > 0;
      const glowFadeDuration = 350;
      let glowAlpha = 1;
      if (glowProgress > 1) {
        glowAlpha = Math.max(0, 1 - (glowProgress - 1) * duration / glowFadeDuration);
      }
      const floatOffset = Math.sin((Date.now() / 1000) * 1.6) * 1 * s;
      drawImgBtn(img, loaded, cx, smallBtnY + floatOffset, drawW, drawH, key, scale, showGlow, glowAlpha, true);
      smallX += drawW + smallGap;
    });
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
    this.newWitchCardCollectBtnRect = null;
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
        const r = 9 * s;
        ctx.save();
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
    const r = 9 * s;
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

  // 根据已装备的女巫卡牌更新对应字母集合（装备某张 WITCH_CARDS 后，
  // 该卡牌 card_letter 对应的字母牌使用升级模板）
  _updateEquippedLetters(game) {
    this._equippedLetters = new Set();
    if (!game || !game.equippedWitchCards || game.equippedWitchCards.length === 0) return;
    for (const level of game.equippedWitchCards) {
      const witchCard = WITCH_CARDS.find(c => {
        const cardLevel = parseInt(c.card_id.replace('witch_card_', ''), 10);
        return cardLevel === level;
      });
      if (witchCard && witchCard.card_letter) {
        this._equippedLetters.add(witchCard.card_letter.toUpperCase());
      }
    }
  }

  drawCard(card, x, y, isNew = false, displayScoreOverride = null, sweepColor = null) {
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

    // 提示高亮：缓和可爱抖动 + 装备按钮风格边框水波纹
    if (card._hintHighlight) {
      const elapsed = Date.now() - card._hintHighlight.startTime;
      // 可爱抖动（效果略微增强）
      const t1 = elapsed / 130;
      const t2 = elapsed / 170 + 1.2;
      const t3 = elapsed / 200 + 0.5;
      drawX += (Math.sin(t1) * 0.65 + Math.sin(t3) * 0.4) * s;
      drawY += (Math.sin(t2) * 0.55 + Math.cos(t3) * 0.35) * s;
      rotation += Math.sin(elapsed / 150) * 1.6;

      // 装备按钮风格边框水波纹：连续生成，避免循环重置闪烁
      const RING_INTERVAL = 1300;
      const RING_DURATION = 2100;
      const RING_FADE_IN = 300; // 开头淡入，避免突然出现金色色块
      const maxExpand = 12 * s;
      const br = 10 * s;
      if (!card._hintHighlight.rings) {
        card._hintHighlight.rings = [];
      }
      const rings = card._hintHighlight.rings;
      const now = Date.now();
      if (rings.length === 0 || now - rings[rings.length - 1].start > RING_INTERVAL) {
        rings.push({ start: now });
      }
      while (rings.length > 0 && now - rings[0].start > RING_DURATION) {
        rings.shift();
      }
      for (const ring of rings) {
        const ringElapsed = Math.max(0, now - ring.start);
        const progress = Math.min(ringElapsed / RING_DURATION, 1);
        const expand = progress * maxExpand;
        let alpha = 0.7 * (1 - progress) * (1 - progress);
        // 开头淡入，避免突然出现金色色块
        if (ringElapsed < RING_FADE_IN) {
          alpha *= ringElapsed / RING_FADE_IN;
        }
        // alpha 接近 0 时跳过绘制，避免微亮残留
        if (alpha <= 0.001) continue;

        const ex = drawX - expand;
        const ey = drawY - expand;
        const ew = w + expand * 2;
        const eh = h + expand * 2;
        const er = br + expand;

        ctx.save();
        ctx.beginPath();
        ctx.moveTo(ex + er, ey);
        ctx.lineTo(ex + ew - er, ey);
        ctx.quadraticCurveTo(ex + ew, ey, ex + ew, ey + er);
        ctx.lineTo(ex + ew, ey + eh - er);
        ctx.quadraticCurveTo(ex + ew, ey + eh, ex + ew - er, ey + eh);
        ctx.lineTo(ex + er, ey + eh);
        ctx.quadraticCurveTo(ex, ey + eh, ex, ey + eh - er);
        ctx.lineTo(ex, ey + er);
        ctx.quadraticCurveTo(ex, ey, ex + er, ey);
        ctx.closePath();
        ctx.fillStyle = `rgba(243, 156, 18, ${alpha * 0.2})`;
        ctx.fill();
        ctx.strokeStyle = `rgba(243, 156, 18, ${alpha})`;
        ctx.lineWidth = 2.0 * s;
        ctx.stroke();
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

    // === 1. 背景图（普通 / 选中态 / 升级态 / 升级选中态） ===
    const isUpgradeLetter = this._equippedLetters && this._equippedLetters.has((card.letter || '').toUpperCase());
    if (card.selected && isUpgradeLetter && this.cardTemplateUpgradeSelected && this.cardTemplateUpgradeSelectedLoaded) {
      ctx.drawImage(this.cardTemplateUpgradeSelected, -hw, -hh, w, h);
    } else if (card.selected && this.cardTemplateSelected && this.cardTemplateSelectedLoaded) {
      ctx.drawImage(this.cardTemplateSelected, -hw, -hh, w, h);
    } else if (isUpgradeLetter && this.cardTemplateUpgrade && this.cardTemplateUpgradeLoaded) {
      ctx.drawImage(this.cardTemplateUpgrade, -hw, -hh, w, h);
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

    // === 8. 通关/对战模式斜光扫过 ===
    if (sweepColor) {
      const sweepOffset = (card.letter ? card.letter.charCodeAt(0) : 0) * 0.05;
      this._drawCardSweep(ctx, w, h, s, sweepColor, sweepOffset);
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
