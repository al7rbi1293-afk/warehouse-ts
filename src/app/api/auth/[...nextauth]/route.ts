import NextAuth from "next-auth";
import { authOptions } from "@/lib/auth";

export const preferredRegion = "fra1";

const handler = NextAuth(authOptions);

export { handler as GET, handler as POST };
