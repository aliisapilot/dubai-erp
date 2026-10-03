import type { DocumentTypeId } from './documentDesigner';

/** Warm only the current screen's document, rather than downloading every design. */
export function documentTypeForPreviewPath(path: string): DocumentTypeId | undefined {
  const documents: Record<string, DocumentTypeId> = {
    '/tax-invoices': 'tax_invoice', '/quotations': 'quotation', '/proforma-invoices': 'proforma_invoice',
    '/delivery-notes': 'delivery_note', '/purchase-orders': 'purchase_order', '/supplier-bills': 'supplier_bill',
    '/receipt-vouchers': 'receipt_voucher', '/employee-payment-vouchers': 'employee_payment_voucher',
    '/payslips': 'salary_statement', '/salary-statements': 'salary_statement',
    '/customers/statements': 'customer_statement', '/reports/customer-statements': 'customer_statement',
    '/reports/supplier-statements': 'customer_statement', '/projects/handover': 'project_handover',
    '/projects/wms': 'work_method_statement', '/measurements': 'measurement_sheet',
  };
  return documents[path];
}
