import type { Metadata } from 'next';
import { Poppins, Roboto } from 'next/font/google';
import { Header } from './shared/widgets/header';
import { SiteHeader } from './shared/widgets/site-header';
import { themeInitScript } from './shared/theme/theme-script';
import { QueryProvider } from './shared/providers/query-provider';
import { ShopStoreProvider } from './shared/store/shop-store';
import './global.css';

const roboto = Roboto({
  subsets: ['latin'],
  weight: ['100', '300', '400', '500', '700', '900'],
  variable: '--font-roboto-next',
});

const poppins = Poppins({
  subsets: ['latin'],
  weight: ['100', '200', '300', '400', '500', '600', '700', '800', '900'],
  variable: '--font-poppins-next',
});

export const metadata: Metadata = {
  title: 'MlimaLink Shop',
  description: 'Browse and shop products on MlimaLink',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="en"
      className={`${roboto.variable} ${poppins.variable}`}
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body>
        <QueryProvider>
          <ShopStoreProvider>
            <div className="flex min-h-screen flex-col">
              <SiteHeader>
                <Header />
              </SiteHeader>
              <main className="flex-1 bg-neutral-100">{children}</main>
            </div>
          </ShopStoreProvider>
        </QueryProvider>
      </body>
    </html>
  );
}
