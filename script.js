/* =========================================
   KATLA OVERLAY (FULL)
   - words.txt (1 kata per baris)
   - input keyboard fisik
   - input TikTok: polling /api/tiktok
   - auto next round 15 detik
========================================= */

const CONFIG = {
  WORD_LEN: 5,
  MAX_TRIES: 6,
  NEXT_ROUND_DELAY_MS: 15000,

  TIKTOK_POLL_URL: "/api/tiktok",
  TIKTOK_POLL_MS: 500,

  ACCEPT_PREFIXES: ["jawab:", "answer:", "ans:", "kata:", "!"],
};

let WORDS = [];
let WORD_SET = new Set();

let answer = "";
let board = [];
let row = 0;
let col = 0;
let finished = false;
let accepting = true;
let roundNum = 1;

let lastTikTokTs = 0;
let nextRoundTimer = null;
let countdownTimer = null;
let countdownLeft = 0;

// DOM
const elBoard = () => document.getElementById("board");
const elMsg = () => document.getElementById("msg");
const elNext = () => document.getElementById("next");
const elClock = () => document.getElementById("clock");
const elWordsCount = () => document.getElementById("wordsCount");
const elLastSource = () => document.getElementById("lastSource");
const elRoundNum = () => document.getElementById("roundNum");
const elTriesLeft = () => document.getElementById("triesLeft");
const elHint = () => document.getElementById("hint");

// Utils
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const pad = (n) => String(n).padStart(2, "0");
const nowHHMMSS = () => {
  const d = new Date();
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
};
const pickRandom = (arr) => arr[Math.floor(Math.random() * arr.length)];

function setMsg(text) {
  const el = elMsg();
  if (el) el.textContent = text;
}
function setNextInfo(text, show = true) {
  const el = elNext();
  if (!el) return;
  el.textContent = text;
  el.style.display = show ? "block" : "none";
}
function setSource(text) {
  const el = elLastSource();
  if (el) el.textContent = text || "-";
}
function updateHUD() {
  const r = elRoundNum();
  const t = elTriesLeft();
  if (r) r.textContent = String(roundNum);
  if (t) t.textContent = String(CONFIG.MAX_TRIES - row);
}

function normalizeGuess(raw) {
  if (!raw) return "";
  let s = String(raw).trim().toLowerCase();

  for (const p of CONFIG.ACCEPT_PREFIXES) {
    if (s.startsWith(p)) s = s.slice(p.length).trim();
  }

  s = s.replace(/[^a-z]/g, "");
  return s.toUpperCase();
}

function isValidWord(upper) {
  return WORD_SET.has(String(upper || "").toLowerCase());
}

// Wordle evaluation (duplicate-safe)
function evaluateGuess(guess, ans) {
  const res = Array(CONFIG.WORD_LEN).fill("absent");

  const a = ans.split("");
  const g = guess.split("");
  const used = Array(CONFIG.WORD_LEN).fill(false);

  for (let i = 0; i < CONFIG.WORD_LEN; i++) {
    if (g[i] === a[i]) {
      res[i] = "correct";
      used[i] = true;
      g[i] = null;
    }
  }

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

// Render
function renderBoard() {
  const root = elBoard();
  if (!root) return;

  const rowsHtml = [];
  for (let r = 0; r < CONFIG.MAX_TRIES; r++) {
    const cells = [];
    for (let c = 0; c < CONFIG.WORD_LEN; c++) {
      const letter = board[r]?.letters?.[c] || "";
      const state = board[r]?.result?.[c] || "";
      const cursor = r === row && c === col && accepting && !finished ? "cursor" : "";

      cells.push(
        `<div class="cell ${state} ${cursor}" data-r="${r}" data-c="${c}">${letter}</div>`
      );
    }
    rowsHtml.push(`<div class="row">${cells.join("")}</div>`);
  }

  root.innerHTML = rowsHtml.join("");
}

function getCellEl(r, c) {
  return document.querySelector(`.cell[data-r="${r}"][data-c="${c}"]`);
}

async function revealRowFlipAnimated(targetRow, res) {
  // 600ms total: 300ms ke tengah (apply warna), 300ms balik
  const HALF = 150;

  for (let i = 0; i < CONFIG.WORD_LEN; i++) {
    const cell = getCellEl(targetRow, i);
    if (!cell) continue;

    // start flip
    cell.classList.remove("reveal");
    // force reflow biar animasi bisa restart dengan konsisten
    void cell.offsetWidth;
    cell.classList.add("reveal");

    // tunggu sampai “nutup” (90deg)
    await sleep(HALF);

    // set state di tengah flip
    board[targetRow].result[i] = res[i];
    cell.classList.remove("correct", "present", "absent");
    cell.classList.add(res[i]);

    // tunggu sampai flip selesai
    await sleep(HALF);
  }
}

function revealRowAnimated(res, delay = 200) {
  return new Promise((resolve) => {
    // res = ["correct","present","absent",...]
    let i = 0;

    const tick = () => {
      if (i >= CONFIG.WORD_LEN) return resolve();

      // set state satu-satu biar keliatan animasinya
      board[row].result[i] = res[i];
      renderBoard();

      i++;
      setTimeout(tick, delay);
    };

    tick();
  });
}

function clearTimers() {
  if (nextRoundTimer) clearTimeout(nextRoundTimer);
  if (countdownTimer) clearInterval(countdownTimer);
  nextRoundTimer = null;
  countdownTimer = null;
  countdownLeft = 0;
}

function initRound(newAnswerUpper) {
  answer = newAnswerUpper;
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
  setSource("-");
  setMsg("Komentar 5 huruf 😈");
  if (elHint()) elHint().textContent = "Input aktif: keyboard / TikTok";
  updateHUD();
  renderBoard();
}

function scheduleNextRound(reasonText) {
  accepting = false;
  finished = true;

  countdownLeft = Math.ceil(CONFIG.NEXT_ROUND_DELAY_MS / 1000);
  setNextInfo(`${reasonText} • Next round dalam ${countdownLeft}s`, true);
  if (elHint()) elHint().textContent = "Menunggu ronde berikutnya...";

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
    roundNum += 1;
    const next = pickRandom(WORDS).toUpperCase();
    initRound(next);
  }, CONFIG.NEXT_ROUND_DELAY_MS);
}

