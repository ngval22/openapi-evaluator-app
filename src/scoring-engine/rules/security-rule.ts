import { OpenAPIV3 } from 'openapi-types';
import { Rule, RuleResult, RuleViolation } from '../types';
import { CRITERIA_WEIGHTS, RULE_NAMES, RULE_DESCRIPTIONS } from "../constants";

export class SecurityRule implements Rule {
    name = RULE_NAMES.security;
    description = RULE_DESCRIPTIONS.security;
    weight = CRITERIA_WEIGHTS.security;

    private readonly MUTATING_METHODS = ['post', 'put', 'patch', 'delete'];

    evaluate(spec: OpenAPIV3.Document): RuleResult {
        const definedSchemes = this.getDefinedSchemes(spec);
        const allReferencedSchemes = new Set<string>();
        const violations: RuleViolation[] = [];

        const {
            hasMutatingOperations,
            potentialSecurityPoints,
            securedPoints,
            mutatingOperationsSecured,
            operationsCheckedForSecurity,
            operationViolations
        } = this.analyzeOperations(spec, definedSchemes, allReferencedSchemes);

        violations.push(...operationViolations);

        this.validateReferencedSchemes(
            definedSchemes,
            allReferencedSchemes,
            violations
        );

        this.checkUnusedDefinedSchemes(
            definedSchemes,
            allReferencedSchemes,
            violations
        );

        this.checkMissingSecuritySchemes(
            hasMutatingOperations,
            definedSchemes,
            violations
        );

        let score = this.calculateScore(
            violations,
            potentialSecurityPoints,
            securedPoints,
            hasMutatingOperations,
            definedSchemes,
            mutatingOperationsSecured,
            operationsCheckedForSecurity
        );

        return {
            score,
            maxScore: this.weight,
            violations
        };
    }

    private getDefinedSchemes(spec: OpenAPIV3.Document): string[] {
        return spec.components?.securitySchemes
            ? Object.keys(spec.components.securitySchemes)
            : [];
    }

    private analyzeOperations(
        spec: OpenAPIV3.Document,
        definedSchemes: string[],
        allReferencedSchemes: Set<string>
    ) {
        let hasMutatingOperations = false;
        let potentialSecurityPoints = 0;
        let securedPoints = 0;
        let mutatingOperationsSecured = 0;
        let operationsCheckedForSecurity = 0;
        const violations: RuleViolation[] = [];

        // Collect global security references
        if (spec.security) {
            spec.security.forEach(secReq => {
                Object.keys(secReq).forEach(schemeName =>
                    allReferencedSchemes.add(schemeName)
                );
            });
        }

        if (spec.paths) {
            Object.entries(spec.paths).forEach(([path, pathItem]) => {
                if (!pathItem) return;

                Object.entries(pathItem)
                    .filter(([key]) =>
                        [
                            'get',
                            'post',
                            'put',
                            'delete',
                            'patch',
                            'options',
                            'head',
                            'trace'
                        ].includes(key)
                    )
                    .forEach(([method, op]) => {
                        const operation = op as OpenAPIV3.OperationObject;
                        const operationLocation = `${path}.${method}`;
                        operationsCheckedForSecurity++;

                        const isMutating = this.MUTATING_METHODS.includes(
                            method.toLowerCase()
                        );
                        if (isMutating) {
                            hasMutatingOperations = true;
                            potentialSecurityPoints++;
                        }

                        let operationIsSecured = false;
                        if (operation.security !== undefined) {
                            if (
                                operation.security === null ||
                                operation.security.length === 0
                            ) {
                                if (isMutating) {
                                    violations.push({
                                        path,
                                        location: operationLocation,
                                        message: `Mutating operation ${method.toUpperCase()} ${path} explicitly disables security (security: []).`,
                                        severity: 'warning',
                                        suggestion:
                                            'Ensure this is intentional. Mutating operations should typically be secured.'
                                    });
                                }
                            } else {
                                operationIsSecured = true;
                                operation.security.forEach(secReq => {
                                    Object.keys(secReq).forEach(schemeName =>
                                        allReferencedSchemes.add(schemeName)
                                    );
                                });
                            }
                        } else if (
                            spec.security &&
                            spec.security.length > 0
                        ) {
                            operationIsSecured = true;
                        }

                        if (isMutating) {
                            if (operationIsSecured) {
                                securedPoints++;
                                mutatingOperationsSecured++;
                            } else if (definedSchemes.length > 0) {
                                violations.push({
                                    path,
                                    location: operationLocation,
                                    message: `Mutating operation ${method.toUpperCase()} ${path} is not secured, but security schemes are defined.`,
                                    severity: 'warning',
                                    suggestion:
                                        'Apply a security requirement to this operation or define global security.'
                                });
                            }
                        }
                    });
            });
        }

        return {
            hasMutatingOperations,
            potentialSecurityPoints,
            securedPoints,
            mutatingOperationsSecured,
            operationsCheckedForSecurity,
            operationViolations: violations
        };
    }

