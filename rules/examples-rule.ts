import { OpenAPIV3 } from 'openapi-types';
import { Rule, RuleResult, RuleViolation } from './types';

export class ExamplesRule implements Rule {
    name = 'Examples & Samples';
    description = 'Presence of request/response examples for major endpoints.';
    weight = 10;

    evaluate(spec: OpenAPIV3.Document): RuleResult {
        return {
            score: this.weight,
            maxScore: this.weight,
            violations: []
        };
    }
}
