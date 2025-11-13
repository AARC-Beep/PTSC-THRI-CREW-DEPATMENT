const API_URL = "https://script.google.com/macros/s/AKfycbxCT2lVKm184HanG81VCqiScaK_-zgHd7zNhd1iIsNLX_L76VI4G5mWSsyxBU9OiztF/exec"; // replace with your Apps Script URL

/* ---------------------- Helper ---------------------- */
function qs(selector) {
  return document.querySelector(selector);
}

async function apiFetch(sheet, action, params = {}) {
  try {
    const url = new URL(API_URL);
    url.searchParams.set("sheet", sheet);
    url.searchParams.set("action", action);
    Object.keys(params).forEach(key => url.searchParams.set(key, params[key]));
    
    console.log("DEBUG → apiFetch URL:", url.toString());
    const res = await fetch(url);
    const data = await res.json();
    if (data.status === "success") return data.data;
    else throw new Error(data.message);
  } catch (err) {
    console.error("apiFetch Error:", err);
    throw err;
  }
}

/* ---------------------- LOGIN ---------------------- */
async function loginUser() {
  const username = qs("#login-username").value.trim();
  const password = qs("#login-password").value.trim();
  const errorBox = qs("#login-error");
  errorBox.innerText = "";

  if (!username || !password) {
    errorBox.innerText = "Enter username and password";
    return;
  }

  try {
    const users = await apiFetch("Users", "get");
    const user = users.find(u => u.Username === username && u.Password === password);

    if (user) {
      qs("#login-overlay").style.display = "none";
      await loadDashboard();
    } else {
      errorBox.innerText = "Invalid username or password";
    }
  } catch (err) {
    errorBox.innerText = "Login failed, check console";
  }
}

/* ---------------------- ADD ROW ---------------------- */
async function addRowData(sheet, fields) {
  const result = await apiFetch(sheet, "add", fields);
  return result;
}

/* ---------------------- UPDATE ROW ---------------------- */
async function updateRowData(sheet, uid, fields) {
  const result = await apiFetch(sheet, "update", { UID: uid, ...fields });
  return result;
}

/* ---------------------- DELETE ROW ---------------------- */
async function deleteRowData(sheet, uid) {
  const result = await apiFetch(sheet, "delete", { UID: uid });
  return result;
}

/* ---------------------- LOAD TABLE ---------------------- */
async function loadTable(sheet, containerId, headers) {
  const container = qs(`#${containerId}`);
  container.innerHTML = "";
  try {
    const rows = await apiFetch(sheet, "get");
    if (!rows.length) {
      container.innerHTML = "<i>No records found</i>";
      return;
    }

    const table = document.createElement("table");
    table.className = "table table-bordered table-striped";
    
    // header
    const thead = document.createElement("thead");
    const trh = document.createElement("tr");
    headers.forEach(h => {
      const th = document.createElement("th");
      th.innerText = h;
      trh.appendChild(th);
    });
    thead.appendChild(trh);
    table.appendChild(thead);

    // body
    const tbody = document.createElement("tbody");
    rows.forEach(r => {
      const tr = document.createElement("tr");
      headers.forEach(h => {
        const td = document.createElement("td");
        let val = r[h] || "";
        if (val && val.toString().includes("T") && !isNaN(Date.parse(val))) {
          val = new Date(val).toLocaleString();
        }
        td.innerText = val;
        tr.appendChild(td);
      });
      tbody.appendChild(tr);
    });
    table.appendChild(tbody);
    container.appendChild(table);
  } catch (err) {
    container.innerHTML = `<i>Error loading data: ${err.message}</i>`;
  }
}

/* ---------------------- DASHBOARD SUMMARY ---------------------- */
async function loadDashboard() {
  const sheets = ["Vessel_Join","Arrivals","Updates","Memo","Training","Pni"];
  for (let sheet of sheets) {
    const data = await apiFetch(sheet, "get");
    const containerId = `dash-${sheet.toLowerCase().replace("_","")}`;
    const container = qs(`#${containerId}`);
    container.innerText = data.length;
  }
}

/* ---------------------- CHATBOARD ---------------------- */
async function sendMessage() {
  const input = qs("#chat-input");
  const msg = input.value.trim();
  if (!msg) return;
  try {
    await addRowData("Chatboard", { Message: msg, Timestamp: new Date() });
    input.value = "";
    await loadTable("Chatboard", "chatboard", ["Timestamp","Message","UID"]);
  } catch (err) {
    alert("Chat send failed: " + err.message);
  }
}

/* ---------------------- FORM TOGGLE ---------------------- */
function toggleForm(id) {
  const form = qs(`#${id}-form`);
  if (form.style.display === "none") form.style.display = "block";
  else form.style.display = "none";
}

/* ---------------------- HANDLE ADD NEW ---------------------- */
async function handleAdd(sheet, fields, tableContainer, headers, formId) {
  try {
    await addRowData(sheet, fields);
    alert("Added successfully!");
    toggleForm(formId);
    await loadTable(sheet, tableContainer, headers);
    await loadDashboard();
  } catch (err) {
    alert("Add failed: " + err.message);
    console.error(err);
  }
}

/* ---------------------- INIT ---------------------- */
window.addEventListener("DOMContentLoaded", async () => {
  // Load dashboard counts
  await loadDashboard();

  // Load all tables
  const tableMappings = [
    { sheet: "Vessel_Join", container: "crew-join-data", headers: ["Timestamp","Vessel","Principal","Port","No. of Crew","Rank","Date","Flight","UID"] },
    { sheet: "Arrivals", container: "crew-arrivals-data", headers: ["Timestamp","Vessel","Principal","Port","No. of Crew","Rank","Date","Flight","UID"] },
    { sheet: "Updates", container: "daily-updates-data", headers: ["Timestamp","Title","Details","Date","UID"] },
    { sheet: "Memo", container: "memo-data", headers: ["Timestamp","Title","Details","Date","UID"] },
    { sheet: "Training", container: "training-data", headers: ["Timestamp","Subject","Details","Date","UID"] },
    { sheet: "Pni", container: "pni-data", headers: ["Timestamp","Subject","Details","Date","UID"] },
    { sheet: "Chatboard", container: "chatboard", headers: ["Timestamp","Message","UID"] }
  ];

  for (let t of tableMappings) {
    await loadTable(t.sheet, t.container, t.headers);
  }
});
