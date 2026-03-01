const FALLBACK_SITE_URL = "https://warehouse-ts.vercel.app";
const LOCAL_HOSTNAMES = new Set(["localhost", "127.0.0.1", "0.0.0.0"]);

export function getSiteUrl() {
    const vercelProductionUrl = process.env.VERCEL_PROJECT_PRODUCTION_URL
        ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
        : undefined;

    const candidates = [
        process.env.NEXT_PUBLIC_SITE_URL,
        vercelProductionUrl,
        process.env.NEXTAUTH_URL,
        FALLBACK_SITE_URL,
    ];

    for (const candidate of candidates) {
        if (!candidate) {
            continue;
        }

        try {
            const parsed = new URL(candidate);
            if (LOCAL_HOSTNAMES.has(parsed.hostname)) {
                continue;
            }
            return parsed.origin;
        } catch {
            continue;
        }
    }

    return FALLBACK_SITE_URL;
}
