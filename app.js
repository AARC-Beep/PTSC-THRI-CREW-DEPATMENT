/* ============================================================
   PTSC / THRI Crew Dashboard - Full JS (Rewritten)
   Features: add, edit, delete (archive), chat, auto-refresh
============================================================== */

const GAS_URL = "https://script.google.com/macros/s/AKfycbxoLIrNGnPkxfwoZhzNqnquDbDLoKnqmkSpU-ET6wlq1lA-pQemm88dqyNbsJnl7Lem/exec";

/* -------------------- Utilities -------------------- */
const qs = id => document.getElementById(id);

function debugLog(...args){ if(window.console) console.log(...args); }

function escapeHtml(unsafe){
  if(!unsafe) return "";
  return String(unsafe).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
}

function shortDate(v){
  if(!v) return "";
  const d = new Date(v);
  if(isNaN(d)) return String(v);
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

function makeId(name, prefix="edit-"){
  return prefix + String(name).replace(/[^\w\-]/g, "_");
}

async function apiFetch(params){
  const urlParams = params instanceof URLSearchParams ? params : new URLSearchParams(params);
  const url = `${GAS_URL}?${urlParams.toString()}`;
  debugLog("API Fetch:", url);
  const res = await fetch(url);
  if(!res.ok) throw new Error("Network error: " + res.status);
  const j = await res.json();
  if(j.status && j.status !== "success") throw new Error(j.message || "API error");
  return j.data === undefined ? j : j.data;
}

/* -------------------- LOGIN -------------------- */
async function loginUser(){
  const u = qs("login-username")?.value?.trim() || "";
  const p = qs("login-password")?.value?.trim() || "";
  const err = qs("login-error");
  if(err) err.innerText = "";

  if(!u || !p){ if(err) err.innerText="Enter username and password"; return; }

  try{
    const users = await apiFetch({ sheet: "Users", action: "get" });
    const match = (users || []).find(x => (x.Username||"").toLowerCase()===u.toLowerCase() && (x.Password||"")===p);
    if(!match){ if(err) err.innerText="Invalid username or password"; return; }

    sessionStorage.setItem("loggedInUser", match.Username);
    sessionStorage.setItem("userRole", match.Role||"");
    qs("login-overlay").style.display="none";
    showTab("dashboard");
    await initReload();
  }catch(e){ if(err) err.innerText="Login failed: "+e.message; debugLog("loginUser error:", e); }
}

document.addEventListener("DOMContentLoaded", () => {
  if(sessionStorage.getItem("loggedInUser")){
    qs("login-overlay").style.display="none";
    showTab("dashboard");
    initReload();
  } else {
    qs("login-overlay").style.display="flex";
  }
});

/* -------------------- TAB NAV -------------------- */
function showTab(id){
  document.querySelectorAll(".tab-window").forEach(t=>t.classList.remove("active"));
  const el = qs(id);
  if(el) el.classList.add("active");
}

document.querySelectorAll(".sidebar a[data-tab]").forEach(a=>{
  a.addEventListener("click", e=>{
    e.preventDefault();
    const t = a.getAttribute("data-tab");
    const r = sessionStorage.getItem("userRole");
    if((t==="training" || t==="pni") && r!=="admin"){ alert("Access denied (Admin only)"); return; }
    showTab(t);
  });
});

/* -------------------- DASHBOARD -------------------- */
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
    const container = qs(map[sheet]);
    if(!container) continue;
    container.innerHTML = "Loading...";
    try{
      const data = await apiFetch({ sheet, action: "get" }).catch(()=>[]);
      const rows = (data||[]).slice(-5).reverse();
      container.innerHTML = "";
      rows.forEach(r=>{
        const d = document.createElement("div");
        d.className = "card-body";
        const rawDate = r.Date || r.Timestamp || "";
        const dObj = new Date(rawDate);
        const dateField = isNaN(dObj) ? (rawDate?String(rawDate):"") : dObj.toLocaleDateString("en-US",{year:"numeric",month:"short",day:"numeric"});
        const title = r.Vessel || r.Title || r.Subject || "";
        d.innerHTML = `<small>${escapeHtml(dateField)} • <b>${escapeHtml(title)}</b></small>`;
        container.appendChild(d);
      });
      if(!rows.length) container.innerHTML="<small>No recent items</small>";
    }catch(err){ container.innerHTML="<small>Error loading</small>"; debugLog("Dashboard load error", sheet, err); }
  }
}

/* -------------------- TABLES -------------------- */
async function loadAllData(){
  const sheets = [
    ["Vessel_Join","crew-join-data", ["Vessel","Principal","Port","No. of Crew","Rank","Date","Flight"]],
    ["Arrivals","crew-arrivals-data", ["Vessel","Principal","Port","No. of Crew","Rank","Date","Flight"]],
    ["Updates","daily-updates-data", ["Title","Details","Date"]],
    ["Memo","memo-data", ["Title","Details","Date"]],
    ["Training","training-data", ["Subject","Details","Date"]],
    ["Pni","pni-data", ["Subject","Details","Date"]]
  ];
  await Promise.all(sheets.map(([sheet,container,cols])=>loadTable(sheet,container,cols)));
}

