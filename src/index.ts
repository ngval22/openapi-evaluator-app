import { Command } from 'commander';
import { OpenAPIParser } from './core/parser';
import { Judge } from './core/score-engine';
import { Announcer } from './core/announcer';

const program = new Command();
program
    .name("openapi-evaluator-app")
    .description("Test if your OpenAPI specification is keeping up with the industry's best practices!")
    .version("1.0.0")
    .argument("<spec>", "Path or URL pointing to OpenAPI specification.")
    .option('-d, --debug', 'Print the parsed OpenAPI spec to console')
    .action(async (spec: string, options: any) => {
        try {
            const parser = new OpenAPIParser();
            const apiSpec = await parser.parse(spec);
            if (options.debug) {
                console.log('Parsed OpenAPI Specification:');
                console.log(JSON.stringify(apiSpec, null, 2));
                console.log('\n---\n');
            }

            const judge = new Judge();
            const report = judge.evaluate(apiSpec);

            const announcer = new Announcer();
            announcer.generateConsoleReport(report);
        } catch (error: any) {
            console.error(`Error: ${error.message}`);
            process.exit(1);
        }
    });

program.parseAsync();
