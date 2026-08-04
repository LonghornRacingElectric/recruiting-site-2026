"use client";

import { usePathname } from "next/navigation";
import { ReactNode, useEffect, useRef } from "react";
import posthog from "posthog-js";
import { useUser } from "@/hooks/useUser";

function PostHogIdentity() {
  const { user } = useUser();
  const identifiedUserId = useRef<string | null>(null);

  useEffect(() => {
    if (!user || identifiedUserId.current === user.uid) return;

    posthog.identify(user.uid, {
      email: user.email,
      name: user.name,
      role: user.role,
    });
    identifiedUserId.current = user.uid;
  }, [user]);

  return null;
}

export default function PublicShell({
  header,
  footer,
  children,
}: {
  header: ReactNode;
  footer: ReactNode;
  children: ReactNode;
}) {
  const pathname = usePathname();
  const isAdmin = pathname.startsWith("/admin");

  return (
    <>
      <PostHogIdentity />
      {header}
      {children}
      {!isAdmin && footer}
    </>
  );
}
