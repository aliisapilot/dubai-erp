import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import ERPLayout from "@/components/ERPLayout";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Dubai ERP - UAE Cloud Business Suite",
  description: "Enterprise Resource Planning system tailored for UAE businesses with VAT compliance",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <ERPLayout>{children}</ERPLayout>
      </body>
    </html>
  );
}


