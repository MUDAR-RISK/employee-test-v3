<script>
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
function computeScore({ questions, dimWeights, thresholds, answers }) {
  // defaults
  const getDimW = (d) => (dimWeights && dimWeights[d] ? Number(dimWeights[d]) : 1);

  let total = 0;
  const perDim = {};
  const rows = [];

  for (const q of questions) {
    const qWeight = Number(q.weight ?? 1);
    const dim = q.dimension ?? "general";
    const dw = getDimW(dim);
    const chosen = answers[q.id];
    const opt = (q.options || []).find(o => o.key === chosen);

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
      contribution: contrib
    });
  }

  // thresholds can be:
  // { total: <number> } OR { total: { pass: <number> }, dimensions: { risk: { pass: <n> }, ... } }
  let passNote = "No threshold configured";
  if (thresholds) {
    const totalPass = (typeof thresholds.total === "number")
      ? thresholds.total
      : (typeof thresholds.total?.pass === "number" ? thresholds.total.pass : null);

    if (totalPass != null) {
      passNote = total >= totalPass ? "PASS" : "FAIL";
    } else {
      passNote = "No total threshold configured";
    }
  }

  return { total, perDim, rows, passNote };
}

// ------- main test runner -------
async function runEmployeeTest({ seed = 42, attemptId = Date.now().toString(), user = "tester" } = {}) {
  const base = "./"; // running inside docs/

  // Load data
  const qb = await loadJson(base + "question_bank_v3.json").catch(async () => {
    // fallback: try docs/questions (if it’s a folder with an index.json, adapt if needed)
    return loadJson(base + "questions");
  });

  const weights = await loadJson(base + "weights.json").catch(() => ({}));
  const thresholds = await loadJson(base + "thresholds.json").catch(() => (null));

  // Normalize shapes
  const questions = Array.isArray(qb?.questions) ? qb.questions : (Array.isArray(qb) ? qb : []);
  const dimWeights = weights?.dimensions || weights; // support {dimensions:{...}} OR flat {risk:1.5,...}

  // Simulate answers
  const rnd = mulberry32(Number(seed) || 42);
  const answers = {};
  for (const q of questions) {
    const opts = q.options || [];
    if (opts.length === 0) continue;
    const picked = pickRandom(opts.map(o => o.key), rnd);
    answers[q.id] = picked;
  }

  // Score
  const { total, perDim, rows, passNote } = computeScore({ questions, dimWeights, thresholds, answers });

  // Render to page
  const out = document.getElementById("test-output");
  if (out) {
    out.innerHTML = "";

    const h = document.createElement("pre");
    h.textContent =
`Attempt ${attemptId} by ${user}
Questions: ${questions.length} | Seed: ${seed}
Dimension scores: ${JSON.stringify(perDim, null, 2)}
TOTAL: ${total}  (${passNote})`;
    out.appendChild(h);

    // Table
    const table = document.createElement("table");
    table.border = "1";
    const head = document.createElement("tr");
    ["QID","Dim","Q.Weight","Dim.W","Selected","Opt.Val","Contribution"].forEach(c=>{
      const th = document.createElement("th"); th.textContent = c; head.appendChild(th);
    });
    table.appendChild(head);

    for (const r of rows) {
      const tr = document.createElement("tr");
      [r.questionId, r.dimension, r.weight, r.dimWeight, r.selected, r.optionValue, r.contribution]
      .forEach(v => { const td = document.createElement("td"); td.textContent = v; tr.appendChild(td); });
      table.appendChild(tr);
    }
    out.appendChild(table);
  }

  return { total, perDim, passNote, rows, answers, meta: { attemptId, user, seed } };
}

// expose to window
window.runEmployeeTest = runEmployeeTest;
</script>
