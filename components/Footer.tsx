import Image from 'next/image';
import Link from 'next/link';

const footerLinks = [
    { href: '/', label: 'Home' },
    { href: '/about', label: 'About' },
    { href: '/teams', label: 'Teams' },
    { href: '/apply', label: 'Apply' },
];

const socialLinks = [
    {
        href: 'https://www.instagram.com/longhornracing/',
        label: 'Instagram',
        icon: (
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z" />
            </svg>
        ),
    },
    {
        href: 'https://www.linkedin.com/company/longhorn-racing/',
        label: 'LinkedIn',
        icon: (
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 01-2.063-2.065 2.064 2.064 0 112.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z" />
            </svg>
        ),
    },
];

export default function Footer() {
    return (
        <footer className="relative bg-black">
            {/* Top divider — matches section dividers on home page */}
            <div
                className="absolute top-0 left-0 right-0 h-px"
                style={{ background: 'linear-gradient(90deg, transparent, rgba(4,95,133,0.3), transparent)' }}
            />

            <div className="container mx-auto px-6 md:px-10 max-w-6xl py-14">
                {/* Main footer row */}
                <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-10">
                    {/* Logo + tagline */}
                    <div className="flex items-center gap-4">
                        <Image
                            src="/logo.png"
                            alt="Longhorn Racing"
                            width={80}
                            height={80}
                            className="h-8 w-auto"
                        />
                        {/* Team stripe dots */}
                        <div className="flex gap-1.5">
                            <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: 'var(--lhr-gold-light)' }} />
                            <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: 'var(--lhr-gold)' }} />
                            <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: 'var(--lhr-orange)' }} />
                        </div>
                    </div>

                    {/* Nav links */}
                    <nav className="flex items-center gap-1">
                        {footerLinks.map((link) => (
                            <Link
                                key={link.href}
                                href={link.href}
                                className="px-4 py-1.5 text-[13px] font-medium tracking-wide text-white/40 hover:text-white transition-colors duration-200 rounded-md hover:bg-white/[0.04]"
                            >
                                {link.label}
                            </Link>
                        ))}
                    </nav>

                    {/* Social icons */}
                    <div className="flex items-center gap-2">
                        {socialLinks.map((social) => (
                            <Link
                                key={social.label}
                                href={social.href}
                                target="_blank"
                                rel="noopener noreferrer"
                                aria-label={social.label}
                                className="w-9 h-9 rounded-lg flex items-center justify-center text-white/30 hover:text-white hover:bg-white/[0.06] transition-all duration-200"
                            >
                                {social.icon}
                            </Link>
                        ))}
                    </div>
                </div>

                {/* Bottom row */}
                <div
                    className="mt-10 pt-6 flex flex-col sm:flex-row items-center justify-between gap-4"
                    style={{ borderTop: '1px solid rgba(255,255,255,0.04)' }}
                >
                    <span className="font-urbanist text-[13px] text-white/25">
                        &copy; {new Date().getFullYear()} Longhorn Racing
                    </span>
                    <span className="font-urbanist text-[13px] text-white/25">
                        Longhorn Racing @ The University of Texas at Austin
                    </span>
                </div>
            </div>
        </footer>
    );
}
