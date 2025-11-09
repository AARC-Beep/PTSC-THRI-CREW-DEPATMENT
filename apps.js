// ---------- Login ----------
async function loginUser(){
    const username = qs('login-username').value.trim();
    const password = qs('login-password').value.trim();
    const errDiv = qs('login-error');
    errDiv.innerText = '';
    if(!username || !password){ errDiv.innerText = 'Enter username and password'; return; }

    try{
        const users = await apiFetch(new URLSearchParams({sheet:'Users', action:'get'}));
        const match = users.find(u=> u.Username===username && u.Password===password);
        if(match){
            // store role in sessionStorage
            sessionStorage.setItem('loggedInUser', username);
            sessionStorage.setItem('userRole', match.Role || '');
            document.getElementById('login-overlay').style.display='none';
            showTab('dashboard');
            loadAllData();
            loadDashboard();
        } else {
            errDiv.innerText = 'Invalid username or password';
        }
    }catch(err){
        errDiv.innerText = 'Login failed: '+err.message;
    }
}

// check login on page load
document.addEventListener('DOMContentLoaded', ()=>{
    const user = sessionStorage.getItem('loggedInUser');
    if(user){
        document.getElementById('login-overlay').style.display='none';
        showTab('dashboard');
    } else {
        document.getElementById('login-overlay').style.display='flex';
    }
});

/* app.js for KANBUKAI Dashboard
   - Replace GAS_URL with your Apps Script Web App URL after deploying
*/

const GAS_URL = 'https://script.google.com/macros/s/AKfycbyHJOMWdg01HTWdV1DoMajJV4oFja2YirfG1K56hnkQskFB9YSzfMGvahax8q0BIf9b/exec'; // <<=== put your Deploy URL here

// ---------- Utility helpers ----------
function qs(id){ return document.getElementById(id); }
function showTab(tabId){
  const tabs = ['dashboard','crew-join','crew-arrivals','daily-updates','memo','training','pni','chat'];
  tabs.forEach(id => { const el = qs(id); if(el) el.style.display = (id===tabId) ? 'block' : 'none'; });
}

// ---------- Initialization ----------
document.addEventListener('DOMContentLoaded', () => {
  showTab('dashboard');
  loadAllData();
  loadDashboard();
  stickyInit();
});

// ---------- Sticky note ----------
function stickyInit(){
  const t = qs('sticky-text');
  if(!t) return;
  t.value = localStorage.getItem('stickyNote')||'';
  t.addEventListener('input', ()=> localStorage.setItem('stickyNote', t.value));
}

// ---------- Fetch wrapper ----------
async function apiFetch(params){
  const url = `${GAS_URL}?${params.toString()}`;
  const res = await fetch(url);
  const j = await res.json();
  if(j.status !== 'success') throw new Error(j.message || 'API error');
  return j.data;
}

// ---------- Load dashboard quick cards (top 5) ----------
async function loadDashboard(){
  const cards = {
    'Vessel_Join':'dash-join',
    'Arrivals':'dash-arrivals',
    'Updates':'dash-updates',
    'Memo':'dash-memo',
    'Training':'dash-training',
    'Pni':'dash-pni'
  };
  for(const sheet in cards){
    try{
      const data = await apiFetch(new URLSearchParams({sheet, action:'get'}));
      const top = data.slice(-5).reverse();
      const container = qs(cards[sheet]);
      container.innerHTML = '';
      top.forEach(row => {
        const d = document.createElement('div');
        d.className = 'card-body';
        d.innerHTML = `<small>${formatRowShort(row)}</small>`;
        container.appendChild(d);
      });
    }catch(err){
      qs(cards[sheet]).innerText = 'Error';
    }
  }
}

