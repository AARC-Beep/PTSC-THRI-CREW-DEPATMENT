/* ============================================================
   PTSC / THRI Crew Dashboard JS (Fetch-based version)
   - Works with deployed Google Apps Script Web App
   - Fully integrated: Load tables, Edit, Delete → Archive, PDF
============================================================ */

// Your deployed Web App URL
const GAS_URL = "https://script.google.com/macros/s/YOUR_DEPLOYED_URL/exec";

// Current item being edited
let currentEdit = { sheet: null, uid: null, row: null };

/* ---------------- Helper Functions ---------------- */

// Map sheet names to HTML container IDs
function mapSheetToContainer(sheetName) {
  const map = {
    "Vessel_Join": "crew-join-data",
    "Arrivals": "crew-arrivals-data",
    "Updates": "daily-updates-data",
    "Memo": "memo-data",
    "Training": "training-data",
    "Pni": "pni-data",
    "Chatboard": "chatboard"
  };
  return map[sheetName] || null;
}

// Map sheet names to columns
function getColumnsForSheet(sheetName) {
  const map = {
    "Vessel_Join": ["Name", "Rank", "JoinDate", "Position"],
    "Arrivals": ["Name", "Rank", "ArrivalDate", "Remarks"],
    "Updates": ["Date", "UpdateDetails"],
    "Memo": ["Date", "MemoDetails"],
    "Training": ["Trainee", "Course", "CompletionDate"],
    "Pni": ["EventName", "Date", "Remarks"],
    "Chatboard": ["Sender", "Message", "Timestamp"]
  };
  return map[sheetName] || [];
}

// Escape HTML to prevent XSS
function escapeHtml(text) {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}

// Make consistent element ID
function makeId(name, prefix="") {
  return prefix + name.replace(/\s+/g, "_");
}

