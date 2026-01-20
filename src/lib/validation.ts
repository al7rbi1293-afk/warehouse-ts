/**
 * Input validation and sanitization utilities
 */

// Sanitize string input - removes potentially dangerous characters
export function sanitizeString(input: string): string {
    if (!input) return "";
    return input
        .trim()
        .replace(/[<>]/g, "") // Remove angle brackets (XSS prevention)
        .substring(0, 1000); // Limit length
}

// Validate username - alphanumeric + underscore only
export function isValidUsername(username: string): boolean {
    if (!username || username.length < 3 || username.length > 50) return false;
    return /^[a-zA-Z0-9_]+$/.test(username);
}

// Validate password strength
export function isStrongPassword(password: string): { valid: boolean; message: string } {
    if (!password || password.length < 8) {
        return { valid: false, message: "Password must be at least 8 characters" };
    }
    if (password.length > 100) {
        return { valid: false, message: "Password is too long" };
    }
    // Check for at least one number
    if (!/\d/.test(password)) {
        return { valid: false, message: "Password must contain at least one number" };
    }
    return { valid: true, message: "" };
}

// Validate email format
export function isValidEmail(email: string): boolean {
    if (!email) return false;
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

// Validate positive integer
export function isPositiveInteger(value: unknown): boolean {
    if (typeof value === "number") {
        return Number.isInteger(value) && value >= 0;
    }
    if (typeof value === "string") {
        const num = parseInt(value, 10);
        return !isNaN(num) && num >= 0;
    }
    return false;
}

// Sanitize number input
export function sanitizeNumber(input: unknown, defaultValue: number = 0): number {
    if (typeof input === "number" && !isNaN(input)) {
        return Math.max(0, Math.floor(input));
    }
    if (typeof input === "string") {
        const num = parseInt(input, 10);
        return isNaN(num) ? defaultValue : Math.max(0, Math.floor(num));
    }
    return defaultValue;
}
