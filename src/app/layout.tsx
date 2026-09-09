import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { ServiceWorkerRegistration } from "./service-worker-registration";

export const metadata: Metadata = {
  title: "Covered",
  description: "Hospitality staffing marketplace",
  manifest: "/manifest.json",
  icons: {
    icon: "/icon.svg",
    apple: "/icon-192.png",
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Covered",
  },
};

export const viewport: Viewport = {
  themeColor: "#1F2623",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body style={{ fontFamily: "system-ui, sans-serif", margin: 0 }}>
        {children}
        <ServiceWorkerRegistration />
      </body>
    </html>
  );
}
