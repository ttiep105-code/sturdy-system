/**
 * APP STATE
 */
let decks = JSON.parse(localStorage.getItem("hanyu_decks"));
if (!decks) {
  let oldData = JSON.parse(localStorage.getItem("hanyu_master_data")) || [];
  decks = [{ id: "default", name: "Mặc định", words: oldData }];
  localStorage.setItem("hanyu_decks", JSON.stringify(decks));
}
let activeDeckId = localStorage.getItem("hanyu_active_deck") || decks[0].id;
if (!decks.find((d) => d.id === activeDeckId)) activeDeckId = decks[0].id;

let vocabulary = decks.find((d) => d.id === activeDeckId).words;
let currentItem = null;
let currentSentence = null;
let practiceType = "word"; // word or sentence
let flashMode = "vi-zh"; // Vietnamese -> Chinese
let scores = { flash: 0, quiz: 0 };
let matchLevel = 1;
let matchCards = [];
let matchFlipped = [];
let matchMatches = 0;

let speedTimerInterval = null;
let speedTimeRemaining = 5;
let speedCombo = 0;
let speedScore = 0;
let speedMistakes = 0;
let speedCurrentItem = null;

// Sniper Mode States
let sniperSpawners = [];
let sniperSpeed = 6000;
let sniperLives = 5;
let sniperScore = 0;
let sniperLevel = 1;
let sniperTargetItem = null;

/**
 * INITIALIZATION
 */
document.addEventListener("DOMContentLoaded", () => {
  updateFlashcardDeckSelector();
  updateDecksUI();
  updateVocabUI();
  initTheme();

  // Auto POS detect mapping
  const posMap = {
    我: "pronoun",
    你: "pronoun",
    他: "pronoun",
    她: "pronoun",
    我们: "pronoun",
    你们: "pronoun",
    他们: "pronoun",
    吃: "verb",
    喝: "verb",
    看: "verb",
    去: "verb",
    做: "verb",
    买: "verb",
    喜欢: "verb",
    想: "verb",
    有: "verb",
    学习: "verb",
  };

  const inputEl = document.getElementById("chinese-input");
  if (inputEl) {
    inputEl.addEventListener("input", (e) => {
      const val = e.target.value.trim();
      const mapped = posMap[val];
      const posSelect = document.getElementById("pos-input");
      if (mapped && posSelect) {
        posSelect.value = mapped;
      } else if (!val && posSelect) {
        posSelect.value = "none";
      }
    });
  }

  document.getElementById("add-btn").addEventListener("click", handleAddWord);
  document
    .getElementById("flash-submit")
    .addEventListener("click", checkFlashcard);
  document
    .getElementById("flash-next")
    .addEventListener("click", () => loadFlashcard());
  document
    .getElementById("theme-toggle")
    .addEventListener("click", toggleTheme);
  document
    .getElementById("excel-upload")
    .addEventListener("change", handleExcelImport);

  // Accessibility: Enter key support
  document.getElementById("flash-answer").addEventListener("keypress", (e) => {
    if (e.key === "Enter") checkFlashcard();
  });

  // Mobile Web Speech API Initialization
  let speechInitialized = false;
  const initSpeech = () => {
    if (speechInitialized) return;
    if ("speechSynthesis" in window) {
      const msg = new SpeechSynthesisUtterance("");
      msg.volume = 0;
      window.speechSynthesis.speak(msg);
    }
    speechInitialized = true;
    document.removeEventListener("click", initSpeech);
    document.removeEventListener("touchstart", initSpeech);
  };
  document.addEventListener("click", initSpeech);
  document.addEventListener("touchstart", initSpeech);
});

/**
 * CORE DATA LOGIC
 */
async function handleAddWord() {
  const input = document.getElementById("chinese-input");
  const btn = document.getElementById("add-btn");
  const zh = input.value.trim();
  if (!zh) return;

  btn.disabled = true;
  const originalText = btn.innerText;
  btn.innerText = "Loading...";

  input.disabled = true;
  input.placeholder = "Translating...";
  await processWord(zh);
  input.value = "";
  input.disabled = false;
  input.placeholder = "Enter Hanzi (e.g. 学习)";

  btn.disabled = false;
  btn.innerText = originalText;
}

async function processWord(
  chinese,
  pinyin = null,
  vietnamese = null,
  posOverride = null,
  skipSave = false,
) {
  if (vocabulary.find((v) => v.zh === chinese)) return;

  let finalVi = vietnamese || "";
  let finalPy = pinyin || "";

  let posSelect = document.getElementById("pos-input")
    ? document.getElementById("pos-input").value
    : "none";
  if (posOverride && posOverride !== "") posSelect = posOverride;

  try {
    if (!vietnamese) finalVi = (await fetchTranslation(chinese)) || "";
  } catch (e) {
    console.warn("Failed to fetch translation:", e);
  }

  try {
    if (!pinyin) finalPy = (await fetchPinyin(chinese)) || "";
  } catch (e) {
    console.warn("Failed to fetch pinyin:", e);
  }

  const entry = {
    id: Date.now() + Math.random(),
    zh: chinese,
    py: finalPy,
    vi: finalVi,
    weight: 5, // Used for spaced repetition logic
    pos: posSelect,
  };

  vocabulary.push(entry);
  if (!skipSave) saveAndRefresh();
}

/**
 * DECKS LOGIC
 */
function switchDeck(id) {
  activeDeckId = id;
  localStorage.setItem("hanyu_active_deck", id);
  vocabulary = decks.find((d) => d.id === activeDeckId).words;
  updateDecksUI();
  updateVocabUI();
}

function createNewDeck() {
  const name = prompt("Tên bộ từ vựng mới:");
  if (!name) return;
  const newDeck = { id: Date.now().toString(), name, words: [] };
  decks.push(newDeck);
  switchDeck(newDeck.id);
  saveData();
}

function renameDeck(id, e) {
  e.stopPropagation();
  const deck = decks.find((d) => d.id === id);
  if (!deck) return;
  const newName = prompt("Rename deck to:", deck.name);
  if (newName) {
    deck.name = newName;
    updateFlashcardDeckSelector();
    saveAndRefresh();
  }
}

function destroyDeck(id, e) {
  e.stopPropagation();
  if (decks.length === 1) {
    alert("Cannot delete the last deck.");
    return;
  }
  if (confirm("Delete this entire deck?")) {
    decks = decks.filter((d) => d.id !== id);
    if (activeDeckId === id) switchDeck(decks[0].id);
    else saveAndRefresh();
    updateFlashcardDeckSelector();
  }
}

