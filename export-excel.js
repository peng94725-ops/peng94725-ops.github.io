// export-excel.js - 将数据库数据转换为 Excel 多 sheet 结构
// 依赖 xlsx-maker.js 的 buildXlsx()

(function (global) {
  function buildInventorySheets(data) {
    const items = data.items || [];
    const boxes = data.boxes || [];
    const categories = data.categories || [];

    const boxMap = {};
    boxes.forEach((b) => { boxMap[b.id] = b.box_number; });

    // ---- Sheet 1: 物品清单 ----
    const itemRows = [["ID", "名称", "分类", "去处", "状态", "所在箱子", "是否易碎", "估值(元)", "来源地", "备注"]];
    items.forEach((it) => {
      itemRows.push([
        it.id,
        it.name || "",
        it.category || "",
        it.destination || "",
        it.status || "",
        it.box_id ? (boxMap[it.box_id] || ("箱#" + String(it.box_id).padStart(2, "0"))) : "未装箱",
        it.is_fragile ? "易碎" : "否",
        it.estimated_value != null ? Number(it.estimated_value) : "",
        it.source_location || "",
        it.notes || ""
      ]);
    });

    // ---- Sheet 2: 箱子清单 ----
    const boxRows = [["箱号", "去处", "寄送方式", "快递单号", "状态", "物品数量", "备注"]];
    boxes.forEach((b) => {
      const count = items.filter((i) => i.box_id === b.id).length;
      boxRows.push([
        b.box_number || "",
        b.destination || "",
        b.shipping_method || "",
        b.tracking_number || "",
        b.status || "",
        count,
        b.notes || ""
      ]);
    });

    // ---- Sheet 3: 分类汇总 ----
    const catRows = [["分类", "物品数量", "估值合计(元)"]];
    categories.forEach((c) => {
      const list = items.filter((i) => i.category === c.name);
      const sum = list.reduce((s, i) => s + (Number(i.estimated_value) || 0), 0);
      catRows.push([c.name, list.length, sum]);
    });
    // 合计行
    const totalCount = items.length;
    const totalValue = items.reduce((s, i) => s + (Number(i.estimated_value) || 0), 0);
    catRows.push(["合计", totalCount, totalValue]);

    return [
      { name: "物品清单", rows: itemRows },
      { name: "箱子清单", rows: boxRows },
      { name: "分类汇总", rows: catRows }
    ];
  }

  global.buildInventorySheets = buildInventorySheets;
})(typeof window !== "undefined" ? window : globalThis);
