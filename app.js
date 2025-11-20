/* ============================================================
   PTSC / THRI Crew Dashboard - Frontend JS
   Works with updated code.gs
============================================================= */

const GAS_URL = "https://script.google.com/macros/s/AKfycbxoLIrNGnPkxfwoZhzNqnquDbDLoKnqmkSpU-ET6wlq1lA-pQemm88dqyNbsJnl7Lem/exec";

/* ---------- Utility Functions ---------- */
const qs = id => document.getElementById(id);

function debugLog(...args){ if(window.console) console.log(...args); }

async function apiFetch(sheet, action, params = {}){
  try {
    const url = new URL(GAS_URL);
    url.searchParams.set("sheet", sheet);
    url.searchParams.set("action", action);
    for(const k in params){
      if(params[k] !== undefined && params[k] !== null)
        url.searchParams.set(k, params[k]);
    }
    debugLog("API Fetch:", url.toString());

    const res = await fetch(url);
    const data = await res.json();
    if(data.status !== "success") throw new Error(data.message || "Unknown error");
    return data.data;
  } catch(err){
    console.error("API Error:", err);
    alert("API Error: " + err.message);
    return null;
  }
}

/* ---------- Table Rendering ---------- */
async function loadTable(sheetName, containerId, columns){
  const container = qs(containerId);
  container.innerHTML = "Loading...";
  const data = await apiFetch(sheetName, "get");
  if(!data) { container.innerHTML = "Error loading data"; return; }

  let html = `<table class="table"><thead><tr>`;
  columns.forEach(col => html += `<th>${col}</th>`);
  html += `<th>Actions</th></tr></thead><tbody>`;

  data.forEach(row => {
    html += `<tr>`;
    columns.forEach(col => {
      let val = row[col] || "";
      // Display dates nicely
      if(!isNaN(Date.parse(val))) val = new Date(val).toLocaleDateString();
      html += `<td>${val}</td>`;
    });
    html += `<td>
      <button onclick="editRow('${sheetName}','${row.UID}')">Edit</button>
      <button onclick="deleteRow('${sheetName}','${row.UID}')">Delete</button>
    </td>`;
    html += `</tr>`;
  });

  html += `</tbody></table>`;
  container.innerHTML = html;
}

/* ---------- Add / Update ---------- */
async function addOrUpdateRow(sheetName, formId){
  const form = qs(formId);
  const formData = new FormData(form);
  const params = {};
  formData.forEach((v,k)=> params[k] = v);

  let action = params.UID ? "update" : "add";
  const result = await apiFetch(sheetName, action, params);
  if(result){
    alert(result);
    loadTable(sheetName, sheetName + "-container", Object.keys(params));
    form.reset();
  }
}

/* ---------- Edit Row ---------- */
async function editRow(sheetName, uid){
  const data = await apiFetch(sheetName, "getItem", { UID: uid });
  if(!data) return;
  const form = qs(sheetName + "-form");
  Object.keys(data).forEach(k => {
    const input = form.querySelector(`[name="${k}"]`);
    if(input) input.value = data[k];
  });
}

/* ---------- Delete Row ---------- */
async function deleteRow(sheetName, uid){
  if(!confirm("Are you sure to delete this row?")) return;
  const result = await apiFetch(sheetName, "delete", { UID: uid });
  if(result){
    alert(result);
    loadTable(sheetName, sheetName + "-container", Object.keys(qs(sheetName + "-form").elements));
  }
}

/* ---------- Initialize Tables ---------- */
async function initDashboard(){
  const tables = [
    ["Vessel_Join", ["Vessel","Principal","Port","No. of Crew","Rank","Date","Flight"]],
    ["Arrivals", ["Vessel","Principal","Port","No. of Crew","Rank","Date","Flight"]],
    ["Updates", ["Title","Details","Date"]],
    ["Memo", ["Title","Details","Date"]],
    ["Training", ["Title","Details","Date"]],
    ["Pni", ["Title","Details","Date"]],
    ["Chatboard", ["Name","Message","Date"]]
  ];

  for(const [sheet, cols] of tables){
    loadTable(sheet, sheet + "-container", cols);
  }
}

/* ---------- Run on page load ---------- */
window.addEventListener("DOMContentLoaded", initDashboard);
