import { OpenAPIV3 } from 'openapi-types';
import { SEVERITY_SCORE_WEIGHTS } from './constants';
import { RuleViolation } from './types';

export function calculateScore(
    violations: RuleViolation[],
    totalItems: number,
    weight: number
): number {
    totalItems = Math.max(1, totalItems);
    const errorViolations = violations.filter((v) => v.severity === 'error').length;
    const warningViolations = violations.filter((v) => v.severity === 'warning').length;
    const infoViolations = violations.filter((v) => v.severity === 'info').length;

    const weightedViolationPercentage =
        (errorViolations * SEVERITY_SCORE_WEIGHTS.error + 
         warningViolations * SEVERITY_SCORE_WEIGHTS.warning + 
         infoViolations * SEVERITY_SCORE_WEIGHTS.info) /
         totalItems;

    let score = Math.round(weight * (1 - weightedViolationPercentage));

    if (errorViolations > 0 && score > weight - 2) {
        score = weight - 2;
    }

    return Math.max(0, score);
}

export function resolveHeader(
    header: OpenAPIV3.HeaderObject | OpenAPIV3.ReferenceObject,
    spec: OpenAPIV3.Document
): OpenAPIV3.HeaderObject | undefined {
    if ('$ref' in header) {
        return resolveReference<OpenAPIV3.HeaderObject>(header.$ref, spec);
    }
    return header;
}

export function resolveSchema(
    schema: OpenAPIV3.ReferenceObject | OpenAPIV3.SchemaObject,
    spec: OpenAPIV3.Document
): OpenAPIV3.SchemaObject | undefined {
    if ('$ref' in schema) {
        return resolveReference<OpenAPIV3.SchemaObject>(schema.$ref, spec);
    }
    return schema;
}

export function resolveRequestBody(
    requestBody: OpenAPIV3.ReferenceObject | OpenAPIV3.RequestBodyObject,
    spec: OpenAPIV3.Document
): OpenAPIV3.RequestBodyObject | undefined {
    if ('$ref' in requestBody) {
        return resolveReference<OpenAPIV3.RequestBodyObject>(requestBody.$ref, spec);
    }
    return requestBody;
}

export function resolveResponse(
    response: OpenAPIV3.ReferenceObject | OpenAPIV3.ResponseObject,
    spec: OpenAPIV3.Document
): OpenAPIV3.ResponseObject | undefined {
    if ('$ref' in response) {
        return resolveReference<OpenAPIV3.ResponseObject>(response.$ref, spec);
    }
    return response;
}

export function resolveParameter(
    parameter: OpenAPIV3.ReferenceObject | OpenAPIV3.ParameterObject,
    spec: OpenAPIV3.Document
): OpenAPIV3.ParameterObject | undefined {
    if ('$ref' in parameter) {
        return resolveReference<OpenAPIV3.ParameterObject>(parameter.$ref, spec);
    }
    return parameter;
}

export function resolveReference<T>(ref: string, spec: OpenAPIV3.Document): T | undefined {
    if (!ref.startsWith('#/')) return undefined;

    const parts = ref.substring(2).split('/');
    let current: any = spec;

    for (const part of parts) {
        if (!current[part]) return undefined;
        current = current[part];
    }

    return current as T;
}
