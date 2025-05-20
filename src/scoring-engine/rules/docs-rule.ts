import { OpenAPIV3 } from 'openapi-types';
import { Rule, RuleResult, RuleViolation } from '../types';
import {
  RULE_NAMES,
  RULE_DESCRIPTIONS,
  CRITERIA_WEIGHTS,
} from '../constants';
import { resolveReference, calculateScore } from '../helper-functions';

export class DescriptionDocsRule implements Rule {
  name = RULE_NAMES.description_docs;
  description = RULE_DESCRIPTIONS.description_docs;
  weight = CRITERIA_WEIGHTS.description_docs;

  private MIN_DESCRIPTION_LENGTH = 5;

  evaluate(spec: OpenAPIV3.Document): RuleResult {
    const violations: RuleViolation[] = [];
    let totalItems = 0;
    let itemsWithViolations = 0;

    // Info
    ({ totalItems, itemsWithViolations } = this.checkInfoDescription(
      spec,
      violations,
      totalItems,
      itemsWithViolations
    ));

    // Paths
    ({ totalItems, itemsWithViolations } = this.checkPaths(
      spec,
      violations,
      totalItems,
      itemsWithViolations
    ));

    // Components
    ({ totalItems, itemsWithViolations } = this.checkComponentSchemas(
      spec,
      violations,
      totalItems,
      itemsWithViolations
    ));

    // Scoring
    const score = calculateScore(
      violations,
      totalItems,
      this.weight
    );

    return {
      score,
      maxScore: this.weight,
      violations,
    };
  }


  private checkInfoDescription(
    spec: OpenAPIV3.Document,
    violations: RuleViolation[],
    totalItems: number,
    itemsWithViolations: number
  ) {
    totalItems++;
    if (!this.hasValidDescription(spec.info.description)) {
      violations.push({
        path: 'info',
        location: 'description',
        message: 'API info is missing a meaningful description',
        severity: 'error',
        suggestion:
          'Add a detailed description explaining the purpose and usage of the API',
      });
      itemsWithViolations++;
    }
    return { totalItems, itemsWithViolations };
  }

  private checkPaths(
    spec: OpenAPIV3.Document,
    violations: RuleViolation[],
    totalItems: number,
    itemsWithViolations: number
  ) {
    if (!spec.paths) return { totalItems, itemsWithViolations };

    for (const [pathName, pathItem] of Object.entries(spec.paths)) {
      if (!pathItem) continue;

      // Path description
      totalItems++;
      if (!this.hasValidDescription(pathItem.description)) {
        violations.push({
          path: pathName,
          location: 'description',
          message: 'Path is missing a meaningful description',
          severity: 'warning',
          suggestion: 'Add a description explaining the purpose of this path',
        });
        itemsWithViolations++;
      }

      // Path parameters
      if (pathItem.parameters) {
        ({ totalItems, itemsWithViolations } = this.checkParameters(
          pathItem.parameters,
          pathName,
          undefined,
          spec,
          violations,
          totalItems,
          itemsWithViolations
        ));
      }

      // Operations
      ({ totalItems, itemsWithViolations } = this.checkOperations(
        pathItem,
        pathName,
        spec,
        violations,
        totalItems,
        itemsWithViolations
      ));
    }
    return { totalItems, itemsWithViolations };
  }

  private checkOperations(
    pathItem: OpenAPIV3.PathItemObject,
    pathName: string,
    spec: OpenAPIV3.Document,
    violations: RuleViolation[],
    totalItems: number,
    itemsWithViolations: number
  ) {
    const operationMethods = [
      'get',
      'post',
      'put',
      'delete',
      'patch',
      'options',
      'head',
      'trace',
    ];

    for (const method of operationMethods) {
      const operation = (pathItem as any)[method] as
        | OpenAPIV3.OperationObject
        | undefined;
      if (!operation) continue;

      // Operation description/summary
      totalItems++;
      if (
        !this.hasValidDescription(operation.description) &&
        !this.hasValidDescription(operation.summary)
      ) {
        violations.push({
          path: pathName,
          operation: method.toUpperCase(),
          location: 'description/summary',
          message:
            'Operation is missing both a meaningful description and summary',
          severity: 'error',
          suggestion:
            'Add a detailed description or at least a summary explaining what this operation does',
        });
        itemsWithViolations++;
      }

      // Operation parameters
      if (operation.parameters) {
        ({ totalItems, itemsWithViolations } = this.checkParameters(
          operation.parameters,
          pathName,
          method.toUpperCase(),
          spec,
          violations,
          totalItems,
          itemsWithViolations
        ));
      }

      // Request body
      if (operation.requestBody) {
        ({ totalItems, itemsWithViolations } = this.checkRequestBody(
          operation.requestBody,
          pathName,
          method.toUpperCase(),
          spec,
          violations,
          totalItems,
          itemsWithViolations
        ));
      }

      // Responses
      if (operation.responses) {
        ({ totalItems, itemsWithViolations } = this.checkResponses(
          operation.responses,
          pathName,
          method.toUpperCase(),
          spec,
          violations,
          totalItems,
          itemsWithViolations
        ));
      }
    }
    return { totalItems, itemsWithViolations };
  }

