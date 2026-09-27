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

type DocumentRecord = Record<string, unknown>;

function text(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value : undefined;
}

export function unwrapCustomerRelation(value: unknown): CustomerRelation | undefined {
  const relation = Array.isArray(value) ? value[0] : value;
  return relation && typeof relation === "object" ? (relation as CustomerRelation) : undefined;
}

/**
 * Adapts Supabase's nested `customer:customers(*)` relationship to the flat
 * fields consumed by every printable customer document. Values saved directly
 * on a document win so historical contact/address snapshots are preserved.
 */
export function withCustomerDocumentDetails<T extends DocumentRecord>(record: T): T & {
  customer_name: string;
  customer_trn?: string;
  customer_address?: string;
  contact_person?: string;
  contact_number?: string;
  contact_email?: string;
} {
  const customer = unwrapCustomerRelation(record.customer);

  return {
    ...record,
    customer_name: text(record.customer_name) || text(customer?.name) || "",
    customer_trn: text(record.customer_trn) || text(customer?.trn),
    customer_address: text(record.customer_address) || text(customer?.address),
    contact_person: text(record.contact_person) || text(customer?.contact_person),
    contact_number:
      text(record.contact_number) ||
      text(record.contact_mobile) ||
      text(customer?.mobile) ||
      text(customer?.phone),
    contact_email: text(record.contact_email) || text(customer?.email),
  };
}
