import { OpenAPIV3 } from 'openapi-types';
import { Rule, RuleResult, RuleViolation } from './types';
import { RULE_NAMES, RULE_DESCRIPTIONS, CRITERIA_WEIGHTS, SEVERITY_SCORE_WEIGHTS } from "./constants";

export class DescriptionDocsRule implements Rule {
  name = RULE_NAMES.description_docs;   
  description = RULE_DESCRIPTIONS.description_docs;
  weight = CRITERIA_WEIGHTS.description_docs;

  // Minimum length for a meaningful description
    private MIN_DESCRIPTION_LENGTH = 5;

    evaluate(spec: OpenAPIV3.Document): RuleResult {
        const violations: RuleViolation[] = [];
        
        // Track counts for proportional scoring
        let totalItems = 0;
        let itemsWithViolations = 0;

        // Check API info description
        totalItems++;
        if (!this.hasValidDescription(spec.info.description)) {
            violations.push({
                path: 'info',
                location: 'description',
                message: 'API info is missing a meaningful description',
                severity: 'error',
                suggestion: 'Add a detailed description explaining the purpose and usage of the API'
            });
            itemsWithViolations++;
        }

        // Check paths and operations
        if (spec.paths) {
            Object.entries(spec.paths).forEach(([pathName, pathItem]) => {
                if (!pathItem) return;

                // Check path description
                totalItems++;
                if (!this.hasValidDescription(pathItem.description)) {
                    violations.push({
                        path: pathName,
                        location: 'description',
                        message: 'Path is missing a meaningful description',
                        severity: 'warning',
                        suggestion: 'Add a description explaining the purpose of this path'
                    });
                    itemsWithViolations++;
                }

                // Check path parameters
                if (pathItem.parameters) {
                    this.checkParameters(pathItem.parameters, pathName, undefined, spec, violations, totalItems, itemsWithViolations);
                }

                // Check operations (GET, POST, etc.)
                const operations: [string, OpenAPIV3.OperationObject][] = Object.entries(pathItem)
                    .filter(([key]) => ['get', 'post', 'put', 'delete', 'patch', 'options', 'head', 'trace'].includes(key))
                    .map(([key, op]) => [key, op as OpenAPIV3.OperationObject]);

                operations.forEach(([method, operation]) => {
                    // Check operation description
                    totalItems++;
                    if (!this.hasValidDescription(operation.description) && !this.hasValidDescription(operation.summary)) {
                        violations.push({
                            path: pathName,
                            operation: method.toUpperCase(),
                            location: 'description/summary',
                            message: 'Operation is missing both a meaningful description and summary',
                            severity: 'error',
                            suggestion: 'Add a detailed description or at least a summary explaining what this operation does'
                        });
                        itemsWithViolations++;
                    }

                    // Check operation parameters
                    if (operation.parameters) {
                        const { newTotalItems, newItemsWithViolations } = this.checkParameters(
                            operation.parameters, 
                            pathName, 
                            method.toUpperCase(), 
                            spec, 
                            violations,
                            totalItems,
                            itemsWithViolations
                        );
                        totalItems = newTotalItems;
                        itemsWithViolations = newItemsWithViolations;
                    }

                    // Check request body
                    if (operation.requestBody) {
                        const { newTotalItems, newItemsWithViolations } = this.checkRequestBody(
                            operation.requestBody,
                            pathName,
                            method.toUpperCase(),
                            spec,
                            violations,
                            totalItems,
                            itemsWithViolations
                        );
                        totalItems = newTotalItems;
                        itemsWithViolations = newItemsWithViolations;
                    }

                    // Check responses
                    if (operation.responses) {
                        const { newTotalItems, newItemsWithViolations } = this.checkResponses(
                            operation.responses,
                            pathName,
                            method.toUpperCase(),
                            spec,
                            violations,
                            totalItems,
                            itemsWithViolations
                        );
                        totalItems = newTotalItems;
                        itemsWithViolations = newItemsWithViolations;
                    }
                });
            });
        }

        // Check component schemas
        if (spec.components?.schemas) {
            Object.entries(spec.components.schemas).forEach(([schemaName, schema]) => {
                if (this.isSchemaObject(schema)) {
                    totalItems++;
                    if (!this.hasValidDescription(schema.description)) {
                        violations.push({
                            path: 'components',
                            location: `schemas.${schemaName}`,
                            message: 'Schema is missing a meaningful description',
                            severity: 'warning',
                            suggestion: 'Add a description explaining the purpose and structure of this schema'
                        });
                        itemsWithViolations++;
                    }

                    // Check properties descriptions if it's an object
                    if (schema.type === 'object' && schema.properties) {
                        Object.entries(schema.properties).forEach(([propName, property]) => {
                            if (this.isSchemaObject(property)) {
                                totalItems++;
                                if (!this.hasValidDescription(property.description)) {
                                    violations.push({
                                        path: 'components',
                                        location: `schemas.${schemaName}.properties.${propName}`,
                                        message: 'Property is missing a meaningful description',
                                        severity: 'info',
                                        suggestion: 'Add a description explaining the purpose and expected values of this property'
                                    });
                                    itemsWithViolations++;
                                }
                            }
                        });
                    }
                }
            });
        }

        // Calculate proportional score
        totalItems = Math.max(1, totalItems); // Avoid division by zero
        const violationPercentage = itemsWithViolations / totalItems;
        
        // Apply severity-based weighting
        const errorViolations = violations.filter(v => v.severity === 'error').length;
        const warningViolations = violations.filter(v => v.severity === 'warning').length;
        const infoViolations = violations.filter(v => v.severity === 'info').length;
        
        // Weight errors more heavily than warnings and info
        const weightedViolationPercentage = (
            (errorViolations * 1.0) + 
            (warningViolations * 0.5) + 
            (infoViolations * 0.2)
        ) / totalItems;
        
        // Calculate final score
        let score = Math.round(this.weight * (1 - weightedViolationPercentage));
        
        // Ensure minimum penalty for any errors
        if (errorViolations > 0 && score > this.weight - 2) {
            score = this.weight - 2;
        }
        
        // Ensure score doesn't go below 0
        score = Math.max(0, score);

        return {
            score,
            maxScore: this.weight,
            violations
        };
    }

