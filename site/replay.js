// Replays recording.json, a captured War Room event stream ({ t, type, data }, t in ms
// from the start of the incident), through a miniature copy of the dashboard.
(() => {
  const $ = (id) => document.getElementById(id);
  const steps = ["nominal", "critical", "investigating", "fixing", "resolved"];
  const speeds = [1, 2, 4];
  const percent = (rate) => `${Math.round((rate ?? 0) * 100)}%`;
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  let events = [];
  let index = 0;
  let elapsed = 0;
  let speedIndex = 0;
  let frame;
  let lastTick;
  let messages = new Map();

  // Minimal Markdown (headings, lists, paragraphs, inline code, bold) built with DOM
  // nodes, so recorded text is never parsed as HTML.
  function renderMarkdown(target, source) {
    target.replaceChildren();
    let list;
    for (const line of source.split("\n")) {
      const heading = /^#{1,4}\s+(.*)$/.exec(line);
      const item = /^\s*(?:[-*]|\d+\.)\s+(.*)$/.exec(line);
      if (item) {
        if (!list) {
          list = document.createElement(/^\s*\d+\./.test(line) ? "ol" : "ul");
          target.append(list);
        }
        list.append(inline("li", item[1]));
        continue;
      }
      list = undefined;
      if (heading) target.append(inline("h4", heading[1]));
      else if (line.trim()) target.append(inline("p", line));
    }
  }

  function inline(tag, text) {
    const element = document.createElement(tag);
    for (const part of text.split(/(`[^`]+`|\*\*[^*]+\*\*)/).filter(Boolean)) {
      if (part.length > 2 && part.startsWith("`") && part.endsWith("`")) {
        const code = document.createElement("code");
        code.textContent = part.slice(1, -1);
        element.append(code);
      } else if (part.length > 4 && part.startsWith("**") && part.endsWith("**")) {
        const strong = document.createElement("strong");
        strong.textContent = part.slice(2, -2);
        element.append(strong);
      } else {
        element.append(part);
      }
    }
    return element;
  }

  function setStatus(status) {
    const pill = $("status");
    pill.className = `pill ${status}`;
    pill.textContent = `● ${status.toUpperCase()}`;
    const reached = steps.indexOf(status);
    if (reached < 0) return;
    for (const li of $("lifecycle").children) li.classList.toggle("reached", steps.indexOf(li.dataset.step) <= reached);
  }

  function reset() {
    index = 0;
    elapsed = 0;
    messages = new Map();
    setStatus("nominal");
    $("alert-empty").hidden = false;
    $("alert-empty").textContent = "Standing by. Press play to deploy the regression.";
    $("alert-body").hidden = true;
    $("fix").hidden = true;
    $("diff-wrap").hidden = true;
    $("postmortem-wrap").hidden = true;
    $("feed").replaceChildren($("feed-empty") ?? document.createElement("p"));
    $("feed-empty").hidden = false;
    $("progress").style.width = "0";
  }

  function addMessage({ agent, color }) {
    $("feed-empty").hidden = true;
    const chat = document.createElement("article");
    chat.className = "chat";
    const avatar = document.createElement("span");
    avatar.className = "avatar";
    avatar.style.background = color;
    avatar.textContent = agent
      .split(" ")
      .map((word) => word[0])
      .join("");
    const body = document.createElement("div");
    body.className = "chat-body";
    const name = document.createElement("p");
    name.className = "agent-name";
    name.style.color = color;
    name.textContent = agent;
    const tag = document.createElement("em");
    tag.textContent = "STREAMING";
    name.append(tag);
    const bubble = document.createElement("div");
    bubble.className = "bubble streaming";
    const text = document.createTextNode("");
    const cursor = document.createElement("span");
    cursor.className = "cursor";
    cursor.textContent = "▋";
    bubble.append(text, cursor);
    body.append(name, bubble);
    chat.append(avatar, body);
    $("feed").append(chat);
    messages.set(agent, { text, bubble, tag, raw: "" });
  }

  function apply({ type, data }) {
    switch (type) {
      case "incident_started":
        $("alert-empty").textContent = `Deploying “${data.label}” and watching the error rate…`;
        break;
      case "status":
        setStatus(data.status);
        break;
      case "incident":
        $("alert-empty").hidden = true;
        $("alert-body").hidden = false;
        $("alert-error").textContent = data.alert.error;
        $("alert-rate").textContent = percent(data.alert.errorRate);
        $("alert-endpoint").textContent = data.alert.endpoint;
        break;
      case "agent_started":
        addMessage(data);
        break;
      case "agent_delta": {
        const message = messages.get(data.agent);
        if (!message) break;
        message.raw += data.delta;
        message.text.data = message.raw;
        break;
      }
      case "agent_complete": {
        const message = messages.get(data.agent);
        if (!message) break;
        message.bubble.className = "bubble";
        renderMarkdown(message.bubble, data.message || message.raw);
        message.tag.textContent = "SCRIPTED";
        break;
      }
      case "fix_available":
        $("fix").hidden = false;
        $("fix-before").textContent = percent(data.beforeErrorRate);
        $("fix-after").textContent = percent(data.afterErrorRate);
        $("fix-branch").textContent =
          `${data.method === "patch" ? "Patched" : "Reverted"} on ${data.branch} · ${data.sampleSize} checkouts replayed`;
        $("diff").textContent = data.diff;
        $("diff-wrap").hidden = false;
        break;
      case "postmortem":
        $("postmortem-path").textContent = data.path;
        renderMarkdown($("postmortem"), data.content);
        $("postmortem-wrap").hidden = false;
        break;
    }
    if (type.startsWith("agent_")) $("feed").scrollTop = $("feed").scrollHeight;
  }

  function tick(now) {
    elapsed += (now - lastTick) * speeds[speedIndex];
    lastTick = now;
    while (index < events.length && events[index].t <= elapsed) apply(events[index++]);
    const total = events.at(-1).t;
    $("progress").style.width = `${Math.min(100, (elapsed / total) * 100)}%`;
    if (index < events.length) {
      frame = requestAnimationFrame(tick);
    } else {
      frame = undefined;
      $("play").textContent = "↻ Replay";
    }
  }

  function play() {
    if (!events.length) return;
    cancelAnimationFrame(frame);
    reset();
    $("play").textContent = "↻ Restart";
    lastTick = performance.now();
    frame = requestAnimationFrame(tick);
  }

  $("play").addEventListener("click", play);
  $("speed").addEventListener("click", () => {
    speedIndex = (speedIndex + 1) % speeds.length;
    $("speed").textContent = `${speeds[speedIndex]}×`;
  });

  $("copy").addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText($("commands").textContent.trim());
      $("copy").textContent = "Copied";
    } catch {
      $("copy").textContent = "Select and copy";
    }
    setTimeout(() => ($("copy").textContent = "Copy"), 2000);
  });

  fetch("recording.json")
    .then((response) => response.json())
    .then((recording) => {
      events = recording;
      if (reducedMotion) return;
      // Start the replay the first time the console scrolls into view.
      const observer = new IntersectionObserver(
        (entries) => {
          if (!entries.some((entry) => entry.isIntersecting)) return;
          observer.disconnect();
          if (frame === undefined && index === 0) play();
        },
        { threshold: 0.35 },
      );
      observer.observe($("console"));
    })
    .catch(() => {
      $("play").disabled = true;
      $("alert-empty").textContent = "The recording could not be loaded.";
    });
})();
