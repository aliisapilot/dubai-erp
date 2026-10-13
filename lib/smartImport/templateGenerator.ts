/**
 * Dubai ERP: Smart Import - Excel Template Generator
 * Generates downloadable Excel import templates (.xlsx) with sample data,
 * headers, and field descriptions.
 */

import * as XLSX from "xlsx";

export type TemplateType =
  | "customers"
  | "suppliers"
  | "projects"
  | "products"
  | "quotations"
  | "invoices"
  | "expenses"
  | "attendance"
  | "overtime"
  | "measurements";

export interface TemplateDefinition {
  type: TemplateType;
  title: string;
  description: string;
  sheetName: string;
  headers: string[];
  sampleRows: (string | number)[][];
}

export const TEMPLATE_DEFINITIONS: Record<TemplateType, TemplateDefinition> = {
  customers: {
    type: "customers",
    title: "Customers Master Template",
    description: "Import customer accounts with TRN, contact details and payment terms",
    sheetName: "Customers",
    headers: ["Company Name*", "TRN (15 digits)", "Contact Person", "Email", "Phone", "Address", "City", "Payment Terms", "Credit Limit (AED)"],
    sampleRows: [
      ["Al Karwan Solution FZC", "100234567800003", "Ahmed Al Mansoori", "info@alkarwan.ae", "+971 4 234 5678", "Plot 12, Al Qusais Ind 2", "Dubai", "30 Days", 50000],
      ["Gulf Oasis Contracting LLC", "100345678900003", "Rashid Salem", "accounts@gulfoasis.ae", "+971 50 123 4567", "Business Bay Tower 4", "Dubai", "Immediate", 25000],
    ],
  },
  suppliers: {
    type: "suppliers",
    title: "Suppliers & Vendors Template",
    description: "Import vendor records with TRN, credit terms, and contacts",
    sheetName: "Suppliers",
    headers: ["Supplier Name*", "TRN", "Contact Person", "Email", "Phone", "Address", "City", "Payment Terms"],
    sampleRows: [
      ["Emirates PVC Raw Materials Trading", "100456789000003", "Sunil Sharma", "sales@emiratespvc.ae", "+971 4 888 1234", "JAFZA South", "Dubai", "45 Days"],
      ["Al Furjan Industrial Hardware", "100567890100003", "Kamal Uddin", "orders@alfurjan.ae", "+971 6 555 9876", "Sharjah Ind Area 10", "Sharjah", "Cash"],
    ],
  },
  projects: {
    type: "projects",
    title: "Projects & Sites Template",
    description: "Import project records with customer linking, location, and contract value",
    sheetName: "Projects",
    headers: ["Project Name*", "Customer Name*", "Location", "Main Contractor", "Contract Value (AED)", "Start Date", "Status"],
    sampleRows: [
      ["Water Tank PVC Liner - Plot 44", "Al Karwan Solution FZC", "Al Quoz Industrial 1", "Al Karwan Solution FZC", 85000, "2026-03-01", "In Progress"],
      ["Commercial Shade Fabric Replacement", "Gulf Oasis Contracting LLC", "Dubai Hills Estate", "Gulf Oasis Contracting LLC", 34500, "2026-03-15", "In Progress"],
    ],
  },
  products: {
    type: "products",
    title: "Products & Materials Template",
    description: "Import product catalog, SKU, units, rates, and stock",
    sheetName: "Products",
    headers: ["Product Name*", "SKU / Code", "Category", "Unit", "Selling Price (AED)", "Cost Price (AED)", "VAT Rate (%)", "Opening Stock"],
    sampleRows: [
      ["Heavy Duty PVC Liner Fabric 1000GSM", "PVC-1000G-3M", "Raw Material", "sqm", 45, 28, 5, 1200],
      ["High Frequency Welding Strip 40mm", "WELD-40MM", "Accessories", "rm", 8, 4.5, 5, 500],
      ["Brass Reinforced Eyelets 14mm", "EYELET-14MM", "Hardware", "Nos", 1.5, 0.6, 5, 5000],
    ],
  },
  quotations: {
    type: "quotations",
    title: "Historical Quotations Template",
    description: "Import quotations with customer, project, line items, and totals",
    sheetName: "Quotations",
    headers: ["Quotation Number*", "Date*", "Customer Name*", "Project Name", "Item Description*", "Qty*", "Unit*", "Rate (AED)*", "VAT (%)", "Status"],
    sampleRows: [
      ["QTN-145/26", "2026-03-12", "Al Karwan Solution FZC", "Water Tank PVC Liner - Plot 44", "Heavy Duty PVC Liner Fabrication & Installation", 1, "Lot", 28500, 5, "accepted"],
      ["QTN-145/26", "2026-03-12", "Al Karwan Solution FZC", "Water Tank PVC Liner - Plot 44", "Center Joint Welding & Edge Sealing", 140, "rm", 12, 5, "accepted"],
    ],
  },
  invoices: {
    type: "invoices",
    title: "Historical Tax Invoices Template",
    description: "Import tax invoices with TRN, customer reference, items, and payments",
    sheetName: "TaxInvoices",
    headers: ["Invoice Number*", "Invoice Date*", "Customer Name*", "Customer TRN", "Project Name", "Item Description*", "Qty*", "Rate*", "VAT (%)", "Payment Terms"],
    sampleRows: [
      ["INV-2026-089", "2026-03-20", "Al Karwan Solution FZC", "100234567800003", "Water Tank PVC Liner - Plot 44", "PVC Membrane Installation - Final Stage", 1, 30114, 5, "30 Days"],
    ],
  },
  expenses: {
    type: "expenses",
    title: "Operating Expenses Template",
    description: "Import business expenses, fuel, utilities, site consumables, and petty cash",
    sheetName: "Expenses",
    headers: ["Expense Date*", "Category*", "Description*", "Amount (AED)*", "VAT (AED)", "Payment Method*", "Project Name", "Receipt Ref"],
    sampleRows: [
      ["2026-03-10", "Site Consumables & Minor Tools", "Welding rods, heat tape and solvent cleaner", 450, 22.5, "Cash", "Water Tank PVC Liner - Plot 44", "RCPT-9821"],
      ["2026-03-12", "Fuel, Transport & Salik", "Site delivery truck fuel - Al Quoz", 280, 0, "Cash", "", "FUEL-11234"],
    ],
  },
  attendance: {
    type: "attendance",
    title: "Employee Attendance Template",
    description: "Import attendance matching permanent employees EMP-01 through EMP-10",
    sheetName: "Attendance",
    headers: ["Employee Code*", "Employee Name", "Date (YYYY-MM-DD)*", "Check In", "Check Out", "Regular Hours", "Status*", "Remarks"],
    sampleRows: [
      ["EMP-01", "Rahmat Ali Khan", "2026-10-01", "08:00", "17:00", 8, "present", "On time"],
      ["EMP-02", "Imran Khan", "2026-10-01", "08:00", "17:00", 8, "present", "On time"],
      ["EMP-03", "Mohammed Nawaz", "2026-10-01", "08:00", "17:00", 8, "present", "Factory helper"],
      ["EMP-04", "Muslim Ali", "2026-10-01", "08:00", "17:00", 8, "present", "Factory helper"],
      ["EMP-05", "Aslam Alam Ansari", "2026-10-01", "08:00", "17:00", 8, "present", "Welding line"],
      ["EMP-06", "Iftikhar Ahmed", "2026-10-01", "08:00", "17:00", 8, "present", "Tailor section"],
      ["EMP-07", "Siraj Ahmed", "2026-10-01", "08:00", "17:00", 8, "present", "Factory helper"],
      ["EMP-08", "Mohammed Osim Ansari", "2026-10-01", "08:00", "17:00", 8, "present", "Tailor section"],
      ["EMP-09", "Kalamudin Ansari", "2026-10-01", "08:00", "17:00", 8, "present", "Tailor section"],
      ["EMP-10", "Eliyas Ansari", "2026-10-01", "08:00", "17:00", 8, "present", "Tailor section"],
    ],
  },
  overtime: {
    type: "overtime",
    title: "Employee Overtime Template",
    description: "Import approved overtime hours for permanent employees EMP-01 through EMP-10",
    sheetName: "Overtime",
    headers: ["Employee Code*", "Employee Name", "Overtime Date (YYYY-MM-DD)*", "OT Hours*", "Approval Status*"],
    sampleRows: [
      ["EMP-01", "Rahmat Ali Khan", "2026-10-01", 2.5, "approved"],
      ["EMP-02", "Imran Khan", "2026-10-01", 2.0, "approved"],
      ["EMP-05", "Aslam Alam Ansari", "2026-10-01", 3.0, "approved"],
    ],
  },
  measurements: {
    type: "measurements",
    title: "PVC Tank Liner Measurements Template",
    description: "Import tank dimensions, running meter, and square meter formulas",
    sheetName: "Measurements",
    headers: ["Project Name*", "Customer Name*", "Tank Diameter (m)*", "Tank Height (m)*", "Fabric Width (m)", "Welding Size (mm)", "Seams Count", "Total Area (m²)", "Running Meters"],
    sampleRows: [
      ["Water Tank PVC Liner - Plot 44", "Al Karwan Solution FZC", 7.39, 6.65, 3.0, 40, 3, 297.4, 99.1],
      ["Underground Reservoir Liner", "Gulf Oasis Contracting LLC", 12.5, 4.2, 3.0, 40, 5, 287.6, 95.8],
    ],
  },
};

export function generateTemplateWorkbook(type: TemplateType): Buffer {
  const def = TEMPLATE_DEFINITIONS[type];
  if (!def) throw new Error(`Unknown template type: ${type}`);

  const wb = XLSX.utils.book_new();
  const wsData = [def.headers, ...def.sampleRows];
  const ws = XLSX.utils.aoa_to_sheet(wsData);

  // Set column widths
  ws["!cols"] = def.headers.map(h => ({ wch: Math.max(h.length + 4, 15) }));

  XLSX.utils.book_append_sheet(wb, ws, def.sheetName);
  return XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
}
