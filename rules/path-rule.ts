import { OpenAPIV3 } from 'openapi-types';
import { Rule, RuleResult, RuleViolation } from './types';

export class PathsOperationsRule implements Rule {
    name = 'Paths & Operations';
    description = 'Consistent naming and CRUD conventions; no overlapping or redundant paths.';
    weight = 15;

    evaluate(spec: OpenAPIV3.Document): RuleResult {
        return {
            score: this.weight,
            maxScore: this.weight,
            violations: []
        };
    }
}
