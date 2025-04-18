import "@/styles/globals.css";
import { Inter } from "next/font/google";
import { TanstackProvider } from "@/providers/tanstack-provider";
import { ThemeProvider } from "../providers/theme-provider";

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
    <html lang="en" suppressHydrationWarning>
      <body className={inter.className}>
        <TanstackProvider>
          <ThemeProvider
            attribute="class" // <-- VERY IMPORTANT: Tells next-themes to use class strategy
            defaultTheme="system" // Or "light" or "dark"
            enableSystem // Allows theme to follow system preference
            disableTransitionOnChange // Optional: Prevents theme flash on load
          >
            {children}
          </ThemeProvider>
        </TanstackProvider>
      </body>
    </html>
  );
}
