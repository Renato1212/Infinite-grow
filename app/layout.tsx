import type { Metadata, Viewport } from "next";
import "./globals.css";
import { Providers } from "@/components/providers";
import { AppFrame } from "@/components/app-frame";
import { currentUser } from "@/lib/auth";
import { todayISO } from "@/lib/time";

export const metadata: Metadata = {
  title: "Deliberate practice",
  description: "Prepare, plan, trade, record, debrief, study.",
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#fcfcfd" },
    { media: "(prefers-color-scheme: dark)", color: "#0c0e11" },
  ],
  width: "device-width",
  initialScale: 1,
};

// Applied before first paint so a dark-mode reload never flashes light.
const themeScript = `
(function(){try{var t=localStorage.getItem('theme');
if(t==='dark'||t==='light')document.documentElement.setAttribute('data-theme',t);}catch(e){}})();
`;

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const user = await currentUser();
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body>
        <Providers>
          {user ? (
            <AppFrame userEmail={user.email} today={todayISO()}>{children}</AppFrame>
          ) : (
            children
          )}
        </Providers>
      </body>
    </html>
  );
}
