import { Command } from 'commander';
import { OpenAPIParser } from './core/parser';
import { Judge } from './core/score-engine';
import { Announcer } from './core/announcer';
import fs from 'fs';
import path from 'path';

const program = new Command();
program
  .name("openapi-evaluator-app")
  .description("Test if your OpenAPI specification is keeping up with the industry's best practices!")
  .version("1.0.0")
  .argument("[spec]", "Path or URL pointing to OpenAPI specification.")
  .option('-d, --debug', 'Print the parsed OpenAPI spec to console')
  .option('--sample', 'Run the evaluation on a sample OpenAPI specification')
  .option('--markdown', 'Export the report in Markdown format')
  .option('--json', 'Export the report in JSON format')
  .option('--html', 'Export the report in HTML format')
  .option('-o, --output <filename>', 'Specify output filename (without extension)')
  .option('--output-dir <directory>', 'Specify output directory for reports (default: ./reports)')
  .action(async (spec: string | undefined, options: any) => {
    try {
      const parser = new OpenAPIParser();
      let apiSpec;

      // Handle --sample option
      if (options.sample) {
        const samplePath = path.join(__dirname, '../samples/onepassword.yaml');
        console.log(`Using sample OpenAPI specification: ${samplePath}`);
        apiSpec = await parser.parse(samplePath);
      } else if (!spec) {
        console.error('Error: Please provide a specification file path/URL or use --sample option');
        process.exit(1);
      } else {
        apiSpec = await parser.parse(spec);
      }

      if (options.debug) {
        console.log('Parsed OpenAPI Specification:');
        console.log(JSON.stringify(apiSpec, null, 2));
        console.log('\n---\n');
      }

      const judge = new Judge();
      const report = judge.evaluate(apiSpec);

      const announcer = new Announcer();
      
      // Always show console report
      announcer.generateConsoleReport(report);

      // Handle export options
      if (options.markdown || options.json || options.html) {
        // Create output directory if it doesn't exist
        const outputDir = options.outputDir || path.join(process.cwd(), 'reports');
        if (!fs.existsSync(outputDir)) {
          fs.mkdirSync(outputDir, { recursive: true });
        }
        
        const outputFilename = options.output || 'openapi-evaluation-report';
        const fullOutputPath = path.join(outputDir, outputFilename);
        
        if (options.markdown) {
          const markdownReport = announcer.generateMarkdownReport(report);
          fs.writeFileSync(`${fullOutputPath}.md`, markdownReport);
          console.log(`\nMarkdown report saved to ${fullOutputPath}.md`);
        }
        
        if (options.json) {
          fs.writeFileSync(`${fullOutputPath}.json`, JSON.stringify(report, null, 2));
          console.log(`\nJSON report saved to ${fullOutputPath}.json`);
        }
        
        if (options.html) {
          const htmlReport = announcer.generateHtmlReport(report);
          fs.writeFileSync(`${fullOutputPath}.html`, htmlReport);
          console.log(`\nHTML report saved to ${fullOutputPath}.html`);
        }
      }
    } catch (error: any) {
      console.error(`Error: ${error.message}`);
      process.exit(1);
    }
  });

program.parseAsync();

