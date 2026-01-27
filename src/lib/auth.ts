import { NextAuthOptions, DefaultSession } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import { prisma } from "./prisma";

// Extend session types
declare module "next-auth" {
    interface Session extends DefaultSession {
        user: {
            username: string;
            name: string;
            role: string;
            region: string;
            shiftId: number | null;
            shiftName: string | null;
            dbId: number;
        } & DefaultSession["user"];
    }

    interface User {
        username: string;
        name: string;
        role: string;
        region: string;
        shiftId: number | null;
        shiftName: string | null;
        dbId: number;
    }
}

declare module "next-auth/jwt" {
    interface JWT {
        username: string;
        name: string;
        role: string;
        region: string;
        shiftId: number | null;
        shiftName: string | null;
        dbId: number;
    }
}

// Legacy SHA256 hash function for backward compatibility
function hashSHA256(password: string): string {
    return crypto.createHash("sha256").update(password).digest("hex");
}

// Verify password supporting bcrypt, SHA256, and plain text
async function verifyPassword(
    storedPassword: string,
    providedPassword: string
): Promise<boolean> {
    // 1. Try bcrypt first (new secure format - starts with $2)
    if (storedPassword.startsWith("$2")) {
        try {
            return await bcrypt.compare(providedPassword, storedPassword);
        } catch {
            return false;
        }
    }

    // 2. Try SHA256 (legacy - 64 character hex string)
    if (storedPassword.length === 64) {
        if (storedPassword === hashSHA256(providedPassword)) {
            return true;
        }
    }

    // 3. Plain text fallback (very old legacy)
    if (storedPassword === providedPassword) {
        return true;
    }

    return false;
}

// Hash password using bcrypt
export async function hashPassword(password: string): Promise<string> {
    return bcrypt.hash(password, 10);
}

export const authOptions: NextAuthOptions = {
    providers: [
        CredentialsProvider({
            name: "Credentials",
            credentials: {
                username: { label: "Username", type: "text" },
                password: { label: "Password", type: "password" },
            },
            async authorize(credentials) {
                if (!credentials?.username || !credentials?.password) {
                    return null;
                }

                try {
                    const user = await prisma.user.findUnique({
                        where: { username: credentials.username },
                        include: { shift: true },
                    });

                    if (!user) {
                        return null;
                    }

                    const isValid = await verifyPassword(
                        user.password,
                        credentials.password
                    );

                    if (!isValid) {
                        return null;
                    }

                    // Auto-migrate to bcrypt if using old password format
                    if (!user.password.startsWith("$2")) {
                        const newHash = await hashPassword(credentials.password);
                        await prisma.user.update({
                            where: { username: user.username },
                            data: { password: newHash },
                        });
                    }

                    return {
                        id: user.username,
                        username: user.username,
                        name: user.name || user.username,
                        role: user.role || "supervisor",
                        region: user.region || "",
                        shiftId: user.shiftId,
                        shiftName: user.shift?.name || null,
                        dbId: user.id
                    };
                } catch (error) {
                    console.error("Auth error:", error);
                    return null;
                }
            },
        }),
    ],
    callbacks: {
        async jwt({ token, user }) {
            if (user) {
                token.username = user.username;
                token.name = user.name;
                token.role = user.role;
                token.region = user.region;
                token.shiftId = user.shiftId;
                token.shiftName = user.shiftName;
                token.dbId = user.dbId;
            }
            return token;
        },
        async session({ session, token }) {
            session.user = {
                ...session.user,
                username: token.username,
                name: token.name,
                role: token.role,
                region: token.region,
                shiftId: token.shiftId,
                shiftName: token.shiftName,
                dbId: token.dbId,
            };

            // Check for active coverage
            try {
                if (token.dbId) {
                    const today = new Date();
                    const startOfDay = new Date(today.setHours(0, 0, 0, 0));
                    const endOfDay = new Date(today.setHours(23, 59, 59, 999));


                    const coverages = await prisma.staffAttendance.findMany({
                        where: {
                            coveredBy: token.dbId,
                            status: "Absent",
                            date: {
                                gte: startOfDay,
                                lte: endOfDay
                            }
                        },
                        include: { user: true }
                    });

                    if (coverages.length > 0) {
                        const coveredRegions = coverages
                            .map(c => c.user.region)
                            .filter(Boolean)
                            .join(",");

                        if (coveredRegions) {
                            const currentRegions = session.user.region ? session.user.region.split(",") : [];
                            const newRegions = coveredRegions.split(",");
                            const allRegions = Array.from(new Set([...currentRegions, ...newRegions].map(r => r.trim())));
                            session.user.region = allRegions.join(",");
                        }
                    }
                }
            } catch (e) {
                console.error("Session coverage error", e);
            }

            return session;
        },
    },
    pages: {
        signIn: "/login",
    },
    session: {
        strategy: "jwt",
        maxAge: 30 * 24 * 60 * 60, // 30 days
    },
    secret: process.env.NEXTAUTH_SECRET,
};
