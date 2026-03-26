"use client";

import { PageHeader } from "@/components/page-header";
import { ChildLookupPanel } from "@/components/child-lookup-panel";

export default function SchoolAdminChildrenPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="School Admin · Children"
        description="Find children by class and name when badge-based lookup is not available."
      />
      <ChildLookupPanel />
    </div>
  );
}
