/* ===========================================================
   PTSC/THRI Crew Dashboard - JS
   Handles: add, edit, delete, fetch, render tables, PDF
============================================================= */

// -------------------- API FETCH ----------------------------
async function apiFetch(params) {
    const url = "https://script.google.com/macros/s/AKfycbyHJOMWdg01HTWdV1DoMajJV4oFja2YirfG1K56hnkQskFB9YSzfMGvahax8q0BIf9b/exec?" + params.toString();
    console.log("DEBUG → apiFetch URL:", url);
    try {
        const res = await fetch(url);
        const data = await res.json();
        return data;
    } catch (err) {
        console.error("apiFetch Error:", err);
        return null;
    }
}

// -------------------- HELPERS -----------------------------
function escapeHtml(str) {
    return str.replace(/[&<>"']/g, m => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' })[m]);
}

function makeId(name, prefix = "edit-") {
    return prefix + String(name).replace(/[^\w\-]/g, "_");
}

// -------------------- CURRENT EDIT ------------------------
let currentEdit = { sheet: null, uid: null, row: null };

async function openEditModal(sheet, uid) {
    console.log("DEBUG → openEditModal:", sheet, uid);
    if (!uid) { alert("Cannot edit: UID missing"); return; }

    const item = await apiFetch(new URLSearchParams({ sheet, action: "getItem", UID: uid }));
    if (!item) { alert("Item not found"); return; }
    currentEdit = { sheet, uid, row: item };

    let html = `<h5>Edit ${escapeHtml(sheet)}</h5>`;
    for (const k in item) {
        if (k === "UID" || k === "Timestamp") continue;
        const val = escapeHtml(String(item[k] || ""));
        const inputId = makeId(k, "edit-");
        if (k.toLowerCase().includes("details") || k.toLowerCase().includes("message")) {
            html += `<label>${escapeHtml(k)}</label><textarea id="${inputId}" class="form-control mb-2">${val}</textarea>`;
        } else if (k.toLowerCase().includes("date")) {
            const v = val ? (new Date(val)).toISOString().slice(0,10) : "";
            html += `<label>${escapeHtml(k)}</label><input id="${inputId}" type="date" class="form-control mb-2" value="${v}">`;
        } else {
            html += `<label>${escapeHtml(k)}</label><input id="${inputId}" class="form-control mb-2" value="${val}">`;
        }
    }
    html += `<div class="mt-2">
        <button class="btn btn-success" onclick="handleSaveEdit()">Save</button>
        <button class="btn btn-secondary" onclick="closeEditModal()">Cancel</button>
    </div>`;
    // Insert HTML into a modal
    const modal = document.getElementById("edit-modal");
    if(modal){
        modal.innerHTML = html;
        modal.style.display = "block";
    } else alert("Edit modal not found in HTML!");
}

function closeEditModal(){
    const modal = document.getElementById("edit-modal");
    if(modal) modal.style.display = "none";
}

// -------------------- DELETE ROW --------------------------
async function deleteRowConfirm(sheet, uid) {
    if(!confirm("Are you sure you want to delete this row?")) return;
    const res = await apiFetch(new URLSearchParams({ sheet, action: "delete", UID: uid }));
    if(res?.status === "success") {
        alert("Deleted successfully");
        loadSheetData(sheet); // refresh table
    } else alert("Delete failed: " + (res?.message||"Unknown error"));
}

// -------------------- LOAD TABLE --------------------------
async function loadSheetData(sheet) {
    const containerId = sheet.toLowerCase().replace("_","-") + "-data";
    const container = document.getElementById(containerId);
    if(!container) return;

    const data = await apiFetch(new URLSearchParams({ sheet, action: "get" }));
    if(!data || !Array.isArray(data)) { container.innerHTML = "No data"; return; }

    let html = `<table class="table table-sm table-bordered"><thead><tr>`;
    Object.keys(data[0]).forEach(k => html += `<th>${escapeHtml(k)}</th>`);
    html += `<th>Actions</th></tr></thead><tbody>`;

    data.forEach(row => {
        html += `<tr>`;
        Object.keys(row).forEach(k => html += `<td>${escapeHtml(row[k]||"")}</td>`);
        html += `<td>
            <button class="btn btn-sm btn-primary" onclick="openEditModal('${sheet}','${row.UID}')">Edit</button>
            <button class="btn btn-sm btn-danger" onclick="deleteRowConfirm('${sheet}','${row.UID}')">Delete</button>
        </td></tr>`;
    });
    html += `</tbody></table>`;
    container.innerHTML = html;
}

// -------------------- FORMS -------------------------------
function renderJoinForm(){ return `<div class="row g-2">
  <div class="col-md-4"><input id="vj-vessel" class="form-control" placeholder="Vessel"></div>
  <div class="col-md-4"><input id="vj-principal" class="form-control" placeholder="Principal"></div>
  <div class="col-md-4"><input id="vj-port" class="form-control" placeholder="Port"></div>
  <div class="col-md-4"><input id="vj-crew" class="form-control" placeholder="No. of Crew"></div>
  <div class="col-md-4"><input id="vj-rank" class="form-control" placeholder="Rank"></div>
  <div class="col-md-4"><input id="vj-date" type="date" class="form-control"></div>
  <div class="col-md-4"><input id="vj-flight" class="form-control" placeholder="Flight"></div>
  <div class="mt-2">
    <button class="btn btn-success" onclick="handleAddVesselJoin()">Save</button>
    <button class="btn btn-secondary" onclick="toggleForm('join')">Cancel</button>
  </div></div>`;

// Similar render functions for Arrivals, Updates, Memo, Training, PNI
// Example: renderArrivalsForm(), renderUpdatesForm(), etc.

// -------------------- HANDLE ADD --------------------------
async function handleAddVesselJoin(){
    const payload = {
        Vessel: document.getElementById("vj-vessel").value,
        Principal: document.getElementById("vj-principal").value,
        Port: document.getElementById("vj-port").value,
        Crew: document.getElementById("vj-crew").value,
        Rank: document.getElementById("vj-rank").value,
        Date: document.getElementById("vj-date").value,
        Flight: document.getElementById("vj-flight").value
    };
    const res = await apiFetch(new URLSearchParams({ sheet: "Vessel_Join", action: "add", ...payload }));
    if(res?.status==="success") {
        alert("Added successfully");
        toggleForm('join');
        loadSheetData("Vessel_Join");
    } else alert("Add failed: " + (res?.message||"Unknown error"));
}

// Similar handleAddArrivals(), handleAddUpdate(), handleAddMemo(), etc.

// -------------------- INITIALIZE --------------------------
function initDashboard(){
    ["Vessel_Join","Arrivals","Updates","Memo","Training","Pni","Chatboard"].forEach(loadSheetData);
}
window.addEventListener("DOMContentLoaded", initDashboard);

// -------------------- TOGGLE FORM -------------------------
function toggleForm(form){
    const id = form + "-form";
    const el = document.getElementById(id);
    if(el) el.style.display = el.style.display==="none"?"block":"none";
}

// -------------------- CHATBOARD / STICKY NOTE -------------
// Placeholder functions
function sendMessage(){ /* your chat logic */ }


