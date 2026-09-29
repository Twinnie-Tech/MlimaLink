import { Header } from '../shared/widgets/header';

/** Public pages (landing, sign-up, login, password reset) share the light header. */
export default function PublicLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen flex-col">
      <Header />
      <main className="flex-1 bg-neutral-100">{children}</main>
    </div>
  );
}
