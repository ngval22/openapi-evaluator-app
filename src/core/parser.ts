import SwaggerParser from "@apidevtools/swagger-parser";
import { OpenAPIV3 } from "openapi-types";
import fs from 'fs';

// Parser class that validates the specification sintactically
export class OpenAPIParser {
    async parse(input: string): Promise<OpenAPIV3.Document> {
        try {
            const isUrl = input.startsWith("http://") || input.startsWith("https://");
            console.log("In parse input is: ", input);

            let spec;
            if (isUrl || fs.existsSync(input)) {
                spec = await SwaggerParser.parse(input);
            }  else {
                throw new Error("Input must be a valid URL or file path");
            }

            return spec as OpenAPIV3.Document;
        } catch (error: any) {
            throw new Error(`Failed to parse OpenAPI spec: ${error.message}`);
        }
    }
}
