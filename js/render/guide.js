const { Easing } = require('../animation');

module.exports = function extendGuide(Renderer) {

    // 绘制引导对话框左上角名字标签
    Renderer.prototype._drawGuideNameTag = function(ctx, dialogDrawX, dialogDrawY, s) {
      const tagH = 36 * s;
      const tagW = tagH * (100 / 40); // name_tag.png 原始尺寸 100x40
      const tagX = dialogDrawX + 14 * s;
      const tagY = dialogDrawY - tagH / 2 - 2 * s;
      ctx.save();
      if (this.nameTagLoaded && this.nameTagImage) {
        ctx.drawImage(this.nameTagImage, tagX, tagY, tagW, tagH);
      } else {
        // 兜底：金色圆角标签 + 文字
        const witchNameTag = '小女巫';
        const tagFontSize = Math.floor(12 * s);
        ctx.font = `bold ${tagFontSize}px sans-serif`;
        const tagTextW = ctx.measureText(witchNameTag).width;
        const tagPadX = 8 * s;
        const tagPadY = 3 * s;
        const fallbackW = tagTextW + tagPadX * 2;
        const fallbackH = tagFontSize + tagPadY * 2;
        const fallbackX = tagX;
        const fallbackY = tagY + (tagH - fallbackH) / 2;
        this.roundRect(fallbackX, fallbackY, fallbackW, fallbackH, fallbackH / 2, '#c4a35a', '#c4a35a', 0);
        ctx.fillStyle = '#fff';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(witchNameTag, fallbackX + fallbackW / 2, fallbackY + fallbackH / 2);
      }
      ctx.restore();
    };

    Renderer.prototype._drawGuideOverlay = function(game) {
      const ctx = this.ctx;
      const W = this.W;
      const H = this.H;
      const s = this.scale;
      const phase = game.guidePhase;
  
      const PHASE_TEXTS = [
        '',
        '从这些字母牌中选择字母，拼出一个单词，积攒分数通关！',
        '送你一张女巫牌，这是很强大的道具卡牌，可以大大提高单词的分数，快去试试！'
      ];
  
      // === 布局：女巫在左侧（字母卡牌区域上方），对话框在右侧（不与女巫重叠） ===
      const imgW = 130 * s;
      const imgH = imgW * (220 / 180); // 保持引导图原始宽高比
  
      // 字母卡牌区域（女巫到位后的高亮目标），取当前手牌网格的包围盒
      let cardZone;
      if (this.cardRects && this.cardRects.length) {
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        this.cardRects.forEach(r => {
          if (r.x < minX) minX = r.x;
          if (r.y < minY) minY = r.y;
          if (r.x + r.w > maxX) maxX = r.x + r.w;
          if (r.y + r.h > maxY) maxY = r.y + r.h;
        });
        cardZone = { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
      } else {
        cardZone = { x: 40 * s, y: H * 0.45, w: W - 80 * s, h: H * 0.35 };
      }
  
      const imgTargetX = 20 * s;
      const imgTargetY = cardZone.y - 10 * s - imgH; // 女巫底部悬浮在卡牌区上方
  
      // 对话框位于女巫右侧，垂直方向与女巫居中，且底部不压到卡牌区
      const dialogTargetX = imgTargetX + imgW + 12 * s;
      const dialogW = W - dialogTargetX - 16 * s;
      const dialogR = 12 * s;
      const textPad = 16 * s;
      const lineHeight = 24 * s;
      const textMaxW = dialogW - textPad * 2;
      const baseFont = `${Math.floor(17 * s)}px sans-serif`;
  
      const fullText = PHASE_TEXTS[phase] || '';
  
      // 预先测量完整文案的换行行数，动态确定对话框高度（预留倒三角按钮空间）
      ctx.save();
      ctx.font = baseFont;
      let lineCount = 1;
      let measureLine = '';
      for (let i = 0; i < fullText.length; i++) {
        const testLine = measureLine + fullText[i];
        if (ctx.measureText(testLine).width > textMaxW && measureLine !== '') {
          lineCount++;
          measureLine = fullText[i];
        } else {
          measureLine = testLine;
        }
      }
      ctx.restore();
      const dialogH = Math.max(96 * s, lineCount * lineHeight + textPad * 2 + 24 * s);
  
      let dialogTargetY = imgTargetY + (imgH - dialogH) / 2;
      const dialogMaxY = cardZone.y - 8 * s - dialogH;
      if (dialogTargetY > dialogMaxY) dialogTargetY = dialogMaxY;
      const dialogMinY = (this.safeTop || 0) + 8 * s;
      if (dialogTargetY < dialogMinY) dialogTargetY = dialogMinY;
  
      // Phase 1 入场时序：0~800ms 全亮 → 800~1600ms 渐暗并高亮字母卡牌区域(单独停留600ms)
      // → 女巫左侧缓慢飞入(1200ms) → 对话框右侧飞入(500ms) → 开始打字
      if (!game._guideOverlayStartTime) game._guideOverlayStartTime = Date.now();
      const overlayStartTime = game._guideOverlayStartTime;
      const overlayElapsed = Date.now() - overlayStartTime;
      const FADE_START = 800;
      const FADE_DURATION = 800;
      const UI_SHOW_DELAY = FADE_START + FADE_DURATION; // 1600ms
      const SPOT_HOLD = 600;           // 聚光灯高亮先单独展示，再让女巫飞入
      const WITCH_FLY_START = UI_SHOW_DELAY + SPOT_HOLD;
      const WITCH_FLY_DURATION = 1200; // 女巫骑扫把从左侧缓慢飞入
      const DIALOG_FLY_DELAY = 100;    // 女巫停稳后稍作停顿再出对话框
      const DIALOG_FLY_DURATION = 500; // 对话框从右侧飞入
      const POST_DIALOG_DELAY = 500;   // 对话框到位后延迟开始打字
      const WITCH_ARRIVE = WITCH_FLY_START + WITCH_FLY_DURATION;
      const DIALOG_ARRIVE = WITCH_ARRIVE + DIALOG_FLY_DELAY + DIALOG_FLY_DURATION;
  
      if (phase === 1 && overlayElapsed < UI_SHOW_DELAY) {
        this.guideNextBtnRect = null; // 渐变阶段禁止点击
  
        // 渐变变暗阶段：先画遮罩
        const fadeProgress = Math.min((overlayElapsed - FADE_START) / FADE_DURATION, 1);
        ctx.save();
        ctx.fillStyle = `rgba(0, 0, 0, ${Math.max(0, fadeProgress) * 0.75})`;
        ctx.fillRect(0, 0, W, H);
        ctx.restore();
  
        return; // 不画女巫、对话框等
      }
  
      // 计算文字开始时间：Phase 1 等女巫+对话框依次飞入后延迟 500ms 才开始；Phase 2 保持原有逻辑
      const textStartTime = (phase === 1)
        ? (overlayStartTime + DIALOG_ARRIVE + POST_DIALOG_DELAY)
        : (game._guideTextStartTime || Date.now());
      const charInterval = 65; // 每 65ms 显示一个字
      const elapsed = Date.now() - textStartTime;
      const visibleChars = game._guideSkipTyping
        ? fullText.length
        : Math.max(0, Math.min(fullText.length, Math.floor(elapsed / charInterval)));

      // 引导对话框打字机音效：3秒音频循环播放，打字期间持续播放，结束/跳过则停止
      const isTyping = !game._guideSkipTyping && visibleChars > 0 && visibleChars < fullText.length;
      if (isTyping && !game._guideTypingSoundPlaying) {
        if (game.audioManager) {
          game.audioManager.playLoop('guide_type');
        }
        game._guideTypingSoundPlaying = true;
      } else if (!isTyping && game._guideTypingSoundPlaying) {
        if (game.audioManager) {
          game.audioManager.stopSound('guide_type');
        }
        game._guideTypingSoundPlaying = false;
      }
      game._guideLastVisibleChars = visibleChars;

      const displayText = fullText.slice(0, visibleChars);
      const isTextComplete = visibleChars >= fullText.length;
  
      // === 1. 蒙层：渐暗完成后立即聚光灯高亮字母卡牌区域（Phase 5 退场时恢复全屏压暗） ===
      const spotReady = phase !== 5 && (phase !== 1 || overlayElapsed >= UI_SHOW_DELAY);
      if (spotReady) {
        const pad = 8 * s;
        const spotX = cardZone.x - pad;
        const spotY = cardZone.y - pad;
        const spotW = cardZone.w + pad * 2;
        const spotH = cardZone.h + pad * 2;
        const spotR = 14 * s;
  
        ctx.save();
        ctx.beginPath();
        // 外矩形（顺时针）
        ctx.rect(0, 0, W, H);
        // 内矩形（逆时针挖空）—— 圆角矩形
        const r = spotR;
        ctx.moveTo(spotX + r, spotY);
        ctx.lineTo(spotX + spotW - r, spotY);
        ctx.quadraticCurveTo(spotX + spotW, spotY, spotX + spotW, spotY + r);
        ctx.lineTo(spotX + spotW, spotY + spotH - r);
        ctx.quadraticCurveTo(spotX + spotW, spotY + spotH, spotX + spotW - r, spotY + spotH);
        ctx.lineTo(spotX + r, spotY + spotH);
        ctx.quadraticCurveTo(spotX, spotY + spotH, spotX, spotY + spotH - r);
        ctx.lineTo(spotX, spotY + r);
        ctx.quadraticCurveTo(spotX, spotY, spotX + r, spotY);
        ctx.closePath();
        ctx.fillStyle = 'rgba(0, 0, 0, 0.75)';
        ctx.fill('evenodd');
        ctx.restore();
  
        // 聚光灯区域金色边框（呼吸效果）
        const breathe = (Math.sin(Date.now() / 500) + 1) / 2;
        ctx.save();
        ctx.strokeStyle = `rgba(196, 163, 90, ${0.5 + breathe * 0.5})`;
        ctx.lineWidth = 2.5 * s;
        ctx.setLineDash([6 * s, 4 * s]);
        this.roundRect(spotX, spotY, spotW, spotH, spotR, null, ctx.strokeStyle, 2.5 * s);
        ctx.setLineDash([]);
        ctx.restore();
      } else {
        ctx.save();
        ctx.fillStyle = 'rgba(0, 0, 0, 0.75)';
        ctx.fillRect(0, 0, W, H);
        ctx.restore();
      }
  
      // Phase 5 退场完成后：黑色蒙层保留，屏幕中间弹出「获得女巫牌」弹窗
      if (phase === 5) {
        const exitElapsed = Date.now() - (game._guideExitStartTime || Date.now());
        if (exitElapsed >= 600) {
          this._drawGuideGiftPopup(ctx, game, W, H, s);
          return;
        }
      }
  
      // === 2. 女巫引导图片 + 对话框 ===
      // 女巫：Phase 1 从左侧缓慢飞入（easeOutCubic），飞行中与到位后持续上下漂浮（骑扫把感），x 到位后固定
      // 两个阶段均使用 witch_1 静态图
      const imgData = this.guideImages.witch_1;
  
      const bobY = Math.sin(Date.now() / 400) * 6 * s; // 上下漂浮
  
      let imgX, dialogDrawX;
      if (phase === 1) {
        const flyElapsed = overlayElapsed - WITCH_FLY_START;
        if (flyElapsed > 0) {
          const flyProgress = Math.min(flyElapsed / WITCH_FLY_DURATION, 1);
          imgX = -imgW + (imgTargetX + imgW) * Easing.easeOutCubic(flyProgress);
        } else {
          imgX = -imgW;
        }
        const dialogElapsed = overlayElapsed - WITCH_ARRIVE - DIALOG_FLY_DELAY;
        if (dialogElapsed > 0) {
          const dialogProgress = Math.min(dialogElapsed / DIALOG_FLY_DURATION, 1);
          dialogDrawX = W + (dialogTargetX - W) * Easing.easeOutCubic(dialogProgress);
        } else {
          dialogDrawX = W;
        }
      } else if (phase === 5) {
        // Phase 5 退场动画：女巫向左、对话框向右弹出去
        const exitElapsed = Date.now() - (game._guideExitStartTime || Date.now());
        const exitProgress = Math.min(exitElapsed / 600, 1);
        const eased = Easing.easeOutBackStrong(exitProgress);
        imgX = imgTargetX - (imgTargetX + imgW) * eased;
        dialogDrawX = dialogTargetX + (W - dialogTargetX) * eased;
      } else {
        imgX = imgTargetX;
        dialogDrawX = dialogTargetX;
      }
      const imgY = imgTargetY + bobY;
      const dialogDrawY = dialogTargetY;
  

      // 女巫引导图片（两个阶段均使用 witch_1 静态图）
      if (imgData && imgData.loaded && imgData.img) {
        ctx.drawImage(imgData.img, imgX, imgY, imgW, imgH);
      }
  
      // 对话框背景（奶油色）
      this.roundRect(dialogDrawX, dialogDrawY, dialogW, dialogH, dialogR, '#f5f0e6', '#c4a35a', 2 * s);

      // 小女巫名字标签（左上角）
      this._drawGuideNameTag(ctx, dialogDrawX, dialogDrawY, s);
  
      // === 3. 逐字显示的文字 ===
      ctx.save();
      ctx.font = baseFont;
      ctx.fillStyle = '#1a2f4a';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
  
      const textX = dialogDrawX + textPad;
      const textY = dialogDrawY + textPad + 2; // 文字下移 2px：首行下移、末行与框底间距缩小 2px（对话框高度不变）
  
      // 自动换行绘制
      let line = '';
      let currentY = textY;
      for (let i = 0; i < displayText.length; i++) {
        const ch = displayText[i];
        const testLine = line + ch;
        const metrics = ctx.measureText(testLine);
        if (metrics.width > textMaxW && line !== '') {
          ctx.fillText(line, textX, currentY);
          line = ch;
          currentY += lineHeight;
        } else {
          line = testLine;
        }
      }
      if (line) ctx.fillText(line, textX, currentY);
      ctx.restore();
  
      // === 4. 倒三角按钮（文字显示完全后才显示，Phase 5 退场时不显示）===
      // 对话框区域始终可点击（用于双击跳过打字）
      this.guideDialogRect = { x: dialogDrawX, y: dialogDrawY, w: dialogW, h: dialogH };
      this.guideNextBtnRect = null;
      if (isTextComplete && phase !== 5) {
        const btnSize = 16 * s;
        const btnX = dialogDrawX + dialogW - btnSize - 16 * s;
        const btnY = dialogDrawY + dialogH - btnSize - 12 * s;
  
        ctx.save();
        ctx.beginPath();
        // 倒三角
        ctx.moveTo(btnX + btnSize / 2, btnY + btnSize);
        ctx.lineTo(btnX, btnY);
        ctx.lineTo(btnX + btnSize, btnY);
        ctx.closePath();
        ctx.fillStyle = '#c4a35a';
        ctx.fill();
        // 呼吸动画（透明度变化）
        const pulse = Math.sin(Date.now() / 300) * 0.3 + 0.7;
        ctx.globalAlpha = pulse;
        ctx.fill();
        ctx.restore();
  
        // 点击区域扩大为整个对话框
        this.guideNextBtnRect = { x: dialogDrawX, y: dialogDrawY, w: dialogW, h: dialogH };
      }
    }

    // 「获得女巫牌」弹窗：主引导退场完成后弹出（样式参考女巫奖励弹窗 result 阶段）
    Renderer.prototype._drawGuideGiftPopup = function(ctx, game, W, H, s) {
      if (!game._guideGiftPopupStartTime) game._guideGiftPopupStartTime = Date.now();
      const elapsed = Date.now() - game._guideGiftPopupStartTime;

      // 弹出动效（easeOutBack，与女巫奖励弹窗一致）
      const enterDuration = 350;
      const enterProgress = Math.min(elapsed / enterDuration, 1);
      const enterEase = Easing.easeOutBack(enterProgress);
      const panelOffsetY = (1 - enterEase) * 30 * s;
      const contentAlpha = enterProgress;

      // 标题：获得女巫牌（金色装饰线标题，同女巫奖励弹窗）
      const titleY = H / 2 - 130 * s;
      this._drawWitchRewardTitle(ctx, '获得女巫牌', W, titleY, s, { alpha: contentAlpha });

      // 中间：has_vowel 女巫牌（等比缩放 + 圆角裁剪 + 金色光晕）
      const iconCY = H / 2 - 20 * s + panelOffsetY;
      const cardMaxW = 120 * s;
      const cardMaxH = 150 * s;
      let cardW = cardMaxW, cardH = cardMaxH;
      const iconData = this.shopCardImages['has_vowel'];
      if (iconData && iconData.loaded && iconData.img && iconData.width > 0 && iconData.height > 0) {
        const containerAspect = cardMaxW / cardMaxH;
        const aspect = iconData.width / iconData.height;
        if (containerAspect > aspect) {
          cardH = cardMaxH;
          cardW = cardH * aspect;
        } else {
          cardW = cardMaxW;
          cardH = cardW / aspect;
        }
      }
      const cardX = W / 2 - cardW / 2;
      const cardY = iconCY - cardH / 2;

      ctx.save();
      ctx.globalAlpha = contentAlpha;
      ctx.beginPath();
      const cr = 4 * s;
      ctx.moveTo(cardX + cr, cardY);
      ctx.lineTo(cardX + cardW - cr, cardY);
      ctx.quadraticCurveTo(cardX + cardW, cardY, cardX + cardW, cardY + cr);
      ctx.lineTo(cardX + cardW, cardY + cardH - cr);
      ctx.quadraticCurveTo(cardX + cardW, cardY + cardH, cardX + cardW - cr, cardY + cardH);
      ctx.lineTo(cardX + cr, cardY + cardH);
      ctx.quadraticCurveTo(cardX, cardY + cardH, cardX, cardY + cardH - cr);
      ctx.lineTo(cardX, cardY + cr);
      ctx.quadraticCurveTo(cardX, cardY, cardX + cr, cardY);
      ctx.closePath();
      ctx.clip();
      if (iconData && iconData.loaded && iconData.img) {
        ctx.drawImage(iconData.img, cardX, cardY, cardW, cardH);
      }
      ctx.restore();

      ctx.save();
      ctx.globalAlpha = contentAlpha;
      this._drawCardGlow(ctx, cardX, cardY, cardW, cardH, s);
      ctx.restore();

      // 卡牌名称 + 介绍（从已发放的 jokers 中读取，背后金色半透明蒙层）
      const giftCard = (game.jokers || []).find(j => j && j.trigger === 'has_vowel');
      const cardName = giftCard && giftCard.name ? giftCard.name : '元音强化';
      const cardDesc = giftCard && giftCard.desc ? giftCard.desc : '元音字母分×3';

      const nameY = cardY + cardH + 25 * s;
      const descY = nameY + 24 * s;
      const descPanelPadding = 16 * s;
      const descPanelH = (descY - nameY) + 40 * s;
      const descPanelY = nameY - 20 * s;
      ctx.save();
      ctx.globalAlpha = 0.18 * contentAlpha;
      ctx.fillStyle = '#c4a35a';
      this.roundRect(W / 2 - (cardW / 2 + descPanelPadding), descPanelY, cardW + descPanelPadding * 2, descPanelH, 10 * s, '#c4a35a');
      ctx.restore();

      ctx.save();
      ctx.globalAlpha = contentAlpha;
      ctx.font = `bold ${Math.floor(16 * s)}px sans-serif`;
      ctx.fillStyle = '#fff';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(cardName, W / 2, nameY);
      ctx.restore();

      ctx.save();
      ctx.globalAlpha = contentAlpha;
      ctx.font = `${Math.floor(12 * s)}px sans-serif`;
      ctx.fillStyle = '#fff';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(cardDesc, W / 2, descY);
      ctx.restore();

      // 领取按钮（水波纹 + 按压回弹，同女巫奖励弹窗）
      const btnW = 126 * s;
      const btnH = 40 * s;
      const btnX = (W - btnW) / 2;
      const btnY = descY + 22 * s + btnH / 2;
      ctx.save();
      ctx.globalAlpha = contentAlpha;
      this._drawButtonRipple(ctx, btnX, btnY, btnW, btnH, s, {
        stateKey: 'guide_gift_claim',
        radius: 8,
        interval: 900,
        duration: 1800,
        alphaScale: 0.55,
        lineWidthScale: 0.8,
        fillAlpha: 0.22,
        strokeAlpha: 0.45,
        color: { r: 255, g: 195, b: 70 },
        strokeColor: { r: 188, g: 140, b: 40 }
      });
      this._drawScaledButton(ctx, '领取', btnX, btnY, btnW, btnH, s, !!game._guideGiftClaimBtnPressed, { color: '#c4a35a', radius: 8 });
      ctx.restore();
      this.guideGiftClaimBtnRect = { x: btnX, y: btnY, w: btnW, h: btnH };
    };

    Renderer.prototype._drawShopGuideOverlay = function(game) {
      const ctx = this.ctx;
      const W = this.W;
      const H = this.H;
      const s = this.scale;
      const phase = game.shopGuidePhase;
      const GUIDE_TEXT = '快看！下一回合有女巫试炼，要注意她的规则哦！';
  
      // 获取聚光灯目标区域（从 shopRenderer 获取，回退到底部中间区域）
      const spotRect = (this.shopRenderer && this.shopRenderer.shopGuideSpotRect)
        ? this.shopRenderer.shopGuideSpotRect
        : { x: 15 * s, y: H * 0.65, w: W - 30 * s, h: 120 * s };
      const spotPad = 10 * s;
      const spotX = spotRect.x - spotPad;
      const spotY = spotRect.y - spotPad + 10;
      const spotW = spotRect.w + spotPad * 2;
      const spotH = spotRect.h + spotPad * 2;
      const spotR = 14 * s;
  
      const startTime = game._shopGuideStartTime || Date.now();
      const elapsed = Date.now() - startTime;
      const FADE_DURATION = 500;
      const WAIT_DURATION = 1000;
  
      // Phase 1: 聚光灯淡入 + 等待，超时自动进入 Phase 2
      if (phase === 1 && elapsed >= FADE_DURATION + WAIT_DURATION) {
        game.shopGuidePhase = 2;
        game._shopGuideTextStartTime = Date.now();
        // 本帧继续绘制 Phase 1 的蒙层，下一帧自然进入 Phase 2，避免闪白
      }
  
      // === 1. 聚光灯蒙层（evenodd 挖空）===
      let overlayAlpha;
      if (phase === 1) {
        overlayAlpha = 0.75 * Math.min(elapsed / FADE_DURATION, 1);
      } else {
        // Phase 2 和 Phase 3（退场前 600ms 内）蒙层保持 0.75，淡出由 render() 统一处理
        overlayAlpha = 0.75;
      }
  
      ctx.save();
      ctx.beginPath();
      // 外矩形（顺时针）
      ctx.rect(0, 0, W, H);
      // 内矩形（逆时针挖空）—— 圆角矩形
      const r = spotR;
      ctx.moveTo(spotX + r, spotY);
      ctx.lineTo(spotX + spotW - r, spotY);
      ctx.quadraticCurveTo(spotX + spotW, spotY, spotX + spotW, spotY + r);
      ctx.lineTo(spotX + spotW, spotY + spotH - r);
      ctx.quadraticCurveTo(spotX + spotW, spotY + spotH, spotX + spotW - r, spotY + spotH);
      ctx.lineTo(spotX + r, spotY + spotH);
      ctx.quadraticCurveTo(spotX, spotY + spotH, spotX, spotY + spotH - r);
      ctx.lineTo(spotX, spotY + r);
      ctx.quadraticCurveTo(spotX, spotY, spotX + r, spotY);
      ctx.closePath();
      ctx.fillStyle = `rgba(0, 0, 0, ${overlayAlpha})`;
      ctx.fill('evenodd');
      ctx.restore();
  
      // Phase 1 只画蒙层（和聚光灯边框），不画女巫
      if (phase === 1) {
        // 聚光灯区域金色边框（呼吸效果）
        const breathe = (Math.sin(Date.now() / 500) + 1) / 2;
        ctx.save();
        ctx.strokeStyle = `rgba(196, 163, 90, ${0.5 + breathe * 0.5})`;
        ctx.lineWidth = 2.5 * s;
        ctx.setLineDash([6 * s, 4 * s]);
        this.roundRect(spotX, spotY, spotW, spotH, spotR, null, ctx.strokeStyle, 2.5 * s);
        ctx.setLineDash([]);
        ctx.restore();
        return;
      }
  
      // === Phase 2 & 3: 女巫帧动画 + 对话框 ===
      const fullText = GUIDE_TEXT;
  
      // 弹出动画与文字延迟参数
      const POPUP_DURATION = 600;
      const POST_POPUP_DELAY = 500;
  
      // 计算文字开始时间：对话框弹出完成后延迟 500ms 再开始（参考 witch_guide_1）
      const textStartTime = (game._shopGuideTextStartTime || Date.now()) + POPUP_DURATION + POST_POPUP_DELAY;
      const charInterval = 65;
      const textElapsed = Date.now() - textStartTime;
      const visibleChars = game._shopGuideSkipTyping
        ? fullText.length
        : Math.max(0, Math.min(fullText.length, Math.floor(textElapsed / charInterval)));
      const displayText = fullText.slice(0, visibleChars);
      const isTextComplete = visibleChars >= fullText.length;

      // 商店引导对话框打字机音效：3秒音频循环播放
      const isTyping = !game._shopGuideSkipTyping && visibleChars > 0 && visibleChars < fullText.length;
      if (isTyping && !game._guideTypingSoundPlaying) {
        if (game.audioManager) {
          game.audioManager.playLoop('guide_type');
        }
        game._guideTypingSoundPlaying = true;
      } else if (!isTyping && game._guideTypingSoundPlaying) {
        if (game.audioManager) {
          game.audioManager.stopSound('guide_type');
        }
        game._guideTypingSoundPlaying = false;
      }
  
      // 女巫和对话框布局（与 witch_guide_1/2 保持一致）
      const dialogPadX = 20 * s;
      const dialogTargetX = dialogPadX;
      const imgW = 180 * s;
      const imgH = 220 * s;
      const imgTargetX = dialogTargetX;
      const imgTargetY = H * 0.6 - imgH;
  
      const dialogW = W - dialogPadX * 2;
      const dialogH = 130 * s;
      const dialogR = 12 * s;
      const dialogTargetY = H * 0.6;
  
      let imgX, imgY, dialogDrawX, dialogDrawY;
      if (phase === 2) {
        const phase2Start = game._shopGuideTextStartTime || Date.now();
        const popupElapsed = Date.now() - phase2Start;
        // 前 100ms 延迟后开始弹出
        const popupStart = 100;
        if (popupElapsed > popupStart) {
          const popupProgress = Math.min((popupElapsed - popupStart) / POPUP_DURATION, 1);
          const eased = Easing.easeOutBackStrong(popupProgress);
          imgX = -imgW + (imgTargetX + imgW) * eased;
          dialogDrawX = W + (dialogTargetX - W) * eased;
          imgY = imgTargetY;
          dialogDrawY = dialogTargetY;
        } else {
          imgX = -imgW;
          dialogDrawX = W;
          imgY = imgTargetY;
          dialogDrawY = dialogTargetY;
        }
      } else if (phase === 3) {
        // 退场：女巫向左、对话框向右弹出去
        const exitElapsed = Date.now() - (game._shopGuideExitStartTime || Date.now());
        const exitProgress = Math.min(exitElapsed / 600, 1);
        const eased = Easing.easeOutBackStrong(exitProgress);
        imgX = imgTargetX - (imgTargetX + imgW) * eased;
        dialogDrawX = dialogTargetX + (W - dialogTargetX) * eased;
        imgY = imgTargetY;
        dialogDrawY = dialogTargetY;
      } else {
        imgX = imgTargetX;
        dialogDrawX = dialogTargetX;
        imgY = imgTargetY;
        dialogDrawY = dialogTargetY;
      }
  
      // 女巫引导图片（witch_2 静态图，商店引导专用）
      const imgData = this.guideImages.witch_2;
      if (imgData && imgData.loaded && imgData.img) {
        ctx.drawImage(imgData.img, imgX, imgY, imgW, imgH);
      }
  
      // 对话框背景
      this.roundRect(dialogDrawX, dialogDrawY, dialogW, dialogH, dialogR, '#f5f0e6', '#c4a35a', 2 * s);

      // 小女巫名字标签（左上角）
      this._drawGuideNameTag(ctx, dialogDrawX, dialogDrawY, s);
  
      // 逐字显示文字
      ctx.save();
      ctx.font = `${Math.floor(17 * s)}px sans-serif`;
      ctx.fillStyle = '#1a2f4a';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';

      const textPad = 20 * s;
      const textX = dialogDrawX + textPad;
      const textY = dialogDrawY + textPad + 2; // 文字下移 2px：首行下移、末行与框底间距缩小 2px（对话框高度不变）
      const textMaxW = dialogW - textPad * 2;
      const lineHeight = 24 * s;

      let line = '';
      let currentY = textY;
      for (let i = 0; i < displayText.length; i++) {
        const ch = displayText[i];
        const testLine = line + ch;
        const metrics = ctx.measureText(testLine);
        if (metrics.width > textMaxW && line !== '') {
          ctx.fillText(line, textX, currentY);
          line = ch;
          currentY += lineHeight;
        } else {
          line = testLine;
        }
      }
      if (line) ctx.fillText(line, textX, currentY);
      ctx.restore();
  
      // 倒三角按钮（文字显示完全后才显示，Phase 3 退场时不显示）
      // 对话框区域始终可点击（用于双击跳过打字）
      this.shopGuideDialogRect = { x: dialogDrawX, y: dialogDrawY, w: dialogW, h: dialogH };
      this.shopGuideNextBtnRect = null;
      if (isTextComplete && phase !== 3) {
        const btnSize = 16 * s;
        const btnX = dialogDrawX + dialogW - btnSize - 16 * s;
        const btnY = dialogDrawY + dialogH - btnSize - 12 * s;
  
        ctx.save();
        ctx.beginPath();
        ctx.moveTo(btnX + btnSize / 2, btnY + btnSize);
        ctx.lineTo(btnX, btnY);
        ctx.lineTo(btnX + btnSize, btnY);
        ctx.closePath();
        ctx.fillStyle = '#c4a35a';
        ctx.fill();
        const pulse = Math.sin(Date.now() / 300) * 0.3 + 0.7;
        ctx.globalAlpha = pulse;
        ctx.fill();
        ctx.restore();
  
        // 点击区域扩大为整个对话框
        this.shopGuideNextBtnRect = { x: dialogDrawX, y: dialogDrawY, w: dialogW, h: dialogH };
      }
    }

    Renderer.prototype._drawCardBookGuideOverlay = function(game) {
      const ctx = this.ctx;
      const W = this.W;
      const H = this.H;
      const s = this.scale;
      let phase = game.cardBookGuidePhase;
  
      const GUIDE_TEXTS = [
        '',
        '太棒了！你通过了女巫的试炼，获得了第一张字母词牌：[A]！',
        '[装备]字母词牌可以获得额外的能力，即使试炼失败重来，词牌也不会回收。但最多只能装备 [3] 张哦。',
        '我也给你准备了小奖励，来挑一个吧~',
      ];
  
      const FADE_DURATION = 500;
      const DELAY_BEFORE_FADE = 500;
      const WITCH_DELAY = 1000; // 聚光灯显示后，延迟 1 秒再弹出女巫
      const startTime = game._cardBookGuideStartTime || Date.now();
      const elapsed = Date.now() - startTime;
  
      // Phase 1: 前 500ms 保持正常商店画面
      if (phase === 1 && elapsed < DELAY_BEFORE_FADE) {
        return;
      }
  
      // Phase 1: 500ms~1500ms 只画 evenodd 蒙层+金色边框（聚光灯），不弹出女巫
      const showWitch = phase !== 1 || elapsed >= DELAY_BEFORE_FADE + WITCH_DELAY;
  
      // Phase 4 退场检查：600ms 后结束
      if (phase === 4) {
        const exitElapsed = Date.now() - (game._cardBookGuideExitStartTime || Date.now());
        if (exitElapsed >= 600) {
          game.cardBookGuidePhase = 5;
          game._cardBookGuideExitStartTime = null;
          if (game.storageManager) {
            game.storageManager.saveProgress();
            game.storageManager.saveCardBookGuidePhase(5);
          }
          return;
        }
      }
  
      // 自动推进后同步本地 phase 变量
      if (game.cardBookGuidePhase !== phase) {
        phase = game.cardBookGuidePhase;
      }
  
      // === 蒙层 alpha ===
      let overlayAlpha;
      if (phase === 1) {
        overlayAlpha = 0.75 * Math.min(Math.max(0, elapsed - DELAY_BEFORE_FADE) / FADE_DURATION, 1);
      } else if (phase === 4) {
        const exitElapsed = Date.now() - (game._cardBookGuideExitStartTime || Date.now());
        overlayAlpha = 0.75 * Math.max(0, 1 - exitElapsed / 500);
      } else {
        overlayAlpha = 0.75;
      }
  
      // === Phase 1/2: evenodd 挖空图标 + 金色边框 ===
      const spotRect = this.cardBookIconRect;
      if ((phase === 1 || phase === 2) && spotRect) {
        const spotPad = 10 * s;
        const spotX = spotRect.x - spotPad;
        const spotY = spotRect.y - spotPad + 8;
        const spotW = spotRect.w + spotPad * 2;
        const spotH = spotRect.h + spotPad * 2;
        const spotR = 14 * s;
  
        ctx.save();
        ctx.beginPath();
        ctx.rect(0, 0, W, H);
        const r = spotR;
        ctx.moveTo(spotX + r, spotY);
        ctx.lineTo(spotX + spotW - r, spotY);
        ctx.quadraticCurveTo(spotX + spotW, spotY, spotX + spotW, spotY + r);
        ctx.lineTo(spotX + spotW, spotY + spotH - r);
        ctx.quadraticCurveTo(spotX + spotW, spotY + spotH, spotX + spotW - r, spotY + spotH);
        ctx.lineTo(spotX + r, spotY + spotH);
        ctx.quadraticCurveTo(spotX, spotY + spotH, spotX, spotY + spotH - r);
        ctx.lineTo(spotX, spotY + r);
        ctx.quadraticCurveTo(spotX, spotY, spotX + r, spotY);
        ctx.closePath();
        ctx.fillStyle = `rgba(0, 0, 0, ${overlayAlpha})`;
        ctx.fill('evenodd');
        ctx.restore();
  
        // 金色呼吸边框
        const breathe = (Math.sin(Date.now() / 500) + 1) / 2;
        ctx.save();
        ctx.strokeStyle = `rgba(196, 163, 90, ${0.5 + breathe * 0.5})`;
        ctx.lineWidth = 2.5 * s;
        ctx.setLineDash([6 * s, 4 * s]);
        this.roundRect(spotX, spotY, spotW, spotH, spotR, null, ctx.strokeStyle, 2.5 * s);
        ctx.setLineDash([]);
        ctx.restore();
      } else if (phase >= 3) {
        // Phase 3/4: 全屏蒙层
        ctx.save();
        ctx.fillStyle = `rgba(0, 0, 0, ${overlayAlpha})`;
        ctx.fillRect(0, 0, W, H);
        ctx.restore();
      }
  
      // Phase 1 聚光灯显示期间（500ms~1500ms），只画聚光灯，不弹出女巫；Phase 2/3 正常显示女巫
      if (phase === 1 && !showWitch) {
        return;
      }
  
      // === Phase 1/2/3: 女巫帧动画 + 对话框 ===
      const isPhase1 = phase === 1;
      const isPhase2 = phase === 2;
      const isPhase3 = phase === 3;
      const fullText = GUIDE_TEXTS[phase] || '';
  
      const POPUP_DURATION = 600;
      const POST_POPUP_DELAY = 500;
      // Phase 1: 文本等弹出动画完成后开始显示；Phase 2/3: 女巫和对话框保持不动，文本立即开始显示
      let textStartTime;
      if (isPhase1) {
        textStartTime = (game._cardBookGuideTextStartTime || Date.now()) + POPUP_DURATION + POST_POPUP_DELAY;
      } else if (isPhase2) {
        textStartTime = (game._cardBookGuideText2StartTime || Date.now());
      } else {
        textStartTime = (game._cardBookGuideText3StartTime || Date.now());
      }
      const charInterval = 65;
      const textElapsed = Date.now() - textStartTime;
      // 预处理 fullText：移除 [] 标记并记录高亮字符
      const pureChars = [];
      const highlightFlags = [];
      let pIdx = 0;
      while (pIdx < fullText.length) {
        if (fullText[pIdx] === '[') {
          const end = fullText.indexOf(']', pIdx);
          if (end !== -1) {
            for (let k = pIdx + 1; k < end; k++) {
              pureChars.push(fullText[k]);
              highlightFlags.push(true);
            }
            pIdx = end + 1;
            continue;
          }
        }
        pureChars.push(fullText[pIdx]);
        highlightFlags.push(false);
        pIdx++;
      }

      const totalPureChars = pureChars.length;
      const visibleChars = game._cardBookGuideSkipTyping
        ? totalPureChars
        : Math.max(0, Math.min(totalPureChars, Math.floor(textElapsed / charInterval)));
      const isTextComplete = visibleChars >= totalPureChars;

      // 卡牌图鉴引导对话框打字机音效：3秒音频循环播放
      const isTyping = !game._cardBookGuideSkipTyping && visibleChars > 0 && visibleChars < totalPureChars;
      if (isTyping && !game._guideTypingSoundPlaying) {
        if (game.audioManager) {
          game.audioManager.playLoop('guide_type');
        }
        game._guideTypingSoundPlaying = true;
      } else if (!isTyping && game._guideTypingSoundPlaying) {
        if (game.audioManager) {
          game.audioManager.stopSound('guide_type');
        }
        game._guideTypingSoundPlaying = false;
      }
  
      const dialogPadX = 20 * s;
      const dialogTargetX = dialogPadX;
      const imgW = 180 * s;
      const imgH = 220 * s;
      const imgTargetX = dialogTargetX;
      const imgTargetY = H * 0.6 - imgH;
  
      const dialogW = W - dialogPadX * 2;
      const dialogH = 130 * s;
      const dialogR = 12 * s;
      const dialogTargetY = H * 0.6;
  
      let imgX, imgY, dialogDrawX, dialogDrawY;
      if (phase === 1) {
        // Phase 1：女巫和对话框从屏幕外弹出（计时起点对齐到聚光灯显示后）
        const popupElapsed = elapsed - DELAY_BEFORE_FADE - WITCH_DELAY;
        const popupDelay = 100;
        if (popupElapsed > popupDelay) {
          const popupProgress = Math.min((popupElapsed - popupDelay) / POPUP_DURATION, 1);
          const eased = Easing.easeOutBackStrong(popupProgress);
          imgX = -imgW + (imgTargetX + imgW) * eased;
          dialogDrawX = W + (dialogTargetX - W) * eased;
          imgY = imgTargetY;
          dialogDrawY = dialogTargetY;
        } else {
          imgX = -imgW;
          dialogDrawX = W;
          imgY = imgTargetY;
          dialogDrawY = dialogTargetY;
        }
      } else if (phase === 2 || phase === 3) {
        // Phase 2/3：女巫和对话框保持显示，不需要重新弹出
        imgX = imgTargetX;
        dialogDrawX = dialogTargetX;
        imgY = imgTargetY;
        dialogDrawY = dialogTargetY;
      } else if (phase === 4) {
        const exitElapsed = Date.now() - (game._cardBookGuideExitStartTime || Date.now());
        const exitProgress = Math.min(exitElapsed / 600, 1);
        const eased = Easing.easeOutBackStrong(exitProgress);
        imgX = imgTargetX - (imgTargetX + imgW) * eased;
        dialogDrawX = dialogTargetX + (W - dialogTargetX) * eased;
        imgY = imgTargetY;
        dialogDrawY = dialogTargetY;
      }
  
      // 女巫引导图片（witch_3 静态图，图鉴引导专用）
      const imgData = this.guideImages.witch_3;
      if (imgData && imgData.loaded && imgData.img) {
        ctx.drawImage(imgData.img, imgX, imgY, imgW, imgH);
      }
  
      // 对话框背景
      this.roundRect(dialogDrawX, dialogDrawY, dialogW, dialogH, dialogR, '#f5f0e6', '#c4a35a', 2 * s);

      // 小女巫名字标签（左上角）
      this._drawGuideNameTag(ctx, dialogDrawX, dialogDrawY, s);
  
      // 逐字显示文字（支持 [xxx] 高亮：加粗 + 深紫色）
      ctx.save();
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';

      const textPad = 20 * s;
      const textX = dialogDrawX + textPad;
      const textY = dialogDrawY + textPad + 2; // 文字下移 2px：首行下移、末行与框底间距缩小 2px（对话框高度不变）
      const textMaxW = dialogW - textPad * 2;
      const lineHeight = 24 * s;
      const baseFont = `${Math.floor(17 * s)}px sans-serif`;
      const boldFont = `bold ${Math.floor(17 * s)}px sans-serif`;

      let currentX = textX;
      let currentY = textY;
      for (let i = 0; i < visibleChars; i++) {
        const ch = pureChars[i];
        const isH = highlightFlags[i];
        ctx.font = isH ? boldFont : baseFont;
        ctx.fillStyle = isH ? '#5a2d8a' : '#1a2f4a';

        const charW = ctx.measureText(ch).width;
        if (currentX + charW > textX + textMaxW && currentX > textX) {
          currentX = textX;
          currentY += lineHeight;
        }
        ctx.fillText(ch, currentX, currentY);
        currentX += charW;
      }
      ctx.restore();
  
      // 倒三角按钮（文字显示完全后才显示，Phase 4 退场时不显示）
      // 对话框区域始终可点击（用于双击跳过打字）
      this.cardBookGuideDialogRect = { x: dialogDrawX, y: dialogDrawY, w: dialogW, h: dialogH };
      this.cardBookGuideNextBtnRect = null;
      if (isTextComplete && phase !== 4) {
        const btnSize = 16 * s;
        const btnX = dialogDrawX + dialogW - btnSize - 16 * s;
        const btnY = dialogDrawY + dialogH - btnSize - 12 * s;
  
        ctx.save();
        ctx.beginPath();
        ctx.moveTo(btnX + btnSize / 2, btnY + btnSize);
        ctx.lineTo(btnX, btnY);
        ctx.lineTo(btnX + btnSize, btnY);
        ctx.closePath();
        ctx.fillStyle = '#c4a35a';
        ctx.fill();
        const pulse = Math.sin(Date.now() / 300) * 0.3 + 0.7;
        ctx.globalAlpha = pulse;
        ctx.fill();
        ctx.restore();
  
        this.cardBookGuideNextBtnRect = { x: dialogDrawX, y: dialogDrawY, w: dialogW, h: dialogH };
      }
    }

};
