"use client";

import { useEffect, useState } from "react";
import { jsPDF } from "jspdf";
import Image from "next/image";

type QualityResult = {
  quality_score: number;
  quality_status: string;
  blur_score: number;
  brightness_score: number;
  contrast_score: number;
  resolution_score: number;
  issues: string[];
};

type GradCAMResult = {
  available: boolean;
  predicted_class?: string;
  explained_class?: string;
  confidence?: number;
  confidence_percent?: number;
  filename?: string;
  url?: string;
  error?: string;
};

type PredictionResult = {
  predicted_class: string;
  confidence: number;
  confidence_percent: number;

  second_prediction: string;
  second_confidence: number;
  second_confidence_percent: number;

  margin: number;
  margin_percent: number;

  class_probabilities: {
    NORMAL: number;
    MI: number;
    POST_MI: number;
    ABNORMAL_RHYTHM: number;
  };

  uncertainty: string;
  priority: string;
  recommendation: string;

  quality: QualityResult;

  model: {
    name: string;
    image_size: number;
    classes: string[];
  };

  disclaimer: string;

  gradcam: GradCAMResult;

  file: {
    original_filename: string;
    stored_filename: string;
    upload_url: string;
  };
};

type AnalysisHistoryItem = {
  id: string;
  filename: string;
  predictedClass: string;
  confidence: number;
  createdAt: string;
};

const API_URL =  "http://43.205.58.46:8000";

function formatClassName(className: string) {
  switch (className) {
    case "NORMAL":
      return "Normal";
    case "MI":
      return "Myocardial Infarction (MI)";
    case "POST_MI":
      return "History of MI / Post-MI";
    case "ABNORMAL_RHYTHM":
      return "Abnormal Heartbeat";
    default:
      return className;
  }
}

function ProbabilityBar({
  label,
  value,
}: {
  label: string;
  value: number;
}) {
  return (
    <div className="probability-item">
      <div className="probability-header">
        <span>{formatClassName(label)}</span>
        <strong>{(value * 100).toFixed(2)}%</strong>
      </div>
      <div className="probability-track">
        <div
          className="probability-fill"
          style={{
            width: `${Math.max(0, Math.min(100, value * 100))}%`,
          }}
        />
      </div>
    </div>
  );
}

