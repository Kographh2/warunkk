import { redirect } from 'next/navigation';

export default function OwnerShortcut() {
  redirect('/dashboard/reports');
}
