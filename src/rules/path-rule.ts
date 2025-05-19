import { OpenAPIV3 } from 'openapi-types';
import { Rule, RuleResult, RuleViolation } from './types';
import { CRITERIA_WEIGHTS, RULE_NAMES, RULE_DESCRIPTIONS } from "./constants";

export class PathsOperationsRule implements Rule {
    name = RULE_NAMES.paths_operations;
    description = RULE_DESCRIPTIONS.paths_operations;
    weight = CRITERIA_WEIGHTS.paths_operations;

    // Common HTTP methods and their expected usage
    private readonly HTTP_METHODS = {
        get: { idempotent: true, hasBody: false, expectedUse: 'retrieve resource(s)' },
        post: { idempotent: false, hasBody: true, expectedUse: 'create resource or action' },
        put: { idempotent: true, hasBody: true, expectedUse: 'replace resource' },
        delete: { idempotent: true, hasBody: false, expectedUse: 'delete resource' },
        patch: { idempotent: false, hasBody: true, expectedUse: 'partial update' },
        head: { idempotent: true, hasBody: false, expectedUse: 'check resource existence' },
        options: { idempotent: true, hasBody: false, expectedUse: 'get communication options' },
        trace: { idempotent: true, hasBody: false, expectedUse: 'debug connection' }
    };

    // Common CRUD operation patterns
    private readonly CRUD_PATTERNS = {
        collection: {
            get: 'list resources',
            post: 'create resource'
        },
        resource: {
            get: 'retrieve resource',
            put: 'replace resource',
            patch: 'update resource',
            delete: 'delete resource'
        }
    };

    // Common naming conventions for REST APIs
    private readonly NAMING_CONVENTIONS = {
        // Plural nouns for collections
        pluralCollections: /^\/[a-z][a-z0-9]*(?:-[a-z0-9]+)*s(?:\/|$)/,
        // Kebab-case for multi-word resources
        kebabCase: /^\/[a-z][a-z0-9]*(?:-[a-z0-9]+)*(?:\/|$)/,
        // Avoid verbs in resource paths (except for special actions)
        verbInPath: /\/(get|create|update|delete|list|search|find|fetch|retrieve|remove|add|edit|modify|process)/i,
        // Path parameter format
        pathParam: /\{([a-zA-Z0-9_]+)\}/g,
        // Trailing slashes should be consistent
        trailingSlash: /\/$/
    };

