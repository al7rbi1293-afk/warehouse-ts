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
                const customUser = user as {
                    id: string;
                    username: string;
                    role: string;
                    region: string | null;
                    shiftId: number | null;
                    allowedShifts: string | null;
                    shiftName: string | null;
                };
                token.id = customUser.id;
                token.username = customUser.username;
                token.role = customUser.role;
                token.region = customUser.region;
                token.shiftId = customUser.shiftId;
                token.allowedShifts = customUser.allowedShifts;
                token.shiftName = customUser.shiftName;
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
