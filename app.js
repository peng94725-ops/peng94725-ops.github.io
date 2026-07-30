// 搬家物品管家 - Main App (v2 - Workspace Layout)

let currentPage = "dashboard";
let currentFilter = { destination: "全部", category: "全部", status: "全部", keyword: "" };
let categories = [];
let continuousMode = false;
let selectedItems = new Set();
let selectMode = false;

// api() 本地路由：替代服务端 fetch，直接读写 IndexedDB（DB）
async function api(path, opts = {}) {
  const method = (opts.method || "GET").toUpperCase();
  let [p, qs] = path.split("?");
  const params = new URLSearchParams(qs || "");
  const filters = {};
  for (const k of ["destination", "category", "status", "boxId", "keyword"]) {
    if (params.get(k)) filters[k] = params.get(k);
  }
  const body = parseBody(opts.body);

  if (p === "/items" && method === "GET") return await DB.getItems(filters);
  if (p === "/items" && method === "POST") return await DB.addItem(body);
  if (p === "/items/batch" && method === "POST") return await DB.batchUpdate(body.ids, body.action, body.value);
  if (p === "/items/batch-delete" && method === "POST") return await DB.batchDelete(body.ids);
  let m = p.match(/^\/items\/(\d+)$/);
  if (m && method === "PUT") return await DB.updateItem(parseInt(m[1]), body);
  if (m && method === "DELETE") return await DB.deleteItem(parseInt(m[1]));

  if (p === "/boxes" && method === "GET") return await DB.getBoxes(filters);
  if (p === "/boxes" && method === "POST") return await DB.addBox(body);
  m = p.match(/^\/boxes\/(\d+)$/);
  if (m && method === "PUT") return await DB.updateBox(parseInt(m[1]), body);
  if (m && method === "DELETE") return await DB.deleteBox(parseInt(m[1]));

  if (p === "/categories" && method === "GET") return await DB.getCategories();
  if (p === "/categories" && method === "POST") return await DB.addCategory(body.name);
  m = p.match(/^\/categories\/(\d+)$/);
  if (m && method === "DELETE") return await DB.deleteCategory(parseInt(m[1]));

  if (p === "/stats") return await DB.getStats();
  if (p === "/export/json") return await DB.exportAll();
  if (p === "/import" && method === "POST") return await DB.importAll(body);

  throw new Error("未知请求: " + method + " " + path);
}

function parseBody(body) {
  if (!body) return {};
  if (typeof body === "string") {
    try { return JSON.parse(body); } catch (e) { return {}; }
  }
  return body;
}

function toast(msg) {
  const t = document.createElement("div");
  t.className = "toast";
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 2200);
}

function escapeHtml(s) {
  const d = document.createElement("div");
  d.textContent = s || "";
  return d.innerHTML;
}

function destTag(d) {
  const map = { 新城市: "tag-city", 老家: "tag-home", 丢弃: "tag-toss" };
  return `<span class="tag ${map[d] || ""}">${d}</span>`;
}

function formatDate(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  return `${d.getMonth()+1}/${d.getDate()} ${String(d.getHours()).padStart(2,"0")}:${String(d.getMinutes()).padStart(2,"0")}`;
}

// ==================== Layout: Tabbar + Main ====================

