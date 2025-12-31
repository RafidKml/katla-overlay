let last = { username: "", comment: "", ts: 0 };

export default async function handler(req, res) {
  // biar TikFinity ga ribet soal CORS
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();

  if (req.method === "POST") {
    const { username, comment } = req.body || {};
    if (typeof username === "string" && typeof comment === "string") {
      last = { username, comment, ts: Date.now() };
    }
    return res.status(200).json({ ok: true });
  }

  // GET buat overlay ambil komentar terakhir
  return res.status(200).json(last);
}
