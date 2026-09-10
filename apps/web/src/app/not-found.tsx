import Link from "next/link";

import { EmptyState } from "@/components/shared/DesignSystem";

export default function NotFoundPage() {
  return (
    <div>
      <p className="label-xs">404</p>
      <h1 className="page-title">Not found</h1>
      <EmptyState message="This page or resource does not exist. Unsupported routes never render a blank screen." />
      <p style={{ marginTop: "1rem" }}><Link href="/">Return home</Link> · <Link href="/positions">Browse strategies</Link></p>
    </div>
  );
}
