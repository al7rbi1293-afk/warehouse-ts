"use client";

import { useState, useEffect, useCallback, useRef } from "react";

/**
 * Debounce hook - delays value update until after specified delay
 * Use for search inputs, filters, etc.
 */
export function useDebounce<T>(value: T, delay: number): T {
    const [debouncedValue, setDebouncedValue] = useState<T>(value);

    useEffect(() => {
        const timer = setTimeout(() => {
            setDebouncedValue(value);
        }, delay);

        return () => {
            clearTimeout(timer);
        };
    }, [value, delay]);

    return debouncedValue;
}

/**
 * Throttled callback - ensures function is not called more than once per delay
 * Use for submit buttons to prevent double-submission
 */
export function useThrottledCallback<T extends (...args: unknown[]) => unknown>(
    callback: T,
    delay: number
): (...args: Parameters<T>) => void {
    const lastRun = useRef<number>(0);
    const timeoutRef = useRef<NodeJS.Timeout | null>(null);

    return useCallback(
        (...args: Parameters<T>) => {
            const now = Date.now();
            const timeSinceLastRun = now - lastRun.current;

            if (timeSinceLastRun >= delay) {
                lastRun.current = now;
                callback(...args);
            } else if (!timeoutRef.current) {
                // Schedule the call for later
                timeoutRef.current = setTimeout(() => {
                    lastRun.current = Date.now();
                    callback(...args);
                    timeoutRef.current = null;
                }, delay - timeSinceLastRun);
            }
        },
        [callback, delay]
    );
}

/**
 * Hook to prevent double-submission on async operations
 * Returns [isLoading, wrappedAsyncFn]
 */
export function useAsyncAction<T extends (...args: unknown[]) => Promise<unknown>>(
    asyncFn: T,
    onSuccess?: (result: unknown) => void,
    onError?: (error: Error) => void
): [boolean, (...args: Parameters<T>) => Promise<void>] {
    const [isLoading, setIsLoading] = useState(false);
    const isMounted = useRef(true);

    useEffect(() => {
        isMounted.current = true;
        return () => {
            isMounted.current = false;
        };
    }, []);

    const wrappedFn = useCallback(
        async (...args: Parameters<T>) => {
            if (isLoading) return; // Prevent double submission

            setIsLoading(true);
            try {
                const result = await asyncFn(...args);
                if (isMounted.current) {
                    onSuccess?.(result);
                }
            } catch (error) {
                if (isMounted.current) {
                    onError?.(error instanceof Error ? error : new Error(String(error)));
                }
            } finally {
                if (isMounted.current) {
                    setIsLoading(false);
                }
            }
        },
        [asyncFn, isLoading, onSuccess, onError]
    );

    return [isLoading, wrappedFn];
}

/**
 * Simple debounced callback for event handlers
 */
export function useDebouncedCallback<T extends (...args: unknown[]) => unknown>(
    callback: T,
    delay: number
): (...args: Parameters<T>) => void {
    const timeoutRef = useRef<NodeJS.Timeout | null>(null);

    return useCallback(
        (...args: Parameters<T>) => {
            if (timeoutRef.current) {
                clearTimeout(timeoutRef.current);
            }
            timeoutRef.current = setTimeout(() => {
                callback(...args);
            }, delay);
        },
        [callback, delay]
    );
}
