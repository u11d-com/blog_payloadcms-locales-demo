"use client";

import React, { useState } from "react";
import {
  Button,
  toast,
  Modal,
  useModal,
  useDocumentInfo,
} from "@payloadcms/ui";
import { LOCALES_WITHOUT_EN } from "@/locales";

export const TranslateModal: React.FC = () => {
  const { closeModal } = useModal();
  const { id, collectionSlug } = useDocumentInfo();
  const [selectedLocales, setSelectedLocales] = useState<Set<string>>(
    new Set(),
  );
  const [force, setForce] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleLocaleToggle = (locale: string) => {
    const newSelected = new Set(selectedLocales);
    if (newSelected.has(locale)) {
      newSelected.delete(locale);
    } else {
      newSelected.add(locale);
    }
    setSelectedLocales(newSelected);
  };

  const handleSelectAll = () => {
    if (selectedLocales.size === LOCALES_WITHOUT_EN.length) {
      setSelectedLocales(new Set());
    } else {
      setSelectedLocales(new Set(LOCALES_WITHOUT_EN));
    }
  };

  const handleSubmit = async () => {
    if (selectedLocales.size === 0) {
      toast.error("Please select at least one locale");
      return;
    }

    if (!id) {
      toast.error("Document ID is required");
      return;
    }

    setIsSubmitting(true);

    const body = {
      documentId: id.toString(),
      locales: Array.from(selectedLocales),
      force,
    };

    try {
      const response = await fetch("/api/translate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: "include",
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || "Failed to start translation job");
      }

      const result = await response.json();

      toast.success(
        `Translation job #${result.jobId} queued! Check the Jobs section for progress.`,
      );

      closeModal("translate-modal");

      // Reset form
      setSelectedLocales(new Set());
      setForce(false);
    } catch (error) {
      console.error("Translation error:", error);
      toast.error(
        error instanceof Error
          ? error.message
          : "Failed to start translation job",
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal slug="translate-modal">
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          minHeight: "100vh",
          padding: "20px",
        }}
      >
        <div
          style={{
            background: "var(--theme-elevation-0)",
            borderRadius: "8px",
            padding: "32px",
            maxWidth: "600px",
            width: "100%",
            boxShadow: "0 0 16px rgba(0, 0, 0, 0.25)",
          }}
        >
          <h2 style={{ marginTop: "0", marginBottom: "24px" }}>
            Auto-Translate
          </h2>

          <div>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
              }}
            >
              <label style={{ fontWeight: "bold" }}>Locales</label>
              <Button
                buttonStyle="secondary"
                size="small"
                onClick={handleSelectAll}
              >
                {selectedLocales.size === LOCALES_WITHOUT_EN.length
                  ? "Deselect All"
                  : "Select All"}
              </Button>
            </div>
            <div
              style={{
                border: "1px solid #ccc",
                borderRadius: "4px",
                padding: "12px",
                maxHeight: "200px",
                overflowY: "auto",
                gap: "8px",
                marginTop: "8px",
              }}
            >
              {LOCALES_WITHOUT_EN.map((locale) => (
                <div
                  key={locale}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    marginBottom: "8px",
                  }}
                >
                  <input
                    type="checkbox"
                    id={`locale-${locale}`}
                    checked={selectedLocales.has(locale)}
                    onChange={() => handleLocaleToggle(locale)}
                    style={{ marginRight: "8px" }}
                  />
                  <label htmlFor={`locale-${locale}`}>{locale}</label>
                </div>
              ))}
            </div>
          </div>

          <div
            style={{ display: "flex", alignItems: "center", marginTop: "20px" }}
          >
            <input
              type="checkbox"
              id="force-translate"
              checked={force}
              onChange={(e) => setForce(e.target.checked)}
              style={{ marginRight: "16px" }}
            />
            <label htmlFor="force-translate">
              <strong>Force re-translate all fields</strong>
              <br />
              <span style={{ fontSize: "0.75em", color: "#666" }}>
                If unchecked, only empty fields will be translated
              </span>
            </label>
          </div>

          <div
            style={{
              display: "flex",
              justifyContent: "flex-end",
              gap: "10px",
              marginTop: "24px",
            }}
          >
            <Button
              buttonStyle="secondary"
              onClick={() => closeModal("translate-modal")}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            <Button onClick={handleSubmit} disabled={isSubmitting}>
              {isSubmitting ? "Starting..." : "Start Translation"}
            </Button>
          </div>
        </div>
      </div>
    </Modal>
  );
};
