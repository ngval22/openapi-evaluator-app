import { OpenAPIV3 } from 'openapi-types';
import { Rule, RuleResult, RuleViolation } from './types';
import { SEVERITY_SCORE_WEIGHTS, CRITERIA_WEIGHTS, RULE_NAMES, RULE_DESCRIPTIONS } from "./constants";

export class SchemaTypesRule implements Rule {
    name = RULE_NAMES.schema_types;   
    description = RULE_DESCRIPTIONS.schema_types;
    weight = CRITERIA_WEIGHTS.schema_types;

    private readonly PRIMITIVE_TYPES = ['string', 'number', 'integer', 'boolean', 'array', 'object', 'null'];
    private readonly STRING_FORMATS = ['date', 'date-time', 'password', 'byte', 'binary', 'email', 'uuid', 'uri', 'hostname', 'ipv4', 'ipv6'];
    private readonly NUMBER_FORMATS = ['float', 'double', 'int32', 'int64'];

    evaluate(spec: OpenAPIV3.Document): RuleResult {
        const violations: RuleViolation[] = [];

        let totalSchemas = 0;
        let schemasWithViolations = new Set<string>();

        // Checking all the main locations where schema could reside
        totalSchemas += this.checkComponentsForSchemas(spec, violations, schemasWithViolations);
        totalSchemas += this.checkPathsForSchemas(spec, violations, schemasWithViolations);

        // Calculate proportional score
        totalSchemas = Math.max(1, totalSchemas); // Avoid division by zero
        const violationPercentage = schemasWithViolations.size / totalSchemas;

        // Apply severity-based weighting
        const errorViolations = violations.filter(v => v.severity === 'error').length;
        const warningViolations = violations.filter(v => v.severity === 'warning').length;
        const infoViolations = violations.filter(v => v.severity === 'info').length;

        // Weight errors more heavily than warnings and info
        const weightedViolationScore = (
            (errorViolations * SEVERITY_SCORE_WEIGHTS.error) + 
            (warningViolations * SEVERITY_SCORE_WEIGHTS.warning) + 
            (infoViolations * SEVERITY_SCORE_WEIGHTS.info)
        ) / totalSchemas;

        // Calculate final score using a combination of percentage and weighted violations
        const combinedImpact = (violationPercentage + weightedViolationScore) / 2;
        let score = Math.round(this.weight * (1 - combinedImpact));

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

    private checkComponentsForSchemas(spec: OpenAPIV3.Document, violations: RuleViolation[], schemasWithViolations: Set<string>) {
        let totalSchemas = 0;
        // Check component schemas
        if (spec.components?.schemas) {
            Object.entries(spec.components.schemas).forEach(([schemaName, schema]) => {
                totalSchemas++;
                const schemaPath = `components.schemas.${schemaName}`;

                this.validateSchema(schema, schemaPath, spec, violations, schemasWithViolations);
            });
        }

        // Check reusable component parameters
        if (spec.components?.parameters) {
            Object.entries(spec.components.parameters).forEach(([paramName, parameter]) => {
                const resolvedParam = this.resolveParameter(parameter, spec);
                if (resolvedParam?.schema) {
                    totalSchemas++;
                    const schemaPath = `components.parameters.${paramName}.schema`;
                    this.validateSchema(resolvedParam.schema, schemaPath, spec, violations, schemasWithViolations);
                }
            });
        }

        // Check reusable component request bodies
        if (spec.components?.requestBodies) {
            Object.entries(spec.components.requestBodies).forEach(([requestBodyName, requestBody]) => {
                const resolvedRequestBody = this.resolveRequestBody(requestBody, spec);
                if (resolvedRequestBody?.content) {
                    Object.entries(resolvedRequestBody.content).forEach(([mediaType, mediaTypeObject]) => {
                        if (mediaTypeObject.schema) {
                            totalSchemas++;
                            const schemaPath = `components.requestBodies.${requestBodyName}.content.${mediaType}.schema`;
                            this.validateSchema(mediaTypeObject.schema, schemaPath, spec, violations, schemasWithViolations);
                        }
                    });
                }
            });
        }

        // Check reusable component responses
        if (spec.components?.responses) {
            Object.entries(spec.components.responses).forEach(([responseName, response]) => {
                const resolvedResponse = this.resolveResponse(response, spec);
                if (resolvedResponse?.content) {
                    Object.entries(resolvedResponse.content).forEach(([mediaType, mediaTypeObject]) => {
                        if (mediaTypeObject.schema) {
                            totalSchemas++;
                            const schemaPath = `components.responses.${responseName}.content.${mediaType}.schema`;
                            this.validateSchema(mediaTypeObject.schema, schemaPath, spec, violations, schemasWithViolations);
                        }
                    });
                }
                // Check reusable response headers
                if (resolvedResponse?.headers) {
                    Object.entries(resolvedResponse.headers).forEach(([headerName, header]) => {
                        // Headers can be a HeaderObject or a ReferenceObject
                        const resolvedHeader =  '$ref' in header ? this.resolveHeader(header, spec) : header;

                        if (resolvedHeader?.schema) {
                            totalSchemas++;
                            const schemaPath = `components.responses.${responseName}.headers.${headerName}.schema`;
                            this.validateSchema(resolvedHeader.schema, schemaPath, spec, violations, schemasWithViolations);
                        }
                    });
                }
            });
        }

        // Check reusable component headers
        if (spec.components?.headers) {
            Object.entries(spec.components.headers).forEach(([headerName, header]) => {
                // Headers can be a HeaderObject or a ReferenceObject
                const resolvedHeader =  '$ref' in header ? this.resolveHeader(header, spec) : header;
                if (resolvedHeader?.schema) {
                    totalSchemas++;
                    const schemaPath = `components.headers.${headerName}.schema`;
                    this.validateSchema(resolvedHeader.schema, schemaPath, spec, violations, schemasWithViolations);
                }
            });
        }

        return totalSchemas;
    }

    private checkPathsForSchemas(spec: OpenAPIV3.Document, violations: RuleViolation[], schemasWithViolations: Set<string>) : number {
        let totalSchemas = 0;
        // Check request/response schemas in paths
        if (spec.paths) {
            Object.entries(spec.paths).forEach(([pathName, pathItem]) => {
                if (!pathItem) return; // Handle potential null/undefined path items

                // Check each operation (GET, POST, etc.)
                const operations: [string, OpenAPIV3.OperationObject][] = Object.entries(pathItem)
                .filter(([key]) => ['get', 'post', 'put', 'delete', 'patch', 'options', 'head', 'trace'].includes(key)) // Added all HTTP methods
                .map(([key, op]) => [key, op as OpenAPIV3.OperationObject]);

                operations.forEach(([method, operation]) => {
                    // Check request body schemas
                    if (operation.requestBody) {
                        const requestBody = this.resolveRequestBody(operation.requestBody, spec);
                        if (requestBody?.content) {
                            Object.entries(requestBody.content).forEach(([mediaType, mediaTypeObject]) => {
                                if (mediaTypeObject.schema) {
                                    totalSchemas++;
                                    const schemaPath = `${pathName}.${method}.requestBody.content.${mediaType}.schema`;

                                    this.validateSchema(mediaTypeObject.schema, schemaPath, spec, violations, schemasWithViolations);
                                }
                            });
                        }
                    }

                    // Check response schemas
                    if (operation.responses) {
                        Object.entries(operation.responses).forEach(([statusCode, response]) => {
                            const resolvedResponse = this.resolveResponse(response, spec);

                            if (resolvedResponse?.content) {
                                Object.entries(resolvedResponse.content).forEach(([mediaType, mediaTypeObject]) => {
                                    if (mediaTypeObject.schema) {
                                        totalSchemas++;
                                        const schemaPath = `${pathName}.${method}.responses.${statusCode}.content.${mediaType}.schema`;

                                        this.validateSchema(mediaTypeObject.schema, schemaPath, spec, violations, schemasWithViolations);
                                    }
                                });
                            }

                            // Check inline response header schemas
                            if (resolvedResponse?.headers) {
                                Object.entries(resolvedResponse.headers).forEach(([headerName, header]) => {
                                    // Headers can be a HeaderObject or a ReferenceObject
                                    const resolvedHeader =  '$ref' in header ? this.resolveHeader(header, spec) : header;
                                    if (resolvedHeader?.schema) {
                                        totalSchemas++;
                                        const schemaPath = `${pathName}.${method}.responses.${statusCode}.headers.${headerName}.schema`;
                                        this.validateSchema(resolvedHeader.schema, schemaPath, spec, violations, schemasWithViolations);
                                    }
                                });
                            }
                        });
                    }

                    // Check parameter schemas (inline in paths)
                    if (operation.parameters) {
                        operation.parameters.forEach((parameter, index) => {
                            const resolvedParam = this.resolveParameter(parameter, spec);

                            if (resolvedParam?.schema) {
                                totalSchemas++;
                                const paramName = resolvedParam.name || `index${index}`; // Use index if name is missing
                                const schemaPath = `${pathName}.${method}.parameters.${paramName}.schema`;
                                this.validateSchema(resolvedParam.schema, schemaPath, spec, violations, schemasWithViolations);
                            }
                        });
                    }
                });
            });
        }
        return totalSchemas;
    }

    private validateSchema(
        schema: OpenAPIV3.ReferenceObject | OpenAPIV3.SchemaObject,
        path: string, // Represents the path in the original spec
        spec: OpenAPIV3.Document,
        violations: RuleViolation[],
        schemasWithViolations: Set<string>
    ): void {
        const originalPath = path; // Keep the original path for violation location

        // Resolve schema reference if needed
        const resolvedSchema = this.resolveSchema(schema, spec);
        if (!resolvedSchema) {
             // If a reference cannot be resolved, it's a significant error
            if ('$ref' in schema) {
                 violations.push({
                    path: originalPath.split('.')[0],
                    location: originalPath,
                    message: `Unresolved schema reference: ${schema.$ref}`,
                    severity: 'error',
                    suggestion: `Ensure the reference '${schema.$ref}' points to a valid schema in the components or elsewhere.`
                 });
                 schemasWithViolations.add(originalPath);
            }
            return; // Stop processing if schema cannot be resolved
        }


        // Check 1: Schema has a type definition or composition
        if (!this.isSchemaDefined(resolvedSchema)) {
            violations.push({
                path: originalPath.split('.')[0],
                location: originalPath,
                message: 'Schema lacks a type definition or composition keyword (allOf, oneOf, anyOf)',
                severity: 'error',
                suggestion: 'Define an explicit type (string, number, object, etc.) or use a composition keyword.'
            });
            schemasWithViolations.add(originalPath);
        } else if (resolvedSchema.type && !this.PRIMITIVE_TYPES.includes(resolvedSchema.type)) {
             // Check 2: If type is defined, ensure it's a valid primitive type
             violations.push({
                path: originalPath.split('.')[0],
                location: originalPath,
                message: `Schema uses invalid type: '${resolvedSchema.type}'`,
                severity: 'error',
                suggestion: `Use standard OpenAPI types: ${this.PRIMITIVE_TYPES.join(', ')}`
            });
            schemasWithViolations.add(originalPath);
        }


        const hasComposition = resolvedSchema.allOf || resolvedSchema.oneOf || resolvedSchema.anyOf;
        // Check 3: If type is 'object', it should have properties or additionalProperties (unless using composition)
        if (resolvedSchema.type === 'object') {
            const hasPropertiesOrAdditional = !!resolvedSchema.properties ||
                                             resolvedSchema.additionalProperties === true ||
                                             typeof resolvedSchema.additionalProperties === 'object';
            if (!hasPropertiesOrAdditional && !hasComposition) {
                 violations.push({
                    path: originalPath.split('.')[0],
                    location: originalPath,
                    message: 'Object schema has no properties or additionalProperties defined and is not using composition',
                    severity: 'warning', // Changed to warning as it might be intentional for fully free-form
                    suggestion: 'Define properties, use additionalProperties, or use composition keywords to specify object structure'
                });
                 // Add to schemasWithViolations if this is treated as a warning for scoring
                schemasWithViolations.add(originalPath);
            }


            // Check 3.1: If properties exist, validate each property
            if (resolvedSchema.properties) {
                Object.entries(resolvedSchema.properties).forEach(([propName, propSchema]) => {
                    this.validateSchema(
                        propSchema,
                        `${originalPath}.properties.${propName}`,
                        spec,
                        violations,
                        schemasWithViolations
                    );
                });
            }

            // Check 3.2: If additionalProperties is an object, validate it
            if (typeof resolvedSchema.additionalProperties === 'object') {
                this.validateSchema(
                    resolvedSchema.additionalProperties,
                    `${originalPath}.additionalProperties`,
                    spec,
                    violations,
                    schemasWithViolations
                );
            }

            // Check 3.3: Recommend required properties for better validation
            // Only check if properties are explicitly defined
            if (resolvedSchema.properties &&
                Object.keys(resolvedSchema.properties).length > 0 &&
                (!resolvedSchema.required || resolvedSchema.required.length === 0)
                ) {
                violations.push({
                    path: originalPath.split('.')[0],
                    location: originalPath,
                    message: 'Object schema has properties defined but none are marked as required',
                    severity: 'info', // Often just an informational suggestion
                    suggestion: 'Specify which properties are required for more precise validation'
                });
                // Not adding to schemasWithViolations as this is informational
            }
        }

        // Check 4: If type is 'array', it should have items defined
        if (resolvedSchema.type === 'array') {
            if (!resolvedSchema.items) {
                 violations.push({
                    path: originalPath.split('.')[0],
                    location: originalPath,
                    message: 'Array schema is missing items definition',
                    severity: 'error',
                    suggestion: 'Define items schema to specify the type of array elements'
                 });
                schemasWithViolations.add(originalPath);
            } else {
                // Validate array items schema
                this.validateSchema(
                    resolvedSchema.items,
                    `${originalPath}.items`,
                    spec,
                    violations,
                    schemasWithViolations
                );
            }
        }


        // Check 5: Validate string formats
        if (resolvedSchema.type === 'string' && resolvedSchema.format) {
            if (!this.STRING_FORMATS.includes(resolvedSchema.format)) {
                violations.push({
                    path: originalPath.split('.')[0],
                    location: originalPath,
                    message: `String uses non-standard format: '${resolvedSchema.format}'`,
                    severity: 'info',
                    suggestion: `Consider using standard formats: ${this.STRING_FORMATS.join(', ')}`
                });
            }
        }

        // Check 6: Validate number formats
        if ((resolvedSchema.type === 'number' || resolvedSchema.type === 'integer') &&
            resolvedSchema.format &&
            !this.NUMBER_FORMATS.includes(resolvedSchema.format)) {
            violations.push({
                path: originalPath.split('.')[0],
                location: originalPath,
                message: `Number uses non-standard format: '${resolvedSchema.format}'`,
                severity: 'info',
                suggestion: `Consider using standard formats: ${this.NUMBER_FORMATS.join(', ')}`
            });
        }

         // Check 7: Explicitly checking for completely free-form objects (type: object with no properties and additionalProperties: true)
        if (resolvedSchema.type === 'object' &&
            resolvedSchema.additionalProperties === true &&
            (!resolvedSchema.properties || Object.keys(resolvedSchema.properties).length === 0) &&
            !hasComposition // Ensure it's not just part of a composition that defines structure
           ) {
            violations.push({
                path: originalPath.split('.')[0],
                location: originalPath,
                message: 'Schema defines a completely free-form object with no defined properties or composition',
                severity: 'warning', // Consider this a warning as it lacks clarity
                suggestion: 'Define specific properties or a schema for additionalProperties for better type safety and clarity.'
            });
            schemasWithViolations.add(originalPath);
        }

        // Check 8: Validate composition schemas (allOf, oneOf, anyOf)
        if (resolvedSchema.allOf) {
            resolvedSchema.allOf.forEach((subSchema, index) => {
                this.validateSchema(
                    subSchema,
                    `${originalPath}.allOf[${index}]`,
                    spec,
                    violations,
                    schemasWithViolations
                );
            });
        }

        if (resolvedSchema.oneOf) {
            resolvedSchema.oneOf.forEach((subSchema, index) => {
                this.validateSchema(
                    subSchema,
                    `${originalPath}.oneOf[${index}]`,
                    spec,
                    violations,
                    schemasWithViolations
                );
            });
        }

        if (resolvedSchema.anyOf) {
            resolvedSchema.anyOf.forEach((subSchema, index) => {
                this.validateSchema(
                    subSchema,
                    `${originalPath}.anyOf[${index}]`,
                    spec,
                    violations,
                    schemasWithViolations
                );
            });
        }

        // Check 9: Validate enum values
        if (resolvedSchema.enum) {
            if (resolvedSchema.enum.length === 0) {
                violations.push({
                    path: originalPath.split('.')[0],
                    location: originalPath,
                    message: 'Schema has empty enum array',
                    severity: 'error',
                    suggestion: 'Add enum values or remove the enum keyword'
                });
                schemasWithViolations.add(originalPath);
            }

            // Check for null values in enums without explicitly allowing null in type or nullable
            if (resolvedSchema.enum.includes(null)) {
                const allowsNullType = Array.isArray(resolvedSchema.type) && resolvedSchema.type.includes('null');
                if (resolvedSchema.nullable !== true && !allowsNullType) {
                     violations.push({
                        path: originalPath.split('.')[0],
                        location: originalPath,
                        message: 'Enum includes null but schema is not marked as nullable or does not include "null" in type array',
                        severity: 'warning',
                        suggestion: 'Add nullable: true or include "null" in the type array (for OpenAPI 3.1+).'
                    });
                    schemasWithViolations.add(originalPath);
                }
            }
        }

         // Check 10: Recommend descriptions for schemas and their properties
        if (!resolvedSchema.description) {
             violations.push({
                path: originalPath.split('.')[0],
                location: originalPath,
                message: 'Schema is missing a description',
                severity: 'info',
                suggestion: 'Add a description to explain the purpose of the schema.'
            });
        }
         // If it's an object with properties, check for property descriptions (can be a separate loop if needed)
        if (resolvedSchema.type === 'object' && resolvedSchema.properties) {
             Object.entries(resolvedSchema.properties).forEach(([propName, propSchema]) => {
                 const resolvedPropSchema = this.resolveSchema(propSchema, spec);
                 if (resolvedPropSchema && !resolvedPropSchema.description) {
                      violations.push({
                        path: originalPath.split('.')[0],
                        location: `${originalPath}.properties.${propName}`,
                        message: `Schema property '${propName}' is missing a description`,
                        severity: 'info',
                        suggestion: `Add a description for the '${propName}' property.`
                     });
                 }
             });
         }
        // Check 11: Recommend examples for schemas
        if (!resolvedSchema.example) {
            // Adjust severity based on complexity
             const severity = (resolvedSchema.type === 'object' || resolvedSchema.type === 'array') ? 'warning' : 'info';

            violations.push({
                path: originalPath.split('.')[0],
                location: originalPath,
                message: `Schema is missing examples (example or examples)`,
                severity: severity,
                suggestion: 'Add example or examples to improve documentation and understanding.'
            });
        }
    }

    private isSchemaDefined(schema: OpenAPIV3.SchemaObject): boolean {
        return !!schema.type || !!schema.allOf || !!schema.oneOf || !!schema.anyOf;
    }

    private resolveHeader(
        header: OpenAPIV3.HeaderObject | OpenAPIV3.ReferenceObject,
        spec: OpenAPIV3.Document
    ): OpenAPIV3.HeaderObject | undefined {
         if ('$ref' in header) {
            return this.resolveReference<OpenAPIV3.HeaderObject>(header.$ref, spec);
        }
        return header;
    }

    private resolveSchema(
        schema: OpenAPIV3.ReferenceObject | OpenAPIV3.SchemaObject,
        spec: OpenAPIV3.Document
    ): OpenAPIV3.SchemaObject | undefined {
        if ('$ref' in schema) {
            return this.resolveReference<OpenAPIV3.SchemaObject>(schema.$ref, spec);
        }
        return schema;
    }

    private resolveRequestBody(
        requestBody: OpenAPIV3.ReferenceObject | OpenAPIV3.RequestBodyObject,
        spec: OpenAPIV3.Document
    ): OpenAPIV3.RequestBodyObject | undefined {
        if ('$ref' in requestBody) {
            return this.resolveReference<OpenAPIV3.RequestBodyObject>(requestBody.$ref, spec);
        }
        return requestBody;
    }

    private resolveResponse(
        response: OpenAPIV3.ReferenceObject | OpenAPIV3.ResponseObject,
        spec: OpenAPIV3.Document
    ): OpenAPIV3.ResponseObject | undefined {
        if ('$ref' in response) {
            return this.resolveReference<OpenAPIV3.ResponseObject>(response.$ref, spec);
        }
        return response;
    }

    private resolveParameter(
        parameter: OpenAPIV3.ReferenceObject | OpenAPIV3.ParameterObject,
        spec: OpenAPIV3.Document
    ): OpenAPIV3.ParameterObject | undefined {
        if ('$ref' in parameter) {
            return this.resolveReference<OpenAPIV3.ParameterObject>(parameter.$ref, spec);
        }
        return parameter;
    }

    private resolveReference<T>(ref: string, spec: OpenAPIV3.Document): T | undefined {
        if (!ref.startsWith('#/')) return undefined;

        const parts = ref.substring(2).split('/');
        let current: any = spec;

        for (const part of parts) {
            if (!current[part]) return undefined;
            current = current[part];
        }

        return current as T;
    }
}