function updateDecksUI() {
  const container = document.getElementById("decks-list");
  if (!container) return;
  container.innerHTML = "";
  decks.forEach((d) => {
    const card = document.createElement("div");
    card.className = `deck-card ${d.id === activeDeckId ? "active" : ""}`;
    card.onclick = () => switchDeck(d.id);
    card.innerHTML = `
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom: 0.5rem;">
        <div class="deck-title" style="margin-bottom:0;">${d.name}</div>
        <div>
           <button class="btn-sm" style="background:none; border:none; color:var(--text-sub); cursor:pointer;" onclick="renameDeck('${d.id}', event)"><i class="fas fa-edit"></i></button>
           <button class="btn-sm" style="background:none; border:none; color:var(--error); cursor:pointer;" onclick="destroyDeck('${d.id}', event)"><i class="fas fa-trash"></i></button>
        </div>
      </div>
      <div class="deck-count">${d.words.length} từ</div>
    `;
    container.appendChild(card);
  });
  const currentDeckNameEl = document.getElementById("current-deck-name");
  if (currentDeckNameEl) {
    currentDeckNameEl.innerText = decks.find((d) => d.id === activeDeckId).name;
  }
}

function updateFlashcardDeckSelector() {
  const sel = document.getElementById("flashcard-deck-select");
  if (!sel) return;
  const currVal = sel.value;
  sel.innerHTML = `<option value="all">All Decks</option>`;
  decks.forEach((d) => {
    sel.innerHTML += `<option value="${d.id}">${d.name}</option>`;
  });
  if (Array.from(sel.options).some((o) => o.value === currVal))
    sel.value = currVal;
}

/**
 * EXCEL IMPORT
 */
let sheetJSLoaded = false;
async function loadSheetJS() {
  if (sheetJSLoaded) return;

  // Show loading indicator
  const uploadBtn = document.querySelector(".import-tools .btn-secondary");
  const originalHtml = uploadBtn ? uploadBtn.innerHTML : "";
  if (uploadBtn)
    uploadBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Loading...';

  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src =
      "https://cdn.sheetjs.com/xlsx-0.20.1/package/dist/xlsx.full.min.js";
    script.onload = () => {
      sheetJSLoaded = true;
      if (uploadBtn) uploadBtn.innerHTML = originalHtml;
      resolve();
    };
    script.onerror = () => {
      if (uploadBtn) uploadBtn.innerHTML = originalHtml;
      alert(
        "Failed to load Excel library. Please check your internet connection.",
      );
      reject(new Error("Failed to load SheetJS"));
    };
    document.head.appendChild(script);
  });
}
async function handleExcelImport(event) {
  const file = event.target.files[0];
  if (!file) return;
  // Reset immediately so the exact same file can trigger change again
  event.target.value = "";

  try {
    await loadSheetJS();
  } catch (e) {
    return;
  }

  const uploadBtn = document.querySelector(".import-tools .btn-secondary");
  const originalHtml = uploadBtn ? uploadBtn.innerHTML : "";
  if (uploadBtn)
    uploadBtn.innerHTML =
      '<i class="fas fa-spinner fa-spin"></i> Processing...';

  const reader = new FileReader();
  reader.onload = async (e) => {
    try {
      const data = new Uint8Array(e.target.result);
      const workbook = XLSX.read(data, { type: "array" });
      const rawRows = XLSX.utils.sheet_to_json(
        workbook.Sheets[workbook.SheetNames[0]],
        { header: 1 },
      );

      let startIndex = 0;
      if (rawRows.length > 0 && rawRows[0]) {
        const firstRowStr = rawRows[0]
          .map((s) => String(s || "").toLowerCase())
          .join("");
        if (
          firstRowStr.includes("chinese") ||
          firstRowStr.includes("hanzi") ||
          firstRowStr.includes("zh") ||
          firstRowStr.includes("từvựng") ||
          firstRowStr.includes("tiếngtrung") ||
          firstRowStr.includes("từ")
        ) {
          startIndex = 1;
        }
      }

      for (let i = startIndex; i < rawRows.length; i++) {
        const row = rawRows[i];
        if (!row || !row[0]) continue;

        const zh = String(row[0]).trim();
        // Ignore visual empty lines
        if (!zh || zh === "") continue;

        let py = row[1] ? String(row[1]).trim() : "";
        let vi = row[2] ? String(row[2]).trim() : "";
        let rawPos = row[3] ? String(row[3]).toLowerCase().trim() : "";

        // If they skipped pinyin and put meaning in column B
        if (py !== "" && vi === "" && rawPos === "") {
          // Basic heuristic, if it has no latin characters it might be vietnamese, but lets just trust columns
        }

        let pos = "none";
        // Exact match english keywords to prevent 'proNOUN' triggering 'noun'
        if (rawPos === "noun" || rawPos.includes("danh")) pos = "noun";
        else if (
          rawPos === "verb" ||
          rawPos.includes("động") ||
          rawPos.includes("dong")
        )
          pos = "verb";
        else if (
          rawPos === "pronoun" ||
          rawPos.includes("đại") ||
          rawPos.includes("dai")
        )
          pos = "pronoun";
        else if (
          rawPos === "adj" ||
          rawPos === "adjective" ||
          rawPos.includes("tính") ||
          rawPos.includes("tinh")
        )
          pos = "adj";

        await processWord(zh, py, vi, pos, true);
      }
      saveAndRefresh();
      alert("Import successful!");
    } catch (err) {
      console.error(err);
      alert(
        "Failed to import. The file might be corrupted or poorly formatted.",
      );
    } finally {
      if (uploadBtn) uploadBtn.innerHTML = originalHtml;
    }
  };
  reader.readAsArrayBuffer(file);
}

async function downloadTemplate() {
  try {
    await loadSheetJS();
  } catch (e) {
    return;
  }
  const data = [
    ["Chinese", "Pinyin", "Vietnamese", "Type"],
    ["我", "wǒ", "Tôi", "pronoun"],
    ["吃", "chī", "Ăn", "verb"],
    ["苹果", "píng guǒ", "Quả táo", "noun"],
    ["好", "hǎo", "Tốt / Khỏe", "adj"],
    ["学习", "xué xí", "Học tập", "verb"],
  ];
  const ws = XLSX.utils.aoa_to_sheet(data);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Template");
  XLSX.writeFile(wb, "HanyuMaster_Template.xlsx");
}

/**
 * FLASHCARD LOGIC
 */
