// Generic "export what I selected" endpoint.
//
// The rows arrive from the client because the client is the only place that
// knows WHICH rows the user ticked and in what order the table is currently
// sorted. There is no privilege question here: the caller is exporting rows the
// server already sent them for this screen, so this route re-checks that they
// are signed in and then formats — it never reads the database.
//
// exceljs stays on the server: it is ~900 kB and shipping it to the browser to
// build one spreadsheet would cost every list screen its first-load budget.

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import ExcelJS from "exceljs";
import { authOptions } from "@/lib/auth";

export const dynamic = "force-dynamic";

// Ceilings so a malformed or hostile payload cannot pin the Lambda building a
// workbook. 10k rows is far past any register a person exports by hand.
const MAX_ROWS = 10_000;
const MAX_COLUMNS = 60;
const MAX_CELL_CHARS = 2_000;

type ExportBody = {
  filename?: string;
  sheetName?: string;
  title?: string;
  columns?: string[];
  rows?: (string | number | null)[][];
};

/** Excel refuses these in a sheet name, and silently mangles over 31 chars. */
function safeSheetName(name: string) {
  const cleaned = name.replace(/[\\/*?:[\]]/g, " ").trim();
  return (cleaned || "Export").slice(0, 31);
}

function safeFilename(name: string) {
  const cleaned = name.replace(/[^A-Za-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "");
  return (cleaned || "export").slice(0, 80);
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!(session?.user as any)?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: ExportBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Malformed request body." }, { status: 400 });
  }

  const columns = Array.isArray(body.columns) ? body.columns : [];
  const rows = Array.isArray(body.rows) ? body.rows : [];

  if (!columns.length) {
    return NextResponse.json({ error: "No columns to export." }, { status: 400 });
  }
  if (!rows.length) {
    return NextResponse.json({ error: "No rows to export." }, { status: 400 });
  }
  if (columns.length > MAX_COLUMNS) {
    return NextResponse.json({ error: `Too many columns (max ${MAX_COLUMNS}).` }, { status: 400 });
  }
  if (rows.length > MAX_ROWS) {
    return NextResponse.json({ error: `Too many rows (max ${MAX_ROWS}).` }, { status: 400 });
  }

  const wb = new ExcelJS.Workbook();
  wb.creator = "SafeOps360";
  wb.created = new Date();

  const sheet = wb.addWorksheet(safeSheetName(body.sheetName ?? body.title ?? "Export"));

  // Row 1 is a human title + the export stamp, so a sheet that has been mailed
  // on still says what it is and when it was taken.
  if (body.title) {
    const titleRow = sheet.addRow([body.title]);
    titleRow.font = { bold: true, size: 13, color: { argb: "FF0B1F4D" } };
    sheet.mergeCells(titleRow.number, 1, titleRow.number, columns.length);

    const stampRow = sheet.addRow([
      `${rows.length} selected row${rows.length === 1 ? "" : "s"} · exported ${new Date().toLocaleString("en-IN")}`
    ]);
    stampRow.font = { size: 9, color: { argb: "FF64748B" } };
    sheet.mergeCells(stampRow.number, 1, stampRow.number, columns.length);

    sheet.addRow([]);
  }

  const headerRow = sheet.addRow(columns);
  headerRow.font = { bold: true, color: { argb: "FFFFFFFF" } };
  headerRow.alignment = { vertical: "middle" };
  headerRow.height = 20;
  headerRow.eachCell((cell) => {
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF0B1F4D" } };
    cell.border = { bottom: { style: "thin", color: { argb: "FFCBD5E1" } } };
  });

  for (const row of rows) {
    const values = columns.map((_, i) => {
      const cell = row?.[i];
      if (cell == null) return "";
      if (typeof cell === "number") return cell;
      return String(cell).slice(0, MAX_CELL_CHARS);
    });
    sheet.addRow(values);
  }

  // Width from the widest value in each column, clamped so one long description
  // does not push every other column off the screen.
  columns.forEach((header, i) => {
    let widest = String(header).length;
    for (const row of rows) {
      const cell = row?.[i];
      if (cell != null) widest = Math.max(widest, String(cell).length);
    }
    sheet.getColumn(i + 1).width = Math.min(Math.max(widest + 2, 10), 48);
  });

  sheet.views = [{ state: "frozen", ySplit: headerRow.number }];
  sheet.autoFilter = {
    from: { row: headerRow.number, column: 1 },
    to: { row: headerRow.number + rows.length, column: columns.length }
  };

  const buffer = await wb.xlsx.writeBuffer();
  const filename = `${safeFilename(body.filename ?? "export")}.xlsx`;

  return new NextResponse(buffer as ArrayBuffer, {
    status: 200,
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store"
    }
  });
}
