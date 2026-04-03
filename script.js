const STORAGE_KEY = 'hoc_vocab';

let vocab = [
    { hanzi: "你好", pinyin: "nǐ hǎo", meaning: "Xin chào", category: "coban" },
    { hanzi: "谢谢", pinyin: "xiè xie", meaning: "Cảm ơn", category: "coban" },
    { hanzi: "再见", pinyin: "zài jiàn", meaning: "Tạm biệt", category: "coban" }
];

let current = 0;
let editingIndex = null;
let currentFilter = 'all';

function getCategoryLabel(key) {
    switch (key) {
        case 'dulich': return 'Du lịch';
        case 'kinhdoanh': return 'Kinh doanh';
        default: return 'Cơ bản';
    }
}

function saveVocab() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(vocab));
}

function loadVocab() {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
        try {
            const parsed = JSON.parse(stored);
            if (Array.isArray(parsed) && parsed.length > 0) {
                vocab = parsed.map(item => ({
                    hanzi: item.hanzi || '',
                    pinyin: item.pinyin || '',
                    meaning: item.meaning || '',
                    category: item.category || 'coban'
                }));
            }
        } catch (error) {
            console.error('Không thể đọc dữ liệu từ localStorage', error);
        }
    }
}

function renderWordList() {
    const listContainer = document.getElementById('vocab-list');
    if (!vocab.length) {
        listContainer.innerHTML = '<p>Không có từ nào trong danh sách.</p>';
        return;
    }

    const filtered = currentFilter === 'all' ? vocab : vocab.filter(w => w.category === currentFilter);
    if (!filtered.length) {
        listContainer.innerHTML = `<p>Không có từ thuộc chủ đề ${getCategoryLabel(currentFilter)}.</p>`;
        return;
    }

    listContainer.innerHTML = filtered.map((word, index) => {
        const originalIndex = vocab.findIndex(w => w === word);
        const isActive = originalIndex === current ? 'background:#eef;' : '';
        return `
        <div style="border-bottom:1px solid #ddd; padding: 4px; ${isActive}">
            <b>${word.hanzi}</b> (${word.pinyin}) - ${word.meaning} <i>[${getCategoryLabel(word.category)}]</i>
            <button onclick="selectWord(${originalIndex})">Xem</button>
            <button onclick="startEditWord(${originalIndex})">Sửa</button>
            <button onclick="deleteWord(${originalIndex})">Xóa</button>
        </div>`;
    }).join('');
}

function showWord() {
    if (!vocab.length) {
        document.getElementById('vocab-container').innerHTML = '<p>Chưa có từ nào. Hãy thêm một từ mới.</p>';
        document.getElementById('quiz').innerHTML = '';
        return;
    }

    const word = vocab[current];
    document.getElementById('vocab-container').innerHTML = `
        <p><strong>${word.hanzi}</strong></p>
        <p>${word.pinyin}</p>
        <p>${word.meaning}</p>
        <p>Chủ đề: ${getCategoryLabel(word.category)}</p>
        <button onclick="speak('${word.hanzi}')">🔊 Nghe</button>
        <button onclick="startEditWord(${current})">Sửa</button>
        <button onclick="deleteWord(${current})">Xóa</button>
    `;
    renderWordList();
}

// Phát âm
function speak(text) {
    const msg = new SpeechSynthesisUtterance(text);
    msg.lang = "zh-CN";
    speechSynthesis.speak(msg);
}

// Từ tiếp theo
function nextWord() {
    if (!vocab.length) {
        return;
    }
    current = (current + 1) % vocab.length;
    showWord();
    loadQuiz();
}

// Quiz
let correctAnswer = "";

function loadQuiz() {
    if (!vocab.length) {
        document.getElementById('quiz').innerHTML = '';
        return;
    }

    const word = vocab[current];
    correctAnswer = word.meaning;

    let options = vocab.map(v => v.meaning);
    options.sort(() => Math.random() - 0.5);

    document.getElementById('quiz').innerHTML = `
        <p>${word.hanzi} nghĩa là gì?</p>
        ${options.map(opt => `
            <div>
                <input type="radio" name="answer" value="${opt}"> ${opt}
            </div>
        `).join('')}
    `;
}

