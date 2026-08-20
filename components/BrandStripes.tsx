/**
 * The three-stripe brand mark (light amber / mid amber / deep orange) from
 * the LHR shortmark, used as the house accent under headings and section
 * intros. Server-safe — no client JS.
 */
export default function BrandStripes({
  className = "",
  barClassName = "h-1 w-10 rounded-full",
  animated = false,
}: {
  className?: string;
  barClassName?: string;
  animated?: boolean;
}) {
  const bars = [
    { color: "var(--lhr-gold-light)", delay: "delay-100" },
    { color: "var(--lhr-gold)", delay: "delay-200" },
    { color: "var(--lhr-orange)", delay: "delay-300" },
  ];
  return (
    <div className={`flex gap-2 ${className}`} aria-hidden="true">
      {bars.map((bar, i) => (
        <div
          key={i}
          className={`${barClassName} ${animated ? `animate-stripe-reveal ${bar.delay}` : ""}`}
          style={{ backgroundColor: bar.color }}
        />
      ))}
    </div>
  );
}
