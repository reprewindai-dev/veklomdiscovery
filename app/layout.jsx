import "./globals.css";
import { Analytics } from "@vercel/analytics/next";
import Providers from "./providers";
import { BASE_APP_ID } from "../config/veklomIdentity";

export const metadata = {
  title: "Veklom Discovery",
  description: "Governed onchain identity, X402 payments, and Base Builder Code attribution for Veklom Discovery.",
  metadataBase: new URL("https://veklomdiscovery.vercel.app"),
  other: {
    "base:app_id": BASE_APP_ID,
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
