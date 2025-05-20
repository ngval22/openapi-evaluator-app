import { PathsOperationsRule } from '../../../src/scoring-engine/rules/path-rule';
import { OpenAPIV3 } from 'openapi-types';
import { CRITERIA_WEIGHTS, RULE_NAMES, RULE_DESCRIPTIONS } from '../../../src/scoring-engine/constants';
import * as helperFunctions from '../../../src/scoring-engine/helper-functions';

// Mock the helper functions
jest.mock('../../../src/scoring-engine/helper-functions', () => ({
  calculateScore: jest.fn().mockReturnValue(10) // Default mock return value
}));

describe('PathsOperationsRule', () => {
  let rule: PathsOperationsRule;
  
  beforeEach(() => {
    rule = new PathsOperationsRule();
    jest.clearAllMocks();
  });

  test('should have correct name, description and weight', () => {
    expect(rule.name).toBe(RULE_NAMES.paths_operations);
    expect(rule.description).toBe(RULE_DESCRIPTIONS.paths_operations);
    expect(rule.weight).toBe(CRITERIA_WEIGHTS.paths_operations);
  });

  test('should detect missing paths', () => {
    const spec: OpenAPIV3.Document = {
      openapi: '3.0.0',
      info: {
        title: 'Test API',
        version: '1.0.0'
      },
      paths: {}
    };

    const result = rule.evaluate(spec);
    expect(result.violations).toHaveLength(1);
    expect(result.violations[0].message).toBe('No paths defined in the API specification');
    expect(result.violations[0].severity).toBe('error');
  });

  test('should detect inconsistent trailing slashes', () => {
    const spec: OpenAPIV3.Document = {
      openapi: '3.0.0',
      info: {
        title: 'Test API',
        version: '1.0.0'
      },
      paths: {
        '/users': {},
        '/products/': {}
      }
    };

    const result = rule.evaluate(spec);
    expect(result.violations).toContainEqual(
      expect.objectContaining({
        message: 'Inconsistent use of trailing slashes in paths',
        severity: 'warning'
      })
    );
  });

  test('should detect non-kebab-case paths', () => {
    const spec: OpenAPIV3.Document = {
      openapi: '3.0.0',
      info: {
        title: 'Test API',
        version: '1.0.0'
      },
      paths: {
        '/users': {},
        '/userProfiles': {} // camelCase instead of kebab-case
      }
    };

    const result = rule.evaluate(spec);
    expect(result.violations).toContainEqual(
      expect.objectContaining({
        message: 'Paths should follow kebab-case naming convention',
        severity: 'warning'
      })
    );
  });

  test('should detect verbs in resource paths', () => {
    const spec: OpenAPIV3.Document = {
      openapi: '3.0.0',
      info: {
        title: 'Test API',
        version: '1.0.0'
      },
      paths: {
        '/users': {},
        '/getProducts': {} // Verb in path
      }
    };

    const result = rule.evaluate(spec);
    expect(result.violations).toContainEqual(
      expect.objectContaining({
        message: 'Path contains verb "get" which should be avoided in resource paths',
        severity: 'warning'
      })
    );
  });

  test('should allow verbs in action paths', () => {
    const spec: OpenAPIV3.Document = {
      openapi: '3.0.0',
      info: {
        title: 'Test API',
        version: '1.0.0'
      },
      paths: {
        '/users': {},
        '/users/{id}/actions/activate': {} // Verb in action path is OK
      }
    };

    const result = rule.evaluate(spec);
    expect(result.violations).not.toContainEqual(
      expect.objectContaining({
        message: expect.stringContaining('Path contains verb')
      })
    );
  });

  test('should detect singular nouns for collection endpoints', () => {
    const spec: OpenAPIV3.Document = {
      openapi: '3.0.0',
      info: {
        title: 'Test API',
        version: '1.0.0'
      },
      paths: {
        '/user': {}, // Singular instead of plural
        '/products': {} // Correct plural form
      }
    };

    const result = rule.evaluate(spec);
    expect(result.violations).toContainEqual(
      expect.objectContaining({
        message: 'Collection endpoints should use plural nouns',
        severity: 'info'
      })
    );
  });

  test('should detect potential path conflicts', () => {
    const spec: OpenAPIV3.Document = {
      openapi: '3.0.0',
      info: {
        title: 'Test API',
        version: '1.0.0'
      },
      paths: {
        '/users/{userId}': {
        
          get: {
              responses: {},
          }
        },
        '/users/{username}': {
          get: {              
              responses: {},
            }
        }
      }
    };

    const result = rule.evaluate(spec);
    expect(result.violations).toContainEqual(
      expect.objectContaining({
        message: expect.stringContaining('Potential path conflict for GET method'),
        severity: 'warning'
      })
    );
  });

  test('should detect resources that appear both as top-level and nested', () => {
    const spec: OpenAPIV3.Document = {
      openapi: '3.0.0',
      info: {
        title: 'Test API',
        version: '1.0.0'
      },
      paths: {
        '/profiles': {},
        '/users/{userId}/profiles': {}
      }
    };

    const result = rule.evaluate(spec);
    expect(result.violations).toContainEqual(
      expect.objectContaining({
        message: 'Resource "profiles" appears both as top-level and nested resource',
        severity: 'info'
      })
    );
  });

  test('should detect missing GET operation for collection', () => {
    const spec: OpenAPIV3.Document = {
      openapi: '3.0.0',
      info: {
        title: 'Test API',
        version: '1.0.0'
      },
      paths: {
        '/users': {
          post: { responses: {}} // Only POST, missing GET
        }
      }
    };

    const result = rule.evaluate(spec);
    expect(result.violations).toContainEqual(
      expect.objectContaining({
        message: 'Collection endpoint for "users" is missing GET operation for listing',
        severity: 'info'
      })
    );
  });

  test('should detect missing POST operation for collection', () => {
    const spec: OpenAPIV3.Document = {
      openapi: '3.0.0',
      info: {
        title: 'Test API',
        version: '1.0.0'
      },
      paths: {
        '/users': {
          get: { responses: {}} // Only GET, missing POST
        }
      }
    };

    const result = rule.evaluate(spec);
    expect(result.violations).toContainEqual(
      expect.objectContaining({
        message: 'Collection endpoint for "users" is missing POST operation for creation',
        severity: 'info'
      })
    );
  });

  test('should detect unusual PUT on collection', () => {
    const spec: OpenAPIV3.Document = {
      openapi: '3.0.0',
      info: {
        title: 'Test API',
        version: '1.0.0'
      },
      paths: {
        '/users': {
          get: { responses: {} },
          put: { responses: {} } // Unusual PUT on collection
        }
      }
    };

    const result = rule.evaluate(spec);
    expect(result.violations).toContainEqual(
      expect.objectContaining({
        message: 'PUT method on collection endpoint "/users" is unusual',
        severity: 'warning'
      })
    );
  });

  test('should flag DELETE on collection as informational', () => {
    const spec: OpenAPIV3.Document = {
      openapi: '3.0.0',
      info: {
        title: 'Test API',
        version: '1.0.0'
      },
      paths: {
        '/users': {
          get: {responses: {}},
          delete: {responses: {}} // DELETE on collection (might be bulk delete)
        }
      }
    };

    const result = rule.evaluate(spec);
    expect(result.violations).toContainEqual(
      expect.objectContaining({
        message: 'DELETE method on collection endpoint "/users" should be used carefully',
        severity: 'info'
      })
    );
  });

  test('should detect missing operations on resource endpoints', () => {
    const spec: OpenAPIV3.Document = {
      openapi: '3.0.0',
      info: {
        title: 'Test API',
        version: '1.0.0'
      },
      paths: {
        '/users/{userId}': {
          get: {responses: {}} // Only GET, missing PUT/PATCH and DELETE
        }
      }
    };

    const result = rule.evaluate(spec);
    expect(result.violations).toContainEqual(
      expect.objectContaining({
        message: 'Resource endpoint "/users/{userId}" is missing PUT or PATCH operation for updates',
        severity: 'info'
      })
    );
    expect(result.violations).toContainEqual(
      expect.objectContaining({
        message: 'Resource endpoint "/users/{userId}" is missing DELETE operation for deletion',
        severity: 'info'
      })
    );
  });

  test('should detect unusual POST on resource endpoint', () => {
    const spec: OpenAPIV3.Document = {
      openapi: '3.0.0',
      info: {
        title: 'Test API',
        version: '1.0.0'
      },
      paths: {
        '/users/{userId}': {
          get: {responses: {}},
          post: {responses: {}} // Unusual POST on resource
        }
      }
    };

    const result = rule.evaluate(spec);
    expect(result.violations).toContainEqual(
      expect.objectContaining({
        message: 'POST method on resource endpoint "/users/{userId}" is unusual',
        severity: 'info'
      })
    );
  });

  test('should detect missing path parameter definition', () => {
    const spec: OpenAPIV3.Document = {
      openapi: '3.0.0',
      info: {
        title: 'Test API',
        version: '1.0.0'
      },
      paths: {
        '/users/{userId}': {
          get: {
            // Missing userId parameter definition
            parameters: [],
          responses: {}
          }
        }
      }
    };

    const result = rule.evaluate(spec);
    expect(result.violations).toContainEqual(
      expect.objectContaining({
        message: 'Path parameter {userId} is not defined in GET operation',
        severity: 'error'
      })
    );
  });

  test('should detect request body in GET method', () => {
    const spec: OpenAPIV3.Document = {
      openapi: '3.0.0',
      info: {
        title: 'Test API',
        version: '1.0.0'
      },
      paths: {
        '/users': {
          get: {
            requestBody: { // GET shouldn't have a request body
              content: {
                'application/json': {
                  schema: {
                    type: 'object'
                  }
                }
              }
            },
            responses: {
              '200': {
                description: 'OK'
              }
            }
          }
        }
      }
    };

    const result = rule.evaluate(spec);
    expect(result.violations).toContainEqual(
      expect.objectContaining({
        message: 'GET method should not have a request body',
        severity: 'warning'
      })
    );
  });

  test('should detect missing request body in POST method', () => {
    const spec: OpenAPIV3.Document = {
      openapi: '3.0.0',
      info: {
        title: 'Test API',
        version: '1.0.0'
      },
      paths: {
        '/users': {
          post: { // POST without request body
            responses: {
              '201': {
                description: 'Created'
              }
            }
          }
        }
      }
    };

    const result = rule.evaluate(spec);
    expect(result.violations).toContainEqual(
      expect.objectContaining({
        message: 'POST method is missing a request body',
        severity: 'warning'
      })
    );
  });

  test('should detect missing success response', () => {
    const spec: OpenAPIV3.Document = {
      openapi: '3.0.0',
      info: {
        title: 'Test API',
        version: '1.0.0'
      },
      paths: {
        '/users': {
          get: {
            responses: {
              '400': { // Only error response, no success
                description: 'Bad Request'
              }
            }
          }
        }
      }
    };

    const result = rule.evaluate(spec);
    expect(result.violations).toContainEqual(
      expect.objectContaining({
        message: 'GET operation is missing success response',
        severity: 'warning'
      })
    );
  });

  test('should suggest 201 for POST operations', () => {
    const spec: OpenAPIV3.Document = {
      openapi: '3.0.0',
      info: {
        title: 'Test API',
        version: '1.0.0'
      },
      paths: {
        '/users': {
          post: {
            requestBody: {
              content: {
                'application/json': {
                  schema: {
                    type: 'object'
                  }
                }
              }
            },
            responses: {
              '200': { // Using 200 instead of 201 for POST
                description: 'OK'
              }
            }
          }
        }
      }
    };

    const result = rule.evaluate(spec);
    expect(result.violations).toContainEqual(
      expect.objectContaining({
        message: 'POST operation should typically return 201 Created for resource creation',
        severity: 'info'
      })
    );
  });

  test('should suggest 204 for DELETE operations', () => {
    const spec: OpenAPIV3.Document = {
      openapi: '3.0.0',
      info: {
        title: 'Test API',
        version: '1.0.0'
      },
      paths: {
        '/users/{userId}': {
          delete: {
            parameters: [
              {
                name: 'userId',
                in: 'path',
                required: true,
                schema: {
                  type: 'string'
                }
              }
            ],
            responses: {
              '200': { // Using 200 instead of 204 for DELETE
                description: 'OK'
              }
            }
          }
        }
      }
    };

    const result = rule.evaluate(spec);
    expect(result.violations).toContainEqual(
      expect.objectContaining({
        message: 'DELETE operation should typically return 204 No Content',
        severity: 'info'
      })
    );
  });

  test('should detect inconsistent ID parameter naming', () => {
    const spec: OpenAPIV3.Document = {
      openapi: '3.0.0',
      info: {
        title: 'Test API',
        version: '1.0.0'
      },
      paths: {
        '/users/{userId}': {
          get: {
            parameters: [
              {
                name: 'userId',
                in: 'path',
                required: true,
                schema: {
                  type: 'string'
                }
              }
            ],
            responses: {
              '200': {
                description: 'OK'
              }
            }
          }
        },
        '/products/{product_id}': { // Inconsistent naming (snake_case vs camelCase)
          get: {
            parameters: [
              {
                name: 'product_id',
                in: 'path',
                required: true,
                schema: {
                  type: 'string'
                }
              }
            ],
            responses: {
              '200': {
                description: 'OK'
              }
            }
          }
        }
      }
    };

    const result = rule.evaluate(spec);
    expect(result.violations).toContainEqual(
      expect.objectContaining({
        message: 'Inconsistent ID parameter naming conventions',
        severity: 'warning'
      })
    );
  });

  test('should handle path parameters defined at path item level', () => {
    const spec: OpenAPIV3.Document = {
      openapi: '3.0.0',
      info: {
        title: 'Test API',
        version: '1.0.0'
      },
      paths: {
        '/users/{userId}': {
          parameters: [ // Parameter defined at path level
            {
              name: 'userId',
              in: 'path',
              required: true,
              schema: {
                type: 'string'
              }
            }
          ],
          get: {
            // No parameters here, but should inherit from path
            responses: {
              '200': {
                description: 'OK'
              }
            }
          }
        }
      }
    };

    const result = rule.evaluate(spec);
    // Should not have a violation for missing path parameter
    expect(result.violations).not.toContainEqual(
      expect.objectContaining({
        message: expect.stringContaining('Path parameter {userId} is not defined')
      })
    );
  });

  test('should validate a well-designed REST API with no violations', () => {
    // Mock the calculateScore to return the full weight
    (helperFunctions.calculateScore as jest.Mock).mockReturnValue(rule.weight);

    const spec: OpenAPIV3.Document = {
      openapi: '3.0.0',
      info: {
        title: 'Test API',
        version: '1.0.0'
      },
      paths: {
        '/users': {
          get: {
            summary: 'List users',
            responses: {
              '200': {
                description: 'OK'
              }
            }
          },
          post: {
            summary: 'Create user',
            requestBody: {
              content: {
                'application/json': {
                  schema: {
                    type: 'object'
                  }
                }
              }
            },
            responses: {
              '201': {
                description: 'Created'
              }
            }
          }
        },
        '/users/{userId}': {
          parameters: [
            {
              name: 'userId',
              in: 'path',
              required: true,
              schema: {
                type: 'string'
              }
            }
          ],
          get: {
            summary: 'Get user by ID',
            responses: {
              '200': {
                description: 'OK'
              }
            }
          },
          put: {
            summary: 'Update user',
            requestBody: {
              content: {
                'application/json': {
                  schema: {
                    type: 'object'
                  }
                }
              }
            },
            responses: {
              '200': {
                description: 'OK'
              }
            }
          },
          delete: {
            summary: 'Delete user',
            responses: {
              '204': {
                description: 'No Content'
              }
            }
          }
        },
        '/users/{userId}/actions/activate': {
          parameters: [
            {
              name: 'userId',
              in: 'path',
              required: true,
              schema: {
                type: 'string'
              }
            }
          ],
          post: {
            summary: 'Activate user',
            responses: {
              '200': {
                description: 'OK'
              }
            }
          }
        }
      }
    };

    const result = rule.evaluate(spec);
    expect(result.score).toBe(rule.weight);
    expect(result.violations.filter((violation) => {violation.severity !== 'info'})).toHaveLength(0);
    expect(helperFunctions.calculateScore).toHaveBeenCalled();
  });
});
