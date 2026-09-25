/**
 * Wait for document assets and layout to settle before opening the browser's
 * print dialog. This prevents intermittent missing logos, stamps, signatures,
 * footer graphics, and stale page geometry in saved PDFs.
 */
export async function printCurrentDocument(): Promise<void> {
  if (typeof window === "undefined") return;

  const isModuleReport =
    !document.querySelector(".print-document, .dynamic-document-page") &&
    Boolean(document.querySelector("[data-print-root]"));
  const markedCells: HTMLElement[] = [];

  if (isModuleReport) {
    document.body.classList.add("module-printing");

    document.querySelectorAll<HTMLTableElement>("[data-print-root] table").forEach((table) => {
      const headers = Array.from(table.querySelectorAll<HTMLTableCellElement>("thead th"));
      const actionIndexes = headers
        .map((header, index) => ({ index, label: header.textContent?.trim().toLowerCase() }))
        .filter(({ label }) => label === "action" || label === "actions")
        .map(({ index }) => index);

      actionIndexes.forEach((index) => {
        table.querySelectorAll<HTMLTableRowElement>("tr").forEach((row) => {
          const cell = row.children.item(index);
          if (cell instanceof HTMLElement) {
            cell.classList.add("print-action-column");
            markedCells.push(cell);
          }
        });
      });
    });
  }

  const images = Array.from(
    document.querySelectorAll<HTMLImageElement>(
      ".print-document img, .dynamic-document-page img, [data-print-root] img"
    )
  );

  await Promise.all(
    images.map(async (image) => {
      if (image.complete) {
        try {
          await image.decode();
        } catch {
          // A broken optional image must not block the rest of the document.
        }
        return;
      }

      await new Promise<void>((resolve) => {
        image.addEventListener("load", () => resolve(), { once: true });
        image.addEventListener("error", () => resolve(), { once: true });
      });
    })
  );

  if (document.fonts?.ready) {
    await document.fonts.ready;
  }

  await new Promise<void>((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
  });

  const cleanup = () => {
    document.body.classList.remove("module-printing");
    markedCells.forEach((cell) => cell.classList.remove("print-action-column"));
  };

  window.addEventListener("afterprint", cleanup, { once: true });
  window.print();

  // Some browsers do not dispatch afterprint when the dialog is cancelled.
  window.setTimeout(cleanup, 1_000);
}