function render() {
  const app = document.getElementById("app");
  const tabs = [
    { id: "dashboard", label: "看板", icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>' },
    { id: "items", label: "物品", icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 6h16M4 12h16M4 18h16"/></svg>' },
    { id: "boxes", label: "箱子", icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 7l9-4 9 4-9 4-9-4z"/><path d="M3 7v10l9 4 9-4V7"/><path d="M12 11v10"/></svg>' },
    { id: "more", label: "更多", icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="5" r="1.5"/><circle cx="12" cy="12" r="1.5"/><circle cx="12" cy="19" r="1.5"/></svg>' },
  ];
  app.innerHTML = `
    <main class="main" id="main-content"></main>
    <nav class="tabbar">
      ${tabs.map(t => `
        <button class="tabbar-btn ${currentPage === t.id ? "active" : ""}" onclick="switchPage('${t.id}')">
          ${t.icon}
          <span>${t.label}</span>
        </button>
      `).join("")}
    </nav>
  `;

  const pages = {
    dashboard: renderDashboard,
    items: renderItems,
    boxes: renderBoxes,
    more: renderMore,
  };
  document.getElementById("main-content").innerHTML = pages[currentPage]();

  if (currentPage === "dashboard") loadDashboard();
  if (currentPage === "items") loadItems();
  if (currentPage === "boxes") loadBoxes();
  if (currentPage === "more") initMore();

  // FAB only on items and boxes pages
  if (currentPage === "items" || currentPage === "boxes") {
    const fab = document.createElement("button");
    fab.className = "fab";
    fab.textContent = "+";
    fab.onclick = currentPage === "items" ? openAddItem : openAddBox;
    app.appendChild(fab);
  }
}

function switchPage(page) {
  currentPage = page;
  selectedItems.clear();
  selectMode = false;
  document.querySelectorAll(".modal-overlay")?.forEach(m => m.remove());
  removeBatchBar();
  render();
}

// ==================== Dashboard ====================

function renderDashboard() {
  return `
    <div class="page-header">
      <div>
        <div class="page-title">搬家物品管家</div>
        <div class="page-sub">整理进度一览</div>
      </div>
    </div>
    <div id="dashboard-content">
      <div class="stats-row">
        <div class="glass-card widget-stat"><div class="widget-label">总物品</div><div class="widget-num" id="stat-items">--</div></div>
        <div class="glass-card widget-stat"><div class="widget-label">总箱数</div><div class="widget-num green" id="stat-boxes">--</div></div>
      </div>
      <div style="height:16px;"></div>
      <div class="glass-card progress-card">
        <div class="progress-header">
          <span class="section-title" style="margin-bottom:0;">整理进度</span>
          <span class="progress-pct" id="progress-pct">--</span>
        </div>
        <div class="progress-bar-wrap"><div class="progress-bar-fill" id="progress-fill" style="width:0%"></div></div>
        <div class="progress-legend" id="progress-legend"></div>
      </div>
      <div style="height:16px;"></div>
      <div class="widget-grid">
        <div class="glass-card">
          <div class="section-title">按去处分布</div>
          <div id="dest-stats"></div>
        </div>
        <div class="glass-card">
          <div class="section-title">按分类分布</div>
          <div id="cat-stats"></div>
        </div>
      </div>
    </div>
  `;
}

async function loadDashboard() {
  try {
    const stats = await api("/stats");
    document.getElementById("stat-items").textContent = stats.totalItems;
    document.getElementById("stat-boxes").textContent = stats.totalBoxes;

    // Destination distribution
    const destEl = document.getElementById("dest-stats");
    const destColors = { 新城市: "var(--green)", 老家: "var(--amber)", 丢弃: "var(--red)" };
    destEl.innerHTML = ["新城市", "老家", "丢弃"].map(d => {
      const s = stats.byDestination[d] || { items: 0, boxes: 0 };
      return `<div class="dist-row">
        <span class="dist-dot" style="background:${destColors[d]}"></span>
        <span class="dist-name">${d}</span>
        <span class="dist-count">${s.items}件 / ${s.boxes}箱</span>
      </div>`;
    }).join("");

    // Progress bar — 堆叠条，4段按比例显示
    const total = stats.totalItems;
    const segs = [
      { label: "待整理", val: stats.byStatus["待整理"] || 0, color: "#D3D1C7" },
      { label: "已装箱", val: stats.byStatus["已装箱"] || 0, color: "#AFA9EC" },
      { label: "已寄出", val: stats.byStatus["已寄出"] || 0, color: "#7F77DD" },
      { label: "已签收", val: stats.byStatus["已签收"] || 0, color: "#534AB7" },
    ];
    // 整理进度 = 非"待整理"的占比
    const sorted = total > 0 ? total - (stats.byStatus["待整理"] || 0) : 0;
    const pct = total > 0 ? Math.round(sorted / total * 100) : 0;

    document.getElementById("progress-pct").textContent = total > 0 ? pct + "%" : "--";
    // 堆叠条：每段宽度 = 该状态数量 / 总数 * 100%
    const barFill = document.getElementById("progress-fill");
    if (total > 0) {
      barFill.innerHTML = segs.map(s => {
        const w = total > 0 ? (s.val / total * 100) : 0;
        return w > 0 ? `<div style="display:inline-block;height:100%;width:${w}%;background:${s.color};float:left;"></div>` : "";
      }).join("");
      barFill.style.width = "100%";
      barFill.style.background = "transparent";
    } else {
      barFill.innerHTML = "";
      barFill.style.width = "0%";
    }
    document.getElementById("progress-legend").innerHTML = total > 0
      ? segs.map(s => `<span><i style="background:${s.color}"></i>${s.label} ${s.val}</span>`).join("")
      : '<span style="color:var(--text-muted)">还没有物品，添加后查看进度</span>';

    // Category distribution
    const catEl = document.getElementById("cat-stats");
    const cats = Object.entries(stats.byCategory).filter(([_, v]) => v > 0).sort((a, b) => b[1] - a[1]);
    const maxCat = cats.length ? cats[0][1] : 1;
    const catColors = ["#534AB7", "#1D9E75", "#378ADD", "#EF9F27", "#D4537E", "#639922", "#D85A30"];
    catEl.innerHTML = cats.length ? cats.map(([name, count], i) => {
      const color = catColors[i % catColors.length];
      const barPct = (count / maxCat * 100).toFixed(0);
      return `<div class="cat-bar-wrap">
        <div class="cat-bar-label"><span class="cat-bar-name">${name}</span><span class="cat-bar-count">${count}件</span></div>
        <div class="cat-bar"><div class="cat-bar-fill" style="width:${barPct}%;background:${color}"></div></div>
      </div>`;
    }).join("") : '<div style="color:var(--text-sub);font-size:13px;">暂无数据</div>';
  } catch (e) {
    console.error(e);
  }
}

// ==================== Items ====================

function renderItems() {
  return `
    <div class="page-header">
      <div>
        <div class="page-title">物品列表</div>
        <div class="page-sub" id="items-count-sub"></div>
      </div>
      <button class="select-toggle ${selectMode ? 'active' : ''}" id="select-toggle-btn" onclick="toggleSelectMode()">${selectMode ? '取消选择' : '选择'}</button>
    </div>
    <div class="search-wrap">
      <input class="search-input" placeholder="搜索物品名称或备注..." value="${escapeHtml(currentFilter.keyword)}" oninput="onSearchInput(this.value)">
    </div>
    <div class="filter-bar">
      <span class="chip ${currentFilter.destination === '全部' ? 'active' : ''}" onclick="setFilter('destination','全部')">全部</span>
      <span class="chip ${currentFilter.destination === '新城市' ? 'active' : ''}" onclick="setFilter('destination','新城市')">新城市</span>
      <span class="chip ${currentFilter.destination === '老家' ? 'active' : ''}" onclick="setFilter('destination','老家')">老家</span>
      <span class="chip ${currentFilter.destination === '丢弃' ? 'active' : ''}" onclick="setFilter('destination','丢弃')">丢弃</span>
    </div>
    <div class="filter-bar">
      <span class="chip ${currentFilter.category === '全部' ? 'active' : ''}" onclick="setFilter('category','全部')">全部分类</span>
      <span id="cat-chips"></span>
    </div>
    <div class="filter-bar">
      <span class="chip ${currentFilter.status === '全部' ? 'active' : ''}" onclick="setFilter('status','全部')">全部状态</span>
      <span class="chip ${currentFilter.status === '待整理' ? 'active' : ''}" onclick="setFilter('status','待整理')">待整理</span>
      <span class="chip ${currentFilter.status === '已装箱' ? 'active' : ''}" onclick="setFilter('status','已装箱')">已装箱</span>
      <span class="chip ${currentFilter.status === '已寄出' ? 'active' : ''}" onclick="setFilter('status','已寄出')">已寄出</span>
      <span class="chip ${currentFilter.status === '已签收' ? 'active' : ''}" onclick="setFilter('status','已签收')">已签收</span>
    </div>
    <div class="item-list" id="item-list"></div>
    <div id="batch-bar-placeholder"></div>
  `;
}

async function loadItems() {
  try {
    if (!categories.length) categories = await api("/categories");
    renderCatChips();

    const params = new URLSearchParams();
    if (currentFilter.destination !== "全部") params.set("destination", currentFilter.destination);
    if (currentFilter.category !== "全部") params.set("category", currentFilter.category);
    if (currentFilter.status !== "全部") params.set("status", currentFilter.status);
    if (currentFilter.keyword) params.set("keyword", currentFilter.keyword);

    const items = await api("/items?" + params.toString());
    const listEl = document.getElementById("item-list");
    const subEl = document.getElementById("items-count-sub");
    subEl.textContent = `${items.length} 件物品`;

    if (!items.length) {
      listEl.innerHTML = '<div class="empty"><div class="empty-icon">📦</div><div class="empty-text">还没有物品，点击左下角 + 添加</div></div>';
      updateBatchBar();
      return;
    }

    listEl.innerHTML = items.map(item => {
      const thumb = item.photos && item.photos.length
        ? `<img src="${item.photos[0]}" alt="">`
        : `<span class="item-thumb-text">${escapeHtml(item.name.charAt(0))}</span>`;
      let boxTag;
      const tagStyle = 'display:inline-block;flex-shrink:0;max-width:fit-content;white-space:nowrap;';
      if (item.box_id) {
        boxTag = `<span class="item-box-tag clickable" style="${tagStyle}" onclick="event.stopPropagation();openBoxChanger(${item.id})">箱#${String(item.box_id).padStart(2,"0")} <svg width="10" height="10" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2"><path d="M8 2v12M2 8h12"/></svg></span>`;
      } else if (["已装箱","已寄出","已签收"].includes(item.status)) {
        boxTag = `<span class="item-box-tag clickable warn" style="${tagStyle}" onclick="event.stopPropagation();openBoxChanger(${item.id})">未分配箱子 <svg width="10" height="10" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2"><path d="M8 2v12M2 8h12"/></svg></span>`;
      } else {
        boxTag = `<span class="item-box-tag clickable empty" style="${tagStyle}" onclick="event.stopPropagation();openBoxChanger(${item.id})">未装箱 <svg width="10" height="10" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2"><path d="M8 2v12M2 8h12"/></svg></span>`;
      }
      const fragile = item.is_fragile ? '<span class="tag tag-fragile">易碎</span>' : "";
      const isSelected = selectedItems.has(item.id);
      const cls = isSelected ? "item-card selected" : "item-card";
      return `<div class="${cls}" id="item-row-${item.id}" onclick="onItemClick(${item.id}, event)">
        <div class="item-checkbox" onclick="toggleItem(${item.id}, event)">
          <svg viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="3"><path d="M5 12l5 5L20 7"/></svg>
        </div>
        <div class="item-thumb">${thumb}</div>
        <div class="item-info">
          <div class="item-name">${escapeHtml(item.name)}</div>
          <div class="item-meta">
            ${boxTag}
            <span class="item-meta-sep">·</span>
            <span>${item.category}</span>
            <span class="item-meta-sep">·</span>
            <span style="color:var(--text-muted)">${item.status}</span>
          </div>
        </div>
        <div class="item-tags">
          ${fragile}
          ${destTag(item.destination)}
        </div>
      </div>`;
    }).join("");

    updateBatchBar();
  } catch (e) {
    console.error(e);
  }
}

function renderCatChips() {
  const el = document.getElementById("cat-chips");
  if (!el) return;
  el.innerHTML = categories.map(c =>
    `<span class="chip ${currentFilter.category === c.name ? 'active' : ''}" onclick="setFilter('category','${c.name}')">${c.name}</span>`
  ).join("");
}

let searchTimer;
function onSearchInput(val) {
  currentFilter.keyword = val;
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => loadItems(), 300);
}

function setFilter(key, val) {
  currentFilter[key] = val;
  selectedItems.clear();
  selectMode = false;
  // Update the toggle button text
  const btn = document.getElementById("select-toggle-btn");
  if (btn) { btn.textContent = "选择"; btn.classList.remove("active"); }
  const main = document.getElementById("main-content");
  if (main) main.classList.remove("select-mode-active");
  loadItems();
}

// ==================== Multi-Select ====================

function toggleSelectMode() {
  selectMode = !selectMode;
  if (!selectMode) selectedItems.clear();
  // Update the toggle button text without full re-render
  const btn = document.getElementById("select-toggle-btn");
  if (btn) {
    btn.textContent = selectMode ? "取消选择" : "选择";
    btn.classList.toggle("active", selectMode);
  }
  const main = document.getElementById("main-content");
  if (main) main.classList.toggle("select-mode-active", selectMode);
  loadItems();
}

function toggleItem(id, event) {
  if (event) event.stopPropagation();
  if (!selectMode) return;
  if (selectedItems.has(id)) {
    selectedItems.delete(id);
  } else {
    selectedItems.add(id);
  }
  // Toggle UI without full reload
  const row = document.getElementById("item-row-" + id);
  if (row) row.classList.toggle("selected", selectedItems.has(id));
  updateBatchBar();
}

function onItemClick(id, event) {
  // If clicking on checkbox, let toggleItem handle it
  if (event.target.closest(".item-checkbox")) return;
  // If in select mode, toggle selection
  if (selectMode) {
    toggleItem(id);
    return;
  }
  // Otherwise open detail
  openItemDetail(id);
}

function selectAll() {
  // Get all visible item IDs from the DOM
  const cards = document.querySelectorAll(".item-card");
  const allIds = Array.from(cards).map(c => parseInt(c.id.replace("item-row-", "")));
  if (allIds.length === 0) return;
  // If all are already selected, deselect all
  const allSelected = allIds.every(id => selectedItems.has(id));
  if (allSelected) {
    selectedItems.clear();
  } else {
    allIds.forEach(id => selectedItems.add(id));
  }
  cards.forEach(c => {
    const id = parseInt(c.id.replace("item-row-", ""));
    c.classList.toggle("selected", selectedItems.has(id));
  });
  updateBatchBar();
}

function updateBatchBar() {
  const fab = document.querySelector(".fab");
  if (!selectMode || selectedItems.size === 0) {
    removeBatchBar();
    if (fab) fab.style.bottom = "";
    return;
  }

  // Push FAB up to avoid overlap with batch bar (tabbar 56px + batch bar ~54px + gap)
  if (fab) fab.style.bottom = "126px";

  const existing = document.getElementById("batch-action-bar");
  if (existing) {
    // Update count and selectAll label only, no DOM rebuild
    const countEl = existing.querySelector(".batch-count");
    if (countEl) countEl.textContent = `已选 ${selectedItems.size} 件`;
    const allIds = Array.from(document.querySelectorAll(".item-card")).map(c => parseInt(c.id.replace("item-row-", "")));
    const allSelected = allIds.length > 0 && allIds.every(id => selectedItems.has(id));
    const selBtn = existing.querySelector(".batch-btn");
    if (selBtn) selBtn.textContent = allSelected ? "取消全选" : "全选";
    return;
  }

  // Add bottom padding to main content so items aren't hidden behind batch bar + tabbar
  const main = document.getElementById("main-content");
  if (main) main.style.paddingBottom = "130px";

  const bar = document.createElement("div");
  bar.className = "batch-bar show";
  bar.id = "batch-action-bar";
  bar.innerHTML = `
    <span class="batch-count">已选 ${selectedItems.size} 件</span>
    <button class="batch-btn" onclick="selectAll()">全选</button>
    <button class="batch-btn" onclick="openBatchStatus()">批量改状态</button>
    <button class="batch-btn" onclick="openBatchBox()">批量换箱子</button>
    <button class="batch-btn" onclick="openBatchCategory()">批量改分类</button>
    <button class="batch-btn danger" onclick="batchDelete()">批量删除</button>
    <button class="batch-btn cancel" onclick="clearBatchSelection()">取消</button>
  `;
  document.getElementById("app").appendChild(bar);
}

function removeBatchBar() {
  const bar = document.getElementById("batch-action-bar");
  if (bar) bar.remove();
  const fab = document.querySelector(".fab");
  if (fab && !document.getElementById("batch-action-bar")) fab.style.bottom = "";
  const main = document.getElementById("main-content");
  if (main && !document.getElementById("batch-action-bar")) main.style.paddingBottom = "";
}

function clearBatchSelection() {
  selectedItems.clear();
  updateBatchBar();
  loadItems();
}

async function openBatchStatus() {
  const statuses = ["待整理", "已装箱", "已寄出", "已签收"];
  const modal = document.createElement("div");
  modal.className = "modal-overlay";
  modal.id = "batch-status-modal";
  modal.innerHTML = `
    <div class="modal" style="max-width:400px;">
      <div class="modal-header">
        <div class="modal-title">批量改状态 (${selectedItems.size} 件)</div>
        <button class="modal-close" onclick="document.getElementById('batch-status-modal').remove()">&times;</button>
      </div>
      <div class="modal-body">
        <div class="batch-modal-actions">
          ${statuses.map(s => `<button class="batch-option" onclick="batchUpdateStatus('${s}')">${s}</button>`).join("")}
        </div>
        <div style="height:20px;"></div>
      </div>
    </div>
  `;
  document.body.appendChild(modal);
  modal.addEventListener("click", (e) => { if (e.target === modal) modal.remove(); });
}

async function batchUpdateStatus(status) {
  // 已装箱/已寄出/已签收 需要先有箱子，否则 enforceItemConsistency 会强制回滚
  if (["已装箱", "已寄出", "已签收"].includes(status)) {
    const ids = Array.from(selectedItems);
    const allItems = await api("/items?keyword=");
    const selected = allItems.filter(i => ids.includes(i.id));
    const needBox = selected.filter(i => !i.box_id);
    if (needBox.length > 0) {
      // 有物品没箱子 → 弹箱选择框，选好后再批量改
      document.getElementById("batch-status-modal")?.remove();
      openBatchBoxForStatus(status, needBox);
      return;
    }
  }
  await doBatchUpdateStatus(status);
}

async function doBatchUpdateStatus(status) {
  try {
    const ids = Array.from(selectedItems);
    const result = await api("/items/batch", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids, action: "status", value: status }),
    });
    const n = result.updated ?? ids.length;
    toast(`已更新 ${n} 件物品状态为"${status}"`);
    document.getElementById("batch-status-modal")?.remove();
    selectedItems.clear();
    removeBatchBar();
    loadItems();
  } catch (e) { toast("批量更新失败: " + e.message); }
}

