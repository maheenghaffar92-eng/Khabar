// Khabar prototype: pure HTML, CSS and JavaScript. Data is saved in the browser (localStorage).
const STAGES = ["Registered", "In Surgery", "Recovery", "Shifted to Ward"];
const KEY = "khabar-data";

let data = load();          // { next: 101, patients: [...] }
let chosenStage = null;

const $ = (id) => document.getElementById(id);

function load() {
  try { return JSON.parse(localStorage.getItem(KEY)) || { next: 101, patients: [] }; }
  catch (e) { return { next: 101, patients: [] }; }
}
function save() { localStorage.setItem(KEY, JSON.stringify(data)); }

function nowTime() {
  return new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}
function mask(p) { return p.slice(0, 4) + " ••• " + p.slice(-3); }
function toast(text) {
  const t = $("toast");
  t.textContent = text;
  t.classList.add("show");
  setTimeout(() => t.classList.remove("show"), 2200);
}

// ---------- Tabs ----------
document.querySelectorAll(".tab").forEach((btn) => {
  btn.onclick = () => {
    document.querySelectorAll(".tab").forEach((b) => b.classList.remove("active"));
    document.querySelectorAll(".panel").forEach((p) => (p.hidden = true));
    btn.classList.add("active");
    $(btn.dataset.tab).hidden = false;
    if (btn.dataset.tab === "p2") renderPick();
    if (btn.dataset.tab === "p3") renderChat();
    if (btn.dataset.tab === "p4") renderDisplay();
  };
});

// ---------- Step 1: Admission ----------
$("admitBtn").onclick = () => {
  const raw = $("phone").value.replace(/[\s-]/g, "");
  if (!/^(\+?92|0)?3\d{9}$/.test(raw)) {
    $("error").textContent = "Enter a valid mobile number, for example 0300 1234567.";
    return;
  }
  if (!$("consent").checked) {
    $("error").textContent = "Tick the box once the family member has agreed.";
    return;
  }
  $("error").textContent = "";
  const patient = {
    token: data.next++,
    phone: raw.replace(/^\+?92/, "0"),
    channel: $("channel").value,
    stage: null,
    msgs: [],
  };
  data.patients.push(patient);
  save();
  $("tokennum").textContent = "T-" + patient.token;
  $("tokenbox").hidden = false;
  $("phone").value = "";
  $("consent").checked = false;
  renderBoard();
  toast("Token T-" + patient.token + " saved");
};

function renderBoard() {
  const body = $("board");
  body.innerHTML = "";
  if (!data.patients.length) {
    body.innerHTML = '<tr><td colspan="3">No patients yet.</td></tr>';
    return;
  }
  data.patients.forEach((p) => {
    const tr = document.createElement("tr");
    tr.innerHTML =
      "<td><b>T-" + p.token + "</b></td><td>" + mask(p.phone) + "</td><td>" +
      (p.stage ? '<span class="pill">' + p.stage + "</span>" : "Waiting") + "</td>";
    body.appendChild(tr);
  });
}

// ---------- Step 2: Staff update panel ----------
function currentPatient() {
  return data.patients.find((p) => String(p.token) === $("pick").value);
}

function renderPick() {
  const pick = $("pick");
  const keep = pick.value;
  pick.innerHTML = "";
  if (!data.patients.length) pick.innerHTML = "<option value=''>No patients yet</option>";
  data.patients.forEach((p) => {
    const o = document.createElement("option");
    o.value = p.token;
    o.textContent = "T-" + p.token + (p.stage ? " (" + p.stage + ")" : "");
    pick.appendChild(o);
  });
  if (keep) pick.value = keep;
  chosenStage = null;
  renderStages();
  renderPreview();
}
$("pick").onchange = () => { chosenStage = null; renderStages(); renderPreview(); };

function renderStages() {
  const box = $("stages");
  box.innerHTML = "";
  STAGES.forEach((stage) => {
    const b = document.createElement("button");
    b.textContent = stage;
    b.disabled = !currentPatient();
    if (stage === chosenStage) b.classList.add("selected");
    b.onclick = () => { chosenStage = stage; renderStages(); renderPreview(); };
    box.appendChild(b);
  });
}

// The message has the token, stage and time only. No patient name.
function buildMessage(patient, stage) {
  return "Hospital update\nToken: T-" + patient.token + "\nStage: " + stage + "\nTime: " + nowTime();
}

function renderPreview() {
  const p = currentPatient();
  if (p && chosenStage) {
    $("preview").textContent = buildMessage(p, chosenStage);
    $("route").textContent = "Goes by " + p.channel + " to " + mask(p.phone) + ".";
    $("sendBtn").disabled = false;
  } else {
    $("preview").textContent = "Select a token and a stage.";
    $("route").textContent = "";
    $("sendBtn").disabled = true;
  }
}

$("sendBtn").onclick = () => {
  const p = currentPatient();
  if (!p || !chosenStage) return;
  p.msgs.push({ text: buildMessage(p, chosenStage), channel: p.channel, time: nowTime() });
  p.stage = chosenStage;
  p.updatedAt = Date.now();
  save();
  playDing();
  toast("Sent by " + p.channel);
  renderPick();
  renderBoard();
};

