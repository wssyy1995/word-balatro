// ===== 微信云存储管理器 =====
// 环境 ID: cloud1-d3gecbtu10e4035de

class CloudStorageManager {
  constructor(env) {
    this.env = env;
    this.shopCardImages = {}; // { name: { img, loaded, width, height } }
    this.witchImages = {};    // { name: { img, loaded, width, height } }
    this.witchCardImages = {}; // { name: { img, loaded, width, height } }
    this.bgIconImages = {};   // { name: { img, loaded, width, height } }
    this.guideImages = {};    // { witch_1: { frames: [...], loaded: false }, witch_2: ... }
    this.guideSpritesheets = {}; // { witch_4: { img, loaded } } 精灵图缓存
    this.cloudFileMap = {};   // { name: fileID }
    this.witchFileMap = {};   // { name: fileID }
    this.witchCardFileMap = {}; // { name: fileID }
    this.bgIconFileMap = {};  // { name: fileID }
    this.guideFileMap = {};   // { 'witch_guide_1_spritesheet': fileID, ... }
    this.musicFileMap = {};   // { name: fileID }
    this.musicCache = {};     // { name: localPath }
    this.initialized = false;
    this.uploading = false;
    this.debugLogs = [];

    // 默认云文件映射（已上传的 shop_card 图片，fileID 固定）
    this.defaultFileMap = {
      'life_extension': 'cloud://cloud1-d3gecbtu10e4035de.636c-cloud1-d3gecbtu10e4035de-1429704466/shop_card/life_extension.png',
      'bonus_gold': 'cloud://cloud1-d3gecbtu10e4035de.636c-cloud1-d3gecbtu10e4035de-1429704466/shop_card/bonus_gold.png',
      'change_letter': 'cloud://cloud1-d3gecbtu10e4035de.636c-cloud1-d3gecbtu10e4035de-1429704466/shop_card/change_letter.png',
      'extra_discard': 'cloud://cloud1-d3gecbtu10e4035de.636c-cloud1-d3gecbtu10e4035de-1429704466/shop_card/extra_discard.png',
      'extra_hands': 'cloud://cloud1-d3gecbtu10e4035de.636c-cloud1-d3gecbtu10e4035de-1429704466/shop_card/extra_hands.png',
      'extra_letter': 'cloud://cloud1-d3gecbtu10e4035de.636c-cloud1-d3gecbtu10e4035de-1429704466/shop_card/extra_letter.png',
      'has_face': 'cloud://cloud1-d3gecbtu10e4035de.636c-cloud1-d3gecbtu10e4035de-1429704466/shop_card/has_face.png',
      'has_vowel': 'cloud://cloud1-d3gecbtu10e4035de.636c-cloud1-d3gecbtu10e4035de-1429704466/shop_card/has_vowel.png',
      'initial_vowel': 'cloud://cloud1-d3gecbtu10e4035de.636c-cloud1-d3gecbtu10e4035de-1429704466/shop_card/initial_vowel.png',
      'length_4': 'cloud://cloud1-d3gecbtu10e4035de.636c-cloud1-d3gecbtu10e4035de-1429704466/shop_card/length_4.png',
      'length_5': 'cloud://cloud1-d3gecbtu10e4035de.636c-cloud1-d3gecbtu10e4035de-1429704466/shop_card/length_5.png',
      'length_6': 'cloud://cloud1-d3gecbtu10e4035de.636c-cloud1-d3gecbtu10e4035de-1429704466/shop_card/length_6.png',
      'letter_a': 'cloud://cloud1-d3gecbtu10e4035de.636c-cloud1-d3gecbtu10e4035de-1429704466/shop_card/letter_a.png',
      'letter_e': 'cloud://cloud1-d3gecbtu10e4035de.636c-cloud1-d3gecbtu10e4035de-1429704466/shop_card/letter_e.png',
      'reduce_target': 'cloud://cloud1-d3gecbtu10e4035de.636c-cloud1-d3gecbtu10e4035de-1429704466/shop_card/reduce_target.png',
      'upgrade_any': 'cloud://cloud1-d3gecbtu10e4035de.636c-cloud1-d3gecbtu10e4035de-1429704466/shop_card/upgrade_any.png',
      'upgrade_face': 'cloud://cloud1-d3gecbtu10e4035de.636c-cloud1-d3gecbtu10e4035de-1429704466/shop_card/upgrade_face.png',
      'upgrade_letter': 'cloud://cloud1-d3gecbtu10e4035de.636c-cloud1-d3gecbtu10e4035de-1429704466/shop_card/upgrade_letter.png',
      'shield_illegal':'cloud://cloud1-d3gecbtu10e4035de.636c-cloud1-d3gecbtu10e4035de-1429704466/shop_card/shield_illegal.png',
      'illegal_boost':'cloud://cloud1-d3gecbtu10e4035de.636c-cloud1-d3gecbtu10e4035de-1429704466/shop_card/illegal_boost.png',
      'random_upgrade':'cloud://cloud1-d3gecbtu10e4035de.636c-cloud1-d3gecbtu10e4035de-1429704466/shop_card/random_upgrade.png',
      'letter_god':'cloud://cloud1-d3gecbtu10e4035de.636c-cloud1-d3gecbtu10e4035de-1429704466/shop_card/letter_god.png',
      'last_chance':'cloud://cloud1-d3gecbtu10e4035de.636c-cloud1-d3gecbtu10e4035de-1429704466/shop_card/last_chance.png',
      'reroll_skill':'cloud://cloud1-d3gecbtu10e4035de.636c-cloud1-d3gecbtu10e4035de-1429704466/shop_card/reroll_skill.png',
      'haste_play':'cloud://cloud1-d3gecbtu10e4035de.636c-cloud1-d3gecbtu10e4035de-1429704466/shop_card/haste_play.png',
      'firstend_same':'cloud://cloud1-d3gecbtu10e4035de.636c-cloud1-d3gecbtu10e4035de-1429704466/shop_card/double_and_firstend.png',
      'double_same':'cloud://cloud1-d3gecbtu10e4035de.636c-cloud1-d3gecbtu10e4035de-1429704466/shop_card/double_same.png',
      'initial_succession':'cloud://cloud1-d3gecbtu10e4035de.636c-cloud1-d3gecbtu10e4035de-1429704466/shop_card/initial_succession.png',
      'end_s':'cloud://cloud1-d3gecbtu10e4035de.636c-cloud1-d3gecbtu10e4035de-1429704466/shop_card/end_s.png',
      'end_ed':'cloud://cloud1-d3gecbtu10e4035de.636c-cloud1-d3gecbtu10e4035de-1429704466/shop_card/end_ed.png',
      'predicted_letter':'cloud://cloud1-d3gecbtu10e4035de.636c-cloud1-d3gecbtu10e4035de-1429704466/shop_card/predicted_letter.png',
      'no_duplicate':'cloud://cloud1-d3gecbtu10e4035de.636c-cloud1-d3gecbtu10e4035de-1429704466/shop_card/no_duplicate.png'
    };

    // 默认 witch 图片云文件映射
    this.defaultWitchFileMap = {
      'witch_24': 'cloud://cloud1-d3gecbtu10e4035de.636c-cloud1-d3gecbtu10e4035de-1429704466/witch/witch_24.png',
      'witch_21': 'cloud://cloud1-d3gecbtu10e4035de.636c-cloud1-d3gecbtu10e4035de-1429704466/witch/witch_21.png',
      'witch_18': 'cloud://cloud1-d3gecbtu10e4035de.636c-cloud1-d3gecbtu10e4035de-1429704466/witch/witch_18.png',
      'witch_16': 'cloud://cloud1-d3gecbtu10e4035de.636c-cloud1-d3gecbtu10e4035de-1429704466/witch/witch_16.png',
      'witch_14': 'cloud://cloud1-d3gecbtu10e4035de.636c-cloud1-d3gecbtu10e4035de-1429704466/witch/witch_14.png',
      'witch_11': 'cloud://cloud1-d3gecbtu10e4035de.636c-cloud1-d3gecbtu10e4035de-1429704466/witch/witch_11.png',
      'witch_3': 'cloud://cloud1-d3gecbtu10e4035de.636c-cloud1-d3gecbtu10e4035de-1429704466/witch/witch_2.png',
      'witch_4': 'cloud://cloud1-d3gecbtu10e4035de.636c-cloud1-d3gecbtu10e4035de-1429704466/witch/witch_4.png',
      'witch_5': 'cloud://cloud1-d3gecbtu10e4035de.636c-cloud1-d3gecbtu10e4035de-1429704466/witch/witch_5.png',
      'witch_8': 'cloud://cloud1-d3gecbtu10e4035de.636c-cloud1-d3gecbtu10e4035de-1429704466/witch/witch_8.png',
    };

    // 默认 witch_card 图片云文件映射
    this.defaultWitchCardFileMap = {
      'witch_card_3': 'cloud://cloud1-d3gecbtu10e4035de.636c-cloud1-d3gecbtu10e4035de-1429704466/witch/witch_card/witch_card_3.png',
      'witch_card_5': 'cloud://cloud1-d3gecbtu10e4035de.636c-cloud1-d3gecbtu10e4035de-1429704466/witch/witch_card/witch_card_5.png',
      'witch_card_8': 'cloud://cloud1-d3gecbtu10e4035de.636c-cloud1-d3gecbtu10e4035de-1429704466/witch/witch_card/witch_card_8.png',
      'witch_card_11': 'cloud://cloud1-d3gecbtu10e4035de.636c-cloud1-d3gecbtu10e4035de-1429704466/witch/witch_card/witch_card_11.png',
      'witch_card_14': 'cloud://cloud1-d3gecbtu10e4035de.636c-cloud1-d3gecbtu10e4035de-1429704466/witch/witch_card/witch_card_14.png',
      'witch_card_16': 'cloud://cloud1-d3gecbtu10e4035de.636c-cloud1-d3gecbtu10e4035de-1429704466/witch/witch_card/witch_card_16.png',
      'witch_card_18': 'cloud://cloud1-d3gecbtu10e4035de.636c-cloud1-d3gecbtu10e4035de-1429704466/witch/witch_card/witch_card_18.png',
      'witch_card_21': 'cloud://cloud1-d3gecbtu10e4035de.636c-cloud1-d3gecbtu10e4035de-1429704466/witch/witch_card/witch_card_21.png',
      'witch_card_24': 'cloud://cloud1-d3gecbtu10e4035de.636c-cloud1-d3gecbtu10e4035de-1429704466/witch/witch_card/witch_card_24.png'
    };

    // 默认 bg_icon 图片云文件映射
    this.defaultBgIconFileMap = {
      'bg': 'cloud://cloud1-d3gecbtu10e4035de.636c-cloud1-d3gecbtu10e4035de-1429704466/bg_icon/bg.png',
      'buy_tip': 'cloud://cloud1-d3gecbtu10e4035de.636c-cloud1-d3gecbtu10e4035de-1429704466/bg_icon/buy_tip.png',
      'share_tip': 'cloud://cloud1-d3gecbtu10e4035de.636c-cloud1-d3gecbtu10e4035de-1429704466/bg_icon/share_tip.png',
      'share_tip_limit': 'cloud://cloud1-d3gecbtu10e4035de.636c-cloud1-d3gecbtu10e4035de-1429704466/bg_icon/share_tip_limit.png'
    };

    // 默认 music 云文件映射（只包含代码中有实际 play() 调用的音效）
    this.defaultMusicFileMap = {
      'buy_success': 'cloud://cloud1-d3gecbtu10e4035de.636c-cloud1-d3gecbtu10e4035de-1429704466/music/sound_effect/buy_success.mp3',
      'card_illegal': 'cloud://cloud1-d3gecbtu10e4035de.636c-cloud1-d3gecbtu10e4035de-1429704466/music/sound_effect/card_illegal.mp3',
      'card_placement': 'cloud://cloud1-d3gecbtu10e4035de.636c-cloud1-d3gecbtu10e4035de-1429704466/music/sound_effect/card_placement.mp3',
      'card_shuffle': 'cloud://cloud1-d3gecbtu10e4035de.636c-cloud1-d3gecbtu10e4035de-1429704466/music/sound_effect/card_shuffle.mp3',
      'card_valid': 'cloud://cloud1-d3gecbtu10e4035de.636c-cloud1-d3gecbtu10e4035de-1429704466/music/sound_effect/card_valid.mp3',
      'challenge': 'cloud://cloud1-d3gecbtu10e4035de.636c-cloud1-d3gecbtu10e4035de-1429704466/music/sound_effect/challange.mp3',
      'game_over': 'cloud://cloud1-d3gecbtu10e4035de.636c-cloud1-d3gecbtu10e4035de-1429704466/music/sound_effect/game_over.mp3',
      'round_win': 'cloud://cloud1-d3gecbtu10e4035de.636c-cloud1-d3gecbtu10e4035de-1429704466/music/sound_effect/round_win.mp3',
      'tap': 'cloud://cloud1-d3gecbtu10e4035de.636c-cloud1-d3gecbtu10e4035de-1429704466/music/sound_effect/tap.mp3',
      'card_sell': 'cloud://cloud1-d3gecbtu10e4035de.636c-cloud1-d3gecbtu10e4035de-1429704466/music/sound_effect/card_sell.mp3',
      'card_book_page': 'cloud://cloud1-d3gecbtu10e4035de.636c-cloud1-d3gecbtu10e4035de-1429704466/music/sound_effect/card_book_page.mp3',
      'card_jump': 'cloud://cloud1-d3gecbtu10e4035de.636c-cloud1-d3gecbtu10e4035de-1429704466/music/sound_effect/card_jump.mp3',
      'answer_tone': 'cloud://cloud1-d3gecbtu10e4035de.636c-cloud1-d3gecbtu10e4035de-1429704466/music/sound_effect/answer_tone.mp3',
      'word_score': 'cloud://cloud1-d3gecbtu10e4035de.636c-cloud1-d3gecbtu10e4035de-1429704466/music/sound_effect/word_score.mp3',
      'spin_wheel': 'cloud://cloud1-d3gecbtu10e4035de.636c-cloud1-d3gecbtu10e4035de-1429704466/music/sound_effect/spin_whell.mp3',
    };

    // 默认 guide 云文件映射（witch_guide_1~4 均使用精灵图）
    this.defaultGuideFileMap = {};
    const guideBase = 'cloud://cloud1-d3gecbtu10e4035de.636c-cloud1-d3gecbtu10e4035de-1429704466/witch/guide';
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
    this.log('下载完成：' + loaded.length + '/' + names.length + '张成功');
    if (failed.length > 0) {
      this.log('失败：' + failed.join(', '));
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
    this.log('witch 下载完成：' + loaded.length + '/' + names.length + '张成功');
    if (failed.length > 0) {
      this.log('witch 失败：' + failed.join(', '));
    }
  }

  async _loadCloudImage(name, tempURL = null) {
    // 重复加载防护：已加载成功则直接跳过
    const existing = this.shopCardImages[name];
    if (existing && existing.loaded && existing.img) {
      return;
    }

    let finalURL = tempURL;

    // 未传入 URL 时，自行获取临时 URL
    if (!finalURL) {
      const fileID = this.cloudFileMap[name];
      if (!fileID) return;

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
            urlData = data;
            break;
          }
          lastError = new Error(data ? (data.errMsg || 'status=' + data.status) : 'urlData=null');
        } catch (e) {
          lastError = e;
        }
        if (attempt < 3) {
          this.log('获取临时URL失败，1秒后第' + (attempt + 1) + '次重试: ' + name);
          await new Promise(r => setTimeout(r, 1000));
        }
      }

