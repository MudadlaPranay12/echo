import type { Metadata, Viewport } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

const jetbrains = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-jetbrains",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Echo — AP Exception Intelligence",
  description:
    "An AP invoice-exception intelligence agent with institutional memory. Documents tell you the rule; Echo remembers what actually works. It advises — you decide.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  themeColor: "#05070A",
};

/**
 * Applied before first paint so the correct theme is on <html> from the very
 * first frame — no flash, no jump.
 *
 * The stored value is a *preference*, not a resolved theme: "system" | "light" |
 * "dark". The operating system is consulted only when the preference is
 * "system" (which is also the first-visit default, since nothing is stored).
 * The resolved theme lands on `data-theme`; the raw preference lands on
 * `data-theme-pref` so the control can show which of the three is selected.
 */
const THEME_BOOTSTRAP = `(function(){try{var k="echo-theme";var s=localStorage.getItem(k);var m=(s==="light"||s==="dark"||s==="system")?s:"system";var d=document.documentElement;var dark=window.matchMedia("(prefers-color-scheme: dark)");var r=function(){return m==="system"?(dark.matches?"dark":"light"):m;};d.setAttribute("data-theme-pref",m);d.setAttribute("data-theme",r());window.__echoTheme={pref:m,resolve:r,set:function(v){m=(v==="light"||v==="dark"||v==="system")?v:"system";try{localStorage.setItem(k,m);}catch(e){}d.setAttribute("data-theme-pref",m);d.setAttribute("data-theme",r());}};dark.addEventListener("change",function(){if(m==="system")d.setAttribute("data-theme",r());});}catch(e){document.documentElement.setAttribute("data-theme","dark");document.documentElement.setAttribute("data-theme-pref","system");}})();`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      data-theme="dark"
      data-theme-pref="system"
      suppressHydrationWarning
      className={`${inter.variable} ${jetbrains.variable}`}
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOTSTRAP }} />
      </head>
      <body className="antialiased">{children}</body>
    </html>
  );
}