// ---------- Step 3: Family phone ----------
function renderChat() {
  const chat = $("chat");
  chat.innerHTML = "";
  const withMsgs = data.patients.filter((p) => p.msgs.length);
  if (!withMsgs.length) {
    chat.innerHTML = '<div class="empty">No messages yet. Send one from the staff panel.</div>';
    $("phonebar").textContent = "No messages yet";
    return;
  }
  const p = withMsgs[withMsgs.length - 1];
  $("phonebar").textContent = mask(p.phone);
  p.msgs.forEach((m) => {
    const d = document.createElement("div");
    d.className = "msg " + m.channel;
    d.textContent = m.text;
    const s = document.createElement("small");
    s.textContent = m.channel + " - " + m.time;
    d.appendChild(s);
    chat.appendChild(d);
  });
  chat.scrollTop = chat.scrollHeight;
}

// ---------- Reset ----------
$("resetBtn").onclick = () => {
  if (confirm("Delete all patients and messages?")) {
    data = { next: 101, patients: [] };
    save();
    $("tokenbox").hidden = true;
    renderBoard(); renderPick(); renderChat(); renderDisplay();
  }
};

renderBoard();

// ---------- AOS (animate on scroll) ----------
if (window.AOS) AOS.init({ duration: 800, once: true, offset: 80 });

// ---------- Hero phone: messages arrive one by one, in a loop ----------
(function heroDemo() {
  const chat = document.getElementById("heroChat");
  if (!chat) return;
  const steps = [
    ["Registered", "9:05 AM"],
    ["In Surgery", "10:42 AM"],
    ["Recovery", "12:15 PM"],
    ["Shifted to Ward", "2:30 PM"],
  ];
  let i = 0;
  function next() {
    if (i === steps.length) {
      i = 0;
      setTimeout(() => { chat.innerHTML = ""; next(); }, 2500);
      return;
    }
    const d = document.createElement("div");
    d.className = "msg WhatsApp";
    d.textContent = "Hospital update\nToken: T-101\nStage: " + steps[i][0] + "\nTime: " + steps[i][1];
    const s = document.createElement("small");
    s.textContent = "WhatsApp";
    d.appendChild(s);
    chat.appendChild(d);
    chat.scrollTop = chat.scrollHeight;
    i++;
    setTimeout(next, 2200);
  }
  next();
})();


// ---------- Dark mode toggle ----------
(function theme() {
  const root = document.documentElement;
  let saved = null;
  try { saved = localStorage.getItem("khabar-theme"); } catch (e) {}
  const dark = saved ? saved === "dark" : window.matchMedia && matchMedia("(prefers-color-scheme: dark)").matches;
  function apply(isDark) {
    root.setAttribute("data-theme", isDark ? "dark" : "light");
    $("themeBtn").textContent = isDark ? "☀️" : "🌙";
    try { localStorage.setItem("khabar-theme", isDark ? "dark" : "light"); } catch (e) {}
  }
  apply(dark);
  $("themeBtn").onclick = () => apply(root.getAttribute("data-theme") !== "dark");
})();

// ---------- Notification sound (Web Audio, no file needed) ----------
let soundOn = true, audioCtx = null;
$("soundBtn").onclick = () => {
  soundOn = !soundOn;
  $("soundBtn").textContent = soundOn ? "🔔" : "🔕";
  $("soundBtn").setAttribute("aria-label", soundOn ? "Turn sound off" : "Turn sound on");
  if (soundOn) playDing();
};
function playDing() {
  if (!soundOn) return;
  try {
    audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
    const t = audioCtx.currentTime;
    [880, 1318].forEach((f, i) => {
      const o = audioCtx.createOscillator(), g = audioCtx.createGain();
      const s = t + i * 0.15;
      o.type = "sine"; o.frequency.value = f;
      o.connect(g); g.connect(audioCtx.destination);
      g.gain.setValueAtTime(0.0001, s);
      g.gain.exponentialRampToValueAtTime(0.25, s + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, s + 0.45);
      o.start(s); o.stop(s + 0.5);
    });
  } catch (e) {}
}

// ---------- Step 4: Digital display screen (token numbers only) ----------
function renderDisplay() {
  const box = $("dboard");
  if (!box) return;
  box.innerHTML = "";
  if (!data.patients.length) {
    box.innerHTML = '<div class="dempty">No patients yet. Admit one to see the screen.</div>';
    return;
  }
  data.patients.forEach((p) => {
    const idx = p.stage ? STAGES.indexOf(p.stage) : -1;
    const row = document.createElement("div");
    row.className = "drow" + (p.updatedAt && Date.now() - p.updatedAt < 6000 ? " flash" : "");
    let bar = "";
    STAGES.forEach((s, i) => (bar += '<i class="' + (i <= idx ? "on" : "") + '"></i>'));
    row.innerHTML =
      '<span class="dtoken">T-' + p.token + "</span>" +
      '<div class="dbar">' + bar + "</div>" +
      '<span class="dstage' + (idx === STAGES.length - 1 ? " last" : "") + '">' + (p.stage || "Waiting") + "</span>";
    box.appendChild(row);
  });
}
function tickClock() { const c = $("dclock"); if (c) c.textContent = new Date().toLocaleTimeString(); }
setInterval(tickClock, 1000); tickClock();
renderDisplay();