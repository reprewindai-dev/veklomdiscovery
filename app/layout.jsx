import "./globals.css";

export const metadata = {
  title: "Veklom ID",
  description: "Governed onchain identity, X402 payments, and Base Builder Code attribution for Veklom Discovery.",
  metadataBase: new URL("https://veklom-id.vercel.app"),
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
