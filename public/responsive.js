/**
 * @ ratio 设计稿比例（16:9，适配 1920×1080 等主流屏）
 * @ pwidth 设计稿的宽度
 * @ prem 1rem 比多少 px（192）
 */
(function (doc, win, ratio, pwidth, prem) {
  var docEl = doc.documentElement
  var resizeEvt = 'orientationchange' in win ? 'orientationchange' : 'resize'

  function recalc() {
    var clientWidth = docEl.clientWidth
    if (!clientWidth) return
    var screenRatio = clientWidth / docEl.clientHeight
    if (screenRatio > 2.4) {
      screenRatio = 2.4
    }
    var scan = screenRatio > ratio ? ratio / screenRatio : 1
    docEl.style.fontSize = (scan * (clientWidth / pwidth) * prem).toFixed(3) + 'px'
  }

  win.__medfusionRecalcResponsive = recalc

  if (!doc.addEventListener) return
  win.addEventListener(resizeEvt, recalc, false)
  doc.addEventListener('DOMContentLoaded', recalc, false)
  recalc()
})(document, window, 16 / 9, 1920, 192)