// 批量改"已装箱/已寄出/已签收"时，弹箱选择框让用户先选箱子
async function openBatchBoxForStatus(targetStatus, needBoxItems) {
  const boxes = await api("/boxes");
  if (boxes.length === 0) {
    toast("请先去\"箱子\"页添加至少一个箱子");
    return;
  }
  const itemNames = needBoxItems.map(i => i.name).join("、");
  const modal = document.createElement("div");
  modal.className = "modal-overlay";
  modal.id = "batch-box-for-status-modal";
  modal.innerHTML = `
    <div class="modal" style="max-width:400px;">
      <div class="modal-header">
        <div class="modal-title">批量改"${targetStatus}"需选箱子</div>
        <button class="modal-close" onclick="document.getElementById('batch-box-for-status-modal').remove()">&times;</button>
      </div>
      <div class="modal-body">
        <div style="font-size:12px;color:var(--text-sub);margin-bottom:10px;">
          ${needBoxItems.length} 件无箱物品 (${itemNames}) 需要先指定箱子。
        </div>
        <div class="batch-modal-actions">
          ${boxes.map(b => `<button class="batch-option" onclick="confirmBatchBoxForStatus('${targetStatus}', ${b.id})">${b.box_number} (${b.destination})</button>`).join("")}
        </div>
      </div>
    </div>
  `;
  document.body.appendChild(modal);
  modal.addEventListener("click", (e) => { if (e.target === modal) modal.remove(); });
}

