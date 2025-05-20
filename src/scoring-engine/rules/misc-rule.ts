import { OpenAPIV3 } from 'openapi-types';
import { Rule, RuleResult, RuleViolation } from '../types';
import { CRITERIA_WEIGHTS, RULE_NAMES, RULE_DESCRIPTIONS } from "../constants";

// Basic check for semantic versioning (allows for common variations)
const SEMVER_REGEX = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*)(?:\.(?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*))*))?(?:\+([0-9a-zA-Z-]+(?:\.[0-9a-zA-Z-]+)*))?$/;
const URL_REGEX = /^(https?:\/\/|urn:)[^\s/$.?#].[^\s]*$|^\/[^\s]*$/i; // Basic URL or relative path

export class MiscellaneousBestPracticesRule implements Rule {
    name = RULE_NAMES.miscellaneous;
    description = RULE_DESCRIPTIONS.miscellaneous;
    weight = CRITERIA_WEIGHTS.miscellaneous;

    private readonly MIN_PATHS_FOR_COMPONENT_EXPECTATION = 5; // Heuristic

    evaluate(spec: OpenAPIV3.Document): RuleResult {
        const violations: RuleViolation[] = [];
        let achievedInternalScore = 0;
        let maxInternalScore = 0;

        // 1. Versioning
        const versioningResult = this.checkVersioning(spec, violations);
        achievedInternalScore += versioningResult.score;
        maxInternalScore += versioningResult.maxScore;

        // 2. Servers Array
        const serversResult = this.checkServers(spec, violations);
        achievedInternalScore += serversResult.score;
        maxInternalScore += serversResult.maxScore;

        // 3. Tags
        const tagsResult = this.checkTags(spec, violations);
        achievedInternalScore += tagsResult.score;
        maxInternalScore += tagsResult.maxScore;

        // 4. Components Reuse
        const componentsResult = this.checkComponentsReuse(spec, violations);
        achievedInternalScore += componentsResult.score;
        maxInternalScore += componentsResult.maxScore;
        
        // 5. Info Completeness (contact, license)
        const infoCompletenessResult = this.checkInfoCompleteness(spec, violations);
        achievedInternalScore += infoCompletenessResult.score;
        maxInternalScore += infoCompletenessResult.maxScore;
    
        // 6. Operation IDs
        const operationIdsResult = this.checkOperationIds(spec, violations);
        achievedInternalScore += operationIdsResult.score;
        maxInternalScore += operationIdsResult.maxScore;
        
        // 7. ExternalDocs
        const externalDocsResult = this.checkExternalDocs(spec, violations);
        achievedInternalScore += externalDocsResult.score;
        maxInternalScore += externalDocsResult.maxScore;

        let finalScore = 0;
        if (maxInternalScore > 0) {
            finalScore = Math.round((achievedInternalScore / maxInternalScore) * this.weight);
        } else if (Object.keys(spec.paths || {}).length === 0) {
            // If spec is essentially empty, no best practices apply in a meaningful way
            finalScore = this.weight;
        }
        
        finalScore = Math.max(0, Math.min(this.weight, finalScore));

        return {
            score: finalScore,
            maxScore: this.weight,
            violations
        };
    }

    private checkVersioning(spec: OpenAPIV3.Document, violations: RuleViolation[]): { score: number, maxScore: number } {
        let score = 0;
        const maxScore = 2; 

        if (spec.info?.version) {
            score++; // Point for presence
            if (SEMVER_REGEX.test(spec.info.version)) {
                score++; // Point for semantic-like format
            } else {
                violations.push({
                    path: '', location: 'info.version',
                    message: `API version '${spec.info.version}' is not in a standard semantic version format.`,
                    severity: 'info',
                    suggestion: 'Use semantic versioning (e.g., 1.0.0, 2.1.0-beta).'
                });
            }
        } else {
            violations.push({
                path: '', location: 'info.version',
                message: 'API version (`info.version`) is missing.',
                severity: 'warning',
                suggestion: 'Define the API version in `info.version`.'
            });
        }
        return { score, maxScore };
    }

    private checkServers(spec: OpenAPIV3.Document, violations: RuleViolation[]): { score: number, maxScore: number } {
        let score = 0;
        const maxScore = 2;

        if (spec.servers && spec.servers.length > 0) {
            score++; // Point for having a servers array
            let allUrlsValidAndDescribed = true;
            spec.servers.forEach((server, index) => {
                if (!server.url || !URL_REGEX.test(server.url)) {
                    allUrlsValidAndDescribed = false;
                    violations.push({
                        path: '', location: `servers[${index}].url`,
                        message: `Server URL '${server.url || ''}' is invalid or missing.`,
                        severity: 'warning',
                        suggestion: 'Ensure server URLs are valid (e.g., https://api.example.com/v1, /api/v1).'
                    });
                }
                if (!server.description) {
                    // This is a minor issue for this rule, as Descriptions rule might cover it.
                    // allUrlsValidAndDescribed = false; // Don't penalize score heavily here for description
                    violations.push({
                        path: '', location: `servers[${index}]`,
                        message: `Server at URL '${server.url}' is missing a description.`,
                        severity: 'info',
                        suggestion: 'Add a description for each server (e.g., "Production", "Staging").'
                    });
                }
            });
            if (allUrlsValidAndDescribed) { // Primarily based on URL validity for this rule's score
                const allUrlsValid = spec.servers.every(s => s.url && URL_REGEX.test(s.url));
                if (allUrlsValid) score++;
            }
        } else {
            violations.push({
                path: '', location: 'servers',
                message: 'The `servers` array is missing or empty.',
                severity: 'warning',
                suggestion: 'Define at least one server URL for the API.'
            });
        }
        return { score, maxScore };
    }

    private checkTags(spec: OpenAPIV3.Document, violations: RuleViolation[]): { score: number, maxScore: number } {
        let score = 0;
        const maxScore = 3; 

        const definedTags = new Map<string, { description?: string }>();
        if (spec.tags && spec.tags.length > 0) {
            score++; // Point for defining tags
            let allDefinedHaveDescriptions = true;
            spec.tags.forEach(tag => {
                if (tag.name) definedTags.set(tag.name, { description: tag.description });
                if (!tag.description) allDefinedHaveDescriptions = false;
            });
            if (allDefinedHaveDescriptions) score++; // Point if all defined tags have descriptions
        }

        const usedTagsInOps = new Set<string>();
        let operationsExist = false;
        if (spec.paths) {
            Object.values(spec.paths).forEach(pathItem => {
                if (!pathItem) return;
                Object.values(pathItem).forEach(op => {
                    const operation = op as OpenAPIV3.OperationObject;
                    if (operation && operation.tags && Array.isArray(operation.tags)) {
                        operationsExist = true;
                        operation.tags.forEach(tag => usedTagsInOps.add(tag));
                    }
                });
            });
        }

        if (operationsExist && usedTagsInOps.size > 0) {
            score++; // Point for using tags
            usedTagsInOps.forEach(usedTag => {
                if (!definedTags.has(usedTag)) {
                    violations.push({
                        path: '', location: 'operation.tags / spec.tags',
                        message: `Tag '${usedTag}' is used in an operation but not defined in the root \`tags\` array.`,
                        severity: 'warning',
                        suggestion: `Define tag '${usedTag}' in the root \`tags\` array.`
                    });
                }
            });
        } else if (operationsExist && definedTags.size > 0 && usedTagsInOps.size === 0) {
            violations.push({
                path: '', location: 'operations',
                message: 'Tags are defined, but no operations use them.',
                severity: 'info',
                suggestion: 'Assign defined tags to operations for organization.'
            });
        } else if (operationsExist && definedTags.size === 0) {
            violations.push({
                path: '', location: 'spec.tags / operations',
                message: 'Operations exist but no tags are defined or used. Consider using tags.',
                severity: 'info',
                suggestion: 'Define and use tags for better API organization.'
            });
        }
        return { score: Math.max(0, Math.min(score, maxScore)), maxScore };
    }

    private checkComponentsReuse(spec: OpenAPIV3.Document, violations: RuleViolation[]): { score: number, maxScore: number } {
        let score = 0;
        const maxScore = 2;

        let componentsDefined = false;
        if (spec.components && Object.keys(spec.components).some(key => 
            spec.components![key as keyof OpenAPIV3.ComponentsObject] && 
            Object.keys(spec.components![key as keyof OpenAPIV3.ComponentsObject]!).length > 0
        )) {
            componentsDefined = true;
            score++; // Point for defining some components
        }

        const specString = JSON.stringify(spec);
        if (specString.includes('"\\$ref"')) {
            score++; // Point for using $ref, indicating reuse
        } else {
            const numPaths = Object.keys(spec.paths || {}).length;
            if (numPaths >= this.MIN_PATHS_FOR_COMPONENT_EXPECTATION) {
                if (componentsDefined) {
                    violations.push({
                        path: '', location: 'components / various',
                        message: 'Components are defined, but no `$ref` keywords were found, suggesting they might not be reused.',
                        severity: 'info',
                        suggestion: 'Use `$ref` to reference items from `components` for reusability.'
                    });
                } else {
                     violations.push({
                        path: '', location: 'components',
                        message: 'API has several paths but does not define or use reusable components.',
                        severity: 'info',
                        suggestion: 'Define reusable schemas, responses, parameters, etc., in the `components` section.'
                    });
                }
            }
        }
        return { score, maxScore };
    }

    private checkInfoCompleteness(spec: OpenAPIV3.Document, violations: RuleViolation[]): { score: number, maxScore: number } {
        let score = 0;
        const maxScore = 2;

        if (spec.info?.contact && (spec.info.contact.name || spec.info.contact.email || spec.info.contact.url)) {
            score++;
        } else {
            violations.push({
                path: '', location: 'info.contact',
                message: 'Contact information (`info.contact`) is missing or empty.',
                severity: 'info',
                suggestion: 'Add contact details (name, email, or URL) to `info.contact`.'
            });
        }

        if (spec.info?.license && spec.info.license.name) {
            score++;
        } else {
            violations.push({
                path: '', location: 'info.license',
                message: 'License information (`info.license.name`) is missing.',
                severity: 'info',
                suggestion: 'Add license details (at least `name`) to `info.license`.'
            });
        }
        return { score, maxScore };
    }

    private checkOperationIds(spec: OpenAPIV3.Document, violations: RuleViolation[]): { score: number, maxScore: number } {
        let score = 0;
        const maxScore = 2;

        const opIds = new Set<string>();
        let allOpsHaveId = true;
        let duplicateFound = false;
        let opCount = 0;

        if (spec.paths) {
            Object.entries(spec.paths).forEach(([path, pathItem]) => {
                if (!pathItem) return;
                Object.entries(pathItem).forEach(([method, op]) => {
                    if (['get', 'post', 'put', 'delete', 'patch', 'options', 'head', 'trace'].includes(method.toLowerCase())) {
                        opCount++;
                        const operation = op as OpenAPIV3.OperationObject;
                        if (operation.operationId && operation.operationId.trim() !== "") {
                            if (opIds.has(operation.operationId)) {
                                duplicateFound = true;
                                violations.push({
                                    path, location: `${path}.${method}.operationId`,
                                    message: `Duplicate operationId '${operation.operationId}'. Must be unique.`,
                                    severity: 'error',
                                    suggestion: 'Ensure all operationIds are unique.'
                                });
                            } else {
                                opIds.add(operation.operationId);
                            }
                        } else {
                            allOpsHaveId = false;
                            violations.push({
                                path, location: `${path}.${method}`,
                                message: `Operation ${method.toUpperCase()} ${path} is missing an \`operationId\`.`,
                                severity: 'warning',
                                suggestion: 'Add a unique `operationId` to each operation.'
                            });
                        }
                    }
                });
            });
        }

        if (opCount > 0) {
            if (allOpsHaveId) score++;
            if (!duplicateFound && allOpsHaveId) score++; // Second point if all present AND unique
        } else {
            score = maxScore; // No operations, so this check passes by default
        }
        return { score, maxScore };
    }
    
    private checkExternalDocs(spec: OpenAPIV3.Document, violations: RuleViolation[]): { score: number, maxScore: number } {
        let score = 0;
        const maxScore = 1;

        const hasValidExternalDoc = (doc: OpenAPIV3.ExternalDocumentationObject | undefined, loc: string): boolean => {
            if (doc) {
                if (doc.url && URL_REGEX.test(doc.url)) {
                    return true;
                } else {
                    violations.push({
                        path: '', location: loc,
                        message: `ExternalDocumentation object at '${loc}' is missing a valid 'url'.`,
                        severity: 'info', // Not critical, but good to have URL if object exists
                        suggestion: "Provide a valid 'url' for the external documentation."
                    });
                }
            }
            return false;
        };

        if (hasValidExternalDoc(spec.externalDocs, 'externalDocs')) {
            score = 1;
        } else {
            let usedElsewhereCorrectly = false;
            if (spec.tags) {
                spec.tags.forEach((tag, i) => {
                    if (hasValidExternalDoc(tag.externalDocs, `tags[${i}].externalDocs`)) usedElsewhereCorrectly = true;
                });
            }
            if (spec.paths && !usedElsewhereCorrectly) {
                Object.entries(spec.paths).forEach(([path, pi]) => {
                    if (!pi) return;
                    Object.entries(pi).forEach(([method, op]) => {
                        const operation = op as OpenAPIV3.OperationObject;
                        if (operation && hasValidExternalDoc(operation.externalDocs, `${path}.${method}.externalDocs`)) {
                            usedElsewhereCorrectly = true;
                        }
                    });
                });
            }
            if (usedElsewhereCorrectly) {
                score = 1;
            } else if (!spec.externalDocs && !(spec.tags?.some(t=>t.externalDocs)) /* etc */) {
                 violations.push({
                    path: '', location: 'spec',
                    message: 'Consider using `externalDocs` for links to additional documentation.',
                    severity: 'info',
                    suggestion: 'Use `externalDocs` at the root, tag, or operation level.'
                });
            }
        }
        return { score, maxScore };
    }
}

