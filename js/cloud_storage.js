// ===== 微信云存储管理器 =====
// 环境 ID: cloud1-d3gecbtu10e4035de

class CloudStorageManager {
  constructor(env) {
    this.env = env;
    this.shopCardImages = {}; // { name: { img, loaded, width, height } }
    this.witchImages = {};    // { name: { img, loaded, width, height } }
    this.cloudFileMap = {};   // { name: fileID }
    this.witchFileMap = {};   // { name: fileID }
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
      'letter_god':'cloud://cloud1-d3gecbtu10e4035de.636c-cloud1-d3gecbtu10e4035de-1429704466/shop_card/letter_god.png'
    };

    // 默认 witch 图片云文件映射
    this.defaultWitchFileMap = {
      'witch_18': 'cloud://cloud1-d3gecbtu10e4035de.636c-cloud1-d3gecbtu10e4035de-1429704466/witch/witch_16.png',
      'witch_16': 'cloud://cloud1-d3gecbtu10e4035de.636c-cloud1-d3gecbtu10e4035de-1429704466/witch/witch_16.png',
      'witch_14': 'cloud://cloud1-d3gecbtu10e4035de.636c-cloud1-d3gecbtu10e4035de-1429704466/witch/witch_14.png',
      'witch_11': 'cloud://cloud1-d3gecbtu10e4035de.636c-cloud1-d3gecbtu10e4035de-1429704466/witch/witch_11.png',
      'witch_2': 'cloud://cloud1-d3gecbtu10e4035de.636c-cloud1-d3gecbtu10e4035de-1429704466/witch/witch_2.png',
      'witch_4': 'cloud://cloud1-d3gecbtu10e4035de.636c-cloud1-d3gecbtu10e4035de-1429704466/witch/witch_4.png',
      'witch_5': 'cloud://cloud1-d3gecbtu10e4035de.636c-cloud1-d3gecbtu10e4035de-1429704466/witch/witch_5.png',
      'witch_8': 'cloud://cloud1-d3gecbtu10e4035de.636c-cloud1-d3gecbtu10e4035de-1429704466/witch/witch_8.png',
    };
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
  async preloadShopCardImages() {
    const names = Object.keys(this.cloudFileMap);
    if (names.length === 0) {
      this.log('没有云存储图片映射，跳过预加载');
      return;
    }

    this.log('开始下载 shop_card 图片，共' + names.length + '张');
    const promises = names.map(name => this._loadCloudImage(name));
    await Promise.all(promises);
    const loaded = Object.keys(this.shopCardImages).filter(n => this.shopCardImages[n].loaded);
    const failed = names.filter(n => !this.shopCardImages[n] || !this.shopCardImages[n].loaded);
    this.log('下载完成：' + loaded.length + '/' + names.length + '张成功');
    if (failed.length > 0) {
      this.log('失败：' + failed.join(', '));
    }
  }

  // 上传 images/witch 目录下所有 .png 到云存储
  async uploadWitchImages() {
    if (this.uploading) return { success: false, message: '正在上传中...' };
    this.uploading = true;

    const results = { success: [], failed: [] };
    const fs = wx.getFileSystemManager();

    let files = [];
    try {
      files = fs.readdirSync('images/witch/');
    } catch (e) {
      this.log('读取 witch 目录失败: ' + (e && e.message ? e.message : String(e)));
      this.uploading = false;
      return { success: false, message: '读取目录失败', error: e };
    }

    const pngFiles = files.filter(f => f.endsWith('.png'));
    this.log('扫描 images/witch/ 目录下');
    this.log('扫描到 ' + pngFiles.length + ' 张本地 witch 图片');

    for (const fileName of pngFiles) {
      const name = fileName.replace(/\.png$/i, '');
      const localPath = `images/witch/${fileName}`;
      const cloudPath = `witch/${fileName}`;

      this.log('开始上传 witch/' + name);

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
        this.witchFileMap[name] = uploadRes.fileID;
        results.success.push({ name, fileID: uploadRes.fileID });
        this.log('上传成功 witch/' + name);
      } else {
        console.error('上传失败:', name, lastError);
        this.log('上传失败 witch/' + name + ' ' + (lastError && lastError.message ? lastError.message : String(lastError)));
        results.failed.push({ name, error: lastError });
      }
    }

    // 保存映射到本地缓存
    try {
      wx.setStorageSync('cloud_witch_map', JSON.stringify(this.witchFileMap));
    } catch (e) {}

    this.uploading = false;
    return results;
  }

  // 从云存储下载并缓存所有 witch 图片（后台静默加载）
  async preloadWitchImages() {
    const names = Object.keys(this.witchFileMap);
    if (names.length === 0) {
      this.log('没有 witch 云存储映射，跳过预加载');
      return;
    }

    this.log('开始下载 witch 图片，共' + names.length + '张');
    const promises = names.map(name => this._loadWitchImage(name));
    await Promise.all(promises);
    const loaded = Object.keys(this.witchImages).filter(n => this.witchImages[n].loaded);
    const failed = names.filter(n => !this.witchImages[n] || !this.witchImages[n].loaded);
    this.log('witch 下载完成：' + loaded.length + '/' + names.length + '张成功');
    if (failed.length > 0) {
      this.log('witch 失败：' + failed.join(', '));
    }
  }

  async _loadCloudImage(name) {
    const fileID = this.cloudFileMap[name];
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
      this.shopCardImages[name] = { img: null, loaded: false, width: 0, height: 0 };
      return;
    }

    // wx.createImage 加载图片
    const img = wx.createImage();
    img.src = urlData.tempFileURL;
    await new Promise((resolve) => {
      img.onload = () => {
        this.log('下载完成: ' + name);
        this.shopCardImages[name] = {
          img,
          loaded: true,
          width: img.width || 0,
          height: img.height || 0,
        };
        resolve();
      };
      img.onerror = (e) => {
        this.log('图片加载失败: ' + name + ' src=' + (img.src || '').slice(0, 80) + ' err=' + (e && e.message ? e.message : 'unknown'));
        this.shopCardImages[name] = { img: null, loaded: false, width: 0, height: 0 };
        resolve();
      };
    });
  }

  async _loadWitchImage(name) {
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
}

module.exports = { CloudStorageManager };
