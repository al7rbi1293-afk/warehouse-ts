import "next-auth";

declare module "next-auth" {
    interface User {
        id: string;
        username: string;
        role: string;
        region?: string | null;
        regions?: string | null;
        shiftId?: number | null;
        attendanceShiftId?: number | null;
        allowedShifts?: string | null;
        shiftName?: string | null;
        employeeId?: string | null;
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
        regions?: string | null;
        shiftId?: number | null;
        attendanceShiftId?: number | null;
        allowedShifts?: string | null;
        shiftName?: string | null;
        employeeId?: string | null;
    }
}