async function commitGuess(guessUpper, source = "keyboard") {
  if (!accepting || finished) return;
  if (guessUpper.length !== CONFIG.WORD_LEN) return;
  if (row >= CONFIG.MAX_TRIES) return;

  if (!isValidWord(guessUpper)) {
    setSource(source);
    setMsg(`"${guessUpper}" bukan kata valid.`);
    return;
  }

  // isi huruf ke row aktif
  for (let i = 0; i < CONFIG.WORD_LEN; i++) {
    board[row].letters[i] = guessUpper[i];
  }

  setSource(source);

  // render dulu hurufnya tampil
  renderBoard();

  // lock input selama animasi
  accepting = false;

  const res = evaluateGuess(guessUpper, answer);

  // animasi flip per tile (row saat ini)
  const currentRow = row;
  await revealRowFlipAnimated(currentRow, res);

  // selesai reveal, buka input
  accepting = true;

  // menang?
  if (guessUpper === answer) {
    setMsg("✅ BENAR!");
    scheduleNextRound("Menang");
    return;
  }

  row += 1;
  col = 0;
  updateHUD();
  renderBoard();

  // kalah?
  if (row >= CONFIG.MAX_TRIES) {
    setMsg(`❌ Kalah. Jawaban: ${answer}`);
    scheduleNextRound("Kalah");
    return;
  }

  setMsg("Salah. Coba lagi.");
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

async function submitCurrentRow() {
  if (!accepting || finished) return;
  const guess = board[row].letters.join("").trim();
  if (guess.length !== CONFIG.WORD_LEN) {
    setMsg(`Butuh ${CONFIG.WORD_LEN} huruf.`);
    return;
  }
  await commitGuess(guess, "keyboard");
}

// Keyboard
function wireKeyboard() {
  window.addEventListener("keydown", (e) => {
    if (!accepting || finished) return;

    if (e.key === "Backspace") {
      e.preventDefault();
      backspace();
      return;
    }
    if (e.key === "Enter") {
      e.preventDefault();
      submitCurrentRow();
      return;
    }
    if (/^[a-zA-Z]$/.test(e.key)) {
      typeLetter(e.key.toUpperCase());
    }
  });
}

// TikTok polling
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

          if (guess.length === CONFIG.WORD_LEN && accepting && !finished) {
            await commitGuess(guess, user ? `tiktok@${user}` : "tiktok");
          }
        }
      }
    } catch (_) {}

    await sleep(CONFIG.TIKTOK_POLL_MS);
  }
}

// Load words
async function loadWords() {
  const res = await fetch("words.txt", { cache: "no-store" });
  if (!res.ok) throw new Error("words.txt gagal di-load");
  const text = await res.text();

  const list = text
    .split(/\r?\n/)
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean)
    .filter((w) => /^[a-z]{5}$/.test(w));

  WORDS = Array.from(new Set(list));
  WORD_SET = new Set(WORDS);

  const wc = elWordsCount();
  if (wc) wc.textContent = `words: ${WORDS.length}`;
}

// Boot
(async function boot() {
  // clock
  if (elClock()) elClock().textContent = nowHHMMSS();
  setInterval(() => {
    if (elClock()) elClock().textContent = nowHHMMSS();
  }, 1000);

  wireKeyboard();
  renderBoard();

  try {
    await loadWords();
    setMsg(`✅ Kata siap (${WORDS.length} kata).`);
    initRound(pickRandom(WORDS).toUpperCase());
  } catch (e) {
    console.error(e);
    setMsg("❌ Gagal load words.txt. Pastikan file ada di root repo.");
    return;
  }

  pollTikTok();
})();
