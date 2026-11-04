import ExcelJS from "exceljs";
import { saveAs } from "file-saver";

// ── Style constants ────────────────────────────────────────────────────
const BORDER_ALL: Partial<ExcelJS.Borders> = {
  top: { style: "thin" },
  left: { style: "thin" },
  bottom: { style: "thin" },
  right: { style: "thin" },
};

const HEADER_FILL: ExcelJS.Fill = {
  type: "pattern",
  pattern: "solid",
  fgColor: { argb: "FF2E7D32" },
};

const HEADER_FONT: Partial<ExcelJS.Font> = {
  bold: true,
  color: { argb: "FFFFFFFF" },
  size: 10,
};

const NORMAL_FONT: Partial<ExcelJS.Font> = { size: 10 };

// ── Types ──────────────────────────────────────────────────────────────

export interface ExportColumn {
  /** Key in the data object */
  key: string;
  /** Display title for Excel header */
  title: string;
  /** Column width (auto-calculated if not provided) */
  width?: number;
  /** Text alignment */
  align?: "left" | "center" | "right";
  /** Number format string (e.g. "#,##0", "#,##0.00") */
  numFmt?: string;
}

interface StyledExportOptions {
  /** Title row at the top of the sheet */
  title: string;
  /** Subtitle (e.g. periode) */
  subtitle?: string;
  /** Column definitions */
  columns: ExportColumn[];
  /** Data rows */
  items: Record<string, any>[];
  /** File name without .xlsx extension */
  fileName: string;
  /** Number of header columns to show (for detail mode, to style header columns differently) */
  headerColCount?: number;
  /** Alternating row fill */
  altRowFill?: ExcelJS.Fill;
}

// ── Helpers ────────────────────────────────────────────────────────────

function calcAutoWidth(key: string, items: Record<string, any>[], titleLen: number): number {
  let maxLen = titleLen;
  for (const item of items) {
    const val = item[key];
    const len = String(val ?? "").length;
    if (len > maxLen) maxLen = len;
  }
  // Clamp between 8 and 40
  return Math.min(40, Math.max(8, maxLen + 2));
}

function setHeaderCell(cell: ExcelJS.Cell, value: string) {
  cell.value = value;
  cell.font = HEADER_FONT;
  cell.fill = HEADER_FILL;
  cell.border = BORDER_ALL;
  cell.alignment = {
    vertical: "middle",
    horizontal: "center",
    wrapText: true,
  };
}

function setCell(
  cell: ExcelJS.Cell,
  value: any,
  align: "left" | "center" | "right" = "left",
  numFmt?: string,
) {
  cell.value = value;
  cell.font = NORMAL_FONT;
  cell.border = BORDER_ALL;
  cell.alignment = { vertical: "middle", horizontal: align };
  if (numFmt) {
    cell.numFmt = numFmt;
    cell.alignment = { vertical: "middle", horizontal: "right" };
  }
}

function applyAltRow(row: ExcelJS.Row, fill: ExcelJS.Fill) {
  row.eachCell({ includeEmpty: true }, (cell) => {
    cell.fill = fill;
  });
}

// ── Main export functions ──────────────────────────────────────────────

/**
 * Export header-only (browse table data) with styling
 */
export async function exportStyledHeader(options: StyledExportOptions) {
  const { title, subtitle, columns, items, fileName } = options;

  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Header");

  const lastCol = String.fromCharCode(64 + columns.length);
  const today = new Date();
  const tglStr = `${String(today.getDate()).padStart(2, "0")}/${String(today.getMonth() + 1).padStart(2, "0")}/${today.getFullYear()}`;

  // Title row
  ws.mergeCells(`A1:${lastCol}1`);
  ws.getCell("A1").value = title;
  ws.getCell("A1").font = { bold: true, size: 12 };

  // Subtitle row
  ws.mergeCells(`A2:${lastCol}2`);
  ws.getCell("A2").value = subtitle || `Tanggal : ${tglStr}`;
  ws.getCell("A2").font = { size: 10 };

  // Empty row
  ws.addRow([]);

  // Header row
  const hRow = ws.addRow(columns.map((c) => c.title));
  hRow.eachCell((cell, colNumber) => {
    setHeaderCell(cell, columns[colNumber - 1].title);
  });
  hRow.height = 20;

  // Data rows
  const altRowFill: ExcelJS.Fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FFF5F5F5" },
  };

  for (const item of items) {
    const row = ws.addRow([]);
    columns.forEach((col, i) => {
      const cell = row.getCell(i + 1);
      const val = item[col.key];
      const align = col.align || (col.numFmt ? "right" : "left");
      setCell(cell, val, align, col.numFmt);
    });
    row.height = 16;
  }

  // Auto-fit column widths
  columns.forEach((col, i) => {
    if (col.width) {
      ws.getColumn(i + 1).width = col.width;
    } else {
      ws.getColumn(i + 1).width = calcAutoWidth(col.key, items, col.title.length);
    }
  });

  // Save
  const buf = await wb.xlsx.writeBuffer();
  const tglFile = today.toISOString().slice(0, 10);
  saveAs(new Blob([buf]), `${fileName}_${tglFile}.xlsx`);
}

