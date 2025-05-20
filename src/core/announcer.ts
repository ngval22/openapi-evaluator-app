import { ScoreCard } from '../scoring-engine/types';
import chalk from 'chalk';

// announcer class to generate console reports of the findings.
export class Announcer {
    generateConsoleReport(report: ScoreCard): void {
        console.log(chalk.bold('\nOUR JUDGES SCORED YOUR OPENAPI SPECIFICATION\n'));
        console.log(chalk.bold(`Overall Score: ${report.overallScore}/100 (Grade: ${report.grade})\n`));

        console.log(chalk.bold('Category Scores:'));
        report.categoryScores.forEach(category => {
            const color = category.percentage >= 70 ? 'green' : category.percentage >= 50 ? 'yellow' : 'red';
            console.log(chalk[color](`  ${category.name}: ${category.score}/${category.maxScore} (${category.percentage}%)`));
        });

        console.log(chalk.bold('\nViolations:'));
        if (report.violations.length === 0) {
            console.log(chalk.green('  No violations found!'));
        } else {
            report.violations.forEach(violation => {
                if (!(violation.severity === 'info')) {
                    const color = violation.severity === 'error' ? 'red' : violation.severity === 'warning' ? 'yellow' : 'blue';
                    console.log(chalk[color](`  [${violation.severity.toUpperCase()}] ${violation.path}${violation.operation ? ` (${violation.operation})` : ''} → ${violation.location}`));
                    console.log(`    ${violation.message}`);
                    console.log(chalk.green(`    Suggestion: ${violation.suggestion}\n`));
                };
            });
        }
    }
}

