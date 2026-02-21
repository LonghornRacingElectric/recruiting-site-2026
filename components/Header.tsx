import Link from 'next/link';
import Image from 'next/image';
import { LogoutButton } from './LogoutButton';
import { cookies } from 'next/headers';
import { adminAuth } from '@/lib/firebase/admin';
import { getUser } from '@/lib/firebase/users';
import { UserRole } from '@/lib/models/User';

const navLinks = [
  { href: '/', label: 'Home' },
  { href: '/about', label: 'About' },
  { href: '/teams', label: 'Teams' },
  { href: '/contact', label: 'Contact' },
];

export default async function Header() {
  let logoHref = "/";

  try {
    const cookieStore = await cookies();
    const sessionCookie = cookieStore.get("session")?.value;

    if (sessionCookie) {
      const decodedToken = await adminAuth.verifySessionCookie(sessionCookie, true);
      const user = await getUser(decodedToken.uid);

      if (user && user.role === UserRole.ADMIN) {
        logoHref = "/admin/dashboard";
      }
    }
  } catch (error) {
    // If verification fails, just default to home
  }

  return (
    <header className="fixed top-0 w-full z-50 transition-colors duration-300"
      style={{
        background: 'rgba(0, 0, 0, 0.6)',
        backdropFilter: 'blur(16px) saturate(1.4)',
        WebkitBackdropFilter: 'blur(16px) saturate(1.4)',
        borderBottom: '1px solid rgba(255, 255, 255, 0.06)',
      }}
    >
      <div className="container mx-auto px-6 md:px-10 max-w-6xl h-16 flex items-center justify-between">
        {/* Logo */}
        <Link href={logoHref} className="flex items-center shrink-0">
          <Image
            src="/logo.png"
            alt="Longhorn Racing"
            width={120}
            height={40}
            className="h-9 w-auto"
          />
        </Link>

        {/* Nav links — centered */}
        <nav className="hidden md:flex items-center gap-1">
          {navLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="relative px-4 py-1.5 text-[13px] font-medium tracking-wide text-white/50 hover:text-white transition-colors duration-200 rounded-md hover:bg-white/[0.04]"
            >
              {link.label}
            </Link>
          ))}
        </nav>

        {/* Right side — CTA + auth */}
        <div className="flex items-center gap-3">
          <LogoutButton />
          <Link
            href="/apply"
            className="group relative h-9 px-5 rounded-lg text-[13px] font-semibold tracking-wide flex items-center justify-center transition-all duration-200 overflow-hidden"
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
        </div>
      </div>
    </header>
  );
}
