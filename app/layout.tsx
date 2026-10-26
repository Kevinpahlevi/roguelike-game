import type { Metadata } from "next";
import { Cinzel, Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const cinzelSerif = Cinzel({
  variable: "--font-cinzel",
  subsets: ["latin"],
  weight: ["600", "700", "900"],
});

export const metadata: Metadata = {
  title: "Grim Survivors — Dark Fantasy Roguelike Survival",
  description:
    "Fast-paced Dark Fantasy Horde Survival Roguelike with Red-Star Weapon Evolutions, Arena Boss Fights, and Altar Progression.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} ${cinzelSerif.variable} h-full antialiased dark`}
    >
      <body className="min-h-full flex flex-col bg-[#0B0A0E] text-[#EAE6DF]">
        {children}
      </body>
    </html>
  );
}
