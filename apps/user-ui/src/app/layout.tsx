import type { Metadata } from 'next';
import './global.css';

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
    <html lang="en">
      <body>
        <div className="flex min-h-screen flex-col">
          <header className="bg-linear-to-br from-brand-start to-brand-end py-6 text-white shadow-md">
            <div className="mx-auto max-w-300 px-4 md:px-6">
              <h1 className="text-2xl font-bold md:text-[2rem]">MlimaLink</h1>
            </div>
          </header>
          <main className="flex-1 bg-neutral-100">{children}</main>
        </div>
      </body>
    </html>
  );
}
