// ===== 埋点事件上报封装 =====
// 开发者工具（devtools）环境下不上报，避免污染线上数据

let _platform = null;

function getPlatform() {
  if (_platform !== null) return _platform;
  try {
    _platform = (typeof wx !== 'undefined' && wx.getSystemInfoSync)
      ? wx.getSystemInfoSync().platform
      : '';
  } catch (e) {
    _platform = '';
  }
  return _platform;
}

function reportEvent(eventName, data) {
  if (typeof wx === 'undefined' || !wx.reportEvent) return;
  if (getPlatform() === 'devtools') return;
  wx.reportEvent(eventName, data);
}

module.exports = { reportEvent };
