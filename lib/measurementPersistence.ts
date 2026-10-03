import type { MeasurementRowInput, MeasurementSheet } from "./measurementTypes";
import { calculateMeasurementRow } from "./measurementCalculations";

type SaveClient = { rpc(name: string, args: Record<string, unknown>): PromiseLike<{data: {updated_at: string; row_count: number} | null; error: {message: string} | null}> };

export async function saveMeasurementRows(client: SaveClient, sheet: MeasurementSheet, rows: MeasurementRowInput[]): Promise<string> {
  if (sheet.company_id === "offline" || !sheet.updated_at) throw new Error("This sheet is not connected to saved database data. Export your entries before retrying the connection.");
  const payload = rows.map((row, index) => {
    const c = calculateMeasurementRow(row);
    return {...c, id: undefined, sheet_id: undefined, company_id: undefined, formula_text: c.formula_display, sort_order: index};
  });
  const {data,error} = await client.rpc("save_measurement_rows", {p_company_id:sheet.company_id,p_sheet_id:sheet.id,p_expected_updated_at:sheet.updated_at,p_rows:payload});
  if (error) throw new Error(error.message);
  if (!data?.updated_at || data.row_count !== rows.length) throw new Error("The database did not confirm every measurement row. Your entries have been kept.");
  return data.updated_at;
}
