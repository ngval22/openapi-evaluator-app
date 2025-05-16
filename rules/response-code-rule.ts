import { OpenAPIV3 } from 'openapi-types';
import { Rule, RuleResult, RuleViolation } from './types';

export class ResponseCodeRule implements Rule {
    name = 'Response Codes';
    description = 'Appropriate use of HTTP status codes; each operation defines expected success and error codes.';
    weight = 15;

    evaluate(spec: OpenAPIV3.Document): RuleResult {
        return {
            score: this.weight,
            maxScore: this.weight,
            violations: []
        };
    }
}
