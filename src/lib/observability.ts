type ObservabilityContext = Record<string, unknown>;

function toErrorObject(error: unknown) {
    if (error instanceof Error) {
        return {
            name: error.name,
            message: error.message,
            stack: error.stack,
        };
    }

    return {
        message: String(error),
    };
}

export function logServerInfo(event: string, context: ObservabilityContext = {}) {
    console.info(
        JSON.stringify({
            level: "INFO",
            event,
            context,
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
            context,
            error: toErrorObject(error),
            timestamp: new Date().toISOString(),
        })
    );
}