async function confirmBatchBoxForStatus(targetStatus, boxId) {
  try {
    // 把所有选中物品按 box_id 分组：有箱子的只改 status，没箱子的同时改 status+box
    const ids = Array.from(selectedItems);
    const allItems = await api("/items?keyword=");
    const selected = allItems.filter(i => ids.includes(i.id));
    const idsWithBox = selected.filter(i => i.box_id).map(i => i.id);
    const idsNoBox = selected.filter(i => !i.box_id).map(i => i.id);

    let totalUpdated = 0;
    // 有箱子的：只改状态
    if (idsWithBox.length > 0) {
      const r1 = await api("/items/batch", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: idsWithBox, action: "status", value: targetStatus })
      });
      totalUpdated += r1.updated ?? idsWithBox.length;
    }
    // 没箱子的：同时改状态+箱子
    if (idsNoBox.length > 0) {
      const r2 = await api("/items/batch", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: idsNoBox, action: "status+box", value: { status: targetStatus, box_id: boxId } })
      });
      totalUpdated += r2.updated ?? idsNoBox.length;
    }
    toast(`已更新 ${totalUpdated} 件物品状态为"${targetStatus}"并装箱`);
    document.getElementById("batch-box-for-status-modal")?.remove();
    selectedItems.clear();
    removeBatchBar();
    loadItems();
  } catch (e) {
    console.error(e);
    toast("批量更新失败: " + e.message);
  }
}

async function openBatchBox() {
  const boxes = await api("/boxes");
  const modal = document.createElement("div");
  modal.className = "modal-overlay";
  modal.id = "batch-box-modal";
  modal.innerHTML = `
    <div class="modal" style="max-width:400px;">
      <div class="modal-header">
        <div class="modal-title">批量换箱子 (${selectedItems.size} 件)</div>
        <button class="modal-close" onclick="document.getElementById('batch-box-modal').remove()">&times;</button>
      </div>
      <div class="modal-body">
        <div class="batch-modal-actions">
          <button class="batch-option" onclick="batchUpdateBox(null)">移到 "未装箱"</button>
          ${boxes.map(b => `<button class="batch-option" onclick="batchUpdateBox(${b.id})">${b.box_number} (${b.destination})</button>`).join("")}
        </div>
        <div style="height:20px;"></div>
      </div>
    </div>
  `;
  document.body.appendChild(modal);
  modal.addEventListener("click", (e) => { if (e.target === modal) modal.remove(); });
}

async function batchUpdateBox(boxId) {
  try {
    const ids = Array.from(selectedItems);
    const result = await api("/items/batch", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids, action: "box", value: boxId }),
    });
    const targetName = boxId ? "指定箱子" : "未装箱";
    toast(`已将 ${result.updated} 件物品移到${targetName}`);
    document.getElementById("batch-box-modal")?.remove();
    selectedItems.clear();
    removeBatchBar();
    loadItems();
  } catch (e) { toast("批量更新失败: " + e.message); }
}

// 批量改分类
async function openBatchCategory() {
  const cats = await api("/categories");
  const modal = document.createElement("div");
  modal.className = "modal-overlay";
  modal.id = "batch-cat-modal";
  modal.innerHTML = `
    <div class="modal" style="max-width:400px;">
      <div class="modal-header">
        <div class="modal-title">批量改分类 (${selectedItems.size} 件)</div>
        <button class="modal-close" onclick="document.getElementById('batch-cat-modal').remove()">&times;</button>
      </div>
      <div class="modal-body">
        <div class="batch-modal-actions">
          ${cats.map(c => `<button class="batch-option" onclick="doBatchCategory('${c.name}')">${c.name}</button>`).join("")}
        </div>
        <div style="height:20px;"></div>
      </div>
    </div>
  `;
  document.body.appendChild(modal);
  modal.addEventListener("click", (e) => { if (e.target === modal) modal.remove(); });
}

async function doBatchCategory(catName) {
  try {
    const ids = Array.from(selectedItems);
    const result = await api("/items/batch", {
      method: "POST",
      body: JSON.stringify({ ids, action: "category", value: catName }),
    });
    toast(`已将 ${result.updated} 件物品改为"${catName}"`);
    document.getElementById("batch-cat-modal")?.remove();
    selectedItems.clear();
    removeBatchBar();
    loadItems();
  } catch (e) { toast("批量更新失败: " + e.message); }
}

// 批量删除
async function batchDelete() {
  const ids = [...selectedItems];
  if (ids.length === 0) return;
  // 确认弹框
  const modal = document.createElement("div");
  modal.className = "modal-overlay";
  modal.id = "batch-delete-modal";
  modal.innerHTML = `
    <div class="modal">
      <div class="modal-header">
        <div class="modal-title">确认删除</div>
        <button class="modal-close" onclick="document.getElementById('batch-delete-modal').remove()">&times;</button>
      </div>
      <div class="modal-body">
        <p>确定要删除选中的 <b>${ids.length}</b> 件物品吗？</p>
        <p style="color:#e74c3c;font-size:13px;margin-top:8px">此操作不可撤销</p>
      </div>
      <div class="modal-actions" style="display:flex;gap:10px;padding:0 20px 20px;">
        <button class="btn-secondary" style="flex:1;padding:12px;border:none;border-radius:8px;font-size:15px;cursor:pointer;" onclick="document.getElementById('batch-delete-modal').remove()">取消</button>
        <button class="btn-danger" style="flex:1;padding:12px;border:none;border-radius:8px;font-size:15px;cursor:pointer;font-weight:600;" onclick="doBatchDelete()">确认删除</button>
      </div>
    </div>
  `;
  document.body.appendChild(modal);
}

async function doBatchDelete() {
  const ids = [...selectedItems];
  try {
    const result = await api("/items/batch-delete", { method: "POST", body: { ids } });
    toast(`已删除 ${result.deleted} 件物品`);
    document.getElementById("batch-delete-modal")?.remove();
    selectedItems.clear();
    removeBatchBar();
    loadItems();
  } catch (e) { toast("批量删除失败: " + e.message); }
}

// ==================== Add Item ====================

let addPhotos = [];
let continuousCount = 0;

function openAddItem() {
  continuousMode = false;
  continuousCount = 0;
  addPhotos = [];
  selectedDest = "新城市";
  isFragile = false;
  showAddItemModal();
}

function openAddItemContinuous() {
  continuousMode = true;
  continuousCount = 0;
  addPhotos = [];
  selectedDest = "新城市";
  isFragile = false;
  showAddItemModal();
}

