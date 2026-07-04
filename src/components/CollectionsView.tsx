import { useCallback, useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import type { CollectionSummary, DocType } from "../../shared/types";
import { CollectionDetail } from "./CollectionDetail";
import { CollectionList } from "./CollectionList";
import { CreateCollectionModal } from "./CreateCollectionModal";

export function CollectionsView() {
  const [collections, setCollections] = useState<CollectionSummary[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    const data = await invoke<CollectionSummary[]>("list_collections");
    setCollections(data);
    setLoading(false);
  }, []);

  useEffect(() => {
    refresh();
    const unsubs = [
      listen("collections:updated", () => refresh()),
      listen("file:completed", () => refresh()),
      listen("file:failed", () => refresh()),
    ];
    return () => {
      unsubs.forEach((p) => p.then((u) => u()));
    };
  }, [refresh]);

  async function handleCreate(name: string, docType: DocType) {
    const created = await invoke<{ id: string }>("create_collection", {
      name,
      docType,
    });
    await refresh();
    setShowCreate(false);
    setSelectedId(created.id);
  }

  const selected = collections.find((c) => c.id === selectedId) ?? null;

  if (selected) {
    return (
      <CollectionDetail
        collection={selected}
        onBack={() => setSelectedId(null)}
        onRefresh={refresh}
      />
    );
  }

  return (
    <>
      <CollectionList
        collections={collections}
        loading={loading}
        onSelect={setSelectedId}
        onCreate={() => setShowCreate(true)}
      />
      {showCreate && (
        <CreateCollectionModal
          onClose={() => setShowCreate(false)}
          onCreate={handleCreate}
        />
      )}
    </>
  );
}
