// ===== 对战模式渲染器 =====
const { LETTER_SCORE } = require('../data');
const { Easing } = require('../animation');
const { DailyAchievements } = require('../daily_achievements');

const COLORS = {
  bg: '#f5e6c8',
  panelBg: '#faf6ee',
  text: '#5a3e1f',
  gold: '#c4a35a',
  darkRed: '#6a2a2a',
  blueHeader: '#3a5a8a',
  greenHeader: '#4a7a4a',
  tileStroke: '#8a7a6a',
  hiddenTile: '#d8d0c0',
  hiddenTileBlue: 'rgba(225, 233, 242, 0.5)',
  hiddenTileBlueBorder: '#8fa9c2',
  disabledText: 'rgba(90,62,31,0.35)',
};

class BattleRenderer {
  constructor(renderer) {
    this.parent = renderer;
    this.battlePlayBtnRect = null;
    this.battleClearBtnRect = null;
    this.battleCardRects = [];
    this.battleTopHomeRect = null;
    this.battleMatchCloseRect = null;
    this.battleHomeConfirmBtnRect = null;
    this.battleMenuBtnRect = null;
    this.battleRetryBtnRect = null;
    this.battlePanelLeft = null;
    this.battlePanelRight = null;
    this._lastBotStatusText = null;
    this._lastBotStatusTextOffset = 0;
    this._lastPlayerStatusText = null;
    this._lastPlayerStatusTextOffset = 0;

    // 轮次徽章数字缩放脉冲动画
    this._lastBattleRound = 0;
    this._battleRoundPulseAnim = null;

    // 对战结束弹窗动画状态
    this.battleEndAnimStartTime = null;
    this.lastBattlePhase = null;
    this._battleEndSoundPlayed = false;
    this._btnPressAnims = {};
    this._victoryStars = Array.from({ length: 20 }, () => ({
      x: (Math.random() * 2 - 1) * 0.9,
      y: (Math.random() * 2 - 1) * 0.55,
      r: 1.5 + Math.random() * 3,
      phase: Math.random() * Math.PI * 2,
      speed: 1 + Math.random() * 2.5,
      alpha: 0.3 + Math.random() * 0.7
    }));

    // 分数进度条闪电图标（由 cloudStorage 注入）
    this.battleProgressIcon = null;
    this.battleProgressIconLoaded = false;

    // 荣誉杯图标（由 cloudStorage 注入）
    this.battleHonorTrophyIcon = null;
    this.battleHonorTrophyIconLoaded = false;

    // "请出牌"提示图标（由 cloudStorage 注入）
    this.battleCardIcon = null;
    this.battleCardIconLoaded = false;

    // "对手选择中"提示图标（由 cloudStorage 注入）
    this.battleCardIconRival = null;
    this.battleCardIconRivalLoaded = false;

    // "超时未出牌"提示图标（由 cloudStorage 注入）
    this.battleOvertimeIcon = null;
    this.battleOvertimeIconLoaded = false;

    // 加载当前用户头像
    this.selfAvatarUrl = null;
    this.selfAvatarImg = null;
    this.selfAvatarLoaded = false;
    this._loadSelfAvatar();

    // 预制对手昵称列表（与全国榜默认昵称保持一致）
    this._opponentNames = [
      '不开会员', '休眠中-', '4AM', 'Puppy°', '芒种', '悠悠Y²', '已读不认', '空気', 'Zznull.',
      '离线模式', '透明人_', 'ω猫', '彬_victor', '暂不营业', '假装在_', '一弄0.o', '电量1%', '=懒=',
      '晚风·Free', '算了.r', '请于风', '关闭通话a.iris', '早睡失败户', '帅云微', '已黑化☾',
      'herry_78', 'ctrl+z', '云朵偷喝我酒', '耶耶荷花', '信号丢失中...', '野猪炖蘑菇',
      '草莓味的', '双子星', '娜塔N', 'mango冰淇淋', 'Emma_ju', '星星不亮了',
      '不想上班星球', '苦苦k.', '关闭免打扰', '假冷静', '丽云熙', '麦苗', 'Vike_陈',
      'Atom', '反卷战士', '王逗逗', '程一', '咸鱼翻身中', '数据迷雾', 'Jmx',
      '山间慢邮', '萝卜头', '低像素人类', '自动回复中', '打嗝的河豚', '算法诗人', '选择性清醒',
      '桃気𓆡', '苔痕上阶', '欧米茄ω', '甜甜圈洞', '延迟响应', '才厚楠', '李橙子', '不失眠星球',
      '云端漫步☁', '小辣鸡', '五行缺觉', 'luna♪', '石榴树', 'Ly小林', '此人404', 'love yourself',
      'momo·', '加载中99%', '电量低于50%', '深夜网抑云', '栖木·', '暂无灵感', '樱桃小丸犊子',
      '面包大人', '萤火岛屿', 'echo~', 'Jajaja', '指令未完', '困困鱼', '精神内耗重症区', '四月涧',
      '无聊有限公司CEO', '快乐水omega', '肥宅快乐水', '电量耗尽请投币', 'Lifeiwen', '维度旅行者',
      '老丈人', '精神现状存疑', '反方向的钟·'
    ];
  }

  // 从主 renderer 同步 cloudStorage 注入的对战图标
  _syncBattleIcons() {
    const parent = this.parent;
    if (!parent) return;
    const icons = [
      'battleProgressIcon',
      'battleHonorTrophyIcon',
      'battleCardIcon',
      'battleCardIconRival',
      'battleOvertimeIcon'
    ];
    icons.forEach(key => {
      if (parent[key + 'Loaded'] && parent[key] && !this[key]) {
        this[key] = parent[key];
        this[key + 'Loaded'] = true;
      }
    });
  }

  // ===== 加载当前用户头像 =====
  _loadSelfAvatar() {
    // 优先从本地缓存读取
    try {
      const userInfo = wx.getStorageSync('userInfo') || {};
      if (userInfo.avatarUrl) {
        this._setSelfAvatar(userInfo.avatarUrl);
        return;
      }
    } catch (e) {}

    // 尝试直接获取（需用户已授权）
    if (wx.getUserInfo) {
      wx.getUserInfo({
        withCredentials: false,
        lang: 'zh_CN',
        success: (res) => {
          const userInfo = res.userInfo || {};
          if (userInfo.avatarUrl) {
            this._setSelfAvatar(userInfo.avatarUrl);
          }
        },
        fail: () => {}
      });
    }
  }

  _setSelfAvatar(url) {
    this.selfAvatarUrl = url;
    try {
      const img = wx.createImage();
      img.src = url;
      img.onload = () => { this.selfAvatarLoaded = true; };
      img.onerror = () => { this.selfAvatarLoaded = false; };
      this.selfAvatarImg = img;
    } catch (e) {
      this.selfAvatarLoaded = false;
    }
  }

  // 联网对战：异步加载对手真实头像
  _loadOpponentAvatar(url, game) {
    if (!url || !game) return;
    try {
      const img = wx.createImage();
      img.src = url;
      img.onload = () => {
        if (game._battleOpponent) {
          game._battleOpponent.avatar = {
            type: 'url',
            img,
            loaded: true
          };
        }
      };
      img.onerror = () => {
        if (game._battleOpponent) {
          game._battleOpponent.avatar = { type: 'url', img: null, loaded: false };
        }
      };
    } catch (e) {
      if (game._battleOpponent) {
        game._battleOpponent.avatar = { type: 'url', img: null, loaded: false };
      }
    }
  }

  draw(ctx, game, W, H, s) {
    // 同步 cloudStorage 注入的对战图标
    this._syncBattleIcons();

    // 禁用游戏页左上角的设置按钮热区，避免与对战返回/设置按钮冲突
    this.parent.topIconRect = null;

    // 背景
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = COLORS.bg;
    ctx.fillRect(0, 0, W, H);

    const safeTop = this.parent.safeTop || 0;
    const safeBottom = this.parent.safeBottom || 0;
    const topY = safeTop + 10 * s;

    // === 顶部栏 ===
    this._drawTopBar(ctx, game, W, topY, s);

    // === 标题 ===
    const titleY = topY + 23 * s;
    this._drawTitle(ctx, W, titleY, s);

    // === 轮次徽章 ===
    const badgeY = titleY + 22 * s;
    this._drawRoundBadge(ctx, game, W, badgeY, s);

    // === 玩家头像 + 总分 ===
    const avatarY = badgeY + 45 * s;
    const avatarRowH = 60 * s;
    this._drawAvatarRow(ctx, game, W, avatarY, avatarRowH, s);

    // === 提示语 ===
    const promptY = avatarY + avatarRowH + 14 * s;
    // 临时隐藏提示语
    // this._drawCenterPrompt(ctx, W, promptY, s);

    // === 对战面板（只显示状态和本轮单词） ===
    const panelsY = promptY + 24 * s + 4 * s;
    const panelH = 94 * s;
    // 出牌区模块单独下移 2px（下方预览区/手牌仍按原 panelsY 计算，不跟随）
    this._drawPlayerPanels(ctx, game, W, panelsY + 2 * s, panelH, s);

    // === 单词预览区 ===
    const previewY = panelsY + panelH + 28 * s + 5 * s;
    this._drawPreview(ctx, game, W, previewY, s);

    // === 手牌 ===
    const handY = previewY + 54 * s + 10 * s;
    const handBottom = this._drawHand(ctx, game, handY, W, s);

    // === 底部按钮 ===
    const btnY = Math.min(handBottom + 18 * s, H - safeBottom - 68 * s) + 10 * s;
    this._drawBottomButtons(ctx, game, W, btnY, s);

    // === 回合推进卡住时的手动重试按钮 ===
    this._drawRetryButton(ctx, game, W, H, btnY, s);

    // === Reveal 动画触发与绘制 ===
    this._updateBattleRevealAnimation(game, s);
    this._drawBattleFlyingScore(ctx, s, game);

    // === 对战结束弹窗 ===
    if (game.battlePhase === 'battle_end') {
      this._drawEndPopup(ctx, game, W, H, s);
    } else {
      this.lastBattlePhase = game.battlePhase;
      this._battleEndSoundPlayed = false;
    }

    // === 对战匹配弹窗 ===
    this._drawBattleMatchPopup(ctx, game, W, H, s);

    // === 回到首页确认弹窗 ===
    if (game._battleHomeConfirmPopup) {
      this._drawHomeConfirmPopup(ctx, game, W, H, s);
    }

    // === 房间已结束弹窗（对方退出） ===
    if (game._battleRoomClosedPopup) {
      this._drawRoomClosedPopup(ctx, game, W, H, s);
    }
  }

  // ===== 随机生成对手（头像 + 昵称），与全国榜默认头像/昵称分配逻辑一致 =====
  _generateRandomOpponent() {
    const names = this._opponentNames;
    // 随机选取一个 0~99 的默认头像索引，昵称与头像使用同一索引
    const defaultAvatarIndex = Math.floor(Math.random() * 100);
    const name = names[defaultAvatarIndex % names.length];

    // 按全国榜做法：从 4 张 5×5 rank_avatar 图集中裁剪单头像（每张 200×200，单头像 40×40）
    const idx = defaultAvatarIndex % 100;
    const sheetIdx = Math.floor(idx / 25);
    const innerIdx = idx % 25;
    const row = Math.floor(innerIdx / 5);
    const col = innerIdx % 5;

    const rankAvatars = this.parent.rankAvatarImages || {};
    const cloudSheet = rankAvatars[`rank_avatar_${sheetIdx + 1}`];
    let avatar = null;
    if (cloudSheet && cloudSheet.loaded && cloudSheet.img) {
      avatar = {
        type: 'sheet',
        img: cloudSheet.img,
        sx: col * 40,
        sy: row * 40,
        sw: 40,
        sh: 40,
        loaded: true
      };
    }

    return { name, avatar, defaultAvatarIndex };
  }

