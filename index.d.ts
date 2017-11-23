// Type definitions for docker-file-parser 1.0

export interface CommandEntry {
    name: string;
    args: string | string[] | { [key: string]: string };
    lineno: number;
    raw: string;
    error?: string;
}

export interface ParseOptions {
    includeComments: boolean;
}

export function parse(
    contents: string,
    options?: ParseOptions
): CommandEntry[];
