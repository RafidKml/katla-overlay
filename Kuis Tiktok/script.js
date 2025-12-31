const boardEl = document.getElementById("board");
const msgEl = document.getElementById("message");

const timerEl = document.getElementById("nextTimer");
const timerSecEl = document.getElementById("timerSec");

const MAX_TRY = 6;
const NEXT_DELAY = 15;

let board = [];
let row = 0;
let col = 0;
let finished = false;

let wordList = [];
let WORD = "";

let countdown = null;

// ===================== LOAD WORDS =====================
fetch("words.txt")
  .then((r) => r.text())
  .then((text) => {
    wordList = text
      .split("\n")
      .map((w) => w.trim().toUpperCase())
      .filter((w) => w.length === 5);

    startNewRound();
  });

// ===================== BUILD BOARD =====================
for (let r = 0; r < MAX_TRY; r++) {
  const rowEl = document.createElement("div");
  rowEl.className = "row";
  board[r] = [];

  for (let c = 0; c < 5; c++) {
    const cell = document.createElement("div");
    cell.className = "cell";
    rowEl.appendChild(cell);
    board[r][c] = cell;
  }

  boardEl.appendChild(rowEl);
}

// ===================== INPUT =====================
document.addEventListener("keydown", (e) => {
  // kalau lagi countdown selesai game, jangan bisa ngetik
  if (finished) return;

  if (/^[a-zA-Z]$/.test(e.key)) inputLetter(e.key.toUpperCase());
  if (e.key === "Backspace") delLetter();
  if (e.key === "Enter") submitGuess();
});

function inputLetter(k) {
  if (col < 5) {
    board[row][col].innerText = k;
    col++;
  }
}

function delLetter() {
  if (col > 0) {
    col--;
    board[row][col].innerText = "";
  }
}

function submitGuess() {
  if (col < 5) {
    msgEl.className = "";
    msgEl.innerText = "Kata harus 5 huruf";
    return;
  }

  const guess = board[row].map((c) => c.innerText).join("");

  // validasi kata
  if (!wordList.includes(guess)) {
    msgEl.className = "";
    msgEl.innerText = "❌ Kata tidak valid";
    return;
  }

  revealColors(guess);

  // menang?
  if (guess === WORD) {
    endRound(true);
    return;
  }

  // lanjut row
  row++;
  col = 0;

  // kalah?
  if (row >= MAX_TRY) {
    endRound(false);
  }
}

// ===================== COLOR LOGIC =====================
// Ini versi sederhana: hijau kalau tepat posisi, kuning kalau huruf ada, abu kalau tidak.
// (Kalau mau 100% akurat Wordle untuk huruf double, bilang. Itu ada algoritmanya.)
function revealColors(guess) {
  for (let i = 0; i < 5; i++) {
    const cell = board[row][i];
    setTimeout(() => {
      if (guess[i] === WORD[i]) cell.classList.add("correct");
      else if (WORD.includes(guess[i])) cell.classList.add("present");
      else cell.classList.add("absent");
    }, i * 200);
  }
}

// ===================== END ROUND + COUNTDOWN =====================
function endRound(isWin) {
  finished = true;

  if (isWin) {
    msgEl.className = "win";
    msgEl.innerText = "🎉 BENAR!";
  } else {
    msgEl.className = "lose";
    msgEl.innerText = `❌ Jawaban: ${WORD}`;
  }

  startNextRoundCountdown();
}

function startNextRoundCountdown() {
  clearInterval(countdown);

  let s = NEXT_DELAY;
  timerSecEl.innerText = s;
  timerEl.classList.remove("hidden");

  countdown = setInterval(() => {
    s--;
    timerSecEl.innerText = s;

    if (s <= 0) {
      clearInterval(countdown);
      timerEl.classList.add("hidden");
      startNewRound();
    }
  }, 1000);
}

// ===================== NEW ROUND =====================
function startNewRound() {
  // stop timer kalau ada
  clearInterval(countdown);
  timerEl.classList.add("hidden");

  // ambil kata baru random
  WORD = wordList[Math.floor(Math.random() * wordList.length)];

  // reset state
  row = 0;
  col = 0;
  finished = false;
  msgEl.className = "";
  msgEl.innerText = "";

  // bersihin board
  for (let r = 0; r < MAX_TRY; r++) {
    for (let c = 0; c < 5; c++) {
      const cell = board[r][c];
      cell.innerText = "";
      cell.className = "cell";
    }
  }

  console.log("WORD:", WORD); // hapus kalau udah yakin
}
