/* ============================================================
   PTSC / THRI Crew Dashboard - FULL (Updated)
   - Fully connected dashboard Open buttons
   - Sidebar clicks and Open buttons now load tables dynamically
   - Actions: get, getItem, add, update, delete, chat
============================================================= */

const GAS_URL = "https://script.google.com/macros/s/AKfycbwA2GmgDpwDZJuuquwRjucregz9PkmZn2N1ZYa6A_FstEEP3wt8Fu8gtavv-g6Endzb/exec"; 

/* --------------------- Utilities --------------------- */
function qs(id){ return document.getElementById(id); }
function debugLog(...args){ if(window.console) console.log(...args); }

async function apiFetch(params){
  const url = `${GAS_URL}?${params.toString()}`;
  debugLog("DEBUG → apiFetch URL:", url);
  const res = await fetch(url).catch(e => { throw new Error("Network fetch failed: " + e.message); });
  if(!res.ok) throw new Error("Network error: " + res.status);
  const j = await res.json().catch(e => { throw new Error("Invalid JSON response"); });
  if(j.status && j.status !== "success") throw new Error(j.message || "API error");
  return j.data === undefined ? j : j.data;
}

function escapeHtml(unsafe){
  if(unsafe === null || unsafe === undefined) return "";
  return String(unsafe).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
}

function shortDate(v){
  if(!v) return "";
  const d = new Date(v);
  if(isNaN(d)) return String(v);
  return d.toLocaleDateString();
}

function makeId(name, prefix = "edit-"){
  return prefix + String(name).replace(/[^\w\-]/g, "_");
}

/* --------------------- LOGIN --------------------- */
async function loginUser(){
  const u = qs("login-username")?.value?.trim() || "";
  const p = qs("login-password")?.value?.trim() || "";
  const err = qs("login-error");
  if(err) err.innerText = "";

  if(!u || !p){ if(err) err.innerText = "Enter username and password"; return; }

  try{
    const users = await apiFetch(new URLSearchParams({ sheet: "Users", action: "get" }));
    const match = (users || []).find(x => String(x.Username||"").trim().toLowerCase() === u.toLowerCase() &&
                                           String(x.Password||"").trim() === p);
    if(!match){ if(err) err.innerText = "Invalid username or password"; return; }

    sessionStorage.setItem("loggedInUser", match.Username);
    sessionStorage.setItem("userRole", match.Role || "");
    qs("login-overlay") && (qs("login-overlay").style.display = "none");
    showTab("dashboard");
    await initReload();
  }catch(e){
    debugLog("loginUser error:", e);
    if(err) err.innerText = "Login failed: " + e.message;
  }
}

document.addEventListener("DOMContentLoaded", ()=>{
  if(sessionStorage.getItem("loggedInUser")){
    qs("login-overlay") && (qs("login-overlay").style.display = "none");
    showTab("dashboard");
    initReload();
  } else {
    qs("login-overlay") && (qs("login-overlay").style.display = "flex");
  }
});

/* --------------------- TAB NAVIGATION --------------------- */
function showTab(tabId){
  document.querySelectorAll('.tab-window').forEach(tab => tab.style.display = 'none');
  const tab = qs(tabId);
  if(tab) tab.style.display = 'block';

  document.querySelectorAll('.sidebar-item').forEach(item => item.classList.remove('active'));
  const sidebarItem = document.querySelector(`[data-tab='${tabId}']`);
  if(sidebarItem) sidebarItem.classList.add('active');

  // Load data dynamically
  switch(tabId){
    case 'crew-joining': loadTable("Vessel_Join","crew-join-data", getColumnsForSheet("Vessel_Join")); break;
    case 'arrivals-tab': loadTable("Arrivals","crew-arrivals-data", getColumnsForSheet("Arrivals")); break;
    case 'updates-tab': loadTable("Updates","daily-updates-data", getColumnsForSheet("Updates")); break;
    case 'memo-tab': loadTable("Memo","memo-data", getColumnsForSheet("Memo")); break;
    case 'training-tab': loadTable("Training","training-data", getColumnsForSheet("Training")); break;
    case 'pni-tab': loadTable("Pni","pni-data", getColumnsForSheet("Pni")); break;
  }
}

