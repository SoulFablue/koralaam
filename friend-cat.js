/* 用途：高尔夫救援小猫的简笔画与静态图标，和球场画布共用轮廓。
 * 原为页尾足迹的一部分；只保留高尔夫需要的画猫能力，足迹 UI 已移除。
 * SVG 与球场画布共用同一轮廓，避免混入另一种插画风格。
 */
(() => {
  "use strict";
  const catPaths = {
    tail: "M-12-7 C-44-8-34-40-23-31",
    body: "M-17-28 C-23-9-15 7 0 7 C18 6 23-16 12-35 Z",
    head: "M-17-39 L-18-62 L-5-53 Q5-56 14-51 L25-60 L24-36 Q4-23-17-39 Z",
    face: "M-5-43 L-3-42 M13-43 L15-42 M4-38 L7-36 L10-38",
    feet: "M12-12 L20-5 M-6 3 L5 3"
  };
  function catSVG() {
    return `<svg viewBox="-42 -68 92 80" aria-hidden="true" focusable="false"><g class="friend-cat-body"><path class="friend-tail" d="${catPaths.tail}"/><path class="friend-fill" d="${catPaths.body}"/><path class="friend-fill" d="${catPaths.head}"/><path class="friend-face" d="${catPaths.face}"/><path d="${catPaths.feet}"/></g></svg>`;
  }
  // 球场救援沿用原有走路、伸爪动作，只统一轮廓与颜色。
  function drawCat(context, x, y, size, reaching) {
    context.save(); context.translate(x, y); context.scale(size / 50, size / 50);
    context.strokeStyle = "#4b513e"; context.fillStyle = "#ede6d0";
    context.lineWidth = 2.2; context.lineJoin = "round"; context.lineCap = "round";
    context.stroke(new Path2D(catPaths.tail));
    for (const key of ["body", "head"]) { const path = new Path2D(catPaths[key]); context.fill(path); context.stroke(path); }
    context.stroke(new Path2D(catPaths.face));
    context.stroke(new Path2D(`M12-12 L${reaching ? 39 : 20}-5 M-6 3 L5 3`));
    context.restore();
  }
  const rescueCat = document.querySelector(".rescue-cat");
  if (rescueCat) rescueCat.innerHTML = catSVG();
  window.sitePlay = { drawCat };
})();
