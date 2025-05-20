import React, { useState, useRef, Suspense, lazy } from "react";

import { ScoreCard } from "../../scoring-engine/types";
    const ScoreCardDisplay = lazy(() => import("./ScoreCard"));
import "../styles/styles.css";

function App() {
    const [file, setFile] = useState<File | null>(null);
    const [url, setUrl] = useState("");
    const [loading, setLoading] = useState(false);
    const [report, setReport] = useState<ScoreCard | null>(null);
    const [error, setError] = useState<string | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const handleSelectedFile = (file: File | null) => {
        if (file) {
            setFile(file);
            setUrl(""); // Clear URL if a file is selected
        } else {
            setFile(null);
        }
    };

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files.length > 0) {
            handleSelectedFile(e.target.files[0]);
        } else {
            handleSelectedFile(null);
        }
    };

    const handleUrlChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        setUrl(e.target.value);
        setFile(null); // Clear file if a URL is entered
    };

const handleDragOver = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
};

const handleDrop = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();

    if (event.dataTransfer.files && event.dataTransfer.files.length > 0) {
        handleSelectedFile(event.dataTransfer.files[0]);
        event.dataTransfer.clearData();
    }
};

const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    // Changed from HTMLDivElement
    e.preventDefault();
    setLoading(true);
    setError(null);
    setReport(null);

    try {
        const formData = new FormData();

        if (file) {
            formData.append("spec", file);
        } else if (url) {
            formData.append("url", url);
        } else {
            throw new Error("Please provide a file or URL");
        }

        const response = await fetch("/api/analyze", {
            method: "POST",
            body: formData,
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.error || "Failed to analyze specification");
        }

        setReport(data);
    } catch (err: any) {
        setError(err.message);
    } finally {
        setLoading(false);
    }
};

return (
    <>
    <div className="app-container">
    <div className="upload-container">

    <h1 className="main-heading">OpenAPI Scorecard</h1>
    <div className="upload-header">UPLOAD OPENAPI SPEC</div>
    <p className="upload-instructions">
    Upload an OpenAPI (v3) specification in YAML or JSON format to evaluate it.
        </p>
    <form onSubmit={handleSubmit} className="form-container">
    <div
    className={`upload-dropzone${file ? ' has-file' : ''}`}
    onClick={() => fileInputRef.current?.click()}
    onDrop={handleDrop}
    onDragOver={handleDragOver}
    >
    {file ? (
        <>
        <span className="upload-icon">✔️</span>
        <span className="upload-dropzone-text">
        <strong>{file.name}</strong> is ready to upload.
            </span>
        <button
        type="button"
        className="remove-file-btn"
        onClick={e => {
            e.stopPropagation();
            setFile(null);
        }}
        aria-label="Remove file"
        >
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
        <path d="M4 4L12 12M12 4L4 12" stroke="#b91c1c" strokeWidth="2" strokeLinecap="round"/>
        </svg>
        </button> 
        </>
    ) : (
    <>
    <span className="upload-icon">↑</span>
    <span className="upload-dropzone-text">
    Drag and drop a file here or click to upload
    </span>
    </>
    )}
    <input
    id="file-upload"
    type="file"
    className="input-field"
    ref={fileInputRef}
    onChange={handleFileChange}
    accept=".json,.yaml,.yml"
    style={{ display: "none" }}
    />
    </div>
    <button
    type="submit"
    className="submit-button"
    disabled={(!file && !url) || loading}
    >
    {loading ? "Analyzing..." : "UPLOAD"}
    </button>
    </form>
    </div>
    {loading && (
        <div className="loading-indicator">
        {/* You can add a simple CSS spinner here if desired */}
            <p className="spinner-text">Analyzing specification...</p>
        </div>
    )}

    </div>
    <div className="app-container">
    {error && (
        <div className="alert-error">
        <strong className="alert-title">Error</strong>
        <p>{error}</p>
        </div>
    )}

    {report && (
        <Suspense
        fallback={
            <div className="suspense-fallback">
            <p className="spinner-text">Loading report...</p>
            </div>
        }
        >
        <ScoreCardDisplay report={report} percentage={50} />
        </Suspense>
    )}

    <footer className="footer">
    <p>
    &copy; {new Date().getFullYear()} OpenAPI Scorecard. Built with ❤️
    </p>
    <p>
    Powered by{" "}
    <a
    href="https://github.com/APIDevTools/swagger-parser"
        className="footer-link"
    target="_blank"
    rel="noopener noreferrer"
    >
    swagger-parser
    </a>{" "}
    </p>
    </footer>
    </div>
    </>
);
}

export default App;
