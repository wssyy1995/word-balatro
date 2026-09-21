const { Easing } = require('../animation');
const { getSkillForLevel, WITCH_SKILLS, WITCH_CARDS } = require('../witch_skills');
const { SHOP_POOL } = require('../shop');
const { formatMeaning, getJokerValue } = require('../game');
const { getFillBlankParts } = require('../fill_blank');

module.exports = function extendPlaying(Renderer) {
    Renderer.prototype.drawPlaying = function(game) {
      const ctx = this.ctx;
      const W = this.W;
      const H = this.H;
      const s = this.scale;

      // fill_blanks（完形填空）模式：隐藏计分方块/药水栏，预览区显示挖空例句
      const witchSkillNow = getSkillForLevel(game.round, game._shuffledSkills);
      const isFillBlanks = !!(witchSkillNow && witchSkillNow.skill === 'fill_blanks' && game._fillBlankData);
      // 词缀拼词试炼（prefix_* / postfix_*）模式：隐藏计分方块/道具栏/手牌，预览区显示词缀+下划线，手牌区显示 26 键键盘
      const affixTrial = game._getAffixTrial ? game._getAffixTrial() : null;
      const isAffixTrial = !!affixTrial;
      // 单词试炼（fill_blanks 或词缀拼词）统一隐藏项
      const isWordTrial = isFillBlanks || isAffixTrial;
  
      // 计算手牌布局（≤9张用3列，≥10张用4列）
      const cols = game.hand.length <= 9 ? 3 : 4;
      const rows = Math.ceil(game.hand.length / cols);
      const totalW = cols * this.cardW + (cols - 1) * this.gap;
      const startX = (W - totalW) / 2;
  
      // === 从底部按钮倒推布局 ===
      // 顺序：道具栏 → 分数方块 → 单词预览区 → 卡牌区
      // 改卡牌底部和按钮的间距时，上方区域自动跟随
      const boxSize = 56 * s;
      // 高度盈余/不足自适应：extraHeight 可为负，在矮屏/折叠屏上压缩间距
      const extraHeight = H - Math.floor(740 * s);
      const topOffset = extraHeight * 0.05;
      const top = (this.safeTop || 0) + 18 * s + (this.hasDynamicIsland ? 10 * s : 0) + topOffset;
      const h = 70 * s;  // 与 drawHUD 中的 h 保持一致
      const hudBottom = top + 9 * s + h;
      const maxRows = 3;
      const cardGridH = maxRows * this.cardH + (maxRows - 1) * this.gap;
      const maskHalfH = 20 * s; // 预览蒙层半高（maskH = 40*s）
      const propBarH = 84 * s;

      const btnTop = H - 90 * s;
      // 把 extraHeight 分配给顶部偏移和底部间距；最小间距限制为 4*s，避免卡牌与按钮重叠
      const cardGap = Math.max(4 * s, 50 * s + extraHeight * 0.25 - 10); // 卡牌底部到按钮间距
      const cardBottom = btnTop - cardGap + 3 * s + 5;              // 卡牌底部（统一下移 5px）
      const cardAreaY = cardBottom - cardGridH + 10;            // 卡牌顶部（计分/预览/卡牌区整体下移 10px）
      const wordAreaY = cardAreaY - 35 * s - maskHalfH + 2 * s + 2 * s + 3 * s; // 预览区中心
      this.wordAreaY = wordAreaY;
      const scoreAreaY = wordAreaY - maskHalfH - 20 * s - boxSize + 2 * s; // 分数方块顶部
      const propY = hudBottom + 6 * s - 3 + 5;                         // 道具栏顶部（固定间距，跟随 HUD 整体下移，再统一下移 5px）
  
      this.cardRects = []; // 存储卡牌点击区域
      // fill_blanks 提示按钮点击区域（非 fill 模式为 null，由 _drawFillBlankArea 注册）
      this.fillBlankHintLetterRect = null;
      this.fillBlankHintWordRect = null;
      // 词缀试炼提示按钮与键盘点击区域（非词缀模式为 null，由 _drawAffixTrialArea / _drawAffixKeyboard 注册）
      this.affixHintLetterRect = null;
      this.affixHintWordRect = null;
      this.affixKeyRects = null;
      // fill_blanks 字母冒泡动画状态（非 fill 模式清空）
      if (!isFillBlanks) {
        this._fbLetterAnimStart = {};
        this._fbFilledPrev = [];
      }
      // 词缀试炼字母冒泡动画状态（非词缀模式清空）
      if (!isAffixTrial) {
        this._afLetterAnimStart = {};
        this._afFilledPrev = [];
      }
  
      const actualWitchSlots = game.maxJokerSlots || 4;
      // ===== 道具卡牌栏（支持动态女巫槽位，单卡宽度不变，通过调整 gap 实现重叠）=====
      // 栏目宽度固定，card_bar.png 宽度不可变
      const propW = W - 20 * s;
      const propX = (W - propW) / 2;
      const padX = 10 * s;
      const dividerW = 1.5 * s;
      const BASE_GAP = 6 * s;
      const slotTopPad = 6 * s;

      // 基准单卡宽度（固定按 4 张时的 propW 计算，避免宽度变化被卡牌尺寸吸收）
      const rawSlotW = (W - 20 * s - padX * 2 - 5 * BASE_GAP - dividerW) / 6;

      // 实际女巫槽位
      const actualTotalSlots = actualWitchSlots + 2;

      // 动态 gap：4 张时间距充足；5 张时保证最小 1px 间距，内容整体居中，允许左右溢出
      const rawGap = (propW - padX * 2 - dividerW - actualTotalSlots * rawSlotW) / (actualTotalSlots - 1);
      const minGap = actualWitchSlots >= 5 ? 0.6 * s : -Infinity;
      const gapOffset = actualWitchSlots >= 5 ? 1.0 * s : 0; // 5 张女巫牌时间距共减 1px
      const actualGap = Math.max(rawGap, minGap) - gapOffset;
      const slotW = rawSlotW;
      const slotH = propBarH - slotTopPad - 6 * s;

      const slotY = propY + slotTopPad;
      const leftGroupW = actualWitchSlots * slotW + (actualWitchSlots - 1) * actualGap;
      const rightGroupW = 2 * slotW + actualGap;
      const contentW = leftGroupW + rightGroupW + dividerW + actualGap;
      // 内容整体居中：超出栏目时左右自然溢出，但不影响 card_bar 宽度
      const baseLeftStartX = propX + (propW - contentW) / 2;
      const witchRightEdge = baseLeftStartX + leftGroupW;
      const dividerX = witchRightEdge + actualGap / 2 + dividerW / 2;
      const baseRightStartX = dividerX + dividerW / 2 + actualGap / 2;

      // 女巫牌左移、药水牌右移，分割线保持不动
      const witchShift = 1 * s;
      const potionShift = 1 * s;
      const leftStartX = baseLeftStartX - witchShift;
      const rightStartX = baseRightStartX + potionShift;
  
      const jokers = game.jokers || [];
      const potions = game.potions || [];
      this.potionPropRects = [];
      this.witchPropRects = [];
      this.changeLetterHintRect = null;

      // fill_blanks（完形填空）/ 词缀试炼模式：隐藏整个道具卡牌栏（背景图、女巫牌、占位槽、药水）
      if (!isWordTrial) {
      // 道具栏阴影（右下偏移，营造立体感）
      this.roundRect(propX + 2 * s, propY + 2 * s, propW, propBarH, 10 * s, 'rgba(0,0,0,0.10)', null);
      // 道具栏背景（优先使用 card_bar.png，按宽度等比例缩放 + 放大 5%，未加载时 fallback 米白色）
      const cardBarData = game.cloudStorage && game.cloudStorage.bgIconImages && game.cloudStorage.bgIconImages['card_bar'];
      if (cardBarData && cardBarData.loaded && cardBarData.img) {
        const barAspect = (cardBarData.width > 0 && cardBarData.height > 0)
          ? cardBarData.width / cardBarData.height
          : propW / propBarH;
        const targetW = propW ;
        const imageScale = 1.04;
        const drawW = targetW * imageScale + (actualWitchSlots >= 5 ? 6 : 0);
        const drawH = drawW / barAspect + 12;
        const drawX = propX + (propW - drawW) / 2;
        const drawY = propY + (propBarH - drawH) / 2;
        // card_bar 四角圆角裁切
        ctx.save();
        const cbr = 15 * s;
        ctx.beginPath();
        ctx.moveTo(drawX + cbr, drawY);
        ctx.lineTo(drawX + drawW - cbr, drawY);
        ctx.arcTo(drawX + drawW, drawY, drawX + drawW, drawY + drawH, cbr);
        ctx.lineTo(drawX + drawW, drawY + drawH - cbr);
        ctx.arcTo(drawX + drawW, drawY + drawH, drawX, drawY + drawH, cbr);
        ctx.lineTo(drawX + cbr, drawY + drawH);
        ctx.arcTo(drawX, drawY + drawH, drawX, drawY, cbr);
        ctx.lineTo(drawX, drawY + cbr);
        ctx.arcTo(drawX, drawY, drawX + drawW, drawY, cbr);
        ctx.closePath();
        ctx.clip();
        ctx.drawImage(cardBarData.img, drawX, drawY, drawW, drawH);
        ctx.restore();
      } else {
        this.roundRect(propX, propY, propW, propBarH, 10 * s, '#faf6ee', '#c4a35a');
      }
  
      // 竖分割线（金色实线 + 菱形，参考 HUD 分隔线）；单词试炼隐藏道具区时不画分割线
      if (!isWordTrial) {
      ctx.beginPath();
      ctx.moveTo(dividerX, slotY + 2 * s);
      ctx.lineTo(dividerX, slotY + slotH - 2 * s);
      ctx.strokeStyle = '#c4a35a';
      ctx.lineWidth = 0.8 * s;
      ctx.stroke();
      // 菱形装饰
      ctx.save();
      ctx.translate(dividerX, slotY + slotH / 2);
      ctx.rotate(Math.PI / 4);
      ctx.fillStyle = '#c4a35a';
      ctx.fillRect(-2.5 * s, -2.5 * s, 5 * s, 5 * s);
      ctx.restore();
      }
  
      // 左区女巫牌
      for (let i = 0; i < actualWitchSlots; i++) {
        const sx = leftStartX + i * (slotW + actualGap);
        const joker = jokers[i];
        if (joker) {
          // 生命延续触发：跳跃2次（每次500ms）
          if (game._lifeExtensionAnim && game._lifeExtensionAnim.jokerIndex === i) {
            const elapsed = Date.now() - game._lifeExtensionAnim.startTime;
            const totalDuration = 1000; // 2次 × 500ms
            if (elapsed < totalDuration) {
              const cycle = 500;
              const cycleProgress = (elapsed % cycle) / cycle;
              joker._jumpOffsetY = Easing.jump(cycleProgress, 12 * s);
            } else {
              joker._jumpOffsetY = 0;
            }
          }
          this._drawPropCard(ctx, joker, sx, slotY, slotW, slotH, s, false);
          // 女巫牌紫色呼吸发光蒙层（圆形，覆盖在卡牌上方）
          ctx.save();
          const jCx = sx + slotW / 2;
          const jCy = slotY + slotH / 2;
          const jBreath = 0.88 + 0.12 * Math.sin(Date.now() / 400 + i * 0.7);
          const jRadius = Math.max(slotW, slotH) * 0.52 * jBreath;
          const jGrad = ctx.createRadialGradient(jCx, jCy, 0, jCx, jCy, jRadius);
          jGrad.addColorStop(0, `rgba(162, 89, 255, ${0.34 * jBreath})`);
          jGrad.addColorStop(0.55, `rgba(162, 89, 255, ${0.15 * jBreath})`);
          jGrad.addColorStop(1, 'rgba(162, 89, 255, 0)');
          ctx.fillStyle = jGrad;
          ctx.beginPath();
          ctx.arc(jCx, jCy, jRadius, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();

          // disable_one_witch_card / disable_two_witch_card 禁用动画：1000ms 边框光晕 + 锁图标 easeOutBack 弹出
          if (joker._disabled) {
            const elapsed = game._disableWitchAnim ? Date.now() - game._disableWitchAnim.startTime : Infinity;
            const isAnimating = game._disableWitchAnim && game._disableWitchAnim.jokerIndices && game._disableWitchAnim.jokerIndices.includes(i) && elapsed >= 0 && elapsed < 1000;
            if (isAnimating) {
              this._drawLashBorder(ctx, sx, slotY, slotW, slotH, 4 * s, s, elapsed / 1000, 1.0);
            }
            if (!isAnimating) {
              ctx.save();
              this.roundRect(sx, slotY, slotW, slotH, 4 * s, 'rgba(60, 60, 60, 0.5)');
  
              // 锁图标 easeOutBack 弹出动画（边框结束后开始，持续400ms）
              const iconElapsed = game._disableWitchAnim && game._disableWitchAnim.jokerIndices && game._disableWitchAnim.jokerIndices.includes(i)
                ? Math.max(0, elapsed - 1000)
                : Infinity;
              const iconDuration = 400;
              const iconProgress = iconElapsed < iconDuration
                ? Easing.easeOutBack(Math.min(iconElapsed / iconDuration, 1))
                : 1;
              const iconSize = 20 * s * iconProgress;
              const iconX = sx + (slotW - iconSize) / 2;
              const iconY = slotY + (slotH - iconSize) / 2;
  
              if (this.cardDisableIconLoaded && this.cardDisableIcon) {
                ctx.drawImage(this.cardDisableIcon, iconX, iconY, iconSize, iconSize);
              } else {
                ctx.font = `bold ${Math.floor(iconSize)}px sans-serif`;
                ctx.fillStyle = '#fff';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillText('🔒', sx + slotW / 2, slotY + slotH / 2);
              }
  
              ctx.restore();
            }
          }

          // witch_card_value_half：回合开始时 scope 为 whole_word 的女巫牌边框动画 + 倍率下降蒙层
          if (game._witchCardValueHalfAnim && joker.scope === 'whole_word') {
            const elapsed = Date.now() - game._witchCardValueHalfAnim.startTime;
            const isAnimating = elapsed >= 0 && elapsed < 1000;
            if (isAnimating) {
              this._drawLashBorder(ctx, sx, slotY, slotW, slotH, 4 * s, s, elapsed / 1000, 1.0);
            }
            if (!isAnimating) {
              ctx.save();
              this.roundRect(sx, slotY, slotW, slotH, 4 * s, 'rgba(60, 60, 60, 0.5)');

              // 倍率下降图标 easeOutBack 弹出动画（边框结束后开始，持续400ms）
              const iconElapsed = Math.max(0, elapsed - 1000);
              const iconDuration = 400;
              const iconProgress = iconElapsed < iconDuration
                ? Easing.easeOutBack(Math.min(iconElapsed / iconDuration, 1))
                : 1;
              const iconSize = 24 * s * iconProgress;
              const iconX = sx + (slotW - iconSize) / 2;
              let iconY = slotY + (slotH - iconSize) / 2;
              // 弹出完成后添加持续性缓慢上下漂浮动画，幅度 2*s
              if (iconElapsed >= iconDuration) {
                const floatElapsed = iconElapsed - iconDuration;
                const floatPeriod = 1500;
                iconY += Math.sin(floatElapsed * Math.PI * 2 / floatPeriod) * 2 * s;
              }

              if (this.cardValueDownIconLoaded && this.cardValueDownIcon) {
                ctx.drawImage(this.cardValueDownIcon, iconX, iconY, iconSize, iconSize);
              } else {
                ctx.font = `bold ${Math.floor(iconSize)}px sans-serif`;
                ctx.fillStyle = '#fff';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillText('↓', sx + slotW / 2, iconY + iconSize / 2);
              }

              ctx.restore();
            }
          }
  
          // 生命延续触发：紫色边框光晕闪烁
          if (game._lifeExtensionAnim && game._lifeExtensionAnim.jokerIndex === i) {
            const elapsed = Date.now() - game._lifeExtensionAnim.startTime;
            if (elapsed < 1000) {
              const breath = 0.5 + 0.5 * Math.sin(Date.now() / 250);
              ctx.save();
              ctx.shadowColor = `rgba(155,89,182,${0.3 + 0.4 * breath})`;
              ctx.shadowBlur = (6 + 10 * breath) * s;
              const lineW = (2 + 2 * breath) * s;
              const strokeColor = `rgba(155,89,182,${0.6 + 0.4 * breath})`;
              this.roundRect(sx, slotY, slotW, slotH, 4 * s, null, strokeColor, lineW);
              ctx.restore();
            }
          }
  
          // 自毁动画期间不响应点击
          if (!joker._destroying) {
            this.witchPropRects.push({ x: sx, y: slotY, w: slotW, h: slotH, jokerIndex: i });
          }
        } else {
          this._drawEmptySlot(ctx, sx, slotY, slotW, slotH, s, 'witch');
          // 空槽位也登记点击区（点击弹出「女巫牌」说明弹窗）
          this.witchPropRects.push({ x: sx, y: slotY, w: slotW, h: slotH, empty: true, kind: 'witch' });
        }
      }
  
      } // end if (!isWordTrial)：道具卡牌栏整体隐藏

      // 右区2格：药水牌（单词试炼模式下整个道具栏已隐藏，循环不执行）
      for (let i = 0; !isWordTrial && i < 2; i++) {
        const sx = rightStartX + i * (slotW + actualGap);
        const potion = potions[i];
        if (potion) {
          this._drawPropCard(ctx, potion, sx, slotY, slotW, slotH, s);
          // 药水牌绿色呼吸发光蒙层（圆形，覆盖在卡牌上方）
          ctx.save();
          const pCx = sx + slotW / 2;
          const pCy = slotY + slotH / 2;
          const pBreath = 0.88 + 0.12 * Math.sin(Date.now() / 400 + i * 0.7);
          const pRadius = Math.max(slotW, slotH) * 0.52 * pBreath;
          const pGrad = ctx.createRadialGradient(pCx, pCy, 0, pCx, pCy, pRadius);
          pGrad.addColorStop(0, `rgba(80, 220, 120, ${0.34 * pBreath})`);
          pGrad.addColorStop(0.55, `rgba(80, 220, 120, ${0.15 * pBreath})`);
          pGrad.addColorStop(1, 'rgba(80, 220, 120, 0)');
          ctx.fillStyle = pGrad;
          ctx.beginPath();
          ctx.arc(pCx, pCy, pRadius, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();

          // disable_potion_card 禁用动画：1000ms 边框光晕 + 锁图标 easeOutBack 弹出
          if (potion._disabled) {
            const elapsed = game._disablePotionAnim ? Date.now() - game._disablePotionAnim.startTime : Infinity;
            const isAnimating = game._disablePotionAnim && elapsed >= 0 && elapsed < 1000;
            if (isAnimating) {
              this._drawLashBorder(ctx, sx, slotY, slotW, slotH, 4 * s, s, elapsed / 1000, 1.0);
            }
            if (!isAnimating) {
              ctx.save();
              this.roundRect(sx, slotY, slotW, slotH, 4 * s, 'rgba(60, 60, 60, 0.5)');

              // 锁图标 easeOutBack 弹出动画（边框结束后开始，持续400ms）
              const iconElapsed = game._disablePotionAnim
                ? Math.max(0, elapsed - 1000)
                : Infinity;
              const iconDuration = 400;
              const iconProgress = iconElapsed < iconDuration
                ? Easing.easeOutBack(Math.min(iconElapsed / iconDuration, 1))
                : 1;
              const iconSize = 20 * s * iconProgress;
              const iconX = sx + (slotW - iconSize) / 2;
              const iconY = slotY + (slotH - iconSize) / 2;

              if (this.cardDisableIconLoaded && this.cardDisableIcon) {
                ctx.drawImage(this.cardDisableIcon, iconX, iconY, iconSize, iconSize);
              } else {
                ctx.font = `bold ${Math.floor(iconSize)}px sans-serif`;
                ctx.fillStyle = '#fff';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillText('🔒', sx + slotW / 2, slotY + slotH / 2);
              }

              ctx.restore();
            }
          }

          this.potionPropRects.push({ x: sx, y: slotY, w: slotW, h: slotH, potionIndex: i });
        } else {
          this._drawEmptySlot(ctx, sx, slotY, slotW, slotH, s, 'potion');
          // 空槽位也登记点击区（点击弹出「魔法药水」说明弹窗）
          this.potionPropRects.push({ x: sx, y: slotY, w: slotW, h: slotH, empty: true, kind: 'potion' });
        }
  
        // 字母置换提示按钮（未选中1张牌时，在对应药水卡牌下方弹出）
        if (game._changeLetterHint && game._changeLetterHint.potionIndex === i && potion && potion.effect === 'change_letter') {
          const hintBtnH = 16 * s;
          const hintBtnW = slotW + 5 * s;
          const hintBtnY = slotY + slotH + 2 * s;
          const hintElapsed = Date.now() - game._changeLetterHint.startTime;
          const hintProgress = Math.min(hintElapsed / 200, 1);
          const hintEase = Easing.easeOutBack(hintProgress);
          const hintScale = hintEase;
          const hintOffsetY = -(1 - hintEase) * 6 * s;
  
          const finalW = hintBtnW * hintScale;
          const finalH = hintBtnH * hintScale;
          const finalX = sx + (slotW - finalW) / 2;
          const finalY = hintBtnY + hintOffsetY + (hintBtnH - finalH) / 2;
  
          ctx.save();
          this.roundRect(finalX, finalY, finalW, finalH, 3 * s * Math.max(hintScale, 0.5), '#c0392b');
          ctx.font = `bold ${Math.floor(8 * s * Math.max(hintScale, 0.5))}px sans-serif`;
          ctx.fillStyle = '#fff';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText('选择一张字母牌', sx + slotW / 2, finalY + finalH / 2);
          ctx.restore();
  
          this.changeLetterHintRect = { x: sx, y: hintBtnY, w: hintBtnW, h: hintBtnH, potionIndex: i };
        }
      }
  
      // 单词预览区白色蒙层（常驻，固定6个字母宽度；fill_blanks/词缀试炼时加宽加高放内容+提示按钮，水平居中，整体上移到进度条下方）
      let maskW = 180 * s;
      let maskH = 40 * s;
      let maskX = W / 2 - maskW / 2;
      let maskY = wordAreaY - maskH / 2;
      if (isWordTrial) {
        maskH = 166 * s;
        maskW = W - 40 * s;
        maskX = (W - maskW) / 2;
        // 进度条正下方：hudBottom 基于 h=70*s 计算，fill 模式进度条实际底部还需补 2*s 高度差 + 5px 下移
        maskY = hudBottom + 40 * s;
        // 记录试炼框矩形（toast 定位用，如「购买提示成功!」显示在试炼框下方）
        this._fillBlankMaskRect = { x: maskX, y: maskY, w: maskW, h: maskH };
      } else {
        this._fillBlankMaskRect = null;
      }
      // 单词预览区：渐变背景增强立体感
      const maskGrad = ctx.createLinearGradient(0, maskY, 0, maskY + maskH);
      maskGrad.addColorStop(0, 'rgba(255,255,255,0.45)');
      maskGrad.addColorStop(1, 'rgba(240,235,224,0.35)');
      this.roundRect(maskX, maskY, maskW, maskH, 10 * s, maskGrad, 'rgba(196,163,90,0.5)', 1 * s);

      // 提示按钮（预览区左侧）在游玩过程中始终显示，无种子牌时点击会回退到普通提示；单词试炼模式下不显示
      if (game.state === 'playing' && !isWordTrial) {
        // === help 按钮空闲上下跳跃动画（25秒未出牌触发，持续2秒） ===
        let helpJumpY = 0;
        if (game._lastPlayTime && Date.now() - game._lastPlayTime > 25000) {
          if (!game._helpIdleAnim) {
            game._helpIdleAnim = { startTime: Date.now() };
          }
          game._lastPlayTime = Date.now(); // 重置25秒定时器
        }
        if (game._helpIdleAnim) {
          const animElapsed = Date.now() - game._helpIdleAnim.startTime;
          const animDuration = 2000;
          if (animElapsed < animDuration) {
            const jumpCycle = 400;
            const jumpProgress = (animElapsed % jumpCycle) / jumpCycle;
            helpJumpY = Easing.jump(jumpProgress, 2 * s);
          } else {
            game._helpIdleAnim = null;
          }
        }

        const hintBtnSize = 38 * s;
        const hintBtnX = maskX - hintBtnSize - 8 * s - 1;
        const hintBtnY = wordAreaY - hintBtnSize / 2;
        ctx.save();
        // 底部轻微阴影增强立体感
        ctx.shadowColor = 'rgba(0,0,0,0.12)';
        ctx.shadowBlur = 5 * s;
        ctx.shadowOffsetY = 2 * s;
        if (helpJumpY !== 0) {
          ctx.translate(0, helpJumpY);
        }
        if (this.helpIconLoaded && this.helpIcon) {
          // 保持 help.png 原始宽高比绘制
          const img = this.helpIcon;
          const imgW = img.width || hintBtnSize;
          const imgH = img.height || hintBtnSize;
          const aspect = imgW / imgH;
          let drawW, drawH;
          if (aspect >= 1) {
            drawW = hintBtnSize;
            drawH = hintBtnSize / aspect;
          } else {
            drawH = hintBtnSize;
            drawW = hintBtnSize * aspect;
          }
          const drawX = hintBtnX + (hintBtnSize - drawW) / 2;
          const drawY = hintBtnY + (hintBtnSize - drawH) / 2;
          ctx.drawImage(img, drawX, drawY, drawW, drawH);
        } else {
          // fallback：圆形 ? 按钮
          ctx.beginPath();
          ctx.arc(hintBtnX + hintBtnSize / 2, hintBtnY + hintBtnSize / 2, hintBtnSize / 2, 0, Math.PI * 2);
          ctx.fillStyle = 'rgba(255,255,255,0.4)';
          ctx.fill();
          ctx.strokeStyle = 'rgba(196,163,90,0.8)';
          ctx.lineWidth = 1.5 * s;
          ctx.stroke();
          ctx.fillStyle = '#c4a35a';
          ctx.font = `bold ${Math.floor(16 * s)}px sans-serif`;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText('?', hintBtnX + hintBtnSize / 2, hintBtnY + hintBtnSize / 2);
        }
        ctx.restore();
        this.hintBtnRect = { x: hintBtnX, y: hintBtnY, w: hintBtnSize, h: hintBtnSize };
      } else {
        this.hintBtnRect = null;
      }
  
      // 预览区域（在卡牌上方）
      const selected = game.getSelectedCards();
      const previewWord = game.pendingCheck ? game.pendingCheck.word : selected.map(c => c.letter.toLowerCase()).join('');
      const previewFontSize = Math.floor((previewWord.length > 9 ? 28 * 9 / previewWord.length : 28) * s);
      let valid = false;
      let invalid = false;
      let baseScore = 0;
      let showFirstBox = false;
      let showSecondBox = false;
      let pendingBaseScore = 0;
      let pendingLength = 0;
      let meaningText = null;
  
      // 方块区域变量（提前定义，pendingCheck 动画需要）
      const centerX = W / 2;
      const boxY = scoreAreaY + 3 * s;
      const leftBoxX = centerX - boxSize - 10 * s - 5 * s;
      const rightBoxX = centerX + 10 * s + 5 * s;
  
      // 存储第一个方块点击区域（调试用）
      this.firstBoxRect = { x: leftBoxX, y: boxY, w: boxSize, h: boxSize };
  
      // === 预览区流光边框（有无输入都有动效，线宽不同） ===
      const hasInput = selected.length > 0;
      const flowLineWidth = hasInput ? 2.2 * s : 2.0 * s;
      const t = (Date.now() % 3000) / 3000; // 0~1，3秒一周期
      const isValidWord = game.pendingCheck && game.pendingCheck.state === 'valid';
      const flowColor = isValidWord ? '45,125,50' : '240,195,20';
      const grad = ctx.createLinearGradient(
        maskX - maskW * 0.2 + maskW * t * 1.4, maskY,
        maskX + maskW * 0.2 + maskW * t * 1.4, maskY + maskH
      );
      grad.addColorStop(0, `rgba(${flowColor},0)`);
      grad.addColorStop(0.5, `rgba(${flowColor},0.8)`);
      grad.addColorStop(1, `rgba(${flowColor},0)`);
      ctx.save();
      ctx.strokeStyle = grad;
      ctx.lineWidth = flowLineWidth;
      this._roundedRectPath(ctx, maskX, maskY, maskW, maskH, 10 * s);
      ctx.stroke();
      ctx.restore();

      // === pendingCheck 状态优先 ===
      let pc = null;
      if (game.pendingCheck) {
        pc = game.pendingCheck;
        const word = pc.word;

        if (isFillBlanks) {
          // fill_blanks：检测中/合法/非法/试炼失败都渲染挖空例句，下划线处显示本次尝试的字母
          const fbStatus = (pc.state === 'checking' || pc.state === 'valid' || pc.state === 'invalid' || pc.state === 'witch_failed')
            ? pc.state : 'idle';
          this._drawFillBlankArea(game, maskX, maskY, maskW, maskH, s, word.split(''), fbStatus, pc.witchFailText || pc.invalidText || null);
          if (pc.state === 'valid') {
            // 简化成功演出：烟花 + 完整句子高亮，1.5s 后直接进入结算
            if (!pc._sparklesSpawned) {
              pc._sparklesSpawned = true;
              this._spawnSparkles(maskX + maskW * 0.25, maskY + maskH / 2, 12);
              this._spawnSparkles(maskX + maskW * 0.75, maskY + maskH / 2, 12);
            }
            if (!pc._fillBlankDoneAt) pc._fillBlankDoneAt = Date.now() + 1500;
            if (Date.now() >= pc._fillBlankDoneAt && !game._playHandAnimCompleted) {
              game._playHandAnimCompleted = true;
              if (game.completePlayHand) game.completePlayHand();
            }
          }
        } else if (isAffixTrial) {
          // 词缀试炼：检测中/合法/非法都渲染词缀+下划线区域，下划线处显示本次尝试的字母
          const afStatus = (pc.state === 'checking' || pc.state === 'valid' || pc.state === 'invalid' || pc.state === 'witch_failed')
            ? pc.state : 'idle';
          this._drawAffixTrialArea(game, maskX, maskY, maskW, maskH, s, pc.typed || pc.word.split(''), afStatus, pc.invalidText || pc.witchFailText || null);
          if (pc.state === 'valid') {
            // 简化成功演出：烟花 + 绿色单词，1.5s 后计数（拼满 3 个进结算）
            if (!pc._sparklesSpawned) {
              pc._sparklesSpawned = true;
              this._spawnSparkles(maskX + maskW * 0.25, maskY + maskH / 2, 12);
              this._spawnSparkles(maskX + maskW * 0.75, maskY + maskH / 2, 12);
            }
            if (!pc._affixDoneAt) pc._affixDoneAt = Date.now() + 1500;
            if (Date.now() >= pc._affixDoneAt && !game._playHandAnimCompleted) {
              game._playHandAnimCompleted = true;
              if (game.completeAffixPlay) game.completeAffixPlay();
            }
          }
        } else if (pc.state === 'checking') {
          // 检测中：橙色单词 + loading图标 + 动态点号
          ctx.save();
          ctx.font = `bold ${previewFontSize}px Georgia, 'Times New Roman', serif`;
          ctx.fillStyle = '#c4a35a';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(word, W / 2, wordAreaY);
          ctx.restore();
  
          // 动态点号 ....（加粗变大）
          const dotCount = (Math.floor(Date.now() / 400) % 4) + 1;
          ctx.font = `bold ${Math.floor(20 * s)}px sans-serif`;
          ctx.fillStyle = '#c4a35a';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText('.'.repeat(dotCount), W / 2, wordAreaY + 24 * s + 3 * s);
  
        } else if (pc.state === 'valid') {
          // === 公共部分：深绿色单词（支持波浪）和释义 ===
          const phase = pc.animPhase || 0;
          const elapsed = Date.now() - (pc.resolveTime || 0);
  
          ctx.save();
          ctx.font = `bold ${previewFontSize}px Georgia, 'Times New Roman', serif`;
          ctx.fillStyle = '#2d7d32';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
  
          const letters = word.split('');
          let totalLetterW = 0;
          const letterWidths = letters.map(l => {
            const lw = ctx.measureText(l).width;
            totalLetterW += lw;
            return lw;
          });
          const startLX = W / 2 - totalLetterW / 2;
          let curX = startLX;
          letters.forEach((letter, i) => {
            const lw = letterWidths[i];
            const waveY = (pc._waveOffsetYs && pc._waveOffsetYs[i]) || 0;
            ctx.fillText(letter, curX + lw / 2, wordAreaY + waveY);
            curX += lw;
          });
          ctx.restore();
  
          if (pc.meaning) {
            const mText = formatMeaning(pc.meaning);
            ctx.font = `${Math.floor(11 * s)}px sans-serif`;
            ctx.fillStyle = '#777';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(mText, W / 2, wordAreaY + 33 * s);
          }
  
          // === 阶段0: 烟花（始终触发）===
          if (phase === 0 && !pc._sparklesSpawned) {
            pc._sparklesSpawned = true;
            this._spawnSparkles(W / 2 - 60 * s, wordAreaY, 12);
            this._spawnSparkles(W / 2 + 60 * s, wordAreaY, 12);
          }
  
          // === 阶段0→1 过渡（无字母之神时自动推进）===
          if (phase === 0 && !game._letterGodAnim) {
            if (!pc._phase0StartTime) pc._phase0StartTime = Date.now();
            if (Date.now() - pc._phase0StartTime >= 1000) {
              pc.animPhase = 1;
            }
          }
  
          if (game._letterGodAnim) {
            // 字母之神动画期间：跳过计分方块、倍率、总分飞行
            valid = true;
            pendingBaseScore = 0;
            pendingLength = (pc.cardsInOrder || []).length;
            showFirstBox = false;
            showSecondBox = false;
          } else {
            // === 正常计分动画（事件驱动）===
            const letterInterval = 350;
            const letterJumpStart = 1000;
            const cardsInOrder = pc.cardsInOrder || [];
            let accumulatedScore = 0;
            let isAllJumped = false;

            // 预览值无缝接管：构建"有戏"的动画步骤（触发 per_card 女巫牌 / 装备卡二次计分 /
            // 吸星大法加成），无触发的普通字母不再逐一跳跃计分；
            // 左方块以预览分为起点，每个动画步骤滚动累加该步的差值
            if (!pc._animSteps && pc.perCardSteps) {
              const allJokers = game.jokers || [];
              // 每张字母牌的最终分数（先加吸星大法 absorbBonus，再按顺序应用 per_card 加成），与 calcWordScore 一致
              if (!pc._cardFinalScores) {
                pc._cardFinalScores = cardsInOrder.map((card, i) => {
                  let score = card.score + (card.absorbBonus || 0);
                  const triggered = pc.jokerTriggers?.[i] || [];
                  triggered.forEach(jIdx => {
                    const joker = allJokers[jIdx];
                    const jv = getJokerValue(joker);
                    if (joker && jv) {
                      if (joker.operation === 'add') {
                        score += jv;
                      } else {
                        score *= jv;
                      }
                    }
                  });
                  return score;
                });
              }
              const animSteps = [];
              const stepDeltas = [];
              const runningScores = cardsInOrder.map(c => c.score);
              const absorbApplied = cardsInOrder.map(() => false);
              pc.perCardSteps.forEach(st => {
                const ci = st.cardIdx;
                const card = cardsInOrder[ci];
                if (!card) return;
                if (st.isDouble) {
                  // 装备卡二次计分（last_letter_double / letter_trigger_twice）：完整再计一次
                  animSteps.push(st);
                  stepDeltas.push(pc._cardFinalScores[ci]);
                  return;
                }
                let delta = 0;
                if (!absorbApplied[ci]) {
                  absorbApplied[ci] = true;
                  delta += card.absorbBonus || 0;
                }
                if (st.jokerIdx !== null) {
                  const jk = allJokers[st.jokerIdx];
                  const jkv = getJokerValue(jk);
                  if (jk && jkv) {
                    const after = jk.operation === 'add'
                      ? runningScores[ci] + jkv
                      : runningScores[ci] * jkv;
                    delta += after - runningScores[ci];
                    runningScores[ci] = after;
                  }
                  animSteps.push(st);
                  stepDeltas.push(delta);
                } else if (delta !== 0) {
                  // 仅吸星大法加成的普通步：保留跳跃并累加差值
                  animSteps.push(st);
                  stepDeltas.push(delta);
                }
              });
              pc._animSteps = animSteps;
              pc._animStepDeltas = stepDeltas;
              pc._animBaseScore = cardsInOrder.reduce((sum, c) => sum + c.score, 0);
            }

            // === 阶段1: 字母跳跃（仅触发女巫牌/有加成的字母）===
            if (phase >= 1) {
              const jumpElapsed = elapsed - letterJumpStart;
              const steps = pc._animSteps || [];
              const stepIdx = Math.floor(jumpElapsed / letterInterval);
              // 每张字母牌开始跳跃时播放音效（触发女巫牌用 answer_tone，否则用 card_jump）
              if (jumpElapsed >= 0 && stepIdx >= 0 && stepIdx < steps.length) {
                if (pc._lastJumpStepIdx !== stepIdx) {
                  pc._lastJumpStepIdx = stepIdx;
                  const stepInfo = steps[stepIdx];
                  const jumpSound = (stepInfo && stepInfo.jokerIdx !== null) ? 'answer_tone' : 'card_jump';
                  if (game.audioManager) game.audioManager.play(jumpSound);
                }
              } else {
                pc._lastJumpStepIdx = -1;
              }
              isAllJumped = stepIdx >= steps.length;
              const stepInfo = isAllJumped ? null : steps[stepIdx];
              const cardIdx = isAllJumped
                ? cardsInOrder.length - 1
                : (stepInfo ? stepInfo.cardIdx : -1);
              const jokers = game.jokers || [];
  
              // per_card 倍率/加分提示 — 当前步骤对应的 per_card
              const formatLabelValue = (v) => Number.isInteger(v) ? String(v) : v.toFixed(1);
              pc._perCardMultText = null;
              if (!isAllJumped && cardIdx >= 0 && stepInfo && stepInfo.jokerIdx !== null) {
                const activeJoker = jokers[stepInfo.jokerIdx];
                const ajv = getJokerValue(activeJoker);
                if (activeJoker && ajv) {
                  const displayValue = formatLabelValue(ajv);
                  if (activeJoker.operation === 'add') {
                    pc._perCardMultText = `+${displayValue}`;
                  } else {
                    pc._perCardMultText = `x${displayValue}`;
                  }
                }
              }
  
              // 左方块累计分 = 预览分起点 + 已完成动画步骤的差值
              accumulatedScore = pc._animBaseScore || 0;
              const activeStepIdx = isAllJumped ? steps.length - 1 : stepIdx;
              for (let si = 0; si <= activeStepIdx && si < steps.length; si++) {
                accumulatedScore += pc._animStepDeltas[si];
              }
  
              // 清除女巫牌状态
              jokers.forEach(j => { if (j) { j._jumpOffsetY = 0; j._triggered = false; } });
  
              // 波浪跳跃
              const totalJumpTime = steps.length * letterInterval;
              const waveStartDelay = 90;
              const waveInterval2 = 70;
              if (jumpElapsed >= totalJumpTime) {
                const waveElapsed = jumpElapsed - totalJumpTime;
                if (!pc._waveOffsetYs) pc._waveOffsetYs = [];
                cardsInOrder.forEach((_, i) => {
                  const waveProgress = (waveElapsed - waveStartDelay - i * waveInterval2) / 180;
                  if (waveProgress >= 0 && waveProgress <= 1) {
                    const waveH = 5 * s * Math.sin(waveProgress * Math.PI);
                    pc._waveOffsetYs[i] = -waveH;
                  } else {
                    pc._waveOffsetYs[i] = 0;
                  }
                });
              }
  
              // 卡牌跳跃偏移
              cardsInOrder.forEach((card, i) => {
                if (isAllJumped) {
                  card.jumpOffsetY = 0;
                } else if (i === cardIdx && jumpElapsed >= 0) {
                  const jumpProgress = ((jumpElapsed % letterInterval) / 200);
                  card.jumpOffsetY = Easing.jump(jumpProgress, 12 * s);
                  // 当前步骤对应的 per_card 女巫牌同步跳跃
                  if (stepInfo && stepInfo.jokerIdx !== null) {
                    const activeJoker = jokers[stepInfo.jokerIdx];
                    if (activeJoker) {
                      activeJoker._triggered = true;
                      activeJoker._jumpOffsetY = Easing.jump(jumpProgress, 12 * s);
                    }
                  }
                } else if (i < cardIdx) {
                  card.jumpOffsetY = 0;
                }
              });
  
              // flat_bonus 女巫牌
              const globalTriggered = pc.globalTriggered || [];
              globalTriggered.forEach(jIdx => {
                const joker = jokers[jIdx];
                if (joker) {
                  joker._triggered = true;
                  if (!isAllJumped && cardIdx >= 0) {
                    const jumpProgress = ((jumpElapsed % letterInterval) / 200);
                    joker._jumpOffsetY = Easing.jump(jumpProgress, 12 * s);
                  }
                }
              });
  
              // 清除女巫牌状态
              if (isAllJumped) {
                jokers.forEach(j => { if (j) { j._jumpOffsetY = 0; j._triggered = false; } });
              }

              // 记录当前步骤进度（0~1），供数字滚动动画与字母跳跃同步
              const rawStepProgress = isAllJumped ? 1 : (jumpElapsed >= 0 ? (jumpElapsed % letterInterval) / letterInterval : 0);
              pc._stepProgress = Math.max(0, Math.min(rawStepProgress, 1));
  
              // 检测阶段1完成 → 进入阶段2
              if (isAllJumped && phase < 2) {
                const totalJumpTime = steps.length * letterInterval;
                const waveDuration = 180 + cardsInOrder.length * 90;
                const waveElapsed = jumpElapsed - totalJumpTime;
                if (waveElapsed >= waveDuration + 100) {
                  pc.animPhase = 2;
                }
              }
            }
  
            // === 阶段2: whole_word 依次触发（基础倍率已由预览接管，不再弹出）===
            showSecondBox = phase >= 2;

            if (phase >= 2) {
              const wjList = pc.wholeWordJokers || [];
              const STEP_DURATION = 350; // 每一步固定 350ms

              // 阶段2时间基准
              if (!pc._phase2StartTime) pc._phase2StartTime = Date.now();
              const elapsedSincePhase2 = Date.now() - pc._phase2StartTime;
              // 预览已显示单词长度，跳过原"基础倍率弹出"的 500ms 等待与一步弹出，仅留 200ms 停顿
              const baseMultDelay = 200;

              // 计算当前步（事件驱动）
              let afterBase = 0;
              let currentStep = -1;
              if (elapsedSincePhase2 >= baseMultDelay) {
                afterBase = elapsedSincePhase2 - baseMultDelay;
                currentStep = Math.floor(afterBase / STEP_DURATION);
              }

              // 固定 350ms 一步，触发 whole_word 女巫牌（跳跃+标签+倍率同时发生）
              wjList.forEach(({ idx }, i) => {
                const joker = game.jokers?.[idx];
                if (!joker) return;
                // currentStep = i: 第 i 张 whole_word 触发
                if (currentStep === i && !joker._wwJumpStart && !joker._wwJumpDone) {
                  joker._wwJumpStart = Date.now();
                  joker._triggered = true;
                }
              });

              // 处理跳跃动画（400ms 时长，在 350ms 步后自然收尾）
              wjList.forEach(({ idx }) => {
                const joker = game.jokers?.[idx];
                if (!joker) return;
                if (joker._wwJumpStart) {
                  const jumpElapsed = Date.now() - joker._wwJumpStart;
                  const jumpDuration = 400;
                  const jumpProgress = Math.min(jumpElapsed / jumpDuration, 1);
                  const jumpH = 12 * s * Math.sin(jumpProgress * Math.PI);
                  joker._jumpOffsetY = -Math.max(0, jumpH);
                  if (jumpProgress >= 1) {
                    joker._wwJumpStart = null;
                    joker._wwJumpDone = true;
                    joker._jumpOffsetY = 0;
                    joker._triggered = false;
                  }
                }
              });

              // 检测阶段2完成 → 进入阶段3（或 letter_a_mult_half 惩罚动画）
              if (phase < 3) {
                // totalSteps = N(whole_word)，基础倍率步已移除
                const totalSteps = wjList.length;
                const postWait = 200; // 全部完成后强制等待 200ms
                const readyTime = totalSteps * STEP_DURATION + postWait;
  
                // letter_a_mult_half 惩罚动画：提前 100ms 开始，总时长 700ms，结束延迟 100ms
                const PENALTY_START_OFFSET = -100; // 提前 100ms
                const PENALTY_DURATION = 700;      // 动画总时长 700ms
                const POST_PENALTY_WAIT = 300;     // 惩罚后等待 300ms
  
                if (afterBase >= readyTime + PENALTY_START_OFFSET) {
                  if (pc.multHalfResult?.triggered && !pc._multHalfAnimDone) {
                    const penaltyElapsed = afterBase - (readyTime + PENALTY_START_OFFSET);
  
                    // 惩罚动画：紫色光晕 + 女巫星星 + angry_tip（在 PENALTY_DURATION 内触发一次）
                    if (penaltyElapsed >= 0 && penaltyElapsed < PENALTY_DURATION) {
                      if (!pc._multHalfPulseTriggered) {
                        pc._multHalfPulseTriggered = true;
                        this.multAnim = { startTime: Date.now(), duration: 600 };
                        this.lastMultValue = pc.multHalfResult.halvedMult;
                      }
                      if (!pc._multHalfStarTriggered) {
                        pc._multHalfStarTriggered = true;
                        if (this.hudWitchAvatarRect) {
                          game._witchStarBurst = {
                            startTime: Date.now(),
                            cx: this.hudWitchAvatarRect.x + this.hudWitchAvatarRect.w / 2,
                            cy: this.hudWitchAvatarRect.y + this.hudWitchAvatarRect.h / 2,
                          };
                        }
                        if (pc.multHalfResult?.angryTip) {
                          game._witchAngryTip = { text: pc.multHalfResult.angryTip, expireAt: Date.now() + 3000 };
                        }
                      }
                    }
  
                    if (penaltyElapsed >= PENALTY_DURATION + POST_PENALTY_WAIT) {
                      pc._multHalfAnimDone = true;
                      pc.animPhase = 3;
                    }
                  } else {
                    pc.animPhase = 3;
                  }
                }
              }
            }
  
            // === 阶段3: 总分飞行 ===
            if (phase >= 3 && !pc._flyingScoreStarted) {
              pc._flyingScoreStarted = true;
              const totalScore = pc.multHalfResult?.halvedScore ?? pc.result.score;
              this._startFlyingScore(totalScore, maskX + maskW + 10 * s, wordAreaY, game);
            }
  
            // 检测全部动画完成，调用 game.completePlayHand()
            if (phase >= 3 && pc._flyingScoreStarted && !this.flyingScore && !game._playHandAnimCompleted) {
              game._playHandAnimCompleted = true;
              if (game.completePlayHand) game.completePlayHand();
            }
  
            // 渲染方块数字
            valid = true;
            pendingBaseScore = accumulatedScore;
            pendingLength = cardsInOrder.length;
            showFirstBox = phase >= 1;
          }
  
        } else if (pc.state === 'invalid') {
          // 非法：橙色单词 + error图标 + 单词不存在
          invalid = true;
          ctx.save();
          ctx.font = `bold ${previewFontSize}px Georgia, 'Times New Roman', serif`;
          ctx.fillStyle = '#f1c40f';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(word, W / 2, wordAreaY);
          ctx.restore();
  
          const errText = '单词不存在';
          ctx.font = `bold ${Math.floor(15 * s)}px sans-serif`;
          ctx.fillStyle = '#c0392b';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          const errTextWidth = ctx.measureText(errText).width;
          const errIconSize = 18 * s;
          const errTotalWidth = errIconSize + 4 * s + errTextWidth;
          const errBaseX = W / 2 - errTotalWidth / 2;
          const errY = wordAreaY + 22 * s + 3 * s + 5 * s + 2 * s;
          // 画 error 图标
          if (this.errorIcon && this.errorIconLoaded) {
            ctx.drawImage(this.errorIcon, errBaseX, errY - errIconSize / 2, errIconSize, errIconSize);
          }
          // 画文字
          ctx.fillText(errText, errBaseX + errIconSize + 4 * s + errTextWidth / 2, errY);
        } else if (pc.state === 'witch_failed') {
          // 女巫试炼失败：橙色单词 + 紫色提示
          invalid = true;
  
          ctx.save();
          ctx.font = `bold ${previewFontSize}px Georgia, 'Times New Roman', serif`;
          ctx.fillStyle = '#f1c40f';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(word, W / 2, wordAreaY);
          ctx.restore();
  
          const failText = pc.witchFailText || '女巫试炼未满足';
          ctx.font = `bold ${Math.floor(13 * s)}px sans-serif`;
          const failTextWidth = ctx.measureText(failText).width;
          const hatSize = 14 * s;
          const totalW = hatSize + 4 * s + failTextWidth;
          const baseX = W / 2 - totalW / 2;
          const baseY = wordAreaY + 32 * s;
  
          // 出现动画（easeOutBack：从单词预览区下方弹出）
          let appearScale = 1;
          let appearOffsetY = 0;
          if (pc._witchFailAnimStart) {
            const ae = Date.now() - pc._witchFailAnimStart;
            const ap = Math.min(ae / 300, 1);
            const ease = Easing.easeOutBack(ap);
            appearScale = ease;
            appearOffsetY = -(1 - ease) * 10 * s;
          }
  
          ctx.save();
          ctx.translate(baseX + totalW / 2, baseY);
          ctx.scale(appearScale, appearScale);
          ctx.translate(-(baseX + totalW / 2), -baseY);
          ctx.translate(0, appearOffsetY);
  
          // 女巫帽子图标
          if (this.witchHatIcon && this.witchHatIconLoaded) {
            ctx.drawImage(this.witchHatIcon, baseX, baseY - hatSize / 2, hatSize, hatSize);
          }
  
          // 文字
          ctx.font = `bold ${Math.floor(13 * s)}px sans-serif`;
          ctx.fillStyle = '#9b59b6';
          ctx.textAlign = 'left';
          ctx.textBaseline = 'middle';
          ctx.fillText(failText, baseX + hatSize + 4 * s, baseY);
          ctx.restore();
        }
  
      } else if (isFillBlanks) {
        // fill_blanks：常驻显示挖空例句 + 中文翻译，选中字母时逐格填入下划线
        this._drawFillBlankArea(game, maskX, maskY, maskW, maskH, s, selected.map(c => c.letter.toLowerCase()), 'idle', null);
      } else if (isAffixTrial) {
        // 词缀试炼：常驻显示 词缀+下划线 + 剩余单词数提示，键盘输入的字母逐格填入
        this._drawAffixTrialArea(game, maskX, maskY, maskW, maskH, s, affixTrial.typed || [], 'idle', null);
      } else if (selected.length >= 1) {
        // 普通预览：只显示单词（橙色），不检测
        const word = selected.map(c => c.letter.toLowerCase()).join('');
        ctx.save();
        ctx.font = `bold ${previewFontSize}px Georgia, 'Times New Roman', serif`;
        ctx.fillStyle = '#c4a35a';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(word, W / 2, wordAreaY);
        ctx.restore();
      } else {
        // 未选择任何字母牌：显示提示文字
        ctx.save();
        ctx.font = `${Math.floor(12 * s)}px sans-serif`;
        ctx.fillStyle = 'rgba(90,74,42,0.55)';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('选择字母牌组成单词', W / 2, wordAreaY);
        ctx.restore();
      }

      // 单词求助提示：在单次预览下方显示中文释义
      if (!isWordTrial && !game.pendingCheck && game.state === 'playing' && game._seedWordHint) {
        if (game._seedWordHint.meaning) {
          const mText = `[提示] ${formatMeaning(game._seedWordHint.meaning)}`;
          ctx.save();
          ctx.font = `bold ${Math.floor(12 * s)}px sans-serif`;
          ctx.fillStyle = '#f39c12';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'top';
          ctx.fillText(mText, W / 2, wordAreaY + maskHalfH + 6 * s);
          ctx.restore();
        }
      }

      // 学习模式：若手牌可直接拼出某个未收集的每日新词，主动在预览区下方显示释义
      // 前 10 秒不显示，10 秒后若仍未出牌再淡入出现
      if (!isWordTrial && !game.pendingCheck && game.state === 'playing' && game._dailyNewWordHint && !game._seedWordHint) {
        const elapsed = Date.now() - game._dailyNewWordHint.showTime;
        const showDelay = 10000;
        if (elapsed < showDelay) {
          // do nothing
        } else {
          const fadeDuration = 500;
          let hintAlpha = 1;
          if (elapsed < showDelay + fadeDuration) {
            hintAlpha = Easing.easeOutCubic((elapsed - showDelay) / fadeDuration);
          }
          const hintText = `[新词提示]  ${game._dailyNewWordHint.meaning}`;
          ctx.save();
          ctx.globalAlpha = hintAlpha;
          ctx.font = `bold ${Math.floor(12 * s)}px sans-serif`;
          ctx.fillStyle = '#f39c12';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'top';
          ctx.fillText(hintText, W / 2, wordAreaY + maskHalfH + 6 * s);
          ctx.restore();
        }
      }
  
      if (!isWordTrial) {
        // 分数预览（两个方块）—— 始终显示背景图
        // 新的出牌校验开始时仅清动画状态：保留预览的 lastBoxScore / lastMultValue
        // 作为正式计分的起点（预览值无缝接管，不再从 0 重新滚动）
        if (game.pendingCheck && this._lastPendingCheck !== game.pendingCheck) {
          this._lastPendingCheck = game.pendingCheck;
          this.scoreRoll = null;
          this.multAnim = null;
        } else if (!game.pendingCheck) {
          this._lastPendingCheck = null;
        }
        const scoreColor = valid ? '#3498db' : (invalid ? '#e74c3c' : '#888');
        const multColor = valid ? '#2ecc71' : (invalid ? '#e74c3c' : '#888');
  
        // 计分方块两侧装饰线（score_line.png）
        if (this.scoreLineImg && this.scoreLineLoaded) {
          const lineImgW = this.scoreLineImg.width || 20;
          const lineImgH = this.scoreLineImg.height || 80;
          const lineAspect = lineImgW / lineImgH;
          const lineH = boxSize * 0.4;
          const lineW = lineH * lineAspect;
          const lineGap = 4 * s;
          const lineY = boxY + (boxSize - lineH) / 2;
  
          // 左侧：第一个方块左边
          ctx.drawImage(this.scoreLineImg, leftBoxX - lineW - lineGap, lineY, lineW, lineH);
  
          // 右侧：第二个方块右边（水平镜像）
          ctx.save();
          ctx.translate(rightBoxX + boxSize + lineGap + lineW, lineY);
          ctx.scale(-1, 1);
          ctx.drawImage(this.scoreLineImg, 0, 0, lineW, lineH);
          ctx.restore();
        }
  
        // 左：字母分（背景图）
        const letterScoreImg = this.scoreBoxImages['letter_score'];
        if (letterScoreImg && letterScoreImg.loaded && letterScoreImg.img) {
          ctx.drawImage(letterScoreImg.img, leftBoxX, boxY, boxSize, boxSize);
        } else {
          this.roundRect(leftBoxX, boxY, boxSize, boxSize, 4 * s, null, scoreColor);
        }
        if (valid && showFirstBox) {
          const targetScore = pendingBaseScore;
          // 检查是否需要滚动动画（复用对象，避免频繁创建）
          if (this.lastBoxScore !== targetScore) {
            if (!this.scoreRoll) this.scoreRoll = {};
            this.scoreRoll.from = this.lastBoxScore;
            this.scoreRoll.to = targetScore;
            this.scoreRoll.startTime = Date.now();
            this.scoreRoll.duration = 350; // 与字母跳跃节奏对齐
            this.lastBoxScore = targetScore;
          }
          // 绘制滚动数字或静止数字
          if (this.scoreRoll) {
            // 数字滚动进度与字母跳跃同步，避免两个独立计时器漂移
            const rollProgress = pc._stepProgress !== undefined
              ? pc._stepProgress
              : Math.min((Date.now() - this.scoreRoll.startTime) / this.scoreRoll.duration, 1);
            this._drawRollingNumber(this.scoreRoll, leftBoxX + boxSize / 2, boxY + boxSize / 2, boxSize * 0.5, s, rollProgress);
            if (rollProgress >= 1) {
              this.scoreRoll = null;
            }
          } else {
            this.text(String(targetScore), leftBoxX + boxSize / 2, boxY + boxSize / 2, 20, '#f5f0e8');
          }
          // 左方块标签（方案B光晕呼吸风格）
          if (pc._perCardMultText) {
            if (this.lastLeftLabelText !== pc._perCardMultText) {
              this.lastLeftLabelText = pc._perCardMultText;
              this.leftLabelTagAnim = { startTime: Date.now(), duration: 350 };
            }
            const tagPulse = this._calcPulseScale(this.leftLabelTagAnim, 0.03);
            const tagScale = tagPulse.scale;
            if (tagPulse.progress >= 1) this.leftLabelTagAnim = null;
  
            const tagCX = leftBoxX + boxSize / 2;
            const tagCY = boxY - 14 * s;
            const elapsed = Date.now() - (this.leftLabelTagAnim ? this.leftLabelTagAnim.startTime : Date.now() - 350);
  
            this._drawFancyLabel(ctx, tagCX, tagCY, s, pc._perCardMultText, tagScale, elapsed);
          } else {
            this.lastLeftLabelText = null;
          }
        } else if (game.pendingCheck && !invalid && !game._letterGodAnim && this.lastBoxScore > 0) {
          // 校验中 / 烟花阶段：静态保持预览分（无缝接管，不清零）
          this.text(String(this.lastBoxScore), leftBoxX + boxSize / 2, boxY + boxSize / 2, 20, '#f5f0e8');
        } else if (!game.pendingCheck) {
          if (selected.length >= 1) {
            // 出牌前预览：选中即显示基础字母总分（不含女巫牌加成），复用计分的滚动数字动画
            const previewScore = selected.reduce((sum, c) => sum + c.score, 0);
            if (this.lastBoxScore !== previewScore) {
              if (!this.scoreRoll) this.scoreRoll = {};
              this.scoreRoll.from = this.lastBoxScore;
              this.scoreRoll.to = previewScore;
              this.scoreRoll.startTime = Date.now();
              this.scoreRoll.duration = 350;
              this.lastBoxScore = previewScore;
            }
            if (this.scoreRoll) {
              const rollProgress = Math.min((Date.now() - this.scoreRoll.startTime) / this.scoreRoll.duration, 1);
              this._drawRollingNumber(this.scoreRoll, leftBoxX + boxSize / 2, boxY + boxSize / 2, boxSize * 0.5, s, rollProgress);
              if (rollProgress >= 1) this.scoreRoll = null;
            } else {
              this.text(String(previewScore), leftBoxX + boxSize / 2, boxY + boxSize / 2, 20, '#f5f0e8');
            }
          } else {
            // 没有选中且没有 pendingCheck 时重置
            this.lastBoxScore = 0;
            this.scoreRoll = null;
          }
        }
  
        // 中：乘号（金棕色，加粗变大）
        ctx.save();
        ctx.font = `bold ${Math.floor(20 * s)}px sans-serif`;
        ctx.fillStyle = '#b87333';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('×', centerX, boxY + boxSize / 2);
        ctx.restore();
  
        // letter_a_mult_half 惩罚动画：妖雾弥散边框（提前 100ms 开始，总时长 700ms）
        if (valid && showSecondBox && pc.multHalfResult?.triggered) {
          const phase2Elapsed = Date.now() - (pc._phase2StartTime || Date.now());
          const baseMultDelay = 200;
          const STEP_DURATION = 350;
          const totalSteps = (pc.wholeWordJokers || []).length;
          const postWait = 200;
          const readyTime = totalSteps * STEP_DURATION + postWait;
          const afterBase = Math.max(0, phase2Elapsed - baseMultDelay);
          const penaltyElapsed = afterBase - (readyTime - 100); // 提前 100ms

          if (penaltyElapsed >= 0 && penaltyElapsed < 700) {
            this._drawLashBorder(ctx, rightBoxX, boxY, boxSize, boxSize, 4 * s, s, penaltyElapsed / 1000);
          }
        }

        // 右：长度倍率（背景图）
        const lengthImg = this.scoreBoxImages['length'];
        if (lengthImg && lengthImg.loaded && lengthImg.img) {
          ctx.drawImage(lengthImg.img, rightBoxX, boxY, boxSize, boxSize);
        } else {
          this.roundRect(rightBoxX, boxY, boxSize, boxSize, 4 * s, null, multColor);
        }
        if (valid && showSecondBox) {
          // whole_word 依次触发（固定 350ms 一步，跳跃+标签+倍率同时发生；基础倍率已由预览接管）
          let displayValue = null;
          let labelText = null;
          const wjList = pc.wholeWordJokers || [];

          // 计算 phase 2 已进行的时间
          const phase2Elapsed = Date.now() - (pc._phase2StartTime || Date.now());

          const baseMultDelay = 200;
          const STEP_DURATION = 350;

          // 计算当前步
          let currentStep = -1;
          if (phase2Elapsed >= baseMultDelay) {
            const afterBase = phase2Elapsed - baseMultDelay;
            currentStep = Math.floor(afterBase / STEP_DURATION);
          }

          // 计算当前倍率：currentStep = i 表示前 i+1 张 whole_word 已生效
          let curMult = pendingLength;
          for (let i = 0; i < Math.min(currentStep + 1, wjList.length); i++) {
            const item = wjList[i];
            const joker = item.joker;
            if (item.isPenalty) {
              curMult += joker.penalty;
            } else if (joker.trigger === 'illegal_boost' || joker.trigger === 'last_chance' || joker.trigger === 'chaos_orb' || joker.operation === 'multi_adds_value' || joker.operation === 'multi_accumulation') {
              curMult += getJokerValue(joker);
            } else {
              curMult = Math.ceil(curMult * getJokerValue(joker));
            }
          }
          displayValue = curMult;

          // 标签：currentStep = i 时显示第 i 张的 xValue / +Value
          const labelIdx = currentStep;
          if (labelIdx >= 0 && labelIdx < wjList.length) {
            const afterBase = Math.max(0, phase2Elapsed - baseMultDelay);
            const stepProgress = (afterBase % STEP_DURATION) / STEP_DURATION;
            if (stepProgress < 1.0) {
              const item = wjList[labelIdx];
              const joker = item.joker;
              const formatLabelValue = (v) => Number.isInteger(v) ? String(v) : v.toFixed(1);
              if (item.isPenalty) {
                labelText = `${formatLabelValue(joker.penalty)}`;
              } else if (joker.trigger === 'illegal_boost' || joker.trigger === 'last_chance' || joker.trigger === 'chaos_orb' || joker.operation === 'multi_adds_value' || joker.operation === 'multi_accumulation') {
                labelText = `+${formatLabelValue(getJokerValue(joker))}`;
              } else {
                labelText = `x${formatLabelValue(getJokerValue(joker))}`;
              }
            }
          }

          // 数字变化时触发一次脉冲（类似金币动画）；基础倍率与预览相同，不会触发
          const isFirstMultShow = this.lastMultValue === null && displayValue !== null;
          if (isFirstMultShow || this.lastMultValue !== displayValue) {
            this.lastMultValue = displayValue;
            this.multAnim = { startTime: Date.now(), duration: 400 };
            // 基础倍率步已移除，数字变化均来自 whole_word 触发，统一用 answer_tone
            if (game && game.audioManager) game.audioManager.play('answer_tone');
          }

          // letter_a_mult_half 惩罚动画：进入惩罚阶段后数字减半（提前 100ms）
          if (pc.multHalfResult?.triggered) {
            const totalSteps = wjList.length;
            const postWait = 200;
            const readyTime = totalSteps * STEP_DURATION + postWait;
            const afterBase = Math.max(0, phase2Elapsed - baseMultDelay);
            const penaltyElapsed = afterBase - (readyTime - 100); // 提前 100ms
            if (penaltyElapsed >= 0) {
              displayValue = pc.multHalfResult.halvedMult;
            }
          }
  
          // 绘制数字（带一次变大缩小脉冲）
          const multPulse = this._calcPulseScale(this.multAnim, 0.28);
          let pulseScale = multPulse.scale;
          if (multPulse.progress >= 1) this.multAnim = null;
  
          if (displayValue !== null) {
            ctx.save();
            ctx.translate(rightBoxX + boxSize / 2, boxY + boxSize / 2);
            ctx.scale(pulseScale, pulseScale);
            ctx.font = `bold ${Math.floor(20 * s)}px sans-serif`;
            ctx.fillStyle = '#f5f0e8';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            // 有小数时保留1位，整数时正常显示（总分飞行仍用四舍五入的整数）
            const displayText = Number.isInteger(displayValue) ? String(Math.round(displayValue)) : displayValue.toFixed(1);
            ctx.fillText(displayText, 0, 0);
            ctx.restore();
          }
  
          // 绘制 "xN" 标签（右方块上方，方案B粒子环流风格）
          if (labelText) {
            // 标签首次出现时触发弹出动画（350ms）
            if (this.lastLabelText !== labelText) {
              this.lastLabelText = labelText;
              this.labelTagAnim = { startTime: Date.now(), duration: 350 };
            }
  
            const tagPulse = this._calcPulseScale(this.labelTagAnim, 0.03);
            const tagScale = tagPulse.scale;
            if (tagPulse.progress >= 1) this.labelTagAnim = null;
  
            const tagCX = rightBoxX + boxSize / 2;
            const tagCY = boxY - 14 * s;
            const elapsed = Date.now() - (this.labelTagAnim ? this.labelTagAnim.startTime : Date.now() - 350);
  
            this._drawFancyLabel(ctx, tagCX, tagCY, s, labelText, tagScale, elapsed);
          } else {
            this.lastLabelText = null;
          }
        } else if (game.pendingCheck && !invalid && !game._letterGodAnim && this.lastMultValue !== null) {
          // 校验中 / 阶段2之前：静态保持预览的单词长度（无缝接管，不清零）
          ctx.save();
          ctx.translate(rightBoxX + boxSize / 2, boxY + boxSize / 2);
          ctx.font = `bold ${Math.floor(20 * s)}px sans-serif`;
          ctx.fillStyle = '#f5f0e8';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(String(this.lastMultValue), 0, 0);
          ctx.restore();
        } else if (!game.pendingCheck) {
          if (selected.length >= 1) {
            // 出牌前预览：显示单词基础倍率（即字母数量，不含女巫牌加成），复用计分的倍率脉冲动画
            const previewMult = selected.length;
            if (this.lastMultValue !== previewMult) {
              this.lastMultValue = previewMult;
              this.multAnim = { startTime: Date.now(), duration: 400 };
            }
            const multPulse = this._calcPulseScale(this.multAnim, 0.28);
            const pulseScale = multPulse.scale;
            if (multPulse.progress >= 1) this.multAnim = null;
            ctx.save();
            ctx.translate(rightBoxX + boxSize / 2, boxY + boxSize / 2);
            ctx.scale(pulseScale, pulseScale);
            ctx.font = `bold ${Math.floor(20 * s)}px sans-serif`;
            ctx.fillStyle = '#f5f0e8';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(String(previewMult), 0, 0);
            ctx.restore();
          } else {
            // 没有选中且没有 pendingCheck 时重置
            this.lastMultValue = null;
            this.multAnim = null;
          }
        }

        // 方块上方提示小字（计分动画期间隐藏，避免与 xN/+N 标签重叠）
        if (!valid) {
          ctx.save();
          ctx.font = `${Math.floor(10 * s)}px sans-serif`;
          ctx.fillStyle = '#b87333';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'bottom';
          ctx.fillText('字母总分', leftBoxX + boxSize / 2, boxY - 3 * s);
          ctx.fillText('单词长度', rightBoxX + boxSize / 2, boxY - 3 * s);
          ctx.restore();
        }
      }

      // 绘制卡牌（跳过 null 占位符，其他牌位置完全不动）；词缀试炼模式改为 26 键键盘
      if (!isAffixTrial) {
      game.hand.forEach((card, i) => {
        if (!card) return;
        const col = i % cols;
        const row = Math.floor(i / cols);
        // 最后一行不满时，该行单独居中
        const cardsInRow = (row === rows - 1 && game.hand.length % cols !== 0)
          ? game.hand.length % cols
          : cols;
        const rowTotalW = cardsInRow * this.cardW + (cardsInRow - 1) * this.gap;
        const rowStartX = (W - rowTotalW) / 2;
        const x = rowStartX + col * (this.cardW + this.gap);
        const y = cardAreaY + row * (this.cardH + this.gap);
        // 字母之神动画期间，未击中的卡牌显示旧分数
        let displayScore = null;
        if (game._letterGodAnim && card._originalScore !== undefined && !game._letterGodAnim.hitCardIds?.[card.id]) {
          displayScore = card._originalScore;
        }
        this.drawCard(card, x, y, card.newCard, displayScore);
        this.cardRects.push({ x, y, w: this.cardW, h: this.cardH, cardId: card.id });
  
        // 清除 newCard 标记（下一帧不再显示 NEW）
        card.newCard = false;
      });
  
      // 绘制正在飞出的旧牌（基于原始索引位置 + animOffset）
      for (const card of game.flyingCards) {
        if (card._flyIndex !== undefined) {
          const fCol = card._flyIndex % cols;
          const fRow = Math.floor(card._flyIndex / cols);
          const fCardsInRow = (fRow === rows - 1 && game.hand.length % cols !== 0)
            ? game.hand.length % cols
            : cols;
          const fRowTotalW = fCardsInRow * this.cardW + (fCardsInRow - 1) * this.gap;
          const fRowStartX = (W - fRowTotalW) / 2;
          const fx = fRowStartX + fCol * (this.cardW + this.gap);
          const fy = cardAreaY + fRow * (this.cardH + this.gap);
          this.drawCard(card, fx, fy);
        }
      }
      } else {
        // 词缀试炼：手牌区替换为 26 键字母键盘（QWERTY 三行）
        this._drawAffixKeyboard(game, cardAreaY, cardGridH, s);
      }
  
      // 底部图片按钮区域（出牌/弃牌/清空选择整体上移 5px）
      const btnY = H - 90 * s - 5;
      const btnW = 90 * s;
      const btnH = 56 * s;
      const btnGap = isWordTrial ? 30 * s : 20 * s; // 单词试炼两按钮间距更大
      // 单词试炼模式：隐藏弃牌按钮，出牌/清空选择两个按钮左右并排居中
      const totalBtnW = isWordTrial ? btnW * 2 + btnGap : btnW * 3 + btnGap * 2;
      const btnStartX = (W - totalBtnW) / 2;
  
      // === 争分夺秒倒计时条（在出牌按钮上方）===
      if (game._hastePlayActive && game._hastePlayStartTime) {
        const elapsed = Date.now() - game._hastePlayStartTime;
        const total = 20000;
        const remaining = Math.max(0, total - elapsed);
        const progress = remaining / total;
        if (progress > 0) {
          const timerH = 6 * s;
          const timerY = btnY - timerH - 8 * s;
          const timerW = W * 0.5;
          const timerX = W / 2 - timerW / 2;
          // 背景
          this.roundRect(timerX, timerY, timerW, timerH, timerH / 2, 'rgba(0,0,0,0.3)');
          // 进度
          const barColor = progress > 0.5 ? '#2ecc71' : progress > 0.2 ? '#f39c12' : '#e74c3c';
          this.roundRect(timerX, timerY, timerW * progress, timerH, timerH / 2, barColor);
          // 文字
          ctx.save();
          const sec = (remaining / 1000).toFixed(1);
          ctx.font = `bold ${Math.max(7, Math.floor(9 * s))}px sans-serif`;
          ctx.fillStyle = '#fff';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(`${sec}s`, timerX + timerW / 2, timerY + timerH / 2 + 0.5 * s);
          ctx.restore();
        }
      }
  
      // 出牌按钮（图片 + 阴影 + 按下偏移）
      const playX = btnStartX;
      const playY = btnY + (this.pressedBtn === 'play' ? 2 * s : 0);
      ctx.save();
      ctx.shadowColor = 'rgba(0,0,0,0.35)';
      ctx.shadowBlur = 6 * s;
      ctx.shadowOffsetY = 3 * s;
      this.drawBtnImage('out_card', playX, playY, btnW, btnH);
      ctx.restore();
      // 出牌文字 + 剩余次数
      ctx.save();
      ctx.font = `bold ${Math.floor(16 * s)}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const btnTextY = playY + btnH / 2 - 1 * s;
      const playText = `出牌 (${game.handsLeft})`;
      const playTx = playX + btnW / 2;
      const selectedCount = game.getSelectedCards ? game.getSelectedCards().length : 0;
      const isInvalid = game.pendingCheck && (game.pendingCheck.state === 'invalid' || game.pendingCheck.state === 'witch_failed');
      // fill_blanks：选满目标词长度才可出牌，否则置灰；词缀试炼：至少输入 1 个字母
      const fbNeedLen = isFillBlanks && game._fillBlankData && game._fillBlankData.word ? game._fillBlankData.word.length : 0;
      const notEnough = fbNeedLen > 0 ? selectedCount < fbNeedLen
        : (isAffixTrial ? (affixTrial.typed || []).length < 1 : selectedCount < 2);
      if (isInvalid || notEnough) {
        // 非法状态或牌数不足：暖灰色文字 + 深色描边
        ctx.lineWidth = 2 * s;
        ctx.strokeStyle = '#3a2e1d';
        ctx.strokeText(playText, playTx, btnTextY);
        ctx.fillStyle = '#9a8f7d';
        ctx.fillText(playText, playTx, btnTextY);
      } else {
        // 深色外描边
        ctx.lineWidth = 2 * s;
        ctx.strokeStyle = '#2a1f0d';
        ctx.strokeText(playText, playTx, btnTextY);
        // 金色渐变填充
        const grad = ctx.createLinearGradient(playTx, btnTextY - 7 * s, playTx, btnTextY + 7 * s);
        grad.addColorStop(0, '#dfc06e');
        grad.addColorStop(0.5, '#c9a84c');
        grad.addColorStop(1, '#b5973e');
        ctx.fillStyle = grad;
        ctx.fillText(playText, playTx, btnTextY);
      }
      ctx.restore();
      this.playBtnRect = { x: playX, y: btnY, w: btnW, h: btnH, action: 'play' };
  
      // 弃牌按钮（图片 + 阴影 + 按下偏移）；单词试炼模式下隐藏并禁用
      if (!isWordTrial) {
      const discardX = btnStartX + btnW + btnGap;
      const discardY = btnY + (this.pressedBtn === 'discard' ? 2 * s : 0);
      ctx.save();
      ctx.shadowColor = 'rgba(0,0,0,0.35)';
      ctx.shadowBlur = 6 * s;
      ctx.shadowOffsetY = 3 * s;
      this.drawBtnImage('throw_card', discardX, discardY, btnW, btnH);
      ctx.restore();
      // 弃牌文字 + 剩余次数
      ctx.save();
      ctx.font = `bold ${Math.floor(16 * s)}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const discardTextY = discardY + btnH / 2 - 1 * s;
      const discardText = `弃牌 (${game.discardsLeft})`;
      const discardTx = discardX + btnW / 2;
      if (game.discardsLeft <= 0) {
        // 次数用完：深灰色文字（disable 状态）
        ctx.fillStyle = '#666';
        ctx.fillText(discardText, discardTx, discardTextY);
      } else {
        // 深色外描边
        ctx.lineWidth = 2 * s;
        ctx.strokeStyle = '#2a1f0d';
        ctx.strokeText(discardText, discardTx, discardTextY);
        // 金色渐变填充（上亮下暗，自然光照）
        const dgrad = ctx.createLinearGradient(discardTx, discardTextY - 7 * s, discardTx, discardTextY + 7 * s);
        dgrad.addColorStop(0, '#dfc06e');
        dgrad.addColorStop(0.5, '#c9a84c');
        dgrad.addColorStop(1, '#b5973e');
        ctx.fillStyle = dgrad;
        ctx.fillText(discardText, discardTx, discardTextY);
      }
      ctx.restore();
      this.discardBtnRect = { x: discardX, y: btnY, w: btnW, h: btnH, action: 'discard' };
      } else {
        this.discardBtnRect = null;
      }
  
      // 清空选择按钮（图片 + 阴影 + 按下偏移）
      const resetX = isWordTrial ? btnStartX + btnW + btnGap : btnStartX + (btnW + btnGap) * 2;
      const resetY = btnY + (this.pressedBtn === 'reset' ? 2 * s : 0);
      ctx.save();
      ctx.shadowColor = 'rgba(0,0,0,0.35)';
      ctx.shadowBlur = 6 * s;
      ctx.shadowOffsetY = 3 * s;
      this.drawBtnImage('reset_select', resetX, resetY, btnW, btnH);
      ctx.restore();
      // 清空选择文字
      ctx.save();
      ctx.font = `bold ${Math.floor(16 * s)}px sans-serif`;
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
      this.resetBtnRect = { x: resetX, y: btnY, w: btnW, h: btnH, action: 'reset' };
  
      // 调试：点击第一个方块显示华丽 x2 标签（保持 1.5s）
      if (game._debugLabelShow) {
        const elapsed = Date.now() - game._debugLabelShow.startTime;
        if (elapsed < 1500) {
          const progress = Math.min(elapsed / 350, 1);
          const tagScale = 1 + 0.25 * Math.sin(progress * Math.PI);
          const tagCX = leftBoxX + boxSize / 2;
          const tagCY = boxY - 14 * s;
          this._drawFancyLabel(ctx, tagCX, tagCY, s, game._debugLabelShow.text, tagScale, elapsed);
        } else {
          game._debugLabelShow = null;
        }
      }
  
      // 女巫牌详情弹窗
      this._drawWitchDetailPopup(ctx, game, s);
      // 空女巫槽位说明弹窗
      this._drawWitchEmptyPopup(ctx, game, s);
      // 魔法药水详情弹窗
      this._drawPotionDetailPopup(ctx, game, s);
    }

  // ===== fill_blanks（完形填空）例句渲染 =====
  // filledLetters: 已选/已出字母（小写，按顺序逐格填入下划线）
  // status: 'idle' | 'checking' | 'valid' | 'invalid' | 'witch_failed'；statusText: witch_failed 的提示文案
  Renderer.prototype._drawFillBlankArea = function(game, maskX, maskY, maskW, maskH, s, filledLetters, status, statusText) {
    const ctx = this.ctx;
    const data = game._fillBlankData;
    if (!data || !data.word || !data.example) return;

    const wordLen = data.word.length;

    // 跟踪每个槽位字母的出现时间（字母变化/新出现时重置动画，消失时清除）
    if (!this._fbLetterAnimStart) this._fbLetterAnimStart = {};
    if (!this._fbFilledPrev) this._fbFilledPrev = [];
    for (let i = 0; i < wordLen; i++) {
      const ch = filledLetters[i];
      if (ch && ch !== this._fbFilledPrev[i]) {
        this._fbLetterAnimStart[i] = Date.now();
      } else if (!ch) {
        delete this._fbLetterAnimStart[i];
      }
    }
    this._fbFilledPrev = filledLetters.slice(0, wordLen);
    const parts = getFillBlankParts(data);
    const maxW = maskW - 16 * s;
    const isValid = status === 'valid';

    const blankColors = {
      idle: '#c4a35a', checking: '#c4a35a', valid: '#2d7d32',
      invalid: '#c0392b', witch_failed: '#9b59b6'
    };
    const fillColor = blankColors[status] || '#c4a35a';

    // 英文按宽度折行（不在单词中间断）；字号 20 → 18 → 16 自适应
    let fontSize = 20;
    let lines = null;
    let slotW = 0;
    let blankW = 0;
    for (const fs of [20, 18, 16]) {
      fontSize = fs;
      ctx.font = `bold ${Math.floor(fs * s)}px Georgia, 'Times New Roman', serif`;
      slotW = Math.max(ctx.measureText('_').width, ctx.measureText('M').width) + 2 * s;
      // 变形尾巴（如 deemed 的 ed）跟在下划线后展示，挖空宽度需包含它
      const tailW = parts.suffix ? ctx.measureText(parts.suffix).width : 0;
      blankW = slotW * wordLen + tailW;
      // 答对时单词按加大后的字号（fs+2）占位折行，保证前后空格不被大字挤压
      let blankDisplayW = blankW;
      if (isValid) {
        ctx.font = `bold ${Math.floor((fs + 2) * s)}px Georgia, 'Times New Roman', serif`;
        blankDisplayW = ctx.measureText(parts.surface || data.word).width;
        ctx.font = `bold ${Math.floor(fs * s)}px Georgia, 'Times New Roman', serif`;
      }
      lines = this._wrapFillBlankLines(ctx, parts.segments, maxW, blankDisplayW);
      if (lines.length <= 2 || fs === 16) break;
    }
    const enFont = `bold ${Math.floor(fontSize * s)}px Georgia, 'Times New Roman', serif`;
    // 下划线上填入的字母比例句正文大 2px，更醒目
    const blankLetterFont = `bold ${Math.floor((fontSize + 2) * s)}px Georgia, 'Times New Roman', serif`;
    const enLineH = Math.floor(fontSize * s * 1.4);

    // 底部行内容：空态/答对显示中文翻译，其余显示状态文案
    let bottomText = null;
    let bottomColor = '#8a7a5a';
    if (status === 'checking') {
      const dotCount = (Math.floor(Date.now() / 400) % 4) + 1;
      bottomText = '.'.repeat(dotCount);
      bottomColor = '#c4a35a';
    } else if (status === 'invalid') {
      // fill_blanks 传入自定义文案（如「单词不匹配」），普通模式默认「单词不存在」
      bottomText = statusText || '单词不存在';
      bottomColor = '#c0392b';
    } else if (status === 'witch_failed') {
      bottomText = statusText || '女巫试炼未满足';
      bottomColor = '#9b59b6';
    } else if (data.example_zh) {
      bottomText = data.example_zh;
    }

    const bottomH = bottomText ? 24 * s : 0;
    // 中英文例句之间的间距（实际绘制与高度账本统一用这个值）
    const enZhGap = 2 * s - 5;
    // 提示按钮行：中文注释下方两个并排按钮（首字母提示 / 提示单词）
    const btnRowH = 34 * s;
    const btnGapY = (bottomText ? 8 * s : 4 * s) + 2;
    const totalH = lines.length * enLineH + (bottomText ? enZhGap + bottomH : 0) + btnGapY + btnRowH;
    // 底部额外留白：按钮与框下边框的间距大于顶部间距（含按钮下方 padding 调整）
    const bottomPad = 40 * s + 2;
    // 顶部留白 +10px：内容整体下移 10px
    let curY = maskY + (maskH - totalH - bottomPad) / 2 + enLineH / 2 + 10;

    // 逐行绘制英文（水平居中）
    ctx.save();
    ctx.font = enFont;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    const spaceW = ctx.measureText(' ').width;
    for (const line of lines) {
      let curX = maskX + (maskW - line.width) / 2;
      for (const item of line.items) {
        if (item.isBlank) {
          if (isValid) {
            // 答对：显示例句中的完整词形（含变形），绿色高亮；字号与下划线填入字母一致（比正文大 2px）
            const surface = parts.surface || data.word;
            ctx.save();
            ctx.font = blankLetterFont;
            const sw = ctx.measureText(surface).width;
            const sx = curX + (item.width - sw) / 2; // 在原挖空宽度内居中，防止加宽后溢出
            this.roundRect(sx - 3 * s, curY - enLineH * 0.4, sw + 6 * s, enLineH * 0.8, 4 * s, 'rgba(45,125,50,0.16)');
            ctx.fillStyle = '#2d7d32';
            ctx.fillText(surface, sx, curY);
            ctx.restore();
          } else {
            // 挖空：逐格下划线，已选字母逐格填入
            for (let i = 0; i < wordLen; i++) {
              const slotCX = curX + slotW * (i + 0.5);
              ctx.fillStyle = 'rgba(196,163,90,0.6)';
              ctx.fillRect(curX + slotW * i + 1 * s, curY + enLineH * 0.32, slotW - 2 * s, Math.max(1.5 * s, 1));
              const ch = filledLetters[i];
              if (ch) {
                ctx.save();
                ctx.font = blankLetterFont;
                ctx.fillStyle = fillColor;
                const lw = ctx.measureText(ch).width;
                // 字母从下划线处冒出来的动画：250ms easeOutBack 上移 + 淡入
                let riseOffsetY = 0;
                let riseAlpha = 1;
                const animStart = this._fbLetterAnimStart[i];
                if (animStart) {
                  const elapsed = Date.now() - animStart;
                  const dur = 250;
                  if (elapsed < dur) {
                    const t = elapsed / dur;
                    riseOffsetY = (1 - Easing.easeOutCubic(t)) * 10 * s;
                    riseAlpha = Math.min(elapsed / 120, 1);
                  } else {
                    delete this._fbLetterAnimStart[i];
                  }
                }
                if (riseAlpha < 1) ctx.globalAlpha = riseAlpha;
                ctx.fillText(ch, slotCX - lw / 2, curY + riseOffsetY);
                ctx.restore();
              }
            }
            // 变形尾巴（如 deemed 的 ed）：普通文本颜色，跟在下划线后面
            if (parts.suffix) {
              ctx.fillStyle = '#5a4a2a';
              ctx.fillText(parts.suffix, curX + slotW * wordLen, curY);
            }
          }
          curX += item.width + spaceW;
        } else {
          ctx.fillStyle = '#5a4a2a';
          ctx.fillText(item.text, curX, curY);
          curX += item.width + spaceW;
        }
      }
      curY += enLineH;
    }
    ctx.restore();

    // 底部行（中文翻译 / 状态文案），超宽时降字号，仍超宽则截断
    if (bottomText) {
      let bs = 15;
      ctx.save();
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.font = `${Math.floor(bs * s)}px sans-serif`;
      while (ctx.measureText(bottomText).width > maxW && bs > 12) {
        bs--;
        ctx.font = `${Math.floor(bs * s)}px sans-serif`;
      }
      let display = bottomText;
      while (display.length > 1 && ctx.measureText(display + '…').width > maxW) {
        display = display.slice(0, -1);
      }
      if (display !== bottomText) display += '…';
      ctx.fillStyle = bottomColor;
      const bottomMidY = curY + enZhGap + bottomH / 2;
      if (status === 'invalid' && this.errorIcon && this.errorIconLoaded) {
        // 错误提示带 error 图标：图标 + 文字整体居中
        const errIconSize = 16 * s;
        const errGap = 4 * s;
        const textW = ctx.measureText(display).width;
        const groupX = maskX + maskW / 2 - (errIconSize + errGap + textW) / 2;
        ctx.drawImage(this.errorIcon, groupX, bottomMidY - errIconSize / 2, errIconSize, errIconSize);
        ctx.textAlign = 'left';
        ctx.fillText(display, groupX + errIconSize + errGap, bottomMidY);
      } else {
        ctx.fillText(display, maskX + maskW / 2, bottomMidY);
      }
      ctx.restore();
    }

    // 两个并排提示按钮（米白底/金边/深色文字，按下时变色+下移）
    const btnW = 124 * s;
    const btnH = btnRowH;
    const btnGap = 18 * s;
    const btnRowW = btnW * 2 + btnGap;
    const btn1X = maskX + (maskW - btnRowW) / 2;
    const btn2X = btn1X + btnW + btnGap;
    // 按钮行额外下移（curY 偏移 +2 之外的增量；累计净下移 8px）
    const btnY = (bottomText ? curY + enZhGap + bottomH : curY - enLineH / 2) + btnGapY + 6;

    const drawFbBtn = (bx, label, iconData, emoji, suffix, pressed, iconAnim, disabled) => {
      const dy = pressed && !disabled ? 2 * s : 0;
      ctx.save();
      if (disabled) ctx.globalAlpha = 0.55;
      this._drawOrnateBtnFrame(bx, btnY + dy, btnW, btnH, s, pressed);

      const midY = btnY + dy + btnH / 2;
      // 提示单词的 ad 图标基准尺寸更大一点
      const iconSize = (iconAnim === 'breath' ? 21 : 18) * s;
      const gap = 4 * s;
      ctx.font = `bold ${Math.floor(14 * s)}px sans-serif`;
      const hasIcon = !disabled && iconData && iconData.img && iconData.loaded;
      const emojiCh = !disabled && !hasIcon ? emoji : null;
      const suffixTxt = disabled ? null : suffix;
      const labelW = ctx.measureText(label).width;
      const emojiW = emojiCh ? ctx.measureText(emojiCh).width : 0;
      const suffixW = suffixTxt ? ctx.measureText(suffixTxt).width : 0;
      const contentW = labelW + (hasIcon || emojiCh || suffixTxt ? gap + (hasIcon ? iconSize : emojiW) : 0) + (suffixTxt ? gap + suffixW : 0);
      let cx = bx + (btnW - contentW) / 2;

      ctx.fillStyle = disabled ? '#9a9186' : '#5a4a2a';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText(label, cx, midY);
      cx += labelW + gap;
      if (hasIcon) {
        const iconCX = cx + iconSize / 2;
        ctx.save();
        ctx.translate(iconCX, midY);
        if (iconAnim === 'flip') {
          // 正反面翻转：每 3 秒一周（水平方向 scaleX 周期变化）
          const t = (Date.now() % 3000) / 3000;
          ctx.scale(Math.cos(t * Math.PI * 2), 1);
        } else if (iconAnim === 'breath') {
          // 缓慢呼吸缩放（约 3 秒一周期）
          const b = 1 + 0.08 * Math.sin(Date.now() / 500);
          ctx.scale(b, b);
        }
        ctx.drawImage(iconData.img, -iconSize / 2, -iconSize / 2, iconSize, iconSize);
        ctx.restore();
        cx += iconSize;
      } else if (emojiCh) {
        ctx.fillText(emojiCh, cx, midY);
        cx += emojiW;
      }
      if (suffixTxt) ctx.fillText(suffixTxt, cx + gap, midY);
      ctx.restore();
    };
    // 每回合最多提示 3 个字母，达上限后按钮置灰、文案改为「提示达上限」（点击仍可弹 toast）
    const fbHintDone = (game._fillBlankHintCount || 0) >= Math.min(3, wordLen);
    // 图标未加载完成时回退到 emoji
    if (fbHintDone) {
      drawFbBtn(btn1X, '提示达上限', null, null, null, false, null, true);
    } else {
      drawFbBtn(btn1X, '提示字母', { img: this.coinIcon, loaded: this.coinIconLoaded }, '💰', '1', !!this._fbHintLetterPressed, 'flip');
    }
    drawFbBtn(btn2X, '提示单词', { img: this.coinAdIcon, loaded: this.coinAdIconLoaded }, '📺', null, !!this._fbHintWordPressed, 'breath');

    // 注册点击区域（非 fill 模式在 drawPlaying 开头已置 null）
    this.fillBlankHintLetterRect = { x: btn1X, y: btnY, w: btnW, h: btnH };
    this.fillBlankHintWordRect = { x: btn2X, y: btnY, w: btnW, h: btnH };
  }

  // ===== 词缀拼词试炼（prefix_* / postfix_*）试炼框渲染 =====
  // typedLetters: 已输入字母（大写数组）；status: 'idle' | 'checking' | 'valid' | 'invalid' | 'witch_failed'
  Renderer.prototype._drawAffixTrialArea = function(game, maskX, maskY, maskW, maskH, s, typedLetters, status, statusText) {
    const ctx = this.ctx;
    const trial = game._getAffixTrial ? game._getAffixTrial() : null;
    if (!trial) return;
    const { kind, affix } = trial;
    const typed = (typedLetters || []).map(ch => String(ch).toLowerCase());
    const isValid = status === 'valid';
    const fullWord = (kind === 'prefix' ? affix + typed.join('') : typed.join('') + affix);

    // 跟踪每个槽位字母的出现时间（字母变化/新出现时重置冒泡动画）
    if (!this._afLetterAnimStart) this._afLetterAnimStart = {};
    if (!this._afFilledPrev) this._afFilledPrev = [];
    for (let i = 0; i < typed.length; i++) {
      if (typed[i] && typed[i] !== this._afFilledPrev[i]) {
        this._afLetterAnimStart[i] = Date.now();
      }
    }
    this._afFilledPrev = typed.slice();

    const blankColors = {
      idle: '#c4a35a', checking: '#c4a35a', valid: '#2d7d32',
      invalid: '#c0392b', witch_failed: '#9b59b6'
    };
    const fillColor = blankColors[status] || '#c4a35a';

    const maxW = maskW - 24 * s;
    // 字号自适应：26 → 22 → 18，保证 词缀+下划线 不超宽
    // 下划线为一条整体：基础宽度约 3 个字母，随输入字母个数增长
    let fontSize = 26;
    let affixW = 0;
    let typedW = 0;
    let lineW = 0;
    for (const fs of [26, 22, 18]) {
      fontSize = fs;
      ctx.font = `bold ${Math.floor(fs * s)}px Georgia, 'Times New Roman', serif`;
      affixW = ctx.measureText(affix).width;
      // 输入字母按大 2px 的字号测量
      ctx.font = `bold ${Math.floor((fs + 2) * s)}px Georgia, 'Times New Roman', serif`;
      typedW = typed.reduce((sum, ch) => sum + ctx.measureText(ch).width, 0);
      const fullWordW = ctx.measureText(fullWord).width;
      ctx.font = `bold ${Math.floor(fs * s)}px Georgia, 'Times New Roman', serif`;
      const minLineW = ctx.measureText('MMM').width;
      lineW = Math.max(minLineW, typedW + 6 * s);
      const totalWordW = isValid ? fullWordW : affixW + 6 * s + lineW;
      if (totalWordW <= maxW || fs === 18) break;
    }
    const enFont = `bold ${Math.floor(fontSize * s)}px Georgia, 'Times New Roman', serif`;
    const slotLetterFont = `bold ${Math.floor((fontSize + 2) * s)}px Georgia, 'Times New Roman', serif`;
    const wordLineH = Math.floor(fontSize * s * 1.5);

    // 提示行内容
    let hintText = null;
    let hintColor = '#8a7a5a';
    if (status === 'checking') {
      hintText = '.'.repeat((Math.floor(Date.now() / 400) % 4) + 1);
      hintColor = '#c4a35a';
    } else if (status === 'invalid') {
      hintText = statusText || '单词不存在';
      hintColor = '#c0392b';
    } else if (status === 'witch_failed') {
      hintText = statusText || '女巫试炼未满足';
      hintColor = '#9b59b6';
    } else if (isValid) {
      // 拼写正确：展示单词释义（本地词库/缓存取不到时兜底「拼写正确！」）
      const meaningObj = game.pendingCheck && game.pendingCheck.meaning;
      const meaningText = meaningObj ? formatMeaning(meaningObj) : '';
      hintText = meaningText || '拼写正确！';
      hintColor = '#2d7d32';
    } else {
      hintText = `还需要拼出 ${trial.left} 个单词`;
    }

    // 高度账本：单词行 + 提示行 + 按钮行
    const hintH = 22 * s;
    const wordHintGap = 4 * s;
    const btnRowH = 34 * s;
    const btnGapY = 10 * s;
    const totalH = wordLineH + wordHintGap + hintH + btnGapY + btnRowH;
    let curY = maskY + (maskH - totalH) / 2 + wordLineH / 2;

    // === 单词行：词缀 + 整体下划线（答对时整体绿色高亮）===
    ctx.save();
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    if (isValid) {
      ctx.font = slotLetterFont;
      const fw = ctx.measureText(fullWord).width;
      const fx = maskX + (maskW - fw) / 2;
      this.roundRect(fx - 6 * s, curY - wordLineH * 0.42, fw + 12 * s, wordLineH * 0.84, 5 * s, 'rgba(45,125,50,0.16)');
      ctx.fillStyle = '#2d7d32';
      ctx.fillText(fullWord, fx, curY);
    } else {
      ctx.font = enFont;
      const rowW = affixW + 6 * s + lineW;
      let curX = maskX + (maskW - rowW) / 2;
      // 词缀文本（prefix 在左，postfix 在右）
      const drawAffix = () => {
        ctx.font = enFont;
        ctx.fillStyle = '#5a4a2a';
        ctx.fillText(affix, curX, curY);
        curX += affixW + 6 * s;
      };
      if (kind === 'prefix') drawAffix();
      // 一条整体下划线（宽度随输入字母增长），输入字母在线内水平居中、带冒泡动画
      const lineX = curX;
      ctx.fillStyle = 'rgba(196,163,90,0.6)';
      ctx.fillRect(lineX, curY + wordLineH * 0.32, lineW, Math.max(1.5 * s, 1));
      let lx = lineX + (lineW - typedW) / 2;
      for (let i = 0; i < typed.length; i++) {
        const ch = typed[i];
        ctx.save();
        ctx.font = slotLetterFont;
        ctx.fillStyle = fillColor;
        const lw = ctx.measureText(ch).width;
        // 字母从下划线处冒出来的动画：250ms easeOutCubic 上移 + 淡入
        let riseOffsetY = 0;
        let riseAlpha = 1;
        const animStart = this._afLetterAnimStart[i];
        if (animStart) {
          const elapsed = Date.now() - animStart;
          const dur = 250;
          if (elapsed < dur) {
            const t = elapsed / dur;
            riseOffsetY = (1 - Easing.easeOutCubic(t)) * 10 * s;
            riseAlpha = Math.min(elapsed / 120, 1);
          } else {
            delete this._afLetterAnimStart[i];
          }
        }
        if (riseAlpha < 1) ctx.globalAlpha = riseAlpha;
        ctx.fillText(ch, lx, curY + riseOffsetY);
        ctx.restore();
        lx += lw;
      }
      curX += lineW;
      if (kind === 'postfix') drawAffix();
    }
    ctx.restore();
    curY += wordLineH / 2 + wordHintGap + hintH / 2;

    // === 提示行（剩余单词数 / 状态文案），非法时带 error 图标 ===
    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    let bs = 14;
    ctx.font = `${Math.floor(bs * s)}px sans-serif`;
    while (ctx.measureText(hintText).width > maxW && bs > 11) {
      bs--;
      ctx.font = `${Math.floor(bs * s)}px sans-serif`;
    }
    ctx.fillStyle = hintColor;
    if (status === 'invalid' && this.errorIcon && this.errorIconLoaded) {
      const errIconSize = 15 * s;
      const errGap = 4 * s;
      const textW = ctx.measureText(hintText).width;
      const groupX = maskX + maskW / 2 - (errIconSize + errGap + textW) / 2;
      ctx.drawImage(this.errorIcon, groupX, curY - errIconSize / 2, errIconSize, errIconSize);
      ctx.textAlign = 'left';
      ctx.fillText(hintText, groupX + errIconSize + errGap, curY);
    } else if (status === 'idle') {
      // 剩余单词数：数字加粗 + 绿色高亮（如「还需要拼出 3 个单词」）
      const prefix = '还需要拼出 ';
      const num = String(trial.left);
      const suffix = ' 个单词';
      ctx.font = `${Math.floor(bs * s)}px sans-serif`;
      const w1 = ctx.measureText(prefix).width;
      const w3 = ctx.measureText(suffix).width;
      ctx.font = `bold ${Math.floor(bs * s)}px sans-serif`;
      const w2 = ctx.measureText(num).width;
      let tx = maskX + (maskW - w1 - w2 - w3) / 2;
      ctx.textAlign = 'left';
      ctx.font = `${Math.floor(bs * s)}px sans-serif`;
      ctx.fillStyle = hintColor;
      ctx.fillText(prefix, tx, curY);
      tx += w1;
      ctx.font = `bold ${Math.floor(bs * s)}px sans-serif`;
      ctx.fillStyle = '#2d7d32';
      ctx.fillText(num, tx, curY);
      tx += w2;
      ctx.font = `${Math.floor(bs * s)}px sans-serif`;
      ctx.fillStyle = hintColor;
      ctx.fillText(suffix, tx, curY);
    } else {
      ctx.fillText(hintText, maskX + maskW / 2, curY);
    }
    ctx.restore();
    curY += hintH / 2 + btnGapY;

    // === 两个并排提示按钮（样式与 fill_blanks 完全一致）===
    const btnW = 124 * s;
    const btnH = btnRowH;
    const btnGap = 18 * s;
    const btnRowW = btnW * 2 + btnGap;
    const btn1X = maskX + (maskW - btnRowW) / 2;
    const btn2X = btn1X + btnW + btnGap;
    const btnY = curY;

    const drawAfBtn = (bx, label, iconData, emoji, suffix, pressed, iconAnim, disabled) => {
      const dy = pressed && !disabled ? 2 * s : 0;
      ctx.save();
      if (disabled) ctx.globalAlpha = 0.55;
      this._drawOrnateBtnFrame(bx, btnY + dy, btnW, btnH, s, pressed);

      const midY = btnY + dy + btnH / 2;
      const iconSize = (iconAnim === 'breath' ? 21 : 18) * s;
      const gap = 4 * s;
      ctx.font = `bold ${Math.floor(14 * s)}px sans-serif`;
      const hasIcon = !disabled && iconData && iconData.img && iconData.loaded;
      const emojiCh = !disabled && !hasIcon ? emoji : null;
      const suffixTxt = disabled ? null : suffix;
      const labelW = ctx.measureText(label).width;
      const emojiW = emojiCh ? ctx.measureText(emojiCh).width : 0;
      const suffixW = suffixTxt ? ctx.measureText(suffixTxt).width : 0;
      const contentW = labelW + (hasIcon || emojiCh || suffixTxt ? gap + (hasIcon ? iconSize : emojiW) : 0) + (suffixTxt ? gap + suffixW : 0);
      let cx = bx + (btnW - contentW) / 2;

      ctx.fillStyle = disabled ? '#9a9186' : '#5a4a2a';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText(label, cx, midY);
      cx += labelW + gap;
      if (hasIcon) {
        const iconCX = cx + iconSize / 2;
        ctx.save();
        ctx.translate(iconCX, midY);
        if (iconAnim === 'flip') {
          const t = (Date.now() % 3000) / 3000;
          ctx.scale(Math.cos(t * Math.PI * 2), 1);
        } else if (iconAnim === 'breath') {
          const b = 1 + 0.08 * Math.sin(Date.now() / 500);
          ctx.scale(b, b);
        }
        ctx.drawImage(iconData.img, -iconSize / 2, -iconSize / 2, iconSize, iconSize);
        ctx.restore();
        cx += iconSize;
      } else if (emojiCh) {
        ctx.fillText(emojiCh, cx, midY);
        cx += emojiW;
      }
      if (suffixTxt) ctx.fillText(suffixTxt, cx + gap, midY);
      ctx.restore();
    };
    // 每回合最多提示 3 个字母，达上限后按钮置灰、文案改为「提示达上限」（点击仍可弹 toast）
    // 目标词"输入部分"长度 = 目标词长 - 词缀长（提示上限用）
    const typedPartLen = trial.targetWord ? Math.max(1, String(trial.targetWord).length - affix.length) : 3;
    const afHintDone = !trial.targetWord || (trial.hintCount || 0) >= Math.min(3, typedPartLen);
    if (afHintDone) {
      drawAfBtn(btn1X, '提示达上限', null, null, null, false, null, true);
    } else {
      drawAfBtn(btn1X, '提示字母', { img: this.coinIcon, loaded: this.coinIconLoaded }, '💰', '1', !!this._afHintLetterPressed, 'flip');
    }
    drawAfBtn(btn2X, '提示单词', { img: this.coinAdIcon, loaded: this.coinAdIconLoaded }, '📺', null, !!this._afHintWordPressed, 'breath');

    // 注册点击区域（非词缀模式在 drawPlaying 开头已置 null）
    this.affixHintLetterRect = { x: btn1X, y: btnY, w: btnW, h: btnH };
    this.affixHintWordRect = { x: btn2X, y: btnY, w: btnW, h: btnH };
  }

  // ===== 词缀拼词试炼：26 键字母键盘（QWERTY 三行）=====
  Renderer.prototype._drawAffixKeyboard = function(game, topY, areaH, s) {
    const ctx = this.ctx;
    const W = this.W;
    const rows = ['QWERTYUIOP', 'ASDFGHJKL', 'ZXCVBNM'];
    const keyGap = 5 * s;
    const keyGapY = 11 * s; // 上下间隔比左右稍大
    const keyW = Math.min(36 * s, (W - 24 * s - 9 * keyGap) / 10);
    const keyH = Math.min(56 * s, (areaH - 2 * keyGapY) / 3);
    const kbH = 3 * keyH + 2 * keyGapY;
    const startY = topY + (areaH - kbH) / 2;
    // 仅校验中/合法演出期间置灰；非法/失败提示期间可继续输入（输入会清除提示）
    const disabled = !!(game.pendingCheck && game.pendingCheck.state !== 'invalid' && game.pendingCheck.state !== 'witch_failed');

    this.affixKeyRects = [];
    // 按下反馈：输入路由写入 { letter, time }，150ms 内下沉+变深
    const pressed = this._affixPressedKey;
    const pressedLetter = pressed && (Date.now() - pressed.time < 150) ? pressed.letter : null;

    for (let r = 0; r < rows.length; r++) {
      const row = rows[r];
      const rowW = row.length * keyW + (row.length - 1) * keyGap;
      const startX = (W - rowW) / 2;
      const y = startY + r * (keyH + keyGapY);
      for (let i = 0; i < row.length; i++) {
        const letter = row[i];
        const x = startX + i * (keyW + keyGap);
        const isPressed = letter === pressedLetter;
        const dy = isPressed ? 2 * s : 0;
        ctx.save();
        if (disabled) ctx.globalAlpha = 0.55;
        ctx.shadowColor = 'rgba(0,0,0,0.22)';
        ctx.shadowBlur = 4 * s;
        ctx.shadowOffsetY = 2 * s;
        this.roundRect(x, y + dy, keyW, keyH, 6 * s, isPressed ? '#e8dcc0' : '#faf6ee', '#c4a35a', 1 * s);
        ctx.restore();
        ctx.save();
        if (disabled) ctx.globalAlpha = 0.55;
        ctx.font = `bold ${Math.floor(18 * s)}px Georgia, 'Times New Roman', serif`;
        ctx.fillStyle = '#1a2f4a';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(letter, x + keyW / 2, y + dy + keyH / 2 + 1 * s);
        ctx.restore();
        this.affixKeyRects.push({ x, y, w: keyW, h: keyH, letter });
      }
    }
  }

  // ===== fill_blanks 提示按钮：椭圆形画框式边框 =====
  // 四角星（✦）装饰
  Renderer.prototype._drawSparkle4 = function(ctx, cx, cy, d, color) {
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(cx, cy - d);
    ctx.quadraticCurveTo(cx + d * 0.2, cy - d * 0.2, cx + d, cy);
    ctx.quadraticCurveTo(cx + d * 0.2, cy + d * 0.2, cx, cy + d);
    ctx.quadraticCurveTo(cx - d * 0.2, cy + d * 0.2, cx - d, cy);
    ctx.quadraticCurveTo(cx - d * 0.2, cy - d * 0.2, cx, cy - d);
    ctx.closePath();
    ctx.fillStyle = color;
    ctx.fill();
    ctx.restore();
  }

  // 胶囊形路径（两端半圆，避免扁椭圆的尖端感）
  Renderer.prototype._ellipsePath = function(ctx, cx, cy, rx, ry) {
    const x = cx - rx, y = cy - ry, w = rx * 2, h = ry * 2;
    ctx.beginPath();
    ctx.moveTo(x + ry, y);
    ctx.lineTo(x + w - ry, y);
    ctx.arc(x + w - ry, cy, ry, -Math.PI / 2, Math.PI / 2);
    ctx.lineTo(x + ry, y + h);
    ctx.arc(x + ry, cy, ry, Math.PI / 2, Math.PI * 1.5);
    ctx.closePath();
  }

  // 画框式按钮：胶囊形轮廓（两端半圆），米黄渐变底 + 深金外框 + 浅金内框 + 左右四角星
  Renderer.prototype._drawOrnateBtnFrame = function(bx, by, bw, bh, s, pressed) {
    const ctx = this.ctx;
    const x = bx, y = by, w = bw, h = bh;
    const cx = x + w / 2, cy = y + h / 2;

    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.18)';
    ctx.shadowBlur = 5 * s;
    ctx.shadowOffsetY = 2 * s;
    this._ellipsePath(ctx, cx, cy, w / 2, h / 2);
    const g = ctx.createLinearGradient(0, y, 0, y + h);
    g.addColorStop(0, pressed ? '#f0e2bc' : '#f8eecb');
    g.addColorStop(1, pressed ? '#e3d0a0' : '#eeddae');
    ctx.fillStyle = g;
    ctx.fill();
    ctx.shadowColor = 'transparent';
    // 外框：深金粗线（胶囊形）
    ctx.strokeStyle = pressed ? '#a8854a' : '#b8934a';
    ctx.lineWidth = 2 * s;
    ctx.stroke();
    ctx.restore();

    // 内框：浅金细线（胶囊形整体内缩）
    const inset = 3.5 * s;
    this._ellipsePath(ctx, cx, cy, w / 2 - inset, h / 2 - inset);
    ctx.strokeStyle = 'rgba(212,179,106,0.9)';
    ctx.lineWidth = 0.8 * s;
    ctx.stroke();

    // 左右四角星装饰
    this._drawSparkle4(ctx, x + 10 * s, y + h / 2, 4 * s, '#c9a24f');
    this._drawSparkle4(ctx, x + w - 10 * s, y + h / 2, 4 * s, '#c9a24f');
  }

  // fill_blanks 折行：把 segments 切成不可拆分的 item（英文单词 / 挖空位），贪心按宽度折行
  Renderer.prototype._wrapFillBlankLines = function(ctx, segments, maxW, blankDisplayW) {
    const items = [];
    for (const seg of segments) {
      if (seg.isBlank) {
        items.push({ isBlank: true, width: blankDisplayW });
        continue;
      }
      const tokens = String(seg.text || '').split(/(\s+)/);
      for (const tk of tokens) {
        if (!tk || /^\s+$/.test(tk)) continue;
        items.push({ isBlank: false, text: tk, width: ctx.measureText(tk).width });
      }
    }
    const spaceW = ctx.measureText(' ').width;
    const lines = [];
    let cur = [];
    let curW = 0;
    for (const item of items) {
      const w = item.width + (cur.length > 0 ? spaceW : 0);
      if (cur.length > 0 && curW + w > maxW) {
        lines.push({ items: cur, width: curW });
        cur = [item];
        curW = item.width;
      } else {
        cur.push(item);
        curW += w;
      }
    }
    if (cur.length > 0) lines.push({ items: cur, width: curW });
    return lines;
  }

  // ===== 数字向上滚动替换绘制（计分动画与出牌前预览共用）=====
  // roll: { from, to }，progress: 0~1，offset: 滚动位移幅度
  Renderer.prototype._drawRollingNumber = function(roll, cx, cy, offset, s, progress) {
    const ctx = this.ctx;
    const ease = Easing.easeOutCubic(progress);

    ctx.save();
    ctx.font = `bold ${Math.floor(20 * s)}px sans-serif`;
    ctx.fillStyle = '#f5f0e8';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    // 旧数字向上淡出
    ctx.globalAlpha = 1 - ease;
    ctx.fillText(String(roll.from), cx, cy - Math.round(ease * offset));

    // 新数字从下方进入
    ctx.globalAlpha = ease;
    ctx.fillText(String(roll.to), cx, cy + Math.round((1 - ease) * offset));

    ctx.restore();
  }

  // ===== 求助提示弹窗 =====
  Renderer.prototype.drawTipHelpPopup = function(game) {
    const popup = game._tipHelpPopup;
    if (!popup) return;
    const ctx = this.ctx;
    const W = this.W;
    const H = this.H;
    const s = this.scale;

    const isClosing = game._closingTipHelp;
    const elapsed = isClosing ? 99999 : Date.now() - popup.startTime;

    const panel = this._drawModalPanel(ctx, W, H, s, {
      isClosing,
      closeStartTime: game._closeTipHelpStartTime,
      width: 300,
      height: 280,
      bgColor: '#f5f0e1',
      borderColor: '#c4a35a',
      borderRadius: 14,
      borderWidth: 1.5,
      overlayAlpha: 0.55,
      overlayFadeInDuration: 200,
      enterOffset: 20,
      closeOffset: 30,
      elapsed,
      onCloseComplete: () => {
        game._tipHelpPopup = null;
        game._closingTipHelp = false;
        game._closeTipHelpStartTime = null;
        game._tipHelpBuyPressed = false;
        game._tipHelpSharePressed = false;
        game._tipHelpClosePressed = false;
        game._tipHelpBuyDelaying = false;
        game._tipHelpShareDelaying = false;
      }
    });

    if (!panel) return;
    const { px, py, pw, ph, closeAlpha } = panel;

    // 重置点击区域
    this.tipHelpBuyRect = null;
    this.tipHelpShareRect = null;
    this.tipHelpCloseRect = null;
    this.tipHelpPanelRect = { x: px, y: py, w: pw, h: ph };

    // === 内层细边框（参考设置弹窗） ===
    ctx.save();
    ctx.globalAlpha = closeAlpha;
    ctx.strokeStyle = '#c4a35a';
    ctx.lineWidth = 1.5 * s;
    ctx.beginPath();
    const inset = 4 * s;
    const ix = px + inset, iy = py + inset, iw = pw - inset * 2, ih = ph - inset * 2, ir = 14 * s - inset;
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
    const titleAnim = Easing.fadeIn(elapsed, 80, 250, 8 * s);
    ctx.save();
    ctx.globalAlpha = titleAnim.alpha * closeAlpha;
    ctx.fillStyle = '#5a4a2a';
    ctx.font = `bold ${Math.floor(22 * s)}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('单词提示', W / 2, py + 34 * s + titleAnim.yShift);
    ctx.restore();

    // 标题下装饰线
    const decoLineY = py + 52 * s;
    const decoLineW = pw * 0.5;
    const decoLineX = px + (pw - decoLineW) / 2;
    ctx.save();
    ctx.globalAlpha = closeAlpha;
    this._drawTitleDivider(ctx, decoLineX, decoLineY, decoLineW, s, { diamondColor: '#c4a35a' });
    ctx.restore();

    // 副标题
    const subAnim = Easing.fadeIn(elapsed, 140, 250, 6 * s);
    ctx.save();
    ctx.globalAlpha = subAnim.alpha * closeAlpha * 0.85;
    ctx.fillStyle = '#7a6a4a';
    ctx.font = `${Math.floor(13 * s)}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const subY = py + 75 * s + subAnim.yShift;
    ctx.fillText('需要帮助？请选择以下方式获取提示', W / 2, subY);
    ctx.restore();

    // 按钮图片（buy_tip/share_tip 从 cloudStorage 预加载缓存获取，pop_close 本地加载）
    const buyData = game.cloudStorage && game.cloudStorage.bgIconImages && game.cloudStorage.bgIconImages['buy_tip'];
    const today = new Date().toISOString().slice(0, 10);
    const shareCount = game._dailyShareDate === today ? game._dailyShareCount : 0;
    const shareImgKey = shareCount >= 3 ? 'share_tip_limit' : 'share_tip';
    const shareData = game.cloudStorage && game.cloudStorage.bgIconImages && game.cloudStorage.bgIconImages[shareImgKey];
    const closeData = this.tipHelpImages && this.tipHelpImages['pop_close'];

    const btnW = 200 * s;
    const buyH = 63 * s;
    const shareH = 66 * s;
    const btnGap = 12 * s;
    const btnX = (W - btnW) / 2;
    const startY = py + 105 * s;

    // 购买提示按钮
    const buyY = startY;
    if (buyData && buyData.loaded && buyData.img) {
      ctx.save();
      ctx.globalAlpha = closeAlpha;
      const buyPressOffset = game._tipHelpBuyPressed ? 2 * s : 0;
      ctx.drawImage(buyData.img, btnX, buyY + buyPressOffset, btnW, buyH);
      ctx.restore();
    }
    this.tipHelpBuyRect = { x: btnX, y: buyY, w: btnW, h: buyH };

    // 转发求助按钮
    const shareY = startY + buyH + btnGap;
    if (shareData && shareData.loaded && shareData.img) {
      ctx.save();
      ctx.globalAlpha = closeAlpha;
      const sharePressOffset = game._tipHelpSharePressed ? 2 * s : 0;
      ctx.drawImage(shareData.img, btnX, shareY + sharePressOffset, btnW, shareH);
      ctx.restore();
    }
    this.tipHelpShareRect = { x: btnX, y: shareY, w: btnW, h: shareH };

    // 右上角关闭按钮
    const closeSize = 32 * s;
    const closeX = px + pw - closeSize - 10 * s;
    const closeY = py + 10 * s;
    const closePressOffset = game._tipHelpClosePressed ? 2 * s : 0;
    if (closeData && closeData.loaded && closeData.img) {
      ctx.save();
      ctx.globalAlpha = closeAlpha;
      ctx.drawImage(closeData.img, closeX, closeY + closePressOffset, closeSize, closeSize);
      ctx.restore();
    }
    this.tipHelpCloseRect = { x: closeX, y: closeY, w: closeSize, h: closeSize };

  }

};
