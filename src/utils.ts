// Homebridge plugin for AEG RX 9 / Electrolux Pure i9 robot vacuum
// Copyright © 2022-2023 Alexander Thoukydides

import { IErrorDetail } from 'ts-interface-checker';
import assert from 'assert';

import { Logger } from 'homebridge';
import { AEGAPIError } from './aegapi-error';

// Type assertions
export function assertIsString(value: unknown): asserts value is string {
    assert(typeof value === 'string');
}
export function assertIsNumber(value: unknown): asserts value is number {
    assert(typeof value === 'number');
}
export function assertIsBoolean(value: unknown): asserts value is boolean {
    assert(typeof value === 'boolean');
}

// Wait for the next iteration of the event loop
export function immediate(): Promise<void> {
    return new Promise(resolve => setImmediate(resolve));
}

// Sleep for a specified period
export function sleep(ms: number, abort?: Promise<never>): Promise<void> {
    return new Promise((resolve, reject) => {
        setTimeout(resolve, Math.max(ms, 0));
        if (abort) abort.catch(reason => reject(reason));
    });
}

// Log an error
export function logError(log: Logger, when: string, err: unknown): void {
    try {
        // Log the error message itself
        log.error(`[${when}] ${err}`);

        // Log any history of causes for the error
        let cause = err;
        let prefix = ' '.repeat(when.length + 3);
        while ((cause instanceof AEGAPIError) && cause.errCause) {
            cause = cause.errCause;
            log.error(`${prefix}└─ ${cause}`);
            prefix += '   ';
        }

        // Log any stack backtrace
        if (err instanceof Error && err.stack) log.debug(err.stack);
    } catch { /*empty */ }
}

// Format a millisecond duration
export function formatDuration(ms: number, maxParts = 2): string {
    if (ms < 1) return 'n/a';

    // Split the duration into components
    const duration: Record<string, number> = {
        day:            Math.floor(ms / (24 * 60 * 60 * 1000)),
        hour:           Math.floor(ms /      (60 * 60 * 1000)) % 24,
        minute:         Math.floor(ms /           (60 * 1000)) % 60,
        second:         Math.floor(ms /                 1000 ) % 60,
        millisecond:    Math.floor(ms                        ) % 1000
    };

    // Remove any leading zero components
    const keys = Object.keys(duration);
    while (keys.length && duration[keys[0]] === 0) keys.shift();

    // Combine the required number of remaining components
    return keys.slice(0, maxParts)
        .filter(key => duration[key] !== 0)
        .map(key => `${duration[key]} ${key}${duration[key] === 1 ? '' : 's'}`)
        .join(', ');
}

// Format strings in columns
export function columns(rows: string[][], separator = '  '): string[] {
    // Determine the required column widths
    const width: number[] = [];
    rows.forEach(row => {
        row.forEach((value, index) => {
            width[index] = Math.max(width[index] || 0, value.length);
        });
    });
    width.splice(-1, 1, 0);

    // Format the rows
    return rows.map(row => row.map((value, index) => value.padEnd(width[index])).join(separator));
}

// Recursive object assignment, skipping undefined values
export function deepMerge(...objects: object[]): object {
    const isObject = (value: unknown): value is object =>
        value !== undefined && typeof value === 'object' && !Array.isArray(value);
    return objects.reduce((acc: Record<string, unknown>, object: object) => {
        Object.entries(object).forEach(([key, value]) => {
            const accValue = acc[key];
            if (value === undefined) return;
            if (isObject(accValue) && isObject(value)) acc[key] = deepMerge(accValue, value);
            else acc[key] = value;
        });
        return acc;
    }, {});
}

// Convert checker validation error into lines of text
export function getValidationTree(errors: IErrorDetail[]): string[] {
    const lines: string[] = [];
    errors.forEach((error, index) => {
        const prefix = (a: string, b: string): string => index < errors.length - 1 ? a : b;
        lines.push(`${prefix('├─ ', '└─ ')}${error.path} ${error.message}`);
        if (error.nested) {
            const nested = getValidationTree(error.nested);
            lines.push(...nested.map(line => `${prefix('│  ', '   ')} ${line}`));
        }
    });
    return lines;
}

// Greatest common divisor using the Euclidean algorithm
export function gcd(...values: number[]): number {
    assert(0 < values.length);
    if (values.length === 1) return values[0];
    const [a, b] = values.splice(0, 2);
    if (!values.length) return b === 0 ? a : gcd(b, a % b);
    else return gcd(gcd(a, b), ...values);
}