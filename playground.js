/* 用途：日落单洞高尔夫。风景使用用户提供的蜡笔画，球与击球交互由代码绘制。
 * 球场坐标始终是 0～1，屏幕变大变小只影响画法；像把同一张地图缩放，不改变球的位置。
 * 没有网络依赖；拖拽、触摸、按钮和键盘共享同一套击球逻辑。
 */
(() => {
  "use strict";
  const canvas = document.querySelector("#golf-canvas");
  const ctx = canvas.getContext("2d");
  const stage = canvas.parentElement;
  // 幕布只负责这一件作品的开场；揭开之前不运行游戏的动画时钟。
  const experience = document.querySelector("#playground");
  const revealed = () => !experience.dataset.curtain || experience.dataset.curtain === "open";
  const translate = window.siteLanguage.translate;
  const status = document.querySelector("#golf-status");
  const shotsLabel = document.querySelector("#golf-shots");
  const powerInput = document.querySelector("#golf-power");
  const powerOutput = document.querySelector("#golf-power-value");
  const chipButton = document.querySelector("#golf-chip");
  const leftButton = document.querySelector("#golf-left");
  const rightButton = document.querySelector("#golf-right");
  const rescue = document.querySelector("#golf-rescue");
  const catButton = document.querySelector("#golf-cat-help");
  const reduced = matchMedia("(prefers-reduced-motion: reduce)");
  if (!ctx) { status.textContent = translate("Your browser needs Canvas to play this game."); return; }
  const tee = { x: .24, y: .12 }, hole = { x: .74, y: .74 };
  const baseAim = Math.atan2(hole.y - tee.y, hole.x - tee.x);
  const clamp = (n, min, max) => Math.min(max, Math.max(min, n));
  let width = 1, height = 1, backdrop, artRect, artSpec, aim = baseAim + .10, power = .68;
  const artwork = new Image();
  let keyboardGuide = false;
  let ball = { ...tee }, altitude = 0, shots = 0, phase = "ready", drag = null;
  let shot = null, progress = 0, cooldown = 0, previousTime = 0, frameId = 0, visible = false;
  let statusKey = "A little patience. A good shot.";
  let misses = 0, assisted = false;

  // 斜视投影：远处的地面更高，腾空的球在地面位置上再向上移；阴影留在地上。
  function project(point, lift = 0) {
    if (!artRect) return { x: 0, y: 0 };
    // 球和洞跟着画中发球台/果岭定位，缩放裁切后也贴在同一块草地上。
    const x = artSpec.ball[0] + (point.x - tee.x) / (hole.x - tee.x) * (artSpec.cup[0] - artSpec.ball[0]);
    const y = artSpec.ball[1] + (point.y - tee.y) / (hole.y - tee.y) * (artSpec.cup[1] - artSpec.ball[1]);
    return { x: artRect.x + x * artRect.scale, y: artRect.y + y * artRect.scale - lift * height * .25 };
  }
  function ellipse(context, x, y, rx, ry, color) {
    context.fillStyle = color;
    context.beginPath(); context.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2); context.fill();
  }
  function refreshLabels() {
    status.textContent = translate(statusKey);
    shotsLabel.textContent = `${translate("Shots")}: ${shots}`;
    powerInput.value = Math.round(power * 100);
    powerOutput.value = `${Math.round(power * 100)}%`;
    canvas.dataset.phase = phase;
    canvas.dataset.shots = shots;
    canvas.dataset.misses = misses;
    rescue.hidden = misses <= 2 || phase !== "ready";
    stage.classList.toggle("has-rescue", !rescue.hidden);
    catButton.disabled = phase !== "ready";
    canvas.dataset.power = power.toFixed(3);
    canvas.dataset.aim = aim.toFixed(3);
    canvas.dataset.ballX = ball.x.toFixed(3);
    canvas.dataset.ballY = ball.y.toFixed(3);
    stage.classList.toggle("has-played", shots > 0);
    stage.classList.toggle("is-in-motion", ["flying", "rolling", "helping"].includes(phase));
    stage.classList.toggle("show-ball-hint", phase === "ready" && !drag);
    // 读屏软件能听到进度，画面不需要能看清才能操作。
    canvas.setAttribute("aria-label", `${translate("One-hole golf game")}. ${translate("Shots")}: ${shots}. ${translate("Power")}: ${Math.round(power * 100)}%.`);
    [chipButton, powerInput, leftButton, rightButton].forEach(control => { control.disabled = phase !== "ready"; });
  }
  function say(key) { statusKey = key; refreshLabels(); }

  // 风景像一张铺在桌上的画：只等比缩放，球与洞跟随画里的固定位置。
  function makeBackdrop() {
    backdrop = document.createElement("canvas"); backdrop.width = width; backdrop.height = height;
    const b = backdrop.getContext("2d");
    const mobile = width <= 650;
    artSpec = { w: 1585, h: 992, ball: [680,904], cup: [1183,740] };
    const scale = Math.max(width / artSpec.w, height / artSpec.h);
    // 手机像从画中取景：稍向右取景，让发球台和旗杆同时留在屏幕里。
    const offsetX = mobile ? clamp(width / 2 - artSpec.w * .58 * scale, width - artSpec.w * scale, 0) : (width - artSpec.w * scale) / 2;
    artRect = { scale, x: offsetX, y: height - artSpec.h * scale };
    b.fillStyle = "#faf8f1"; b.fillRect(0,0,width,height);
    const image = artwork;
    if (image.complete && image.naturalWidth) b.drawImage(image,artRect.x,artRect.y,artSpec.w*scale,artSpec.h*scale);
    const start = project(tee);
    const caption = document.querySelector(".golf-caption");
    // 小屏中提示仍靠近球，但不让整句文字伸到画面之外。
    const captionBounds = caption.getBoundingClientRect();
    const captionHalf = captionBounds.width / 2;
    caption.style.left = `${clamp(start.x, captionHalf + 10, width - captionHalf - 10)}px`;
    caption.style.top = `${Math.min(start.y + Math.max(12, height * .021), height - captionBounds.height - 8)}px`;
  }

  function draw() {
    ctx.clearRect(0, 0, width, height);
    if (backdrop) ctx.drawImage(backdrop, 0, 0);
    const cup = project(hole), start = project(tee);
    const pole = height * (width <= 650 ? .095 : .11);
    ellipse(ctx, cup.x, cup.y + 1, Math.max(5, width * .007), Math.max(2, height * .005), "#4b563a");
    // 原画已经有旗杆，只在杆脚画洞口，避免两根旗杆重叠。
    if (phase === "ready" && (drag || keyboardGuide)) {
      // 只给出前 2/3 段弧线，不展示落点，让最后一段距离留给访客判断。
      const distance = 1.17 * power;
      const target = project({ x: tee.x + Math.cos(aim) * distance, y: tee.y + Math.sin(aim) * distance });
      // 像把原弧线剪短：同时重算控制点和终点，保留原先弧度，而非压扁整条线。
      const fraction = 2 / 3;
      const control = { x: (start.x + target.x) / 2, y: (start.y + target.y) / 2 - height * .20 };
      const guideControl = { x: start.x + (control.x - start.x) * fraction, y: start.y + (control.y - start.y) * fraction };
      const guideEnd = {
        x: (1 - fraction) ** 2 * start.x + 2 * (1 - fraction) * fraction * control.x + fraction ** 2 * target.x,
        y: (1 - fraction) ** 2 * start.y + 2 * (1 - fraction) * fraction * control.y + fraction ** 2 * target.y
      };
      // 沿弧线逐段淡出，像笔迹慢慢消失；不能突然截断，让末端被误认为落点。
      // 按曲线进度淡出，朝任意方向击球时都保持从球到末端的渐淡顺序。
      ctx.save(); ctx.strokeStyle = "#fffdf0"; ctx.lineWidth = 1.5; ctx.lineCap = "round";
      let previous = start;
      const segments = 48;
      for (let i = 1; i <= segments; i++) {
        const t = i / segments;
        const point = {
          x: (1 - t) ** 2 * start.x + 2 * (1 - t) * t * guideControl.x + t ** 2 * guideEnd.x,
          y: (1 - t) ** 2 * start.y + 2 * (1 - t) * t * guideControl.y + t ** 2 * guideEnd.y
        };
        ctx.globalAlpha = .8 * (1 - t) ** 1.1;
        ctx.beginPath(); ctx.moveTo(previous.x, previous.y); ctx.lineTo(point.x, point.y); ctx.stroke();
        previous = point;
      }
      ctx.restore();
    }
    if (phase === "helping") drawCat(start);
    if (phase !== "won") {
      const ground = project(ball), screen = project(ball, altitude);
      const perspective = clamp((ball.y - tee.y) / (hole.y - tee.y), 0, 1);
      const r = clamp(height * .021, 7, 16) * (1 - perspective * .60);
      ellipse(ctx, ground.x + 2, ground.y + 3, r * (1 + altitude * .5), r * .4, `rgba(62,77,41,${.23 / (1 + altitude)})`);
      const shine = ctx.createRadialGradient(screen.x - r * .4, screen.y - r * 1.5, 1, screen.x, screen.y - r, r);
      shine.addColorStop(0, "#fffef9"); shine.addColorStop(.55, "#f8f8f1"); shine.addColorStop(1, "#bdc9df");
      ellipse(ctx, screen.x, screen.y - r, r, r, shine);
    } else {
      // 胜利只做短暂轻巧的墨点，不持续闪烁；减少动画设置下不画这段效果。
      if (!reduced.matches && cooldown < 1.8) {
        for (let i = 0; i < 15; i++) {
          const angle = i * 2.4, spread = 15 + cooldown * 65;
          ellipse(ctx, cup.x + Math.cos(angle) * spread, cup.y - pole * .55 + Math.sin(angle) * spread * .55, 2, 2, i % 2 ? "#9ca77d" : "#eee6ca");
        }
      }
    }
  }

  // 小猫是代码画的简笔画：先走到球边，再伸爪；球沿真实洞口坐标滚进去。
  function drawCat(start) {
    const arrival = Math.min(1, progress / .42), size = clamp(width * .055, 28, 57);
    const x = -size + (start.x - size * .7 + size) * arrival;
    const y = start.y - size * .12 - Math.sin(arrival * Math.PI * 8) * 2;
    window.sitePlay.drawCat(ctx, x, y, size, progress > .42);
  }
  function win() {
    phase = "won"; ball = { ...hole }; altitude = 0; cooldown = 0;
    say(assisted ? "Tiny paws. Big possibilities." : "A good shot. A little joy.");
  }
  function askCat() {
    if (phase !== "ready" || misses <= 2) return;
    cancelDrag(); assisted = true; phase = "helping"; progress = 0; ball = { ...tee };
    say("Your problems are in good paws.");
    // 减少动画时直接给结果；仍走同一个进洞入口。
    if (reduced.matches) { win(); draw(); }
    else { canvas.scrollIntoView({ block: "center", behavior: "smooth" }); schedule(); }
  }

  function cancelDrag() {
    if (!drag) return;
    const id = drag.id; drag = null; canvas.classList.remove("is-aiming");stage.classList.remove("is-aiming");
    if (canvas.hasPointerCapture(id)) canvas.releasePointerCapture(id);
    draw();
  }
  function reset() {
    // 只重置这座球场，另外两件作品可以各自继续玩。
    cancelDrag(); phase = "ready"; ball = { ...tee }; altitude = 0;
    shots = 0; misses = 0; assisted = false; aim = baseAim + .10; power = .68; shot = null; cooldown = 0;keyboardGuide=false;
    say("A little patience. A good shot."); draw();
  }
  function takeShot() {
    if (phase !== "ready") return;
    window.sitePlay.mark("playground");
    cancelDrag(); shots++; assisted = false; phase = "flying"; progress = 0; cooldown = 0;keyboardGuide=false;
    const range = 1.17 * power;
    shot = { dx: Math.cos(aim), dy: Math.sin(aim), range, duration: 1.1 + power * 1.1 };
    say("Up in the air."); schedule();
  }
  function tick(dt) {
    if (phase === "helping") {
      progress = Math.min(1, progress + dt / 2.8);
      const push = clamp((progress - .45) / .55, 0, 1), eased = 1 - (1 - push) ** 2;
      ball = { x: tee.x + (hole.x - tee.x) * eased, y: tee.y + (hole.y - tee.y) * eased };
      if (progress === 1) win();
    } else if (phase === "flying") {
      progress = Math.min(1, progress + dt / shot.duration);
      ball = { x: tee.x + shot.dx * shot.range * .83 * progress, y: tee.y + shot.dy * shot.range * .83 * progress };
      altitude = power * 4 * progress * (1 - progress);
      if (progress === 1) { phase = "rolling"; progress = 0; altitude = 0; say("A little closer..."); }
    } else if (phase === "rolling") {
      progress = Math.min(1, progress + dt / .85);
      // 滚动逐渐变慢；每一帧都检查洞口距离，不能只在终点检查而让球穿过洞。
      const travelled = shot.range * (.83 + .17 * (1 - (1 - progress) ** 2));
      ball = { x: tee.x + shot.dx * travelled, y: tee.y + shot.dy * travelled };
      if (Math.hypot(ball.x - hole.x, ball.y - hole.y) < .025) {
        win();
      } else if (progress === 1) {
        phase = "missed"; misses++; cooldown = 0; say("Close enough to try again.");
      }
    } else if (phase === "missed") {
      cooldown += dt;
      if (cooldown > 1.05) { phase = "ready"; ball = { ...tee }; say("Same tee. A fresh try."); }
    } else if (phase === "won") cooldown += dt;
    canvas.dataset.phase = phase; canvas.dataset.ballX = ball.x.toFixed(3); canvas.dataset.ballY = ball.y.toFixed(3);
  }
  function schedule() {
    if (!frameId && visible && !document.hidden && revealed()) { previousTime = performance.now(); frameId = requestAnimationFrame(frame); }
  }
  function frame(now) {
    frameId = 0;
    const dt = Math.min((now - previousTime) / 1000, .035); previousTime = now;
    tick(dt); draw();
    if (["flying", "rolling", "missed", "helping"].includes(phase) || (phase === "won" && cooldown < 1.8 && !reduced.matches)) {
      if (visible && !document.hidden && revealed()) frameId = requestAnimationFrame(frame);
    }
  }
  function resize() {
    const bounds = stage.getBoundingClientRect(); if (!bounds.width || !bounds.height) return;
    cancelDrag(); width = Math.round(bounds.width); height = Math.round(bounds.height);
    const dpr = Math.min(devicePixelRatio || 1, 2);
    canvas.width = Math.round(width * dpr); canvas.height = Math.round(height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0); makeBackdrop(); draw();
  }
  new ResizeObserver(resize).observe(stage);
  experience.addEventListener("experimentreveal", () => { resize(); schedule(); });
  new IntersectionObserver(entries => {
    visible = entries[0].isIntersecting;
    if (visible) { draw(); schedule(); }
    else { cancelDrag(); cancelAnimationFrame(frameId); frameId = 0; }
  }).observe(canvas);
  document.addEventListener("visibilitychange", () => {
    cancelDrag(); if (document.hidden) { cancelAnimationFrame(frameId); frameId = 0; } else schedule();
  });

  // 向后拉的反方向是击球方向。按住时记录起点，松手才发球；短点击不会误发。
  canvas.addEventListener("pointerdown", event => {
    if (event.button !== 0) return;
    // 保留游戏接收按键的能力，但不让浏览器把拖拽当作选中图片或文字。
    event.preventDefault();
    canvas.classList.add("is-pointer-input");
    if (phase !== "ready" || drag) return;
    canvas.focus({ preventScroll: true });
    drag = { id: event.pointerId, x: event.clientX, y: event.clientY, distance: 0, aim, power };
    canvas.classList.add("is-aiming");stage.classList.add("is-aiming"); canvas.setPointerCapture(event.pointerId);
  });
  canvas.addEventListener("pointermove", event => {
    if (!drag || event.pointerId !== drag.id) return;
    const dx = drag.x - event.clientX, dy = event.clientY - drag.y;
    drag.distance = Math.hypot(dx, dy);
    if (drag.distance < 6) return;
    aim = Math.atan2(dy / ((artSpec.ball[1]-artSpec.cup[1])*artRect.scale/(hole.y-tee.y)), dx / ((artSpec.cup[0]-artSpec.ball[0])*artRect.scale/(hole.x-tee.x)));
    power = clamp(drag.distance / (Math.min(width, height) * .40), .15, 1);
    refreshLabels(); draw();
  });
  canvas.addEventListener("pointerup", event => {
    if (!drag || event.pointerId !== drag.id) return;
    const shouldShoot = drag.distance >= 8;
    cancelDrag(); if (shouldShoot) takeShot();
  });
  // 中断是取消而不是击球：系统手势、窗口失焦或 Escape 不会意外增加杆数。
  const abandonDrag = () => {
    if (drag) { aim = drag.aim; power = drag.power; cancelDrag(); refreshLabels(); }
  };
  canvas.addEventListener("pointercancel", abandonDrag);
  canvas.addEventListener("lostpointercapture", abandonDrag);
  window.addEventListener("blur", abandonDrag);
  canvas.addEventListener("dragstart", event => event.preventDefault());
  // 离开球场或开始使用键盘，就交还键盘焦点提示，方便按 Tab 找到游戏。
  canvas.addEventListener("blur", () => canvas.classList.remove("is-pointer-input"));
  canvas.addEventListener("keydown", event => {
    canvas.classList.remove("is-pointer-input");
    if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Enter", " ", "Escape", "r", "R"].includes(event.key)) return;
    event.preventDefault();
    if (event.key === "Escape") return abandonDrag();
    if (event.key.toLowerCase() === "r") return reset();
    if (phase !== "ready") return;
    keyboardGuide=true;
    if (event.key === "Enter" || event.key === " ") return takeShot();
    if (event.key === "ArrowLeft") aim += .03;
    if (event.key === "ArrowRight") aim -= .03;
    if (event.key === "ArrowUp") power = clamp(power + .02, .15, 1);
    if (event.key === "ArrowDown") power = clamp(power - .02, .15, 1);
    refreshLabels(); draw();
  });
  leftButton.addEventListener("click", () => { keyboardGuide=true;aim += .03; refreshLabels(); draw(); });
  rightButton.addEventListener("click", () => { keyboardGuide=true;aim -= .03; refreshLabels(); draw(); });
  powerInput.addEventListener("input", () => { keyboardGuide=true;power = Number(powerInput.value) / 100; refreshLabels(); draw(); });
  chipButton.addEventListener("click", takeShot);
  document.querySelector("#golf-reset").addEventListener("click", reset);
  catButton.addEventListener("click", askCat);
  window.addEventListener("languagechange", () => { refreshLabels(); makeBackdrop(); draw(); });
  // 将素材放到统一的图片文件夹；保留用户提供的原文件，便于以后更换。
  artwork.addEventListener("load", () => { makeBackdrop(); draw(); });
  artwork.src = "assets/golf-sunset.png";
  refreshLabels(); resize();
})();