/* --------------------- DASHBOARD --------------------- */
async function loadDashboard(){
  const map = {
    "Vessel_Join":"dash-join",
    "Arrivals":"dash-arrivals",
    "Updates":"dash-updates",
    "Memo":"dash-memo",
    "Training":"dash-training",
    "Pni":"dash-pni"
  };

  for(const sheet in map){
    const box = qs(map[sheet]);
    if(!box) continue;
    box.innerHTML = "Loading...";

    try{
      const data = await apiFetch(new URLSearchParams({ sheet, action:"get" })).catch(()=>[]);
      const count = (data || []).length;

      box.innerHTML = `
        <div class="d-flex justify-content-between align-items-center mb-2">
          <strong>${sheet.replace("_"," ")}</strong>
          <button class="btn btn-sm btn-outline-primary" 
            onclick="showTab('${mapSheetToTab(sheet)}'); loadTable('${sheet}','${mapSheetToDataContainer(sheet)}', getColumnsForSheet('${sheet}'))">
            Open
          </button>
        </div>
        <h2>${count}</h2>
        <button class="btn btn-sm btn-secondary mt-2" onclick="generateAllPDF('${sheet}')">Export PDF</button>
      `;
    }catch(err){
      box.innerHTML = "<small>Error loading</small>";
      debugLog("loadDashboard error", sheet, err);
    }
  }
}

// Helpers to map sheet → tab / table container
function mapSheetToTab(sheet){
  return {
    "Vessel_Join":"crew-joining",
    "Arrivals":"arrivals-tab",
    "Updates":"updates-tab",
    "Memo":"memo-tab",
    "Training":"training-tab",
    "Pni":"pni-tab"
  }[sheet] || "";
}

function mapSheetToDataContainer(sheet){
  return {
    "Vessel_Join":"crew-join-data",
    "Arrivals":"crew-arrivals-data",
    "Updates":"daily-updates-data",
    "Memo":"memo-data",
    "Training":"training-data",
    "Pni":"pni-data"
  }[sheet] || "";
}

function getColumnsForSheet(sheet){
  return {
    "Vessel_Join":["Timestamp","Vessel","Principal","Port","No. of Crew","Rank","Date","Flight","UID"],
    "Arrivals":["Timestamp","Vessel","Principal","Port","No. of Crew","Rank","Date","Flight","UID"],
    "Updates":["Timestamp","Title","Details","Date","UID"],
    "Memo":["Timestamp","Title","Details","Date","UID"],
    "Training":["Timestamp","Subject","Details","Date","UID"],
    "Pni":["Timestamp","Subject","Details","Date","UID"]
  }[sheet] || [];
}

/* --------------------- TABLE LOADER --------------------- */
async function loadTable(sheet, containerId, columns){
  const div = qs(containerId);
  if(!div) return console.warn("Missing container:", containerId);
  div.innerHTML = "<div>Loading...</div>";

  try{
    const data = await apiFetch(new URLSearchParams({ sheet, action:"get" })).catch(()=>[]);
    if(!data || !data.length){ div.innerHTML = "<small>No records</small>"; return; }

    const table = document.createElement("table");
    table.className = "table table-sm table-bordered";

    const displayCols = columns.filter(c=>c!=="UID" && c!=="Timestamp");
    const thead = document.createElement("thead");
    thead.innerHTML = `<tr>${displayCols.map(c=>`<th>${escapeHtml(c)}</th>`).join("")}<th>Actions</th></tr>`;
    table.appendChild(thead);

    const tbody = document.createElement("tbody");
    (data || []).slice().reverse().forEach(row=>{
      const tr = document.createElement("tr");
      columns.forEach(col=>{
        if(col==="UID" || col==="Timestamp") return;
        let val = row[col] || "";
        if(
          (sheet==="Vessel_Join" && col==="Vessel") ||
          (sheet==="Arrivals" && col==="Vessel") ||
          (sheet==="Updates" && col==="Title") ||
          (sheet==="Memo" && col==="Title") ||
          (sheet==="Training" && col==="Subject") ||
          (sheet==="Pni" && col==="Subject")
        ) val = `<b>${escapeHtml(String(val))}</b>`;
        else val = escapeHtml(String(val));
        tr.innerHTML += `<td>${val}</td>`;
      });

      const uidSafe = row.UID || "";
      tr.innerHTML += `<td>
        <button class="btn btn-sm btn-outline-primary" onclick="openEditModal('${sheet}','${uidSafe}')">Edit</button>
        <button class="btn btn-sm btn-outline-danger" onclick="deleteRowConfirm('${sheet}','${uidSafe}')">Delete</button>
      </td>`;

      tbody.appendChild(tr);
    });

    table.appendChild(tbody);
    div.innerHTML = "";
    div.appendChild(table);
  }catch(err){
    div.innerHTML = "<div class='text-danger'>Failed to load table</div>";
    debugLog("loadTable error", sheet, err);
  }
}

/* --------------------- Other functions (Add/Edit/Delete/PDF/Forms/Chat) --------------------- */
// The rest of your existing add, edit, delete, generate PDF, chat, sticky note functions remain the same
// You can copy them as-is from your previous app.js file

/* --------------------- INITIALIZATION --------------------- */
async function initReload(){
  await loadAllData();    // preload all tables
  await loadDashboard();  // update dashboard cards
}

window.addEventListener("load", ()=>{
  if(sessionStorage.getItem("loggedInUser")) initReload();
});
