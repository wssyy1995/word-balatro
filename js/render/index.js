// ===== Renderer 组装入口 =====
const { Renderer } = require('./base');
const { WITCH_SKILLS } = require('../witch_skills');

require('./effects')(Renderer);
require('./animation')(Renderer);
require('./hud')(Renderer);
require('./playing')(Renderer);
require('./popup')(Renderer);
require('./guide')(Renderer);
require('./cardbook')(Renderer);
require('./debug')(Renderer);

// ===== 主渲染入口 =====
Renderer.prototype.render = function(game) {
    const ctx = this.ctx;
    const W = this.W;
    const H = this.H;
    const s = this.scale;

    // 绘制背景
    ctx.clearRect(0, 0, W, H);
    if (this.bgImage && this.bgLoaded) {
      ctx.drawImage(this.bgImage, 0, 0, W, H);
    } else {
      ctx.fillStyle = '#0a1628';
      ctx.fillRect(0, 0, W, H);
    }
    // 根据状态绘制不同界面
    if (game.state === 'home') {
      this.drawHomePage(game);
    } else if (game.state === 'playing') {
      this.drawHUD(game);
      // 自动触发 HUD 女巫头像星星动画（约束失败时，在 drawHUD 之后触发因为 Rect 在 HUD 中计算）
      if (game._witchStarBurstAuto && this.hudWitchAvatarRect) {
        game._witchStarBurstAuto = false;
        const rect = this.hudWitchAvatarRect;
        game._witchStarBurst = {
          cx: rect.x + rect.w / 2,
          cy: rect.y + rect.h / 2,
          startTime: Date.now(),
        };
      }
      this.drawPlaying(game);
      // 字母之神专属星星飞行动画（在其他女巫牌动画之前）
      if (game._letterGodAnim) {
        this._drawLetterGodAnim(game);
      }
      // 字母置换弹窗（覆盖在游戏页面上方）
      if (game._changeLetterPopup) {
        this.drawChangeLetterPopup(game);
      }
      // hintToast 提示
      this._drawHintToast(game);
    } else if (game.state === 'settlement') {
      // 金币结算弹窗（保留 HUD 背景）
      this.drawHUD(game);
      this.settlementRenderer.draw(ctx, game, W, H, s);
    } else if (game.state === 'witch_reward') {
      // 女巫奖励弹窗
      this.drawHUD(game);
      this.witchRewardRenderer.draw(ctx, game, W, H, s);
    } else if (game.state === 'shop') {
      // 商店页面（显示标题+金币胶囊，不显示目标分 bar）
      this.drawTopHeader(game);

      // 游戏标题
      const top = (this.safeTop || 0) + 20 * s + (this.hasDynamicIsland ? 10 * s : 0);
      const titleY = top - 12 * s + (this.hasDynamicIsland ? 3 * s : 0);
      ctx.save();
      ctx.font = `${Math.floor(22 * s)}px ${this.titleFontFamily}`;
      ctx.fillStyle = '#8b6914';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const shopTitleText = '女巫的词牌';
      ctx.fillText(shopTitleText, W / 2, titleY);
      const shopTitleW = ctx.measureText(shopTitleText).width;
      ctx.restore();

      this._drawCardBookIcon(game, W / 2, titleY, shopTitleW);

      this.shopRenderer.draw(ctx, game, W, H, s);
      // 确认购买弹窗（覆盖在商店上方）
      if (game.confirmBuyItem !== undefined && game.confirmBuyItem !== null) {
        this.confirmBuyRenderer.draw(ctx, game, W, H, s);
      }

      // 商店女巫技能引导触发检查
      if (game.round === 2 && game.shopGuidePhase === 0) {
        game.shopGuidePhase = 1;
        game._shopGuideStartTime = Date.now();
      }
      // 商店引导覆盖层
      if (game.shopGuidePhase >= 1 && game.shopGuidePhase <= 2) {
        this._drawShopGuideOverlay(game);
      } else if (game.shopGuidePhase === 3 && game._shopGuideExitStartTime) {
        const exitElapsed = Date.now() - game._shopGuideExitStartTime;
        if (exitElapsed < 600) {
          // 0~600ms：女巫+对话框弹出去，蒙层保持
          this._drawShopGuideOverlay(game);
        } else if (exitElapsed < 1100) {
          // 600~1100ms：蒙层从 0.75 渐变到透明（500ms 变亮）
          const fadeProgress = (exitElapsed - 600) / 500;
          ctx.save();
          ctx.fillStyle = `rgba(0, 0, 0, ${0.75 * (1 - fadeProgress)})`;
          ctx.fillRect(0, 0, W, H);
          ctx.restore();
        } else {
          // 1100ms 后彻底结束
          game.shopGuidePhase = 4;
          game._shopGuideExitStartTime = null;
          if (game.storageManager) {
            game.storageManager.saveProgress();
            game.storageManager.saveShopGuidePhase(4);
          }
        }
      }

      // 卡牌图鉴引导触发检查（第3关商店）
      if (game.round === 3 && game.cardBookGuidePhase === 0 && game.cardBookUnlocked) {
        game.cardBookGuidePhase = 1;
        game._cardBookGuideStartTime = Date.now();
        game._cardBookGuideTextStartTime = Date.now();
      }
    } else if (game.state === 'potion') {
      this.drawPotion(game);
    } else if (game.state === 'life_extended') {
      // 生命延续：先绘制游戏背景，再叠加闪烁/弹窗
      this.drawHUD(game);
      this.drawPlaying(game);
      this._drawLifeExtensionPopup(game);
    } else if (game.state === 'gameover') {
      // 结束报告弹窗（保留游戏页面背景）
      this.drawHUD(game);
      this.drawPlaying(game);
      this.gameOverRenderer.draw(ctx, game, W, H, s);
    }

    // 绘制动画
    this.updateAnimations();
    
    // 绘制烟花粒子
    this._updateAndDrawSparkles(ctx, s);
    
    // 绘制飞行中的总分
    this._updateAndDrawFlyingScore(ctx, s, game);
    
    // 商店 → 游戏 页面过渡遮罩
    if (game._shopToGameTransition) {
      const elapsed = Date.now() - game._shopToGameTransition.startTime;
      const duration = 800;
      if (elapsed < duration) {
        const progress = elapsed / duration;
        let alpha = 0;
        if (progress < 0.5) {
          // 前半段：商店淡出（遮罩淡入）
          alpha = progress * 2 * 0.2;
        } else {
          // 后半段：游戏淡入（遮罩淡出）
          alpha = (1 - progress) * 2 * 0.2;
        }
        ctx.fillStyle = `rgba(10, 22, 40, ${alpha})`;
        ctx.fillRect(0, 0, W, H);
      } else {
        game._shopToGameTransition = null;
        game._challengeBtnPressed = false;
        if (this.shopRenderer) this.shopRenderer.challengeBtnPressed = false;
      }
    }

    // 云存储调试日志（真机排查用）
    this._drawCloudDebugLogs(ctx, game, s);

    // 新手引导（覆盖在最上层）
    if (game.guidePhase >= 1 && game.guidePhase <= 4) {
      this._drawGuideOverlay(game);
    } else if (game.guidePhase === 5 && game._guideExitStartTime) {
      // Phase 5 退场动画：女巫和对话框弹出去 → 蒙层淡出
      const exitElapsed = Date.now() - game._guideExitStartTime;
      if (exitElapsed < 600) {
        // 0~600ms：女巫+对话框弹出去，蒙层保持
        this._drawGuideOverlay(game);
      } else if (exitElapsed < 1100) {
        // 600~1100ms：蒙层从 0.75 渐变到透明（500ms 变亮）
        const fadeProgress = (exitElapsed - 600) / 500;
        ctx.save();
        ctx.fillStyle = `rgba(0, 0, 0, ${0.75 * (1 - fadeProgress)})`;
        ctx.fillRect(0, 0, W, H);
        ctx.restore();
      }
      // 1100ms 后彻底结束，不再绘制引导层
    }

    // 卡牌图鉴弹窗（使用 _drawModalPanel 标准弹窗框架）
    if (game.cardBookOpen) {
      const elapsed = game._closingCardBook ? 99999 : Date.now() - (game._cardBookAnimStartTime || Date.now());

      // 根据图片比例计算面板尺寸
      let panelW = 320;
      let panelH = 440;
      if (this.cardBookImage && this.cardBookImageLoaded) {
        const maxBookW = W * 0.88;
        const maxBookH = H * 0.75;
        const imgAspect = this.cardBookImage.width / this.cardBookImage.height;
        let bookW = maxBookW;
        let bookH = bookW / imgAspect;
        if (bookH > maxBookH) {
          bookH = maxBookH;
          bookW = bookH * imgAspect;
        }
        panelW = Math.round(bookW / s);
        panelH = Math.round(bookH / s);
      }

      // 图鉴引导阶段（Phase 1~3），card_book 不画自己的遮罩，由 guide evenodd 蒙层统一控制背景暗化
      const isGuideOverlay = game.cardBookGuidePhase >= 1 && game.cardBookGuidePhase <= 3;
      const panel = this._drawModalPanel(ctx, W, H, s, {
        isClosing: game._closingCardBook,
        closeStartTime: game._closeCardBookStartTime,
        width: panelW,
        height: panelH,
        bgColor: null,
        borderColor: null,
        overlayAlpha: isGuideOverlay ? 0 : 0.78,
        closeDuration: 300,
        elapsed,
        onCloseComplete: () => {
          game.cardBookOpen = false;
          game._closingCardBook = false;
          game._cardBookAnimStartTime = null;
        }
      });

      if (!panel) return;
      const { px, py, pw, ph } = panel;
      this.cardBookPanelRect = { x: px, y: py, w: pw, h: ph };

      // 内容快速消失（100ms），独立于蒙层的 300ms
      const contentCloseElapsed = game._closingCardBook ? Date.now() - (game._closeCardBookStartTime || Date.now()) : 0;
      const contentCloseProgress = Math.min(contentCloseElapsed / 100, 1);
      const contentAlpha = 1 - contentCloseProgress;

      if (contentAlpha > 0) {
        ctx.save();
        ctx.globalAlpha = contentAlpha;

      // 绘制 card_book.png 背景
      if (this.cardBookImage && this.cardBookImageLoaded) {
        const imgAspect = this.cardBookImage.width / this.cardBookImage.height;
        const panelAspect = pw / ph;
        let drawW, drawH, drawX, drawY;
        if (imgAspect > panelAspect) {
          drawW = pw;
          drawH = drawW / imgAspect;
          drawX = px;
          drawY = py + (ph - drawH) / 2;
        } else {
          drawH = ph;
          drawW = drawH * imgAspect;
          drawX = px + (pw - drawW) / 2;
          drawY = py;
        }
        ctx.drawImage(this.cardBookImage, drawX, drawY, drawW, drawH);
      }

      // === 图鉴内容：4 格布局 + 翻页 ===
      const allLevels = WITCH_SKILLS.map(s => s.level);
      const itemsPerPage = 4;
      const totalPages = Math.ceil(allLevels.length / itemsPerPage);
      const page = Math.min(game.cardBookPage || 0, totalPages - 1);
      const pageLevels = allLevels.slice(page * itemsPerPage, (page + 1) * itemsPerPage);

      // 内容区域（在面板内部，留出边距给背景图边框）
      const contentPad = 36 * s;
      const contentX = px + contentPad;
      const contentY = py + contentPad;
      const contentW = pw - contentPad * 2;
      const contentH = ph - contentPad * 2;
      const cellGap = 12 * s;

      // 固定格子宽高比为 3:4（竖向），优先以宽度计算
      let cellW = (contentW - cellGap) / 2;
      let cellH = cellW * 4 / 3;
      // 若高度溢出，则以高度为基准回退
      const maxCellH = (contentH - cellGap) / 2;
      if (cellH > maxCellH) {
        cellH = maxCellH;
        cellW = cellH * 3 / 4;
      }

      // 等比例扩大约 14.6%（原 11.3% + 3%）
      cellW *= 1.146;
      cellH *= 1.146;

      // 左右列向外撑开一点
      const spreadOffset = 20 * s;

      // 内容居中
      const gridW = cellW * 2 + cellGap + spreadOffset * 2;
      const gridH = cellH * 2 + cellGap;
      const offsetX = (contentW - gridW) / 2;
      const offsetY = (contentH - gridH) / 2 + 3;

      const cellPositions = [
        { x: contentX + offsetX, y: contentY + offsetY },                                    // 左上
        { x: contentX + offsetX, y: contentY + offsetY + cellH + cellGap - 4 },              // 左下（再向上 2px）
        { x: contentX + offsetX + cellW + cellGap + spreadOffset * 2, y: contentY + offsetY },           // 右上
        { x: contentX + offsetX + cellW + cellGap + spreadOffset * 2, y: contentY + offsetY + cellH + cellGap - 4 }, // 右下（再向上 2px）
      ];

      // 四边 padding（像素值，不乘 s，保持视觉一致）
      const cardPadding = 3;

      // 记录已解锁卡牌的点击区域（用于详情弹窗）
      this.cardBookCellRects = [];

      pageLevels.forEach((level, i) => {
        const pos = { ...cellPositions[i] };
        if (game._cardBookCellPressed === level) pos.y -= 3 * s;
        const isUnlocked = game.collectedWitchCards.includes(level);
        const isPressed = game._cardBookCellPressed === level;
        const cardName = `witch_card_${level}`;
        const cardData = this.witchCardImages[cardName];

        ctx.save();
        // 圆角裁剪
        const r = 6 * s;
        ctx.beginPath();
        ctx.moveTo(pos.x + r, pos.y);
        ctx.lineTo(pos.x + cellW - r, pos.y);
        ctx.quadraticCurveTo(pos.x + cellW, pos.y, pos.x + cellW, pos.y + r);
        ctx.lineTo(pos.x + cellW, pos.y + cellH - r);
        ctx.quadraticCurveTo(pos.x + cellW, pos.y + cellH, pos.x + cellW - r, pos.y + cellH);
        ctx.lineTo(pos.x + r, pos.y + cellH);
        ctx.quadraticCurveTo(pos.x, pos.y + cellH, pos.x, pos.y + cellH - r);
        ctx.lineTo(pos.x, pos.y + r);
        ctx.quadraticCurveTo(pos.x, pos.y, pos.x + r, pos.y);
        ctx.closePath();
        ctx.clip();

        if (isUnlocked && cardData && cardData.loaded && cardData.img) {
          // 已解锁：绘制 witch_card 图片（contain 模式，完整显示 + 3px 四边 padding）
          const imgAspect = cardData.width / cardData.height;
          const drawAreaW = cellW - cardPadding * 2;
          const drawAreaH = cellH - cardPadding * 2;
          const areaAspect = drawAreaW / drawAreaH;
          let dw, dh, dx, dy;
          if (imgAspect > areaAspect) {
            // 图片更宽，以宽度为基准
            dw = drawAreaW;
            dh = dw / imgAspect;
            dx = pos.x + cardPadding;
            dy = pos.y + cardPadding + (drawAreaH - dh) / 2;
          } else {
            // 图片更高，以高度为基准
            dh = drawAreaH;
            dw = dh * imgAspect;
            dx = pos.x + cardPadding + (drawAreaW - dw) / 2;
            dy = pos.y + cardPadding;
          }
          ctx.drawImage(cardData.img, dx, dy, dw, dh);
        } else {
          // 未解锁：灰色占位 + 锁图标
          ctx.fillStyle = 'rgba(180, 170, 150, 0.25)';
          ctx.fillRect(pos.x, pos.y, cellW, cellH);
          ctx.fillStyle = 'rgba(140, 130, 110, 0.4)';
          ctx.font = `bold ${Math.floor(20 * s)}px sans-serif`;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText('?', pos.x + cellW / 2, pos.y + cellH / 2);
        }
        ctx.restore();

        // 记录已解锁卡牌点击区域（使用原始位置，不受按下偏移影响）
        if (isUnlocked) {
          this.cardBookCellRects.push({ x: cellPositions[i].x, y: cellPositions[i].y, w: cellW, h: cellH, level, isUnlocked: true });
        }

        // 格子细边框
        ctx.save();
        ctx.strokeStyle = isUnlocked ? 'rgba(196,163,90,0.35)' : 'rgba(140,130,110,0.2)';
        ctx.lineWidth = 1 * s;
        ctx.beginPath();
        ctx.moveTo(pos.x + r, pos.y);
        ctx.lineTo(pos.x + cellW - r, pos.y);
        ctx.quadraticCurveTo(pos.x + cellW, pos.y, pos.x + cellW, pos.y + r);
        ctx.lineTo(pos.x + cellW, pos.y + cellH - r);
        ctx.quadraticCurveTo(pos.x + cellW, pos.y + cellH, pos.x + cellW - r, pos.y + cellH);
        ctx.lineTo(pos.x + r, pos.y + cellH);
        ctx.quadraticCurveTo(pos.x, pos.y + cellH, pos.x, pos.y + cellH - r);
        ctx.lineTo(pos.x, pos.y + r);
        ctx.quadraticCurveTo(pos.x, pos.y, pos.x + r, pos.y);
        ctx.closePath();
        ctx.stroke();
        ctx.restore();

        // 选中态闪烁小星星（随机分布在卡牌上）
        if (isPressed) {
          const time = Date.now();
          const pr = (seed) => {
            const x = Math.sin(seed * 127.1 + 311.7) * 43758.5453;
            return x - Math.floor(x);
          };
          const starCount = 6;
          const edgeThick = 12 * s;
          const margin = 4 * s;
          for (let i = 0; i < starCount; i++) {
            const isHorizontalEdge = pr(level * 10 + i + 200) < 0.5;
            let sx, sy;
            if (isHorizontalEdge) {
              const isTop = pr(level * 10 + i + 250) < 0.5;
              sx = pos.x + pr(level * 10 + i + 300) * cellW;
              sy = isTop
                ? pos.y + margin + pr(level * 10 + i + 350) * edgeThick
                : pos.y + cellH - margin - pr(level * 10 + i + 350) * edgeThick;
            } else {
              const isLeft = pr(level * 10 + i + 250) < 0.5;
              sx = isLeft
                ? pos.x + margin + pr(level * 10 + i + 350) * edgeThick
                : pos.x + cellW - margin - pr(level * 10 + i + 350) * edgeThick;
              sy = pos.y + pr(level * 10 + i + 300) * cellH;
            }
            const offset = i * 80;
            const size = 2.8 * s;
            const alpha = 0.25 + 0.75 * Math.abs(Math.sin((time + offset) / 400));
            ctx.save();
            // 菱形星心
            ctx.fillStyle = `rgba(255, 240, 180, ${alpha})`;
            ctx.beginPath();
            ctx.moveTo(sx, sy - size);
            ctx.lineTo(sx + size * 0.5, sy);
            ctx.lineTo(sx, sy + size);
            ctx.lineTo(sx - size * 0.5, sy);
            ctx.closePath();
            ctx.fill();
            // 十字光芒
            ctx.strokeStyle = `rgba(255, 240, 180, ${alpha * 0.6})`;
            ctx.lineWidth = 0.8 * s;
            ctx.lineCap = 'round';
            ctx.beginPath();
            ctx.moveTo(sx - size * 1.6, sy);
            ctx.lineTo(sx + size * 1.6, sy);
            ctx.moveTo(sx, sy - size * 1.6);
            ctx.lineTo(sx, sy + size * 1.6);
            ctx.stroke();
            ctx.restore();
          }
        }

        // 已装备标识（右上角小标签）
        if (isUnlocked && game.equippedWitchCard === level) {
          ctx.save();
          const tagH = 16 * s;
          const tagPad = 4 * s;
          ctx.font = `bold ${Math.floor(9 * s)}px sans-serif`;
          const tagText = '已装备';
          const tagTextW = ctx.measureText(tagText).width;
          const tagW = tagTextW + tagPad * 2;
          const tagX = pos.x + cellW - tagW - 3 * s;
          const tagY = pos.y + 3 * s;

          ctx.fillStyle = 'rgba(107,76,138,0.9)';
          ctx.beginPath();
          const tr = 3 * s;
          ctx.moveTo(tagX + tr, tagY);
          ctx.lineTo(tagX + tagW - tr, tagY);
          ctx.quadraticCurveTo(tagX + tagW, tagY, tagX + tagW, tagY + tr);
          ctx.lineTo(tagX + tagW, tagY + tagH - tr);
          ctx.quadraticCurveTo(tagX + tagW, tagY + tagH, tagX + tagW - tr, tagY + tagH);
          ctx.lineTo(tagX + tr, tagY + tagH);
          ctx.quadraticCurveTo(tagX, tagY + tagH, tagX, tagY + tagH - tr);
          ctx.lineTo(tagX, tagY + tr);
          ctx.quadraticCurveTo(tagX, tagY, tagX + tr, tagY);
          ctx.closePath();
          ctx.fill();

          ctx.fillStyle = '#fff';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(tagText, tagX + tagW / 2, tagY + tagH / 2);
          ctx.restore();
        }
      });

      // 翻页按钮（面板左右两侧）
      const btnSize = 28 * s;
      const btnY = py + ph / 2 - btnSize / 2;
      this.cardBookPrevBtnRect = null;
      this.cardBookNextBtnRect = null;
      const hitPadding = 16 * s;

      // 左按钮（嵌入面板左边缘内侧 10*s）
      if (page > 0) {
        const btnX = px - btnSize + 10 * s;
        if (this.cardBookLeftBtn && this.cardBookLeftBtnLoaded) {
          ctx.drawImage(this.cardBookLeftBtn, btnX, btnY, btnSize, btnSize);
        }
        this.cardBookPrevBtnRect = { x: btnX - hitPadding, y: btnY - hitPadding, w: btnSize + hitPadding * 2, h: btnSize + hitPadding * 2 };
      }

      // 右按钮（嵌入面板右边缘内侧 10*s）
      if (page < totalPages - 1) {
        const btnX = px + pw - 10 * s;
        if (this.cardBookRightBtn && this.cardBookRightBtnLoaded) {
          ctx.drawImage(this.cardBookRightBtn, btnX, btnY, btnSize, btnSize);
        }
        this.cardBookNextBtnRect = { x: btnX - hitPadding, y: btnY - hitPadding, w: btnSize + hitPadding * 2, h: btnSize + hitPadding * 2 };
      }

      // 右上角关闭按钮（图片）
      const closeBtnSize = 28 * s;
      const closeBtnX = px + pw - closeBtnSize - 10 * s + 12;
      const closeBtnY = py + 10 * s - 16;
      const cbPressOffset = game._cardBookCloseBtnPressed ? 2 * s : 0;
      ctx.save();
      if (this.popCloseLoaded && this.popCloseImage) {
        ctx.drawImage(this.popCloseImage, closeBtnX, closeBtnY + cbPressOffset, closeBtnSize, closeBtnSize);
      } else {
        // 兜底：绘制圆形背景 + X
        ctx.beginPath();
        ctx.arc(closeBtnX + closeBtnSize / 2, closeBtnY + cbPressOffset + closeBtnSize / 2, closeBtnSize / 2, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(48, 35, 22, 0.7)';
        ctx.fill();
        ctx.strokeStyle = 'rgba(40, 28, 18, 0.85)';
        ctx.lineWidth = 1 * s;
        ctx.stroke();
        const xPad = 8 * s;
        ctx.strokeStyle = 'rgba(245, 240, 230, 0.9)';
        ctx.lineWidth = 1.5 * s;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(closeBtnX + xPad, closeBtnY + cbPressOffset + xPad);
        ctx.lineTo(closeBtnX + closeBtnSize - xPad, closeBtnY + cbPressOffset + closeBtnSize - xPad);
        ctx.moveTo(closeBtnX + closeBtnSize - xPad, closeBtnY + cbPressOffset + xPad);
        ctx.lineTo(closeBtnX + xPad, closeBtnY + cbPressOffset + closeBtnSize - xPad);
        ctx.stroke();
      }
      ctx.restore();
      this.cardBookCloseBtnRect = { x: closeBtnX - 3, y: closeBtnY - 3, w: closeBtnSize + 6, h: closeBtnSize + 6 };

      // 卡牌详情弹窗（覆盖在图鉴内容之上）
      if (game._cardBookDetailLevel && !game._closingCardBook) {
        this._drawCardBookDetail(ctx, game, W, H, s);
      }

        ctx.restore();
      }
    }

    // 卡牌图鉴引导覆盖层（覆盖在 card_book 弹窗之上）
    // Phase 1: 高亮图标 + 女巫弹出 + 第一段文本
    // Phase 2: 女巫 + 第二段文本
    // Phase 3: 退场动画
    // Phase 4: 结束，不再渲染
    if (game.cardBookGuidePhase >= 1 && game.cardBookGuidePhase <= 3) {
      this._drawCardBookGuideOverlay(game);
    }

    // 设置弹窗
    if (game._settingsPopup) {
      this.drawSettingsPopup(game);
    }

    // 调试菜单（最后绘制，确保在最上层）
    if (this.debugMenuOpen && this.topIconRect) {
      this._drawDebugMenu(ctx, game, this.topIconRect.x, this.topIconRect.y + this.topIconRect.h + 4 * s, s);
    }

    // 绘制排行榜弹窗（好友/全球 Tab 切换）
    if (game._rankPopup) {
      this.drawRankPopup(game);
    }

    // 用户信息获取弹窗（最高优先级，最后绘制）
    if (game._userInfoPopup) {
      this.drawUserInfoPopup(game);
    }
  };

  // ===== 排行榜弹窗（主域绘制，统一框架 + Tab 切换） =====
  Renderer.prototype.drawRankPopup = function(game) {
    const ctx = this.ctx;
    const W = this.W;
    const H = this.H;
    const s = this.scale;

    const panelW = Math.min(W * 0.9, 340 * s);
    const panelH = Math.min(H * 0.75, 520 * s);
    const panelX = (W - panelW) / 2;
    const panelY = (H - panelH) / 2;

    // 背景遮罩
    ctx.fillStyle = 'rgba(0, 0, 0, 0.55)';
    ctx.fillRect(0, 0, W, H);

    // 弹窗背景
    this.roundRect(panelX, panelY, panelW, panelH, 16 * s, '#2a2a3a', '#4a4a6a');

    // 标题
    ctx.fillStyle = '#f5f0e6';
    ctx.font = `bold ${Math.floor(22 * s)}px Georgia, serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillText('排行榜', W / 2, panelY + 18 * s);

    // Tab 按钮
    const tabW = 80 * s;
    const tabH = 32 * s;
    const tabY = panelY + 50 * s;
    const tabGap = 8 * s;
    const totalTabW = tabW * 2 + tabGap;
    const tabStartX = W / 2 - totalTabW / 2;
    const isFriend = game._rankTab === 'friend';

    // 好友 Tab
    const friendX = tabStartX;
    this.roundRect(friendX, tabY, tabW, tabH, 6 * s, isFriend ? '#c4a35a' : 'rgba(255,255,255,0.08)', null);
    ctx.fillStyle = isFriend ? '#1a2f4a' : '#ccc';
    ctx.font = `bold ${Math.floor(13 * s)}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('好友', friendX + tabW / 2, tabY + tabH / 2);

    // 全球 Tab
    const globalX = tabStartX + tabW + tabGap;
    this.roundRect(globalX, tabY, tabW, tabH, 6 * s, !isFriend ? '#c4a35a' : 'rgba(255,255,255,0.08)', null);
    ctx.fillStyle = !isFriend ? '#1a2f4a' : '#ccc';
    ctx.fillText('全球', globalX + tabW / 2, tabY + tabH / 2);

    // 记录点击区域
    this.rankTabFriendRect = { x: friendX, y: tabY, w: tabW, h: tabH };
    this.rankTabGlobalRect = { x: globalX, y: tabY, w: tabW, h: tabH };

    // 关闭按钮
    const closeSize = 28 * s;
    const closeX = panelX + panelW - closeSize - 14 * s;
    const closeY = panelY + 14 * s;
    ctx.fillStyle = 'rgba(255,107,107,0.9)';
    ctx.beginPath();
    ctx.arc(closeX + closeSize / 2, closeY + closeSize / 2, closeSize / 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.font = `bold ${Math.floor(closeSize * 0.65)}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('×', closeX + closeSize / 2, closeY + closeSize / 2 - 2 * s);
    this.rankCloseBtnRect = { x: closeX - 3, y: closeY - 3, w: closeSize + 6, h: closeSize + 6 };

    // 表头
    const rowH = 52 * s;
    const headerY = panelY + 90 * s;
    const contentX = panelX + 16 * s;
    const contentW = panelW - 32 * s;

    ctx.fillStyle = 'rgba(196,163,90,0.15)';
    ctx.fillRect(contentX, headerY, contentW, rowH);

    ctx.fillStyle = '#c4a35a';
    ctx.font = `bold ${Math.floor(14 * s)}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('排名', contentX + contentW * 0.12, headerY + rowH / 2);
    ctx.fillText('玩家', contentX + contentW * 0.45, headerY + rowH / 2);
    ctx.textAlign = 'right';
    ctx.fillText('分数', contentX + contentW * 0.92, headerY + rowH / 2);

    // 内容区域
    const listY = headerY + rowH + 4 * s;
    const listHeight = panelY + panelH - listY - 16 * s;

    if (isFriend) {
      // 贴入开放数据域的好友列表
      const odc = wx.getOpenDataContext ? wx.getOpenDataContext() : null;
      if (odc && odc.canvas) {
        ctx.save();
        ctx.imageSmoothingEnabled = false;
        const dprScale = this.dpr || 1;
        ctx.drawImage(odc.canvas,
          0, 0, Math.floor(contentW * dprScale), Math.floor(listHeight * dprScale),
          contentX, listY, contentW, listHeight
        );
        ctx.restore();
      }
    } else {
      // 绘制全球榜列表
      this._drawGlobalRankList(ctx, game, contentX, listY, contentW, listHeight, rowH, s);
    }
  };

  // ===== 用户信息获取弹窗（已简化为 DOM 按钮覆盖模式，Canvas 层不再绘制内容）=====
  Renderer.prototype.drawUserInfoPopup = function(game) {
    // 授权按钮由 createUserInfoButton DOM 元素直接覆盖在主页"开始游戏"按钮位置
    // 此处不再绘制任何内容
  };

  Renderer.prototype._drawGlobalRankList = function(ctx, game, x, y, w, h, rowH, s) {
    const data = game._globalRankData;
    if (!data || data.length === 0) {
      ctx.fillStyle = '#888';
      ctx.font = `${Math.floor(14 * s)}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(game._globalRankLoading ? '加载中...' : '暂无数据', x + w / 2, y + h / 2);
      return;
    }

    const maxRows = Math.floor(h / rowH);
    for (let i = 0; i < Math.min(data.length, maxRows); i++) {
      const player = data[i];
      const rowY = y + i * rowH;
      const isSelf = player.openid === game._selfOpenId;

      // 行背景
      if (isSelf) {
        ctx.fillStyle = 'rgba(196, 163, 90, 0.18)';
        ctx.fillRect(x, rowY, w, rowH);
      } else if (i % 2 === 1) {
        ctx.fillStyle = 'rgba(255,255,255,0.04)';
        ctx.fillRect(x, rowY, w, rowH);
      }

      // 排名
      ctx.fillStyle = i < 3 ? '#ffd700' : '#aaa';
      ctx.font = `bold ${Math.floor(14 * s)}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(String(player.rank), x + w * 0.12, rowY + rowH / 2);

      // 头像
      const avatarX = x + w * 0.32;
      const avatarY = rowY + rowH / 2;
      const avatarR = Math.min(rowH * 0.35, 18 * s);
      const cachedImg = game._avatarCache && game._avatarCache[player.openid];
      if (cachedImg) {
        ctx.save();
        ctx.beginPath();
        ctx.arc(avatarX, avatarY, avatarR, 0, Math.PI * 2);
        ctx.clip();
        ctx.drawImage(cachedImg, avatarX - avatarR, avatarY - avatarR, avatarR * 2, avatarR * 2);
        ctx.restore();
      } else {
        ctx.fillStyle = '#555';
        ctx.beginPath();
        ctx.arc(avatarX, avatarY, avatarR, 0, Math.PI * 2);
        ctx.fill();
      }

      // 昵称
      ctx.fillStyle = isSelf ? '#f5f0e6' : '#ccc';
      ctx.font = `${Math.floor(12 * s)}px sans-serif`;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      const nick = player.nickname || '匿名';
      ctx.fillText(nick.length > 5 ? nick.slice(0, 5) + '…' : nick, x + w * 0.42, rowY + rowH / 2);

      // 分数
      ctx.fillStyle = '#fff';
      ctx.font = `bold ${Math.floor(13 * s)}px sans-serif`;
      ctx.textAlign = 'right';
      ctx.textBaseline = 'middle';
      ctx.fillText(String(player.score), x + w * 0.92, rowY + rowH / 2);
    }
  };

  // ===== 游戏主页 =====
  Renderer.prototype.drawHomePage = function(game) {
    const ctx = this.ctx;
    const W = this.W;
    const H = this.H;
    const s = this.scale;

    // 背景
    if (this.homePageLoaded && this.homePageImage) {
      ctx.drawImage(this.homePageImage, 0, 0, W, H);
    } else {
      ctx.fillStyle = '#1a2f4a';
      ctx.fillRect(0, 0, W, H);
    }

    // 按钮尺寸
    const btnW = 160 * s;
    const btnGap = 20 * s;

    // home_start 按钮
    const startH = this.homeStartLoaded && this.homeStartImage
      ? btnW * (this.homeStartImage.height / this.homeStartImage.width)
      : 48 * s;
    const startX = (W - btnW) / 2;
    const startY = H * 0.6 - startH / 2;
    const startPress = game._homeStartPressed ? 2 * s : 0;

    if (this.homeStartLoaded && this.homeStartImage) {
      ctx.drawImage(this.homeStartImage, startX, startY + startPress, btnW, startH);
    } else {
      ctx.fillStyle = '#c4a35a';
      this.roundRect(startX, startY + startPress, btnW, startH, 8 * s, '#c4a35a', null);
      ctx.fillStyle = '#1a2f4a';
      ctx.font = `bold ${Math.floor(16 * s)}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('开始游戏', startX + btnW / 2, startY + startPress + startH / 2);
    }
    this.homeStartRect = { x: startX, y: startY, w: btnW, h: startH };

    // home_ranking 按钮（授权模式下由 DOM 按钮覆盖，不绘制）
    const rankingH = this.homeRankingLoaded && this.homeRankingImage
      ? btnW * (this.homeRankingImage.height / this.homeRankingImage.width)
      : 48 * s;
    const rankingX = (W - btnW) / 2;
    const rankingY = startY + startH + btnGap;

    if (!game._userInfoPopup) {
      const rankingPress = game._homeRankingPressed ? 2 * s : 0;
      if (this.homeRankingLoaded && this.homeRankingImage) {
        ctx.drawImage(this.homeRankingImage, rankingX, rankingY + rankingPress, btnW, rankingH);
      } else {
        ctx.fillStyle = 'rgba(255,255,255,0.15)';
        this.roundRect(rankingX, rankingY + rankingPress, btnW, rankingH, 8 * s, 'rgba(255,255,255,0.15)', null);
        ctx.fillStyle = '#ccc';
        ctx.font = `bold ${Math.floor(16 * s)}px sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('排行榜', rankingX + btnW / 2, rankingY + rankingPress + rankingH / 2);
      }
    }
    this.homeRankingRect = { x: rankingX, y: rankingY, w: btnW, h: rankingH };
  };

module.exports = { Renderer };
