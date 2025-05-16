import { OpenAPIV3 } from 'openapi-types';
import { Rule, RuleResult, RuleViolation } from './types';

export class ExamplesRule implements Rule {
  name = 'Examples & Samples';
  description = 'Presence of request/response examples for major endpoints.';
  weight = 10;

  evaluate(spec: OpenAPIV3.Document): RuleResult {
    const violations: RuleViolation[] = [];
    let totalEndpoints = 0;
    let endpointsWithViolations = 0;

    Object.entries(spec.paths || {}).forEach(([path, pathItem]) => {
      if (!pathItem) return;
      Object.entries(pathItem)
        .filter(([k]) =>
          ['get', 'post', 'put', 'delete', 'patch'].includes(k)
        )
        .forEach(([method, operation]) => {
          const op = operation as OpenAPIV3.OperationObject;
          let hasReqExample = true;
          let hasRespExample = true;
          totalEndpoints++;

          // Request body example
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
            if (reqBody?.content) {
              hasReqExample = Object.values(reqBody.content).some(
                (media) =>
                  !!media.example ||
                  (media.examples && Object.keys(media.examples).length > 0)
              );
            }
            if (!hasReqExample) {
              violations.push({
                path,
                operation: method.toUpperCase(),
                location: 'requestBody',
                message: 'No example provided for request body.',
                severity: 'warning',
                suggestion: 'Add an example for the request body.'
              });
              endpointsWithViolations++;
            }
          }

          // Response examples (for 2xx and 4xx)
          const responses = op.responses || {};
          const majorCodes = Object.keys(responses).filter((c) =>
            /^2\d\d$|^4\d\d$/.test(c)
          );
          hasRespExample = majorCodes.every((code) => {
            const resp = responses[code];
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
            if (!respObj?.content) return false;
            return Object.values(respObj.content).some(
              (media) =>
                !!media.example ||
                (media.examples && Object.keys(media.examples).length > 0)
            );
          });
          if (!hasRespExample && majorCodes.length > 0) {
            violations.push({
              path,
              operation: method.toUpperCase(),
              location: 'responses',
              message: 'No example provided for major response codes (2xx/4xx).',
              severity: 'warning',
              suggestion: 'Add examples for 2xx and 4xx responses.'
            });
            endpointsWithViolations++;
          }
        });
    });

    const score = Math.round(
      this.weight * (1 - endpointsWithViolations / Math.max(1, totalEndpoints))
    );

    return {
      score: Math.max(0, score),
      maxScore: this.weight,
      violations
    };
  }
}