  // ===== 对战匹配弹窗：果冻感弹出 + 匹配流程 =====
  _drawBattleMatchPopup(ctx, game, W, H, s) {
    let anim = game._battleMatchAnim;
    this.battleMatchCloseRect = null;
    if (!anim) return;

    const now = Date.now();
    let elapsed = now - anim.startTime;
    const POP_DURATION = 600;
    const MATCH_SOUND_DELAY = 200; // 匹配弹窗弹出后 200ms 再启动音效/光圈呼吸

    // 匹配中循环音效（延迟 MATCH_SOUND_DELAY 后启动一次）
    if (anim.phase === 'matching' && !anim._matchingSoundStarted && now >= anim.startTime + MATCH_SOUND_DELAY) {
      if (game.audioManager) game.audioManager.playLoop('battle_matching');
      anim._matchingSoundStarted = true;
    }

    // 阶段转换：matching -> matched
    if (anim.phase === 'matching' && elapsed >= anim.matchDuration) {
      anim.phase = 'matched';
      anim.matchedTime = now;
      anim.opponent = this._generateRandomOpponent();
      game._battleOpponent = anim.opponent;
      elapsed = 0;
      // 停止匹配循环音效并播放匹配成功音效
      if (game.audioManager) {
        game.audioManager.stopSound('battle_matching');
        game.audioManager.play('battle_match_sccess');
      }
    }

    const MATCHED_DURATION = 1500;
    const COUNTDOWN_DURATION = 3000;
    const DISAPPEAR_DURATION = 250;

    // 阶段转换：matched -> countdown（匹配成功信息显示 1.5 秒）
    if (anim.phase === 'matched' && anim.matchedTime && now - anim.matchedTime >= MATCHED_DURATION) {
      anim.phase = 'countdown';
      anim.countdownStartTime = now;
    }

    // 阶段转换：countdown -> disappearing（3 秒倒计时后）
    if (anim.phase === 'countdown' && anim.countdownStartTime && now - anim.countdownStartTime >= COUNTDOWN_DURATION) {
      anim.phase = 'disappearing';
      anim.disappearStartTime = now;
    }

    // 阶段转换：disappearing -> 结束，开始正式对局
    const disappearElapsed = anim.disappearStartTime ? now - anim.disappearStartTime : 0;
    const disappearProgress = anim.disappearStartTime ? Math.min(1, disappearElapsed / DISAPPEAR_DURATION) : 0;
    if (anim.phase === 'disappearing' && anim.disappearStartTime && disappearElapsed >= DISAPPEAR_DURATION) {
      if (game.audioManager) game.audioManager.stopSound('battle_matching');
      game._battleMatchAnim = null;
      if (game.battleManager) game.battleManager.finishMatchSetup();
      return;
    }
    // 安全兜底：即使计时器有微小偏差，只要完全淡出就清理
    if (anim.phase === 'disappearing' && disappearProgress >= 1) {
      if (game.audioManager) game.audioManager.stopSound('battle_matching');
      game._battleMatchAnim = null;
      if (game.battleManager) game.battleManager.finishMatchSetup();
      return;
    }

    // 计算弹窗整体缩放与透明度
    let panelScale = 1;
    let contentAlpha = 1;
    if (anim.phase === 'matching') {
      if (elapsed < POP_DURATION) {
        panelScale = Easing.easeOutBackStrong(elapsed / POP_DURATION);
      }
    } else if (anim.phase === 'disappearing') {
      const disappearProgress = Math.min(1, (now - anim.disappearStartTime) / DISAPPEAR_DURATION);
      panelScale = 1 - disappearProgress;
      contentAlpha = 1 - disappearProgress;
    }

    // 黑色背景蒙层（前 400ms 从 0 淡入到 0.65，消失阶段淡出）
    let overlayAlpha = 0.65;
    if (anim.phase === 'matching') {
      overlayAlpha = Math.min(0.65, elapsed / 400 * 0.65);
    } else if (anim.phase === 'disappearing') {
      const disappearProgress = Math.min(1, (now - anim.disappearStartTime) / DISAPPEAR_DURATION);
      overlayAlpha = 0.65 * (1 - disappearProgress);
    }
    ctx.save();
    ctx.globalAlpha = overlayAlpha;
    ctx.fillStyle = 'rgba(0, 0, 0, 0.65)';
    ctx.fillRect(0, 0, W, H);
    ctx.restore();

    const matchImg = this.parent.battleMatch;
    const swordImg = this.parent.battleMatchSword;
    const matchLoaded = this.parent.battleMatchLoaded;
    const swordLoaded = this.parent.battleMatchSwordLoaded;
    if (!matchLoaded || !matchImg) return;

    // battle_match 底图尺寸
    const maxMatchW = W * 0.72;
    const maxMatchH = H * 0.42;
    let matchW = maxMatchW;
    let matchH = maxMatchW * (matchImg.height / matchImg.width);
    if (matchH > maxMatchH) {
      matchH = maxMatchH;
      matchW = matchH * (matchImg.width / matchImg.height);
    }

    const cx = W / 2;
    const cy = H * 0.52;
    const matchX = cx - matchW / 2;
    const matchY = cy - matchH / 2;

    ctx.save();
    ctx.globalAlpha = contentAlpha;
    ctx.translate(cx, cy);
    ctx.scale(panelScale, panelScale);
    ctx.translate(-cx, -cy);

    // 绘制底图
    ctx.drawImage(matchImg, matchX, matchY, matchW, matchH);

    // 关闭按钮（右上角）
    const closeBtnSize = 24 * s;
    const closeBtnX = matchX + matchW - closeBtnSize - 10 * s;
    const closeBtnY = matchY + 10 * s - 15 * s; // 上移 15px
    const closeBtnCX = closeBtnX + closeBtnSize / 2;
    const closeBtnCY = closeBtnY + closeBtnSize / 2;

    // 记录屏幕坐标点击区域（考虑弹窗整体缩放）
    this.battleMatchCloseRect = {
      x: cx + (closeBtnX - cx) * panelScale,
      y: cy + (closeBtnY - cy) * panelScale,
      w: closeBtnSize * panelScale,
      h: closeBtnSize * panelScale
    };

    ctx.save();
    ctx.beginPath();
    ctx.arc(closeBtnCX, closeBtnCY, closeBtnSize / 2, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(0, 0, 0, 0.35)';
    ctx.fill();
    ctx.lineWidth = 1.5 * s;
    ctx.strokeStyle = 'rgba(215, 177, 98, 0.8)';
    ctx.stroke();

    const xSize = 7 * s;
    ctx.beginPath();
    ctx.moveTo(closeBtnCX - xSize, closeBtnCY - xSize);
    ctx.lineTo(closeBtnCX + xSize, closeBtnCY + xSize);
    ctx.moveTo(closeBtnCX + xSize, closeBtnCY - xSize);
    ctx.lineTo(closeBtnCX - xSize, closeBtnCY + xSize);
    ctx.lineWidth = 2 * s;
    ctx.strokeStyle = '#d7b162';
    ctx.lineCap = 'round';
    ctx.stroke();
    ctx.restore();

    // 标题区域
    const titleY = matchY + 61 * s;
    const titleFont = this.parent.titleFontFamily || 'sans-serif';
    const mainTitleFont = '"Source Han Serif SC", "Noto Serif SC", "SimSun", serif';

    if (anim.phase === 'matching') {
      // 主标题：对手匹配中
      ctx.save();
      ctx.font = `bold ${Math.floor(18 * s)}px ${mainTitleFont}`;
      ctx.fillStyle = '#d7b162';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('对手匹配中', cx, titleY);
      ctx.restore();

      // 副标题
      ctx.save();
      ctx.font = `${Math.floor(12 * s)}px ${titleFont}`;
      ctx.fillStyle = '#d7c28a';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('正在为你寻找实力相当的对手...', cx, titleY + 22 * s);
      ctx.restore();

      // 剑图标与呼吸光圈
      if (swordLoaded && swordImg) {
        let swordW = matchW * 0.35;
        let swordH = swordW * (swordImg.height / swordImg.width);
        const maxSwordH = matchH * 0.315;
        if (swordH > maxSwordH) {
          swordH = maxSwordH;
          swordW = swordH * (swordImg.width / swordImg.height);
        }
        const swordX = cx - swordW / 2;
        const swordY = matchY + matchH * 0.5 - 20 * s;

        // 经典脉动金色呼吸光圈（参考金光之环方案一）
        // 呼吸频率与 battle_matching 循环音效时长保持一致：一个音频循环 = 一次完整呼吸
        // 同时与音效一起延迟 MATCH_SOUND_DELAY 启动
        const swordCX = cx;
        const swordCY = swordY + swordH / 2;
        const breathT = Math.max(0, now - anim.startTime - MATCH_SOUND_DELAY) / 1000;
        const baseR = Math.max(swordW, swordH) * 0.58;
        const loopDuration = game.audioManager && game.audioManager._loopDurations && game.audioManager._loopDurations['battle_matching'];
        const breathFreq = loopDuration ? (2 * Math.PI / loopDuration) : 2.8;
        const breath = 1 + 0.08 * Math.sin(breathT * breathFreq);
        const alpha = 0.55 + 0.35 * Math.sin(breathT * breathFreq);

        ctx.save();

        // 外扩散光晕（4 层）
        for (let i = 3; i >= 0; i--) {
          const spread = 1 + i * 0.1;
          const rr = baseR * breath * spread;
          const a = alpha * 0.12 * (1 - i * 0.2);
          ctx.beginPath();
          ctx.arc(swordCX, swordCY, rr, 0, Math.PI * 2);
          ctx.strokeStyle = `rgba(255, 180, 40, ${a})`;
          ctx.lineWidth = (14 - i * 3) * s;
          ctx.stroke();
        }

        // 主环
        ctx.beginPath();
        ctx.arc(swordCX, swordCY, baseR * breath, 0, Math.PI * 2);
        const grad = ctx.createRadialGradient(swordCX, swordCY, baseR * 0.8, swordCX, swordCY, baseR * 1.2);
        grad.addColorStop(0, `rgba(255,200,60,${alpha * 0.7})`);
        grad.addColorStop(0.5, `rgba(255,160,20,${alpha})`);
        grad.addColorStop(1, `rgba(255,200,60,${alpha * 0.3})`);
        ctx.strokeStyle = grad;
        ctx.lineWidth = 4 * s;
        ctx.shadowColor = 'rgba(255,170,30,0.7)';
        ctx.shadowBlur = 24 * breath * s;
        ctx.stroke();
        ctx.shadowBlur = 0;

        ctx.restore();

        // 剑图标
        ctx.drawImage(swordImg, swordX, swordY, swordW, swordH);
      }
    } else if (anim.phase === 'matched' && anim.opponent) {
      // 匹配成功标题（带缩放脉冲）
      const matchedElapsed = now - anim.matchedTime;
      const titleScale = matchedElapsed < 250
        ? Easing.easeOutBackStrong(Math.min(1, matchedElapsed / 250))
        : 1;

      ctx.save();
      ctx.translate(cx, titleY + 2 * s);
      ctx.scale(titleScale, titleScale);
      ctx.font = `bold ${Math.floor(20 * s)}px ${mainTitleFont}`;
      ctx.fillStyle = '#d7b162';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('匹配成功！', 0, 0);
      ctx.restore();

      // 对手头像和名字整体缩放弹出
      const avatarR = 32 * s;
      const avatarY = matchY + matchH * 0.48 + 2 * s;
      const opponent = anim.opponent;
      const introElapsed = now - anim.matchedTime;
      const introScale = introElapsed < 300
        ? Easing.easeOutBackStrong(Math.min(1, introElapsed / 300))
        : 1;

      ctx.save();
      ctx.translate(cx, avatarY);
      ctx.scale(introScale, introScale);
      ctx.translate(-cx, -avatarY);

      ctx.save();
      ctx.beginPath();
      ctx.arc(cx, avatarY, avatarR, 0, Math.PI * 2);
      ctx.fillStyle = '#e0d4c0';
      ctx.fill();
      ctx.lineWidth = 2 * s;
      ctx.strokeStyle = '#c4a35a';
      ctx.stroke();

      if (opponent.avatar && opponent.avatar.loaded) {
        const displayAvatarR = avatarR - 2 * s;
        ctx.save();
        ctx.beginPath();
        ctx.arc(cx, avatarY, displayAvatarR, 0, Math.PI * 2);
        ctx.clip();
        const a = opponent.avatar;
        if (a.type === 'sheet') {
          // 居中裁剪 20% 直径的边距（四周各 10%），再拉伸铺满显示圆
          const srcMargin = a.sw * 0.10;
          const srcX = a.sx + srcMargin;
          const srcY = a.sy + srcMargin;
          const srcW = a.sw - srcMargin * 2;
          const srcH = a.sh - srcMargin * 2;
          ctx.drawImage(a.img, srcX, srcY, srcW, srcH, cx - displayAvatarR, avatarY - displayAvatarR, displayAvatarR * 2, displayAvatarR * 2);
        } else {
          ctx.drawImage(a.img, cx - displayAvatarR, avatarY - displayAvatarR, displayAvatarR * 2, displayAvatarR * 2);
        }
        ctx.restore();
      }
      ctx.restore();

      // 对手名字
      ctx.save();
      ctx.font = `bold ${Math.floor(15 * s)}px ${titleFont}`;
      ctx.fillStyle = '#d7c28a';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(opponent.name, cx, avatarY + avatarR + 16 * s);
      ctx.restore();

      // 对手荣誉杯（虚拟数量：我方 +2~10，整局稳定）
      const matchTrophies = (opponent.trophies !== undefined) ? opponent.trophies : (game.honorTrophies || 0) + 2;
      this._drawTrophyBadge(ctx, cx, avatarY + avatarR + 39 * s, matchTrophies, 'center', s, 0.7);

      ctx.restore();
    } else if (anim.phase === 'countdown' || anim.phase === 'disappearing') {
      // 对战即将开始（带缩放进入）
      const countdownElapsed = anim.phase === 'countdown'
        ? now - anim.countdownStartTime
        : COUNTDOWN_DURATION + (now - anim.disappearStartTime);
      const titleScale = countdownElapsed < 250
        ? Easing.easeOutBackStrong(Math.min(1, countdownElapsed / 250))
        : 1;

      ctx.save();
      ctx.translate(cx, titleY + 2 * s);
      ctx.scale(titleScale, titleScale);
      ctx.font = `bold ${Math.floor(18 * s)}px ${mainTitleFont}`;
      ctx.fillStyle = '#d7b162';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('对战即将开始', 0, 0);
      ctx.restore();

      // 倒计时数字（3, 2, 1）
      const secondsLeft = Math.max(1, 3 - Math.floor(countdownElapsed / 1000));
      const countdownText = String(secondsLeft);

      // 倒计时音效是完整音频，进入倒计时阶段只播放一次
      if (game.audioManager && !anim._countdownSoundPlayed) {
        game.audioManager.play('battle_countdown');
        anim._countdownSoundPlayed = true;
      }

      ctx.save();
      ctx.font = `bold ${Math.floor(26 * s)}px ${titleFont}`;
      ctx.fillStyle = '#d7c28a';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(countdownText, cx, titleY + 35 * s + 2 * s);
      ctx.restore();

      // 倒计时阶段保留显示对手头像和昵称（往上移动 4*s，再上移 3*s）
      const avatarR = 32 * s;
      const avatarY = matchY + matchH * 0.58 - 7 * s;
      const opponent = anim.opponent;

      ctx.save();
      ctx.beginPath();
      ctx.arc(cx, avatarY, avatarR, 0, Math.PI * 2);
      ctx.fillStyle = '#e0d4c0';
      ctx.fill();
      ctx.lineWidth = 2 * s;
      ctx.strokeStyle = '#c4a35a';
      ctx.stroke();

      if (opponent.avatar && opponent.avatar.loaded) {
        const displayAvatarR = avatarR - 2 * s;
        ctx.save();
        ctx.beginPath();
        ctx.arc(cx, avatarY, displayAvatarR, 0, Math.PI * 2);
        ctx.clip();
        const a = opponent.avatar;
        if (a.type === 'sheet') {
          // 居中裁剪 20% 直径的边距（四周各 10%），再拉伸铺满显示圆
          const srcMargin = a.sw * 0.10;
          const srcX = a.sx + srcMargin;
          const srcY = a.sy + srcMargin;
          const srcW = a.sw - srcMargin * 2;
          const srcH = a.sh - srcMargin * 2;
          ctx.drawImage(a.img, srcX, srcY, srcW, srcH, cx - displayAvatarR, avatarY - displayAvatarR, displayAvatarR * 2, displayAvatarR * 2);
        } else {
          ctx.drawImage(a.img, cx - displayAvatarR, avatarY - displayAvatarR, displayAvatarR * 2, displayAvatarR * 2);
        }
        ctx.restore();
      }
      ctx.restore();

      // 对手名字
      ctx.save();
      ctx.font = `bold ${Math.floor(15 * s)}px ${titleFont}`;
      ctx.fillStyle = '#d7c28a';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(opponent.name, cx, avatarY + avatarR + 16 * s);
      ctx.restore();

      // 对手荣誉杯（虚拟数量：我方 +2~10，整局稳定）
      const cdTrophies = (opponent.trophies !== undefined) ? opponent.trophies : (game.honorTrophies || 0) + 2;
      this._drawTrophyBadge(ctx, cx, avatarY + avatarR + 39 * s, cdTrophies, 'center', s, 0.7);
    }

    ctx.restore();
  }

  // ===== 顶部栏：top_home 返回主页 =====
  _drawTopBar(ctx, game, W, topY, s) {
    const btnSize = 34 * s;
    const iconX = 15 * s + 5 * s;
    const headerOffset = (this.parent.hasDynamicIsland ? 13 * s : 0);
    const iconY = 15 * s + headerOffset;
    const pressOffset = game._battleTopHomePressed ? 2 * s : 0;

    // top_home 主页图标（从云存储 bg_icon/top_home.png 注入到 parent.topIcon）
    if (this.parent.topIcon && this.parent.topIconLoaded) {
      ctx.drawImage(this.parent.topIcon, iconX, iconY + pressOffset, btnSize, btnSize);
    } else {
      // 兜底：圆形 + 房子图标
      const cx = iconX + btnSize / 2;
      const cy = iconY + pressOffset + btnSize / 2;
      ctx.save();
      ctx.beginPath();
      ctx.arc(cx, cy, btnSize / 2, 0, Math.PI * 2);
      ctx.fillStyle = COLORS.panelBg;
      ctx.fill();
      ctx.lineWidth = 1.5 * s;
      ctx.strokeStyle = COLORS.gold;
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(cx - 7 * s, cy + 2 * s);
      ctx.lineTo(cx, cy - 6 * s);
      ctx.lineTo(cx + 7 * s, cy + 2 * s);
      ctx.lineWidth = 2 * s;
      ctx.strokeStyle = COLORS.text;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(cx - 4 * s, cy + 2 * s);
      ctx.lineTo(cx - 4 * s, cy + 7 * s);
      ctx.lineTo(cx + 4 * s, cy + 7 * s);
      ctx.lineTo(cx + 4 * s, cy + 2 * s);
      ctx.lineWidth = 2 * s;
      ctx.stroke();
      ctx.restore();
    }

    this.battleTopHomeRect = { x: iconX, y: iconY, w: btnSize, h: btnSize };
  }

  // ===== 页面标题 =====
  _drawTitle(ctx, W, y, s) {
    ctx.save();
    const titleFont = '"Source Han Serif SC", "Noto Serif SC", "SimSun", serif';
    ctx.font = `bold ${Math.floor(22 * s)}px ${titleFont}`;
    ctx.fillStyle = '#8b6914';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('双人对战', W / 2, y);
    ctx.restore();
  }

  // ===== 轮次徽章 =====
  _drawRoundBadge(ctx, game, W, y, s) {
    const badgeW = 185 * s;
    const badgeH = 39 * s;
    const bx = (W - badgeW) / 2;
    const badgeCX = W / 2;
    const badgeCY = y + badgeH / 2;

    ctx.save();
    if (this.parent.battleRoundBadge && this.parent.battleRoundBadgeLoaded) {
      // 按图片原始比例缩放，保持长宽比不压缩，在徽章区域内居中显示
      const img = this.parent.battleRoundBadge;
      const imgAspect = img.width / img.height;
      const drawH = badgeH;
      const drawW = drawH * imgAspect;
      const drawX = bx + (badgeW - drawW) / 2;
      ctx.drawImage(img, drawX, y, drawW, drawH);
    } else {
      // 兜底：原有多边形绘制
      const point = 10 * s;
      ctx.beginPath();
      ctx.moveTo(bx, y + badgeH / 2);
      ctx.lineTo(bx + point, y);
      ctx.lineTo(bx + badgeW - point, y);
      ctx.lineTo(bx + badgeW, y + badgeH / 2);
      ctx.lineTo(bx + badgeW - point, y + badgeH);
      ctx.lineTo(bx + point, y + badgeH);
      ctx.closePath();
      ctx.fillStyle = COLORS.panelBg;
      ctx.fill();
      ctx.lineWidth = 1.5 * s;
      ctx.strokeStyle = COLORS.gold;
      ctx.stroke();
    }

    // 徽章左右装饰（参考女巫奖励标题装饰：实心菱形 + 空心菱形 + 渐变线）
    this._drawBadgeSideDecoration(ctx, badgeCX, badgeCY, s, 'left', badgeW / 2);
    this._drawBadgeSideDecoration(ctx, badgeCX, badgeCY, s, 'right', badgeW / 2);

    const currentRound = game.battleRound || 1;
    if (currentRound !== this._lastBattleRound) {
      this._lastBattleRound = currentRound;
      this._battleRoundPulseAnim = { startTime: Date.now() };
    }

    let roundScale = 1;
    if (this._battleRoundPulseAnim) {
      const pulseElapsed = Date.now() - this._battleRoundPulseAnim.startTime;
      const pulseDuration = 500;
      if (pulseElapsed < pulseDuration) {
        const pulseProgress = pulseElapsed / pulseDuration;
        roundScale = 1 + 0.25 * Math.sin(pulseProgress * Math.PI);
      } else {
        this._battleRoundPulseAnim = null;
      }
    }

    ctx.font = `bold ${Math.floor(16 * s)}px ${this.parent.titleFontFamily}`;
    ctx.fillStyle = COLORS.text;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.save();
    ctx.translate(badgeCX, badgeCY);
    ctx.scale(roundScale, roundScale);
    ctx.fillText(`第 ${currentRound} / ${game.battleTotalRounds} 轮`, 0, 0);
    ctx.restore();
    ctx.restore();
  }

  // ===== 轮次徽章单侧装饰 =====
  _drawBadgeSideDecoration(ctx, cx, cy, s, side, badgeHalfW) {
    const gold = '#c4a35a';
    const solidSize = 2 * s;
    const hollowSize = 2.8 * s;
    const gap = -5 * s;            // 徽章边缘到实心菱形，比原来靠近 2*s
    const solidToHollow = 6 * s;  // 实心菱形到空心菱形，保持不重叠
    const lineOffset = 2 * s;     // 线与空心菱形间距
    const lineLength = 52 * s;    // 线长度，整体宽度加大一倍

    const direction = side === 'left' ? -1 : 1;
    const solidX = cx + direction * (badgeHalfW + gap);
    const hollowX = solidX + direction * solidToHollow;
    const lineStartX = hollowX + direction * lineOffset;
    const lineEndX = lineStartX + direction * lineLength;

    ctx.save();

    // 实心菱形
    ctx.save();
    ctx.translate(solidX, cy);
    ctx.rotate(Math.PI / 4);
    ctx.fillStyle = gold;
    ctx.fillRect(-solidSize, -solidSize, solidSize * 2, solidSize * 2);
    ctx.restore();

    // 空心菱形
    ctx.save();
    ctx.translate(hollowX, cy);
    ctx.rotate(Math.PI / 4);
    ctx.strokeStyle = gold;
    ctx.lineWidth = 1.2 * s;
    ctx.strokeRect(-hollowSize, -hollowSize, hollowSize * 2, hollowSize * 2);
    ctx.restore();

    // 渐变线
    const grad = ctx.createLinearGradient(lineStartX, cy, lineEndX, cy);
    grad.addColorStop(0, gold);
    grad.addColorStop(1, 'rgba(196,163,90,0)');
    ctx.strokeStyle = grad;
    ctx.lineWidth = 1 * s;
    ctx.beginPath();
    ctx.moveTo(lineStartX, cy);
    ctx.lineTo(lineEndX, cy);
    ctx.stroke();

    ctx.restore();
  }

  // ===== 顶部 VS 模块（使用 battle_player.png 背景） =====
  _drawAvatarRow(ctx, game, W, y, rowH, s, hideProgressBar = false, vsScale = 1, bgStretchV = 1, bgWidthExtra = 0, bgXOffset = 0) {
    const margin = W * 0.025;
    const x = margin;
    const w = W - margin * 2;  // 占屏幕宽度 95%
    const h = rowH;
    const cx = x + w / 2;
    const cy = y + h / 2;

    ctx.save();
    if (this.parent.battlePlayerLeft && this.parent.battlePlayerLeftLoaded &&
        this.parent.battlePlayerRight && this.parent.battlePlayerRightLoaded) {
      // 使用 battle_player_left.png + battle_player_right.png 拼接作为对战条背景
      const leftImg = this.parent.battlePlayerLeft;
      const rightImg = this.parent.battlePlayerRight;
      const halfW = w / 2;
      const pieceScale = 0.9;
      const pieceW = halfW * pieceScale + bgWidthExtra;
      const leftH = pieceW / (leftImg.width / leftImg.height);
      const rightH = pieceW / (rightImg.width / rightImg.height);
      const leftDrawH = Math.max(leftH * bgStretchV - 2 * s, 1);
      const rightDrawH = Math.max(rightH * bgStretchV - 2 * s, 1);
      const leftDrawY = y + (h - leftDrawH) / 2 + 5 * s;
      const rightDrawY = y + (h - rightDrawH) / 2 + 5 * s;
      ctx.drawImage(leftImg, x - 6 * s - bgXOffset, leftDrawY, pieceW, leftDrawH);
      ctx.drawImage(rightImg, x + halfW + 22 * s + bgXOffset, rightDrawY, pieceW, rightDrawH);
    } else {
      // 兜底：简单背景条
      this.parent.roundRect(x, y + 5 * s, w, h, 10 * s, '#e0d4c0', COLORS.gold, 1.5 * s);
    }
    ctx.restore();

    // 头像半径（双方统一）
    const avatarR = 26 * s;

    // 左侧对手头像（覆盖图片默认头像）
    const leftAvatarCX = x + 33 * s;
    const leftAvatarCY = cy + 1 * s;
    const opponent = game._battleOpponent;
    if (opponent && opponent.avatar && opponent.avatar.loaded) {
      ctx.save();
      ctx.beginPath();
      ctx.arc(leftAvatarCX, leftAvatarCY, avatarR, 0, Math.PI * 2);
      ctx.clip();
      const a = opponent.avatar;
      if (a.type === 'sheet') {
        // 居中裁剪 20% 直径的边距（四周各 10%），再拉伸铺满显示圆
        const srcMargin = a.sw * 0.10;
        const srcX = a.sx + srcMargin;
        const srcY = a.sy + srcMargin;
        const srcW = a.sw - srcMargin * 2;
        const srcH = a.sh - srcMargin * 2;
        ctx.drawImage(a.img, srcX, srcY, srcW, srcH, leftAvatarCX - avatarR, leftAvatarCY - avatarR, avatarR * 2, avatarR * 2);
      } else {
        ctx.drawImage(a.img, leftAvatarCX - avatarR, leftAvatarCY - avatarR, avatarR * 2, avatarR * 2);
      }
      ctx.restore();
      // 对手头像深蓝色边框
      ctx.save();
      ctx.beginPath();
      ctx.arc(leftAvatarCX, leftAvatarCY, avatarR, 0, Math.PI * 2);
      ctx.lineWidth = 2.5 * s;
      ctx.strokeStyle = COLORS.blueHeader;
      ctx.stroke();
      ctx.restore();
    } else {
      this._drawAvatar(ctx, leftAvatarCX, leftAvatarCY, avatarR, s, COLORS.blueHeader);
    }

    // 右侧用户头像（覆盖图片默认头像）
    const rightAvatarCX = x + w - 33 * s;
    const rightAvatarCY = cy + 1 * s;
    if (this.selfAvatarImg && this.selfAvatarLoaded) {
      ctx.save();
      ctx.beginPath();
      ctx.arc(rightAvatarCX, rightAvatarCY, avatarR, 0, Math.PI * 2);
      ctx.clip();
      ctx.drawImage(this.selfAvatarImg, rightAvatarCX - avatarR, rightAvatarCY - avatarR, avatarR * 2, avatarR * 2);
      ctx.restore();
      // 我方头像红色边框
      ctx.save();
      ctx.beginPath();
      ctx.arc(rightAvatarCX, rightAvatarCY, avatarR, 0, Math.PI * 2);
      ctx.lineWidth = 2.5 * s;
      ctx.strokeStyle = '#c0392b';
      ctx.stroke();
      ctx.restore();
    } else {
      this._drawAvatar(ctx, rightAvatarCX, rightAvatarCY, avatarR, s, '#c0392b');
    }

    // 进度条移动方向对应的头像呼吸金边
    this._drawAvatarGlow(ctx, game, leftAvatarCX, leftAvatarCY, avatarR, s, 'bot');
    this._drawAvatarGlow(ctx, game, rightAvatarCX, rightAvatarCY, avatarR, s, 'player');

    const now = Date.now();

    // 中间 VS 徽章
    if (this.parent.battleVS && this.parent.battleVSLoaded) {
      const vsImg = this.parent.battleVS;
      const vsSize = 50 * s * vsScale;
      const vsX = cx - vsSize / 2;
      const vsY = cy + 5 * s - vsSize / 2;
      ctx.drawImage(vsImg, vsX, vsY, vsSize, vsSize);

      // 对战期间 VS 图标持续柔和光晕
      if (game.state === 'battle') {
        const centerX = cx;
        const centerY = cy + 5 * s;
        const glowR = vsSize / 2 + 4 * s;

        // 柔和呼吸 alpha：周期约 5.7 秒（更快）
        const breathAlpha = 0.23 + 0.13 * Math.sin(now / 900);

        // 外圈光晕（中间深，向外扩散变淡）
        ctx.save();
        ctx.globalAlpha = breathAlpha * 0.55;
        const glowGrad = ctx.createRadialGradient(
          centerX, centerY, 0,
          centerX, centerY, glowR + 10 * s
        );
        glowGrad.addColorStop(0, 'rgba(255, 170, 0, 0.6)');
        glowGrad.addColorStop(0.5, 'rgba(230, 145, 0, 0.26)');
        glowGrad.addColorStop(1, 'rgba(255, 170, 0, 0)');
        ctx.fillStyle = glowGrad;
        ctx.beginPath();
        ctx.arc(centerX, centerY, glowR + 10 * s, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();

        // 金色小星星柔和闪烁（更深的金色）
        const starRadius = vsSize / 2 + 14 * s;
        const starSize = 3 * s;
        const starPositions = [
          { angle: Math.PI / 4, phase: 0 },
          { angle: Math.PI * 3 / 4, phase: Math.PI / 3 },
          { angle: Math.PI * 5 / 4, phase: Math.PI * 2 / 3 },
          { angle: Math.PI * 7 / 4, phase: Math.PI },
        ];
        starPositions.forEach(pos => {
          const sx = centerX + Math.cos(pos.angle) * starRadius;
          const sy = centerY + Math.sin(pos.angle) * starRadius;
          const twinkle = 0.35 + 0.35 * Math.sin(now / 1600 + pos.phase);
          ctx.save();
          ctx.globalAlpha = breathAlpha * twinkle;
          ctx.fillStyle = '#ffd700';
          this._drawSparkle(ctx, sx, sy, starSize);
          ctx.restore();
        });
      }
    }

    // 名称 + 荣誉杯（分数移到进度条两端显示）
    const leftTextX = x + 71 * s;
    const rightTextX = x + w - 71 * s;
    const nameY = cy - 12 * s;      // 名字（左右同一行）
    const trophyY = cy + 16 * s;    // 荣誉杯徽章（较名字下移）

    // 荣誉杯数量：我方真实值；对方虚拟值（基于我方 +2~10，整局稳定缓存）
    const myTrophies = game.honorTrophies || 0;
    let oppTrophies;
    if (game._battleOpponent) {
      if (typeof game._battleOpponent.trophies !== 'number') {
        game._battleOpponent.trophies = myTrophies + 2 + Math.floor(Math.random() * 9);
      }
      oppTrophies = game._battleOpponent.trophies;
    } else {
      oppTrophies = myTrophies + 2;
    }

    ctx.save();
    ctx.textBaseline = 'middle';

    // 对手名字（左）
    ctx.font = `bold ${Math.floor(15 * s)}px ${this.parent.titleFontFamily}`;
    ctx.fillStyle = COLORS.blueHeader;
    ctx.textAlign = 'left';
    let opponentName = game._battleOpponent && game._battleOpponent.name ? game._battleOpponent.name : '玩家A';
    const nameChars = Array.from(opponentName);
    if (nameChars.length > 5) opponentName = nameChars.slice(0, 5).join('') + '...';
    const leftNameFontSize = nameChars.length >= 6 ? Math.floor(12 * s) : Math.floor(15 * s);
    ctx.font = `bold ${leftNameFontSize}px ${this.parent.titleFontFamily}`;
    ctx.fillText(opponentName, leftTextX, nameY);

    // "我"名字（右）
    ctx.textAlign = 'right';
    ctx.font = `bold ${Math.floor(15 * s)}px ${this.parent.titleFontFamily}`;
    ctx.fillStyle = '#993E2D';
    ctx.fillText('我', rightTextX, nameY);

    // 双方荣誉杯徽章（半透明白色蒙层 + 图标 + 金棕色数字）
    // 对手未确定前（翻页进入 / "对手匹配中"阶段，_battleOpponent 尚未生成）隐藏对方荣誉杯，避免一进页面闪现
    if (game._battleOpponent) {
      this._drawTrophyBadge(ctx, leftTextX, trophyY, oppTrophies, 'left', s);
    }
    this._drawTrophyBadge(ctx, rightTextX, trophyY, myTrophies, 'right', s);

    ctx.restore();

    // 分数对比进度条（结束弹窗中隐藏）
    if (!hideProgressBar) {
      this._drawScoreProgressBar(ctx, game, x, y + h, w, s);
    }
  }

  // 荣誉杯徽章：半透明白色圆角蒙层 + battle_hornor_trophy 图标 + 金棕色数字
  // align='left' 从 anchorX 向右展开；align='right' 右缘对齐 anchorX；'center' 居中
  // pillAlpha：白色蒙层不透明度（深色背景下调高，让数字读起来与浅底处一致）
  _drawTrophyBadge(ctx, anchorX, cy, count, align, s, pillAlpha = 0.35) {
    const hasIcon = this.battleHonorTrophyIcon && this.battleHonorTrophyIconLoaded;
    const iconH = 18 * s;
    const iconW = hasIcon ? iconH * (this.battleHonorTrophyIcon.width / this.battleHonorTrophyIcon.height) : 0;
    const gap = hasIcon ? 4 * s : 0;
    const numStr = String(count);

    ctx.save();
    ctx.font = `900 ${Math.floor(16 * s)}px ${this.parent.titleFontFamily}`;
    ctx.textBaseline = 'middle';
    const numW = ctx.measureText(numStr).width;

    const padX = 7 * s;
    const padY = 3 * s;
    const badgeW = iconW + gap + numW + padX * 2;
    const badgeH = Math.max(iconH, 16 * s) + padY * 2;
    const badgeX = align === 'right' ? anchorX - badgeW
      : align === 'center' ? anchorX - badgeW / 2
      : anchorX;
    const badgeY = cy - badgeH / 2;

    // 半透明白色蒙层
    this.parent.roundRect(badgeX, badgeY, badgeW, badgeH, badgeH / 2, `rgba(255,255,255,${pillAlpha})`);

    // 图标 + 金棕色数字
    let contentX = badgeX + padX;
    if (hasIcon) {
      ctx.drawImage(this.battleHonorTrophyIcon, contentX, cy - iconH / 2, iconW, iconH);
      contentX += iconW + gap;
    }
    ctx.textAlign = 'left';
    ctx.fillStyle = '#B07C3A';
    ctx.fillText(numStr, contentX, cy);

    ctx.restore();
  }

  // ===== 分数对比进度条（VS 模块下方） =====
  _drawScoreProgressBar(ctx, game, x, y, w, s) {
    const progressH = 12 * s;
    const progressY = y + 17 * s + 3 * s + 1 * s;
    const progressR = progressH / 2;

    // 进度条两端各留出空位显示双方当前分数（左=对手，右=我）
    const scoreSlotW = 32 * s;
    const barX = x + scoreSlotW;
    const barW = w - scoreSlotW * 2;

    const botScoreVal = game.battleBotScore || 0;
    const playerScoreVal = game.battlePlayerScore || 0;

    const anim = game._battleScoreBarAnim;
    let botRatio = 0.5;
    if (anim) {
      const elapsed = Date.now() - anim.startTime;
      if (elapsed <= 0) {
        botRatio = anim.fromRatio;
      } else if (elapsed >= anim.duration) {
        botRatio = anim.toRatio;
      } else {
        const progress = elapsed / anim.duration;
        botRatio = anim.fromRatio + (anim.toRatio - anim.fromRatio) * Easing.easeOutCubic(progress);
      }
    } else {
      const total = botScoreVal + playerScoreVal;
      botRatio = total > 0 ? botScoreVal / total : 0.5;
    }
    const botWidth = barW * botRatio;

    ctx.save();

    // 外框背景 + 加粗金棕色边框
    this.parent.roundRect(barX, progressY, barW, progressH, progressR, '#e8dcc0', '#c4a35a', 4 * s);

    // 用外框路径 clip，确保填充只在圆角矩形内
    this.parent._roundedRectPath(ctx, barX, progressY, barW, progressH, progressR);
    ctx.clip();

    // 背景渐变：顶部微亮、底部微暗，营造自然 3D 圆柱感
    const bgGrad = ctx.createLinearGradient(barX, progressY, barX, progressY + progressH);
    bgGrad.addColorStop(0, '#f0e8d8');
    bgGrad.addColorStop(0.5, '#e8dcc0');
    bgGrad.addColorStop(1, '#ddd0b0');
    ctx.fillStyle = bgGrad;
    ctx.fillRect(barX, progressY, barW, progressH);

    // 左侧渐变（对手）
    const blueGrad = ctx.createLinearGradient(barX, progressY, barX, progressY + progressH);
    blueGrad.addColorStop(0, '#4a7a9f');
    blueGrad.addColorStop(0.5, '#395E85');
    blueGrad.addColorStop(1, '#2e4c6b');
    ctx.fillStyle = blueGrad;
    ctx.fillRect(barX, progressY, botWidth, progressH);

    // 右侧渐变（我）
    const redGrad = ctx.createLinearGradient(barX, progressY, barX, progressY + progressH);
    redGrad.addColorStop(0, '#b34d3a');
    redGrad.addColorStop(0.5, '#993E2D');
    redGrad.addColorStop(1, '#7f3224');
    ctx.fillStyle = redGrad;
    ctx.fillRect(barX + botWidth, progressY, barW - botWidth, progressH);

    // 顶部高光：自然 3D 立体感
    ctx.fillStyle = 'rgba(255,255,255,0.25)';
    ctx.fillRect(barX, progressY, barW, progressH * 0.2);

    // 底部阴影：自然 3D 立体感
    ctx.fillStyle = 'rgba(0,0,0,0.12)';
    ctx.fillRect(barX, progressY + progressH * 0.8, barW, progressH * 0.2);

    ctx.restore();

    // 中间金色闪电图标（等比例缩放，保持原始长宽比）
    if (this.battleProgressIcon && this.battleProgressIconLoaded) {
      const iconH = 24 * s;
      const iconW = iconH * (this.battleProgressIcon.width / this.battleProgressIcon.height);
      let iconX = barX + botWidth - iconW / 2;
      iconX = Math.max(barX, Math.min(iconX, barX + barW - iconW));
      const iconY = progressY + (progressH - iconH) / 2 - 4 * s;
      ctx.drawImage(this.battleProgressIcon, iconX, iconY, iconW, iconH);
    }

    // 两端当前分数（左=对手蓝，右=我红），垂直居中于进度条，带得分脉冲缩放
    const scoreScale = this._getBattleScoreScale(game, Date.now());
    const scoreCY = progressY + progressH / 2;
    ctx.save();
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'center';
    ctx.font = `bold ${Math.floor(13 * s)}px ${this.parent.titleFontFamily}`;

    ctx.save();
    ctx.translate(x + scoreSlotW / 2, scoreCY);
    ctx.scale(scoreScale, scoreScale);
    ctx.fillStyle = COLORS.blueHeader;
    ctx.fillText(`${botScoreVal}`, 0, 0);
    ctx.restore();

    ctx.save();
    ctx.translate(x + w - scoreSlotW / 2, scoreCY);
    ctx.scale(scoreScale, scoreScale);
    ctx.fillStyle = '#993E2D';
    ctx.fillText(`${playerScoreVal}`, 0, 0);
    ctx.restore();

    ctx.restore();
  }

  // 计算 VS 模块分数缩放动画（双方飞行动画都显示后，延迟 500ms 同时触发）
  _getBattleScoreScale(game, now) {
    const scores = game._battleFlyingScores;
    if (!scores || scores.length === 0) return 1;

    const playerScore = scores.find(item => item.side === 'player');
    const botScore = scores.find(item => item.side === 'bot');
    if (!playerScore || !botScore) return 1;

    const appearDuration = 300; // 飞行动画飞入时长
    const delayAfterBoth = 500; // 双方都显示后延迟 500ms
    const scoreDuration = 500;  // 缩放动画持续 500ms

    // 以较晚一方（bot）飞行动画显示完成的时间点为基准
    const startTime = Math.max(playerScore.startTime, botScore.startTime);
    const animStart = startTime + appearDuration + delayAfterBoth;

    const elapsed = now - animStart;
    if (elapsed < 0 || elapsed > scoreDuration) return 1;

    const progress = elapsed / scoreDuration;
    // 使用正弦脉冲：1.0 -> 1.2 -> 1.0，起点终点连续无突变
    return 1 + 0.2 * Math.sin(progress * Math.PI);
  }

  // 计算 VS 图标金光闪烁状态（分数缩放结束后触发）
  _getVSFlashState(game, now) {
    const scores = game._battleFlyingScores;
    if (!scores || scores.length === 0) return { alpha: 0, elapsed: 0 };

    const playerScore = scores.find(item => item.side === 'player');
    const botScore = scores.find(item => item.side === 'bot');
    if (!playerScore || !botScore) return { alpha: 0, elapsed: 0 };

    const appearDuration = 300; // 飞行动画飞入时长
    const delayAfterBoth = 500; // 双方都显示后延迟 500ms
    const scoreDuration = 500;  // 缩放动画持续 500ms
    const flashDuration = 800;  // 金光闪烁持续 800ms

    const startTime = Math.max(playerScore.startTime, botScore.startTime);
    const animStart = startTime + appearDuration + delayAfterBoth;
    const flashStart = animStart + scoreDuration;

    const elapsed = now - flashStart;
    if (elapsed < 0 || elapsed > flashDuration) return { alpha: 0, elapsed: 0 };

    const alpha = Math.sin((elapsed / flashDuration) * Math.PI);
    return { alpha, elapsed };
  }

  // 绘制四角星（用于金光闪烁的小星星）
  _drawSparkle(ctx, cx, cy, size) {
    ctx.beginPath();
    ctx.moveTo(cx, cy - size);
    ctx.lineTo(cx + size * 0.25, cy - size * 0.25);
    ctx.lineTo(cx + size, cy);
    ctx.lineTo(cx + size * 0.25, cy + size * 0.25);
    ctx.lineTo(cx, cy + size);
    ctx.lineTo(cx - size * 0.25, cy + size * 0.25);
    ctx.lineTo(cx - size, cy);
    ctx.lineTo(cx - size * 0.25, cy - size * 0.25);
    ctx.closePath();
    ctx.fill();
  }

  _drawAvatar(ctx, cx, cy, r, s, ringColor) {
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fillStyle = '#d8d0c0';
    ctx.fill();
    ctx.lineWidth = 2.5 * s;
    ctx.strokeStyle = ringColor;
    ctx.stroke();

    ctx.fillStyle = COLORS.text;
    ctx.beginPath();
    ctx.arc(cx, cy - 4 * s, r * 0.32, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(cx, cy + r * 0.45, r * 0.55, Math.PI, 0);
    ctx.fill();
    ctx.restore();
  }

  // ===== 头像切割钻环（根据进度条移动方向触发 1 秒） =====
  _drawAvatarGlow(ctx, game, cx, cy, r, s, side) {
    const anim = game._battleAvatarGlowAnim;
    if (!anim || anim.side !== side) return;
    const elapsed = Date.now() - anim.startTime;
    if (elapsed < 0 || elapsed > anim.duration) return;
    const t = elapsed / anim.duration;

    // 源自 金圈边框动画8种方案.html 的 03 切割钻环
    ctx.save();
    const segs = 18;
    const TAU = Math.PI * 2;
    for (let i = 0; i < segs; i++) {
      const start = -Math.PI / 2 + i * TAU / segs + 0.03;
      const end = start + TAU / segs - 0.07;
      const windowStart = i / segs * 0.72;
      const local = Math.max(0, Math.min((t - windowStart) / 0.22, 1));
      const glow = Math.sin(local * Math.PI);
      ctx.beginPath();
      ctx.lineWidth = 6 * s;
      ctx.lineCap = 'round';
      ctx.strokeStyle = `rgba(255,${200 + Math.floor(glow * 45)},${90 + Math.floor(glow * 110)},${0.18 + glow * 0.82})`;
      ctx.shadowBlur = (8 + glow * 14) * s;
      ctx.shadowColor = 'rgba(255,225,140,0.85)';
      ctx.arc(cx, cy, r, start, end);
      ctx.stroke();
    }
    ctx.restore();
  }

  // ===== 左右玩家面板（合并为一个大的长方形，中间用竖分隔线分开） =====
  _drawPlayerPanels(ctx, game, W, y, panelH, s) {
    const margin = 11 * s;
    const totalW = W - margin * 2;
    const panelW = totalW / 2;
    const x1 = margin;
    const x2 = margin + panelW;

    // 记录面板位置：tilesY 控制字母方块，flyScoreY 控制飞行分数，可独立调整
    const tilesY = y + 42 * s;
    const flyScoreY = y + 56 * s;
    this.battlePanelLeft = { x: x1, y, w: panelW, h: panelH, centerX: x1 + panelW / 2, tilesY, flyScoreY };
    this.battlePanelRight = { x: x2, y, w: panelW, h: panelH, centerX: x2 + panelW / 2, tilesY, flyScoreY };

    // 绘制合并的大长方形面板背景（保持原来小面板时的切角八边形样式）
    const corner = 10 * s;
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(x1 + corner, y);
    ctx.lineTo(x1 + totalW - corner, y);
    ctx.lineTo(x1 + totalW, y + corner);
    ctx.lineTo(x1 + totalW, y + panelH - corner);
    ctx.lineTo(x1 + totalW - corner, y + panelH);
    ctx.lineTo(x1 + corner, y + panelH);
    ctx.lineTo(x1, y + panelH - corner);
    ctx.lineTo(x1, y + corner);
    ctx.closePath();

    // 填充 + 内投影（增加立体感）
    ctx.fillStyle = COLORS.panelBg;
    ctx.shadowColor = 'rgba(90, 62, 31, 0.15)';
    ctx.shadowBlur = 10 * s;
    ctx.shadowOffsetY = 3 * s;
    ctx.fill();
    ctx.shadowColor = 'transparent';

    // 双层边框：外层深棕 + 内层亮金
    ctx.lineWidth = 2.5 * s;
    ctx.strokeStyle = '#8a6d3b';
    ctx.stroke();
    ctx.lineWidth = 1 * s;
    ctx.strokeStyle = '#e8c87a';
    ctx.stroke();
    ctx.restore();

    // 中间竖直分隔线（参考游戏页 HUD 进度条分隔线样式：细金线 + 中间旋转菱形）
    const dividerX = x1 + panelW;
    const lineTop = y + 34 * s;
    const lineBot = y + panelH - 12 * s;
    ctx.save();
    ctx.strokeStyle = '#c5a059';
    ctx.lineWidth = 0.8 * s;
    ctx.beginPath();
    ctx.moveTo(dividerX, lineTop);
    ctx.lineTo(dividerX, lineBot);
    ctx.stroke();

    // 中间菱形（向下移动 7*s：之前 5*s + 继续 2*s）
    ctx.translate(dividerX, y + panelH / 2 + 7 * s);
    ctx.rotate(Math.PI / 4);
    ctx.fillStyle = '#c5a059';
    ctx.fillRect(-2.5 * s, -2.5 * s, 5 * s, 5 * s);
    ctx.restore();

    // 中间竖直分隔线上方小标题
    ctx.save();
    const titleFontSize = Math.floor(17 * s);
    ctx.font = `bold ${titleFontSize}px ${this.parent.titleFontFamily}`;
    ctx.fillStyle = '#8a6d3b';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    const titleY = lineTop - 8 * s;
    const titleCY = titleY - titleFontSize / 2;
    const textWidth = ctx.measureText('出牌区').width;
    const textHalf = textWidth / 2;
    ctx.fillText('出牌区', dividerX, titleY);
    // 左右装饰（参考轮次徽章），与文字间距再加大 2*s
    this._drawBadgeSideDecoration(ctx, dividerX - textHalf - 2 * s, titleCY, s, 'left', 12 * s);
    this._drawBadgeSideDecoration(ctx, dividerX + textHalf + 2 * s, titleCY, s, 'right', 12 * s);
    ctx.restore();

    this._drawPlayerPanel(ctx, game, x1, y, panelW, panelH, s, 'left');
    this._drawPlayerPanel(ctx, game, x2, y, panelW, panelH, s, 'right');
  }

  _drawPlayerPanel(ctx, game, x, y, w, h, s, side) {
    const isLeft = side === 'left';

    // 顶部名称标签：临时隐藏（battle_tag_rival / battle_tag_me）
    if (false) {
      const tabW = w * 0.72;
      const tabH = 24 * s;
      const tabX = x + (w - tabW) / 2;
      const tabY = y;
      const headerColor = isLeft ? COLORS.blueHeader : COLORS.greenHeader;

      // 顶部名称标签：优先使用图片资源，否则回退到颜色形状 + 文字
      ctx.save();
      const tagImg = isLeft ? this.parent.battleTagRival : this.parent.battleTagMe;
      const tagImgLoaded = isLeft ? this.parent.battleTagRivalLoaded : this.parent.battleTagMeLoaded;
      if (tagImg && tagImgLoaded) {
        // 按图片原始比例等比放大 10%，并整体上移 2px（合并历次微调后的最终位置）
        const imgAspect = tagImg.width / tagImg.height;
        const scale = 1.1;
        const drawH = tabH * scale;
        const drawW = drawH * imgAspect;
        const drawX = tabX + (tabW - drawW) / 2;
        const drawY = tabY - 2 * s;
        ctx.drawImage(tagImg, drawX, drawY, drawW, drawH);
      } else {
        ctx.beginPath();
        ctx.moveTo(tabX + 8 * s, tabY);
        ctx.lineTo(tabX + tabW - 8 * s, tabY);
        ctx.quadraticCurveTo(tabX + tabW, tabY, tabX + tabW, tabY + 8 * s);
        ctx.lineTo(tabX + tabW, tabY + tabH);
        ctx.lineTo(tabX, tabY + tabH);
        ctx.lineTo(tabX, tabY + 8 * s);
        ctx.quadraticCurveTo(tabX, tabY, tabX + 8 * s, tabY);
        ctx.closePath();
        ctx.fillStyle = headerColor;
        ctx.fill();
        ctx.lineWidth = 1 * s;
        ctx.strokeStyle = 'rgba(255,255,255,0.35)';
        ctx.stroke();

        // 标签文字
        ctx.font = `bold ${Math.floor(13 * s)}px ${this.parent.titleFontFamily}`;
        ctx.fillStyle = '#fff';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(isLeft ? '对方' : '我', tabX + tabW / 2, tabY + tabH / 2 + 1 * s);
      }
      ctx.restore();
    }

    // 状态文本 / 单词牌
    const centerX = x + w / 2;
    const statusY = y + 42 * s + 2 * s;
    const panel = isLeft ? this.battlePanelLeft : this.battlePanelRight;
    const tilesY = panel ? panel.tilesY : y + 50 * s;

    let statusText = '';
    let baseText = '';
    let countdownSec = 0;
    let wordText = null;
    let hidden = false;
    let botRevealProgress = -1; // -1 表示不使用翻转动画

    const timeline = game._battleAnimTimeline;
    const now = Date.now();

    let flipSide = null;
    let flipElapsed = -1;

    const mySide = isLeft ? 'bot' : 'player';
    const isFirstSide = timeline && timeline.firstSide === mySide;
    const isSecondSide = timeline && timeline.secondSide === mySide;
    const timedOut = mySide === 'player' ? game._battlePlayerTimedOut : game._battleBotTimedOut;
    const myWordLen = mySide === 'player'
      ? (game.battlePlayerWord ? game.battlePlayerWord.length : 0)
      : (game.battleBotReady ? (game.battleBotWord ? game.battleBotWord.length : (game.battleBotWordLength || 0)) : 0);
    const myWord = mySide === 'player' ? (game.battlePlayerWord || '') : (game.battleBotWord || '');

    if (game.battlePhase === 'selecting' || game.battlePhase === 'player_played') {
      if (isLeft) {
        if (game.battleBotReady) {
          if (timedOut && !myWord) {
            baseText = '对手已超时';
            wordText = null;
          } else {
            baseText = ''; // 对手已选择：不显示文字，只保留 ? 方块
            wordText = '?'.repeat(myWordLen);
            hidden = true;
          }
        } else {
          baseText = '对手选择中';
        }
      } else {
        if (game.battlePhase === 'selecting') {
          baseText = '请出牌';
        } else if (timedOut && !myWord) {
          baseText = '已超时';
          wordText = null;
        } else {
          baseText = '';
          wordText = '?'.repeat(myWordLen);
          hidden = true;
        }
      }

      // 一方出牌后给另一方 15 秒倒计时
      if (game._battleTurnDeadline && game._battleTurnCountdownSide === mySide) {
        countdownSec = Math.max(0, Math.ceil((game._battleTurnDeadline - now) / 1000));
        statusText = countdownSec > 0 && baseText ? `${baseText} (${countdownSec})` : baseText;
      } else {
        statusText = baseText;
      }

      // 倒计时秒数变化时触发脉冲动画
      if (countdownSec > 0) {
        const lastSecKey = isLeft ? '_lastBotCountdownSec' : '_lastPlayerCountdownSec';
        const pulseStartKey = isLeft ? '_botCountdownPulseStart' : '_playerCountdownPulseStart';
        if (this[lastSecKey] !== countdownSec) {
          this[lastSecKey] = countdownSec;
          this[pulseStartKey] = now;
        }
      }
    } else if (game.battlePhase === 'revealing') {
      const step = timeline ? timeline.step : null;
      const showTimeoutText = isFirstSide && timedOut && (step === 'placeholders' || step === 'first_flip' || step === 'first_score');
      if (showTimeoutText) {
        baseText = '超时未出牌';
      }
      if (step === 'placeholders') {
        if (isFirstSide && timedOut) {
          wordText = null;
        } else {
          wordText = '?'.repeat(myWordLen);
          hidden = true;
        }
      } else if (step === 'first_flip') {
        if (isFirstSide) {
          wordText = myWord;
          flipSide = side;
          flipElapsed = timeline && timeline.firstFlipStartTime ? now - timeline.firstFlipStartTime : 0;
        } else {
          wordText = '?'.repeat(myWordLen);
          hidden = true;
        }
      } else if (step === 'first_score') {
        if (isFirstSide) {
          wordText = myWord;
          hidden = false;
        } else {
          wordText = '?'.repeat(myWordLen);
          hidden = true;
        }
      } else if (step === 'second_flip') {
        baseText = '';
        if (isSecondSide) {
          wordText = myWord;
          flipSide = side;
          flipElapsed = timeline && timeline.secondFlipStartTime ? now - timeline.secondFlipStartTime : 0;
        } else {
          wordText = myWord;
          hidden = false;
        }
      } else {
        // second_score / done：双方均已揭晓
        baseText = '';
        wordText = myWord;
        hidden = false;
      }
      statusText = baseText;
    }

    // 状态文本颜色与位移动画（以基础文案为准，避免倒计时数字变化触发弹跳）
    const isGrayStatus = baseText === '对手选择中' || baseText === '请出牌' || baseText === '超时未出牌';
    const targetOffsetY = isGrayStatus ? 9 * s : 0;

    const lastKey = isLeft ? '_lastBotStatusBaseText' : '_lastPlayerStatusBaseText';
    const offsetKey = lastKey + 'Offset';
    const changeKey = isLeft ? '_battleBotStatusChange' : '_battlePlayerStatusChange';
    const lastBaseText = this[lastKey];

    if (baseText !== lastBaseText) {
      this[lastKey] = baseText;
      const lastOffset = this[offsetKey] || 0;
      game[changeKey] = { startTime: Date.now(), fromOffset: lastOffset };
    }

    let currentOffsetY = targetOffsetY;
    const change = game[changeKey];
    if (change) {
      const elapsed = Date.now() - change.startTime;
      if (elapsed < 300) {
        const ease = Easing.easeOutBack(elapsed / 300);
        currentOffsetY = change.fromOffset + (targetOffsetY - change.fromOffset) * ease;
      } else {
        game[changeKey] = null;
      }
    }
    this[offsetKey] = currentOffsetY;

    const drawY = statusY + currentOffsetY;

    ctx.save();
    ctx.font = `bold ${Math.floor(13 * s)}px ${this.parent.titleFontFamily}`;
    ctx.textBaseline = 'middle';

    if (statusText.startsWith('✓ ')) {
      // 对钩绿色，后面文字保持默认色
      const restText = statusText.slice(2);
      const checkWidth = ctx.measureText('✓').width;
      const spaceWidth = ctx.measureText(' ').width;
      const restWidth = ctx.measureText(restText).width;
      const totalWidth = checkWidth + spaceWidth + restWidth;
      const startX = centerX - totalWidth / 2;

      ctx.textAlign = 'left';
      ctx.fillStyle = '#2d7d32';
      ctx.fillText('✓', startX, drawY);
      ctx.fillStyle = COLORS.text;
      ctx.fillText(restText, startX + checkWidth + spaceWidth, drawY);
    } else {
      ctx.fillStyle = isGrayStatus ? '#8a8a8a' : COLORS.text;
      const isBoldStatus = baseText.startsWith('✓ ');
      const isPleasePlay = baseText === '请出牌';
      const isOpponentThinking = baseText === '对手选择中';
      const isTimeoutStatus = baseText === '超时未出牌';
      const statusFontSize = (isPleasePlay || isOpponentThinking || isTimeoutStatus) ? Math.floor(15 * s) : Math.floor(13 * s);
      ctx.font = isBoldStatus
        ? `bold ${statusFontSize}px ${this.parent.titleFontFamily}`
        : `${statusFontSize}px ${this.parent.titleFontFamily}`;

      // 倒计时数字脉冲缩放（秒数变化时触发，幅度较小）
      const getCountdownPulseScale = (sideKey) => {
        const pulseStartKey = sideKey === 'left' ? '_botCountdownPulseStart' : '_playerCountdownPulseStart';
        const start = this[pulseStartKey];
        if (!start) return 1;
        const elapsed = now - start;
        if (elapsed >= 300) return 1;
        const ease = Easing.easeOutBack(elapsed / 300);
        return 1 + 0.12 * ease;
      };

      if (isPleasePlay && this.battleCardIcon && this.battleCardIconLoaded) {
        // 请出牌：图标 + 文字 横向居中；倒计时独立绘制在文字右侧，不影响文字位置
        const text = baseText;
        const iconSize = 20 * s;
        const gap = 5 * s;
        const textWidth = ctx.measureText(text).width;
        const baseTotalWidth = iconSize + gap + textWidth;
        const startX = centerX - baseTotalWidth / 2;
        ctx.textAlign = 'left';
        ctx.drawImage(this.battleCardIcon, startX, drawY - iconSize / 2, iconSize, iconSize);
        ctx.fillText(text, startX + iconSize + gap, drawY);
        if (countdownSec > 0) {
          const countdownText = `(${countdownSec})`;
          const countdownWidth = ctx.measureText(countdownText).width;
          const countdownX = startX + iconSize + gap + textWidth + gap + countdownWidth / 2;
          ctx.save();
          ctx.translate(countdownX, drawY);
          ctx.scale(getCountdownPulseScale(side), getCountdownPulseScale(side));
          ctx.fillStyle = '#ff1a1a';
          ctx.textAlign = 'center';
          ctx.fillText(countdownText, 0, 0);
          ctx.restore();
        }
      } else if (isOpponentThinking && this.battleCardIconRival && this.battleCardIconRivalLoaded) {
        // 对手选择中：rival 图标 + 文字 横向居中；倒计时独立绘制在文字右侧
        const text = baseText;
        const iconSize = 26 * s;
        const gap = 5 * s;
        const textWidth = ctx.measureText(text).width;
        const baseTotalWidth = iconSize + gap + textWidth;
        const startX = centerX - baseTotalWidth / 2;
        ctx.textAlign = 'left';
        ctx.drawImage(this.battleCardIconRival, startX, drawY - iconSize / 2, iconSize, iconSize);
        ctx.fillText(text, startX + iconSize + gap, drawY);
        if (countdownSec > 0) {
          const countdownText = `(${countdownSec})`;
          const countdownWidth = ctx.measureText(countdownText).width;
          const countdownX = startX + iconSize + gap + textWidth + gap + countdownWidth / 2;
          ctx.save();
          ctx.translate(countdownX, drawY);
          ctx.scale(getCountdownPulseScale(side), getCountdownPulseScale(side));
          ctx.fillStyle = '#ff1a1a';
          ctx.textAlign = 'center';
          ctx.fillText(countdownText, 0, 0);
          ctx.restore();
        }
      } else if (isTimeoutStatus && this.battleOvertimeIcon && this.battleOvertimeIconLoaded) {
        // 超时未出牌：小图标 + 文字 横向居中
        const text = baseText;
        const iconSize = 20 * s;
        const gap = 5 * s;
        const textWidth = ctx.measureText(text).width;
        const totalWidth = iconSize + gap + textWidth;
        const startX = centerX - totalWidth / 2;
        ctx.textAlign = 'left';
        ctx.drawImage(this.battleOvertimeIcon, startX, drawY - iconSize / 2, iconSize, iconSize);
        ctx.fillText(text, startX + iconSize + gap, drawY);
      } else if (baseText) {
        ctx.textAlign = 'center';
        ctx.fillText(baseText, centerX, drawY);
      }
    }
    ctx.restore();

    if (wordText && wordText.length > 0) {
      if (flipSide === side && flipElapsed >= 0) {
        this._drawWordTilesFlip(ctx, centerX, tilesY, wordText, w - 16 * s, s, side, flipElapsed);
      } else if (botRevealProgress >= 0) {
        this._drawWordTilesReveal(ctx, centerX, tilesY, wordText, botRevealProgress, w - 16 * s, s, side);
      } else {
        let popProgress = -1;
        if (hidden) {
          if (isLeft && game._battleBotReadyAnimStart) {
            popProgress = Math.min((Date.now() - game._battleBotReadyAnimStart) / 400, 1);
          } else if (!isLeft && game._battlePlayerReadyAnimStart) {
            popProgress = Math.min((Date.now() - game._battlePlayerReadyAnimStart) / 400, 1);
          }
        }
        this._drawWordTiles(ctx, centerX, tilesY, wordText, hidden, w - 16 * s, s, side, popProgress);
      }
    }

    // 揭晓阶段在正方形下方显示单词中文释义
    if (game.battlePhase === 'revealing' && wordText && !wordText.includes('?')) {
      const meaning = isLeft ? game.battleBotWordMeaning : game.battlePlayerWordMeaning;
      if (meaning) {
        this._drawWordMeaning(ctx, centerX, tilesY + 32 * s, meaning, w - 16 * s, s);
      }
    }
  }

  // ===== 单词字母块（面板内） =====
  // popProgress: 仅对 hidden 方块有效，0~1 时执行从下往上果冻弹出动画
  // side: 'left' 为对方，'right' 为我方
  _drawWordTiles(ctx, centerX, y, text, hidden, maxW, s, side, popProgress = -1) {
    const isLeft = side === 'left';
    const count = text.length;
    const gap = 4 * s;
    const maxTile = 26 * s;
    let tileW = (maxW - gap * (count - 1)) / count;
    tileW = Math.min(tileW, maxTile);
    const totalW = count * tileW + (count - 1) * gap;
    const startX = centerX - totalW / 2;

    const hasPopAnim = hidden && popProgress >= 0 && popProgress <= 1;
    const ease = hasPopAnim ? Easing.easeOutBack(popProgress) : 1;
    const scale = ease;
    const offsetY = hasPopAnim ? (1 - ease) * 18 * s : 0;

    for (let i = 0; i < count; i++) {
      const tx = startX + i * (tileW + gap);
      const cx = tx + tileW / 2;
      const cy = y + tileW / 2;

      ctx.save();
      ctx.translate(cx, cy + offsetY);
      ctx.scale(scale, scale);

      if (hidden) {
        if (isLeft && this.parent.battle_rival_place && this.parent.battle_rival_placeLoaded) {
          ctx.drawImage(this.parent.battle_rival_place, -tileW / 2, -tileW / 2, tileW, tileW);
        } else if (!isLeft && this.parent.battle_me_place && this.parent.battle_me_placeLoaded) {
          ctx.drawImage(this.parent.battle_me_place, -tileW / 2, -tileW / 2, tileW, tileW);
        } else {
          // 隐藏方块兜底：浅蓝半透明填充 + 蓝色边框
          this.parent.roundRect(-tileW / 2, -tileW / 2, tileW, tileW, 4 * s, COLORS.hiddenTileBlue, COLORS.hiddenTileBlueBorder, 1.5 * s);
        }
      } else {
        const bgImg = isLeft ? this.parent.battle_rival_word_bg : this.parent.battle_me_word_bg;
        const bgLoaded = isLeft ? this.parent.battle_rival_word_bgLoaded : this.parent.battle_me_word_bgLoaded;
        if (bgImg && bgLoaded) {
          ctx.drawImage(bgImg, -tileW / 2, -tileW / 2, tileW, tileW);
        } else {
          this.parent.roundRect(-tileW / 2, -tileW / 2, tileW, tileW, 4 * s, COLORS.panelBg, COLORS.tileStroke, 1.5 * s);
        }
      }

      if (!hidden) {
        ctx.font = `bold ${Math.floor(tileW * 0.55)}px Georgia, serif`;
        ctx.fillStyle = COLORS.text;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(text[i].toUpperCase(), 0, 0);
      }

      ctx.restore();
    }
  }

  // ===== 在字母方块下方绘制单词中文释义（超过 10 字符用 ...） =====
  _drawWordMeaning(ctx, centerX, y, meaning, maxW, s) {
    if (!meaning) return;
    let text = meaning.trim();
    if (text.length > 10) text = text.substring(0, 10) + '...';
    ctx.save();
    ctx.font = `bold ${Math.floor(10 * s)}px ${this.parent.titleFontFamily}`;
    ctx.fillStyle = COLORS.text;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillText(text, centerX, y);
    ctx.restore();
  }

  // ===== 单词字母块从下往上果冻感弹出动画 =====
  // side: 'left' 为对方，'right' 为我方
  _drawWordTilesReveal(ctx, centerX, y, word, progress, maxW, s, side) {
    const isLeft = side === 'left';
    const count = word.length;
    const gap = 4 * s;
    const maxTile = 26 * s;
    let tileW = (maxW - gap * (count - 1)) / count;
    tileW = Math.min(tileW, maxTile);
    const totalW = count * tileW + (count - 1) * gap;
    const startX = centerX - totalW / 2;

    const ease = Easing.easeOutBack(progress);
    const scale = ease;
    const offsetY = (1 - ease) * 20 * s;

    for (let i = 0; i < count; i++) {
      const tx = startX + i * (tileW + gap);
      const cx = tx + tileW / 2;
      const cy = y + tileW / 2;

      ctx.save();
      ctx.translate(cx, cy + offsetY);
      ctx.scale(scale, scale);

      const bgImg = isLeft ? this.parent.battle_rival_word_bg : this.parent.battle_me_word_bg;
      const bgLoaded = isLeft ? this.parent.battle_rival_word_bgLoaded : this.parent.battle_me_word_bgLoaded;
      if (bgImg && bgLoaded) {
        ctx.drawImage(bgImg, -tileW / 2, -tileW / 2, tileW, tileW);
      } else {
        this.parent.roundRect(-tileW / 2, -tileW / 2, tileW, tileW, 4 * s, COLORS.panelBg, COLORS.tileStroke, 1.5 * s);
      }

      ctx.font = `bold ${Math.floor(tileW * 0.55)}px Georgia, serif`;
      ctx.fillStyle = COLORS.text;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(word[i].toUpperCase(), 0, 0);
      ctx.restore();
    }
  }

  // ===== 单词字母块逐张翻转动画（placeholder -> word_bg）=====
  // elapsed: 从开始翻转起的毫秒数
  // side: 'left' 为对方，'right' 为我方
  _drawWordTilesFlip(ctx, centerX, y, word, maxW, s, side, elapsed) {
    const isLeft = side === 'left';
    const count = word.length;
    const gap = 4 * s;
    const maxTile = 26 * s;
    let tileW = (maxW - gap * (count - 1)) / count;
    tileW = Math.min(tileW, maxTile);
    const totalW = count * tileW + (count - 1) * gap;
    const startX = centerX - totalW / 2;

    const FLIP_DURATION = 200;
    const FLIP_GAP = 120; // 相邻字母开始翻转的时间间隔，小于 FLIP_DURATION 即有重叠

    const placeImg = isLeft ? this.parent.battle_rival_place : this.parent.battle_me_place;
    const placeLoaded = isLeft ? this.parent.battle_rival_placeLoaded : this.parent.battle_me_placeLoaded;
    const wordImg = isLeft ? this.parent.battle_rival_word_bg : this.parent.battle_me_word_bg;
    const wordLoaded = isLeft ? this.parent.battle_rival_word_bgLoaded : this.parent.battle_me_word_bgLoaded;

    for (let i = 0; i < count; i++) {
      const tx = startX + i * (tileW + gap);
      const cx = tx + tileW / 2;
      const cy = y + tileW / 2;

      const tileStart = i * FLIP_GAP;
      const tileProgress = Math.min(1, Math.max(0, (elapsed - tileStart) / FLIP_DURATION));

      ctx.save();
      ctx.translate(cx, cy);

      if (tileProgress <= 0) {
        // 尚未翻转：占位图
        if (placeImg && placeLoaded) {
          ctx.drawImage(placeImg, -tileW / 2, -tileW / 2, tileW, tileW);
        } else {
          this.parent.roundRect(-tileW / 2, -tileW / 2, tileW, tileW, 4 * s, COLORS.hiddenTileBlue, COLORS.hiddenTileBlueBorder, 1.5 * s);
        }
      } else if (tileProgress >= 1) {
        // 翻转完成：单词背景 + 字母
        if (wordImg && wordLoaded) {
          ctx.drawImage(wordImg, -tileW / 2, -tileW / 2, tileW, tileW);
        } else {
          this.parent.roundRect(-tileW / 2, -tileW / 2, tileW, tileW, 4 * s, COLORS.panelBg, COLORS.tileStroke, 1.5 * s);
        }
        ctx.font = `bold ${Math.floor(tileW * 0.55)}px Georgia, serif`;
        ctx.fillStyle = COLORS.text;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(word[i].toUpperCase(), 0, 0);
      } else {
        // 翻转中
        if (tileProgress < 0.5) {
          // 前半段：占位图翻走
          const scaleX = 1 - tileProgress * 2;
          ctx.scale(scaleX, 1);
          if (placeImg && placeLoaded) {
            ctx.drawImage(placeImg, -tileW / 2, -tileW / 2, tileW, tileW);
          } else {
            this.parent.roundRect(-tileW / 2, -tileW / 2, tileW, tileW, 4 * s, COLORS.hiddenTileBlue, COLORS.hiddenTileBlueBorder, 1.5 * s);
          }
        } else {
          // 后半段：单词背景翻入
          const scaleX = (tileProgress - 0.5) * 2;
          ctx.scale(scaleX, 1);
          if (wordImg && wordLoaded) {
            ctx.drawImage(wordImg, -tileW / 2, -tileW / 2, tileW, tileW);
          } else {
            this.parent.roundRect(-tileW / 2, -tileW / 2, tileW, tileW, 4 * s, COLORS.panelBg, COLORS.tileStroke, 1.5 * s);
          }
          ctx.font = `bold ${Math.floor(tileW * 0.55)}px Georgia, serif`;
          ctx.fillStyle = COLORS.text;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(word[i].toUpperCase(), 0, 0);
        }
      }

      ctx.restore();
    }
  }

  // ===== 中间提示语 =====
  _drawCenterPrompt(ctx, W, y, s) {
    this._drawDecoratedText(ctx, W, y, s, '请选择字母，组成单词并提交');
  }

  // ===== 简化版 VS 模块（对战结束弹窗用） =====
  _drawSimpleVSModule(ctx, game, W, y, h, s) {
    const x = 0;
    const moduleW = W;
    const moduleH = h;
    const centerX = x + moduleW / 2;
    const centerY = y + moduleH / 2;
    const corner = 10 * s;

    // 切角八边形背景 + 内投影 + 双层边框（参考对战面板）
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(x + corner, y);
    ctx.lineTo(x + moduleW - corner, y);
    ctx.lineTo(x + moduleW, y + corner);
    ctx.lineTo(x + moduleW, y + moduleH - corner);
    ctx.lineTo(x + moduleW - corner, y + moduleH);
    ctx.lineTo(x + corner, y + moduleH);
    ctx.lineTo(x, y + moduleH - corner);
    ctx.lineTo(x, y + corner);
    ctx.closePath();

    // 背景/边框按胜负区分：成功暖金，失败/平局灰
    const vsIsWin = (game.battlePlayerScore || 0) > (game.battleBotScore || 0);
    ctx.fillStyle = vsIsWin ? '#F1E5CE' : '#D2CCC4';
    ctx.shadowColor = 'rgba(90, 62, 31, 0.15)';
    ctx.shadowBlur = 10 * s;
    ctx.shadowOffsetY = 3 * s;
    ctx.fill();
    ctx.shadowColor = 'transparent';

    ctx.lineWidth = 2.5 * s;
    ctx.strokeStyle = vsIsWin ? '#D4AF37' : '#4A4A4A';
    ctx.stroke();
    ctx.lineWidth = 1 * s;
    ctx.strokeStyle = vsIsWin ? '#F0E0A8' : '#8A8A8A';
    ctx.stroke();
    ctx.restore();

    // 左右虚线分隔线（与 VS 间距加大）
    const dividerGap = 32 * s;
    ctx.save();
    ctx.strokeStyle = 'rgba(196, 163, 90, 0.6)';
    ctx.lineWidth = 1 * s;
    ctx.setLineDash([3 * s, 3 * s]);
    ctx.beginPath();
    ctx.moveTo(centerX - dividerGap, y + 16 * s);
    ctx.lineTo(centerX - dividerGap, y + moduleH - 16 * s);
    ctx.moveTo(centerX + dividerGap, y + 16 * s);
    ctx.lineTo(centerX + dividerGap, y + moduleH - 16 * s);
    ctx.stroke();
    ctx.restore();

    // 中间 VS 字样
    ctx.save();
    ctx.font = `bold ${Math.floor(26 * s)}px Georgia, 'Times New Roman', serif`;
    ctx.fillStyle = '#5a3e1f';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('VS', centerX, centerY);
    ctx.restore();

    // 左侧对手信息（蓝色）
    const leftScore = game.battleBotScore || 0;
    let opponentName = game._battleOpponent && game._battleOpponent.name ? game._battleOpponent.name : '玩家A';
    const nameChars = Array.from(opponentName);
    if (nameChars.length > 5) opponentName = nameChars.slice(0, 5).join('') + '...';
    const leftNameSize = nameChars.length >= 6 ? Math.floor(14 * s) : Math.floor(18 * s);
    const leftCenterX = (x + centerX - dividerGap) / 2;

    ctx.save();
    ctx.font = `bold ${leftNameSize}px ${this.parent.titleFontFamily}`;
    ctx.fillStyle = '#3b5998';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(opponentName, leftCenterX, centerY - 12 * s);
    ctx.font = `bold ${Math.floor(15 * s)}px ${this.parent.titleFontFamily}`;
    ctx.fillText(`${leftScore}分`, leftCenterX, centerY + 16 * s);
    ctx.restore();

    // 右侧玩家信息（红棕色）
    const rightScore = game.battlePlayerScore || 0;
    const rightCenterX = (centerX + dividerGap + x + moduleW) / 2;

    ctx.save();
    ctx.font = `bold ${Math.floor(18 * s)}px ${this.parent.titleFontFamily}`;
    ctx.fillStyle = '#993e2d';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('我', rightCenterX, centerY - 12 * s);
    ctx.font = `bold ${Math.floor(15 * s)}px ${this.parent.titleFontFamily}`;
    ctx.fillText(`${rightScore}分`, rightCenterX, centerY + 16 * s);
    ctx.restore();
  }

  // ===== 挑战成功标题图背后的光芒和星星效果 =====
  _drawVictoryEffect(ctx, cx, cy, titleW, titleH, s, elapsed, closeAlpha) {
    const maxLen = Math.max(titleW, titleH) * 1.15;
    const rayCount = 14;
    const time = elapsed;

    ctx.save();
    ctx.globalAlpha = closeAlpha;
    ctx.globalCompositeOperation = 'lighter';

    // 光芒射线
    for (let i = 0; i < rayCount; i++) {
      const angle = -Math.PI * 0.95 + (Math.PI * 1.9 / rayCount) * i;
      const width = 0.08 + 0.04 * Math.sin(time * 0.004 + i);
      const pulse = 0.35 + 0.25 * Math.sin(time * 0.006 + i * 0.9);

      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(cx + Math.cos(angle - width) * maxLen, cy + Math.sin(angle - width) * maxLen);
      ctx.lineTo(cx + Math.cos(angle + width) * maxLen, cy + Math.sin(angle + width) * maxLen);
      ctx.closePath();

      const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, maxLen);
      grad.addColorStop(0, `rgba(255, 200, 80, ${0.12 * pulse})`);
      grad.addColorStop(0.4, `rgba(255, 170, 50, ${0.05 * pulse})`);
      grad.addColorStop(1, 'rgba(255, 150, 0, 0)');
      ctx.fillStyle = grad;
      ctx.fill();
    }

    // 中心光晕
    const halo = ctx.createRadialGradient(cx, cy, 0, cx, cy, maxLen * 0.55);
    halo.addColorStop(0, 'rgba(255, 220, 100, 0.45)');
    halo.addColorStop(0.25, 'rgba(255, 170, 60, 0.18)');
    halo.addColorStop(0.7, 'rgba(255, 130, 20, 0.05)');
    halo.addColorStop(1, 'rgba(255, 130, 20, 0)');
    ctx.fillStyle = halo;
    ctx.beginPath();
    ctx.arc(cx, cy, maxLen * 0.55, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();

    // 闪烁星星（复用通用方法）
    this._victoryStars = this.parent._drawSparkleStars(
      ctx, cx, cy, titleW * 1.2, titleH * 1.4, s, elapsed, 20, this._victoryStars, closeAlpha
    );
  }

  // ===== Reveal 阶段动画触发 =====
  // 支持 firstSide/secondSide：超时方先展示 +0，未超时方后正常翻牌计分
  _updateBattleRevealAnimation(game, s) {
    const timeline = game._battleAnimTimeline;
    if (!timeline || game.battlePhase !== 'revealing') return;

    const now = Date.now();
    if (!game._battleFlyingScores) game._battleFlyingScores = [];

    const FLIP_DURATION = 200;
    const FLIP_GAP = 120; // 相邻字母开始翻转的时间间隔，小于 FLIP_DURATION 即有重叠
    const PLACEHOLDER_DURATION = 500;
    const SCORE_FLY_DURATION = 800;
    const FLASH_DURATION = 1000;

    const firstSide = timeline.firstSide || 'player';
    const secondSide = timeline.secondSide || 'bot';

    const wordLenOf = (side) => {
      const word = side === 'player' ? game.battlePlayerWord : game.battleBotWord;
      return word ? word.length : 0;
    };
    const scoreOf = (side) => {
      return side === 'player' ? (game.battlePlayerRoundScore || 0) : (game.battleBotRoundScore || 0);
    };
    const panelOf = (side) => {
      return side === 'player' ? this.battlePanelRight : this.battlePanelLeft;
    };

    const firstWordLen = wordLenOf(firstSide);
    const secondWordLen = wordLenOf(secondSide);

    switch (timeline.step) {
      case 'placeholders':
        if (now - timeline.stepStartTime >= PLACEHOLDER_DURATION) {
          timeline.step = 'first_flip';
          timeline.stepStartTime = now;
          timeline.firstFlipStartTime = now;
        }
        break;
      case 'first_flip': {
        const totalFlipTime = Math.max(0, (firstWordLen - 1) * FLIP_GAP + FLIP_DURATION);
        if (now - timeline.firstFlipStartTime >= totalFlipTime) {
          timeline.step = 'first_score';
          timeline.stepStartTime = now;
        }
        break;
      }
      case 'first_score':
        if (!timeline.firstScoreTriggered) {
          timeline.firstScoreTriggered = true;
          const panel = panelOf(firstSide);
          if (panel) {
            game._battleFlyingScores.push({
              value: scoreOf(firstSide),
              side: firstSide,
              startX: panel.centerX + (firstSide === 'player' ? 10 * s : -10 * s),
              startY: panel.flyScoreY - 32 * s,
              startTime: now,
            });
            if (game.audioManager) game.audioManager.play('word_score');
          }
        }
        if (now - timeline.stepStartTime >= SCORE_FLY_DURATION) {
          timeline.step = 'second_flip';
          timeline.stepStartTime = now;
          timeline.secondFlipStartTime = now;
        }
        break;
      case 'second_flip': {
        const totalFlipTime = Math.max(0, (secondWordLen - 1) * FLIP_GAP + FLIP_DURATION);
        if (now - timeline.secondFlipStartTime >= totalFlipTime) {
          timeline.step = 'second_score';
          timeline.stepStartTime = now;
        }
        break;
      }
      case 'second_score':
        if (!timeline.secondScoreTriggered) {
          timeline.secondScoreTriggered = true;
          const panel = panelOf(secondSide);
          if (panel) {
            game._battleFlyingScores.push({
              value: scoreOf(secondSide),
              side: secondSide,
              startX: panel.centerX + (secondSide === 'player' ? 10 * s : -10 * s),
              startY: panel.flyScoreY - 32 * s,
              startTime: now,
            });
            if (game.audioManager) game.audioManager.play('word_score');
          }
        }
        if (now - timeline.stepStartTime >= SCORE_FLY_DURATION) {
          // 计分动画结束：更新总分并启动进度条动画
          game.battlePlayerScore += game.battlePlayerRoundScore || 0;
          game.battleBotScore += game.battleBotRoundScore || 0;
          game._battleScoreBarAnim = {
            startTime: now,
            fromRatio: timeline.fromRatio,
            toRatio: timeline.toRatio,
            duration: FLASH_DURATION
          };
          // 本轮计分分数高的头像触发切割钻环动画
          const botRound = game.battleBotRoundScore || 0;
          const playerRound = game.battlePlayerRoundScore || 0;
          if (botRound !== playerRound) {
            game._battleAvatarGlowAnim = {
              startTime: now,
              duration: 1000,
              side: botRound > playerRound ? 'bot' : 'player'
            };
          }
          timeline.step = 'done';
          timeline.stepStartTime = now;
        }
        break;
      case 'done':
        // 等待 checkReveal 进入下一回合
        break;
    }
  }

  // ===== Reveal 阶段飞行分数动画（参考游戏页 _updateAndDrawFlyingScore）=====
  // 注意：动画结束后不自动消失，保留到下一轮开始
  _drawBattleFlyingScore(ctx, s, game) {
    const scores = game._battleFlyingScores;
    if (!scores || scores.length === 0) return;

    const appearDuration = 300;

    ctx.save();
    ctx.font = `bold ${Math.floor(26 * s)}px Georgia, serif`;
    ctx.fillStyle = '#c4a35a';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.shadowColor = 'rgba(255,215,0,0.25)';
    ctx.shadowBlur = 20 * s;

    scores.forEach(fs => {
      const elapsed = Date.now() - fs.startTime;

      if (elapsed < appearDuration) {
        const progress = elapsed / appearDuration;
        const ease = Easing.easeOutBackStrong(progress);
        const scale = ease;
        const offsetY = (1 - ease) * 15 * s;
        ctx.save();
        ctx.translate(fs.startX, fs.startY + offsetY);
        ctx.scale(scale, scale);
        ctx.fillText(`+${fs.value}`, 0, 0);
        ctx.restore();
      } else {
        // 弹出完成后保持静止显示，不淡出，避免透明度恢复时闪一下
        ctx.fillText(`+${fs.value}`, fs.startX, fs.startY);
      }
    });

    ctx.restore();
  }

  // ===== 可选字母 标题 =====
  _drawSectionTitle(ctx, W, y, s, text) {
    this._drawDecoratedText(ctx, W, y, s, text, 30 * s);
  }

  _drawDecoratedText(ctx, W, y, s, text, margin = 20 * s) {
    ctx.save();
    ctx.font = `bold ${Math.floor(13 * s)}px ${this.parent.titleFontFamily}`;
    ctx.fillStyle = COLORS.text;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const textW = ctx.measureText(text).width;
    const lineY = y;

    ctx.strokeStyle = COLORS.gold;
    ctx.lineWidth = 1 * s;
    ctx.beginPath();
    ctx.moveTo(margin, lineY);
    ctx.lineTo(W / 2 - textW / 2 - 8 * s, lineY);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(W / 2 + textW / 2 + 8 * s, lineY);
    ctx.lineTo(W - margin, lineY);
    ctx.stroke();

    ctx.fillText(text, W / 2, lineY);
    ctx.restore();
  }

  // ===== 单词预览区（完全复用游戏进行页风格） =====
  _drawPreview(ctx, game, W, y, s) {
    const maskW = 180 * s;
    const maskH = 40 * s;
    const maskX = W / 2 - maskW / 2;
    const maskY = y;
    const wordAreaY = maskY + maskH / 2;

    // 渐变背景蒙层
    const maskGrad = ctx.createLinearGradient(0, maskY, 0, maskY + maskH);
    maskGrad.addColorStop(0, 'rgba(255,255,255,0.45)');
    maskGrad.addColorStop(1, 'rgba(240,235,224,0.35)');
    this.parent.roundRect(maskX, maskY, maskW, maskH, 10 * s, maskGrad, 'rgba(196,163,90,0.5)', 1 * s);

    // 左右装饰线（score_line.png，右侧镜像）
    if (this.parent.scoreLine && this.parent.scoreLineLoaded) {
      const scoreLineImg = this.parent.scoreLine;
      const lineH = 18 * s;
      const lineW = lineH * (scoreLineImg.width / scoreLineImg.height);
      const lineGap = 8 * s;
      const lineY = wordAreaY - lineH / 2;

      // 左侧：原图方向
      ctx.drawImage(scoreLineImg, maskX - lineGap - lineW, lineY, lineW, lineH);

      // 右侧：水平镜像
      ctx.save();
      ctx.translate(maskX + maskW + lineGap + lineW, lineY);
      ctx.scale(-1, 1);
      ctx.drawImage(scoreLineImg, 0, 0, lineW, lineH);
      ctx.restore();
    }

    // 按点击顺序获取已选卡牌
    const selected = game.battleManager ? game.battleManager.getBattleSelectedCards() : [];
    const pc = game.battlePendingCheck;
    const previewWord = pc ? pc.word : selected.map(c => c.letter.toLowerCase()).join('');
    const previewFontSize = Math.floor((previewWord.length > 9 ? 28 * 9 / previewWord.length : 28) * s);

    // 流光边框
    const hasInput = selected.length > 0;
    const flowLineWidth = hasInput ? 2.2 * s : 2.0 * s;
    const t = (Date.now() % 3000) / 3000;
    const isValidWord = pc && pc.state === 'valid';
    const flowColor = isValidWord ? '45,125,50' : '240,195,20';
    const flowGrad = ctx.createLinearGradient(
      maskX - maskW * 0.2 + maskW * t * 1.4, maskY,
      maskX + maskW * 0.2 + maskW * t * 1.4, maskY + maskH
    );
    flowGrad.addColorStop(0, `rgba(${flowColor},0)`);
    flowGrad.addColorStop(0.5, `rgba(${flowColor},0.8)`);
    flowGrad.addColorStop(1, `rgba(${flowColor},0)`);
    ctx.save();
    ctx.strokeStyle = flowGrad;
    ctx.lineWidth = flowLineWidth;
    this.parent._roundedRectPath(ctx, maskX, maskY, maskW, maskH, 10 * s);
    ctx.stroke();
    ctx.restore();

    // pendingCheck 状态优先
    if (pc) {
      const word = pc.word;
      if (pc.state === 'checking') {
        ctx.save();
        ctx.font = `bold ${previewFontSize}px Georgia, 'Times New Roman', serif`;
        ctx.fillStyle = '#c4a35a';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(word, W / 2, wordAreaY);
        ctx.restore();

        const dotCount = (Math.floor(Date.now() / 400) % 4) + 1;
        ctx.save();
        ctx.font = `bold ${Math.floor(20 * s)}px sans-serif`;
        ctx.fillStyle = '#c4a35a';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('.'.repeat(dotCount), W / 2, wordAreaY + 24 * s + 3 * s);
        ctx.restore();
      } else if (pc.state === 'valid') {
        ctx.save();
        ctx.font = `bold ${previewFontSize}px Georgia, 'Times New Roman', serif`;
        ctx.fillStyle = '#2d7d32';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(word, W / 2, wordAreaY);
        ctx.restore();
      } else if (pc.state === 'invalid' || pc.state === 'duplicate') {
        // 非法/重复：参考游戏页，橙色单词 + error图标 + 红色提示
        ctx.save();
        ctx.font = `bold ${previewFontSize}px Georgia, 'Times New Roman', serif`;
        ctx.fillStyle = '#f1c40f';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(word, W / 2, wordAreaY);
        ctx.restore();

        const errText = pc.failText || '单词不存在';
        ctx.save();
        ctx.font = `bold ${Math.floor(15 * s)}px ${this.parent.titleFontFamily}`;
        ctx.fillStyle = '#c0392b';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        const errTextWidth = ctx.measureText(errText).width;
        const errIconSize = 18 * s;
        const errGap = 4 * s;
        const errTotalWidth = errIconSize + errGap + errTextWidth;
        const errBaseX = W / 2 - errTotalWidth / 2;
        const errY = wordAreaY + 32 * s;

        // 画 error 图标
        if (this.parent.errorIcon && this.parent.errorIconLoaded) {
          ctx.drawImage(this.parent.errorIcon, errBaseX, errY - errIconSize / 2, errIconSize, errIconSize);
        }
        // 画文字
        ctx.fillText(errText, errBaseX + errIconSize + errGap + errTextWidth / 2, errY);
        ctx.restore();
      }
    } else if (selected.length >= 1) {
      // 普通预览：橙色小写单词
      ctx.save();
      ctx.font = `bold ${previewFontSize}px Georgia, 'Times New Roman', serif`;
      ctx.fillStyle = '#c4a35a';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(previewWord, W / 2, wordAreaY);
      ctx.restore();
    } else {
      // 未选择：placeholder
      ctx.save();
      ctx.font = `${Math.floor(13 * s)}px ${this.parent.titleFontFamily}`;
      ctx.fillStyle = 'rgba(90,74,42,0.55)';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('选择字母牌组成单词', W / 2, wordAreaY);
      ctx.restore();
    }
  }

  // ===== 手牌区（完全复用游戏进行页卡牌样式） =====
  _drawHand(ctx, game, startY, W, s) {
    if (!game.battleHand) return startY;

    const hand = game.battleHand;
    const cols = hand.length <= 9 ? 3 : 4;
    const rows = Math.ceil(hand.length / cols);
    const cardW = this.parent.cardW;
    const cardH = this.parent.cardH;
    const gap = this.parent.gap;
    const totalW = cols * cardW + (cols - 1) * gap;
    const startX = (W - totalW) / 2;

    this.battleCardRects = [];

    for (let i = 0; i < hand.length; i++) {
      const card = hand[i];
      if (!card) continue;
      const row = Math.floor(i / cols);
      const col = i % cols;
      const x = startX + col * (cardW + gap);
      const y = startY + row * (cardH + gap);

      // 选中态向上偏移（与游戏页一致）
      card.selectOffset = card.selected ? -8 * s : 0;
      this.parent.drawCard(card, x, y, false, null);

      this.battleCardRects.push({
        index: i,
        x,
        y,
        w: cardW,
        h: cardH,
        card
      });
    }

    return startY + rows * cardH + (rows - 1) * gap;
  }

  // ===== 底部按钮（完全复用游戏进行页图片按钮） =====
  _drawBottomButtons(ctx, game, W, y, s) {
    const btnY = y;
    const btnW = 90 * s;
    const btnH = 56 * s;
    const btnGap = 20 * s;
    const totalBtnW = btnW * 2 + btnGap;
    const btnStartX = (W - totalBtnW) / 2;

    const selectedCount = game.battleManager ? game.battleManager.getBattleSelectedCards().length : 0;
    const isInvalid = game.battlePendingCheck && (game.battlePendingCheck.state === 'invalid' || game.battlePendingCheck.state === 'duplicate');
    const playEnabled = selectedCount >= 2 && !isInvalid && (!game.battlePendingCheck || game.battlePendingCheck.state !== 'checking');
    const playText = '出牌';

    // 出牌按钮
    const playX = btnStartX;
    const playY = btnY + (game._battlePlayBtnPressed ? 2 * s : 0);
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.35)';
    ctx.shadowBlur = 6 * s;
    ctx.shadowOffsetY = 3 * s;
    this.parent.drawBtnImage('out_card', playX, playY, btnW, btnH);
    ctx.restore();
    ctx.save();
    ctx.font = `bold ${Math.floor(16 * s)}px ${this.parent.titleFontFamily}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const playTextY = playY + btnH / 2 - 1 * s;
    const playTx = playX + btnW / 2;
    if (!playEnabled) {
      ctx.lineWidth = 2 * s;
      ctx.strokeStyle = '#3a2e1d';
      ctx.strokeText(playText, playTx, playTextY);
      ctx.fillStyle = '#9a8f7d';
      ctx.fillText(playText, playTx, playTextY);
    } else {
      ctx.lineWidth = 2 * s;
      ctx.strokeStyle = '#2a1f0d';
      ctx.strokeText(playText, playTx, playTextY);
      const grad = ctx.createLinearGradient(playTx, playTextY - 7 * s, playTx, playTextY + 7 * s);
      grad.addColorStop(0, '#dfc06e');
      grad.addColorStop(0.5, '#c9a84c');
      grad.addColorStop(1, '#b5973e');
      ctx.fillStyle = grad;
      ctx.fillText(playText, playTx, playTextY);
    }
    ctx.restore();
    this.battlePlayBtnRect = { x: playX, y: btnY, w: btnW, h: btnH };

    // 清空选择按钮
    const resetX = btnStartX + btnW + btnGap;
    const resetY = btnY + (game._battleClearBtnPressed ? 2 * s : 0);
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.35)';
    ctx.shadowBlur = 6 * s;
    ctx.shadowOffsetY = 3 * s;
    this.parent.drawBtnImage('reset_select', resetX, resetY, btnW, btnH);
    ctx.restore();
    ctx.save();
    ctx.font = `bold ${Math.floor(16 * s)}px ${this.parent.titleFontFamily}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const resetTextY = resetY + btnH / 2 - 1 * s;
    const resetText = '清空选择';
    const resetTx = resetX + btnW / 2;
    ctx.lineWidth = 2 * s;
    ctx.strokeStyle = '#5a4a2a';
    ctx.strokeText(resetText, resetTx, resetTextY);
    ctx.fillStyle = '#fff';
    ctx.fillText(resetText, resetTx, resetTextY);
    ctx.restore();
    this.battleClearBtnRect = { x: resetX, y: btnY, w: btnW, h: btnH };
  }

  // ===== 回合推进卡住时的手动重试按钮 =====
  _drawRetryButton(ctx, game, W, H, baseBtnY, s) {
    // 仅在 round_end 或 revealing done 后卡住时显示
    const showRetry = game.battlePhase === 'round_end' ||
      (game.battlePhase === 'revealing' && game._battleAnimTimeline && game._battleAnimTimeline.step === 'done');
    if (!showRetry) {
      this.battleRetryBtnRect = null;
      return;
    }

    const btnW = 160 * s;
    const btnH = 44 * s;
    const btnX = (W - btnW) / 2;
    // 放在屏幕中下部，避免被底部安全区遮挡
    const btnY = Math.min(baseBtnY + 70 * s, H - (this.parent.safeBottom || 0) - btnH - 20 * s);
    const pressed = game._battleRetryBtnPressed || false;
    const offset = pressed ? 2 * s : 0;

    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.35)';
    ctx.shadowBlur = 6 * s;
    ctx.shadowOffsetY = 3 * s;
    this.parent.roundRect(btnX, btnY + offset, btnW, btnH, 8 * s, '#c4a35a', '#5a4a2a', 1.5 * s);
    ctx.restore();

    ctx.save();
    ctx.font = `bold ${Math.floor(15 * s)}px ${this.parent.titleFontFamily}`;
    ctx.fillStyle = '#fff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineWidth = 2 * s;
    ctx.strokeStyle = '#3a2e1d';
    const text = game._battleIsHost ? '同步下一回合' : '刷新房间状态';
    const textX = btnX + btnW / 2;
    const textY = btnY + offset + btnH / 2;
    ctx.strokeText(text, textX, textY);
    ctx.fillText(text, textX, textY);
    ctx.restore();

    // 提示文字
    ctx.save();
    ctx.font = `${Math.floor(12 * s)}px ${this.parent.titleFontFamily}`;
    ctx.fillStyle = '#8a7a6a';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('若长时间未进入下一回合，请点击', textX, btnY - 12 * s);
    ctx.restore();

    this.battleRetryBtnRect = { x: btnX, y: btnY, w: btnW, h: btnH };
  }

  // ===== 通用按钮绘制 =====
  _drawBtn(ctx, text, x, y, w, h, s, pressed, fillColor, textColor = '#fff', strokeColor = null) {
    const offset = pressed ? 2 * s : 0;
    ctx.save();
    this.parent.roundRect(x, y + offset, w, h, 8 * s, fillColor, strokeColor, strokeColor ? 1.5 * s : 0);

    ctx.font = `bold ${Math.floor(15 * s)}px ${this.parent.titleFontFamily}`;
    ctx.fillStyle = textColor;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, x + w / 2, y + h / 2 + offset);
    ctx.restore();
  }

