/*
    MIT License

    Copyright (c) 2019 github0null

    Permission is hereby granted, free of charge, to any person obtaining a copy
    of this software and associated documentation files (the "Software"), to deal
    in the Software without restriction, including without limitation the rights
    to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
    copies of the Software, and to permit persons to whom the Software is
    furnished to do so, subject to the following conditions:

    The above copyright notice and this permission notice shall be included in all
    copies or substantial portions of the Software.

    THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
    IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
    FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
    AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
    LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
    OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
    SOFTWARE.
*/

/**
 * Utility functions for error handling and type safety
 */

/**
 * Safely converts unknown error to Error instance
 * This is useful when catching errors with TypeScript's strict mode
 *
 * @param error - The unknown error to convert
 * @returns An Error instance
 *
 * @example
 * try {
 *     // some code
 * } catch (error) {
 *     const err = toError(error);
 *     console.error(err.message);
 * }
 */
export function toError(error: unknown): Error {
    if (error instanceof Error) {
        return error;
    }
    if (typeof error === 'string') {
        return new Error(error);
    }
    if (error === null || error === undefined) {
        return new Error('Unknown error occurred');
    }
    try {
        return new Error(String(error));
    } catch {
        return new Error('Unable to convert error to string');
    }
}

/**
 * Type guard to check if value is an Error
 *
 * @param error - Value to check
 * @returns True if value is an Error instance
 */
export function isError(error: unknown): error is Error {
    return error instanceof Error;
}

/**
 * Extract error message from unknown error type
 *
 * @param error - The error to extract message from
 * @returns Error message string
 */
export function getErrorMessage(error: unknown): string {
    if (error instanceof Error) {
        return error.message;
    }
    return String(error ?? 'Unknown error');
}
