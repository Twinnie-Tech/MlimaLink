import { redirect } from 'next/navigation';

/** The dashboard sends signed-out visitors on to the login page. */
export default function Index() {
  redirect('/dashboard');
}