    private hasValidDescription(description?: string): boolean {
        return !!description && description.trim().length >= this.MIN_DESCRIPTION_LENGTH;
    }

    private isSchemaObject(schema: any): schema is OpenAPIV3.SchemaObject {
        return typeof schema === 'object' && !('$ref' in schema);
    }

    private resolveReference<T>(ref: string, spec: OpenAPIV3.Document): T | undefined {
        const parts = ref.split('/').slice(1); // Remove the leading '#'
        
        let current: any = spec;
        for (const part of parts) {
            if (!current[part]) return undefined;
            current = current[part];
        }
        
        return current as T;
    }

    private checkParameters(
        parameters: (OpenAPIV3.ReferenceObject | OpenAPIV3.ParameterObject)[],
        pathName: string,
        method: string | undefined,
        spec: OpenAPIV3.Document,
        violations: RuleViolation[],
        totalItems: number,
        itemsWithViolations: number
    ): { newTotalItems: number, newItemsWithViolations: number } {
        let newTotalItems = totalItems;
        let newItemsWithViolations = itemsWithViolations;

        parameters.forEach(param => {
            newTotalItems++;
            
            let paramObj: OpenAPIV3.ParameterObject | undefined;
            let paramName: string;
            
            if ('$ref' in param) {
                // Resolve parameter reference
                const refParts = param.$ref.split('/');
                paramName = refParts[refParts.length - 1];
                paramObj = this.resolveReference<OpenAPIV3.ParameterObject>(param.$ref, spec);
            } else {
                paramObj = param;
                paramName = param.name;
            }
            
            if (paramObj && !this.hasValidDescription(paramObj.description)) {
                violations.push({
                    path: pathName,
                    operation: method,
                    location: `parameters.${paramName}`,
                    message: `Parameter '${paramName}' is missing a meaningful description`,
                    severity: 'warning',
                    suggestion: 'Add a description explaining the purpose and expected values of this parameter'
                });
                newItemsWithViolations++;
            }
        });

        return { newTotalItems, newItemsWithViolations };
    }

    private checkRequestBody(
        requestBody: OpenAPIV3.ReferenceObject | OpenAPIV3.RequestBodyObject,
        pathName: string,
        method: string,
        spec: OpenAPIV3.Document,
        violations: RuleViolation[],
        totalItems: number,
        itemsWithViolations: number
    ): { newTotalItems: number, newItemsWithViolations: number } {
        let newTotalItems = totalItems;
        let newItemsWithViolations = itemsWithViolations;
        
        let requestBodyObj: OpenAPIV3.RequestBodyObject | undefined;
        
        if ('$ref' in requestBody) {
            // Resolve request body reference
            requestBodyObj = this.resolveReference<OpenAPIV3.RequestBodyObject>(requestBody.$ref, spec);
        } else {
            requestBodyObj = requestBody;
        }
        
        if (requestBodyObj) {
            newTotalItems++;
            if (!this.hasValidDescription(requestBodyObj.description)) {
                violations.push({
                    path: pathName,
                    operation: method,
                    location: 'requestBody',
                    message: 'Request body is missing a meaningful description',
                    severity: 'warning',
                    suggestion: 'Add a description explaining the expected structure and purpose of the request body'
                });
                newItemsWithViolations++;
            }
            
            // Check content schemas
            if (requestBodyObj.content) {
                Object.entries(requestBodyObj.content).forEach(([mediaType, mediaTypeObj]) => {
                    if (mediaTypeObj.schema) {
                        // We don't check schema descriptions here as they're covered in the component schemas check
                        // But we could add specific checks for inline schemas if needed
                    }
                });
            }
        }
        
        return { newTotalItems, newItemsWithViolations };
    }

    private checkResponses(
        responses: OpenAPIV3.ResponsesObject,
        pathName: string,
        method: string,
        spec: OpenAPIV3.Document,
        violations: RuleViolation[],
        totalItems: number,
        itemsWithViolations: number
    ): { newTotalItems: number, newItemsWithViolations: number } {
        let newTotalItems = totalItems;
        let newItemsWithViolations = itemsWithViolations;
        
        Object.entries(responses).forEach(([statusCode, response]) => {
            let responseObj: OpenAPIV3.ResponseObject | undefined;
            
            if ('$ref' in response) {
                // Resolve response reference
                responseObj = this.resolveReference<OpenAPIV3.ResponseObject>(response.$ref, spec);
            } else {
                responseObj = response;
            }
            
            if (responseObj) {
                newTotalItems++;
                if (!this.hasValidDescription(responseObj.description)) {
                    violations.push({
                        path: pathName,
                        operation: method,
                        location: `responses.${statusCode}`,
                        message: `Response ${statusCode} is missing a meaningful description`,
                        severity: 'error',
                        suggestion: 'Add a description explaining the meaning of this response and when it occurs'
                    });
                    newItemsWithViolations++;
                }
            }
        });
        
        return { newTotalItems, newItemsWithViolations };
    }
}
