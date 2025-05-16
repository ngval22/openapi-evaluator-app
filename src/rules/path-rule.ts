import { OpenAPIV3 } from 'openapi-types';
import { Rule, RuleResult, RuleViolation } from './types';

export class PathsOperationsRule implements Rule {
  name = 'Paths & Operations';
  description =
    'Consistent naming and CRUD conventions; no overlapping or redundant paths.';
  weight = 15;

  evaluate(spec: OpenAPIV3.Document): RuleResult {
    const violations: RuleViolation[] = [];
    const pathSet = new Set<string>();
    let totalPaths = 0;
    let pathsWithViolations = 0;

    const pathNamePattern = /^\/[a-z0-9\-\/\{\}_]+$/; // e.g., /users/{id}/posts
    const trailingSlashPattern = /\/$/;
    const doubleSlashPattern = /\/{2,}/;

    Object.entries(spec.paths || {}).forEach(([path, pathItem]) => {
      if (!pathItem) return;
      totalPaths++;

      // Path naming conventions
      if (!pathNamePattern.test(path)) {
        violations.push({
          path,
          location: 'path',
          message:
            'Path does not follow naming conventions (lowercase, kebab-case, curly braces for params).',
          severity: 'warning',
          suggestion:
            'Use lowercase, kebab-case, and curly braces for path parameters (e.g., /users/{userId}).'
        });
        pathsWithViolations++;
      }
      if (trailingSlashPattern.test(path) && path !== '/') {
        violations.push({
          path,
          location: 'path',
          message: 'Path should not have a trailing slash.',
          severity: 'warning',
          suggestion: 'Remove trailing slashes from path definitions.'
        });
        pathsWithViolations++;
      }
      if (doubleSlashPattern.test(path)) {
        violations.push({
          path,
          location: 'path',
          message: 'Path contains double slashes.',
          severity: 'warning',
          suggestion: 'Remove double slashes from path definitions.'
        });
        pathsWithViolations++;
      }

      // Check for duplicate paths (case-insensitive)
      const normalizedPath = path.toLowerCase();
      if (pathSet.has(normalizedPath)) {
        violations.push({
          path,
          location: 'path',
          message: 'Duplicate path detected.',
          severity: 'error',
          suggestion: 'Remove or merge duplicate path definitions.'
        });
        pathsWithViolations++;
      } else {
        pathSet.add(normalizedPath);
      }

      // Check CRUD conventions for operations
      Object.entries(pathItem)
        .filter(([k]) =>
          ['get', 'post', 'put', 'delete', 'patch'].includes(k)
        )
        .forEach(([method, operation]) => {
          // Check for redundant operations (should not have multiple of same method)
          // (OpenAPI spec doesn't allow this, but check anyway)
          // No-op: already enforced by object keys

          // CRUD conventions
          if (
            method === 'get' &&
            /\{.*\}/.test(path) &&
            path.endsWith('s}') // e.g., /users/{id}
          ) {
            violations.push({
              path,
              operation: method.toUpperCase(),
              location: 'operation',
              message:
                'GET operation on a resource path with parameter should be for single resource retrieval.',
              severity: 'info',
              suggestion:
                'Ensure GET /resource/{id} returns a single resource, not a collection.'
            });
            pathsWithViolations++;
          }
          if (
            method === 'post' &&
            /\{.*\}/.test(path)
          ) {
            violations.push({
              path,
              operation: method.toUpperCase(),
              location: 'operation',
              message:
                'POST operation should not be used on parameterized resource paths.',
              severity: 'warning',
              suggestion:
                'Use POST on collection paths (e.g., /users), not on /users/{id}.'
            });
            pathsWithViolations++;
          }
          if (
            (method === 'put' || method === 'patch' || method === 'delete') &&
            !/\{.*\}/.test(path)
          ) {
            violations.push({
              path,
              operation: method.toUpperCase(),
              location: 'operation',
              message: `${method.toUpperCase()} operation should be used on parameterized resource paths (e.g., /resource/{id}).`,
              severity: 'warning',
              suggestion: `Use ${method.toUpperCase()} on /resource/{id} style paths.`
            });
            pathsWithViolations++;
          }
        });
    });

    // Check for overlapping/redundant paths (e.g., /users/{id} and /users/id)
    const paramPattern = /\{[^}]+\}/g;
    const normalizedPaths = Array.from(pathSet).map((p) =>
      p.replace(paramPattern, '{}')
    );
    const seen = new Set<string>();
    normalizedPaths.forEach((np, idx) => {
      if (seen.has(np)) {
        violations.push({
          path: Array.from(pathSet)[idx],
          location: 'path',
          message:
            'Overlapping or redundant path detected (e.g., /users/{id} and /users/id).',
          severity: 'error',
          suggestion:
            'Avoid defining both parameterized and literal paths that overlap.'
        });
        pathsWithViolations++;
      } else {
        seen.add(np);
      }
    });

    // Calculate proportional score
    const score = Math.round(
      this.weight * (1 - pathsWithViolations / Math.max(1, totalPaths))
    );

    return {
      score: Math.max(0, score),
      maxScore: this.weight,
      violations
    };
  }
}