async function loadTable(sheetName, containerId, columns){
  const container = qs(containerId);
  container.innerHTML = "";
  try{
    const data = await apiFetch({ sheet: sheetName, action: "get" });
    if(!data || !Array.isArray(data)) return;

    const table = document.createElement("table");
    table.classList.add("table");
    const thead = document.createElement("thead");
    const trHead = document.createElement("tr");
    columns.forEach(col=>{
      const th = document.createElement("th"); th.textContent=col; trHead.appendChild(th);
    });
    ["Edit","Archive"].forEach(txt=>{ const th=document.createElement("th"); th.textContent=txt; trHead.appendChild(th); });
    thead.appendChild(trHead); table.appendChild(thead);

    const tbody = document.createElement("tbody");
    data.forEach(row=>{
      const tr=document.createElement("tr");
      columns.forEach(col=>{
        const td=document.createElement("td"); const raw=row[col]||"";
        if(String(col).toLowerCase().includes("date") && raw){ const d=new Date(raw); td.textContent=isNaN(d)?raw:d.toLocaleDateString("en-US",{year:"numeric",month:"short",day:"numeric"}); }
        else td.textContent=raw;
        tr.appendChild(td);
      });
      // Edit
      const tdEdit=document.createElement("td"); const btnEdit=document.createElement("button");
      btnEdit.textContent="Edit"; btnEdit.classList.add("btn","btn-sm","btn-primary"); btnEdit.onclick=()=>openEditModal(sheetName,row["UID"]);
      tdEdit.appendChild(btnEdit); tr.appendChild(tdEdit);
      // Archive
      const tdAction=document.createElement("td"); const btn=document.createElement("button");
      btn.textContent="Archive"; btn.classList.add("btn","btn-sm","btn-warning");
      btn.onclick=()=>archiveRow(sheetName,row["UID"]);
      tdAction.appendChild(btn); tr.appendChild(tdAction);

      tbody.appendChild(tr);
    });
    table.appendChild(tbody);
    container.appendChild(table);
  }catch(err){ console.error("loadTable error:", err); container.innerHTML=`<p>Error loading ${sheetName}</p>`; }
}

function mapSheetToContainer(sheet){
  const map = { "Vessel_Join":"crew-join-data", "Arrivals":"crew-arrivals-data", "Updates":"daily-updates-data", "Memo":"memo-data", "Training":"training-data", "Pni":"pni-data" };
  return map[sheet]||"";
}

function getColumnsForSheet(sheet){
  const map = {
    "Vessel_Join":["Vessel","Principal","Port","No. of Crew","Rank","Date","Flight"],
    "Arrivals":["Vessel","Principal","Port","No. of Crew","Rank","Date","Flight"],
    "Updates":["Title","Details","Date"],
    "Memo":["Title","Details","Date"],
    "Training":["Subject","Details","Date"],
    "Pni":["Subject","Details","Date"]
  };
  return map[sheet]||[];
}

/* -------------------- ARCHIVE -------------------- */
async function archiveRow(sheetName, uid){
  if(!confirm("Are you sure you want to archive this row?")) return;
  if(!sheetName || !uid) { alert("Missing sheet or UID"); return; }

  try{
    // 1️⃣ get archive sheet name
    const archiveSheetName = "Archive_" + sheetName;

    // 2️⃣ ensure archive tab exists
    await apiFetch({ sheet: sheetName, action: "ensureArchive", ArchiveSheet: archiveSheetName });

    // 3️⃣ delete original row (server-side will move it to archive)
    await apiFetch({ sheet: sheetName, action: "delete", UID: uid });

    alert("Row archived successfully");
    await loadTable(sheetName, mapSheetToContainer(sheetName), getColumnsForSheet(sheetName));
    await loadDashboard();
  }catch(err){ alert("Failed to archive row: "+err.message); console.error(err); }
}

/* -------------------- EDIT -------------------- */
let currentEdit={ sheet:null, uid:null, row:null };
async function openEditModal(sheet, uid){
  try{
    const item = await apiFetch({ sheet, action:"getItem", UID:uid });
    if(!item){ alert("Item not found"); return; }
    currentEdit={ sheet, uid, row:item };

    let html=`<h5>Edit ${escapeHtml(sheet)}</h5>`;
    for(const k in item){
      if(k==="UID"||k==="Timestamp") continue;
      const val=String(item[k]||""); const inputId=makeId(k,"edit-");
      if(k.toLowerCase().includes("details") || k.toLowerCase().includes("message")){
        html+=`<label>${escapeHtml(k)}</label><textarea id="${inputId}" class="form-control mb-2">${escapeHtml(val)}</textarea>`;
      } else if(k.toLowerCase().includes("date")){
        let v=""; if(val){ const d=new Date(val); if(!isNaN(d)) v=d.toISOString().slice(0,10); else v=val.slice(0,10); }
        html+=`<label>${escapeHtml(k)}</label><input id="${inputId}" type="date" class="form-control mb-2" value="${escapeHtml(v)}">`;
      } else {
        html+=`<label>${escapeHtml(k)}</label><input id="${inputId}" class="form-control mb-2" value="${escapeHtml(val)}">`;
      }
    }
    html+=`<div class="mt-2">
             <button type="button" class="btn btn-primary" onclick="submitEdit()">Save</button>
             <button type="button" class="btn btn-secondary" onclick="closeModal()">Cancel</button>
           </div>`;
    showModal(html);
  }catch(err){ alert("Error loading item: "+err.message); debugLog("openEditModal error", err); }
}

