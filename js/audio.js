// ===== 音效管理器 =====
class AudioManager {
  constructor() {
    this.sounds = {};
    this.bgm = null;
    this.enabled = true;
    this.initialized = false;
  }

  // 加载音效
  load(name, src) {
    const fs = wx.getFileSystemManager();
    try {
      fs.accessSync(src);
    } catch (e) {
      // 音效文件不存在，跳过加载
      return;
    }
    const audio = wx.createInnerAudioContext();
    audio.src = src;
    audio.volume = 0.6;
    this.sounds[name] = audio;
  }

  // 播放音效
  play(name) {
    if (!this.enabled || !this.sounds[name]) return;
    const audio = this.sounds[name];
    audio.stop();
    audio.play();
  }

  // 播放背景音乐
  playBGM(src) {
    if (!this.enabled) return;
    if (this.bgm) {
      this.bgm.stop();
      this.bgm.destroy();
    }
    this.bgm = wx.createInnerAudioContext();
    this.bgm.src = src;
    this.bgm.loop = true;
    this.bgm.volume = 0.3;
    this.bgm.play();
  }

  // 停止背景音乐
  stopBGM() {
    if (this.bgm) {
      this.bgm.stop();
    }
  }

  // 设置音效开关
  setEnabled(enabled) {
    this.enabled = enabled;
    if (!enabled) {
      this.stopBGM();
    }
  }

  // 销毁所有音频资源，防止 restart 时泄漏
  destroy() {
    Object.values(this.sounds).forEach(audio => {
      try {
        audio.stop();
        audio.destroy();
      } catch (e) {}
    });
    this.sounds = {};
    if (this.bgm) {
      try {
        this.bgm.stop();
        this.bgm.destroy();
      } catch (e) {}
      this.bgm = null;
    }
  }

  // 从 cloudStorage 的 musicCache 加载缓存的音频
  loadFromCloud(cloudStorage) {
    if (!cloudStorage || !cloudStorage.musicCache) return;
    Object.entries(cloudStorage.musicCache).forEach(([name, path]) => {
      if (!this.sounds[name]) {
        this.load(name, path);
      }
    });
  }

  // 预加载所有音效（需要在游戏启动时调用）
  preloadAll(cloudStorage = null) {
    // 注意：实际项目中需要将这些音效文件放入项目目录
    // 例如：audio/ 文件夹下放置以下文件
    const soundList = [
      { name: 'select', src: 'audio/select.mp3' },      // 选牌
      { name: 'deselect', src: 'audio/deselect.mp3' },  // 取消选牌
      { name: 'play', src: 'audio/play.mp3' },          // 出牌
      { name: 'discard', src: 'audio/discard.mp3' },    // 弃牌
      { name: 'valid', src: 'audio/valid.mp3' },        // 合法单词
      { name: 'invalid', src: 'audio/invalid.mp3' },    // 非法单词
      { name: 'score', src: 'audio/score.mp3' },        // 得分
      { name: 'upgrade', src: 'audio/upgrade.mp3' },    // 升级
      { name: 'buy', src: 'audio/buy.mp3' },            // 购买
      { name: 'levelup', src: 'audio/levelup.mp3' },    // 进入下一关
      { name: 'surrender', src: 'audio/surrender.mp3' },// 投降
      { name: 'button', src: 'audio/button.mp3' },      // 按钮点击
      { name: 'card_placement', src: 'music/sound_effect/card_placement.mp3' }, // 点击字母卡牌
      { name: 'card_valid', src: 'music/sound_effect/card_valid.mp3' },  // 单词校验合法
      { name: 'card_shuffle', src: 'music/sound_effect/card_shuffle.mp3' }, // 点击弃牌
      { name: 'round_win', src: 'music/sound_effect/round_win.mp3' },    // 回合结算弹窗
      { name: 'game_over', src: 'music/sound_effect/game_over.mp3' },    // 游戏结束弹窗
      { name: 'card_illegal', src: 'music/sound_effect/card_illegal.mp3' }, // 非法单词提示
      { name: 'tap', src: 'music/sound_effect/tap.mp3' },                  // 弹窗/按钮点击
      { name: 'challenge', src: 'music/sound_effect/challenge.mp3' },      // 点击挑战按钮
      { name: 'buy_success', src: 'music/sound_effect/buy_success.mp3' },  // 购买成功弹窗
    ];

    soundList.forEach(s => this.load(s.name, s.src));

    // 从 cloudStorage 的本地缓存加载
    this.loadFromCloud(cloudStorage);

    this.initialized = true;
  }
}

module.exports = { AudioManager };
