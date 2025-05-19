import { OpenAPIV3 } from 'openapi-types';
import { Rule, RuleResult, RuleViolation } from './types';
import { CRITERIA_WEIGHTS, RULE_NAMES, RULE_DESCRIPTIONS } from "./constants";

export class ExamplesSamplesRule implements Rule {
    name = RULE_NAMES.examples;
    description = RULE_DESCRIPTIONS.examples;
    weight = CRITERIA_WEIGHTS.examples;

    evaluate(spec: OpenAPIV3.Document): RuleResult {
        const violations: RuleViolation[] = [];
        let elementsChecked = 0;
        let elementsWithExamples = 0;

        if (!spec.paths) {
            return { score: this.weight, maxScore: this.weight, violations }; // No paths, nothing to check
        }

        Object.entries(spec.paths).forEach(([path, pathItem]) => {
            if (!pathItem) return;

            const operations = Object.entries(pathItem)
                .filter(([key]) => ['get', 'post', 'put', 'delete', 'patch', 'options', 'head', 'trace'].includes(key))
                .map(([key, op]) => ({ method: key, operation: op as OpenAPIV3.OperationObject }));

            operations.forEach(({ method, operation }) => {
                const operationLocation = `${path}.${method}`;

                // 1. Check Request Body Examples (especially for POST, PUT, PATCH)
                if (operation.requestBody && ['post', 'put', 'patch'].includes(method.toLowerCase())) {
                    const requestBody = this.resolveRequestBody(operation.requestBody, spec);
                    if (requestBody?.content) {
                        Object.entries(requestBody.content).forEach(([mediaType, mediaTypeObject]) => {
                            elementsChecked++;
                            const exampleLocation = `${operationLocation}.requestBody.content.${mediaType}`;
                            if (this.hasExample(mediaTypeObject)) {
                                elementsWithExamples++;
                            } else {
                                violations.push({
                                    path,
                                    location: exampleLocation,
                                    message: `Request body for ${mediaType} is missing an example.`,
                                    severity: 'warning',
                                    suggestion: 'Add an `example` or `examples` field to the request body content.'
                                });
                            }
                        });
                    }
                }

                // 2. Check Response Examples (focus on 2xx responses)
                if (operation.responses) {
                    Object.entries(operation.responses).forEach(([statusCode, responseOrRef]) => {
                        if (statusCode.startsWith('2')) { // Focus on success responses
                            const response = this.resolveResponse(responseOrRef, spec);
                            if (response?.content) {
                                Object.entries(response.content).forEach(([mediaType, mediaTypeObject]) => {
                                    elementsChecked++;
                                    const exampleLocation = `${operationLocation}.responses.${statusCode}.content.${mediaType}`;
                                    if (this.hasExample(mediaTypeObject)) {
                                        elementsWithExamples++;
                                    } else {
                                        violations.push({
                                            path,
                                            location: exampleLocation,
                                            message: `Response body for status ${statusCode} (${mediaType}) is missing an example.`,
                                            severity: 'warning',
                                            suggestion: 'Add an `example` or `examples` field to the response body content.'
                                        });
                                    }
                                });
                            }
                        }
                    });
                }

                // 3. Check Parameter Examples (lower priority)
                if (operation.parameters) {
                    operation.parameters.forEach((paramOrRef, index) => {
                        const parameter = this.resolveParameter(paramOrRef, spec);
                        if (parameter) {
                            elementsChecked++;
                            const paramName = parameter.name || `param_at_index_${index}`;
                            const exampleLocation = `${operationLocation}.parameters.${paramName}`;
                            if (this.hasParameterExample(parameter)) {
                                elementsWithExamples++;
                            } else {
                                violations.push({
                                    path,
                                    location: exampleLocation,
                                    message: `Parameter '${paramName}' is missing an example.`,
                                    severity: 'info',
                                    suggestion: 'Add an `example` or `examples` field to the parameter definition.'
                                });
                            }
                        }
                    });
                }
            });
        });

        let score = this.weight;
        if (elementsChecked > 0) {
            score = Math.round((elementsWithExamples / elementsChecked) * this.weight);
        } else {
            // If no elements required examples (e.g., API with no request/response bodies or parameters),
            // it's not an error for this rule.
            score = this.weight;
        }
        
        score = Math.max(0, Math.min(this.weight, score));

        return {
            score,
            maxScore: this.weight,
            violations
        };
    }

    private hasExample(mediaTypeObject: OpenAPIV3.MediaTypeObject): boolean {
        return (mediaTypeObject.example !== undefined) || 
               (mediaTypeObject.examples !== undefined && Object.keys(mediaTypeObject.examples).length > 0);
    }

    private hasParameterExample(parameterObject: OpenAPIV3.ParameterObject): boolean {
        return (parameterObject.example !== undefined) ||
               (parameterObject.examples !== undefined && Object.keys(parameterObject.examples).length > 0);
    }

    // --- Helper methods for resolving references ---
    private resolveRequestBody(
        requestBody: OpenAPIV3.ReferenceObject | OpenAPIV3.RequestBodyObject,
        spec: OpenAPIV3.Document
    ): OpenAPIV3.RequestBodyObject | undefined {
        if ('$ref' in requestBody) {
            return this.resolveReference<OpenAPIV3.RequestBodyObject>(requestBody.$ref, spec);
        }
        return requestBody;
    }

    private resolveResponse(
        response: OpenAPIV3.ReferenceObject | OpenAPIV3.ResponseObject,
        spec: OpenAPIV3.Document
    ): OpenAPIV3.ResponseObject | undefined {
        if ('$ref' in response) {
            return this.resolveReference<OpenAPIV3.ResponseObject>(response.$ref, spec);
        }
        return response;
    }

    private resolveParameter(
        parameter: OpenAPIV3.ReferenceObject | OpenAPIV3.ParameterObject,
        spec: OpenAPIV3.Document
    ): OpenAPIV3.ParameterObject | undefined {
        if ('$ref' in parameter) {
            return this.resolveReference<OpenAPIV3.ParameterObject>(parameter.$ref, spec);
        }
        return parameter;
    }

    private resolveReference<T>(ref: string, spec: OpenAPIV3.Document): T | undefined {
        if (!ref.startsWith('#/')) return undefined;
        const parts = ref.substring(2).split('/');
        let current: any = spec;
        for (const part of parts) {
            const decodedPart = part.replace(/~1/g, '/').replace(/~0/g, '~');
            if (!current || typeof current !== 'object' || !(decodedPart in current)) return undefined;
            current = current[decodedPart];
        }
        return current as T;
    }
}

