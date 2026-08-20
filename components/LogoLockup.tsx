import Image from "next/image";

/**
 * The LHR logo with the "RECRUITING" descriptor beneath it, per the brand
 * book's logo-descriptor lockup rules: Montserrat, all caps, brand colors,
 * kerned and sized to match the width of the logo. Kerning is done by
 * justifying the letters across the logo's exact width (flex space-between).
 * Full-color logo on light themes, all-white variant on dark (via the
 * .logo-on-* swap classes in globals.css).
 */
const DESCRIPTOR = "RECRUITING";

const SIZES = {
  sm: { logo: "h-6", width: 117, height: 24, text: "text-[12px]", gap: "mt-[3px]" },
  md: { logo: "h-8", width: 156, height: 32, text: "text-[16px]", gap: "mt-1" },
} as const;

export default function LogoLockup({ size = "sm" }: { size?: keyof typeof SIZES }) {
  const s = SIZES[size];
  return (
    <span className="inline-block">
      <Image
        src="/logo.svg"
        alt="Longhorn Racing Recruiting"
        width={s.width}
        height={s.height}
        className={`logo-on-light ${s.logo} w-auto`}
      />
      <Image
        src="/logo-white.svg"
        alt="Longhorn Racing Recruiting"
        width={s.width}
        height={s.height}
        className={`logo-on-dark ${s.logo} w-auto`}
      />
      <span
        aria-hidden="true"
        className={`flex justify-between ${s.text} ${s.gap} font-sans leading-none select-none`}
        style={{ color: "var(--pub-heading-accent)", fontWeight: 525 }}
      >
        {DESCRIPTOR.split("").map((ch, i) => (
          <span
            key={i}
            style={
              // Nudge the first/last glyphs' ink onto the logo's left (L stem)
              // and right (stripe) edges.
              i === 0
                ? { marginLeft: "-0.02em" }
                : i === DESCRIPTOR.length - 1
                  ? { marginRight: "-0.01em" }
                  : undefined
            }
          >
            {ch}
          </span>
        ))}
      </span>
    </span>
  );
}
