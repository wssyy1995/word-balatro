// ===== Renderer 组装入口 =====
const { Renderer } = require('./base');
const { WITCH_SKILLS, getSkillForLevel } = require('../witch_skills');

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

    // 同步已装备女巫卡牌对应的字母集合（影响字母牌模板）
    this._updateEquippedLetters(game);

    // 绘制背景
    ctx.clearRect(0, 0, W, H);
    if (this.bgImage && this.bgLoaded) {
      ctx.drawImage(this.bgImage, 0, 0, W, H);
    } else {
      ctx.fillStyle = '#0a1628';
      ctx.fillRect(0, 0, W, H);
    }
    // 根据状态绘制不同界面
    if (game.state === 'playing') {
      ctx.save();
      ctx.translate(0, 10);

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
      // toast 飞行星星动画
      this._drawToastFlyStar();

      // 绘制烟花粒子（今日新词弹窗会自行绘制其烟花，避免被弹窗背景遮挡）
      if (!game._dailyWordsPopup) {
        this._updateAndDrawSparkles(ctx, s);
      }

      // 绘制飞行中的总分
      this._updateAndDrawFlyingScore(ctx, s, game);

      ctx.restore();

      // 新手引导（覆盖在游戏页最上层，必须在 restore 之后绘制，避免被 translate(0,10) 下移导致顶部露白）
      if (game._guideEnabled && game.guidePhase >= 1 && game.guidePhase <= 4) {
        this._drawGuideOverlay(game);
      } else if (game.guidePhase === 5 && game._guideExitStartTime) {
        const exitElapsed = Date.now() - game._guideExitStartTime;
        if (exitElapsed < 600) {
          this._drawGuideOverlay(game);
        } else if (exitElapsed < 1100) {
          const fadeProgress = (exitElapsed - 600) / 500;
          ctx.save();
          ctx.fillStyle = `rgba(0, 0, 0, ${0.75 * (1 - fadeProgress)})`;
          ctx.fillRect(0, 0, W, H);
          ctx.restore();
        }
      }

      // 字母置换弹窗（覆盖在游戏页面上方，独立模态弹窗，不下移）
      if (game._changeLetterPopup) {
        this.drawChangeLetterPopup(game);
      }
    } else if (game.state === 'settlement') {
      // 金币结算弹窗（保留 HUD 背景，与 playing 状态统一下移 10px，避免背景元素突变）
      ctx.save();
      ctx.translate(0, 10);
      this.drawHUD(game);
      ctx.restore();
      this.settlementRenderer.draw(ctx, game, W, H, s);
    } else if (game.state === 'witch_reward') {
      // 女巫奖励弹窗（现在从商店页延迟弹出，背景保持商店页）
      this._drawShopBackground(game);
      this.witchRewardRenderer.draw(ctx, game, W, H, s);
    } else if (game.state === 'shop') {
      // 获得新词牌弹窗：复用之前女巫奖励的弹出时机，背景与结算弹窗一致（只显示 HUD）
      // 包含 settlement 关闭后到弹窗出现前的 200ms 延迟，避免背景突变为商店
      // "获得新词牌"弹窗阶段：弹窗显示中/弹出前，保持 HUD 背景；弹窗关闭后一律进入商店背景
      const isNewWitchCardPhase = game._newWitchCardPopup || (game._pendingWitchRewardDelay && !game._newWitchCardPopupClosed && !game._witchRewardDelayStartTime);

      ctx.save();
      ctx.translate(0, 10);

      if (isNewWitchCardPhase) {
        this.drawHUD(game);
      } else {
        // 商店页面背景 + 内容
        this._drawShopBackground(game);
        // 商店页女巫牌详情弹窗（含右上角售出按钮）
        this._drawWitchDetailPopup(ctx, game, s);

        // 女巫奖励延迟 600ms 进入；图鉴引导进行中（Phase 1~4）时暂停计时
        if (game._pendingWitchRewardDelay && !game._closingNewWitchCardPopup) {
          if (game.cardBookGuidePhase >= 1 && game.cardBookGuidePhase <= 4) {
            // 图鉴引导优先，重置计时起点，等引导结束后再开始 600ms 延迟
            game._witchRewardDelayStartTime = null;
          } else {
            if (!game._witchRewardDelayStartTime) {
              game._witchRewardDelayStartTime = Date.now();
            }
            const delayElapsed = Date.now() - game._witchRewardDelayStartTime;
            // 图鉴引导触发后的女巫奖励延迟为 400ms，其他情况保持 600ms
            const rewardDelay = game._witchRewardDelayAfterGuide ? 400 : 600;
            if (delayElapsed >= rewardDelay) {
              game._pendingWitchRewardDelay = false;
              game._witchRewardDelayStartTime = null;
              game._witchRewardDelayAfterGuide = false;
              const witchSkill = getSkillForLevel(game.round, game._shuffledSkills);
              // 临时仅第 3 关发放女巫奖励
              if (witchSkill && game.witchSkillPassed && game.round === 3) {
                game.witchRewardData = {
                  skill: witchSkill,
                  phase: 'gift',
                  giftStartTime: Date.now(),
                  startTime: Date.now(),
                  result: null,
                  rewardItem: null,
                };
                game.state = 'witch_reward';
              }
            }
          }
        }
      }

      // 商店女巫技能引导触发检查（获得新词牌弹窗期间不触发）
      if (!game._newWitchCardPopup && game.round === 2 && game.shopGuidePhase === 0) {
        game.shopGuidePhase = 1;
        game._shopGuideStartTime = Date.now();
      }
      // 卡牌图鉴引导触发检查（第3关商店）
      // 若正在等待女巫奖励，必须等"获得新词牌"弹窗关闭后才触发；
      // 若没有女巫奖励，进入商店后直接触发。
      if (!game._newWitchCardPopup && game.round === 3 && game.cardBookGuidePhase === 0 && game.cardBookUnlocked) {
        const canTriggerGuide = !game._pendingWitchRewardDelay || game._newWitchCardPopupClosed;
        if (canTriggerGuide) {
          game.cardBookGuidePhase = 1;
          game._cardBookGuideStartTime = Date.now();
          game._cardBookGuideTextStartTime = Date.now();
          // 如果正在排队等待女巫奖励，先暂停计时，等引导结束后改为 400ms 延迟
          if (game._pendingWitchRewardDelay) {
            game._witchRewardDelayStartTime = null;
            game._witchRewardDelayAfterGuide = true;
          }
        }
      }

      // 绘制烟花粒子（今日新词弹窗会自行绘制其烟花，避免被弹窗背景遮挡）
      if (!game._dailyWordsPopup) {
        this._updateAndDrawSparkles(ctx, s);
      }

      // 绘制飞行中的总分
      this._updateAndDrawFlyingScore(ctx, s, game);

      ctx.restore();

      // 商店引导覆盖层（必须在 restore 之后绘制，避免蒙层被 translate(0,10) 下移导致顶部露白）
      if (!game._newWitchCardPopup && game.shopGuidePhase >= 1 && game.shopGuidePhase <= 2) {
        this._drawShopGuideOverlay(game);
      } else if (!game._newWitchCardPopup && game.shopGuidePhase === 3 && game._shopGuideExitStartTime) {
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

      // 独立模态弹窗：获得新词牌、确认购买（不下移）
      if (isNewWitchCardPhase && game._newWitchCardPopup) {
        this._drawNewWitchCardPopup(game);
      }
      if (game.confirmBuyItem !== undefined && game.confirmBuyItem !== null) {
        this.confirmBuyRenderer.draw(ctx, game, W, H, s);
      }
    } else if (game.state === 'potion') {
      this.drawPotion(game);
    } else if (game.state === 'life_extended') {
      // 生命延续：先绘制游戏背景，再叠加闪烁/弹窗
      ctx.save();
      ctx.translate(0, 10);
      this.drawHUD(game);
      this.drawPlaying(game);

      // 绘制烟花粒子（今日新词弹窗会自行绘制其烟花，避免被弹窗背景遮挡）
      if (!game._dailyWordsPopup) {
        this._updateAndDrawSparkles(ctx, s);
      }

      // 绘制飞行中的总分
      this._updateAndDrawFlyingScore(ctx, s, game);

      ctx.restore();
      this._drawLifeExtensionPopup(game);
    } else if (game.state === 'gameover') {
      // 结束报告弹窗（保留游戏页面背景）
      this.drawHUD(game);
      this.drawPlaying(game);
      this.gameOverRenderer.draw(ctx, game, W, H, s);
    }

    // 绘制动画
    this.updateAnimations();
    
    // 绘制烟花粒子（今日新词弹窗会自行绘制其烟花，避免被弹窗背景遮挡）
    // playing/shop/life_extended 状态下已在各自分支中绘制
    if (!game._dailyWordsPopup && game.state !== 'playing' && game.state !== 'shop' && game.state !== 'life_extended') {
      this._updateAndDrawSparkles(ctx, s);
    }
    
    // 绘制飞行中的总分
    // playing/shop/life_extended 状态下已在各自分支中绘制
    if (game.state !== 'playing' && game.state !== 'shop' && game.state !== 'life_extended') {
      this._updateAndDrawFlyingScore(ctx, s, game);
    }
    
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
        panelH = Math.round(bookH / s) + 70;
      }

      // 图鉴引导阶段（Phase 1~4），card_book 不画自己的遮罩，由 guide evenodd 蒙层统一控制背景暗化
      const isGuideOverlay = game.cardBookGuidePhase >= 1 && game.cardBookGuidePhase <= 4;
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

      // === Tab 切换：全部 / 已装备（绘制在 card_book 背景之下）===
      const tabH = 24 * s;
      const allTabW = 48 * s;
      const eqTabW = 76 * s;
      const tabGap = 4 * s;
      const tabStartX = px + 20 * s;
      const tabY = py + 53 * s;
      const currentTab = game._cardBookTab || 'all';
      const equippedCount = (game.equippedWitchCards || []).length;

      this.cardBookTabRects = [];

      // 绘制 "全部" tab（背景始终不透明）
      const allTabX = tabStartX;
      ctx.save();
      ctx.beginPath();
      const tabR = 5 * s;
      ctx.moveTo(allTabX + tabR, tabY);
      ctx.lineTo(allTabX + allTabW - tabR, tabY);
      ctx.quadraticCurveTo(allTabX + allTabW, tabY, allTabX + allTabW, tabY + tabR);
      ctx.lineTo(allTabX + allTabW, tabY + tabH - tabR);
      ctx.quadraticCurveTo(allTabX + allTabW, tabY + tabH, allTabX + allTabW - tabR, tabY + tabH);
      ctx.lineTo(allTabX + tabR, tabY + tabH);
      ctx.quadraticCurveTo(allTabX, tabY + tabH, allTabX, tabY + tabH - tabR);
      ctx.lineTo(allTabX, tabY + tabR);
      ctx.quadraticCurveTo(allTabX, tabY, allTabX + tabR, tabY);
      ctx.closePath();
      if (currentTab === 'all') {
        ctx.fillStyle = '#faf6ee';
        ctx.strokeStyle = '#c4a35a';
        ctx.lineWidth = 1 * s;
        ctx.fill();
        ctx.stroke();
      } else {
        ctx.fillStyle = '#d5cbb8';
        ctx.fill();
      }
      ctx.font = `bold ${Math.floor(11 * s)}px sans-serif`;
      ctx.fillStyle = currentTab === 'all' ? '#1a2f4a' : '#7a7060';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('全部', allTabX + allTabW / 2, tabY + tabH / 2);
      ctx.restore();
      this.cardBookTabRects.push({ x: allTabX, y: tabY, w: allTabW, h: tabH, tab: 'all' });

      // 绘制 "已装备" tab（深紫色，背景始终不透明，文案带计数小字）
      const eqTabX = allTabX + allTabW + tabGap;
      ctx.save();
      ctx.beginPath();
      ctx.moveTo(eqTabX + tabR, tabY);
      ctx.lineTo(eqTabX + eqTabW - tabR, tabY);
      ctx.quadraticCurveTo(eqTabX + eqTabW, tabY, eqTabX + eqTabW, tabY + tabR);
      ctx.lineTo(eqTabX + eqTabW, tabY + tabH - tabR);
      ctx.quadraticCurveTo(eqTabX + eqTabW, tabY + tabH, eqTabX + eqTabW - tabR, tabY + tabH);
      ctx.lineTo(eqTabX + tabR, tabY + tabH);
      ctx.quadraticCurveTo(eqTabX, tabY + tabH, eqTabX, tabY + tabH - tabR);
      ctx.lineTo(eqTabX, tabY + tabR);
      ctx.quadraticCurveTo(eqTabX, tabY, eqTabX + tabR, tabY);
      ctx.closePath();
      if (currentTab === 'equipped') {
        ctx.fillStyle = '#5a3d7a';
        ctx.fill();
      } else {
        ctx.fillStyle = '#8a7ab0';
        ctx.fill();
      }
      ctx.restore();

      // 已装备 tab 文字：主文字 + 计数小字
      ctx.save();
      ctx.font = `bold ${Math.floor(11 * s)}px sans-serif`;
      const eqMainText = '已装备';
      const eqCountText = ` (${equippedCount}/3)`;
      const eqMainW = ctx.measureText(eqMainText).width;
      ctx.font = `bold ${Math.floor(9 * s)}px sans-serif`;
      const eqCountW = ctx.measureText(eqCountText).width;
      const eqTextTotalW = eqMainW + eqCountW;
      const eqTextStartX = eqTabX + (eqTabW - eqTextTotalW) / 2;

      ctx.font = `bold ${Math.floor(11 * s)}px sans-serif`;
      ctx.fillStyle = '#fff';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText(eqMainText, eqTextStartX, tabY + tabH / 2);

      ctx.font = `bold ${Math.floor(9 * s)}px sans-serif`;
      ctx.fillStyle = 'rgba(255,255,255,0.75)';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText(eqCountText, eqTextStartX + eqMainW, tabY + tabH / 2);
      ctx.restore();
      this.cardBookTabRects.push({ x: eqTabX, y: tabY, w: eqTabW, h: tabH, tab: 'equipped' });

      // 绘制 card_book.png 背景（顶部留出 70dp 给标题/计数器）
      let cbDrawX = px, cbDrawY = py, cbDrawW = pw, cbDrawH = ph;
      if (this.cardBookImage && this.cardBookImageLoaded) {
        const imgAspect = this.cardBookImage.width / this.cardBookImage.height;
        const panelAspect = pw / ph;
        if (imgAspect > panelAspect) {
          cbDrawW = pw;
          cbDrawH = cbDrawW / imgAspect;
          cbDrawX = px;
          cbDrawY = py + 70 * s;
        } else {
          cbDrawH = ph - 70 * s;
          cbDrawW = cbDrawH * imgAspect;
          cbDrawX = px + (pw - cbDrawW) / 2;
          cbDrawY = py + 70 * s;
        }
        ctx.drawImage(this.cardBookImage, cbDrawX, cbDrawY, cbDrawW, cbDrawH);
      }

      // === 标题：词牌图鉴（完整参考女巫奖励样式）===
      const cbTitleText = '词牌图鉴';
      const cbTitleFontSize = 24 * s;
      // 标题与副标题完全独立定位，不依赖 card_book.png 位置
      const cbTitleY = py + 18 * s;

      ctx.font = `bold ${Math.floor(cbTitleFontSize)}px Georgia, serif`;
      const cbTextMetrics = ctx.measureText(cbTitleText);
      const cbTextWidth = cbTextMetrics.width;

      const cbLineY = cbTitleY;
      const cbSolidSize = 1.5 * s;
      const cbHollowSize = 2 * s;
      const cbGap = 8 * s;
      const cbSolidToHollow = 8 * s;
      const cbLineOffset = 3 * s;
      const cbLineLength = 45 * s;

      const cbLeftSolidX = px + pw / 2 - cbTextWidth / 2 - cbGap;
      const cbLeftHollowX = cbLeftSolidX - cbSolidToHollow;
      const cbLeftLineEndX = cbLeftHollowX - cbLineLength;
      const cbRightSolidX = px + pw / 2 + cbTextWidth / 2 + cbGap;
      const cbRightHollowX = cbRightSolidX + cbSolidToHollow;
      const cbRightLineEndX = cbRightHollowX + cbLineLength;

      ctx.save();

      // 左侧装饰
      ctx.save();
      ctx.translate(cbLeftSolidX, cbLineY);
      ctx.rotate(Math.PI / 4);
      ctx.fillStyle = '#c4a35a';
      ctx.fillRect(-cbSolidSize, -cbSolidSize, cbSolidSize * 2, cbSolidSize * 2);
      ctx.restore();

      ctx.save();
      ctx.translate(cbLeftHollowX, cbLineY);
      ctx.rotate(Math.PI / 4);
      ctx.strokeStyle = '#c4a35a';
      ctx.lineWidth = 1.2 * s;
      ctx.strokeRect(-cbHollowSize, -cbHollowSize, cbHollowSize * 2, cbHollowSize * 2);
      ctx.restore();

      const cbLeftLineStartX = cbLeftHollowX - cbLineOffset;
      const cbLeftGrad = ctx.createLinearGradient(cbLeftLineStartX, cbLineY, cbLeftLineEndX, cbLineY);
      cbLeftGrad.addColorStop(0, '#c4a35a');
      cbLeftGrad.addColorStop(1, 'rgba(196,163,90,0)');
      ctx.strokeStyle = cbLeftGrad;
      ctx.lineWidth = 1 * s;
      ctx.beginPath();
      ctx.moveTo(cbLeftLineStartX, cbLineY);
      ctx.lineTo(cbLeftLineEndX, cbLineY);
      ctx.stroke();

      // 右侧装饰
      ctx.save();
      ctx.translate(cbRightSolidX, cbLineY);
      ctx.rotate(Math.PI / 4);
      ctx.fillStyle = '#c4a35a';
      ctx.fillRect(-cbSolidSize, -cbSolidSize, cbSolidSize * 2, cbSolidSize * 2);
      ctx.restore();

      ctx.save();
      ctx.translate(cbRightHollowX, cbLineY);
      ctx.rotate(Math.PI / 4);
      ctx.strokeStyle = '#c4a35a';
      ctx.lineWidth = 1.2 * s;
      ctx.strokeRect(-cbHollowSize, -cbHollowSize, cbHollowSize * 2, cbHollowSize * 2);
      ctx.restore();

      const cbRightLineStartX = cbRightHollowX + cbLineOffset;
      const cbRightGrad = ctx.createLinearGradient(cbRightLineStartX, cbLineY, cbRightLineEndX, cbLineY);
      cbRightGrad.addColorStop(0, '#c4a35a');
      cbRightGrad.addColorStop(1, 'rgba(196,163,90,0)');
      ctx.strokeStyle = cbRightGrad;
      ctx.lineWidth = 1 * s;
      ctx.beginPath();
      ctx.moveTo(cbRightLineStartX, cbLineY);
      ctx.lineTo(cbRightLineEndX, cbLineY);
      ctx.stroke();

      // 标题文字
      ctx.font = `bold ${Math.floor(cbTitleFontSize)}px Georgia, serif`;
      ctx.fillStyle = '#c4a35a';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(cbTitleText, px + pw / 2, cbTitleY);
      ctx.restore();

      // x/26 标签（在标题下方偏右）
      const collectedCount = (game.collectedWitchCards || []).length;
      const totalCount = WITCH_SKILLS.length;
      const countText = `${collectedCount}/${totalCount}`;
      ctx.save();
      ctx.font = `bold ${Math.floor(12 * s)}px Georgia, serif`;
      ctx.fillStyle = '#c4a35a';
      ctx.textAlign = 'right';
      ctx.textBaseline = 'top';
      ctx.fillText(countText, px + pw - 22 * s, py + 50 * s);
      ctx.restore();

      // === 图鉴内容：4 格布局 + 翻页 ===
      let allLevels;
      if (currentTab === 'equipped') {
        // 已装备 tab：按 WITCH_SKILLS 顺序展示已装备的 level
        const equippedSet = new Set(game.equippedWitchCards || []);
        allLevels = WITCH_SKILLS.map(s => s.level).filter(l => equippedSet.has(l));
      } else {
        allLevels = WITCH_SKILLS.map(s => s.level);
      }
      const itemsPerPage = 4;
      const totalPages = Math.max(1, Math.ceil(allLevels.length / itemsPerPage));
      // 切换 tab 时如果当前页超出范围则重置
      let page = Math.min(game.cardBookPage || 0, totalPages - 1);
      if (page < 0) page = 0;
      const pageLevels = allLevels.slice(page * itemsPerPage, (page + 1) * itemsPerPage);

      // 内容区域（在面板内部，留出边距给背景图边框）
      const contentPad = 36 * s;
      const contentX = px + contentPad;
      const contentY = cbDrawY + contentPad;
      const contentW = pw - contentPad * 2;
      const contentH = cbDrawH - contentPad * 2;
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

        // 新增卡牌 NEW! 标签（右上角）
        if (game._newWitchCardThisShop === level && this.newBadgeIcon && this.newBadgeIconLoaded) {
          const tagW = 36 * s;
          // 保持 new.png 原始宽高比，不压缩
          const tagH = this.newBadgeIcon.height
            ? tagW * (this.newBadgeIcon.height / this.newBadgeIcon.width)
            : tagW;
          const tagX = pos.x + cellW - tagW + 2 * s;
          const tagY = pos.y - 2 * s;
          ctx.save();
          // 白色半透明背景蒙层（比 new 图标小一点）
          const maskW = tagW * 0.85;
          const maskH = tagH * 0.85;
          const maskX = tagX + (tagW - maskW) / 2;
          const maskY = tagY + (tagH - maskH) / 2;
          this.roundRect(maskX + 2, maskY, maskW, maskH, 3 * s, 'rgba(255,255,255,0.8)');
          ctx.drawImage(this.newBadgeIcon, tagX, tagY, tagW, tagH);
          ctx.restore();
        }

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

        // 选中态闪烁小星星（复用通用方法）
        if (isPressed) {
          this._drawCardPressedStars(ctx, pos.x, pos.y, cellW, cellH, s, level * 10);
        }

        // 已装备标识（右上角小标签）
        if (isUnlocked && game.equippedWitchCards.includes(level)) {
          ctx.save();
          const tagH = 18 * s;
          const tagPad = 5 * s;
          ctx.font = `bold ${Math.floor(10 * s)}px sans-serif`;
          const tagText = '已装备';
          const tagTextW = ctx.measureText(tagText).width;
          const tagW = tagTextW + tagPad * 2;
          const tagX = pos.x + cellW - tagW - 3 * s + 4;
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
      const closeBtnY = cbDrawY + 10 * s - 16;
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
    // Phase 3: 女巫 + 第三段文本
    // Phase 4: 退场动画
    // Phase 5: 结束，不再渲染
    if (game.cardBookGuidePhase >= 1 && game.cardBookGuidePhase <= 4) {
      this._drawCardBookGuideOverlay(game);
    }

    // 设置弹窗
    if (game._settingsPopup) {
      this.drawSettingsPopup(game);
    }

    // 单词本弹窗
    if (game._wordBookPopup) {
      this.drawWordBookPopup(game);
    }

    // 求助提示弹窗
    if (game._tipHelpPopup) {
      this.drawTipHelpPopup(game);
    }

    // hintToast 提示（绘制在所有弹窗之上，确保弹窗打开时也能看到）
    this._drawHintToast(game);

    // 今日新词弹窗
    if (game._dailyWordsPopup) {
      this._drawDailyWordsPopup(game);
    }

    // 卡牌图鉴装备字母牌升级动画（覆盖在普通弹窗之上）
    if (game._cardBookEquipAnim) {
      this._drawCardBookEquipAnim(ctx, game, W, H, s);
    }

    // 调试菜单（最后绘制，确保在最上层）
    if (this.debugMenuOpen && this.topIconRect) {
      this._drawDebugMenu(ctx, game, this.topIconRect.x, this.topIconRect.y + this.topIconRect.h + 4 * s, s);
    }

    // 绘制排行榜弹窗（好友榜 + 全国榜 Tab）
    if (game._showingRankPopup) {
      this._drawRankPopup(game);
    }
  };

  // ===== 获得新词牌弹窗（回合结算 → 商店页 → 点击收集 → 1s后女巫奖励） =====
  Renderer.prototype._drawNewWitchCardPopup = function(game) {
    const ctx = this.ctx;
    const W = this.W;
    const H = this.H;
    const s = this.scale;
    const data = game._newWitchCardPopup;
    if (!data) return;

    const darkBlue = '#1a2f4a';
    const isClosing = game._closingNewWitchCardPopup;
    const elapsed = isClosing ? 99999 : Date.now() - (data.startTime || Date.now());

    const panel = this._drawModalPanel(ctx, W, H, s, {
      isClosing,
      closeStartTime: game._closeNewWitchCardPopupStartTime,
      width: 300,
      height: 400,
      overlayAlpha: 0.65,
      elapsed,
      onCloseComplete: () => {}
    });
    if (!panel) return;
    const { px, py, pw, ph, closeAlpha } = panel;

    // 标题：复用女巫奖励标题风格
    const titleY = py + 48 * s;
    ctx.save();
    ctx.globalAlpha = closeAlpha;
    this._drawWitchRewardTitle(ctx, '获得新词牌!', W, titleY, s, { alpha: closeAlpha });
    ctx.restore();

    // 当前回合女巫卡牌大图
    const level = data.level;
    const iconName = level ? `witch_card_${level}` : null;
    const iconData = iconName ? this.witchCardImages[iconName] : null;
    const cardMaxW = 220 * s;
    const cardMaxH = 240 * s;
    let cardW = cardMaxW;
    let cardH = cardMaxH;
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
    const cardCX = W / 2;
    const cardCY = py + ph / 2 - 10 * s;
    const cardX = cardCX - cardW / 2;
    const cardY = cardCY - cardH / 2;

    // 圆角裁剪绘制卡牌图
    ctx.save();
    ctx.globalAlpha = closeAlpha;
    ctx.beginPath();
    const cr = 6 * s;
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
    } else {
      // 未加载兜底：米白圆角矩形 + 女巫名字
      ctx.fillStyle = '#f5f0e6';
      ctx.fill();
      ctx.font = `bold ${Math.floor(16 * s)}px sans-serif`;
      ctx.fillStyle = darkBlue;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const skillDef = level ? WITCH_SKILLS.find(s => s.level === level) : null;
      const placeholderText = skillDef ? skillDef.name : '女巫卡牌';
      ctx.fillText(placeholderText, cardCX, cardCY);
    }
    ctx.restore();

    // 金色光晕（新词牌弹窗中使用较弱光晕）
    ctx.save();
    ctx.globalAlpha = closeAlpha;
    this._drawCardGlow(ctx, cardX, cardY, cardW, cardH, s, 0.45);
    ctx.restore();

    // 词牌大图闪烁星星（随机分布、更大更多）
    ctx.save();
    ctx.globalAlpha = closeAlpha;
    this._drawCardPressedStars(ctx, cardX, cardY, cardW, cardH, s, (level || 0) * 100, true, 12, 1.1);
    ctx.restore();

    // 卡牌名称
    const skillDef = level ? WITCH_SKILLS.find(s => s.level === level) : null;
    if (skillDef && skillDef.name) {
      const nameY = cardY + cardH + 28 * s;
      ctx.save();
      ctx.globalAlpha = closeAlpha;
      ctx.font = `bold ${Math.floor(16 * s)}px sans-serif`;
      ctx.fillStyle = darkBlue;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(skillDef.name, W / 2, nameY);
      ctx.restore();
    }

    // 收集按钮
    const btnW = 140 * s;
    const btnH = 44 * s;
    const btnX = (W - btnW) / 2;
    const btnY = py + ph - btnH - 29 * s;
    ctx.save();
    ctx.globalAlpha = closeAlpha;
    // 微弱的 2 层水波纹（比装备按钮更弱、更短周期，保证同时约 2 层；颜色加深）
    this._drawButtonRipple(ctx, btnX, btnY, btnW, btnH, s, {
      stateKey: 'collect',
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
    this._drawScaledButton(ctx, '收集', btnX, btnY, btnW, btnH, s, game._newWitchCardCollectBtnPressed || false, { color: '#c4a35a', radius: 8 });
    ctx.restore();

    // 保存点击区域
    this.newWitchCardCollectBtnRect = { x: btnX, y: btnY, w: btnW, h: btnH };
  };

  // ===== 商店页背景绘制（标题栏 + 图鉴图标 + 商店内容） =====
  // 用于 shop 状态和 witch_reward 状态保持背景一致
  Renderer.prototype._drawShopBackground = function(game) {
    const ctx = this.ctx;
    const W = this.W;
    const H = this.H;
    const s = this.scale;

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
  };

  // ===== 排行榜弹窗（好友/全国 Tab）=====
  Renderer.prototype._drawRankPopup = function(game) {
    const ctx = this.ctx;
    const W = this.W;
    const H = this.H;
    const s = this.scale;

    const panelW = Math.min(W * 0.9, 340 * s);
    const panelH = Math.min(H * 0.75, 520 * s);
    const panelX = (W - panelW) / 2;
    const panelY = (H - panelH) / 2;
    const contentPaddingX = 16 * s;
    const contentPaddingB = 16 * s;
    const headerH = 78 * s; // 标题 + Tab + Tab 与表头间距

    // 1. 蒙层
    ctx.save();
    ctx.fillStyle = 'rgba(0, 0, 0, 0.55)';
    ctx.fillRect(0, 0, W, H);
    ctx.restore();

    // 2. 面板背景
    ctx.save();
    this.roundRect(panelX, panelY, panelW, panelH, 16 * s, '#2a2a3a', '#4a4a6a', 1.5 * s);
    ctx.restore();

    // 3. 标题「排行榜」
    ctx.save();
    ctx.fillStyle = '#f5f0e6';
    ctx.font = `bold ${Math.floor(22 * s)}px Georgia, serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillText('排行榜', W / 2, panelY + 14 * s);
    ctx.restore();

    // 4. Tab「好友 / 全国」
    const tabY = panelY + 46 * s;
    const tabW = 140 * s;
    const tabH = 28 * s;
    const tabX = panelX + (panelW - tabW) / 2;
    const tabR = tabH / 2;

    // Tab 背景
    ctx.save();
    this.roundRect(tabX, tabY, tabW, tabH, tabR, 'rgba(255,255,255,0.08)', 'rgba(255,255,255,0.15)', 1 * s);
    ctx.restore();

    const activeTab = game._rankTab || 'friend';
    const activeW = tabW / 2;
    const activeX = activeTab === 'friend' ? tabX : tabX + activeW;

    // 激活项高亮
    ctx.save();
    this.roundRect(activeX + 2 * s, tabY + 2 * s, activeW - 4 * s, tabH - 4 * s, tabR - 2 * s, '#c4a35a', null);
    ctx.restore();

    ctx.save();
    ctx.font = `bold ${Math.floor(13 * s)}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = activeTab === 'friend' ? '#2a2a3a' : 'rgba(255,255,255,0.7)';
    ctx.fillText('好友', tabX + activeW / 2, tabY + tabH / 2);
    ctx.fillStyle = activeTab === 'global' ? '#2a2a3a' : 'rgba(255,255,255,0.7)';
    ctx.fillText('全国', tabX + activeW * 1.5, tabY + tabH / 2);
    ctx.restore();

    // 5. 关闭按钮
    const closeSize = 28 * s;
    const closeX = panelX + panelW - closeSize - 14 * s;
    const closeY = panelY + 14 * s;
    const closePressOffset = game._rankCloseBtnPressed ? 2 * s : 0;
    ctx.save();
    ctx.fillStyle = 'rgba(255,107,107,0.9)';
    ctx.beginPath();
    ctx.arc(closeX + closeSize / 2, closeY + closeSize / 2 + closePressOffset, closeSize / 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.font = `bold ${Math.floor(closeSize * 0.65)}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('×', closeX + closeSize / 2, closeY + closeSize / 2 - 2 * s + closePressOffset);
    ctx.restore();

    // 6. 内容区域
    const contentX = panelX + contentPaddingX;
    const contentY = panelY + headerH;
    const contentW = panelW - contentPaddingX * 2;
    const contentH = panelH - headerH - contentPaddingB;

    // 7. 好友榜：绘制开放域内容
    if (activeTab === 'friend') {
      const odc = wx.getOpenDataContext ? wx.getOpenDataContext() : null;
      if (odc && odc.canvas) {
        ctx.save();
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(odc.canvas, 0, 0, W, H);
        ctx.restore();
      }
      return;
    }

    // 8. 全国榜：主域绘制
    this._drawGlobalRankList(game, {
      x: contentX,
      y: contentY,
      w: contentW,
      h: contentH,
    });
  };

  Renderer.prototype._drawGlobalRankList = function(game, rect) {
    const ctx = this.ctx;
    const s = this.scale;
    const { x, y, w, h } = rect;

    // 授权按钮提示：提示用户点击下方原生授权按钮
    if (game._showingGlobalAuthButton) {
      ctx.save();
      ctx.fillStyle = '#aaa';
      ctx.font = `${Math.floor(13 * s)}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('全国榜需要头像昵称授权', x + w / 2, y + h / 2 - 35 * s);
      ctx.fillText('请点击下方按钮完成授权', x + w / 2, y + h / 2 - 12 * s);
      ctx.fillStyle = '#888';
      ctx.font = `${Math.floor(11 * s)}px sans-serif`;
      ctx.fillText('（拒绝授权将显示匿名信息）', x + w / 2, y + h / 2 + 38 * s);
      ctx.restore();
      return;
    }

    if (game._globalRankLoading) {
      ctx.save();
      ctx.fillStyle = '#aaa';
      ctx.font = `${Math.floor(14 * s)}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('⏳ 全国榜加载中...', x + w / 2, y + h / 2);
      ctx.restore();
      return;
    }

    if (game._globalRankError || !game._globalRankData) {
      ctx.save();
      ctx.fillStyle = '#ff6b6b';
      ctx.font = `${Math.floor(13 * s)}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(game._globalRankError || '加载失败', x + w / 2, y + h / 2 - 10 * s);
      ctx.fillStyle = '#aaa';
      ctx.font = `${Math.floor(12 * s)}px sans-serif`;
      ctx.fillText('请稍后重试', x + w / 2, y + h / 2 + 12 * s);
      ctx.restore();
      return;
    }

    const data = game._globalRankData;
    const topList = data.topList || [];
    const self = data.self;

    if (topList.length === 0 && !self) {
      ctx.save();
      ctx.fillStyle = '#888';
      ctx.font = `${Math.floor(13 * s)}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('暂无全国数据', x + w / 2, y + h / 2);
      ctx.restore();
      return;
    }

    const rowH = Math.min(52 * s, h / 10);

    // 表头
    ctx.save();
    ctx.fillStyle = 'rgba(196,163,90,0.15)';
    ctx.fillRect(x, y, w, rowH);
    ctx.fillStyle = '#c4a35a';
    ctx.font = `bold ${Math.floor(11 * s)}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('排名', x + w * 0.10, y + rowH / 2);
    ctx.fillText('玩家', x + w * 0.36, y + rowH / 2);
    ctx.fillText('最高回合', x + w * 0.62, y + rowH / 2);
    ctx.fillText('单词量', x + w * 0.86, y + rowH / 2);
    ctx.restore();

    // 列表
    const listY = y + rowH + 4 * s;
    const selfInTop = topList.some(p => p.isSelf);
    const selfFixedH = (self && !selfInTop) ? rowH + 8 * s : 0;
    const listVisibleH = Math.max(0, y + h - listY - 8 * s - selfFixedH);

    // 计算最大滚动距离（用于物理滚动与边界回弹）
    const totalListH = topList.length * rowH;
    const maxScroll = Math.max(0, totalListH - listVisibleH);
    game._globalRankMaxScroll = maxScroll;

    if (!this._globalAvatarCache) this._globalAvatarCache = {};

    // 默认昵称列表（原 images/rank_avatar/rank_name.txt，本地目录已删除后改为硬编码）
    if (!this._rankNames) {
      this._rankNames = [
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

    // 如果本次用户拒绝了头像昵称授权，自己行不使用预置头像/昵称，仅清空头像、保留脱敏昵称
    if (game._globalProfileDeniedThisTime) {
      topList.forEach(p => {
        if (p.isSelf) {
          p.avatarUrl = '';
          delete p._defaultAvatarIndex;
        }
      });
      if (self) {
        self.avatarUrl = '';
        delete self._defaultAvatarIndex;
      }
    }

    // 为没有头像的玩家按排行榜显示顺序分配默认头像/昵称索引（拒绝授权的自己行除外）
    let defaultAvatarIdx = 0;
    const shouldUseDefaultAvatar = (p) => !p.avatarUrl && !(p.isSelf && game._globalProfileDeniedThisTime);
    for (let i = 0; i < topList.length; i++) {
      const player = topList[i];
      if (shouldUseDefaultAvatar(player)) {
        player._defaultAvatarIndex = defaultAvatarIdx++;
      }
    }

    const scrollY = game._globalRankScrollY || 0;

    // 裁剪列表区域并绘制所有可见行
    ctx.save();
    ctx.beginPath();
    ctx.rect(x, listY, w, listVisibleH);
    ctx.clip();

    for (let i = 0; i < topList.length; i++) {
      const player = topList[i];
      const rowY = listY + i * rowH - scrollY;
      // 跳过完全不可见的行，减少绘制开销
      if (rowY + rowH < listY || rowY > listY + listVisibleH) continue;
      this._drawGlobalRankRow(ctx, player, x, rowY, w, rowH, s);
    }
    ctx.restore();

    // 自己不在 Top 列表时，底部固定显示自己排名
    if (self && !selfInTop) {
      const selfY = y + h - 8 * s - rowH;
      if (selfY + rowH <= y + h) {
        if (shouldUseDefaultAvatar(self)) {
          self._defaultAvatarIndex = defaultAvatarIdx++;
        }
        // 分隔线
        ctx.save();
        ctx.fillStyle = 'rgba(255,255,255,0.1)';
        ctx.fillRect(x + 10 * s, selfY - 4 * s, w - 20 * s, 1 * s);
        ctx.restore();
        this._drawGlobalRankRow(ctx, self, x, selfY, w, rowH, s);
      }
    }
  };

  Renderer.prototype._drawGlobalRankRow = function(ctx, player, rowX, rowY, rowW, rowH, s) {
    const isSelf = player.isSelf;

    // 行背景
    ctx.save();
    if (isSelf) {
      ctx.fillStyle = 'rgba(196, 163, 90, 0.18)';
      ctx.fillRect(rowX, rowY, rowW, rowH);
    } else if (player.rank % 2 === 0) {
      ctx.fillStyle = 'rgba(255,255,255,0.04)';
      ctx.fillRect(rowX, rowY, rowW, rowH);
    }
    ctx.restore();

    // 排名
    ctx.save();
    ctx.fillStyle = player.rank <= 3 ? '#ffd700' : '#aaa';
    ctx.font = `bold ${Math.floor(12 * s)}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(player.rank), rowX + rowW * 0.10, rowY + rowH / 2);
    ctx.restore();

    // 头像
    const avatarX = rowX + rowW * 0.26;
    const avatarY = rowY + rowH / 2;
    const avatarR = Math.min(rowH * 0.35, 18 * s);
    const avatarUrl = player.avatarUrl;

    let avatarImg = null;
    let defaultAvatar = null;
    if (avatarUrl) {
      if (!this._globalAvatarCache) this._globalAvatarCache = {};
      const cache = this._globalAvatarCache;
      const cached = cache[avatarUrl];
      if (cached && cached.loaded) {
        avatarImg = cached.img;
      } else if (!cached) {
        const img = wx.createImage();
        img.src = avatarUrl;
        cache[avatarUrl] = { img, loaded: false };
        img.onload = () => { cache[avatarUrl].loaded = true; };
        img.onerror = () => { cache[avatarUrl].loaded = false; };
      }
    } else if (player._defaultAvatarIndex !== undefined) {
      // 从 4 张 5×5 图集中按顺序裁剪默认头像（每张 200×200，单头像 40×40）
      // 优先使用云存储图集，未下载完成则回退本地
      const idx = player._defaultAvatarIndex % 100;
      const sheetIdx = Math.floor(idx / 25);
      const innerIdx = idx % 25;
      const row = Math.floor(innerIdx / 5);
      const col = innerIdx % 5;
      const cloudImages = this.rankAvatarImages;
      const cloudSheet = cloudImages && cloudImages[`rank_avatar_${sheetIdx + 1}`];
      if (cloudSheet && cloudSheet.loaded && cloudSheet.img) {
        defaultAvatar = {
          img: cloudSheet.img,
          sx: col * 40,
          sy: row * 40,
          sw: 40,
          sh: 40,
        };
      }
    }

    ctx.save();
    ctx.beginPath();
    ctx.arc(avatarX, avatarY, avatarR, 0, Math.PI * 2);
    ctx.fillStyle = '#555';
    ctx.fill();
    ctx.clip();
    if (defaultAvatar) {
      ctx.drawImage(defaultAvatar.img, defaultAvatar.sx, defaultAvatar.sy, defaultAvatar.sw, defaultAvatar.sh, avatarX - avatarR, avatarY - avatarR, avatarR * 2, avatarR * 2);
    } else if (avatarImg) {
      ctx.drawImage(avatarImg, avatarX - avatarR, avatarY - avatarR, avatarR * 2, avatarR * 2);
    }
    ctx.restore();

    // 昵称
    ctx.save();
    ctx.fillStyle = isSelf ? '#f5f0e6' : '#ccc';
    ctx.font = `${Math.floor(10 * s)}px sans-serif`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    let nick = player.nickname || '匿名玩家';
    // 使用默认头像的玩家，按同一索引显示默认昵称
    if (player._defaultAvatarIndex !== undefined && this._rankNames && this._rankNames.length > 0) {
      nick = this._rankNames[player._defaultAvatarIndex % this._rankNames.length];
    }
    // 昵称紧挨头像右侧，保持 8px 间距
    const nickX = avatarX + avatarR + 8 * s;
    ctx.fillText(nick.length > 5 ? nick.slice(0, 5) + '…' : nick, nickX, rowY + rowH / 2);
    ctx.restore();

    // 最高回合
    ctx.save();
    ctx.fillStyle = '#fff';
    ctx.font = `bold ${Math.floor(11 * s)}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(player.bestRound), rowX + rowW * 0.62, rowY + rowH / 2);
    ctx.restore();

    // 单词量
    ctx.save();
    ctx.fillStyle = '#c4a35a';
    ctx.font = `bold ${Math.floor(11 * s)}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(player.wordCount), rowX + rowW * 0.86, rowY + rowH / 2);
    ctx.restore();
  };

module.exports = { Renderer };
