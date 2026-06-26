// ===== 微信云存储管理器 =====
// 环境 ID: cloud1-d3gecbtu10e4035de

const { WITCH_SKILLS } = require('./witch_skills');

// 云存储文件 ID 前缀
const CLOUD_BASE = 'cloud://cloud1-d3gecbtu10e4035de.636c-cloud1-d3gecbtu10e4035de-1429704466';
function c(path) { return CLOUD_BASE + path; }

class CloudStorageManager {
  constructor(env) {
    this.env = env;
    this.shopCardImages = {}; // { name: { img, loaded, width, height } }
    this.witchImages = {};    // { name: { img, loaded, width, height } }
    this.witchCardImages = {}; // { name: { img, loaded, width, height } }
    this.bgIconImages = {};   // { name: { img, loaded, width, height } }
    this.guideImages = {};    // { witch_1: { frames: [...], loaded: false }, witch_2: ... }
    this.guideSpritesheets = {}; // { witch_4: { img, loaded } } 精灵图缓存
    this.rankAvatarImages = {}; // { name: { img, loaded, width, height } }
    this.cloudFileMap = {};   // { name: fileID }
    this.witchFileMap = {};   // { name: fileID }
    this.witchCardFileMap = {}; // { name: fileID }
    this.bgIconFileMap = {};  // { name: fileID }
    this.guideFileMap = {};   // { 'witch_guide_1_spritesheet': fileID, ... }
    this.musicFileMap = {};   // { name: fileID }
    this.rankAvatarFileMap = {}; // { name: fileID }
    this.musicCache = {};     // { name: localPath }
    this.initialized = false;
    this.uploading = false;
    this.debugLogs = [];

    // 默认云文件映射（已上传的 shop_card 图片，fileID 固定）
    this.defaultFileMap = {
      'life_extension': c('/shop_card/life_extension.png'),
      'bonus_gold': c('/shop_card/bonus_gold.png'),
      'change_letter': c('/shop_card/change_letter.png'),
      'extra_discard': c('/shop_card/extra_discard.png'),
      'extra_hands': c('/shop_card/extra_hands.png'),
      'extra_letter': c('/shop_card/extra_letter.png'),
      'has_face': c('/shop_card/has_face.png'),
      'has_vowel': c('/shop_card/has_vowel.png'),
      'initial_vowel': c('/shop_card/initial_vowel.png'),
      'length_4': c('/shop_card/length_4.png'),
      'length_5': c('/shop_card/length_5.png'),
      'length_6': c('/shop_card/length_6.png'),
      'letter_a': c('/shop_card/letter_a.png'),
      'letter_e': c('/shop_card/letter_e.png'),
      'reduce_target': c('/shop_card/reduce_target.png'),
      'upgrade_any': c('/shop_card/upgrade_any.png'),
      'upgrade_face': c('/shop_card/upgrade_face.png'),
      'upgrade_letter': c('/shop_card/upgrade_letter.png'),
      'shield_illegal':c('/shop_card/shield_illegal.png'),
      'zero_hands_bonus':c('/shop_card/zero_hands_bonus.png'),
      'illegal_boost':c('/shop_card/illegal_boost.png'),
      'random_upgrade':c('/shop_card/random_upgrade.png'),
      'replicate_letter':c('/shop_card/replicate_letter.png'),
      'letter_god':c('/shop_card/letter_god.png'),
      'last_chance':c('/shop_card/last_chance.png'),
      'reroll_skill':c('/shop_card/reroll_skill.png'),
      'haste_play':c('/shop_card/haste_play.png'),
      'firstend_same':c('/shop_card/firstend_same.png'),
      'double_same':c('/shop_card/double_same.png'),
      'initial_succession':c('/shop_card/initial_succession.png'),
      'end_s':c('/shop_card/end_s.png'),
      'end_ed':c('/shop_card/end_ed.png'),
      'predicted_letter':c('/shop_card/predicted_letter.png'),
      'no_duplicate':c('/shop_card/no_duplicate.png'),
      'chaos_orb':c('/shop_card/chaos_orb.png'),
      'left_right_open':c('/shop_card/left_right_open.png'),
      'is_new_word':c('/shop_card/is_new_word.png'),
      'replicate_letter':c('/shop_card/replicate_letter.png'),
      'mystery_discount':c('/shop_card/mystery_discount.png'),
      'cupon':c('/shop_card/cupon.png'),
      'absorb_stars':c('/shop_card/absorb_stars.png'),
      'starlight_wash':c('/shop_card/starlight_wash.png'),
      'equal_split':c('/shop_card/equal_split.png'),
    };

    // 默认 witch 图片云文件映射
    // 根据 WITCH_SKILLS 配置动态生成，避免硬编码和重复
    this.defaultWitchFileMap = {};
    const witchBase = c('/witch');
    WITCH_SKILLS.forEach(skill => {
      if (skill && skill.level) {
        const key = `witch_${skill.level}`;
        this.defaultWitchFileMap[key] = `${witchBase}/${key}.png`;
      }
    });

    // 默认 witch_card 图片云文件映射
    // 根据 WITCH_SKILLS 配置动态生成，避免硬编码和重复
    this.defaultWitchCardFileMap = {};
    const witchCardBase = c('/witch/witch_card');
    WITCH_SKILLS.forEach(skill => {
      if (skill && skill.level) {
        const key = `witch_card_${skill.level}`;
        this.defaultWitchCardFileMap[key] = `${witchCardBase}/${key}.png`;
      }
    });

    // 默认 bg_icon 图片云文件映射
    this.defaultBgIconFileMap = {
      'bg': c('/bg_icon/bg.png'),
      'buy_tip': c('/bg_icon/buy_tip.png'),
      'share_tip': c('/bg_icon/share_tip.png'),
      'share_tip_limit': c('/bg_icon/share_tip_limit.png'),
      'card_bar': c('/bg_icon/card_bar.png'),
      'card_book': c('/bg_icon/card_book.png'),
      'shop_card_bar_witch': c('/bg_icon/shop_card_bar_witch.png'),
      'shop_card_bar_crystal': c('/bg_icon/shop_card_bar_crystal.png'),
      'shop_card_bar_potion': c('/bg_icon/shop_card_bar_potion.png'),
      'card_template': c('/bg_icon/card_template.png'),
      'card_template_selected': c('/bg_icon/card_template_selected_new.png'),
      'card_template_upgrade': c('/bg_icon/card_template_upgrade9.png'),
      'card_template_upgrade_selected': c('/bg_icon/card_template_upgrade_selected2.png'),
      'battle_player_left': c('/bg_icon/battle_player_left.png'),
      'battle_player_right': c('/bg_icon/battle_player_right.png'),
      'battle_round_badge': c('/bg_icon/battle_round_badge.png'),
      'battle_vs': c('/bg_icon/battle_vs.png'),
      'battle_match': c('/bg_icon/battle_match.png'),
      'battle_match_sword': c('/bg_icon/battle_match_sword.png'),
      'score_line': c('/bg_icon/score_line.png'),
      'discount_spritesheet': c('/bg_icon/discount_spritesheet.png'),
      'homepageBg': c('/bg_icon/homepage_bg.png'),
      'homepageTitle': c('/bg_icon/homepage_title.png'),
      'homepageRound': c('/bg_icon/hompage_round.png'),
      'homepageBattle': c('/bg_icon/hompage_battle.png'),
      'homepageSetting': c('/bg_icon/hompage_setting.png'),
      'homepageRanking': c('/bg_icon/hompage_ranking.png'),
      'homepageDaily': c('/bg_icon/hompage_daily.png'),
      'homepageStudy': c('/bg_icon/hompage_study.png'),
      'topHome': c('/bg_icon/top_home.png')
    };

    // 默认 rank_avatar 图片云文件映射
    this.defaultRankAvatarFileMap = {};
    const rankAvatarBase = c('/rank_avatar');
    for (let i = 1; i <= 4; i++) {
      this.defaultRankAvatarFileMap[`rank_avatar_${i}`] = `${rankAvatarBase}/rank_avatar_${i}.png`;
    }

    // 默认 music 云文件映射（只包含代码中有实际 play() 调用的音效）
    this.defaultMusicFileMap = {
      'buy_success': c('/music/sound_effect/buy_success.mp3'),
      'card_illegal': c('/music/sound_effect/card_illegal.mp3'),
      'card_placement': c('/music/sound_effect/card_placement.mp3'),
      'card_shuffle': c('/music/sound_effect/card_shuffle.mp3'),
      'card_valid': c('/music/sound_effect/card_valid.mp3'),
      'challenge': c('/music/sound_effect/challange.mp3'),
      'fail': c('/music/sound_effect/fail.mp3'),
      'game_over': c('/music/sound_effect/game_over.mp3'),
      'heart_beat': c('/music/sound_effect/heart_beat.mp3'),
      'round_win': c('/music/sound_effect/round_win.mp3'),
      'tap': c('/music/sound_effect/tap.mp3'),
      'card_sell': c('/music/sound_effect/card_sell.mp3'),
      'card_book_page': c('/music/sound_effect/card_book_page.mp3'),
      'card_jump': c('/music/sound_effect/card_jump.mp3'),
      'answer_tone': c('/music/sound_effect/answer_tone.mp3'),
      'word_score': c('/music/sound_effect/word_score.mp3'),
      'spin_wheel': c('/music/sound_effect/spin_whell.mp3'),
      'guide_type': c('/music/sound_effect/type_2.mp3'),
      'witch_guide_1_bg': c('/music/sound_effect/witch_guide_1_bg.mp3'),
      'win_success': c('/music/sound_effect/win_success.mp3'),
      'bubble': c('/music/sound_effect/bubble.mp3'),
      'homepage_round_tap': c('/music/sound_effect/homepage_round_tap.mp3'),
      'homepage_big_button': c('/music/sound_effect/homepage_big_button.mp3'),
      'battle_match_sccess': c('/music/sound_effect/battle_match_sccess.mp3'),
      'cloth_flap': c('/music/sound_effect/cloth_flap.mp3'),
      'battle_countdown': c('/music/sound_effect/battle_countdown.mp3')
    };

    // 默认 guide 云文件映射（witch_guide_1~4 均使用精灵图）
    this.defaultGuideFileMap = {};
    const guideBase = c('/witch/guide');
    this.defaultGuideFileMap['witch_guide_1_spritesheet'] = `${guideBase}/witch_guide_1/spritesheet.png`;
    this.defaultGuideFileMap['witch_guide_2_spritesheet'] = `${guideBase}/witch_guide_2/spritesheet.png`;
    this.defaultGuideFileMap['witch_guide_3_spritesheet'] = `${guideBase}/witch_guide_3/spritesheet.png`;
    this.defaultGuideFileMap['witch_guide_4_spritesheet'] = `${guideBase}/witch_guide_4/spritesheet.png`;
  }

