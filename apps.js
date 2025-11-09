// ---------------- Tab Switching ----------------
function showTab(tabId) {
    const tabs = ['dashboard','crew-join','crew-arrivals','daily-updates','memo','training','pni','chat'];
    tabs.forEach(id => {
        document.getElementById(id).style.display = (id === tabId) ? 'block' : 'none';
    });
}

// ---------------- Sticky Note ----------------
const stickyText = document.getElementById('sticky-text');
stickyText.value = localStorage.getItem('stickyNote') || '';
stickyText.addEventListener('input', () => {
    localStorage.setItem('stickyNote', stickyText.value);
});

// ---------------- Chatboard ----------------
function sendMessage() {
    const input = document.getElementById('chat-input');
    if(input.value.trim() === '') return;
    const chat = document.getElementById('chatboard');
    const now = new Date().toLocaleString();
    const messageDiv = document.createElement('div');
    messageDiv.className = 'message';
    messageDiv.textContent = `[${now}] You: ${input.value}`;
    chat.appendChild(messageDiv);
    input.value = '';
    chat.scrollTop = chat.scrollHeight;

    // TODO: send message to Google Sheets Chatboard via Apps Script
}

// ---------------- Fetch Data from Google Sheets ----------------
const GAS_URL = 'https://script.google.com/macros/s/AKfycbyHJOMWdg01HTWdV1DoMajJV4oFja2YirfG1K56hnkQskFB9YSzfMGvahax8q0BIf9b/exec'; // Replace with your deployed GAS URL

function fetchData(tabName, containerId) {
    fetch(`${GAS_URL}?sheet=${tabName}`)
        .then(res => res.json())
        .then(data => {
            const container = document.getElementById(containerId);
            if (!data || data.length === 0) {
                container.innerHTML = 'No data available.';
                return;
            }
            // Show minimum of 5 latest records
            const items = data.slice(-5).reverse();
            container.innerHTML = '';
            items.forEach(item => {
                const div = document.createElement('div');
                div.style.borderBottom = '1px solid #cce0ff';
                div.style.padding = '5px 0';
                div.textContent = JSON.stringify(item);
                container.appendChild(div);
            });
        })
        .catch(err => {
            console.error(err);
            document.getElementById(containerId).innerHTML = 'Error fetching data';
        });
}

// ---------------- Initialize Data ----------------
document.addEventListener('DOMContentLoaded', () => {
    fetchData('Vessel_Join', 'crew-join-data');
    fetchData('Arrivals', 'crew-arrivals-data');
    fetchData('Updates', 'daily-updates-data');
    fetchData('Memo', 'memo-data');
    fetchData('Training', 'training-data');
    fetchData('Pni', 'pni-data');
    fetchData('Chatboard', 'chatboard');
});