/**
 * Export detail (header + detail merged in flat sheet) with styling
 * Each detail row includes the header key columns repeated.
 */
export async function exportStyledDetail(options: {
  /** Title row */
  title: string;
  /** Subtitle */
  subtitle?: string;
  /** Header column definitions (left side) */
  headerColumns: ExportColumn[];
  /** Detail column definitions (right side) */
  detailColumns: ExportColumn[];
  /** The key field linking header to detail */
  detailKeyField: string;
  /** Header items (all browse rows) */
  headerItems: Record<string, any>[];
  /** Detail map: key -> detail rows[] */
  detailMap: Record<string, Record<string, any>[]>;
  /** File name without .xlsx */
  fileName: string;
}) {
  const {
    title,
    subtitle,
    headerColumns,
    detailColumns,
    detailKeyField,
    headerItems,
    detailMap,
    fileName,
  } = options;

  const allColumns = [...headerColumns, ...detailColumns];
  const totalCols = allColumns.length;
  const lastCol = String.fromCharCode(64 + totalCols);

  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Detail");

  const today = new Date();
  const tglStr = `${String(today.getDate()).padStart(2, "0")}/${String(today.getMonth() + 1).padStart(2, "0")}/${today.getFullYear()}`;

  // Title row
  ws.mergeCells(`A1:${lastCol}1`);
  ws.getCell("A1").value = title;
  ws.getCell("A1").font = { bold: true, size: 12 };

  // Subtitle row
  ws.mergeCells(`A2:${lastCol}2`);
  ws.getCell("A2").value = subtitle || `Tanggal : ${tglStr}`;
  ws.getCell("A2").font = { size: 10 };

  ws.addRow([]);

  // Header row
  const hRow = ws.addRow(allColumns.map((c) => c.title));
  hRow.eachCell((cell, colNumber) => {
    setHeaderCell(cell, allColumns[colNumber - 1].title);
  });
  hRow.height = 20;

  // Style: header columns (left side) get a light green background
  const headerColFill: ExcelJS.Fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FFE8F5E9" },
  };
  const altRowFill: ExcelJS.Fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FFF5F5F5" },
  };

  // Data rows: header + detail merged flat
  let lastKey = "";
  for (const headerItem of headerItems) {
    const key = String(headerItem[detailKeyField] ?? "");
    const details = detailMap[key] || [];
    const rowCount = Math.max(details.length, 1);

    for (let i = 0; i < rowCount; i++) {
      const row = ws.addRow([]);
      const rowIdx = row.number;

      // Header columns (left side)
      headerColumns.forEach((col, ci) => {
        const cell = row.getCell(ci + 1);
        if (i === 0) {
          const val = headerItem[col.key];
          const align = col.align || (col.numFmt ? "right" : "left");
          setCell(cell, val, align, col.numFmt);
        } else {
          setCell(cell, "", "left");
        }
        // Light green background for header columns
        cell.fill = headerColFill;
      });

      // Detail columns (right side)
      detailColumns.forEach((col, di) => {
        const cell = row.getCell(headerColumns.length + di + 1);
        const d = details[i];
        const val = d ? d[col.key] : undefined;
        const align = col.align || (col.numFmt ? "right" : "left");
        setCell(cell, val ?? "", align, col.numFmt);
      });

      row.height = 16;
    }

    lastKey = key;
  }

  // Auto-fit column widths
  allColumns.forEach((col, i) => {
    if (col.width) {
      ws.getColumn(i + 1).width = col.width;
    } else {
      // Calculate width from both header and detail items
      let maxLen = col.title.length;
      for (const item of headerItems) {
        const val = String(item[col.key] ?? "");
        if (val.length > maxLen) maxLen = val.length;
      }
      ws.getColumn(i + 1).width = Math.min(40, Math.max(8, maxLen + 2));
    }
  });

  // Save
  const buf = await wb.xlsx.writeBuffer();
  const tglFile = today.toISOString().slice(0, 10);
  saveAs(new Blob([buf]), `${fileName}_Detail_${tglFile}.xlsx`);
}
