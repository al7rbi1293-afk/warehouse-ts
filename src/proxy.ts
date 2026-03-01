import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";

const AUTH_RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000;
const AUTH_RATE_LIMIT_MAX_ATTEMPTS = 10;
const authAttemptStore = new Map<string, { count: number; resetAt: number }>();

function getClientIp(request: NextRequest) {
    const forwardedFor = request.headers.get("x-forwarded-for");
    if (forwardedFor) {
        return forwardedFor.split(",")[0]?.trim() || "unknown";
    }
    return request.headers.get("x-real-ip") || "unknown";
}

function isAuthRateLimited(key: string) {
    const now = Date.now();
    const record = authAttemptStore.get(key);

    if (!record || record.resetAt <= now) {
        authAttemptStore.set(key, { count: 1, resetAt: now + AUTH_RATE_LIMIT_WINDOW_MS });
        return false;
    }

    if (record.count >= AUTH_RATE_LIMIT_MAX_ATTEMPTS) {
        return true;
    }

    record.count += 1;
    authAttemptStore.set(key, record);
    return false;
}

function isCredentialAuthRoute(pathname: string) {
    return pathname === "/api/auth/callback/credentials";
}

// Add security headers to all responses
function addSecurityHeaders(response: NextResponse) {
    // Prevent XSS attacks
    response.headers.set("X-XSS-Protection", "1; mode=block");

    // Prevent clickjacking
    response.headers.set("X-Frame-Options", "DENY");

    // Prevent MIME type sniffing
    response.headers.set("X-Content-Type-Options", "nosniff");

    // Reduce cross-origin side channel risk
    response.headers.set("Cross-Origin-Opener-Policy", "same-origin");
    response.headers.set("Cross-Origin-Resource-Policy", "same-origin");

    // Referrer policy
    response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");

    // Permissions policy - disable unnecessary APIs
    response.headers.set(
        "Permissions-Policy",
        "camera=(), microphone=(), geolocation=(), payment=()"
    );

    // HTTP Strict Transport Security (HTTPS only)
    response.headers.set(
        "Strict-Transport-Security",
        "max-age=31536000; includeSubDomains"
    );

    // Content Security Policy - protect against XSS and injection
    response.headers.set(
        "Content-Security-Policy",
        "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; font-src 'self' data:; connect-src 'self' https:; frame-ancestors 'none';"
    );

    return response;
}

export async function proxy(request: NextRequest) {
    const { pathname } = request.nextUrl;

    // Skip static files
    if (
        pathname.startsWith("/_next") ||
        pathname.includes(".")
    ) {
        return NextResponse.next();
    }

    if (isCredentialAuthRoute(pathname)) {
        const ip = getClientIp(request);
        const rateLimitKey = `${ip}:${pathname}`;
        if (isAuthRateLimited(rateLimitKey)) {
            const retryAfterSeconds = Math.floor(AUTH_RATE_LIMIT_WINDOW_MS / 1000);
            const response = NextResponse.json(
                { error: "Too many login attempts. Please try again later." },
                { status: 429 }
            );
            response.headers.set("Retry-After", String(retryAfterSeconds));
            return addSecurityHeaders(response);
        }
    }

    // Check authentication for protected routes
    const protectedRoutes = ["/dashboard", "/warehouse", "/manpower", "/reports"];
    const isProtectedRoute = protectedRoutes.some((route) =>
        pathname.startsWith(route)
    );

    if (isProtectedRoute) {
        const token = await getToken({
            req: request,
            secret: process.env.NEXTAUTH_SECRET,
        });

        if (!token) {
            const loginUrl = new URL("/login", request.url);
            loginUrl.searchParams.set("callbackUrl", pathname);
            return NextResponse.redirect(loginUrl);
        }

        // Role-based access control
        const userRole = token.role as string;

        // Dashboard is manager only
        if (pathname.startsWith("/dashboard") && userRole !== "manager") {
            return NextResponse.redirect(new URL("/warehouse", request.url));
        }
    }

    // Add security headers
    const response = NextResponse.next();
    return addSecurityHeaders(response);
}

export const config = {
    matcher: [
        /*
         * Match all request paths except:
         * - _next/static (static files)
         * - _next/image (image optimization files)
         * - favicon.ico (favicon file)
         */
        "/((?!_next/static|_next/image|favicon.ico).*)",
    ],
};
