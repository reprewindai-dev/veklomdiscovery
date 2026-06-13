import "./globals.css";
import { Analytics } from "@vercel/analytics/next";
import Providers from "./providers";

export const metadata = {
  title: "Veklom Discovery",
  description: "Governed onchain identity, X402 payments, and Base Builder Code attribution for Veklom Discovery.",
  metadataBase: new URL("https://veklomdiscovery.vercel.app"),
  other: {
    "base:app_id": "6a29c21165478aa1565a9a52",
  },
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>
        <Providers>{children}</Providers>
        <Analytics />
      </body>
    </html>
  );
}