// ---------- Load all tab tables ----------
async function loadAllData(){
  await loadTable('Vessel_Join','crew-join-data', ['Timestamp','Vessel','Principal','Port','No. of Crew','Rank','Date','Flight','UID']);
  await loadTable('Arrivals','crew-arrivals-data', ['Timestamp','Vessel','Principal','Port','No. of Crew','Rank','Date','Flight','UID']);
  await loadTable('Updates','daily-updates-data', ['Timestamp','Title','Details','Date','UID']);
  await loadTable('Memo','memo-data', ['Timestamp','Title','Details','Date','UID']);
  await loadTable('Training','training-data', ['Timestamp','Subject','Details','UID']);
  await loadTable('Pni','pni-data', ['Timestamp','Subject','Details','UID']);
  await loadChat();
}

// ---------- Render helper short format ----------
function formatRowShort(row){
  // Uses available fields to show compact text
  const parts = [];
  if(row.Timestamp) parts.push(shortDate(row.Timestamp));
  if(row.Vessel) parts.push(row.Vessel);
  if(row.Title) parts.push(row.Title);
  if(row.Subject) parts.push(row.Subject);
  return parts.join(' • ');
}

function shortDate(v){
  const d = new Date(v);
  if(isNaN(d)) return v;
  return d.toLocaleDateString();
}

// ---------- TABLE RENDER ----------
async function loadTable(sheet, containerId, columns){
  const container = qs(containerId);
  container.innerHTML = '<div class="table-responsive">Loading...</div>';
  try{
    const data = await apiFetch(new URLSearchParams({sheet, action:'get'}));
    // produce table
    const table = document.createElement('table');
    table.className = 'table table-sm';
    const thead = document.createElement('thead');
    thead.innerHTML = `<tr>${columns.map(c => `<th>${c}</th>`).join('')}<th>Actions</th></tr>`;
    table.appendChild(thead);
    const tbody = document.createElement('tbody');
    data.slice().reverse().forEach(row=>{
      const tr = document.createElement('tr');
      columns.forEach(c => {
        const v = row[c] === undefined ? '' : row[c];
        tr.innerHTML += `<td>${escapeHtml(String(v||''))}</td>`;
      });
      // actions: Edit, Delete, PDF
      const uid = row['UID'] || '';
      const actions = `
        <td>
          <button class="btn btn-sm btn-outline-primary" onclick="openEditModal('${sheet}','${uid}')">Edit</button>
          <button class="btn btn-sm btn-outline-danger" onclick="deleteRowConfirm('${sheet}','${uid}')">Delete</button>
          <button class="btn btn-sm btn-outline-secondary" onclick="generateItemPDF('${sheet}','${uid}')">PDF</button>
        </td>
      `;
      tr.innerHTML += actions;
      tbody.appendChild(tr);
    });
    table.appendChild(tbody);
    container.innerHTML = '';
    container.appendChild(table);
  }catch(err){
    container.innerHTML = '<div class="text-danger">Failed to load</div>';
    console.error(err);
  }
}

function escapeHtml(unsafe) {
  return unsafe.replace(/[&<"'>]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":"&#039;"}[c]));
}

// ---------- ADD functions (example: Vessel Join) ----------
// addVesselJoin called from form add button
async function addVesselJoin(){
  const get = (id)=> qs(id).value;
  const params = new URLSearchParams({
    sheet:'Vessel_Join', action:'add',
    Vessel: get('vj-vessel'),
    Principal: get('vj-principal'),
    Port: get('vj-port'),
    'No. of Crew': get('vj-crew'),
    Rank: get('vj-rank'),
    Date: get('vj-date'),
    Flight: get('vj-flight')
  });
  try{
    await apiFetch(params);
    alert('Added');
    await loadTable('Vessel_Join','crew-join-data',['Timestamp','Vessel','Principal','Port','No. of Crew','Rank','Date','Flight','UID']);
    loadDashboard();
  }catch(err){ alert('Add failed: '+err.message); }
}