/* ---------------- API Fetch ---------------- */
async function apiFetch(params) {
  try {
    const url = `${GAS_URL}?${params.toString()}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error("Network response not ok");
    if (params.get("action") === "get") return await res.json();
    if (params.get("action") === "getItem") return await res.json();
    return await res.text(); // for delete/update actions
  } catch (err) {
    console.error("API Fetch error", err);
    throw err;
  }
}

/* ---------------- Load Table ---------------- */
async function loadTable(sheetName, containerId, columns) {
  try {
    const container = document.getElementById(containerId);
    container.innerHTML = "";

    const params = new URLSearchParams({ sheet: sheetName, action: "get" });
    const data = await apiFetch(params);

    if (!data || data.length === 0) {
      container.innerHTML = "<p>No data available.</p>";
      return;
    }

    const table = document.createElement("table");
    table.className = "table table-striped table-bordered";

    // Header
    const thead = document.createElement("thead");
    const headerRow = document.createElement("tr");
    columns.forEach(col => {
      const th = document.createElement("th");
      th.textContent = col;
      headerRow.appendChild(th);
    });
    const actionTh = document.createElement("th");
    actionTh.textContent = "Actions";
    headerRow.appendChild(actionTh);
    thead.appendChild(headerRow);
    table.appendChild(thead);

    // Body
    const tbody = document.createElement("tbody");
    data.forEach(item => {
      const tr = document.createElement("tr");
      columns.forEach(col => {
        const td = document.createElement("td");
        td.textContent = item[col] || "";
        tr.appendChild(td);
      });

      const actionTd = document.createElement("td");
      actionTd.innerHTML = `
        <button class="btn btn-sm btn-primary me-1" onclick="openEditModal('${sheetName}','${item.UID}')">Edit</button>
        <button class="btn btn-sm btn-danger" onclick="deleteRowConfirm('${sheetName}','${item.UID}')">Delete</button>
      `;
      tr.appendChild(actionTd);
      tbody.appendChild(tr);
    });

    table.appendChild(tbody);
    container.appendChild(table);

  } catch (err) {
    console.error("loadTable error:", err);
    alert("Error loading table: " + err.message);
  }
}

/* ---------------- Open Edit Modal ---------------- */
async function openEditModal(sheet, uid){
  if(!uid){ alert("Cannot edit: UID missing"); return; }
  try{
    const item = await apiFetch(new URLSearchParams({ sheet, action: "getItem", UID: uid }));
    if(!item){ alert("Item not found"); return; }
    currentEdit = { sheet, uid, row: item };

    let html = `<h5>Edit ${escapeHtml(sheet)}</h5>`;
    for(const k in item){
      if(k === "UID" || k === "Timestamp") continue;
      const val = escapeHtml(String(item[k] || ""));
      const inputId = makeId(k, "edit-");
      if(k.toLowerCase().includes("details") || k.toLowerCase().includes("message")){
        html += `<label>${escapeHtml(k)}</label><textarea id="${inputId}" class="form-control mb-2">${val}</textarea>`;
      } else if(k.toLowerCase().includes("date")){
        const v = val ? (new Date(val)).toISOString().slice(0,10) : "";
        html += `<label>${escapeHtml(k)}</label><input id="${inputId}" type="date" class="form-control mb-2" value="${v}">`;
      } else {
        html += `<label>${escapeHtml(k)}</label><input id="${inputId}" class="form-control mb-2" value="${val}">`;
      }
    }
    html += `<div class="mt-2">
               <button type="button" class="btn btn-primary" onclick="submitEdit()">Save</button>
               <button type="button" class="btn btn-secondary" onclick="closeModal()">Cancel</button>
             </div>`;
    showModal(html);
  }catch(err){
    alert("Error loading item: " + err.message);
    console.error("openEditModal error", err);
  }
}

/* ---------------- Submit Edit ---------------- */
async function submitEdit(){
  if(!currentEdit.uid || !currentEdit.sheet){ alert("Cannot save: UID or sheet missing"); return; }
  try{
    const p = new URLSearchParams({ sheet: currentEdit.sheet, action: "update", UID: currentEdit.uid });
    for(const k in currentEdit.row){
      if(k === "UID" || k === "Timestamp") continue;
      const el = document.getElementById(makeId(k,"edit-"));
      if(el) p.set(k, el.value);
    }
    await apiFetch(p);
    alert("Updated successfully");
    closeModal();
    await loadTable(currentEdit.sheet, mapSheetToContainer(currentEdit.sheet), getColumnsForSheet(currentEdit.sheet));
  }catch(err){
    alert("Update failed: " + err.message);
    console.error("submitEdit error", err);
  }
}

/* ---------------- Delete Row (Archive-safe) ---------------- */
async function deleteRowConfirm(sheetName, uid) {
  if (!uid || !sheetName) { alert("Cannot delete: missing UID or sheet"); return; }
  if (!confirm("Are you sure you want to delete this row?")) return;

  try {
    const params = new URLSearchParams({ sheet: sheetName, action: "delete", UID: uid });
    const res = await fetch(`${GAS_URL}?${params.toString()}`);
    if (!res.ok) throw new Error("Network response not ok");
    const text = await res.text();
    alert(text); // Deleted or error message
    loadTable(sheetName, mapSheetToContainer(sheetName), getColumnsForSheet(sheetName));
  } catch (err) {
    alert("Delete failed: " + err.message);
    console.error("deleteRowConfirm error", err);
  }
}

/* ---------------- Modal Functions ---------------- */
function showModal(content){
  let modal = document.getElementById("global-modal");
  if(!modal){
    modal = document.createElement("div");
    modal.id = "global-modal";
    modal.className = "modal fade show";
    modal.style.display = "block";
    modal.innerHTML = `<div class="modal-dialog"><div class="modal-content p-3" id="modal-content"></div></div>`;
    document.body.appendChild(modal);
  }
  document.getElementById("modal-content").innerHTML = content;
}

function closeModal(){
  const modal = document.getElementById("global-modal");
  if(modal) modal.remove();
}

/* ---------------- Generate Monthly PDF ---------------- */
async function generateMonthlyPDF(sheetName){
  const params = new URLSearchParams({ sheet: sheetName, action: "get" });
  const data = await apiFetch(params);
  if(!data || data.length === 0){ alert("No data to generate PDF"); return; }

  const { jsPDF } = window.jspdf;
  const doc = new jsPDF();
  const columns = getColumnsForSheet(sheetName);
  const rows = data.map(item => columns.map(col => item[col] || ""));
  doc.autoTable({ head: [columns], body: rows });
  doc.save(`${sheetName}_Monthly.pdf`);
}
