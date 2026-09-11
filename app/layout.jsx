import './globals.css';

export const metadata = {
  title: 'GTS Hub — Guest Technical Services',
  description:
    'Work tracking for the B&H Guest Technical Services counter: Salesforce log, overnight assignments, alerts, service catalog and station inventory.',
  applicationName: 'GTS Hub',
};

export const viewport = {
  themeColor: '#070b12',
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
};

// Applies the saved theme before React hydrates so there is no flash.
const themeBoot = `(function(){try{var s=JSON.parse(localStorage.getItem('gts-hub:state')||'{}');var t=(s.settings&&s.settings.theme)||'dark';document.documentElement.setAttribute('data-theme',t);}catch(e){document.documentElement.setAttribute('data-theme','dark');}})();`;

export default function RootLayout({ children }) {
  return (
    <html lang="en" data-theme="dark" suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Space+Grotesk:wght@500;600;700&family=JetBrains+Mono:wght@400;500;600&display=swap"
          rel="stylesheet"
        />
        <script dangerouslySetInnerHTML={{ __html: themeBoot }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
