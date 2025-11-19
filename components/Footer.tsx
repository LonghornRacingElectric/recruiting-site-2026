import Link from 'next/link';

export default function Footer() {
    return (
        <footer className="border-t border-white/10 bg-black py-12">
            <div className="container mx-auto px-4 flex flex-col md:flex-row items-center justify-between gap-6">
                <div className="flex items-center gap-2">
                    <span className="text-xl font-bold tracking-tighter text-white">
                        LHR<span className="text-red-600">e</span>
                    </span>
                    <span className="text-sm text-neutral-500">
                        © {new Date().getFullYear()} Longhorn Racing Electric
                    </span>
                </div>

                <div className="flex gap-6">
                    <Link href="#" className="text-neutral-500 hover:text-white transition-colors">
                        Instagram
                    </Link>
                    <Link href="#" className="text-neutral-500 hover:text-white transition-colors">
                        LinkedIn
                    </Link>
                    <Link href="#" className="text-neutral-500 hover:text-white transition-colors">
                        GitHub
                    </Link>
                </div>
            </div>
        </footer>
    );
}
