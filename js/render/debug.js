module.exports = function extendDebug(Renderer) {
    Renderer.prototype._drawCloudDebugLogs = function(ctx, game, s) {
      if (!this.showCloudDebugLogs) return;
      const logs = game.cloudStorage && game.cloudStorage.debugLogs;
      if (!logs || logs.length === 0) return;
  
      const lineH = 13 * s;
      const visibleLines = 10;
      const pad = 6 * s;
      const boxW = 280 * s;
      const viewportH = visibleLines * lineH + pad * 2;
      const contentH = logs.length * lineH + pad * 2;
      const boxX = this.W - boxW - 8 * s;
      const boxY = this.H - viewportH - 8 * s;
  
      const maxScrollY = Math.max(0, contentH - viewportH);
      this.cloudLogScrollY = Math.max(0, Math.min(this.cloudLogScrollY, maxScrollY));
      const startLine = Math.floor(this.cloudLogScrollY / lineH);
  
      ctx.save();
      // 日志框背景（限制在视口内）
      ctx.fillStyle = 'rgba(0,0,0,0.65)';
      ctx.fillRect(boxX, boxY, boxW, viewportH);
      ctx.strokeStyle = 'rgba(255,255,255,0.2)';
      ctx.lineWidth = 1;
      ctx.strokeRect(boxX, boxY, boxW, viewportH);
  
      // 裁剪到内容区域
      ctx.beginPath();
      ctx.rect(boxX + 1, boxY + 1, boxW - 2, viewportH - 2);
      ctx.clip();
  
      ctx.font = `${Math.floor(10 * s)}px monospace`;
      ctx.fillStyle = '#fff';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
      const offsetY = this.cloudLogScrollY % lineH;
      for (let i = 0; i < visibleLines + 1; i++) {
        const lineIdx = startLine + i;
        if (lineIdx >= logs.length) break;
        ctx.fillText(logs[lineIdx], boxX + pad, boxY + pad + i * lineH - offsetY);
      }
      ctx.restore();
  
      // 滚动条
      if (contentH > viewportH) {
        const scrollBarW = 6 * s;
        const scrollBarX = boxX + boxW - scrollBarW - 2 * s;
        const trackY = boxY + 2 * s;
        const trackH = viewportH - 4 * s;
        const thumbH = Math.max(trackH * viewportH / contentH, 16 * s);
        const thumbY = trackY + (this.cloudLogScrollY / maxScrollY) * (trackH - thumbH);
  
        ctx.save();
        // 轨道
        ctx.fillStyle = 'rgba(255,255,255,0.12)';
        ctx.fillRect(scrollBarX, trackY, scrollBarW, trackH);
        ctx.restore();
        // thumb（使用项目内的 roundRect，只填充不描边）
        const thumbColor = this.cloudLogDragging ? 'rgba(255,255,255,0.6)' : 'rgba(255,255,255,0.35)';
        this.roundRect(scrollBarX, thumbY, scrollBarW, thumbH, scrollBarW / 2, thumbColor, null);
  
        this.cloudLogScrollBarRect = { x: scrollBarX, y: thumbY, w: scrollBarW, h: thumbH };
      } else {
        this.cloudLogScrollBarRect = null;
      }
  
      this.cloudLogRect = { x: boxX, y: boxY, w: boxW, h: viewportH };
    }

    Renderer.prototype._drawDebugMenu = function(ctx, game, x, y, s) {
      const items = [
        { label: '⚔️ 对战模式', action: 'debug_startBattle' },
        { label: '重置出牌次数', action: 'debug_resetHands' },
        { label: '当前分+1000', action: 'debug_addScore' },
        { label: '💰 增加100金币', action: 'debug_addGold' },
        { label: '跳转至X回合', action: 'debug_jumpToRound' },
        { label: '✅ 直接通关', action: 'debug_winRound' },
        { label: '刷新商店', action: 'debug_refreshShop' },
        { label: '5张女巫牌', action: 'debug_addWitchSlot' },
        { label: '上传shop_card', action: 'debug_upload_shop_card' },
        { label: '上传witch', action: 'debug_upload_witch' },
        { label: '上传bg_icon', action: 'debug_upload_bg_icon' },
        { label: '上传rank_avatar', action: 'debug_upload_rank_avatar' },
        { label: '上传music', action: 'debug_upload_music' },
        { label: '触发新人引导', action: 'debug_triggerGuide' },
        { label: '触发商店引导', action: 'debug_triggerShopGuide' },
        { label: '触发图鉴引导', action: 'debug_triggerCardBookGuide' },
        { label: '👻 结束游戏', action: 'debug_endGame' },
        { label: '图鉴闪烁', action: 'debug_flashCardBook' },
        { label: '今日新词完成', action: 'debug_completeDailyWords' },
      ];
      const itemW = 130 * s;
      const itemH = 34 * s;
      const menuW = itemW + 8 * s;
      const menuH = items.length * itemH + 8 * s;
      const menuX = x;
      const menuY = y;
      
      // 背景
      ctx.save();
      ctx.fillStyle = 'rgba(30,30,40,0.92)';
      this.roundRect(menuX, menuY, menuW, menuH, 6 * s, 'rgba(30,30,40,0.92)');
      ctx.strokeStyle = '#c4a35a';
      ctx.lineWidth = 1 * s;
      ctx.stroke();
      ctx.restore();
      
      this.debugMenuRects = [];
      items.forEach((item, i) => {
        const iy = menuY + 4 * s + i * itemH;
        const ix = menuX + 4 * s;
        // 按钮背景
        this.roundRect(ix, iy, itemW, itemH - 4 * s, 4 * s, '#2d2d3a');
        // 文字
        ctx.font = `${Math.floor(11 * s)}px sans-serif`;
        ctx.fillStyle = '#e0e0e0';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(item.label, ix + itemW / 2, iy + (itemH - 4 * s) / 2);
        this.debugMenuRects.push({ x: ix, y: iy, w: itemW, h: itemH - 4 * s, action: item.action });
      });
    }

};