function changePracticeType() {
  const rb = document.querySelector('input[name="practice-type"]:checked');
  if (rb) practiceType = rb.value;
  loadFlashcard();
}

function loadSentenceFlashcard() {
  document.getElementById("sentence-warning").classList.remove("hidden");
  const selDeckId = document.getElementById("flashcard-deck-select").value;
  let allWords =
    selDeckId === "all"
      ? decks.flatMap((d) => d.words)
      : decks.find((d) => d.id === selDeckId)?.words || [];

  const validWords = allWords.filter((w) =>
    ["noun", "verb", "adj", "pronoun"].includes(w.pos),
  );

  if (validWords.length === 0) {
    alert(
      "Bộ từ vựng cần có ít nhất 1 từ được phân loại (Danh từ, Động từ, Tính từ, Đại từ) để tạo câu.",
    );
    const wb = document.querySelector(
      'input[name="practice-type"][value="word"]',
    );
    if (wb) {
      wb.checked = true;
      changePracticeType();
    }
    return;
  }

  const sentenceTemplates = {
    noun: [
      {
        zh: "我喜欢这个[word]。",
        py: "wǒ xǐ huan zhè ge [word].",
        vi: "Tôi thích [word] này.",
      },
      {
        zh: "你有[word]吗？",
        py: "nǐ yǒu [word] ma?",
        vi: "Bạn có [word] không?",
      },
      {
        zh: "我想买[word]。",
        py: "wǒ xiǎng mǎi [word].",
        vi: "Tôi muốn mua [word].",
      },
      {
        zh: "那是我的[word]。",
        py: "nà shì wǒ de [word].",
        vi: "Đó là [word] của tôi.",
      },
      { zh: "[word]在哪里？", py: "[word] zài nǎ lǐ?", vi: "[word] ở đâu?" },

      // thêm câu có ngữ cảnh
      {
        zh: "这个[word]对我来说很重要。",
        py: "zhè ge [word] duì wǒ lái shuō hěn zhòng yào.",
        vi: "[word] này rất quan trọng với tôi.",
      },
      {
        zh: "我每天都会用这个[word]。",
        py: "wǒ měi tiān dōu huì yòng zhè ge [word].",
        vi: "Tôi dùng [word] này mỗi ngày.",
      },
      {
        zh: "如果没有[word]，会很麻烦。",
        py: "rú guǒ méi yǒu [word], huì hěn má fan.",
        vi: "Nếu không có [word] thì sẽ rất phiền.",
      },
      {
        zh: "这个[word]的质量很好。",
        py: "zhè ge [word] de zhì liàng hěn hǎo.",
        vi: "Chất lượng của [word] này rất tốt.",
      },
    ],

    verb: [
      { zh: "我想[word]。", py: "wǒ xiǎng [word].", vi: "Tôi muốn [word]." },
      {
        zh: "他正在[word]。",
        py: "tā zhèng zài [word].",
        vi: "Anh ấy đang [word].",
      },
      {
        zh: "大家一起[word]吧！",
        py: "dà jiā yì qǐ [word] ba!",
        vi: "Mọi người cùng nhau [word] đi!",
      },
      {
        zh: "你可以[word]吗？",
        py: "nǐ kě yǐ [word] ma?",
        vi: "Bạn có thể [word] không?",
      },
      { zh: "不要[word]。", py: "bú yào [word].", vi: "Đừng [word]." },

      // thêm câu thực tế hơn
      {
        zh: "我已经学会怎么[word]了。",
        py: "wǒ yǐ jīng xué huì zěn me [word] le.",
        vi: "Tôi đã học được cách [word] rồi.",
      },
      {
        zh: "他每天都会花时间[word]。",
        py: "tā měi tiān dōu huì huā shí jiān [word].",
        vi: "Anh ấy mỗi ngày đều dành thời gian để [word].",
      },
      {
        zh: "如果你努力，就可以[word]。",
        py: "rú guǒ nǐ nǔ lì, jiù kě yǐ [word].",
        vi: "Nếu bạn cố gắng thì có thể [word].",
      },
      {
        zh: "我不太喜欢[word]，因为太累了。",
        py: "wǒ bú tài xǐ huan [word], yīn wèi tài lèi le.",
        vi: "Tôi không thích [word] lắm vì quá mệt.",
      },
    ],

    adj: [
      {
        zh: "这个很[word]。",
        py: "zhè ge hěn [word].",
        vi: "Cái này rất [word].",
      },
      {
        zh: "真的太[word]了！",
        py: "zhēn de tài [word] le!",
        vi: "Thực sự quá [word] rồi!",
      },
      {
        zh: "我觉得非常[word]。",
        py: "wǒ jué de fēi cháng [word].",
        vi: "Tôi cảm thấy vô cùng [word].",
      },
      {
        zh: "它一点都不[word]。",
        py: "tā yì diǎn dōu bù [word].",
        vi: "Nó một chút cũng không [word].",
      },

      // nâng cấp
      {
        zh: "这个地方又[word]又安静。",
        py: "zhè ge dì fang yòu [word] yòu ān jìng.",
        vi: "Nơi này vừa [word] vừa yên tĩnh.",
      },
      {
        zh: "今天的天气比昨天更[word]。",
        py: "jīn tiān de tiān qì bǐ zuó tiān gèng [word].",
        vi: "Thời tiết hôm nay [word] hơn hôm qua.",
      },
      {
        zh: "这个问题没有你想的那么[word]。",
        py: "zhè ge wèn tí méi yǒu nǐ xiǎng de nà me [word].",
        vi: "Vấn đề này không [word] như bạn nghĩ.",
      },
      {
        zh: "我对这个结果很[word]。",
        py: "wǒ duì zhè ge jié guǒ hěn [word].",
        vi: "Tôi rất [word] với kết quả này.",
      },
    ],

    pronoun: [
      {
        zh: "[word]是我的好朋友。",
        py: "[word] shì wǒ de hǎo péng you.",
        vi: "[word] là bạn tốt của tôi.",
      },
      {
        zh: "这是[word]的东西。",
        py: "zhè shì [word] de dōng xi.",
        vi: "Đây là đồ của [word].",
      },
      {
        zh: "我要和[word]一起去。",
        py: "wǒ yào hé [word] yì qǐ qù.",
        vi: "Tôi muốn đi cùng [word].",
      },
      {
        zh: "[word]不知道。",
        py: "[word] bù zhī dào.",
        vi: "[word] không biết.",
      },

      // thêm chiều sâu
      {
        zh: "[word]已经告诉我答案了。",
        py: "[word] yǐ jīng gào sù wǒ dá àn le.",
        vi: "[word] đã nói cho tôi câu trả lời rồi.",
      },
      {
        zh: "没有[word]，我可能做不到。",
        py: "méi yǒu [word], wǒ kě néng zuò bú dào.",
        vi: "Không có [word], tôi có thể không làm được.",
      },
      {
        zh: "[word]总是支持我。",
        py: "[word] zǒng shì zhī chí wǒ.",
        vi: "[word] luôn ủng hộ tôi.",
      },
      {
        zh: "这件事只有[word]知道。",
        py: "zhè jiàn shì zhǐ yǒu [word] zhī dào.",
        vi: "Chuyện này chỉ có [word] biết.",
      },
    ],
  };

  const targetWord = validWords[Math.floor(Math.random() * validWords.length)];
  const pool = sentenceTemplates[targetWord.pos];
  const template = pool[Math.floor(Math.random() * pool.length)];

  const lowerVi = targetWord.vi.toLowerCase();
  currentSentence = {
    zh: template.zh.replace("[word]", targetWord.zh),
    py: template.py.replace("[word]", targetWord.py),
    vi: template.vi.replace("[word]", lowerVi),
  };

  const feedback = document.getElementById("flash-feedback");
  const input = document.getElementById("flash-answer");

  feedback.innerText = "";
  input.value = "";
  input.focus();

  document.getElementById("flash-prompt").innerText =
    flashMode === "vi-zh" ? currentSentence.vi : currentSentence.zh;
  document.getElementById("flash-mode-label").innerText =
    flashMode === "vi-zh"
      ? "Dịch sang tiếng Trung Quốc:"
      : "Dịch sang tiếng Việt:";
}