    private validateReferencedSchemes(
        definedSchemes: string[],
        allReferencedSchemes: Set<string>,
        violations: RuleViolation[]
    ) {
        allReferencedSchemes.forEach(schemeName => {
            if (!definedSchemes.includes(schemeName)) {
                violations.push({
                    path: '',
                    location: `components.securitySchemes / security definitions`,
                    message: `Security scheme '${schemeName}' is referenced but not defined in components.securitySchemes.`,
                    severity: 'error',
                    suggestion: `Define '${schemeName}' in components.securitySchemes or remove the reference.`
                });
            }
        });
    }

    private checkUnusedDefinedSchemes(
        definedSchemes: string[],
        allReferencedSchemes: Set<string>,
        violations: RuleViolation[]
    ) {
        definedSchemes.forEach(schemeName => {
            if (!allReferencedSchemes.has(schemeName)) {
                violations.push({
                    path: '',
                    location: `components.securitySchemes.${schemeName}`,
                    message: `Security scheme '${schemeName}' is defined but never referenced.`,
                    severity: 'info',
                    suggestion:
                        'Remove the unused security scheme or apply it to operations/globally.'
                });
            }
        });
    }

    private checkMissingSecuritySchemes(
        hasMutatingOperations: boolean,
        definedSchemes: string[],
        violations: RuleViolation[]
    ) {
        if (hasMutatingOperations && definedSchemes.length === 0) {
            violations.push({
                path: '',
                location: 'components.securitySchemes / security',
                message:
                    'API has mutating operations but no security schemes are defined.',
                severity: 'error',
                suggestion:
                    'Define security schemes in components.securitySchemes and apply them to mutating operations or globally.'
            });
        }
    }

    private calculateScore(
        violations: RuleViolation[],
        potentialSecurityPoints: number,
        securedPoints: number,
        hasMutatingOperations: boolean,
        definedSchemes: string[],
        mutatingOperationsSecured: number,
        operationsCheckedForSecurity: number
    ): number {
        let score = this.weight;

        if (violations.some(v => v.severity === 'error')) {
            score = Math.max(
                0,
                this.weight -
                    violations.filter(v => v.severity === 'error').length *
                        (this.weight / 2)
            );
        } else if (potentialSecurityPoints > 0) {
            score = Math.round(
                (securedPoints / potentialSecurityPoints) * this.weight
            );
        } else if (
            !hasMutatingOperations &&
            definedSchemes.length === 0
        ) {
            score = this.weight;
        } else if (
            hasMutatingOperations &&
            definedSchemes.length > 0 &&
            mutatingOperationsSecured === 0 &&
            operationsCheckedForSecurity > 0
        ) {
            score = Math.max(0, this.weight / 3);
        }

        if (
            !violations.some(v => v.severity === 'error') &&
            violations.some(v => v.severity === 'warning')
        ) {
            const warningPenalty =
                violations.filter(v => v.severity === 'warning').length *
                (this.weight * 0.1);
            score = Math.max(0, score - warningPenalty);
        }

        return Math.round(Math.max(0, Math.min(this.weight, score)));
    }
}
