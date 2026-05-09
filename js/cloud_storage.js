// ===== 微信云存储管理器 =====
// 环境 ID: cloud1-d3gecbtu10e4035de

class CloudStorageManager {
  constructor(env) {
    this.env = env;
    this.shopCardImages = {}; // { name: { img, loaded, width, height } }
    this.cloudFileMap = {};   // { name: fileID }
    this.initialized = false;
    this.uploading = false;
    this.debugLogs = [];

    // 默认云文件映射（已上传的 shop_card 图片，fileID 固定）
    this.defaultFileMap = {
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

    const shopCardNames = [
      'bonus_gold', 'change_letter', 'extra_discard', 'extra_hands', 'extra_letter',
      'has_face', 'has_vowel', 'length_4', 'length_5', 'length_6',
      'letter_a', 'letter_e', 'reduce_target',
      'upgrade_any', 'upgrade_face', 'upgrade_letter'
    ];

    const results = { success: [], failed: [] };

    for (const name of shopCardNames) {
      const localPath = `images/shop_card/${name}.png`;
      const cloudPath = `shop_card/${name}.png`;
      try {
        const uploadRes = await wx.cloud.uploadFile({
          cloudPath,
          filePath: localPath,
        });
        this.cloudFileMap[name] = uploadRes.fileID;
        results.success.push({ name, fileID: uploadRes.fileID });
      } catch (e) {
        console.error('上传失败:', name, e);
        results.failed.push({ name, error: e });
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

  _loadCloudImage(name) {
    return new Promise((resolve) => {
      const fileID = this.cloudFileMap[name];
      if (!fileID) { resolve(); return; }

      // 获取临时 URL 后用 wx.createImage 直接加载
      wx.cloud.getTempFileURL({
        fileList: [fileID],
        success: (res) => {
          const urlData = res.fileList[0];
          if (!urlData || urlData.status !== 0 || !urlData.tempFileURL) {
            const detail = urlData ? (urlData.errMsg || JSON.stringify(urlData)) : 'urlData=null';
            this.log('获取临时URL失败: ' + name + ' status=' + (urlData ? urlData.status : 'null') + ' detail=' + detail);
            this.shopCardImages[name] = { img: null, loaded: false, width: 0, height: 0 };
            resolve();
            return;
          }
          const img = wx.createImage();
          img.src = urlData.tempFileURL;
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
        },
        fail: (err) => {
          this.log('获取临时URL失败: ' + name + ' ' + (err && err.errMsg ? err.errMsg : JSON.stringify(err)));
          this.shopCardImages[name] = { img: null, loaded: false, width: 0, height: 0 };
          resolve();
        },
      });
    });
  }

  // 获取已缓存的云图片
  getImage(name) {
    return this.shopCardImages[name] || null;
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
}

module.exports = { CloudStorageManager };
