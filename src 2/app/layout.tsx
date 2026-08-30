import type { Metadata } from "next";
import "./globals.css";
import NavBar from "@/components/NavBar";

// Using system fonts rather than next/font/google — avoids a build-time
// dependency on fetching Google Fonts (fails in network-restricted
// environments, and one less external call for a small family app).

export const metadata: Metadata = {
  title: "Yin Family Football League",
  description: "No-draft, use-once, season-long family fantasy football.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full flex flex-col font-sans">
        <NavBar />
        {children}
      </body>
    </html>
  );
}
