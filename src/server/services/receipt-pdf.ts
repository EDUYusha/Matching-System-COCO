import PDFDocument from 'pdfkit';
import { AN, lDate, numberToYen } from '@/lib';

/**
 * Replacement for the prawn-rails receipt template (FinancialController#show_receipt).
 *
 * A charge can be split across several named recipients — the original divided the
 * amount by the person count, rounding *up* — so one conversion can produce
 * several receipts in one PDF.
 */

export interface ReceiptData {
  conversionId: number;
  createdAt: Date;
  /** per-person amount in yen, already divided */
  amount: number;
  names: string[];
  company: {
    name: string | null;
    zipCode: string | null;
    address: string | null;
    building: string | null;
    phone: string | null;
    personInCharge: string | null;
  } | null;
}

export function buildReceiptPdf(data: ReceiptData): PDFKit.PDFDocument {
  const doc = new PDFDocument({ size: 'A4', margin: 50 });

  data.names.forEach((name, index) => {
    if (index > 0) doc.addPage();

    doc.fontSize(22).text('領収書', { align: 'center' });
    doc.moveDown(1.5);

    doc.fontSize(11).text(`発行日: ${lDate(data.createdAt)}`, { align: 'right' });
    doc.text(`No. ${data.conversionId}`, { align: 'right' });
    doc.moveDown(1.5);

    doc.fontSize(14).text(`${name || ''}　様`);
    doc.moveDown(1);

    doc.fontSize(20).text(`金額　${numberToYen(data.amount)}`);
    doc.moveDown(0.5);
    doc.fontSize(11).text('但し、ポイント購入代として上記正に領収いたしました。');
    doc.moveDown(2);

    const company = data.company;
    doc.fontSize(11).text(company?.name ?? AN.Company, { align: 'right' });
    if (company?.zipCode) doc.text(`〒${company.zipCode}`, { align: 'right' });
    doc.text(company?.address ?? AN.Address, { align: 'right' });
    if (company?.building) doc.text(company.building, { align: 'right' });
    if (company?.phone) doc.text(`TEL: ${company.phone}`, { align: 'right' });
    doc.text(company?.personInCharge ?? AN.PersonInCharge, { align: 'right' });
  });

  doc.end();
  return doc;
}
