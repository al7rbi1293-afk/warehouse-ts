import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { SettingsClient } from "./SettingsClient";
import { UserRole } from "@/types";

export default async function SettingsPage() {
    const session = await getServerSession(authOptions);

    if (!session) {
        redirect("/login");
    }

    // Fetch fresh user data
    const user = await prisma.user.findUnique({
        where: { username: session.user.username },
        include: { shift: true }
    });

    if (!user) {
        redirect("/login");
    }

    // Transform to match User type interface
    const userProps = {
        ...user,
        role: user.role as UserRole,
        shiftName: user.shift?.name || null,
        createdAt: user.createdAt
    };

    return <SettingsClient user={userProps} />;
}
