/* 用途：把 meme 或访客照片转成打字机文字画。图片采样、摄像头和导出都在浏览器本地完成。
 * 参考 references/typewriter/sketch2596064：9 像素字、4 像素行距，同一行可多次套打。
 * 原作使用书籍的固定指令；本站把照片转成同样的“重复字符 + 空格 + 套打行”再绘制。
 * 网站独立使用浏览器画布，不需要加载参考稿的 p5.js 或 OPC；打字过程是本站增加的交互。
 */
(() => {
  "use strict";
  const root = document.querySelector("#typewriter");
  const revealed = () => !root.dataset.curtain || root.dataset.curtain === "open";
  const paper = root.querySelector(".typewriter-paper");
  const canvas = document.querySelector("#typewriter-canvas");
  const ctx = canvas.getContext("2d");
  const translate = window.siteLanguage.translate;
  const status = document.querySelector("#typewriter-status");
  const progress = document.querySelector("#typewriter-progress");
  const density = document.querySelector("#typewriter-density");
  const inkButton = document.querySelector("#typewriter-ink");
  const originalButton = document.querySelector("#typewriter-original");
  const replayButton = document.querySelector("#typewriter-replay");
  const saveButton = document.querySelector("#typewriter-save");
  const fileInput = document.querySelector("#typewriter-file");
  const dialog = document.querySelector("#typewriter-camera-dialog");
  const video = document.querySelector("#typewriter-video");
  const cameraStatus = document.querySelector("#camera-status");
  const captureButton = document.querySelector("#camera-capture");
  const retryButton = document.querySelector("#camera-retry");
  const placeholder = document.querySelector("#camera-placeholder");
  const challenge = document.querySelector("#meme-challenge");
  const studio = document.querySelector("#typewriter-studio");
  const answers = document.querySelector("#meme-answers");
  const verify = document.querySelector("#meme-verify");
  const feedback = document.querySelector("#captcha-feedback");
  const roundLabel = document.querySelector("#captcha-round");
  // 第二件作品与高尔夫独立，刷新后即可直接体验；三题只控制它自己的自拍创作区。
  let solved = false, answer = -1;
  // 一组题目像三张洗过的卡片：每张只出现一次，全部答对才开放自由创作。
  let roundOrder = [], roundIndex = 0, roundCorrect = false;
  let nextRoundTimer = 0;
  let feedbackKey = "A little recognition. No traffic lights.";
  const reduced = matchMedia("(prefers-reduced-motion: reduce)");
  const mobileLayout = matchMedia("(max-width: 650px)");
  const paperColour = "#f5f1e7";
  let W = mobileLayout.matches ? 990 : 1440, H = mobileLayout.matches ? 1140 : 990;
  let detailChosen = false;
  canvas.width = W; canvas.height = H;
  paper.style.aspectRatio = `${W} / ${H}`;
  density.value = mobileLayout.matches ? "80" : "120";
  let source = null, selected = 0, colourInk = false, showOriginal = false;
  let cells = [], rules = [], fit = null, fontSize = 12, rowHeight = 15, columns = 120;
  let raf = 0, cursor = 0, lastTime = 0, visible = false;
  let loadId = 0, stream = null, cameraId = 0, densityTimer = 0;
  let statusKey = "Loading a little character.", cameraKey = "Waiting for camera permission.";
  let sourceKey = "No birds?";
  // 三份素材的来源保存在 assets/typewriter-meme-sources.md，按钮不冒称原创 meme。
  const memes = [
    { src: "assets/bird-meme.jpg", name: "No birds?" },
    { src: "assets/meme-harold.jpg", name: "All good." },
    { src: "assets/meme-cat.jpg", name: "Side-eye." },
  ];
  const clamp = (n, a, b) => Math.min(b, Math.max(a, n));
  function say(key) { statusKey = key; status.textContent = translate(key); }
  function cameraSay(key) { cameraKey = key; cameraStatus.textContent = translate(key); }
  function labels() {
    status.textContent = translate(statusKey); cameraStatus.textContent = translate(cameraKey);
    // 猜图时不在辅助说明里泄露答案；可听取线索，三个选项仍有清晰名称。
    const hints = ["A bird has opinions about a sign.", "A smile is doing a lot of work.", "A cat has a second opinion."];
    canvas.setAttribute("aria-label", solved ? `${translate("Typewriter portrait")}: ${translate(sourceKey)}` : `${translate("Find the original meme.")} ${translate(hints[selected])}`);
    feedback.textContent = translate(feedbackKey);
    roundLabel.textContent = `${translate("Human check")} · ${roundIndex + 1} / ${memes.length}`;
    root.dataset.round = String(roundIndex + 1);
    root.dataset.completed = String(solved ? memes.length : roundIndex + Number(roundCorrect));
    verify.firstChild.textContent = `${translate(solved ? "All clear" : roundCorrect ? "Got it" : "That’s the one")} `;
    inkButton.setAttribute("aria-pressed", String(colourInk));
    originalButton.setAttribute("aria-pressed", String(showOriginal));
    root.querySelectorAll("[data-meme]").forEach(button => button.setAttribute("aria-pressed", String(Number(button.dataset.meme) === selected)));
  }
  // 用洗牌安排选项位置，答案不会永远在同一个按钮；错选只轻轻提示，不换题。
  function shuffle(items) {
    const result = [...items];
    for (let i = result.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1)); [result[i], result[j]] = [result[j], result[i]];
    }
    return result;
  }
  function newTest() {
    clearTimeout(nextRoundTimer); nextRoundTimer = 0;
    closeCamera(); solved = false; colourInk = false;
    roundOrder = shuffle(memes.map((_, index) => index)); roundIndex = 0;
    startRound();
  }
  function startRound() {
    answer = -1; roundCorrect = false;
    challenge.hidden = false; studio.hidden = true; verify.disabled = true;
    root.dataset.test = "guessing"; feedbackKey = "A little recognition. No traffic lights.";
    answers.replaceChildren();
    shuffle([0, 1, 2]).forEach(index => {
      const button = document.createElement("button"); button.type = "button";
      button.dataset.answer = index; button.setAttribute("aria-pressed", "false");
      const image = document.createElement("img"); image.src = memes[index].src; image.alt = translate(memes[index].name);
      image.draggable = false;
      const caption = document.createElement("span"); caption.textContent = translate(memes[index].name);
      button.append(image, caption);
      button.addEventListener("click", () => {
        if (solved || roundCorrect) return;
        answer = index;
        answers.querySelectorAll("button").forEach(option => option.setAttribute("aria-pressed", String(option === button)));
        feedbackKey = "Ready when you are."; feedback.textContent = translate(feedbackKey);
        verify.disabled = !source || canvas.dataset.phase !== "ready";
      });
      answers.append(button);
    });
    selectMeme(roundOrder[roundIndex]);
  }
  verify.addEventListener("click", () => {
    if (solved || roundCorrect || !source || canvas.dataset.phase !== "ready" || answer < 0) return;
    // 认错也算一次认真观察；体验印记不把访客的成绩分成高低。
    window.sitePlay.mark("typewriter");
    if (answer !== selected) {
      feedbackKey = "A very human mistake. Look again."; root.dataset.test = "retry";
      feedback.textContent = translate(feedbackKey); return;
    }
    roundCorrect = true;
    answers.querySelectorAll("button").forEach(button => { button.disabled = true; });
    if (roundIndex < roundOrder.length - 1) {
      root.dataset.test = "round-correct";
      feedbackKey = "A familiar face. On to the next.";
      verify.disabled = true; labels();
      // 先让访客看见答对反馈，再自动翻题；锁住重复确认，避免连点跳过题目。
      nextRoundTimer = setTimeout(() => {
        nextRoundTimer = 0; roundIndex++; startRound();
        if (!document.hidden && location.hash !== "#desk") {
          root.scrollIntoView({ behavior: reduced.matches ? "instant" : "smooth", block: "start" });
          document.querySelector("#typewriter-title").focus({ preventScroll: true });
        }
      }, reduced.matches ? 0 : 650);
      return;
    }
    solved = true; root.dataset.test = "verified";
    feedbackKey = "Three for three. Now make it yours.";
    feedback.textContent = translate(feedbackKey); verify.disabled = true;
    studio.hidden = false; labels();
    // 最后一题完成后，把新开放的拍照和上传入口带到视野里。
    studio.scrollIntoView({ behavior: reduced.matches ? "instant" : "smooth", block: "nearest" });
    document.querySelector("#typewriter-camera").focus({ preventScroll: true });
  });
  document.querySelector("#meme-new-test").addEventListener("click", () => {
    newTest(); root.scrollIntoView({ behavior: reduced.matches ? "instant" : "smooth", block: "start" });
    document.querySelector("#typewriter-title").focus({ preventScroll: true });
  });
  function blank() {
    ctx.fillStyle = paperColour; ctx.fillRect(0, 0, W, H);
  }
  function stopType() { cancelAnimationFrame(raf); raf = 0; }
  function letter(cell) {
    if (cell.char === " ") return;
    ctx.fillStyle = colourInk ? cell.colour : "#34372d";
    // 固定的小偏差模拟墨迹，不每帧随机，避免文字闪烁。
    ctx.fillText(cell.char, cell.x + cell.jitter, cell.y);
  }
  function prepareInk() {
    ctx.font = `${fontSize}px monospace`;
    ctx.textBaseline = "middle"; ctx.textAlign = "center";
  }
  function finish() {
    paper.setAttribute("aria-busy", "false"); progress.textContent = "";
    canvas.dataset.phase = showOriginal ? "original" : "ready";
    replayButton.disabled = !source; saveButton.disabled = !source;
    verify.disabled = solved || roundCorrect || answer < 0 || !source;
    say("A little ink. A lot of character."); labels();
  }
  function paintFull() {
    stopType(); blank();
    if (!source || !fit) return;
    if (showOriginal) ctx.drawImage(source, fit.x, fit.y, fit.w, fit.h);
    else { prepareInk(); cells.forEach(letter); }
    cursor = cells.length; finish();
  }
  function frame(now) {
    raf = 0;
    // 每秒打约半幅画，字符逐个出现；一次动画两秒左右，不循环消耗电量。
    const next = Math.min(cells.length, cursor + Math.max(1, Math.floor(Math.min(now - lastTime, 50) * cells.length / 1800)));
    lastTime = now; prepareInk();
    for (let i = cursor; i < next; i++) letter(cells[i]);
    cursor = next;
    progress.textContent = `${Math.round(cursor / cells.length * 100)}%`;
    if (cursor === cells.length) return finish();
    if (visible && !document.hidden && revealed()) raf = requestAnimationFrame(frame);
  }
  function startType() {
    if (!source) return;
    stopType(); blank(); cursor = 0;
    paper.setAttribute("aria-busy", "true"); canvas.dataset.phase = "typing";
    verify.disabled = true;
    replayButton.disabled = true; saveButton.disabled = true;
    say("Typing a little character...");
    if (showOriginal || reduced.matches) return paintFull();
    resumeType();
  }
  // 滚出画面只暂停，回来从原字符继续；不再把“等待播放”当成一次新打字，避免清空成品。
  function resumeType() {
    if (!raf && visible && !document.hidden && revealed() && source && cursor < cells.length && !showOriginal && !reduced.matches) {
      lastTime = performance.now(); raf = requestAnimationFrame(frame);
    }
  }
  // 将一行压成原作形式：例如“@@  :”变成“2@ 2sp 1:”。相同编号的 a 行在原位套打。
  function encodeRow(characters) {
    const tokens = [];
    for (let start = 0; start < characters.length;) {
      let end = start + 1;
      while (end < characters.length && characters[end] === characters[start]) end++;
      tokens.push(`${end - start}${characters[start] === " " ? "sp" : characters[start]}`);
      start = end;
    }
    return tokens.join(" ");
  }
  function decodeRow(instruction) {
    return instruction.split(" ").map(token => {
      const match = token.match(/^(\d+)(.+)$/);
      return match ? (match[2] === "sp" ? " " : match[2]).repeat(Number(match[1])) : "";
    }).join("");
  }
  function build() {
    if (!source || !ctx) return;
    columns = Number(density.value);
    const sw = source.naturalWidth || source.width, sh = source.naturalHeight || source.height;
    const scale = Math.min((mobileLayout.matches ? 830 : 1080) / sw, (mobileLayout.matches ? 960 : 780) / sh);
    fit = { w: sw * scale, h: sh * scale };
    fit.x = (W - fit.w) / 2; fit.y = (H - fit.h) / 2;
    const cellWidth = fit.w / columns;
    // 核心风格来自原稿的 4/9 行距：字行紧密相交，像打字机在纸上叠墨。
    fontSize = cellWidth / .60; rowHeight = fontSize * 4 / 9;
    const rows = Math.max(1, Math.round(fit.h / rowHeight));
    rowHeight = fit.h / rows;
    const sampler = document.createElement("canvas"); sampler.width = columns; sampler.height = rows;
    const sampleCtx = sampler.getContext("2d", { willReadFrequently: true });
    // 透明照片先垫白纸；字格采样保留原图比例，不把脸挤扁。
    sampleCtx.fillStyle = "#fff"; sampleCtx.fillRect(0, 0, columns, rows);
    sampleCtx.drawImage(source, 0, 0, columns, rows);
    const pixels = sampleCtx.getImageData(0, 0, columns, rows).data;
    const levels = [];
    for (let i = 0; i < pixels.length; i += 4) levels.push(.2126 * pixels[i] + .7152 * pixels[i + 1] + .0722 * pixels[i + 2]);
    const sorted = [...levels].sort((a, b) => a - b);
    const low = sorted[Math.floor(sorted.length * .02)], high = sorted[Math.floor(sorted.length * .98)];
    // 从稀到密的字符相当于一组深浅不同的印章；自动拉开照片明暗，提高辨识度。
    const alphabet = "   .:'+:S@";
    const samples = levels.map((level, i) => {
      const offset = i * 4, x = i % columns, y = Math.floor(i / columns);
      const normalized = high - low > 12 ? clamp((level - low) / (high - low), 0, 1) : level / 255;
      const dark = Math.pow(1 - normalized, 1.10);
      const tint = channel => Math.round(pixels[offset + channel] * .62 + 25);
      return { char: alphabet[Math.min(alphabet.length - 1, Math.round(dark * (alphabet.length - 1)))], dark,
        x: fit.x + (x + .5) * cellWidth, y: fit.y + (y + .5) * rowHeight,
        jitter: (((x * 17 + y * 29) % 7) - 3) * fontSize * .013,
        colour: `rgb(${tint(0)},${tint(1)},${tint(2)})` };
    });
    cells = []; rules = [];
    for (let row = 0; row < rows; row++) {
      const rowSamples = samples.slice(row * columns, (row + 1) * columns);
      const base = rowSamples.map(cell => cell.char);
      // 深处再套一层 & / X；亮处保留空格，让白纸透出来，而不是统一加粗。
      const overprint = rowSamples.map(cell => cell.dark > .72 ? "&" : cell.dark > .56 ? "X" : " ");
      [[String(row + 1), base], [`${row + 1}a`, overprint]].forEach(([label, letters]) => {
        const instruction = encodeRow(letters); rules.push([label, instruction]);
        [...decodeRow(instruction)].forEach((char, column) => {
          if (char !== " ") cells.push({ ...rowSamples[column], char });
        });
      });
    }
    canvas.dataset.columns = columns; canvas.dataset.rows = rows;
    canvas.dataset.lineRatio = "4/9"; canvas.dataset.rules = rules.length;
    canvas.dataset.source = selected >= 0 ? String(selected) : "photo";
    startType(); labels();
  }
  async function selectMeme(index) {
    const id = ++loadId; selected = index; sourceKey = memes[index].name; showOriginal = false;
    stopType(); source = null; cells = []; cursor = 0;
    canvas.dataset.phase = "loading";
    verify.disabled = true;
    blank(); say("Loading a little character."); labels();
    replayButton.disabled = true; saveButton.disabled = true; paper.setAttribute("aria-busy", "true");
    const image = new Image(); image.src = memes[index].src;
    try { await image.decode(); if (id !== loadId) return; source = image; build(); }
    catch { if (id !== loadId) return; paper.setAttribute("aria-busy", "false"); canvas.dataset.phase = "error"; say("This picture could not load. Try another, or use your own."); }
  }
  function acceptPhoto(image) {
    challenge.hidden = true;
    source = image; selected = -1; sourceKey = "Your photo"; showOriginal = false; build();
  }
  async function readPhoto(file) {
    if (!solved || !file) return;
    const previous = source, previousSelected = selected, previousKey = sourceKey;
    const id = ++loadId;
    if (!file.type.startsWith("image/")) { say("Please choose an image file."); return; }
    if (file.size > 25 * 1024 * 1024) { say("Please choose a photo under 25 MB."); return; }
    stopType(); canvas.dataset.phase = "loading";
    replayButton.disabled = true; saveButton.disabled = true;
    say("Reading your photo...");
    const url = URL.createObjectURL(file), image = new Image(); image.src = url;
    try {
      await image.decode(); if (id !== loadId) return;
      // 大照片先缩到最多 1600 像素，像缩印后再打字，节省手机内存。
      const sized = document.createElement("canvas"), scale = Math.min(1, 1600 / Math.max(image.naturalWidth, image.naturalHeight));
      sized.width = Math.max(1, Math.round(image.naturalWidth * scale)); sized.height = Math.max(1, Math.round(image.naturalHeight * scale));
      sized.getContext("2d").drawImage(image, 0, 0, sized.width, sized.height); acceptPhoto(sized);
    } catch {
      if (id !== loadId) return;
      source = previous; selected = previousSelected; sourceKey = previousKey;
      if (source) paintFull(); else canvas.dataset.phase = "error";
      say("This photo could not be read. Try a JPG, PNG or WebP."); labels();
    } finally { URL.revokeObjectURL(url); }
  }
  function stopCamera() {
    // 请求仍在等待时也作废；迟到的摄像头授权会立刻关闭，不在后台偷偷继续拍。
    cameraId++; if (stream) stream.getTracks().forEach(track => track.stop());
    stream = null; video.pause(); video.srcObject = null; captureButton.disabled = true; placeholder.hidden = false;
  }
  function closeCamera() { stopCamera(); if (dialog.open) dialog.close(); }
  async function openCamera() {
    if (!solved) return;
    stopCamera(); const id = cameraId;
    if (!dialog.open) dialog.showModal(); retryButton.hidden = true;
    cameraSay("Waiting for camera permission.");
    if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
      cameraSay("Camera needs HTTPS or localhost. You can still use a photo."); retryButton.hidden = false; return;
    }
    let next;
    try {
      next = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user", width: { ideal: 1280 }, height: { ideal: 960 } }, audio: false });
      if (id !== cameraId || !dialog.open || document.hidden) { next.getTracks().forEach(track => track.stop()); return; }
      stream = next; video.srcObject = stream; await video.play();
      if (id !== cameraId) return;
      stream.getVideoTracks().forEach(track => track.addEventListener("ended", () => {
        if (id !== cameraId || !dialog.open) return;
        stopCamera(); retryButton.hidden = false;
        cameraSay("Camera is unavailable. Close other camera apps, or use a photo.");
      }));
      placeholder.hidden = true; captureButton.disabled = video.readyState < 2;
      cameraSay("One moment. One portrait.");
    } catch (error) {
      if (next) next.getTracks().forEach(track => track.stop());
      if (id !== cameraId) return;
      stopCamera(); retryButton.hidden = false;
      const message = error.name === "NotAllowedError" || error.name === "SecurityError"
        ? "Camera permission was not granted. You can still use a photo."
        : error.name === "NotFoundError" ? "No camera found. You can still use a photo."
        : "Camera is unavailable. Close other camera apps, or use a photo.";
      cameraSay(message);
    }
  }
  function takePhoto() {
    if (!stream || video.readyState < 2 || !video.videoWidth) return;
    ++loadId;
    const photo = document.createElement("canvas"), scale = Math.min(1, 1600 / Math.max(video.videoWidth, video.videoHeight));
    photo.width = Math.round(video.videoWidth * scale); photo.height = Math.round(video.videoHeight * scale);
    // 自拍预览像镜子，成片保持相同朝向。
    const photoCtx = photo.getContext("2d"); photoCtx.translate(photo.width, 0); photoCtx.scale(-1, 1);
    photoCtx.drawImage(video, 0, 0, photo.width, photo.height);
    closeCamera(); acceptPhoto(photo); canvas.scrollIntoView({ block: "center", behavior: reduced.matches ? "instant" : "smooth" });
  }
  function savePrint() {
    if (!source) return;
    // 无论是否查看原片，都只导出完整文字画；保留访客的当前查看方式。
    const original = showOriginal; showOriginal = false; paintFull();
    canvas.toBlob(blob => {
      if (!blob) { say("The print could not be saved. Please try again."); return; }
      const url = URL.createObjectURL(blob), link = document.createElement("a");
      link.href = url; link.download = "koralaam-typewriter-art.png"; link.click();
      setTimeout(() => URL.revokeObjectURL(url), 10000);
    }, "image/png");
    showOriginal = original; if (original) paintFull(); labels();
  }
  root.querySelectorAll("[data-meme]").forEach(button => button.addEventListener("click", () => {
    if (!solved) return;
    // 自由创作时关闭已完成题目的选项，避免下一张画与旧答案混在一起。
    challenge.hidden = true; selectMeme(Number(button.dataset.meme));
  }));
  density.addEventListener("input", () => { detailChosen = true; clearTimeout(densityTimer); densityTimer = setTimeout(build, 100); });
  // 手机换成窄一点的纸、少一点的字符；像大字版画册，避免密字缩小后糊成横纹。
  mobileLayout.addEventListener("change", () => {
    stopType(); W = mobileLayout.matches ? 990 : 1440; H = mobileLayout.matches ? 1140 : 990;
    canvas.width = W; canvas.height = H; paper.style.aspectRatio = `${W} / ${H}`;
    if (!detailChosen) density.value = mobileLayout.matches ? "80" : "120";
    if (source) build(); else blank();
  });
  inkButton.addEventListener("click", () => { colourInk = !colourInk; labels(); if (source) paintFull(); });
  originalButton.addEventListener("click", () => { if (!source) return; showOriginal = !showOriginal; paintFull(); labels(); });
  replayButton.addEventListener("click", () => { showOriginal = false; startType(); labels(); });
  saveButton.addEventListener("click", savePrint);
  const choosePhoto = () => { if (!solved) return; closeCamera(); fileInput.click(); };
  document.querySelector("#typewriter-upload").addEventListener("click", choosePhoto);
  document.querySelector("#camera-photo").addEventListener("click", choosePhoto);
  fileInput.addEventListener("change", () => { readPhoto(fileInput.files[0]); fileInput.value = ""; });
  document.querySelector("#typewriter-camera").addEventListener("click", openCamera);
  retryButton.addEventListener("click", openCamera);
  captureButton.addEventListener("click", takePhoto);
  document.querySelector("#camera-close").addEventListener("click", closeCamera);
  video.addEventListener("loadeddata", () => { if (dialog.open && stream) captureButton.disabled = false; });
  video.addEventListener("error", () => { if (dialog.open && stream) { stopCamera(); retryButton.hidden = false; cameraSay("Camera is unavailable. Close other camera apps, or use a photo."); } });
  dialog.addEventListener("cancel", closeCamera); dialog.addEventListener("close", stopCamera);
  dialog.addEventListener("click", event => {
    const r = dialog.getBoundingClientRect();
    if (event.target === dialog && (event.clientX < r.left || event.clientX > r.right || event.clientY < r.top || event.clientY > r.bottom)) closeCamera();
  });
  new IntersectionObserver(entries => {
    visible = entries[0].isIntersecting;
    if (!visible) stopType();
    else resumeType();
  }).observe(canvas);
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) { closeCamera(); stopType(); }
    else resumeType();
  });
  window.addEventListener("pagehide", () => { closeCamera(); stopType(); });
  window.addEventListener("hashchange", () => { if (location.hash === "#desk") closeCamera(); });
  window.addEventListener("languagechange", labels);
  reduced.addEventListener("change", () => { if (source && reduced.matches) paintFull(); });
  if (!ctx) { say("Your browser needs Canvas to display this artwork."); return; }
  // 揭开本作品才抽题、载图；与球场无依赖，摄像头仍须另行主动开启。
  blank();
  if (revealed()) newTest();
  else root.addEventListener("experimentreveal", newTest, { once: true });
})();
