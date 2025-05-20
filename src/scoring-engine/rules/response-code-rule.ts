import { OpenAPIV3 } from 'openapi-types';
import { Rule, RuleResult, RuleViolation } from '../types';
import { CRITERIA_WEIGHTS, RULE_NAMES, RULE_DESCRIPTIONS } from "../constants";
import { resolveResponse, calculateScore } from "../helper-functions";

export class ResponseCodesRule implements Rule {
    name = RULE_NAMES.response_codes;
    description = RULE_DESCRIPTIONS.response_codes;
    weight = CRITERIA_WEIGHTS.response_codes;

    // Expected status codes by HTTP method
    private readonly EXPECTED_STATUS_CODES = {
        get: {
            success: ['200', '206', '304'],
            error: ['400', '401', '403', '404', '406', '429', '500']
        },
        post: {
            success: ['200', '201', '202'],
            error: ['400', '401', '403', '404', '409', '413', '415', '422', '429', '500']
        },
        put: {
            success: ['200', '201', '204'],
            error: ['400', '401', '403', '404', '409', '412', '413', '415', '422', '429', '500']
        },
        patch: {
            success: ['200', '204'],
            error: ['400', '401', '403', '404', '409', '412', '413', '415', '422', '429', '500']
        },
        delete: {
            success: ['200', '202', '204'],
            error: ['400', '401', '403', '404', '409', '429', '500']
        },
        head: {
            success: ['200', '304'],
            error: ['400', '401', '403', '404', '429', '500']
        },
        options: {
            success: ['200', '204'],
            error: ['400', '401', '403', '404', '429', '500']
        },
        trace: {
            success: ['200'],
            error: ['400', '401', '403', '404', '429', '500']
        }
    };

    // Minimum expected status codes for any operation
    private readonly MINIMUM_EXPECTED_CODES = {
        success: true, // At least one success code (2xx)
        clientError: true, // At least one client error code (4xx)
        serverError: true // At least one server error code (5xx)
    };

    evaluate(spec: OpenAPIV3.Document): RuleResult {
        if (!spec.paths || Object.keys(spec.paths).length === 0) {
            return this.noPathsViolation();
        }

        let totalOperations = 0;
        let operationsWithIssues = 0;
        const violations: RuleViolation[] = [];

        Object.entries(spec.paths).forEach(([path, pathItem]) => {
            if (!pathItem) return;
            const methods = this.getMethodsForPath(pathItem);

            methods.forEach(method => {
                totalOperations++;
                const operation = pathItem[method as keyof OpenAPIV3.PathItemObject] as OpenAPIV3.OperationObject;
                const hasIssues = this.evaluateOperation(
                    path, method, operation, spec, violations
                );
                if (hasIssues) operationsWithIssues++;
            });
        });

        const score = calculateScore(
            violations, operationsWithIssues, this.weight
        );

        return {
            score,
            maxScore: this.weight,
            violations
        };
    }

    private noPathsViolation(): RuleResult {
        return {
            score: this.weight,
            maxScore: this.weight,
            violations: [{
                path: '',
                location: 'paths',
                message: 'No paths defined in the API specification',
                severity: 'error',
                suggestion: 'Define paths for your API endpoints'
            }]
        };
    }

    private getMethodsForPath(pathItem: OpenAPIV3.PathItemObject): string[] {
        return Object.keys(pathItem).filter(key =>
            ['get', 'post', 'put', 'delete', 'patch', 'head', 'options', 'trace'].includes(key)
        );
    }

    private evaluateOperation(
        path: string,
        method: string,
        operation: OpenAPIV3.OperationObject,
        spec: OpenAPIV3.Document,
        violations: RuleViolation[]
    ): boolean {
        if (!operation.responses || Object.keys(operation.responses).length === 0) {
            violations.push({
                path,
                location: `${path}.${method}`,
                message: `${method.toUpperCase()} operation is missing response definitions`,
                severity: 'error',
                suggestion: 'Define expected response status codes and their content'
            });
            return true;
        }
        return this.checkOperationResponses(path, method, operation, spec, violations);
    }

    private checkOperationResponses(
        path: string,
        method: string,
        operation: OpenAPIV3.OperationObject,
        spec: OpenAPIV3.Document,
        violations: RuleViolation[]
    ): boolean {
        let hasIssues = false;
        const responses = operation.responses;
        if (!responses) return true;

        const statusCodes = Object.keys(responses);

        // 1. Success codes
        if (this.checkSuccessCodes(path, method, statusCodes, violations)) {
            hasIssues = true;
        }

        // 2. Client error codes
        if (this.checkClientErrorCodes(path, method, statusCodes, operation, spec, violations)) {
            hasIssues = true;
        }

        // 3. Server error codes
        if (this.checkServerErrorCodes(path, method, statusCodes, violations)) {
            hasIssues = true;
        }

        // 4. Default response
        this.checkDefaultResponse(path, method, statusCodes, violations);

        // 5. Response content and schema
        if (this.checkResponseContentAndSchema(path, method, responses, operation, violations)) {
            hasIssues = true;
        }

        // 6. Status code validity and uncommon codes
        if (this.checkStatusCodeValidity(path, method, statusCodes, violations)) {
            hasIssues = true;
        }

        return hasIssues;
    }

