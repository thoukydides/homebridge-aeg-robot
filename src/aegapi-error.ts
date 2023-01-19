// Homebridge plugin for AEG RX 9 / Electrolux Pure i9 robot vacuum
// Copyright © 2022-2023 Alexander Thoukydides

import { STATUS_CODES } from 'http';
import { createCheckers, CheckerT, IErrorDetail } from 'ts-interface-checker';

import { ErrorResponseCode, ErrorResponseMessageLC,
         ErrorResponseMessageUC } from './aegapi-error-types';
import { Request, Response } from './aegapi-ua';
import errorsTI from './ti/aegapi-error-types-ti';

// Options that can be passed to an error constructor
type Options = { cause?: unknown };

// Checkers for API error responses
const checkers = createCheckers(errorsTI) as {
    ErrorResponseCode:      CheckerT<ErrorResponseCode>;
    ErrorResponseMessageLC: CheckerT<ErrorResponseMessageLC>;
    ErrorResponseMessageUC: CheckerT<ErrorResponseMessageUC>;
};

// Base for reporting all AEG RX 9 / Electrolux Pure i9 cloud API errors
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
        this.name = 'AEG API Error';
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
        this.name = 'AEG API Authorisation Error';
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
        this.name = 'AEG API Status Code Error';
    }

    // Construct an error message from a response
    static getMessage(response: Response, text: string) {
        const statusCode = response.statusCode;
        const statusCodeName = STATUS_CODES[statusCode];
        const description = AEGAPIStatusCodeError.getBodyDescription(text)
                            || AEGAPIStatusCodeError.getHeaderDescription(response)
                            || 'No error message returned';
        return `[${statusCode} ${statusCodeName}] ${description}`;
    }

    // Attempt to extract a useful description from the response body
    static getBodyDescription(text: string): string | null {
        let message = text.length ? text : null;
        try {
            const json = JSON.parse(text);
            if (checkers.ErrorResponseMessageLC.test(json) && json.message) {
                message = json.message;
                if (json.error) message += ` (${json.error})`;
            } else if (checkers.ErrorResponseMessageUC.test(json) && json.Message) {
                message = json.Message;
            } else if (checkers.ErrorResponseCode.test(json)) {
                message = `${json.codeDescription} (${json.code})`;
                if (json.details) {
                    Object.entries(json.details).forEach(([key, values]) => {
                        values.forEach(value => {
                            message += `\n    ${key}: ${value}`;
                        });
                    });
                }
            }
        } catch { /* empty */ }
        return message;
    }

    // Attempt to extract a useful description from the response headers
    static getHeaderDescription(response: Response): string | null {
        const header = response.headers['www-authenticate']
                       || response.headers['x-amzn-remapped-www-authenticate'];
        return typeof header === 'string' && header.length ? header : null;
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
        this.name = 'AEG API Validation Error';
    }

    // Construct an error message from a checker validation error
    static getMessage(errors: IErrorDetail[]) {
        const description = `${errors[0].path} ${errors[0].message}`;
        return `Structure validation failed (${description})`;
    }
}