  init() {
    try {
      wx.cloud.init({ env: this.env, traceUser: false });
      this.initialized = true;
      this.log('云开发初始化成功，env=' + this.env);
    } catch (e) {
      this.log('云开发初始化失败: ' + (e && e.message ? e.message : String(e)));
    }

    // 先用硬编码的默认映射兜底
    this.cloudFileMap = { ...this.defaultFileMap };

    // 再用本地缓存覆盖（如果用户重新上传过）
    try {
      const stored = wx.getStorageSync('cloud_shop_card_map');
      if (stored) {
        const localMap = JSON.parse(stored);
        this.cloudFileMap = { ...this.cloudFileMap, ...localMap };
        this.log('本地缓存映射已加载，共' + Object.keys(localMap).length + '张');
      } else {
        this.log('无本地缓存，使用默认云映射，共' + Object.keys(this.defaultFileMap).length + '张');
      }
    } catch (e) {
      this.log('本地缓存读取失败: ' + (e && e.message ? e.message : String(e)));
    }

    // 先用默认 witch 映射兜底
    this.witchFileMap = { ...this.defaultWitchFileMap };

    // 加载 witch 图片的本地缓存映射
    try {
      const witchStored = wx.getStorageSync('cloud_witch_map');
      if (witchStored) {
        const witchLocalMap = JSON.parse(witchStored);
        this.witchFileMap = { ...this.witchFileMap, ...witchLocalMap };
        this.log('witch 本地缓存映射已加载，共' + Object.keys(witchLocalMap).length + '张');
      } else {
        this.log('无 witch 本地缓存，使用默认云映射，共' + Object.keys(this.defaultWitchFileMap).length + '张');
      }
    } catch (e) {
      this.log('witch 本地缓存读取失败: ' + (e && e.message ? e.message : String(e)));
    }

    // 先用默认 witch_card 映射兜底
    this.witchCardFileMap = { ...this.defaultWitchCardFileMap };

    // 加载 witch_card 图片的本地缓存映射
    try {
      const witchCardStored = wx.getStorageSync('cloud_witch_card_map');
      if (witchCardStored) {
        const witchCardLocalMap = JSON.parse(witchCardStored);
        this.witchCardFileMap = { ...this.witchCardFileMap, ...witchCardLocalMap };
        this.log('witch_card 本地缓存映射已加载，共' + Object.keys(witchCardLocalMap).length + '张');
      } else {
        this.log('无 witch_card 本地缓存，使用默认云映射，共' + Object.keys(this.defaultWitchCardFileMap).length + '张');
      }
    } catch (e) {
      this.log('witch_card 本地缓存读取失败: ' + (e && e.message ? e.message : String(e)));
    }

    // 先用默认 bg_icon 映射兜底
    this.bgIconFileMap = { ...this.defaultBgIconFileMap };

    // 加载 bg_icon 图片的本地缓存映射
    try {
      const bgIconStored = wx.getStorageSync('cloud_bg_icon_map');
      if (bgIconStored) {
        const bgIconLocalMap = JSON.parse(bgIconStored);
        this.bgIconFileMap = { ...this.bgIconFileMap, ...bgIconLocalMap };
        this.log('bg_icon 本地缓存映射已加载，共' + Object.keys(bgIconLocalMap).length + '张');
      } else {
        this.log('无 bg_icon 本地缓存');
      }
    } catch (e) {
      this.log('bg_icon 本地缓存读取失败: ' + (e && e.message ? e.message : String(e)));
    }

    // 先用默认 guide 映射兜底
    this.guideFileMap = { ...this.defaultGuideFileMap };

    // 加载 guide 图片的本地缓存映射
    try {
      const guideStored = wx.getStorageSync('cloud_guide_map');
      if (guideStored) {
        const guideLocalMap = JSON.parse(guideStored);
        this.guideFileMap = { ...this.guideFileMap, ...guideLocalMap };
        this.log('guide 本地缓存映射已加载，共' + Object.keys(guideLocalMap).length + '张');
      } else {
        this.log('无 guide 本地缓存，使用默认云映射，共' + Object.keys(this.defaultGuideFileMap).length + '张');
      }
    } catch (e) {
      this.log('guide 本地缓存读取失败: ' + (e && e.message ? e.message : String(e)));
    }

    // 先用默认 music 映射兜底
    this.musicFileMap = { ...this.defaultMusicFileMap };

    // 加载 music 的本地缓存映射
    try {
      const musicStored = wx.getStorageSync('cloud_music_map');
      if (musicStored) {
        const musicLocalMap = JSON.parse(musicStored);
        this.musicFileMap = { ...this.musicFileMap, ...musicLocalMap };
        this.log('music 本地缓存映射已加载，共' + Object.keys(musicLocalMap).length + '个');
      } else {
        this.log('无 music 本地缓存');
      }
    } catch (e) {
      this.log('music 本地缓存读取失败: ' + (e && e.message ? e.message : String(e)));
    }

    // 先用默认 rank_avatar 映射兜底
    this.rankAvatarFileMap = { ...this.defaultRankAvatarFileMap };

    // 加载 rank_avatar 的本地缓存映射
    try {
      const rankAvatarStored = wx.getStorageSync('cloud_rank_avatar_map');
      if (rankAvatarStored) {
        const rankAvatarLocalMap = JSON.parse(rankAvatarStored);
        this.rankAvatarFileMap = { ...this.rankAvatarFileMap, ...rankAvatarLocalMap };
        this.log('rank_avatar 本地缓存映射已加载，共' + Object.keys(rankAvatarLocalMap).length + '张');
      } else {
        this.log('无 rank_avatar 本地缓存，使用默认云映射，共' + Object.keys(this.defaultRankAvatarFileMap).length + '张');
      }
    } catch (e) {
      this.log('rank_avatar 本地缓存读取失败: ' + (e && e.message ? e.message : String(e)));
    }
  }

