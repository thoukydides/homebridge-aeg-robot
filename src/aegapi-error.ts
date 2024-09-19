// Homebridge plugin for AEG RX 9 / Electrolux Pure i9 robot vacuum
// Copyright © 2022-2024 Alexander Thoukydides

import { STATUS_CODES } from 'http';
import { IErrorDetail } from 'ts-interface-checker';

import { Request, Response } from './aegapi-ua.js';
import { assertIsDefined } from './utils.js';
import { checkers } from './ti/aegapi-types.js';

// Options that can be passed to an error constructor
interface Options { cause?: unknown }

// Base for reporting all Electrolux Group API errors
export class AEGAPIError extends Error {

    readonly errCause: unknown;

    constructor(
        readonly request:   Request,
        readonly response:  Response | undefined,
        message:            string,
        options?:           Options
    ) {
        // Standard error object initialisation
        super(message);
        Error.captureStackTrace(this, AEGAPIError);
        this.name = 'Electrolux Group API Error';
        if (options?.cause) this.errCause = options.cause;
    }
}

// API could not be authorised
export class AEGAPIAuthorisationError extends AEGAPIError {

    constructor(
        request:            Request,
        response:           Response | undefined,
        message:            string,
        options?:           Options
    ) {
        super(request, response, message, options);
        Error.captureStackTrace(this, AEGAPIAuthorisationError);
        this.name = 'Electrolux Group API Authorisation Error';
    }

}

// API returned a non-success status code
export class AEGAPIStatusCodeError extends AEGAPIError {

    constructor(
        request:            Request,
        response:           Response,
        readonly text:      string,
        options?:           Options
    ) {
        super(request, response, AEGAPIStatusCodeError.getMessage(response, text), options);
        Error.captureStackTrace(this, AEGAPIStatusCodeError);
        this.name = 'Electrolux Group API Status Code Error';
    }

    // Construct an error message from a response
    static getMessage(response: Response, text: string): string {
        const statusCode = response.statusCode;
        const statusCodeName = STATUS_CODES[statusCode];
        const description = AEGAPIStatusCodeError.getBodyDescription(text)
                            ?? 'No error message returned';
        return `[${statusCode} ${statusCodeName}] ${description}`;
    }

    // Attempt to extract a useful description from the response body
    static getBodyDescription(text: string): string | null {
        if (text === '') return null;
        let message = text;
        try {
            const json = JSON.parse(text) as unknown;
            if (checkers.ErrorResponse.test(json)) {
                message = `${json.message} (${json.error})`;
                if (json.detail) message += `: ${json.detail}`;
            }
        } catch { /* empty */ }
        return message;
    }
}

// API returned a response that failed checker validation
export class AEGAPIValidationError extends AEGAPIError {

    constructor(
        request:                Request,
        response:               Response,
        readonly validation:    IErrorDetail[],
        options?:               Options
    ) {
        super(request, response, AEGAPIValidationError.getMessage(validation), options);
        Error.captureStackTrace(this, AEGAPIValidationError);
        this.name = 'Electrolux Group API Validation Error';
    }

    // Construct an error message from a checker validation error
    static getMessage(errors: IErrorDetail[]): string {
        assertIsDefined(errors[0]);
        const description = `${errors[0].path} ${errors[0].message}`;
        return `Structure validation failed (${description})`;
    }
}