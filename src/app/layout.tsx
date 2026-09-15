import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import { Providers } from '@/app/providers';
import './globals.css';

export const metadata: Metadata = {
  title: 'エンタメマッチングサイトTOLA (トラ)',
  description: '飲み会・接待に、審査を通過したキャストをマッチング。TOLA (トラ)',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  themeColor: '#fdfaf3',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ja">
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
