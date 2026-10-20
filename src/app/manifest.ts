import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "CSC Records Management System",
    short_name: "CSC RMS",
    description: "Digitize, classify, search and govern Civil Service Commission records.",
    start_url: "/dashboard",
    scope: "/",
    display: "standalone",
    orientation: "any",
    background_color: "#f7f8fc",
    theme_color: "#1e3378",
    categories: ["productivity", "government", "business"],
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [
      { name: "Search records", url: "/records" },
      { name: "New intake", url: "/intake" },
    ],
  };
}