  // ===== 对战结束弹窗 =====
  _drawEndPopup(ctx, game, W, H, s) {
    // 新弹窗出现时重置动画，并清除按钮锁避免上次遗留导致无响应
    if (this.lastBattlePhase !== 'battle_end') {
      this.battleEndAnimStartTime = Date.now();
      game._battleShareBtnLocked = false;
      game._battleRestartBtnLocked = false;
      game._battleHomeBtnLocked = false;
      // 更新每日成就：完成对战 + 对战胜利
      const daily = new DailyAchievements(game);
      daily.addProgress('gamesCompleted');
      if ((game.battlePlayerScore || 0) > (game.battleBotScore || 0)) {
        daily.addProgress('battleWins');
        // 荣誉杯：胜利一场 +1，本地存储 + 上传云端
        if (game.battleManager) game.battleManager.awardHonorTrophy();
      }
    }
    this.lastBattlePhase = 'battle_end';

    const elapsed = Date.now() - this.battleEndAnimStartTime;
    const playerScore = game.battlePlayerScore || 0;
    const botScore = game.battleBotScore || 0;
    const isWin = playerScore > botScore;
    const isDraw = playerScore === botScore;
    const panel = this.parent._drawModalPanel(ctx, W, H, s, {
      isClosing: false,
      closeStartTime: null,
      width: 332, height: 270, enterOffset: 25,
      elapsed,
      bgColor: isWin ? '#EDD7B5' : '#C9C5BD',
      borderColor: isWin ? '#c4a35a' : '#4A4A4A',
      onCloseComplete: () => {}
    });
    if (!panel) return;
    const { px, py, pw, ph, closeAlpha } = panel;

    // 对战结束弹窗音效（成功/失败各播放一次）
    if (!this._battleEndSoundPlayed && game.audioManager) {
      if (isWin) {
        game.audioManager.play('battle_pop_success');
      } else if (!isDraw) {
        game.audioManager.play('game_over');
      }
      this._battleEndSoundPlayed = true;
    }

    // === 简化版 VS 模块：手绘面板，左右分数 + 中间 VS ===
    // 挑战成功时：VS 模块（连带其上方标题图）整体上移 5px，高度 -3px
    const vsModuleY = py + 80 * s - (isWin ? 5 * s : 0);
    const vsModuleH = (isWin ? 69 : 72) * s;

    // 成功/失败标题图几何（先算，便于光芒动画在内容背后定位）
    const resultImgKey = isWin ? 'battle_pop_success' : 'battle_pop_fail';
    const resultImg = this.parent[resultImgKey];
    const resultImgLoaded = this.parent[resultImgKey + 'Loaded'];
    const titleAnim = Easing.fadeIn(elapsed, 60, 250, 6 * s);
    let titleH = 0, titleW = 0, titleX = 0, titleY = 0;
    if (resultImgLoaded && resultImg) {
      titleH = isWin ? 110 * s : 115 * s;
      titleW = titleH * (resultImg.width / resultImg.height);
      titleX = W / 2 - titleW / 2;
      titleY = vsModuleY - 10 * s - titleH - 30 * s + 10 * s + (isWin ? 10 * s : 0) + 10 * s + (!isWin ? -3 * s : 0) + titleAnim.yShift;
    }

    // 挑战成功光芒动画：绘制在弹窗内容（VS 模块/标题）背后
    if (isWin && resultImgLoaded && resultImg) {
      this._drawVictoryEffect(ctx, W / 2, titleY + titleH / 2, titleW, titleH, s, elapsed, titleAnim.alpha * closeAlpha);
    }

    const vsAnim = Easing.fadeIn(elapsed, 80, 250, 8 * s);
    ctx.save();
    ctx.globalAlpha = vsAnim.alpha * closeAlpha;
    ctx.translate(px + 10 * s, vsModuleY + vsAnim.yShift);
    this._drawSimpleVSModule(ctx, game, pw - 26 * s, 0, vsModuleH, s);
    ctx.restore();

    // === 成功/失败标题图（光芒已在背后绘制）===
    if (resultImgLoaded && resultImg) {
      ctx.save();
      ctx.globalAlpha = titleAnim.alpha * closeAlpha;
      ctx.drawImage(resultImg, titleX, titleY, titleW, titleH);
      ctx.restore();
    }

    // 胜利时显示 3 个按钮（含分享），失败/平局只显示重新挑战 + 回到首页
    const buttons = [];
    if (isWin) {
      buttons.push({
        key: 'Share',
        imgKey: 'battle_pop_share',
        label: '分享'
      });
    }
    buttons.push(
      { key: 'Restart', imgKey: 'battle_pop_restart', label: '重新挑战' },
      { key: 'Home', imgKey: 'battle_pop_backto_homepage', label: '回到首页' }
    );

    // === 底部按钮：宽度 +1px；成功时高度累计 +6px，失败/平局 +4px；整体再上移 3px；失败/平局时间距 +10px ===
    const baseBtnH = 64 * 0.8 * 0.8 * s;  // 原高度，用于计算宽度
    const btnH = baseBtnH + (isWin ? 6 : 4) * s;  // 成功弹窗按钮再高 2px
    const btnGap = buttons.length === 2 ? 27 * s : 7 * s;
    const btnY = py + ph - 10 * s - btnH - 5 * s - 3 * s;

    // 按图片原始宽高比计算宽度，基于原高度 baseBtnH，宽度额外 +1px
    let totalBtnW = 0;
    const buttonMetrics = buttons.map((btn) => {
      const img = this.parent[btn.imgKey];
      const loaded = this.parent[btn.imgKey + 'Loaded'];
      let btnW = baseBtnH + 1 * s;
      if (loaded && img && img.height > 0) {
        btnW = baseBtnH * (img.width / img.height) + 1 * s;
      }
      totalBtnW += btnW;
      return { ...btn, btnW };
    });
    totalBtnW += (buttons.length - 1) * btnGap;
    let currentX = px + (pw - totalBtnW) / 2;

    // 清除旧按钮区域
    this.battleMenuBtnRect = null;
    this.battleShareBtnRect = null;
    this.battleRestartBtnRect = null;
    this.battleHomeBtnRect = null;

    const btnAnim = Easing.fadeIn(elapsed, 180, 250, 10 * s);
    ctx.save();
    ctx.globalAlpha = btnAnim.alpha * closeAlpha;

    const pressSpeed = 0.4;

    buttonMetrics.forEach((btn) => {
      const bx = currentX;
      const img = this.parent[btn.imgKey];
      const loaded = this.parent[btn.imgKey + 'Loaded'];
      const pressed = game[`_battle${btn.key}BtnPressed`] || false;

      // 按钮按下动画：按下时向下偏移，松开后平滑恢复
      if (!this._btnPressAnims[btn.key]) this._btnPressAnims[btn.key] = { offset: 0 };
      const target = pressed ? 2 * s : 0;
      this._btnPressAnims[btn.key].offset += (target - this._btnPressAnims[btn.key].offset) * pressSpeed;
      if (Math.abs(this._btnPressAnims[btn.key].offset) < 0.1 * s) {
        this._btnPressAnims[btn.key].offset = 0;
      }
      const pressOffset = this._btnPressAnims[btn.key].offset;

      const btnW = btn.btnW;

      if (loaded && img) {
        ctx.drawImage(img, bx, btnY + pressOffset + btnAnim.yShift, btnW, btnH);
      } else {
        // 兜底：圆形按钮 + 文字
        ctx.save();
        const r = Math.min(btnW, btnH) / 2 - 2 * s;
        const cx = bx + btnW / 2;
        const cy = btnY + pressOffset + btnH / 2 + btnAnim.yShift;
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.fillStyle = COLORS.panelBg;
        ctx.fill();
        ctx.lineWidth = 1.5 * s;
        ctx.strokeStyle = COLORS.gold;
        ctx.stroke();
        ctx.font = `${Math.floor(11 * s)}px ${this.parent.titleFontFamily}`;
        ctx.fillStyle = COLORS.text;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(btn.label, cx, cy);
        ctx.restore();
      }

      this[`battle${btn.key}BtnRect`] = { x: bx, y: btnY + btnAnim.yShift, w: btnW, h: btnH };
      currentX += btnW + btnGap;
    });
    ctx.restore();

    // === 激励文案：固定在底部按钮上方；挑战成功时整体再上移 5px ===
    const promptY = btnY - 23 * s - (isWin ? 5 * s : 0);
    const promptAnim = Easing.fadeIn(elapsed, 120, 250, 8 * s);
    const promptLineY = promptY + promptAnim.yShift;

    ctx.save();
    ctx.globalAlpha = promptAnim.alpha * closeAlpha;
    ctx.font = `${Math.floor(14 * s)}px ${this.parent.titleFontFamily}`;
    ctx.fillStyle = COLORS.text;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    if (isWin) {
      // 胜利：荣誉杯图标 + "荣誉杯+1"（字色不变），整体稍大
      ctx.font = `${Math.floor(16 * s)}px ${this.parent.titleFontFamily}`;
      const winText = '荣誉杯+1';
      const winTextW = ctx.measureText(winText).width;
      const tIcon = this.battleHonorTrophyIcon;
      const hasTIcon = this.battleHonorTrophyIconLoaded && tIcon;
      const tIconH = 20 * s;
      const tIconW = hasTIcon ? tIconH * (tIcon.width / tIcon.height) : 0;
      const tGap = hasTIcon ? 4 * s : 0;
      const totalW = tIconW + tGap + winTextW;
      const startX = W / 2 - totalW / 2;
      if (hasTIcon) {
        ctx.drawImage(tIcon, startX, promptLineY - tIconH / 2, tIconW, tIconH);
      }
      ctx.textAlign = 'left';
      ctx.fillStyle = '#8B6914';
      ctx.fillText(winText, startX + tIconW + tGap, promptLineY);

      // 左右装饰线（score_line.png），夹住"图标+文案"整体
      if (this.parent.scoreLine && this.parent.scoreLineLoaded) {
        const scoreLineImg = this.parent.scoreLine;
        const lineH = 16 * s;
        const lineW = lineH * (scoreLineImg.width / scoreLineImg.height);
        const lineGap = 8 * s;
        ctx.drawImage(scoreLineImg, startX - lineGap - lineW, promptLineY - lineH / 2, lineW, lineH);
        ctx.save();
        ctx.translate(startX + totalW + lineGap + lineW, promptLineY - lineH / 2);
        ctx.scale(-1, 1);
        ctx.drawImage(scoreLineImg, 0, 0, lineW, lineH);
        ctx.restore();
      }
    } else {
      // 失败/平局：原激励文案 + 左右装饰线
      const promptText = isDraw ? '旗鼓相当,不分胜负!' : '很遗憾,你未能击败对手,再接再厉!';
      if (this.parent.scoreLine && this.parent.scoreLineLoaded) {
        const scoreLineImg = this.parent.scoreLine;
        const lineH = 16 * s;
        const lineW = lineH * (scoreLineImg.width / scoreLineImg.height);
        const lineGap = 8 * s;
        const promptTextWidth = ctx.measureText(promptText).width;
        ctx.drawImage(scoreLineImg, W / 2 - promptTextWidth / 2 - lineGap - lineW, promptLineY - lineH / 2, lineW, lineH);
        ctx.save();
        ctx.translate(W / 2 + promptTextWidth / 2 + lineGap + lineW, promptLineY - lineH / 2);
        ctx.scale(-1, 1);
        ctx.drawImage(scoreLineImg, 0, 0, lineW, lineH);
        ctx.restore();
      }
      ctx.fillText(promptText, W / 2, promptLineY);
    }
    ctx.restore();
  }

