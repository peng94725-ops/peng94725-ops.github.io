// xlsx-maker.js - 纯前端生成真正的 .xlsx 文件（无外部依赖，支持多 sheet）
// 用法: const bytes = buildXlsx([{name:'Sheet1', rows:[[...],[...]]}, ...])
// 返回 Uint8Array，可直接用 new Blob([bytes], {type:...}) 下载

(function (global) {
  // ---------- CRC32 ----------
  const CRC_TABLE = (function () {
    const t = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      t[n] = c >>> 0;
    }
    return t;
  })();

  function crc32(bytes) {
    let c = 0xffffffff;
    for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  }

  const enc = new TextEncoder();

  // ---------- 工具 ----------
  function colLetter(n) {
    let s = "";
    n += 1;
    while (n > 0) {
      const r = (n - 1) % 26;
      s = String.fromCharCode(65 + r) + s;
      n = Math.floor((n - 1) / 26);
    }
    return s;
  }

  function xmlEscape(s) {
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&apos;");
  }

  function sheetNameSafe(name, idx) {
    let n = String(name || "Sheet" + (idx + 1));
    n = n.replace(/[\\/?*\[\]:]/g, " ").slice(0, 31).trim();
    if (!n) n = "Sheet" + (idx + 1);
    return n;
  }

  // ---------- Sheet XML ----------
  function sheetXml(rows) {
    let body = "";
    for (let ri = 0; ri < rows.length; ri++) {
      const row = rows[ri] || [];
      let cells = "";
      for (let ci = 0; ci < row.length; ci++) {
        const ref = colLetter(ci) + (ri + 1);
        const val = row[ci];
        if (val === null || val === undefined || val === "") {
          cells += '<c r="' + ref + '"/>';
        } else if (typeof val === "number" && isFinite(val)) {
          cells += '<c r="' + ref + '"><v>' + val + "</v></c>";
        } else {
          cells +=
            '<c r="' + ref + '" t="inlineStr"><is><t xml:space="preserve">' +
            xmlEscape(val) +
            "</t></is></c>";
        }
      }
      body += '<row r="' + (ri + 1) + '">' + cells + "</row>";
    }
    return (
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
      "<sheetData>" + body + "</sheetData></worksheet>"
    );
  }

  // ---------- 组装 ZIP (store, 无压缩) ----------
  function buildZip(files) {
    const parts = [];
    const central = [];
    let offset = 0;

    for (const f of files) {
      const nameBytes = enc.encode(f.name);
      const data = f.data;
      const local = new Uint8Array(30 + nameBytes.length + data.length);
      const dv = new DataView(local.buffer);
      dv.setUint32(0, 0x04034b50, true);
      dv.setUint16(4, 20, true);
      dv.setUint16(6, 0x0800, true); // UTF-8 文件名
      dv.setUint16(8, 0, true); // store
      dv.setUint16(10, 0, true); // time
      dv.setUint16(12, 0x21, true); // date 1980-01-01
      dv.setUint32(14, crc32(data), true);
      dv.setUint32(18, data.length, true);
      dv.setUint32(22, data.length, true);
      dv.setUint16(26, nameBytes.length, true);
      dv.setUint16(28, 0, true);
      local.set(nameBytes, 30);
      local.set(data, 30 + nameBytes.length);
      parts.push(local);

      const cd = new Uint8Array(46 + nameBytes.length);
      const cdv = new DataView(cd.buffer);
      cdv.setUint32(0, 0x02014b50, true);
      cdv.setUint16(4, 20, true);
      cdv.setUint16(6, 20, true);
      cdv.setUint16(8, 0x0800, true);
      cdv.setUint16(10, 0, true);
      cdv.setUint16(12, 0x21, true);
      cdv.setUint32(16, crc32(data), true);
      cdv.setUint32(20, data.length, true);
      cdv.setUint32(24, data.length, true);
      cdv.setUint16(28, nameBytes.length, true); // file name length (offset 28)
      cdv.setUint16(30, 0, true);                    // extra field length
      cdv.setUint16(32, 0, true);                    // file comment length
      cdv.setUint16(34, 0, true);                    // disk number start
      cdv.setUint16(36, 0, true);                    // internal file attributes
      cdv.setUint32(38, 0, true);                    // external file attributes
      cdv.setUint32(42, offset, true);               // relative offset of local header
      cd.set(nameBytes, 46);
      central.push(cd);

      offset += local.length;
    }

    const centralSize = central.reduce((s, c) => s + c.length, 0);
    const eocd = new Uint8Array(22);
    const edv = new DataView(eocd.buffer);
    edv.setUint32(0, 0x06054b50, true);
    edv.setUint16(4, 0, true);
    edv.setUint16(6, 0, true);
    edv.setUint16(8, central.length, true);
    edv.setUint16(10, central.length, true);
    edv.setUint32(12, centralSize, true);
    edv.setUint32(16, offset, true);
    edv.setUint16(20, 0, true);

    const out = new Uint8Array(offset + centralSize + 22);
    let pos = 0;
    for (const p of parts) { out.set(p, pos); pos += p.length; }
    for (const c of central) { out.set(c, pos); pos += c.length; }
    out.set(eocd, pos);
    return out;
  }

  // ---------- 生成 XLSX ----------
  function buildXlsx(sheets) {
    const names = [];
    const seen = {};
    sheets.forEach((s, i) => {
      let nm = sheetNameSafe(s.name, i);
      let base = nm;
      let k = 1;
      while (seen[nm]) nm = base.slice(0, 28) + (k++);
      seen[nm] = true;
      names.push(nm);
    });

    const fileList = [];
    const sheetXmls = [];

    sheets.forEach((s, i) => {
      const xml = sheetXml(s.rows || []);
      sheetXmls.push(xml);
      fileList.push({ name: "xl/worksheets/sheet" + (i + 1) + ".xml", data: enc.encode(xml) });
    });

    // [Content_Types].xml
    let overrides =
      '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>';
    sheetXmls.forEach((_, i) => {
      overrides +=
        '<Override PartName="/xl/worksheets/sheet' +
        (i + 1) +
        '.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>';
    });
    overrides +=
      '<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>' +
      '<Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>';

    const contentTypes =
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
      '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
      '<Default Extension="xml" ContentType="application/xml"/>' +
      overrides +
      "</Types>";
    fileList.push({ name: "[Content_Types].xml", data: enc.encode(contentTypes) });

    // _rels/.rels
    const rootRels =
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>' +
      '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>' +
      '<Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/>' +
      "</Relationships>";
    fileList.push({ name: "_rels/.rels", data: enc.encode(rootRels) });

    // xl/workbook.xml
    let sheetTags = "";
    names.forEach((nm, i) => {
      sheetTags +=
        '<sheet name="' + xmlEscape(nm) + '" sheetId="' + (i + 1) + '" r:id="rId' + (i + 1) + '"/>';
    });
    const workbook =
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' +
      "<sheets>" + sheetTags + "</sheets></workbook>";
    fileList.push({ name: "xl/workbook.xml", data: enc.encode(workbook) });

    // xl/_rels/workbook.xml.rels
    let wbRels = "";
    sheetXmls.forEach((_, i) => {
      wbRels +=
        '<Relationship Id="rId' +
        (i + 1) +
        '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet' +
        (i + 1) +
        '.xml"/>';
    });
    const workbookRels =
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      wbRels +
      "</Relationships>";
    fileList.push({ name: "xl/_rels/workbook.xml.rels", data: enc.encode(workbookRels) });

    // docProps
    const now = new Date().toISOString();
    const core =
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">' +
      "<dc:title>搬家物品清单</dc:title>" +
      "<dcterms:created xsi:type=\"dcterms:W3CDTF\">" + now + "</dcterms:created>" +
      "<dcterms:modified xsi:type=\"dcterms:W3CDTF\">" + now + "</dcterms:modified>" +
      "</cp:coreProperties>";
    fileList.push({ name: "docProps/core.xml", data: enc.encode(core) });

    const app =
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties">' +
      "<Application>搬家物品管家</Application></Properties>";
    fileList.push({ name: "docProps/app.xml", data: enc.encode(app) });

    return buildZip(fileList);
  }

  global.buildXlsx = buildXlsx;
  if (typeof module !== "undefined" && module.exports) module.exports = { buildXlsx };
})(typeof window !== "undefined" ? window : globalThis);
