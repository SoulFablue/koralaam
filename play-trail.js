/* 用途：让同一只简笔小猫陪访客逛三个作品，在页尾留下本次浏览的三枚印记。
 * 印记记录实际操作，不要求赢、不解锁其他作品，也不存储个人信息。
 * SVG 与球场画布共用轮廓；像同一个角色换了位置，避免混入另一种插画风格。
 */
(() => {
  "use strict";
  const translate = window.siteLanguage.translate;
  const visited = new Set();
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

  function addFriend(root, anchor, message, className) {
    const friend = document.createElement("div"); friend.className = `cat-friend ${className}`;
    const button = document.createElement("button"); button.type = "button"; button.className = "cat-friend-button";
    button.setAttribute("aria-label", translate("Say hello to the little cat")); button.setAttribute("aria-expanded", "false");
    button.innerHTML = `<span class="cat-window">${catSVG()}</span>`;
    const bubble = document.createElement("span"); bubble.className = "cat-aside"; bubble.hidden = true;
    bubble.id = `${root.id}-cat-note`; bubble.textContent = translate(message);
    button.setAttribute("aria-controls", bubble.id);
    button.addEventListener("click", () => { bubble.hidden = !bubble.hidden; button.setAttribute("aria-expanded", String(!bubble.hidden)); });
    button.addEventListener("keydown", event => { if (event.key === "Escape" && !bubble.hidden) { bubble.hidden = true; button.setAttribute("aria-expanded", "false"); event.stopPropagation(); } });
    button.addEventListener("blur", () => { bubble.hidden = true; button.setAttribute("aria-expanded", "false"); });
    friend.append(button, bubble); anchor.append(friend);
  }
  const typewriter = document.querySelector("#typewriter"), monitor = document.querySelector("#almost-understood");
  const perch = document.createElement("div"); perch.className = "typewriter-cat-perch";
  typewriter.querySelector(".typewriter-test-layout").before(perch);
  addFriend(typewriter, perch, "I know that face.", "cat-peeking");
  addFriend(monitor, monitor.querySelector(".monitor-object"), "I'm listening. Mostly.", "cat-listening");

  const trail = document.createElement("section"); trail.className = "play-trail";
  trail.setAttribute("aria-labelledby", "play-trail-title");
  const title = document.createElement("p"); title.id = "play-trail-title"; title.className = "play-trail-title";
  title.textContent = translate("Little traces of curiosity.");
  const marks = document.createElement("div"); marks.className = "play-trail-marks";
  const note = document.createElement("p"); note.className = "play-trail-note";
  const announcement = document.createElement("span"); announcement.className = "sr-only";
  announcement.setAttribute("role", "status"); announcement.setAttribute("aria-live", "polite");
  const items = [
    { id: "playground", label: "A little try", icon: '<path d="M7 38 Q20 1 44 32" stroke-dasharray="2 4"/><circle cx="8" cy="37" r="2.5"/><path d="M40 40h12 M47 40V22l8 4-8 4"/>' },
    { id: "typewriter", label: "A familiar face", icon: '<text x="18" y="24">: : </text><text x="17" y="37">&#92;_/</text><path d="M11 14l-3 8v14l5 7 M46 14l4 8v14l-5 7"/>' },
    { id: "almost-understood", label: "A small hello", icon: '<path d="M10 12h38v26H30l-10 8v-8H10z"/><path d="M21 22l4 4-4 4 M31 30h8"/>' }
  ];
  const buttons = items.map(item => {
    const button = document.createElement("button"); button.type = "button"; button.className = "play-stamp"; button.dataset.experiment = item.id;
    button.innerHTML = `<svg viewBox="0 0 64 56" aria-hidden="true" focusable="false">${item.icon}</svg><span></span>`;
    button.setAttribute("aria-controls", item.id);
    // 印记也是返回作品的书签；点击只定位，不替访客拉开帘子或开始游戏。
    button.addEventListener("click", () => {
      const root = document.getElementById(item.id), heading = root.querySelector("h2");
      root.scrollIntoView({ behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth", block: "start" });
      heading.tabIndex = -1; heading.focus({ preventScroll: true });
    });
    marks.append(button); return button;
  });
  trail.append(title, marks, note, announcement);
  document.querySelector(".desk-invitation").before(trail);
  function render() {
    buttons.forEach((button, index) => {
      const seen = visited.has(items[index].id);
      button.classList.toggle("is-visited", seen);
      button.dataset.visited = String(seen);
      button.querySelector("span").textContent = translate(items[index].label);
      button.setAttribute("aria-label", `${translate(items[index].label)}. ${translate(seen ? "Visited" : "Not visited yet")}. ${translate("Return to this experiment")}`);
    });
    note.textContent = translate(visited.size === 3 ? "Thanks for wandering with me." : "No right order. Follow your curiosity.");
  }
  function mark(id) {
    if (visited.has(id) || !items.some(item => item.id === id)) return;
    visited.add(id); render();
    announcement.textContent = translate(items.find(item => item.id === id).label) + ". " + translate("A little trace, kept.");
  }
  window.sitePlay = { mark, drawCat };
  window.addEventListener("languagechange", render); render();
})();