// ---------- Add functions for other tabs (similar pattern) ----------
async function addArrivals(){ // fields ids: av-*
  const get = id=> qs(id).value;
  const params = new URLSearchParams({
    sheet:'Arrivals', action:'add',
    Vessel: get('av-vessel'),
    Principal: get('av-principal'),
    Port: get('av-port'),
    'No. of Crew': get('av-crew'),
    Rank: get('av-rank'),
    Date: get('av-date'),
    Flight: get('av-flight')
  });
  try{ await apiFetch(params); alert('Added'); await loadTable('Arrivals','crew-arrivals-data',['Timestamp','Vessel','Principal','Port','No. of Crew','Rank','Date','Flight','UID']); loadDashboard(); }
  catch(err){ alert('Add failed: '+err.message); }
}

async function addUpdate(){
  const get = id=> qs(id).value;
  const params = new URLSearchParams({
    sheet:'Updates', action:'add',
    Title: get('up-title'),
    Details: get('up-details'),
    Date: get('up-date')
  });
  try{ await apiFetch(params); alert('Added'); await loadTable('Updates','daily-updates-data',['Timestamp','Title','Details','Date','UID']); loadDashboard(); }
  catch(err){ alert('Add failed: '+err.message); }
}

async function addMemo(){
  const get = id=> qs(id).value;
  const params = new URLSearchParams({
    sheet:'Memo', action:'add',
    Title: get('memo-title'),
    Details: get('memo-details'),
    Date: get('memo-date')
  });
  try{ await apiFetch(params); alert('Added'); await loadTable('Memo','memo-data',['Timestamp','Title','Details','Date','UID']); loadDashboard(); }
  catch(err){ alert('Add failed: '+err.message); }
}

async function addTraining(){
  const get = id=> qs(id).value;
  const params = new URLSearchParams({
    sheet:'Training', action:'add',
    Subject: get('tr-subject'),
    Details: get('tr-details')
  });
  try{ await apiFetch(params); alert('Added'); await loadTable('Training','training-data',['Timestamp','Subject','Details','UID']); loadDashboard(); }
  catch(err){ alert('Add failed: '+err.message); }
}

async function addPni(){
  const get = id=> qs(id).value;
  const params = new URLSearchParams({
    sheet:'Pni', action:'add',
    Subject: get('pn-subject'),
    Details: get('pn-details')
  });
  try{ await apiFetch(params); alert('Added'); await loadTable('Pni','pni-data',['Timestamp','Subject','Details','UID']); loadDashboard(); }
  catch(err){ alert('Add failed: '+err.message); }
}

// ---------- EDIT modal handling ----------
let currentEdit = {sheet:null, UID:null, headers:[], row:null};

async function openEditModal(sheet, uid){
  // fetch item
  try{
    const item = await apiFetch(new URLSearchParams({sheet, action:'getItem', UID:uid}));
    currentEdit.sheet = sheet;
    currentEdit.UID = uid;
    currentEdit.row = item;
    // build modal HTML dynamically
    const modalHtml = buildEditFormHtml(item);
    showModal(modalHtml);
  }catch(err){
    alert('Failed to load item: '+err.message);
  }
}

function buildEditFormHtml(item){
  let fieldsHtml = '';
  // for each property except UID and Timestamp create an input
  for(const k in item){
    if(k === 'UID' || k === 'Timestamp' || k === '__sheet') continue;
    const safeVal = item[k] ? escapeHtml(String(item[k])) : '';
    if(k.toLowerCase().includes('details') || k.toLowerCase().includes('message') ) {
      fieldsHtml += `<div class="mb-2"><label class="form-label">${k}</label><textarea id="edit-${k}" class="form-control">${safeVal}</textarea></div>`;
    } else if(k.toLowerCase().includes('date')) {
      const v = safeVal ? (new Date(safeVal)).toISOString().slice(0,10) : '';
      fieldsHtml += `<div class="mb-2"><label class="form-label">${k}</label><input id="edit-${k}" type="date" class="form-control" value="${v}"></div>`;
    } else {
      fieldsHtml += `<div class="mb-2"><label class="form-label">${k}</label><input id="edit-${k}" class="form-control" value="${safeVal}"></div>`;
    }
  }
  const html = `
    <div>
      <h5>Edit ${item.__sheet || ''}</h5>
      ${fieldsHtml}
      <div style="display:flex; gap:8px; justify-content:flex-end; margin-top:10px;">
        <button class="btn btn-secondary" onclick="closeModal()">Cancel</button>
        <button class="btn btn-primary" onclick="submitEdit()">Save</button>
      </div>
    </div>
  `;
  return html;
}

