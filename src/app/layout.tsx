import type { Metadata, Viewport } from "next";
import { Toaster } from "sonner";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "Sysora Stack",
    template: "%s · Sysora Stack",
  },
  description: "Attendance, leave and EOD reporting for the Sysora team.",
  robots: { index: false, follow: false },
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
