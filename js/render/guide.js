const { Easing } = require('../animation');

module.exports = function extendGuide(Renderer) {
    Renderer.prototype._drawGuideOverlay = function(game) {
      const ctx = this.ctx;
      const W = this.W;
      const H = this.H;
      const s = this.scale;
      const phase = game.guidePhase;
  
      const PHASE_TEXTS = [
        '',
        '传说中具有强大能量的26张词牌，由26位女巫保管着，她们都设下了独一无二的试炼。唯有通过考验之人，才能唤醒词牌的真正力量。',
        '怎么通过考验？很简单——看到这些字母牌了吗？挑几个拼成一个单词，打出去！单词越长，能量越高。',
        '对了，这个送你——我珍藏很久的女巫牌，它会持续给你提供帮助！（偷偷告诉你，卡牌商店有更多强大的卡牌可以买到哦）',
        '好了，快出发寻找女巫吧！',
      ];
  
      // Phase 1 入场时序：0~1000ms 全亮无UI → 1000~1500ms 渐变变暗 → 1500ms+ 显示完整UI
      const overlayStartTime = game._guideOverlayStartTime || Date.now();
      const overlayElapsed = Date.now() - overlayStartTime;
      const FADE_START = 1000;
      const FADE_DURATION = 500;
      const UI_SHOW_DELAY = FADE_START + FADE_DURATION; // 1500ms
  
      if (phase === 1 && overlayElapsed < UI_SHOW_DELAY) {
        this.guideNextBtnRect = null; // 渐变阶段禁止点击
        if (overlayElapsed >= FADE_START) {
          // 渐变变暗阶段：只画遮罩
          const fadeProgress = Math.min((overlayElapsed - FADE_START) / FADE_DURATION, 1);
          ctx.save();
          ctx.fillStyle = `rgba(0, 0, 0, ${fadeProgress * 0.75})`;
          ctx.fillRect(0, 0, W, H);
          ctx.restore();
        }
        return; // 不画女巫、对话框等
      }
  
      const fullText = PHASE_TEXTS[phase] || '';
  
      // Phase 1 弹出动画参数
      const POPUP_DURATION = 600;
      const POST_POPUP_DELAY = 500;
  
      // 计算文字开始时间：Phase 1 在女巫+对话框弹出并贴合后延迟 500ms 才开始；Phase 2~4 保持原有逻辑
      const textStartTime = (phase === 1)
        ? (overlayStartTime + UI_SHOW_DELAY + POPUP_DURATION + POST_POPUP_DELAY)
        : (game._guideTextStartTime || Date.now());
      const charInterval = 65; // 每 65ms 显示一个字
      const elapsed = Date.now() - textStartTime;
      const visibleChars = game._guideSkipTyping
        ? fullText.length
        : Math.max(0, Math.min(fullText.length, Math.floor(elapsed / charInterval)));
      const displayText = fullText.slice(0, visibleChars);
      const isTextComplete = visibleChars >= fullText.length;
  
      // === 1. 黑色半透明蒙层 ===
      ctx.save();
      ctx.fillStyle = 'rgba(0, 0, 0, 0.75)';
      ctx.fillRect(0, 0, W, H);
      ctx.restore();
  
      // === 2. 女巫引导图片 + 对话框（Phase 1 果冻感弹出，Phase 2~4 直接显示） ===
      const dialogPadX = 20 * s;
      const dialogTargetX = dialogPadX;
      const imgName = phase === 1 ? 'witch_1' : 'witch_2';
      const imgData = this.guideImages[imgName];
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
        const popupElapsed = overlayElapsed - UI_SHOW_DELAY;
        if (popupElapsed > 0) {
          const popupProgress = Math.min(popupElapsed / POPUP_DURATION, 1);
          const eased = Easing.easeOutBackStrong(popupProgress);
          // 女巫从左侧弹出：起始在屏幕外左侧，目标位置对齐
          imgX = -imgW + (imgTargetX + imgW) * eased;
          // 对话框从右侧弹出：起始在屏幕外右侧，目标位置对齐
          dialogDrawX = W + (dialogTargetX - W) * eased;
          imgY = imgTargetY;
          dialogDrawY = dialogTargetY;
        } else {
          imgX = -imgW;
          dialogDrawX = W;
          imgY = imgTargetY;
          dialogDrawY = dialogTargetY;
        }
      } else if (phase === 5) {
        // Phase 5 退场动画：女巫向左、对话框向右弹出去
        const exitElapsed = Date.now() - (game._guideExitStartTime || Date.now());
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
  
      // 女巫引导图片（精灵图）
      if (imgData && imgData.loaded && imgData.img) {
        const frameIdx = Math.floor(Date.now() / imgData.frameDelay) % imgData.frameCount;
        const coord = imgData.frameCoords[frameIdx];
        if (coord) {
          ctx.drawImage(imgData.img, coord.x, coord.y, coord.w, coord.h, imgX, imgY, imgW, imgH);
        }
      }
  
      // 对话框背景（奶油色）
      this.roundRect(dialogDrawX, dialogDrawY, dialogW, dialogH, dialogR, '#f5f0e6', '#c4a35a', 2 * s);

      // 小女巫名字标签（左上角）
      const tagH = 34 * s;
      const tagW = tagH * (100 / 40); // name_tag.png 原始尺寸 100x40
      const tagX = dialogDrawX + 14 * s;
      const tagY = dialogDrawY - tagH / 2;
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
  
      // === 3. 逐字显示的文字 ===
      ctx.save();
      ctx.font = `${Math.floor(17 * s)}px sans-serif`;
      ctx.fillStyle = '#1a2f4a';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
  
      const textPad = 18 * s;
      const textX = dialogDrawX + textPad;
      const textY = dialogDrawY + textPad;
      const textMaxW = dialogW - textPad * 2;
      const lineHeight = 24 * s;
  
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
  
      // === 6. 阶段3：has_vowel 卡牌弹入动画（果冻感缩放） ===
      // 弹入完成后持续显示在女巫旁边，点击下一步进入 Phase 4 时自然消失
      if (phase === 3 && isTextComplete) {
        const giftStart = game._guideCardGiftStartTime || (game._guideCardGiftStartTime = Date.now());
        const giftElapsed = Date.now() - giftStart;
  
        const cardW = 70 * s;
        const cardH = 90 * s;
        // 卡牌目标位置：witch 图片右侧，与 witch 图片中心垂直对齐
        const targetX = imgX + imgW + 10 * s;
        const targetY = imgY + imgH / 2;
        // 弹入动画：600ms 从小变大，easeOutBackStrong 强力果冻回弹；之后保持
        const progress = Math.min(giftElapsed / 600, 1);
        const scale = progress === 0 ? 0 : Easing.easeOutBackStrong(progress);
        const curW = cardW * scale;
        const curH = cardH * scale;
        const cardX = targetX;
        const cardY = targetY - curH / 2; // 中心对齐
  
        const hasVowelData = this.shopCardImages['has_vowel'];
        if (hasVowelData && hasVowelData.loaded && hasVowelData.img) {
          ctx.save();
          ctx.globalAlpha = progress === 0 ? 0 : Math.min(scale, 1);
          // 卡牌背后金色星星+光晕（复用购买成功弹窗效果）
          this._drawCardGlow(ctx, cardX, cardY, curW, curH, s);
          ctx.drawImage(hasVowelData.img, cardX, cardY, curW, curH);
          ctx.restore();
        }
      }
    }

    Renderer.prototype._drawShopGuideOverlay = function(game) {
      const ctx = this.ctx;
      const W = this.W;
      const H = this.H;
      const s = this.scale;
      const phase = game.shopGuidePhase;
      const GUIDE_TEXT = '找到女巫了！准备接受她的试炼吧，但一定要小心她的规则约束。';
  
      // 获取聚光灯目标区域（从 shopRenderer 获取，回退到底部中间区域）
      const spotRect = (this.shopRenderer && this.shopRenderer.shopGuideSpotRect)
        ? this.shopRenderer.shopGuideSpotRect
        : { x: 15 * s, y: H * 0.65, w: W - 30 * s, h: 120 * s };
      const spotPad = 10 * s;
      const spotX = spotRect.x - spotPad;
      const spotY = spotRect.y - spotPad;
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
  
      // 女巫引导图片（witch_3 使用精灵图渲染）
      const imgData = this.guideImages.witch_3;
      if (imgData && imgData.loaded && imgData.img) {
        const frameIdx = Math.floor(Date.now() / imgData.frameDelay) % imgData.frameCount;
        const coord = imgData.frameCoords[frameIdx];
        if (coord) {
          ctx.drawImage(imgData.img, coord.x, coord.y, coord.w, coord.h, imgX, imgY, imgW, imgH);
        }
      }
  
      // 对话框背景
      this.roundRect(dialogDrawX, dialogDrawY, dialogW, dialogH, dialogR, '#f5f0e6', '#c4a35a', 2 * s);
  
      // 逐字显示文字
      ctx.save();
      ctx.font = `${Math.floor(17 * s)}px sans-serif`;
      ctx.fillStyle = '#1a2f4a';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';

      const textPad = 18 * s;
      const textX = dialogDrawX + textPad;
      const textY = dialogDrawY + textPad;
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
        '[装备]这张字母词牌可以让字母触发2次计分！但最多只能装备 [3] 张哦。',
        '即使游戏失败，词牌也不会回收的，放心通关吧~',
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
  
      // Phase 3 退场检查：600ms 后结束
      if (phase === 3) {
        const exitElapsed = Date.now() - (game._cardBookGuideExitStartTime || Date.now());
        if (exitElapsed >= 600) {
          game.cardBookGuidePhase = 4;
          game._cardBookGuideExitStartTime = null;
          if (game.storageManager) {
            game.storageManager.saveProgress();
            game.storageManager.saveCardBookGuidePhase(4);
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
      } else if (phase === 3) {
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
        const spotY = spotRect.y - spotPad;
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
        // Phase 3: 全屏蒙层
        ctx.save();
        ctx.fillStyle = `rgba(0, 0, 0, ${overlayAlpha})`;
        ctx.fillRect(0, 0, W, H);
        ctx.restore();
      }
  
      // Phase 1 聚光灯显示期间（500ms~1500ms），只画聚光灯，不弹出女巫；Phase 2 正常显示女巫
      if (phase === 1 && !showWitch) {
        return;
      }
  
      // === Phase 1/2: 女巫帧动画 + 对话框 ===
      const isPhase1 = phase === 1;
      const isPhase2 = phase === 2;
      const fullText = GUIDE_TEXTS[phase] || '';
  
      const POPUP_DURATION = 600;
      const POST_POPUP_DELAY = 500;
      // Phase 1: 文本等弹出动画完成后开始显示；Phase 2: 女巫和对话框保持不动，文本立即开始显示
      const textStartTime = isPhase1
        ? (game._cardBookGuideTextStartTime || Date.now()) + POPUP_DURATION + POST_POPUP_DELAY
        : (game._cardBookGuideText2StartTime || Date.now());
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
      } else if (phase === 2) {
        // Phase 2：女巫和对话框保持显示，不需要重新弹出
        imgX = imgTargetX;
        dialogDrawX = dialogTargetX;
        imgY = imgTargetY;
        dialogDrawY = dialogTargetY;
      } else if (phase === 3) {
        const exitElapsed = Date.now() - (game._cardBookGuideExitStartTime || Date.now());
        const exitProgress = Math.min(exitElapsed / 600, 1);
        const eased = Easing.easeOutBackStrong(exitProgress);
        imgX = imgTargetX - (imgTargetX + imgW) * eased;
        dialogDrawX = dialogTargetX + (W - dialogTargetX) * eased;
        imgY = imgTargetY;
        dialogDrawY = dialogTargetY;
      }
  
      // 女巫引导图片（witch_4 使用精灵图渲染）
      const imgData = this.guideImages.witch_4;
      if (imgData && imgData.loaded && imgData.img) {
        const frameIdx = Math.floor(Date.now() / imgData.frameDelay) % imgData.frameCount;
        const coord = imgData.frameCoords[frameIdx];
        if (coord) {
          ctx.drawImage(imgData.img, coord.x, coord.y, coord.w, coord.h, imgX, imgY, imgW, imgH);
        }
      }
  
      // 对话框背景
      this.roundRect(dialogDrawX, dialogDrawY, dialogW, dialogH, dialogR, '#f5f0e6', '#c4a35a', 2 * s);
  
      // 逐字显示文字（支持 [xxx] 高亮：加粗 + 深紫色）
      ctx.save();
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';

      const textPad = 18 * s;
      const textX = dialogDrawX + textPad;
      const textY = dialogDrawY + textPad;
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
  
      // 倒三角按钮（文字显示完全后才显示，Phase 3 退场时不显示）
      // 对话框区域始终可点击（用于双击跳过打字）
      this.cardBookGuideDialogRect = { x: dialogDrawX, y: dialogDrawY, w: dialogW, h: dialogH };
      this.cardBookGuideNextBtnRect = null;
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
  
        this.cardBookGuideNextBtnRect = { x: dialogDrawX, y: dialogDrawY, w: dialogW, h: dialogH };
      }
    }

};
