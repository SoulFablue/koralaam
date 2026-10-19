/* 用途：三件编码作品共用的细线幕布。点挂坠或向两边拉开，才开始对应游戏。
 * 沿用用户 hair.txt 的做法：每颗点记住上次的位置，相邻点像短绳一样连着，产生自然回弹。
 * 直接使用浏览器画布，不加载 p5；幕布离开视野、静止或揭开后不持续绘制。
 */
(() => {
  "use strict";
  const reduced = matchMedia("(prefers-reduced-motion: reduce)");
  const translate = window.siteLanguage.translate;
  const editions = [
    ["playground", "A good thing is worth a little pull.", "01"],
    ["typewriter", "Someone familiar is behind here.", "02"],
    ["almost-understood", "A little mystery. A little signal.", "03"]
  ];
  editions.forEach(([id, phrase, number]) => {
    const root = document.getElementById(id);
    if (!root) return;
    const canvas = document.createElement("canvas"), ctx = canvas.getContext("2d");
    // 不支持画布时保留原网页；只有幕布建立成功后才收起游戏。
    if (!ctx) return;
    const heading = root.querySelector(".playground-heading");
    const shell = document.createElement("div"), content = document.createElement("div");
    shell.className = "curtain-shell"; content.className = "curtain-content";
    content.id = `${id}-experience`;
    while (heading.nextSibling) content.append(heading.nextSibling);
    const overlay = document.createElement("div"); overlay.className = "string-curtain";
    canvas.className = "curtain-threads"; canvas.setAttribute("aria-hidden", "true");
    const copy = document.createElement("div"); copy.className = "curtain-copy";
    const serial = document.createElement("span"); serial.className = "curtain-number";
    serial.textContent = number + " / A LITTLE CURIOSITY";
    const line = document.createElement("p"); line.textContent = phrase;
    copy.append(serial, line);
    const handle = document.createElement("button"); handle.type = "button"; handle.className = "curtain-handle";
    handle.setAttribute("aria-label", "Reveal this experiment. Click or drag the pendant sideways.");
    handle.setAttribute("aria-expanded", "false"); handle.setAttribute("aria-controls", content.id);
    // 挂坠保持小巧；可点击区域比看得见的图案大，手机也容易抓住。
    handle.innerHTML = '<svg viewBox="0 0 64 100" aria-hidden="true"><path class="pendant-cord" d="M32 0 Q25 20 32 42 T32 65"/><path class="pendant-charm" d="M32 62 Q44 72 42 80 Q38 93 32 96 Q21 88 22 79 Q24 68 32 62Z"/><path class="pendant-mark" d="M28 78 Q32 82 36 76"/></svg>';
    const hint = document.createElement("span"); hint.className = "curtain-hint";
    hint.textContent = "Pull a little. Or just click.";
    overlay.append(canvas, copy, handle, hint); shell.append(content, overlay); root.append(shell);
    window.siteLanguage.translateTree(overlay);
    content.hidden = true; content.inert = true; root.dataset.curtain = "closed";

    let width = 1, height = 1, strands = [], raf = 0, visible = false, opened = false;
    let drag = null, pointer = null, tug = 0, pullX = 0, pullY = 0, frames = 0;
    let started = 0, progress = 0, last = 0, suppressClick = false;
    const clamp = (n, a, b) => Math.min(b, Math.max(a, n));
    function resize() {
      if (opened) return;
      const bounds = shell.getBoundingClientRect(); if (!bounds.width || !bounds.height) return;
      width = bounds.width; height = bounds.height;
      const ratio = Math.min(devicePixelRatio || 1, 2);
      canvas.width = Math.round(width * ratio); canvas.height = Math.round(height * ratio);
      canvas.style.height = `${height}px`; ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
      // 短绳数量随宽度变化，小屏也保留同样的细密程度。
      const count = Math.ceil(width / 6);
      strands = Array.from({ length: count }, (_, i) => {
        const x = (i + .5) / count * width, length = height - 12 - 13 * Math.sin(i * 2.3);
        const y = -9 + 5 * Math.sin(i / count * Math.PI);
        return { x, y, length: length / 15, points: Array.from({ length: 16 }, (_, j) => ({ x, y: y + j * length / 15, px: x, py: y + j * length / 15 })) };
      });
      frames = 70; draw(); wake();
    }
    function update(dt) {
      for (let i = 0; i < strands.length; i++) {
        const strand = strands[i], points = strand.points;
        const side = strand.x < width / 2 ? -1 : 1;
        const edge = side < 0 ? -28 + strand.x * .06 : width + 28 - (width - strand.x) * .06;
        const rootX = strand.x + (edge - strand.x) * progress;
        // 移动锚点就像手拉窗帘环；下垂部分仍由短绳约束计算，留下延迟与摆动。
        for (let j = 1; j < points.length; j++) {
          const p = points[j], vx = (p.x - p.px) * .88, vy = (p.y - p.py) * .88;
          p.px = p.x; p.py = p.y;
          p.x += vx * dt; p.y += vy * dt + .35 * dt;
          const depth = j / 15;
          const target = rootX + Math.sin(depth * Math.PI * .8) * side * (progress * 60 + tug * 70);
          p.x += (target - p.x) * .025 * dt;
          if (pointer) {
            const dx = p.x - pointer.x, dy = p.y - pointer.y, distance = Math.hypot(dx, dy);
            if (distance < 65 && distance > .1) p.x += dx / distance * (1 - distance / 65) * 2 * dt;
          }
        }
        // 重复收紧四次，避免线像橡皮泥一样越拉越长；顶点始终固定在轨道上。
        for (let pass = 0; pass < 4; pass++) {
          points[0].x = rootX; points[0].y = strand.y;
          for (let j = 1; j < points.length; j++) {
            const a = points[j - 1], b = points[j], dx = b.x - a.x, dy = b.y - a.y;
            const distance = Math.hypot(dx, dy) || 1, error = (distance - strand.length) / distance;
            if (j === 1) { b.x -= dx * error; b.y -= dy * error; }
            else { a.x += dx * error * .5; a.y += dy * error * .5; b.x -= dx * error * .5; b.y -= dy * error * .5; }
          }
        }
      }
    }
    function draw() {
      ctx.clearRect(0, 0, width, height);
      for (let i = 0; i < strands.length; i++) {
        const points = strands[i].points;
        ctx.beginPath(); ctx.moveTo(points[0].x, points[0].y);
        for (let j = 1; j < points.length - 1; j++) ctx.quadraticCurveTo(points[j].x, points[j].y, (points[j].x + points[j + 1].x) / 2, (points[j].y + points[j + 1].y) / 2);
        ctx.lineTo(points.at(-1).x, points.at(-1).y);
        ctx.strokeStyle = i % 3 ? "#eeede3" : "#e5e5d6"; ctx.lineWidth = width / strands.length + .7; ctx.stroke();
        ctx.strokeStyle = i % 9 === 0 ? "#92977a" : i % 3 ? "#d4d5bf" : "#b7bba0";
        ctx.lineWidth = i % 9 === 0 ? .9 : .55; ctx.stroke();
      }
    }
    function finish() {
      const hadFocus = document.activeElement === handle;
      cancelAnimationFrame(raf); raf = 0; overlay.remove();
      shell.style.height = ""; shell.classList.add("is-open");
      content.inert = false; root.dataset.curtain = "open";
      root.dispatchEvent(new CustomEvent("experimentreveal"));
      // 键盘揭幕后把焦点交给作品标题；鼠标则不额外跳动页面。
      if (hadFocus) {
        const title = heading.querySelector("h2"); title.tabIndex = -1; title.focus({ preventScroll: true });
      }
      observer.disconnect(); sizeObserver.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
      reduced.removeEventListener("change", onMotion);
    }
    function frame(now) {
      raf = 0;
      const dt = clamp((now - (last || now - 16)) / 16.67, .2, 1.8); last = now;
      if (opened) {
        const t = clamp((now - started) / 1050, 0, 1); progress = 1 - (1 - t) ** 3;
        if (t === 1) return finish();
      } else if (!drag) {
        tug *= .88; pullX *= .84; pullY *= .84;
        handle.style.transform = `translate(${pullX}px,${pullY}px) rotate(${pullX * .18}deg)`;
      }
      update(dt); draw(); frames--;
      if ((opened || drag || frames > 0) && visible && !document.hidden) raf = requestAnimationFrame(frame);
    }
    function wake() {
      if (!raf && visible && !document.hidden && !reduced.matches) { last = 0; raf = requestAnimationFrame(frame); }
    }
    function reveal() {
      if (opened) return;
      opened = true; drag = null; pointer = null; started = performance.now();
      const closedHeight = shell.getBoundingClientRect().height;
      shell.style.height = `${closedHeight}px`; content.hidden = false;
      root.dataset.curtain = "opening"; shell.classList.add("is-opening");
      handle.setAttribute("aria-expanded", "true"); handle.style.pointerEvents = "none";
      // 先量完整作品高度，再展开外壳；只展开这一件，另外两件保持遮住。
      shell.getBoundingClientRect(); shell.style.height = `${content.scrollHeight}px`;
      if (reduced.matches) finish(); else wake();
    }
    handle.addEventListener("pointerdown", event => {
      if (event.button !== 0 || opened) return;
      suppressClick = false; drag = { id: event.pointerId, x: event.clientX, y: event.clientY };
      handle.setPointerCapture(event.pointerId); frames = 80; wake();
    });
    handle.addEventListener("pointermove", event => {
      if (!drag || event.pointerId !== drag.id) return;
      pullX = clamp(event.clientX - drag.x, -110, 110); pullY = clamp(event.clientY - drag.y, -35, 65);
      tug = Math.min(1, Math.abs(pullX) / 70);
      handle.style.transform = `translate(${pullX}px,${pullY}px) rotate(${pullX * .18}deg)`;
      frames = 80;
      if (Math.abs(pullX) > Math.min(65, width * .18) || pullY > 55) { suppressClick = true; reveal(); }
      else if (reduced.matches) { update(1); draw(); }
    });
    function cancel() { if (!drag) return; drag = null; suppressClick = true; frames = 80; if (reduced.matches) { tug = pullX = pullY = 0; handle.style.transform = ""; resize(); } else wake(); }
    handle.addEventListener("pointerup", () => {
      if (drag && Math.hypot(pullX, pullY) > 9) suppressClick = true;
      drag = null; frames = 80;
      if (reduced.matches && !opened) { tug = pullX = pullY = 0; handle.style.transform = ""; resize(); }
      else wake();
    });
    handle.addEventListener("pointercancel", cancel);
    handle.addEventListener("lostpointercapture", cancel);
    handle.addEventListener("keydown", event => { if (event.key === "Escape") { cancel(); event.preventDefault(); } });
    handle.addEventListener("click", event => { if (event.detail === 0 || !suppressClick) reveal(); suppressClick = false; });
    overlay.addEventListener("pointermove", event => {
      if (opened || drag || event.pointerType !== "mouse" || reduced.matches) return;
      const bounds = overlay.getBoundingClientRect(); pointer = { x: event.clientX - bounds.left, y: event.clientY - bounds.top };
      frames = 75; wake();
    });
    overlay.addEventListener("pointerleave", () => { pointer = null; frames = 75; wake(); });
    const observer = new IntersectionObserver(entries => {
      visible = entries[0].isIntersecting;
      if (visible) { frames = 75; wake(); } else { cancel(); cancelAnimationFrame(raf); raf = 0; }
    });
    const sizeObserver = new ResizeObserver(resize); sizeObserver.observe(shell); observer.observe(shell);
    function onVisibility() { if (document.hidden) { cancel(); cancelAnimationFrame(raf); raf = 0; } else { frames = 75; wake(); } }
    function onMotion() { if (reduced.matches) { if (opened) finish(); else { cancelAnimationFrame(raf); raf = 0; resize(); } } else wake(); }
    document.addEventListener("visibilitychange", onVisibility); reduced.addEventListener("change", onMotion);
    resize();
  });
})();
