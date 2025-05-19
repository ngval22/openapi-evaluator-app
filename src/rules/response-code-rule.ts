import { OpenAPIV3 } from 'openapi-types';
import { Rule, RuleResult, RuleViolation } from './types';
import { CRITERIA_WEIGHTS, RULE_NAMES, RULE_DESCRIPTIONS } from "./constants";

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
        const violations: RuleViolation[] = [];
        
        if (!spec.paths || Object.keys(spec.paths).length === 0) {
            return {
                score: 0,
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

        // Track statistics for scoring
        let totalOperations = 0;
        let operationsWithIssues = 0;
        
        // Check each path and operation
        Object.entries(spec.paths).forEach(([path, pathItem]) => {
            if (!pathItem) return;
            
            // Get HTTP methods defined for this path
            const methods = Object.keys(pathItem).filter(key => 
                ['get', 'post', 'put', 'delete', 'patch', 'head', 'options', 'trace'].includes(key)
            );
            
            methods.forEach(method => {
                totalOperations++;
                const operation = pathItem[method as keyof OpenAPIV3.PathItemObject] as OpenAPIV3.OperationObject;
                
                // Check if operation has responses defined
                if (!operation.responses || Object.keys(operation.responses).length === 0) {
                    violations.push({
                        path,
                        location: `${path}.${method}`,
                        message: `${method.toUpperCase()} operation is missing response definitions`,
                        severity: 'error',
                        suggestion: 'Define expected response status codes and their content'
                    });
                    operationsWithIssues++;
                    return;
                }
                
                // Check response codes for this operation
                const hasIssues = this.checkOperationResponses(path, method, operation, spec, violations);
                if (hasIssues) {
                    operationsWithIssues++;
                }
            });
        });
        
        // Calculate score based on the proportion of operations with proper response codes
        const operationsWithoutIssues = totalOperations - operationsWithIssues;
        let score = Math.round((operationsWithoutIssues / Math.max(1, totalOperations)) * this.weight);
        
        // Apply additional penalty for severe violations
        const errorViolations = violations.filter(v => v.severity === 'error').length;
        if (errorViolations > 0) {
            // Cap score at 80% if there are any error violations
            score = Math.min(score, Math.round(this.weight * 0.8));
            
            // Further reduce score based on proportion of error violations to total operations
            const errorPenalty = Math.round((errorViolations / Math.max(1, totalOperations)) * this.weight * 0.5);
            score = Math.max(0, score - errorPenalty);
        }
        
        return {
            score,
            maxScore: this.weight,
            violations
        };
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
        
        if (!responses) return true; // Should never happen due to earlier check
        
        // Check for minimum expected response categories
        const statusCodes = Object.keys(responses);
        const hasSuccessCode = statusCodes.some(code => code.startsWith('2') || code === 'default');
        const hasClientErrorCode = statusCodes.some(code => code.startsWith('4'));
        const hasServerErrorCode = statusCodes.some(code => code.startsWith('5'));
        
        // Check for expected success codes based on HTTP method
        if (!hasSuccessCode) {
            violations.push({
                path,
                location: `${path}.${method}.responses`,
                message: `${method.toUpperCase()} operation is missing success response codes`,
                severity: 'error',
                suggestion: `Add appropriate success response codes (e.g., ${this.EXPECTED_STATUS_CODES[method as keyof typeof this.EXPECTED_STATUS_CODES]?.success.join(', ')})`
            });
            hasIssues = true;
        } else {
            // Check if the success codes are appropriate for the method
            const expectedSuccessCodes = this.EXPECTED_STATUS_CODES[method as keyof typeof this.EXPECTED_STATUS_CODES]?.success || [];
            const definedSuccessCodes = statusCodes.filter(code => code.startsWith('2'));
            
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
            
            // Check specific method-status code combinations
            if (method === 'post' && !statusCodes.includes('201') && path.match(/\/[^\/]+$/)) {
                // POST to a collection endpoint should typically return 201 Created
                violations.push({
                    path,
                    location: `${path}.${method}.responses`,
                    message: 'POST operation to create a resource should return 201 Created',
                    severity: 'info',
                    suggestion: 'Add a 201 Created response for resource creation'
                });
            }
            
            if ((method === 'put' || method === 'patch') && 
                !statusCodes.includes('200') && !statusCodes.includes('204')) {
                violations.push({
                    path,
                    location: `${path}.${method}.responses`,
                    message: `${method.toUpperCase()} operation should return 200 OK or 204 No Content`,
                    severity: 'info',
                    suggestion: 'Add 200 (with response body) or 204 (without response body) for update operations'
                });
            }
            
            if (method === 'delete' && !statusCodes.includes('204') && !statusCodes.includes('202')) {
                violations.push({
                    path,
                    location: `${path}.${method}.responses`,
                    message: 'DELETE operation should typically return 204 No Content or 202 Accepted',
                    severity: 'info',
                    suggestion: 'Consider using 204 No Content for immediate deletion or 202 Accepted for async deletion'
                });
            }
        }
        
        // Check for client error codes
        if (this.MINIMUM_EXPECTED_CODES.clientError && !hasClientErrorCode) {
            violations.push({
                path,
                location: `${path}.${method}.responses`,
                message: `${method.toUpperCase()} operation is missing client error response codes`,
                severity: 'warning',
                suggestion: 'Add appropriate client error codes (e.g., 400, 401, 403, 404)'
            });
            hasIssues = true;
        } else {
            // Check if common error codes are missing
            const expectedErrorCodes = this.EXPECTED_STATUS_CODES[method as keyof typeof this.EXPECTED_STATUS_CODES]?.error || [];
            
            // Check for authentication/authorization errors if security is defined
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
            
            // Check for 404 for resource-specific operations
            if ((method === 'get' || method === 'put' || method === 'patch' || method === 'delete') && 
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
            
            // Check for validation error codes for operations with request bodies
            if ((method === 'post' || method === 'put' || method === 'patch') && 
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
        }
        
        // Check for server error codes
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
        
        // Check for default response
        if (!statusCodes.includes('default')) {
            violations.push({
                path,
                location: `${path}.${method}.responses`,
                message: `${method.toUpperCase()} operation is missing a default response`,
                severity: 'info',
                suggestion: 'Consider adding a default response to handle unexpected status codes'
            });
        }
        
        // Check response content
        Object.entries(responses).forEach(([statusCode, responseOrRef]) => {
            const response = this.resolveResponse(responseOrRef, spec);
            
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
            
            // Check if response has a description
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
            
            // Check if success responses have content (except 204 No Content)
            if (statusCode.startsWith('2') && statusCode !== '204' && 
                (!response.content || Object.keys(response.content).length === 0)) {
                // Only flag this for GET and certain other methods that typically return content
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
            
            // Check if error responses have content
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
            
            // Check if response content has schema
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
        
        // Check for unusual or deprecated status codes
        statusCodes.forEach(code => {
            // Skip default
            if (code === 'default') return;
            
            // Check if it's a valid HTTP status code
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
            
            // Check for unusual or deprecated codes
            const codeNum = parseInt(code, 10);
            
            // 1xx codes are rarely used in APIs
            if (codeNum >= 100 && codeNum < 200) {
                violations.push({
                    path,
                    location: `${path}.${method}.responses.${code}`,
                    message: `Unusual use of 1xx informational status code: ${code}`,
                    severity: 'info',
                    suggestion: '1xx codes are rarely used in REST APIs and may not be well-supported by clients'
                });
            }
            
            // Check for deprecated or uncommon codes
            const uncommonCodes = [
                '203', '205', '208', '226', // Uncommon 2xx
                '300', '305', '306', '307', '308', // Uncommon 3xx
                '402', '407', '408', '411', '414', '416', '417', '418', '421', '423', '424', '426', '428', '431', '451', // Uncommon 4xx
                '505', '506', '507', '508', '510', '511' // Uncommon 5xx
            ];
            
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

    private resolveResponse(
        responseOrRef: OpenAPIV3.ReferenceObject | OpenAPIV3.ResponseObject,
        spec: OpenAPIV3.Document
    ): OpenAPIV3.ResponseObject | null {
        if ('$ref' in responseOrRef) {
            return this.resolveReference<OpenAPIV3.ResponseObject>(responseOrRef.$ref, spec);
        }
        return responseOrRef;
    }

    private resolveReference<T>(ref: string, spec: OpenAPIV3.Document): T | null {
        if (!ref.startsWith('#/')) return null;
        
        const parts = ref.substring(2).split('/');
        let current: any = spec;
        
        for (const part of parts) {
            // Handle JSON pointer escaping
            const decodedPart = part.replace(/~1/g, '/').replace(/~0/g, '~');
            
            if (!current || typeof current !== 'object' || !(decodedPart in current)) {
                return null;
            }
            current = current[decodedPart];
        }
        
        return current as T;
    }
}
