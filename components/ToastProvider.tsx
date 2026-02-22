"use client";

import { Toaster } from "react-hot-toast";

export default function ToastProvider() {
  return (
    <Toaster
      position="bottom-right"
      toastOptions={{
        duration: 4000,
        style: {
          background: "#0c1218",
          color: "rgba(255, 255, 255, 0.85)",
          border: "1px solid rgba(255, 255, 255, 0.06)",
          borderRadius: "10px",
          fontSize: "13px",
          fontFamily: "Urbanist, sans-serif",
          fontWeight: 500,
          padding: "12px 16px",
          boxShadow: "0 8px 32px rgba(0, 0, 0, 0.4)",
        },
        success: {
          iconTheme: {
            primary: "#4ade80",
            secondary: "#0c1218",
          },
          style: {
            borderColor: "rgba(34, 197, 94, 0.12)",
          },
        },
        error: {
          iconTheme: {
            primary: "#f87171",
            secondary: "#0c1218",
          },
          style: {
            borderColor: "rgba(239, 68, 68, 0.12)",
          },
        },
      }}
    />
  );
}
