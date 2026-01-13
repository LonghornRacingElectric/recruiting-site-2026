'use client';

import Link from 'next/link';
import { useState, useEffect } from 'react';

const rotatingWords = ['Creators', 'Innovators', 'Engineers', 'Designers', 'Builders', 'Longhorns'];

export default function Hero() {
    const [currentWordIndex, setCurrentWordIndex] = useState(0);
    const [isAnimating, setIsAnimating] = useState(false);

    useEffect(() => {
        const interval = setInterval(() => {
            setIsAnimating(true);
            setTimeout(() => {
                setCurrentWordIndex((prev) => (prev + 1) % rotatingWords.length);
                setIsAnimating(false);
            }, 500); // Half of the transition duration
        }, 3000); // Change word every 3 seconds

        return () => clearInterval(interval);
    }, []);

    return (
        <section className="relative min-h-screen overflow-hidden flex items-center justify-center">
            {/* Video Background */}
            <div className="absolute inset-0 z-0">
                <video
                    autoPlay
                    muted
                    loop
                    playsInline
                    className="w-full h-full object-cover"
                >
                    <source src="/background.mp4" type="video/mp4" />
                </video>
                {/* Dark overlay for better text readability */}
                <div className="absolute inset-0 bg-black/40" />
            </div>

            <div className="container mx-auto px-4 relative z-10 text-center">
                <h1 className="text-5xl md:text-7xl font-bold tracking-tight mb-6 text-white">
                    We are{' '}
                    <span 
                        className={`inline-block transition-all duration-500 ease-in-out ${
                            isAnimating 
                                ? 'opacity-0 translate-y-8' 
                                : 'opacity-100 translate-y-0'
                        }`}
                    >
                        {rotatingWords[currentWordIndex]}.
                    </span>
                </h1>

                <p className="text-lg md:text-xl text-white/80 max-w-2xl mx-auto mb-10">
                    Join Longhorn Racing and push the boundaries of engineering.
                    Design, build, and race high-performance vehicles.
                </p>

                <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
                    <Link
                        href="/apply"
                        className="h-12 px-8 rounded-full bg-[#FFB526] text-black font-medium flex items-center justify-center hover:bg-[#e6a220] transition-colors"
                    >
                        Apply Now
                    </Link>
                    <Link
                        href="/about"
                        className="h-12 px-8 rounded-full border border-white/20 text-white font-medium flex items-center justify-center hover:bg-white/10 transition-colors backdrop-blur-sm"
                    >
                        Learn More
                    </Link>
                </div>
            </div>
        </section>
    );
}
