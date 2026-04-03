const vocab = [
    { hanzi: "你好", pinyin: "nǐ hǎo", meaning: "Xin chào" },
    { hanzi: "谢谢", pinyin: "xiè xie", meaning: "Cảm ơn" },
    { hanzi: "再见", pinyin: "zài jiàn", meaning: "Tạm biệt" }
];

let current = 0;

// Hiển thị từ
function showWord() {
    const word = vocab[current];
    document.getElementById("vocab-container").innerHTML = `
        <p>${word.hanzi}</p>
        <p>${word.pinyin}</p>
        <p>${word.meaning}</p>
        <button onclick="speak('${word.hanzi}')">🔊 Nghe</button>
    `;
}

// Phát âm
function speak(text) {
    const msg = new SpeechSynthesisUtterance(text);
    msg.lang = "zh-CN";
    speechSynthesis.speak(msg);
}

// Từ tiếp theo
function nextWord() {
    current = (current + 1) % vocab.length;
    showWord();
    loadQuiz();
}

// Quiz
let correctAnswer = "";

function loadQuiz() {
    const word = vocab[current];
    correctAnswer = word.meaning;

    let options = vocab.map(v => v.meaning);
    options.sort(() => Math.random() - 0.5);

    document.getElementById("quiz").innerHTML = `
        <p>${word.hanzi} nghĩa là gì?</p>
        ${options.map(opt => `
            <div>
                <input type="radio" name="answer" value="${opt}"> ${opt}
            </div>
        `).join("")}
    `;
}

// Kiểm tra
function checkAnswer() {
    const selected = document.querySelector('input[name="answer"]:checked');
    if (!selected) return;

    if (selected.value === correctAnswer) {
        document.getElementById("result").innerText = "✅ Đúng!";
    } else {
        document.getElementById("result").innerText = "❌ Sai!";
    }
}

// Load ban đầu
showWord();
loadQuiz();
