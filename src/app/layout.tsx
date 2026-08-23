import type { Metadata, Viewport } from "next";
import { Toaster } from "sonner";
import "./globals.css";

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
    <html lang="en">
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
