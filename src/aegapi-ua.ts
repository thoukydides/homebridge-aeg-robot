// Homebridge plugin for AEG RX 9 / Electrolux Pure i9 robot vacuum
// Copyright © 2022-2023 Alexander Thoukydides

import { Logger, LogLevel } from 'homebridge';

import { STATUS_CODES } from 'http';
import { Client, Dispatcher } from 'undici';
import { buffer } from 'stream/consumers';
import { gunzipSync } from 'zlib';
import { Checker, IErrorDetail } from 'ts-interface-checker';

import { AEG_API_KEY, AEG_API_URL,
         PLUGIN_NAME, PLUGIN_VERSION } from './settings';
import { AEGAPIError, AEGAPIStatusCodeError,
         AEGAPIValidationError } from './aegapi-error';
import { columns, getValidationTree, sleep } from './utils';
import { Config } from './config-types';
import { IncomingHttpHeaders } from 'undici/types/header';

export type Binary     = Dispatcher.ResponseData['body'];
export type Response   = Dispatcher.ResponseData;
export type Method     = Dispatcher.HttpMethod;
export type Headers    = IncomingHttpHeaders;
export type Query      = Dispatcher.DispatchOptions['query'];

// Options that can be specified for requests
export interface UAOptions {
    query?:             Query;
    headers?:           Headers;
    [index: string]:    unknown;
}

// Parameters used to creating a request
export type RequestParams = [
    method:             Method,
    path:               string,
    options:            UAOptions | undefined,
    body:               object | undefined
];

// Simplified version of Dispatcher.DispatchOptions
export interface Request {
    path:               string;
    method:             Method;
    body?:              string;
    headers:            Headers;
    query?:             Query;
    idempotent?:        boolean;
}

// Constructed request options and its (successful) response
export interface RequestResponse {
    request:            Request;
    response:           Response;
}

/* eslint-disable max-len */

// User agent for accessing the AEG RX 9 / Electrolux Pure i9 cloud API
export class AEGUserAgent {
    // Cloud server API host
    private readonly url = AEG_API_URL;

    // Timeout applied to all requests
    private readonly timeout = 5000; // milliseconds

    // Delays between retries
    readonly retryDelay = {
        min:          500,
        max:    60 * 1000,
        factor:       2.0
    };

    // Default headers to include in all requests
    private readonly defaultHeaders: Headers = {
        'x-api-key':    AEG_API_KEY,
        'User-Agent':   `${PLUGIN_NAME}/${PLUGIN_VERSION}`
    };

    // HTTP client used to issue the requests
    private readonly client: Client;

    // Number of requests that have been issued
    private requestCount = 0;

    // Create a new user agent
    constructor(
        readonly log:    Logger,
        readonly config: Config
    ) {
        // Create an HTTP client
        this.client = new Client(this.url, {
            bodyTimeout:    this.timeout,
            headersTimeout: this.timeout,
            connect: {
                timeout:    this.timeout
            }
        });
    }

    // Requests that expect an empty response
    put   (path: string, body: object, options?: UAOptions): Promise<void> { return this.requestEmpty('PUT',    path, options, body); }
    post  (path: string, body: object, options?: UAOptions): Promise<void> { return this.requestEmpty('POST',   path, options, body); }
    delete(path: string, body: object, options?: UAOptions): Promise<void> { return this.requestEmpty('DELETE', path, options, body); }
    async requestEmpty(...params: RequestParams): Promise<void> {
        const { request, response } = await this.request(...params);
        const contentLength = Number(response.headers['content-length']);
        if (contentLength)
            throw new AEGAPIError(request, response, `Unexpected non-empty response (${contentLength} bytes)`);
    }

    // Requests that expect a JSON formatted response
    getJSON  <Type>(checker: Checker, path: string,               options?: UAOptions): Promise<Type> { return this.requestJSON(checker, 'GET',   path, options, undefined); }
    putJSON  <Type>(checker: Checker, path: string, body: object, options?: UAOptions): Promise<Type> { return this.requestJSON(checker, 'PUT',   path, options, body     ); }
    postJSON <Type>(checker: Checker, path: string, body: object, options?: UAOptions): Promise<Type> { return this.requestJSON(checker, 'POST',  path, options, body     ); }
    patchJSON<Type>(checker: Checker, path: string, body: object, options?: UAOptions): Promise<Type> { return this.requestJSON(checker, 'PATCH', path, options, body     ); }
    async requestJSON<Type>(checker: Checker, ...params: RequestParams): Promise<Type> {
        const { request, response } = await this.request(...params, { Accept: 'application/json' });

        // Check that the response was not empty
        if (response.statusCode === 204)
            throw new AEGAPIError(request, response, 'Unexpected empty response (status code 204 No Content)');

        // Retrieve the response as JSON text
        let text;
        const contentType = response.headers['content-type'];
        if (typeof contentType === 'string'
            && contentType.startsWith('application/json')) {
            text = await response.body.text();
        } else if (contentType === 'application/octet-stream') {
            try {
                const gzipped = await buffer(response.body);
                text = gunzipSync(gzipped).toString();
            } catch (cause) {
                throw new AEGAPIError(request, response, `Failed to gunzip binary response (${cause})`, { cause });
            }
        } else {
            throw new AEGAPIError(request, response, `Unexpected response content-type (${contentType})`);
        }

        // Parse the response as JSON
        let json;
        try {
            this.logBody('Response', text);
            json = JSON.parse(text);
        } catch (cause) {
            throw new AEGAPIError(request, response, `Failed to parse JSON response (${cause})`, { cause });
        }

        // Check that the response has the expected fields
        checker.setReportedPath('response');
        const validation = checker.validate(json);
        if (validation) {
            this.logCheckerValidation(LogLevel.ERROR, 'Unexpected structure of AEG API response',
                                      request, validation, json);
            throw new AEGAPIValidationError(request, response, validation);
        }
        const strictValidation = checker.strictValidate(json);
        if (strictValidation) {
            this.logCheckerValidation(LogLevel.WARN, 'Unexpected fields in AEG API response',
                                      request, strictValidation, json);
        }

        // Return the result
        return json;
    }

