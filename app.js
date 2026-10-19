/* 用途：眼镜拖拽、镜片扫读、真实作品故事与教育/脱敏经历/爱好桌面。
 * 无需打包或联网；图片来自本地拆层，未制作多画稿的连续头像变形。
 */
(() => {
  "use strict";
  const translate = window.siteLanguage.translate;
  const portrait = document.querySelector(".portrait");
  const portraitWrap = document.querySelector(".portrait-wrap");
  const portraitHead = document.querySelector(".portrait-head");
  const eyes = [...document.querySelectorAll(".eye")];
  const handle = document.querySelector(".glasses-handle");
  const homeGlasses = document.querySelector(".glasses-home");
  const floating = document.querySelector("#floating-glasses");
  const reading = document.querySelector(".reading");
  const secretLine = document.querySelector("#secret-line");
  const cipherLine = document.querySelector("#cipher-line");
  const lensLine = document.querySelector("#lens-line");
  const revealButton = document.querySelector("#reveal-button");
  const readingStatus = document.querySelector("#reading-status");
  const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)");
  let message = lensLine.textContent;
  const groups = ["acekvxy", "bdgpq", "hnou", "ijl", "mw", "sz", "ftr"];
  const clamp = (value, low, high) => Math.min(high, Math.max(low, value));
  let words = [];
  let revealed = false;
  let readingPinned = false;
  // 每张思考卡各自保留阅读状态；示例文案明确是预留位置，不代表用户观点。
  const thoughtCards = [...document.querySelectorAll("[data-thought]")].map(element => ({
    element,
    message: element.querySelector(".lens-line").textContent,
    line: element.querySelector(".secret-line"),
    cipher: element.querySelector(".cipher-line"),
    lens: element.querySelector(".lens-line"),
    button: element.querySelector(".thought-reveal"),
    status: element.querySelector(".thought-status"),
    words: [], revealed: false,
  }));
  const sweptThoughts = new Set();
  let previewTimers = [];
  let revealTimer;
  let animationFrame = 0;
  let previousTime = 0;
  let drag = null;
  let returning = false;
  let swept = false;
  let suppressClick = false;
  let clearClickTimer;
  const homePage = document.querySelector("#content");
  const deskPage = document.querySelector("#desk");
  const enterDeskButton = document.querySelector("#enter-desk");
  let onDesk = false;
  let changingScene = false;
  let homeScroll = 0;
  let returnFocus = enterDeskButton;
  let galleryRequested = false;

  // 头像是一句轻松的招呼；眼镜另有拖拽区域，两种操作互不抢点击。
  const chatTrigger = document.querySelector(".avatar-chat-trigger");
  const chatBubble = document.querySelector("#avatar-bubble");
  const greetings = [
    "Hi?",
    "Let's connect!",
    "Hmm...",
    "Found my glasses? Borrow them.",
    "I'm here!",
    "Oh, hello there.",
    "You rang?",
    "Fancy seeing you here.",
    "Just a little curious.",
    "One sec. Thinking...",
    "Plot twist: it's me.",
    "Got a tiny idea?",
    "Nice weather in here.",
    "A very small hello.",
    "Wait, where was I?",
    "Me? Just browsing.",
    "Psst. Hey you.",
    "Still here. Still curious.",
    "Make yourself at home.",
    "Okay, your turn.",
  ];
  let greetingIndex = -1;
  function closeChat(restoreFocus = false) {
    chatBubble.hidden = true;
    chatTrigger.setAttribute("aria-expanded", "false");
    portraitWrap.classList.remove("is-chatting");
    if (restoreFocus) chatTrigger.focus({ preventScroll: true });
  }
  chatTrigger.addEventListener("click", () => {
    if (drag || returning || changingScene || onDesk) return;
    // 每次随机挑一句，并跳过上一句，连续点击不会马上重复。
    const choice = Math.floor(Math.random() * (greetingIndex < 0 ? greetings.length : greetings.length - 1));
    greetingIndex = greetingIndex >= 0 && choice >= greetingIndex ? choice + 1 : choice;
    chatBubble.querySelector(".bubble-message").textContent = translate(greetings[greetingIndex]);
    chatBubble.hidden = false;
    chatTrigger.setAttribute("aria-expanded", "true");
    portraitWrap.classList.add("is-chatting");
  });
  chatBubble.querySelector(".bubble-close").addEventListener("click", () => closeChat(true));
  // 气泡内部与头像点击保留对话，点击纸面其他位置才收起。
  document.addEventListener("click", event => {
    if (!chatBubble.hidden && !chatBubble.contains(event.target) && !chatTrigger.contains(event.target)) closeChat();
  });

  // 弹簧是一个逐步靠近目标的位置，速度与阻力使回位自然。
  class Spring {
    constructor(value) { this.value = value; this.target = value; this.speed = 0; }
    advance(seconds) {
      if (reducedMotion.matches) { this.value = this.target; this.speed = 0; return false; }
      const steps = Math.max(1, Math.ceil(seconds / 0.008));
      const step = seconds / steps;
      for (let index = 0; index < steps; index += 1) {
        this.speed += ((this.target - this.value) * 220 - this.speed * 25) * step;
        this.value += this.speed * step;
      }
      if (Math.abs(this.speed) < 0.05 && Math.abs(this.target - this.value) < 0.02) {
        this.value = this.target; this.speed = 0; return false;
      }
      return true;
    }
    set(value) { this.value = this.target = value; this.speed = 0; }
  }
  const head = { horizontal: new Spring(0), vertical: new Spring(0), turn: new Spring(0) };
  const glasses = { horizontal: new Spring(0), vertical: new Spring(0), scale: new Spring(1), turn: new Spring(0) };
  let glassesWidth = 0;

  function startFrame() {
    if (!animationFrame) { previousTime = performance.now(); animationFrame = requestAnimationFrame(frame); }
  }

  function encoded(text, seed = 0) {
    return [...text].map((character, index) => {
      if (/[\u3400-\u9fff]/.test(character)) return "言未之间所见思问知听与光"[(index * 3 + seed + 1) % 12];
      if (!/[a-z]/i.test(character)) return character;
      const group = groups.find(value => value.includes(character.toLowerCase())) || "acekvxy";
      const substitute = group[(index * 3 + seed + 1) % group.length];
      return character === character.toUpperCase() ? substitute.toUpperCase() : substitute;
    }).join("");
  }

  function buildWords() {
    // 隐藏的首页量不到文字宽度；等返回首页再排版，避免字词挤成一团。
    if (homePage.hidden) return;
    cipherLine.replaceChildren();
    // 英文逐词、中文逐字；语言切换后两层依然能对齐并自然换行。
    const tokens = message.match(/\s+|[\u3400-\u9fff]|[^\s\u3400-\u9fff]+/g) || [];
    words = tokens.flatMap(text => {
      if (/^\s+$/.test(text)) { cipherLine.append(text); return []; }
      const element = document.createElement("span");
      element.className = "scramble-word";
      element.textContent = text;
      cipherLine.append(element);
      const width = element.getBoundingClientRect().width;
      element.style.width = `${width}px`;
      element.textContent = revealed ? text : encoded(text);
      return [{ text, element, begin: null, duration: 700, complete: revealed, lastTick: -1 }];
    });
    buildThoughtWords();
  }

  function buildThoughtWords() {
    thoughtCards.forEach(card => {
      // 标签页未打开时宽度是零；显示后再量字，避免还原文字挤在一起。
      if (!card.line.getClientRects().length) return;
      card.cipher.replaceChildren();
      // 中文逐字、英文逐词排版；保留原有空格，遮罩与底层文字才能对齐。
      const tokens = card.message.match(/\s+|[\u3400-\u9fff]|[^\s\u3400-\u9fff]+/g) || [];
      card.words = tokens.flatMap((text, tokenIndex) => {
        if (/^\s+$/.test(text)) { card.cipher.append(text); return []; }
        const element = document.createElement("span");
        element.className = "scramble-word";
        element.textContent = text;
        card.cipher.append(element);
        element.style.width = `${element.getBoundingClientRect().width}px`;
        element.textContent = card.revealed ? text : encoded(text, tokenIndex * 3);
        return [{ text, element, begin: null, duration: 500, complete: card.revealed, lastTick: -1 }];
      });
    });
  }

  function revealThought(card) {
    card.revealed = true;
    card.element.classList.add("revealed");
    card.element.classList.remove("has-lens");
    card.button.setAttribute("aria-expanded", "true");
    card.button.firstChild.textContent = translate("Hide");
    card.words.forEach((word, index) => startWord(word, index * 40));
    card.status.textContent = card.message;
  }

  function resetThought(card) {
    card.revealed = false;
    card.element.classList.remove("revealed", "has-lens");
    card.button.setAttribute("aria-expanded", "false");
    card.button.firstChild.textContent = translate("Read");
    card.status.textContent = "";
    buildThoughtWords();
  }
  thoughtCards.forEach(card => card.button.addEventListener("click", () => card.revealed ? resetThought(card) : revealThought(card)));

  function startWord(word, delay = 0) {
    if (word.complete || word.begin !== null) return;
    word.begin = performance.now() + delay;
    startFrame();
  }

  function updateWords(time) {
    let busy = false;
    for (const word of [...words, ...thoughtCards.flatMap(card => card.words)]) {
      if (word.begin === null || word.complete) continue;
      busy = true;
      const progress = reducedMotion.matches ? 1 : clamp((time - word.begin) / word.duration, 0, 1);
      if (progress === 1) {
        word.complete = true;
        word.element.textContent = word.text;
        word.element.classList.add("settled");
        continue;
      }
      const tick = Math.floor(time / 90);
      if (tick === word.lastTick) continue;
      word.lastTick = tick;
      const count = Math.floor(progress * word.text.length);
      const settled = document.createElement("span");
      settled.className = "settled";
      settled.textContent = word.text.slice(0, count);
      word.element.replaceChildren(settled, encoded(word.text.slice(count), tick));
    }
    return busy;
  }

  function clearPreview() {
    previewTimers.forEach(clearTimeout);
    previewTimers = [];
  }

  function reveal(pinned = true) {
    clearPreview();
    clearTimeout(revealTimer);
    readingPinned ||= pinned;
    revealed = true;
    reading.classList.add("revealed");
    revealButton.setAttribute("aria-expanded", "true");
    words.forEach((word, index) => startWord(word, index * 65));
    readingStatus.textContent = message;
    revealTimer = setTimeout(resetReading, 180000);
  }

  function resetReading() {
    clearPreview();
    clearTimeout(revealTimer);
    revealed = false;
    readingPinned = false;
    reading.classList.remove("revealed");
    revealButton.setAttribute("aria-expanded", "false");
    readingStatus.textContent = "";
    buildWords();
  }

  // 镜片中心用与眼镜图层相同的旋转、缩放计算，避免视觉与遮罩脱节。
  function lensPositions(useTarget = false) {
    const coordinate = useTarget ? "target" : "value";
    const angle = glasses.turn[coordinate] * Math.PI / 180;
    const size = glassesWidth * glasses.scale[coordinate];
    return [[0.326, 0.514], [0.574, 0.493]].map(([horizontal, vertical]) => {
      const offsetX = (horizontal - 0.45) * size;
      const offsetY = (vertical - 0.49) * size;
      return {
        horizontal: glasses.horizontal[coordinate] + offsetX * Math.cos(angle) - offsetY * Math.sin(angle),
        vertical: glasses.vertical[coordinate] + offsetX * Math.sin(angle) + offsetY * Math.cos(angle),
        radiusX: size * 0.072,
        radiusY: size * 0.06,
      };
    });
  }

  function updateMask() {
    if (!drag) {
      reading.classList.remove("has-lens");
      thoughtCards.forEach(card => card.element.classList.remove("has-lens"));
      return;
    }
    const bounds = secretLine.getBoundingClientRect();
    const lenses = lensPositions();
    // 将真文当作一张纸，只从两个镜片形状的窗口里看见它。
    lensLine.style.maskImage = lenses.map(lens => `radial-gradient(ellipse ${lens.radiusX}px ${lens.radiusY}px at ${lens.horizontal - bounds.left}px ${lens.vertical - bounds.top}px, #000 96%, transparent 100%)`).join(", ");
    reading.classList.toggle("has-lens", !revealed);
    for (const word of revealed ? [] : words) {
      const box = word.element.getBoundingClientRect();
      const touches = lenses.some(lens => {
        const nearestX = clamp(lens.horizontal, box.left, box.right);
        const nearestY = clamp(lens.vertical, box.top, box.bottom);
        return ((nearestX - lens.horizontal) / lens.radiusX) ** 2 + ((nearestY - lens.vertical) / lens.radiusY) ** 2 < 1;
      });
      if (touches) { swept = true; startWord(word); }
    }
    // 新卡片复用同一副眼镜的位置；鼠标仅悬停时不会自动还原。
    for (const card of thoughtCards) {
      if (card.revealed || !card.line.getClientRects().length) continue;
      const bounds = card.line.getBoundingClientRect();
      card.lens.style.maskImage = lenses.map(lens => `radial-gradient(ellipse ${lens.radiusX}px ${lens.radiusY}px at ${lens.horizontal - bounds.left}px ${lens.vertical - bounds.top}px, #000 96%, transparent 100%)`).join(", ");
      card.element.classList.add("has-lens");
      for (const word of card.words) {
        const box = word.element.getBoundingClientRect();
        const touches = lenses.some(lens => {
          const nearestX = clamp(lens.horizontal, box.left, box.right);
          const nearestY = clamp(lens.vertical, box.top, box.bottom);
          return ((nearestX - lens.horizontal) / lens.radiusX) ** 2 + ((nearestY - lens.vertical) / lens.radiusY) ** 2 < 1;
        });
        if (touches) { sweptThoughts.add(card); startWord(word); }
      }
    }
  }

  function frame(time) {
    animationFrame = 0;
    const seconds = Math.min((time - previousTime) / 1000, 0.032);
    previousTime = time;
    if (returning) {
      const homeBounds = portrait.getBoundingClientRect();
      glasses.horizontal.target = homeBounds.left + homeBounds.width * 0.45;
      glasses.vertical.target = homeBounds.top + homeBounds.width * 0.49;
    }
    let busy = false;
    for (const spring of [...Object.values(head), ...Object.values(glasses)]) busy = spring.advance(seconds) || busy;
    const headTransform = `translate(${head.horizontal.value}px, ${head.vertical.value}px) rotate(${head.turn.value}deg)`;
    portraitHead.style.transform = headTransform;
    homeGlasses.style.transform = headTransform;
    eyes.forEach(eye => { eye.style.transform = `translate(${head.horizontal.value * 0.32}px, ${head.vertical.value * 0.18}px)`; });
    if (drag || returning) {
      floating.style.transform = `translate(${glasses.horizontal.value}px, ${glasses.vertical.value}px) rotate(${glasses.turn.value}deg) scale(${glasses.scale.value}) translate(${-glassesWidth * 0.45}px, ${-glassesWidth * 0.49}px)`;
      updateMask();
    }
    busy = updateWords(time) || busy;
    // 两个镜片完全越过上边沿才换场景，避免扫读时意外跳转。
    if (drag?.moved && lensPositions().every(lens => lens.vertical + lens.radiusY < 0)) {
      enterDesk(handle);
    }
    if (returning && !Object.values(glasses).some(spring => Math.abs(spring.value - spring.target) > 0.03 || Math.abs(spring.speed) > 0.1)) {
      returning = false;
      floating.hidden = true;
      portraitWrap.classList.remove("is-held");
    }
    if ((busy || drag || returning) && !animationFrame) animationFrame = requestAnimationFrame(frame);
  }

  function aimHead(clientX, clientY) {
    const bounds = portrait.getBoundingClientRect();
    const horizontal = clamp((clientX - bounds.left - bounds.width * 0.45) / bounds.width, -1, 1);
    const vertical = clamp((clientY - bounds.top - bounds.height * 0.49) / bounds.height, -1, 1);
    head.horizontal.target = reducedMotion.matches ? 0 : horizontal * 3;
    head.vertical.target = reducedMotion.matches ? 0 : vertical * 2;
    head.turn.target = reducedMotion.matches ? 0 : horizontal * 2.2;
    startFrame();
  }

  function resetHead() {
    Object.values(head).forEach(spring => { spring.target = 0; });
    startFrame();
  }

  function beginDrag(event) {
    if (event.button !== 0 || drag || returning || onDesk || changingScene) return;
    closeChat();
    clearPreview();
    clearTimeout(clearClickTimer);
    const bounds = portrait.getBoundingClientRect();
    glassesWidth = bounds.width;
    floating.style.width = `${glassesWidth}px`;
    glasses.horizontal.set(bounds.left + glassesWidth * 0.45);
    glasses.vertical.set(bounds.top + glassesWidth * 0.49);
    glasses.scale.set(1);
    glasses.turn.set(0);
    floating.hidden = false;
    drag = { pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, homeX: glasses.horizontal.value, homeY: glasses.vertical.value, moved: false, touch: event.pointerType === "touch" };
    swept = false;
    sweptThoughts.clear();
    portraitWrap.classList.add("is-held", "is-curious");
    document.body.classList.add("is-dragging");
    handle.setPointerCapture(event.pointerId);
    startFrame();
  }

  function moveDrag(event) {
    if (!drag || event.pointerId !== drag.pointerId) return;
    const horizontal = event.clientX - drag.startX;
    const vertical = event.clientY - drag.startY;
    const distance = Math.hypot(horizontal, vertical);
    const lift = clamp(distance / 70, 0, 1);
    drag.moved ||= distance > 5;
    glasses.horizontal.target = drag.homeX + horizontal;
    // 鼠标到屏幕上沿就无法继续移动；额外抬起眼镜，让镜片仍能完整离开画面。
    const edgeLift = vertical < -40 ? clamp((80 - event.clientY) / 80, 0, 1) * 90 : 0;
    glasses.vertical.target = drag.homeY + vertical - lift * (drag.touch ? 65 : 22) - edgeLift;
    glasses.scale.target = 1 + Math.min(distance / 140, 1.4);
    glasses.turn.target = clamp(horizontal / 35, -8, 8);
    document.body.classList.toggle("is-near-edge", edgeLift > 0);
    aimHead(event.clientX, event.clientY);
  }

  function endDrag(event, cancelled = false) {
    if (!drag || event && event.pointerId !== drag.pointerId) return;
    // 快速拖到顶端并松手时，弹簧可能还没追上鼠标，用目标位置补一次判定。
    if (!cancelled && drag.moved && lensPositions(true).every(lens => lens.vertical + lens.radiusY < 0)) {
      enterDesk(handle);
      return;
    }
    const current = drag;
    drag = null;
    suppressClick = current.moved || cancelled;
    clearClickTimer = setTimeout(() => { suppressClick = false; }, 500);
    if (handle.hasPointerCapture(current.pointerId)) handle.releasePointerCapture(current.pointerId);
    reading.classList.remove("has-lens");
    thoughtCards.forEach(card => card.element.classList.remove("has-lens"));
    portraitWrap.classList.remove("is-curious");
    document.body.classList.remove("is-dragging", "is-near-edge");
    const bounds = portrait.getBoundingClientRect();
    glasses.horizontal.target = bounds.left + bounds.width * 0.45;
    glasses.vertical.target = bounds.top + bounds.width * 0.49;
    glasses.scale.target = 1;
    glasses.turn.target = 0;
    returning = true;
    resetHead();
    if (swept && !cancelled) reveal();
    if (!cancelled) sweptThoughts.forEach(revealThought);
    else sweptThoughts.forEach(card => { if (!card.revealed) resetThought(card); });
    sweptThoughts.clear();
    startFrame();
  }

  handle.addEventListener("pointerdown", beginDrag);
  handle.addEventListener("pointermove", moveDrag);
  handle.addEventListener("pointerup", event => endDrag(event));
  handle.addEventListener("pointercancel", event => endDrag(event, true));
  handle.addEventListener("lostpointercapture", event => endDrag(event, true));
  handle.addEventListener("click", () => {
    if (suppressClick) { suppressClick = false; return; }
    if (onDesk || changingScene) return;
    reveal();
  });
  revealButton.addEventListener("click", () => revealed && readingPinned ? resetReading() : reveal());
  portraitWrap.addEventListener("pointermove", event => { if (!drag && event.pointerType === "mouse") aimHead(event.clientX, event.clientY); });
  portraitWrap.addEventListener("pointerleave", () => { if (!drag) resetHead(); });
  // 停留片刻才揭示，路过不会触发；点击或镜片阅读后则保留，方便手机阅读。
  function previewIntroduction() {
    if (revealed || drag) return;
    clearPreview();
    previewTimers.push(setTimeout(() => reveal(false), 700));
  }
  function leaveIntroduction() {
    if (!readingPinned && !drag) resetReading();
  }
  reading.addEventListener("pointerenter", event => { if (event.pointerType === "mouse") previewIntroduction(); });
  reading.addEventListener("pointerleave", leaveIntroduction);
  revealButton.addEventListener("focus", previewIntroduction);
  revealButton.addEventListener("blur", leaveIntroduction);
  window.addEventListener("keydown", event => {
    if (event.key !== "Escape") return;
    if (!chatBubble.hidden) { closeChat(true); return; }
    if (onDesk) leaveDesk();
    else endDrag(null, true);
  });
  window.addEventListener("blur", () => endDrag(null, true));
  window.addEventListener("resize", () => { endDrag(null, true); buildWords(); });
  window.addEventListener("scroll", () => { if (returning) endDrag(null, true); }, { passive: true });
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) { endDrag(null, true); resetReading(); resetHead(); }
  });
  reducedMotion.addEventListener("change", resetHead);

  // 场景切换像翻到下一页：先收好眼镜，再交接画面和键盘焦点。
  async function changeScene(showDesk) {
    if (changingScene || onDesk === showDesk) return;
    changingScene = true;
    closeChat();
    endDrag(null, true);
    returning = false;
    floating.hidden = true;
    portraitWrap.classList.remove("is-held", "is-curious");
    document.body.classList.remove("is-dragging", "is-near-edge");
    Object.values(head).forEach(spring => spring.set(0));
    clearPreview();
    const outgoing = showDesk ? homePage : deskPage;
    const incoming = showDesk ? deskPage : homePage;
    if (showDesk) homeScroll = window.scrollY;
    onDesk = showDesk;
    outgoing.inert = true;
    document.body.classList.add("is-transitioning");
    const duration = reducedMotion.matches ? 0 : 260;
    if (duration) {
      await outgoing.animate([{ opacity: 1, transform: "translateY(0)" }, { opacity: 0, transform: `translateY(${showDesk ?  -32 : 32}px)` }], { duration, easing: "ease-in", fill: "none" }).finished;
    }
    outgoing.hidden = true;
    incoming.hidden = false;
    incoming.inert = false;
    document.querySelector(".skip-link").href = showDesk ? "#desk" : "#content";
    if (!showDesk) buildWords();
    window.scrollTo({ top: showDesk ? 0 : homeScroll, behavior: "instant" });
    if (duration) {
      await incoming.animate([{ opacity: 0, transform: `translateY(${showDesk ? 40 : -28}px)` }, { opacity: 1, transform: "translateY(0)" }], { duration: 460, easing: "cubic-bezier(.22,1,.36,1)" }).finished;
    }
    document.body.classList.remove("is-transitioning");
    changingScene = false;
    (showDesk ? document.querySelector("#desk-title") : returnFocus).focus({ preventScroll: true });
    if (!showDesk && galleryRequested) {
      galleryRequested = false;
      const title = document.querySelector("#playground-title");
      title.scrollIntoView({ behavior: reducedMotion.matches ? "instant" : "smooth", block: "start" });
      title.focus({ preventScroll: true });
    }
    // 转场中点了浏览器返回，也以最终网址为准，不把人留在错误的一页。
    if ((location.hash === "#desk") !== onDesk) changeScene(location.hash === "#desk");
  }

  function enterDesk(source = enterDeskButton) {
    if (onDesk || changingScene) return;
    returnFocus = source;
    if (location.hash !== "#desk") history.pushState({ koraDesk: true }, "", "#desk");
    changeScene(true);
  }

  function leaveDesk() {
    if (changingScene) return;
    if (history.state?.koraDesk) history.back();
    else {
      history.replaceState(null, "", location.pathname + location.search);
      changeScene(false);
    }
  }

  enterDeskButton.addEventListener("click", () => enterDesk());
  document.querySelector("#leave-desk").addEventListener("click", leaveDesk);
  deskPage.querySelector(".wordmark").addEventListener("click", event => { event.preventDefault(); leaveDesk(); });
  window.addEventListener("popstate", () => changeScene(location.hash === "#desk"));
  window.addEventListener("hashchange", () => changeScene(location.hash === "#desk"));

  // 两处作品入口共用真实资料：简介、本人提供的截图和已提供的商店链接。
  // 展示小故事而非整份简历；缺少的链接不制造假按钮。
  const projects = [
    {
      name: "CozyListen", kind: "精听浏览器插件", image: "assets/cozylisten.png",
      alt: "CozyListen 界面：视频旁的逐句字幕、句末暂停、星标与听写区域",
      hook: "把一次“没听懂”，变成顺手的练习。",
      intro: "从自己的精听体验出发，把逐句复听、听写和复习接进浏览器。",
      story: [
        ["起点", "练习时总在重复找上一句、暂停、记重点。我先从自己真正遇到的麻烦里找需求。"],
        ["做法", "复用 YouTube 和 Bilibili 的字幕能力，接入逐句跳转、句末暂停、快捷键复听、双语字幕、星标与逐字稿导出。"],
        ["走到用户面前", "从实用的精听方法出发，把工具介绍给有同样需要的人。也可以结合“尚雯婕英语学习法”的讨论，让对学习方法的兴趣，接上一段可以动手的练习。"],
      ],
      url: "https://chromewebstore.google.com/detail/cozylisten/eaoepadpfoebkckpbiccpophjdlolhoi",
      action: "在 Chrome 商店试试",
    },
    {
      name: "PRDkit", kind: "产品经理原型工具包", image: "assets/prdkit.png",
      alt: "PRDkit 示例界面：需求列表、移动端角色切换、原型预览和开发说明并列展示",
      hook: "每做一次需求，留下下一次能用的东西。",
      intro: "把日常需求拆成可复用的小能力，让工具包随着真实需求慢慢长出来。",
      story: [
        ["起点", "出需求时，原型、角色、权限和开发说明经常需要一起讲清楚。我从这段日常工作流程开始拆解。"],
        ["做法", "逐步沉淀角色切换、权限切换和必要的开发说明格式，把原型与规则放到同一处阅读。"],
        ["留下什么", "不急着一次做全。随着需求补齐原子级能力，并积累后续可以复用的业务梳理文档与素材。"],
      ],
    },
  ];

  // 小工具只创建文字节点，不把资料拼成可执行网页，便于后续安全替换文案。
  function textElement(tag, className, text) {
    const element = document.createElement(tag);
    if (className) element.className = className;
    if (text) element.textContent = translate(text);
    return element;
  }
  function externalLink(url, label, className) {
    const link = textElement("a", className, label);
    link.href = url;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.setAttribute("aria-label", `${translate(label)} (${translate("Opens in a new tab")})`);
    return link;
  }
  function buildProjects() {
    const grid = textElement("div", "project-grid");
    projects.forEach((project, index) => {
      const card = textElement("article", "project-card");
      card.append(textElement("p", "project-index", `0${index + 1} / ${translate(project.kind)}`));
      const imageLink = externalLink(project.image, "", "project-image-link");
      imageLink.setAttribute("aria-label", `${translate("View full screenshot")} — ${project.name} (${translate("Opens in a new tab")})`);
      const image = document.createElement("img");
      image.src = project.image;
      image.alt = translate(project.alt);
      image.loading = "lazy";
      image.width = project.name === "CozyListen" ? 1280 : 1850;
      image.height = project.name === "CozyListen" ? 800 : 946;
      imageLink.append(image, textElement("span", "image-caption", "查看完整截图 ↗"));
      card.append(imageLink, textElement("h3", "project-name", project.name), textElement("p", "project-hook", project.hook), textElement("p", "project-intro", project.intro));
      // 作品篇幅不长，直接展示故事；首页与桌面复用同一份内容和排版。
      const story = textElement("div", "project-story");
      project.story.forEach(([label, paragraph]) => {
        const part = textElement("div", "story-part");
        part.append(textElement("h4", "", label), textElement("p", "", paragraph));
        story.append(part);
      });
      card.append(story);
      if (project.url) card.append(externalLink(project.url, `${project.action} ↗`, "text-action"));
      else card.append(textElement("span", "project-note", "从需求里，一点点积累。"));
      grid.append(card);
    });
    return grid;
  }
  const homeWorks = buildProjects();
  homeWorks.id = "home-works";
  document.querySelector("#home-works").replaceWith(homeWorks);

  // 工作只保留行业、岗位与真实做法，去掉公司、客户和内部业务数据。
  const categories = {
    education: { index: "01 / EDUCATION", title: "教育经历", kicker: "Signals, then possibilities.", description: "从电路与系统出发，走向产品与交互。", facts: [{ place: "深圳 / 2021.09 — 2025.06", title: "深圳大学", text: "电子信息工程 · 本科" }], background: ["GPA 3.98 / 4.50 · 专业前 10%", "全英创新实验班 · 连续三年获奖学金", "学习计算机视觉、机器学习与大数据分析。"] },
    work: { index: "02 / EXPERIENCE", title: "工作经历", kicker: "Work, in context.", description: "把 AI 接进流程，让真实问题有下一步。", experience: [
      { role: "AI 产品经理", context: "企业软件", date: "2025.03 — 至今", hook: "让一次接待，留下可以继续跟进的线索。", text: "参与搭建 AI 客户管理流程，将线下接待转化为可记录、可分析的信息。", details: [["把信息接起来", "从接待录音、客户关联，到标签提取与分析，梳理自动化流程，减少信息遗漏与重复整理。"], ["重新看见意向", "结合对话原文、到访行为与人工判断，识别可能被低估的客户意向，为后续跟进提供线索。"]] },
      { role: "AI 产品实习", context: "泛健康", date: "2025.01 — 2025.04", hook: "让对话，接得住下一个问题。", text: "设计健康问答中的动态问题推荐模块，结合用户对话与商业化场景，组织后续提问入口。" },
      { role: "软件产品实习", context: "智能硬件", date: "2024.07 — 2024.12", hook: "让复杂操作，更容易上手。", text: "围绕激光加工中的批量操作，设计计算机视觉辅助功能，降低操作与学习成本。", details: [["为下一次使用积累数据", "梳理数据从生产、组织、标注到应用的闭环，让分散的加工数据成为可以持续使用的资产。"]] },
    ] },
    works: { index: "03 / SELECTED WORKS", title: "个人作品", kicker: "Small ideas. Made tangible.", description: "从自己的需要，到别人也用得上的小工具。", projects: true },
    hobbies: { index: "04 / OFF THE CLOCK", title: "爱好", kicker: "Frames. Pages. Play.", description: "换一种方式，感受日常。", interests: [{ title: "摄影", text: "留意光，也留意平常。" }, { title: "足球", text: "把注意力交给下一脚。" }, { title: "篮球", text: "在传球与投篮之间。" }, { title: "看书", text: "借一双眼睛，看远一点。" }, { title: "音乐", text: "给日常换个节奏。" }] },
  };
  function buildCategoryContent(category) {
    const content = document.createElement("div");
    if (category.facts) {
      content.className = "profile-facts";
      category.facts.forEach(fact => {
        const place = document.createElement("span");
        place.className = "fact-place";
        place.textContent = translate(fact.place);
        const title = document.createElement("h3");
        title.textContent = translate(fact.title);
        const description = document.createElement("p");
        description.textContent = translate(fact.text);
        content.append(place, title, description);
      });
      if (category.background) {
        const more = textElement("div", "background-details");
        category.background.forEach(line => more.append(textElement("p", "", line)));
        content.append(more);
      }
    } else if (category.experience) {
      content.className = "experience-list";
      category.experience.forEach(job => {
        const article = textElement("article", "experience-card");
        article.append(textElement("p", "experience-meta", `${translate(job.context)} / ${translate(job.date)}`), textElement("h3", "", job.role), textElement("p", "experience-hook", job.hook), textElement("p", "experience-copy", job.text));
        if (job.details) {
          const more = textElement("div", "background-details");
          job.details.forEach(([label, paragraph]) => {
            more.append(textElement("h4", "", label), textElement("p", "", paragraph));
          });
          article.append(more);
        }
        content.append(article);
      });
    } else if (category.projects) {
      content.append(buildProjects());
    } else if (category.interests) {
      content.className = "profile-facts";
      const list = document.createElement("ul");
      list.className = "interest-list";
      category.interests.forEach(interest => {
        const item = document.createElement("li");
        const title = document.createElement("strong");
        title.textContent = translate(interest.title);
        const description = document.createElement("span");
        description.textContent = translate(interest.text);
        item.append(title, description);
        list.append(item);
      });
      content.append(list);
      // 爱好中的入口回到首页游戏；内容已在桌面直接展开，不再经过弹窗。
      const galleryLink = document.createElement("button");
      galleryLink.type = "button";
      galleryLink.className = "photo-gallery-link";
      galleryLink.textContent = translate("Visit the playground") + " ↗";
      galleryLink.addEventListener("click", () => {
        galleryRequested = true;
        leaveDesk();
      });
      content.append(galleryLink);
    } else {
      content.className = "content-empty";
      const heading = document.createElement("p");
      heading.textContent = translate(category.empty);
      const note = document.createElement("span");
      note.textContent = translate("Still putting this together. See you soon.");
      content.append(heading, note);
    }
    return content;
  }
  // 第二屏像一页展开的履历：四部分一次呈现，原来的插画作为页内目录。
  const deskContents = textElement("div", "desk-contents");
  document.querySelector(".desk-surface").after(deskContents);
  document.querySelectorAll("[data-category]").forEach(button => {
    const key = button.dataset.category, category = categories[key];
    const section = textElement("section", "desk-section");
    section.id = `desk-${key}`;
    const title = textElement("h2", "desk-section-title", category.title);
    title.id = `desk-${key}-title`; title.tabIndex = -1;
    section.setAttribute("aria-labelledby", title.id);
    section.append(textElement("p", "eyebrow", category.index), title,
      textElement("p", "detail-kicker", category.kicker),
      textElement("p", "detail-description", category.description), buildCategoryContent(category));
    deskContents.append(section);
    button.removeAttribute("aria-haspopup"); button.setAttribute("aria-controls", section.id);
    button.addEventListener("click", () => {
      section.scrollIntoView({ behavior: reducedMotion.matches ? "instant" : "smooth", block: "start" });
      title.focus({ preventScroll: true });
    });
  });

  // 入口遵循键盘标签页规则：方向键切换，Home / End 跳到首尾。
  const tabs = [...document.querySelectorAll(".doorway")];
  function selectTab(selected) {
    tabs.forEach(tab => {
      const active = tab === selected;
      tab.classList.toggle("active", active);
      tab.setAttribute("aria-selected", String(active));
      tab.tabIndex = active ? 0 : -1;
      document.getElementById(tab.getAttribute("aria-controls")).hidden = !active;
    });
    buildThoughtWords();
  }
  tabs.forEach((tab, index) => {
    tab.addEventListener("click", () => selectTab(tab));
    tab.addEventListener("keydown", event => {
      let next;
      if (event.key === "ArrowRight") next = (index + 1) % tabs.length;
      if (event.key === "ArrowLeft") next = (index + tabs.length - 1) % tabs.length;
      if (event.key === "Home") next = 0;
      if (event.key === "End") next = tabs.length - 1;
      if (next === undefined) return;
      event.preventDefault();
      selectTab(tabs[next]);
      tabs[next].focus();
    });
  });

  // 两页共用语言选择，详情中也能切换；不重建阅读页，保留展开状态与焦点。
  document.querySelectorAll(".language-toggle").forEach(button => {
    button.addEventListener("click", () => window.siteLanguage.toggle());
  });
  window.addEventListener("languagechange", () => {
    endDrag(null, true);
    clearPreview();
    message = lensLine.textContent;
    readingStatus.textContent = revealed ? message : "";
    thoughtCards.forEach(card => {
      card.message = card.lens.textContent;
      card.button.firstChild.textContent = translate(card.revealed ? "Hide" : "Read");
      card.status.textContent = card.revealed ? card.message : "";
    });
    buildWords();
  });

  buildWords();
  document.fonts.ready.then(buildWords);
  if (location.hash === "#desk") changeScene(true);
})();