    evaluate(spec: OpenAPIV3.Document): RuleResult {
        const violations: RuleViolation[] = [];

        if (!spec.paths || Object.keys(spec.paths).length === 0) {
            return {
                score: 0,
                maxScore: this.weight,
                violations: [{
                    path: '',
                    location: 'paths',
                    message: 'No paths defined in the API specification',
                    severity: 'error',
                    suggestion: 'Define paths for your API endpoints'
                }]
            };
        }

        // Check for path naming consistency
        this.checkPathNamingConsistency(spec, violations);

        // Check for overlapping or redundant paths
        this.checkOverlappingPaths(spec, violations);

        // Check for CRUD convention consistency
        this.checkCrudConsistency(spec, violations);

        // Check for HTTP method usage consistency
        this.checkHttpMethodConsistency(spec, violations);

        // Check for path parameter consistency
        this.checkPathParameterConsistency(spec, violations);

        // Calculate score based on violations
        // More severe violations reduce score more significantly
        const errorViolations = violations.filter(v => v.severity === 'error').length;
        const warningViolations = violations.filter(v => v.severity === 'warning').length;
        const infoViolations = violations.filter(v => v.severity === 'info').length;

        // Calculate a weighted penalty
        const totalPaths = Object.keys(spec.paths).length;
        const errorPenalty = (errorViolations / totalPaths) * 0.7; // 70% impact for errors
        const warningPenalty = (warningViolations / totalPaths) * 0.2; // 20% impact for warnings
        const infoPenalty = (infoViolations / totalPaths) * 0.1; // 10% impact for info

        // Calculate final score
        let score = this.weight * (1 - Math.min(1, errorPenalty + warningPenalty + infoPenalty));

        // Ensure minimum penalty for any errors
        if (errorViolations > 0 && score > this.weight * 0.7) {
            score = this.weight * 0.7; // Cap at 70% if there are errors
        }

        // Ensure score doesn't go below 0
        score = Math.max(0, Math.round(score));

        return {
            score,
            maxScore: this.weight,
            violations
        };
    }

private checkPathNamingConsistency(spec: OpenAPIV3.Document, violations: RuleViolation[]): void {
    const paths = Object.keys(spec.paths);

    // Check for trailing slash consistency
    const pathsWithTrailingSlash = paths.filter(p => p.endsWith('/') && p !== '/');
    const pathsWithoutTrailingSlash = paths.filter(p => !p.endsWith('/') && p !== '/');

    if (pathsWithTrailingSlash.length > 0 && pathsWithoutTrailingSlash.length > 0) {
        violations.push({
            path: '',
            location: 'paths',
            message: 'Inconsistent use of trailing slashes in paths',
            severity: 'warning',
            suggestion: 'Use trailing slashes consistently across all paths or remove them all'
        });
    }

    // Check for consistent case (kebab-case is recommended)
    const nonKebabCasePaths = paths.filter(p => !this.NAMING_CONVENTIONS.kebabCase.test(p));
    if (nonKebabCasePaths.length > 0) {
        violations.push({
            path: nonKebabCasePaths[0],
            location: 'paths',
            message: 'Paths should follow kebab-case naming convention',
            severity: 'warning',
            suggestion: 'Use kebab-case for path segments (e.g., /user-profiles instead of /userProfiles or /user_profiles)'
        });
    }

    // Check for verbs in resource paths
    paths.forEach(path => {
        const match = path.match(this.NAMING_CONVENTIONS.verbInPath);
        if (match && !path.includes('/actions/') && !path.endsWith('/actions')) {
            violations.push({
                path,
                location: path,
                message: `Path contains verb "${match[1]}" which should be avoided in resource paths`,
                severity: 'warning',
                suggestion: 'Use nouns for resources and HTTP methods to indicate actions. For non-CRUD operations, consider using a dedicated "actions" resource'
            });
        }
    });

    // Check for plural nouns for collection endpoints
    const collectionPaths = paths.filter(p => {
            // Paths that don't end with an ID parameter are likely collections
            const segments = p.split('/').filter(Boolean);
            const lastSegment = segments[segments.length - 1];
            return !lastSegment || !lastSegment.startsWith('{');
        });

        collectionPaths.forEach(path => {
            if (!this.NAMING_CONVENTIONS.pluralCollections.test(path)) {
                // Skip paths that are likely not collections (e.g., /status, /health)
                const segments = path.split('/').filter(Boolean);
                const lastSegment = segments[segments.length - 1];

                // Skip common non-collection endpoints and those with path parameters
                if (lastSegment && 
                    !['status', 'health', 'ping', 'version', 'info', 'docs', 'metrics'].includes(lastSegment) &&
                        !lastSegment.startsWith('{')) {
                    violations.push({
                        path,
                        location: path,
                        message: 'Collection endpoints should use plural nouns',
                        severity: 'info',
                        suggestion: `Consider renaming to use plural form (e.g., /${lastSegment}s)`
                    });
                }
            }
        });
    }

