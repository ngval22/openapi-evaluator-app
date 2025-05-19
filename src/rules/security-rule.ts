import { OpenAPIV3 } from 'openapi-types';
import { Rule, RuleResult, RuleViolation } from './types';
import { CRITERIA_WEIGHTS, RULE_NAMES, RULE_DESCRIPTIONS } from "./constants";

export class SecurityRule implements Rule {
    name = RULE_NAMES.security;
    description = RULE_DESCRIPTIONS.security;
    weight = CRITERIA_WEIGHTS.security;

    private readonly MUTATING_METHODS = ['post', 'put', 'patch', 'delete'];

    evaluate(spec: OpenAPIV3.Document): RuleResult {
        const violations: RuleViolation[] = [];
        let score = this.weight;
        let potentialSecurityPoints = 0; // Count elements that should ideally be secured or reference security
        let securedPoints = 0;

        const definedSchemes = spec.components?.securitySchemes 
            ? Object.keys(spec.components.securitySchemes) 
            : [];
        
        const allReferencedSchemes = new Set<string>();
        let hasMutatingOperations = false;
        let operationsCheckedForSecurity = 0;
        let mutatingOperationsSecured = 0;

        // 1. Collect all referenced security schemes and identify mutating operations
        if (spec.security) { // Global security
            spec.security.forEach(secReq => {
                Object.keys(secReq).forEach(schemeName => allReferencedSchemes.add(schemeName));
            });
        }

        if (spec.paths) {
            Object.entries(spec.paths).forEach(([path, pathItem]) => {
                if (!pathItem) return;

                Object.entries(pathItem)
                    .filter(([key]) => ['get', 'post', 'put', 'delete', 'patch', 'options', 'head', 'trace'].includes(key))
                    .forEach(([method, op]) => {
                        const operation = op as OpenAPIV3.OperationObject;
                        const operationLocation = `${path}.${method}`;
                        operationsCheckedForSecurity++;

                        const isMutating = this.MUTATING_METHODS.includes(method.toLowerCase());
                        if (isMutating) {
                            hasMutatingOperations = true;
                            potentialSecurityPoints++; // Mutating operations are key points for security
                        }
                        
                        let operationIsSecured = false;
                        if (operation.security !== undefined) { // Operation-level security
                            if (operation.security === null || operation.security.length === 0) {
                                // Explicitly unsecured
                                if (isMutating) {
                                     violations.push({
                                        path,
                                        location: operationLocation,
                                        message: `Mutating operation ${method.toUpperCase()} ${path} explicitly disables security (security: []).`,
                                        severity: 'warning',
                                        suggestion: 'Ensure this is intentional. Mutating operations should typically be secured.'
                                    });
                                }
                            } else {
                                operationIsSecured = true;
                                operation.security.forEach(secReq => {
                                    Object.keys(secReq).forEach(schemeName => allReferencedSchemes.add(schemeName));
                                });
                            }
                        } else if (spec.security && spec.security.length > 0) {
                            // Inherits global security
                            operationIsSecured = true;
                        }

                        if (isMutating) {
                            if (operationIsSecured) {
                                securedPoints++;
                                mutatingOperationsSecured++;
                            } else if (definedSchemes.length > 0) { // Schemes are defined, but this op is not secured
                                violations.push({
                                    path,
                                    location: operationLocation,
                                    message: `Mutating operation ${method.toUpperCase()} ${path} is not secured, but security schemes are defined.`,
                                    severity: 'warning',
                                    suggestion: 'Apply a security requirement to this operation or define global security.'
                                });
                            }
                        }
                    });
            });
        }

        // 2. Validate referenced schemes
        allReferencedSchemes.forEach(schemeName => {
            potentialSecurityPoints++; // Each reference is a point
            if (!definedSchemes.includes(schemeName)) {
                violations.push({
                    path: '', // Global or path-specific
                    location: `components.securitySchemes / security definitions`,
                    message: `Security scheme '${schemeName}' is referenced but not defined in components.securitySchemes.`,
                    severity: 'error',
                    suggestion: `Define '${schemeName}' in components.securitySchemes or remove the reference.`
                });
            } else {
                securedPoints++;
            }
        });

        // 3. Check for unused defined schemes
        definedSchemes.forEach(schemeName => {
            if (!allReferencedSchemes.has(schemeName)) {
                violations.push({
                    path: '',
                    location: `components.securitySchemes.${schemeName}`,
                    message: `Security scheme '${schemeName}' is defined but never referenced.`,
                    severity: 'info',
                    suggestion: 'Remove the unused security scheme or apply it to operations/globally.'
                });
            }
        });
        
        // 4. Check if any security is defined if there are mutating operations
        if (hasMutatingOperations && definedSchemes.length === 0) {
            violations.push({
                path: '',
                location: 'components.securitySchemes / security',
                message: 'API has mutating operations but no security schemes are defined.',
                severity: 'error', // This is a significant omission
                suggestion: 'Define security schemes in components.securitySchemes and apply them to mutating operations or globally.'
            });
        }

        // Scoring Logic
        if (violations.some(v => v.severity === 'error')) {
            // Heavy penalty for errors like undefined references or no security on mutating APIs
            score = Math.max(0, this.weight - (violations.filter(v => v.severity === 'error').length * (this.weight / 2) ) );
        } else if (potentialSecurityPoints > 0) {
            score = Math.round((securedPoints / potentialSecurityPoints) * this.weight);
        } else if (!hasMutatingOperations && definedSchemes.length === 0) {
            // If no mutating operations and no security defined, it might be a public read-only API.
            score = this.weight; // Full score as security might not be "needed"
        } else if (hasMutatingOperations && definedSchemes.length > 0 && mutatingOperationsSecured === 0 && operationsCheckedForSecurity > 0) {
            // Mutating operations exist, schemes are defined, but none are secured
             score = Math.max(0, this.weight / 3); // Low score
        }


        // Further penalize for warnings if no errors
        if (!violations.some(v => v.severity === 'error') && violations.some(v => v.severity === 'warning')) {
            const warningPenalty = violations.filter(v => v.severity === 'warning').length * (this.weight * 0.1); // 10% penalty per warning
            score = Math.max(0, score - warningPenalty);
        }
        
        score = Math.round(Math.max(0, Math.min(this.weight, score)));

        return {
            score,
            maxScore: this.weight,
            violations
        };
    }
}
