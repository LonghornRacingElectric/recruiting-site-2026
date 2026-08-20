import type { MetadataRoute } from "next";

// Public, indexable pages only. Authenticated surfaces (/apply, /dashboard,
// /admin, /auth) are excluded here and disallowed in robots.ts.
export default function sitemap(): MetadataRoute.Sitemap {
  const base = "https://lhrrecruiting.org";

  return [
    { url: `${base}/`, changeFrequency: "weekly", priority: 1 },
    { url: `${base}/teams`, changeFrequency: "monthly", priority: 0.9 },
    { url: `${base}/timeline`, changeFrequency: "weekly", priority: 0.9 },
    { url: `${base}/about`, changeFrequency: "monthly", priority: 0.8 },
    { url: `${base}/faq`, changeFrequency: "monthly", priority: 0.8 },
    { url: `${base}/contact`, changeFrequency: "yearly", priority: 0.5 },
    { url: `${base}/privacy`, changeFrequency: "yearly", priority: 0.2 },
    { url: `${base}/terms`, changeFrequency: "yearly", priority: 0.2 },
  ];
}