    private checkSuccessCodes(
        path: string,
        method: string,
        statusCodes: string[],
        violations: RuleViolation[]
    ): boolean {
        let hasIssues = false;
        const hasSuccessCode = statusCodes.some(code => code.startsWith('2') || code === 'default');
        const expectedSuccessCodes = this.EXPECTED_STATUS_CODES[method as keyof typeof this.EXPECTED_STATUS_CODES]?.success || [];
        const definedSuccessCodes = statusCodes.filter(code => code.startsWith('2'));

        if (!hasSuccessCode) {
            violations.push({
                path,
                location: `${path}.${method}.responses`,
                message: `${method.toUpperCase()} operation is missing success response codes`,
                severity: 'error',
                suggestion: `Add appropriate success response codes (e.g., ${expectedSuccessCodes.join(', ')})`
            });
            hasIssues = true;
        } else {
            const hasAppropriateSuccessCode = definedSuccessCodes.some(code => expectedSuccessCodes.includes(code));
            if (definedSuccessCodes.length > 0 && !hasAppropriateSuccessCode) {
                violations.push({
                    path,
                    location: `${path}.${method}.responses`,
                    message: `${method.toUpperCase()} operation has unusual success response codes`,
                    severity: 'warning',
                    suggestion: `Consider using standard success codes for ${method.toUpperCase()}: ${expectedSuccessCodes.join(', ')}`
                });
                hasIssues = true;
            }
        }
        return hasIssues;
    }

    private checkClientErrorCodes(
        path: string,
        method: string,
        statusCodes: string[],
        operation: OpenAPIV3.OperationObject,
        spec: OpenAPIV3.Document,
        violations: RuleViolation[]
    ): boolean {
        let hasIssues = false;
        const hasClientErrorCode = statusCodes.some(code => code.startsWith('4'));

        if (this.MINIMUM_EXPECTED_CODES.clientError && !hasClientErrorCode) {
            violations.push({
                path,
                location: `${path}.${method}.responses`,
                message: `${method.toUpperCase()} operation is missing client error response codes`,
                severity: 'warning',
                suggestion: 'Add appropriate client error codes (e.g., 400, 401, 403, 404)'
            });
            hasIssues = true;
        }

        // Security-related error codes
        if ((operation.security && operation.security.length > 0) ||
            (spec.security && spec.security.length > 0)) {
            if (!statusCodes.includes('401') && !statusCodes.includes('403')) {
                violations.push({
                    path,
                    location: `${path}.${method}.responses`,
                    message: `${method.toUpperCase()} operation with security requirements is missing authentication/authorization error codes`,
                    severity: 'warning',
                    suggestion: 'Add 401 Unauthorized and/or 403 Forbidden response codes for secured endpoints'
                });
            hasIssues = true;
            }
        }

        // 404 for resource-specific operations
        if ((['get', 'put', 'patch', 'delete'].includes(method)) &&
            path.includes('{') && !statusCodes.includes('404')) {
            violations.push({
                path,
                location: `${path}.${method}.responses`,
                message: `${method.toUpperCase()} operation on a resource should include a 404 Not Found response`,
                severity: 'warning',
                suggestion: 'Add a 404 Not Found response for when the requested resource does not exist'
            });
        hasIssues = true;
        }

        // Validation error codes for operations with request bodies
        if ((['post', 'put', 'patch'].includes(method)) &&
            operation.requestBody &&
                !statusCodes.includes('400') && !statusCodes.includes('422')) {
            violations.push({
                path,
                location: `${path}.${method}.responses`,
                message: `${method.toUpperCase()} operation with request body should include validation error responses`,
                severity: 'warning',
                suggestion: 'Add 400 Bad Request and/or 422 Unprocessable Entity for request validation failures'
            });
        hasIssues = true;
        }

        return hasIssues;
        }

        private checkServerErrorCodes(
            path: string,
            method: string,
            statusCodes: string[],
            violations: RuleViolation[]
        ): boolean {
            let hasIssues = false;
            const hasServerErrorCode = statusCodes.some(code => code.startsWith('5'));
            if (this.MINIMUM_EXPECTED_CODES.serverError && !hasServerErrorCode) {
                violations.push({
                    path,
                    location: `${path}.${method}.responses`,
                    message: `${method.toUpperCase()} operation is missing server error response codes`,
                    severity: 'warning',
                    suggestion: 'Add a 500 Internal Server Error response for unexpected server errors'
                });
            hasIssues = true;
            }
            return hasIssues;
        }

