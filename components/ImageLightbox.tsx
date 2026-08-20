"use client";

import Image from "next/image";
import { useCallback, useEffect, useState } from "react";
import { X } from "lucide-react";

/**
 * Click-to-fullscreen image. The thumbnail is a button; opening it shows the
 * image over a blurred, dimmed backdrop. Closes via the X button, clicking
 * the backdrop, or the Escape key. Body scroll is locked while open.
 */
export default function ImageLightbox({
  src,
  alt,
  width,
  height,
  sizes,
  thumbClassName = "",
}: {
  src: string;
  alt: string;
  width: number;
  height: number;
  sizes?: string;
  thumbClassName?: string;
}) {
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    window.addEventListener("keydown", onKey);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = previousOverflow;
    };
  }, [open, close]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={`View full screen: ${alt}`}
        className="block w-full cursor-zoom-in"
      >
        <Image
          src={src}
          alt={alt}
          width={width}
          height={height}
          sizes={sizes}
          className={`w-full h-auto ${thumbClassName}`}
        />
      </button>

      {open && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={alt}
          onClick={close}
          className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-10 animate-fade-in cursor-zoom-out"
          style={{
            backgroundColor: "var(--pub-scrim)",
            backdropFilter: "blur(14px)",
            WebkitBackdropFilter: "blur(14px)",
            animationDuration: "0.2s",
          }}
        >
          <button
            type="button"
            onClick={close}
            aria-label="Close full screen image"
            className="absolute top-4 right-4 z-10 w-10 h-10 rounded-full flex items-center justify-center transition-opacity duration-150 hover:opacity-80 cursor-pointer"
            style={{ backgroundColor: "rgba(8, 22, 32, 0.6)", color: "#fff" }}
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
          <Image
            src={src}
            alt={alt}
            width={width}
            height={height}
            sizes="100vw"
            onClick={(e) => e.stopPropagation()}
            className="w-auto h-auto max-w-full max-h-[88vh] rounded-lg animate-scale-in cursor-auto"
            style={{
              boxShadow: "0 24px 80px rgba(0, 0, 0, 0.45)",
              animationDuration: "0.25s",
            }}
          />
        </div>
      )}
    </>
  );
}
