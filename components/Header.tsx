import Link from 'next/link';
import Image from 'next/image';
import { LogoutButton } from './LogoutButton';
import { ThemeToggle } from '@/app/admin/_components/ThemeToggle';
import { HeaderMobileMenu } from './HeaderMobileMenu';
import { HeaderUiProvider } from './HeaderUi';
import { cookies } from 'next/headers';
import { adminAuth } from '@/lib/firebase/admin';
import { getUser } from '@/lib/firebase/users';
import { UserRole } from '@/lib/models/User';

const PUBLIC_NAV = [
  { href: '/', label: 'Home' },
  { href: '/about', label: 'About' },
  { href: '/teams', label: 'Teams' },
  { href: '/contact', label: 'Contact' },
];

type AdminNavItem = { href: string; label: string; restrictTo?: UserRole[] };

const ADMIN_NAV: AdminNavItem[] = [
  { href: '/admin/dashboard', label: 'Admin' },
  { href: '/admin/applications', label: 'Applicants' },
  { href: '/admin/users', label: 'Users', restrictTo: [UserRole.ADMIN, UserRole.TEAM_CAPTAIN_OB] },
  { href: '/admin/teams', label: 'Team Mgmt' },
  { href: '/admin/configuration', label: 'Configuration' },
  { href: '/admin/settings', label: 'Settings' },
];

const STAFF_ROLES = new Set<UserRole>([
  UserRole.ADMIN,
  UserRole.TEAM_CAPTAIN_OB,
  UserRole.SYSTEM_LEAD,
  UserRole.REVIEWER,
]);

export default async function Header() {
  let logoHref = "/";
  let userRole: UserRole | null = null;

  try {
    const cookieStore = await cookies();
    const sessionCookie = cookieStore.get("session")?.value;

    if (sessionCookie) {
      const decodedToken = await adminAuth.verifySessionCookie(sessionCookie, true);
      const user = await getUser(decodedToken.uid);

      if (user) {
        userRole = user.role;
        if (STAFF_ROLES.has(user.role)) {
          logoHref = "/admin/dashboard";
        }
      }
    }
  } catch {
    // verification failed — treat as anonymous
  }

  const isStaff = userRole !== null && STAFF_ROLES.has(userRole);
  const adminNavItems = isStaff
    ? ADMIN_NAV.filter((item) => !item.restrictTo || item.restrictTo.includes(userRole!))
    : [];

  return (
    <header
      className="fixed top-0 left-0 right-0 z-50 transition-colors duration-300"
      style={{
        background: 'var(--admin-nav-bg, rgba(3, 6, 8, 0.8))',
        backdropFilter: 'blur(16px) saturate(1.4)',
        WebkitBackdropFilter: 'blur(16px) saturate(1.4)',
        borderBottom: '1px solid var(--admin-nav-border, rgba(255, 255, 255, 0.06))',
      }}
    >
      <div className="container mx-auto px-6 md:px-10 max-w-[1600px] h-16 flex items-center justify-between gap-6">
        {/* Logo */}
        <Link href={logoHref} className="flex items-center gap-3 shrink-0">
          <Image
            src="/logo.png"
            alt="Longhorn Racing"
            width={120}
            height={40}
            className="h-9 w-auto"
          />
          {isStaff && (
            <span
              className="hidden sm:inline-block text-[11px] font-semibold tracking-widest uppercase px-2 py-0.5 rounded"
              style={{
                color: 'var(--lhr-blue-light)',
                backgroundColor: 'rgba(4,95,133,0.12)',
                border: '1px solid rgba(4,95,133,0.2)',
              }}
            >
              Admin
            </span>
          )}
        </Link>

        {/* Nav links */}
        <nav className="hidden lg:flex items-center gap-0.5 flex-1 min-w-0">
          {PUBLIC_NAV.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="relative px-3.5 py-1.5 text-[13px] font-medium tracking-wide text-white/50 hover:text-white transition-colors duration-200 rounded-md hover:bg-white/[0.04]"
            >
              {link.label}
            </Link>
          ))}

          {adminNavItems.length > 0 && (
            <>
              <span
                className="mx-2 h-5 w-px"
                style={{ backgroundColor: 'var(--admin-nav-border, rgba(255,255,255,0.12))' }}
                aria-hidden="true"
              />
              {adminNavItems.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className="relative px-3.5 py-1.5 text-[13px] font-medium tracking-wide text-white/50 hover:text-white transition-colors duration-200 rounded-md hover:bg-white/[0.04]"
                >
                  {item.label}
                </Link>
              ))}
            </>
          )}
        </nav>

        {/* Right side — controls + auth */}
        <HeaderUiProvider>
        <div className="flex items-center gap-2 sm:gap-3 shrink-0">
          <LogoutButton />
          <ThemeToggle />
          {!isStaff && (
            <Link
              href="/apply"
              className="hidden sm:flex group relative h-9 px-5 rounded-lg text-[13px] font-semibold tracking-wide items-center justify-center transition-all duration-200 overflow-hidden"
              style={{
                backgroundColor: 'var(--lhr-gold)',
                color: '#000',
              }}
            >
              <span className="relative z-10 flex items-center gap-1.5">
                Apply
                <svg
                  className="w-3.5 h-3.5 transition-transform duration-200 group-hover:translate-x-0.5"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2.5}
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
                </svg>
              </span>
              <span
                className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-200"
                style={{ background: 'linear-gradient(135deg, var(--lhr-gold), var(--lhr-orange))' }}
              />
            </Link>
          )}
          <HeaderMobileMenu
            publicNav={PUBLIC_NAV}
            adminNav={adminNavItems.map(({ href, label }) => ({ href, label }))}
            showApplyCta={!isStaff}
          />
        </div>
        </HeaderUiProvider>
      </div>
    </header>
  );
}