async function showAddItemModal() {
  if (!categories.length) categories = await api("/categories");
  const boxes = await api("/boxes");

  const banner = continuousMode
    ? `<div class="continuous-banner"><span>连续添加模式 (已添加 ${continuousCount} 件)</span><button style="background:none;border:none;color:#fff;font-size:13px;cursor:pointer;font-weight:500;" onclick="exitContinuous()">退出</button></div>`
    : "";

  const modal = document.createElement("div");
  modal.className = "modal-overlay";
  modal.id = "add-item-modal";
  modal.innerHTML = `
    ${banner}
    <div class="modal">
      <div class="modal-header">
        <div class="modal-title">${continuousMode ? "添加物品 (连续)" : "添加物品"}</div>
        <button class="modal-close" onclick="closeAddItem()">&times;</button>
      </div>
      <div class="modal-body">
        <div class="form-group">
          <label class="form-label">照片 (可选)</label>
          <div class="photo-area" id="photo-area" onclick="document.getElementById('photo-input').click()">
            <span>点击拍照或选择图片</span>
          </div>
          <input type="file" id="photo-input" accept="image/*" capture="environment" multiple style="display:none" onchange="onPhotoSelect(event)">
          <div class="photo-preview-grid" id="photo-preview"></div>
        </div>
        <div class="form-group">
          <label class="form-label">物品名称 *</label>
          <input class="form-input" id="item-name" placeholder="如：电饭煲" autocomplete="off">
        </div>
        <div class="form-group">
          <label class="form-label">去处</label>
          <div class="segmented" id="dest-segmented">
            <button class="seg-btn active" data-val="新城市" onclick="selectSeg(this,'dest','新城市')">新城市</button>
            <button class="seg-btn" data-val="老家" onclick="selectSeg(this,'dest','老家')">老家</button>
            <button class="seg-btn" data-val="丢弃" onclick="selectSeg(this,'dest','丢弃')">丢弃</button>
          </div>
        </div>
        <div class="form-group">
          <label class="form-label">物品分类</label>
          <select class="form-select" id="item-category">${categories.map(c => `<option value="${c.name}">${c.name}</option>`).join("")}</select>
        </div>
        <div class="form-group">
          <label class="form-label">装入箱子 (可选)</label>
          <select class="form-select" id="item-box">${'<option value="">未装箱</option>' + boxes.map(b => `<option value="${b.id}">${b.box_number} (${b.destination})</option>`).join("")}</select>
        </div>
        <div class="form-group">
          <label class="form-label">来源位置 (可选)</label>
          <input class="form-input" id="item-location" placeholder="如：卧室衣柜" autocomplete="off">
        </div>
        <div class="form-group">
          <label class="form-label">估值 (元，可选)</label>
          <input class="form-input" id="item-value" type="number" placeholder="如：500" autocomplete="off">
        </div>
        <div class="form-group">
          <label class="form-label">备注 (可选)</label>
          <textarea class="form-textarea" id="item-notes" placeholder="如：灯泡已拆下单独包装"></textarea>
        </div>
        <div class="check-row" id="fragile-check" onclick="toggleFragile()">
          <div class="check-box"><svg viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="3"><path d="M5 12l5 5L20 7"/></svg></div>
          <span style="font-size:14px;">易碎物品</span>
        </div>
        <div style="height:16px;"></div>
        <div class="btn-row">
          ${continuousMode ? `<button class="btn btn-secondary" onclick="saveAndContinue()">保存并继续</button>` : ""}
          <button class="btn btn-primary" onclick="saveItem()">${continuousMode ? "保存并退出" : "保存"}</button>
        </div>
        <div style="height:20px;"></div>
      </div>
    </div>
  `;
  document.body.appendChild(modal);
  modal.addEventListener("click", (e) => { if (e.target === modal) closeAddItem(); });
}

let selectedDest = "新城市";
let isFragile = false;

function selectSeg(btn, type, val) {
  const parent = btn.parentElement;
  parent.querySelectorAll(".seg-btn").forEach(b => b.classList.remove("active"));
  btn.classList.add("active");
  selectedDest = val;
}

function toggleFragile() {
  isFragile = !isFragile;
  const el = document.getElementById("fragile-check");
  el.classList.toggle("checked", isFragile);
}

function onPhotoSelect(e) {
  const files = Array.from(e.target.files);
  files.forEach(file => {
    compressPhoto(file, 800, 0.7).then(dataUrl => {
      addPhotos.push({ file, dataUrl });
      renderPhotoPreview();
    }).catch(err => {
      console.error("photo compress failed", err);
      toast("图片处理失败，请重试");
    });
  });
  e.target.value = "";
}

// 压缩照片：缩放到 maxWidth，JPEG quality 压缩
function compressPhoto(file, maxWidth, quality) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (ev) => {
      const img = new Image();
      img.onload = () => {
        let w = img.width, h = img.height;
        if (w > maxWidth) { h = Math.round(h * maxWidth / w); w = maxWidth; }
        const canvas = document.createElement("canvas");
        canvas.width = w; canvas.height = h;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL("image/jpeg", quality));
      };
      img.onerror = reject;
      img.src = ev.target.result;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function renderPhotoPreview() {
  const el = document.getElementById("photo-preview");
  const area = document.getElementById("photo-area");
  if (!el) return;
  if (addPhotos.length === 0) {
    area.className = "photo-area";
    area.innerHTML = "<span>点击拍照或选择图片</span>";
  } else {
    area.className = "photo-area has-photo";
    area.innerHTML = `<img src="${addPhotos[0].dataUrl}">`;
  }
  el.innerHTML = addPhotos.map((p, i) =>
    `<div class="photo-preview">
      <img src="${p.dataUrl}">
      <button class="photo-del" onclick="removePhoto(${i})">&times;</button>
    </div>`
  ).join("");
}

function removePhoto(idx) {
  addPhotos.splice(idx, 1);
  renderPhotoPreview();
}

function closeAddItem() {
  document.getElementById("add-item-modal")?.remove();
  addPhotos = [];
}

function exitContinuous() {
  continuousMode = false;
  continuousCount = 0;
  closeAddItem();
  toast("已退出连续添加");
}

async function saveItem() {
  const name = document.getElementById("item-name").value.trim();
  if (!name) { toast("请输入物品名称"); return; }

  const payload = {
    name,
    destination: selectedDest,
    category: document.getElementById("item-category").value,
    box_id: document.getElementById("item-box").value,
    source_location: document.getElementById("item-location").value,
    estimated_value: document.getElementById("item-value").value,
    is_fragile: isFragile,
    notes: document.getElementById("item-notes").value,
    status: "待整理",
    photos: addPhotos.map(p => p.dataUrl)
  };

  try {
    await api("/items", { method: "POST", body: payload });
    toast("保存成功");
    if (continuousMode) {
      continuousCount++;
      closeAddItem();
      addPhotos = [];
      isFragile = false;
      selectedDest = "新城市";
      setTimeout(() => showAddItemModal(), 200);
    } else {
      closeAddItem();
      if (currentPage === "items") loadItems();
      else if (currentPage === "dashboard") { render(); loadDashboard(); }
    }
  } catch (e) {
    toast("保存失败: " + e.message);
  }
}

async function saveAndContinue() {
  await saveItem();
}

// ==================== Item Detail ====================

async function openItemDetail(id) {
  try {
    const [allItems, allBoxes, allCats] = await Promise.all([api("/items?keyword="), api("/boxes"), api("/categories")]);
    const item = allItems.find(i => i.id === id);
    if (!item) return;

    const boxInfo = item.box_id
      ? `箱#${String(item.box_id).padStart(2,"0")}`
      : (["已装箱","已寄出","已签收"].includes(item.status) ? "未分配箱子" : "未装箱");
    const photos = (item.photos || []).map(p => `<img src="${p}" style="width:100%;border-radius:8px;margin-bottom:8px;">`).join("");

    const modal = document.createElement("div");
    modal.className = "modal-overlay";
    modal.id = "item-detail-modal";
    modal.innerHTML = `
      <div class="modal">
        <div class="modal-header">
          <div class="modal-title">${escapeHtml(item.name)}</div>
          <button class="modal-close" onclick="document.getElementById('item-detail-modal').remove()">&times;</button>
        </div>
        <div class="modal-body">
          ${photos}
          <div class="detail-card">
            <div class="detail-row"><span class="detail-label">去处</span><span class="detail-val">${item.destination}</span></div>
            <div class="detail-row">
              <span class="detail-label">分类</span>
              <select class="form-select" style="width:auto;min-width:120px;font-size:12px;padding:6px 28px 6px 10px;" onchange="changeItemCategory(${item.id}, this.value)" id="detail-cat-select">
                ${allCats.map(c => `<option value="${c.name}" ${item.category === c.name ? "selected" : ""}>${c.name}</option>`).join("")}
              </select>
            </div>
            <div class="detail-row">
              <span class="detail-label">箱子</span>
              <select class="form-select" style="width:auto;min-width:140px;font-size:12px;padding:6px 28px 6px 10px;" onchange="changeItemBox(${item.id}, this.value)" id="detail-box-select">
                <option value="" ${!item.box_id ? "selected" : ""}>未装箱</option>
                ${allBoxes.map(b => `<option value="${b.id}" ${item.box_id === b.id ? "selected" : ""}>${b.box_number} (${b.destination})</option>`).join("")}
              </select>
            </div>
            <div class="detail-row"><span class="detail-label">来源</span><span class="detail-val">${item.source_location || "未记录"}</span></div>
            <div class="detail-row"><span class="detail-label">易碎</span><span class="detail-val">${item.is_fragile ? "是" : "否"}</span></div>
            <div class="detail-row"><span class="detail-label">估值</span><span class="detail-val">${item.estimated_value ? "¥" + item.estimated_value : "未记录"}</span></div>
            <div class="detail-row"><span class="detail-label">状态</span><span class="detail-val">${item.status}</span></div>
            <div class="detail-row"><span class="detail-label">备注</span><span class="detail-val">${item.notes || "无"}</span></div>
            <div class="detail-row"><span class="detail-label">创建时间</span><span class="detail-val">${formatDate(item.created_at)}</span></div>
          </div>
          <div style="height:16px;"></div>
          <div class="btn-row">
            <button class="btn btn-secondary" onclick="quickChangeStatus(${item.id})">更新状态</button>
            <button class="btn btn-danger" onclick="deleteItem(${item.id})">删除</button>
          </div>
          <div style="height:20px;"></div>
        </div>
      </div>
    `;
    document.body.appendChild(modal);
    modal.addEventListener("click", (e) => { if (e.target === modal) modal.remove(); });
  } catch (e) { console.error(e); }
}

