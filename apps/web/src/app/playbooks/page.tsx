import { redirect } from 'next/navigation';

// Legacy alias — the page lives at /skills now. Kept so old bookmarks,
// in-app links, and shared URLs don't 404.
export default function PlaybooksRedirect() {
  redirect('/skills');
}
