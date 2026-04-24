import type { Metadata } from "next";
import {
  Geist,
  Geist_Mono,
  JetBrains_Mono,
  Montserrat,
  Press_Start_2P,
} from "next/font/google";
import { Toaster } from "sonner";
import { ThemeProvider } from "@/components/theme-provider";
import { AppThemeProvider } from "@/components/theme-context";
import "./globals.css";

/*
Input: Google Font requests resolved at build time by next/font.
Transformation: Each helper returns a className that exposes its own CSS variable (e.g.
--font-press-start). We stack all five variables on <html> so globals.css's [data-font="..."]
presets can pick any of them at runtime without re-downloading fonts.
Output: Five self-hosted, preloaded font-face declarations + variables available app-wide.
*/

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// Press Start 2P ships a single weight only; next/font requires explicitly declaring it.
const pressStart2P = Press_Start_2P({
  variable: "--font-press-start",
  subsets: ["latin"],
  weight: "400",
  display: "swap",
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-jetbrains-mono",
  subsets: ["latin"],
  display: "swap",
});

const montserrat = Montserrat({
  variable: "--font-montserrat",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Nuzl",
  description: "Pokemon Soul Link and Nuzlocke tracker dashboard",
  icons: {
    icon: "/icon.png",
    shortcut: "/icon.png",
    apple: "/icon.png",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} ${pressStart2P.variable} ${jetbrainsMono.variable} ${montserrat.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <body className="min-h-full flex flex-col bg-background text-foreground transition-colors duration-300">
        {/* suppressHydrationWarning={true} */}
        <ThemeProvider
          attribute="class"
          defaultTheme="dark"
          enableSystem
          disableTransitionOnChange
        >
          <AppThemeProvider>
            {children}
            <Toaster richColors position="top-right" />
          </AppThemeProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}