    // Construct and issue a request, retrying if appropriate
    async request(method: Method, path: string, options?: UAOptions,
                  body?: object, headers?: Headers): Promise<RequestResponse> {
        // Request counters
        let requestCount: number;
        let retryCount = 0;
        let retryDelay = this.retryDelay.min;

        for (;;) {
            try {
                // Attempt the request
                const request = await this.prepareRequest(method, path, options, body, headers);
                requestCount ??= ++this.requestCount;
                const counter = `${requestCount}` + (retryCount ? `.${retryCount}` : '');
                const response = await this.requestCore(`AEG API #${counter}:`, request);
                return { request, response };
            } catch (err) {
                // Request failed, so check whether it can be retried
                if (!this.canRetry(err, options)) throw err;
                ++retryCount;

                // Delay before trying again
                await sleep(retryDelay);
                retryDelay = Math.min(retryDelay * this.retryDelay.factor, this.retryDelay.max);
            }
        }
    }

    // Construct a Request
    async prepareRequest(method: Method, path: string, options?: UAOptions,
                         body?: object, headers?: Headers): Promise<Request> {
        const request: Request = {
            method,
            path,
            query:      options?.query,
            headers:    {...this.defaultHeaders, ...headers, ...options?.headers},
            idempotent: ['GET', 'HEAD', 'PUT', 'DELETE', 'OPTIONS', 'TRACE'].includes(method)
        };
        if (body) request.body = JSON.stringify(body);
        return request;
    }

    // Decide whether a request can be retried following an error
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    canRetry(err: unknown, options?: UAOptions): boolean {
        // Do not retry the request unless the failure was an API error
        if (!(err instanceof AEGAPIError)) return false;

        // Only retry methods that are idempotent
        if (!err.request.idempotent) {
            this.log.warn(`Request will not be retried (${err.request.method} is not idempotent)`);
            return false;
        }

        // Some status codes never retried (authorisation failures handled elsewhere)
        const noRetryStatusCodes = [404];
        if (err instanceof AEGAPIStatusCodeError && err.response
            && noRetryStatusCodes.includes(err.response.statusCode)) {
            this.log.warn(`Request will not be retried (status code ${err.response.statusCode})`);
            return false;
        }

        // The request can be retried
        return true;
    }

    // Issue a generic request
    async requestCore(logPrefix: string, request: Request): Promise<Response> {
        const startTime = Date.now();
        let status = 'OK';
        try {

            // Attempt to issue the request
            let response: Response;
            try {
                this.log.debug(`${logPrefix} ${request.method} ${request.path}`);
                this.logHeaders(`${logPrefix} Request`, request.headers);
                this.logBody(`${logPrefix} Request`, request.body);
                response = await this.client.request(request);
                this.logHeaders(`${logPrefix} Response`, response.headers);
            } catch (cause) {
                status = `ERROR: ${cause}`;
                throw new AEGAPIError(request, undefined, status, { cause });
            }

            // Check whether the request was successful
            const statusCode = response.statusCode;
            status = `${statusCode} ${STATUS_CODES[statusCode]}`;
            if (statusCode < 200 || 300 <= statusCode) {
                const text = await response.body.text();
                this.logBody(`${logPrefix} Response`, text);
                const err = new AEGAPIStatusCodeError(request, response, text);
                status += ` ${err}`;
                throw err;
            }

            // Success, so return the response
            return response;

        } finally {

            // Log completion of the request
            this.log.debug(`${logPrefix} ${status} +${Date.now() - startTime}ms`);

        }
    }

    // Log request or response headers
    logHeaders(name: string, headers: Headers): void {
        if (!this.config.debug.includes('Log API Headers')) return;
        const rows: string[][] = [];
        Object.keys(headers).sort().forEach(key => {
            const values = headers[key];
            if (typeof values === 'string') rows.push([`${key}:`, values]);
            else if (Array.isArray(values)) {
                values?.forEach(value => rows.push([`${key}:`, value]));
            }
        });
        this.log.debug(`${name} headers:`);
        columns(rows).forEach(line => this.log.debug(`    ${line}`));
    }

    // Log request or response body
    logBody(name: string, body: unknown): void {
        if (!this.config.debug.includes('Log API Bodies')) return;
        if (typeof body !== 'string') return;
        if (body?.length) {
            this.log.debug(`${name} body:`);
            body.split('\n').forEach(line => this.log.debug(`    ${line}`));
        } else {
            this.log.debug(`${name} body: EMPTY`);
        }
    }

    // Log checker validation errors
    logCheckerValidation(level: LogLevel, message: string, request: Request,
                         errors: IErrorDetail[], json: object): void {
        this.log.log(level, `${message}:`);
        this.log.log(level, `${request.method} ${request.path}`);
        const validationLines = getValidationTree(errors);
        validationLines.forEach(line => this.log.log(level, line));
        this.log.debug('Received response (reformatted):');
        const jsonLines = JSON.stringify(json, null, 4).split('\n');
        jsonLines.forEach(line => this.log.debug(`    ${line}`));
    }
}