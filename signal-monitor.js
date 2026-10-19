/* 用途：通信显示器。点一句预设文字，自动敲入，再经历编码、噪声、恢复和本地预写回复。
 * 编码像把信折成小格：UTF-8 负责文字转字节，三份重复码负责投票，CRC-16 负责核对。
 * 所有内容都在浏览器运行；没有 AI、服务器、声音或访客文字上传。
 */
(() => {
  "use strict";
  const root = document.querySelector(".signal-monitor");
  if (!root) return;
  const screen = root.querySelector(".monitor-screen");
  const canvas = root.querySelector("#signal-canvas"), context = canvas.getContext("2d");
  const revealed = () => !root.dataset.curtain || root.dataset.curtain === "open";
  const typed = root.querySelector("#signal-typed"), received = root.querySelector("#signal-received");
  const reply = root.querySelector("#signal-reply"), status = root.querySelector("#signal-state");
  const noise = root.querySelector("#signal-noise"), recovery = root.querySelector("#signal-recovery");
  const noiseValue = root.querySelector("#signal-noise-value"), replay = root.querySelector("#signal-replay");
  const wire = root.querySelector("#signal-wire"), report = root.querySelector("#signal-report");
  const note = root.querySelector("#signal-control-note"), announcement = root.querySelector("#signal-announcement");
  const choices = [...root.querySelectorAll("[data-prompt]")];
  const steps = [...root.querySelectorAll("[data-step]")];
  const loupeLabel = root.querySelector("#signal-loupe-label");
  const loupeExample = root.querySelector("#signal-loupe-example");
  const loupeNote = root.querySelector("#signal-loupe-note");
  const letterPicker = root.querySelector("#signal-letter-picker");
  const binaryKey = root.querySelector("#signal-binary-key");
  const protection = root.querySelector("#signal-loupe-protection");
  const reduced = matchMedia("(prefers-reduced-motion: reduce)");
  const translate = window.siteLanguage.translate;
  const prompts = {
    presence: { text: "Are you there?", reply: "I'm here. Take your time." },
    kindness: { text: "Tell me something kind.", reply: "You don't have to be useful every minute." },
    loss: { text: "What got lost?", reply: "The signal made it. The meaning is still yours." },
    surprise: { text: "Surprise me.", reply: "Somewhere, a cat just walked across a keyboard." },
  };
  const phaseKeys = ["typing", "encoding", "transmitting", "decoding", "replying"];
  const statusKeys = { idle: "Standing by.", typing: "A thought taking shape.", encoding: "Folding words into bits.",
    transmitting: "A little interference.", decoding: "Listening through the noise.", replying: "Someone at the other end.",
    complete: "Message received.", failed: "Lost in transit." };
  const encoder = new TextEncoder(), decoder = new TextDecoder();
  let selected = "", run = null, elapsed = 0, frameId = 0, previousTime = 0, visible = false;
  let width = 1, height = 1, currentPhase = "idle", inspecting = false;
  const clamp = (value, low, high) => Math.max(low, Math.min(high, value));

  // 校验码像信封里的一枚封印；接收方只根据收到的内容核对，不偷看发送端原句来纠错。
  function checksum(bytes) {
    let crc = 0xffff;
    for (const byte of bytes) {
      crc ^= byte << 8;
      for (let bit = 0; bit < 8; bit++) crc = crc & 0x8000 ? (crc << 1 ^ 0x1021) & 0xffff : crc << 1 & 0xffff;
    }
    return crc;
  }
  function toBits(bytes) { return [...bytes].flatMap(byte => Array.from({ length: 8 }, (_, index) => byte >> (7 - index) & 1)); }
  function toBytes(bits) {
    return Uint8Array.from({ length: bits.length / 8 }, (_, index) => bits.slice(index * 8, index * 8 + 8).reduce((byte, bit) => byte * 2 + bit, 0));
  }
  function packetFor(text, probability, recover) {
    const bytes = encoder.encode(text), seal = checksum(bytes);
    const payload = toBits([...bytes, seal >> 8, seal & 255]);
    const outgoing = recover ? payload.flatMap(bit => [bit, bit, bit]) : [...payload];
    // 同一句话复用同一串抽签结果，便于比较不同噪声强度；重复发送不是抽奖游戏。
    let seed = 317;
    for (const byte of bytes) seed = (Math.imul(seed, 31) + byte) >>> 0;
    const incoming = outgoing.map(bit => {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      return seed / 4294967296 < probability ? 1 - bit : bit;
    });
    const decoded = [], raw = [];
    let disagreements = 0;
    for (let index = 0; index < incoming.length; index += recover ? 3 : 1) {
      raw.push(incoming[index]);
      if (recover) {
        const votes = incoming.slice(index, index + 3), ones = votes.reduce((sum, bit) => sum + bit, 0);
        decoded.push(Number(ones >= 2));
        if (ones > 0 && ones < 3) disagreements++;
      } else decoded.push(incoming[index]);
    }
    const restored = toBytes(decoded), message = restored.slice(0, -2);
    const valid = checksum(message) === (restored.at(-2) << 8 | restored.at(-1));
    const flips = incoming.reduce((sum, bit, index) => sum + Number(bit !== outgoing[index]), 0);
    return { outgoing, incoming, decoded, payload, bytes: bytes.length, flips, disagreements, valid,
      text: decoder.decode(message), raw: decoder.decode(toBytes(raw).slice(0, -2)) };
  }
  function put(element, text) { if (element.textContent !== text) element.textContent = text; }
  // 像把线路上的一小格拿到放大镜下：优先挑真实受扰的文字位，绝不人为制造一次错误。
  function sampleFor(text, packet, recover, letterIndex = -1) {
    const copies = recover ? 3 : 1;
    const characters = [...text];
    const firstByte = letterIndex < 0 ? 0 : encoder.encode(characters.slice(0, letterIndex).join("")).length;
    const lastByte = letterIndex < 0 ? packet.bytes : firstByte + encoder.encode(characters[letterIndex]).length;
    const changed = packet.incoming.findIndex((bit, index) => index >= firstByte * 8 * copies && index < lastByte * 8 * copies && bit !== packet.outgoing[index]);
    const bitIndex = changed < 0 ? firstByte * 8 : Math.floor(changed / copies);
    const byteIndex = Math.floor(bitIndex / 8);
    let offset = 0, startByte = 0, letter = "", characterIndex = -1;
    for (const character of text) {
      characterIndex++;
      startByte = offset;
      letter = character;
      offset += encoder.encode(character).length;
      if (offset > byteIndex) break;
    }
    const source = packet.payload.slice(byteIndex * 8, byteIndex * 8 + 8);
    const sent = packet.outgoing.slice(bitIndex * copies, bitIndex * copies + copies);
    const arrived = packet.incoming.slice(bitIndex * copies, bitIndex * copies + copies);
    const restored = packet.decoded.slice(startByte * 8, offset * 8);
    return { letter, characterIndex, characterBytes: [...encoder.encode(letter)], byteOrdinal: byteIndex - startByte + 1,
      source, byte: toBytes(source)[0], sent, arrived, bit: packet.decoded[bitIndex],
      restored: restored.join("").match(/.{8}/g).join(" "), restoredLetter: decoder.decode(toBytes(restored)),
      original: packet.payload[bitIndex], changed: changed >= 0 };
  }
  // 每个字都可查自己的编号；只移动观察位置，不改变发送内容或噪声结果。
  function makeLetterPicker() {
    letterPicker.replaceChildren();
    [...run.text].forEach((letter, index) => {
      const button = document.createElement("button");
      button.type = "button"; button.textContent = letter === " " ? "␣" : letter;
      button.setAttribute("aria-label", `${index + 1}: ${letter === " " ? translate("Space") : letter}`);
      button.setAttribute("aria-pressed", String(index === run.sample.characterIndex));
      button.addEventListener("click", () => {
        pause(); inspecting = true;
        run.sample = sampleFor(run.text, run.packet, run.recover, index);
        elapsed = run.marks[0]; render(); showLoupe("encoding"); draw();
        put(announcement, loupeExample.textContent + ". " + loupeNote.textContent);
      });
      letterPicker.append(button);
    });
  }
  // 八位的面值从 128 到 1；只相加亮着的格子，说明二进制不是随机生成的一串数字。
  function showBinaryKey(sample) {
    binaryKey.replaceChildren();
    const grid = document.createElement("div"); grid.className = "signal-binary-grid";
    const used = [];
    sample.source.forEach((bit, index) => {
      const value = 2 ** (7 - index), cell = document.createElement("div");
      cell.className = "signal-bit-cell" + (bit ? " is-on" : "");
      const weight = document.createElement("span"), digit = document.createElement("b");
      weight.textContent = String(value); digit.textContent = String(bit); cell.append(weight, digit); grid.append(cell);
      if (bit) used.push(value);
    });
    const total = document.createElement("p"); total.className = "signal-binary-total";
    total.textContent = `${used.length ? used.join(" + ") : "0"} = ${sample.byte}`;
    binaryKey.append(grid, total);
  }
  function showLoupe(phase) {
    let label = "A CLOSER LOOK", example = translate("words → bits → words"), explanation = "One letter, seen from the inside.";
    loupeExample.replaceChildren();
    const encoding = phase === "encoding";
    letterPicker.hidden = binaryKey.hidden = !encoding;
    protection.textContent = "";
    if (run) {
      const sample = run.sample;
      if (phase === "typing" || phase === "encoding") {
        label = "01 / ENCODE";
        example = sample.characterBytes.length === 1 ? `“${sample.letter}” → ${sample.byte} → ${sample.source.join("")}` : `“${sample.letter}” → [${sample.characterBytes.join(", ")}]\n${translate("BYTE")} ${sample.byteOrdinal} / ${sample.characterBytes.length}: ${sample.byte} → ${sample.source.join("")}`;
        explanation = encoder.encode(sample.letter).length > 1 ? "UTF-8 is a shared codebook. This character uses several bytes; one is shown here. Add the lit values to get its number." : "UTF-8 is a shared codebook: A is 65, B is 66. Each bit has a value; add the lit values to get the letter's number.";
        if (encoding) {
          showBinaryKey(sample);
          [...letterPicker.children].forEach((button, index) => button.setAttribute("aria-pressed", String(index === sample.characterIndex)));
          put(protection, translate(run.recover ? "The codebook names letters. To protect them, send spare copies: 0 → 000, 1 → 111." : "The codebook names letters. Recovery is off, so each bit travels only once."));
        }
      } else if (phase === "transmitting" || phase === "decoding") {
        label = phase === "transmitting" ? "02 / NOISE" : "03 / DECODE";
        // 每个橙色数字都来自实际翻转；零噪声时仍展示原样抵达，不暗示必有损坏。
        loupeExample.append(sample.sent.join(""), " → ");
        sample.arrived.forEach((bit, index) => {
          const digit = document.createElement("span");
          digit.textContent = String(bit);
          if (bit !== sample.sent[index]) digit.className = "is-flipped";
          loupeExample.append(digit);
        });
        if (phase === "decoding") {
          loupeExample.append(" → ", String(sample.bit), document.createElement("br"), sample.restored, " → “", readable(sample.restoredLetter), "”");
        }
        example = "";
        explanation = phase === "transmitting" ? (sample.changed ? "Orange marks a bit flipped by noise: 0 becomes 1, or 1 becomes 0." : "These bits arrived unchanged. Noise is a chance, not a certainty.") : run.recover ? (sample.bit === sample.original ? "Three copies vote. The majority recovers this bit." : "Two copies changed. The majority gets this bit wrong, too.") : "One copy only. A changed bit stays changed; there is no vote.";
        if (run.recover) put(protection, translate("One bad copy can be outvoted. Two bad copies can fool the vote."));
      } else {
        label = "04 / CHECK";
        example = translate(run.packet.valid ? "sent = received ✓" : "sent ≠ received ×");
        explanation = run.packet.valid ? "The message seal matches. Read the bytes as letters, then choose a reply." : "The message seal does not match. Ask for a resend instead of guessing.";
      }
    }
    put(loupeLabel, translate(label));
    if (example) loupeExample.textContent = example;
    put(loupeNote, translate(explanation));
  }
  // 控制字符不能直接塞进屏幕；损坏字节用可见的小方块表示，保留原始解码结果供校验。
  function readable(text) { return text.replace(/[\u0000-\u001f\u007f-\u009f\ufffd]/g, "░"); }
  function setPhase(phase) {
    currentPhase = phase;
    root.dataset.phase = screen.dataset.phase = phase;
    put(status, translate(statusKeys[phase]));
    typed.classList.toggle("signal-placeholder", phase === "idle");
    showLoupe(phase);
    const active = phaseKeys.indexOf(phase);
    steps.forEach((step, index) => {
      step.classList.toggle("is-current", index === active);
      step.classList.toggle("is-done", phase === "complete" || phase === "failed" || index < active);
      if (index === active) step.setAttribute("aria-current", "step"); else step.removeAttribute("aria-current");
    });
  }
  function describePacket() {
    if (!run) return;
    const packet = run.packet;
    const voteText = run.recover ? `${packet.disagreements} ${translate("split votes")}` : translate("recovery off");
    put(report, `${packet.bytes} ${translate("bytes")} · ${packet.outgoing.length} ${translate("bits sent")} · ${packet.flips} ${translate("bits flipped")} · ${voteText} · ${translate(packet.valid ? "checksum matched" : "checksum failed")}`);
  }
  function start(key, skipTyping = false) {
    inspecting = false;
    selected = key;
    const prompt = prompts[key], text = translate(prompt.text);
    const packet = packetFor(text, Number(noise.value) / 100, recovery.checked);
    // 回复查表在完整校验后进行；即使校验碰巧相同，也只响应实际收到且匹配的预设句。
    const matched = Object.values(prompts).find(item => translate(item.text) === packet.text);
    const success = packet.valid && Boolean(matched);
    const response = success ? translate(matched.reply) : translate("Could you send that again? Something got lost.");
    const typingEnd = skipTyping ? 0 : [...text].length * 48 + 240;
    // 每 160 毫秒换到下一个字，最后稍停一下；句子再长也会完整展示，不跳过中间的字。
    const encodingEnd = typingEnd + [...text].length * 160 + 240;
    run = { key, text, packet, sample: sampleFor(text, packet, recovery.checked, 0), recover: recovery.checked, noise: Number(noise.value), response, success,
      marks: [typingEnd, encodingEnd, encodingEnd + 2800, encodingEnd + 5400, encodingEnd + 5400 + [...response].length * 38 + 300] };
    makeLetterPicker();
    elapsed = 0;
    choices.forEach(button => button.setAttribute("aria-pressed", String(button.dataset.prompt === key)));
    steps.forEach(step => { step.querySelector("button").disabled = false; });
    replay.disabled = false;
    put(received, "—"); put(reply, ""); put(wire, "—"); put(report, translate("In transit."));
    put(note, translate("Adjust the noise to resend. Click a screen step to pause and look closer."));
    put(announcement, translate("Sending:") + " " + text);
    root.dataset.prompt = key; root.dataset.valid = "pending";
    root.dataset.flips = String(packet.flips); root.dataset.recovery = String(run.recover);
    setPhase(skipTyping ? "encoding" : "typing");
    if (reduced.matches) { elapsed = run.marks[4]; render(); draw(); } else { render(); schedule(); }
  }
  function render() {
    if (!run) return;
    const [typingEnd, encodingEnd, transmissionEnd, decodingEnd, replyEnd] = run.marks;
    const phase = elapsed < typingEnd ? "typing" : elapsed < encodingEnd ? "encoding" : elapsed < transmissionEnd ? "transmitting" : elapsed < decodingEnd ? "decoding" : elapsed < replyEnd ? "replying" : run.success ? "complete" : "failed";
    if (phase !== currentPhase) setPhase(phase);
    const chars = [...run.text];
    // 沿用整段动画的同一个时钟；手动点字或回看步骤时，保持停住，不再自动切换。
    if (phase === "encoding" && !inspecting) {
      const letterIndex = Math.min(chars.length - 1, Math.floor((elapsed - typingEnd) / 160));
      if (letterIndex !== run.sample.characterIndex) {
        run.sample = sampleFor(run.text, run.packet, run.recover, letterIndex);
        showLoupe("encoding");
      }
    }
    put(typed, chars.slice(0, elapsed >= typingEnd ? chars.length : Math.floor(elapsed / 48)).join(""));
    const packet = run.packet;
    // 回看前面的步骤时先擦掉后续结果，避免新旧阶段的文字同时留在屏幕上。
    if (elapsed < encodingEnd) { put(received, "—"); put(wire, "—"); }
    if (elapsed < decodingEnd) { put(reply, ""); root.dataset.valid = "pending"; }
    if (elapsed >= encodingEnd && elapsed < transmissionEnd) {
      const progress = (elapsed - encodingEnd) / (transmissionEnd - encodingEnd);
      const arrived = Math.floor(progress * [...packet.raw].length);
      put(received, readable([...packet.raw].slice(0, arrived).join("")) + "▌");
    } else if (elapsed >= transmissionEnd && elapsed < decodingEnd) {
      const progress = (elapsed - transmissionEnd) / (decodingEnd - transmissionEnd);
      const raw = [...packet.raw], decoded = [...packet.text];
      put(received, readable(decoded.map((char, index) => index / decoded.length < progress ? char : raw[index] || "░").join("")));
    } else if (elapsed >= decodingEnd) {
      put(received, readable(packet.text)); root.dataset.valid = String(packet.valid);
    }
    if (elapsed >= decodingEnd) {
      const response = [...run.response], length = Math.floor((elapsed - decodingEnd) / 38);
      put(reply, response.slice(0, length).join(""));
    }
    if (elapsed >= encodingEnd) {
      const bits = elapsed >= transmissionEnd ? packet.incoming : packet.outgoing;
      put(wire, bits.slice(0, 96).join("").match(/.{1,8}/g).join(" ") + (bits.length > 96 ? " …" : ""));
    }
    if (elapsed >= decodingEnd) describePacket();
    if (phase === "complete" || phase === "failed") {
      root.dataset.bits = String(packet.outgoing.length);
      put(announcement, translate(statusKeys[phase]) + " " + run.response);
    }
  }
  function draw() {
    if (!context) return;
    context.clearRect(0, 0, width, height);
    const mid = height * .49;
    const noiseLevel = run ? run.noise / 30 : Number(noise.value) / 30;
    context.strokeStyle = "rgba(191,205,164,.13)";
    context.lineWidth = 1;
    context.beginPath(); context.moveTo(10, mid); context.lineTo(width - 10, mid); context.stroke();
    // 中间的淡色区域是受扰通道；实际翻转的 bit 用暖橙色标记，不伪造随机乱码。
    const band = context.createLinearGradient(width * .36, 0, width * .64, 0);
    band.addColorStop(0, "rgba(207,167,113,0)"); band.addColorStop(.5, `rgba(207,167,113,${.035 + noiseLevel * .07})`); band.addColorStop(1, "rgba(207,167,113,0)");
    context.fillStyle = band; context.fillRect(width * .36, 0, width * .28, height);
    context.textAlign = "center";
    if (!run || currentPhase === "typing") {
      context.fillStyle = "#829578"; context.font = "11px 'Courier New',monospace";
      context.fillText("· · ·", width / 2, mid + 4); return;
    }
    const packet = run.packet, amount = width < 500 ? 28 : 54;
    const progress = clamp((elapsed - run.marks[1]) / (run.marks[2] - run.marks[1]), 0, 1);
    const decoding = elapsed >= run.marks[2];
    const recoveryProgress = clamp((elapsed - run.marks[2]) / (run.marks[3] - run.marks[2]), 0, 1);
    for (let index = 0; index < amount; index++) {
      const sourceIndex = Math.floor(index / amount * packet.outgoing.length);
      const row = index % 3 - 1;
      const baseX = (index + .5) / amount * (width - 28) + 14;
      const x = currentPhase === "transmitting" ? 14 + ((baseX - 14 + progress * (width - 28)) % (width - 28)) : baseX;
      const changed = packet.incoming[sourceIndex] !== packet.outgoing[sourceIndex];
      const inNoise = x > width * .35;
      const affected = decoding || inNoise && progress > 0;
      const shown = affected ? packet.incoming[sourceIndex] : packet.outgoing[sourceIndex];
      const decodedIndex = Math.floor(sourceIndex / (run.recover ? 3 : 1));
      const restored = decoding && run.recover && baseX / width < recoveryProgress;
      const bit = restored ? packet.decoded[decodedIndex] : shown;
      const jitter = changed && affected && !decoding ? Math.sin(elapsed * .026 + index * 7) * (6 + noiseLevel * 12) : 0;
      context.fillStyle = restored ? "#d5e2b5" : changed && affected ? "#dfab79" : "#9bab88";
      context.globalAlpha = .48 + (index % 4) * .15;
      context.font = `${changed && !restored ? 15 : 12}px 'Courier New',monospace`;
      context.fillText(String(bit), x, mid + row * 24 + jitter + 4);
    }
    context.globalAlpha = 1;
    if (currentPhase === "transmitting") {
      context.strokeStyle = "rgba(216,189,140,.35)";
      context.beginPath(); context.moveTo(width * progress, 10); context.lineTo(width * progress, height - 10); context.stroke();
    }
  }
  // 用一个动画时钟管理全部阶段，换句子就替换当前任务；没有旧回复迟到、串进新句子的计时器。
  function frame(now) {
    frameId = 0;
    elapsed += Math.min(now - previousTime, 50); previousTime = now;
    render(); draw(); schedule();
  }
  function schedule() {
    if (run && !inspecting && visible && revealed() && !document.hidden && !reduced.matches && elapsed < run.marks[4] && !frameId) {
      previousTime = performance.now(); frameId = requestAnimationFrame(frame);
    }
  }
  function pause() { cancelAnimationFrame(frameId); frameId = 0; }
  function resize() {
    const bounds = canvas.getBoundingClientRect(); if (!bounds.width || !bounds.height || !context) return;
    width = bounds.width; height = bounds.height;
    const ratio = Math.min(devicePixelRatio || 1, 2);
    canvas.width = Math.round(width * ratio); canvas.height = Math.round(height * ratio);
    context.setTransform(ratio, 0, 0, ratio, 0, 0); draw();
  }
  choices.forEach(button => button.addEventListener("click", () => {
    // 只记录访客主动发送；换语言与噪声引起的重算不替访客留下印记。
    window.sitePlay.mark("almost-understood");
    start(button.dataset.prompt);
    // 选句后把屏幕带入视野，手机上也能马上看到文字与线路的变化。
    const bounds = screen.getBoundingClientRect();
    if (bounds.top < 12 || bounds.bottom > innerHeight - 12) screen.scrollIntoView({ behavior: reduced.matches ? "instant" : "smooth", block: "center" });
  }));
  replay.addEventListener("click", () => { if (selected) start(selected); });
  // 点击下方步骤就把同一次传输停在这一页；像翻小册子，可从容阅读真实数据。
  steps.forEach((step, index) => step.querySelector("button").addEventListener("click", () => {
    if (!run) return;
    pause(); inspecting = true;
    elapsed = index === 0 ? 0 : index === 4 ? run.marks[4] : run.marks[index - 1];
    render(); draw();
    put(announcement, loupeLabel.textContent + ". " + loupeExample.textContent + ". " + loupeNote.textContent);
  }));
  noise.addEventListener("input", () => { noiseValue.value = `${noise.value}%`; if (!run) draw(); });
  // 松开调节杆才重新发送，避免拖过十个刻度就启动十次动画。
  noise.addEventListener("change", () => { if (selected) start(selected, true); });
  recovery.addEventListener("change", () => { if (selected) start(selected, true); });
  new ResizeObserver(resize).observe(canvas);
  root.addEventListener("experimentreveal", () => { resize(); schedule(); });
  new IntersectionObserver(entries => {
    visible = entries[0].isIntersecting;
    if (visible) schedule(); else pause();
  }).observe(screen);
  document.addEventListener("visibilitychange", () => { if (document.hidden) pause(); else schedule(); });
  window.addEventListener("languagechange", () => {
    // 换语言后重新编码当前句子；中文有更多 UTF-8 字节，不能只换屏幕文字却继续传英文数据。
    if (selected) {
      const completed = currentPhase === "complete" || currentPhase === "failed";
      start(selected);
      if (completed) { elapsed = run.marks[4]; pause(); render(); draw(); }
    } else { setPhase("idle"); draw(); }
  });
  reduced.addEventListener("change", () => {
    if (reduced.matches && run) { pause(); elapsed = run.marks[4]; render(); draw(); } else schedule();
  });
  choices.forEach(button => button.setAttribute("aria-pressed", "false"));
  resize(); setPhase("idle");
})();