  private checkComponentSchemas(
    spec: OpenAPIV3.Document,
    violations: RuleViolation[],
    totalItems: number,
    itemsWithViolations: number
  ) {
    if (!spec.components?.schemas) return { totalItems, itemsWithViolations };

    for (const [schemaName, schema] of Object.entries(
      spec.components.schemas
    )) {
      if (!this.isSchemaObject(schema)) continue;

      totalItems++;
      if (!this.hasValidDescription(schema.description)) {
        violations.push({
          path: 'components',
          location: `schemas.${schemaName}`,
          message: 'Schema is missing a meaningful description',
          severity: 'warning',
          suggestion:
            'Add a description explaining the purpose and structure of this schema',
        });
        itemsWithViolations++;
      }

      // Properties
      if (schema.type === 'object' && schema.properties) {
        for (const [propName, property] of Object.entries(schema.properties)) {
          if (!this.isSchemaObject(property)) continue;
          totalItems++;
          if (!this.hasValidDescription(property.description)) {
            violations.push({
              path: 'components',
              location: `schemas.${schemaName}.properties.${propName}`,
              message: 'Property is missing a meaningful description',
              severity: 'info',
              suggestion:
                'Add a description explaining the purpose and expected values of this property',
            });
            itemsWithViolations++;
          }
        }
      }
    }
    return { totalItems, itemsWithViolations };
  }

  private hasValidDescription(description?: string): boolean {
    return !!description && description.trim().length >= this.MIN_DESCRIPTION_LENGTH;
  }

  private isSchemaObject(schema: any): schema is OpenAPIV3.SchemaObject {
    return typeof schema === 'object' && !('$ref' in schema);
  }

  private checkParameters(
    parameters: (OpenAPIV3.ReferenceObject | OpenAPIV3.ParameterObject)[],
    pathName: string,
    method: string | undefined,
    spec: OpenAPIV3.Document,
    violations: RuleViolation[],
    totalItems: number,
    itemsWithViolations: number
  ) {
    let newTotalItems = totalItems;
    let newItemsWithViolations = itemsWithViolations;

    parameters.forEach((param) => {
      newTotalItems++;

      let paramObj: OpenAPIV3.ParameterObject | undefined;
      let paramName: string;

      if ('$ref' in param) {
        const refParts = param.$ref.split('/');
        paramName = refParts[refParts.length - 1];
        paramObj = resolveReference<OpenAPIV3.ParameterObject>(param.$ref, spec);
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
          suggestion:
            'Add a description explaining the purpose and expected values of this parameter',
        });
        newItemsWithViolations++;
      }
    });

    return { totalItems: newTotalItems, itemsWithViolations: newItemsWithViolations };
  }

  private checkRequestBody(
    requestBody: OpenAPIV3.ReferenceObject | OpenAPIV3.RequestBodyObject,
    pathName: string,
    method: string,
    spec: OpenAPIV3.Document,
    violations: RuleViolation[],
    totalItems: number,
    itemsWithViolations: number
  ) {
    let newTotalItems = totalItems;
    let newItemsWithViolations = itemsWithViolations;

    let requestBodyObj: OpenAPIV3.RequestBodyObject | undefined;

    if ('$ref' in requestBody) {
      requestBodyObj = resolveReference<OpenAPIV3.RequestBodyObject>(
        requestBody.$ref,
        spec
      );
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
          suggestion:
            'Add a description explaining the expected structure and purpose of the request body',
        });
        newItemsWithViolations++;
      }
    }

    return { totalItems: newTotalItems, itemsWithViolations: newItemsWithViolations };
  }

  private checkResponses(
    responses: OpenAPIV3.ResponsesObject,
    pathName: string,
    method: string,
    spec: OpenAPIV3.Document,
    violations: RuleViolation[],
    totalItems: number,
    itemsWithViolations: number
  ) {
    let newTotalItems = totalItems;
    let newItemsWithViolations = itemsWithViolations;

    Object.entries(responses).forEach(([statusCode, response]) => {
      let responseObj: OpenAPIV3.ResponseObject | undefined;

      if ('$ref' in response) {
        responseObj = resolveReference<OpenAPIV3.ResponseObject>(
          response.$ref,
          spec
        );
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
            suggestion:
              'Add a description explaining the meaning of this response and when it occurs',
          });
          newItemsWithViolations++;
        }
      }
    });

    return { totalItems: newTotalItems, itemsWithViolations: newItemsWithViolations };
  }
}

