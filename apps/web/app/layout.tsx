import './style.css';
import type { Metadata, Viewport } from 'next';
import { ThemeProvider, ToastProvider } from './providers';

export const metadata: Metadata = {
  title: 'Connectly — Every connection matters',
  description: 'A modern multi-platform communication app for chats, friends and groups.',
};

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#f3f5f8' },
    { media: '(prefers-color-scheme: dark)', color: '#14171c' },
  ],
};

const themeScript = `(function(){try{var t=localStorage.getItem('connectly-theme');if(t!=='light'&&t!=='dark'&&t!=='github')t='light';document.documentElement.dataset.theme=t;document.documentElement.style.colorScheme=t==='light'?'light':'dark';}catch(e){document.documentElement.dataset.theme='light';}})();`;

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body>
        <ThemeProvider>
          <ToastProvider>{children}</ToastProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