function showModal(innerHtml){
  // create backdrop
  const backdrop = document.createElement('div');
  backdrop.className = 'modal-backdrop';
  backdrop.id = 'modal-backdrop';
  const box = document.createElement('div');
  box.className = 'modal-box';
  box.innerHTML = innerHtml;
  backdrop.appendChild(box);
  document.body.appendChild(backdrop);
}

function closeModal(){
  const b = qs('modal-backdrop');
  if(b) b.remove();
}

async function submitEdit(){
  // build params for update
  const sheet = currentEdit.sheet;
  const UID = currentEdit.UID;
  const params = new URLSearchParams({sheet, action:'update', UID});
  // pick up inputs by scanning currentEdit.row keys
  for(const k in currentEdit.row){
    if(k === 'UID' || k === 'Timestamp' || k === '__sheet') continue;
    const el = qs('edit-' + k);
    if(el){
      params.set(k, el.value);
    }
  }
  try{
    await apiFetch(params);
    alert('Updated');
    closeModal();
    await loadTable(sheet, sheetToContainer(sheet), guessColumnsForSheet(sheet));
    loadDashboard();
  }catch(err){ alert('Update failed: '+err.message); }
}

function sheetToContainer(sheet){
  switch(sheet){
    case 'Vessel_Join': return 'crew-join-data';
    case 'Arrivals': return 'crew-arrivals-data';
    case 'Updates': return 'daily-updates-data';
    case 'Memo': return 'memo-data';
    case 'Training': return 'training-data';
    case 'Pni': return 'pni-data';
    default: return '';
  }
}

function guessColumnsForSheet(sheet){
  switch(sheet){
    case 'Vessel_Join':
    case 'Arrivals':
      return ['Timestamp','Vessel','Principal','Port','No. of Crew','Rank','Date','Flight','UID'];
    case 'Updates':
    case 'Memo':
      return ['Timestamp','Title','Details','Date','UID'];
    case 'Training':
    case 'Pni':
      return ['Timestamp','Subject','Details','UID'];
    default:
      return [];
  }
}

// ---------- Delete ----------
function deleteRowConfirm(sheet, uid){
  if(!confirm('Delete this item? It will be moved to Archive.')) return;
  deleteRow(sheet, uid);
}
async function deleteRow(sheet, uid){
  try{
    await apiFetch(new URLSearchParams({sheet, action:'delete', UID:uid}));
    alert('Deleted and moved to Archive');
    await loadTable(sheet, sheetToContainer(sheet), guessColumnsForSheet(sheet));
    loadDashboard();
  }catch(err){ alert('Delete failed: '+err.message); }
}

// ---------- Chat ----------
async function loadChat(){
  try{
    const data = await apiFetch(new URLSearchParams({sheet:'Chatboard', action:'get'}));
    const c = qs('chatboard');
    c.innerHTML = '';
    data.slice().reverse().forEach(r => {
      const d = document.createElement('div');
      d.className = 'message';
      d.innerHTML = `<small>[${shortDate(r.Timestamp)}] <b>${escapeHtml(r.Name||'')}</b>: ${escapeHtml(r.Message||'')}</small>`;
      c.appendChild(d);
    });
  }catch(err){ qs('chatboard').innerText='Failed to load chat'; }
}

async function sendMessage(){
  const input = qs('chat-input');
  if(!input || !input.value.trim()) return;
  const params = new URLSearchParams({sheet:'Chatboard', action:'chat', Name: 'User', Message: input.value});
  try{
    await apiFetch(params);
    input.value = '';
    loadChat();
  }catch(err){ alert('Chat failed: '+err.message); }
}

