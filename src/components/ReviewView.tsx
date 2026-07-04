import { useCallback, useEffect, useMemo, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import type { FailedFileReview } from "../../shared/types";
import { DocumentPreview } from "./DocumentPreview";
import { formatBytes, formatTimestamp, truncate } from "../utils/format";
import { getFileTypeInfo } from "../utils/fileType";

type ReviewFilter = "pending" | "all";

function FailedFilePreview({ review }: { review: FailedFileReview }) {
  return (
    <div className="review-preview">
      <DocumentPreview
        filePath={review.quarantinePath}
        fileName={review.fileName}
      />
      <p className="review-preview-name">{review.fileName}</p>
      <p className="review-preview-meta">{formatBytes(review.bytes)}</p>
    </div>
  );
}

function FailedFileDetail({
  review,
  marking,
  onMarkReviewed,
}: {
  review: FailedFileReview | null;
  marking: boolean;
  onMarkReviewed: (fileId: string) => void;
}) {
  if (!review) {
    return (
      <div className="review-detail-empty">
        <p className="empty-state-title">Select a failed document</p>
        <p className="empty-state-desc">
          Review quarantined files, error details, and source documents
        </p>
      </div>
    );
  }

  const reviewed = Boolean(review.reviewedAt);

  return (
    <div className="review-detail">
      <div className="review-detail-header">
        <div className="review-detail-badges">
          <span className="badge failed">
            <span className="status-dot failed" />
            {review.errorCode}
          </span>
          {reviewed && (
            <span className="badge reviewed">
              <span className="status-dot reviewed" />
              Reviewed
            </span>
          )}
        </div>
        <div className="review-detail-actions">
          {!reviewed && (
            <button
              type="button"
              className="btn btn-primary"
              disabled={marking}
              onClick={() => onMarkReviewed(review.fileId)}
            >
              {marking ? "Saving..." : "Mark as reviewed"}
            </button>
          )}
          <span className="review-detail-time">{formatTimestamp(review.timestamp)}</span>
        </div>
      </div>

      <div className="review-detail-grid">
        <div className="panel">
          <div className="panel-header">
            <h3>Quarantined Source</h3>
          </div>
          <div className="panel-body">
            <FailedFilePreview review={review} />
          </div>
        </div>

        <div className="panel">
          <div className="panel-header">
            <h3>Failure Details</h3>
          </div>
          <div className="panel-body review-detail-info">
            <dl className="review-facts">
              <div>
                <dt>Collection</dt>
                <dd>{review.collectionName ?? "Unknown"}</dd>
              </div>
              <div>
                <dt>Error code</dt>
                <dd>
                  <span className="error-code">{review.errorCode}</span>
                </dd>
              </div>
              <div>
                <dt>Failed at</dt>
                <dd>{formatTimestamp(review.timestamp)}</dd>
              </div>
              {reviewed && (
                <div>
                  <dt>Reviewed at</dt>
                  <dd>{formatTimestamp(review.reviewedAt!)}</dd>
                </div>
              )}
              <div>
                <dt>File size</dt>
                <dd>{formatBytes(review.bytes)}</dd>
              </div>
            </dl>

            {review.errorDetail && (
              <div className="review-error-block">
                <p className="review-error-label">Error message</p>
                <pre>{review.errorDetail}</pre>
              </div>
            )}

            <div className="review-path-block">
              <p className="review-error-label">Quarantine path</p>
              <code>{review.quarantinePath}</code>
            </div>
          </div>
        </div>
      </div>

      {review.sidecarJson && Object.keys(review.sidecarJson).length > 0 && (
        <div className="panel review-sidecar">
          <div className="panel-header">
            <h3>Sidecar Metadata</h3>
          </div>
          <div className="panel-body">
            <pre className="json-block">
              {JSON.stringify(review.sidecarJson, null, 2)}
            </pre>
          </div>
        </div>
      )}
    </div>
  );
}

export function ReviewView() {
  const [failures, setFailures] = useState<FailedFileReview[]>([]);
  const [selectedId, setSelectedId] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [marking, setMarking] = useState(false);
  const [filter, setFilter] = useState<ReviewFilter>("pending");

  const pendingCount = useMemo(
    () => failures.filter((f) => !f.reviewedAt).length,
    [failures],
  );

  const visibleFailures = useMemo(
    () =>
      filter === "pending"
        ? failures.filter((f) => !f.reviewedAt)
        : failures,
    [failures, filter],
  );

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const data = await invoke<FailedFileReview[]>("list_failed_reviews");
      setFailures(data);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
    const unsubs = [
      listen("file:failed", () => refresh()),
      listen("metrics:update", () => refresh()),
      listen("reviews:updated", () => refresh()),
    ];
    return () => {
      unsubs.forEach((p) => p.then((u) => u()));
    };
  }, [refresh]);

  useEffect(() => {
    if (visibleFailures.length === 0) {
      setSelectedId("");
      return;
    }
    if (!visibleFailures.some((f) => f.fileId === selectedId)) {
      setSelectedId(visibleFailures[0].fileId);
    }
  }, [visibleFailures, selectedId]);

  const handleMarkReviewed = useCallback(
    async (fileId: string) => {
      setMarking(true);
      try {
        await invoke("mark_failed_review", { fileId });
        const data = await invoke<FailedFileReview[]>("list_failed_reviews");
        setFailures(data);

        const nextPending = data.find((f) => !f.reviewedAt);
        if (filter === "pending" && nextPending) {
          setSelectedId(nextPending.fileId);
        } else if (filter === "all") {
          setSelectedId(fileId);
        } else {
          setSelectedId("");
        }
      } finally {
        setMarking(false);
      }
    },
    [filter],
  );

  const selected =
    visibleFailures.find((f) => f.fileId === selectedId) ??
    failures.find((f) => f.fileId === selectedId) ??
    null;

  return (
    <div className="review-page">
      <div className="review-layout">
        <div className="card review-list-card">
          <div className="card-header">
            <h3>Quarantined Files</h3>
            <span className="card-count">{pendingCount}</span>
          </div>
          <div className="review-list-toolbar">
            <button
              type="button"
              className={`review-filter-btn${filter === "pending" ? " active" : ""}`}
              onClick={() => setFilter("pending")}
            >
              Pending
            </button>
            <button
              type="button"
              className={`review-filter-btn${filter === "all" ? " active" : ""}`}
              onClick={() => setFilter("all")}
            >
              All
            </button>
          </div>
          <div className="card-body review-list-body">
            {loading ? (
              <div className="empty-state">
                <p className="empty-state-title">Loading...</p>
              </div>
            ) : visibleFailures.length === 0 ? (
              <div className="empty-state">
                <p className="empty-state-title">
                  {filter === "pending" ? "No pending reviews" : "No failures to review"}
                </p>
                <p className="empty-state-desc">
                  {filter === "pending"
                    ? "All quarantined files have been reviewed"
                    : "Failed documents appear here after quarantine"}
                </p>
              </div>
            ) : (
              visibleFailures.map((f) => {
                const typeInfo = getFileTypeInfo(f.fileName);
                const reviewed = Boolean(f.reviewedAt);
                return (
                  <button
                    key={f.fileId}
                    type="button"
                    className={`review-list-item${f.fileId === selectedId ? " active" : ""}${reviewed ? " reviewed" : ""}`}
                    onClick={() => setSelectedId(f.fileId)}
                  >
                    <span className={`file-type-icon ${typeInfo.className}`}>
                      {typeInfo.label}
                    </span>
                    <span className="review-list-text">
                      <span className="review-list-name" title={f.fileName}>
                        {truncate(f.fileName, 32)}
                      </span>
                      <span className="review-list-meta">
                        <span className="error-code">{f.errorCode}</span>
                        {reviewed && (
                          <span className="review-list-reviewed">Reviewed</span>
                        )}
                      </span>
                    </span>
                  </button>
                );
              })
            )}
          </div>
        </div>

        <FailedFileDetail
          review={selected}
          marking={marking}
          onMarkReviewed={handleMarkReviewed}
        />
      </div>
    </div>
  );
}
