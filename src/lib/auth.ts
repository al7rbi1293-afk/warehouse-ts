import { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import { PrismaAdapter } from "@next-auth/prisma-adapter";
import { prisma } from "./prisma";
import { compare, hash } from "bcryptjs";

export const hashPassword = async (password: string) => {
    return await hash(password, 12);
};

export const authOptions: NextAuthOptions = {
    adapter: PrismaAdapter(prisma),
    session: {
        strategy: "jwt",
    },
    pages: {
        signIn: "/login",
    },
    providers: [
        CredentialsProvider({
            name: "credentials",
            credentials: {
                username: { label: "Username", type: "text" },
                password: { label: "Password", type: "password" },
            },
            async authorize(credentials) {
                if (!credentials?.username || !credentials?.password) {
                    throw new Error("Invalid credentials");
                }

                const user = await prisma.user.findUnique({
                    where: {
                        username: credentials.username,
                    },
                    include: {
                        shift: true
                    }
                });

                if (!user || !user.password) {
                    throw new Error("Invalid credentials");
                }

                const isCorrectPassword = await compare(
                    credentials.password,
                    user.password
                );

                if (!isCorrectPassword) {
                    throw new Error("Invalid credentials");
                }

                return {
                    id: user.id.toString(),
                    name: user.name,
                    email: user.username, // Using username as email for NextAuth compatibility if needed, or just mapped
                    username: user.username,
                    role: user.role,
                    region: user.region,
                    regions: user.regions,
                    shiftId: user.shiftId,
                    attendanceShiftId: user.attendanceShiftId,
                    allowedShifts: user.allowedShifts,
                    shiftName: user.shift?.name
                };
            },
        }),
    ],
    callbacks: {
        async jwt({ token, user, trigger, session }) {
            if (trigger === "update" && session?.name) {
                token.name = session.name;
            }

            if (user) {
                token.id = user.id;
                token.username = (user as any).username;
                token.role = (user as any).role;
                token.region = (user as any).region;
                token.shiftId = (user as any).shiftId;
                token.allowedShifts = (user as any).allowedShifts;
                token.shiftName = (user as any).shiftName;
            }
            return token;
        },
        async session({ session, token }) {
            if (token) {
                session.user.id = token.id as string;
                session.user.username = token.username as string;
                session.user.role = token.role as string;
                session.user.region = token.region as string;
                session.user.shiftId = token.shiftId as number;
                session.user.allowedShifts = token.allowedShifts as string | null;
                session.user.shiftName = token.shiftName as string | null;
            }
            return session;
        }
    }
};