  log(msg) {
    const line = '[' + new Date().toLocaleTimeString() + '] ' + msg;
    this.debugLogs.push(line);
    if (this.debugLogs.length > 30) this.debugLogs.shift();
    console.log('[Cloud]', msg);
  }

  // 是否已上传过 shop_card 图片
  hasUploaded() {
    return Object.keys(this.cloudFileMap).length > 0;
  }

  // 上传 images/shop_card 目录下所有 .png 到云存储
  async uploadShopCards() {
    if (this.uploading) return { success: false, message: '正在上传中...' };
    this.uploading = true;

    const results = { success: [], failed: [] };
    const fs = wx.getFileSystemManager();

    // 动态扫描目录下所有 .png 文件
    let files = [];
    try {
      files = fs.readdirSync('images/shop_card/');
    } catch (e) {
      this.log('读取目录失败: ' + (e && e.message ? e.message : String(e)));
      this.uploading = false;
      return { success: false, message: '读取目录失败', error: e };
    }

    const pngFiles = files.filter(f => f.endsWith('.png'));
    this.log('扫描 images/shop_card/ 目录下');
    this.log('扫描到 ' + pngFiles.length + ' 张本地图片');

    for (const fileName of pngFiles) {
      const name = fileName.replace(/\.png$/i, '');
      const localPath = `images/shop_card/${fileName}`;
      const cloudPath = `shop_card/${fileName}`;

      this.log('新增图片 ' + name);
      this.log('开始上传 ' + name);

      let uploadRes = null;
      let lastError = null;
      for (let attempt = 1; attempt <= 3; attempt++) {
        try {
          uploadRes = await wx.cloud.uploadFile({
            cloudPath,
            filePath: localPath,
          });
          break;
        } catch (e) {
          lastError = e;
          if (attempt < 3) {
            this.log('上传失败，1秒后第' + (attempt + 1) + '次重试: ' + name);
            await new Promise(r => setTimeout(r, 1000));
          }
        }
      }

      if (uploadRes) {
        this.cloudFileMap[name] = uploadRes.fileID;
        results.success.push({ name, fileID: uploadRes.fileID });
        this.log('上传成功 ' + name);
      } else {
        console.error('上传失败:', name, lastError);
        this.log('上传失败: ' + name + ' ' + (lastError && lastError.message ? lastError.message : String(lastError)));
        results.failed.push({ name, error: lastError });
      }
    }

    // 保存映射到本地缓存
    try {
      wx.setStorageSync('cloud_shop_card_map', JSON.stringify(this.cloudFileMap));
    } catch (e) {}

    this.uploading = false;
    return results;
  }

  // ===== 图片本地文件缓存基础设施 =====
  _getImageCacheDir() {
    return `${wx.env.USER_DATA_PATH}/image_cache`;
  }

  _getImageCachePath(name) {
    return `${this._getImageCacheDir()}/${name}.png`;
  }

  _ensureImageCacheDir() {
    const fs = wx.getFileSystemManager();
    const dir = this._getImageCacheDir();
    try {
      fs.accessSync(dir);
    } catch (e) {
      try {
        fs.mkdirSync(dir, true);
      } catch (err) {
        this.log('创建图片缓存目录失败: ' + (err && err.message ? err.message : String(err)));
      }
    }
  }

  _isImageCached(name) {
    const fs = wx.getFileSystemManager();
    try {
      fs.accessSync(this._getImageCachePath(name));
      return true;
    } catch (e) {
      return false;
    }
  }

