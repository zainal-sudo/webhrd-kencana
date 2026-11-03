import ExcelJS from "exceljs";
import { saveAs } from "file-saver";

export interface MultiSheetExportColumn {
  header: string;
  key: string;
  width?: number;
  currency?: boolean;
  numFmt?: string;
  align?: "left" | "center" | "right";
  italic?: boolean;
  noWrap?: boolean;
}

export interface MultiSheetExportSheet {
  name: string;
  columns: MultiSheetExportColumn[];
  rows: any[];
  dataCount?: number;
  totalMergeThroughKey?: string;
}

export interface MultiSheetExportOptions {
  title: string;
  filenamePrefix: string;
  sheets: MultiSheetExportSheet[];
}

const sanitizeSheetName = (name: string): string => {
  const sanitized = name
    .trim()
    .replace(/[\\/*?[\]:]/g, "-")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 31)
    .replace(/^'+|'+$/g, "");

  return sanitized || "sheet";
};

const createUniqueSheetNames = (names: string[]): string[] => {
  const usedNames = new Set<string>();

  return names.map((name) => {
    const baseName = sanitizeSheetName(name);
    let sheetName = baseName;
    let sequence = 2;

    while (usedNames.has(sheetName.toLocaleLowerCase())) {
      const suffix = `-${sequence}`;
      sheetName = `${baseName.slice(0, 31 - suffix.length)}${suffix}`;
      sequence += 1;
    }

    usedNames.add(sheetName.toLocaleLowerCase());
    return sheetName;
  });
};

export const exportToMultiSheetExcel = async ({
  title,
  filenamePrefix,
  sheets,
}: MultiSheetExportOptions) => {
  if (sheets.length === 0) {
    throw new Error("Tidak ada sheet yang dapat diekspor.");
  }

  const workbook = new ExcelJS.Workbook();
  const sheetNames = createUniqueSheetNames(sheets.map((sheet) => sheet.name));

  const borderAll: Partial<ExcelJS.Borders> = {
    top: { style: "thin" },
    left: { style: "thin" },
    bottom: { style: "thin" },
    right: { style: "thin" },
  };
  const headerFill: ExcelJS.Fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FF2E7D32" },
  };
  const headerFont: Partial<ExcelJS.Font> = {
    bold: true,
    color: { argb: "FFFFFFFF" },
    size: 10,
  };

  sheets.forEach((sheet, index) => {
    const worksheet = workbook.addWorksheet(sheetNames[index]);
    worksheet.columns = sheet.columns.map((column) => {
      const longestText = column.noWrap
        ? sheet.rows.reduce(
            (length, item) => Math.max(length, String(item[column.key] ?? "").length),
            column.header.length
          )
        : 0;
      return {
        header: column.header,
        key: column.key,
        width: column.noWrap
          ? Math.min(255, Math.max(column.width ?? 18, Math.ceil(longestText * 1.2) + 4))
          : column.width ?? 18,
      };
    });

    worksheet.mergeCells(1, 1, 1, sheet.columns.length);
    worksheet.getCell("A1").value =
      `${title} (${sheet.dataCount ?? sheet.rows.length} data)`;
    worksheet.getCell("A1").font = { bold: true, size: 12 };
    worksheet.getCell("A1").alignment = { vertical: "middle" };
    worksheet.getRow(1).height = 22;

    const headerRow = worksheet.addRow(
      sheet.columns.map((column) => column.header)
    );
    headerRow.eachCell((cell) => {
      cell.font = headerFont;
      cell.fill = headerFill;
      cell.border = borderAll;
      cell.alignment = {
        vertical: "middle",
        horizontal: "center",
        wrapText: true,
      };
    });
    headerRow.height = 20;

    sheet.rows.forEach((item, rowIndex) => {
      const isTotalRow = !!sheet.totalMergeThroughKey && rowIndex === sheet.rows.length - 1;
      const rowData: Record<string, unknown> = {};
      sheet.columns.forEach((column) => {
        rowData[column.key] =
          item[column.key] ?? (column.currency ? 0 : "-");
      });

      const row = worksheet.addRow(rowData);
      // Border mengikuti seluruh kolom tabel, termasuk sel total yang kosong.
      sheet.columns.forEach((column, columnIndex) => {
        const cell = row.getCell(columnIndex + 1);
        cell.border = borderAll;
        cell.font = { size: 10, italic: column?.italic ?? false, bold: isTotalRow };
        if (column.noWrap) {
          cell.alignment = { wrapText: false, vertical: "middle" };
        }

        if (column.currency) {
          cell.numFmt = column.numFmt ?? '"Rp"* #,##0.00';
          cell.alignment = { horizontal: "right" };
        } else if (column?.numFmt) {
          cell.numFmt = column.numFmt;
          cell.alignment = { horizontal: column.align ?? "right" };
        } else if (column?.align) {
          cell.alignment = { horizontal: column.align };
        }
      });
      if (isTotalRow) {
        const lastColumn = sheet.columns.findIndex(
          (column) => column.key === sheet.totalMergeThroughKey
        ) + 1;
        if (lastColumn > 1) {
          worksheet.mergeCells(row.number, 1, row.number, lastColumn);
          const labelCell = row.getCell(1);
          labelCell.font = { size: 10, bold: true };
          labelCell.alignment = { vertical: "middle", horizontal: "center" };
        }
      }
      row.height = 16;
    });

    worksheet.views = [{ state: "frozen", ySplit: 2 }];
  });

  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });

  saveAs(
    blob,
    `${filenamePrefix}_${new Date().toISOString().slice(0, 10)}.xlsx`
  );
};