      if (!urlData) {
        const detail = lastError ? lastError.message : 'unknown';
        this.log('获取临时URL失败: ' + name + ' detail=' + detail);
        this.shopCardImages[name] = { img: null, loaded: false, width: 0, height: 0 };
        return;
      }
      finalURL = urlData.tempFileURL;
    }

    // 释放旧 Image 像素数据，防止 Native 层 ArrayBuffer 堆积
    if (existing && existing.img) {
      existing.img.src = '';
    }

    // wx.createImage 加载图片（带重试）
    let loadSuccess = false;
    for (let attempt = 1; attempt <= 2; attempt++) {
      const img = wx.createImage();
      loadSuccess = await new Promise((resolve) => {
        img.onload = () => {
          this.log('下载完成: ' + name);
          this.shopCardImages[name] = {
            img,
            loaded: true,
            width: img.width || 0,
            height: img.height || 0,
          };
          resolve(true);
        };
        img.onerror = (e) => {
          this.log('图片加载失败(' + attempt + '/2): ' + name + ' src=' + (img.src || '').slice(0, 80) + ' err=' + (e && e.message ? e.message : 'unknown'));
          resolve(false);
        };
        img.src = finalURL;
      });
      if (loadSuccess) break;
      if (attempt < 2) {
        this.log('图片加载重试: ' + name);
        await new Promise(r => setTimeout(r, 500));
      }
    }
    if (!loadSuccess) {
      this.shopCardImages[name] = { img: null, loaded: false, width: 0, height: 0 };
    }
  }

  async _loadWitchImage(name) {
    // 重复加载防护：已加载成功则直接跳过
    const existing = this.witchImages[name];
    if (existing && existing.loaded && existing.img) {
      return;
    }

    const fileID = this.witchFileMap[name];
    if (!fileID) return;

    // getTempFileURL 重试3次
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
          urlData = data;
          break;
        }
        lastError = new Error(data ? (data.errMsg || 'status=' + data.status) : 'urlData=null');
      } catch (e) {
        lastError = e;
      }
      if (attempt < 3) {
        this.log('获取临时URL失败，1秒后第' + (attempt + 1) + '次重试: ' + name);
        await new Promise(r => setTimeout(r, 1000));
      }
    }

    if (!urlData) {
      const detail = lastError ? lastError.message : 'unknown';
      this.log('获取临时URL失败: ' + name + ' detail=' + detail);
      this.witchImages[name] = { img: null, loaded: false, width: 0, height: 0 };
      return;
    }

    // 释放旧 Image 像素数据，防止 Native 层 ArrayBuffer 堆积
    if (existing && existing.img) {
      existing.img.src = '';
    }

    // wx.createImage 加载图片
    const img = wx.createImage();
    img.src = urlData.tempFileURL;
    await new Promise((resolve) => {
      img.onload = () => {
        this.log('witch 下载完成: ' + name);
        this.witchImages[name] = {
          img,
          loaded: true,
          width: img.width || 0,
          height: img.height || 0,
        };
        resolve();
      };
      img.onerror = (e) => {
        this.log('witch 图片加载失败: ' + name + ' src=' + (img.src || '').slice(0, 80) + ' err=' + (e && e.message ? e.message : 'unknown'));
        this.witchImages[name] = { img: null, loaded: false, width: 0, height: 0 };
        resolve();
      };
    });
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
    const existing = this.witchCardImages[name];
    if (existing && existing.loaded && existing.img) {
      return;
    }

    const fileID = this.witchCardFileMap[name];
    if (!fileID) return;

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
          urlData = data;
          break;
        }
        lastError = new Error(data ? (data.errMsg || 'status=' + data.status) : 'urlData=null');
      } catch (e) {
        lastError = e;
      }
      if (attempt < 3) {
        this.log('获取临时URL失败，1秒后第' + (attempt + 1) + '次重试: ' + name);
        await new Promise(r => setTimeout(r, 1000));
      }
    }

    if (!urlData) {
      this.witchCardImages[name] = { img: null, loaded: false, width: 0, height: 0 };
      return;
    }

    if (existing && existing.img) {
      existing.img.src = '';
    }

    const img = wx.createImage();
    img.src = urlData.tempFileURL;
    await new Promise((resolve) => {
      img.onload = () => {
        this.witchCardImages[name] = { img, loaded: true, width: img.width || 0, height: img.height || 0 };
        resolve();
      };
      img.onerror = () => {
        this.witchCardImages[name] = { img: null, loaded: false, width: 0, height: 0 };
        resolve();
      };
    });
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

    this.log(`guide 下载完成：帧序列 ${frameLoaded}/${frameTotal}，精灵图 ${sheetLoaded} 张`);
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

    // getTempFileURL 重试3次
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
          urlData = data;
          break;
        }
        lastError = new Error(data ? (data.errMsg || 'status=' + data.status) : 'urlData=null');
      } catch (e) {
        lastError = e;
      }
      if (attempt < 3) {
        this.log('获取临时URL失败，1秒后第' + (attempt + 1) + '次重试: ' + name);
        await new Promise(r => setTimeout(r, 1000));
      }
    }

    if (!urlData) {
      const detail = lastError ? lastError.message : 'unknown';
      this.log('获取临时URL失败: ' + name + ' detail=' + detail);
      this.guideImages[groupKey].frames[frameIdx] = { img: null, loaded: false };
      return;
    }

    if (existing && existing.img) {
      existing.img.src = '';
    }

    const img = wx.createImage();
    img.src = urlData.tempFileURL;
    await new Promise((resolve) => {
      img.onload = () => {
        this.log('guide 下载完成: ' + name);
        this.guideImages[groupKey].frames[frameIdx] = { img, loaded: true };
        resolve();
      };
      img.onerror = (e) => {
        this.log('guide 图片加载失败: ' + name + ' src=' + (img.src || '').slice(0, 80) + ' err=' + (e && e.message ? e.message : 'unknown'));
        this.guideImages[groupKey].frames[frameIdx] = { img: null, loaded: false };
        resolve();
      };
    });
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

    // getTempFileURL 重试3次
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
          urlData = data;
          break;
        }
        lastError = new Error(data ? (data.errMsg || 'status=' + data.status) : 'urlData=null');
      } catch (e) {
        lastError = e;
      }
      if (attempt < 3) {
        this.log('获取临时URL失败，1秒后第' + (attempt + 1) + '次重试: ' + name);
        await new Promise(r => setTimeout(r, 1000));
      }
    }

    if (!urlData) {
      const detail = lastError ? lastError.message : 'unknown';
      this.log('获取临时URL失败: ' + name + ' detail=' + detail);
      this.guideSpritesheets[groupKey] = { img: null, loaded: false };
      return;
    }

    if (existing && existing.img) {
      existing.img.src = '';
    }

    const img = wx.createImage();
    img.src = urlData.tempFileURL;
    await new Promise((resolve) => {
      img.onload = () => {
        this.log('guide 精灵图下载完成: ' + name);
        this.guideSpritesheets[groupKey] = { img, loaded: true };
        resolve();
      };
      img.onerror = (e) => {
        this.log('guide 精灵图加载失败: ' + name + ' err=' + (e && e.message ? e.message : 'unknown'));
        this.guideSpritesheets[groupKey] = { img: null, loaded: false };
        resolve();
      };
    });
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
    this.log('bg_icon 下载完成：' + loaded.length + '/' + names.length + '张成功');
    if (failed.length > 0) {
      this.log('bg_icon 失败：' + failed.join(', '));
    }
  }

  async _loadBgIconImage(name) {
    const existing = this.bgIconImages[name];
    if (existing && existing.loaded && existing.img) {
      return;
    }

    const fileID = this.bgIconFileMap[name];
    if (!fileID) return;

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
          urlData = data;
          break;
        }
        lastError = new Error(data ? (data.errMsg || 'status=' + data.status) : 'urlData=null');
      } catch (e) {
        lastError = e;
      }
      if (attempt < 3) {
        this.log('获取临时URL失败，1秒后第' + (attempt + 1) + '次重试: ' + name);
        await new Promise(r => setTimeout(r, 1000));
      }
    }

    if (!urlData) {
      const detail = lastError ? lastError.message : 'unknown';
      this.log('获取临时URL失败: ' + name + ' detail=' + detail);
      this.bgIconImages[name] = { img: null, loaded: false, width: 0, height: 0 };
      return;
    }

    if (existing && existing.img) {
      existing.img.src = '';
    }

    const img = wx.createImage();
    img.src = urlData.tempFileURL;
    await new Promise((resolve) => {
      img.onload = () => {
        this.log('bg_icon 下载完成: ' + name);
        this.bgIconImages[name] = {
          img,
          loaded: true,
          width: img.width || 0,
          height: img.height || 0,
        };
        resolve();
      };
      img.onerror = (e) => {
        this.log('bg_icon 图片加载失败: ' + name + ' src=' + (img.src || '').slice(0, 80) + ' err=' + (e && e.message ? e.message : 'unknown'));
        this.bgIconImages[name] = { img: null, loaded: false, width: 0, height: 0 };
        resolve();
      };
    });
  }

  // 将云缓存 bg_icon 图片注入到 renderer 的 bgImage（仅注入 bg）
  injectBgIconToRenderer(renderer) {
    const bgData = this.bgIconImages['bg'];
    if (bgData && bgData.loaded && bgData.img) {
      renderer.bgImage = bgData.img;
      renderer.bgLoaded = true;
      this.log('已注入 bg_icon renderer: bg');
    } else {
      this.log('bg_icon bg 未加载，跳过注入');
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
                this.log('music 下载成功: ' + name);
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
    this.log('music 下载完成，共' + Object.keys(this.musicCache).length + '个');
  }
}

module.exports = { CloudStorageManager };