        private checkDefaultResponse(
            path: string,
            method: string,
            statusCodes: string[],
            violations: RuleViolation[]
        ): void {
            if (!statusCodes.includes('default')) {
                violations.push({
                    path,
                    location: `${path}.${method}.responses`,
                    message: `${method.toUpperCase()} operation is missing a default response`,
                    severity: 'info',
                    suggestion: 'Consider adding a default response to handle unexpected status codes'
                });
            }
        }

        private checkResponseContentAndSchema(
            path: string,
            method: string,
            responses: OpenAPIV3.ResponsesObject,
            operation: OpenAPIV3.OperationObject,
            violations: RuleViolation[]
        ): boolean {
            let hasIssues = false;
            Object.entries(responses).forEach(([statusCode, responseOrRef]) => {
                const response = resolveResponse(responseOrRef, operation as any); // Pass spec if needed
                    if (!response) {
                        violations.push({
                            path,
                            location: `${path}.${method}.responses.${statusCode}`,
                            message: `Could not resolve response reference`,
                            severity: 'error',
                            suggestion: 'Ensure the response reference is valid'
                        });
                        hasIssues = true;
                        return;
                    }

                    // Description
                    if (!response.description || response.description.trim() === '') {
                        violations.push({
                            path,
                            location: `${path}.${method}.responses.${statusCode}`,
                            message: `Response ${statusCode} is missing a description`,
                            severity: 'warning',
                            suggestion: 'Add a meaningful description explaining the response'
                        });
                        hasIssues = true;
                    }

                    // Success responses should have content (except 204)
                    if (statusCode.startsWith('2') && statusCode !== '204' &&
                        (!response.content || Object.keys(response.content).length === 0)) {
                        if (method === 'get' || method === 'post' ||
                            (method === 'put' && statusCode === '200')) {
                            violations.push({
                                path,
                                location: `${path}.${method}.responses.${statusCode}`,
                                message: `Success response ${statusCode} is missing content definition`,
                                severity: 'warning',
                                suggestion: 'Define the response content structure or use 204 No Content if no response body is returned'
                            });
                        hasIssues = true;
                        }
                    }

                    // Error responses should have content
                    if ((statusCode.startsWith('4') || statusCode.startsWith('5')) &&
                        (!response.content || Object.keys(response.content).length === 0)) {
                        violations.push({
                            path,
                            location: `${path}.${method}.responses.${statusCode}`,
                            message: `Error response ${statusCode} is missing content definition`,
                            severity: 'info',
                            suggestion: 'Consider defining the error response structure to help API consumers handle errors'
                        });
                    }

                    // Content schema
                    if (response.content) {
                        Object.entries(response.content).forEach(([mediaType, mediaTypeObject]) => {
                            if (!mediaTypeObject.schema) {
                                violations.push({
                                    path,
                                    location: `${path}.${method}.responses.${statusCode}.content.${mediaType}`,
                                    message: `Response content is missing a schema definition`,
                                    severity: 'warning',
                                    suggestion: 'Define a schema for the response content'
                                });
                            hasIssues = true;
                            }
                        });
                    }
            });
            return hasIssues;
        }

        private checkStatusCodeValidity(
            path: string,
            method: string,
            statusCodes: string[],
            violations: RuleViolation[]
        ): boolean {
            let hasIssues = false;
            const uncommonCodes = [
                '203', '205', '208', '226', // Uncommon 2xx
                '300', '305', '306', '307', '308', // Uncommon 3xx
                '402', '407', '408', '411', '414', '416', '417', '418', '421', '423', '424', '426', '428', '431', '451', // Uncommon 4xx
                '505', '506', '507', '508', '510', '511' // Uncommon 5xx
            ];

            statusCodes.forEach(code => {
                if (code === 'default') return;
                if (!/^[1-5][0-9][0-9]$/.test(code)) {
                    violations.push({
                        path,
                        location: `${path}.${method}.responses.${code}`,
                        message: `Invalid HTTP status code: ${code}`,
                        severity: 'error',
                        suggestion: 'Use standard HTTP status codes (100-599)'
                    });
                    hasIssues = true;
                    return;
                }
                const codeNum = parseInt(code, 10);
                if (codeNum >= 100 && codeNum < 200) {
                    violations.push({
                        path,
                        location: `${path}.${method}.responses.${code}`,
                        message: `Unusual use of 1xx informational status code: ${code}`,
                        severity: 'info',
                        suggestion: '1xx codes are rarely used in REST APIs and may not be well-supported by clients'
                    });
                }
                if (uncommonCodes.includes(code)) {
                    violations.push({
                        path,
                        location: `${path}.${method}.responses.${code}`,
                        message: `Uncommon HTTP status code: ${code}`,
                        severity: 'info',
                        suggestion: 'Consider using more common status codes for better client compatibility'
                    });
                }
            });
            return hasIssues;
        }
}
