import { OpenAPIV3 } from 'openapi-types';
import { Rule, RuleResult, RuleViolation } from './types';

export class SchemaTypesRule implements Rule {
  name = 'Schema & Types';
  description = 'Evaluates proper use of data types, schema definitions, and type constraints';
  weight = 20;
  
  private readonly PRIMITIVE_TYPES = ['string', 'number', 'integer', 'boolean', 'array', 'object', 'null'];
  private readonly STRING_FORMATS = ['date', 'date-time', 'password', 'byte', 'binary', 'email', 'uuid', 'uri', 'hostname', 'ipv4', 'ipv6'];
  private readonly NUMBER_FORMATS = ['float', 'double', 'int32', 'int64'];
  
  evaluate(spec: OpenAPIV3.Document): RuleResult {
    const violations: RuleViolation[] = [];
    
    let totalSchemas = 0;
    let schemasWithViolations = new Set<string>();
    
    // Check component schemas
    if (spec.components?.schemas) {
      Object.entries(spec.components.schemas).forEach(([schemaName, schema]) => {
        totalSchemas++;
        const schemaPath = `components.schemas.${schemaName}`;
        
        this.validateSchema(schema, schemaPath, spec, violations, schemasWithViolations);
      });
    }
    
    // Check request/response schemas in paths
    if (spec.paths) {
      Object.entries(spec.paths).forEach(([pathName, pathItem]) => {
        if (!pathItem) return;
        
        // Check each operation (GET, POST, etc.)
        const operations: [string, OpenAPIV3.OperationObject][] = Object.entries(pathItem)
          .filter(([key]) => ['get', 'post', 'put', 'delete', 'patch'].includes(key))
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
            });
          }
          
          // Check parameter schemas
          if (operation.parameters) {
            operation.parameters.forEach((parameter, index) => {
              const resolvedParam = this.resolveParameter(parameter, spec);
              
              if (resolvedParam?.schema) {
                totalSchemas++;
                const paramName = resolvedParam.name || index.toString();
                const schemaPath = `${pathName}.${method}.parameters.${paramName}.schema`;
                
                this.validateSchema(resolvedParam.schema, schemaPath, spec, violations, schemasWithViolations);
              }
            });
          }
        });
      });
    }
    
    // Calculate proportional score
    totalSchemas = Math.max(1, totalSchemas); // Avoid division by zero
    const violationPercentage = schemasWithViolations.size / totalSchemas;
    
    // Apply severity-based weighting
    const errorViolations = violations.filter(v => v.severity === 'error').length;
    const warningViolations = violations.filter(v => v.severity === 'warning').length;
    const infoViolations = violations.filter(v => v.severity === 'info').length;
    
    // Weight errors more heavily than warnings and info
    const weightedViolationScore = (
      (errorViolations * 1.0) + 
      (warningViolations * 0.5) + 
      (infoViolations * 0.2)
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
  
  private validateSchema(
    schema: OpenAPIV3.ReferenceObject | OpenAPIV3.SchemaObject,
    path: string,
    spec: OpenAPIV3.Document,
    violations: RuleViolation[],
    schemasWithViolations: Set<string>
  ): void {
    // Resolve schema reference if needed
    const resolvedSchema = this.resolveSchema(schema, spec);
    if (!resolvedSchema) return;
    
    // Check 1: Schema has a type definition
    if (!this.hasProperTypeDefinition(resolvedSchema)) {
      violations.push({
        path: path.split('.')[0],
        location: path,
        message: 'Schema lacks proper type definition',
        severity: 'error',
        suggestion: 'Define explicit type (string, number, object, etc.) or use composition keywords (allOf, oneOf, anyOf)'
      });
      schemasWithViolations.add(path);
    }

    // Check 2: for valid primitive type
    if (resolvedSchema.type && !this.PRIMITIVE_TYPES.includes(resolvedSchema.type)) {
        violations.push({
            path: path.split('.')[0],
            location: path,
            message: `Schema uses invalid type: '${resolvedSchema.type}'`,
            severity: 'error',
            suggestion: `Use standard OpenAPI types: ${this.PRIMITIVE_TYPES.join(', ')}`
        });
        schemasWithViolations.add(path);
    }
    
    // Check 3: If type is 'object', it should have properties or additionalProperties
    if (resolvedSchema.type === 'object') {
      if (!resolvedSchema.properties && 
          resolvedSchema.additionalProperties !== true && 
          typeof resolvedSchema.additionalProperties !== 'object' &&
          !resolvedSchema.allOf && !resolvedSchema.oneOf && !resolvedSchema.anyOf) {
        violations.push({
          path: path.split('.')[0],
          location: path,
          message: 'Object schema has no properties defined',
          severity: 'error',
          suggestion: 'Define properties or use additionalProperties to specify object structure'
        });
        schemasWithViolations.add(path);
      }
      
      // Check 3.1: If properties exist, validate each property
      if (resolvedSchema.properties) {
        Object.entries(resolvedSchema.properties).forEach(([propName, propSchema]) => {
          this.validateSchema(
            propSchema, 
            `${path}.properties.${propName}`, 
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
          `${path}.additionalProperties`,
          spec,
          violations,
          schemasWithViolations
        );
      }
      
      // Check 3.3: Recommend required properties for better validation
      if (resolvedSchema.properties && 
          (!resolvedSchema.required || resolvedSchema.required.length === 0) && 
          Object.keys(resolvedSchema.properties).length > 0) {
        violations.push({
          path: path.split('.')[0],
          location: path,
          message: 'Object schema has properties but none are marked as required',
          severity: 'warning',
          suggestion: 'Specify which properties are required for more precise validation'
        });
        schemasWithViolations.add(path);
      }
    }
    
    // Check 4: If type is 'array', it should have items defined
    if (resolvedSchema.type === 'array' && !resolvedSchema.items) {
      violations.push({
        path: path.split('.')[0],
        location: path,
        message: 'Array schema is missing items definition',
        severity: 'error',
        suggestion: 'Define items schema to specify the type of array elements'
      });
      schemasWithViolations.add(path);
    } else if (resolvedSchema.type === 'array' && resolvedSchema.items) {
      // Validate array items schema
      this.validateSchema(
        resolvedSchema.items,
        `${path}.items`,
        spec,
        violations,
        schemasWithViolations
      );
    }
    
    // Check 5: Validate string formats
    if (resolvedSchema.type === 'string' && resolvedSchema.format) {
      if (!this.STRING_FORMATS.includes(resolvedSchema.format)) {
        violations.push({
          path: path.split('.')[0],
          location: path,
          message: `String uses non-standard format: '${resolvedSchema.format}'`,
          severity: 'info',
          suggestion: `Consider using standard formats: ${this.STRING_FORMATS.join(', ')}`
        });
        // Not adding to schemasWithViolations as this is just informational
      }
    }
    
    // Check 6: Validate number formats
    if ((resolvedSchema.type === 'number' || resolvedSchema.type === 'integer') && 
        resolvedSchema.format && 
        !this.NUMBER_FORMATS.includes(resolvedSchema.format)) {
      violations.push({
        path: path.split('.')[0],
        location: path,
        message: `Number uses non-standard format: '${resolvedSchema.format}'`,
        severity: 'info',
        suggestion: `Consider using standard formats: ${this.NUMBER_FORMATS.join(', ')}`
      });
      // Not adding to schemasWithViolations as this is just informational
    }
    
    // Check 7: Free-form objects (additionalProperties: true) without schema
    if (resolvedSchema.type === 'object' && 
        resolvedSchema.additionalProperties === true && 
        (!resolvedSchema.properties || Object.keys(resolvedSchema.properties).length === 0)) {
      violations.push({
        path: path.split('.')[0],
        location: path,
        message: 'Schema defines a completely free-form object with no properties',
        severity: 'warning',
        suggestion: 'Define specific properties or schema for additionalProperties for better type safety'
      });
      schemasWithViolations.add(path);
    }
    
    // Check 8: Validate composition schemas (allOf, oneOf, anyOf)
    if (resolvedSchema.allOf) {
      resolvedSchema.allOf.forEach((subSchema, index) => {
        this.validateSchema(
          subSchema,
          `${path}.allOf[${index}]`,
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
          `${path}.oneOf[${index}]`,
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
          `${path}.anyOf[${index}]`,
          spec,
          violations,
          schemasWithViolations
        );
      });
    }
    
    // Check 8: Validate enum values
    if (resolvedSchema.enum) {
      if (resolvedSchema.enum.length === 0) {
        violations.push({
          path: path.split('.')[0],
          location: path,
          message: 'Schema has empty enum array',
          severity: 'error',
          suggestion: 'Add enum values or remove the enum keyword'
        });
        schemasWithViolations.add(path);
      }
      
      // Check for null values in non-nullable enums
      if (resolvedSchema.enum.includes(null) && resolvedSchema.nullable !== true) {
        violations.push({
          path: path.split('.')[0],
          location: path,
          message: 'Enum includes null but schema is not marked as nullable',
          severity: 'warning',
          suggestion: 'Add nullable: true to the schema'
        });
        schemasWithViolations.add(path);
      }
    }
    
    // Check 10: Recommend examples for complex schemas
    if ((resolvedSchema.type === 'object' || resolvedSchema.type === 'array') && 
        !resolvedSchema.example) {
      violations.push({
        path: path.split('.')[0],
        location: path,
        message: 'Complex schema is missing examples',
        severity: 'info',
        suggestion: 'Add example or examples to improve documentation'
      });
      // Not adding to schemasWithViolations as this is just informational
    }
  }
  
  private hasProperTypeDefinition(schema: OpenAPIV3.SchemaObject): boolean {
    // A schema should have a type, or use composition keywords
    return Boolean(
      schema.type || 
      schema.allOf || 
      schema.oneOf || 
      schema.anyOf ||
      schema.enum
    );
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