async function submitEdit(){
  if(!currentEdit.uid || !currentEdit.sheet){ alert("Cannot save: UID or sheet missing"); return; }
  try{
    const p=new URLSearchParams({ sheet: currentEdit.sheet, action:"update", UID: currentEdit.uid });
    for(const k in currentEdit.row){
      if(k==="UID"||k==="Timestamp") continue;
      const el=qs(makeId(k,"edit-")); if(el) p.set(k,el.value);
    }
    await apiFetch(p);
    alert("Updated successfully");
    closeModal();
    await loadTable(currentEdit.sheet,mapSheetToContainer(currentEdit.sheet),getColumnsForSheet(currentEdit.sheet));
    await loadDashboard();
  }catch(err){ alert("Update failed: "+err.message); debugLog("submitEdit error", err); }
}

/* -------------------- MODAL -------------------- */
function showModal(content){
  const existing=qs("customModal"); if(existing) existing.remove();
  const modal=document.createElement("div"); modal.id="customModal";
  Object.assign(modal.style,{position:"fixed",top:0,left:0,width:"100%",height:"100%",backgroundColor:"rgba(0,0,0,0.5)",display:"flex",justifyContent:"center",alignItems:"center",zIndex:9999});
  const box=document.createElement("div"); Object.assign(box.style,{backgroundColor:"#fff",padding:"20px",borderRadius:"8px",minWidth:"300px"});
  box.innerHTML=content; modal.appendChild(box); document.body.appendChild(modal);
}
function closeModal(){ const modal=qs("customModal"); if(modal) modal.remove(); }

/* -------------------- ADD HANDLERS -------------------- */
async function handleAdd(sheet, fields, containerId, columns){
  try{
    await apiFetch({ sheet, action:"add", ...fields });
    alert("Added successfully");
    toggleForm(sheet.toLowerCase());
    await loadTable(sheet, containerId, columns);
    await loadDashboard();
  }catch(e){ alert("Add failed: "+e.message); debugLog("handleAdd error", e); }
}

/* -------------------- CHAT -------------------- */
async function loadChat(){
  const box=qs("chatboard"); if(!box) return;
  box.innerHTML="Loading...";
  try{
    const data=await apiFetch({ sheet:"Chatboard", action:"get" }).catch(()=>[]);
    box.innerHTML="";
    data.slice().reverse().forEach(r=>{
      const d=document.createElement("div"); d.className="message";
      const ts=r.Timestamp||""; const tObj=new Date(ts);
      const tsDisplay=isNaN(tObj)?ts:tObj.toLocaleString();
      d.innerHTML=`<small>[${escapeHtml(tsDisplay)}] <b>${escapeHtml(r.Name||"")}</b>: ${escapeHtml(r.Message||"")}</small>`;
      box.appendChild(d);
    });
    if(!data.length) box.innerHTML="<small>No chat messages</small>";
  }catch(e){ box.innerHTML="<small>Error loading chat</small>"; debugLog("loadChat error", e); }
}

async function sendMessage(){
  const input=qs("chat-input"); const msg=input?.value.trim(); if(!msg) return;
  const p={ sheet:"Chatboard", action:"chat", Name:sessionStorage.getItem("loggedInUser")||"User", Message:msg };
  try{ await apiFetch(p); input.value=""; await loadChat(); }catch(e){ alert("Failed to send chat: "+e.message); }
}

/* -------------------- FORM & TOGGLE -------------------- */
function toggleForm(type){ const map={ join:"join-form", arrivals:"arrival-form", updates:"update-form", memo:"memo-form", training:"training-form", pni:"pni-form" };
  const c=qs(map[type]); if(!c) return;
  if(c.style.display==="block"){ c.style.display="none"; return; }
  c.innerHTML=renderForm(type); c.style.display="block";
}

/* -------------------- AUTO REFRESH -------------------- */
setInterval(async ()=>{
  if(sessionStorage.getItem("loggedInUser")){
    await loadDashboard();
    await loadAllData();
    await loadChat();
  }
}, 15000);

/* -------------------- INIT -------------------- */
async function initReload(){ await loadDashboard(); await loadAllData(); await loadChat(); }
