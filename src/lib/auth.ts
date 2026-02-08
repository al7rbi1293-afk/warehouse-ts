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
                    select: {
                        id: true,
                        username: true,
                        password: true,
                        name: true,
                        role: true,
                        region: true,
                        regions: true,
                        shiftId: true,
                        attendanceShiftId: true,
                        allowedShifts: true,
                        shift: {
                            select: {
                                name: true
                            }
                        }
                        // employeeId: true // Excluded to prevent crash if column missing
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
                    shiftName: user.shift?.name,
                    employeeId: (user as { employeeId?: string | null }).employeeId
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
                token.username = user.username;
                token.role = user.role;
                token.region = user.region;
                token.regions = user.regions;
                token.shiftId = user.shiftId;
                token.attendanceShiftId = user.attendanceShiftId;
                token.allowedShifts = user.allowedShifts;
                token.shiftName = user.shiftName;
                token.employeeId = user.employeeId;
            }
            return token;
        },
        async session({ session, token }) {
            if (token) {
                session.user.id = token.id as string;
                session.user.username = token.username as string;
                session.user.role = token.role as string;
                session.user.region = token.region as string;
                session.user.regions = token.regions as string | null; // Restore regions
                session.user.shiftId = token.shiftId as number;
                session.user.attendanceShiftId = token.attendanceShiftId as number | null; // Restore attendanceShiftId
                session.user.allowedShifts = token.allowedShifts as string | null;
                session.user.shiftName = token.shiftName as string | null;
                session.user.employeeId = token.employeeId as string | null; // Add employeeId to session
            }
            return session;
        }
    }
};
