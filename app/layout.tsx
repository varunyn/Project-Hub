import type { Metadata } from "next";
import "./globals.css";
import PrelineScriptWrapper from "./components/PrelineScriptWrapper";

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
      <body>
        {children}
        <PrelineScriptWrapper />
      </body>
    </html>
  );
}