  // ===== 回到首页确认弹窗 =====
  _drawHomeConfirmPopup(ctx, game, W, H, s) {
    const pw = 260 * s;
    const ph = 230 * s;
    const px = (W - pw) / 2;
    const py = (H - ph) / 2;
    const r = 14 * s;
    const gold = '#c4a35a';

    if (!game._battleHomeConfirmAnimStart) {
      game._battleHomeConfirmAnimStart = Date.now();
    }
    const elapsed = Date.now() - game._battleHomeConfirmAnimStart;
    const enterProgress = Math.min(elapsed / 300, 1);
    const enterEase = Easing.easeOutBack(enterProgress);
    const drawPy = py + (1 - enterEase) * 25 * s;

    // 遮罩
    ctx.save();
    ctx.fillStyle = `rgba(0,0,0,${0.65 * enterEase})`;
    ctx.fillRect(0, 0, W, H);

    // 背景 + 金色边框
    this.parent.roundRect(px, drawPy, pw, ph, r, '#faf6ee', gold);

    // 内层细边框
    ctx.save();
    ctx.strokeStyle = gold;
    ctx.lineWidth = 1.5 * s;
    ctx.beginPath();
    const inset = 4 * s;
    const ix = px + inset, iy = drawPy + inset, iw = pw - inset * 2, ih = ph - inset * 2, ir = r - inset;
    ctx.moveTo(ix + ir, iy);
    ctx.lineTo(ix + iw - ir, iy);
    ctx.quadraticCurveTo(ix + iw, iy, ix + iw, iy + ir);
    ctx.lineTo(ix + iw, iy + ih - ir);
    ctx.quadraticCurveTo(ix + iw, iy + ih, ix + iw - ir, iy + ih);
    ctx.lineTo(ix + ir, iy + ih);
    ctx.quadraticCurveTo(ix, iy + ih, ix, iy + ih - ir);
    ctx.lineTo(ix, iy + ir);
    ctx.quadraticCurveTo(ix, iy, ix + ir, iy);
    ctx.closePath();
    ctx.stroke();
    ctx.restore();

    // 标题
    ctx.save();
    ctx.font = `bold ${Math.floor(22 * s)}px Georgia, serif`;
    ctx.fillStyle = '#1a2f4a';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('回到首页', W / 2, drawPy + 42 * s);
    ctx.restore();

    // 标题下装饰线
    const decoLineY = drawPy + 58 * s;
    ctx.save();
    ctx.strokeStyle = 'rgba(196,163,90,0.4)';
    ctx.lineWidth = 1 * s;
    const dlW = pw * 0.45;
    const dlX = px + (pw - dlW) / 2;
    ctx.beginPath();
    ctx.moveTo(dlX, decoLineY);
    ctx.lineTo(dlX + dlW, decoLineY);
    ctx.stroke();
    ctx.save();
    ctx.translate(W / 2, decoLineY);
    ctx.rotate(Math.PI / 4);
    ctx.fillStyle = gold;
    ctx.fillRect(-2.5 * s, -2.5 * s, 5 * s, 5 * s);
    ctx.restore();
    ctx.restore();

    // 中间文字
    const text = '对战模式下，回到首页将会立刻结束对战。';
    ctx.save();
    ctx.font = `${Math.floor(14 * s)}px ${this.parent.titleFontFamily}`;
    ctx.fillStyle = '#555';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const maxW = pw - 48 * s;
    const lineHeight = 20 * s;
    const lines = [];
    let line = '';
    for (let i = 0; i < text.length; i++) {
      const testLine = line + text[i];
      if (ctx.measureText(testLine).width > maxW && line !== '') {
        lines.push(line);
        line = text[i];
      } else {
        line = testLine;
      }
    }
    lines.push(line);
    const startY = drawPy + 100 * s - (lines.length - 1) * lineHeight / 2;
    lines.forEach((l, i) => {
      ctx.fillText(l, W / 2, startY + i * lineHeight);
    });
    ctx.restore();

    // 底部两个按钮：取消 / 确认
    const btnW = 108 * s;
    const btnH = 42 * s;
    const btnGap = 18 * s;
    const totalW = btnW * 2 + btnGap;
    const btnY = drawPy + ph - btnH - 30 * s;
    const cancelX = (W - totalW) / 2;
    const confirmX = cancelX + btnW + btnGap;

    // 取消按钮（灰色）
    const cancelPressed = game._battleHomeConfirmCancelPressed || false;
    const cancelOffset = cancelPressed ? 2 * s : 0;
    this.parent.roundRect(cancelX, btnY + cancelOffset, btnW, btnH, 8 * s, '#9e9e9e', '#7a7a7a', 1.5 * s);
    ctx.save();
    ctx.font = `bold ${Math.floor(15 * s)}px sans-serif`;
    ctx.fillStyle = '#fff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('取消', cancelX + btnW / 2, btnY + cancelOffset + btnH / 2);
    ctx.restore();

    // 确认按钮
    const confirmPressed = game._battleHomeConfirmOkPressed || false;
    const confirmOffset = confirmPressed ? 2 * s : 0;
    this.parent.roundRect(confirmX, btnY + confirmOffset, btnW, btnH, 8 * s, '#c4a35a');
    ctx.save();
    ctx.font = `bold ${Math.floor(15 * s)}px sans-serif`;
    ctx.fillStyle = '#fff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('确认', confirmX + btnW / 2, btnY + confirmOffset + btnH / 2);
    ctx.restore();

    this.battleHomeConfirmCancelRect = { x: cancelX, y: btnY, w: btnW, h: btnH };
    this.battleHomeConfirmOkRect = { x: confirmX, y: btnY, w: btnW, h: btnH };
    ctx.restore();
  }