function loadFlashcard() {
  document.getElementById("sentence-warning")?.classList.add("hidden");
  if (practiceType === "sentence") {
    loadSentenceFlashcard();
    return;
  }

  const selDeckId = document.getElementById("flashcard-deck-select").value;
  let words =
    selDeckId === "all"
      ? decks.flatMap((d) => d.words)
      : decks.find((d) => d.id === selDeckId)?.words || [];

  if (words.length === 0) return;

  // Spaced Repetition: Sort by weight and pick from top 60%
  const pool = [...words]
    .sort((a, b) => {
      if (b.weight === a.weight) return b.id - a.id;
      return b.weight - a.weight;
    })
    .slice(0, Math.max(1, Math.ceil(words.length * 0.6)));
  currentItem = pool[Math.floor(Math.random() * pool.length)];

  const feedback = document.getElementById("flash-feedback");
  const input = document.getElementById("flash-answer");

  feedback.innerText = "";
  input.value = "";
  input.focus();

  document.getElementById("flash-prompt").innerText =
    flashMode === "vi-zh" ? currentItem.vi : currentItem.zh;
  document.getElementById("flash-mode-label").innerText =
    flashMode === "vi-zh"
      ? "Translate to Chinese:"
      : "Translate to Vietnamese:";
}

function checkSentenceFlashcard() {
  const input = document
    .getElementById("flash-answer")
    .value.trim()
    .toLowerCase();
  const feedback = document.getElementById("flash-feedback");
  const correctVal =
    flashMode === "vi-zh"
      ? currentSentence.zh
      : currentSentence.vi.toLowerCase();

  speak(currentSentence.zh);

  if (input === correctVal.toLowerCase()) {
    feedback.innerText = `Correct! (${currentSentence.py})`;
    feedback.className = "feedback correct";
    scores.flash++;
    setTimeout(loadFlashcard, 1500);
  } else {
    feedback.innerText = `Incorrect. The answer is: ${correctVal} (${currentSentence.py})`;
    feedback.className = "feedback wrong";
  }
  document.getElementById("flash-score").innerText = scores.flash;
}

function checkFlashcard() {
  if (practiceType === "sentence") {
    checkSentenceFlashcard();
    return;
  }

  const input = document
    .getElementById("flash-answer")
    .value.trim()
    .toLowerCase();
  const feedback = document.getElementById("flash-feedback");
  const viText = currentItem.vi || "";
  const correctVal =
    flashMode === "vi-zh" ? currentItem.zh : viText.toLowerCase();

  // Voice prompt triggers for every answer check
  speak(currentItem.zh);

  if (input === correctVal) {
    feedback.innerText = `Correct! (${currentItem.py})`;
    feedback.className = "feedback correct";
    scores.flash++;
    currentItem.weight = Math.max(1, currentItem.weight - 1);
    setTimeout(loadFlashcard, 1500);
  } else {
    feedback.innerText = `Incorrect. The answer is: ${correctVal} (${currentItem.py})`;
    feedback.className = "feedback wrong";
    currentItem.weight += 2;
  }
  document.getElementById("flash-score").innerText = scores.flash;
  saveData();
}

/**
 * REVISED QUIZ LOGIC
 */
function loadQuiz() {
  if (vocabulary.length < 4) return alert("Add at least 4 words first!");

  currentItem = vocabulary[Math.floor(Math.random() * vocabulary.length)];

  document.getElementById("quiz-question").innerText = currentItem.vi;
  document.getElementById("quiz-feedback").innerText = "";
  document.getElementById("quiz-next").classList.add("hidden");

  // Generate options
  let options = [currentItem.zh];
  while (options.length < 4) {
    let rand = vocabulary[Math.floor(Math.random() * vocabulary.length)].zh;
    if (!options.includes(rand)) options.push(rand);
  }
  options.sort(() => Math.random() - 0.5);

  const container = document.getElementById("quiz-options");
  container.innerHTML = "";
  options.forEach((opt) => {
    const btn = document.createElement("button");
    btn.className = "option-btn";
    btn.innerText = opt;
    btn.onclick = () => checkQuiz(opt, btn);
    container.appendChild(btn);
  });
}

