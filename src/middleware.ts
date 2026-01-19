import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";

// Add security headers to all responses
function addSecurityHeaders(response: NextResponse) {
    // Prevent XSS attacks
    response.headers.set("X-XSS-Protection", "1; mode=block");

    // Prevent clickjacking
    response.headers.set("X-Frame-Options", "DENY");

    // Prevent MIME type sniffing
    response.headers.set("X-Content-Type-Options", "nosniff");

    // Referrer policy
    response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");

    // Permissions policy
    response.headers.set(
        "Permissions-Policy",
        "camera=(), microphone=(), geolocation=()"
    );

    return response;
}

export async function middleware(request: NextRequest) {
    const { pathname } = request.nextUrl;

    // Skip static files and API auth routes
    if (
        pathname.startsWith("/_next") ||
        pathname.startsWith("/api/auth") ||
        pathname.includes(".")
    ) {
        return NextResponse.next();
    }

    // Check authentication for protected routes
    const protectedRoutes = ["/dashboard", "/warehouse", "/manpower"];
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
