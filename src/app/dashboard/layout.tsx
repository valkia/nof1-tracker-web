import type { Metadata } from "next";
import { Sidebar } from "@/components/dashboard/sidebar";
import { Toaster } from "@/components/toaster";

export const metadata: Metadata = {
  title: "Nof1 控制台",
};

export default function DashboardLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <div className="h-lvh bg-surface-50 text-sm leading-6 text-surface-500 md:grid md:grid-cols-[240px_1fr]">
      <Sidebar />
      {children}
      <Toaster position="bottom-right" />
    </div>
  );
}
