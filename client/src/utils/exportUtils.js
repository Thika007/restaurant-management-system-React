import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

const ensureExtension = (filename, extension) => {
  if (filename.toLowerCase().endsWith(`.${extension}`)) {
    return filename;
  }
  return `${filename}.${extension}`;
};

export const exportToExcel = ({ filename, sheetName = 'Sheet1', headers, rows }) => {
  if (!headers || headers.length === 0) {
    console.warn('exportToExcel: headers array is empty.');
    return;
  }

  const data = [headers, ...(rows || [])];
  const worksheet = XLSX.utils.aoa_to_sheet(data);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);
  XLSX.writeFile(workbook, ensureExtension(filename, 'xlsx'));
};

export const exportToPDF = ({ filename, title, headers, rows, orientation = 'landscape' }) => {
  if (!headers || headers.length === 0) {
    console.warn('exportToPDF: headers array is empty.');
    return;
  }

  const doc = new jsPDF({ orientation });
  const finalTitle = title || filename;

  doc.setFontSize(14);
  doc.text(finalTitle, 14, 16);

  autoTable(doc, {
    head: [headers],
    body: rows || [],
    startY: 22,
    styles: {
      fontSize: 10,
      cellPadding: 3
    },
    headStyles: {
      fillColor: [33, 37, 41]
    }
  });

  doc.save(ensureExtension(filename, 'pdf'));
};



