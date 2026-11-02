"use client";

import { useSyncExternalStore, ReactNode } from "react";
import { createPortal } from "react-dom";

const emptySubscribe = () => () => {};

/**
 * DesignerPortal renders designer dialogs, modals, and toasts directly into document.body.
 * This completely escapes parent CSS stacking contexts created by transforms, filters,
 * isolation, or nested positioning in the PDF Designer canvas and toolbars.
 */
export default function DesignerPortal({ children }: { children: ReactNode }) {
  const isMounted = useSyncExternalStore(
    emptySubscribe,
    () => true,
    () => false
  );

  if (!isMounted || typeof document === "undefined") {
    return null;
  }

  return createPortal(children, document.body);
}
