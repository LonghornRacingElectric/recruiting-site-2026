import Link from 'next/link';

export default function Hero() {
    return (
        <section className="relative pt-32 pb-20 md:pt-48 md:pb-32 overflow-hidden">
            {/* Background Elements */}
            <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full h-full max-w-7xl z-0 pointer-events-none">
                <div className="absolute top-20 left-10 w-72 h-72 bg-red-600/20 rounded-full blur-3xl mix-blend-screen animate-pulse" />
                <div className="absolute top-40 right-10 w-96 h-96 bg-orange-600/10 rounded-full blur-3xl mix-blend-screen" />
            </div>

            <div className="container mx-auto px-4 relative z-10 text-center">
                <h1 className="text-5xl md:text-7xl font-bold tracking-tighter mb-6 bg-clip-text text-transparent bg-gradient-to-b from-white to-white/60">
                    Build the Future of <br />
                    <span className="text-red-600">Electric Racing</span>
                </h1>

                <p className="text-lg md:text-xl text-neutral-400 max-w-2xl mx-auto mb-10">
                    Join Longhorn Racing Electric and push the boundaries of engineering.
                    Design, build, and race high-performance electric vehicles.
                </p>

                <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
                    <Link
                        href="/apply"
                        className="h-12 px-8 rounded-full bg-red-600 text-white font-medium flex items-center justify-center hover:bg-red-700 transition-colors"
                    >
                        Apply Now
                    </Link>
                    <Link
                        href="/about"
                        className="h-12 px-8 rounded-full border border-white/20 text-white font-medium flex items-center justify-center hover:bg-white/10 transition-colors"
                    >
                        Learn More
                    </Link>
                </div>
            </div>
        </section>
    );
}
