import { cn } from "@/lib/utils";

/** Orange outline house/document mark + "Tradeslip" wordmark (20/600). */
function Logo({
  className,
  wordmarkClassName,
  showWordmark = true,
}: {
  className?: string;
  wordmarkClassName?: string;
  showWordmark?: boolean;
}) {
  return (
    <span className={cn("inline-flex items-center gap-2.5", className)}>
      <svg
        width="32"
        height="32"
        viewBox="0 0 32 32"
        fill="none"
        aria-hidden="true"
        className="shrink-0 text-accent"
      >
        <path
          d="M5.5 14.2 16 5.5l10.5 8.7V25a2.5 2.5 0 0 1-2.5 2.5H8A2.5 2.5 0 0 1 5.5 25V14.2Z"
          stroke="currentColor"
          strokeWidth="2.25"
          strokeLinejoin="round"
        />
        <path d="M11.5 19.5h9M11.5 23h5.5" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" />
      </svg>
      {showWordmark ? (
        <span className={cn("text-[20px] leading-7 font-semibold tracking-[-0.01em] text-text", wordmarkClassName)}>
          Tradeslip
        </span>
      ) : null}
    </span>
  );
}

export { Logo };
