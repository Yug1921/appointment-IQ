import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { Sidebar } from "@/components/layout/Sidebar";
import ChatWidget from "@/components/chat/ChatWidget";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

export const metadata: Metadata = {
  title: "AppointmentIQ — AI-Powered Booking",
  description: "Smart appointment scheduling for modern teams.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={inter.variable}>
      <body className="antialiased" style={{ background: "#0A0A0F", color: "#F4F4F6" }}>
        <div className="flex min-h-screen">
          {/* Sidebar — fixed, so we offset main content with margin */}
          <Sidebar />

          {/* Main content — offset by sidebar width, transitions with it */}
          <main
            id="main-content"
            className="flex-1 transition-all duration-300"
            style={{ marginLeft: "224px" }} /* 56*4 = 224px (w-56) */
          >
            {children}
          </main>
        </div>

        <ChatWidget />
      </body>
    </html>
  );
}