async function changeItemBox(itemId, boxId) {
  try {
    const allItems = await api("/items?keyword=");
    const item = allItems.find(i => i.id === itemId);
    const payload = { box_id: boxId ? parseInt(boxId) : null };
    // 如果分配了箱子且当前还是待整理，自动标记为已装箱
    if (boxId && item && item.status === "待整理") {
      payload.status = "已装箱";
    }
    // 如果从箱子中移出且当前状态是已装箱，自动回退到待整理
    if (!boxId && item && item.status === "已装箱") {
      payload.status = "待整理";
    }
    await api(`/items/${itemId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (boxId && item && item.status === "待整理") toast("已装箱：" + (boxId ? "箱#" + String(boxId).padStart(2,"0") : ""));
    else toast(boxId ? "箱子已更新" : "已从箱子移出，状态回退为待整理");
    loadItems();
  } catch (e) { toast("更新失败"); }
}

async function changeItemCategory(itemId, catName) {
  try {
    await api(`/items/${itemId}`, { method: "PUT", body: JSON.stringify({ category: catName }) });
    toast("分类已更新");
    loadItems();
  } catch (e) { toast("更新失败"); }
}

async function openBoxChanger(itemId) {
  try {
    const [allItems, allBoxes] = await Promise.all([api("/items?keyword="), api("/boxes")]);
    const item = allItems.find(i => i.id === itemId);
    if (!item) return;

    const modal = document.createElement("div");
    modal.className = "modal-overlay";
    modal.id = "box-changer-modal";
    modal.innerHTML = `
      <div class="modal" style="max-width:400px;">
        <div class="modal-header">
          <div class="modal-title">换箱子 - ${escapeHtml(item.name)}</div>
          <button class="modal-close" onclick="this.closest('.modal-overlay').remove()">&times;</button>
        </div>
        <div class="modal-body">
          <div style="margin-bottom:12px;font-size:13px;color:var(--text-sub);">
            ${item.box_id
              ? '当前：箱#' + String(item.box_id).padStart(2,'0')
              : (["已装箱","已寄出","已签收"].includes(item.status)
                ? '当前：未分配箱子（状态为' + item.status + '）'
                : '当前：未装箱')
            }
          </div>
          <button class="btn btn-secondary" style="margin-bottom:8px;text-align:left;display:flex;justify-content:space-between;" onclick="changeItemBox(${itemId},'');document.getElementById('box-changer-modal').remove()">
            <span>未装箱</span>
            <span style="color:var(--text-muted);">从箱子中移出</span>
          </button>
          ${allBoxes.map(b => `
            <button class="btn btn-secondary" style="margin-bottom:8px;text-align:left;display:flex;justify-content:space-between;${b.id === item.box_id ? 'border:2px solid var(--primary);background:var(--primary-soft);' : ''}" onclick="changeItemBox(${itemId},${b.id});document.getElementById('box-changer-modal').remove()">
              <span>${b.box_number}</span>
              <span style="color:var(--text-sub);font-size:12px;">${b.destination}</span>
            </button>
          `).join("")}
          ${allBoxes.length === 0 ? '<div style="text-align:center;color:var(--text-sub);padding:20px;">暂无箱子，请先在"箱子"页新建</div>' : ''}
        </div>
      </div>
    `;
    document.body.appendChild(modal);
    modal.addEventListener("click", (e) => { if (e.target === modal) modal.remove(); });
  } catch (e) { toast("加载失败"); console.error(e); }
}

async function quickChangeStatus(id) {
  const statuses = ["待整理", "已装箱", "已寄出", "已签收"];
  const allItems = await api("/items?keyword=");
  const item = allItems.find(i => i.id === id);
  if (!item) return;

  const modal = document.createElement("div");
  modal.className = "modal-overlay";
  modal.id = "quick-status-modal";
  modal.innerHTML = `
    <div class="modal" style="max-width:400px;">
      <div class="modal-header">
        <div class="modal-title">更新状态 - ${escapeHtml(item.name)}</div>
        <button class="modal-close" onclick="this.closest('.modal-overlay').remove()">&times;</button>
      </div>
      <div class="modal-body">
        ${statuses.map(s => {
          const needsBoxFirst = s === "已装箱" && !item.box_id;
          return `<button class="btn btn-secondary" style="margin-bottom:8px;display:flex;align-items:center;justify-content:space-between;" onclick="${needsBoxFirst ? `document.getElementById('quick-status-modal').remove();openBoxChanger(${id})` : `updateStatus(${id},'${s}')`}">
            <span>${s}</span>
            ${needsBoxFirst ? '<span style="font-size:12px;color:var(--red);">需先选箱子</span>' : ''}
          </button>`;
        }).join("")}
      </div>
    </div>
  `;
  document.body.appendChild(modal);
  modal.addEventListener("click", (e) => { if (e.target === modal) modal.remove(); });
}

async function updateStatus(id, status) {
  try {
    await api(`/items/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    toast("状态已更新");
    document.querySelectorAll(".modal-overlay").forEach(m => m.remove());
    loadItems();
  } catch (e) { toast("更新失败"); }
}

async function deleteItem(id) {
  if (!confirm("确定删除这个物品吗？")) return;
  try {
    await api(`/items/${id}`, { method: "DELETE" });
    toast("已删除");
    document.querySelectorAll(".modal-overlay").forEach(m => m.remove());
    loadItems();
  } catch (e) { toast("删除失败"); }
}

// ==================== Boxes ====================

function renderBoxes() {
  return `
    <div class="page-header">
      <div>
        <div class="page-title">箱子管理</div>
        <div class="page-sub" id="boxes-sub"></div>
      </div>
    </div>
    <div class="filter-bar">
      <span class="chip ${currentFilter.destination === '全部' ? 'active' : ''}" onclick="boxFilter('全部')">全部</span>
      <span class="chip" onclick="boxFilter('新城市')">新城市</span>
      <span class="chip" onclick="boxFilter('老家')">老家</span>
    </div>
    <div class="box-list" id="box-list"></div>
  `;
}

let boxFilterVal = "全部";
function boxFilter(val) {
  boxFilterVal = val;
  document.querySelectorAll(".filter-bar .chip").forEach(c => {
    c.classList.toggle("active", c.textContent === val || (val === "全部" && c === document.querySelector(".filter-bar .chip:first-child")));
  });
  loadBoxes();
}

async function loadBoxes() {
  try {
    const params = new URLSearchParams();
    if (boxFilterVal !== "全部") params.set("destination", boxFilterVal);
    const boxes = await api("/boxes?" + params.toString());
    const el = document.getElementById("box-list");
    const sub = document.getElementById("boxes-sub");
    sub.textContent = `${boxes.length} 个箱子`;

    if (!boxes.length) {
      el.innerHTML = '<div class="empty"><div class="empty-icon">📦</div><div class="empty-text">还没有箱子，点击左下角 + 创建</div></div>';
      return;
    }

    const destColors = { 新城市: "var(--green)", 老家: "var(--amber)" };
    el.innerHTML = boxes.map(b => {
      const itemsPreview = (b.items || []).slice(0, 3).map(i => `<div class="box-item-row">- ${escapeHtml(i.name)} (${i.category})</div>`).join("");
      const moreItems = b.item_count > 3 ? `<div class="box-item-row">...共 ${b.item_count} 件</div>` : "";
      return `<div class="box-card" onclick="openBoxDetail(${b.id})">
        <div class="box-header">
          <span class="box-number">${b.box_number}</span>
          <span class="dist-dot" style="background:${destColors[b.destination]}"></span>
        </div>
        <div class="box-items-preview">${b.destination} · ${b.shipping_method} · ${b.status}</div>
        ${itemsPreview}${moreItems}
        ${b.tracking_number ? `<div class="box-trace">快递单号: ${escapeHtml(b.tracking_number)}</div>` : ""}
      </div>`;
    }).join("");
  } catch (e) { console.error(e); }
}

function openAddBox() {
  const modal = document.createElement("div");
  modal.className = "modal-overlay";
  modal.id = "add-box-modal";
  modal.innerHTML = `
    <div class="modal">
      <div class="modal-header">
        <div class="modal-title">新建箱子</div>
        <button class="modal-close" onclick="document.getElementById('add-box-modal').remove()">&times;</button>
      </div>
      <div class="modal-body">
        <div class="form-group">
          <label class="form-label">去处</label>
          <div class="segmented" id="box-dest-seg">
            <button class="seg-btn active" data-val="新城市" onclick="selectBoxSeg(this,'新城市')">新城市</button>
            <button class="seg-btn" data-val="老家" onclick="selectBoxSeg(this,'老家')">老家</button>
          </div>
        </div>
        <div class="form-group">
          <label class="form-label">寄送方式</label>
          <select class="form-select" id="box-shipping">
            <option value="快递">快递</option>
            <option value="物流">物流</option>
            <option value="随身带">随身带</option>
          </select>
        </div>
        <div class="form-group">
          <label class="form-label">备注 (可选)</label>
          <textarea class="form-textarea" id="box-notes" placeholder="如：重物，需要两个人搬"></textarea>
        </div>
        <div style="height:8px;"></div>
        <button class="btn btn-primary" onclick="createBox()">创建箱子</button>
        <div style="height:20px;"></div>
      </div>
    </div>
  `;
  document.body.appendChild(modal);
  modal.addEventListener("click", (e) => { if (e.target === modal) modal.remove(); });
}

let boxDest = "新城市";
function selectBoxSeg(btn, val) {
  btn.parentElement.querySelectorAll(".seg-btn").forEach(b => b.classList.remove("active"));
  btn.classList.add("active");
  boxDest = val;
}

async function createBox() {
  try {
    const box = await api("/boxes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        destination: boxDest,
        shipping_method: document.getElementById("box-shipping").value,
        notes: document.getElementById("box-notes").value,
      }),
    });
    toast(`已创建 ${box.box_number}`);
    document.getElementById("add-box-modal").remove();
    loadBoxes();
  } catch (e) { toast("创建失败"); }
}

