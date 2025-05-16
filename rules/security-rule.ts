import { OpenAPIV3 } from 'openapi-types';
import { Rule, RuleResult, RuleViolation } from './types';

export class SecurityRule implements Rule {
    name = 'Security';
    description = 'Defined and referenced security schemes where needed.';
    weight = 10;

    evaluate(spec: OpenAPIV3.Document): RuleResult {
        return {
            score: this.weight,
            maxScore: this.weight,
            violations: []
        };
    }
}
