import { waitForDocumentImages } from "./printAssets";

let printInProgress = false;

export interface PrintDocumentOptions {
  documentTitle?: string;
  documentFilename?: string;
}

/**
 * Wait for document assets and layout to settle before opening the browser's
 * print dialog. This prevents intermittent missing logos, stamps, signatures,
 * footer graphics, and stale page geometry in saved PDFs.
 *
 * Temporarily sets document.title during print so browser "Save as PDF"
 * defaults to the document-specific filename (e.g. "INV-117 - Al Fajar Al Mashreq"),
 * then cleanly restores the original page title on dialog dismissal.
 */
export async function printCurrentDocument(options?: PrintDocumentOptions): Promise<void> {
  if (typeof window === "undefined" || printInProgress) return;

  const scope = document.querySelector('.print-modal-container, .mobile-pdf-modal') || document;
  if (scope.querySelector('[data-design-print-blocked]')) {
    window.alert('Wait for the saved cloud design to load successfully before exporting this PDF.'); return;
  }
  if (scope.querySelector('[data-report-print-blocked]')) {
    window.alert('Report data must load successfully before exporting this PDF.');
    return;
  }
  const modal = scope instanceof HTMLElement ? scope : null;
  if (modal && !modal.querySelector('.print-document, .dynamic-document-page')) {
    window.alert('Wait for the document preview to finish loading before exporting this PDF.');
    return;
  }
  printInProgress = true;
  const isModuleReport =
    !document.querySelector(".print-document, .dynamic-document-page") &&
    Boolean(document.querySelector("[data-print-root]"));
  const markedCells: HTMLElement[] = [];

  // Determine suggested title for browser Save as PDF
  let previousDocumentTitle: string | undefined = undefined;
  let targetTitle = options?.documentTitle || options?.documentFilename?.replace(/\.pdf$/i, "");
  if (!targetTitle) {
    const scopeEl = scope instanceof HTMLElement ? scope : null;
    const titleAttr = scopeEl?.getAttribute("data-document-title") ||
      scopeEl?.getAttribute("data-document-filename")?.replace(/\.pdf$/i, "") ||
      document.querySelector("[data-document-title]")?.getAttribute("data-document-title") ||
      document.querySelector("[data-document-filename]")?.getAttribute("data-document-filename")?.replace(/\.pdf$/i, "");
    if (titleAttr) targetTitle = titleAttr;
  }

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
  const printMedia = window.matchMedia('print');
  const onPrintMediaChange = (event: MediaQueryListEvent) => {
    if (!event.matches) cleanup();
  };
  const cleanup = () => {
    printInProgress = false;
    window.removeEventListener('afterprint', cleanup);
    printMedia.removeEventListener('change', onPrintMediaChange);
    document.body.classList.remove("module-printing");
    markedCells.forEach(cell => cell.classList.remove("print-action-column"));
    if (previousDocumentTitle !== undefined) {
      document.title = previousDocumentTitle;
      previousDocumentTitle = undefined;
    }
  };
  try {
    await waitForDocumentImages(images);

    if (document.fonts?.ready) {
      await document.fonts.ready;
    }

    await new Promise<void>((resolve) => {
      requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
    });

    // Assets can load while React replaces/closes the preview. Never export a
    // stale sheet or an unfinished cloud design after that asynchronous wait.
    if ((modal && (!modal.isConnected || !modal.querySelector('.print-document, .dynamic-document-page'))) ||
        sheets.some(sheet => !sheet.isConnected) || scope.querySelector('[data-design-print-blocked], [data-report-print-blocked]')) {
      cleanup();
      window.alert('The document preview changed. Open it again and wait for it to finish loading.');
      return;
    }

    if (targetTitle && typeof document !== "undefined") {
      previousDocumentTitle = document.title;
      document.title = targetTitle;
    }

    window.addEventListener("afterprint", cleanup, { once: true });
    printMedia.addEventListener('change', onPrintMediaChange);
    window.print();

    // Retain formatting until the dialog closes; media changes cover
    // browsers that omit afterprint on cancellation.
  } catch (error) {
    cleanup();
    window.alert(error instanceof Error ? error.message : 'Could not prepare this document for printing. Try again.');
  }
}
