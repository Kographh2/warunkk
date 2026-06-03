'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { Profile, Role } from '@/lib/types';

const links: { href: string; label: string; icon: string; roles: Role[] }[] = [
  { href: '/dashboard', label: 'POS Dashboard', icon: 'bi-columns-gap', roles: ['owner', 'admin', 'kasir'] },
  { href: '/dashboard/orders', label: 'Order Table', icon: 'bi-receipt-cutoff', roles: ['owner', 'admin', 'kasir'] },
  { href: '/kasir', label: 'Kasir Scan', icon: 'bi-qr-code-scan', roles: ['owner', 'admin', 'kasir'] },
  { href: '/dashboard/menu', label: 'Menu Manual', icon: 'bi-journal-plus', roles: ['owner', 'admin'] },
  { href: '/dashboard/tables', label: 'QR Meja', icon: 'bi-grid-3x3-gap', roles: ['owner', 'admin'] },
  { href: '/dashboard/broadcasts', label: 'Broadcast & Ads', icon: 'bi-megaphone', roles: ['owner'] },
  { href: '/dashboard/users', label: 'User & Approval', icon: 'bi-people', roles: ['owner'] },
  { href: '/dashboard/reports', label: 'Laporan Owner', icon: 'bi-graph-up-arrow', roles: ['owner'] }
];

export function DashboardShell({ profile, children }: { profile: Profile; children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();

  async function logout() {
    await supabase.auth.signOut();
    router.replace('/login');
  }

  return (
    <div className="pos-layout">
      <aside className="pos-sidebar">
        <Link href="/dashboard" className="pos-brand text-decoration-none">
          <span className="pos-brand-mark"><i className="bi bi-shop" /></span>
          <span>
            <span className="pos-brand-title">WARUNK</span>
            <span className="pos-brand-role">{profile.role.toUpperCase()}</span>
          </span>
        </Link>

        <nav className="pos-nav">
          {links.filter((link) => link.roles.includes(profile.role)).map((link) => (
            <Link key={link.href} href={link.href} className={`pos-nav-link ${pathname === link.href ? 'active' : ''}`}>
              <i className={`bi ${link.icon}`} />
              <span>{link.label}</span>
            </Link>
          ))}
        </nav>

        <div className="pos-user-card">
          <div className="pos-avatar"><i className="bi bi-person-badge" /></div>
          <div className="min-w-0">
            <div className="small text-white-50">Login sebagai</div>
            <div className="fw-bold text-truncate">{profile.full_name}</div>
          </div>
          <button onClick={logout} className="btn btn-sm btn-outline-light rounded-pill ms-lg-0 ms-auto">
            <i className="bi bi-box-arrow-right" />
            <span className="d-lg-inline d-none ms-1">Logout</span>
          </button>
        </div>
      </aside>

      <main className="pos-main">
        {children}
      </main>
    </div>
  );
}
