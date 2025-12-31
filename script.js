/* ================================
   KATLA OVERLAY - script.js (FULL)
   - words dari words.txt
   - input dari keyboard fisik
   - input dari TikTok (polling /api/tiktok)
   - auto next round 15 detik
================================== */

const CONFIG = {
  WORD_LEN: 5,
  MAX_TRIES: 6,
  NEXT_ROUND_DELAY_MS: 15000,

  // TikTok bridge (kalau belum dipakai, biarin aja)
  TIKTOK_POLL_URL: "/api/tiktok",
  TIKTOK_POLL_MS: 500,

  // Terima format komentar:
  // - "dapur" (5 huruf)
  // - "jawab:dapur" / "answer:dapur" / "!dapur" (akan disaring)
  ACCEPT_PREFIXES: ["jawab:", "answer:", "ans:", "kata:", "!"],
};

let WORDS = [];
let WORD_SET = new Set();

let answer = "";
let board = []; // array of rows: { letters: [], result: [] }
let row = 0;
let col = 0;
let finished = false;
let accepting = true;

let lastTikTokTs = 0;
let nextRoundTimer = null;
let countdownTimer = null;
let countdownLeft = 0;

// ---------- Utils ----------
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function pickRandom(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function normalizeGuess(raw) {
  if (!raw) return "";
  let s = String(raw).trim().toLowerCase();

  // strip prefix kalau ada
  for (const p of CONFIG.ACCEPT_PREFIXES) {
    if (s.startsWith(p)) s = s.slice(p.length).trim();
  }

  // ambil huruf a-z saja
  s = s.replace(/[^a-z]/g, "");
  return s.toUpperCase();
}

function nowHHMMSS() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

// Wordle-style evaluation (handle duplicates)
function evaluateGuess(guess, ans) {
  // result: "correct" | "present" | "absent"
  const res = Array(CONFIG.WORD_LEN).fill("absent");

  const a = ans.split("");
  const g = guess.split("");

  // First pass: correct
  const used = Array(CONFIG.WORD_LEN).fill(false);
  for (let i = 0; i < CONFIG.WORD_LEN; i++) {
    if (g[i] === a[i]) {
      res[i] = "correct";
      used[i] = true;
      g[i] = null; // consume
    }
  }

  // Second pass: present
  for (let i = 0; i < CONFIG.WORD_LEN; i++) {
    if (!g[i]) continue;
    const idx = a.findIndex((ch, j) => !used[j] && ch === g[i]);
    if (idx !== -1) {
      res[i] = "present";
      used[idx] = true;
    }
  }

  return res;
}

function isValidWord(wordUpper) {
  const w = String(wordUpper || "").toLowerCase();
  return WORD_SET.has(w);
}

// ---------- DOM ----------
function ensureBaseUI() {
  let app = document.getElementById("app");
  if (!app) {
    app = document.createElement("div");
    app.id = "app";
    document.body.appendChild(app);
  }

  // If already has UI, don't recreate.
  if (document.getElementById("katla-root")) return;

  app.innerHTML = `
    <div id="katla-root" class="katla-root">
      <div class="katla-top">
        <div class="katla-title">
          <div class="katla-brand">KATLA</div>
          <div class="katla-sub">WORD GAME</div>
        </div>
        <div class="katla-right">
          <div id="katla-badge" class="katla-badge">LIVE</div>
          <div id="katla-clock" class="katla-clock">${nowHHMMSS()}</div>
        </div>
      </div>

      <div id="katla-board" class="katla-board"></div>

      <div class="katla-bottom">
        <div id="katla-msg" class="katla-msg">Memuat kata...</div>
        <div id="katla-next" class="katla-next" style="display:none;"></div>
      </div>
    </div>
  `;

  // auto clock
  setInterval(() => {
    const el = document.getElementById("katla-clock");
    if (el) el.textContent = nowHHMMSS();
  }, 1000);
}

function renderBoard() {
  const el = document.getElementById("katla-board");
  if (!el) return;

  const rowsHtml = [];
  for (let r = 0; r < CONFIG.MAX_TRIES; r++) {
    const cellsHtml = [];
    for (let c = 0; c < CONFIG.WORD_LEN; c++) {
      const letter = board[r]?.letters?.[c] || "";
      const state = board[r]?.result?.[c] || "";
      cellsHtml.push(
        `<div class="cell ${state} ${r === row && c === col ? "cursor" : ""}">${letter}</div>`
      );
    }
    rowsHtml.push(`<div class="row">${cellsHtml.join("")}</div>`);
  }

  el.innerHTML = rowsHtml.join("");
}

function setMsg(text) {
  const el = document.getElementById("katla-msg");
  if (el) el.textContent = text;
}

function setNextInfo(text, show = true) {
  const el = document.getElementById("katla-next");
  if (!el) return;
  el.textContent = text;
  el.style.display = show ? "block" : "none";
}

// ---------- Game lifecycle ----------
function initRound(newAnswer) {
  answer = newAnswer;
  board = Array.from({ length: CONFIG.MAX_TRIES }, () => ({
    letters: Array(CONFIG.WORD_LEN).fill(""),
    result: Array(CONFIG.WORD_LEN).fill(""),
  }));
  row = 0;
  col = 0;
  finished = false;
  accepting = true;

  clearTimers();
  setNextInfo("", false);

  setMsg("Ketik 5 huruf. Komentar live juga bisa. 🫡");
  renderBoard();
}

function clearTimers() {
  if (nextRoundTimer) clearTimeout(nextRoundTimer);
  if (countdownTimer) clearInterval(countdownTimer);
  nextRoundTimer = null;
  countdownTimer = null;
  countdownLeft = 0;
}

function scheduleNextRound(reasonText) {
  accepting = false;
  finished = true;

  countdownLeft = Math.ceil(CONFIG.NEXT_ROUND_DELAY_MS / 1000);
  setNextInfo(`${reasonText} • Next round dalam ${countdownLeft}s`, true);

  countdownTimer = setInterval(() => {
    countdownLeft -= 1;
    if (countdownLeft <= 0) {
      clearInterval(countdownTimer);
      countdownTimer = null;
      return;
    }
    setNextInfo(`${reasonText} • Next round dalam ${countdownLeft}s`, true);
  }, 1000);

  nextRoundTimer = setTimeout(() => {
    const next = pickRandom(WORDS).toUpperCase();
    initRound(next);
  }, CONFIG.NEXT_ROUND_DELAY_MS);
}

function commitGuess(guessUpper, source = "local") {
  if (!accepting || finished) return;
  if (guessUpper.length !== CONFIG.WORD_LEN) return;
  if (row >= CONFIG.MAX_TRIES) return;

  // Validate vs words list
  if (!isValidWord(guessUpper)) {
    setMsg(`"${guessUpper}" bukan kata valid (KBBI list).`);
    return;
  }

  // Fill row if not already filled
  for (let i = 0; i < CONFIG.WORD_LEN; i++) {
    board[row].letters[i] = guessUpper[i];
  }

  const res = evaluateGuess(guessUpper, answer);
  board[row].result = res;

  renderBoard();

  // Win / lose?
  if (guessUpper === answer) {
    setMsg(`✅ BENAR! (${source})`);
    scheduleNextRound("Menang");
    return;
  }

  row += 1;
  col = 0;

  if (row >= CONFIG.MAX_TRIES) {
    setMsg(`❌ Kalah. Jawabannya: ${answer}`);
    scheduleNextRound("Kalah");
    return;
  }

  setMsg(`Salah. Coba lagi. (${source})`);
}

function typeLetter(ch) {
  if (!accepting || finished) return;
  if (row >= CONFIG.MAX_TRIES) return;
  if (col >= CONFIG.WORD_LEN) return;
  board[row].letters[col] = ch;
  col += 1;
  renderBoard();
}

function backspace() {
  if (!accepting || finished) return;
  if (row >= CONFIG.MAX_TRIES) return;
  if (col <= 0) return;
  col -= 1;
  board[row].letters[col] = "";
  renderBoard();
}

function submitCurrentRow(source = "local") {
  if (!accepting || finished) return;
  const guess = board[row].letters.join("").trim();
  if (guess.length !== CONFIG.WORD_LEN) {
    setMsg(`Butuh ${CONFIG.WORD_LEN} huruf.`);
    return;
  }
  commitGuess(guess, source);
}

// ---------- Input: keyboard ----------
function wireKeyboard() {
  window.addEventListener("keydown", (e) => {
    if (!accepting || finished) return;

    const key = e.key;

    if (key === "Backspace") {
      e.preventDefault();
      backspace();
      return;
    }

    if (key === "Enter") {
      e.preventDefault();
      submitCurrentRow("keyboard");
      return;
    }

    // only letters a-z
    if (/^[a-zA-Z]$/.test(key)) {
      typeLetter(key.toUpperCase());
    }
  });
}

// ---------- Input: TikTok via polling ----------
async function pollTikTok() {
  while (true) {
    try {
      const res = await fetch(CONFIG.TIKTOK_POLL_URL, { cache: "no-store" });
      if (res.ok) {
        const data = await res.json();
        if (data?.ts && data.ts > lastTikTokTs) {
          lastTikTokTs = data.ts;

          const user = String(data.username || "").trim();
          const comment = String(data.comment || "").trim();
          const guess = normalizeGuess(comment);

          // biar ga spam, hanya ambil tebakannya yg 5 huruf
          if (guess.length === CONFIG.WORD_LEN && !finished && accepting) {
            // langsung commit (tanpa ngetik per huruf, biar cepet)
            commitGuess(guess, `tiktok@${user || "user"}`);
          }
        }
      }
    } catch (err) {
      // diem aja, internet suka drama
    }

    await sleep(CONFIG.TIKTOK_POLL_MS);
  }
}

// ---------- Load words ----------
async function loadWords() {
  const res = await fetch("words.txt", { cache: "no-store" });
  if (!res.ok) throw new Error("Gagal load words.txt");
  const text = await res.text();

  // words.txt = satu kata per baris
  const list = text
    .split(/\r?\n/)
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean)
    .filter((w) => /^[a-z]{5}$/.test(w));

  // unique
  WORDS = Array.from(new Set(list));
  WORD_SET = new Set(WORDS);
}

// ---------- Boot ----------
(async function boot() {
  ensureBaseUI();
  renderBoard();
  wireKeyboard();

  try {
    await loadWords();
    setMsg(`✅ Kata siap (${WORDS.length} kata). Komentar 5 huruf akan otomatis jadi tebakan.`);
    initRound(pickRandom(WORDS).toUpperCase());
  } catch (e) {
    console.error(e);
    setMsg("❌ Gagal load words.txt. Pastikan words.txt ada di root dan bisa diakses.");
    return;
  }

  // Start TikTok polling (kalau endpoint belum ada, dia cuma gagal diam-diam)
  pollTikTok();
})();

/* =====================================================
   CATATAN PENTING:
   - finished disimpan global via var, kalau code lu butuh:
     window.finished = finished;
   - kalau mau, bisa expose:
     window.__KATLA = { commitGuess, initRound };
===================================================== */