function checkQuiz(selected, btn) {
  // 1. Disable all buttons to prevent changing answer or skipping
  const allBtns = document.querySelectorAll(".option-btn");
  allBtns.forEach((b) => (b.disabled = true));

  const feedback = document.getElementById("quiz-feedback");

  // 2. Audio feedback for every selection (Correct or Incorrect)
  speak(currentItem.zh);

  if (selected === currentItem.zh) {
    btn.style.borderColor = "var(--success)";
    btn.style.color = "var(--success)";
    feedback.innerText = "Correct!";
    feedback.className = "feedback correct";
    scores.quiz++;
  } else {
    btn.style.borderColor = "var(--error)";
    btn.style.color = "var(--error)";
    feedback.innerText = `Incorrect. It is ${currentItem.zh} (${currentItem.py})`;
    feedback.className = "feedback wrong";

    // Highlight the correct answer button
    allBtns.forEach((b) => {
      if (b.innerText === currentItem.zh) {
        b.style.borderColor = "var(--success)";
        b.style.color = "var(--success)";
        b.style.backgroundColor = "rgba(0, 184, 148, 0.1)";
      }
    });
  }

  document.getElementById("quiz-score").innerText = scores.quiz;

  // 3. Only show "Next" after an answer is chosen
  const nextBtn = document.getElementById("quiz-next");
  nextBtn.classList.remove("hidden");
  nextBtn.onclick = loadQuiz;
}

/**
 * UTILITIES
 */
async function fetchTranslation(text) {
  try {
    const targetUrl = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=zh-CN|vi-VN`;
    const res = await fetch(targetUrl);
    const data = await res.json();
    return data.responseData.translatedText;
  } catch (e) {
    console.warn("Failed to fetch translation:", e);
    return "";
  }
}

async function fetchPinyin(text) {
  try {
    const targetUrl = `https://api.pinyingenerator.com/convert?text=${encodeURIComponent(text)}`;
    const res = await fetch(
      `https://api.allorigins.win/raw?url=${encodeURIComponent(targetUrl)}`,
    );
    const data = await res.json();
    return data.pinyin || "";
  } catch {
    return "";
  }
}

function speak(text) {
  if ("speechSynthesis" in window) {
    window.speechSynthesis.cancel();
    const msg = new SpeechSynthesisUtterance(text);
    msg.lang = "zh-CN";
    window.speechSynthesis.speak(msg);
  }
}