// ---------- PDF generation (client-side) ----------
// Uses jsPDF and autoTable CDN (referenced in index.html)
async function generateItemPDF(sheet, uid){
  try{
    const item = await apiFetch(new URLSearchParams({sheet, action:'getItem', UID:uid}));
    // build PDF using jsPDF
    const doc = new jsPDF('p','pt','a4');
    // Header
    doc.setFontSize(18);
    doc.setTextColor(10,30,90);
    doc.text('PTSC/THRI Crew Department', 40, 50);
    doc.setFontSize(11);
    doc.setTextColor(0,0,0);
    doc.text(`Document: ${sheet} — Item`, 40, 70);
    doc.text(`Generated: ${new Date().toLocaleString()}`, 40, 86);

    // Add a separator
    doc.setDrawColor(180,200,255);
    doc.setLineWidth(1);
    doc.line(40,96,555,96);

    // Prepare data table: show key/value pairs
    const rows = [];
    for(const k in item){
      if(k === '__sheet') continue;
      rows.push([k, String(item[k]===null? '':item[k])]);
    }
    doc.autoTable({
      startY: 110,
      head: [['Field','Value']],
      body: rows,
      styles: { fontSize:10, cellPadding:6 },
      headStyles:{ fillColor:[190,220,255], textColor:[10,30,90] },
      theme: 'grid',
      columnStyles: {0:{cellWidth:140},1:{cellWidth:360}}
    });

    // signature area
    doc.setFontSize(11);
    const y = doc.lastAutoTable.finalY + 30;
    doc.text('Prepared by: _______________________', 40, y);
    doc.text('Approved by: _______________________', 320, y);

    doc.save(`${sheet}_${uid}.pdf`);
  }catch(err){
    alert('PDF generation failed: '+err.message);
  }
}

// ---------- Monthly PDF (combined) ----------
async function generateMonthlyPDF(){
  const month = qs('mf-month').value;
  const year = qs('mf-year').value;
  if(!month || !year){ alert('Select month and year'); return; }
  try{
    // fetch monthly combined data
    const data = await apiFetch(new URLSearchParams({sheet:'Vessel_Join', action:'getMonthly', month, year}));
    // data will be { Vessel_Join: [...], Arrivals:[...], Training: [...], Pni: [...] }
    const doc = new jsPDF('p','pt','a4');
    let y = 40;
    doc.setFontSize(18);
    doc.setTextColor(10,30,90);
    doc.text('PTSC/THRI Monthly Report', 40, y);
    doc.setFontSize(11);
    doc.text(`Month: ${month} / ${year}`, 420, y);
    y += 20;
    doc.setDrawColor(180,200,255);
    doc.setLineWidth(1);
    doc.line(40,y,555,y);
    y += 10;

    // helper to render each section
    const sectionRender = (title, items) => {
      if(y > 720) { doc.addPage(); y = 40; }
      doc.setFontSize(14); doc.setTextColor(10,30,90);
      doc.text(title, 40, y); y += 12;
      if(!items || items.length===0){
        doc.setFontSize(10); doc.text('No records', 40, y); y += 18;
        return;
      }
      // Build autoTable rows: pick some columns per type
      const rows = [];
      items.forEach(it=>{
        // choose main summary fields
        const summary = it.Vessel || it.Title || it.Subject || '';
        const date = it.Date || it.Timestamp || '';
        rows.push([shortDate(date||''), summary, it['UID']||'']);
      });
      doc.autoTable({
        startY: y,
        head: [['Date','Summary','UID']],
        body: rows,
        styles:{fontSize:9, cellPadding:5},
        headStyles:{fillColor:[190,220,255], textColor:[10,30,90]},
        theme:'grid',
        didDrawPage: function (data) {}
      });
      y = doc.lastAutoTable.finalY + 12;
    };

    sectionRender('Crew Joining', data.Vessel_Join || []);
    sectionRender('Crew Arrivals', data.Arrivals || []);
    sectionRender('Training', data.Training || []);
    sectionRender('P&I / Events', data.Pni || []);

    doc.save(`Monthly_Report_${month}_${year}.pdf`);
  }catch(err){
    alert('Monthly PDF failed: '+err.message);
    console.error(err);
  }
}
