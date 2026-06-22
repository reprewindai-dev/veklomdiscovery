import "./globals.css";
import { Analytics } from "@vercel/analytics/next";
import Providers from "./providers";

export const metadata = {
  title: "Veklom Discovery",
  description: "Veklom Discovery — x402 payment-gated AI agent discovery layer on Base",
  metadataBase: new URL("https://veklomdiscovery.vercel.app"),
  other: {
    "base:app_id": "6a31ee4f89b48adb4cb26cdd",
  },
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <head>
        <meta name="base:app_id" content="6a31ee4f89b48adb4cb26cdd" />
      </head>
      <body>
        <Providers>{children}</Providers>
        <Analytics />
      </body>
    </html>
  );
}
