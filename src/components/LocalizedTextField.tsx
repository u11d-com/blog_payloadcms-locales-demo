"use client";

import {
  useField,
  useLocale,
  useDocumentInfo,
  TextInput,
} from "@payloadcms/ui";
import React, { CSSProperties, useEffect, useState } from "react";

const FALLBACK_STYLE: CSSProperties = {
  marginTop: "8px",
  padding: "4px 8px",
  backgroundColor: "#f5f5f5",
  borderRadius: "4px",
  fontSize: "12px",
};

interface LocalizedTextFieldProps {
  path: string;
}

export const LocalizedTextField: React.FC<LocalizedTextFieldProps> = ({
  path,
}) => {
  const locale = useLocale();
  const { id, collectionSlug } = useDocumentInfo();
  const { value, setValue } = useField<string>({ path });
  const [englishValue, setEnglishValue] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const isEnglish = locale.code === "en";

  useEffect(() => {
    if (isEnglish || !id || !collectionSlug) {
      setEnglishValue(null);
      return;
    }

    const fetchEnglishValue = async () => {
      setLoading(true);
      try {
        const params = new URLSearchParams({
          collectionSlug,
          documentId: id.toString(),
          fieldPath: path,
        });

        const response = await fetch(`/api/default-locale-value?${params}`, {
          method: "GET",
          credentials: "include", // Include cookies for authentication
        });

        if (!response.ok) {
          throw new Error("Failed to fetch English value");
        }

        const data = await response.json();
        setEnglishValue(data.value);
      } catch (error) {
        console.error("Failed to fetch English value:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchEnglishValue();
  }, [id, isEnglish, path, collectionSlug]);

  return (
    <div>
      <TextInput
        path={path}
        value={value || ""}
        onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
          setValue(e.target.value)
        }
      />

      {!isEnglish && englishValue && (
        <div style={FALLBACK_STYLE}>EN: {englishValue}</div>
      )}

      {loading && <div style={FALLBACK_STYLE}>Loading English value...</div>}
    </div>
  );
};

export default LocalizedTextField;
