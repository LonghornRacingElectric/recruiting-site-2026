import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      // Authenticated / internal surfaces — nothing here should be indexed.
      disallow: ["/admin", "/dashboard", "/apply", "/auth", "/api"],
    },
    sitemap: "https://lhrrecruiting.org/sitemap.xml",
  };
}
