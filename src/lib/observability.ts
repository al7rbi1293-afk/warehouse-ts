type ObservabilityContext = Record<string, unknown>;

function redactSensitiveText(value: string) {
    return value
        .replace(/postgres(?:ql)?:\/\/[^@\s]+@/gi, "postgresql://<redacted>@")
        .replace(
            /\b(password|pwd|secret|token|key|service_role_key|anon_key)=([^&\s]+)/gi,
            "$1=<redacted>"
        )
        .replace(
            /\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g,
            "<redacted-jwt>"
        );
}

function sanitizeLogValue(value: unknown): unknown {
    if (typeof value === "string") {
        return redactSensitiveText(value);
    }

    if (Array.isArray(value)) {
        return value.map(sanitizeLogValue);
    }

    if (value && typeof value === "object") {
        return Object.fromEntries(
            Object.entries(value as Record<string, unknown>).map(([key, entry]) => [
                key,
                sanitizeLogValue(entry),
            ])
        );
    }

    return value;
}

function toErrorObject(error: unknown) {
    if (error instanceof Error) {
        return {
            name: error.name,
            message: redactSensitiveText(error.message),
            stack: error.stack ? redactSensitiveText(error.stack) : undefined,
        };
    }

    return {
        message: redactSensitiveText(String(error)),
    };
}

export function logServerInfo(event: string, context: ObservabilityContext = {}) {
    console.info(
        JSON.stringify({
            level: "INFO",
            event,
            context: sanitizeLogValue(context),
            timestamp: new Date().toISOString(),
        })
    );
}

export function logServerError(
    event: string,
    error: unknown,
    context: ObservabilityContext = {}
) {
    console.error(
        JSON.stringify({
            level: "ERROR",
            event,
            context: sanitizeLogValue(context),
            error: toErrorObject(error),
            timestamp: new Date().toISOString(),
        })
    );
}
