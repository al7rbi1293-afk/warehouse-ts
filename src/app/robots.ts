import type { MetadataRoute } from "next";
import { getSiteUrl } from "@/lib/siteUrl";

export default function robots(): MetadataRoute.Robots {
    const siteUrl = getSiteUrl();

    return {
        rules: {
            userAgent: "*",
            allow: ["/", "/login"],
            disallow: ["/debug-db", "/api/", "/dashboard", "/manpower", "/reports", "/settings", "/warehouse"],
        },
        sitemap: `${siteUrl}/sitemap.xml`,
        host: siteUrl,
    };
}
