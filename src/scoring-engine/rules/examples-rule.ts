import { OpenAPIV3 } from 'openapi-types';
import { Rule, RuleResult, RuleViolation } from '../types';
import { CRITERIA_WEIGHTS, RULE_NAMES, RULE_DESCRIPTIONS } from "../constants";
import { resolveParameter, resolveRequestBody, resolveResponse } from "../helper-functions";


export class ExamplesSamplesRule implements Rule {
    name = RULE_NAMES.examples;
    description = RULE_DESCRIPTIONS.examples;
    weight = CRITERIA_WEIGHTS.examples;

evaluate(spec: OpenAPIV3.Document): RuleResult {
    const violations: RuleViolation[] = [];
    let elementsChecked = 0;
    let elementsWithExamples = 0;

    if (!spec.paths) {
        // No paths, nothing to check
        return { score: this.weight, maxScore: this.weight, violations };
    }

    for (const [path, pathItem] of Object.entries(spec.paths)) {
        if (!pathItem) continue;

        const operations = this.getOperations(pathItem);

        for (const { method, operation } of operations) {
            const operationLocation = `${path}.${method}`;

            // 1. Check Request Body Examples (POST, PUT, PATCH)
            if (
                operation.requestBody &&
                ['post', 'put', 'patch'].includes(method.toLowerCase())
            ) {
                elementsChecked += this.checkRequestBodyExamples(
                    operation,
                    spec,
                    operationLocation,
                    path,
                    violations,
                    (hasExample) => {
                        if (hasExample) elementsWithExamples++;
                    }
                );
            }

            // 2. Check Response Examples (2xx)
            if (operation.responses) {
                elementsChecked += this.checkResponseExamples(
                    operation,
                    spec,
                    operationLocation,
                    path,
                    violations,
                    (hasExample) => {
                        if (hasExample) elementsWithExamples++;
                    }
                );
            }

            // 3. Check Parameter Examples
            if (operation.parameters) {
                elementsChecked += this.checkParameterExamples(
                    operation,
                    spec,
                    operationLocation,
                    path,
                    violations,
                    (hasExample) => {
                        if (hasExample) elementsWithExamples++;
                    }
                );
            }
        }
    }

    // Calculate score
    let score = this.weight;
    if (elementsChecked > 0) {
        score = Math.round(
            (elementsWithExamples / elementsChecked) * this.weight
        );
    }
    score = Math.max(0, Math.min(this.weight, score));

    return {
        score,
        maxScore: this.weight,
        violations,
    };
}


private getOperations(pathItem: OpenAPIV3.PathItemObject) {
    const httpMethods = [
        'get',
        'post',
        'put',
        'delete',
        'patch',
        'options',
        'head',
        'trace',
    ];
    return Object.entries(pathItem)
        .filter(([key]) => httpMethods.includes(key))
        .map(([method, op]) => ({
            method,
            operation: op as OpenAPIV3.OperationObject,
        }));
}

private checkRequestBodyExamples(
    operation: OpenAPIV3.OperationObject,
    spec: OpenAPIV3.Document,
    operationLocation: string,
    path: string,
    violations: RuleViolation[],
    onExampleChecked: (hasExample: boolean) => void
): number {
    let checked = 0;
    const requestBody = resolveRequestBody(operation.requestBody!, spec);
    if (requestBody?.content) {
        for (const [mediaType, mediaTypeObject] of Object.entries(
            requestBody.content
        )) {
            checked++;
            const exampleLocation = `${operationLocation}.requestBody.content.${mediaType}`;
            const hasExample = this.hasExample(mediaTypeObject);
            onExampleChecked(hasExample);
            if (!hasExample) {
                violations.push({
                    path,
                    location: exampleLocation,
                    message: `Request body for ${mediaType} is missing an example.`,
                    severity: 'warning',
                    suggestion:
                        'Add an `example` or `examples` field to the request body content.',
                });
            }
        }
    }
    return checked;
}

private checkResponseExamples(
    operation: OpenAPIV3.OperationObject,
    spec: OpenAPIV3.Document,
    operationLocation: string,
    path: string,
    violations: RuleViolation[],
    onExampleChecked: (hasExample: boolean) => void
): number {
    let checked = 0;
    for (const [statusCode, responseOrRef] of Object.entries(
        operation.responses!
    )) {
        if (!statusCode.startsWith('2')) continue; // Only 2xx
        const response = resolveResponse(responseOrRef, spec);
        if (response?.content) {
            for (const [mediaType, mediaTypeObject] of Object.entries(
                response.content
            )) {
                checked++;
                const exampleLocation = `${operationLocation}.responses.${statusCode}.content.${mediaType}`;
                const hasExample = this.hasExample(mediaTypeObject);
                onExampleChecked(hasExample);
                if (!hasExample) {
                    violations.push({
                        path,
                        location: exampleLocation,
                        message: `Response body for status ${statusCode} (${mediaType}) is missing an example.`,
                        severity: 'warning',
                        suggestion:
                            'Add an `example` or `examples` field to the response body content.',
                    });
                }
            }
        }
    }
    return checked;
}

private checkParameterExamples(
    operation: OpenAPIV3.OperationObject,
    spec: OpenAPIV3.Document,
    operationLocation: string,
    path: string,
    violations: RuleViolation[],
    onExampleChecked: (hasExample: boolean) => void
): number {
    let checked = 0;
    for (const [index, paramOrRef] of operation.parameters!.entries()) {
        const parameter = resolveParameter(paramOrRef, spec);
        if (!parameter) continue;
        checked++;
        const paramName = parameter.name || `param_at_index_${index}`;
        const exampleLocation = `${operationLocation}.parameters.${paramName}`;
        const hasExample = this.hasParameterExample(parameter);
        onExampleChecked(hasExample);
        if (!hasExample) {
            violations.push({
                path,
                location: exampleLocation,
                message: `Parameter '${paramName}' is missing an example.`,
                severity: 'info',
                suggestion:
                    'Add an `example` or `examples` field to the parameter definition.',
            });
        }
    }
    return checked;
}

    private hasExample(mediaTypeObject: OpenAPIV3.MediaTypeObject): boolean {
        return (mediaTypeObject.example !== undefined) || 
               (mediaTypeObject.examples !== undefined && Object.keys(mediaTypeObject.examples).length > 0);
    }

    private hasParameterExample(parameterObject: OpenAPIV3.ParameterObject): boolean {
        return (parameterObject.example !== undefined) ||
               (parameterObject.examples !== undefined && Object.keys(parameterObject.examples).length > 0);
    }
}

