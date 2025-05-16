import { OpenAPIV3 } from 'openapi-types';
import { Rule, RuleResult, RuleViolation } from './types';

export class DescriptionDocsRule implements Rule {
  name = 'Description & Documentation';
  description =
    'All paths, operations, parameters, request bodies, and responses include meaningful description fields.';
  weight = 20;

  evaluate(spec: OpenAPIV3.Document): RuleResult {
    const violations: RuleViolation[] = [];
    let totalItems = 0;
    let itemsWithViolations = 0;

    // Helper to check if a description is meaningful
    const isMeaningful = (desc?: string) =>
      typeof desc === 'string' && desc.trim().length >= 8;

    // Check path-level descriptions (OpenAPI 3.1+ supports this)
    Object.entries(spec.paths || {}).forEach(([path, pathItem]) => {
      if (!pathItem) return;
      // PathItemObject may have a description (OpenAPI 3.1+)
      if ('description' in pathItem) {
        totalItems++;
        if (!isMeaningful((pathItem as any).description)) {
          violations.push({
            path,
            location: 'path',
            message: 'Path is missing a meaningful description.',
            severity: 'warning',
            suggestion: 'Add a meaningful description to this path.'
          });
          itemsWithViolations++;
        }
      }

      // Check each operation
      Object.entries(pathItem)
        .filter(([k]) =>
          ['get', 'post', 'put', 'delete', 'patch', 'options', 'head', 'trace'].includes(
            k
          )
        )
        .forEach(([method, operation]) => {
          const op = operation as OpenAPIV3.OperationObject;
          totalItems++;
          if (!isMeaningful(op.description)) {
            violations.push({
              path,
              operation: method.toUpperCase(),
              location: 'operation',
              message: 'Operation is missing a meaningful description.',
              severity: 'error',
              suggestion: 'Add a meaningful description to this operation.'
            });
            itemsWithViolations++;
          }

          // Parameters
          (op.parameters || []).forEach((param, idx) => {
            let paramObj: OpenAPIV3.ParameterObject | undefined;
            if ('$ref' in param) {
              const ref = param.$ref;
              const key = ref.split('/').pop();
              paramObj = spec.components?.parameters?.[key || ''] as
                | OpenAPIV3.ParameterObject
                | undefined;
            } else {
              paramObj = param as OpenAPIV3.ParameterObject;
            }
            totalItems++;
            if (!paramObj || !isMeaningful(paramObj.description)) {
              violations.push({
                path,
                operation: method.toUpperCase(),
                location: `parameters[${idx}]`,
                message: 'Parameter is missing a meaningful description.',
                severity: 'warning',
                suggestion: 'Add a meaningful description to this parameter.'
              });
              itemsWithViolations++;
            }
          });

          // Request Body
          if (op.requestBody) {
            let reqBody: OpenAPIV3.RequestBodyObject | undefined;
            if ('$ref' in op.requestBody) {
              const ref = op.requestBody.$ref;
              const key = ref.split('/').pop();
              reqBody = spec.components?.requestBodies?.[key || ''] as
                | OpenAPIV3.RequestBodyObject
                | undefined;
            } else {
              reqBody = op.requestBody as OpenAPIV3.RequestBodyObject;
            }
            totalItems++;
            if (!reqBody || !isMeaningful(reqBody.description)) {
              violations.push({
                path,
                operation: method.toUpperCase(),
                location: 'requestBody',
                message: 'Request body is missing a meaningful description.',
                severity: 'warning',
                suggestion: 'Add a meaningful description to this request body.'
              });
              itemsWithViolations++;
            }
          }

          // Responses
          Object.entries(op.responses || {}).forEach(([status, resp]) => {
            let respObj: OpenAPIV3.ResponseObject | undefined;
            if ('$ref' in resp) {
              const ref = resp.$ref;
              const key = ref.split('/').pop();
              respObj = spec.components?.responses?.[key || ''] as
                | OpenAPIV3.ResponseObject
                | undefined;
            } else {
              respObj = resp as OpenAPIV3.ResponseObject;
            }
            totalItems++;
            if (!respObj || !isMeaningful(respObj.description)) {
              violations.push({
                path,
                operation: method.toUpperCase(),
                location: `responses.${status}`,
                message: `Response ${status} is missing a meaningful description.`,
                severity: 'warning',
                suggestion: 'Add a meaningful description to this response.'
              });
              itemsWithViolations++;
            }
          });
        });
    });

    // Calculate proportional score
    const score = Math.round(
      this.weight * (1 - itemsWithViolations / Math.max(1, totalItems))
    );

    return {
      score: Math.max(0, score),
      maxScore: this.weight,
      violations
    };
  }
}