async function openBoxDetail(id) {
  try {
    const boxes = await api("/boxes");
    const box = boxes.find(b => b.id === id);
    if (!box) return;

    const itemsHtml = (box.items || []).length
      ? box.items.map(i => `<div class="item-card" style="cursor:default;">
          <div class="item-info"><div class="item-name">${escapeHtml(i.name)}</div><div class="item-meta">${i.category}</div></div>
        </div>`).join("")
      : '<div class="empty"><div class="empty-text">箱内暂无物品</div></div>';

    const modal = document.createElement("div");
    modal.className = "modal-overlay";
    modal.id = "box-detail-modal";
    modal.innerHTML = `
      <div class="modal">
        <div class="modal-header">
          <div class="modal-title">${box.box_number}</div>
          <button class="modal-close" onclick="document.getElementById('box-detail-modal').remove()">&times;</button>
        </div>
        <div class="modal-body">
          <div class="detail-card">
            <div class="detail-row"><span class="detail-label">去处</span>
              <select class="form-select" style="width:auto;min-width:120px;font-size:12px;padding:6px 28px 6px 10px;" onchange="changeBoxDestination(${box.id}, this.value)" id="detail-box-dest-select">
                <option value="新城市" ${box.destination === '新城市' ? 'selected' : ''}>新城市</option>
                <option value="老家" ${box.destination === '老家' ? 'selected' : ''}>老家</option>
                <option value="丢弃" ${box.destination === '丢弃' ? 'selected' : ''}>丢弃</option>
              </select>
            </div>
            <div class="detail-row"><span class="detail-label">寄送方式</span><span class="detail-val">${box.shipping_method}</span></div>
            <div class="detail-row"><span class="detail-label">状态</span><span class="detail-val">${box.status}</span></div>
            <div class="detail-row"><span class="detail-label">物品数</span><span class="detail-val">${box.item_count} 件</span></div>
            ${box.tracking_number ? `<div class="detail-row"><span class="detail-label">快递单号</span><span class="detail-val">${box.tracking_number}</span></div>` : ""}
            <div class="detail-row"><span class="detail-label">备注</span><span class="detail-val">${box.notes || "无"}</span></div>
          </div>
          <div style="height:12px;"></div>
          <div class="form-group">
            <label class="form-label">快递单号</label>
            <div style="display:flex;gap:8px;">
              <input class="form-input" id="box-track-input" placeholder="输入快递单号" value="${escapeHtml(box.tracking_number || "")}">
              <button class="btn btn-secondary" style="width:auto;padding:0 16px;white-space:nowrap;" onclick="updateTracking(${box.id})">保存</button>
            </div>
          </div>
          <div class="form-group">
            <label class="form-label">箱子状态</label>
            <select class="form-select" id="box-status-select" onchange="updateBoxStatus(${box.id})">
              <option value="">选择状态...</option>
              ${["待装箱", "已封箱", "已寄出", "已签收"].map(s => `<option value="${s}" ${box.status === s ? "selected" : ""}>${s}</option>`).join("")}
            </select>
          </div>
          <div style="height:8px;"></div>
          <div class="btn-row">
            <button class="btn btn-secondary" onclick="printLabel(${box.id})">打印标签</button>
            <button class="btn btn-danger" onclick="deleteBox(${box.id})">删除箱子</button>
          </div>
          <div style="height:12px;"></div>
          <div class="section-title">箱内物品 (${box.item_count})</div>
          ${itemsHtml}
          <div style="height:20px;"></div>
        </div>
      </div>
    `;
    document.body.appendChild(modal);
    modal.addEventListener("click", (e) => { if (e.target === modal) modal.remove(); });
  } catch (e) { console.error(e); }
}

async function updateTracking(id) {
  const val = document.getElementById("box-track-input").value.trim();
  try {
    await api(`/boxes/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tracking_number: val }),
    });
    toast("快递单号已保存");
  } catch (e) { toast("保存失败"); }
}

async function updateBoxStatus(id) {
  const val = document.getElementById("box-status-select").value;
  if (!val) return;
  try {
    await api(`/boxes/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: val }),
    });
    toast("状态已更新");
    document.getElementById("box-detail-modal").remove();
    loadBoxes();
  } catch (e) { toast("更新失败"); }
}

