// ===== 微信云存储管理器 =====
// 环境 ID: cloud1-d3gecbtu10e4035de

class CloudStorageManager {
  constructor(env) {
    this.env = env;
    this.shopCardImages = {}; // { name: { img, loaded, width, height } }
    this.cloudFileMap = {};   // { name: fileID }
    this.initialized = false;
    this.uploading = false;
  }

  init() {
    try {
      wx.cloud.init({ env: this.env, traceUser: false });
      this.initialized = true;
    } catch (e) {
      console.warn('云开发初始化失败:', e);
    }
    // 从本地缓存读取已上传的文件映射
    try {
      const stored = wx.getStorageSync('cloud_shop_card_map');
      if (stored) {
        this.cloudFileMap = JSON.parse(stored);
      }
    } catch (e) {
      this.cloudFileMap = {};
    }
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
      console.log('[Cloud] 没有云存储图片映射，跳过预加载');
      return;
    }

    console.log('[Cloud] 开始从云端下载 shop_card 图片，共', names.length, '张');
    const promises = names.map(name => this._loadCloudImage(name));
    await Promise.all(promises);
    const loaded = Object.keys(this.shopCardImages).filter(n => this.shopCardImages[n].loaded);
    console.log('[Cloud] 云端图片下载完成:', loaded.length, '/', names.length, '张成功');
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
            console.error('[Cloud] 获取临时URL失败:', name, urlData);
            this.shopCardImages[name] = { img: null, loaded: false, width: 0, height: 0 };
            resolve();
            return;
          }
          const img = wx.createImage();
          img.src = urlData.tempFileURL;
          img.onload = () => {
            console.log('[Cloud] 下载完成:', name);
            this.shopCardImages[name] = {
              img,
              loaded: true,
              width: img.width || 0,
              height: img.height || 0,
            };
            resolve();
          };
          img.onerror = () => {
            console.error('[Cloud] 图片加载失败:', name);
            this.shopCardImages[name] = { img: null, loaded: false, width: 0, height: 0 };
            resolve();
          };
        },
        fail: (err) => {
          console.error('[Cloud] 获取临时URL失败:', name, err);
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
    console.log('[Cloud] 已注入 renderer:', count, '张');
  }
}

module.exports = { CloudStorageManager };
