'use client';

import Link from 'next/link';
import { useState, useEffect } from 'react';

const rotatingWords = ['Creators', 'Innovators', 'Engineers', 'Designers', 'Builders', 'Longhorns'];

export default function Hero() {
    const [currentWordIndex, setCurrentWordIndex] = useState(0);
    const [isAnimating, setIsAnimating] = useState(false);
    const [mounted, setMounted] = useState(false);

    useEffect(() => {
        setMounted(true);
    }, []);

    useEffect(() => {
        const interval = setInterval(() => {
            setIsAnimating(true);
            setTimeout(() => {
                setCurrentWordIndex((prev) => (prev + 1) % rotatingWords.length);
                setIsAnimating(false);
            }, 500);
        }, 3000);

        return () => clearInterval(interval);
    }, []);

    return (
        <section className="relative min-h-screen overflow-hidden flex items-end pb-24 md:pb-32">
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
                {/* Gradient overlay — dark at bottom for text, subtle blue tint */}
                <div className="absolute inset-0 bg-gradient-to-t from-black via-black/60 to-[#045F85]/20" />
                <div className="absolute inset-0 bg-gradient-to-r from-black/40 to-transparent" />
            </div>

            {/* Content */}
            <div className="container mx-auto px-6 md:px-10 relative z-10 max-w-6xl">
                {/* Descriptor badge */}
                <div
                    className={`mb-6 ${mounted ? 'animate-fade-slide-up' : 'opacity-0'}`}
                >
                    <span
                        className="inline-block px-4 py-1.5 rounded-md text-xs font-semibold tracking-[0.3em] uppercase bg-[#045F85]/80 text-white/90 backdrop-blur-sm border border-[#045F85]/50"
                    >
                        Recruitment
                    </span>
                </div>

                {/* Main heading */}
                <h1
                    className={`text-5xl sm:text-6xl md:text-7xl lg:text-8xl font-bold tracking-tight leading-[0.95] mb-5 text-white ${mounted ? 'animate-fade-slide-up delay-100' : 'opacity-0'}`}
                >
                    We are{' '}
                    <span className="relative inline-block">
                        <span
                            className={`inline-block transition-all duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] ${
                                isAnimating
                                    ? 'opacity-0 translate-y-6 scale-95'
                                    : 'opacity-100 translate-y-0 scale-100'
                            }`}
                            style={{ color: 'var(--lhr-gold)' }}
                        >
                            {rotatingWords[currentWordIndex]}
                        </span>
                        {/* Accent underline */}
                        <span
                            className="absolute -bottom-1 left-0 right-0 h-[3px] rounded-full"
                            style={{
                                background: 'linear-gradient(90deg, var(--lhr-gold), var(--lhr-orange))'
                            }}
                        />
                    </span>
                </h1>

                {/* Subtext */}
                <p
                    className={`font-urbanist text-lg md:text-xl text-white/70 max-w-xl leading-relaxed mb-10 ${mounted ? 'animate-fade-slide-up delay-200' : 'opacity-0'}`}
                >
                    Join one of UT Austin&apos;s oldest student organizations. Design, build, and
                    race high-performance vehicles — and grow your engineering skills along the way.
                </p>

                {/* CTAs */}
                <div
                    className={`flex flex-col sm:flex-row items-start gap-4 ${mounted ? 'animate-fade-slide-up delay-300' : 'opacity-0'}`}
                >
                    <Link
                        href="/apply"
                        className="group relative h-13 px-9 rounded-lg font-semibold text-sm tracking-wide flex items-center justify-center transition-all duration-300 overflow-hidden"
                        style={{ backgroundColor: 'var(--lhr-gold)', color: '#000' }}
                    >
                        <span className="relative z-10 flex items-center gap-2">
                            Apply Now
                            <svg className="w-4 h-4 transition-transform duration-300 group-hover:translate-x-1" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
                            </svg>
                        </span>
                        <span
                            className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300"
                            style={{ background: 'linear-gradient(135deg, var(--lhr-gold), var(--lhr-orange))' }}
                        />
                    </Link>
                    <Link
                        href="/about"
                        className="h-13 px-9 rounded-lg border border-white/20 text-white font-medium text-sm tracking-wide flex items-center justify-center hover:bg-white/8 hover:border-white/30 transition-all duration-300 backdrop-blur-sm"
                    >
                        Learn More
                    </Link>
                </div>

                {/* Team stripe accents — bottom of hero */}
                <div
                    className={`flex gap-2 mt-16 ${mounted ? 'animate-fade-in delay-600' : 'opacity-0'}`}
                >
                    <div className="h-1 w-16 rounded-full animate-stripe-reveal delay-700" style={{ backgroundColor: 'var(--lhr-gold-light)' }} />
                    <div className="h-1 w-16 rounded-full animate-stripe-reveal delay-800" style={{ backgroundColor: 'var(--lhr-gold)' }} />
                    <div className="h-1 w-16 rounded-full animate-stripe-reveal delay-900" style={{ backgroundColor: 'var(--lhr-orange)' }} />
                </div>
            </div>
        </section>
    );
}