function updateVocabUI() {
  const list = document.getElementById("vocab-list");
  if (document.getElementById("vocab-count")) {
    document.getElementById("vocab-count").innerText = vocabulary.length;
  }
  list.innerHTML = "";
  vocabulary.forEach((v) => {
    const div = document.createElement("div");
    div.className = "vocab-item";
    // Pos label formatting
    let posLabel = "";
    if (v.pos && v.pos !== "none")
      posLabel = `<span style="font-size:0.7rem; background: var(--border); padding: 2px 5px; border-radius: 4px; margin-left: 5px;">${v.pos}</span>`;

    const safeZh = v.zh.replace(/'/g, "\\'");
    div.innerHTML = `
            <button class="delete-btn" onclick="deleteWord(${v.id})"><i class="fas fa-times"></i></button>
            <div style="font-weight: bold; font-size: 1.2rem">
                ${v.zh} 
                <button class="btn-text" style="font-size:1rem; padding:0 5px; cursor:pointer;" onclick="speak('${safeZh}')" title="Pronounce word"><i class="fas fa-volume-up"></i></button>
                ${posLabel}
            </div>
            <div style="color: var(--primary); font-size: 0.8rem">${v.py}</div>
            <div style="font-size: 0.9rem">${v.vi}</div>
        `;
    list.appendChild(div);
  });
}

function deleteWord(id) {
  vocabulary = vocabulary.filter((v) => v.id !== id);
  const deck = decks.find((d) => d.id === activeDeckId);
  if (deck) deck.words = vocabulary;
  saveAndRefresh();
}

function showSection(id) {
  document
    .querySelectorAll("section")
    .forEach((s) => s.classList.remove("active"));
  document.getElementById(`${id}-section`).classList.add("active");
  if (id === "flashcard") loadFlashcard();
  if (id === "quiz") loadQuiz();
  if (id === "games") backToGameMenu();
  if (id === "listening") {
    document
      .getElementById("listening-menu-container")
      .classList.remove("hidden");
    document
      .getElementById("listening-player-container")
      .classList.add("hidden");
    renderListeningDecks();
  }
}

function toggleFlashMode() {
  flashMode = flashMode === "vi-zh" ? "zh-vi" : "vi-zh";
  loadFlashcard();
}

function saveAndRefresh() {
  updateDecksUI();
  updateVocabUI();
  saveData();
}
function saveData() {
  localStorage.setItem("hanyu_decks", JSON.stringify(decks));
  localStorage.setItem("hanyu_master_data", JSON.stringify(vocabulary));
}

function resetProgress() {
  if (confirm("Delete this entire deck?")) {
    vocabulary = [];
    decks.find((d) => d.id === activeDeckId).words = vocabulary;
    saveAndRefresh();
  }
}

function toggleTheme() {
  const curr = document.documentElement.getAttribute("data-theme");
  const target = curr === "dark" ? "light" : "dark";
  document.documentElement.setAttribute("data-theme", target);
  localStorage.setItem("hanyu_theme", target);
  document.querySelector("#theme-toggle i").className =
    target === "dark" ? "fas fa-sun" : "fas fa-moon";
}

function initTheme() {
  const saved = localStorage.getItem("hanyu_theme") || "light";
  document.documentElement.setAttribute("data-theme", saved);
  document.querySelector("#theme-toggle i").className =
    saved === "dark" ? "fas fa-sun" : "fas fa-moon";
}

/**
 * MATCHING GAME LOGIC
 */
function startMatchingGame() {
  if (vocabulary.length < 4) return alert("Add at least 4 words to play!");

  matchCards = [];
  matchFlipped = [];
  matchMatches = 0;

  const basePairs = 4;
  const targetPairs = Math.min(
    basePairs + matchLevel * 2,
    vocabulary.length,
    12,
  );

  const shuffledVocab = [...vocabulary].sort(() => Math.random() - 0.5);
  const selectedWords = shuffledVocab.slice(0, targetPairs);

  selectedWords.forEach((word) => {
    matchCards.push({
      text: word.zh,
      matchId: word.id,
      lang: "zh",
      py: word.py,
    });
    matchCards.push({ text: word.vi, matchId: word.id, lang: "vi" });
  });

  matchCards.sort(() => Math.random() - 0.5);

  document.getElementById("match-level").innerText = matchLevel;
  const grid = document.getElementById("match-grid");
  grid.innerHTML = "";

  matchCards.forEach((card, index) => {
    const el = document.createElement("div");
    el.className = "match-card";
    el.innerText = card.text;
    el.onclick = () => handleMatchCardClick(el, index, card);
    grid.appendChild(el);
  });
}

function handleMatchCardClick(el, index, card) {
  if (
    el.classList.contains("matched") ||
    el.classList.contains("flipped") ||
    matchFlipped.length >= 2
  )
    return;

  el.classList.add("flipped");
  matchFlipped.push({ el, card });

  if (card.lang === "zh") {
    speak(card.text);
  }

  if (matchFlipped.length === 2) {
    const [first, second] = matchFlipped;

    if (
      first.card.matchId === second.card.matchId &&
      first.card.lang !== second.card.lang
    ) {
      setTimeout(() => {
        first.el.classList.remove("flipped");
        second.el.classList.remove("flipped");
        first.el.classList.add("matched");
        second.el.classList.add("matched");
        matchMatches++;
        matchFlipped = [];

        if (matchMatches === matchCards.length / 2) {
          setTimeout(() => {
            alert(`Level ${matchLevel} Complete! Moving to next level.`);
            matchLevel++;
            startMatchingGame();
          }, 400);
        }
      }, 500);
    } else {
      setTimeout(() => {
        first.el.classList.remove("flipped");
        second.el.classList.remove("flipped");
        matchFlipped = [];
      }, 1000);
    }
  }
}

/**
 * GAMES HUB & SPEED QUIZ / SNIPER LOGIC
 */
function backToGameMenu() {
  document.getElementById("game-menu-container").classList.remove("hidden");
  document.getElementById("game-match-container").classList.add("hidden");
  document.getElementById("game-speed-container").classList.add("hidden");
  document.getElementById("game-sniper-container").classList.add("hidden");

  clearInterval(speedTimerInterval);
  sniperSpawners.forEach((s) => clearInterval(s));
  sniperSpawners = [];
  document.getElementById("speed-quiz-card")?.classList.remove("danger-alert");
}

function openGame(gameId) {
  document.getElementById("game-menu-container").classList.add("hidden");

  if (gameId === "match") {
    document.getElementById("game-match-container").classList.remove("hidden");
    matchLevel = 1;
    startMatchingGame();
  } else if (gameId === "speed") {
    document.getElementById("game-speed-container").classList.remove("hidden");
    speedCombo = 0;
    speedScore = 0;
    speedMistakes = 0;
    document.getElementById("speed-game-over").style.display = "none";
    startSpeedQuiz();
  } else if (gameId === "sniper") {
    document.getElementById("game-sniper-container").classList.remove("hidden");
    sniperSpeed = 6000;
    sniperLives = 5;
    sniperScore = 0;
    sniperLevel = 1;
    document.getElementById("sniper-game-over").style.display = "none";
    startSniperMode();
  }
}

function startSpeedQuiz() {
  if (vocabulary.length < 4) {
    alert("Add at least 4 words!");
    return backToGameMenu();
  }

  speedTimeRemaining = 5.0;
  speedCurrentItem = vocabulary[Math.floor(Math.random() * vocabulary.length)];
  document.getElementById("speed-question").innerText = speedCurrentItem.vi;
  document.getElementById("speed-score").innerText = speedScore;
  document.getElementById("speed-combo").innerText = speedCombo;

  const optionsContainer = document.getElementById("speed-options");
  optionsContainer.innerHTML = "";

  let options = [speedCurrentItem.zh];
  while (options.length < 4) {
    let rand = vocabulary[Math.floor(Math.random() * vocabulary.length)].zh;
    if (!options.includes(rand)) options.push(rand);
  }
  options.sort(() => Math.random() - 0.5);

  options.forEach((opt) => {
    let btn = document.createElement("button");
    btn.className = "option-btn";
    btn.innerText = opt;
    btn.onclick = () => {
      clearInterval(speedTimerInterval);
      if (opt === speedCurrentItem.zh) {
        speedCombo++;
        speedScore += 10 * speedCombo;
        btn.style.backgroundColor = "var(--success)";
        btn.style.border = "2px solid var(--success)";
        btn.style.color = "white";
        speak(speedCurrentItem.zh);
        setTimeout(startSpeedQuiz, 600);
      } else {
        speedCombo = 0;
        speedMistakes++;
        btn.style.backgroundColor = "var(--error)";
        btn.style.color = "white";
        Array.from(optionsContainer.children).forEach((c) => {
          if (c.innerText === speedCurrentItem.zh) {
            c.style.backgroundColor = "var(--success)";
            c.style.color = "white";
          }
        });

        if (speedMistakes >= 5) {
          setTimeout(endSpeedQuiz, 600);
        } else {
          setTimeout(startSpeedQuiz, 600);
        }
      }
    };
    optionsContainer.appendChild(btn);
  });

  document.getElementById("speed-quiz-card").classList.remove("danger-alert");
  clearInterval(speedTimerInterval);
  speedTimerInterval = setInterval(() => {
    speedTimeRemaining -= 0.05;
    const disp = document.getElementById("speed-timer-display");
    if (speedTimeRemaining <= 0) {
      speedTimeRemaining = 0;
      clearInterval(speedTimerInterval);
      speedCombo = 0;
      speedMistakes++;
      disp.innerText = "00.00s";

      if (speedMistakes >= 5) {
        endSpeedQuiz();
      } else {
        startSpeedQuiz();
      }
      return;
    }

    if (
      speedTimeRemaining <= 2.0 &&
      !document
        .getElementById("speed-quiz-card")
        .classList.contains("danger-alert")
    ) {
      document.getElementById("speed-quiz-card").classList.add("danger-alert");
    }
    disp.innerText =
      (speedTimeRemaining < 10 ? "0" : "") +
      speedTimeRemaining.toFixed(2) +
      "s";
  }, 50);
}

function endSpeedQuiz() {
  document.getElementById("speed-game-over").style.display = "flex";
}

function startSniperMode() {
  if (vocabulary.length < 4) {
    alert("Add at least 4 words!");
    return backToGameMenu();
  }
  document.getElementById("sniper-game-over").style.display = "none";

  sniperSpawners.forEach((s) => clearInterval(s));
  sniperSpawners = [];
  document.getElementById("sniper-canvas").innerHTML = "";

  updateSniperStats();
  sniperTargetItem = vocabulary[Math.floor(Math.random() * vocabulary.length)];
  document.getElementById("sniper-target-word").innerText = sniperTargetItem.vi;

  let spawnInterval = Math.max(800, 2000 - sniperLevel * 100);
  let sId = setInterval(spawnFlyingWord, spawnInterval);
  sniperSpawners.push(sId);
}

function spawnFlyingWord() {
  const canvas = document.getElementById("sniper-canvas");
  if (!canvas) return;

  let isTarget = Math.random() < 0.35;
  let wordObj = isTarget
    ? sniperTargetItem
    : vocabulary[Math.floor(Math.random() * vocabulary.length)];

  const el = document.createElement("div");
  el.className = "flying-word";
  el.innerText = wordObj.zh;

  const startY = Math.random() * 85;
  el.style.top = `${startY}%`;

  const fromLeft = Math.random() > 0.5;
  if (fromLeft) el.style.left = "-150px";
  else el.style.right = "-150px";

  el.onclick = () => {
    if (wordObj.zh === sniperTargetItem.zh) {
      sniperScore += 10 * sniperLevel;
      el.remove();
      speak(wordObj.zh);
      if (sniperScore % 50 === 0) {
        sniperSpeed = Math.max(1500, sniperSpeed - 600);
        sniperLevel++;
      }
      startSniperMode();
    } else {
      sniperLives--;
      updateSniperStats();
      el.style.backgroundColor = "var(--error)";
      el.style.color = "white";
      el.style.pointerEvents = "none";
      if (sniperLives <= 0) endSniperMode();
    }
  };

  canvas.appendChild(el);

  let start = Date.now();
  let flyTimer = setInterval(() => {
    let elapsed = Date.now() - start;
    let progress = elapsed / sniperSpeed;
    if (progress >= 1) {
      clearInterval(flyTimer);
      el.remove();
    } else {
      let percent = progress * 120;
      if (fromLeft) el.style.left = `calc(${percent}% - 150px)`;
      else el.style.right = `calc(${percent}% - 150px)`;
    }
  }, 16);
}

function updateSniperStats() {
  document.getElementById("sniper-score").innerText = sniperScore;
  document.getElementById("sniper-lives").innerText = 5 - sniperLives;
}

function endSniperMode() {
  sniperSpawners.forEach((s) => clearInterval(s));
  sniperSpawners = [];
  document.getElementById("sniper-game-over").style.display = "flex";
  document.querySelectorAll(".flying-word").forEach((el) => {
    el.style.pointerEvents = "none";
  });
}

/**
 * LISTENING PRACTICE LOGIC
 */
const listeningDecks = [
  {
    id: "default-1",
    title: "Bài nghe mẫu (HSK 1)",
    file: "default-listening.mp3",
    questions: [
      {
        question: "Q1. 你好 的意思是什么？",
        options: ["A. Tạm biệt", "B. Xin lỗi", "C. Xin chào", "D. Cảm ơn"],
        correctIndex: 2,
      },
      {
        question: "Q2. 你好吗？是什么意思？",
        options: [
          "A. Bạn ăn chưa?",
          "B. Bạn có khỏe không?",
          "C. Bạn đi đâu?",
          "D. Bạn làm gì?",
        ],
        correctIndex: 1,
      },
      {
        question: "Q3. 我很好 表达什么意思？",
        options: [
          "A. Tôi rất tốt",
          "B. Tôi mệt",
          "C. Tôi không khỏe",
          "D. Tôi bận",
        ],
        correctIndex: 0,
      },
      {
        question: "Q4. 你呢？是什么意思？",
        options: [
          "A. Bạn làm gì",
          "B. Bạn ở đâu",
          "C. Còn bạn thì sao?",
          "D. Bạn đi đâu",
        ],
        correctIndex: 2,
      },
      {
        question: "Q5. 很高兴认识你 的意思是？",
        options: [
          "A. Rất vui được gặp bạn",
          "B. Xin lỗi",
          "C. Tạm biệt",
          "D. Chúc may mắn",
        ],
        correctIndex: 0,
      },
      {
        question: "Q6. 我叫小明 表达什么？",
        options: [
          "A. Tôi là học sinh",
          "B. Tôi là bạn",
          "C. Tôi tên là Tiểu Minh",
          "D. Tôi là giáo viên",
        ],
        correctIndex: 2,
      },
      {
        question: "Q7. 我是学生 是什么意思？",
        options: [
          "A. Tôi là học sinh",
          "B. Tôi là giáo viên",
          "C. Tôi là bạn",
          "D. Tôi là bác sĩ",
        ],
        correctIndex: 0,
      },
      {
        question: "Q8. 他是老师 的意思是？",
        options: [
          "A. Anh ấy là bạn",
          "B. Anh ấy là giáo viên",
          "C. Anh ấy là bố",
          "D. Anh ấy là học sinh",
        ],
        correctIndex: 1,
      },
      {
        question: "Q9. 我是中国人 表达什么？",
        options: [
          "A. Tôi là học sinh",
          "B. Tôi là người Trung Quốc",
          "C. Tôi là giáo viên",
          "D. Tôi là người Việt",
        ],
        correctIndex: 1,
      },
      {
        question: "Q10. 你是学生吗？ hỏi gì?",
        options: [
          "A. Bạn có phải học sinh không?",
          "B. Bạn đi đâu?",
          "C. Bạn ăn chưa?",
          "D. Bạn có khỏe không?",
        ],
        correctIndex: 0,
      },
      {
        question: "Q11. 你叫什么名字？ hỏi gì?",
        options: [
          "A. Bạn ở đâu",
          "B. Bạn làm gì",
          "C. Bạn tên gì",
          "D. Bạn bao nhiêu tuổi",
        ],
        correctIndex: 2,
      },
      {
        question: "Q12. 你几岁？是什么意思？",
        options: [
          "A. Bạn làm gì",
          "B. Bạn bao nhiêu tuổi",
          "C. Bạn học gì",
          "D. Bạn ở đâu",
        ],
        correctIndex: 1,
      },
      {
        question: "Q13. 你在哪儿？ hỏi gì?",
        options: [
          "A. Bạn ở đâu",
          "B. Bạn đi đâu",
          "C. Bạn thích gì",
          "D. Bạn làm gì",
        ],
        correctIndex: 0,
      },
      {
        question: "Q14. 你去哪儿？是什么意思？",
        options: [
          "A. Bạn làm gì",
          "B. Bạn thích gì",
          "C. Bạn đi đâu",
          "D. Bạn ở đâu",
        ],
        correctIndex: 2,
      },
      {
        question: "Q15. 这是什么？ hỏi gì?",
        options: [
          "A. Đây là ai",
          "B. Đây làm gì",
          "C. Đây là cái gì",
          "D. Đây ở đâu",
        ],
        correctIndex: 2,
      },
      {
        question: "Q16. 我去学校 表达 gì?",
        options: [
          "A. Tôi ăn cơm",
          "B. Tôi đi học",
          "C. Tôi uống nước",
          "D. Tôi ngủ",
        ],
        correctIndex: 1,
      },
      {
        question: "Q17. 我吃饭 是 gì?",
        options: [
          "A. Tôi ngủ",
          "B. Tôi ăn cơm",
          "C. Tôi đi học",
          "D. Tôi uống nước",
        ],
        correctIndex: 1,
      },
      {
        question: "Q18. 我喝水 表达 gì?",
        options: [
          "A. Tôi uống nước",
          "B. Tôi ăn cơm",
          "C. Tôi ngủ",
          "D. Tôi đi học",
        ],
        correctIndex: 0,
      },
      {
        question: "Q19. 我学习汉语 nghĩa là?",
        options: [
          "A. Tôi học tiếng Trung",
          "B. Tôi học thể dục",
          "C. Tôi học tiếng Anh",
          "D. Tôi học toán",
        ],
        correctIndex: 0,
      },
      {
        question: "Q20. 他工作 表达 gì?",
        options: [
          "A. Anh ấy ngủ",
          "B. Anh ấy làm việc",
          "C. Anh ấy ăn",
          "D. Anh ấy học",
        ],
        correctIndex: 1,
      },
      {
        question: "Q21. 我喜欢你 nghĩa là?",
        options: [
          "A. Tôi không biết",
          "B. Tôi ghét bạn",
          "C. Tôi thích bạn",
          "D. Tôi đi học",
        ],
        correctIndex: 2,
      },
      {
        question: "Q22. 我喜欢吃苹果 là gì?",
        options: [
          "A. Tôi thích ngủ",
          "B. Tôi thích ăn táo",
          "C. Tôi thích học",
          "D. Tôi thích uống nước",
        ],
        correctIndex: 1,
      },
      {
        question: "Q23. 我不喜欢咖啡 nghĩa là?",
        options: [
          "A. Tôi uống cà phê",
          "B. Tôi mua cà phê",
          "C. Tôi thích cà phê",
          "D. Tôi không thích cà phê",
        ],
        correctIndex: 3,
      },
      {
        question: "Q24. 你喜欢什么？ hỏi gì?",
        options: [
          "A. Bạn đi đâu",
          "B. Bạn thích gì",
          "C. Bạn làm gì",
          "D. Bạn ăn gì",
        ],
        correctIndex: 1,
      },
      {
        question: "Q25. 你好，我叫小明 nghĩa là?",
        options: [
          "A. Tôi ăn cơm",
          "B. Xin chào, tôi là Tiểu Minh",
          "C. Tôi uống nước",
          "D. Tôi đi học",
        ],
        correctIndex: 1,
      },
      {
        question: "Q26. 我是学生，你呢？ nghĩa là?",
        options: [
          "A. Tôi là học sinh, còn bạn?",
          "B. Tôi đi học",
          "C. Tôi ngủ",
          "D. Tôi là giáo viên",
        ],
        correctIndex: 0,
      },
      {
        question: "Q27. 我在学校 nghĩa là?",
        options: [
          "A. Tôi đi chơi",
          "B. Tôi ăn cơm",
          "C. Tôi ở trường",
          "D. Tôi ở nhà",
        ],
        correctIndex: 2,
      },
      {
        question: "Q28. 他是我的朋友 nghĩa là?",
        options: [
          "A. Anh ấy là giáo viên",
          "B. Anh ấy là bạn tôi",
          "C. Anh ấy là bố tôi",
          "D. Anh ấy là học sinh",
        ],
        correctIndex: 1,
      },
      {
        question: "Q29. 我们一起学习 nghĩa là?",
        options: [
          "A. Chúng tôi ăn",
          "B. Chúng tôi đi",
          "C. Chúng tôi học cùng nhau",
          "D. Chúng tôi ngủ",
        ],
        correctIndex: 2,
      },
      {
        question: "Q30. 再见 的意思是什么？",
        options: ["A. Xin lỗi", "B. Cảm ơn", "C. Xin chào", "D. Tạm biệt"],
        correctIndex: 3,
      },
    ],
  },
];

function renderListeningDecks() {
  const list = document.getElementById("listening-decks-list");
  if (!list) return;
  list.innerHTML = "";

  listeningDecks.forEach((deck) => {
    const btn = document.createElement("button");
    btn.className = "option-btn";
    btn.style.textAlign = "left";
    btn.innerHTML = `<i class="fas fa-play-circle" style="margin-right:8px;"></i> ${deck.title}`;
    btn.onclick = () => openListeningPlayer(deck);
    list.appendChild(btn);
  });
}

function openListeningPlayer(deck) {
  document.getElementById("listening-menu-container").classList.add("hidden");
  document
    .getElementById("listening-player-container")
    .classList.remove("hidden");

  document.getElementById("listening-title-display").innerText = deck.title;
  const audio = document.getElementById("listening-audio-player");
  const source = document.getElementById("listening-audio-source");

  source.src = deck.file;
  audio.load();

  const quizContainer = document.getElementById("listening-quiz-container");
  quizContainer.innerHTML = "";

  if (deck.questions && deck.questions.length > 0) {
    deck.questions.forEach((q, qIndex) => {
      const qBlock = document.createElement("div");
      qBlock.className = "l-question-block";

      const qTitle = document.createElement("div");
      qTitle.className = "l-question-title";
      qTitle.innerText = q.question;
      qBlock.appendChild(qTitle);

      const grid = document.createElement("div");
      grid.className = "l-options-grid";

      q.options.forEach((opt, optIndex) => {
        const btn = document.createElement("button");
        btn.className = "l-option-btn";
        btn.innerText = opt;
        btn.onclick = () => checkListeningAnswer(qBlock, q, optIndex, btn);
        grid.appendChild(btn);
      });

      qBlock.appendChild(grid);
      quizContainer.appendChild(qBlock);
    });
  } else {
    quizContainer.innerHTML =
      "<p style='color: var(--text-sub)'>No questions available for this audio.</p>";
  }
}

function checkListeningAnswer(qBlock, qData, selectedIndex, btn) {
  const allBtns = qBlock.querySelectorAll(".l-option-btn");
  allBtns.forEach((b) => (b.disabled = true));

  if (selectedIndex === qData.correctIndex) {
    btn.classList.add("correct");
  } else {
    btn.classList.add("wrong");
    allBtns[qData.correctIndex].classList.add("correct");
  }
}

function backToListeningMenu() {
  const audio = document.getElementById("listening-audio-player");
  audio.pause();

  document.getElementById("listening-player-container").classList.add("hidden");
  document
    .getElementById("listening-menu-container")
    .classList.remove("hidden");
}
