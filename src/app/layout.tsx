import type { Metadata, Viewport } from "next";
import { Geist, Lato, Space_Grotesk } from "next/font/google";
import { Toaster } from "sonner";
import "./globals.css";

// The same three faces sysorastack.com uses: Space Grotesk for display,
// Lato for headings, Geist for everything else. Loaded through next/font so
// they self-host and don't shift on load.
const geist = Geist({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-geist",
  display: "swap",
});

const spaceGrotesk = Space_Grotesk({
  subsets: ["latin"],
  weight: ["500", "600", "700"],
  variable: "--font-space-grotesk",
  display: "swap",
});

const lato = Lato({
  subsets: ["latin"],
  weight: ["700", "900"],
  variable: "--font-lato",
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "Sysora Stack",
    template: "%s · Sysora Stack",
  },
  description: "Attendance, leave and EOD reporting for the Sysora Stack team.",
  applicationName: "Sysora Stack",
  robots: { index: false, follow: false },
  // Favicon comes from src/app/icon.png via the Next file convention, which
  // emits the <link rel="icon"> itself. Declaring metadata.icons here as well
  // would override that and lose the automatic cache-busting.
};

export const viewport: Viewport = {
  themeColor: "#1a1a2e",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${geist.variable} ${lato.variable} ${spaceGrotesk.variable}`}>
      <body className="min-h-dvh antialiased">
        {children}
        <Toaster
          position="bottom-right"
          toastOptions={{
            style: {
              border: "1px solid var(--color-line)",
              color: "var(--color-navy)",
              borderRadius: "10px",
            },
          }}
        />
      </body>
    </html>
  );
}
