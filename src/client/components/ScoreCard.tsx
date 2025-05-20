import React, { useState } from "react";
import type { ScoreCard } from "../../scoring-engine/types";
import ViolationsList from "./ViolationsList";
import "../styles/ScoreCard.css";
import '../styles/ReportTable.css';

interface ScorecardDisplayProps {
    percentage: number; // For the circular progress bar
        report: ScoreCard; // The main data for the report
}

const ScorecardDisplay: React.FC<ScorecardDisplayProps> = ({
    percentage,
    report,
}) => {
    // Circular progress bar calculations
    const radius = 40;
    const circumference = 2 * Math.PI * radius;
    const clampedPercentage = Math.max(0, Math.min(100, report.overallScore));
    const strokeDashoffset =
        circumference - (clampedPercentage / 100) * circumference;

    let progressBarColorClass = "color-good"; // Default for circular progress
        if (clampedPercentage <= 33) {
            progressBarColorClass = "color-poor";
        } else if (clampedPercentage <= 66) {
            progressBarColorClass = "color-fair";
        }

        // State for expandable table rows
        const [openRowIndex, setOpenRowIndex] = useState<number | null>(null);
    const [severityFilter, setSeverityFilter] = useState<string>("all");

    const handleRowClick = (index: number) => {
        setOpenRowIndex(openRowIndex === index ? null : index);
    };

    // Helper function for badge colors (percentage and severity)
    const getBadgeClass = (
        type: "percentage" | "severity",
        value: number | string,
    ): string => {
        const baseClass = "badge ";
        if (type === "percentage") {
            const numericValue = value as number;
            if (numericValue >= 70) return baseClass + "badge-green";
            if (numericValue >= 50) return baseClass + "badge-yellow";
            return baseClass + "badge-red";
        }
        if (type === "severity") {
            const severityValue = (value as string)?.toUpperCase(); // Normalize
            if (severityValue === "ERROR" || severityValue === "CRITICAL" || severityValue === "HIGH") return baseClass + "badge-red";
            if (severityValue === "WARNING" || severityValue === "MEDIUM") return baseClass + "badge-yellow";
            if (severityValue === "INFO" || severityValue === "LOW") return baseClass + "badge-blue";
            return baseClass + "badge-gray"; // For UNKNOWN or other severities
        }
    return baseClass + "badge-gray";
    };

    const numberOfColumns = 3; // For colSpan in the table

        return (
            <div className="scorecard-display-wrapper"> {/* Outer wrapper for the whole component */}
                {/* Top Scorecard Visual */}
            <div className="scorecard-container">
            <div className="scorecard-header">SCORECARD</div>
            <div className="scorecard-body">
            <div className="scorecard-left">
            <div className="circular-progress-container">
            <svg
            className="circular-progress"
            width="100"
            height="100"
            viewBox="0 0 100 100"
            >
            <circle
            className="progress-background"
            cx="50"
            cy="50"
            r={radius}
            strokeWidth="10"
            ></circle>
            <circle
            className={`progress-bar ${progressBarColorClass}`}
            cx="50"
            cy="50"
            r={radius}
            strokeWidth="10"
            transform="rotate(-90 50 50)"
            style={{
                strokeDasharray: circumference,
                strokeDashoffset: strokeDashoffset,
            }}
            ></circle>
            </svg>
            <div className="progress-text">
            {Math.round(clampedPercentage)}
            </div>
            </div>
            <div className="score-details">
            <div className="score-value">
              {report.grade} Tier
            </div>
            {/* <div className="score-label">{report.grade} Tier</div> */}
            </div>
            </div>
            <div className="scorecard-right">
            <div className="segmented-bar">
            <div className="segment poor"></div>
            <div className="segment fair"></div>
            <div className="segment good"></div>
            </div>
            <div className="bar-labels">
            <span>Poor</span>
            <span>Fair</span>
            <span>Good</span>
            </div>
            </div>
            </div>

            {/* Detailed Report Section */}
            <div className="report-display-container">

            <h3 className="report-heading-h3">Category Scores</h3>
            <div className="table-container">
            <table className="report-table">
            <thead>
            <tr>
            <th><h3>Category</h3></th>
            <th><h4>Score</h4></th>
            <th><h4>Percentage</h4></th>
            </tr>
            </thead>
            <tbody>
            {(report.categoryScores || []).map((category, index) => (
                <React.Fragment key={`category-row-${index}`}>
                <tr
                onClick={() => handleRowClick(index)}
                style={{ cursor: "pointer" }}
                aria-expanded={openRowIndex === index}
                aria-controls={`details-content-${index}`}
                className="clickable-row"
                >

                <td>
                <span className="dropdown-arrow">
                <svg width="20" height="20" viewBox="0 0 16 16" fill="none"
                xmlns="http://www.w3.org/2000/svg">
                    <path d="M4 6L8 10L12 6" stroke="black" stroke-width="2"
                stroke-linecap="round" stroke-linejoin="round"/>
                </svg>
                </span>
                <h3> {category.name} </h3>
                </td>

                <td>
                {category.score}/{category.maxScore}
                </td>

                <td>
                <span
                className={getBadgeClass(
                    "percentage",
                    category.percentage,
                )}
                >
                {category.percentage}%
                </span>
                </td>
                </tr>
                <tr className="expanded-details-container-row">

                <td
                colSpan={numberOfColumns}
                style={{ padding: 0, border: "none" }}
                >
                <div
                id={`details-content-${index}`}
                className={`details-content-wrapper ${
                    openRowIndex === index ? "open" : ""
                }`}
                >
                <div
                className="details-content-inner"
                style={{
                    padding: "15px",
                    backgroundColor: "#f9f9f9",
                }}
                >
                <h4>
                Criterium description:{" "}
                {category?.ruleResult?.rule?.description ||
                    "No description available."}
                </h4>

                <div style={{ marginBottom: "10px" }}>
                <label htmlFor="severity-filter" style={{ marginRight: "8px" }}>
                Filter by severity:
                    </label>
                <select
                id="severity-filter"
                value={severityFilter}
                onChange={(e) => setSeverityFilter(e.target.value)}
                >
                <option value="all">All</option>
                <option value="info">Info</option>
                <option value="warning">Warning</option>
                <option value="error">Error</option>
                </select>
                </div>
                <div className="scrollable-violations-container">
                {Array.isArray(category?.ruleResult?.result?.violations) &&
                    category.ruleResult.result.violations.length > 0 ? (

                        <ViolationsList
                        severityFilter={severityFilter}
                        category={category}
                        index={index}
                        getBadgeClass={getBadgeClass}
                        />
                ) : (
                <p>No applicable violations for this rule.</p>
                )}
            </div>

            </div>
            </div>
            </td>
            </tr>
            </React.Fragment>
            ))}
            </tbody>
            </table>
            </div>
            </div>
            </div>
            </div>
        );
};

export default ScorecardDisplay;