    private checkOverlappingPaths(spec: OpenAPIV3.Document, violations: RuleViolation[]): void {
        const paths = Object.keys(spec.paths);

        // Check for exact duplicates (should be caught by parser, but just in case)
        const uniquePaths = new Set(paths);
        if (uniquePaths.size !== paths.length) {
            violations.push({
                path: '',
                location: 'paths',
                message: 'Duplicate paths detected in the specification',
                severity: 'error',
                suggestion: 'Remove duplicate path entries'
            });
        }

        // Check for semantic duplicates (different paths that resolve to the same resource)
        // Convert paths to patterns for comparison
        const pathPatterns: { original: string, pattern: RegExp }[] = paths.map(path => {
            // Replace path parameters with regex pattern
            const pattern = path
            .replace(this.NAMING_CONVENTIONS.pathParam, '([^/]+)')
            .replace(/\//g, '\\/');
                return {
                original: path,
                pattern: new RegExp(`^${pattern}$`)
            };
        });

        // Group paths by their HTTP methods
        const pathsByMethod: Record<string, string[]> = {};

        paths.forEach(path => {
            const pathItem = spec.paths[path];
            if (!pathItem) return;

            Object.keys(pathItem)
            .filter(key => ['get', 'post', 'put', 'delete', 'patch', 'head', 'options', 'trace'].includes(key))
            .forEach(method => {
                if (!pathsByMethod[method]) {
                    pathsByMethod[method] = [];
                }
                pathsByMethod[method].push(path);
            });
        });

        // Check for potential conflicts within each HTTP method
        Object.entries(pathsByMethod).forEach(([method, methodPaths]) => {
            // Check for paths that might conflict due to similar patterns
            for (let i = 0; i < methodPaths.length; i++) {
                const path1 = methodPaths[i];
                const segments1 = path1.split('/').filter(Boolean);

                for (let j = i + 1; j < methodPaths.length; j++) {
                    const path2 = methodPaths[j];
                    const segments2 = path2.split('/').filter(Boolean);

                    // Skip if paths have different number of segments
                    if (segments1.length !== segments2.length) continue;

                    // Check if paths might conflict
                    let potentialConflict = true;
                    for (let k = 0; k < segments1.length; k++) {
                        const seg1 = segments1[k];
                        const seg2 = segments2[k];

                        // If both segments are not path parameters and they're different, no conflict
                        if (!seg1.startsWith('{') && !seg2.startsWith('{') && seg1 !== seg2) {
                            potentialConflict = false;
                            break;
                        }
                    }

                    if (potentialConflict) {
                        violations.push({
                            path: path1,
                            location: `paths["${path1}"] and paths["${path2}"]`,
                            message: `Potential path conflict for ${method.toUpperCase()} method between "${path1}" and "${path2}"`,
                            severity: 'warning',
                            suggestion: 'Ensure these paths resolve to different resources or consider consolidating them'
                        });
                    }
                }
            }
        });

        // Check for redundant nested resources
        // For example, /users/{userId}/profile and /profiles/{profileId} might be redundant
        const resourceTypes = new Map<string, string[]>();

        paths.forEach(path => {
            const segments = path.split('/').filter(Boolean);
            segments.forEach(segment => {
                if (!segment.startsWith('{')) {
                    // This is a resource type
                    const resourceType = segment.toLowerCase();
                    if (!resourceTypes.has(resourceType)) {
                        resourceTypes.set(resourceType, []);
                    }
                    resourceTypes.get(resourceType)!.push(path);
                }
            });
        });

        // Check for resources that appear both as top-level and nested
        resourceTypes.forEach((pathsWithResource, resourceType) => {
            const topLevelPaths = pathsWithResource.filter(p => {
                const segments = p.split('/').filter(Boolean);
                return segments.length >= 1 && segments[0].toLowerCase() === resourceType;
            });

            const nestedPaths = pathsWithResource.filter(p => {
                const segments = p.split('/').filter(Boolean);
                return segments.length >= 3 && segments.slice(1).some(s => s.toLowerCase() === resourceType);
            });

            if (topLevelPaths.length > 0 && nestedPaths.length > 0) {
                // This is not always a problem, but worth flagging for review
                violations.push({
                    path: topLevelPaths[0],
                    location: `paths with resource "${resourceType}"`,
                    message: `Resource "${resourceType}" appears both as top-level and nested resource`,
                    severity: 'info',
                    suggestion: 'Consider if this design is intentional or if the API structure could be simplified'
                });
            }
        });
    }

    private checkCrudConsistency(spec: OpenAPIV3.Document, violations: RuleViolation[]): void {
        const paths = Object.keys(spec.paths);
        
        // Group paths by resource type
        const resourceGroups: Record<string, string[]> = {};
        
        paths.forEach(path => {
            const segments = path.split('/').filter(Boolean);
            if (segments.length > 0) {
                const resourceType = segments[0].toLowerCase();
                if (!resourceGroups[resourceType]) {
                    resourceGroups[resourceType] = [];
                }
                resourceGroups[resourceType].push(path);
            }
        });
        
        // Check CRUD pattern consistency for each resource type
        Object.entries(resourceGroups).forEach(([resourceType, resourcePaths]) => {
            // Identify collection and resource paths
            const collectionPaths = resourcePaths.filter(p => {
                const segments = p.split('/').filter(Boolean);
                return segments.length === 1 || (segments.length > 1 && !segments[1].startsWith('{'));
            });
            
            resourcePaths = resourcePaths.filter(p => {
                const segments = p.split('/').filter(Boolean);
                return segments.length > 1 && segments[1].startsWith('{');
            });
            
            // Check collection operations
            if (collectionPaths.length > 0) {
                const collectionPath = collectionPaths[0];
                const pathItem = spec.paths[collectionPath];
                
                if (pathItem) {
                    // Check if GET is used for listing
                    if (!pathItem.get) {
                        violations.push({
                            path: collectionPath,
                            location: `paths["${collectionPath}"]`,
                            message: `Collection endpoint for "${resourceType}" is missing GET operation for listing`,
                            severity: 'info',
                            suggestion: 'Consider adding GET method to retrieve a list of resources'
                        });
                    }
                    
                    // Check if POST is used for creation
                    if (!pathItem.post) {
                        violations.push({
                            path: collectionPath,
                            location: `paths["${collectionPath}"]`,
                            message: `Collection endpoint for "${resourceType}" is missing POST operation for creation`,
                            severity: 'info',
                            suggestion: 'Consider adding POST method to create new resources'
                        });
                    }
                    
                    // Check for inappropriate methods on collections
                    if (pathItem.put) {
                        violations.push({
                            path: collectionPath,
                            location: `paths["${collectionPath}"].put`,
                            message: `PUT method on collection endpoint "${collectionPath}" is unusual`,
                            severity: 'warning',
                            suggestion: 'PUT is typically used for replacing a specific resource, not for collections'
                        });
                    }
                    
                    if (pathItem.delete) {
                        // This might be intentional for bulk delete, but worth flagging
                        violations.push({
                            path: collectionPath,
                            location: `paths["${collectionPath}"].delete`,
                            message: `DELETE method on collection endpoint "${collectionPath}" should be used carefully`,
                            severity: 'info',
                            suggestion: 'Ensure DELETE on a collection is intentional (bulk delete) and has appropriate safeguards'
                        });
                    }
                }
            }
            
            // Check resource operations
            if (resourcePaths.length > 0) {
                resourcePaths.forEach(resourcePath => {
                    const pathItem = spec.paths[resourcePath];
                    if (!pathItem) return;
                    
                    // Extract the path parameter name
                    const segments = resourcePath.split('/').filter(Boolean);
                    const idParam = segments.find(s => s.startsWith('{'));
                    const idParamName = idParam ? idParam.substring(1, idParam.length - 1) : 'id';
                    
                    // Check if GET is used for retrieval
                    if (!pathItem.get) {
                        violations.push({
                            path: resourcePath,
                            location: `paths["${resourcePath}"]`,
                            message: `Resource endpoint "${resourcePath}" is missing GET operation for retrieval`,
                            severity: 'info',
                            suggestion: 'Consider adding GET method to retrieve the resource'
                        });
                    }
                    
                    // Check if PUT or PATCH is used for updates
                    if (!pathItem.put && !pathItem.patch) {
                        violations.push({
                            path: resourcePath,
                            location: `paths["${resourcePath}"]`,
                            message: `Resource endpoint "${resourcePath}" is missing PUT or PATCH operation for updates`,
                            severity: 'info',
                            suggestion: 'Consider adding PUT (full replacement) or PATCH (partial update) method'
                        });
                    }
                    
                    // Check if DELETE is used for deletion
                    if (!pathItem.delete) {
                        violations.push({
                            path: resourcePath,
                            location: `paths["${resourcePath}"]`,
                            message: `Resource endpoint "${resourcePath}" is missing DELETE operation for deletion`,
                            severity: 'info',
                            suggestion: 'Consider adding DELETE method to remove the resource'
                        });
                    }
                    
                    // Check for inappropriate POST on resource
                    if (pathItem.post) {
                        // POST on a resource might be for a sub-resource or action
                        const lastSegment = segments[segments.length - 1];
                        if (lastSegment.startsWith('{')) {
                            violations.push({
                                path: resourcePath,
                                location: `paths["${resourcePath}"].post`,
                                message: `POST method on resource endpoint "${resourcePath}" is unusual`,
                                severity: 'info',
                                suggestion: 'POST is typically used for creation or actions. Consider using PUT/PATCH for updates or adding a sub-resource or /actions segment'
                            });
                        }
                    }
                    
                    // Check parameter consistency
                    if (pathItem.get || pathItem.put || pathItem.patch || pathItem.delete) {
                        const operations = [
                            pathItem.get,
                            pathItem.put,
                            pathItem.patch,
                            pathItem.delete
                        ].filter(Boolean) as OpenAPIV3.OperationObject[];
                        
                        // Check if the path parameter is defined in all operations
                        operations.forEach(operation => {
                            const hasPathParam = operation.parameters?.some(param => {
                                if ('$ref' in param) {
                                    // Would need to resolve the reference
                                    return true; // Assume it's correct for now
                                }
                                return param.name === idParamName && param.in === 'path';
                            });
                            
                            if (!hasPathParam) {
                                violations.push({
                                    path: resourcePath,
                                    location: `paths["${resourcePath}"]`,
                                    message: `Path parameter "${idParamName}" is not defined in all operations`,
                                    severity: 'error',
                                    suggestion: `Ensure the path parameter "${idParamName}" is properly defined in all operations`
                                });
                            }
                        });
                    }
                });
            }
        });
    }
    private checkHttpMethodConsistency(spec: OpenAPIV3.Document, violations: RuleViolation[]): void {
        const paths = Object.keys(spec.paths);
        
        paths.forEach(path => {
            const pathItem = spec.paths[path];
            if (!pathItem) return;
            
            // Check each HTTP method
            Object.entries(this.HTTP_METHODS).forEach(([method, methodProps]) => {
                const operation = pathItem[method as keyof OpenAPIV3.PathItemObject] as OpenAPIV3.OperationObject | undefined;
                if (!operation) return;
                
                // Check for request body in methods that shouldn't have one
                if (!methodProps.hasBody && operation.requestBody) {
                    violations.push({
                        path,
                        location: `paths["${path}"].${method}.requestBody`,
                        message: `${method.toUpperCase()} method should not have a request body`,
                        severity: 'warning',
                        suggestion: `Remove the request body from the ${method.toUpperCase()} operation or change the HTTP method`
                    });
                }
                
                // Check for missing request body in methods that should have one
                if (methodProps.hasBody && !operation.requestBody) {
                    // Only flag this for PUT and POST, as PATCH might not always need a body
                    if (method === 'put' || method === 'post') {
                        violations.push({
                            path,
                            location: `paths["${path}"].${method}`,
                            message: `${method.toUpperCase()} method is missing a request body`,
                            severity: 'warning',
                            suggestion: `Add a request body to the ${method.toUpperCase()} operation or consider if another HTTP method is more appropriate`
                        });
                    }
                }
                
                // Check for appropriate response codes
                if (operation.responses) {
                    const successResponses = Object.keys(operation.responses).filter(code => 
                        code.startsWith('2') || code === 'default'
                    );
                    
                    if (successResponses.length === 0) {
                        violations.push({
                            path,
                            location: `paths["${path}"].${method}.responses`,
                            message: `${method.toUpperCase()} operation is missing success response`,
                            severity: 'warning',
                            suggestion: 'Add appropriate success response codes (e.g., 200, 201, 204)'
                        });
                    }
                    
                    // Check for appropriate success codes based on method
                    if (method === 'post' && !operation.responses['201']) {
                        violations.push({
                            path,
                            location: `paths["${path}"].${method}.responses`,
                            message: 'POST operation should typically return 201 Created for resource creation',
                            severity: 'info',
                            suggestion: 'Consider adding a 201 response for resource creation operations'
                        });
                    }
                    
                    if ((method === 'put' || method === 'patch') && 
                        !operation.responses['200'] && !operation.responses['204']) {
                        violations.push({
                            path,
                            location: `paths["${path}"].${method}.responses`,
                            message: `${method.toUpperCase()} operation should return 200 OK or 204 No Content`,
                            severity: 'info',
                            suggestion: 'Consider adding 200 (with response body) or 204 (without response body) for update operations'
                        });
                    }
                    
                    if (method === 'delete' && !operation.responses['204']) {
                        violations.push({
                            path,
                            location: `paths["${path}"].${method}.responses`,
                            message: 'DELETE operation should typically return 204 No Content',
                            severity: 'info',
                            suggestion: 'Consider using 204 No Content for successful deletion operations'
                        });
                    }
                }
            });
        });
    }private checkPathParameterConsistency(spec: OpenAPIV3.Document, violations: RuleViolation[]): void {
        const paths = Object.keys(spec.paths);
        
        // Check path parameter naming consistency
        const pathParams = new Map<string, Set<string>>();
        
        // Extract all path parameters
        paths.forEach(path => {
            const matches = [...path.matchAll(this.NAMING_CONVENTIONS.pathParam)];
            matches.forEach(match => {
                const paramName = match[1];
                if (!pathParams.has(paramName)) {
                    pathParams.set(paramName, new Set());
                }
                pathParams.get(paramName)!.add(path);
            });
        });
        
        // Check for inconsistent parameter naming
        const idParams = new Set<string>();
        pathParams.forEach((paths, paramName) => {
            // Check if this looks like an ID parameter
            if (paramName.toLowerCase().endsWith('id')) {
                idParams.add(paramName);
            }
        });
        
        // If we have multiple ID parameters, check for consistency
        if (idParams.size > 1) {
            const idParamsList = Array.from(idParams);
            
            // Check if we have both camelCase and snake_case
            const camelCaseIds = idParamsList.filter(p => /^[a-z][a-zA-Z0-9]*Id$/.test(p));
            const snakeCaseIds = idParamsList.filter(p => /^[a-z][a-z0-9]*_id$/.test(p));
            
            if (camelCaseIds.length > 0 && snakeCaseIds.length > 0) {
                violations.push({
                    path: '',
                    location: 'paths',
                    message: 'Inconsistent ID parameter naming conventions',
                    severity: 'warning',
                    suggestion: `Standardize on either camelCase (${camelCaseIds[0]}) or snake_case (${snakeCaseIds[0]}) for ID parameters`
                });
            }
        }
        
        // Check for path parameters that are not defined in operations
        paths.forEach(path => {
            const pathItem = spec.paths[path];
            if (!pathItem) return;
            
            const pathParamMatches = [...path.matchAll(this.NAMING_CONVENTIONS.pathParam)];
            const pathParamNames = pathParamMatches.map(match => match[1]);
            
            if (pathParamNames.length > 0) {
                // Check each operation
                Object.entries(pathItem)
                    .filter(([key]) => ['get', 'post', 'put', 'delete', 'patch', 'head', 'options', 'trace'].includes(key))
                    .forEach(([method, operation]) => {
                        const op = operation as OpenAPIV3.OperationObject;
                        
                        // Get parameters defined in the operation
                        const definedParams = new Set<string>();
                        
                        // Check operation parameters
                        if (op.parameters) {
                            op.parameters.forEach(param => {
                                if ('$ref' in param) {
                                    // Would need to resolve the reference
                                    // For simplicity, we'll skip reference checking here
                                } else if (param.in === 'path') {
                                    definedParams.add(param.name);
                                }
                            });
                        }
                        
                        // Check path item parameters (shared across operations)
                        if (pathItem.parameters) {
                            pathItem.parameters.forEach(param => {
                                if ('$ref' in param) {
                                    // Would need to resolve the reference
                                } else if (param.in === 'path') {
                                    definedParams.add(param.name);
                                }
                            });
                        }
                        
                        // Check for missing path parameters
                        pathParamNames.forEach(paramName => {
                            if (!definedParams.has(paramName)) {
                                violations.push({
                                    path,
                                    location: `paths["${path}"].${method}`,
                                    message: `Path parameter {${paramName}} is not defined in ${method.toUpperCase()} operation`,
                                    severity: 'error',
                                    suggestion: `Add the path parameter "${paramName}" to the operation parameters`
                                });
                            }
                        });
                    });
            }
        });
    }
}