async function changeBoxDestination(boxId, dest) {
  try {
    await api(`/boxes/${boxId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ destination: dest }),
    });
    toast("去处已更新");
    loadBoxes();
  } catch (e) { toast("更新失败"); }
}

async function deleteBox(id) {
  if (!confirm("删除箱子后，箱内物品会变为未装箱状态。确认删除？")) return;
  try {
    await api(`/boxes/${id}`, { method: "DELETE" });
    toast("箱子已删除");
    document.getElementById("box-detail-modal").remove();
    loadBoxes();
  } catch (e) { toast("删除失败"); }
}

async function printLabel(id) {
  // Must open window synchronously to avoid popup blocker
  const w = window.open("", "_blank");
  if (!w) { toast("弹窗被拦截，请允许本站弹窗后重试"); return; }
  const boxes = await api("/boxes");
  const box = boxes.find(b => b.id === id);
  if (!box) { w.close(); return; }
  const itemList = (box.items || []).map(i => `- ${i.name} (${i.category})`).join("<br>");
  w.document.write(`
    <html><head><meta charset="UTF-8"><title>${box.box_number} 标签</title>
    <style>
      * { margin:0; padding:0; box-sizing:border-box; }
      body { font-family: sans-serif; padding: 20px; }
      .label { border: 3px solid #534AB7; border-radius: 16px; padding: 24px; width: 400px; margin: 0 auto; }
      .box-num { font-size: 42px; font-weight: 700; color: #534AB7; text-align: center; margin-bottom: 8px; }
      .dest { font-size: 24px; text-align: center; margin-bottom: 16px; }
      .dest-tag { display: inline-block; padding: 8px 24px; border-radius: 8px; font-weight: 600; }
      .dest-city { background: #E1F5EE; color: #0F6E56; }
      .dest-home { background: #FAEEDA; color: #854F0B; }
      .info { font-size: 14px; margin: 12px 0; }
      .items { font-size: 12px; margin-top: 12px; padding-top: 12px; border-top: 2px dashed #ccc; }
      .items-title { font-weight: 600; margin-bottom: 8px; }
      .meta { font-size: 12px; color: #888; margin-top: 12px; text-align: center; }
    </style></head>
    <body>
      <div class="label">
        <div class="box-num">${box.box_number}</div>
        <div class="dest"><span class="dest-tag ${box.destination === '新城市' ? 'dest-city' : 'dest-home'}">${box.destination}</span></div>
        <div class="info">寄送方式：${box.shipping_method}</div>
        <div class="info">物品数量：${box.item_count} 件</div>
        ${box.tracking_number ? `<div class="info">快递单号：${box.tracking_number}</div>` : ""}
        ${box.notes ? `<div class="info">备注：${box.notes}</div>` : ""}
        ${itemList ? `<div class="items"><div class="items-title">内容物：</div>${itemList}</div>` : ""}
        <div class="meta">${formatDate(new Date().toISOString())} 打印</div>
      </div>
      <script>window.print();<\/script>
    </body></html>
  `);
  w.document.close();
}

// ==================== More ====================

function renderMore() {
  return `
    <div class="page-header">
      <div><div class="page-title">更多</div></div>
    </div>
    <div style="display:flex;flex-direction:column;gap:12px;">
      <div class="glass-card">
        <div class="section-title">快速操作</div>
        <div style="display:flex;flex-direction:column;gap:8px;">
          <button class="btn btn-primary" onclick="openAddItemContinuous()">连续添加模式</button>
          <button class="btn btn-secondary" onclick="exportExcel()">导出 Excel（物品+箱子+汇总）</button>
          <button class="btn btn-secondary" onclick="exportData()">导出全部数据 (JSON 备份)</button>
          <button class="btn btn-secondary" onclick="document.getElementById('import-file').click()">导入备份 (JSON)</button>
          <input type="file" id="import-file" accept="application/json,.json" style="display:none;" onchange="importData(this.files[0])">
        </div>
      </div>
      <div class="glass-card">
        <div class="section-title">分类管理</div>
        <div id="cat-manage-list"></div>
        <div style="height:12px;"></div>
        <div style="display:flex;gap:8px;">
          <input class="form-input" id="new-cat-input" placeholder="新分类名称">
          <button class="btn btn-secondary" style="width:auto;padding:0 16px;white-space:nowrap;" onclick="addCategory()">添加</button>
        </div>
      </div>
      <div class="glass-card">
        <div class="section-title">使用说明</div>
        <div style="font-size:13px;color:var(--text-sub);line-height:1.9;">
          1. 点击左下角 + 添加物品，可拍照或文字输入<br>
          2. 物品可设置去处、分类、装箱、易碎等属性<br>
          3. 在"箱子"页创建箱子，查看每个箱子内容物<br>
          4. 点击箱子可打印标签，贴在箱子上<br>
          5. "连续添加模式"适合一次性录入大量物品<br>
          6. 手机浏览器菜单中选择"添加到主屏幕"即可像App一样使用
        </div>
      </div>
    </div>
  `;
}

async function initMore() {
  if (!categories.length) categories = await api("/categories");
  const el = document.getElementById("cat-manage-list");
  if (!el) return;
  el.innerHTML = categories.map(c =>
    `<div style="display:flex;justify-content:space-between;align-items:center;padding:8px 0;border-bottom:1px solid var(--border);">
      <span style="font-size:13px;">${c.name}</span>
      <button class="modal-close" style="font-size:16px;" onclick="deleteCategory(${c.id})">&times;</button>
    </div>`
  ).join("");
}

async function addCategory() {
  const input = document.getElementById("new-cat-input");
  const name = input.value.trim();
  if (!name) return;
  try {
    await api("/categories", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name }) });
    input.value = "";
    categories = await api("/categories");
    initMore();
    toast("分类已添加");
  } catch (e) { toast("添加失败"); }
}

async function deleteCategory(id) {
  if (!confirm("确定删除此分类？")) return;
  try {
    await api(`/categories/${id}`, { method: "DELETE" });
    categories = await api("/categories");
    initMore();
    toast("已删除");
  } catch (e) { toast("删除失败"); }
}

async function exportData() {
  try {
    const data = await api("/export/json");
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `搬家物品清单_${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast("已导出");
  } catch (e) { toast("导出失败"); }
}

async function exportExcel() {
  try {
    const data = await api("/export/json");
    const sheets = buildInventorySheets(data);
    const bytes = buildXlsx(sheets);
    const blob = new Blob([bytes], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `搬家物品清单_${new Date().toISOString().slice(0, 10)}.xlsx`;
    a.click();
    URL.revokeObjectURL(url);
    toast("Excel 已导出");
  } catch (e) { console.error(e); toast("导出失败"); }
}

async function importData(file) {
  if (!file) return;
  if (!confirm("导入将覆盖当前所有数据，确定继续？")) return;
  try {
    const text = await file.text();
    const data = JSON.parse(text);
    await api("/import", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) });
    toast("导入成功，正在刷新");
    location.reload();
  } catch (e) { console.error(e); toast("导入失败：文件格式错误"); }
}

// ==================== PWA Install ====================

let deferredPrompt = null;

function isStandalone() {
  return window.matchMedia("(display-mode: standalone)").matches ||
         navigator.standalone ||
         document.referrer.includes("android-app://");
}

function isIOS() {
  return /iphone|ipad|ipod/.test(navigator.userAgent.toLowerCase());
}

function showPwaBanner() {
  if (isStandalone()) return;
  const app = document.getElementById("app");
  const existing = document.getElementById("pwa-banner");
  if (existing) existing.remove();

  const banner = document.createElement("div");
  banner.id = "pwa-banner";
  banner.innerHTML = `
    <div class="pwa-banner-content">
      <div class="pwa-banner-text">
        <strong>安装到手机</strong>
        <span>${isIOS()
          ? "点下方分享按钮 → 添加到主屏幕"
          : "点击安装，像App一样使用"}</span>
      </div>
      <button class="pwa-banner-btn" onclick="installPWA()" style="${isIOS() ? 'display:none' : ''}">安装</button>
      <button class="pwa-banner-close" onclick="closePwaBanner()">&times;</button>
    </div>
  `;
  app.insertBefore(banner, app.firstChild);
}

function closePwaBanner() {
  const b = document.getElementById("pwa-banner");
  if (b) b.remove();
}

async function installPWA() {
  if (!deferredPrompt) { toast("请从浏览器菜单中选择'添加到主屏幕'"); return; }
  try {
    deferredPrompt.prompt();
    const result = await deferredPrompt.userChoice;
    deferredPrompt = null;
    if (result.outcome === "accepted") {
      closePwaBanner();
      toast("安装成功");
    }
  } catch (e) {
    toast("安装失败，请从浏览器菜单添加");
  }
}

function initPWA() {
  // Don't show banner if already installed
  if (isStandalone()) return;

  // Listen for install prompt (Android Chrome)
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferredPrompt = e;
    showPwaBanner();
  });

  // Show banner after a short delay for iOS / browsers without beforeinstallprompt
  setTimeout(() => {
    if (!deferredPrompt) showPwaBanner();
  }, 3000);
}

// ==================== Init ====================

async function init() {
  await DB.init();
  categories = await api("/categories");
  render();
  initPWA();
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("sw.js").catch(() => {});
  }
}

init();
