import { OpenAPIV3 } from 'openapi-types';
import { Rule, RuleResult, RuleViolation } from './types';

export class SchemaTypesRule implements Rule {
  name = 'Schema & Types';
  description = 'Evaluates proper use of data types and schema definitions';
  weight = 20;
  
 evaluate(spec: OpenAPIV3.Document): RuleResult {
    const violations: RuleViolation[] = [];
    
    let totalSchemas = 0;
    let schemasWithViolations = 0;
    
    // Check component schemas
    if (spec.components?.schemas) {
      const schemas = Object.entries(spec.components.schemas);
      totalSchemas += schemas.length;
      
      schemas.forEach(([schemaName, schema]) => {
        if (this.isSchemaObject(schema) && !this.hasProperTypeDefinition(schema)) {
          violations.push({
            path: 'components',
            location: `schemas.${schemaName}`,
            message: 'Schema lacks proper type definition',
            severity: 'error',
            suggestion: 'Define explicit types for all schema objects'
          });
          schemasWithViolations++;
        }
      });
    }
    
    // Check request bodies in paths
    let totalRequestBodies = 0;
    let requestBodiesWithViolations = 0;
    
    if (spec.paths) {
      Object.entries(spec.paths).forEach(([path, pathItem]) => {
        if (!pathItem) return;
        
        // Check each operation 
        const operations: [string, OpenAPIV3.OperationObject][] = Object.entries(pathItem)
          .filter(([key]) => ['get', 'post', 'put', 'delete', 'patch'].includes(key))
          .map(([key, op]) => [key, op as OpenAPIV3.OperationObject]);
        
        operations.forEach(([method, operation]) => {
          if (operation.requestBody) {
            const requestBody = this.resolveRequestBody(operation.requestBody, spec);
            if (requestBody?.content) {
              Object.entries(requestBody.content).forEach(([mediaType, mediaTypeObject]) => {
                totalRequestBodies++;
                
                if (mediaTypeObject.schema && 
                    this.isSchemaObject(mediaTypeObject.schema) && 
                    !this.hasProperTypeDefinition(mediaTypeObject.schema)) {
                  violations.push({
                    path,
                    operation: method.toUpperCase(),
                    location: `requestBody.content.${mediaType}.schema`,
                    message: 'Request body schema lacks proper type definition',
                    severity: 'error',
                    suggestion: 'Define explicit types for request body schemas'
                  });
                  requestBodiesWithViolations++;
                }
              });
            }
          }
        });
      });
    }
    
    // Calculate proportional score
    const totalItems = Math.max(1, totalSchemas + totalRequestBodies);
    const itemsWithViolations = schemasWithViolations + requestBodiesWithViolations;
    const violationPercentage = itemsWithViolations / totalItems;
    
    const score = Math.round(this.weight * (1 - violationPercentage));
    
    return {
      score: Math.max(0, score), 
      maxScore: this.weight,
      violations
    };
  } 
  private isSchemaObject(schema: any): schema is OpenAPIV3.SchemaObject {
    return typeof schema === 'object' && !('$ref' in schema);
  }
  
  private hasProperTypeDefinition(schema: OpenAPIV3.SchemaObject): boolean {
    // A schema should have a type, or use composition keywords
    return Boolean(
      schema.type || 
      schema.allOf || 
      schema.oneOf || 
      schema.anyOf
    );
  }
  
  private resolveRequestBody(
    requestBody: OpenAPIV3.ReferenceObject | OpenAPIV3.RequestBodyObject,
    spec: OpenAPIV3.Document
  ): OpenAPIV3.RequestBodyObject | undefined {
    if ('$ref' in requestBody) {
      const ref = requestBody.$ref;
      if (ref.startsWith('#/components/requestBodies/')) {
        const key = ref.split('/').pop();
        if (key && spec.components?.requestBodies?.[key]) {
          const resolved = spec.components.requestBodies[key];
          if (!('$ref' in resolved)) {
            return resolved;
          }
        }
      }
      return undefined;
    }
    return requestBody;
  }
}
