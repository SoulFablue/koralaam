/* 用途：第二屏的翻书交互与文字揭示墙。
 * 四个章节像一本摊开的册子：点目录物件翻到对应一章，按钮、圆点与触屏滑动翻页。
 * 每章标题首次进入时，从一片噪声字符里从左到右浮现（text-reveal-wall 的机制），
 * 呼应「从噪声到信号」的主线。真实标题始终留在 DOM 里，动画只做视觉遮罩。
 */
(() => {
  "use strict";
  const reduced = matchMedia("(prefers-reduced-motion: reduce)");
  const translate = window.siteLanguage.translate;
  const desk = document.querySelector("#desk");
  const viewport = document.querySelector(".book-viewport");
  const pages = [...document.querySelectorAll(".book-page")];
  if (!desk || !viewport || !pages.length) return;

  let current = 0;
  let busy = false;
  let touchStartX = null;

  // 目录物件就是章节封面；这里只补上 aria 状态，点击由下方统一绑定。
  const objects = [...document.querySelectorAll("[data-category]")];

  // --- 导航条：上一章、圆点、下一章 ---
  const nav = document.createElement("nav");
  nav.className = "book-nav";
  nav.setAttribute("aria-label", translate("Chapter navigation"));
  const prev = document.createElement("button");
  prev.type = "button"; prev.className = "book-arrow book-prev";
  prev.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 5 L8 12 L15 19"/></svg>';
  const dots = document.createElement("div"); dots.className = "book-dots";
  const next = document.createElement("button");
  next.type = "button"; next.className = "book-arrow book-next";
  next.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 5 L16 12 L9 19"/></svg>';
  const dotList = pages.map(page => {
    const dot = document.createElement("button");
    dot.type = "button"; dot.className = "book-dot";
    dots.append(dot);
    return dot;
  });
  nav.append(prev, dots, next);
  viewport.after(nav);

  function titleOf(index) { return pages[index].querySelector(".book-page-title"); }

  function paint() {
    prev.disabled = current === 0;
    next.disabled = current === pages.length - 1;
    prev.setAttribute("aria-label", translate("Previous chapter"));
    next.setAttribute("aria-label", translate("Next chapter"));
    dotList.forEach((dot, i) => {
      dot.classList.toggle("active", i === current);
      dot.setAttribute("aria-current", i === current ? "true" : "false");
      dot.setAttribute("aria-label", titleOf(i).textContent.trim());
    });
    objects.forEach((object, i) => {
      object.classList.toggle("open", i === current);
      object.setAttribute("aria-expanded", String(i === current));
    });
  }

  function settle(index) {
    pages.forEach((page, i) => { page.hidden = i !== index; });
    current = index;
    paint();
    revealTitle(pages[index]);
  }

  function go(index) {
    if (busy || index === current || index < 0 || index >= pages.length) return;
    if (reduced.matches) { settle(index); return; }
    busy = true;
    const direction = index > current ? 1 : -1;
    pages.forEach((page, i) => { page.hidden = i !== index; });
    const page = pages[index];
    page.classList.remove("flip-right", "flip-left");
    void page.offsetWidth; // 重排后再加动画，让关键帧重新播放。
    page.classList.add(direction > 0 ? "flip-right" : "flip-left");
    current = index;
    paint();
    revealTitle(page);
    setTimeout(() => { page.classList.remove("flip-right", "flip-left"); busy = false; }, 620);
  }

  // --- 交互绑定 ---
  objects.forEach((object, i) => object.addEventListener("click", () => go(i)));
  dotList.forEach((dot, i) => dot.addEventListener("click", () => go(i)));
  prev.addEventListener("click", () => go(current - 1));
  next.addEventListener("click", () => go(current + 1));

  // 触屏左右滑动翻页；只在书页区域，不与纵向滚动冲突。
  viewport.addEventListener("touchstart", event => { touchStartX = event.touches[0].clientX; }, { passive: true });
  viewport.addEventListener("touchend", event => {
    if (touchStartX === null) return;
    const delta = event.changedTouches[0].clientX - touchStartX;
    touchStartX = null;
    if (Math.abs(delta) > 60) go(delta < 0 ? current + 1 : current - 1);
  }, { passive: true });

  window.addEventListener("languagechange", paint);

  // --- 文字揭示墙：标题字符从左到右从噪声中浮现 ---
  const noiseChars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!?&*+=/<>";
  function revealTitle(page) {
    const title = page.querySelector(".book-page-title");
    if (!title || title.dataset.revealed) return;
    title.dataset.revealed = "true";
    if (reduced.matches) return;
    const text = title.textContent.trim();
    if (!text) return;
    const style = getComputedStyle(title);
    const canvas = document.createElement("canvas");
    canvas.className = "title-reveal";
    canvas.setAttribute("aria-hidden", "true");
    title.style.position = "relative";
    title.append(canvas);
    const ctx = canvas.getContext("2d");
    if (!ctx) { canvas.remove(); return; }
    const font = `${style.fontStyle} ${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
    ctx.font = font;
    const width = Math.ceil(ctx.measureText(text).width) + 8;
    const height = Math.ceil(parseFloat(style.fontSize) * 1.35);
    const dpr = Math.min(devicePixelRatio || 1, 2);
    canvas.width = width * dpr; canvas.height = height * dpr;
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    ctx.scale(dpr, dpr);
    ctx.font = font;
    const paper = getComputedStyle(document.documentElement).getPropertyValue("--paper").trim() || "#faf9f6";
    const ink = style.color || "#262720";
    const chars = [...text];
    const positions = [];
    let cursor = 0;
    chars.forEach(ch => { const w = ctx.measureText(ch).width; positions.push({ x: cursor, w }); cursor += w; });
    const revealed = new Set();
    const order = positions.map((_, i) => i);
    // 从左到右为主、带一点抖动，制造「信号逐渐清晰」的扫描感。
    const baseline = height * 0.78;
    function draw() {
      ctx.fillStyle = paper; ctx.fillRect(0, 0, width, height);
      ctx.fillStyle = ink;
      positions.forEach((p, i) => {
        const ch = revealed.has(i) ? chars[i] : noiseChars[Math.floor(Math.random() * noiseChars.length)];
        ctx.fillText(ch, p.x, baseline);
      });
    }
    draw();
    let step = 0;
    const perTick = Math.max(1, Math.ceil(chars.length / 18));
    const timer = setInterval(() => {
      for (let k = 0; k < perTick && step < order.length; k++, step++) revealed.add(order[step]);
      draw();
      if (step >= order.length) {
        clearInterval(timer);
        setTimeout(() => canvas.remove(), 260);
      }
    }, 42);
  }

  paint();
  // 第一页标题在 desk 页首次可见时才揭示，避免入场动画在后台被跳过。
  if (desk.hidden) {
    const deskObserver = new MutationObserver(() => {
      if (!desk.hidden) { revealTitle(pages[current]); deskObserver.disconnect(); }
    });
    deskObserver.observe(desk, { attributes: true, attributeFilter: ["hidden"] });
  } else {
    revealTitle(pages[0]);
  }
  window.siteBook = { open: index => go(index), get current() { return current; } };
})();
