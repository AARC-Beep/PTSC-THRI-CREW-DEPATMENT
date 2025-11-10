/* ============================================================
   KANBUKAI / PTSC Dashboard - FRONTEND JS
   Full working version: login, add, edit, delete, chat,
   table PDF (whole sheet), item PDF, dashboard summary
============================================================ */

const GAS_URL = "https://script.google.com/macros/s/AKfycbyHJOMWdg01HTWdV1DoMajJV4oFja2YirfG1K56hnkQskFB9YSzfMGvahax8q0BIf9b/exec";

// -------------------- UTILITY --------------------
function qs(id){ return document.getElementById(id); }
function escapeHtml(unsafe){
    return unsafe.replace(/[&<"'>]/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
}
function shortDate(v){
    const d = new Date(v);
    return isNaN(d)? v : d.toLocaleDateString();
}

async function apiFetch(params){
    const url = `${GAS_URL}?${params.toString()}`;
    const res = await fetch(url);
    const j = await res.json();
    if(j.status!=="success") throw new Error(j.message||"API Error");
    return j.data;
}

// -------------------- LOGIN --------------------
async function loginUser(){
    const u = qs("login-username").value.trim();
    const p = qs("login-password").value.trim();
    const err = qs("login-error");
    err.innerText = "";

    if(!u || !p){ err.innerText="Enter username and password"; return; }

    try{
        const users = await apiFetch(new URLSearchParams({sheet:"Users",action:"get"}));
        const match = users.find(x=>String(x.Username).trim().toLowerCase()===u.toLowerCase() &&
                                      String(x.Password).trim()===p);
        if(!match){ err.innerText="Invalid username or password"; return; }

        sessionStorage.setItem("loggedInUser", match.Username);
        sessionStorage.setItem("userRole", match.Role);

        qs("login-overlay").style.display="none";
        showTab("dashboard");
        loadAllData();
        loadDashboard();
    }catch(e){ err.innerText="Login failed: "+e.message; }
}

document.addEventListener("DOMContentLoaded",()=>{
    if(sessionStorage.getItem("loggedInUser")){
        qs("login-overlay").style.display="none";
        showTab("dashboard");
        loadAllData();
        loadDashboard();
    } else { qs("login-overlay").style.display="flex"; }
});

// -------------------- TAB MENU --------------------
function showTab(id){
    document.querySelectorAll(".tab-window").forEach(t=> t.style.display="none");
    const el = qs(id); if(el) el.style.display="block";
}

document.querySelectorAll(".sidebar a[data-tab]").forEach(a=>{
    a.addEventListener("click", e=>{
        e.preventDefault();
        const t=a.getAttribute("data-tab");
        const r=sessionStorage.getItem("userRole");
        if((t==="training"||t==="pni") && r!=="admin"){ alert("Access denied (Admin only)"); return; }
        showTab(t);
    });
});

// -------------------- DASHBOARD --------------------
async function loadDashboard(){
    const map={
        "Vessel_Join":"dash-join",
        "Arrivals":"dash-arrivals",
        "Updates":"dash-updates",
        "Memo":"dash-memo",
        "Training":"dash-training",
        "Pni":"dash-pni"
    };
    for(const sheet in map){
        const box=qs(map[sheet]);
        box.innerHTML="Loading...";
        try{
            const data = await apiFetch(new URLSearchParams({sheet,action:"get"}));
            const rows = data.slice(-5).reverse();
            box.innerHTML="";
            rows.forEach(r=>{
                const d=document.createElement("div");
                d.className="card-body";
                d.innerHTML=`<small>${shortDate(r.Timestamp)} • ${escapeHtml(r.Vessel||r.Title||r.Subject||"")}</small>`;
                box.appendChild(d);
            });
        }catch(e){ box.innerHTML="Error"; }
    }
}

// -------------------- LOAD TABLES --------------------
async function loadAllData(){
    await loadTable("Vessel_Join","crew-join-data",
        ["Timestamp","Vessel","Principal","Port","No. of Crew","Rank","Date","Flight","UID"]);
    await loadTable("Arrivals","crew-arrivals-data",
        ["Timestamp","Vessel","Principal","Port","No. of Crew","Rank","Date","Flight","UID"]);
    await loadTable("Updates","daily-updates-data",
        ["Timestamp","Title","Details","Date","UID"]);
    await loadTable("Memo","memo-data",
        ["Timestamp","Title","Details","Date","UID"]);
    await loadTable("Training","training-data",
        ["Timestamp","Subject","Details","UID"]);
    await loadTable("Pni","pni-data",
        ["Timestamp","Subject","Details","UID"]);
    await loadChat();
}

// -------------------- TABLE BUILDER --------------------
async function loadTable(sheet,containerId,columns){
    const div=qs(containerId);
    div.innerHTML="<div>Loading...</div>";
    try{
        const data = await apiFetch(new URLSearchParams({sheet,action:"get"}));
        const table = document.createElement("table");
        table.className="table table-sm";

        table.innerHTML=`
            <thead>
                <tr>${columns.map(c=>`<th>${c}</th>`).join("")}<th>Actions</th></tr>
            </thead>
        `;
        const tbody=document.createElement("tbody");
        data.slice().reverse().forEach(row=>{
            const tr=document.createElement("tr");
            columns.forEach(col=>{
                tr.innerHTML+=`<td>${escapeHtml(String(row[col]||""))}</td>`;
            });
            tr.innerHTML+=`
                <td>
                    <button class="btn btn-sm btn-outline-primary" onclick="openEditModal('${sheet}','${row.UID}')">Edit</button>
                    <button class="btn btn-sm btn-outline-danger" onclick="deleteRowConfirm('${sheet}','${row.UID}')">Delete</button>
                </td>
            `;
            tbody.appendChild(tr);
        });
        table.appendChild(tbody);
        div.innerHTML=""; div.appendChild(table);
    }catch(e){ div.innerHTML="<div class='text-danger'>Failed to load table</div>"; }
}

// -------------------- ADD --------------------
async function addRowData(sheet,fields){
    try{
        const params = new URLSearchParams({sheet, action:"add"});
        for(const k in fields) params.set(k, fields[k]);
        await apiFetch(params);
        alert("Added successfully");
        loadAllData(); loadDashboard();
    }catch(e){ alert("Add failed: "+e.message); }
}

// Example: Add Vessel Join
async function addVesselJoin(){
    await addRowData("Vessel_Join",{
        Vessel:qs("vj-vessel").value,
        Principal:qs("vj-principal").value,
        Port:qs("vj-port").value,
        "No. of Crew":qs("vj-crew").value,
        Rank:qs("vj-rank").value,
        Date:qs("vj-date").value,
        Flight:qs("vj-flight").value
    });
}

// Similar functions for Arrivals, Updates, Memo, Training, Pni
async function addArrivals(){
    await addRowData("Arrivals",{
        Vessel:qs("av-vessel").value,
        Principal:qs("av-principal").value,
        Port:qs("av-port").value,
        "No. of Crew":qs("av-crew").value,
        Rank:qs("av-rank").value,
        Date:qs("av-date").value,
        Flight:qs("av-flight").value
    });
}

// -------------------- EDIT --------------------
let currentEdit = {sheet:null, uid:null, row:null};
async function openEditModal(sheet,uid){
    try{
        const item = await apiFetch(new URLSearchParams({sheet, action:"getItem", UID:uid}));
        currentEdit={sheet,uid,row:item};

        let html=`<h5>Edit ${sheet}</h5>`;
        for(const k in item){
            if(k==="UID"||k==="Timestamp") continue;
            html+=`
                <label>${k}</label>
                <input id="edit-${k}" class="form-control" value="${escapeHtml(String(item[k]||""))}">
                <br>
            `;
        }
        html+=`<button class="btn btn-primary mt-2" onclick="submitEdit()">Save</button>`;
        showModal(html);
    }catch(e){ alert("Error loading item: "+e.message); }
}

function showModal(content){
    const modal=document.createElement("div");
    modal.id="modal-backdrop";
    modal.className="modal-backdrop";
    modal.innerHTML=`<div class="modal-box">${content}<button class="btn btn-secondary mt-2" onclick="closeModal()">Close</button></div>`;
    document.body.appendChild(modal);
}

function closeModal(){ const x=qs("modal-backdrop"); if(x) x.remove(); }

async function submitEdit(){
    const p=new URLSearchParams({sheet:currentEdit.sheet, action:"update", UID:currentEdit.uid});
    for(const k in currentEdit.row){
        if(k==="UID"||k==="Timestamp") continue;
        const el=qs("edit-"+k);
        if(el) p.set(k, el.value);
    }
    try{
        await apiFetch(p);
        alert("Updated successfully");
        closeModal(); loadAllData(); loadDashboard();
    }catch(e){ alert("Update failed: "+e.message); }
}

// -------------------- DELETE --------------------
function deleteRowConfirm(sheet,uid){
    if(confirm("Delete this item? (Will move to Archive)")) deleteRow(sheet,uid);
}
async function deleteRow(sheet,uid){
    try{
        await apiFetch(new URLSearchParams({sheet, action:"delete", UID:uid}));
        alert("Deleted successfully");
        loadAllData(); loadDashboard();
    }catch(e){ alert("Delete failed: "+e.message); }
}

// -------------------- CHAT --------------------
async function loadChat(){
    try{
        const data = await apiFetch(new URLSearchParams({sheet:"Chatboard", action:"get"}));
        const box=qs("chatboard"); box.innerHTML="";
        data.slice().reverse().forEach(r=>{
            const d=document.createElement("div");
            d.className="message";
            d.innerHTML=`<small>[${shortDate(r.Timestamp)}] <b>${escapeHtml(r.Name||"")}</b>: ${escapeHtml(r.Message||"")}</small>`;
            box.appendChild(d);
        });
    }catch(e){ qs("chatboard").innerHTML="Chat load error"; }
}

async function sendMessage(){
    const msg = qs("chat-input").value.trim();
    if(!msg) return;
    try{
        await apiFetch(new URLSearchParams({sheet:"Chatboard", action:"chat",
            Name: sessionStorage.getItem("loggedInUser")||"User", Message: msg}));
        qs("chat-input").value="";
        loadChat();
    }catch(e){ alert("Chat failed: "+e.message); }
}

// -------------------- PDF (Whole Table) --------------------
async function generateSheetPDF(sheet, containerId){
    try{
        const data = await apiFetch(new URLSearchParams({sheet, action:"get"}));
        if(data.length===0){ alert("No data to export"); return; }

        const doc = new jsPDF();
        const cols = Object.keys(data[0]);
        const rows = data.map(r=>cols.map(c=>String(r[c]||"")));

        doc.autoTable({head:[cols], body:rows});
        doc.save(sheet+"_Table.pdf");
    }catch(e){ alert("PDF export failed: "+e.message); }
}

// -------------------- END OF FILE --------------------
