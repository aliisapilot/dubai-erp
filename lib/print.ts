import { waitForDocumentImages } from "./printAssets";

/**
 * Wait for document assets and layout to settle before opening the browser's
 * print dialog. This prevents intermittent missing logos, stamps, signatures,
 * footer graphics, and stale page geometry in saved PDFs.
 */
export async function printCurrentDocument(): Promise<void> {
  if (typeof window === "undefined") return;

  const scope = document.querySelector('.print-modal-container, .mobile-pdf-modal') || document;
  if (scope.querySelector('[data-design-print-blocked]')) {
    window.alert('Wait for the saved cloud design to load successfully before exporting this PDF.'); return;
  }
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

  // Wait only for the selected document, not unrelated screen/sidebar images.
  const sheets = Array.from(scope.querySelectorAll<HTMLElement>('.print-document, .dynamic-document-page'));
  const roots = sheets.length ? sheets : Array.from(scope.querySelectorAll<HTMLElement>('[data-print-root]'));
  const images = [...new Set(roots.flatMap(root => Array.from(root.querySelectorAll<HTMLImageElement>('img'))))];
  const cleanup = () => {
    document.body.classList.remove("module-printing");
    markedCells.forEach(cell => cell.classList.remove("print-action-column"));
  };
  try {
    await waitForDocumentImages(images);

    if (document.fonts?.ready) {
      await document.fonts.ready;
    }

    await new Promise<void>((resolve) => {
      requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
    });

    window.addEventListener("afterprint", cleanup, { once: true });
    window.print();

    // Some browsers do not dispatch afterprint when the dialog is cancelled.
    window.setTimeout(cleanup, 1_000);
  } catch (error) {
    cleanup();
    window.alert(error instanceof Error ? error.message : 'Could not prepare this document for printing. Try again.');
  }
}
