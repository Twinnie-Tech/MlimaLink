import type { Metadata } from 'next';
import { Poppins, Roboto } from 'next/font/google';
import { QueryProvider } from './shared/providers/query-provider';
import { Header } from './shared/widgets/header';
import './global.css';

const roboto = Roboto({
  subsets: ['latin'],
  weight: ['100', '300', '400', '500', '700', '900'],
  variable: '--font-roboto-next',
});

const poppins = Poppins({
  subsets: ['latin'],
  weight: ['300', '400', '500', '600', '700'],
  variable: '--font-poppins-next',
});

export const metadata: Metadata = {
  title: 'MlimaLink Seller Centre',
  description: 'Open your shop and sell on MlimaLink',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`${roboto.variable} ${poppins.variable}`}>
      <body>
        <QueryProvider>
          <div className="flex min-h-screen flex-col">
            <Header />
            <main className="flex-1 bg-neutral-100">{children}</main>
          </div>
        </QueryProvider>
      </body>
    </html>
  );
}
