"use client";

import React, { ReactNode, useEffect } from "react";

interface PrintModalProps {
  isOpen: boolean;
  onClose: () => void;
  children: ReactNode;
}

export default function PrintModal({ isOpen, onClose, children }: PrintModalProps) {
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div
      className="print-modal-container fixed inset-0 z-50 overflow-y-auto bg-black/60 backdrop-blur-sm p-4 print:p-0 print:m-0 print:bg-transparent print:static print:overflow-visible print:inset-auto print:block print:h-auto print:w-[210mm] print:max-w-none print:shadow-none"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      {children}
    </div>
  );
}
