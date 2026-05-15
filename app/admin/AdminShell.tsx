"use client";

export function AdminShell({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="min-h-screen font-sans"
      style={{
        background: 'var(--admin-bg, #030608)',
        color: 'var(--admin-text-primary, #ffffff)',
      }}
    >
      <main>{children}</main>
    </div>
  );
}
