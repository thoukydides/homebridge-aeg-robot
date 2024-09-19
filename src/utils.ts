// Homebridge plugin for AEG RX 9 / Electrolux Pure i9 robot vacuum
// Copyright © 2022-2023 Alexander Thoukydides

import { Logger } from 'homebridge';

import { IErrorDetail } from 'ts-interface-checker';
import assert from 'assert';

import { AEGAPIError } from './aegapi-error.js';

// Milliseconds in a second
export const MS = 1000;

// Type assertions
export function assertIsDefined<Type>(value: Type): asserts value is NonNullable<Type> {
    assert.notStrictEqual(value, undefined);
    assert.notStrictEqual(value, null);
}
export function assertIsNotUndefined<Type>(value: Type): asserts value is Exclude<Type, undefined> {
    assert.notStrictEqual(value, undefined);
}
export function assertIsUndefined(value: unknown): asserts value is undefined {
    assert.strictEqual(value, undefined);
}
export function assertIsString(value: unknown): asserts value is string {
    assert.strictEqual(typeof value, 'string');
}
export function assertIsNumber(value: unknown): asserts value is number {
    assert.strictEqual(typeof value, 'number');
}
export function assertIsBoolean(value: unknown): asserts value is boolean {
    assert.strictEqual(typeof value, 'boolean');
}

// Sleep for a specified period
export function sleep(ms: number, abort?: Promise<never>): Promise<void> {
    return new Promise((resolve, reject) => {
        setTimeout(resolve, Math.max(ms, 0));
        // eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors
        if (abort) abort.catch((reason: unknown) => { reject(reason); });
    });
}

// Log an error
export function logError(log: Logger, when: string, err: unknown): void {
    try {
        // Log the error message itself
        log.error(`[${when}] ${String(err)}`);

        // Log any history of causes for the error
        let cause = err;
        let prefix = ' '.repeat(when.length + 3);
        while ((cause instanceof AEGAPIError) && cause.errCause) {
            cause = cause.errCause;
            log.error(`${prefix}└─ ${String(cause)}`);
            prefix += '   ';
        }

        // Log any stack backtrace
        if (err instanceof Error && err.stack) log.debug(err.stack);
    } catch { /* empty */ }
}

// Format a milliseconds duration
export function formatMilliseconds(ms: number, maxParts = 2): string {
    if (ms < 1) return 'n/a';

    // Split the duration into components
    const duration: [string, number][] = [
        ['day',         Math.floor(ms / (24 * 60 * 60 * MS))     ],
        ['hour',        Math.floor(ms /      (60 * 60 * MS)) % 24],
        ['minute',      Math.floor(ms /           (60 * MS)) % 60],
        ['second',      Math.floor(ms /                 MS ) % 60],
        ['millisecond', Math.floor(ms                      ) % MS]
    ];

    // Remove any leading zero components
    while (duration[0]?.[1] === 0) duration.shift();

    // Combine the required number of remaining components
    return duration.slice(0, maxParts)
        .filter(([_key, value]) => value !== 0)
        .map(([key, value]) => plural(value, key))
        .join(' ');
}

// Format a seconds duration
export function formatSeconds(seconds: number, maxParts = 2): string {
    return formatMilliseconds(seconds * 1000, maxParts);
}

// Format a list (with Oxford comma)
export function formatList(items: string[]): string {
    switch (items.length) {
    case 0:     return 'n/a';
    case 1:     return items[0] ?? '';
    case 2:     return `${items[0]} and ${items[1]}`;
    default:    return [...items.slice(0, -1), `and ${items[items.length - 1]}`].join(', ');
    }
}

// Format a counted noun (handling most regular cases automatically)
export function plural(count: number, noun: string | [string, string], showCount = true): string {
    const [singular, plural] = Array.isArray(noun) ? noun : [noun, ''];
    noun = count === 1 ? singular : plural;
    if (!noun) {
        // Apply regular rules
        const rules: [string, string, number][] = [
            ['on$',                 'a',   2], // phenomenon/phenomena criterion/criteria
            ['us$',                 'i',   1], //     cactus/cacti         focus/foci
            ['[^aeiou]y$',          'ies', 1], //        cty/cites         puppy/puppies
            ['(ch|is|o|s|sh|x|z)$', 'es',  0], //       iris/irises        truss/trusses
            ['',                    's',   0]  //        cat/cats          house/houses
        ];
        const rule = rules.find(([ending]) => new RegExp(ending, 'i').test(singular));
        assertIsDefined(rule);
        const matchCase = (s: string): string => singular === singular.toUpperCase() ? s.toUpperCase() : s;
        noun = singular.substring(0, singular.length - rule[2]).concat(matchCase(rule[1]));
    }
    return showCount ? `${count} ${noun}` : noun;
}

// Format strings in columns
export function columns(rows: string[][], separator = '  '): string[] {
    // Determine the required column widths
    const width: number[] = [];
    rows.forEach(row => {
        row.forEach((value, index) => {
            width[index] = Math.max(width[index] ?? 0, value.length);
        });
    });
    width.splice(-1, 1, 0);

    // Format the rows
    return rows.map(row => row.map((value, index) => value.padEnd(width[index] ?? 0)).join(separator));
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
    const a = values.shift();
    assertIsDefined(a);
    if (values.length === 0) return a;
    const b = values.shift();
    assertIsDefined(b);
    if (values.length === 0) return b === 0 ? a : gcd(b, a % b);
    else return gcd(gcd(a, b), ...values);
}