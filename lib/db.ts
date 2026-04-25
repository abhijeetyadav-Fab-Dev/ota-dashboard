// Re-export Prisma client for backward compatibility
export { db } from "@/lib/prisma";

// For routes that still use getDb(), provide a compatibility shim
import { db } from "@/lib/prisma";
export const getDb = () => db;