import { OpenAPIV3 } from 'openapi-types';
import { Rule, RuleResult, RuleViolation } from './types';

export class SecurityRule implements Rule {
  name = 'Security';
  description = 'Defined and referenced security schemes where needed.';
  weight = 10;

  evaluate(spec: OpenAPIV3.Document): RuleResult {
    const violations: RuleViolation[] = [];
    let hasScheme = false;
    let hasReference = false;

    // Check for security schemes
    if (
      spec.components &&
      spec.components.securitySchemes &&
      Object.keys(spec.components.securitySchemes).length > 0
    ) {
      hasScheme = true;
    } else {
      violations.push({
        path: 'components.securitySchemes',
        location: 'components.securitySchemes',
        message: 'No security schemes defined.',
        severity: 'error',
        suggestion: 'Define at least one security scheme.'
      });
    }

    // Check for security references (global or per-operation)
    if (spec.security && spec.security.length > 0) {
      hasReference = true;
    } else {
      // Check per-operation
      Object.values(spec.paths || {}).forEach((pathItem) => {
        if (!pathItem) return;
        Object.values(pathItem)
          .filter((v) => typeof v === 'object' && v !== null)
          .forEach((op) => {
            const operation = op as OpenAPIV3.OperationObject;
            if (operation.security && operation.security.length > 0) {
              hasReference = true;
            }
          });
      });
    }
    if (!hasReference) {
      violations.push({
        path: 'security',
        location: 'root or operation',
        message: 'No security requirements referenced.',
        severity: 'warning',
        suggestion:
          'Reference security schemes at the global or operation level.'
      });
    }

    const score =
      hasScheme && hasReference ? this.weight : Math.round(this.weight / 2);

    return {
      score: Math.max(0, score),
      maxScore: this.weight,
      violations
    };
  }
}

