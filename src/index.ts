import { Command } from 'commander';
import { OpenAPIParser } from './parser';
import { Console } from 'console';

const program = new Command();
program
    .name("openapi-evaluator-app")
    .description("Test if your OpenAPI specification is keeping up with the industry's best practices!")
    .version("1.0.0")
    .argument("<spec>", "Path or URL pointing to OpenAPI specification.")
    .action(async (spec: string) => {
        try {
            const parser = new OpenAPIParser();
            const apiSpec = await parser.parse(spec);
            console.log(apiSpec)
        } catch (error: any) {
            console.error(`Error: ${error.message}`);
            process.exit(1);
        }
    });

program.parseAsync();
