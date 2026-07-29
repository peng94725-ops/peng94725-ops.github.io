// db.js - IndexedDB 本地存储层（替代服务端 JSON 存储）
// 首次打开自动载入种子数据（现有物品/箱子/分类）
// 所有数据保存在浏览器本地，关电脑/断网都不丢，可"添加到主屏幕"离线使用

(function (global) {
  const DB_NAME = "move-inventory";
  const DB_VERSION = 1;
  let _db = null;

  // 种子数据：首次运行（空库）时写入，保留用户已有记录
  const SEED = {
    items: [
      { id: 1, name: "羽绒服", photos: [], category: "衣物鞋帽", destination: "新城市", box_id: 1, source_location: "", is_fragile: false, estimated_value: 800, status: "已装箱", notes: "" },
      { id: 2, name: "电饭煲", photos: [], category: "厨房用品", destination: "新城市", box_id: null, source_location: "", is_fragile: false, estimated_value: 300, status: "待整理", notes: "" },
      { id: 3, name: "Java编程思想", photos: [], category: "书籍资料", destination: "老家", box_id: 2, source_location: "", is_fragile: false, estimated_value: null, status: "已装箱", notes: "" },
      { id: 4, name: "机械键盘", photos: [], category: "电子产品", destination: "新城市", box_id: 1, source_location: "", is_fragile: false, estimated_value: 600, status: "已寄出", notes: "" },
      { id: 5, name: "瑜伽垫", photos: [], category: "运动器材", destination: "新城市", box_id: 1, source_location: "", is_fragile: false, estimated_value: 120, status: "已签收", notes: "" },
      { id: 6, name: "台灯", photos: [], category: "日用品", destination: "老家", box_id: null, source_location: "", is_fragile: true, estimated_value: null, status: "待整理", notes: "" }
    ],
    boxes: [
      { id: 1, box_number: "箱#01", destination: "新城市", shipping_method: "快递", tracking_number: "", status: "待装箱", notes: "" },
      { id: 2, box_number: "箱#02", destination: "老家", shipping_method: "物流", tracking_number: "", status: "待装箱", notes: "" }
    ],
    categories: [
      { id: 1, name: "电子产品", sort_order: 1 },
      { id: 2, name: "衣物鞋帽", sort_order: 2 },
      { id: 3, name: "书籍资料", sort_order: 3 },
      { id: 4, name: "厨房用品", sort_order: 4 },
      { id: 5, name: "日用品", sort_order: 5 },
      { id: 6, name: "家居装饰", sort_order: 6 },
      { id: 7, name: "证件文件", sort_order: 7 },
      { id: 8, name: "美妆护肤", sort_order: 8 },
      { id: 9, name: "运动器材", sort_order: 9 },
      { id: 10, name: "贵重物品", sort_order: 10 },
      { id: 11, name: "其他", sort_order: 11 }
    ]
  };

  function openDB() {
    return new Promise((resolve, reject) => {
      if (_db) return resolve(_db);
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = (e) => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains("items")) db.createObjectStore("items", { keyPath: "id" });
        if (!db.objectStoreNames.contains("boxes")) db.createObjectStore("boxes", { keyPath: "id" });
        if (!db.objectStoreNames.contains("categories")) db.createObjectStore("categories", { keyPath: "id" });
        if (!db.objectStoreNames.contains("meta")) db.createObjectStore("meta", { keyPath: "key" });
      };
      req.onsuccess = () => { _db = req.result; resolve(_db); };
      req.onerror = () => reject(req.error);
    });
  }

  function tx(store, mode) {
    return _db.transaction(store, mode).objectStore(store);
  }
  function reqAsync(request) {
    return new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }
  function getAll(store) { return reqAsync(tx(store, "readonly").getAll()); }
  function put(store, val) { return reqAsync(tx(store, "readwrite").put(val)); }
  function del(store, id) { return reqAsync(tx(store, "readwrite").delete(id)); }

  async function getCounters() {
    const m = await reqAsync(tx("meta", "readonly").get("counters"));
    if (m) return m.value;
    return { nextItemId: 1, nextBoxId: 1, nextCategoryId: 1 };
  }
  async function setCounters(c) { await put("meta", { key: "counters", value: c }); }

  async function init() {
    await openDB();
    // 不再自动写入演示数据：用户删空后必须保持为空。
    // 仅在"从未初始化过分类"时补默认分类（分类是功能必需项，物品/箱子不是）。
    const seededFlag = await reqAsync(tx("meta", "readonly").get("seeded"));
    if (!seededFlag) {
      const cats = await getAll("categories");
      if (cats.length === 0) {
        let counters = await getCounters();
        for (const c of SEED.categories) { await put("categories", c); counters.nextCategoryId = Math.max(counters.nextCategoryId, c.id + 1); }
        await setCounters(counters);
      }
      await put("meta", { key: "seeded", value: true });
    }
  }

  // ---------- 状态/箱子 一致性规则 ----------
  function enforceItemConsistency(item) {
    if (["已装箱", "已寄出", "已签收"].includes(item.status) && (item.box_id === null || item.box_id === undefined)) {
      item.status = "待整理";
    }
    if (item.box_id !== null && item.box_id !== undefined && item.status === "待整理") {
      item.status = "已装箱";
    }
    return item;
  }

  // ---------- Items ----------
  async function getItems(filters = {}) {
    let items = await getAll("items");
    if (filters.destination && filters.destination !== "全部") items = items.filter((i) => i.destination === filters.destination);
    if (filters.category && filters.category !== "全部") items = items.filter((i) => i.category === filters.category);
    if (filters.status && filters.status !== "全部") items = items.filter((i) => i.status === filters.status);
    if (filters.boxId) items = items.filter((i) => String(i.box_id) === String(filters.boxId));
    if (filters.keyword) {
      const kw = filters.keyword.toLowerCase();
      items = items.filter((i) => (i.name || "").toLowerCase().includes(kw) || (i.notes || "").toLowerCase().includes(kw));
    }
    return items;
  }

  async function addItem(obj) {
    const counters = await getCounters();
    const now = new Date().toISOString();
    const item = {
      id: counters.nextItemId++,
      name: obj.name || "",
      photos: obj.photos || [],
      category: obj.category || "其他",
      destination: obj.destination || "新城市",
      box_id: obj.box_id ? parseInt(obj.box_id) : null,
      source_location: obj.source_location || "",
      is_fragile: !!obj.is_fragile,
      estimated_value: obj.estimated_value ? parseFloat(obj.estimated_value) : null,
      status: obj.status || "待整理",
      notes: obj.notes || "",
      created_at: now,
      updated_at: now
    };
    enforceItemConsistency(item);
    await put("items", item);
    await setCounters(counters);
    return item;
  }

  async function updateItem(id, patch) {
    const items = await getAll("items");
    const idx = items.findIndex((i) => i.id === id);
    if (idx === -1) throw new Error("Item not found");
    const item = items[idx];
    const fields = ["name", "category", "destination", "source_location", "status", "notes"];
    fields.forEach((f) => { if (patch[f] !== undefined) item[f] = patch[f]; });
    if (patch.box_id !== undefined) item.box_id = patch.box_id ? parseInt(patch.box_id) : null;
    if (patch.is_fragile !== undefined) item.is_fragile = !!patch.is_fragile;
    if (patch.estimated_value !== undefined) item.estimated_value = patch.estimated_value ? parseFloat(patch.estimated_value) : null;
    if (patch.photos !== undefined) item.photos = patch.photos;
    item.updated_at = new Date().toISOString();
    enforceItemConsistency(item);
    await put("items", item);
    return item;
  }

  async function deleteItem(id) {
    await del("items", id);
    return { success: true };
  }

  async function batchUpdate(ids, action, value) {
    const items = await getAll("items");
    const idSet = new Set(ids.map((x) => parseInt(x)));
    let updated = 0;
    for (const item of items) {
      if (!idSet.has(item.id)) continue;
      if (action === "status") {
        item.status = value;
        enforceItemConsistency(item);
      } else if (action === "box") {
        item.box_id = value ? parseInt(value) : null;
        enforceItemConsistency(item);
      } else if (action === "status+box") {
        // 同时改状态+箱子（用于批量改"已装箱"时让用户先选箱子）
        item.status = value.status;
        item.box_id = value.box_id ? parseInt(value.box_id) : null;
        enforceItemConsistency(item);
      }
      item.updated_at = new Date().toISOString();
      await put("items", item);
      updated++;
    }
    return { success: true, updated };
  }

  // ---------- Boxes ----------
  async function getBoxes(filters = {}) {
    let boxes = await getAll("boxes");
    if (filters.destination && filters.destination !== "全部") boxes = boxes.filter((b) => b.destination === filters.destination);
    if (filters.status && filters.status !== "全部") boxes = boxes.filter((b) => b.status === filters.status);
    const items = await getAll("items");
    boxes = boxes.map((b) => {
      const contents = items.filter((i) => i.box_id === b.id);
      return { ...b, item_count: contents.length, items: contents.map((i) => ({ id: i.id, name: i.name, category: i.category })) };
    });
    return boxes;
  }

  async function addBox(obj) {
    const counters = await getCounters();
    const boxNum = String(counters.nextBoxId).padStart(2, "0");
    const box = {
      id: counters.nextBoxId,
      box_number: `箱#${boxNum}`,
      destination: obj.destination || "新城市",
      shipping_method: obj.shipping_method || "快递",
      tracking_number: obj.tracking_number || "",
      status: obj.status || "待装箱",
      notes: obj.notes || "",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };
    counters.nextBoxId++;
    await put("boxes", box);
    await setCounters(counters);
    return box;
  }

  async function updateBox(id, patch) {
    const boxes = await getAll("boxes");
    const idx = boxes.findIndex((b) => b.id === id);
    if (idx === -1) throw new Error("Box not found");
    const box = boxes[idx];
    ["destination", "shipping_method", "tracking_number", "status", "notes"].forEach((f) => { if (patch[f] !== undefined) box[f] = patch[f]; });
    box.updated_at = new Date().toISOString();
    await put("boxes", box);
    return box;
  }

  async function deleteBox(id) {
    await del("boxes", id);
    const items = await getAll("items");
    for (const i of items) {
      if (i.box_id === id) { i.box_id = null; await put("items", i); }
    }
    return { success: true };
  }

  // ---------- Categories ----------
  async function getCategories() {
    const cats = await getAll("categories");
    return cats.sort((a, b) => a.sort_order - b.sort_order);
  }
  async function addCategory(name) {
    const cats = await getAll("categories");
    const counters = await getCounters();
    const cat = { id: counters.nextCategoryId++, name: name || "新分类", sort_order: cats.length + 1 };
    await put("categories", cat);
    await setCounters(counters);
    return cat;
  }
  async function deleteCategory(id) {
    const cats = await getAll("categories");
    const idx = cats.findIndex((c) => c.id === id);
    if (idx === -1) throw new Error("Category not found");
    cats.splice(idx, 1);
    await del("categories", id);
    return { success: true };
  }

  // ---------- Stats ----------
  async function getStats() {
    const items = await getAll("items");
    const boxes = await getAll("boxes");
    const destStats = {};
    ["新城市", "老家", "丢弃"].forEach((d) => {
      destStats[d] = { items: items.filter((i) => i.destination === d).length, boxes: boxes.filter((b) => b.destination === d).length };
    });
    const catStats = {};
    const cats = await getCategories();
    cats.forEach((c) => { catStats[c.name] = items.filter((i) => i.category === c.name).length; });
    const statusStats = {};
    ["待整理", "已装箱", "已寄出", "已签收"].forEach((s) => { statusStats[s] = items.filter((i) => i.status === s).length; });
    const boxStatusStats = {};
    ["待装箱", "已封箱", "已寄出", "已签收"].forEach((s) => { boxStatusStats[s] = boxes.filter((b) => b.status === s).length; });
    const totalValue = items.reduce((sum, i) => sum + (i.estimated_value || 0), 0);
    return {
      totalItems: items.length,
      totalBoxes: boxes.length,
      byDestination: destStats,
      byCategory: catStats,
      byStatus: statusStats,
      byBoxStatus: boxStatusStats,
      totalValue,
      progress: {
        sorted: items.filter((i) => i.status !== "待整理").length,
        packed: items.filter((i) => ["已装箱", "已寄出", "已签收"].includes(i.status)).length,
        shipped: items.filter((i) => ["已寄出", "已签收"].includes(i.status)).length,
        received: items.filter((i) => i.status === "已签收").length
      }
    };
  }

  // ---------- Export / Import ----------
  async function exportAll() {
    const [items, boxes, categories] = await Promise.all([getAll("items"), getAll("boxes"), getAll("categories")]);
    const counters = await getCounters();
    return { items, boxes, categories, nextItemId: counters.nextItemId, nextBoxId: counters.nextBoxId, nextCategoryId: counters.nextCategoryId };
  }

  async function importAll(data) {
    if (!data || !data.items) throw new Error("无效数据");
    await openDB();
    // 清空现有
    for (const store of ["items", "boxes", "categories"]) {
      const all = await getAll(store);
      for (const r of all) await del(store, r.id);
    }
    let counters = { nextItemId: 1, nextBoxId: 1, nextCategoryId: 1 };
    for (const it of (data.items || [])) { await put("items", it); counters.nextItemId = Math.max(counters.nextItemId, (it.id || 0) + 1); }
    for (const b of (data.boxes || [])) { await put("boxes", b); counters.nextBoxId = Math.max(counters.nextBoxId, (b.id || 0) + 1); }
    for (const c of (data.categories || [])) { await put("categories", c); counters.nextCategoryId = Math.max(counters.nextCategoryId, (c.id || 0) + 1); }
    await setCounters(counters);
    return { success: true };
  }

  // 清空所有数据（重置）
  async function clearAll() {
    await openDB();
    for (const store of ["items", "boxes", "categories"]) {
      const all = await getAll(store);
      for (const r of all) await del(store, r.id);
    }
    const cats = SEED.categories;
    let counters = { nextItemId: 1, nextBoxId: 1, nextCategoryId: cats.length + 1 };
    for (const c of cats) { await put("categories", c); }
    await setCounters(counters);
    return { success: true };
  }

  const db = {
    init, getItems, addItem, updateItem, deleteItem, batchUpdate,
    getBoxes, addBox, updateBox, deleteBox,
    getCategories, addCategory, deleteCategory,
    getStats, exportAll, importAll, clearAll
  };
  global.DB = db;
  if (typeof module !== "undefined" && module.exports) module.exports = db;
})(typeof window !== "undefined" ? window : globalThis);
