// ------- tiny seeded RNG -------
function mulberry32(seed) {
  let t = seed >>> 0;
  return function () {
    t += 0x6D2B79F5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

// ------- helpers -------
async function loadJson(path) {
  const res = await fetch(path, { cache: "no-store" });
  if (!res.ok) throw new Error(`Failed to load ${path}: ${res.status}`);
  return res.json();
}

function pickRandom(arr, rnd) {
  return arr[Math.floor(rnd() * arr.length)];
}

// ------- scoring -------
function computeScore(questions, dimWeights, thresholds, answers) {
  const getDimId = (q) =>
    (dimWeights && dimWeights[q.dimension]) ? Number(dimWeights[q.dimension]) : 1;

  let total = 0;
  const perDim = {};
  const rows = [];

  for (const q of questions) {
    const qWeight = Number(q.weight ?? 1);
    const dim = q.dimension ?? "general";
    const dw = getDimId(q.dim);
    const chosen = answers[q.id];
    const opt = (q.options || []).find((o) => o.key == chosen);

    const val = Number(opt?.value ?? 0);
    const contrib = val * qWeight * dw;

    total += contrib;
    perDim[dim] = (perDim[dim] ?? 0) + contrib;

    rows.push({
      questionId: q.id,
      dimension: dim,
      weight: qWeight,
      dimWeight: dw,
      selected: chosen,
      optionValue: val,
      contribution: contrib,
    });
  }

  const passNote =
    total >= (thresholds?.pass ?? 0) ? "PASS ✅" : "FAIL ❌";

  return { total, perDim, passNote, rows, answers };
}

// ------- main runner -------
async function runEmployeeTest({ seed = 42, user = "test", attemptId = "demo" }) {
  const rnd = mulberry32(seed);

  // load bank
  const bank = await loadJson("./docs/question_bank_v3.json");
  const weights = await loadJson("./docs/weights.json");
  const thresholds = await loadJson("./docs/thresholds.json");

  const questions = bank.questions;

  // generate fake answers (للتجربة فقط)
  const answers = {};
  for (const q of questions) {
    const opts = q.options || q.scaleLabels || ["0", "1", "2", "3", "4"];
    const choice = pickRandom(opts, rnd);
    answers[q.id] = choice;
  }

  const { total, perDim, passNote, rows } = computeScore(
    questions,
    weights,
    thresholds,
    answers
  );

  const out = document.getElementById("test-output");
  out.innerHTML = `
    <div><b>User:</b> ${user}</div>
    <div><b>Attempt:</b> ${attemptId}</div>
    <div><b>Seed:</b> ${seed}</div>
    <div><b>Total Score:</b> ${total} → ${passNote}</div>
    <pre>${JSON.stringify(perDim, null, 2)}</pre>
  `;

  return { total, perDim, passNote, rows, answers, meta: { attemptId, user, seed } };
}

// expose to window
window.runEmployeeTest = runEmployeeTest;
