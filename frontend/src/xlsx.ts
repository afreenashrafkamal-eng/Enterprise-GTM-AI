import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";

function xmlEscape(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function columnName(index: number): string {
  let value = index + 1;
  let name = "";
  while (value > 0) {
    const remainder = (value - 1) % 26;
    name = String.fromCharCode(65 + remainder) + name;
    value = Math.floor((value - 1) / 26);
  }
  return name;
}

function columnIndex(reference: string): number {
  const letters = reference.match(/^[A-Z]+/i)?.[0]?.toUpperCase() ?? "A";
  return [...letters].reduce((value, letter) => value * 26 + letter.charCodeAt(0) - 64, 0) - 1;
}

function descendants(element: Document | Element, localName: string): Element[] {
  return Array.from(element.getElementsByTagNameNS("*", localName));
}

function parseXml(xml: string): XMLDocument {
  const document = new DOMParser().parseFromString(xml, "application/xml");
  if (document.querySelector("parsererror")) throw new Error("This Excel workbook is not valid.");
  return document;
}

export function workbookToRows(data: ArrayBuffer): string[][] {
  const files = unzipSync(new Uint8Array(data));
  const workbook = files["xl/workbook.xml"];
  const relationships = files["xl/_rels/workbook.xml.rels"];
  if (!workbook || !relationships) throw new Error("Choose a valid .xlsx workbook.");

  const workbookXml = parseXml(strFromU8(workbook));
  const relationXml = parseXml(strFromU8(relationships));
  const firstSheet = descendants(workbookXml, "sheet")[0];
  if (!firstSheet) throw new Error("The Excel workbook has no worksheets.");
  const relationshipId = firstSheet.getAttributeNS("http://schemas.openxmlformats.org/officeDocument/2006/relationships", "id");
  const relation = descendants(relationXml, "Relationship").find((item) => item.getAttribute("Id") === relationshipId);
  const target = relation?.getAttribute("Target");
  if (!target) throw new Error("Could not read the first worksheet in this workbook.");
  const sheetPath = target.startsWith("/") ? target.slice(1) : `xl/${target.replace(/^\.\//, "")}`;
  const sheet = files[sheetPath];
  if (!sheet) throw new Error("Could not read the first worksheet in this workbook.");

  const sharedStrings = files["xl/sharedStrings.xml"]
    ? descendants(parseXml(strFromU8(files["xl/sharedStrings.xml"])), "si").map((item) =>
      descendants(item, "t").map((text) => text.textContent ?? "").join(""),
    )
    : [];
  const sheetXml = parseXml(strFromU8(sheet));
  return descendants(sheetXml, "row").map((rowElement) => {
    const row: string[] = [];
    for (const cell of descendants(rowElement, "c")) {
      const reference = cell.getAttribute("r") ?? "A1";
      const type = cell.getAttribute("t");
      let value = "";
      if (type === "inlineStr") {
        value = descendants(cell, "t").map((text) => text.textContent ?? "").join("");
      } else {
        const raw = descendants(cell, "v")[0]?.textContent ?? "";
        value = type === "s" ? sharedStrings[Number(raw)] ?? "" : raw;
      }
      row[columnIndex(reference)] = value;
    }
    return row.map((value) => value ?? "");
  }).filter((row) => row.some((value) => value.trim().length > 0));
}

export function createXlsx(rows: unknown[][], sheetName = "Target companies"): Blob {
  const sheetRows = rows.map((row, rowIndex) => {
    const cells = row.map((value, columnIndex) => {
      const text = value == null ? "" : String(value);
      if (!text) return "";
      const reference = `${columnName(columnIndex)}${rowIndex + 1}`;
      return `<c r="${reference}" t="inlineStr"><is><t xml:space="preserve">${xmlEscape(text)}</t></is></c>`;
    }).join("");
    return `<row r="${rowIndex + 1}">${cells}</row>`;
  }).join("");
  const safeSheetName = sheetName.replace(/[\\/*?:\[\]]/g, " ").slice(0, 31) || "Sheet1";
  const files = {
    "[Content_Types].xml": strToU8('<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>'),
    "_rels/.rels": strToU8('<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>'),
    "xl/workbook.xml": strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="${xmlEscape(safeSheetName)}" sheetId="1" r:id="rId1"/></sheets></workbook>`),
    "xl/_rels/workbook.xml.rels": strToU8('<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>'),
    "xl/worksheets/sheet1.xml": strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${sheetRows}</sheetData></worksheet>`),
  };
  return new Blob([zipSync(files)], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
}
