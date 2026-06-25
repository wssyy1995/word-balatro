// ===== 对战模式渲染器 =====
const { LETTER_SCORE } = require('../data');
const { Easing } = require('../animation');

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
    this.battleMenuBtnRect = null;
    this.battlePanelLeft = null;
    this.battlePanelRight = null;
    this._lastBotStatusText = null;
    this._lastBotStatusTextOffset = 0;
    this._lastPlayerStatusText = null;
    this._lastPlayerStatusTextOffset = 0;

    // 加载分数进度条闪电图标（本地资源，不走云存储）
    this.battleProgressIcon = null;
    this.battleProgressIconLoaded = false;
    this._loadBattleProgressIcon();

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

  _loadBattleProgressIcon() {
    try {
      const img = wx.createImage();
      img.src = 'images/battle_progress_icon.png';
      img.onload = () => { this.battleProgressIconLoaded = true; };
      img.onerror = () => { this.battleProgressIconLoaded = false; };
      this.battleProgressIcon = img;
    } catch (e) {
      this.battleProgressIconLoaded = false;
    }
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

  draw(ctx, game, W, H, s) {
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
    const panelsY = promptY + 24 * s;
    const panelH = 96 * s;
    this._drawPlayerPanels(ctx, game, W, panelsY, panelH, s);

    // === 单词预览区 ===
    const previewY = panelsY + panelH + 28 * s + 5 * s;
    this._drawPreview(ctx, game, W, previewY, s);

    // === 手牌 ===
    const handY = previewY + 54 * s + 10 * s;
    const handBottom = this._drawHand(ctx, game, handY, W, s);

    // === 底部按钮 ===
    const btnY = Math.min(handBottom + 18 * s, H - safeBottom - 68 * s) + 10 * s;
    this._drawBottomButtons(ctx, game, W, btnY, s);

    // === Reveal 动画触发与绘制 ===
    this._updateBattleRevealAnimation(game, s);
    this._drawBattleFlyingScore(ctx, s, game);

    // === 对战结束弹窗 ===
    if (game.battlePhase === 'battle_end') {
      this._drawEndPopup(ctx, game, W, H, s);
    }

    // === 对战匹配弹窗 ===
    this._drawBattleMatchPopup(ctx, game, W, H, s);
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
    if (!anim) return;

    const now = Date.now();
    let elapsed = now - anim.startTime;
    const POP_DURATION = 600;

    // 阶段转换：matching -> matched
    if (anim.phase === 'matching' && elapsed >= anim.matchDuration) {
      anim.phase = 'matched';
      anim.matchedTime = now;
      anim.opponent = this._generateRandomOpponent();
      game._battleOpponent = anim.opponent;
      elapsed = 0;
    }

    // 阶段转换：matched -> 结束，开始正式对局（匹配成功后显示 1 秒）
    if (anim.phase === 'matched' && anim.matchedTime && now - anim.matchedTime >= 1000) {
      game._battleMatchAnim = null;
      if (game.battleManager) game.battleManager.finishMatchSetup();
      return;
    }

    // 计算弹窗整体缩放（仅匹配中阶段有果冻弹出，匹配成功后保持）
    let panelScale = 1;
    if (anim.phase === 'matching') {
      if (elapsed < POP_DURATION) {
        panelScale = Easing.easeOutBackStrong(elapsed / POP_DURATION);
      }
    }

    // 黑色背景蒙层（前 400ms 从 0 淡入到 0.65）
    const overlayAlpha = anim.phase === 'matching'
      ? Math.min(0.65, elapsed / 400 * 0.65)
      : 0.65;
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
    ctx.translate(cx, cy);
    ctx.scale(panelScale, panelScale);
    ctx.translate(-cx, -cy);

    // 绘制底图
    ctx.drawImage(matchImg, matchX, matchY, matchW, matchH);

    // 标题区域
    const titleY = matchY + 34 * s;
    const titleFont = this.parent.titleFontFamily || 'sans-serif';

    if (anim.phase === 'matching') {
      // 主标题：对手匹配中
      ctx.save();
      ctx.font = `bold ${Math.floor(18 * s)}px ${titleFont}`;
      ctx.fillStyle = '#3a2e1e';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('对手匹配中', cx, titleY);
      ctx.restore();

      // 副标题
      ctx.save();
      ctx.font = `${Math.floor(12 * s)}px ${titleFont}`;
      ctx.fillStyle = '#8a7a6a';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('正在为你寻找实力相当的对手...', cx, titleY + 22 * s);
      ctx.restore();

      // 剑图标与呼吸光圈
      if (swordLoaded && swordImg) {
        let swordW = matchW * 0.4;
        let swordH = swordW * (swordImg.height / swordImg.width);
        const maxSwordH = matchH * 0.36;
        if (swordH > maxSwordH) {
          swordH = maxSwordH;
          swordW = swordH * (swordImg.width / swordImg.height);
        }
        const swordX = cx - swordW / 2;
        const swordY = matchY + matchH * 0.5 - 20 * s;

        // 单个金色呼吸光圈（边缘柔化发光）
        const swordCX = cx;
        const swordCY = swordY + swordH / 2;
        const ringR = Math.max(swordW, swordH) * 0.65;
        const breath = 0.5 + 0.5 * Math.sin(now / 700);
        const alpha = 0.25 + breath * 0.35;

        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.strokeStyle = '#ffdf80';
        ctx.lineWidth = 2.5 * s;
        ctx.shadowColor = 'rgba(255, 215, 0, 0.9)';
        ctx.shadowBlur = 18 * s;
        ctx.beginPath();
        ctx.arc(swordCX, swordCY, ringR, 0, Math.PI * 2);
        ctx.stroke();
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
      ctx.translate(cx, titleY);
      ctx.scale(titleScale, titleScale);
      ctx.font = `bold ${Math.floor(20 * s)}px ${titleFont}`;
      ctx.fillStyle = '#8b6914';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('匹配成功！', 0, 0);
      ctx.restore();

      // 对手头像
      const avatarR = 32 * s;
      const avatarY = matchY + matchH * 0.48;
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
          // 源头像区域向内裁剪 10% 直径（去掉边缘留白），再拉伸铺满显示圆
          const srcMargin = a.sw * 0.05;
          const srcX = a.sx + srcMargin;
          const srcY = a.sy + srcMargin;
          const srcW = a.sw * 0.9;
          const srcH = a.sh * 0.9;
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
      ctx.fillStyle = '#3a2e1e';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(opponent.name, cx, avatarY + avatarR + 16 * s);
      ctx.restore();
    }

    ctx.restore();
  }

  // ===== 顶部栏：top_home 返回主页 =====
  _drawTopBar(ctx, game, W, topY, s) {
    const btnSize = 34 * s;
    const iconX = 15 * s + 5 * s;
    const iconY = topY + 5 * s;

    // top_home 主页图标（从云存储 bg_icon/top_home.png 注入到 parent.topIcon）
    if (this.parent.topIcon && this.parent.topIconLoaded) {
      ctx.drawImage(this.parent.topIcon, iconX, iconY, btnSize, btnSize);
    } else {
      // 兜底：圆形 + 房子图标
      const cx = iconX + btnSize / 2;
      const cy = iconY + btnSize / 2;
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

    ctx.font = `bold ${Math.floor(16 * s)}px ${this.parent.titleFontFamily}`;
    ctx.fillStyle = COLORS.text;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(`第 ${game.battleRound} / ${game.battleTotalRounds} 轮`, badgeCX, badgeCY);
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
  _drawAvatarRow(ctx, game, W, y, rowH, s) {
    const margin = W * 0.025;
    const x = margin;
    const w = W - margin * 2;  // 占屏幕宽度 95%
    const h = rowH;
    const cx = x + w / 2;
    const cy = y + h / 2;

    ctx.save();
    if (this.parent.battlePlayer && this.parent.battlePlayerLoaded) {
      // 使用 battle_player.png 作为对战条背景，宽度占满 95%，高度按比例，向下移动 2*s
      const img = this.parent.battlePlayer;
      const imgAspect = img.width / img.height;
      const drawW = w;
      const drawH = drawW / imgAspect;
      const drawX = x;
      const drawY = y + (h - drawH) / 2 + 5 * s;
      ctx.drawImage(img, drawX, drawY, drawW, drawH);
    } else {
      // 兜底：简单背景条
      this.parent.roundRect(x, y + 5 * s, w, h, 10 * s, '#e0d4c0', COLORS.gold, 1.5 * s);
    }
    ctx.restore();

    // 头像半径（双方统一）
    const avatarR = 26 * s;

    // 左侧对手头像（覆盖图片默认头像）
    const leftAvatarCX = x + 37 * s;
    const leftAvatarCY = cy + 5 * s;
    const opponent = game._battleOpponent;
    if (opponent && opponent.avatar && opponent.avatar.loaded) {
      ctx.save();
      ctx.beginPath();
      ctx.arc(leftAvatarCX, leftAvatarCY, avatarR, 0, Math.PI * 2);
      ctx.clip();
      const a = opponent.avatar;
      if (a.type === 'sheet') {
        // 源头像区域向内裁剪 10% 直径，铺满显示圆
        const srcMargin = a.sw * 0.05;
        const srcX = a.sx + srcMargin;
        const srcY = a.sy + srcMargin;
        const srcW = a.sw * 0.9;
        const srcH = a.sh * 0.9;
        ctx.drawImage(a.img, srcX, srcY, srcW, srcH, leftAvatarCX - avatarR, leftAvatarCY - avatarR, avatarR * 2, avatarR * 2);
      } else {
        ctx.drawImage(a.img, leftAvatarCX - avatarR, leftAvatarCY - avatarR, avatarR * 2, avatarR * 2);
      }
      ctx.restore();
    } else {
      this._drawAvatar(ctx, leftAvatarCX, leftAvatarCY, avatarR, s, COLORS.blueHeader);
    }

    // 右侧用户头像（覆盖图片默认头像）
    const rightAvatarCX = x + w - 37 * s;
    const rightAvatarCY = cy + 5 * s;
    if (this.selfAvatarImg && this.selfAvatarLoaded) {
      ctx.save();
      ctx.beginPath();
      ctx.arc(rightAvatarCX, rightAvatarCY, avatarR, 0, Math.PI * 2);
      ctx.clip();
      ctx.drawImage(this.selfAvatarImg, rightAvatarCX - avatarR, rightAvatarCY - avatarR, avatarR * 2, avatarR * 2);
      ctx.restore();
    } else {
      this._drawAvatar(ctx, rightAvatarCX, rightAvatarCY, avatarR, s, COLORS.greenHeader);
    }

    const now = Date.now();

    // 中间 VS 徽章
    if (this.parent.battleVS && this.parent.battleVSLoaded) {
      const vsImg = this.parent.battleVS;
      const vsSize = 46 * s;
      const vsX = cx - vsSize / 2;
      const vsY = cy + 5 * s - vsSize / 2;
      ctx.drawImage(vsImg, vsX, vsY, vsSize, vsSize);

      // 分数缩放结束后的金光闪烁
      const flashState = this._getVSFlashState(game, now);
      if (flashState.alpha > 0) {
        const centerX = cx;
        const centerY = cy + 5 * s;
        const glowR = vsSize / 2 + 4 * s;
        const ringR = vsSize / 2 + 2 * s;

        // 外圈光晕
        ctx.save();
        ctx.globalAlpha = flashState.alpha * 0.5;
        const glowGrad = ctx.createRadialGradient(
          centerX, centerY, vsSize / 2,
          centerX, centerY, glowR + 6 * s
        );
        glowGrad.addColorStop(0, 'rgba(255, 215, 0, 0.6)');
        glowGrad.addColorStop(1, 'rgba(255, 215, 0, 0)');
        ctx.fillStyle = glowGrad;
        ctx.beginPath();
        ctx.arc(centerX, centerY, glowR + 6 * s, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();

        // 金色圆环
        ctx.save();
        ctx.globalAlpha = flashState.alpha;
        ctx.strokeStyle = '#fff5b3';
        ctx.lineWidth = 2.5 * s;
        ctx.beginPath();
        ctx.arc(centerX, centerY, ringR, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();

        // 金色小星星闪烁
        const starRadius = vsSize / 2 + 12 * s;
        const starSize = 4 * s;
        const elapsed = flashState.elapsed;
        const starPositions = [
          { angle: Math.PI / 4, phase: 0 },
          { angle: Math.PI * 3 / 4, phase: Math.PI / 3 },
          { angle: Math.PI * 5 / 4, phase: Math.PI * 2 / 3 },
          { angle: Math.PI * 7 / 4, phase: Math.PI },
        ];
        starPositions.forEach(pos => {
          const sx = centerX + Math.cos(pos.angle) * starRadius;
          const sy = centerY + Math.sin(pos.angle) * starRadius;
          const twinkle = 0.5 + 0.5 * Math.sin(elapsed * 0.012 + pos.phase);
          ctx.save();
          ctx.globalAlpha = flashState.alpha * twinkle;
          ctx.fillStyle = '#fff5b3';
          this._drawSparkle(ctx, sx, sy, starSize);
          ctx.restore();
        });
      }
    }

    // 名称 + 分数（保留在原位置）
    const leftScore = game.battleBotScore || 0;
    const rightScore = game.battlePlayerScore || 0;
    const leftTextX = x + 70 * s ;
    const rightTextX = x + w - 70 * s;
    const nameY = cy - 6 * s;
    const scoreY = cy + 14 * s;

    const scoreScale = this._getBattleScoreScale(game, now);

    ctx.save();
    ctx.font = `bold ${Math.floor(15 * s)}px ${this.parent.titleFontFamily}`;
    ctx.fillStyle = COLORS.blueHeader;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    const opponentName = game._battleOpponent && game._battleOpponent.name ? game._battleOpponent.name : '玩家A';
    ctx.fillText(opponentName, leftTextX, nameY);

    ctx.save();
    ctx.translate(leftTextX, scoreY);
    ctx.scale(scoreScale, scoreScale);
    ctx.font = `bold ${Math.floor(13 * s)}px ${this.parent.titleFontFamily}`;
    ctx.fillStyle = COLORS.blueHeader;
    ctx.fillText(`${leftScore}分`, 0, 0);
    ctx.restore();

    ctx.textAlign = 'right';
    ctx.font = `bold ${Math.floor(15 * s)}px ${this.parent.titleFontFamily}`;
    ctx.fillStyle = COLORS.greenHeader;
    ctx.fillText('我', rightTextX, nameY);

    ctx.save();
    ctx.translate(rightTextX, scoreY);
    ctx.scale(scoreScale, scoreScale);
    ctx.font = `bold ${Math.floor(13 * s)}px ${this.parent.titleFontFamily}`;
    ctx.fillStyle = COLORS.greenHeader;
    ctx.fillText(`${rightScore}分`, 0, 0);
    ctx.restore();

    ctx.restore();

    // 分数对比进度条
    this._drawScoreProgressBar(ctx, game, x, y + h, w, s);
  }

  // ===== 分数对比进度条（VS 模块下方） =====
  _drawScoreProgressBar(ctx, game, x, y, w, s) {
    const progressH = 12 * s;
    const progressY = y + 17 * s ;
    const progressR = progressH / 2;
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
      const botScore = game.battleBotScore || 0;
      const playerScore = game.battlePlayerScore || 0;
      const total = botScore + playerScore;
      botRatio = total > 0 ? botScore / total : 0.5;
    }
    const botWidth = w * botRatio;

    ctx.save();

    // 外框背景
    this.parent.roundRect(x, progressY, w, progressH, progressR, '#e8dcc0', '#c4a35a', 1.5 * s);

    // 用外框路径 clip，确保蓝绿填充只在圆角矩形内
    this.parent._roundedRectPath(ctx, x, progressY, w, progressH, progressR);
    ctx.clip();

    // 左侧蓝色（对手）
    ctx.fillStyle = '#4a6aa0';
    ctx.fillRect(x, progressY, botWidth, progressH);

    // 右侧绿色（我）
    ctx.fillStyle = '#5a8a5a';
    ctx.fillRect(x + botWidth, progressY, w - botWidth, progressH);

    ctx.restore();

    // 中间金色闪电图标（等比例缩放，保持原始长宽比）
    if (this.battleProgressIcon && this.battleProgressIconLoaded) {
      const iconH = 24 * s;
      const iconW = iconH * (this.battleProgressIcon.width / this.battleProgressIcon.height);
      let iconX = x + botWidth - iconW / 2;
      iconX = Math.max(x, Math.min(iconX, x + w - iconW));
      const iconY = progressY + (progressH - iconH) / 2;
      ctx.drawImage(this.battleProgressIcon, iconX, iconY, iconW, iconH);
    }
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

  // ===== 左右玩家面板（仅显示状态和本轮单词） =====
  _drawPlayerPanels(ctx, game, W, y, panelH, s) {
    const margin = 14 * s;
    const gap = 12 * s;
    const panelW = (W - margin * 2 - gap) / 2;
    const x1 = margin;
    const x2 = margin + panelW + gap;

    // 记录面板位置，供飞行动画使用
    const tilesY = y + 70 * s;
    this.battlePanelLeft = { x: x1, y, w: panelW, h: panelH, centerX: x1 + panelW / 2, tilesY };
    this.battlePanelRight = { x: x2, y, w: panelW, h: panelH, centerX: x2 + panelW / 2, tilesY };

    this._drawPlayerPanel(ctx, game, x1, y, panelW, panelH, s, 'left');
    this._drawPlayerPanel(ctx, game, x2, y, panelW, panelH, s, 'right');
  }

  _drawPlayerPanel(ctx, game, x, y, w, h, s, side) {
    const isLeft = side === 'left';
    const tabW = w * 0.72;
    const tabH = 24 * s;
    const tabX = x + (w - tabW) / 2;
    const tabY = y;
    const headerColor = isLeft ? COLORS.blueHeader : COLORS.greenHeader;

    // 面板主体
    ctx.save();
    const bodyY = tabY + tabH - 4 * s;
    const bodyH = h - tabH + 4 * s;
    const corner = 10 * s;

    // 切角多边形路径
    ctx.beginPath();
    ctx.moveTo(x + corner, bodyY);
    ctx.lineTo(x + w - corner, bodyY);
    ctx.lineTo(x + w, bodyY + corner);
    ctx.lineTo(x + w, bodyY + bodyH - corner);
    ctx.lineTo(x + w - corner, bodyY + bodyH);
    ctx.lineTo(x + corner, bodyY + bodyH);
    ctx.lineTo(x, bodyY + bodyH - corner);
    ctx.lineTo(x, bodyY + corner);
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

    // 顶部名称标签
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
    ctx.fillText(isLeft ? '玩家A' : '玩家B', tabX + tabW / 2, tabY + tabH / 2 + 1 * s);
    ctx.restore();

    // 状态文本 / 单词牌
    const centerX = x + w / 2;
    const statusY = y + 46 * s;
    const tilesY = y + 70 * s - 7 * s;

    let statusText = '';
    let wordText = null;
    let hidden = false;
    let botRevealProgress = -1; // -1 表示不使用翻转动画

    const timeline = game._battleAnimTimeline;
    const now = Date.now();

    if (isLeft) {
      // 对手
      if (game.battlePhase === 'selecting') {
        if (game.battleBotReady) {
          statusText = '✓ 对手已选择';
          const len = game.battleBotWordLength || 0;
          wordText = '?'.repeat(len);
          hidden = true;
        } else {
          statusText = '对手选择中...';
        }
      } else {
        // revealing 阶段不再显示固定 +x 分文字，只保留飞行计分
        statusText = '';
        if (timeline && !timeline.botWordTriggered) {
          // 单词动画尚未开始，仍显示 ? 方块
          const len = game.battleBotWordLength || 0;
          wordText = '?'.repeat(len);
          hidden = true;
        } else if (timeline) {
          // 单词正在揭示或已揭示
          wordText = game.battleBotWord;
          hidden = false;
          const elapsed = now - timeline.botWordStart;
          botRevealProgress = Math.min(elapsed / 500, 1);
        } else {
          // 无动画时间线兜底：直接显示单词
          wordText = game.battleBotWord;
          hidden = false;
        }
      }
    } else {
      // 我
      if (game.battlePhase === 'selecting') {
        statusText = '请出牌';
      } else {
        // revealing 阶段不再显示固定 +x 分文字，只保留飞行计分
        statusText = '';
        wordText = game.battlePlayerWord;
        hidden = false;
      }
    }

    // 状态文本颜色与位移动画
    const isGrayStatus = statusText === '对手选择中...' || statusText === '请出牌';
    const targetOffsetY = isGrayStatus ? 9 * s : 0;

    const lastKey = isLeft ? '_lastBotStatusText' : '_lastPlayerStatusText';
    const offsetKey = lastKey + 'Offset';
    const changeKey = isLeft ? '_battleBotStatusChange' : '_battlePlayerStatusChange';
    const lastStatusText = this[lastKey];

    if (statusText !== lastStatusText) {
      this[lastKey] = statusText;
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
      ctx.font = isGrayStatus
        ? `${Math.floor(13 * s)}px ${this.parent.titleFontFamily}`
        : `bold ${Math.floor(13 * s)}px ${this.parent.titleFontFamily}`;
      ctx.textAlign = 'center';
      ctx.fillText(statusText, centerX, drawY);
    }
    ctx.restore();

    if (wordText && wordText.length > 0) {
      if (botRevealProgress >= 0) {
        this._drawWordTilesReveal(ctx, centerX, tilesY, wordText, botRevealProgress, w - 16 * s, s);
      } else {
        const popProgress = (isLeft && hidden && game._battleBotReadyAnimStart)
          ? Math.min((Date.now() - game._battleBotReadyAnimStart) / 400, 1)
          : -1;
        this._drawWordTiles(ctx, centerX, tilesY, wordText, hidden, w - 16 * s, s, popProgress);
      }
    }
  }

  // ===== 单词字母块（面板内） =====
  // popProgress: 仅对 hidden 方块有效，0~1 时执行从下往上果冻弹出动画
  _drawWordTiles(ctx, centerX, y, text, hidden, maxW, s, popProgress = -1) {
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
        // 对手隐藏方块：浅蓝半透明填充 + 蓝色边框
        this.parent.roundRect(-tileW / 2, -tileW / 2, tileW, tileW, 4 * s, COLORS.hiddenTileBlue, COLORS.hiddenTileBlueBorder, 1.5 * s);
      } else {
        this.parent.roundRect(-tileW / 2, -tileW / 2, tileW, tileW, 4 * s, COLORS.panelBg, COLORS.tileStroke, 1.5 * s);
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

  // ===== 单词字母块从下往上果冻感弹出动画 =====
  _drawWordTilesReveal(ctx, centerX, y, word, progress, maxW, s) {
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
      this.parent.roundRect(-tileW / 2, -tileW / 2, tileW, tileW, 4 * s, COLORS.panelBg, COLORS.tileStroke, 1.5 * s);
      ctx.font = `bold ${Math.floor(tileW * 0.55)}px Georgia, serif`;
      ctx.fillStyle = COLORS.text;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(word[i].toUpperCase(), 0, 0);
      ctx.restore();
    }
  }

  // ===== 中间提示语 =====
  _drawCenterPrompt(ctx, W, y, s) {
    this._drawDecoratedText(ctx, W, y, s, '请选择字母，组成单词并提交');
  }

  // ===== Reveal 阶段动画触发 =====
  _updateBattleRevealAnimation(game, s) {
    const timeline = game._battleAnimTimeline;
    if (!timeline || game.battlePhase !== 'revealing') return;

    const now = Date.now();
    if (!game._battleFlyingScores) game._battleFlyingScores = [];

    // 触发玩家B（我）的分数飞行动画
    if (!timeline.playerScoreTriggered && now >= timeline.playerScoreStart) {
      timeline.playerScoreTriggered = true;
      const panel = this.battlePanelRight;
      if (panel) {
        game._battleFlyingScores.push({
          value: game.battlePlayerRoundScore || 0,
          side: 'player',
          startX: panel.centerX,
          startY: panel.tilesY - 12 * s - 9 * s,
          startTime: now,
        });
        if (game.audioManager) game.audioManager.play('word_score');
      }
    }

    // 触发玩家A（对手）单词揭示
    if (!timeline.botWordTriggered && now >= timeline.botWordStart) {
      timeline.botWordTriggered = true;
    }

    // 触发玩家A（对手）的分数飞行动画
    if (!timeline.botScoreTriggered && now >= timeline.botScoreStart) {
      timeline.botScoreTriggered = true;
      const panel = this.battlePanelLeft;
      if (panel) {
        game._battleFlyingScores.push({
          value: game.battleBotRoundScore || 0,
          side: 'bot',
          startX: panel.centerX,
          startY: panel.tilesY - 12 * s - 9 * s,
          startTime: now,
        });
        if (game.audioManager) game.audioManager.play('word_score');
      }
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
    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.fillRect(0, 0, W, H);
    ctx.restore();

    const panelW = 300 * s;
    const panelH = 320 * s;
    const px = (W - panelW) / 2;
    const py = (H - panelH) / 2;

    ctx.save();
    this.parent.roundRect(px, py, panelW, panelH, 12 * s, COLORS.panelBg, COLORS.gold, 2 * s);
    ctx.restore();

    const playerScore = game.battlePlayerScore || 0;
    const botScore = game.battleBotScore || 0;
    const isWin = playerScore > botScore;
    const isDraw = playerScore === botScore;
    const resultText = isWin ? '胜利!' : (isDraw ? '平局!' : '失败!');
    const resultColor = isWin ? '#4ade80' : (isDraw ? COLORS.gold : '#f87171');

    ctx.font = `bold ${Math.floor(26 * s)}px ${this.parent.titleFontFamily}`;
    ctx.fillStyle = resultColor;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillText(resultText, W / 2, py + 24 * s);

    ctx.font = `bold ${Math.floor(32 * s)}px ${this.parent.titleFontFamily}`;
    ctx.fillStyle = COLORS.text;
    ctx.fillText(`${playerScore} : ${botScore}`, W / 2, py + 70 * s);

    ctx.font = `bold ${Math.floor(13 * s)}px ${this.parent.titleFontFamily}`;
    ctx.fillStyle = 'rgba(90,62,31,0.5)';
    ctx.fillText('各轮得分', W / 2, py + 120 * s);

    let detailY = py + 144 * s;
    for (let i = 0; i < game.battleTotalRounds; i++) {
      const pScore = game.battlePlayerRoundScores[i] || 0;
      const bScore = game.battleBotRoundScores[i] || 0;
      ctx.font = `bold ${Math.floor(11 * s)}px ${this.parent.titleFontFamily}`;
      ctx.fillStyle = 'rgba(90,62,31,0.6)';
      ctx.fillText(`第${i + 1}轮: 我${pScore} - 对手${bScore}`, W / 2, detailY);
      detailY += 18 * s;
    }

    const btnW = 140 * s;
    const btnH = 44 * s;
    const btnX = (W - btnW) / 2;
    const btnY = py + panelH - btnH - 24 * s;
    this._drawBtn(ctx, '返回菜单', btnX, btnY, btnW, btnH, s, game._battleMenuBtnPressed || false, COLORS.gold, COLORS.text);
    this.battleMenuBtnRect = { x: btnX, y: btnY, w: btnW, h: btnH };
  }
}

module.exports = { BattleRenderer };
