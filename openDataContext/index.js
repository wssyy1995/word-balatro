// 微信小游戏开放数据域 —— 好友排行榜
const sharedCanvas = wx.getSharedCanvas();
const ctx = sharedCanvas.getContext('2d');

let isVisible = false;
let drawMode = 'full'; // 'full' | 'list'
let listRect = null; // { w, rowH }
let rankData = [];
let selfOpenId = '';
const avatarCache = {};
let scale = 1; // 由主域传入的 scaleDpr
let closeBtnPressed = false; // 关闭按钮按压状态（由主域同步）
let canvasWidth = 375;
let canvasHeight = 667;

function sp(v) {
  return Math.floor(v * scale);
}

function loadAvatar(url) {
  return new Promise((resolve) => {
    if (avatarCache[url]) {
      resolve(avatarCache[url]);
      return;
    }
    const img = wx.createImage();
    img.src = url;
    img.onload = () => {
      avatarCache[url] = img;
      resolve(img);
    };
    img.onerror = () => resolve(null);
  });
}

function roundRect(x, y, w, h, r, fill, stroke) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
  if (fill) {
    ctx.fillStyle = fill;
    ctx.fill();
  }
  if (stroke) {
    ctx.strokeStyle = stroke;
    ctx.stroke();
  }
}

function clipRoundRect(x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
  ctx.clip();
}

async function drawRankList() {
  const { W, H } = getCanvasSize();
  ctx.clearRect(0, 0, W, H);
  const frame = _drawRankPanelFrame();

  const { contentX, contentW, rowH, startY, panelY, panelH } = frame;

  // 玩家列表
  const listY = startY + rowH + sp(4);
  const maxRows = Math.floor((panelY + panelH - listY - sp(16)) / rowH);

  for (let i = 0; i < Math.min(rankData.length, maxRows); i++) {
    const player = rankData[i];
    const y = listY + i * rowH;
    const isSelf = player.openid === selfOpenId;

    if (isSelf) {
      ctx.fillStyle = 'rgba(196, 163, 90, 0.18)';
      ctx.fillRect(contentX, y, contentW, rowH);
    } else if (i % 2 === 1) {
      ctx.fillStyle = 'rgba(255,255,255,0.04)';
      ctx.fillRect(contentX, y, contentW, rowH);
    }

    // 排名
    ctx.fillStyle = i < 3 ? '#ffd700' : '#aaa';
    ctx.font = `bold ${Math.floor(W * 0.035)}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(i + 1), contentX + contentW * 0.10, y + rowH / 2);

    // 头像
    const avatarX = contentX + contentW * 0.26;
    const avatarY = y + rowH / 2;
    const avatarR = sp(18);
    if (player.avatarImg) {
      ctx.save();
      ctx.beginPath();
      ctx.arc(avatarX, avatarY, avatarR, 0, Math.PI * 2);
      ctx.clip();
      ctx.drawImage(player.avatarImg, avatarX - avatarR, avatarY - avatarR, avatarR * 2, avatarR * 2);
      ctx.restore();
    } else {
      ctx.fillStyle = '#555';
      ctx.beginPath();
      ctx.arc(avatarX, avatarY, avatarR, 0, Math.PI * 2);
      ctx.fill();
    }

    // 昵称
    ctx.fillStyle = isSelf ? '#f5f0e6' : '#ccc';
    ctx.font = `${Math.floor(W * 0.028)}px sans-serif`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    const nick = player.nickname || '匿名';
    ctx.fillText(nick.length > 5 ? nick.slice(0, 5) + '…' : nick, contentX + contentW * 0.38, y + rowH / 2);

    // 回合
    const bestround = player.KVDataList.find(kv => kv.key === 'bestround')?.value || '0';
    ctx.fillStyle = '#fff';
    ctx.font = `bold ${Math.floor(W * 0.03)}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(bestround, contentX + contentW * 0.62, y + rowH / 2);

    // 单词量
    const wordCount = player.KVDataList.find(kv => kv.key === 'wordCount')?.value || '0';
    ctx.fillStyle = '#c4a35a';
    ctx.font = `bold ${Math.floor(W * 0.03)}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(wordCount, contentX + contentW * 0.86, y + rowH / 2);
  }

  if (rankData.length === 0) {
    ctx.fillStyle = '#888';
    ctx.font = `${Math.floor(W * 0.03)}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('暂无好友数据', W / 2, panelY + panelH / 2 + sp(20));
  }
}

function getCanvasSize() {
  let W = sharedCanvas.width || canvasWidth;
  let H = sharedCanvas.height || canvasHeight;
  if (!W || !H) {
    W = 375;
    H = 667;
  }
  return { W, H };
}