  // ===== 房间已结束弹窗（对方退出） =====
  _drawRoomClosedPopup(ctx, game, W, H, s) {
    const pw = 260 * s;
    const ph = 230 * s;
    const px = (W - pw) / 2;
    const py = (H - ph) / 2;
    const r = 14 * s;
    const gold = '#c4a35a';

    if (!game._battleRoomClosedAnimStart) {
      game._battleRoomClosedAnimStart = Date.now();
    }
    const elapsed = Date.now() - game._battleRoomClosedAnimStart;
    const enterProgress = Math.min(elapsed / 300, 1);
    const enterEase = Easing.easeOutBack(enterProgress);
    const drawPy = py + (1 - enterEase) * 25 * s;

    // 遮罩
    ctx.save();
    ctx.fillStyle = `rgba(0,0,0,${0.65 * enterEase})`;
    ctx.fillRect(0, 0, W, H);

    // 背景 + 金色边框
    this.parent.roundRect(px, drawPy, pw, ph, r, '#faf6ee', gold);

    // 内层细边框
    ctx.save();
    ctx.strokeStyle = gold;
    ctx.lineWidth = 1.5 * s;
    ctx.beginPath();
    const inset = 4 * s;
    const ix = px + inset, iy = drawPy + inset, iw = pw - inset * 2, ih = ph - inset * 2, ir = r - inset;
    ctx.moveTo(ix + ir, iy);
    ctx.lineTo(ix + iw - ir, iy);
    ctx.quadraticCurveTo(ix + iw, iy, ix + iw, iy + ir);
    ctx.lineTo(ix + iw, iy + ih - ir);
    ctx.quadraticCurveTo(ix + iw, iy + ih, ix + iw - ir, iy + ih);
    ctx.lineTo(ix + ir, iy + ih);
    ctx.quadraticCurveTo(ix, iy + ih, ix, iy + ih - ir);
    ctx.lineTo(ix, iy + ir);
    ctx.quadraticCurveTo(ix, iy, ix + ir, iy);
    ctx.closePath();
    ctx.stroke();
    ctx.restore();

    // 标题
    ctx.save();
    ctx.font = `bold ${Math.floor(22 * s)}px Georgia, serif`;
    ctx.fillStyle = '#1a2f4a';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('对战结束', W / 2, drawPy + 42 * s);
    ctx.restore();

    // 标题下装饰线
    const decoLineY = drawPy + 58 * s;
    ctx.save();
    ctx.strokeStyle = 'rgba(196,163,90,0.4)';
    ctx.lineWidth = 1 * s;
    const dlW = pw * 0.45;
    const dlX = px + (pw - dlW) / 2;
    ctx.beginPath();
    ctx.moveTo(dlX, decoLineY);
    ctx.lineTo(dlX + dlW, decoLineY);
    ctx.stroke();
    ctx.save();
    ctx.translate(W / 2, decoLineY);
    ctx.rotate(Math.PI / 4);
    ctx.fillStyle = gold;
    ctx.fillRect(-2.5 * s, -2.5 * s, 5 * s, 5 * s);
    ctx.restore();
    ctx.restore();

    // 中间文字
    const text = '好友已退出房间，对战结束';
    ctx.save();
    ctx.font = `${Math.floor(14 * s)}px ${this.parent.titleFontFamily}`;
    ctx.fillStyle = '#555';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const maxW = pw - 48 * s;
    const lineHeight = 20 * s;
    const lines = [];
    let line = '';
    for (let i = 0; i < text.length; i++) {
      const testLine = line + text[i];
      if (ctx.measureText(testLine).width > maxW && line !== '') {
        lines.push(line);
        line = text[i];
      } else {
        line = testLine;
      }
    }
    lines.push(line);
    const startY = drawPy + 100 * s - (lines.length - 1) * lineHeight / 2;
    lines.forEach((l, i) => {
      ctx.fillText(l, W / 2, startY + i * lineHeight);
    });
    ctx.restore();

    // 底部退出对战按钮
    const btnW = 200 * s;
    const btnH = 42 * s;
    const btnX = (W - btnW) / 2;
    const btnY = drawPy + ph - btnH - 34 * s;
    const pressed = game._battleRoomClosedOkPressed || false;
    const offset = pressed ? 2 * s : 0;
    this.parent.roundRect(btnX, btnY + offset, btnW, btnH, 8 * s, '#c4a35a');
    ctx.save();
    ctx.font = `bold ${Math.floor(15 * s)}px sans-serif`;
    ctx.fillStyle = '#fff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('退出对战', btnX + btnW / 2, btnY + offset + btnH / 2);
    ctx.restore();

    this.battleRoomClosedOkRect = { x: btnX, y: btnY, w: btnW, h: btnH };
    ctx.restore();
  }
}

module.exports = { BattleRenderer };