  async _getTempFileURL(fileID) {
    let urlData = null;
    let lastError = null;
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        const res = await new Promise((resolve, reject) => {
          wx.cloud.getTempFileURL({
            fileList: [fileID],
            success: resolve,
            fail: reject,
          });
        });
        const data = res.fileList[0];
        if (data && data.status === 0 && data.tempFileURL) {
          urlData = data.tempFileURL;
          break;
        }
        lastError = new Error(data ? (data.errMsg || 'status=' + data.status) : 'urlData=null');
      } catch (e) {
        lastError = e;
      }
      if (attempt < 3) {
        await new Promise(r => setTimeout(r, 1000));
      }
    }
    if (!urlData && lastError) {
      this.log('获取临时URL失败: ' + (lastError.message || String(lastError)));
    }
    return urlData;
  }

  async _downloadImageToCache(url, cachePath) {
    return new Promise((resolve) => {
      wx.downloadFile({
        url,
        success: (res) => {
          if (res.statusCode === 200) {
            try {
              const fs = wx.getFileSystemManager();
              fs.saveFileSync(res.tempFilePath, cachePath);
              resolve(cachePath);
            } catch (e) {
              this.log('保存图片缓存失败: ' + (e && e.message ? e.message : String(e)));
              resolve(null);
            }
          } else {
            this.log('下载图片失败 status=' + res.statusCode);
            resolve(null);
          }
        },
        fail: (e) => {
          this.log('下载图片失败: ' + (e && e.message ? e.message : String(e)));
          resolve(null);
        }
      });
    });
  }

  async _createImage(src) {
    return new Promise((resolve) => {
      const img = wx.createImage();
      img.onload = () => resolve(img);
      img.onerror = (e) => {
        this.log('图片加载失败: src=' + (img.src || '').slice(0, 80) + ' err=' + (e && e.message ? e.message : 'unknown'));
        resolve(null);
      };
      img.src = src;
    });
  }

  // 加载单张图片源（优先本地缓存，否则下载到本地再加载，失败则回退临时 URL），返回 img 或 null
  async _loadCachedImageSource(name, fileID, tempURL = null) {
    this._ensureImageCacheDir();
    const cachePath = this._getImageCachePath(name);

    // 本地已缓存：直接加载本地文件
    if (this._isImageCached(name)) {
      return this._createImage(cachePath);
    }

    // 没有缓存：获取 URL 并下载
    let finalURL = tempURL;
    if (!finalURL && fileID) {
      finalURL = await this._getTempFileURL(fileID);
    }
    if (!finalURL) return null;

    const downloadedPath = await this._downloadImageToCache(finalURL, cachePath);
    if (downloadedPath) {
      return this._createImage(downloadedPath);
    }
    // 下载失败回退：直接加载临时 URL
    return this._createImage(finalURL);
  }

  // 通用图片加载：优先本地缓存，否则下载到本地再加载，失败则回退临时 URL
  async _loadImageWithCache(name, fileID, targetMap, tempURL = null) {
    const existing = targetMap[name];
    if (existing && existing.loaded && existing.img) return;

    const img = await this._loadCachedImageSource(name, fileID, tempURL);
    if (img) {
      targetMap[name] = { img, loaded: true, width: img.width || 0, height: img.height || 0 };
    } else {
      targetMap[name] = { img: null, loaded: false, width: 0, height: 0 };
    }
  }

  // 从云存储下载并缓存所有 shop_card 图片（后台静默加载）
  async preloadShopCardImages(onProgress = null) {
    const names = Object.keys(this.cloudFileMap);
    if (names.length === 0) {
      this.log('没有云存储图片映射，跳过预加载');
      return;
    }

    this.log('开始下载 shop_card 图片，共' + names.length + '张');

    // === 批量获取临时 URL（带重试，失败则回退到逐个获取）===
    let urlMap = {};
    const fileList = names.map(name => this.cloudFileMap[name]).filter(Boolean);

    for (let batchAttempt = 1; batchAttempt <= 2; batchAttempt++) {
      try {
        const res = await new Promise((resolve, reject) => {
          wx.cloud.getTempFileURL({ fileList, success: resolve, fail: reject });
        });
        if (res.fileList && res.fileList.length > 0) {
          res.fileList.forEach(item => {
            if (item.status === 0 && item.tempFileURL) {
              const name = names.find(n => this.cloudFileMap[n] === item.fileID);
              if (name) urlMap[name] = item.tempFileURL;
            }
          });
        }
        break;
      } catch (e) {
        this.log('批量获取 shop_card URL 失败(' + batchAttempt + '/2): ' + (e && e.message ? e.message : String(e)));
        if (batchAttempt < 2) await new Promise(r => setTimeout(r, 800));
      }
    }

    // 批量获取失败后，剩余未获取到的逐个回退获取（_loadCloudImage 内部自带3次URL重试+2次图片加载重试）
    const missingNames = names.filter(n => !urlMap[n] && this.cloudFileMap[n]);
    if (missingNames.length > 0) {
      this.log('批量获取未覆盖 ' + missingNames.length + ' 个 shop_card，逐个回退获取');
      for (const name of missingNames) {
        await this._loadCloudImage(name);
      }
    }

    // === 分批并行加载图片（每批 6 张，控制内存峰值）===
    const batchSize = 6;
    const loadedNames = names.filter(n => urlMap[n]);
    for (let i = 0; i < loadedNames.length; i += batchSize) {
      const batch = loadedNames.slice(i, i + batchSize);
      await Promise.all(batch.map(name => {
        return this._loadCloudImage(name, urlMap[name]).then(() => {
          if (onProgress) onProgress();
        });
      }));
    }

    const loaded = Object.keys(this.shopCardImages).filter(n => this.shopCardImages[n].loaded);
    const failed = names.filter(n => !this.shopCardImages[n] || !this.shopCardImages[n].loaded);
    this.log('shop_card 目录下 ' + loaded.length + '/' + names.length + ' 张图片下载完成');
    if (failed.length > 0) {
      this.log('shop_card 失败：' + failed.join(', '));
    }
  }

  // 递归扫描 images/witch/ 及其子目录下的所有 .png
  _scanWitchDir(fs, dirPath) {
    const results = [];
    try {
      const entries = fs.readdirSync(dirPath);
      for (const entry of entries) {
        const fullPath = `${dirPath}/${entry}`;
        const stat = fs.statSync(fullPath);
        if (stat.isDirectory()) {
          results.push(...this._scanWitchDir(fs, fullPath));
        } else if (entry.endsWith('.png')) {
          const relPath = fullPath.replace(/^images\/witch\//, '');
          results.push({ localPath: fullPath, fileName: entry, relPath });
        }
      }
    } catch (e) {
      console.error('扫描目录失败:', dirPath, e);
    }
    return results;
  }

  // 上传 images/witch 目录下所有 .png（含子目录 witch_guide_1 / witch_guide_2）到云存储
  async uploadWitchImages() {
    if (this.uploading) return { success: false, message: '正在上传中...' };
    this.uploading = true;

    const results = { success: [], failed: [] };
    const fs = wx.getFileSystemManager();

    const allFiles = this._scanWitchDir(fs, 'images/witch');
    this.log('扫描 images/witch/ 目录（含子目录）');
    this.log('扫描到 ' + allFiles.length + ' 张本地 witch 图片');

    for (const file of allFiles) {
      const { localPath, fileName, relPath } = file;

      let name, cloudPath, fileType;
      if (relPath.startsWith('witch_card/')) {
        // witch_card 子目录：witch_card/witch_card_3.png → cloud: witch/witch_card/witch_card_3.png
        name = fileName.replace(/\.png$/i, ''); // witch_card_3
        cloudPath = `witch/${relPath}`;
        fileType = 'witch_card';
      } else if (relPath.includes('/')) {
        // 其他子目录（witch_guide）：witch_guide_1/1.png → cloud: witch/guide/witch_guide_1/1.png
        // witch_guide_1~4 均使用精灵图，只上传 spritesheet.png
        if (relPath.startsWith('witch_guide_1/') || relPath.startsWith('witch_guide_2/') ||
            relPath.startsWith('witch_guide_3/') || relPath.startsWith('witch_guide_4/')) {
          if (fileName !== 'spritesheet.png') continue; // 跳过旧帧图，只上传精灵图
        }
        name = relPath.replace(/\.png$/i, '').replace(/\//g, '_'); // witch_guide_1_spritesheet
        cloudPath = `witch/guide/${relPath}`;
        fileType = 'guide';
      } else {
        // 一级目录文件：witch_21.png → cloud: witch/witch_21.png
        name = fileName.replace(/\.png$/i, '');
        cloudPath = `witch/${fileName}`;
        fileType = 'witch';
      }

      this.log('开始上传 ' + cloudPath);

      let uploadRes = null;
      let lastError = null;
      for (let attempt = 1; attempt <= 3; attempt++) {
        try {
          uploadRes = await wx.cloud.uploadFile({
            cloudPath,
            filePath: localPath,
          });
          break;
        } catch (e) {
          lastError = e;
          if (attempt < 3) {
            this.log('上传失败，1秒后第' + (attempt + 1) + '次重试: ' + name);
            await new Promise(r => setTimeout(r, 1000));
          }
        }
      }

      if (uploadRes) {
        if (fileType === 'witch_card') {
          this.witchCardFileMap[name] = uploadRes.fileID;
        } else if (fileType === 'guide') {
          this.guideFileMap[name] = uploadRes.fileID;
        } else {
          this.witchFileMap[name] = uploadRes.fileID;
        }
        results.success.push({ name, fileID: uploadRes.fileID, type: fileType });
        this.log('上传成功 ' + cloudPath);
      } else {
        console.error('上传失败:', name, lastError);
        this.log('上传失败 ' + cloudPath + ' ' + (lastError && lastError.message ? lastError.message : String(lastError)));
        results.failed.push({ name, error: lastError });
      }
    }

    // 保存映射到本地缓存
    try {
      wx.setStorageSync('cloud_witch_map', JSON.stringify(this.witchFileMap));
      wx.setStorageSync('cloud_witch_card_map', JSON.stringify(this.witchCardFileMap));
      wx.setStorageSync('cloud_guide_map', JSON.stringify(this.guideFileMap));
    } catch (e) {}

    this.uploading = false;
    return results;
  }

  // 从云存储下载并缓存所有 witch 图片（后台静默加载）
  async preloadWitchImages(onProgress = null) {
    const names = Object.keys(this.witchFileMap);
    if (names.length === 0) {
      this.log('没有 witch 云存储映射，跳过预加载');
      return;
    }

    this.log('开始下载 witch 图片，共' + names.length + '张');
    // 分批加载，每批 5 张，避免并行过多导致内存峰值过高
    const batchSize = 5;
    for (let i = 0; i < names.length; i += batchSize) {
      const batch = names.slice(i, i + batchSize);
      await Promise.all(batch.map(async name => {
        await this._loadWitchImage(name);
        if (onProgress) onProgress();
      }));
    }
    const loaded = Object.keys(this.witchImages).filter(n => this.witchImages[n].loaded);
    const failed = names.filter(n => !this.witchImages[n] || !this.witchImages[n].loaded);
    this.log('witch 目录下 ' + loaded.length + '/' + names.length + ' 张图片下载完成');
    if (failed.length > 0) {
      this.log('witch 失败：' + failed.join(', '));
    }
  }

  async _loadCloudImage(name, tempURL = null) {
    const fileID = this.cloudFileMap[name];
    await this._loadImageWithCache(name, fileID, this.shopCardImages, tempURL);
  }

  async _loadWitchImage(name) {
    const fileID = this.witchFileMap[name];
    await this._loadImageWithCache(name, fileID, this.witchImages);
  }

  // 获取已缓存的云图片
  getImage(name) {
    return this.shopCardImages[name] || null;
  }

  getWitchImage(name) {
    return this.witchImages[name] || null;
  }

  // 将云缓存图片注入到 renderer 的 shopCardImages
  injectToRenderer(renderer) {
    let count = 0;
    Object.keys(this.shopCardImages).forEach(name => {
      const data = this.shopCardImages[name];
      if (data && data.loaded && renderer.shopCardImages[name]) {
        renderer.shopCardImages[name] = data;
        count++;
      }
    });
    this.log('已注入 renderer: ' + count + '张');
  }

  // 将云缓存 witch 图片注入到 renderer 的 witchAvatars
  injectWitchToRenderer(renderer) {
    let count = 0;
    Object.keys(this.witchImages).forEach(name => {
      const data = this.witchImages[name];
      if (data && data.loaded && renderer.witchAvatars[name]) {
        renderer.witchAvatars[name] = data;
        count++;
      }
    });
    this.log('已注入 witch renderer: ' + count + '张');
  }

  // 按需下载并注入指定 level 的女巫头像（当前回合进行时，后台预加载下一回合头像）
  async preloadWitchAvatarForLevel(level, renderer) {
    const name = `witch_${level}`;

    // 1. renderer 已缓存则跳过
    const avatar = renderer.witchAvatars[name];
    if (avatar && avatar.loaded && avatar.img) {
      return;
    }

    // 2. cloudStorage 已缓存则直接注入
    const cached = this.witchImages[name];
    if (cached && cached.loaded && cached.img) {
      renderer.witchAvatars[name] = cached;
      return;
    }

    // 3. 无云映射则跳过
    const fileID = this.witchFileMap[name];
    if (!fileID) {
      this.log('无云映射，跳过下载女巫头像: ' + name);
      return;
    }

    // 4. 下载并注入
    await this._loadWitchImage(name);
    const data = this.witchImages[name];
    if (data && data.loaded && renderer.witchAvatars[name]) {
      renderer.witchAvatars[name] = data;
      this.log('已按需注入女巫头像: ' + name);
    }
  }

  // 按需下载并注入指定 level 的女巫卡牌（witch_card）
  async preloadWitchCardForLevel(level, renderer) {
    const name = `witch_card_${level}`;

    // 1. renderer 已缓存则跳过
    const card = renderer.witchCardImages[name];
    if (card && card.loaded && card.img) {
      return;
    }

    // 2. cloudStorage 已缓存则直接注入
    const cached = this.witchCardImages[name];
    if (cached && cached.loaded && cached.img) {
      renderer.witchCardImages[name] = cached;
      return;
    }

    // 3. 无云映射则跳过
    const fileID = this.witchCardFileMap[name];
    if (!fileID) {
      this.log('无云映射，跳过下载女巫卡牌: ' + name);
      return;
    }

    // 4. 下载并注入
    await this._loadWitchCardImage(name);
    const data = this.witchCardImages[name];
    if (data && data.loaded && renderer.witchCardImages[name]) {
      renderer.witchCardImages[name] = data;
      this.log('已按需注入女巫卡牌: ' + name);
    }
  }

  async _loadWitchCardImage(name) {
    const fileID = this.witchCardFileMap[name];
    await this._loadImageWithCache(name, fileID, this.witchCardImages);
  }

  // 将云缓存 witch_card 图片注入到 renderer
  injectWitchCardToRenderer(renderer) {
    let count = 0;
    Object.keys(this.witchCardImages).forEach(name => {
      const data = this.witchCardImages[name];
      if (data && data.loaded && renderer.witchCardImages[name]) {
        renderer.witchCardImages[name] = data;
        count++;
      }
    });
    this.log('已注入 witch_card renderer: ' + count + '张');
  }

  // 从云存储下载并缓存所有 guide 帧序列图片
  async preloadGuideImages(onProgress = null) {
    const names = Object.keys(this.guideFileMap);
    if (names.length === 0) {
      this.log('没有 guide 云存储映射，跳过预加载');
      return;
    }

    this.log('开始下载 guide 图片，共' + names.length + '张');
    const batchSize = 5;
    for (let i = 0; i < names.length; i += batchSize) {
      const batch = names.slice(i, i + batchSize);
      await Promise.all(batch.map(async name => {
        if (name.endsWith('_spritesheet')) {
          const match = name.match(/^witch_guide_(\d+)_spritesheet$/);
          if (match) {
            await this._loadGuideSpritesheet(name, match[1]);
          }
        } else {
          await this._loadGuideImage(name);
        }
        if (onProgress) onProgress();
      }));
    }

    let frameLoaded = 0;
    let frameTotal = 0;
    Object.keys(this.guideImages).forEach(gk => {
      const frames = this.guideImages[gk].frames;
      frameTotal += frames.length;
      frameLoaded += frames.filter(f => f && f.loaded).length;
    });

    let sheetLoaded = 0;
    Object.keys(this.guideSpritesheets).forEach(gk => {
      if (this.guideSpritesheets[gk].loaded) sheetLoaded++;
    });

    this.log(`guide 目录下 帧序列 ${frameLoaded}/${frameTotal}，精灵图 ${sheetLoaded} 张下载完成`);
  }

  async _loadGuideImage(name) {
    const fileID = this.guideFileMap[name];
    if (!fileID) return;

    // 解析 name: witch_guide_1_1 → groupKey='witch_1', frameIdx=0
    const match = name.match(/^witch_guide_(\d+)_(\d+)$/);
    if (!match) return;
    const guideNum = match[1];
    const frameNum = parseInt(match[2], 10);
    const groupKey = `witch_${guideNum}`;
    const frameIdx = frameNum - 1;

    if (!this.guideImages[groupKey]) {
      this.guideImages[groupKey] = { frames: [], loaded: false };
    }

    // 重复加载防护
    const existing = this.guideImages[groupKey].frames[frameIdx];
    if (existing && existing.loaded && existing.img) {
      return;
    }

    if (existing && existing.img) {
      existing.img.src = '';
    }

    const img = await this._loadCachedImageSource(name, fileID);
    this.guideImages[groupKey].frames[frameIdx] = img
      ? { img, loaded: true }
      : { img: null, loaded: false };
  }

  // 下载 guide 精灵图（单张大图）
  async _loadGuideSpritesheet(name, groupNum) {
    const fileID = this.guideFileMap[name];
    if (!fileID) {
      this.log('云存储映射不存在: ' + name);
      return;
    }

    const groupKey = `witch_${groupNum}`;

    // 重复加载防护
    const existing = this.guideSpritesheets[groupKey];
    if (existing && existing.loaded && existing.img) {
      return;
    }

    if (existing && existing.img) {
      existing.img.src = '';
    }

    const img = await this._loadCachedImageSource(name, fileID);
    this.guideSpritesheets[groupKey] = img
      ? { img, loaded: true }
      : { img: null, loaded: false };
  }

  // 按需下载指定 guide 组（如 witch_guide_3），并注入 renderer
  async preloadGuideGroup(groupNum, renderer) {
    const groupKey = `witch_${groupNum}`;
    const rendererGroup = renderer.guideImages[groupKey];

    // 精灵图模式（如 witch_guide_4）：单张大图
    if (rendererGroup && rendererGroup.type === 'spritesheet') {
      const spriteName = `witch_guide_${groupNum}_spritesheet`;
      if (!this.guideFileMap[spriteName]) {
        this.log(`没有 guide 组 ${groupNum} 精灵图映射，跳过下载`);
        return;
      }
      this.log(`开始按需下载 guide 组 ${groupNum} 精灵图`);
      await this._loadGuideSpritesheet(spriteName, groupNum);

      // 注入 renderer
      const sheet = this.guideSpritesheets[groupKey];
      if (sheet && sheet.loaded && sheet.img && rendererGroup) {
        rendererGroup.img = sheet.img;
        rendererGroup.loaded = true;
        this.log(`已按需注入 guide 组 ${groupNum} 精灵图`);
      }
      return;
    }

    // 传统帧序列模式（兜底）
    const prefix = `witch_guide_${groupNum}_`;
    const names = Object.keys(this.guideFileMap).filter(n => n.startsWith(prefix));
    if (names.length === 0) {
      this.log(`没有 guide 组 ${groupNum} 的云存储映射，跳过下载`);
      return;
    }

    this.log(`开始按需下载 guide 组 ${groupNum}，共${names.length}张`);
    const batchSize = 5;
    for (let i = 0; i < names.length; i += batchSize) {
      const batch = names.slice(i, i + batchSize);
      await Promise.all(batch.map(async name => {
        await this._loadGuideImage(name);
      }));
    }

    // 注入 renderer
    const group = this.guideImages[groupKey];
    if (group && rendererGroup && group.frames) {
      group.frames.forEach((frame, idx) => {
        if (frame && frame.loaded && frame.img && rendererGroup.frames[idx]) {
          rendererGroup.frames[idx] = { img: frame.img, loaded: true };
        }
      });
      if (rendererGroup.frames.every(f => f && f.loaded)) {
        rendererGroup.loaded = true;
      }
      this.log(`已按需注入 guide 组 ${groupNum}: ${rendererGroup.frames.filter(f => f && f.loaded).length}/${rendererGroup.frames.length}帧`);
    }
  }

  // 将云缓存 guide 帧序列注入到 renderer 的 guideImages
  injectGuideToRenderer(renderer) {
    let count = 0;
    Object.keys(this.guideImages).forEach(groupKey => {
      const group = this.guideImages[groupKey];
      if (!group || !group.frames) return;
      const rendererGroup = renderer.guideImages[groupKey];
      if (!rendererGroup || !rendererGroup.frames) return;

      group.frames.forEach((frame, idx) => {
        if (frame && frame.loaded && frame.img && rendererGroup.frames[idx]) {
          rendererGroup.frames[idx] = { img: frame.img, loaded: true };
          count++;
        }
      });

      if (rendererGroup.frames.every(f => f && f.loaded)) {
        rendererGroup.loaded = true;
      }
    });

    // 注入精灵图（witch_guide_4）
    Object.keys(this.guideSpritesheets).forEach(groupKey => {
      const sheet = this.guideSpritesheets[groupKey];
      if (!sheet || !sheet.loaded || !sheet.img) return;
      const rendererGroup = renderer.guideImages[groupKey];
      if (!rendererGroup || rendererGroup.type !== 'spritesheet') return;
      rendererGroup.img = sheet.img;
      rendererGroup.loaded = true;
      count++;
    });

    this.log('已注入 guide renderer: ' + count + '张');
  }

  // 上传 images/bg_icon 目录下所有 .png 到云存储
  async uploadBgIconImages() {
    if (this.uploading) return { success: false, message: '正在上传中...' };
    this.uploading = true;

    const results = { success: [], failed: [] };
    const fs = wx.getFileSystemManager();

    let files = [];
    try {
      files = fs.readdirSync('images/bg_icon/');
    } catch (e) {
      this.log('读取 bg_icon 目录失败: ' + (e && e.message ? e.message : String(e)));
      this.uploading = false;
      return { success: false, message: '读取目录失败', error: e };
    }

    const pngFiles = files.filter(f => f.endsWith('.png'));
    this.log('扫描 images/bg_icon/ 目录下');
    this.log('扫描到 ' + pngFiles.length + ' 张本地 bg_icon 图片');

    for (const fileName of pngFiles) {
      const name = fileName.replace(/\.png$/i, '');
      const localPath = `images/bg_icon/${fileName}`;
      const cloudPath = `bg_icon/${fileName}`;

      this.log('开始上传 bg_icon/' + name);

      let uploadRes = null;
      let lastError = null;
      for (let attempt = 1; attempt <= 3; attempt++) {
        try {
          uploadRes = await wx.cloud.uploadFile({
            cloudPath,
            filePath: localPath,
          });
          break;
        } catch (e) {
          lastError = e;
          if (attempt < 3) {
            this.log('上传失败，1秒后第' + (attempt + 1) + '次重试: ' + name);
            await new Promise(r => setTimeout(r, 1000));
          }
        }
      }

      if (uploadRes) {
        this.bgIconFileMap[name] = uploadRes.fileID;
        results.success.push({ name, fileID: uploadRes.fileID });
        this.log('上传成功 bg_icon/' + name);
      } else {
        console.error('上传失败:', name, lastError);
        this.log('上传失败 bg_icon/' + name + ' ' + (lastError && lastError.message ? lastError.message : String(lastError)));
        results.failed.push({ name, error: lastError });
      }
    }

    // 保存映射到本地缓存
    try {
      wx.setStorageSync('cloud_bg_icon_map', JSON.stringify(this.bgIconFileMap));
    } catch (e) {}

    this.uploading = false;
    return results;
  }

  // 上传 images/rank_avatar 目录下所有 rank_avatar_*.png 到云存储
  async uploadRankAvatarImages() {
    if (this.uploading) return { success: false, message: '正在上传中...' };
    this.uploading = true;

    const results = { success: [], failed: [] };
    const fs = wx.getFileSystemManager();

    let files = [];
    try {
      files = fs.readdirSync('images/rank_avatar/');
    } catch (e) {
      this.log('读取 rank_avatar 目录失败: ' + (e && e.message ? e.message : String(e)));
      this.uploading = false;
      return { success: false, message: '读取目录失败', error: e };
    }

    const pngFiles = files.filter(f => /^rank_avatar_\d+\.png$/i.test(f));
    this.log('扫描 images/rank_avatar/ 目录下');
    this.log('扫描到 ' + pngFiles.length + ' 张本地 rank_avatar 图片');

    for (const fileName of pngFiles) {
      const name = fileName.replace(/\.png$/i, '');
      const localPath = `images/rank_avatar/${fileName}`;
      const cloudPath = `rank_avatar/${fileName}`;

      this.log('开始上传 rank_avatar/' + name);

      let uploadRes = null;
      let lastError = null;
      for (let attempt = 1; attempt <= 3; attempt++) {
        try {
          uploadRes = await wx.cloud.uploadFile({
            cloudPath,
            filePath: localPath,
          });
          break;
        } catch (e) {
          lastError = e;
          if (attempt < 3) {
            this.log('上传失败，1秒后第' + (attempt + 1) + '次重试: ' + name);
            await new Promise(r => setTimeout(r, 1000));
          }
        }
      }

      if (uploadRes) {
        this.rankAvatarFileMap[name] = uploadRes.fileID;
        results.success.push({ name, fileID: uploadRes.fileID });
        this.log('上传成功 rank_avatar/' + name);
      } else {
        console.error('上传失败:', name, lastError);
        this.log('上传失败 rank_avatar/' + name + ' ' + (lastError && lastError.message ? lastError.message : String(lastError)));
        results.failed.push({ name, error: lastError });
      }
    }

    // 保存映射到本地缓存
    try {
      wx.setStorageSync('cloud_rank_avatar_map', JSON.stringify(this.rankAvatarFileMap));
    } catch (e) {}

    this.uploading = false;
    return results;
  }

  // 从云存储下载并缓存所有 bg_icon 图片（后台静默加载）
  async preloadBgIconImages(onProgress = null) {
    const names = Object.keys(this.bgIconFileMap);
    if (names.length === 0) {
      this.log('没有 bg_icon 云存储映射，跳过预加载');
      return;
    }

    this.log('开始下载 bg_icon 图片，共' + names.length + '张');
    const batchSize = 5;
    for (let i = 0; i < names.length; i += batchSize) {
      const batch = names.slice(i, i + batchSize);
      await Promise.all(batch.map(async name => {
        await this._loadBgIconImage(name);
        if (onProgress) onProgress();
      }));
    }
    const loaded = Object.keys(this.bgIconImages).filter(n => this.bgIconImages[n].loaded);
    const failed = names.filter(n => !this.bgIconImages[n] || !this.bgIconImages[n].loaded);
    this.log('bg_icon 目录下 ' + loaded.length + '/' + names.length + ' 张图片下载完成');
    if (failed.length > 0) {
      this.log('bg_icon 失败：' + failed.join(', '));
    }
  }

  async _loadBgIconImage(name) {
    const fileID = this.bgIconFileMap[name];
    await this._loadImageWithCache(name, fileID, this.bgIconImages);
  }

  // 从云存储下载并缓存所有 rank_avatar 图片（不在预加载页加载，预加载完成后进入游戏页面时调用）
  async preloadRankAvatarImages(onProgress = null) {
    const names = Object.keys(this.rankAvatarFileMap);
    if (names.length === 0) {
      this.log('没有 rank_avatar 云存储映射，跳过下载');
      return;
    }

    this.log('开始下载 rank_avatar 图片，共' + names.length + '张');
    const batchSize = 5;
    for (let i = 0; i < names.length; i += batchSize) {
      const batch = names.slice(i, i + batchSize);
      await Promise.all(batch.map(async name => {
        await this._loadRankAvatarImage(name);
        if (onProgress) onProgress();
      }));
    }
    const loaded = Object.keys(this.rankAvatarImages).filter(n => this.rankAvatarImages[n].loaded);
    const failed = names.filter(n => !this.rankAvatarImages[n] || !this.rankAvatarImages[n].loaded);
    this.log('rank_avatar 目录下 ' + loaded.length + '/' + names.length + ' 张图片下载完成');
    if (failed.length > 0) {
      this.log('rank_avatar 失败：' + failed.join(', '));
    }
  }

  async _loadRankAvatarImage(name) {
    const fileID = this.rankAvatarFileMap[name];
    await this._loadImageWithCache(name, fileID, this.rankAvatarImages);
  }

  // 将云缓存 rank_avatar 图片注入到 renderer（全国榜默认头像使用）
  injectRankAvatarToRenderer(renderer) {
    renderer.rankAvatarImages = this.rankAvatarImages;
  }

  // 将云缓存 bg_icon 图片注入到 renderer（bg 背景 + card_book 图鉴背景 + 卡牌模板 + 对战模块）
  injectBgIconToRenderer(renderer) {
    const bgData = this.bgIconImages['bg'];
    if (bgData && bgData.loaded && bgData.img) {
      renderer.bgImage = bgData.img;
      renderer.bgLoaded = true;
      this.log('已注入 bg_icon renderer: bg');
    } else {
      this.log('bg_icon bg 未加载，跳过注入');
    }

    // 对战模块背景图（左右分开）
    const battlePlayerLeftData = this.bgIconImages['battle_player_left'];
    if (battlePlayerLeftData && battlePlayerLeftData.loaded && battlePlayerLeftData.img) {
      renderer.battlePlayerLeft = battlePlayerLeftData.img;
      renderer.battlePlayerLeftLoaded = true;
      this.log('已注入 bg_icon renderer: battle_player_left');
    } else {
      this.log('bg_icon battle_player_left 未加载，跳过注入');
    }

    const battlePlayerRightData = this.bgIconImages['battle_player_right'];
    if (battlePlayerRightData && battlePlayerRightData.loaded && battlePlayerRightData.img) {
      renderer.battlePlayerRight = battlePlayerRightData.img;
      renderer.battlePlayerRightLoaded = true;
      this.log('已注入 bg_icon renderer: battle_player_right');
    } else {
      this.log('bg_icon battle_player_right 未加载，跳过注入');
    }

    const battleRoundBadgeData = this.bgIconImages['battle_round_badge'];
    if (battleRoundBadgeData && battleRoundBadgeData.loaded && battleRoundBadgeData.img) {
      renderer.battleRoundBadge = battleRoundBadgeData.img;
      renderer.battleRoundBadgeLoaded = true;
      this.log('已注入 bg_icon renderer: battle_round_badge');
    } else {
      this.log('bg_icon battle_round_badge 未加载，跳过注入');
    }

    // 对战 VS 徽章图
    const battleVSData = this.bgIconImages['battle_vs'];
    if (battleVSData && battleVSData.loaded && battleVSData.img) {
      renderer.battleVS = battleVSData.img;
      renderer.battleVSLoaded = true;
      this.log('已注入 bg_icon renderer: battle_vs');
    } else {
      this.log('bg_icon battle_vs 未加载，跳过注入');
    }

    // 对战匹配弹窗底图与剑图标
    const battleMatchData = this.bgIconImages['battle_match'];
    if (battleMatchData && battleMatchData.loaded && battleMatchData.img) {
      renderer.battleMatch = battleMatchData.img;
      renderer.battleMatchLoaded = true;
      this.log('已注入 bg_icon renderer: battle_match');
    } else {
      this.log('bg_icon battle_match 未加载，跳过注入');
    }

    const battleMatchSwordData = this.bgIconImages['battle_match_sword'];
    if (battleMatchSwordData && battleMatchSwordData.loaded && battleMatchSwordData.img) {
      renderer.battleMatchSword = battleMatchSwordData.img;
      renderer.battleMatchSwordLoaded = true;
      this.log('已注入 bg_icon renderer: battle_match_sword');
    } else {
      this.log('bg_icon battle_match_sword 未加载，跳过注入');
    }

    // 对战单词预览区装饰线 / 主玩法计分方块装饰线
    const scoreLineData = this.bgIconImages['score_line'];
    if (scoreLineData && scoreLineData.loaded && scoreLineData.img) {
      renderer.scoreLine = scoreLineData.img;
      renderer.scoreLineLoaded = true;
      renderer.scoreLineImg = scoreLineData.img;
      renderer.scoreLineImgLoaded = true;
      this.log('已注入 bg_icon renderer: score_line');
    } else {
      this.log('bg_icon score_line 未加载，跳过注入');
    }

    const cardBookData = this.bgIconImages['card_book'];
    if (cardBookData && cardBookData.loaded && cardBookData.img) {
      renderer.cardBookImage = cardBookData.img;
      renderer.cardBookImageLoaded = true;
      this.log('已注入 bg_icon renderer: card_book');
    } else {
      this.log('bg_icon card_book 未加载，跳过注入');
    }

    // 商店分类栏背景图
    const shopCardBarNames = ['shop_card_bar_witch', 'shop_card_bar_crystal', 'shop_card_bar_potion'];
    if (!renderer.shopCardBarImages) renderer.shopCardBarImages = {};
    shopCardBarNames.forEach(name => {
      const data = this.bgIconImages[name];
      if (data && data.loaded && data.img) {
        renderer.shopCardBarImages[name] = data.img;
        this.log('已注入 bg_icon renderer: ' + name);
      } else {
        this.log('bg_icon ' + name + ' 未加载，跳过注入');
      }
    });

    // 卡牌模板从 bg_icon 云存储注入
    const templateNames = ['card_template', 'card_template_selected', 'card_template_upgrade', 'card_template_upgrade_selected'];
    const templateFields = ['cardTemplate', 'cardTemplateSelected', 'cardTemplateUpgrade', 'cardTemplateUpgradeSelected'];
    const loadedFlags = ['cardTemplateLoaded', 'cardTemplateSelectedLoaded', 'cardTemplateUpgradeLoaded', 'cardTemplateUpgradeSelectedLoaded'];
    templateNames.forEach((name, i) => {
      const data = this.bgIconImages[name];
      if (data && data.loaded && data.img) {
        renderer[templateFields[i]] = data.img;
        renderer[loadedFlags[i]] = true;
        this.log('已注入 bg_icon renderer: ' + name);
      } else {
        this.log('bg_icon ' + name + ' 未加载，跳过注入');
      }
    });

    // 迷之优惠折扣标签雪碧图（6~9折，每帧100x100）
    const discountSheetData = this.bgIconImages['discount_spritesheet'];
    if (discountSheetData && discountSheetData.loaded && discountSheetData.img) {
      renderer.discountSpritesheet = discountSheetData.img;
      renderer.discountSpritesheetLoaded = true;
      this.log('已注入 bg_icon renderer: discount_spritesheet');
    } else {
      this.log('bg_icon discount_spritesheet 未加载，跳过注入');
    }

    // 主页图片从 bg_icon 云存储注入
    const homepageNames = ['homepageBg', 'homepageTitle', 'homepageRound', 'homepageBattle', 'homepageSetting', 'homepageRanking', 'homepageDaily', 'homepageStudy'];
    homepageNames.forEach(name => {
      const data = this.bgIconImages[name];
      if (data && data.loaded && data.img) {
        renderer[name] = data.img;
        renderer[`${name}Loaded`] = true;
        this.log('已注入 bg_icon renderer: ' + name);
      } else {
        this.log('bg_icon ' + name + ' 未加载，跳过注入');
      }
    });

    // 游戏页返回主页图标从 bg_icon 云存储注入
    const topHomeData = this.bgIconImages['topHome'];
    if (topHomeData && topHomeData.loaded && topHomeData.img) {
      renderer.topIcon = topHomeData.img;
      renderer.topIconLoaded = true;
      this.log('已注入 bg_icon renderer: topHome');
    } else {
      this.log('bg_icon topHome 未加载，跳过注入');
    }
  }

  // ===== music 文件管理 =====

  // 递归扫描 music/ 目录下所有 .mp3
  _scanMusicDir(fs, dirPath) {
    const results = [];
    try {
      const entries = fs.readdirSync(dirPath);
      for (const entry of entries) {
        const fullPath = `${dirPath}/${entry}`;
        const stat = fs.statSync(fullPath);
        if (stat.isDirectory()) {
          results.push(...this._scanMusicDir(fs, fullPath));
        } else if (entry.endsWith('.mp3')) {
          const relPath = fullPath.replace(/^music\//, '');
          const name = entry.replace(/\.mp3$/i, '');
          results.push({ localPath: fullPath, fileName: entry, relPath, name });
        }
      }
    } catch (e) {}
    return results;
  }

  // 上传 music/ 目录下所有 .mp3 到云存储
  async uploadMusicFiles() {
    if (this.uploading) return { success: false, message: '正在上传中...' };
    this.uploading = true;

    const results = { success: [], failed: [] };
    const fs = wx.getFileSystemManager();

    const allFiles = this._scanMusicDir(fs, 'music');
    this.log('扫描 music/ 目录（含子目录）');
    this.log('扫描到 ' + allFiles.length + ' 个本地 music 文件');

    for (const file of allFiles) {
      const { localPath, relPath, name } = file;
      const cloudPath = `music/${relPath}`;

      this.log('开始上传 ' + cloudPath);

      let uploadRes = null;
      let lastError = null;
      for (let attempt = 1; attempt <= 3; attempt++) {
        try {
          uploadRes = await wx.cloud.uploadFile({
            cloudPath,
            filePath: localPath,
          });
          break;
        } catch (e) {
          lastError = e;
          if (attempt < 3) {
            this.log('上传失败，1秒后第' + (attempt + 1) + '次重试: ' + name);
            await new Promise(r => setTimeout(r, 1000));
          }
        }
      }

      if (uploadRes) {
        this.musicFileMap[name] = uploadRes.fileID;
        results.success.push({ name, fileID: uploadRes.fileID });
        this.log('上传成功 ' + cloudPath);
      } else {
        console.error('上传失败:', name, lastError);
        this.log('上传失败 ' + cloudPath + ' ' + (lastError && lastError.message ? lastError.message : String(lastError)));
        results.failed.push({ name, error: lastError });
      }
    }

    // 保存映射到本地缓存
    try {
      wx.setStorageSync('cloud_music_map', JSON.stringify(this.musicFileMap));
    } catch (e) {}

    this.uploading = false;
    return results;
  }

  // 预加载 music 文件：本地有则直接使用；本地无则从云存储下载到缓存
  async preloadMusicFiles(onProgress = null) {
    const fs = wx.getFileSystemManager();
    const localFiles = this._scanMusicDir(fs, 'music');

    if (localFiles.length > 0) {
      // 本地有文件：直接使用本地路径
      this.log('检测到本地 music 文件，共' + localFiles.length + '个');
      localFiles.forEach(file => {
        this.musicCache[file.name] = file.localPath;
        if (onProgress) onProgress();
      });
      return;
    }

    // 本地无文件：从云存储下载
    const names = Object.keys(this.musicFileMap);
    if (names.length === 0) {
      this.log('没有本地 music 文件且无云存储映射，跳过预加载');
      return;
    }

    this.log('本地无 music 文件，开始从云存储下载，共' + names.length + '个');

    // 确保缓存目录存在
    const cacheDir = `${wx.env.USER_DATA_PATH}/music_cache`;
    try { fs.mkdirSync(cacheDir, true); } catch (e) {}

    // === 批量获取临时 URL（带重试，失败则回退到逐个获取）===
    let urlMap = {};
    const fileList = names.map(name => this.musicFileMap[name]).filter(Boolean);

    for (let batchAttempt = 1; batchAttempt <= 2; batchAttempt++) {
      try {
        const res = await new Promise((resolve, reject) => {
          wx.cloud.getTempFileURL({ fileList, success: resolve, fail: reject });
        });
        if (res.fileList && res.fileList.length > 0) {
          res.fileList.forEach(item => {
            if (item.status === 0 && item.tempFileURL) {
              const name = names.find(n => this.musicFileMap[n] === item.fileID);
              if (name) urlMap[name] = item.tempFileURL;
            }
          });
        }
        break; // 成功则跳出重试
      } catch (e) {
        this.log('批量获取 music URL 失败(' + batchAttempt + '/2): ' + (e && e.message ? e.message : String(e)));
        if (batchAttempt < 2) await new Promise(r => setTimeout(r, 800));
      }
    }

    // 批量获取失败后，剩余未获取到的逐个回退获取（内部自带3次重试）
    const missingNames = names.filter(n => !urlMap[n] && this.musicFileMap[n]);
    if (missingNames.length > 0) {
      this.log('批量获取未覆盖 ' + missingNames.length + ' 个，逐个回退获取');
      for (const name of missingNames) {
        const fileID = this.musicFileMap[name];
        let urlData = null;
        for (let attempt = 1; attempt <= 3; attempt++) {
          try {
            const res = await new Promise((resolve, reject) => {
              wx.cloud.getTempFileURL({ fileList: [fileID], success: resolve, fail: reject });
            });
            const data = res.fileList[0];
            if (data && data.status === 0 && data.tempFileURL) {
              urlData = data.tempFileURL;
              break;
            }
          } catch (e) {}
          if (attempt < 3) await new Promise(r => setTimeout(r, 1000));
        }
        if (urlData) urlMap[name] = urlData;
      }
    }

    // === 并行下载所有文件（带重试）===
    const downloadOne = (name, tempURL) => {
      const cachePath = `${cacheDir}/${name}.mp3`;
      return new Promise((resolve) => {
        wx.downloadFile({
          url: tempURL,
          success: (res) => {
            if (res.statusCode === 200) {
              try {
                fs.copyFileSync(res.tempFilePath, cachePath);
                this.musicCache[name] = cachePath;
              } catch (e) {
                this.log('music 缓存失败: ' + name + ' ' + (e && e.message ? e.message : String(e)));
              }
            } else {
              this.log('music 下载失败: ' + name + ' status=' + res.statusCode);
            }
            resolve();
          },
          fail: (e) => {
            this.log('music 下载失败: ' + name + ' ' + (e && e.message ? e.message : String(e)));
            resolve();
          },
        });
      });
    };

    const downloadTasks = names.map(async name => {
      let tempURL = urlMap[name];
      if (!tempURL) {
        this.log('无可用 URL，跳过: ' + name);
        if (onProgress) onProgress();
        return;
      }

      // 首次下载
      await downloadOne(name, tempURL);
      // 若失败则重试1次
      if (!this.musicCache[name]) {
        this.log('music 下载重试: ' + name);
        await new Promise(r => setTimeout(r, 500));
        await downloadOne(name, tempURL);
      }
      if (onProgress) onProgress();
    });

    await Promise.allSettled(downloadTasks);
    this.log('music 目录下 ' + Object.keys(this.musicCache).length + '/' + names.length + ' 个音频下载完成');
  }
}

module.exports = { CloudStorageManager };
