export type CustomerRelation = {
  id?: string | null;
  name?: string | null;
  customer_code?: string | null;
  trn?: string | null;
  address?: string | null;
  contact_person?: string | null;
  phone?: string | null;
  mobile?: string | null;
  email?: string | null;
  active?: boolean | null;
};

export type SupplierRelation = {
  id?: string | null;
  name?: string | null;
  supplier_code?: string | null;
  trn?: string | null;
  address?: string | null;
  contact_person?: string | null;
  phone?: string | null;
  mobile?: string | null;
  email?: string | null;
  active?: boolean | null;
};

export interface CustomPartyData {
  name: string;
  address?: string;
  contact_person?: string;
  phone?: string;
  email?: string;
  trn?: string;
  project_name?: string;
}

type DocumentRecord = Record<string, unknown>;

function text(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

export function unwrapCustomerRelation(value: unknown): CustomerRelation | undefined {
  const relation = Array.isArray(value) ? value[0] : value;
  return relation && typeof relation === "object" ? (relation as CustomerRelation) : undefined;
}

export function unwrapSupplierRelation(value: unknown): SupplierRelation | undefined {
  const relation = Array.isArray(value) ? value[0] : value;
  return relation && typeof relation === "object" ? (relation as SupplierRelation) : undefined;
}

export const CUSTOM_CUSTOMER_TAG = "<!--[CUSTOM_CUSTOMER:";
export const CUSTOM_SUPPLIER_TAG = "<!--[CUSTOM_SUPPLIER:";
export const TAG_END = "]-->";

/**
 * Extracts custom party metadata serialized inside notes for database schema resilience.
 */
export function parseCustomPartyFromNotes(
  notes: unknown,
  tag: "CUSTOM_CUSTOMER" | "CUSTOM_SUPPLIER" = "CUSTOM_CUSTOMER"
): CustomPartyData | null {
  if (typeof notes !== "string" || !notes) return null;
  const prefix = tag === "CUSTOM_SUPPLIER" ? CUSTOM_SUPPLIER_TAG : CUSTOM_CUSTOMER_TAG;
  const startIdx = notes.indexOf(prefix);
  if (startIdx === -1) {
    // Also check generic tag
    const genericPrefix = "<!--[CUSTOM_PARTY:";
    const gStart = notes.indexOf(genericPrefix);
    if (gStart === -1) return null;
    const end = notes.indexOf(TAG_END, gStart);
    if (end === -1) return null;
    try {
      const jsonStr = notes.slice(gStart + genericPrefix.length, end);
      return JSON.parse(jsonStr);
    } catch {
      return null;
    }
  }
  const endIdx = notes.indexOf(TAG_END, startIdx);
  if (endIdx === -1) return null;
  try {
    const jsonStr = notes.slice(startIdx + prefix.length, endIdx);
    return JSON.parse(jsonStr);
  } catch {
    return null;
  }
}

/**
 * Strips custom party metadata tags from notes, terms, or remarks for clean human-readable rendering.
 * Safely removes markers and serialized JSON while completely preserving genuine user content.
 */
export function stripCustomPartyTags(notes: unknown): string {
  if (typeof notes !== "string" || !notes) return "";
  let clean = notes;
  // 1. Standard HTML comment tags <!--[CUSTOM_CUSTOMER: ... ]--> or unclosed / variant endings
  clean = clean.replace(/<!--\s*\[?\s*CUSTOM_(?:CUSTOMER|SUPPLIER|PARTY):\s*[\s\S]*?(?:\]\s*-->|-->|$)/gi, "");
  // 2. Bracketed tags without HTML comment [CUSTOM_CUSTOMER: ... ]
  clean = clean.replace(/\[\s*CUSTOM_(?:CUSTOMER|SUPPLIER|PARTY):\s*[\s\S]*?(?:\]|$)/gi, "");
  // 3. Raw CUSTOM_CUSTOMER: { ... } or CUSTOM_SUPPLIER: { ... } if serialized JSON without comment wrappers
  clean = clean.replace(/CUSTOM_(?:CUSTOMER|SUPPLIER|PARTY):\s*\{[\s\S]*?\}/gi, "");
  // 4. Any leftover markers like <!--[CUSTOM_CUSTOMER: or [CUSTOM_CUSTOMER:
  clean = clean.replace(/<!--\s*\[?\s*CUSTOM_(?:CUSTOMER|SUPPLIER|PARTY):[^\n\r]*/gi, "");
  clean = clean.replace(/\[?\s*CUSTOM_(?:CUSTOMER|SUPPLIER|PARTY):[^\n\r]*/gi, "");
  return clean.trim();
}

/**
 * Embeds custom party metadata safely inside notes without altering visual text.
 */
export function serializeCustomPartyNotes(
  notes: string | null | undefined,
  tagOrData: "CUSTOM_CUSTOMER" | "CUSTOM_SUPPLIER" | CustomPartyData | null | undefined,
  maybeData?: CustomPartyData | null
): string {
  let tag: "CUSTOM_CUSTOMER" | "CUSTOM_SUPPLIER" = "CUSTOM_CUSTOMER";
  let data: CustomPartyData | null = null;

  if (typeof tagOrData === "string") {
    tag = tagOrData;
    data = maybeData || null;
  } else {
    data = (tagOrData as CustomPartyData | null) || null;
  }

  const clean = stripCustomPartyTags(notes);
  if (!data || !data.name?.trim()) return clean;
  const serialized = `${tag === "CUSTOM_SUPPLIER" ? CUSTOM_SUPPLIER_TAG : CUSTOM_CUSTOMER_TAG}${JSON.stringify(data)}${TAG_END}`;
  return clean ? `${clean}\n\n${serialized}` : serialized;
}

/**
 * Checks whether a document record represents a custom customer.
 */
export function isCustomCustomerRecord(record: DocumentRecord): boolean {
  if (record.is_custom_customer === true) return true;
  if (!record.customer_id && Boolean(text(record.customer_name))) return true;
  if (parseCustomPartyFromNotes(record.notes, "CUSTOM_CUSTOMER")) return true;
  return false;
}

/**
 * Adapts Supabase's nested `customer:customers(*)` relationship to the flat
 * fields consumed by every printable customer document. Values saved directly
 * on a document win so historical contact/address snapshots are preserved.
 *
 * Supports direct columns, custom_customer JSONB, encoded notes fallback, and master DB customers.
 * Sanitizes internal party tags from notes, payment_terms, and terms_conditions.
 */
export function withCustomerDocumentDetails<T extends DocumentRecord>(record: T): T & {
  customer_name: string;
  customer_trn?: string;
  customer_address?: string;
  contact_person?: string;
  contact_number?: string;
  contact_email?: string;
  project_name?: string;
  is_custom_customer?: boolean;
} {
  const customer = unwrapCustomerRelation(record.customer);
  const customJson = record.custom_customer && typeof record.custom_customer === "object"
    ? (record.custom_customer as Record<string, unknown>)
    : null;
  const customNotes = parseCustomPartyFromNotes(record.notes, "CUSTOM_CUSTOMER");

  const name =
    text(record.customer_name) ||
    text(customJson?.name) ||
    text(customNotes?.name) ||
    text(customer?.name) ||
    "";

  const trn =
    text(record.customer_trn) ||
    text(customJson?.trn) ||
    text(customNotes?.trn) ||
    text(customer?.trn);

  const address =
    text(record.customer_address) ||
    text(customJson?.address) ||
    text(customNotes?.address) ||
    text(customer?.address);

  const contactPerson =
    text(record.contact_person) ||
    text(customJson?.contact_person) ||
    text(customNotes?.contact_person) ||
    text(customer?.contact_person);

  const contactNumber =
    text(record.contact_number) ||
    text(record.contact_mobile) ||
    text(customJson?.phone) ||
    text(customNotes?.phone) ||
    text(customer?.mobile) ||
    text(customer?.phone);

  const contactEmail =
    text(record.contact_email) ||
    text(customJson?.email) ||
    text(customNotes?.email) ||
    text(customer?.email);

  const projectName =
    text(record.project_name) ||
    text(record.custom_project_name) ||
    text(customJson?.project_name) ||
    text(customNotes?.project_name);

  const isCustom =
    Boolean(record.is_custom_customer) ||
    Boolean(customJson) ||
    Boolean(customNotes) ||
    (!record.customer_id && Boolean(name));

  const cleanNotes = stripCustomPartyTags(record.notes);
  const rawTerms =
    (record as { terms_conditions?: unknown }).terms_conditions ??
    (record as { payment_terms?: unknown }).payment_terms;
  const cleanTerms = stripCustomPartyTags(rawTerms);

  return {
    ...record,
    customer_name: name,
    customer_trn: trn,
    customer_address: address,
    contact_person: contactPerson,
    contact_number: contactNumber,
    contact_email: contactEmail,
    project_name: projectName,
    custom_project_name: projectName,
    is_custom_customer: isCustom,
    notes: cleanNotes || undefined,
    terms_conditions: cleanTerms || undefined,
    payment_terms: cleanTerms || undefined,
  };
}

/**
 * Adapts supplier relationship and document fields for Purchase Orders.
 */
export function withSupplierDocumentDetails<T extends DocumentRecord>(record: T): T & {
  supplier_name: string;
  supplier_trn?: string;
  supplier_address?: string;
  contact_person?: string;
  contact_number?: string;
  contact_email?: string;
  project_name?: string;
  is_custom_supplier?: boolean;
} {
  const supplier = unwrapSupplierRelation(record.supplier || record.suppliers);
  const customJson = record.custom_supplier && typeof record.custom_supplier === "object"
    ? (record.custom_supplier as Record<string, unknown>)
    : null;
  const customNotes = parseCustomPartyFromNotes(record.notes, "CUSTOM_SUPPLIER");

  const name =
    text(record.supplier_name) ||
    text(record.customer_name) ||
    text(customJson?.name) ||
    text(customNotes?.name) ||
    text(supplier?.name) ||
    "";

  const trn =
    text(record.supplier_trn) ||
    text(record.customer_trn) ||
    text(record.vendor_trn) ||
    text(customJson?.trn) ||
    text(customNotes?.trn) ||
    text(supplier?.trn);

  const address =
    text(record.supplier_address) ||
    text(record.customer_address) ||
    text(customJson?.address) ||
    text(customNotes?.address) ||
    text(supplier?.address);

  const contactPerson =
    text(record.contact_person) ||
    text(record.vendor_contact) ||
    text(customJson?.contact_person) ||
    text(customNotes?.contact_person) ||
    text(supplier?.contact_person);

  const contactNumber =
    text(record.contact_number) ||
    text(record.vendor_mobile) ||
    text(record.vendor_telephone) ||
    text(customJson?.phone) ||
    text(customNotes?.phone) ||
    text(supplier?.phone) ||
    text(supplier?.mobile);

  const contactEmail =
    text(record.contact_email) ||
    text(record.vendor_email) ||
    text(customJson?.email) ||
    text(customNotes?.email) ||
    text(supplier?.email);

  const projectName =
    text(record.project_name) ||
    text(record.custom_project_name) ||
    text(customJson?.project_name) ||
    text(customNotes?.project_name);

  const isCustom =
    Boolean(record.is_custom_supplier) ||
    Boolean(customJson) ||
    Boolean(customNotes) ||
    (!record.supplier_id && Boolean(name));

  const cleanNotes = stripCustomPartyTags(record.notes);
  const rawTerms =
    (record as { terms_conditions?: unknown }).terms_conditions ??
    (record as { payment_terms?: unknown }).payment_terms;
  const cleanTerms = stripCustomPartyTags(rawTerms);

  return {
    ...record,
    supplier_name: name,
    supplier_trn: trn,
    supplier_address: address,
    contact_person: contactPerson,
    contact_number: contactNumber,
    contact_email: contactEmail,
    project_name: projectName,
    custom_project_name: projectName,
    is_custom_supplier: isCustom,
    notes: cleanNotes || undefined,
    terms_conditions: cleanTerms || undefined,
    payment_terms: cleanTerms || undefined,
  };
}

export function formatDatabaseError(err: unknown): string {
  if (!err) return "An unknown error occurred while saving.";
  if (typeof err === "string" && err.trim()) return err.trim();
  if (err instanceof Error && err.message) return err.message;
  if (typeof err === "object") {
    const obj = err as Record<string, unknown>;
    const message = (obj.message || obj.error_description || obj.error || obj.details || obj.hint) as string | undefined;
    if (message) {
      const details = obj.details && obj.details !== message ? ` (${obj.details})` : "";
      const hint = obj.hint ? ` [Hint: ${obj.hint}]` : "";
      const code = obj.code ? ` [Code: ${obj.code}]` : "";
      return `${message}${details}${hint}${code}`;
    }
    try {
      return JSON.stringify(err);
    } catch {
      // fallback
    }
  }
  return String(err);
}
