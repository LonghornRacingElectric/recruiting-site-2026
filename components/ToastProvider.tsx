"use client";

import { Toaster } from "react-hot-toast";

export default function ToastProvider() {
  return (
    <Toaster
      position="bottom-right"
      toastOptions={{
        duration: 4000,
        style: {
          background: "#171717",
          color: "#fff",
          border: "1px solid rgba(255, 255, 255, 0.1)",
          borderRadius: "8px",
        },
        success: {
          iconTheme: {
            primary: "#22c55e",
            secondary: "#171717",
          },
        },
        error: {
          iconTheme: {
            primary: "#ef4444",
            secondary: "#171717",
          },
        },
      }}
    />
  );
}
