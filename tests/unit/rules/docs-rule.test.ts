import { DescriptionDocsRule } from '../../../src/scoring-engine/rules/docs-rule';
import { OpenAPIV3 } from 'openapi-types';
import { CRITERIA_WEIGHTS, RULE_NAMES, RULE_DESCRIPTIONS } from '../../../src/scoring-engine/constants';
import * as helperFunctions from '../../../src/scoring-engine/helper-functions';

// Mock the helper functions
jest.mock('../../../src/scoring-engine/helper-functions', () => ({
  resolveReference: jest.fn(),
  calculateScore: jest.fn().mockReturnValue(10) // Default mock return value
}));

describe('DescriptionDocsRule', () => {
  let rule: DescriptionDocsRule;
  
  beforeEach(() => {
    rule = new DescriptionDocsRule();
    jest.clearAllMocks();
  });

  test('should have correct name, description and weight', () => {
    expect(rule.name).toBe(RULE_NAMES.description_docs);
    expect(rule.description).toBe(RULE_DESCRIPTIONS.description_docs);
    expect(rule.weight).toBe(CRITERIA_WEIGHTS.description_docs);
  });

  test('should return perfect score for well-documented API', () => {
    // Mock the calculateScore to return the full weight
    (helperFunctions.calculateScore as jest.Mock).mockReturnValue(rule.weight);

    const spec: OpenAPIV3.Document = {
      openapi: '3.0.0',
      info: {
        title: 'Test API',
        version: '1.0.0',
        description: 'This is a comprehensive description of the API'
      },
      paths: {
        '/users': {
          description: 'User management endpoints',
          get: {
            summary: 'Get all users',
            description: 'Returns a list of all users in the system',
            responses: {
              '200': {
                description: 'A list of users',
                content: {
                  'application/json': {
                    schema: {
                      type: 'array',
                      items: {
                        $ref: '#/components/schemas/User'
                      }
                    }
                  }
                }
              }
            }
          }
        }
      },
      components: {
        schemas: {
          User: {
            type: 'object',
            description: 'User model representation',
            properties: {
              id: {
                type: 'integer',
                description: 'Unique identifier for the user'
              },
              name: {
                type: 'string',
                description: 'Full name of the user'
              }
            }
          }
        }
      }
    };

    const result = rule.evaluate(spec);
    expect(result.score).toBe(rule.weight);
    expect(result.violations).toHaveLength(0);
    expect(helperFunctions.calculateScore).toHaveBeenCalled();
  });

  test('should detect missing API description', () => {
    const spec: OpenAPIV3.Document = {
      openapi: '3.0.0',
      info: {
        title: 'Test API',
        version: '1.0.0',
        description: '' // Empty description
      },
      paths: {}
    };

    const result = rule.evaluate(spec);
    expect(result.violations).toHaveLength(1);
    expect(result.violations[0].message).toContain('missing a meaningful description');
    expect(result.violations[0].severity).toBe('error');
    expect(result.violations[0].path).toBe('info');
  });

  test('should detect missing path description', () => {
    const spec: OpenAPIV3.Document = {
      openapi: '3.0.0',
      info: {
        title: 'Test API',
        version: '1.0.0',
        description: 'A good API description'
      },
      paths: {
        '/users': {
          // Missing path description
          get: {
            summary: 'Get users',
            description: 'Get all users',
            responses: {
              '200': {
                description: 'Success'
              }
            }
          }
        }
      }
    };

    const result = rule.evaluate(spec);
    expect(result.violations).toHaveLength(1);
    expect(result.violations[0].message).toContain('Path is missing');
    expect(result.violations[0].severity).toBe('warning');
    expect(result.violations[0].path).toBe('/users');
  });

  test('should detect missing operation description and summary', () => {
    const spec: OpenAPIV3.Document = {
      openapi: '3.0.0',
      info: {
        title: 'Test API',
        version: '1.0.0',
        description: 'A good API description'
      },
      paths: {
        '/users': {
          description: 'User endpoints',
          get: {
            // Missing both description and summary
            responses: {
              '200': {
                description: 'Success'
              }
            }
          }
        }
      }
    };

    const result = rule.evaluate(spec);
    expect(result.violations).toHaveLength(1);
    expect(result.violations[0].message).toContain('missing both a meaningful description and summary');
    expect(result.violations[0].severity).toBe('error');
    expect(result.violations[0].path).toBe('/users');
    expect(result.violations[0].operation).toBe('GET');
  });

  test('should accept operation with only summary', () => {
    const spec: OpenAPIV3.Document = {
      openapi: '3.0.0',
      info: {
        title: 'Test API',
        version: '1.0.0',
        description: 'A good API description'
      },
      paths: {
        '/users': {
          description: 'User endpoints',
          get: {
            summary: 'Get all users', // Only summary, no description
            responses: {
              '200': {
                description: 'Success'
              }
            }
          }
        }
      }
    };

    const result = rule.evaluate(spec);
    // Should not have a violation for the operation
    expect(result.violations).not.toContainEqual(
      expect.objectContaining({
        path: '/users',
        operation: 'GET',
        message: expect.stringContaining('missing both a meaningful description and summary')
      })
    );
  });

  test('should detect missing parameter description', () => {
    const spec: OpenAPIV3.Document = {
      openapi: '3.0.0',
      info: {
        title: 'Test API',
        version: '1.0.0',
        description: 'A good API description'
      },
      paths: {
        '/users/{id}': {
          description: 'User endpoints',
          get: {
            summary: 'Get user by ID',
            parameters: [
              {
                name: 'id',
                in: 'path',
                required: true,
                // Missing description
                schema: {
                  type: 'string'
                }
              }
            ],
            responses: {
              '200': {
                description: 'Success'
              }
            }
          }
        }
      }
    };

    const result = rule.evaluate(spec);
    expect(result.violations).toHaveLength(1);
    expect(result.violations[0].message).toContain("Parameter 'id' is missing");
    expect(result.violations[0].severity).toBe('warning');
    expect(result.violations[0].path).toBe('/users/{id}');
    expect(result.violations[0].operation).toBe('GET');
  });

  test('should detect missing request body description', () => {
    const spec: OpenAPIV3.Document = {
      openapi: '3.0.0',
      info: {
        title: 'Test API',
        version: '1.0.0',
        description: 'A good API description'
      },
      paths: {
        '/users': {
          description: 'User endpoints',
          post: {
            summary: 'Create user',
            requestBody: {
              // Missing description
              content: {
                'application/json': {
                  schema: {
                    $ref: '#/components/schemas/User'
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
        }
      }
    };

    const result = rule.evaluate(spec);
    expect(result.violations).toHaveLength(1);
    expect(result.violations[0].message).toContain('Request body is missing');
    expect(result.violations[0].severity).toBe('warning');
    expect(result.violations[0].path).toBe('/users');
    expect(result.violations[0].operation).toBe('POST');
  });

  test('should detect missing response description', () => {
    const spec: OpenAPIV3.Document = {
      openapi: '3.0.0',
      info: {
        title: 'Test API',
        version: '1.0.0',
        description: 'A good API description'
      },
      paths: {
        '/users': {
          description: 'User endpoints',
          get: {
            summary: 'Get users',
            responses: {
              '200': {
                // Missing description
                content: {
                  'application/json': {
                    schema: {
                      type: 'array',
                      items: {
                        $ref: '#/components/schemas/User'
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }
    } as unknown as OpenAPIV3.Document; // Type assertion to bypass TypeScript checking

    const result = rule.evaluate(spec);
    expect(result.violations).toHaveLength(1);
    expect(result.violations[0].message).toContain('Response 200 is missing');
    expect(result.violations[0].severity).toBe('error');
    expect(result.violations[0].path).toBe('/users');
    expect(result.violations[0].operation).toBe('GET');
  });

  test('should detect missing schema description', () => {
    const spec: OpenAPIV3.Document = {
      openapi: '3.0.0',
      info: {
        title: 'Test API',
        version: '1.0.0',
        description: 'A good API description'
      },
      paths: {},
      components: {
        schemas: {
          User: {
            type: 'object',
            // Missing description
            properties: {
              id: {
                type: 'integer',
                description: 'User ID'
              }
            }
          }
        }
      }
    };

    const result = rule.evaluate(spec);
    expect(result.violations).toHaveLength(1);
    expect(result.violations[0].message).toContain('Schema is missing');
    expect(result.violations[0].severity).toBe('warning');
    expect(result.violations[0].path).toBe('components');
    expect(result.violations[0].location).toBe('schemas.User');
  });

  test('should detect missing property description', () => {
    const spec: OpenAPIV3.Document = {
      openapi: '3.0.0',
      info: {
        title: 'Test API',
        version: '1.0.0',
        description: 'A good API description'
      },
      paths: {},
      components: {
        schemas: {
          User: {
            type: 'object',
            description: 'User model',
            properties: {
              id: {
                type: 'integer',
                // Missing description
              },
              name: {
                type: 'string',
                description: 'User name'
              }
            }
          }
        }
      }
    };

    const result = rule.evaluate(spec);
    expect(result.violations).toHaveLength(1);
    expect(result.violations[0].message).toContain('Property is missing');
    expect(result.violations[0].severity).toBe('info');
    expect(result.violations[0].path).toBe('components');
    expect(result.violations[0].location).toBe('schemas.User.properties.id');
  });

  test('should handle referenced parameters', () => {
    // Mock the resolveReference function
    (helperFunctions.resolveReference as jest.Mock).mockReturnValue({
      name: 'id',
      in: 'path',
      required: true,
      // Missing description
      schema: {
        type: 'string'
      }
    });

    const spec: OpenAPIV3.Document = {
      openapi: '3.0.0',
      info: {
        title: 'Test API',
        version: '1.0.0',
        description: 'A good API description'
      },
      paths: {
        '/users/{id}': {
          description: 'User endpoints',
          get: {
            summary: 'Get user by ID',
            parameters: [
              {
                $ref: '#/components/parameters/userId'
              }
            ],
            responses: {
              '200': {
                description: 'Success'
              }
            }
          }
        }
      }
    };

    const result = rule.evaluate(spec);
    expect(result.violations.length).toBeGreaterThanOrEqual(1);
    expect(result.violations[0].message).toContain("Parameter 'userId' is missing a meaningful description");
    expect(helperFunctions.resolveReference).toHaveBeenCalledWith('#/components/parameters/userId', spec);
  });

  test('should handle referenced request bodies', () => {
    // Mock the resolveReference function
    (helperFunctions.resolveReference as jest.Mock).mockReturnValue({
      // Missing description
      content: {
        'application/json': {
          schema: {
            type: 'object'
          }
        }
      }
    });

    const spec: OpenAPIV3.Document = {
      openapi: '3.0.0',
      info: {
        title: 'Test API',
        version: '1.0.0',
        description: 'A good API description'
      },
      paths: {
        '/users': {
          description: 'User endpoints',
          post: {
            summary: 'Create user',
            requestBody: {
              $ref: '#/components/requestBodies/UserBody'
            },
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
    expect(result.violations).toHaveLength(1);
    expect(result.violations[0].message).toContain('Request body is missing');
    expect(helperFunctions.resolveReference).toHaveBeenCalledWith('#/components/requestBodies/UserBody', spec);
  });

  test('should handle referenced responses', () => {
    // Mock the resolveReference function
    (helperFunctions.resolveReference as jest.Mock).mockReturnValue({
      // Missing description
      content: {
        'application/json': {
          schema: {
            type: 'object'
          }
        }
      }
    });

    const spec: OpenAPIV3.Document = {
      openapi: '3.0.0',
      info: {
        title: 'Test API',
        version: '1.0.0',
        description: 'A good API description'
      },
      paths: {
        '/users': {
          description: 'User endpoints',
          get: {
            summary: 'Get users',
            responses: {
              '200': {
                $ref: '#/components/responses/UserResponse'
              }
            }
          }
        }
      }
    };

    const result = rule.evaluate(spec);
    expect(result.violations).toHaveLength(1);
    expect(result.violations[0].message).toContain('Response 200 is missing');
    expect(helperFunctions.resolveReference).toHaveBeenCalledWith('#/components/responses/UserResponse', spec);
  });

  test('should handle multiple HTTP methods', () => {
    const spec: OpenAPIV3.Document = {
      openapi: '3.0.0',
      info: {
        title: 'Test API',
        version: '1.0.0',
        description: 'A good API description'
      },
      paths: {
        '/users': {
          description: 'User endpoints',
          get: {
            // Missing description and summary
            responses: {
              '200': {
                description: 'Success'
              }
            }
          },
          post: {
            // Missing description and summary
            responses: {
              '201': {
                description: 'Created'
              }
            }
          },
          put: {
            // Missing description and summary
            responses: {
              '200': {
                description: 'Updated'
              }
            }
          }
        }
      }
    };

    const result = rule.evaluate(spec);
    expect(result.violations).toHaveLength(3); // One for each method
    expect(result.violations[0].operation).toBe('GET');
    expect(result.violations[1].operation).toBe('POST');
    expect(result.violations[2].operation).toBe('PUT');
  });

  test('should consider short descriptions as invalid', () => {
    const spec: OpenAPIV3.Document = {
      openapi: '3.0.0',
      info: {
        title: 'Test API',
        version: '1.0.0',
        description: 'API' // Too short
      },
      paths: {}
    };

    const result = rule.evaluate(spec);
    expect(result.violations).toHaveLength(1);
    expect(result.violations[0].message).toContain('missing a meaningful description');
  });

  test('should handle empty paths object', () => {
    const spec: OpenAPIV3.Document = {
      openapi: '3.0.0',
      info: {
        title: 'Test API',
        version: '1.0.0',
        description: 'A good API description'
      },
      paths: {}
    };

    const result = rule.evaluate(spec);
    expect(result.violations).toHaveLength(0);
  });

  test('should handle missing components object', () => {
    const spec: OpenAPIV3.Document = {
      openapi: '3.0.0',
      info: {
        title: 'Test API',
        version: '1.0.0',
        description: 'A good API description'
      },
      paths: {}
      // No components
    };

    const result = rule.evaluate(spec);
    expect(result.violations).toHaveLength(0);
  });

  test('should handle null path items', () => {
    const spec: OpenAPIV3.Document = {
      openapi: '3.0.0',
      info: {
        title: 'Test API',
        version: '1.0.0',
        description: 'A good API description'
      },
      paths: {
        '/users': null as any // Null path item
      }
    };

    // This should not throw an error
    const result = rule.evaluate(spec);
    expect(result.violations).toHaveLength(0);
  });
});
