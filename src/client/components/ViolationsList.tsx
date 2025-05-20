import React from "react";
import {  RuleViolation } from "../../scoring-engine/types";

interface ViolationsListProps {
    severityFilter: string,
    category: any;
    index: number;
    getBadgeClass: (type: "percentage" | "severity", value: number | string) => string;
}

const ViolationsList: React.FC<ViolationsListProps> = ({
    severityFilter,
    category,
    index,
    getBadgeClass,
}) => {
    return (
        <ul className="violations-list">
        {(category.ruleResult.result.violations || [])
            .filter((violation: RuleViolation) => {
                if (severityFilter === "all") return true;
                return (
                    violation?.severity?.toLowerCase() ===
                        severityFilter.toLowerCase()
                );
            })
            .map((violation: RuleViolation, vIndex: number) => (
                <li
                key={`violation-${category.name}-${index}-${vIndex}`}
                className="violations-list-item"
                >
                <span
                className={`${getBadgeClass(
                    "severity",
                    violation?.severity || "UNKNOWN"
                )} violation-badge`}
                >
                {(violation?.severity || "UNKNOWN").toUpperCase()}
                </span>
                <p className="violation-path">
                {violation?.path || "No path"}
                {violation?.operation
                    ? ` (${violation.operation})`
                    : ""}
                    &rarr;{" "}
                    <code className="violation-code">
                    {violation?.location || "No location"}
                    </code>
                    </p>
                    <p className="violation-message">
                    {violation?.message || "No message"}
                    </p>
                    {violation?.suggestion && (
                        <p className="violation-suggestion">
                        <span className="violation-suggestion-label">
                        Suggestion:
                            </span>{" "}
                        {violation.suggestion}
                        </p>
                    )}
                    </li>
            ))}
            </ul>

    );
};

export default ViolationsList;
