import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import PrelineScriptWrapper from "./components/PrelineScriptWrapper";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Project Hub",
  description: "A simple app to track all your development projects",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={inter.className}>
        {children}
        <PrelineScriptWrapper />
      </body>
    </html>
  );
}
