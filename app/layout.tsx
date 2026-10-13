import type { Metadata } from "next";
import ERPLayout from "@/components/ERPLayout";
import "./globals.css";
import "./erp-screen-theme.css";

export const metadata: Metadata = {
  title: "Dubai ERP - UAE Cloud Business Suite",
  description: "Enterprise Resource Planning system tailored for UAE businesses with VAT compliance",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      className="m-0 p-0 w-full min-h-screen antialiased"
      suppressHydrationWarning
    >
      <body
        className="m-0 p-0 w-full min-h-screen bg-slate-900 text-slate-100 antialiased overflow-x-hidden"
        suppressHydrationWarning
      >
        <ERPLayout>{children}</ERPLayout>
      </body>
    </html>
  );
}
