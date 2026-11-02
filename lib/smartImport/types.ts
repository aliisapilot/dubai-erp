/**
 * Dubai ERP: Smart Import, Auto-Creation & Import Preview System
 * Type Definitions
 */

export type SupportedFileType = "docx" | "doc" | "xlsx" | "xls" | "csv" | "pdf" | "zip";

export type DocumentType =
  | "quotation"
  | "proforma_invoice"
  | "tax_invoice"
  | "delivery_note"
  | "receipt_voucher"
  | "purchase_order"
  | "supplier_bill"
  | "supplier_payment"
  | "expense"
  | "petty_cash"
  | "cheque"
  | "measurement_project"
  | "attendance"
  | "overtime"
  | "customer_list"
  | "supplier_list"
  | "product_list"
  | "unknown";

export interface SourceLocation {
  file: string;
  sheet?: string;
  cell?: string;
  page?: number;
  table?: number;
  row?: number;
  col?: number;
  paragraph?: number;
  rawText?: string;
}

export interface ExtractedField {
  fieldKey: string;
  label: string;
  value: string | number | boolean | null;
  source: SourceLocation;
  confidence: number;
  validationStatus: "valid" | "warning" | "error" | "unresolved";
  message?: string;
  originalRawValue?: string;
}

export interface ExtractedLineItem {
  id: string;
  itemNumber?: number;
  description: string;
  quantity: number;
  unit: string;
  unitPrice: number;
  discount: number;
  vatRate: number;
  vatAmount: number;
  total: number;
  taxableAmount?: number;
  source: SourceLocation;
  calculatedTotal: number;
  difference: number;
  calculationStatus: "match" | "mismatch" | "warning";
}

export interface ExtractedMeasurement {
  projectName?: string;
  shape?: "rectangle" | "cylinder" | "custom";
  length?: number;
  width?: number;
  height?: number;
  diameter?: number;
  radius?: number;
  area?: number;
  runningMeter?: number;
  fabricWidth?: number;
  weldingAllowance?: number;
  wastagePercent?: number;
  calculatedArea?: number;
  calculatedRunningMeter?: number;
  source: SourceLocation;
  items?: {
    tag?: string;
    description: string;
    dimensions: string;
    qty: number;
    sqm: number;
    rm: number;
  }[];
}

export interface EntityMatchCandidate {
  id: string;
  name: string;
  trn?: string;
  similarity: number;
}

export interface EntityMatchResult {
  action: "create_new" | "reuse_existing" | "needs_review" | "skip";
  targetModule: string;
  targetTable: string;
  extractedName: string;
  extractedTrn?: string;
  extractedEmail?: string;
  extractedPhone?: string;
  matchedId?: string;
  matchedName?: string;
  matchConfidence: number;
  matchReason?: string;
  candidateMatches?: EntityMatchCandidate[];
}

export interface DestinationMapping {
  sourceFilename: string;
  sourceLocation: string;
  extractedValue: string | number | null;
  documentType: DocumentType;
  erpModule: string;
  destinationTable: string;
  destinationField: string;
  existingRecordMatch?: string;
  proposedAction: "create_new" | "reuse_existing" | "skip" | "needs_review";
  validationStatus: "valid" | "warning" | "error";
  confidence: number;
  editableValue: string | number;
}

export interface StatusResolution {
  rawEvidence: string | null;           // What was extracted from document (e.g. "Accepted by client", "Paid in full", "None detected")
  proposedStatus: string;               // Database canonical status (e.g. "draft" | "accepted" | "Planning")
  isAssumed: boolean;                   // true if neutral default assumption, false if verified by evidence
  mappingReason: string;                // Audit explanation for the status mapping
  userOverridden?: boolean;             // true if modified during Import Preview
  projectStatusResolution?: {
    rawEvidence: string | null;
    proposedStatus: string;
    isAssumed: boolean;
    mappingReason: string;
    userOverridden?: boolean;
  };
}

export interface ParsedDocument {
  id: string;
  filename: string;
  fileSize: number;
  fileType: SupportedFileType;
  checksumSha256: string;
  documentType: DocumentType;
  classificationConfidence: number;
  classificationReason: string;
  fields: Record<string, ExtractedField>;
  items: ExtractedLineItem[];
  measurements?: ExtractedMeasurement;
  customerResolution?: EntityMatchResult;
  supplierResolution?: EntityMatchResult;
  projectResolution?: EntityMatchResult;
  statusResolution?: StatusResolution;
  destinationMappings: DestinationMapping[];
  validationErrors: string[];
  validationWarnings: string[];
  isDuplicate: boolean;
  duplicateReason?: string;
  extractionStatus?: "success" | "failed";
  extractionError?: string;
  rawContentSummary: {
    sheetsCount?: number;
    tablesCount?: number;
    pagesCount?: number;
    rawSnippets: { location: string; text: string }[];
  };
}

export interface ImportBatchSummary {
  totalFiles: number;
  newCustomers: number;
  reusedCustomers: number;
  newSuppliers: number;
  reusedSuppliers: number;
  newProjects: number;
  reusedProjects: number;
  newQuotations: number;
  newInvoices: number;
  newPurchaseOrders: number;
  newExpenses: number;
  newMeasurements: number;
  totalLineItems: number;
  duplicatesSkipped: number;
  recordsRequiringReview: number;
  validationErrors: number;
}

export interface RelationshipTreeNode {
  id: string;
  type: "customer" | "supplier" | "project" | "document" | "item" | "measurement";
  label: string;
  details?: string;
  status: "new" | "matched" | "duplicate" | "needs_review" | "error";
  children?: RelationshipTreeNode[];
}

export interface CalculationAuditRow {
  documentId: string;
  documentNumber: string;
  description: string;
  quantity: number;
  rate: number;
  originalDocumentValue: number;
  calculatedErpValue: number;
  difference: number;
  validationResult: "MATCH" | "MISMATCH" | "VERIFIED";
  field: string;
}

export interface ImportBatchRecord {
  id: string;
  batch_name: string;
  file_count: number;
  filenames: string[];
  status: "completed" | "rolled_back" | "failed";
  records_created: Record<string, number>;
  records_matched: Record<string, number>;
  summary: ImportBatchSummary;
  created_by?: string;
  checksum_sha256?: string;
  rolled_back?: boolean;
  rolled_back_at?: string;
  created_at: string;
}
