import { redirect } from 'next/navigation';

// Guests land on /login; signed-in users are pushed to /home by middleware.
export default function RootPage() {
  redirect('/login');
}
