"use client";

import React, { useState } from "react";
import { toast, Button, useModal, useDocumentInfo } from "@payloadcms/ui";
import { TranslateModal } from "./TranslateModal";
import { LOCALES_WITHOUT_EN } from "@/locales";

export const TranslateButton: React.FC = () => {
  const { id, collectionSlug } = useDocumentInfo();
  const [isLoading, setIsLoading] = useState(false);
  const { openModal } = useModal();

  const handleTranslateClick = async () => {
    if (!id || !collectionSlug) {
      toast.error("Document ID and collection are required");
      return;
    }

    setIsLoading(true);

    try {
      if (LOCALES_WITHOUT_EN.length === 0) {
        toast.error("No target locales available for translation");
        return;
      }

      openModal("translate-modal");
    } catch (error) {
      console.error("Error opening translate modal:", error);
      toast.error("Failed to open translation modal");
    } finally {
      setIsLoading(false);
    }
  };

  if (!id || !collectionSlug) {
    return null;
  }

  return (
    <>
      <Button
        buttonStyle="primary"
        onClick={handleTranslateClick}
        disabled={isLoading}
      >
        {isLoading ? "Loading..." : "Translate"}
      </Button>
      <TranslateModal />
    </>
  );
};

export default TranslateButton;
