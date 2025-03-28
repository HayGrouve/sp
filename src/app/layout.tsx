import "@/styles/globals.css";
import { Inter } from "next/font/google";
import { TanstackProvider } from "@/providers/tanstack-provider";

const inter = Inter({ subsets: ["latin"] });

export const metadata = {
  title: "Live Football Scores",
  description: "Get real-time football scores from around the world",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className={inter.className}>
        <TanstackProvider>{children}</TanstackProvider>
      </body>
    </html>
  );
}