// 只绘制好友列表（无弹窗框架，供主域贴入）
// w 和 rowH 是逻辑像素，内部乘以 scale 转为物理像素
function drawFriendList(w, rowH) {
  const { W, H } = getCanvasSize();
  ctx.clearRect(0, 0, W, H);

  const pw = Math.floor(w * scale);
  const rh = Math.floor(rowH * scale);
  const maxRows = Math.floor(H / rh);

  for (let i = 0; i < Math.min(rankData.length, maxRows); i++) {
    const player = rankData[i];
    const y = i * rh;
    const isSelf = player.openid === selfOpenId;

    // 行背景
    if (isSelf) {
      ctx.fillStyle = 'rgba(196, 163, 90, 0.18)';
      ctx.fillRect(0, y, pw, rh);
    } else if (i % 2 === 1) {
      ctx.fillStyle = 'rgba(255,255,255,0.04)';
      ctx.fillRect(0, y, pw, rh);
    }

    // 排名
    ctx.fillStyle = i < 3 ? '#ffd700' : '#aaa';
    ctx.font = `bold ${Math.floor(W * 0.035)}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(i + 1), pw * 0.10, y + rh / 2);

    // 头像
    const avatarX = pw * 0.26;
    const avatarY = y + rh / 2;
    const avatarR = Math.min(rh * 0.35, sp(18));
    if (player.avatarImg) {
      ctx.save();
      ctx.beginPath();
      ctx.arc(avatarX, avatarY, avatarR, 0, Math.PI * 2);
      ctx.clip();
      ctx.drawImage(player.avatarImg, avatarX - avatarR, avatarY - avatarR, avatarR * 2, avatarR * 2);
      ctx.restore();
    } else {
      ctx.fillStyle = '#555';
      ctx.beginPath();
      ctx.arc(avatarX, avatarY, avatarR, 0, Math.PI * 2);
      ctx.fill();
    }

    // 昵称
    ctx.fillStyle = isSelf ? '#f5f0e6' : '#ccc';
    ctx.font = `${Math.floor(W * 0.028)}px sans-serif`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    const nick = player.nickname || '匿名';
    ctx.fillText(nick.length > 5 ? nick.slice(0, 5) + '…' : nick, pw * 0.38, y + rh / 2);

    // 回合
    const bestround = player.KVDataList.find(kv => kv.key === 'bestround')?.value || '0';
    ctx.fillStyle = '#fff';
    ctx.font = `bold ${Math.floor(W * 0.03)}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(bestround, pw * 0.62, y + rh / 2);

    // 单词量
    const wordCount = player.KVDataList.find(kv => kv.key === 'wordCount')?.value || '0';
    ctx.fillStyle = '#c4a35a';
    ctx.font = `bold ${Math.floor(W * 0.03)}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(wordCount, pw * 0.86, y + rh / 2);
  }

  if (rankData.length === 0) {
    ctx.fillStyle = '#888';
    ctx.font = `${Math.floor(W * 0.03)}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('暂无好友数据', pw / 2, H / 2);
  }
}

function _drawRankPanelFrame() {
  const { W, H } = getCanvasSize();

  // 背景遮罩
  ctx.fillStyle = 'rgba(0, 0, 0, 0.55)';
  ctx.fillRect(0, 0, W, H);

  // 弹窗背景
  const panelW = Math.min(W * 0.9, sp(340));
  const panelH = Math.min(H * 0.75, sp(520));
  const panelX = (W - panelW) / 2;
  const panelY = (H - panelH) / 2;
  roundRect(panelX, panelY, panelW, panelH, sp(16), '#2a2a3a', '#4a4a6a');

  // 标题
  ctx.fillStyle = '#f5f0e6';
  ctx.font = `bold ${Math.floor(W * 0.055)}px Georgia, serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  ctx.fillText('好友排行榜', W / 2, panelY + sp(18));

  // 关闭按钮
  const closeSize = sp(28);
  const closeX = panelX + panelW - closeSize - sp(14);
  const closeY = panelY + sp(14);
  const closePressOffset = closeBtnPressed ? sp(2) : 0;
  ctx.fillStyle = 'rgba(255,107,107,0.9)';
  ctx.beginPath();
  ctx.arc(closeX + closeSize / 2, closeY + closeSize / 2 + closePressOffset, closeSize / 2, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#fff';
  ctx.font = `bold ${Math.floor(closeSize * 0.65)}px sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('×', closeX + closeSize / 2, closeY + closeSize / 2 - sp(2) + closePressOffset);

  // 表头
  const rowH = sp(52);
  const startY = panelY + sp(58);
  const contentX = panelX + sp(16);
  const contentW = panelW - sp(32);

  ctx.fillStyle = 'rgba(196,163,90,0.15)';
  ctx.fillRect(contentX, startY, contentW, rowH);

  ctx.fillStyle = '#c4a35a';
  ctx.font = `bold ${Math.floor(W * 0.032)}px sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('排名', contentX + contentW * 0.10, startY + rowH / 2);
  ctx.fillText('玩家', contentX + contentW * 0.36, startY + rowH / 2);
  ctx.fillText('最高回合', contentX + contentW * 0.62, startY + rowH / 2);
  ctx.fillText('单词量', contentX + contentW * 0.86, startY + rowH / 2);

  return { panelX, panelY, panelW, panelH, contentX, contentW, rowH, startY, W, H };
}

function drawLoading() {
  const { W, H } = getCanvasSize();
  ctx.clearRect(0, 0, W, H);
  console.log('[OpenData] drawLoading', W, H, 'scale', scale);
  const frame = _drawRankPanelFrame();

  // 在内容区显示 loading 文字
  ctx.fillStyle = '#aaa';
  ctx.font = `${Math.floor(W * 0.04)}px sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('⏳ 排行榜加载中...', W / 2, frame.panelY + frame.panelH / 2 + sp(20));
}

