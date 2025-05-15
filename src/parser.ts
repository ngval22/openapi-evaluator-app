import SwaggerParser from "@apidevtools/swagger-parser";
import { OpenAPIV3 } from "openapi-types";
import fs from 'fs';
import path from 'path';

export class OpenAPIParser {
    async parse(input: string): Promise<OpenAPIV3.Document> {
        try {
            const isUrl = input.startsWith("http://") || input.startsWith("https://");

            let spec;
            if (isUrl) {
                spec = await SwaggerParser.parse(input);
            } else if (fs.existsSync(input)) {
                const resolvedPath = path.resolve(input);
                spec = await SwaggerParser.parse(resolvedPath);
            } else {
                throw new Error("Input must be a valid URL or file path");
            }

            await SwaggerParser.validate(spec);
            return spec as OpenAPIV3.Document;
        } catch (error: any) {
            throw new Error(`Failed to parse OpenAPI spec: ${error.message}`);
        }
    }
}
