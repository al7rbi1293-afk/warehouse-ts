import "next-auth";

declare module "next-auth" {
    interface User {
        id: string;
        username: string;
        role: string;
        region?: string | null;
        shiftId?: number | null;
        allowedShifts?: string | null;
        shiftName?: string | null;
    }

    interface Session {
        user: User;
    }
}

declare module "next-auth/jwt" {
    interface JWT {
        id: string;
        username: string;
        role: string;
        region?: string | null;
        shiftId?: number | null;
        allowedShifts?: string | null;
        shiftName?: string | null;
    }
}