// Kiểm tra
function checkAnswer() {
    const selected = document.querySelector('input[name="answer"]:checked');
    if (!selected) return;

    if (selected.value === correctAnswer) {
        document.getElementById('result').innerText = '✅ Đúng!';
    } else {
        document.getElementById('result').innerText = '❌ Sai!';
    }
}

// Chọn từ trong danh sách
function selectWord(index) {
    current = index;
    showWord();
    loadQuiz();
}

// Sửa từ
function startEditWord(index) {
    const word = vocab[index];
    document.getElementById('new-hanzi').value = word.hanzi;
    document.getElementById('new-pinyin').value = word.pinyin;
    document.getElementById('new-meaning').value = word.meaning;
    document.getElementById('new-category').value = word.category || 'coban';

    document.getElementById('add-btn').style.display = 'none';
    document.getElementById('update-btn').style.display = 'inline-block';
    document.getElementById('cancel-btn').style.display = 'inline-block';

    editingIndex = index;
    document.getElementById('add-result').innerText = 'Đang chỉnh sửa từ...';
    document.getElementById('add-result').style.color = '#333';
}

function updateWord() {
    if (editingIndex === null) return;

    const hanzi = document.getElementById('new-hanzi').value.trim();
    const pinyin = document.getElementById('new-pinyin').value.trim();
    const meaning = document.getElementById('new-meaning').value.trim();
    const category = document.getElementById('new-category').value;
    const feedback = document.getElementById('add-result');

    if (!hanzi || !pinyin || !meaning) {
        feedback.innerText = '⚠️ Vui lòng nhập đầy đủ hanzi, pinyin và nghĩa.';
        feedback.style.color = '#d9534f';
        return;
    }

    vocab[editingIndex] = { hanzi, pinyin, meaning, category };
    current = editingIndex;
    saveVocab();
    showWord();
    loadQuiz();
    renderWordList();
    resetForm();

    feedback.innerText = '✅ Cập nhật từ thành công!';
    feedback.style.color = '#28a745';
}

function cancelEdit() {
    resetForm();
    document.getElementById('add-result').innerText = 'Đã hủy chỉnh sửa.';
    document.getElementById('add-result').style.color = '#333';
}

function resetForm() {
    editingIndex = null;
    document.getElementById('new-hanzi').value = '';
    document.getElementById('new-pinyin').value = '';
    document.getElementById('new-meaning').value = '';
    document.getElementById('new-category').value = 'coban';
    document.getElementById('add-btn').style.display = 'inline-block';
    document.getElementById('update-btn').style.display = 'none';
    document.getElementById('cancel-btn').style.display = 'none';
}

// Thêm từ mới
function addWord() {
    const hanzi = document.getElementById('new-hanzi').value.trim();
    const pinyin = document.getElementById('new-pinyin').value.trim();
    const meaning = document.getElementById('new-meaning').value.trim();
    const category = document.getElementById('new-category').value;
    const feedback = document.getElementById('add-result');

    if (!hanzi || !pinyin || !meaning) {
        feedback.innerText = '⚠️ Vui lòng nhập đầy đủ hanzi, pinyin và nghĩa.';
        feedback.style.color = '#d9534f';
        return;
    }

    vocab.push({ hanzi, pinyin, meaning, category });
    current = vocab.length - 1;
    saveVocab();
    showWord();
    loadQuiz();
    renderWordList();

    resetForm();
    feedback.innerText = '✅ Đã thêm từ mới thành công!';
    feedback.style.color = '#28a745';
}

function deleteWord(index) {
    if (!confirm('Xác nhận xóa từ này?')) return;

    vocab.splice(index, 1);
    if (current >= vocab.length) {
        current = Math.max(0, vocab.length - 1);
    }

    saveVocab();
    showWord();
    loadQuiz();
    renderWordList();
    document.getElementById('add-result').innerText = '✅ Đã xóa từ.';
    document.getElementById('add-result').style.color = '#28a745';
}

function filterByCategory() {
    currentFilter = document.getElementById('filter-category').value;
    renderWordList();
}

// Load ban đầu
loadVocab();
showWord();
loadQuiz();
renderWordList();
showWord();
loadQuiz();
renderWordList();
