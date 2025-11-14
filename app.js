// --------------------------
// Configuration
// --------------------------
const GAS_URL = "https://script.google.com/macros/s/AKfycbwA2GmgDpwDZJuuquwRjucregz9PkmZn2N1ZYa6A_FstEEP3wt8Fu8gtavv-g6Endzb/exec"; // Replace with your deployed Apps Script URL

// --------------------------
// LOGIN
// --------------------------
function loginUser() {
  const username = document.getElementById("login-username").value;
  const password = document.getElementById("login-password").value;
  const errorBox = document.getElementById("login-error");

  if (!username || !password) {
    errorBox.textContent = "Username and password are required.";
    return;
  }

  fetch(GAS_URL + "?action=login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password })
  })
    .then(res => res.json())
    .then(data => {
      if (data.success) {
        document.getElementById("login-overlay").style.display = "none";
        loadDashboardCounts();
      } else {
        errorBox.textContent = "Invalid username or password.";
      }
    })
    .catch(err => {
      errorBox.textContent = "Login error. Try again.";
      console.error(err);
    });
}

// --------------------------
// SIDEBAR NAVIGATION
// --------------------------
const tabs = document.querySelectorAll(".sidebar a[data-tab]");
tabs.forEach(tab => {
  tab.addEventListener("click", e => {
    e.preventDefault();
    const target = tab.dataset.tab;
    showTab(target);
  });
});

function showTab(tabId) {
  document.querySelectorAll(".tab-window").forEach(win => {
    win.style.display = "none";
  });
  document.getElementById(tabId).style.display = "block";
}

// --------------------------
// TOGGLE FORM
// --------------------------
function toggleForm(formId) {
  const formBox = document.getElementById(`${formId}-form`);
  formBox.style.display = formBox.style.display === "none" ? "block" : "none";
}

// --------------------------
// LOAD DASHBOARD COUNTS
// --------------------------
function loadDashboardCounts() {
  fetch(GAS_URL + "?action=getCounts")
    .then(res => res.json())
    .then(data => {
      document.getElementById("dash-join").textContent = data.joining || 0;
      document.getElementById("dash-arrivals").textContent = data.arrivals || 0;
      document.getElementById("dash-updates").textContent = data.updates || 0;
      document.getElementById("dash-memo").textContent = data.memo || 0;
      document.getElementById("dash-training").textContent = data.training || 0;
      document.getElementById("dash-pni").textContent = data.pni || 0;
    })
    .catch(err => console.error("Error loading dashboard counts", err));
}

// --------------------------
// LOAD DATA TABLES
// --------------------------
function loadTable(section) {
  fetch(GAS_URL + `?action=getData&section=${section}`)
    .then(res => res.json())
    .then(data => {
      const container = document.getElementById(`${section}-data`);
      if (!data.length) {
        container.innerHTML = "<p>No records found.</p>";
        return;
      }
      let html = `<table class="table table-bordered"><thead><tr>`;
      Object.keys(data[0]).forEach(key => html += `<th>${key}</th>`);
      html += `<th>Actions</th></tr></thead><tbody>`;
      data.forEach(row => {
        html += `<tr>`;
        Object.values(row).forEach(val => html += `<td>${val}</td>`);
        html += `<td>
          <button class="btn btn-sm btn-warning" onclick="editRecord('${section}','${row.id}')">Edit</button>
          <button class="btn btn-sm btn-danger" onclick="deleteRecord('${section}','${row.id}')">Delete</button>
        </td>`;
        html += `</tr>`;
      });
      html += `</tbody></table>`;
      container.innerHTML = html;
    });
}

// --------------------------
// EDIT & DELETE RECORD
// --------------------------
function editRecord(section, id) {
  alert(`Edit record ${id} in ${section} (implement form prefill)`);
}

function deleteRecord(section, id) {
  if (!confirm("Are you sure you want to delete?")) return;
  fetch(GAS_URL + `?action=delete&section=${section}&id=${id}`, { method: "POST" })
    .then(res => res.json())
    .then(() => loadTable(section));
}

// --------------------------
// CHATBOARD
// --------------------------
function sendMessage() {
  const msgInput = document.getElementById("chat-input");
  const msg = msgInput.value.trim();
  if (!msg) return;

  fetch(GAS_URL + "?action=chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message: msg })
  })
    .then(() => {
      msgInput.value = "";
      loadChat();
    });
}

function loadChat() {
  fetch(GAS_URL + "?action=getChat")
    .then(res => res.json())
    .then(data => {
      const board = document.getElementById("chatboard");
      board.innerHTML = data.map(m => `<p><b>${m.user}:</b> ${m.text}</p>`).join("");
    });
}

// --------------------------
// STICKY NOTE
// --------------------------
const stickyText = document.getElementById("sticky-text");
stickyText.value = localStorage.getItem("sticky") || "";
stickyText.addEventListener("input", () => {
  localStorage.setItem("sticky", stickyText.value);
});

// --------------------------
// INIT
// --------------------------
document.addEventListener("DOMContentLoaded", () => {
  // Hide login overlay if user already logged in (optional)
  if (!localStorage.getItem("loggedIn")) {
    document.getElementById("login-overlay").style.display = "flex";
  } else {
    loadDashboardCounts();
  }

  // Load tables initially
  ["crew-join","crew-arrivals","daily-updates","memo","training","pni"].forEach(loadTable);
  loadChat();
});
