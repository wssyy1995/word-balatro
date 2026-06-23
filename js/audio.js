// ===== 音效管理器 =====
class AudioManager {
  constructor() {
    this.sounds = {};
    this.bgm = null;
    this.enabled = true;
    this.soundEnabled = true;  // 音效开关
    this.musicEnabled = true;  // 音乐/BGM 开关
    this.initialized = false;
    this.bgmStarted = false; // BGM 是否已启动（真机首次播放需用户交互）
    this._firstInteraction = false; // 是否有过用户交互
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
    audio.volume = (name === 'guide_type') ? 0.35 : 0.6;
    audio.obeyMuteSwitch = false; // ← 关键：真机静音模式下也能播放
    this.sounds[name] = audio;
  }

  // 播放音效（支持懒加载：真机上预加载失败时，播放时重新尝试加载）
  play(name) {
    if (!this.enabled || !this.soundEnabled) return;

    // 真机兼容：首次用户交互标记（用于后续启动 BGM）
    this._firstInteraction = true;

    let audio = this.sounds[name];
    if (!audio) {
      // 预加载时没找到，尝试懒加载（可能是路径问题或实例超限）
      const lazySrc = this._findSrcByName(name);
      if (lazySrc) {
        this.load(name, lazySrc);
        audio = this.sounds[name];
      }
    }
    if (!audio) return;

    audio.stop();
    audio.play();
  }

  // 循环播放音效（用于引导对话框打字机等需要持续循环的场景）
  playLoop(name) {
    if (!this.enabled || !this.soundEnabled) return;

    this._firstInteraction = true;

    let audio = this.sounds[name];
    if (!audio) {
      const lazySrc = this._findSrcByName(name);
      if (lazySrc) {
        this.load(name, lazySrc);
        audio = this.sounds[name];
      }
    }
    if (!audio) return;

    audio.loop = true;
    audio.stop();
    audio.play();
  }

  // 停止指定音效并取消循环
  stopSound(name) {
    const audio = this.sounds[name];
    if (audio) {
      audio.loop = false;
      audio.stop();
    }
  }

  // 播放背景音乐（需在用户交互后调用）
  playBGM(src) {
    if (!this.enabled || !this.musicEnabled) return;
    if (this.bgm) {
      this.bgm.stop();
      this.bgm.destroy();
    }
    this.bgm = wx.createInnerAudioContext();
    this.bgm.src = src;
    this.bgm.loop = true;
    this.bgm.volume = 0.3;
    this.bgm.obeyMuteSwitch = false; // ← 关键：真机静音模式下也能播放
    this.bgm.play();
    this.bgmStarted = true;
  }

  // 启动 BGM（不再强制要求用户交互，进入游戏后直接尝试播放）
  tryStartBGM(src = 'music/bg/bg_music.mp3') {
    if (this.bgmStarted || !this.musicEnabled) return;

    // 先检查 BGM 文件是否存在，避免文件缺失时抛 readFile 报错
    const fs = wx.getFileSystemManager();
    try {
      fs.accessSync(src);
    } catch (e) {
      // BGM 文件不存在，静默跳过
      return;
    }

    this.playBGM(src);
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
    this.soundEnabled = enabled;
    this.musicEnabled = enabled;
    if (!enabled) {
      this.stopBGM();
    }
  }

  // 设置音效开关（独立于 BGM）
  setSoundEnabled(enabled) {
    this.soundEnabled = enabled;
  }

  // 设置音乐/BGM 开关
  setMusicEnabled(enabled) {
    this.musicEnabled = enabled;
    if (!enabled && this.bgm) {
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
    this.bgmStarted = false;
    this._firstInteraction = false;
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
      // 有云存储映射，预加载页自动下载到缓存
      { name: 'buy_success', src: 'music/sound_effect/buy_success.mp3' },   // 购买成功弹窗
      { name: 'card_illegal', src: 'music/sound_effect/card_illegal.mp3' }, // 非法单词提示
      { name: 'card_placement', src: 'music/sound_effect/card_placement.mp3' }, // 点击字母卡牌
      { name: 'card_shuffle', src: 'music/sound_effect/card_shuffle.mp3' }, // 点击弃牌
      { name: 'card_valid', src: 'music/sound_effect/card_valid.mp3' },     // 单词校验合法
      { name: 'challenge', src: 'music/sound_effect/challenge.mp3' },       // 点击挑战按钮
      { name: 'game_over', src: 'music/sound_effect/game_over.mp3' },       // 游戏结束弹窗
      { name: 'fail', src: 'music/sound_effect/fail.mp3' },                 // 复刻失败等失败提示
      { name: 'round_win', src: 'music/sound_effect/round_win.mp3' },       // 回合结算弹窗
      { name: 'tap', src: 'music/sound_effect/tap.mp3' },                   // 弹窗/按钮点击
      { name: 'card_sell', src: 'music/sound_effect/card_sell.mp3' },       // 售出道具
      { name: 'card_book_page', src: 'music/sound_effect/card_book_page.mp3' }, // 图鉴翻页
      { name: 'card_jump', src: 'music/sound_effect/card_jump.mp3' },       // 字母牌跳跃
      { name: 'answer_tone', src: 'music/sound_effect/answer_tone.mp3' },   // 字母跳跃触发女巫牌
      { name: 'word_score', src: 'music/sound_effect/word_score.mp3' },     // 计分总数弹出
      { name: 'spin_wheel', src: 'music/sound_effect/spin_wheel.mp3' },     // 转盘旋转
      { name: 'heart_beat', src: 'music/sound_effect/heart_beat.mp3' },      // 复刻水心跳共振动画
      { name: 'levelup', src: 'music/sound_effect/levelup.mp3' },             // 进入下一关
      { name: 'guide_type', src: 'music/sound_effect/type_2.mp3' },          // 引导对话框打字机音效（3秒循环）
      { name: 'witch_guide_1_bg', src: 'music/sound_effect/witch_guide_1_bg.mp3' }, // Phase 1 新人引导背景音乐（播放一次）
      { name: 'homepage_round_tap', src: 'music/sound_effect/homepage_round_tap.mp3' }, // 主页通关模式按钮点击
      { name: 'homepage_big_button', src: 'music/sound_effect/homepage_big_button.mp3' }, // 主页两个大按钮弹出
    ];

    // 保存映射用于懒加载
    this._soundList = soundList;

    soundList.forEach(s => this.load(s.name, s.src));

    // 从 cloudStorage 的本地缓存加载
    this.loadFromCloud(cloudStorage);

    this.initialized = true;
  }

  // 根据名称查找音效路径（懒加载用）
  _findSrcByName(name) {
    if (!this._soundList) return null;
    const found = this._soundList.find(s => s.name === name);
    return found ? found.src : null;
  }
}

module.exports = { AudioManager };
