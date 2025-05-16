import { OpenAPIV3 } from 'openapi-types';
import { Rule, RuleResult, RuleViolation } from './types';

export class ResponseCodeRule implements Rule {
  name = 'Response Codes';
  description =
    'Appropriate use of HTTP status codes; each operation defines expected success and error codes.';
  weight = 15;

  evaluate(spec: OpenAPIV3.Document): RuleResult {
    const violations: RuleViolation[] = [];
    let totalOps = 0;
    let opsWithViolations = 0;

    Object.entries(spec.paths || {}).forEach(([path, pathItem]) => {
      if (!pathItem) return;
      Object.entries(pathItem)
        .filter(([k]) =>
          ['get', 'post', 'put', 'delete', 'patch', 'options', 'head', 'trace'].includes(
            k
          )
        )
        .forEach(([method, operation]) => {
          const op = operation as OpenAPIV3.OperationObject;
          totalOps++;
          const codes = Object.keys(op.responses || {});
          const has2xx = codes.some((c) => /^2\d\d$/.test(c));
          const hasError = codes.some((c) => /^4\d\d$/.test(c) || /^5\d\d$/.test(c));
          const nonStandard = codes.filter(
            (c) =>
              !/^([1-5]\d\d|default)$/.test(c) &&
              c !== 'default'
          );

          if (!has2xx) {
            violations.push({
              path,
              operation: method.toUpperCase(),
              location: 'responses',
              message: 'No 2xx success response defined.',
              severity: 'error',
              suggestion: 'Define at least one 2xx response for this operation.'
            });
            opsWithViolations++;
          }
          if (!hasError) {
            violations.push({
              path,
              operation: method.toUpperCase(),
              location: 'responses',
              message: 'No 4xx or 5xx error response defined.',
              severity: 'warning',
              suggestion: 'Define at least one 4xx or 5xx error response.'
            });
            opsWithViolations++;
          }
          if (nonStandard.length > 0) {
            violations.push({
              path,
              operation: method.toUpperCase(),
              location: 'responses',
              message: `Nonstandard HTTP status code(s) used: ${nonStandard.join(
                ', '
              )}`,
              severity: 'warning',
              suggestion: 'Use only standard HTTP status codes.'
            });
            opsWithViolations++;
          }
        });
    });

    const score = Math.round(
      this.weight * (1 - opsWithViolations / Math.max(1, totalOps))
    );

    return {
      score: Math.max(0, score),
      maxScore: this.weight,
      violations
    };
  }
}

