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
 * Internal constants and configuration values used across the extension
 */

/**
 * Map of SVD files to device names
 */
export const svdFileMap: Record<string, string> = {
    'stm32f103': 'STM32F103xx.svd',
    'stm32f407': 'STM32F407xx.svd',
    // Add more mappings as needed
};

/**
 * Map of debug keywords to their display names
 */
export const debugKeywordMap: Record<string, string> = {
    'arm-none-eabi-gdb': 'ARM GNU Debugger',
    'riscv-none-embed-gdb': 'RISC-V GNU Debugger',
    'mips-mti-elf-gdb': 'MIPS GNU Debugger',
    // Add more mappings as needed
};

/**
 * GitHub API configuration
 */
export const GITHUB_API = {
    BASE_URL: 'https://api.github.com',
    RESOURCE_REPO: 'github0null/eide-resource',
    BINARY_PATH: 'binaries',
} as const;

/**
 * Extension metadata
 */
export const EXTENSION_METADATA = {
    ID: 'cl.eide',
    DISPLAY_NAME: 'Embedded IDE',
    VERSION: '1.0.1',
} as const;
