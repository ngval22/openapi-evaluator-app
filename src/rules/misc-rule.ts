import { OpenAPIV3 } from 'openapi-types';
import { Rule, RuleResult, RuleViolation } from './types';

export class MiscellaneousRule implements Rule {
  name = 'Miscellaneous Best Practices';
  description = 'versioning, servers array, tags, components reuse...';
  weight = 10;

  evaluate(spec: OpenAPIV3.Document): RuleResult {
    const violations: RuleViolation[] = [];
    let totalChecks = 4;
    let failedChecks = 0;

    // Versioning
    if (
      !spec.info?.version ||
      !/^\d+\.\d+\.\d+(-[a-zA-Z0-9-.]+)?$/.test(spec.info.version)
    ) {
      violations.push({
        path: 'info.version',
        location: 'info.version',
        message: 'API version is missing or not semantic (x.y.z).',
        severity: 'warning',
        suggestion: 'Use semantic versioning (e.g., 1.0.0).'
      });
      failedChecks++;
    }

    // Servers array
    if (!spec.servers || spec.servers.length === 0) {
      violations.push({
        path: 'servers',
        location: 'servers',
        message: 'No servers defined.',
        severity: 'error',
        suggestion: 'Define at least one server in the servers array.'
      });
      failedChecks++;
    }

    // Tags
    if (!spec.tags || spec.tags.length === 0) {
      violations.push({
        path: 'tags',
        location: 'tags',
        message: 'No tags defined.',
        severity: 'warning',
        suggestion: 'Define at least one tag for API organization.'
      });
      failedChecks++;
    }

    // Components reuse (schemas, parameters, responses, etc.)
    let reused = false;
    if (spec.components) {
      reused =
        (spec.components.schemas &&
          Object.keys(spec.components.schemas).length > 1) ||
        (spec.components.parameters &&
          Object.keys(spec.components.parameters).length > 1) ||
        (spec.components.responses &&
          Object.keys(spec.components.responses).length > 1);
    }
    if (!reused) {
      violations.push({
        path: 'components',
        location: 'components',
        message: 'No evidence of component reuse (schemas, parameters, responses).',
        severity: 'info',
        suggestion:
          'Define and reuse components for schemas, parameters, and responses.'
      });
      failedChecks++;
    }

    const score = Math.round(
      this.weight * (1 - failedChecks / Math.max(1, totalChecks))
    );

    return {
      score: Math.max(0, score),
      maxScore: this.weight,
      violations
    };
  }
}

