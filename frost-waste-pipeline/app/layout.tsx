import type { Metadata } from "next";
import { Inter, Playfair_Display } from "next/font/google"; // <-- Importera Playfair
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });
const playfair = Playfair_Display({ 
  subsets: ["latin"], 
  variable: "--font-playfair" // <-- Variabel för rubriker
});

export const metadata: Metadata = {
  title: "Frost Waste Pipeline",
  description: "AI-driven avfallshantering",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="sv">
      {/* Lägg till båda variablerna här */}
      <body className={`${inter.variable} ${playfair.variable} font-sans antialiased bg-white text-slate-900`}>
        {children}
      </body>
    </html>
  );
}