function drawError(msg) {
  const { W, H } = getCanvasSize();
  ctx.clearRect(0, 0, W, H);
  const frame = _drawRankPanelFrame();

  ctx.fillStyle = '#ff6b6b';
  ctx.font = `${Math.floor(W * 0.035)}px sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(msg || '加载失败', W / 2, frame.panelY + frame.panelH / 2 - sp(10));
  ctx.fillStyle = '#aaa';
  ctx.font = `${Math.floor(W * 0.03)}px sans-serif`;
  ctx.fillText('请检查隐私授权后重试', W / 2, frame.panelY + frame.panelH / 2 + sp(20));
}

function fetchRankData() {
  drawLoading();
  // 先串行获取用户信息（含授权），避免与 getFriendCloudStorage 并行触发两个授权弹窗
  wx.getUserInfo({
    openIdList: ['selfOpenId'],
    lang: 'zh_CN',
    success: (userRes) => {
      if (userRes.data && userRes.data[0]) {
        selfOpenId = userRes.data[0].openid;
      }
      // 拿到授权后再拉取好友排行
      _doFetchFriendRank();
    },
    fail: (err) => {
      console.error('[OpenData] getUserInfo fail', err);
      // 即使 getUserInfo 失败，仍尝试拉取好友排行（可能已授权过）
      _doFetchFriendRank();
    }
  });
}

function _doFetchFriendRank() {
  wx.getFriendCloudStorage({
    keyList: ['score', 'bestround', 'wordCount'],
    success: (res) => {
      console.log('[OpenData] getFriendCloudStorage success', res.data?.length);
      const data = res.data || [];
      data.sort((a, b) => {
        const sa = parseInt(a.KVDataList.find(kv => kv.key === 'score')?.value || '0', 10);
        const sb = parseInt(b.KVDataList.find(kv => kv.key === 'score')?.value || '0', 10);
        return sb - sa;
      });
      rankData = data;
      Promise.all(data.map(p => loadAvatar(p.avatarUrl).then(img => {
        p.avatarImg = img;
      }))).then(() => {
        if (!isVisible) return;
        if (drawMode === 'list' && listRect) {
          drawFriendList(listRect.w, listRect.rowH);
        } else {
          drawRankList();
        }
      });
    },
    fail: (err) => {
      console.error('[OpenData] getFriendCloudStorage fail', err);
      if (isVisible) drawError('获取好友排行失败');
    }
  });
}

// 获取自己的 openid 用于高亮
// 注：不再在顶层立即调用 wx.getUserInfo，避免与 fetchRankData 中的 wx.getFriendCloudStorage
// 同时触发两个授权弹窗。改为在 fetchRankData 内串行执行：先 getUserInfo → 再 getFriendCloudStorage

// 监听主域消息
wx.onMessage((msg) => {
  switch (msg.action) {
    case 'show':
      drawMode = 'full';
      if (msg.scaleDpr) scale = msg.scaleDpr;
      if (msg.canvasWidth) canvasWidth = msg.canvasWidth;
      if (msg.canvasHeight) canvasHeight = msg.canvasHeight;
      try {
        if (msg.canvasWidth) sharedCanvas.width = msg.canvasWidth;
        if (msg.canvasHeight) sharedCanvas.height = msg.canvasHeight;
      } catch (e) {}
      isVisible = true;
      console.log('[OpenData] received show, canvas size', canvasWidth, canvasHeight, 'scale', scale);
      fetchRankData();
      break;
    case 'showList':
      drawMode = 'list';
      if (msg.scaleDpr) scale = msg.scaleDpr;
      if (msg.rect) listRect = msg.rect;
      isVisible = true;
      if (rankData.length > 0) {
        if (listRect) drawFriendList(listRect.w, listRect.rowH);
      } else {
        fetchRankData();
      }
      break;
    case 'hide':
      isVisible = false;
      drawMode = 'full';
      listRect = null;
      const size = getCanvasSize();
      ctx.clearRect(0, 0, size.W, size.H);
      break;
    case 'resize':
      if (!isVisible) return;
      if (drawMode === 'list' && listRect) {
        drawFriendList(listRect.w, listRect.rowH);
      } else {
        drawRankList();
      }
      break;
    case 'closeBtnPress':
      closeBtnPressed = msg.pressed || false;
      if (isVisible) {
        if (drawMode === 'list' && listRect) {
          drawFriendList(listRect.w, listRect.rowH);
        } else {
          drawRankList();
        }
      }
      break;
  }
});