export default function Home() {
  const [selectedFile, setSelectedFile] =
    useState<File | null>(null);

  const [result, setResult] =
    useState<PredictionResult | null>(null);

  const [loading, setLoading] =
    useState(false);

  const [error, setError] =
    useState<string | null>(null);

  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [activeNav, setActiveNav] = useState("workspace");
  const [analysisHistory, setAnalysisHistory] = useState<AnalysisHistoryItem[]>([]);
  const [patientName, setPatientName] = useState("");
  const [patientAge, setPatientAge] = useState("");
  const [patientSex, setPatientSex] = useState("");
  const [patientId, setPatientId] = useState("");

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);


  // ============================================================
  // FILE SELECTION
  // ============================================================

  const selectFile = (file: File) => {
    if (!file.type.startsWith("image/")) {
      setError("Upload ECG images only");
      return;
    }
    setSelectedFile(file);
    setPreviewUrl(URL.createObjectURL(file));
    setResult(null);
    setError(null);
  };

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) selectFile(file);
  };

  const handleDrop = (event: React.DragEvent<HTMLLabelElement>) => {
    event.preventDefault();
    setIsDragging(false);
    const file = event.dataTransfer.files?.[0];
    if (file) selectFile(file);
  };

  const handleNavigation = (
    event: React.MouseEvent<HTMLAnchorElement>,
    targetId: string,
    label: string
  ) => {
    if (targetId === "ingest") {
      handleReset();
    }

    const target = document.getElementById(targetId);

    if (!target) {
      event.preventDefault();
      setError(`Run an ECG analysis to open ${label}.`);
      return;
    }

    setActiveNav(targetId);
  };


  // ============================================================
  // ECG ANALYSIS
  // ============================================================

  const handleAnalyze = async () => {
    if (!selectedFile) {
      setError("Please select an ECG image first.");
      return;
    }

    const parsedAge = Number(patientAge);

    if (!patientName.trim() || !patientAge || !patientSex) {
      setError("Please enter the patient details.");
      return;
    }

    if (!Number.isInteger(parsedAge) || parsedAge < 0 || parsedAge > 120) {
      setError("Enter a valid patient age between 0 and 120.");
      return;
    }

    const generatedPatientId = patientId || `PT-${new Date().getFullYear()}-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
    setPatientId(generatedPatientId);

    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const formData = new FormData();

      formData.append(
        "file",
        selectedFile
      );

      const response = await fetch(
        `${API_URL}/predict`,
        {
          method: "POST",
          body: formData,
          headers: {
            "ngrok-skip-browser-warning": "true",
          },
        }
      );

      if (!response.ok) {
        let message =
          "ECG analysis failed.";

        try {
          const errorData =
            await response.json();

          if (errorData.detail) {
            message = errorData.detail;
          }
        } catch {
          // Ignore JSON parsing error
        }

        throw new Error(message);
      }

      const data: PredictionResult =
        await response.json();

      setResult(data);
      setAnalysisHistory((history) => [
        {
          id: `${Date.now()}-${data.file?.stored_filename || selectedFile.name}`,
          filename: data.file?.original_filename || selectedFile.name,
          predictedClass: data.predicted_class,
          confidence: data.confidence_percent,
          createdAt: new Date().toLocaleString(),
        },
        ...history,
      ].slice(0, 8));

    } catch (err) {
      console.error(err);

      if (err instanceof Error) {
        setError(err.message);
      } else {
        setError(
          "Unable to connect to the ECG AI backend."
        );
      }

    } finally {
      setLoading(false);
    }
  };


  // ============================================================
  // RESET
  // ============================================================

  const handleReset = () => {
    setSelectedFile(null);
    setPreviewUrl(null);
    setResult(null);
    setError(null);
    setPatientName("");
    setPatientAge("");
    setPatientSex("");
    setPatientId("");
    setLoading(false);

    const input =
      document.getElementById(
        "ecg-upload"
      ) as HTMLInputElement | null;

    if (input) {
      input.value = "";
    }
  };

  const handleDownloadReport = async () => {
    if (!result) return;

    setError(null);

    try {
      const pdf = new jsPDF({ unit: "mm", format: "a4" });
      const pageWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();
      const margin = 16;
      const contentWidth = pageWidth - margin * 2;
      let cursorY = 0;

      const colors = {
        navy: [7, 29, 64] as [number, number, number],
        blue: [18, 104, 232] as [number, number, number],
        cyan: [32, 190, 220] as [number, number, number],
        muted: [84, 107, 137] as [number, number, number],
        line: [205, 221, 239] as [number, number, number],
        pale: [243, 248, 255] as [number, number, number],
      };

      const ensureSpace = (height: number) => {
        if (cursorY + height > pageHeight - 18) {
          pdf.addPage();
          cursorY = 18;
          addHeader(false);
        }
      };

      const addHeader = (firstPage: boolean) => {
        if (firstPage) {
          pdf.setFillColor(...colors.navy);
          pdf.rect(0, 0, pageWidth, 34, "F");
          pdf.setTextColor(255, 255, 255);
          pdf.setFontSize(22);
          pdf.setFont("helvetica", "bold");
          pdf.text("NAMI-ECG Insight", margin, 17);
          pdf.setFontSize(9);
          pdf.setFont("helvetica", "normal");
          pdf.text("AI-Powered ECG Interpretation & Clinical Decision Support", margin, 24);
          pdf.setTextColor(...colors.muted);
          pdf.text(`Generated ${new Date().toLocaleString()}`, pageWidth - margin, 24, { align: "right" });
          cursorY = 48;
        } else {
          pdf.setDrawColor(...colors.line);
          pdf.line(margin, 12, pageWidth - margin, 12);
          pdf.setTextColor(...colors.muted);
          pdf.setFontSize(8);
          pdf.text("NAMI-ECG Insight | Clinical report", margin, 9);
          cursorY = 19;
        }
      };

      const addSectionTitle = (title: string) => {
        ensureSpace(14);
        pdf.setTextColor(...colors.navy);
        pdf.setFont("helvetica", "bold");
        pdf.setFontSize(13);
        pdf.text(title, margin, cursorY);
        pdf.setDrawColor(...colors.cyan);
        pdf.setLineWidth(0.8);
        pdf.line(margin, cursorY + 3, margin + 22, cursorY + 3);
        cursorY += 11;
      };

      const addWrappedText = (text: string, size = 10, color = colors.navy) => {
        pdf.setTextColor(...color);
        pdf.setFont("helvetica", "normal");
        pdf.setFontSize(size);
        const lines = pdf.splitTextToSize(text, contentWidth);
        ensureSpace(lines.length * 5 + 3);
        pdf.text(lines, margin, cursorY);
        cursorY += lines.length * 5 + 3;
      };

      const addRow = (label: string, value: string, index: number) => {
        ensureSpace(9);
        if (index % 2 === 0) {
          pdf.setFillColor(...colors.pale);
          pdf.rect(margin, cursorY - 5, contentWidth, 8, "F");
        }
        pdf.setTextColor(...colors.muted);
        pdf.setFont("helvetica", "bold");
        pdf.setFontSize(9);
        pdf.text(label, margin + 3, cursorY);
        pdf.setTextColor(...colors.navy);
        pdf.setFont("helvetica", "normal");
        pdf.text(value, margin + 62, cursorY);
        cursorY += 8;
      };

      addHeader(true);
      addSectionTitle("Patient Information");
      addRow("Patient ID", patientId, 0);
      addRow("Patient name", patientName.trim(), 1);
      addRow("Age", `${patientAge} years`, 2);
      addRow("Sex", patientSex, 3);
      addSectionTitle("Assessment");
      addRow("Uploaded file", result.file?.original_filename || selectedFile?.name || "ECG image", 0);
      addRow("Predicted class", formatClassName(result.predicted_class), 1);
      addRow("Confidence", `${result.confidence_percent.toFixed(2)}%`, 2);
      addRow("Uncertainty", result.uncertainty, 3);
      addRow("Priority", result.priority, 4);
      addRow("Prediction margin", `${result.margin_percent.toFixed(2)}%`, 5);

      addSectionTitle("ECG Image Quality");
      addRow("Quality score", `${result.quality.quality_score.toFixed(1)}/100`, 0);
      addRow("Status", result.quality.quality_status, 1);
      addRow("Sharpness", `${result.quality.blur_score}/100`, 2);
      addRow("Brightness", `${result.quality.brightness_score}/100`, 3);
      addRow("Contrast", `${result.quality.contrast_score}/100`, 4);
      addRow("Resolution", `${result.quality.resolution_score}/100`, 5);

      addSectionTitle("Class Probabilities");
      Object.entries(result.class_probabilities).forEach(([label, value]) => {
        ensureSpace(13);
        pdf.setTextColor(...colors.navy);
        pdf.setFont("helvetica", "normal");
        pdf.setFontSize(9);
        pdf.text(formatClassName(label), margin, cursorY);
        pdf.text(`${(value * 100).toFixed(2)}%`, pageWidth - margin, cursorY, { align: "right" });
        pdf.setFillColor(220, 232, 247);
        pdf.roundedRect(margin, cursorY + 2, contentWidth, 3, 1.5, 1.5, "F");
        pdf.setFillColor(...colors.blue);
        pdf.roundedRect(margin, cursorY + 2, contentWidth * Math.max(0, Math.min(1, value)), 3, 1.5, 1.5, "F");
        cursorY += 12;
      });

      addSectionTitle("Clinical Recommendation");
      addWrappedText(result.recommendation, 10);

      if (result.quality.issues.length > 0) {
        addSectionTitle("Quality Notes");
        addWrappedText(result.quality.issues.map((issue) => `- ${issue}`).join("\n"), 9, colors.muted);
      }

      addSectionTitle("Model Information");
      addRow("Model", result.model.name, 0);
      addRow("Input size", `${result.model.image_size} x ${result.model.image_size}`, 1);
      addRow("Trained classes", `${result.model.classes.length}`, 2);

      if (result.gradcam?.available && result.gradcam.url) {
        addSectionTitle("Grad-CAM Visual Evidence");
        addWrappedText("Highlighted regions indicate areas associated with the model's prediction.", 9, colors.muted);
        try {
          const imageResponse = await fetch(`${API_URL}${result.gradcam.url}`);
          const imageBlob = await imageResponse.blob();
          const imageData = await new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(String(reader.result));
            reader.onerror = reject;
            reader.readAsDataURL(imageBlob);
          });
          ensureSpace(82);
          pdf.addImage(imageData, "JPEG", margin, cursorY, contentWidth, 74, undefined, "MEDIUM");
          cursorY += 80;
        } catch {
          addWrappedText("Grad-CAM image could not be embedded in this report.", 9, colors.muted);
        }
      }

      ensureSpace(32);
      pdf.setFillColor(...colors.pale);
      pdf.rect(margin, cursorY, contentWidth, 25, "F");
      pdf.setTextColor(...colors.navy);
      pdf.setFont("helvetica", "bold");
      pdf.setFontSize(9);
      pdf.text("Important clinical notice", margin + 5, cursorY + 7);
      cursorY += 13;
      addWrappedText(result.disclaimer, 8, colors.muted);

      const totalPages = pdf.getNumberOfPages();
      for (let page = 1; page <= totalPages; page += 1) {
        pdf.setPage(page);
        pdf.setTextColor(...colors.muted);
        pdf.setFont("helvetica", "normal");
        pdf.setFontSize(8);
        pdf.text(`Page ${page} of ${totalPages}`, pageWidth - margin, pageHeight - 8, { align: "right" });
      }

      pdf.save(`ecg-ai-${result.predicted_class.toLowerCase()}-report.pdf`);
    } catch (downloadError) {
      console.error(downloadError);
      setError("Unable to create the clinical PDF report.");
    }
  };


  // ============================================================
  // UNCERTAINTY CLASS
  // ============================================================

  const getUncertaintyClass = (
    uncertainty: string
  ) => {
    switch (uncertainty) {
      case "LOW":
        return "status-low";

      case "MODERATE":
        return "status-moderate";

      default:
        return "status-high";
    }
  };


  // ============================================================
  // PRIORITY CLASS
  // ============================================================

  const getPriorityClass = (
    priority: string
  ) => {
    switch (priority) {
      case "URGENT":
        return "priority-urgent";

      case "HIGH":
        return "priority-high";

      case "REVIEW":
        return "priority-review";

      default:
        return "priority-low";
    }
  };


  return (
    <main className="page">

      <aside className="side-nav" aria-label="Primary navigation">
        <div className="side-nav-logo" aria-hidden="true">ECG</div>
        <nav>
          <a className={`side-nav-link ${activeNav === "workspace" ? "is-active" : ""}`} href="#workspace" onClick={(event) => handleNavigation(event, "workspace", "Home")}><span>⌂</span>Home</a>
          <a className={`side-nav-link ${activeNav === "ingest" ? "is-active" : ""}`} href="#ingest" onClick={(event) => handleNavigation(event, "ingest", "New Analysis")}><span>＋</span>New Analysis</a>
          <a className={`side-nav-link ${activeNav === "history" ? "is-active" : ""}`} href="#history" onClick={(event) => handleNavigation(event, "history", "History")}><span>◷</span>History</a>
          <a className={`side-nav-link ${activeNav === "report" ? "is-active" : ""}`} href="#report" onClick={(event) => handleNavigation(event, "report", "Reports")}><span>▤</span>Reports</a>
          <a className={`side-nav-link ${activeNav === "about" ? "is-active" : ""}`} href="#about" onClick={(event) => handleNavigation(event, "about", "About")}><span>i</span>About</a>
        </nav>
        <div className="side-nav-callout">
          <Image
            src="/heart-3d.svg"
            alt=""
            className="side-nav-heart"
            width={104}
            height={122}
            unoptimized
          />
          <strong>Better<br />Detection<br />Safer Lives</strong>
        </div>
      </aside>

      {/* ======================================================
          HEADER
          ====================================================== */}

      <header className="header">
        <div className="brand-lockup">

          <div className="brand-mark" aria-hidden="true">
            <span />
            <span />
            <span />
          </div>

          <div>

          <h1>
            NAMI-ECG Insight
          </h1>

          <p>
            AI-Powered ECG Interpretation & Clinical Decision Support
          </p>

          </div>

        </div>

        <div className="header-status">
          <span className="live-dot" />
          <span>Analysis workspace</span>
          <div className="model-badge">
            <strong>EfficientNet-B4</strong>
            <span>Deep Learning Model</span>
          </div>
        </div>

      </header>


      {/* ======================================================
          MAIN CONTAINER
          ====================================================== */}

      <div className="container" id="workspace">

        <section className="signal-hero reveal-up" aria-label="PulseSight signal console">
          <div className="signal-hero-copy">
            <span className="section-kicker">SIGNAL CONSOLE / 24.09</span>
            <h2>ECG AI Analysis</h2>
            <p>Upload your ECG image and get AI-powered prediction with visual explanation.</p>
            <Image
              src="/heart-3d.svg"
              alt=""
              className="hero-heart"
              width={96}
              height={110}
              unoptimized
            />
            <div className="signal-metrics">
              <div><strong>04</strong><span>trained classes</span></div>
              <div><strong>01</strong><span>trace per scan</span></div>
              <div><strong>AI</strong><span>visual evidence</span></div>
            </div>
          </div>
          <div className="hero-signal-panel" aria-hidden="true">
            <div className="hero-panel-top"><span>LIVE SIGNAL / IDLE</span><span>25 mm/s</span></div>
            <div className="hero-wave-grid" />
            <svg viewBox="0 0 820 220" preserveAspectRatio="none" className="hero-wave hero-wave-back">
              <path d="M0 116 C34 110 42 119 68 116 S102 114 124 116 L142 116 L155 103 L168 128 L182 116 C212 111 224 119 254 116 S294 114 324 116 L342 116 L355 103 L368 128 L382 116 C412 111 424 119 454 116 S494 114 524 116 L542 116 L555 103 L568 128 L582 116 C612 111 624 119 654 116 S694 114 724 116 L742 116 L755 103 L768 128 L782 116 H820" />
            </svg>
            <svg viewBox="0 0 820 220" preserveAspectRatio="none" className="hero-wave hero-wave-front">
              <path d="M0 121 C32 119 52 126 80 120 S120 117 145 121 L161 121 L178 88 L193 151 L211 121 C243 117 263 125 292 120 S335 117 359 121 L376 121 L393 88 L408 151 L426 121 C458 117 478 125 507 120 S550 117 574 121 L591 121 L608 88 L623 151 L641 121 C673 117 693 125 722 120 S765 117 790 121 H820" />
            </svg>
            <div className="hero-cursor" />
            <div className="hero-panel-bottom"><span>BASELINE STABLE</span><strong>● 98.4 BPM</strong></div>
          </div>
        </section>


        {/* ====================================================
            UPLOAD CARD
            ==================================================== */}

        <section className="upload-card reveal-up" id="ingest">
          <div className="section-title">

            <span className="section-kicker">01 / INGEST</span>
            <h2>
              Bring a trace to life.
            </h2>

            <p>
              Upload a clear ECG image and let the model map its signal,
              confidence, and visual evidence in seconds.
            </p>

          </div>


          <label
            htmlFor="ecg-upload"
            className={`upload-area ${isDragging ? "is-dragging" : ""} ${previewUrl ? "has-preview" : ""}`}
            onDragOver={(event) => {
              event.preventDefault();
              setIsDragging(true);
            }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={handleDrop}
          >
            {previewUrl ? (
              <>
                <Image
                  src={previewUrl}
                  alt="Selected ECG preview"
                  className="upload-preview"
                  width={640}
                  height={330}
                  unoptimized
                />
                <span className="preview-badge">Preview ready · click to replace</span>
              </>
            ) : (
              <div className="upload-placeholder-content">
                <div className="upload-icon"><span className="upload-arrow">↑</span></div>
                <div>
                  <strong>Drop your ECG here</strong>
                  <p>or click to browse · JPG, PNG, WEBP</p>
                </div>
              </div>
            )}

          </label>


          <input
            id="ecg-upload"
            type="file"
            accept=".jpg,.jpeg,.png,.webp"
            onChange={handleFileChange}
            hidden
          />


          {/* ==================================================
              SELECTED FILE
              ================================================== */}

          {selectedFile && (

            <div className="selected-file">

              <div>

                <strong>
                  Selected ECG
                </strong>

                <p>
                  {selectedFile.name}
                </p>

              </div>

              <span>
                {(selectedFile.size / 1024).toFixed(1)} KB
              </span>

            </div>

          )}

          <div className="patient-details" aria-label="Patient information">
            <div className="patient-details-heading">
              <strong>Patient Information</strong>
              <span>Required for the clinical report</span>
            </div>
            <label>
              Patient name
              <input
                type="text"
                value={patientName}
                onChange={(event) => setPatientName(event.target.value)}
                placeholder="Full name"
                autoComplete="name"
              />
            </label>
            <div className="patient-age-field">
              <label>
                Age
                <input
                  type="number"
                  min="0"
                  max="120"
                  value={patientAge}
                  onChange={(event) => setPatientAge(event.target.value)}
                  placeholder="Age"
                  inputMode="numeric"
                />
              </label>
            </div>
            <label>
              Sex
              <select value={patientSex} onChange={(event) => setPatientSex(event.target.value)}>
                <option value="">Select</option>
                <option value="Female">Female</option>
                <option value="Male">Male</option>
                <option value="Intersex">Intersex</option>
                <option value="Not specified">Prefer not to say</option>
              </select>
            </label>
            <button
              className="analyze-button patient-analyze-button"
              onClick={handleAnalyze}
              disabled={!selectedFile || loading}
            >
              <span className={loading ? "button-loader" : "button-spark"} aria-hidden="true" />
              {loading ? "Reading signal..." : "Analyze ECG"}
            </button>
            {error === "Please enter the patient details." && (
              <div className="patient-validation-popup" role="alert">
                {error}
              </div>
            )}
            {patientId && <span className="generated-patient-id">Patient ID: {patientId}</span>}
          </div>


          {/* ==================================================
              BUTTONS
              ================================================== */}

          <div className="button-row">
            <label className="upload-ecg-button" htmlFor="ecg-upload">
              <span aria-hidden="true">↑</span>
              Upload ECG
            </label>
            {(selectedFile || result) && (

              <button
                className="reset-button"
                onClick={handleReset}
              >
                Clear
              </button>

            )}

          </div>


          {/* ==================================================
              ERROR
              ================================================== */}

          {error && error !== "Please enter the patient details." && (

            <div className="error-message">

              <strong>
                Analysis Error
              </strong>

              <p>
                {error}
              </p>

            </div>

          )}

        </section>

        {loading && (
          <section className="analysis-monitor reveal-up" aria-live="polite">
            <div className="monitor-copy">
              <span className="section-kicker">02 / SIGNAL PROCESSING</span>
              <h2>Reading the rhythm.</h2>
              <p>EfficientNet-B4 is mapping the trace and preparing visual evidence.</p>
            </div>
            <div className="ecg-monitor" aria-hidden="true">
              <div className="ecg-grid" />
              <svg viewBox="0 0 800 160" preserveAspectRatio="none" className="ecg-wave">
                <path d="M0 87 H125 L142 87 L153 78 L164 96 L177 87 H260 L273 87 L287 65 L299 125 L314 87 H405 L420 87 L432 78 L443 96 L456 87 H555 L570 87 L584 65 L597 125 L611 87 H800" />
              </svg>
              <div className="monitor-readout"><span>LIVE ANALYSIS</span><strong>●</strong></div>
            </div>
          </section>
        )}


        {/* ====================================================
            RESULTS
            ==================================================== */}

        {result && (

          <section className="results reveal-up" id="results">


            {/* ==================================================
                AI PREDICTION
                ================================================== */}

            <div className="result-card prediction-card">

              <div className="section-title">

                <h2>
                  AI Prediction
                </h2>

                <p>
                  Model output for the uploaded
                  ECG image.
                </p>

              </div>


              <div className="prediction-main">

                <div>

                  <span className="prediction-label">
                    Predicted Class
                  </span>

                  <h3>
                    {formatClassName(
                      result.predicted_class
                    )}
                  </h3>

                </div>


                <div className="confidence-box">

                  <span>
                    Confidence
                  </span>

                  <strong>
                    {result.confidence_percent.toFixed(
                      2
                    )}%
                  </strong>

                </div>

              </div>


              {/* =================================================
                  STATUS
                  ================================================= */}

              <div className="status-grid">

                <div className="status-box">

                  <span>
                    Uncertainty
                  </span>

                  <strong
                    className={
                      getUncertaintyClass(
                        result.uncertainty
                      )
                    }
                  >
                    {result.uncertainty}
                  </strong>

                </div>


                <div className="status-box">

                  <span>
                    Priority
                  </span>

                  <strong
                    className={
                      getPriorityClass(
                        result.priority
                      )
                    }
                  >
                    {result.priority}
                  </strong>

                </div>


                <div className="status-box">

                  <span>
                    Prediction Margin
                  </span>

                  <strong>
                    {result.margin_percent.toFixed(
                      2
                    )}%
                  </strong>

                </div>

              </div>


              {/* =================================================
                  SECOND PREDICTION
                  ================================================= */}

              <div className="secondary-prediction">

                <span>
                  Second Prediction
                </span>

                <strong>
                  {formatClassName(
                    result.second_prediction
                  )}
                </strong>

                <span>
                  {result.second_confidence_percent.toFixed(
                    2
                  )}%
                </span>

              </div>

            </div>


            {/* ==================================================
                IMAGE QUALITY
                ================================================== */}

            <div className="result-card quality-card">

              <div className="section-title">

                <h2>
                  ECG Image Quality
                </h2>

                <p>
                  Basic image-quality assessment
                  performed before prediction.
                </p>

              </div>


              <div className="quality-summary">

                <div>

                  <span>
                    Quality Score
                  </span>

                  <strong>
                    {result.quality.quality_score.toFixed(
                      1
                    )}/100
                  </strong>

                </div>


                <div>

                  <span>
                    Status
                  </span>

                  <strong>
                    {result.quality.quality_status}
                  </strong>

                </div>

              </div>


              <div className="quality-grid">

                <div className="quality-item">

                  <span>
                    Sharpness
                  </span>

                  <strong>
                    {result.quality.blur_score}/100
                  </strong>

                </div>


                <div className="quality-item">

                  <span>
                    Brightness
                  </span>

                  <strong>
                    {result.quality.brightness_score}/100
                  </strong>

                </div>


                <div className="quality-item">

                  <span>
                    Contrast
                  </span>

                  <strong>
                    {result.quality.contrast_score}/100
                  </strong>

                </div>


                <div className="quality-item">

                  <span>
                    Resolution
                  </span>

                  <strong>
                    {result.quality.resolution_score}/100
                  </strong>

                </div>

              </div>


              {result.quality.issues.length > 0 && (

                <div className="quality-warning">

                  <strong>
                    Quality Notes
                  </strong>

                  <ul>

                    {result.quality.issues.map(
                      (issue, index) => (
                        <li key={index}>
                          {issue}
                        </li>
                      )
                    )}

                  </ul>

                </div>

              )}

            </div>


            {/* ==================================================
                CLASS PROBABILITIES
                ================================================== */}

            <div className="result-card probabilities-card">

              <div className="section-title">

                <h2>
                  Class Probabilities
                </h2>

                <p>
                  Relative model probabilities
                  for the four trained classes.
                </p>

              </div>


              <div className="probabilities">

                <ProbabilityBar
                  label="NORMAL"
                  value={
                    result.class_probabilities.NORMAL
                  }
                />

                <ProbabilityBar
                  label="MI"
                  value={
                    result.class_probabilities.MI
                  }
                />

                <ProbabilityBar
                  label="POST_MI"
                  value={
                    result.class_probabilities.POST_MI
                  }
                />

                <ProbabilityBar
                  label="ABNORMAL_RHYTHM"
                  value={
                    result.class_probabilities
                      .ABNORMAL_RHYTHM
                  }
                />

              </div>

            </div>


            {/* ==================================================
                GRAD-CAM
                ================================================== */}

            {result.gradcam?.available && (

              <div className="result-card gradcam-card">

                <div className="section-title">

                  <h2>
                    AI Explanation — Grad-CAM
                  </h2>

                  <p>
                    Highlighted regions indicate
                    areas associated with the model&apos;s
                    prediction.
                  </p>

                </div>


                <div className="gradcam-info">

                  <div>

                    <span>
                      Explained Class
                    </span>

                    <strong>
                      {formatClassName(
                        result.gradcam
                          .explained_class || ""
                      )}
                    </strong>

                  </div>


                  <div>

                    <span>
                      Model Confidence
                    </span>

                    <strong>
                      {(
                        result.gradcam
                          .confidence_percent || 0
                      ).toFixed(2)}%
                    </strong>

                  </div>

                </div>


                <div className="gradcam-image-container">

                  <Image
                    src={
                      `${API_URL}${result.gradcam.url}`
                    }
                    alt="Grad-CAM ECG explanation"
                    className="gradcam-image"
                    width={380}
                    height={380}
                    unoptimized
                  />

                </div>


                <p className="explanation-note">

                  Grad-CAM is an AI visualization
                  technique. Highlighted regions
                  indicate areas associated with the
                  model&apos;s decision and should not be
                  interpreted as a clinical diagnosis.

                </p>

              </div>

            )}


            {/* ==================================================
                GRAD-CAM ERROR
                ================================================== */}

            {result.gradcam &&
              !result.gradcam.available && (

                <div className="result-card gradcam-unavailable-card">

                  <div className="quality-warning">

                    <strong>
                      AI Explanation Unavailable
                    </strong>

                    <p>
                      Grad-CAM could not be generated
                      for this ECG.
                    </p>

                  </div>

                </div>

              )}


            {/* ==================================================
                RECOMMENDATION
                ================================================== */}

            <div className="recommendation-card">

              <div className="section-title">

                <h2>
                  Recommendation
                </h2>

              </div>

              <p>
                {result.recommendation}
              </p>

            </div>

            <div className="report-action-card" id="report">
              <div>
                <span className="section-kicker">CLINICAL HANDOFF</span>
                <h2>Take the findings with you.</h2>
                <p>Download a formatted PDF with the assessment, recommendation, and Grad-CAM evidence.</p>
              </div>
              <button className="report-button" onClick={handleDownloadReport}>
                <span aria-hidden="true">↓</span> Download clinical report
              </button>
            </div>


            {/* ==================================================
                MODEL INFORMATION
                ================================================== */}

            <div className="result-card model-card">

              <div className="section-title">

                <h2>
                  Model Information
                </h2>

              </div>


              <div className="model-info-grid">

                <div>

                  <span>
                    Model
                  </span>

                  <strong>
                    {result.model.name}
                  </strong>

                </div>


                <div>

                  <span>
                    Input Size
                  </span>

                  <strong>
                    {result.model.image_size} ×{" "}
                    {result.model.image_size}
                  </strong>

                </div>


                <div>

                  <span>
                    Classes
                  </span>

                  <strong>
                    {result.model.classes.length}
                  </strong>

                </div>

              </div>

            </div>


            {/* ==================================================
                DISCLAIMER
                ================================================== */}

            <div className="disclaimer" id="about">

              <strong>
                Important
              </strong>

              <p>
                {result.disclaimer}
              </p>

            </div>


          </section>

        )}

        <section className="history-panel" id="history" aria-label="Analysis history">
          <div>
            <span className="section-kicker">RECENT SCANS</span>
            <h2>Analysis history</h2>
            <p>Your latest ECG screenings stay available during this session.</p>
          </div>
          {analysisHistory.length > 0 ? (
            <div className="history-list">
              {analysisHistory.map((item) => (
                <div className="history-item" key={item.id}>
                  <span className="history-pulse" aria-hidden="true">♥</span>
                  <div>
                    <strong>{item.filename}</strong>
                    <span>{formatClassName(item.predictedClass)} · {item.createdAt}</span>
                  </div>
                  <b>{item.confidence.toFixed(2)}%</b>
                </div>
              ))}
            </div>
          ) : (
            <div className="history-empty">No completed analyses yet.</div>
          )}
        </section>

      </div>


      {/* ========================================================
          FOOTER
          ======================================================== */}

      <footer className="footer">

        <p>
          ECG AI Analyzer • Research and screening support system
        </p>

      </footer>

    </main>
  );
}